import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, Permission, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import QueryStream from 'pg-query-stream';
import * as XLSX from 'xlsx';
import { STATISTICS_OPTIONS, StatisticsOptions } from '../statistics.options';

@Injectable()
export class StatisticsExportService {
    constructor(private connection: TransactionalConnection, @Inject(STATISTICS_OPTIONS) private options: StatisticsOptions) {}
    async validate(ctx: RequestContext, startDate: Date, endDate: Date) {
        if (!ctx.userHasAllPermissions([Permission.ReadOrder, Permission.ReadCatalog])) throw new ForbiddenError();
        const duration = new Date(endDate).getTime() - new Date(startDate).getTime();
        if (!(duration > 0 && duration <= 366 * 86400000)) throw new UserInputError('Selecciona un período de hasta 366 días.');
        return { startDate, endDate, consolidated: ctx.userHasAllPermissions([Permission.SuperAdmin]) };
    }
    async build(ctx: RequestContext, input: { startDate: string; endDate: string; consolidated: boolean }) {
        const pool = (this.connection.rawConnection.driver as any).master;
        const client = await pool.connect();
        // shortcut: SheetJS retains workbook cells; use a streaming writer if exports must exceed 100000 rows per sheet.
        const workbook = XLSX.utils.book_new();
        const values = [input.startDate, input.endDate, Number(ctx.channelId)];
        const scope = input.consolidated ? '' : 'AND oc."channelId" = $3';
        const sales = `SELECT (o."orderPlacedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Guayaquil')::date AS fecha, o."currencyCode" AS moneda,
            COUNT(DISTINCT o.id)::int AS pedidos, SUM(o."subTotalWithTax") / 100.0 AS ventas_articulos
            FROM "order" o JOIN order_channels_channel oc ON oc."orderId" = o.id
            JOIN channel ch ON ch.id = oc."channelId"
            WHERE o.type <> 'Aggregate' AND o.active = false AND o.state IN ('PaymentSettled','PartiallyShipped','Shipped','PartiallyDelivered','Delivered')
            AND o."orderPlacedAt" >= $1 AND o."orderPlacedAt" < $2
            AND EXISTS (SELECT 1 FROM payment p WHERE p."orderId" = o.id AND p.state = 'Settled')
            ${input.consolidated ? "AND ch.code = '__default_channel__'" : scope}
            GROUP BY fecha, moneda ORDER BY fecha`;
        const stockScope = input.consolidated ? '' : 'AND lc."channelId" = $1';
        const stock = `SELECT ${input.consolidated ? 'COUNT(DISTINCT sl."productVariantId")::int AS variantes,' : 'v.sku,'}
            SUM(sl."stockOnHand")::int AS fisico, SUM(sl."stockAllocated")::int AS reservado,
            SUM(GREATEST(0, sl."stockOnHand" - sl."stockAllocated"))::int AS disponible
            FROM stock_level sl JOIN product_variant v ON v.id = sl."productVariantId"
            WHERE v."deletedAt" IS NULL AND EXISTS (SELECT 1 FROM stock_location_channels_channel lc JOIN seller_profile sp ON sp."channelId" = lc."channelId" WHERE lc."stockLocationId" = sl."stockLocationId" ${stockScope})
            ${input.consolidated ? '' : 'AND EXISTS (SELECT 1 FROM product_variant_channels_channel vc WHERE vc."productVariantId" = v.id AND vc."channelId" = $1)'}
            ${input.consolidated ? '' : 'GROUP BY v.sku'} `;
        try {
            await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            await client.query("SET LOCAL statement_timeout = '120s'");
            const rotationScope = input.consolidated ? "AND ch.code = '__default_channel__'" : 'AND oc."channelId" = $3';
            const rotation = `WITH sold AS (
                SELECT ol."productVariantId" AS id, SUM(ol.quantity)::int AS pares
                FROM order_line ol JOIN "order" o ON o.id = ol."orderId"
                JOIN order_channels_channel oc ON oc."orderId" = o.id JOIN channel ch ON ch.id = oc."channelId"
                WHERE o.type <> 'Aggregate' AND o.active = false AND o.state IN ('PaymentSettled','PartiallyShipped','Shipped','PartiallyDelivered','Delivered')
                AND o."orderPlacedAt" >= $1 AND o."orderPlacedAt" < $2 ${rotationScope}
                AND EXISTS (SELECT 1 FROM payment p WHERE p."orderId" = o.id AND p.state = 'Settled') GROUP BY ol."productVariantId"
            ), stock AS (
                SELECT sl."productVariantId" AS id, SUM(GREATEST(0, sl."stockOnHand" - sl."stockAllocated"))::int AS disponible
                FROM stock_level sl WHERE EXISTS (SELECT 1 FROM stock_location_channels_channel lc JOIN seller_profile sp ON sp."channelId" = lc."channelId"
                    WHERE lc."stockLocationId" = sl."stockLocationId" ${input.consolidated ? '' : 'AND lc."channelId" = $3'})
                    ${input.consolidated ? '' : 'AND EXISTS (SELECT 1 FROM product_variant_channels_channel vc WHERE vc."productVariantId" = sl."productVariantId" AND vc."channelId" = $3)'} GROUP BY sl."productVariantId"
            ) SELECT ${input.consolidated ? "CASE WHEN COALESCE(s.pares,0) = 0 THEN 'Sin ventas' ELSE 'Con ventas' END AS grupo, COUNT(*)::int AS variantes, SUM(COALESCE(s.pares,0))::int AS pares_vendidos, SUM(st.disponible)::int AS disponible" : 'v.sku, COALESCE(s.pares,0)::int AS pares_vendidos, st.disponible, CASE WHEN COALESCE(s.pares,0) = 0 THEN NULL ELSE ROUND(st.disponible * (EXTRACT(EPOCH FROM ($2::timestamp - $1::timestamp)) / 86400) / s.pares) END AS cobertura_dias'}
                FROM stock st JOIN product_variant v ON v.id = st.id LEFT JOIN sold s ON s.id = st.id WHERE v."deletedAt" IS NULL
                ${input.consolidated ? 'GROUP BY grupo' : ''}`;
            for (const [title, sql, params] of [['Ventas', sales, input.consolidated ? values.slice(0, 2) : values], ['Inventario', stock, input.consolidated ? [] : [Number(ctx.channelId)]], ['Rotacion', rotation, input.consolidated ? values.slice(0, 2) : values]] as Array<[string, string, any[]]>) {
                const sheet = XLSX.utils.aoa_to_sheet([]);
                let batch: any[] = [];
                let count = 0;
                const stream = client.query(new QueryStream(sql, params, { batchSize: 500 }));
                for await (const row of stream) {
                    batch.push(row); count++;
                    if (count > 100000) { stream.destroy(); throw new Error('El informe supera 100000 filas. Divide el período.'); }
                    if (batch.length === 500) { XLSX.utils.sheet_add_json(sheet, batch, { origin: -1, skipHeader: count > 500 }); batch = []; }
                }
                if (batch.length) XLSX.utils.sheet_add_json(sheet, batch, { origin: -1, skipHeader: count > batch.length });
                XLSX.utils.book_append_sheet(workbook, sheet, title);
            }
            await client.query('COMMIT');
            const name = `informe-${randomUUID()}.xlsx`;
            XLSX.writeFile(workbook, path.join(this.options.privateFiles, name));
            return { name };
        } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
        finally { client.release(); }
    }
}
