import { defineDashboardExtension, type DashboardRouteDefinition } from '@vendure/dashboard';
import { ChartColumnIncreasing } from 'lucide-react';
import { StatisticsPage } from './statistics-page';

const route: DashboardRouteDefinition = {
    path: '/estadisticas-calzado',
    navMenuItem: { sectionId: 'footwear-statistics', id: 'footwear-statistics-report', title: 'Ventas y demanda', icon: ChartColumnIncreasing, requiresPermission: 'ReadOrder' },
    loader: () => ({ breadcrumb: 'Estadísticas' }),
    component: () => <StatisticsPage />,
};

defineDashboardExtension({
    navSections: [{ id: 'footwear-statistics', title: 'Estadísticas', icon: ChartColumnIncreasing, order: 57 }],
    routes: [route],
});
