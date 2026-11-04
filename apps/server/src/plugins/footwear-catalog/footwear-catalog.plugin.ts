import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { footwearCustomFields } from './catalog-custom-fields';
import { MarketplaceHiddenProduct } from './entities/hidden-seller-product.entity';
import { CatalogPublicationService } from './services/catalog-publication.service';
import { VariantSkuSubscriber } from './services/variant-sku.subscriber';
import { CatalogAttribute } from './services/catalog-attribute';
import gql from 'graphql-tag';
import { FootwearFiltersResolver } from './api/footwear-filters.resolver';

const filtersSchema = gql`input FootwearAttributeFilterInput { talla: String color: String capellada: String suela: String horma: String }
    extend input SearchInput { footwear: FootwearAttributeFilterInput }
    type FootwearFilterValues { talla: [String!]! color: [String!]! capellada: [String!]! suela: [String!]! horma: [String!]! }`;

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [MarketplaceHiddenProduct],
    providers: [VariantSkuSubscriber, CatalogPublicationService, CatalogAttribute],
    exports: [CatalogAttribute],
    shopApiExtensions: { schema: gql`${filtersSchema} extend type Query { footwearFilterValues: FootwearFilterValues! }`, resolvers: [FootwearFiltersResolver] },
    adminApiExtensions: { schema: filtersSchema },
    dashboard: './dashboard/index.tsx',
    configuration: config => {
        for (const entity of ['Product', 'ProductVariant', 'ProductOption'] as const) {
            config.customFields[entity] = [...(config.customFields[entity] || []), ...(footwearCustomFields[entity] || [])];
        }
        return config;
    },
    compatibility: '^3.0.0',
})
export class FootwearCatalogPlugin {}
