import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    AdministratorService,
    Allow,
    Ctx,
    ID,
    Permission,
    RequestContext,
} from '@vendure/core';
import { SellerProfileService } from '../services/seller-profile.service';
import { UpdateSellerProfileInput } from '../types';

@Resolver()
export class AdminSellerProfileResolver {
    constructor(
        private sellerProfileService: SellerProfileService,
        private administratorService: AdministratorService,
    ) {}

    @Allow(Permission.ReadSeller)
    @Query()
    async sellerProfiles(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: any },
    ) {
        return this.sellerProfileService.findAll(ctx, args.options);
    }

    @Allow(Permission.ReadSeller)
    @Query()
    async sellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.sellerProfileService.findOne(ctx, id);
    }

    @Allow(Permission.Authenticated)
    @Query()
    async currentSellerProfile(@Ctx() ctx: RequestContext) {
        if (!ctx.activeUserId) {
            return null;
        }
        const administrator = await this.administratorService.findOneByUserId(
            ctx,
            ctx.activeUserId,
        );
        if (!administrator) {
            return null;
        }
        return this.sellerProfileService.findOneByAdministratorId(
            ctx,
            administrator.id,
        );
    }

    @Allow(Permission.UpdateSeller)
    @Mutation()
    async updateSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateSellerProfileInput,
    ) {
        return this.sellerProfileService.update(ctx, input);
    }

    @Allow(Permission.UpdateSeller)
    @Mutation()
    async approveSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.sellerProfileService.approve(ctx, id);
    }

    @Allow(Permission.UpdateSeller)
    @Mutation()
    async rejectSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason') reason?: string,
    ) {
        return this.sellerProfileService.reject(ctx, id, reason);
    }

    @Allow(Permission.UpdateSeller)
    @Mutation()
    async suspendSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason') reason?: string,
    ) {
        return this.sellerProfileService.suspend(ctx, id, reason);
    }
}
