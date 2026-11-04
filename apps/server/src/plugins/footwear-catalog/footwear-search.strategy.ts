import { Injector, RequestContext, SearchStrategy } from '@vendure/core';
import { CatalogAttribute, FootwearSearchInput } from './services/catalog-attribute';

export class FootwearSearchStrategy implements SearchStrategy {
    private catalog: CatalogAttribute;
    async init(injector: Injector) { this.catalog = injector.get(CatalogAttribute); await this.catalog.init(injector); }
    getSearchResults(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) { return this.catalog.getSearchResults(ctx, input, enabled); }
    getTotalCount(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) { return this.catalog.getTotalCount(ctx, input, enabled); }
    getFacetValueIds(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) { return this.catalog.getFacetValueIds(ctx, input, enabled); }
    getCollectionIds(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) { return this.catalog.getCollectionIds(ctx, input, enabled); }
}
