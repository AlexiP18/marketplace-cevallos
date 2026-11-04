import { defineDashboardExtension } from '@vendure/dashboard';
import { Boxes, ClipboardCheck, History, MapPin } from 'lucide-react';
import { WarehousePage } from './warehouse-page';
import { DispatchPage } from './dispatch-page';
import { ReservationCountdown } from './reservation-countdown';

defineDashboardExtension({
    pageBlocks: [{ id: 'warehouse-order-reservation-clock', title: 'Reserva de existencias', location: { pageId: 'order-detail', column: 'side', position: { blockId: 'state', order: 'after' } }, component: ({ context }) => <ReservationCountdown orderId={String(context.entity.id)} /> }],
    navSections: [{ id: 'warehouse', title: 'Bodega', icon: Boxes, order: 56 }],
    routes: [
        { path: '/warehouse/dispatch', navMenuItem: { sectionId: 'warehouse', id: 'warehouse-dispatch', title: 'Pagos y despacho', icon: ClipboardCheck, requiresPermission: 'ManageWarehouseDispatch' }, loader: () => ({ breadcrumb: 'Pagos y despacho' }), component: DispatchPage },
        { path: '/warehouse/receipts', navMenuItem: { sectionId: 'warehouse', id: 'warehouse-receipts', title: 'Recepción y perchas', icon: MapPin, requiresPermission: 'ReadProduct' }, loader: () => ({ breadcrumb: 'Recepción y perchas' }), component: () => <WarehousePage tab="receipts" /> },
        { path: '/warehouse/picking', navMenuItem: { sectionId: 'warehouse', id: 'warehouse-picking', title: 'Alistamiento', icon: ClipboardCheck, requiresPermission: 'ReadOrder' }, loader: () => ({ breadcrumb: 'Alistamiento' }), component: () => <WarehousePage tab="picking" /> },
        { path: '/warehouse/kardex', navMenuItem: { sectionId: 'warehouse', id: 'warehouse-kardex', title: 'Kardex', icon: History, requiresPermission: 'ReadOrder' }, loader: () => ({ breadcrumb: 'Kardex' }), component: () => <WarehousePage tab="kardex" /> },
    ],
});
