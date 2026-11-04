import { Injectable } from '@nestjs/common';
import {
    Allocation, Channel, ChannelService, ForbiddenError, ID, Order, OrderLine, Permission,
    ProductVariant, RequestContext, StockLevel, StockLocation, StockLocationService,
    StockMovementService, TransactionalConnection, UserInputError, OrderService, FulfillmentService, isGraphQlErrorResult,
} from '@vendure/core';
import { IsNull } from 'typeorm';
import { SellerProfile } from '../../multivendor/entities/seller-profile.entity';
import { WarehouseUser } from '../../multivendor/entities/warehouse-user.entity';
import { WarehouseShelf } from '../entities/warehouse-shelf.entity';
import { WarehouseMovementNote } from '../entities/warehouse-movement-note.entity';
import { WarehousePickScan } from '../entities/warehouse-pick-scan.entity';
import { WarehouseOrderOperation } from '../entities/warehouse-order-operation.entity';
import { LabelCodeService } from '../../labeling/services/label-code.service';
import { WarehouseReservation } from './warehouse-reservation';

type ShelfInput = { code: string; description?: string; sourceLocationId?: ID };
type StockInput = { variantId: ID; shelfId: ID; quantity: number; reason?: string };
type PlacementInput = { variantId: ID; sourceLocationId: ID; shelfId: ID; quantity: number };
type MoveInput = { variantId: ID; fromShelfId: ID; toShelfId: ID; quantity: number; reason: string };
type ScanInput = { orderLineId: ID; shelfId: ID; code: string };
type WarehouseScope = { channel: Channel; slug: string };

@Injectable()
export class WarehouseService {
    constructor(
        private connection: TransactionalConnection,
        private locations: StockLocationService,
        private movements: StockMovementService,
        private channels: ChannelService,
        private orderService: OrderService,
        private fulfillments: FulfillmentService,
        private labelCodes: LabelCodeService,
        private reservations: WarehouseReservation,
    ) {}

    private async operationalOrder(ctx: RequestContext, orderId: ID, lock = false) {
        await this.actor(ctx, ['ADMINISTRADOR', 'DESPACHADOR']);
        if (lock) {
            await this.connection.getRepository(ctx, Order).query('SELECT pg_advisory_xact_lock($1, $2)', [17917761, Number(orderId)]);
            await this.connection.getRepository(ctx, Order).query('SELECT o.id FROM "order" o WHERE o.id=$1 AND EXISTS(SELECT 1 FROM order_channels_channel c WHERE c."orderId"=o.id AND c."channelId"=$2) FOR UPDATE', [orderId,ctx.channelId]);
        }
        const order = await this.connection.findOneInChannel(ctx, Order, orderId, ctx.channelId, {
            relations: ['lines', 'lines.productVariant', 'customer', 'payments'],
        });
        if (!order || order.type === 'Aggregate' || order.lines.some(line => line.sellerChannelId && String(line.sellerChannelId) !== String(ctx.channelId))) throw new ForbiddenError();
        return order;
    }

    async dispatchOrders(ctx: RequestContext) {
        await this.actor(ctx, ['ADMINISTRADOR', 'DESPACHADOR']);
        const orders = await this.connection.getRepository(ctx, Order).createQueryBuilder('o')
            .innerJoin('o.channels', 'channel', 'channel.id = :channelId', { channelId: ctx.channelId })
            .leftJoinAndSelect('o.lines', 'line').leftJoinAndSelect('line.productVariant', 'variant')
            .leftJoinAndSelect('variant.translations', 'variantTranslation')
            .leftJoinAndSelect('o.customer', 'customer')
            .where('o.type <> :aggregate AND o.state IN (:...states)', { aggregate: 'Aggregate', states: ['ArrangingPayment', 'PaymentAuthorized', 'PaymentSettled', 'PartiallyFulfilled', 'Shipped', 'Delivered', 'Cancelled'] })
            .orderBy('o.updatedAt', 'DESC').take(100).getMany();
        const records = await this.connection.getRepository(ctx, WarehouseOrderOperation).find({ where: { channelId: Number(ctx.channelId) } });
        return orders.filter(order => !order.lines.some(line => line.sellerChannelId && String(line.sellerChannelId) !== String(ctx.channelId))).map(order => ({
            id: String(order.id), code: order.code, state: order.state, total: order.totalWithTax, currency: order.currencyCode,
            customer: order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : '',
            email: order.customer?.emailAddress || '', address: order.shippingAddress,
            lines: order.lines.map(line => ({ id: String(line.id), sku: line.productVariant.sku, name: line.productVariant.translations?.[0]?.name || line.productVariant.sku, quantity: line.quantity, total: line.proratedLinePriceWithTax })),
            operation: records.find(record => record.orderId === Number(order.id))?.details || {},
        }));
    }

    async saveProof(ctx: RequestContext, input: { orderId: ID; reference: string; institution: string; amount: number; file: string }) {
        const order = await this.operationalOrder(ctx, input.orderId, true);
        if (order.state !== 'ArrangingPayment') throw new UserInputError('Solo puedes adjuntar comprobantes a pedidos pendientes de pago.');
        if ((order.payments || []).some(payment => ['Settled', 'Authorized'].includes(payment.state))) throw new UserInputError('Este pedido ya tiene un pago registrado. Revisa sus pagos antes de adjuntar otro comprobante.');
        const reference = input.reference.trim();
        const institution = input.institution.trim();
        if (reference.length < 3 || reference.length > 100 || institution.length < 3 || institution.length > 150) throw new UserInputError('Ingresa una referencia y entidad financiera válidas.');
        if (!Number.isSafeInteger(input.amount) || input.amount !== order.totalWithTax) throw new UserInputError('El importe del comprobante debe coincidir con el total del pedido.');
        const match = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.file);
        if (!match || input.file.length > 720000) throw new UserInputError('Adjunta un archivo PNG, JPG o PDF de hasta 512 KB.');
        const bytes = Buffer.from(match[2], 'base64');
        const valid = match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0, 5).toString() === '%PDF-';
        if (!valid || bytes.length > 524288) throw new UserInputError('El contenido del archivo no corresponde al formato indicado.');
        const repo = this.connection.getRepository(ctx, WarehouseOrderOperation);
        const record = await repo.findOne({ where: { channelId: Number(ctx.channelId), orderId: Number(order.id) } }) || new WarehouseOrderOperation({ channelId: Number(ctx.channelId), orderId: Number(order.id) });
        record.details = { reference, institution, amount: input.amount, status: 'PENDING', uploadedBy: String(ctx.activeUserId), uploadedAt: new Date().toISOString() };
        record.proof = input.file;
        await repo.save(record);
        return true;
    }

    async paymentProof(ctx: RequestContext, orderId: ID) {
        await this.operationalOrder(ctx, orderId);
        const record = await this.connection.getRepository(ctx, WarehouseOrderOperation).createQueryBuilder('op').addSelect('op.proof')
            .where('op.channelId = :channel AND op.orderId = :order', { channel: ctx.channelId, order: orderId }).getOne();
        if (!record?.proof) throw new UserInputError('No hay un comprobante adjunto.');
        return record.proof;
    }

    async reviewPayment(ctx: RequestContext, orderId: ID, approve: boolean, reason = '') {
        const order = await this.operationalOrder(ctx, orderId, true);
        const repo = this.connection.getRepository(ctx, WarehouseOrderOperation);
        const record = await repo.findOne({ where: { channelId: Number(ctx.channelId), orderId: Number(order.id) } });
        if (!record || record.details.status !== 'PENDING' || order.state !== 'ArrangingPayment') throw new UserInputError('El pedido no tiene un comprobante pendiente de revisión.');
        if ((order.payments || []).some(payment => ['Settled', 'Authorized'].includes(payment.state))) throw new UserInputError('El pedido ya tiene un pago registrado. Revisa sus pagos antes de continuar.');
        if (approve && record.details.amount !== order.totalWithTax) throw new UserInputError('El total del pedido cambió. Adjunta un comprobante actualizado.');
        if (!approve && (reason.trim().length < 5 || reason.length > 500)) throw new UserInputError('Indica un motivo de rechazo de entre 5 y 500 caracteres.');
        if (!approve) await this.reservations.release(ctx,Number(orderId));
        const result = approve
            ? await this.orderService.addManualPaymentToOrder(ctx, { orderId, method: 'transferencia-validada', transactionId: record.details.reference, metadata: { institution: record.details.institution } })
            : await this.orderService.cancelOrder(ctx, { orderId, reason: reason.trim(), cancelShipping: true });
        if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
        record.details = { ...record.details, status: approve ? 'APPROVED' : 'REJECTED', reason: reason.trim(), reviewedBy: String(ctx.activeUserId), reviewedAt: new Date().toISOString() };
        await repo.save(record);
        return true;
    }

    async dispatch(ctx: RequestContext, orderId: ID, carrier: string, trackingCode: string) {
        const order = await this.operationalOrder(ctx, orderId, true);
        if (order.state !== 'PaymentSettled' || order.payments.filter(payment => payment.state === 'Settled').reduce((sum, payment) => sum + payment.amount, 0) < order.totalWithTax) throw new UserInputError('El pago debe estar confirmado por el total antes de despachar.');
        if (carrier.trim().length < 3 || carrier.length > 150 || trackingCode.trim().length < 3 || trackingCode.length > 100) throw new UserInputError('Ingresa el transportista y número de guía válidos.');
        for (const line of order.lines) {
            const scanned = await this.connection.getRepository(ctx, WarehousePickScan).count({ where: { orderLineId: Number(line.id) } });
            if (scanned < line.quantity) throw new UserInputError('Faltan pares por validar en el alistamiento.');
        }
        const fulfillment = await this.orderService.createFulfillment(ctx, { lines: order.lines.map(line => ({ orderLineId: line.id, quantity: line.quantity })), handler: { code: 'manual-fulfillment', arguments: [{ name: 'method', value: carrier.trim() }, { name: 'trackingCode', value: trackingCode.trim() }] } });
        if (isGraphQlErrorResult(fulfillment)) throw new UserInputError(fulfillment.message);
        const transition = await this.fulfillments.transitionToState(ctx, fulfillment.id, 'Shipped');
        if (isGraphQlErrorResult(transition)) throw new UserInputError(transition.message);
        const repo = this.connection.getRepository(ctx, WarehouseOrderOperation);
        const record = await repo.findOne({ where: { channelId: Number(ctx.channelId), orderId: Number(orderId) } }) || new WarehouseOrderOperation({ channelId: Number(ctx.channelId), orderId: Number(orderId), details: {} });
        record.details = { ...record.details, delivery: { carrier: carrier.trim(), trackingCode: trackingCode.trim(), date: new Date().toISOString(), actor: String(ctx.activeUserId), fulfillmentId: String(fulfillment.id), code: `NE-${ctx.channelId}-${order.code}` } };
        await repo.save(record);
        return true;
    }

    private async actor(ctx: RequestContext, allowed: Array<'ADMINISTRADOR' | 'BODEGUERO' | 'DESPACHADOR'>): Promise<WarehouseScope> {
        if (!ctx.activeUserId) throw new ForbiddenError();
        const profile = await this.connection.getRepository(ctx, SellerProfile).findOne({
            where: { channel: { id: ctx.channelId } }, relations: ['administrator', 'administrator.user'],
        });
        if (!profile) {
            const defaultChannel = await this.channels.getDefaultChannel(ctx);
            if (String(defaultChannel.id) === String(ctx.channelId) && ctx.userHasAllPermissions([Permission.SuperAdmin])) {
                return { channel: defaultChannel, slug: 'central' };
            }
            throw new UserInputError('Selecciona el canal de un almacén.');
        }
        const owner = String(profile.administrator?.user?.id) === String(ctx.activeUserId);
        if (ctx.userHasAllPermissions([Permission.SuperAdmin]) || (owner && allowed.includes('ADMINISTRADOR'))) {
            return { channel: profile.channel, slug: profile.slug };
        }
        const staff = await this.connection.getRepository(ctx, WarehouseUser).findOne({
            where: { sellerProfile: { id: profile.id }, administrator: { user: { id: ctx.activeUserId }, deletedAt: IsNull() } },
            relations: ['administrator', 'administrator.user'],
        });
        if (!staff || !allowed.includes(staff.role)) throw new ForbiddenError();
        return { channel: profile.channel, slug: profile.slug };
    }

    private async shelf(ctx: RequestContext, scope: WarehouseScope, id: ID, active = true) {
        const shelf = await this.connection.getRepository(ctx, WarehouseShelf).findOne({
            where: { id, channel: { id: scope.channel.id } }, relations: ['stockLocation'],
        });
        if (!shelf || (active && !shelf.active)) throw new UserInputError('La percha no pertenece a este almacén o está inactiva.');
        return shelf;
    }

    private async variant(ctx: RequestContext, id: ID) {
        const variant = await this.connection.findOneInChannel(ctx, ProductVariant, id, ctx.channelId, { relations: ['product'] });
        if (!variant || variant.deletedAt) throw new UserInputError('La variante no pertenece a este almacén.');
        return variant;
    }

    async shelves(ctx: RequestContext) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR']);
        const shelves = await this.connection.getRepository(ctx, WarehouseShelf).find({
            where: { channel: { id: profile.channel.id } }, relations: ['stockLocation'], order: { code: 'ASC' },
        });
        const levels = shelves.length ? await this.connection.getRepository(ctx, StockLevel)
            .createQueryBuilder('level').where('level.stockLocationId IN (:...ids)', { ids: shelves.map(s => s.stockLocation.id) }).getMany() : [];
        return shelves.map(s => ({
            id: s.id, code: s.code, description: s.description, active: s.active,
            stockLocationId: s.stockLocation.id,
            pairs: levels.filter(l => String(l.stockLocationId) === String(s.stockLocation.id)).reduce((n, l) => n + l.stockOnHand, 0),
        }));
    }

    async createShelf(ctx: RequestContext, input: ShelfInput) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR']);
        const code = input.code.trim().toUpperCase();
        const description = (input.description || '').trim();
        if (!/^[A-Z0-9][A-Z0-9._/-]{1,59}$/.test(code)) throw new UserInputError('Usa un código de percha de 2 a 60 caracteres: letras, números, punto, guion o barra.');
        if (description.length > 255) throw new UserInputError('La descripción es demasiado larga.');
        const repo = this.connection.getRepository(ctx, WarehouseShelf);
        if (await repo.findOne({ where: { channel: { id: profile.channel.id }, code } })) throw new UserInputError('Ya existe esa percha en este almacén.');
        let location: StockLocation;
        if (input.sourceLocationId) {
            const previous = await this.connection.getRepository(ctx, StockLocation).findOne({ where: { id: input.sourceLocationId }, relations: ['channels'] });
            const defaultChannel = await this.channels.getDefaultChannel(ctx);
            const permitted = new Set([String(profile.channel.id), String(defaultChannel.id)]);
            if (!previous || !previous.channels.length || previous.channels.some(channel => !permitted.has(String(channel.id)))) throw new UserInputError('La ubicación anterior no es exclusiva de este almacén.');
            if (await repo.findOne({ where: { stockLocation: { id: previous.id } } })) throw new UserInputError('La ubicación ya tiene una percha asignada.');
            const foreignStock = await this.connection.getRepository(ctx, StockLevel).query(`SELECT 1 FROM stock_level level
                WHERE level."stockLocationId" = $1 AND (level."stockOnHand" <> 0 OR level."stockAllocated" <> 0)
                AND NOT EXISTS (SELECT 1 FROM product_variant_channels_channel vc WHERE vc."productVariantId" = level."productVariantId" AND vc."channelId" = $2) LIMIT 1`, [previous.id, profile.channel.id]);
            if (foreignStock.length) throw new UserInputError('La ubicación contiene existencias de otro almacén y no se puede vincular a esta percha.');
            if (!previous.channels.some(channel => String(channel.id) === String(profile.channel.id))) await this.locations.assignStockLocationsToChannel(ctx, { stockLocationIds: [previous.id], channelId: profile.channel.id });
            location = await this.locations.update(ctx, { id: previous.id, name: `${profile.slug} / ${code}`, description });
        } else {
            location = await this.locations.create(ctx, { name: `${profile.slug} / ${code}`, description });
        }
        const shelf = await repo.save(new WarehouseShelf({ channel: profile.channel, stockLocation: location, code, description }));
        return { id: shelf.id, code, description, active: true, stockLocationId: location.id, pairs: 0 };
    }

    async inventory(ctx: RequestContext, search = '') {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR']);
        const term = search.trim().toLowerCase();
        const qb = this.connection.getRepository(ctx, StockLevel).createQueryBuilder('level')
            .innerJoin(WarehouseShelf, 'shelf', 'shelf.stockLocationId = level.stockLocationId AND shelf.channelId = :channelId', { channelId: profile.channel.id })
            .innerJoinAndSelect('level.productVariant', 'variant')
            .innerJoinAndSelect('variant.product', 'product')
            .leftJoinAndSelect('variant.translations', 'translation')
            .select(['level', 'variant.id', 'variant.sku', 'product.id', 'translation.name'])
            .addSelect(['shelf.id', 'shelf.code'])
            .where('level.stockOnHand <> 0 OR level.stockAllocated <> 0')
            .orderBy('shelf.code', 'ASC').addOrderBy('variant.sku', 'ASC');
        if (term) qb.andWhere('(LOWER(variant.sku) LIKE :term OR LOWER(translation.name) LIKE :term)', { term: `%${term}%` });
        const levels = await qb.getMany();
        const shelfIds = [...new Set(levels.map(l => String(l.stockLocationId)))];
        const shelves = shelfIds.length ? await this.connection.getRepository(ctx, WarehouseShelf).find({
            where: { channel: { id: profile.channel.id } }, relations: ['stockLocation'],
        }) : [];
        return levels.map(level => ({
            variantId: level.productVariantId, sku: level.productVariant.sku,
            variantName: level.productVariant.translations?.[0]?.name || level.productVariant.sku,
            shelfId: shelves.find(s => String(s.stockLocation.id) === String(level.stockLocationId))?.id,
            shelfCode: shelves.find(s => String(s.stockLocation.id) === String(level.stockLocationId))?.code || '',
            onHand: level.stockOnHand, allocated: level.stockAllocated, available: level.stockOnHand - level.stockAllocated,
        }));
    }

    async unlocated(ctx: RequestContext) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO']);
        const defaultChannel = await this.channels.getDefaultChannel(ctx);
        const rows = await this.connection.getRepository(ctx, StockLevel).query(`
            SELECT level."productVariantId" AS "variantId", level."stockLocationId" AS "sourceLocationId",
                variant."sku", location."name" AS "sourceName", level."stockOnHand" AS "onHand",
                level."stockAllocated" AS "allocated"
            FROM "stock_level" level
            JOIN "product_variant" variant ON variant."id" = level."productVariantId"
            JOIN "product_variant_channels_channel" vc ON vc."productVariantId" = variant."id" AND vc."channelId" = $1
            JOIN "stock_location" location ON location."id" = level."stockLocationId"
            LEFT JOIN "warehouse_shelf" shelf ON shelf."stockLocationId" = location."id"
            WHERE shelf."id" IS NULL AND level."stockOnHand" > 0
                AND EXISTS (SELECT 1 FROM "stock_location_channels_channel" own WHERE own."stockLocationId" = location."id" AND own."channelId" IN ($1, $2))
                AND NOT EXISTS (SELECT 1 FROM "stock_location_channels_channel" other WHERE other."stockLocationId" = location."id" AND other."channelId" NOT IN ($1, $2))
            ORDER BY variant."sku", location."name"
        `, [profile.channel.id, defaultChannel.id]);
        return rows.map((row: Record<string, unknown>) => ({ ...row, variantId: String(row.variantId), sourceLocationId: String(row.sourceLocationId), onHand: Number(row.onHand), allocated: Number(row.allocated) }));
    }

    async place(ctx: RequestContext, input: PlacementInput) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR']);
        const shelf = await this.shelf(ctx, profile, input.shelfId);
        const variant = await this.variant(ctx, input.variantId);
        if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new UserInputError('Indica una cantidad válida de pares.');
        const source = await this.connection.getRepository(ctx, StockLocation).findOne({ where: { id: input.sourceLocationId }, relations: ['channels'] });
        const defaultChannel = await this.channels.getDefaultChannel(ctx);
        if (!source || !source.channels.length || source.channels.some(channel => ![String(ctx.channelId), String(defaultChannel.id)].includes(String(channel.id))) ||
            await this.connection.getRepository(ctx, WarehouseShelf).findOne({ where: { stockLocation: { id: source.id } } })) {
            throw new UserInputError('El origen debe ser una ubicación anterior sin percha.');
        }
        return this.transfer(ctx, variant.id, source, shelf, input.quantity, `Ubicación de stock anterior desde ${source.name}`);
    }

    async move(ctx: RequestContext, input: MoveInput) {
        const scope = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO']);
        const fromShelf = await this.shelf(ctx, scope, input.fromShelfId, false);
        const toShelf = await this.shelf(ctx, scope, input.toShelfId);
        const variant = await this.variant(ctx, input.variantId);
        const reason = input.reason.trim();
        if (String(fromShelf.id) === String(toShelf.id)) throw new UserInputError('Elige una percha de destino diferente.');
        if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new UserInputError('Indica una cantidad válida de pares.');
        if (reason.length < 4 || reason.length > 400) throw new UserInputError('Indica el motivo del traslado (máximo 400 caracteres).');
        return this.transfer(ctx, variant.id, fromShelf.stockLocation, toShelf, input.quantity, reason);
    }

    private async transfer(ctx: RequestContext, variantId: ID, source: StockLocation, shelf: WarehouseShelf, quantity: number, reason: string) {
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variantId), 0]);
        for (const locationId of [source.id, shelf.stockLocation.id].map(Number).sort((a, b) => a - b)) {
            await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variantId), locationId]);
        }
        const levels = await this.connection.getRepository(ctx, StockLevel).find({ where: [
            { productVariantId: variantId, stockLocationId: source.id }, { productVariantId: variantId, stockLocationId: shelf.stockLocation.id },
        ] });
        const from = levels.find(level => String(level.stockLocationId) === String(source.id));
        const to = levels.find(level => String(level.stockLocationId) === String(shelf.stockLocation.id));
        if (!from || from.stockOnHand - from.stockAllocated < quantity) throw new UserInputError('Solo se pueden trasladar pares libres; hay reservas o falta stock en el origen.');
        const out = await this.adjustStock(ctx, variantId, source.id, from.stockOnHand - quantity);
        const incoming = await this.adjustStock(ctx, variantId, shelf.stockLocation.id, (to?.stockOnHand || 0) + quantity);
        for (const movement of out) await this.record(ctx, movement.id, 'TRASLADO_SALIDA', `${reason} → ${shelf.code}`);
        for (const movement of incoming) await this.record(ctx, movement.id, 'TRASLADO_ENTRADA', `${reason} ← ${source.name}`);
        return { variantId, shelfCode: shelf.code, onHand: (to?.stockOnHand || 0) + quantity };
    }

    private async record(ctx: RequestContext, movementId: ID, operation: string, reason: string) {
        await this.connection.getRepository(ctx, WarehouseMovementNote).upsert({
            stockMovementId: Number(movementId), actorUserId: Number(ctx.activeUserId || 0), operation, reason,
        }, ['stockMovementId']);
    }

    private async adjustStock(ctx: RequestContext, variantId: ID, stockLocationId: ID, stockOnHand: number) {
        const scopedCtx = ctx as RequestContext & { warehouseStockWrite?: boolean };
        scopedCtx.warehouseStockWrite = true;
        try {
            return await this.movements.adjustProductVariantStock(ctx, variantId, [{ stockLocationId, stockOnHand }]);
        } finally {
            delete scopedCtx.warehouseStockWrite;
        }
    }

    async receive(ctx: RequestContext, input: StockInput) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO']);
        const shelf = await this.shelf(ctx, profile, input.shelfId);
        const variant = await this.variant(ctx, input.variantId);
        if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new UserInputError('La cantidad debe ser un número entero entre 1 y 100000.');
        const reason = (input.reason || 'Recepción física del taller').trim();
        if (!reason || reason.length > 500) throw new UserInputError('Indica una referencia de recepción válida.');
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variant.id), 0]);
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variant.id), Number(shelf.stockLocation.id)]);
        const level = await this.connection.getRepository(ctx, StockLevel).findOne({ where: { productVariantId: variant.id, stockLocationId: shelf.stockLocation.id } });
        const after = (level?.stockOnHand || 0) + input.quantity;
        const movements = await this.adjustStock(ctx, variant.id, shelf.stockLocation.id, after);
        for (const movement of movements) await this.record(ctx, movement.id, 'RECEPCION', reason);
        return { variantId: variant.id, shelfCode: shelf.code, onHand: after };
    }

    async adjust(ctx: RequestContext, input: StockInput) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR']);
        const shelf = await this.shelf(ctx, profile, input.shelfId);
        const variant = await this.variant(ctx, input.variantId);
        const reason = (input.reason || '').trim();
        if (reason.length < 8 || reason.length > 500) throw new UserInputError('Justifica el ajuste con al menos 8 caracteres.');
        if (!Number.isInteger(input.quantity) || input.quantity === 0 || Math.abs(input.quantity) > 100000) throw new UserInputError('El ajuste debe ser un entero distinto de cero.');
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variant.id), 0]);
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(variant.id), Number(shelf.stockLocation.id)]);
        const level = await this.connection.getRepository(ctx, StockLevel).findOne({ where: { productVariantId: variant.id, stockLocationId: shelf.stockLocation.id } });
        const after = (level?.stockOnHand || 0) + input.quantity;
        if (after < (level?.stockAllocated || 0)) throw new UserInputError('El ajuste dejaría menos pares físicos que los reservados.');
        const movements = await this.adjustStock(ctx, variant.id, shelf.stockLocation.id, after);
        for (const movement of movements) await this.record(ctx, movement.id, 'AJUSTE', reason);
        return { variantId: variant.id, shelfCode: shelf.code, onHand: after };
    }

    async orders(ctx: RequestContext) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR']);
        const orders = await this.connection.getRepository(ctx, Order).createQueryBuilder('ord')
            .innerJoin('ord.channels', 'channel', 'channel.id = :channelId', { channelId: profile.channel.id })
            .leftJoinAndSelect('ord.lines', 'line').leftJoinAndSelect('line.productVariant', 'variant')
            .where('ord.state IN (:...states)', { states: ['PaymentSettled', 'PartiallyFulfilled'] })
            .orderBy('ord.createdAt', 'DESC').take(40).getMany();
        const allocations = await this.connection.getRepository(ctx, Allocation).createQueryBuilder('movement')
            .leftJoinAndSelect('movement.orderLine', 'line')
            .where('line.id IN (:...ids)', { ids: orders.flatMap(o => o.lines.map(l => l.id)).length ? orders.flatMap(o => o.lines.map(l => l.id)) : [-1] })
            .getMany();
        const shelfRows = await this.connection.getRepository(ctx, WarehouseShelf).find({ where: { channel: { id: profile.channel.id }, active: true }, relations: ['stockLocation'] });
        const scanRows = await this.connection.getRepository(ctx, WarehousePickScan).find({ where: orders.length ? orders.map(o => ({ orderId: Number(o.id) })) : [{ orderId: -1 }] });
        return orders.map(order => ({
            id: order.id, code: order.code, state: order.state,
            lines: order.lines.filter(line => !line.sellerChannelId || String(line.sellerChannelId) === String(profile.channel.id)).map(line => {
                const shelves = shelfRows.map(shelf => ({
                    shelfId: shelf.id, code: shelf.code,
                    quantity: allocations.filter(a => String(a.orderLine.id) === String(line.id) && String(a.stockLocationId) === String(shelf.stockLocation.id)).reduce((n, a) => n + a.quantity, 0),
                    scanned: scanRows.filter(s => s.orderLineId === Number(line.id) && s.stockLocationId === Number(shelf.stockLocation.id)).length,
                })).filter(shelf => shelf.quantity > 0);
                return { id: line.id, variantId: line.productVariantId, sku: line.productVariant.sku, quantity: line.quantity,
                    scanned: scanRows.filter(s => s.orderLineId === Number(line.id)).length, shelves,
                    unlocated: Math.max(0, line.quantity - shelves.reduce((sum, shelf) => sum + shelf.quantity, 0)),
                };
            }),
        })).filter(order => order.lines.length > 0);
    }

    async scan(ctx: RequestContext, input: ScanInput) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO']);
        const shelf = await this.shelf(ctx, profile, input.shelfId);
        const line = await this.connection.getRepository(ctx, OrderLine).findOne({
            where: { id: input.orderLineId }, relations: ['order', 'order.channels', 'productVariant'],
        });
        if (!line || !line.order.channels.some(channel => String(channel.id) === String(profile.channel.id)) ||
            (line.sellerChannelId && String(line.sellerChannelId) !== String(profile.channel.id))) throw new ForbiddenError();
        if (!['PaymentSettled', 'PartiallyFulfilled'].includes(line.order.state)) throw new UserInputError('El pedido aún no está habilitado para alistamiento.');
        const label = await this.labelCodes.resolve(ctx, input.code);
        if (label.productVariantId !== Number(line.productVariantId)) throw new UserInputError('La etiqueta no corresponde a la variante de este pedido.');
        const scannedCode = label.code;
        if (await this.connection.getRepository(ctx, WarehousePickScan).findOne({ where: { scanCode: scannedCode } })) throw new UserInputError('Esta etiqueta ya fue utilizada para validar un par.');
        await this.connection.getRepository(ctx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [Number(line.id), Number(shelf.stockLocation.id)]);
        const allocated = await this.connection.getRepository(ctx, Allocation).find({ where: { orderLine: { id: line.id }, stockLocationId: shelf.stockLocation.id } });
        const expected = allocated.reduce((n, movement) => n + movement.quantity, 0);
        const scanned = await this.connection.getRepository(ctx, WarehousePickScan).count({ where: { orderLineId: Number(line.id), stockLocationId: Number(shelf.stockLocation.id) } });
        if (!expected || scanned >= expected || scanned >= line.quantity) throw new UserInputError('Esta percha ya tiene completos los pares asignados al pedido.');
        const saved = await this.connection.getRepository(ctx, WarehousePickScan).save(new WarehousePickScan({
            scanCode: scannedCode,
            labelCodeId: Number(label.id),
            orderId: Number(line.order.id), orderLineId: Number(line.id), productVariantId: Number(line.productVariantId),
            stockLocationId: Number(shelf.stockLocation.id), actorUserId: Number(ctx.activeUserId),
        }));
        return { id: saved.id, scanned: scanned + 1, expected, shelfCode: shelf.code };
    }

    async kardex(ctx: RequestContext, filter: { from?: string; to?: string; type?: string; sku?: string; userId?: ID; skip?: number; take?: number }) {
        const profile = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR']);
        const skip = Math.min(1000000, Math.max(0, Number(filter.skip) || 0));
        const take = Math.min(100, Math.max(1, Number(filter.take) || 30));
        const params: unknown[] = [profile.channel.id];
        const predicates: string[] = [];
        if (filter.from) { params.push(filter.from); predicates.push(`m."createdAt" >= $${params.length}::timestamptz`); }
        if (filter.to) { params.push(filter.to); predicates.push(`m."createdAt" < ($${params.length}::date + interval '1 day')`); }
        if (filter.type) { params.push(filter.type); predicates.push(`m."type" = $${params.length}`); }
        if (filter.sku) { params.push(`%${filter.sku.trim()}%`); predicates.push(`(v."sku" ILIKE $${params.length} OR product."customFieldsCodigo" ILIKE $${params.length})`); }
        if (filter.userId) { params.push(Number(filter.userId)); predicates.push(`note."actorUserId" = $${params.length}`); }
        params.push(take, skip);
        const rows = await this.connection.getRepository(ctx, WarehouseMovementNote).query(`
            WITH history AS (
                SELECT movement.*, COALESCE(SUM(CASE movement."type" WHEN 'ADJUSTMENT' THEN movement."quantity" WHEN 'SALE' THEN -movement."quantity" WHEN 'CANCELLATION' THEN movement."quantity" ELSE 0 END)
                    OVER (PARTITION BY movement."productVariantId", movement."stockLocationId" ORDER BY movement."createdAt" DESC, movement."id" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS later_physical,
                    COALESCE(SUM(CASE movement."type" WHEN 'ALLOCATION' THEN movement."quantity" WHEN 'RELEASE' THEN -movement."quantity" WHEN 'SALE' THEN -movement."quantity" ELSE 0 END)
                    OVER (PARTITION BY movement."productVariantId", movement."stockLocationId" ORDER BY movement."createdAt" DESC, movement."id" DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS later_allocated
                FROM "stock_movement" movement
            )
            SELECT m."id", m."createdAt", m."type", m."quantity", v."sku", product."customFieldsCodigo" AS "modelCode", m."productVariantId" AS "variantId",
                m."orderLineId", COALESCE(shelf."code", location."name") AS "locationCode",
                note."actorUserId", COALESCE(NULLIF(TRIM(CONCAT_WS(' ', admin."firstName", admin."lastName")), ''), actor."identifier", 'Sistema') AS "actorName",
                note."operation", note."reason",
                COALESCE(level."stockOnHand", 0) - m.later_physical AS "onHandAfter",
                COALESCE(level."stockAllocated", 0) - m.later_allocated AS "allocatedAfter",
                COUNT(*) OVER() AS "totalItems"
            FROM history m
            JOIN "stock_location" location ON location."id" = m."stockLocationId"
            JOIN "stock_location_channels_channel" lc ON lc."stockLocationId" = location."id" AND lc."channelId" = $1
            JOIN "product_variant" v ON v."id" = m."productVariantId"
            JOIN "product" product ON product."id" = v."productId"
            LEFT JOIN "stock_level" level ON level."stockLocationId" = m."stockLocationId" AND level."productVariantId" = m."productVariantId"
            LEFT JOIN "warehouse_shelf" shelf ON shelf."stockLocationId" = location."id" AND shelf."channelId" = $1
            LEFT JOIN "warehouse_movement_note" note ON note."stockMovementId" = m."id"
            LEFT JOIN "administrator" admin ON admin."userId" = note."actorUserId"
            LEFT JOIN "user" actor ON actor."id" = note."actorUserId"
            ${predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''}
            ORDER BY m."createdAt" DESC, m."id" DESC LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);
        return { totalItems: rows.length ? Number(rows[0].totalItems) : 0, items: rows.map((row: Record<string, unknown>) => ({
            ...row, id: String(row.id), variantId: String(row.variantId), orderLineId: row.orderLineId && String(row.orderLineId),
            quantity: Number(row.quantity), actorUserId: row.actorUserId && String(row.actorUserId),
            onHandAfter: Number(row.onHandAfter), allocatedAfter: Number(row.allocatedAfter), totalItems: undefined,
        })) };
    }

    async kardexActors(ctx: RequestContext) {
        const scope = await this.actor(ctx, ['ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR']);
        const rows = await this.connection.getRepository(ctx, WarehouseMovementNote).query(`
            SELECT DISTINCT note."actorUserId" AS "id",
                COALESCE(NULLIF(TRIM(CONCAT_WS(' ', admin."firstName", admin."lastName")), ''), actor."identifier", 'Usuario ' || note."actorUserId") AS "name"
            FROM "warehouse_movement_note" note
            JOIN "stock_movement" movement ON movement."id" = note."stockMovementId"
            JOIN "stock_location_channels_channel" lc ON lc."stockLocationId" = movement."stockLocationId" AND lc."channelId" = $1
            LEFT JOIN "administrator" admin ON admin."userId" = note."actorUserId"
            LEFT JOIN "user" actor ON actor."id" = note."actorUserId"
            WHERE note."actorUserId" > 0 ORDER BY "name"
        `, [scope.channel.id]);
        return rows.map((row: { id: number; name: string }) => ({ id: String(row.id), name: row.name }));
    }
}
