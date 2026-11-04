import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext, Transaction } from '@vendure/core';
import { WarehouseUserService } from '../services/warehouse-user.service';
import { WarehouseRole } from '../entities/warehouse-user.entity';

@Resolver()
export class WarehouseUserResolver {
    constructor(private users: WarehouseUserService) {}

    @Allow(Permission.Authenticated)
    @Query()
    warehouseUsers(@Ctx() ctx: RequestContext) { return this.users.list(ctx); }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    saveWarehouseUser(@Ctx() ctx: RequestContext, @Args('input') input: { id?: ID; firstName: string; lastName: string; emailAddress: string; password?: string; role: WarehouseRole }) {
        return this.users.save(ctx, input);
    }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    removeWarehouseUser(@Ctx() ctx: RequestContext, @Args('id') id: ID) { return this.users.remove(ctx, id); }
}
