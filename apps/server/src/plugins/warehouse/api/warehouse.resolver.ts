import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext, Transaction } from '@vendure/core';
import { WarehouseService } from '../services/warehouse.service';

@Resolver()
export class WarehouseResolver {
    constructor(private warehouse: WarehouseService) {}

    @Allow(Permission.Authenticated)
    @Query()
    warehouseDispatchOrders(@Ctx() ctx: RequestContext) { return this.warehouse.dispatchOrders(ctx); }

    @Allow(Permission.Authenticated)
    @Query()
    warehousePaymentProof(@Ctx() ctx: RequestContext, @Args('orderId') orderId: string) { return this.warehouse.paymentProof(ctx, orderId); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    saveWarehousePaymentProof(@Ctx() ctx: RequestContext, @Args() input: { orderId: string; reference: string; institution: string; amount: number; file: string }) { return this.warehouse.saveProof(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    reviewWarehousePayment(@Ctx() ctx: RequestContext, @Args('orderId') orderId: string, @Args('approve') approve: boolean, @Args('reason') reason?: string) { return this.warehouse.reviewPayment(ctx, orderId, approve, reason); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    dispatchWarehouseOrder(@Ctx() ctx: RequestContext, @Args('orderId') orderId: string, @Args('carrier') carrier: string, @Args('trackingCode') trackingCode: string) { return this.warehouse.dispatch(ctx, orderId, carrier, trackingCode); }

    @Allow(Permission.Authenticated)
    @Query()
    warehouseShelves(@Ctx() ctx: RequestContext) { return this.warehouse.shelves(ctx); }

    @Allow(Permission.Authenticated)
    @Query()
    warehouseInventory(@Ctx() ctx: RequestContext, @Args('search') search?: string) { return this.warehouse.inventory(ctx, search); }

    @Allow(Permission.Authenticated)
    @Query()
    warehouseUnlocatedStock(@Ctx() ctx: RequestContext) { return this.warehouse.unlocated(ctx); }

    @Allow(Permission.Authenticated)
    @Query()
    warehousePickOrders(@Ctx() ctx: RequestContext) { return this.warehouse.orders(ctx); }

    @Allow(Permission.Authenticated)
    @Query()
    warehouseKardex(@Ctx() ctx: RequestContext, @Args('filter') filter?: Record<string, unknown>) { return this.warehouse.kardex(ctx, filter || {}); }

    @Allow(Permission.Authenticated)
    @Query()
    warehouseKardexActors(@Ctx() ctx: RequestContext) { return this.warehouse.kardexActors(ctx); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    createWarehouseShelf(@Ctx() ctx: RequestContext, @Args('input') input: { code: string; description?: string; sourceLocationId?: string }) { return this.warehouse.createShelf(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    receiveWarehouseStock(@Ctx() ctx: RequestContext, @Args('input') input: { variantId: string; shelfId: string; quantity: number; reason?: string }) { return this.warehouse.receive(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    placeWarehouseStock(@Ctx() ctx: RequestContext, @Args('input') input: { variantId: string; sourceLocationId: string; shelfId: string; quantity: number }) { return this.warehouse.place(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    moveWarehouseStock(@Ctx() ctx: RequestContext, @Args('input') input: { variantId: string; fromShelfId: string; toShelfId: string; quantity: number; reason: string }) { return this.warehouse.move(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    adjustWarehouseStock(@Ctx() ctx: RequestContext, @Args('input') input: { variantId: string; shelfId: string; quantity: number; reason?: string }) { return this.warehouse.adjust(ctx, input); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    scanWarehousePair(@Ctx() ctx: RequestContext, @Args('input') input: { orderLineId: string; shelfId: string; code: string }) { return this.warehouse.scan(ctx, input); }
}
