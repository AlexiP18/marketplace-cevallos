import { defineDashboardExtension } from '@vendure/dashboard';
import { Store } from 'lucide-react';

import { sellerProfileList } from './seller-profile-list';
import { sellerProfileDetail } from './seller-profile-detail';
import { DependentEstiloInput } from './components/dependent-estilo-input';
import { RangoTallasMultiInput } from './components/rango-tallas-multi-input';
import { SuelaMultiInput } from './components/suela-multi-input';
import { CapelladaMultiInput } from './components/capellada-multi-input';

defineDashboardExtension({
    navSections: [
        {
            id: 'multivendor',
            title: 'Multivendedor',
            icon: Store,
            order: 50,
        },
    ],
    routes: [sellerProfileList, sellerProfileDetail],
    customFormComponents: {
        customFields: [
            {
                id: 'dependent-estilo-input',
                component: DependentEstiloInput,
            },
            {
                id: 'rango-tallas-multi-input',
                component: RangoTallasMultiInput,
            },
            {
                id: 'suela-multi-input',
                component: SuelaMultiInput,
            },
            {
                id: 'capellada-multi-input',
                component: CapelladaMultiInput,
            },
        ],
    },
});
