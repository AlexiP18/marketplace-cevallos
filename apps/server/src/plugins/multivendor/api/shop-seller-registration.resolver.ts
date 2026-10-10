import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { SellerProfileService } from '../services/seller-profile.service';
import { SellerRegistrationService } from '../services/seller-registration.service';
import { RegisterSellerInput } from '../types';

@Resolver()
export class ShopSellerRegistrationResolver {
    constructor(
        private sellerRegistrationService: SellerRegistrationService,
        private sellerProfileService: SellerProfileService,
    ) {}

    @Allow(Permission.Public)
    @Mutation()
    async registerSeller(
        @Ctx() ctx: RequestContext,
        @Args('input') input: RegisterSellerInput,
    ) {
        return this.sellerRegistrationService.registerSeller(ctx, input);
    }

    @Allow(Permission.Public)
    @Query()
    async sellerProfileBySlug(
        @Ctx() ctx: RequestContext,
        @Args('slug') slug: string,
    ) {
        return this.sellerProfileService.findOneBySlug(ctx, slug);
    }

    @Allow(Permission.Public)
    @Query()
    async activeSellerProfiles(
        @Ctx() ctx: RequestContext,
        @Args() args: { options?: any },
    ) {
        return this.sellerProfileService.findActive(ctx, args.options);
    }
}
