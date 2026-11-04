import { defineDashboardExtension, type DashboardRouteDefinition } from '@vendure/dashboard';
import { Tag } from 'lucide-react';
import { LabelingPage } from './labeling-page';

const route: DashboardRouteDefinition = {
    path: '/etiquetas',
    navMenuItem: { sectionId: 'labeling', id: 'footwear-labels', title: 'Diseñar e imprimir', icon: Tag },
    loader: () => ({ breadcrumb: 'Etiquetas' }),
    component: () => <LabelingPage />,
};

defineDashboardExtension({
    navSections: [
        {
            id: 'labeling',
            title: 'Etiquetas',
            icon: Tag,
            order: 55,
        },
    ],
    routes: [route],
});
