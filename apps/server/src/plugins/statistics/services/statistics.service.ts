import { Injectable } from '@nestjs/common';
import { Order, Permission, ProductVariant, RequestContext, StockLevel, TransactionalConnection, UserInputError } from '@vendure/core';
import { In } from 'typeorm';

export type StatisticsInput = { startDate: Date | string; endDate: Date | string };

type VariantRow = {
    variantId: string; productId: string; productName: string; productCode: string; sku: string;
    color: string; size: string; upper: string; sole: string; gender: string; type: string; style: string;
    pairCount: number; refundedPairs: number; articleSales: number; stockOnHand: number; stockAllocated: number;
    tracksInventory: boolean; outOfStockThreshold: number; inCatalog: boolean;
};
type Totals = { orderCount: number; pairCount: number; refundedPairs: number; articleSales: number; refundedAmount: number };
type Day = { date: string; orderCount: number; pairCount: number; articleSales: number };

const DAY_MS = 86_400_000;
const businessDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' });
const blankTotals = (): Totals => ({ orderCount: 0, pairCount: 0, refundedPairs: 0, articleSales: 0, refundedAmount: 0 });
const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function dayKey(value: Date) {
    const parts = Object.fromEntries(businessDate.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

function translatedName(value: { name: string; translations: Array<{ languageCode: string; name: string }> }, languageCode: string) {
    return value.translations?.find(translation => translation.languageCode === languageCode)?.name || value.translations?.[0]?.name || value.name || '';
}

function variantRow(variant: ProductVariant, ctx: RequestContext): VariantRow {
    const product = variant.product;
    const options = variant.options || [];
    const optionName = (code: string) => {
        const option = options.find(item => item.group?.code?.toLowerCase().includes(code));
        return option ? translatedName(option, ctx.languageCode) : '';
    };
    const fields = (product?.customFields || {}) as { codigo?: string; genero?: string; tipo?: string; estilo?: string };
    return {
        variantId: String(variant.id), productId: String(product?.id || variant.productId),
        productName: product ? translatedName(product, ctx.languageCode) : 'Producto eliminado',
        productCode: fields.codigo || '', sku: variant.sku,
        color: optionName('color'), size: optionName('talla') || optionName('size'),
        upper: optionName('capellada'), sole: optionName('suela'),
        gender: fields.genero || '', type: fields.tipo || '', style: fields.estilo || '',
        pairCount: 0, refundedPairs: 0, articleSales: 0, stockOnHand: 0, stockAllocated: 0,
        tracksInventory: variant.trackInventory === 'TRUE' || (variant.trackInventory === 'INHERIT' && ctx.channel.trackInventory),
        outOfStockThreshold: variant.useGlobalOutOfStockThreshold ? ctx.channel.outOfStockThreshold : variant.outOfStockThreshold,
        inCatalog: false,
    };
}

@Injectable()
export class StatisticsService {
    constructor(private connection: TransactionalConnection) {}

    async report(ctx: RequestContext, input: StatisticsInput) {
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        const duration = end.getTime() - start.getTime();
        if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * DAY_MS) {
            throw new UserInputError('Selecciona un período válido de hasta 366 días.');
        }
        const previousStart = new Date(start.getTime() - duration);
        const currencyCode = ctx.currencyCode;
        const summary = blankTotals();
        const previous = blankTotals();
        const days = new Map<string, Day>();
        const variants = new Map<string, VariantRow>();
        for (let time = start.getTime(); time < end.getTime(); time += DAY_MS) {
            const date = dayKey(new Date(time));
            days.set(date, { date, orderCount: 0, pairCount: 0, articleSales: 0 });
        }

        const orderIds = await this.connection.getRepository(ctx, Order).createQueryBuilder('o')
            .innerJoin('o.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .innerJoin('o.payments', 'paid', 'paid.state = :paidState', { paidState: 'Settled' })
            .where('o.orderPlacedAt >= :previousStart AND o.orderPlacedAt < :end', { previousStart, end })
            .andWhere('o.active = false AND o.state != :cancelled AND o.type != :aggregate', { cancelled: 'Cancelled', aggregate: 'Aggregate' })
            .andWhere('o.currencyCode = :currencyCode', { currencyCode })
            .select('o.id', 'id').distinct(true).getRawMany<{ id: string }>();

        for (const batch of chunks(orderIds.map(row => row.id), 200)) {
            const orders = await this.connection.getRepository(ctx, Order).find({
                where: { id: In(batch) }, withDeleted: true,
                relations: [
                    'lines.productVariant.product.translations',
                    'lines.productVariant.options.group',
                    'lines.productVariant.options.translations',
                    'payments.refunds.lines',
                ],
            });
            for (const order of orders) {
                const settledAmount = (order.payments || []).filter(payment => payment.state === 'Settled').reduce((total, payment) => total + payment.amount, 0);
                if (settledAmount < order.totalWithTax) continue;
                const current = order.orderPlacedAt != null && order.orderPlacedAt >= start;
                const totals = current ? summary : previous;
                const day = current ? days.get(dayKey(order.orderPlacedAt!)) : undefined;
                totals.orderCount++;
                if (day) day.orderCount++;
                const refunded = new Map<string, number>();
                for (const payment of order.payments || []) {
                    for (const refund of payment.refunds || []) {
                        if (refund.state !== 'Settled') continue;
                        totals.refundedAmount += refund.total;
                        for (const line of refund.lines || []) {
                            const id = String(line.orderLineId);
                            refunded.set(id, (refunded.get(id) || 0) + line.quantity);
                        }
                    }
                }
                for (const line of order.lines || []) {
                    const quantity = Math.max(0, line.quantity);
                    const refundedQuantity = Math.min(quantity, refunded.get(String(line.id)) || 0);
                    const amount = line.proratedLinePriceWithTax;
                    totals.pairCount += quantity;
                    totals.refundedPairs += refundedQuantity;
                    totals.articleSales += amount;
                    if (day) { day.pairCount += quantity; day.articleSales += amount; }
                    if (current && line.productVariant) {
                        const id = String(line.productVariantId);
                        const row = variants.get(id) || variantRow(line.productVariant, ctx);
                        row.pairCount += quantity;
                        row.refundedPairs += refundedQuantity;
                        row.articleSales += amount;
                        variants.set(id, row);
                    }
                }
            }
        }

        const catalogIds = await this.connection.getRepository(ctx, ProductVariant).createQueryBuilder('variant')
            .innerJoin('variant.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .select('variant.id', 'id').getRawMany<{ id: string }>();
        for (const batch of chunks(catalogIds.map(row => row.id), 200)) {
            const catalog = await this.connection.getRepository(ctx, ProductVariant).createQueryBuilder('variant')
                .innerJoin('variant.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
                .leftJoinAndSelect('variant.product', 'product')
                .leftJoinAndSelect('product.translations', 'productTranslation')
                .leftJoinAndSelect('variant.options', 'option')
                .leftJoinAndSelect('option.group', 'optionGroup')
                .leftJoinAndSelect('option.translations', 'optionTranslation')
                .where('variant.id IN (:...variantIds)', { variantIds: batch }).getMany();
            for (const variant of catalog) {
                const id = String(variant.id);
                const sales = variants.get(id);
                const row = variantRow(variant, ctx);
                row.inCatalog = true;
                if (sales) {
                    row.pairCount = sales.pairCount;
                    row.refundedPairs = sales.refundedPairs;
                    row.articleSales = sales.articleSales;
                }
                variants.set(id, row);
            }
        }

        for (const batch of chunks([...variants.keys()], 500)) {
            const stocks = await this.connection.getRepository(ctx, StockLevel).createQueryBuilder('stock')
                .innerJoin('stock.stockLocation', 'location')
                .innerJoin('location.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
                .where('stock.productVariantId IN (:...variantIds)', { variantIds: batch })
                .select('stock.productVariantId', 'id')
                .addSelect('SUM(stock.stockOnHand)', 'onHand')
                .addSelect('SUM(stock.stockAllocated)', 'allocated')
                .groupBy('stock.productVariantId').getRawMany<{ id: string; onHand: string; allocated: string }>();
            for (const stock of stocks) {
                const row = variants.get(String(stock.id));
                if (row) { row.stockOnHand = Number(stock.onHand); row.stockAllocated = Number(stock.allocated); }
            }
        }

        const catalog = [...variants.values()].filter(row => row.inCatalog);
        const models = new Map<string, { sold: number; stock: number; tracked: boolean }>();
        const segments = new Map<string, { dimension: string; value: string; pairCount: number; stockAvailable: number }>();
        const matrix = new Map<string, { color: string; size: string; pairCount: number; stockAvailable: number }>();
        for (const row of catalog) {
            const sold = Math.max(0, row.pairCount - row.refundedPairs);
            const stock = Math.max(0, row.stockOnHand - row.stockAllocated);
            const model = models.get(row.productId) || { sold: 0, stock: 0, tracked: false };
            model.sold += sold;
            if (row.tracksInventory) { model.stock += stock; model.tracked = true; }
            models.set(row.productId, model);
            for (const dimension of ['gender', 'type', 'style', 'upper', 'sole', 'color', 'size'] as const) {
                const value = row[dimension] || 'Sin especificar';
                const key = `${dimension}\u0000${value}`;
                const segment = segments.get(key) || { dimension, value, pairCount: 0, stockAvailable: 0 };
                segment.pairCount += sold;
                if (row.tracksInventory) segment.stockAvailable += stock;
                segments.set(key, segment);
            }
            const color = row.color || 'Sin especificar';
            const size = row.size || 'Sin especificar';
            const key = `${color}\u0000${size}`;
            const cell = matrix.get(key) || { color, size, pairCount: 0, stockAvailable: 0 };
            cell.pairCount += sold;
            if (row.tracksInventory) cell.stockAvailable += stock;
            matrix.set(key, cell);
        }

        return {
            summary: {
                currencyCode, ...summary,
                averageOrderValue: summary.orderCount ? Math.round(summary.articleSales / summary.orderCount) : 0,
                previousOrderCount: previous.orderCount,
                previousPairCount: previous.pairCount,
                previousArticleSales: previous.articleSales,
            },
            days: [...days.values()],
            overview: {
                modelCount: models.size,
                variantCount: catalog.length,
                unsoldModelCount: [...models.values()].filter(model => model.sold === 0).length,
                stagnantModelCount: [...models.values()].filter(model => model.tracked && model.sold === 0 && model.stock > 0).length,
                trackedVariantCount: catalog.filter(row => row.tracksInventory).length,
                physicalPairs: catalog.filter(row => row.tracksInventory).reduce((sum, row) => sum + row.stockOnHand, 0),
                allocatedPairs: catalog.filter(row => row.tracksInventory).reduce((sum, row) => sum + row.stockAllocated, 0),
                depletedVariantCount: catalog.filter(row => row.tracksInventory && row.stockOnHand - row.stockAllocated <= 0).length,
            },
            segments: [...segments.values()],
            matrix: [...matrix.values()],
            variants: ctx.userHasAllPermissions([Permission.SuperAdmin]) ? [] : [...variants.values()].sort((a, b) => b.articleSales - a.articleSales || a.sku.localeCompare(b.sku)),
        };
    }
}
