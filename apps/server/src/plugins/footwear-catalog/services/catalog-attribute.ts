import { Injectable } from '@nestjs/common';
import { createCollectionIdCountMap, createFacetIdCountMap, getFieldsToSelect, Injector, mapToSearchResult, PLUGIN_INIT_OPTIONS, PostgresSearchStrategy, ProductVariant, RequestContext, RequestContextCacheService, TransactionalConnection, UserInputError, applyLanguageConstraints } from '@vendure/core';
import type { FacetValueFilterInput, SearchInput, SearchResult } from '@vendure/common/lib/generated-types';
import type { DefaultSearchPluginInitOptions } from '@vendure/core/dist/plugin/default-search-plugin/types';
import { SearchIndexItem } from '@vendure/core/dist/plugin/default-search-plugin/entities/search-index-item.entity';

export const footwearKeys = ['talla', 'color', 'capellada', 'suela', 'horma'] as const;
export type FootwearFilters = Partial<Record<typeof footwearKeys[number], string>>;
export type FootwearSearchInput = SearchInput & { footwear?: FootwearFilters; inStock?: boolean };
export function normalizedFootwearFilters(input?: FootwearFilters) {
    const result: Record<string, string[]> = {};
    for (const key of footwearKeys) {
        const value = input?.[key];
        if (value == null || value === '') continue;
        if (typeof value !== 'string' || value.trim().length > 100) throw new UserInputError('Cada filtro de calzado admite hasta 100 caracteres.');
        const accents = 'ÁÉÍÓÚÜÑáéíóúüñ', plain = 'AEIOUUNaeiouun';
        const normalized = value.trim().normalize('NFC').replace(/[ÁÉÍÓÚÜÑáéíóúüñ]/g, letter => plain[accents.indexOf(letter)]).toLowerCase();
        if (normalized) result[key] = [normalized];
    }
    return result;
}

@Injectable()
export class CatalogAttribute {
    private native = new PostgresSearchStrategy();
    private options: DefaultSearchPluginInitOptions;
    constructor(private connection: TransactionalConnection, private cache: RequestContextCacheService) {}
    async init(injector: Injector) { this.options = injector.get(PLUGIN_INIT_OPTIONS); await this.native.init(injector); }
    private filtered(input: FootwearSearchInput) { return Object.keys(normalizedFootwearFilters(input.footwear)).length > 0; }
    private query(ctx: RequestContext, input: FootwearSearchInput, enabledOnly: boolean) {
        const qb = this.connection.getRepository(ctx, SearchIndexItem).createQueryBuilder('si')
            .innerJoin('footwear_catalog_attribute', 'fa', 'fa."variantId"=si.productVariantId')
            .innerJoin('product_variant', 'variant', 'variant.id=si.productVariantId AND variant."deletedAt" IS NULL')
            .innerJoin('product', 'product', 'product.id=variant."productId" AND product."deletedAt" IS NULL')
            .where('fa.attributes @> CAST(:footwear AS jsonb)', { footwear: JSON.stringify(normalizedFootwearFilters(input.footwear)) })
            .andWhere('si.channelId=:channelId', { channelId: ctx.channelId })
            .andWhere('EXISTS(SELECT 1 FROM product_variant_channels_channel vc WHERE vc."productVariantId"=variant.id AND vc."channelId"=:channelId)');
        applyLanguageConstraints(qb, ctx.languageCode, ctx.channel.defaultLanguageCode);
        if (enabledOnly) qb.andWhere('si.enabled=true AND variant.enabled=true AND product.enabled=true');
        if (this.options.indexCurrencyCode) qb.andWhere('si.currencyCode=:currencyCode', { currencyCode: ctx.currencyCode });
        if (input.inStock != null) qb.andWhere(input.groupByProduct ? 'si.productInStock=:inStock' : 'si.inStock=:inStock', { inStock: input.inStock });
        const term = input.term?.trim().replace(/['":\\!|&()]/g, ' ').split(/\s+/).filter(Boolean).map(word => `'${word}':*`).join(' & ');
        if (term && input.term!.length > 2) qb.andWhere('(to_tsvector(si.productName) @@ to_tsquery(:term) OR to_tsvector(si.productVariantName) @@ to_tsquery(:term) OR to_tsvector(si.sku) @@ to_tsquery(:term) OR to_tsvector(si.description) @@ to_tsquery(:term))', { term });
        const legacy: FacetValueFilterInput[] = input.facetValueIds?.length
            ? input.facetValueOperator === 'AND' ? input.facetValueIds.map(id => ({ and: String(id) })) : [{ or: input.facetValueIds.map(String) }] : [];
        const filters: FacetValueFilterInput[] = [...legacy, ...(input.facetValueFilters || [])];
        for (const [index, filter] of filters.entries()) {
            if (filter.and && filter.or?.length) throw new UserInputError('Selecciona un filtro de faceta válido.');
            if (filter.and) qb.andWhere(`:facet${index}::varchar=ANY(string_to_array(si.facetValueIds,','))`, { [`facet${index}`]: filter.and });
            else if (filter.or?.length) qb.andWhere(`string_to_array(si.facetValueIds,',') && :facets${index}::text[]`, { [`facets${index}`]: filter.or });
        }
        if (input.collectionId) qb.andWhere(':collectionId::varchar=ANY(string_to_array(si.collectionIds,\',\'))', { collectionId: String(input.collectionId) });
        if (input.collectionSlug) qb.andWhere(':collectionSlug::varchar=ANY(string_to_array(si.collectionSlugs,\',\'))', { collectionSlug: input.collectionSlug });
        for (const [field, values] of [['collectionIds', input.collectionIds || []], ['collectionSlugs', input.collectionSlugs || []]] as const) {
            if (values.length) qb.andWhere(`string_to_array(si.${field},',') && :${field}::text[]`, { [field]: values.map(String) });
        }
        return qb;
    }
    private search(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) {
        const searches = this.cache.get(ctx, input, () => new Map<string, Promise<any>>());
        const key = JSON.stringify([enabled, input]);
        if (!searches.has(key)) searches.set(key, this.runSearch(ctx, input, enabled));
        return searches.get(key)!;
    }
    private async runSearch(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) {
        const grouped = Boolean(input.groupByProduct);
        const qb = this.query(ctx, input, enabled).select(getFieldsToSelect(this.options.indexStockStatus, this.options.indexCurrencyCode).map(field => {
            const expression = !grouped || field === 'productId' ? `si.${field}` : ['facetIds','facetValueIds','collectionIds','channelIds'].includes(field) ? `string_agg(si.${field},',')` : ['enabled','inStock','productInStock'].includes(field) ? `bool_or(si.${field})` : `MIN(si.${field})`;
            return `${expression} AS "si_${field}"`;
        }));
        if (grouped) qb.groupBy('si.productId').addSelect('MIN(si.price)', 'minPrice').addSelect('MAX(si.price)', 'maxPrice').addSelect('MIN(si.priceWithTax)', 'minPriceWithTax').addSelect('MAX(si.priceWithTax)', 'maxPriceWithTax');
        const page = this.connection.rawConnection.createQueryBuilder().select('m.*').from('matched', 'm');
        if (input.sort?.name) page.addOrderBy('m."si_productName"', input.sort.name);
        if (input.sort?.price) page.addOrderBy('m."si_price"', input.sort.price);
        if (!input.sort && qb.getParameters().term) {
            const rank = (field: string, weight: number) => `ts_rank_cd(to_tsvector(${grouped ? `MIN(si.${field})` : `si.${field}`}),to_tsquery(:term))*${weight}`;
            qb.addSelect([rank('sku',10),rank('productName',2),rank('productVariantName',1.5),rank('description',1)].join('+'), 'score');
            page.addOrderBy('m.score','DESC');
        }
        page.addOrderBy('m."si_productVariantId"', 'ASC').limit(Math.min(100, Math.max(1, input.take ?? 12))).offset(Math.max(0, input.skip ?? 0));
        const [sql, parameters] = qb.getQueryAndParameters();
        const [result] = await this.connection.getRepository(ctx, ProductVariant).query(`WITH matched AS MATERIALIZED (${sql}), page AS (${page.getQuery()})
            SELECT (SELECT coalesce(jsonb_agg(page),'[]') FROM page) AS items, count(*) AS total,
                coalesce(jsonb_agg(jsonb_build_object('facetValues',"si_facetValueIds",'collections',"si_collectionIds")),'[]') AS groups
            FROM matched`, parameters);
        return result as { items: any[]; total: string; groups: Array<{facetValues: string; collections: string}> };
    }
    async getSearchResults(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean): Promise<SearchResult[]> {
        if (!this.filtered(input)) return this.native.getSearchResults(ctx, input, enabled);
        const result = await this.search(ctx, input, enabled);
        return result.items.map((row: any) => mapToSearchResult(row, this.options.indexCurrencyCode ? row.si_currencyCode : ctx.currencyCode));
    }
    async getTotalCount(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) {
        if (!this.filtered(input)) return this.native.getTotalCount(ctx, input, enabled);
        return Number((await this.search(ctx, input, enabled)).total);
    }
    async getFacetValueIds(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) {
        if (!this.filtered(input)) return this.native.getFacetValueIds(ctx, input, enabled);
        return createFacetIdCountMap((await this.search(ctx, input, enabled)).groups);
    }
    async getCollectionIds(ctx: RequestContext, input: FootwearSearchInput, enabled: boolean) {
        if (!this.filtered(input)) return this.native.getCollectionIds(ctx, input, enabled);
        return createCollectionIdCountMap((await this.search(ctx, input, enabled)).groups);
    }
    async filterValues(ctx: RequestContext) {
        const rows = await this.connection.getRepository(ctx, ProductVariant).query(`SELECT entry.key,array_agg(DISTINCT item.value ORDER BY item.value) AS values
            FROM footwear_catalog_attribute fa JOIN product_variant v ON v.id=fa."variantId" JOIN product p ON p.id=v."productId"
            CROSS JOIN LATERAL jsonb_each(fa.attributes) entry CROSS JOIN LATERAL jsonb_array_elements_text(entry.value) item(value)
            WHERE v.enabled AND p.enabled AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL
            AND EXISTS(SELECT 1 FROM product_variant_channels_channel vc WHERE vc."productVariantId"=v.id AND vc."channelId"=$1)
            GROUP BY entry.key`, [ctx.channelId]);
        return Object.fromEntries(footwearKeys.map(key => [key, rows.find((row: any) => row.key === key)?.values || []]));
    }
}
