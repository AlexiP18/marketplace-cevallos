import { Permission } from '@vendure/core';

export const MULTIVENDOR_PLUGIN_OPTIONS = Symbol('MULTIVENDOR_PLUGIN_OPTIONS');

export const loggerCtx = 'MultivendorPlugin';

/**
 * Standard permissions granted to a seller administrator scoped to their own channel.
 */
export const DEFAULT_SELLER_PERMISSIONS: Permission[] = [
    Permission.Authenticated,
    // Catalog
    Permission.ReadCatalog,
    Permission.CreateCatalog,
    Permission.UpdateCatalog,
    Permission.DeleteCatalog,
    // Products
    Permission.ReadProduct,
    Permission.CreateProduct,
    Permission.UpdateProduct,
    Permission.DeleteProduct,
    // Assets (images, documents)
    Permission.ReadAsset,
    Permission.CreateAsset,
    Permission.UpdateAsset,
    Permission.DeleteAsset,
    // Collections
    Permission.ReadCollection,
    Permission.CreateCollection,
    Permission.UpdateCollection,
    Permission.DeleteCollection,
    // Facets
    Permission.ReadFacet,
    Permission.CreateFacet,
    Permission.UpdateFacet,
    Permission.DeleteFacet,
    // Orders in seller channel
    Permission.ReadOrder,
    Permission.UpdateOrder,
    // Customers (for order fulfillment)
    Permission.ReadCustomer,
    // Shipping / Payment / Promotion views
    Permission.ReadShippingMethod,
    Permission.ReadPaymentMethod,
    Permission.ReadPromotion,
    // Seller & Channel self info
    Permission.ReadSeller,
    Permission.UpdateSeller,
    Permission.ReadChannel,
];
