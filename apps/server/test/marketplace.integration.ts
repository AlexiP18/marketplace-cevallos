import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bootstrapWorker, runMigrations, ChannelService, CustomerService, OrderService, ProductService, ProductVariantService, RequestContextService, ShippingMethod, StockLevel, StockLocationService, TransactionalConnection, User, isGraphQlErrorResult } from '@vendure/core';
import { Queue, QueueEvents } from 'bullmq';
import * as XLSX from 'xlsx';
import { config } from '../src/vendure-config';
import { MarketplacePlugin } from '../src/plugins/marketplace/marketplace.plugin';
import { LabelingPlugin } from '../src/plugins/labeling/labeling.plugin';
import { StatisticsPlugin } from '../src/plugins/statistics/statistics.plugin';
import { MarketplaceFileService } from '../src/plugins/marketplace/marketplace-file.service';
import { ReservationService } from '../src/plugins/marketplace/reservation.service';
import { MarketplaceReservation } from '../src/plugins/marketplace/marketplace-reservation.entity';
import { SellerProfile } from '../src/plugins/multivendor/entities/seller-profile.entity';
import { SellerProfileService } from '../src/plugins/multivendor/services/seller-profile.service';
import { LabelCode } from '../src/plugins/labeling/entities/label-code.entity';
import { LabelCodeService } from '../src/plugins/labeling/services/label-code.service';
import { randomUUID } from 'node:crypto';
import bwipjs from 'bwip-js';
import sharp from 'sharp';
import jsqr from 'jsqr';
import { Allocation, ProductVariant } from '@vendure/core';
import { WarehouseService } from '../src/plugins/warehouse/services/warehouse.service';
import { WarehouseShelf } from '../src/plugins/warehouse/entities/warehouse-shelf.entity';
import { WarehousePickScan } from '../src/plugins/warehouse/entities/warehouse-pick-scan.entity';
import { assertReservationBeforePayment } from '../src/plugins/marketplace/marketplace-strategies';

async function main() {
    const database = process.env.MARKETPLACE_TEST_DB || '';
    assert.match(database, /^vendure_mq_test_\d+$/, 'Solo se permite una base temporal de prueba');
    assert.ok(process.env.REDIS_PREFIX?.startsWith('mq-test-'));
    (config.dbConnectionOptions as any).database = database;
    const files = await mkdtemp(path.join(os.tmpdir(), 'vendure-mq-'));
    MarketplacePlugin.options.privateFiles = files;
    LabelingPlugin.options.privateFiles = files;
    StatisticsPlugin.options.privateFiles = files;
    const sellerStrategy = config.orderOptions!.orderSellerStrategy!;
    const validateTotals = sellerStrategy.afterSellerOrdersCreated!.bind(sellerStrategy);
    sellerStrategy.afterSellerOrdersCreated = async (ctx, aggregate, children) => {
        try { await validateTotals(ctx, aggregate, children); }
        catch (error) {
            console.error('Totales de prueba', aggregate.totalWithTax, children.map(child => ({ total: child.totalWithTax, shipping: child.shippingWithTax, lines: child.lines.map(line => ({ price: line.unitPriceWithTax, quantity: line.quantity })) })));
            throw error;
        }
    };
    await runMigrations(config);
    const worker = await bootstrapWorker(config);
    await worker.startJobQueue();
    const app = worker.app;
    const connection = app.get(TransactionalConnection);
    const orders = app.get(OrderService);
    const reservations = app.get(ReservationService);
    const fileService = app.get(MarketplaceFileService);
    const queues: Queue[] = [];
    const events: QueueEvents[] = [];
    try {
        const user = await connection.rawConnection.getRepository(User).findOneOrFail({ where: { identifier: process.env.SUPERADMIN_USERNAME }, relations: ['roles', 'roles.channels'] });
        const defaultChannel = await app.get(ChannelService).getDefaultChannel();
        const ctx = await app.get(RequestContextService).create({ apiType: 'admin', channelOrToken: defaultChannel, user });
        const variants = await connection.rawConnection.query(`SELECT DISTINCT ON (sp."channelId") v.id, sp."channelId" AS channel FROM product_variant v
            JOIN product_variant_channels_channel vc ON vc."productVariantId" = v.id JOIN seller_profile sp ON sp."channelId" = vc."channelId"
            JOIN product p ON p.id = v."productId" WHERE v.enabled = true AND p.enabled = true AND v."deletedAt" IS NULL AND sp.status = 'ACTIVE' ORDER BY sp."channelId", v.id LIMIT 2`);
        assert.equal(variants.length, 2, 'La copia de prueba necesita variantes de dos almacenes activos');
        const shipping = await connection.getRepository(ctx, ShippingMethod).createQueryBuilder('s').innerJoin('s.channels', 'c', 'c.id = :id', { id: defaultChannel.id }).getOne();
        assert.ok(shipping, 'Hace falta un método de envío de prueba');
        for (const variant of variants) {
            await connection.rawConnection.query('UPDATE stock_level SET "stockOnHand" = 0, "stockAllocated" = 0 WHERE "productVariantId" = $1', [variant.id]);
            const channel = await app.get(ChannelService).findOne(ctx, variant.channel);
            const sellerCtx = ctx.copy(); (sellerCtx as any)._channel = channel;
            const location = await app.get(StockLocationService).create(sellerCtx, { name: 'Fixture de concurrencia' });
            await connection.getRepository(sellerCtx, WarehouseShelf).save(new WarehouseShelf({ code: `MQ-${Date.now()}-${variant.id}`, description: 'Fixture de concurrencia', active: true, channel: channel!, stockLocation: location }));
            await connection.getRepository(ctx, StockLevel).save({ productVariantId: variant.id, stockLocationId: location.id, stockOnHand: 1, stockAllocated: 0 });
            await connection.rawConnection.query('UPDATE product_variant SET "trackInventory" = \'TRUE\', "useGlobalOutOfStockThreshold" = false, "outOfStockThreshold" = 0 WHERE id = $1', [variant.id]);
        }
        const customer = await app.get(CustomerService).create(ctx, { firstName: 'Prueba', lastName: 'Marketplace', emailAddress: `mq-${Date.now()}@example.invalid` });
        assert.ok(!isGraphQlErrorResult(customer));
        async function cart(ids: number[]) {
            return connection.withTransaction(ctx, async tx => {
                const order = await orders.create(tx);
                await orders.addCustomerToOrder(tx, order.id, customer as any);
                for (const id of ids) {
                    const result = await orders.addItemToOrder(tx, order.id, id, 1);
                    if (isGraphQlErrorResult(result)) throw new Error(result.message);
                }
                await orders.setShippingAddress(tx, order.id, { fullName: 'Prueba Marketplace', streetLine1: 'Dirección de prueba', city: 'Quito', countryCode: 'EC' });
                const shippingResult = await orders.setShippingMethod(tx, order.id, [shipping!.id]);
                if (isGraphQlErrorResult(shippingResult)) throw new Error(shippingResult.message);
                return order.id;
            });
        }
        const first = await cart([variants[0].id]);
        const second = await cart([variants[0].id]);
        const options = { connection: MarketplacePlugin.options.redis, prefix: MarketplacePlugin.options.queuePrefix };
        const queue = new Queue('marketplace-checkout', options); queues.push(queue);
        const event = new QueueEvents('marketplace-checkout', options); events.push(event); await event.waitUntilReady();
        const [a, b] = await connection.withTransaction(ctx, async tx => {
            await connection.getRepository(tx, StockLevel).query('SELECT pg_advisory_xact_lock($1, $2)', [variants[0].id, 0]);
            const a = await queue.add('reserve', { ctx: ctx.serialize(), orderId: first, sessionId: String(ctx.session?.id) });
            const b = await queue.add('reserve', { ctx: ctx.serialize(), orderId: second, sessionId: String(ctx.session?.id) });
            for (let attempt = 0; attempt < 100 && await a.getState() !== 'active'; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
            assert.equal(await a.getState(), 'active');
            await new Promise(resolve => setTimeout(resolve, 200));
            assert.equal((await connection.rawConnection.query('SELECT SUM("stockAllocated")::int AS allocated FROM stock_level WHERE "productVariantId" = $1', [variants[0].id]))[0].allocated, 0, 'La reserva debe esperar a que termine la operación física de bodega');
            return [a, b];
        });
        const results = await Promise.allSettled([a.waitUntilFinished(event, 60000), b.waitUntilFinished(event, 60000)]);
        assert.equal(results[0].status, 'fulfilled', `FIFO: debe ganar la primera solicitud (${results[0].status === 'rejected' ? results[0].reason.message : ''})`);
        assert.equal(results[1].status, 'rejected', 'El segundo comprador no debe reservar el mismo par');
        assert.match((results[1] as PromiseRejectedResult).reason.message, /INSUFFICIENT_STOCK/);
        const levels = await connection.rawConnection.query('SELECT SUM("stockAllocated")::int AS allocated FROM stock_level WHERE "productVariantId" = $1', [variants[0].id]);
        assert.equal(levels[0].allocated, 1);
        let prepared=await reservations.status(ctx,a.id!,true);
        for(let attempt=0;prepared.state==='preparing' && attempt<60;attempt++) prepared=await reservations.status(ctx,a.id!,true);
        assert.equal(prepared.state,'completed',JSON.stringify(prepared));
        const child = await connection.rawConnection.getRepository(MarketplaceReservation).findOneByOrFail({ aggregateOrderId: Number(first) });
        const expirationQueue = new Queue('marketplace-expiration', options); queues.push(expirationQueue);
        const childExpiration=await expirationQueue.getJob(`reservation-${child.orderId}`);
        assert.ok(childExpiration);
        assert.ok(Math.abs(childExpiration.timestamp+childExpiration.delay-child.expiresAt.getTime())<100,'La preparación no debe extender el vencimiento original de 45 minutos');
        await connection.rawConnection.getRepository(MarketplaceReservation).update(child.id, { expiresAt: new Date(Date.now() - 1000) });
        await reservations.expire(child.orderId);
        const released = await connection.rawConnection.query('SELECT SUM("stockAllocated")::int AS allocated FROM stock_level WHERE "productVariantId" = $1', [variants[0].id]);
        assert.equal(released[0].allocated, 0, 'La expiración debe liberar la reserva');
        assert.equal((await orders.findOne(ctx, first))?.active, false, 'La reserva vencida no debe bloquear un carrito nuevo');
        const multi = await cart(variants.map((variant: any) => variant.id));
        await reservations.reserve(ctx, multi);
        const children = await orders.getSellerOrders(ctx, (await orders.findOne(ctx, multi))!);
        assert.equal(children.length, 2, 'Se debe crear una suborden por almacén');
        await connection.withTransaction(ctx, async tx => {
            const paid = await orders.addManualPaymentToOrder(tx, { orderId: children[0].id, method: 'test-only', transactionId: 'test', metadata: {} });
            if (isGraphQlErrorResult(paid)) throw new Error(paid.message);
        });
        assert.equal((await orders.findOne(ctx, children[0].id))?.state, 'PaymentSettled');
        assert.equal(await expirationQueue.getJob(`reservation-${children[0].id}`), undefined, 'Pagar debe retirar la tarea diferida');
        assert.equal((await orders.findOne(ctx, children[1].id))?.state, 'ArrangingPayment');
        const pending = await connection.rawConnection.getRepository(MarketplaceReservation).findOneByOrFail({ orderId: Number(children[1].id) });
        await connection.rawConnection.getRepository(MarketplaceReservation).update(pending.id, { expiresAt: new Date(Date.now() - 1000) });
        await assert.rejects(connection.withTransaction(ctx, tx => orders.addManualPaymentToOrder(tx, { orderId: children[1].id, method: 'test-only', transactionId: 'late', metadata: {} })), /expir/);
        await reservations.expire(Number(children[1].id));
        assert.equal((await orders.findOne(ctx, children[0].id))?.state, 'PaymentSettled', 'Expirar una suborden no debe cancelar la pagada');
        await connection.rawConnection.getRepository(MarketplaceReservation).update({ orderId: Number(children[0].id) }, { expiresAt: new Date(Date.now() - 1000) });
        await reservations.expire(Number(children[0].id));
        assert.equal((await connection.rawConnection.getRepository(MarketplaceReservation).findOneByOrFail({ orderId: Number(children[0].id) })).status, 'PAID');
        for (const variant of variants) await connection.rawConnection.query('UPDATE stock_level SET "stockOnHand" = "stockOnHand" + 5 WHERE "productVariantId" = $1', [variant.id]);
        const aggregate = await cart(variants.map((variant: any) => variant.id));
        await reservations.reserve(ctx, aggregate);
        await connection.withTransaction(ctx, async tx => {
            await connection.getRepository(tx, MarketplaceReservation).update({ aggregateOrderId: Number(aggregate) }, { expiresAt: new Date(Date.now() + 1000) });
            await assertReservationBeforePayment(tx, (await orders.findOne(tx, aggregate))!);
            await new Promise(resolve => setTimeout(resolve, 1100));
            const result = await orders.addManualPaymentToOrder(tx, { orderId: aggregate, method: 'test-only', transactionId: 'aggregate', metadata: {} });
            if (isGraphQlErrorResult(result)) throw new Error(result.message);
        });
        const paidChildren = await orders.getSellerOrders(ctx, (await orders.findOne(ctx, aggregate))!);
        assert.ok(paidChildren.every(child => child.state === 'PaymentSettled'), 'El pago iniciado dentro de plazo debe habilitar las subórdenes aunque la pasarela responda después del límite');
        const fileQueue = new Queue('marketplace-files', options); queues.push(fileQueue);
        const fileEvent = new QueueEvents('marketplace-files', options); events.push(fileEvent); await fileEvent.waitUntilReady();
        const reportJob = await fileService.report(ctx, new Date('2026-01-01'), new Date('2026-12-31'));
        const report = await (await fileQueue.getJob(reportJob.id!))!.waitUntilFinished(fileEvent, 60000);
        const book = XLSX.read(await readFile(path.join(files, report.name)));
        assert.deepEqual(book.SheetNames, ['Ventas', 'Inventario', 'Rotacion']);
        assert.ok(!XLSX.utils.sheet_to_csv(book.Sheets.Inventario).includes('sku'), 'El consolidado no debe revelar SKU');
        const seller = await connection.rawConnection.getRepository(SellerProfile).findOneOrFail({ where: { channel: { id: variants[0].channel } }, relations: ['channel', 'administrator.user.roles.channels'] });
        const sellerCtx = await app.get(RequestContextService).create({ apiType: 'admin', channelOrToken: (await app.get(ChannelService).findOne(ctx, seller.channel.id))!, user: seller.administrator.user });
        const qrTexts: string[] = [];
        const originalBuffer = bwipjs.toBuffer.bind(bwipjs);
        (bwipjs as any).toBuffer = async (options: any) => {
            const buffer = await originalBuffer(options);
            if (options.bcid === 'qrcode') {
                assert.equal(options.eclevel, 'M');
                const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const decoded = jsqr(new Uint8ClampedArray(data), info.width, info.height);
                assert.equal(decoded?.data, options.text);
                qrTexts.push(decoded!.data);
            }
            return buffer;
        };
        const labelJob = await fileService.labels(sellerCtx, { draft: { name: 'Prueba', widthMm: 70, heightMm: 40, design: JSON.stringify({ objects: [{ type: 'textbox', text: '{{codigo}}', width: 200, fontSize: 20, left: 10, top: 10 }, { type: 'rect', width: 50, height: 50, data: { field: 'qr', grid: { fromColumn: 0, toColumn: 3, fromRow: 2, toRow: 5 } } }, { type: 'rect', width: 150, height: 40, data: { field: 'barcode', grid: { fromColumn: 0, toColumn: 11, fromRow: 6, toRow: 7 } } }] }) }, items: [{ variantId: variants[0].id, quantity: 24, copiesPerPair: 2 }], layout: { paper: 'a4', columns: 2, rows: 4, marginLeftMm: 0, marginRightMm: 0, marginTopMm: 0, marginBottomMm: 0 } });
        const queuedLabels = (await fileQueue.getJob(labelJob.id!))!;
        let label: any;
        try { label = await queuedLabels.waitUntilFinished(fileEvent, 60000); }
        finally { (bwipjs as any).toBuffer = originalBuffer; }
        const batchId = queuedLabels.data.input.batchCode;
        const issued = await connection.rawConnection.getRepository(LabelCode).find({ where: { batchId }, order: { pairIndex: 'ASC' } });
        assert.equal(issued.length, 12, 'Dos copias de cada par deben compartir una emisión');
        assert.equal(label.labels, 24);
        assert.equal(label.pages, 3);
        assert.equal(new Set(issued.map(code => code.code)).size, 12);
        assert.ok(issued.every(code => code.ready && /^SBX1:[a-f0-9-]{36}$/.test(code.code)));
        assert.deepEqual(qrTexts, issued.map(code => code.code));
        const codes = app.get(LabelCodeService);
        assert.equal(await codes.issue(sellerCtx, variants[0].id, batchId, 0), issued[0].code, 'Un reintento debe conservar el QR');
        await connection.withTransaction(sellerCtx, async tx => assert.equal((await codes.resolve(tx, issued[0].code)).productVariantId, variants[0].id));
        const otherCtx = sellerCtx.copy(); (otherCtx as any)._channel = await app.get(ChannelService).findOne(ctx, variants[1].channel);
        await assert.rejects(connection.withTransaction(otherCtx, tx => codes.resolve(tx, issued[0].code)), /no está emitida/);
        const pendingCode = await codes.issue(sellerCtx, variants[0].id, randomUUID(), 0);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => codes.resolve(tx, pendingCode)), /no está emitida/);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => codes.resolve(tx, `SBX1:${randomUUID()}`)), /no está emitida/);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => codes.resolve(tx, `PV:${variants[0].id}:${randomUUID()}`)), /etiquetas anteriores/);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => connection.getRepository(tx, LabelCode).query('INSERT INTO label_code (code, "batchId", "pairIndex", "productVariantId", "channelId") VALUES ($1,$2,0,$3,$4)', [issued[0].code, randomUUID(), variants[0].id, sellerCtx.channelId])), /label_code_public_unique/);
        const paidReservation = await connection.rawConnection.getRepository(MarketplaceReservation).findOneByOrFail({ aggregateOrderId: Number(aggregate), channelId: Number(sellerCtx.channelId) });
        const paidLine = (await orders.findOne(sellerCtx, paidReservation.orderId, ['lines.productVariant']))!.lines[0];
        const allocation = await connection.getRepository(sellerCtx, Allocation).findOneOrFail({ where: { orderLine: { id: paidLine.id } }, relations: ['stockLocation'] });
        const shelf = await connection.getRepository(sellerCtx, WarehouseShelf).findOneOrFail({ where: { stockLocation: { id: allocation.stockLocation.id } } });
        const scans = await Promise.allSettled([0, 1].map(() => connection.withTransaction(sellerCtx, tx => app.get(WarehouseService).scan(tx, { orderLineId: paidLine.id, shelfId: shelf.id, code: issued[0].code }))));
        assert.equal(scans.filter(result => result.status === 'fulfilled').length, 1, 'Solo una lectura simultánea puede consumir la etiqueta');
        assert.match((scans.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.message, /ya fue utilizada/);
        assert.equal((await connection.getRepository(sellerCtx, WarehousePickScan).findOneByOrFail({ scanCode: issued[0].code })).labelCodeId, issued[0].id);
        await assert.rejects(fileService.download(ctx, labelJob.id!), /Forbidden|prohib|permi/i);
        assert.equal((await readFile(path.join(files, label.name))).subarray(0, 4).toString(), '%PDF');
        const ownReportJob = await fileService.report(sellerCtx, new Date('2026-01-01'), new Date('2026-12-31'));
        const ownReport = await (await fileQueue.getJob(ownReportJob.id!))!.waitUntilFinished(fileEvent, 60000);
        const ownBook = XLSX.read(await readFile(path.join(files, ownReport.name)));
        assert.ok(XLSX.utils.sheet_to_csv(ownBook.Sheets.Inventario).includes('sku'));
        const variantsService = app.get(ProductVariantService);
        const skuProducts = [];
        for (let index = 0; index < 2; index++) skuProducts.push(await app.get(ProductService).create(sellerCtx, { translations: [{ languageCode: sellerCtx.languageCode, name: 'Prueba SKU', slug: `sku-${Date.now()}-${index}`, description: '' }] }));
        const created = (await Promise.all(skuProducts.map((product, index) => connection.withTransaction(sellerCtx, tx => variantsService.create(tx, [{ productId: product.id, sku: index ? '' : 'PROVISIONAL-REPETIDO', price: 100, translations: [{ languageCode: sellerCtx.languageCode, name: 'Variante de prueba' }] }]))))).flat();
        assert.ok(created.every(variant => /^PV-[A-F0-9]{32}$/.test(variant.sku)));
        assert.notEqual(created[0].sku, created[1].sku);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => variantsService.update(tx, [{ id: created[0].id, sku: 'SKU-MODIFICADO' }])), /no se puede modificar/);
        const columns = connection.rawConnection.getMetadata(ProductVariant).columns.filter(column => !column.isGenerated).map(column => `"${column.databaseName}"`).join(',');
        await assert.rejects(connection.withTransaction(sellerCtx, tx => connection.getRepository(tx, ProductVariant).query(`INSERT INTO product_variant (${columns}) SELECT ${columns} FROM product_variant WHERE id = $1`, [created[0].id])), /product_variant_sku_unique/);
        assert.equal((await variantsService.findOne(sellerCtx, created[0].id))!.sku, created[0].sku);
        await assert.rejects(connection.withTransaction(ctx, tx => variantsService.assignProductVariantsToChannel(tx, { productVariantIds: [variants[0].id], channelId: variants[1].channel })), /único|compartir/);
        const variant = (await variantsService.findOne(sellerCtx, variants[0].id))!;
        await connection.withTransaction(sellerCtx, tx => variantsService.update(tx, [{ id: variant.id, price: variant.price + 1 }]));
        assert.equal((await variantsService.findOne(ctx, variant.id))?.price, (await variantsService.findOne(sellerCtx, variant.id))?.price, 'El precio público debe reflejar el del propietario');
        const products = app.get(ProductService);
        const intentionallyDisabled = await products.create(sellerCtx, { enabled: false, translations: [{ languageCode: sellerCtx.languageCode, name: 'Control desactivado', slug: `disabled-${Date.now()}`, description: '' }] });
        await app.get(SellerProfileService).suspend(ctx, seller.id, 'Prueba de aislamiento');
        assert.equal((await products.findOne(ctx, variant.productId))?.enabled, false);
        await app.get(SellerProfileService).approve(ctx, seller.id);
        assert.equal((await products.findOne(ctx, variant.productId))?.enabled, true);
        assert.equal((await products.findOne(ctx, intentionallyDisabled.id))?.enabled, false);
        console.log('Marketplace: FIFO, no sobreventa, expiración, división, pago independiente, Excel y PDF correctos.');
    } finally {
        await Promise.all(events.map(event => event.close()));
        await Promise.all(queues.map(queue => queue.close()));
        await app.close();
        await rm(files, { recursive: true, force: true });
    }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1); });
