import { defineDashboardExtension } from '@vendure/dashboard';
import { Store } from 'lucide-react';

import { financialInstitutionsRoute } from './financial-institutions';
import { sellerProfileList } from './seller-profile-list';
import { sellerProfileCreate } from './seller-profile-create';
import { sellerProfileDetail } from './seller-profile-detail';
import { sellerProfileEdit } from './seller-profile-edit';
import { AdministratorPersonalProfileBlock } from './administrator-personal-profile';
import { CombinedShippingPreference } from './combined-shipping-preference';
import { warehouseUsersRoute } from './warehouse-users';
import { SuperadminDashboardScope, superadminSectionIcon } from './superadmin-navigation';
import { WarehouseLoginIntro } from './warehouse-login-intro';
import './navigation-scope.css';

defineDashboardExtension({
    login: { beforeForm: { component: WarehouseLoginIntro } },
    customProviders: [{ id: 'superadmin-dashboard-scope', location: 'layout', component: SuperadminDashboardScope }],
    navSections: [
        {
            id: 'multivendor',
            title: 'Multivendedor',
            icon: Store,
            order: 50,
        },
    ],
    routes: [sellerProfileList, sellerProfileCreate, sellerProfileDetail, sellerProfileEdit, financialInstitutionsRoute, warehouseUsersRoute],
    pageBlocks: [
        {
            id: 'combined-shipping-preference',
            title: 'Envío conjunto',
            location: { pageId: 'shipping-method-list', column: 'full', position: { blockId: 'list-table', order: 'before' } },
            component: CombinedShippingPreference,
        },
        {
            id: 'administrator-personal-profile',
            title: 'Datos personales',
            location: { pageId: 'profile', column: 'side', position: { blockId: 'main-form', order: 'after' } },
            component: AdministratorPersonalProfileBlock,
        },
    ],
});

defineDashboardExtension({
    navSections: config => ({
        sections: config.sections.map(section => ({
            ...section,
            icon: superadminSectionIcon(section.id, section.icon),
        })),
    }),
});
