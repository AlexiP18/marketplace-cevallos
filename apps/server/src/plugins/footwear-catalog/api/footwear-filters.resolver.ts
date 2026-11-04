import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { CatalogAttribute } from '../services/catalog-attribute';

@Resolver()
export class FootwearFiltersResolver {
    constructor(private catalog: CatalogAttribute) {}
    @Query() @Allow(Permission.Public)
    footwearFilterValues(@Ctx() ctx: RequestContext) { return this.catalog.filterValues(ctx); }
}
