import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, ID, Permission, RequestContext } from '@vendure/core';
import { LabelTemplateService, SaveLabelTemplateInput } from '../services/label-template.service';

@Resolver()
export class LabelTemplateResolver {
    constructor(private templates: LabelTemplateService) {}

    @Allow(Permission.ReadCatalog)
    @Query()
    async labelProductBusinessLogo(@Ctx() ctx: RequestContext, @Args('productId') productId: ID, @Args('sellerProfileId') sellerProfileId?: ID) {
        return this.templates.businessLogo(ctx, productId, sellerProfileId);
    }

    @Allow(Permission.ReadCatalog)
    @Query()
    labelTemplates(@Ctx() ctx: RequestContext) {
        return this.templates.findAll(ctx);
    }

    @Allow(Permission.ReadCatalog)
    @Query()
    labelTemplate(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.templates.findOne(ctx, id);
    }

    @Allow(Permission.UpdateCatalog)
    @Mutation()
    saveLabelTemplate(@Ctx() ctx: RequestContext, @Args('input') input: SaveLabelTemplateInput) {
        return this.templates.save(ctx, input);
    }

    @Allow(Permission.UpdateCatalog)
    @Mutation()
    deleteLabelTemplate(@Ctx() ctx: RequestContext, @Args('id') id: ID) {
        return this.templates.delete(ctx, id);
    }
}
