import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import gql from 'graphql-tag';
import { ReservationService } from './reservation.service';
import { MarketplaceReservation } from './marketplace-reservation.entity';
import { MarketplaceCheckoutResolver, MarketplaceAdminResolver, MarketplaceFilesController, MarketplaceOrderResolver } from './marketplace.resolver';
import { MarketplaceFileService } from './marketplace-file.service';
import { LabelingPlugin } from '../labeling/labeling.plugin';
import { StatisticsPlugin } from '../statistics/statistics.plugin';
import { MARKETPLACE_OPTIONS, MarketplaceOptions } from './marketplace.options';
import { CheckoutStockService } from './checkout-stock.service';
import { MarketplaceCheckoutHold } from './marketplace-checkout-hold.entity';
import { WarehousePlugin } from '../warehouse/warehouse.plugin';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CheckoutHoldInterceptor } from './checkout-hold.interceptor';

export type { MarketplaceOptions } from './marketplace.options';
const reservationSchema = gql`
    type MarketplaceOrderReservation { id: ID! orderCode: String! expiresAt: DateTime! status: String! serverTime: DateTime! }
    extend type Order { marketplaceReservations: [MarketplaceOrderReservation!]! }
`;
@VendurePlugin({
    imports: [PluginCommonModule, LabelingPlugin, StatisticsPlugin, WarehousePlugin],
    entities: [MarketplaceReservation, MarketplaceCheckoutHold],
    providers: [ReservationService, MarketplaceFileService, { provide: MARKETPLACE_OPTIONS, useFactory: () => MarketplacePlugin.options }, CheckoutStockService, {provide:APP_INTERCEPTOR,useClass:CheckoutHoldInterceptor}],
    controllers: [MarketplaceFilesController],
    shopApiExtensions: { schema: gql`
        ${reservationSchema}
        type MarketplaceCheckoutJob { id: String! state: String! result: JSON errorCode: String message: String }
        extend type Mutation { reserveMarketplaceCheckout: MarketplaceCheckoutJob! }
        extend type Query { marketplaceCheckoutJob(id: String!, wait: Boolean = false): MarketplaceCheckoutJob! }
    `, resolvers: [MarketplaceCheckoutResolver, MarketplaceOrderResolver] },
    adminApiExtensions: { schema: gql`
        ${reservationSchema}
        type MarketplaceFileJob { id: ID! state: String! message: String result: JSON downloadUrl: String }
        extend type Mutation {
            generateMarketplaceLabels(input: JSON!): MarketplaceFileJob!
            generateMarketplaceReport(startDate: DateTime!, endDate: DateTime!): MarketplaceFileJob!
        }
        extend type Query { marketplaceFileJob(id: ID!): MarketplaceFileJob! }
    `, resolvers: [MarketplaceAdminResolver, MarketplaceOrderResolver] },
    compatibility: '^3.7.0',
})
export class MarketplacePlugin {
    static options: MarketplaceOptions;
    static init(options: Omit<MarketplaceOptions, 'reservationTtlMinutes'> & { reservationTtlMinutes?: number }) {
        const reservationTtlMinutes = options.reservationTtlMinutes ?? 45;
        if (options.workerRole && !['all','admission','general'].includes(options.workerRole)) throw new Error('MARKETPLACE_WORKER_ROLE debe ser all, admission o general.');
        if (!Number.isInteger(reservationTtlMinutes) || reservationTtlMinutes < 1 || reservationTtlMinutes > 1440) throw new Error('RESERVATION_TTL_MINUTES debe ser un entero entre 1 y 1440.');
        this.options = { ...options, reservationTtlMinutes };
        return MarketplacePlugin;
    }
}
