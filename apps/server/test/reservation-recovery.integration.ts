import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Queue } from 'bullmq';
import { bootstrap, runMigrations, ChannelService, CustomerService, OrderService, ProductService, ProductVariantService, RequestContextService, ShippingMethod, StockLevel, TransactionalConnection, User, isGraphQlErrorResult } from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { ReservationService } from '../src/plugins/marketplace/reservation.service';
import { MarketplaceReservation } from '../src/plugins/marketplace/marketplace-reservation.entity';
import { MarketplaceCheckoutHold } from '../src/plugins/marketplace/marketplace-checkout-hold.entity';
import { WarehouseService } from '../src/plugins/warehouse/services/warehouse.service';
import { LabelCodeService } from '../src/plugins/labeling/services/label-code.service';

// Runs against a disposable database, Redis volume and actual Vendure Worker container.
loadEnv({ quiet: true });
const stamp = Date.now();
const database = `vendure_mq_test_${stamp}`;
const prefix = `mq-test-${database}`;
const network = `vendure-recovery-${stamp}`;
const redisName = `${network}-redis`;
const workerName = `${network}-worker`;
const volume = `${network}-data`;
const postgres = 'vendure-prueba-postgres_db-1';
const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until(check: () => Promise<boolean>, message: string, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await check()) return; await sleep(250); }
    throw new Error(message);
}
async function freePort() {
    const server = net.createServer();
    await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
    const port = (server.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
}
async function main() {
    assert.equal(process.env.APP_ENV, 'dev', 'Esta prueba requiere el entorno local de desarrollo');
    const image = process.env.WORKER_TEST_IMAGE || 'vendure-prueba-server';
    const serverRoot = path.resolve(__dirname, '..');
    const dist = path.join(serverRoot, 'dist');
    assert.ok(existsSync(path.join(dist, 'index-worker.js')), 'Compila el backend antes de ejecutar la prueba');
    docker('image', 'inspect', image, '--format', '{{.Id}}');
    const dbUser = process.env.DB_USERNAME!;
    const sourceDatabase = process.env.DB_NAME!;
    const temp = await mkdtemp(path.join(os.tmpdir(), 'vendure-recovery-'));
    let app: Awaited<ReturnType<typeof bootstrap>> | undefined;
    let queue: Queue | undefined;
    let checkout:Queue|undefined,preparation:Queue|undefined;
    let databaseCreated = false;
    try {
        docker('exec', postgres, 'createdb', '-U', dbUser, database);
        databaseCreated = true;
        const dump = execFileSync('docker', ['exec', postgres, 'pg_dump', '-U', dbUser, sourceDatabase], { maxBuffer: 100 * 1024 * 1024 });
        const restore = spawnSync('docker', ['exec', '-i', postgres, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', dbUser, '-d', database], { input: dump, maxBuffer: 100 * 1024 * 1024 });
        assert.equal(restore.status, 0, 'No se pudo crear la copia de prueba');
        const redisPort = await freePort();
        docker('network', 'create', network);
        docker('run', '-d', '--name', redisName, '--network', network, '--network-alias', 'redis', '-p', `127.0.0.1:${redisPort}:6379`, '--mount', `type=volume,source=${volume},target=/data`, 'redis:7-alpine', 'redis-server', '--appendonly', 'yes', '--appendfsync', 'everysec', '--maxmemory-policy', 'noeviction');
        Object.assign(process.env, { TZ: 'America/Guayaquil', DB_NAME: database, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(redisPort), REDIS_PREFIX: prefix, JWT_SECRET: randomUUID() + randomUUID(), RESERVATION_TTL_MINUTES: '45' });
        const { config } = require('../src/vendure-config') as typeof import('../src/vendure-config');
        config.apiOptions.port = 0;
        await runMigrations(config);
        app = await bootstrap(config);
        const connection = app.get(TransactionalConnection);
        const orders = app.get(OrderService);
        const reservations = app.get(ReservationService);
        const warehouse = app.get(WarehouseService);
        const channels = app.get(ChannelService);
        const user = await connection.rawConnection.getRepository(User).findOneOrFail({ where: { identifier: process.env.SUPERADMIN_USERNAME }, relations: ['roles.channels'] });
        const defaultChannel = await channels.getDefaultChannel();
        const ctx = await app.get(RequestContextService).create({ apiType: 'admin', channelOrToken: defaultChannel, user });
        const [seller] = await connection.rawConnection.query('SELECT "channelId" AS id FROM seller_profile WHERE status = $1 ORDER BY id LIMIT 1', ['ACTIVE']);
        assert.ok(seller, 'Hace falta un vendedor activo en la copia de prueba');
        const sellerCtx = ctx.copy(); (sellerCtx as any)._channel = await channels.findOne(ctx, seller.id);
        const product = await app.get(ProductService).create(sellerCtx, { translations: [{ languageCode: ctx.languageCode, name: 'Prueba de recuperación', slug: `recovery-${stamp}`, description: '' }] });
        const [variant] = await app.get(ProductVariantService).create(sellerCtx, [{ productId: product.id, price: 1000, sku: '', trackInventory: GlobalFlag.TRUE, useGlobalOutOfStockThreshold: false, outOfStockThreshold: 0, translations: [{ languageCode: ctx.languageCode, name: 'Par de prueba' }] }]);
        const shelf = await connection.withTransaction(sellerCtx, tx => warehouse.createShelf(tx, { code: `REC-${stamp}` }));
        await connection.withTransaction(sellerCtx, tx => warehouse.receive(tx, { variantId: variant.id, shelfId: shelf.id, quantity: 2, reason: 'Recepción de prueba de resiliencia' }));
        const level = () => connection.getRepository(sellerCtx, StockLevel).findOneByOrFail({ productVariantId: variant.id, stockLocationId: shelf.stockLocationId });
        assert.equal((await level()).stockOnHand, 2);
        const receipt = (await warehouse.kardex(sellerCtx, { sku: variant.sku })).items.find((row: any) => row.operation === 'RECEPCION');
        assert.equal(receipt?.actorUserId, String(user.id));
        const customer = await app.get(CustomerService).create(ctx, { firstName: 'Prueba', lastName: 'Recuperación', emailAddress: `recovery-${stamp}@example.invalid` });
        assert.ok(!isGraphQlErrorResult(customer));
        const shipping = await connection.getRepository(ctx, ShippingMethod).createQueryBuilder('s').innerJoin('s.channels', 'c', 'c.id = :id', { id: defaultChannel.id }).getOne();
        assert.ok(shipping);
        async function cart() {
            return connection.withTransaction(ctx, async tx => {
                const order = await orders.create(tx);
                await orders.addCustomerToOrder(tx, order.id, customer as any);
                const added = await orders.addItemToOrder(tx, order.id, variant.id, 1);
                if (isGraphQlErrorResult(added)) throw new Error(added.message);
                await orders.setShippingAddress(tx, order.id, { fullName: 'Prueba de recuperación', streetLine1: 'Dirección de prueba', city: 'Quito', countryCode: 'EC' });
                const result = await orders.setShippingMethod(tx, order.id, [shipping!.id]);
                if (isGraphQlErrorResult(result)) throw new Error(result.message);
                return order.id;
            });
        }
        queue = new Queue('marketplace-expiration', { connection: { host: '127.0.0.1', port: redisPort, maxRetriesPerRequest: null }, prefix });
        const first = await cart();
        await reservations.reserve(ctx, first);
        const record = await connection.getRepository(ctx, MarketplaceReservation).findOneByOrFail({ aggregateOrderId: Number(first) });
        const job = await queue.getJob(`reservation-${record.orderId}`);
        assert.ok(job); assert.equal(job.opts.delay, 2700000); assert.equal((await level()).stockAllocated, 1);
        const jobDeadline = job.timestamp + job.delay;
        const secretFile = path.join(temp, 'worker.env');
        const env = { APP_ENV: 'dev', TZ: 'UTC', DB_HOST: 'host.docker.internal', DB_PORT: process.env.DB_PORT || '6543', DB_NAME: database, DB_USERNAME: dbUser, DB_PASSWORD: process.env.DB_PASSWORD || '', DB_SCHEMA: process.env.DB_SCHEMA || 'public', REDIS_HOST: 'redis', REDIS_PORT: '6379', REDIS_PREFIX: prefix, JWT_SECRET: process.env.JWT_SECRET!, COOKIE_SECRET: randomUUID(), SUPERADMIN_USERNAME: process.env.SUPERADMIN_USERNAME!, SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD!, RESERVATION_TTL_MINUTES: '45', VENDURE_DISABLE_TELEMETRY: 'true' };
        await writeFile(secretFile, Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
        docker('run', '-d', '--name', workerName, '--network', network, '--add-host', 'host.docker.internal:host-gateway', '--env-file', secretFile, '--mount', `type=bind,source=${dist},target=/usr/src/app/apps/server/dist,readonly`, image, 'node', 'dist/index-worker.js');
        async function workerReady(since: string) {
            await until(async () => {
                const logs = spawnSync('docker', ['logs', '--since', since, workerName], { encoding: 'utf8' });
                return (logs.stdout + logs.stderr).includes('Vendure Worker is ready');
            }, 'El contenedor Vendure Worker no inició', 90000);
        }
        await workerReady(new Date(stamp - 1000).toISOString());
        assert.equal(await job.getState(), 'delayed');
        const queueOptions={connection:{host:'127.0.0.1',port:redisPort,maxRetriesPerRequest:null},prefix};
        checkout=new Queue('marketplace-checkout',queueOptions);preparation=new Queue('marketplace-preparation',queueOptions);
        await preparation.pause();
        const pendingOrder=await cart();
        const checkoutRequest=await checkout.add('reserve',{ctx:ctx.serialize(),orderId:pendingOrder,sessionId:String(ctx.session?.id)});
        assert.equal((await reservations.waitForStock(checkoutRequest,60000))?.stockConfirmed,true);
        const hold=await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({orderId:Number(pendingOrder)});
        assert.equal(hold.status,'PENDING');assert.equal((await level()).stockAllocated,2);
        await until(async()=>!!await queue!.getJob(`hold-${pendingOrder}`),'No se programó el TTL de la retención');
        const holdJob=(await queue.getJob(`hold-${pendingOrder}`))!;
        const holdDeadline=holdJob.timestamp+holdJob.delay;
        docker('kill', workerName);
        await sleep(1500);
        docker('restart', redisName);
        await until(async () => { try { return await (await queue!.client).ping() === 'PONG'; } catch { return false; } }, 'Redis no se recuperó');
        const recovered = await queue.getJob(job.id!);
        assert.ok(recovered); assert.equal(recovered.timestamp + recovered.delay, jobDeadline); assert.equal(await recovered.getState(), 'delayed');
        const recoveredHold=(await queue.getJob(`hold-${pendingOrder}`))!;
        assert.ok(recoveredHold);assert.equal(recoveredHold.timestamp+recoveredHold.delay,holdDeadline);
        assert.equal((await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({id:hold.id})).expiresAt.getTime(),hold.expiresAt.getTime());
        const restartTime = new Date().toISOString();
        docker('start', workerName);
        await workerReady(restartTime);
        assert.equal(await recovered.getState(), 'delayed');
        await connection.getRepository(ctx,MarketplaceCheckoutHold).update(hold.id,{expiresAt:new Date(Date.now()-1000)});
        await recoveredHold.changeDelay(200);
        await until(async()=>(await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({id:hold.id})).status==='EXPIRED','No expiró la retención recuperada');
        assert.equal((await level()).stockAllocated,1);
        assert.equal((await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({id:hold.id})).context,null);
        const [holdRelease]=await connection.rawConnection.query(`SELECT count(*)::int n,sum(m.quantity)::int quantity FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1 AND m.type='RELEASE'`,[pendingOrder]);
        assert.deepEqual(holdRelease,{n:1,quantity:1});
        await preparation.resume();
        await connection.getRepository(ctx, MarketplaceReservation).update(record.id, { expiresAt: new Date(Date.now() - 1000) });
        await recovered.changeDelay(200);
        await until(async () => (await connection.getRepository(ctx, MarketplaceReservation).findOneByOrFail({ id: record.id })).status === 'EXPIRED', 'La reserva no se liberó después del reinicio');
        assert.equal((await level()).stockAllocated, 0); assert.equal((await level()).stockOnHand, 2);
        const firstOrder = (await orders.findOne(ctx, record.orderId, ['lines']))!;
        const releaseCount = async () => Number((await connection.rawConnection.query('SELECT count(*)::int AS n FROM stock_movement WHERE type = $1 AND "orderLineId" = $2', ['RELEASE', firstOrder.lines[0].id]))[0].n);
        assert.equal(await releaseCount(), 1);
        await reservations.expire(record.orderId);
        assert.equal(await releaseCount(), 1, 'Un reintento no debe duplicar el asiento de liberación');
        assert.equal((await orders.findOne(ctx, record.orderId))?.state, 'Cancelled');
        console.log('PASS: suborden y retención sin preparar recuperadas tras reinicio de Redis y contenedor Worker; TTL original, liberación y kardex únicos.');

        const second = await cart();
        await reservations.reserve(ctx, second);
        const paidRecord = await connection.getRepository(ctx, MarketplaceReservation).findOneByOrFail({ aggregateOrderId: Number(second) });
        const address = app.getHttpServer().address();
        const api = `http://127.0.0.1:${address.port}/admin-api`;
        async function request(query: string, variables: object, token?: string) {
            const response = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ query, variables }) });
            return { body: await response.json() as any, token: response.headers.get('vendure-auth-token') };
        }
        const login = await request('mutation($username:String!,$password:String!){login(username:$username,password:$password){__typename}}', { username: process.env.SUPERADMIN_USERNAME, password: process.env.SUPERADMIN_PASSWORD });
        assert.ok(login.token, 'El login de prueba no emitió JWT');
        const bypass = await request('mutation($input:ManualPaymentInput!){alias:addManualPaymentToOrder(input:$input){__typename}}', { input: { orderId: String(paidRecord.orderId), method: 'paypal', transactionId: 'spoof-gateway', metadata: {} } }, login.token!);
        assert.match(JSON.stringify(bypass.body.errors), /comprobante/);
        const clock = await request('query($id:ID!){order(id:$id){marketplaceReservations{id orderCode expiresAt serverTime status}}}', { id: String(paidRecord.orderId) }, login.token!);
        assert.equal(clock.body.data.order.marketplaceReservations[0].status, 'PENDING');
        const paidOrder = (await orders.findOne(sellerCtx, paidRecord.orderId, ['lines']))!;
        const proof = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\nPrueba').toString('base64')}`;
        await connection.withTransaction(sellerCtx, tx => warehouse.saveProof(tx, { orderId: paidOrder.id, reference: `REF-${stamp}`, institution: 'Banco de prueba', amount: paidOrder.totalWithTax, file: proof }));
        await connection.withTransaction(sellerCtx, tx => warehouse.reviewPayment(tx, paidOrder.id, true));
        assert.equal(await queue.getJob(`reservation-${paidOrder.id}`), undefined);
        assert.equal((await level()).stockOnHand, 2, 'El pago no debe descontar físicamente antes del despacho');
        assert.equal((await level()).stockAllocated, 1);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => warehouse.dispatch(tx, paidOrder.id, 'Entrega de prueba', 'GUIA-REC')), /validar/);
        // Simulate a pre-existing reservation whose StockLocation has not been classified as a shelf.
        await connection.rawConnection.query('DELETE FROM warehouse_shelf WHERE id = $1', [shelf.id]);
        const pendingPick = (await warehouse.orders(sellerCtx)).find(order => String(order.id) === String(paidOrder.id));
        assert.equal(pendingPick?.lines[0].unlocated, 1);
        await assert.rejects(connection.withTransaction(sellerCtx, async tx => {
            const result = await orders.createFulfillment(tx, { lines: [{ orderLineId: paidOrder.lines[0].id, quantity: 1 }], handler: { code: 'manual-fulfillment', arguments: [{ name: 'method', value: 'Prueba' }, { name: 'trackingCode', value: 'PRUEBA' }] } });
            if (isGraphQlErrorResult(result)) throw new Error(result.message);
        }), /percha|INSUFFICIENT_STOCK_ON_HAND/);
        const restoredShelf = await connection.withTransaction(sellerCtx, tx => warehouse.createShelf(tx, { code: `FIX-${stamp}`, sourceLocationId: shelf.stockLocationId }));
        assert.equal(restoredShelf.stockLocationId, shelf.stockLocationId);
        assert.equal((await level()).stockOnHand, 2); assert.equal((await level()).stockAllocated, 1);
        const labels = app.get(LabelCodeService), batch = randomUUID();
        const code = await labels.issue(sellerCtx, variant.id, batch, 0);
        await labels.complete(sellerCtx, batch);
        await connection.withTransaction(sellerCtx, tx => warehouse.scan(tx, { orderLineId: paidOrder.lines[0].id, shelfId: restoredShelf.id, code }));
        await connection.withTransaction(sellerCtx, tx => warehouse.dispatch(tx, paidOrder.id, 'Entrega de prueba', 'GUIA-REC'));
        assert.equal((await level()).stockOnHand, 1); assert.equal((await level()).stockAllocated, 0);
        assert.equal((await orders.findOne(sellerCtx, paidOrder.id))?.state, 'Shipped');
        const [sales] = await connection.rawConnection.query('SELECT count(*)::int AS n FROM stock_movement WHERE type = $1 AND "orderLineId" = $2', ['SALE', paidOrder.lines[0].id]);
        assert.equal(sales.n, 1);
        await assert.rejects(connection.withTransaction(sellerCtx, tx => warehouse.dispatch(tx, paidOrder.id, 'Entrega de prueba', 'GUIA-REC')), /pago/);
        console.log('PASS: pago manual nativo bloqueado, cuenta regresiva autorizada, comprobante aprobado y descuento físico único al despachar.');
    } catch (error) {
        const logs = spawnSync('docker', ['logs', '--tail', '40', workerName], { encoding: 'utf8' });
        if (logs.status === 0) console.error(logs.stdout + logs.stderr);
        throw error;
    } finally {
        try { docker('rm', '-f', workerName); } catch { /* Container may not have started. */ }
        await app?.close();
        await queue?.close();
        await checkout?.close();await preparation?.close();
        try { docker('rm', '-f', redisName); } catch { /* Container may not have started. */ }
        try { docker('volume', 'rm', volume); } catch { /* Volume may not exist. */ }
        try { docker('network', 'rm', network); } catch { /* Network may not exist. */ }
        if (databaseCreated) docker('exec', postgres, 'dropdb', '--if-exists', '--force', '-U', dbUser, database);
        await rm(temp, { recursive: true, force: true });
    }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1); });
