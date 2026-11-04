import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
    AdministratorService,
    Allow,
    Ctx,
    ID,
    Permission,
    RequestContext,
    Transaction,
    ForbiddenError,
} from '@vendure/core';
import { SellerProfileService } from '../services/seller-profile.service';
import { SellerRegistrationService } from '../services/seller-registration.service';
import { RegisterSellerInput, UpdateSellerProfileInput } from '../types';
import { AdministratorPersonalProfileService } from '../services/administrator-personal-profile.service';

@Resolver()
export class AdminSellerProfileResolver {
    constructor(
        private sellerProfileService: SellerProfileService,
        private administratorService: AdministratorService,
        private sellerRegistrationService: SellerRegistrationService,
        private personalProfiles: AdministratorPersonalProfileService,
    ) {}

    @Allow(Permission.ReadShippingMethod)
    @Query()
    async channelCombinedShippingPreference(@Ctx() ctx: RequestContext) {
        return this.sellerProfileService.channelCombinedShippingPreference(ctx);
    }

    @Allow(Permission.ReadShippingMethod, Permission.UpdateSeller)
    @Transaction()
    @Mutation()
    async setChannelCombinedShippingPreference(@Ctx() ctx: RequestContext, @Args('enabled') enabled: boolean) {
        return this.sellerProfileService.setChannelCombinedShippingPreference(ctx, enabled);
    }

    @Allow(Permission.Authenticated)
    @Query()
    async myAdministratorPersonalData(@Ctx() ctx: RequestContext) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const administrator = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        if (!administrator) throw new ForbiddenError();
        return await this.personalProfiles.find(ctx, administrator.id) ?? { phone: null, photo: null };
    }

    @Allow(Permission.Authenticated)
    @Transaction()
    @Mutation()
    async updateMyAdministratorPersonalData(@Ctx() ctx: RequestContext, @Args('input') input: { phone?: string | null; photoAssetId?: ID | null }) {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const administrator = await this.administratorService.findOneByUserId(ctx, ctx.activeUserId);
        if (!administrator) throw new ForbiddenError();
        return this.personalProfiles.save(ctx, administrator, input);
    }

    @Allow(Permission.SuperAdmin)
    @Query()
    async financialInstitutions(@Ctx() ctx: RequestContext) {
        return this.sellerProfileService.financialInstitutions(ctx);
    }

    @Allow(Permission.SuperAdmin)
    @Transaction()
    @Mutation()
    async saveFinancialInstitution(@Ctx() ctx: RequestContext, @Args('input') input: { id?: ID; name: string; kind: string; ruc?: string; active: boolean }) {
        return this.sellerProfileService.saveFinancialInstitution(ctx, input);
    }

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

    @Allow(Permission.SuperAdmin)
    @Query()
    async sellerEmailAvailable(@Args('email') email: string) {
        return this.sellerRegistrationService.isEmailAvailable(email);
    }

    @Allow(Permission.SuperAdmin)
    @Transaction()
    @Mutation()
    async createSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('input') input: RegisterSellerInput,
    ) {
        const result = await this.sellerRegistrationService.registerSeller(ctx, input, true);
        return result.profile;
    }

    @Allow(Permission.UpdateSeller)
    @Transaction()
    @Mutation()
    async updateSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('input') input: UpdateSellerProfileInput,
    ) {
        return this.sellerProfileService.update(ctx, input);
    }

    @Allow(Permission.SuperAdmin)
    @Transaction()
    @Mutation()
    async approveSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
    ) {
        return this.sellerProfileService.approve(ctx, id);
    }

    @Allow(Permission.SuperAdmin)
    @Transaction()
    @Mutation()
    async rejectSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason') reason?: string,
    ) {
        return this.sellerProfileService.reject(ctx, id, reason);
    }

    @Allow(Permission.SuperAdmin)
    @Transaction()
    @Mutation()
    async suspendSellerProfile(
        @Ctx() ctx: RequestContext,
        @Args('id') id: ID,
        @Args('reason') reason?: string,
    ) {
        return this.sellerProfileService.suspend(ctx, id, reason);
    }
}
