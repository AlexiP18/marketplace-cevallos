import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { adminApiExtensions } from './api/admin.graphql';
import { AdminSellerProfileResolver } from './api/admin-seller-profile.resolver';
import { shopApiExtensions } from './api/shop.graphql';
import { ShopSellerRegistrationResolver } from './api/shop-seller-registration.resolver';
import { MULTIVENDOR_PLUGIN_OPTIONS } from './constants';
import { SellerProfile } from './entities/seller-profile.entity';
import { FinancialInstitution } from './entities/financial-institution.entity';
import { AdministratorPersonalProfile } from './entities/administrator-personal-profile.entity';
import { AdministratorPersonalProfileService } from './services/administrator-personal-profile.service';
import { SellerAdministratorPhotoResolver } from './api/seller-administrator-photo.resolver';
import { WarehouseUserResolver } from './api/warehouse-user.resolver';
import { WarehouseUser } from './entities/warehouse-user.entity';
import { WarehouseUserService } from './services/warehouse-user.service';
import { SellerProfileService } from './services/seller-profile.service';
import { SellerRegistrationService } from './services/seller-registration.service';
import { MultivendorPluginOptions } from './types';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [SellerProfile, FinancialInstitution, AdministratorPersonalProfile, WarehouseUser],
    providers: [
        SellerRegistrationService,
        SellerProfileService,
        AdministratorPersonalProfileService,
        WarehouseUserService,
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
        resolvers: [AdminSellerProfileResolver, SellerAdministratorPhotoResolver, WarehouseUserResolver],
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
