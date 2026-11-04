import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Ctx, Permission, RequestContext } from '@vendure/core';
import { SellerProfile } from '../entities/seller-profile.entity';
import { AdministratorPersonalProfileService } from '../services/administrator-personal-profile.service';

@Resolver('SellerProfile')
export class SellerAdministratorPhotoResolver {
    constructor(private personalProfiles: AdministratorPersonalProfileService) {}

    @ResolveField()
    async administratorPhoto(@Ctx() ctx: RequestContext, @Parent() profile: SellerProfile) {
        if (!ctx.userHasAllPermissions([Permission.SuperAdmin]) && String(profile.channel?.id) !== String(ctx.channelId)) return null;
        return profile.administrator ? (await this.personalProfiles.find(ctx, profile.administrator.id))?.photo ?? null : null;
    }
}
