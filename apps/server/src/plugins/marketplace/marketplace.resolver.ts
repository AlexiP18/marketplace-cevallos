import { Args, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { Controller, Get, Param, Res } from '@nestjs/common';
import { Allow, Ctx, Order, Permission, RequestContext } from '@vendure/core';
import { Response } from 'express';
import { createReadStream } from 'node:fs';
import { ReservationService } from './reservation.service';
import { MarketplaceFileService } from './marketplace-file.service';

@Resolver('Order')
export class MarketplaceOrderResolver {
    constructor(private reservations: ReservationService) {}
    @ResolveField()
    marketplaceReservations(@Ctx() ctx: RequestContext, @Parent() order: Order) { return this.reservations.forOrder(ctx, order.id); }
}

@Resolver()
export class MarketplaceCheckoutResolver {
    constructor(private reservations: ReservationService) {}
    @Allow(Permission.Owner) @Mutation()
    reserveMarketplaceCheckout(@Ctx() ctx: RequestContext) { return this.reservations.enqueue(ctx); }
    @Allow(Permission.Owner) @Query()
    marketplaceCheckoutJob(@Ctx() ctx: RequestContext, @Args('id') id: string, @Args('wait') wait: boolean) { return this.reservations.status(ctx, id, wait); }
}
@Resolver()
export class MarketplaceAdminResolver {
    constructor(private files: MarketplaceFileService) {}
    @Allow(Permission.ReadCatalog) @Mutation()
    generateMarketplaceLabels(@Ctx() ctx: RequestContext, @Args('input') input: any) { return this.files.labels(ctx, input); }
    @Allow(Permission.ReadOrder) @Mutation()
    generateMarketplaceReport(@Ctx() ctx: RequestContext, @Args('startDate') startDate: Date, @Args('endDate') endDate: Date) { return this.files.report(ctx, startDate, endDate); }
    @Allow(Permission.Authenticated) @Query()
    marketplaceFileJob(@Ctx() ctx: RequestContext, @Args('id') id: string) { return this.files.status(ctx, id); }
}

@Controller('admin-api/marketplace-files')
export class MarketplaceFilesController {
    constructor(private files: MarketplaceFileService) {}
    @Allow(Permission.Authenticated) @Get(':id')
    async download(@Ctx() ctx: RequestContext, @Param('id') id: string, @Res() res: Response) {
        const file = await this.files.download(ctx, id);
        res.setHeader('Content-Type', file.type);
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        const stream = createReadStream(file.path);
        res.on('close', () => stream.destroy());
        stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
        stream.pipe(res);
    }
}
