import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { adminApiExtensions } from './api/admin.graphql';
import { AdminSellerProfileResolver } from './api/admin-seller-profile.resolver';
import { shopApiExtensions } from './api/shop.graphql';
import { ShopSellerRegistrationResolver } from './api/shop-seller-registration.resolver';
import { MULTIVENDOR_PLUGIN_OPTIONS } from './constants';
import { SellerProfile } from './entities/seller-profile.entity';
import { SellerProfileService } from './services/seller-profile.service';
import { SellerRegistrationService } from './services/seller-registration.service';
import { MultivendorPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [SellerProfile],
    providers: [
        SellerRegistrationService,
        SellerProfileService,
        {
            provide: MULTIVENDOR_PLUGIN_OPTIONS,
            useFactory: () => MultivendorPlugin.options,
        },
    ],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ShopSellerRegistrationResolver],
    },
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [AdminSellerProfileResolver],
    },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class MultivendorPlugin {
    static options: MultivendorPluginOptions = {};

    static init(options: MultivendorPluginOptions = {}): Type<MultivendorPlugin> {
        this.options = options;
        return MultivendorPlugin;
    }
}
