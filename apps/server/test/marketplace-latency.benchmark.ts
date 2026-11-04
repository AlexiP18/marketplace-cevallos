import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { bootstrap, runMigrations, ChannelService, CustomerService, ID, OrderService, ProductService, ProductVariantService, RequestContextService, RequestContext, SessionService, ShippingMethod, StockLevel, TransactionalConnection, User, isGraphQlErrorResult } from '@vendure/core';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import { FlowProducer, Queue, QueueEvents } from 'bullmq';
import { config } from '../src/vendure-config';
import { MarketplacePlugin } from '../src/plugins/marketplace/marketplace.plugin';
import { LabelingPlugin } from '../src/plugins/labeling/labeling.plugin';
import { StatisticsPlugin } from '../src/plugins/statistics/statistics.plugin';
import { WarehouseService } from '../src/plugins/warehouse/services/warehouse.service';
import { ReservationService,checkoutStockDecision } from '../src/plugins/marketplace/reservation.service';

type Sample = { outcome: 'confirmed' | 'insufficient'; enqueueMs: number; totalMs: number; queueWaitMs: number; processingMs: number };
function distribution(values: number[]) {
    assert.ok(values.length);
    const ordered = [...values].sort((a, b) => a - b);
    return { samples: ordered.length, p50Ms: ordered[Math.ceil(ordered.length * .5) - 1], p95Ms: ordered[Math.ceil(ordered.length * .95) - 1], maxMs: ordered[ordered.length - 1] };
}
function summarize(samples: Sample[]) {
    return { confirmed: samples.filter(item => item.outcome === 'confirmed').length, insufficient: samples.filter(item => item.outcome === 'insufficient').length,
        enqueue: distribution(samples.map(item => item.enqueueMs)), total: distribution(samples.map(item => item.totalMs)),
        queueWait: distribution(samples.map(item => item.queueWaitMs)), processing: distribution(samples.map(item => item.processingMs)) };
}

async function main() {
    const database = process.env.MARKETPLACE_TEST_DB || '';
    assert.match(database, /^vendure_mq_test_\d+$/, 'Se requiere una copia temporal de PostgreSQL');
    assert.ok(process.env.REDIS_PREFIX?.startsWith('mq-test-'), 'Se requiere un prefijo Redis de prueba');
    (config.dbConnectionOptions as any).database = database;
    const files = await mkdtemp(path.join(os.tmpdir(), 'vendure-latency-'));
    for (const plugin of [MarketplacePlugin, LabelingPlugin, StatisticsPlugin]) plugin.options.privateFiles = files;
    await runMigrations(config);
    config.apiOptions.port=0;
    const app = await bootstrap(config);
    let queue: Queue | undefined, events: QueueEvents | undefined;
    const workers:Array<{child:ReturnType<typeof spawn>;closed:Promise<any>}>=[];
    const phases:unknown[]=[];
    try {
        const entry=path.resolve(__dirname,'../dist/index-worker.js');
        assert.ok(existsSync(entry),'Compila el Worker antes del benchmark');
        await Promise.all(['general','admission'].map(role=>{
            const profiling=process.env.PROFILE_RESERVATIONS && role==='admission' ? ['-r',path.resolve(__dirname,'stock-profile.cjs')] : [];
            const child=spawn(process.execPath,[...profiling,entry],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DB_NAME:database,MARKETPLACE_WORKER_ROLE:role,PRIVATE_JOB_FILES_PATH:files},stdio:['ignore','pipe','pipe']});
            workers.push({child,closed:once(child,'exit')});
            return new Promise<void>((resolve,reject)=>{
                const timer=setTimeout(()=>reject(new Error(`No inició el Worker ${role}`)),90000);
                let buffered='';
                child.stdout!.on('data',chunk=>{
                    buffered+=String(chunk);const lines=buffered.split('\n');buffered=lines.pop()!;
                    for(const line of lines){
                        if(line.includes('Vendure Worker is ready')){clearTimeout(timer);resolve();}
                        if(line.startsWith('STOCK_PROFILE '))phases.push(JSON.parse(line.slice(14)));
                    }
                });
                child.stderr!.on('data',()=>{});
                child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Worker ${role} terminó: ${code}`));});
                child.once('error',error=>{clearTimeout(timer);reject(error);});
            });
        }));
        const connection = app.get(TransactionalConnection), orders = app.get(OrderService), channels = app.get(ChannelService);
        const queuedIds:string[]=[];
        const user = await connection.rawConnection.getRepository(User).findOneOrFail({ where: { identifier: process.env.SUPERADMIN_USERNAME }, relations: ['roles.channels'] });
        const defaultChannel = await channels.getDefaultChannel();
        const ctx = await app.get(RequestContextService).create({ apiType: 'admin', channelOrToken: defaultChannel, user });
        const [seller] = await connection.rawConnection.query('SELECT "channelId" AS id FROM seller_profile WHERE status = $1 ORDER BY id LIMIT 1', ['ACTIVE']);
        assert.ok(seller, 'Se necesita un vendedor activo');
        const sellerCtx = ctx.copy(); (sellerCtx as any)._channel = await channels.findOne(ctx, seller.id);
        const stamp = Date.now();
        const product = await app.get(ProductService).create(sellerCtx, { translations: [{ languageCode: ctx.languageCode, name: 'Benchmark', slug: `latency-${stamp}`, description: '' }] });
        const [variant] = await app.get(ProductVariantService).create(sellerCtx, [{ productId: product.id, sku: '', price: 1000, trackInventory: GlobalFlag.TRUE, useGlobalOutOfStockThreshold: false, outOfStockThreshold: 0, translations: [{ languageCode: ctx.languageCode, name: 'Variante de carga' }] }]);
        const warehouse = app.get(WarehouseService);
        const shelf = await connection.withTransaction(sellerCtx, tx => warehouse.createShelf(tx, { code: `BENCH-${stamp}` }));
        await connection.withTransaction(sellerCtx, tx => warehouse.receive(tx, { variantId: variant.id, shelfId: shelf.id, quantity: 28, reason: 'Fixture de rendimiento: 5 calentamiento, 20 normales y 3 de ráfaga' }));
        const customer = await app.get(CustomerService).create(ctx, { firstName: 'Prueba', lastName: 'Rendimiento', emailAddress: `latency-${stamp}@example.invalid` });
        assert.ok(!isGraphQlErrorResult(customer));
        const shipping = await connection.getRepository(ctx, ShippingMethod).createQueryBuilder('s').innerJoin('s.channels', 'c', 'c.id = :id', { id: defaultChannel.id }).getOne();
        assert.ok(shipping);
        const carts: ID[] = [];
        const shopperContexts=new Map<string,RequestContext>();
        async function cart() {
            const order=await connection.withTransaction(ctx, async tx => {
                const order = await orders.create(tx);
                await orders.addCustomerToOrder(tx, order.id, customer as any);
                const added = await orders.addItemToOrder(tx, order.id, variant.id, 1);
                if (isGraphQlErrorResult(added)) throw new Error(added.message);
                await orders.setShippingAddress(tx, order.id, { fullName: 'Prueba de rendimiento', streetLine1: 'Dirección de prueba', city: 'Quito', countryCode: 'EC' });
                const result = await orders.setShippingMethod(tx, order.id, [shipping!.id]);
                if (isGraphQlErrorResult(result)) throw new Error(result.message);
                return order;
            });
            const sessions=app.get(SessionService);
            const session=await sessions.setActiveOrder(ctx,await sessions.createAnonymousSession(),order);
            shopperContexts.set(String(order.id),new RequestContext({apiType:'shop',channel:defaultChannel,session,languageCode:ctx.languageCode,currencyCode:ctx.currencyCode,isAuthorized:true,authorizedAsOwnerOnly:true}));
            return order.id;
        }
        for (let index=0;index<25;index++) carts.push(...await Promise.all(Array.from({length:5},()=>cart())));
        const options = { connection: MarketplacePlugin.options.redis, prefix: MarketplacePlugin.options.queuePrefix };
        queue = new Queue('marketplace-checkout', options); events = new QueueEvents('marketplace-checkout', options);
        // Each of the 100 bounded waiters subscribes to Queue.closing until its job finishes.
        queue.setMaxListeners(110);
        await events.waitUntilReady();
        const reservations=app.get(ReservationService),starts=new Map<number,number>(),enqueued=new Map<string,{enqueueMs:number;timestamp:number}>();
        const producerQueue=(reservations as any).checkoutProducer as FlowProducer,addBulk=producerQueue.addBulk.bind(producerQueue);
        producerQueue.addBulk=async jobs=>{
            const added=await addBulk(jobs),finished=performance.now();
            for(const {job} of added)enqueued.set(job.id!,{enqueueMs:finished-starts.get(Number(job.data.orderId))!,timestamp:job.timestamp});
            return added;
        };
        async function measure(orderId: ID): Promise<Sample> {
            const start = performance.now();
            starts.set(Number(orderId),start);
            const shopper=shopperContexts.get(String(orderId))!;
            const response=await reservations.enqueue(shopper);
            let decision=response.result;
            if(decision?.stockConfirmed===undefined)decision=await reservations.waitForStock((await queue!.getJob(response.id))!,180000);
            assert.ok(decision,'La decisión de stock no llegó');
            const totalMs=performance.now()-start;
            queuedIds.push(response.id);
            const {enqueueMs,timestamp}=enqueued.get(response.id)!;
            const outcome:Sample['outcome']=decision.stockConfirmed?'confirmed':'insufficient';
            if (!decision.stockConfirmed) assert.equal(decision.errorCode,'INSUFFICIENT_STOCK');
            assert.ok(decision.processedAt && decision.decidedAt);
            return {outcome,enqueueMs,totalMs,queueWaitMs:Math.max(0,decision.processedAt!-timestamp),processingMs:decision.decidedAt!-decision.processedAt!};
        }
        for (const cart of carts.slice(0, 5)) assert.equal((await measure(cart)).outcome, 'confirmed');
        const normal: Sample[] = [];
        for (const cart of carts.slice(5, 25)) normal.push(await measure(cart));
        assert.ok(normal.every(sample => sample.outcome === 'confirmed'));
        const burst = await Promise.all(carts.slice(25).map(cart => measure(cart)));
        assert.equal(burst.filter(sample => sample.outcome === 'confirmed').length, 3);
        assert.equal(burst.filter(sample => sample.outcome === 'insufficient').length, 97);
        assert.ok(burst.slice(0,3).every(sample=>sample.outcome==='confirmed'),'FIFO: los tres primeros deben recibir los últimos pares');
        assert.ok(burst.slice(3).every(sample=>sample.outcome==='insufficient'));
        const afterScarce=await connection.getRepository(sellerCtx,StockLevel).findOneByOrFail({productVariantId:variant.id,stockLocationId:shelf.stockLocationId});
        assert.equal(afterScarce.stockAllocated,28); assert.equal(afterScarce.stockOnHand,28);
        await connection.withTransaction(sellerCtx,tx=>warehouse.receive(tx,{variantId:variant.id,shelfId:shelf.id,quantity:100,reason:'Fixture para una ráfaga de cien confirmaciones exitosas'}));
        const abundantCarts:ID[]=[];
        for(let index=0;index<20;index++) abundantCarts.push(...await Promise.all(Array.from({length:5},()=>cart())));
        const abundant=await Promise.all(abundantCarts.map(orderId=>measure(orderId)));
        assert.ok(abundant.every(sample=>sample.outcome==='confirmed'));
        for (const id of queuedIds) {
            const job=(await queue.getJob(id))!;
            if (!checkoutStockDecision(job)?.stockConfirmed) {await assert.rejects(job.waitUntilFinished(events!,180000),/INSUFFICIENT_STOCK/); continue;}
            if (checkoutStockDecision(job)?.stockConfirmed) {
                let state=await app.get(ReservationService).status(RequestContext.deserialize(job.data.ctx),id,true);
                for(let attempt=0;state.state==='preparing' && attempt<60;attempt++) state=await app.get(ReservationService).status(RequestContext.deserialize(job.data.ctx),id,true);
                assert.equal(state.state,'completed',JSON.stringify(state));
            }
        }
        const level = await connection.getRepository(sellerCtx, StockLevel).findOneByOrFail({ productVariantId: variant.id, stockLocationId: shelf.stockLocationId });
        assert.equal(level.stockOnHand, 128); assert.equal(level.stockAllocated, 128);
        const rejectedIds = carts.slice(25).filter((_, index) => burst[index].outcome === 'insufficient');
        assert.equal(Number((await connection.rawConnection.query('SELECT count(*) FROM marketplace_reservation WHERE "aggregateOrderId"=ANY($1::int[])', [rejectedIds]))[0].count), 0);
        assert.equal(Number((await connection.rawConnection.query('SELECT count(*) FROM "order" WHERE "aggregateOrderId"=ANY($1::int[])', [rejectedIds]))[0].count), 0, 'Un rechazo no deja subórdenes parciales');
        const result = { measuredAt: new Date().toISOString(), scope: 'Actual ReservationService.enqueue with API producer and two compiled Workers in separate processes. Includes API batching, Redis enqueue, FIFO wait and persisted, committed stock decision; excludes HTTP, authentication, storefront polling and cart preparation. Seller-order preparation and payment readiness are verified separately after timing. This is a lower bound for HTTP latency.', environment: { node: process.version, cpus: os.cpus().length, workerProcesses:2, producerProcess:'Separate API',actor:'Native anonymous shopper sessions', loadAverage: os.loadavg() }, warmup: 5, normal: summarize(normal), burst100: summarize(burst), burst100Available:summarize(abundant), stockIntegrity: { physical: level.stockOnHand, allocated: level.stockAllocated },phases };
        console.log('LATENCY_RESULT ' + JSON.stringify(result));
        if (process.env.PERFORMANCE_REPORT) await writeFile(process.env.PERFORMANCE_REPORT, JSON.stringify(result, null, 2) + '\n');
        if (process.env.ENFORCE_PERFORMANCE === '1') {
            assert.ok(result.normal.total.maxMs <= 150, `Reserva normal máxima=${result.normal.total.maxMs.toFixed(2)}ms supera 150ms`);
            assert.ok(result.burst100Available.total.p95Ms <= 250, `Ráfaga exitosa p95=${result.burst100Available.total.p95Ms.toFixed(2)}ms supera 250ms`);
            assert.ok(result.burst100.total.p95Ms <= 250, `Ráfaga p95=${result.burst100.total.p95Ms.toFixed(2)}ms supera 250ms`);
        }
    } finally {
        await events?.close(); await queue?.close(); await app.close();
        for(const {child,closed} of workers) if(child.exitCode===null) {
            child.kill('SIGTERM');
            await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,10000))]);
            if(child.exitCode===null){child.kill('SIGKILL');await closed;}
        }
        await rm(files, { recursive: true, force: true });
    }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1); });
