import { Injector, Order, OrderLine, OrderProcess, OrderSellerStrategy, PaymentProcess, RequestContext, ShippingLine, StockAllocationStrategy, TransactionalConnection, UserInputError } from '@vendure/core';
import { SellerProfile } from '../multivendor/entities/seller-profile.entity';
import { ReservationService } from './reservation.service';

export class MarketplaceSellerStrategy implements OrderSellerStrategy {
    private connection: TransactionalConnection;
    async init(injector: Injector) { this.connection = injector.get(TransactionalConnection); }
    async setOrderLineSellerChannel(ctx: RequestContext, line: OrderLine) {
        const sellers = await this.connection.getRepository(ctx, SellerProfile).createQueryBuilder('profile')
            .innerJoinAndSelect('profile.channel', 'channel')
            .innerJoin('product_variant_channels_channel', 'vc', 'vc."channelId" = channel.id AND vc."productVariantId" = :id', { id: line.productVariantId }).getMany();
        if (sellers.length !== 1 || sellers[0].status !== 'ACTIVE') throw new UserInputError('El calzado debe pertenecer a un único almacén activo.');
        return sellers[0].channel;
    }
    async splitOrder(ctx: RequestContext, order: Order) {
        if (await this.connection.getRepository(ctx, Order).count({ where: { aggregateOrderId: order.id } })) return [];
        const groups = new Map<NonNullable<OrderLine['sellerChannelId']>, OrderLine[]>();
        for (const line of order.lines) {
            const channel = await this.setOrderLineSellerChannel(ctx, line);
            line.sellerChannelId = channel.id;
            const group = groups.get(channel.id) || [];
            group.push(line); groups.set(channel.id, group);
        }
        // Shared shipping is charged once, to the first seller order, so child totals do not duplicate it.
        return [...groups].map(([channelId, lines], index) => ({ channelId, state: 'ArrangingPayment' as const, lines, shippingLines: index === 0 ? order.shippingLines : [] }));
    }
    async afterSellerOrdersCreated(ctx: RequestContext, aggregate: Order, children: Order[]) {
        // The shared shipping quote belongs to the checkout, including its free-shipping discounts.
        const shippingOrder = children[0];
        if (shippingOrder) {
            for (const [index, line] of shippingOrder.shippingLines.entries()) {
                const original = aggregate.shippingLines[index];
                line.listPrice = original.listPrice;
                line.listPriceIncludesTax = original.listPriceIncludesTax;
                line.adjustments = original.adjustments;
                line.taxLines = original.taxLines;
                await this.connection.getRepository(ctx, ShippingLine).save(line);
            }
            shippingOrder.shipping = aggregate.shipping;
            shippingOrder.shippingWithTax = aggregate.shippingWithTax;
            await this.connection.getRepository(ctx, Order).update(shippingOrder.id, { shipping: aggregate.shipping, shippingWithTax: aggregate.shippingWithTax });
        }
        if (children.reduce((sum, child) => sum + child.totalWithTax, 0) !== aggregate.totalWithTax) throw new UserInputError('Los precios o promociones de los canales no coinciden con el total de la compra. Revisa la configuración antes de reservar.');
        aggregate.sellerOrders = children;
    }
}

export class MarketplaceAllocationStrategy implements StockAllocationStrategy {
    shouldAllocateStock() { return false; } // ReservationService records allocations exactly once under row locks.
}

let reservations: ReservationService;
export async function assertReservationBeforePayment(ctx: RequestContext, order: Order) {
    if (!reservations) throw new UserInputError('El servicio de reservas todavía no está disponible.');
    await reservations.assertNotExpired(ctx, order);
}
export const marketplaceOrderProcess: OrderProcess<string> = {
    init(injector) { reservations = injector.get(ReservationService); },
    async onTransitionStart(from, to, { ctx, order }) {
        if (to === 'ArrangingPayment' && from === 'AddingItems' && !(ctx as any).marketplaceCheckout) return 'Confirma el carrito mediante la cola de reservas.';
        if (from === 'ArrangingPayment' && to === 'AddingItems' && order.type === 'Aggregate') return 'El carrito ya tiene una reserva. Cancela la orden antes de iniciar un carrito diferente.';
        if (['PaymentSettled', 'PaymentAuthorized'].includes(to)) await reservations.assertNotExpired(ctx, order);
    },
    async onTransitionEnd(from, to, { ctx, order }) {
        if (to === 'PaymentSettled') await reservations.markPaid(ctx, order);
        if (to === 'Cancelled') await reservations.markCancelled(ctx, order);
    },
};

export const marketplacePaymentProcess: PaymentProcess<string> = {
    init(injector) { reservations = injector.get(ReservationService); },
    async onTransitionStart(from, to, { ctx, order }) {
        if (to === 'Authorized' || to === 'Settled') await reservations.assertNotExpired(ctx, order);
    },
};
