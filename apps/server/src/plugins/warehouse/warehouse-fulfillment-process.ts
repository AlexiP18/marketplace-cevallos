import { Allocation, FulfillmentLine, FulfillmentProcess, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { WarehousePickScan } from './entities/warehouse-pick-scan.entity';
import { WarehouseShelf } from './entities/warehouse-shelf.entity';

let connection: TransactionalConnection;

export const warehouseFulfillmentProcess: FulfillmentProcess<string> = {
    init(injector) { connection = injector.get(TransactionalConnection); },
    async onTransitionStart(from, to, { ctx, fulfillment }) {
        if (!(from === 'Created' && to === 'Pending') && to !== 'Shipped' && to !== 'Cancelled') return;
        const lines = await connection.getRepository(ctx, FulfillmentLine).find({
            where: { fulfillment: { id: fulfillment.id } }, relations: ['orderLine', 'orderLine.order', 'orderLine.order.channels'],
        });
        for (const variantId of [...new Set(lines.map(line => Number(line.orderLine.productVariantId)))].sort((a, b) => a - b)) {
            await connection.getRepository(ctx, FulfillmentLine).query('SELECT pg_advisory_xact_lock($1, $2)', [variantId, 0]);
        }
        if (to === 'Cancelled') return;
        for (const line of lines) {
            const allocations = await connection.getRepository(ctx, Allocation).find({ where: { orderLine: { id: line.orderLineId } } });
            if (!allocations.length) return 'El pedido no tiene una reserva ubicada en perchas. Regularízala en Bodega antes de despachar.';
            const channelId = line.orderLine.sellerChannelId || ctx.channelId;
            const shelves = await connection.getRepository(ctx, WarehouseShelf).find({ where: { channel: { id: channelId }, active: true, stockLocation: { id: In(allocations.map(item => item.stockLocationId)) } }, relations: ['stockLocation'] });
            const locations = new Set(shelves.map(shelf => String(shelf.stockLocation.id)));
            if (allocations.some(item => !locations.has(String(item.stockLocationId)))) return 'Hay pares reservados sin percha activa del almacén. Regulariza su ubicación antes de despachar.';
            if (line.orderLine.order.type === 'Aggregate') return 'Despacha las subórdenes de cada almacén, no la orden general.';
            if (!['PaymentSettled', 'PartiallyFulfilled', 'PartiallyShipped'].includes(line.orderLine.order.state)) {
                return 'El pedido debe tener el pago confirmado antes del despacho.';
            }
            const previous = await connection.getRepository(ctx, FulfillmentLine).createQueryBuilder('item')
                .innerJoin('item.fulfillment', 'prior', 'prior.id <> :id AND prior.state <> :cancelled', { id: fulfillment.id, cancelled: 'Cancelled' })
                .where('item.orderLineId = :lineId', { lineId: line.orderLineId })
                .select('COALESCE(SUM(item.quantity), 0)', 'total').getRawOne();
            const scanned = await connection.getRepository(ctx, WarehousePickScan).count({ where: { orderLineId: Number(line.orderLineId) } });
            if (scanned < Number(previous?.total || 0) + line.quantity) {
                return `Falta escanear pares de ${line.orderLine.productVariantId} antes de cerrar el empaque o despachar.`;
            }
        }
    },
};
