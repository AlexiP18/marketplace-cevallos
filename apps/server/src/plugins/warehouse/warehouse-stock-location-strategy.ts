import { ID, MultiChannelStockLocationStrategy, OrderLine, RequestContext, StockLevel, StockLocation } from '@vendure/core';
import { WarehouseShelf } from './entities/warehouse-shelf.entity';

export function shelfLocations(locations: StockLocation[], shelfIds: Set<string>) {
    return locations.filter(location => shelfIds.has(String(location.id)));
}

export class WarehouseStockLocationStrategy extends MultiChannelStockLocationStrategy {
    async getAvailableStock(ctx: RequestContext, variantId: ID, levels: StockLevel[]) {
        const shelves = await this.connection.getRepository(ctx, WarehouseShelf).find({
            where: { active: true, ...(ctx.channel.code === '__default_channel__' ? {} : { channel: { id: ctx.channelId } }) }, relations: ['stockLocation'],
        });
        const ids = new Set(shelves.map(shelf => String(shelf.stockLocation.id)));
        return super.getAvailableStock(ctx, variantId, levels.filter(level => ids.has(String(level.stockLocationId))));
    }
    async forAllocation(ctx: RequestContext, stockLocations: StockLocation[], line: OrderLine, quantity: number) {
        const channelId = line.sellerChannelId || ctx.channelId;
        const shelves = await this.connection.getRepository(ctx, WarehouseShelf).find({
            where: { channel: { id: channelId }, active: true }, relations: ['stockLocation'],
        });
        const located = shelfLocations(stockLocations, new Set(shelves.map(shelf => String(shelf.stockLocation.id))));
        const allocation = await super.forAllocation(ctx, located, line, quantity);
        let remaining = quantity;
        return allocation.flatMap(item => {
            const count = Math.min(item.quantity, remaining);
            remaining -= count;
            return count > 0 ? [{ location: item.location, quantity: count }] : [];
        });
    }
}
