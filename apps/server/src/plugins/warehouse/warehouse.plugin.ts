import { PermissionDefinition, PluginCommonModule, VendurePlugin } from '@vendure/core';
import { WarehouseResolver } from './api/warehouse.resolver';
import { warehouseAdminApi } from './api/warehouse.graphql';
import { WarehouseShelf } from './entities/warehouse-shelf.entity';
import { WarehouseMovementNote } from './entities/warehouse-movement-note.entity';
import { WarehousePickScan } from './entities/warehouse-pick-scan.entity';
import { WarehouseStockSubscriber } from './services/warehouse-stock.subscriber';
import { WarehouseService } from './services/warehouse.service';
import { WarehouseOrderOperation } from './entities/warehouse-order-operation.entity';
import { LabelingPlugin } from '../labeling/labeling.plugin';
import { APP_GUARD } from '@nestjs/core';
import { WarehouseManualPaymentGuard } from './api/warehouse-manual-payment.guard';
import { WarehouseReservation } from './services/warehouse-reservation';

@VendurePlugin({
    imports: [PluginCommonModule, LabelingPlugin],
    entities: [WarehouseShelf, WarehouseMovementNote, WarehousePickScan, WarehouseOrderOperation],
    providers: [WarehouseService, WarehouseStockSubscriber, { provide: APP_GUARD, useClass: WarehouseManualPaymentGuard }, WarehouseReservation],
    exports: [WarehouseReservation],
    adminApiExtensions: { schema: warehouseAdminApi, resolvers: [WarehouseResolver] },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
    configuration: config => {
        config.authOptions.customPermissions.push(new PermissionDefinition({ name: 'ManageWarehouseDispatch', description: 'Validar pagos y despachar pedidos del almacén' }));
        return config;
    },
})
export class WarehousePlugin {}
