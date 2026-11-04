import { Inject, Injectable, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ActiveOrderService, ChannelService, ConfigService, ForbiddenError, GlobalSettingsService, ID, Order, OrderService, Permission, ProcessContext, RequestContext, StockMovementService, TransactionalConnection, UserInputError, isGraphQlErrorResult } from '@vendure/core';
// shortcut: Vendure 3.7.3 exposes no public early split method; rerun integration tests before upgrading.
import { OrderSplitter } from '@vendure/core/dist/service/helpers/order-splitter/order-splitter';
import { FlowProducer, Job, Queue, QueueEvents, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { CheckoutStockService, StockDecision } from './checkout-stock.service';
import { MarketplaceCheckoutHold } from './marketplace-checkout-hold.entity';
import { WarehouseReservation } from '../warehouse/services/warehouse-reservation';
import { LessThanOrEqual } from 'typeorm';
import { MarketplaceReservation } from './marketplace-reservation.entity';
import { MARKETPLACE_OPTIONS, MarketplaceOptions } from './marketplace.options';
const stockTiming=channel('marketplace.stock-admission');
export function checkoutStockDecision(job:Pick<Job,'data'|'progress'>):StockDecision|undefined {
    return (typeof job.progress==='object' ? (job.progress as {stockDecision?:StockDecision})?.stockDecision : undefined) || job.data.stockDecision;
}

@Injectable()
export class ReservationService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
    private checkout: Queue;
    private checkoutProducer:FlowProducer;
    private expiration: Queue;
    private preparation: Queue;
    private preparationEvents: QueueEvents;
    private checkoutEvents: QueueEvents;
    private workers: Worker[] = [];
    private timer?: ReturnType<typeof setInterval>;
    private paymentChecks = new WeakMap<object, Map<number, Date>>();
    private pendingCheckout:Array<{id:string;data:{ctx:ReturnType<RequestContext['serialize']>;orderId:ID;sessionId:string};resolve:(job:Job)=>void;reject:(error:unknown)=>void}>=[];
    private flushingCheckout=false;
    private scheduling:Promise<void>=Promise.resolve();
    constructor(private connection: TransactionalConnection, private orders: OrderService, private activeOrders: ActiveOrderService, private splitter: OrderSplitter, private movements: StockMovementService, private channels: ChannelService, private process: ProcessContext, private settings: GlobalSettingsService, @Inject(MARKETPLACE_OPTIONS) private options: MarketplaceOptions, private config: ConfigService, private stock: CheckoutStockService, private inventory: WarehouseReservation) {}
    async onModuleInit() {
        const connection = this.options.redis;
        const prefix = this.options.queuePrefix;
        this.checkout = new Queue('marketplace-checkout', { connection, prefix, defaultJobOptions: { removeOnComplete: { age: 86400 }, removeOnFail: { age: 86400 } } });
        this.checkoutProducer=new FlowProducer({connection:await this.checkout.client,prefix});
        this.checkoutProducer.on('error',error=>console.error('Checkout producer:',error.message));
        this.expiration = new Queue('marketplace-expiration', { connection, prefix, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: true } });
        this.preparation = new Queue('marketplace-preparation', { connection, prefix, defaultJobOptions: { attempts: 3, backoff: {type: 'exponential', delay: 1000}, removeOnComplete: true } });
        this.preparationEvents = new QueueEvents('marketplace-preparation', {connection,prefix});
        this.preparationEvents.on('error',error=>console.error('Preparation events:',error.message));
        this.checkoutEvents = new QueueEvents('marketplace-checkout', { connection, prefix });
        this.checkoutEvents.on('error', error => console.error('Marketplace events:', error.message));
        await this.checkoutEvents.waitUntilReady();
        // shortcut: one global FIFO serializes unrelated variants too; partition only if checkout volume requires it.
        await this.checkout.setGlobalConcurrency(1);
    }
    async onApplicationBootstrap() {
        if (!this.process.isWorker) return;
        const connection = this.options.redis;
        const prefix = this.options.queuePrefix;
        if (this.options.workerRole!=='general') this.workers.push(new Worker('marketplace-checkout', async job => this.processCheckout(job), { connection, prefix, concurrency: 1 }));
        if (this.options.workerRole!=='admission') {
            this.workers.push(new Worker('marketplace-preparation', async job => this.prepareHold(job.data.orderId), {connection,prefix,concurrency:1}));
            this.workers.push(new Worker('marketplace-expiration', async job => job.name === 'sync' ? this.closeFinishedCheckouts() : job.name === 'hold' ? this.abortHold(job.data.orderId,'La reserva expiró mientras se preparaba el pedido.',true) : this.expire(job.data.orderId), { connection, prefix, concurrency: 2 }));
        }
        this.workers.forEach(worker => worker.on('error', error => console.error('Marketplace worker:', error.message)));
        if (this.options.workerRole!=='admission') {
            await this.recoverDeadlines();
            this.timer = setInterval(() => void this.recoverDeadlines().catch(error => console.error('Reservation recovery:', error.message)), 60000);
        }
    }
    async onApplicationShutdown() {
        if (this.timer) clearInterval(this.timer);
        await Promise.all(this.workers.map(worker => worker.close()));
        await this.scheduling;
        await this.checkoutProducer?.close();
        await Promise.all([this.checkout?.close(), this.expiration?.close(), this.checkoutEvents?.close(), this.preparation?.close(), this.preparationEvents?.close()]);
    }
    private async processCheckout(job:Job) {
        const entered=Date.now();
        // Look past already-decided jobs so their Redis housekeeping cannot delay a later stock decision.
        const waiting=(await this.checkout.getWaiting(0,199)).filter(item=>!checkoutStockDecision(item));
        const jobs=checkoutStockDecision(job) ? waiting.slice(0,100) : [job,...waiting.slice(0,99)];
        const scanned=Date.now();
        if (jobs.length) {
            const startedAt=Date.now();
            const decisions=await this.stock.admit(jobs.map(item=>({ctx:RequestContext.deserialize(item.data.ctx),orderId:Number(item.data.orderId)})),this.options.reservationTtlMinutes*60000);
            const decidedAt=Date.now();
            const preparing=[...decisions.values()].filter(decision=>decision.stockConfirmed && decision.preparing);
            await Promise.all(jobs.map(async item=>{
                const stockDecision={...decisions.get(Number(item.data.orderId))!,processedAt:Math.max(startedAt,item.timestamp),decidedAt};
                await item.updateProgress({stockDecision});
            }));
            const notified=Date.now();
            // The durable hold recovers interrupted dispatch; Redis scheduling must not retain the FIFO slot.
            this.scheduling=this.scheduling.then(async()=>{
                const started=Date.now();
                if (preparing.length) {
                    await this.expiration.addBulk(preparing.map(decision=>({name:'hold',data:{orderId:decision.orderId},opts:{jobId:`hold-${decision.orderId}`,delay:Math.max(0,Date.parse(decision.expiresAt!)-Date.now())}})));
                    await this.preparation.addBulk(preparing.map(decision=>({name:'prepare',data:{orderId:decision.orderId},opts:{jobId:`prepare-${decision.orderId}`}})));
                }
                if(stockTiming.hasSubscribers)stockTiming.publish({count:jobs.length,confirmed:preparing.length,scanMs:scanned-entered,transactionMs:decidedAt-startedAt,notificationMs:notified-decidedAt,schedulingMs:Date.now()-started});
            }).catch(error=>console.error('Reservation dispatch recovery required:',error.message));
        }
        const decision=checkoutStockDecision(job)!;
        if (!decision.stockConfirmed) throw new UserInputError(`${decision.errorCode}: ${decision.message}`);
        return decision;
    }
    async waitForStock(job:Pick<Job,'id'>,timeout=1000,checkExisting=true):Promise<StockDecision|undefined> {
        let finish:(value:StockDecision|undefined)=>void=()=>{};
        const progressed=new Promise<StockDecision|undefined>(resolve=>{finish=resolve;});
        const listener=({data}:any)=>{if (data?.stockDecision) finish(data.stockDecision);};
        const completed=({returnvalue}:any)=>finish(returnvalue);
        const failed=()=>finish(undefined);
        this.checkoutEvents.addListener(`progress:${job.id}`,listener);
        this.checkoutEvents.addListener(`completed:${job.id}`,completed);
        this.checkoutEvents.addListener(`failed:${job.id}`,failed);
        const timer=setTimeout(failed,timeout);
        try {
            if(checkExisting){
                const fresh=await this.checkout.getJob(job.id!);
                const stored=fresh&&checkoutStockDecision(fresh);
                if (stored) return stored;
                if (!fresh || fresh.failedReason) return undefined;
                if (fresh.finishedOn) return fresh.returnvalue;
            }
            return await progressed;
        } finally {
            clearTimeout(timer);
            this.checkoutEvents.removeListener(`progress:${job.id}`,listener);
            this.checkoutEvents.removeListener(`completed:${job.id}`,completed);
            this.checkoutEvents.removeListener(`failed:${job.id}`,failed);
        }
    }
    private async prepareHold(orderId:number) {
        const hold=await this.connection.rawConnection.getRepository(MarketplaceCheckoutHold).findOneBy({orderId});
        if (!hold || hold.status!=='PENDING') return;
        try {
            const result=await this.reserveOrder(RequestContext.deserialize(hold.context!),orderId,hold);
            await this.expiration.remove(`hold-${orderId}`).catch(()=>{});
            return result;
        } catch (error) {
            console.error('Preparación del pedido',orderId,error instanceof Error?error.stack:String(error));
            await this.abortHold(orderId,error instanceof UserInputError ? error.message : 'No se pudo preparar el pedido. Inténtalo de nuevo o contacta al almacén.');
            throw error;
        }
    }
    private async abortHold(orderId:number,message:string,expiredOnly=false) {
        const record=await this.connection.rawConnection.getRepository(MarketplaceCheckoutHold).findOneBy({orderId});
        if (!record || record.status!=='PENDING') return;
        const ctx=RequestContext.deserialize(record.context!);
        await this.connection.withTransaction(ctx,async tx=>{
            await this.orderLock(tx,orderId);
            const hold=await this.stock.get(tx,orderId);
            if (!hold || hold.status!=='PENDING' || expiredOnly && hold.expiresAt>new Date()) return;
            await this.inventory.release(tx,orderId);
            const result=await this.orders.cancelOrder(tx,{orderId,reason:message,cancelShipping:true});
            if (isGraphQlErrorResult(result)) throw new Error(result.message);
            await this.connection.getRepository(tx,MarketplaceCheckoutHold).update(hold.id,{status:hold.expiresAt<=new Date()?'EXPIRED':'FAILED',message,context:null});
        });
    }
    async enqueue(ctx: RequestContext) {
        const orderId=ctx.session?.activeOrderId || (await this.activeOrders.getActiveOrder(ctx,undefined))?.id;
        if (!orderId) throw new UserInputError('El carrito está vacío.');
        const serialized=ctx.serialize();
        // Workers use order data and channel/session context, never the HTTP request or bearer headers.
        delete serialized._req;
        const id=randomUUID(),committed=this.waitForStock({id},1000,false);
        const job=await new Promise<Job>((resolve,reject)=>{
            this.pendingCheckout.push({id,data:{ctx:serialized,orderId,sessionId:String(ctx.session?.id)},resolve,reject});
            if(!this.flushingCheckout){this.flushingCheckout=true;setImmediate(()=>void this.flushCheckout());}
        });
        const decision=await committed;
        if(decision) return {id:job.id!,state:decision.stockConfirmed?(decision.preparing?'preparing':'completed'):'failed',result:decision,errorCode:decision.errorCode,message:decision.message};
        return this.status(ctx,job.id!,false);
    }
    private async flushCheckout() {
        const batch=this.pendingCheckout.splice(0,100);
        try {
            // FlowProducer uses MULTI/EXEC; workers cannot see only part of an incoming cohort.
            const nodes=await this.checkoutProducer.addBulk(batch.map(({id,data})=>({name:'reserve',queueName:this.checkout.name,data,opts:{...this.checkout.defaultJobOptions,jobId:id}})));
            if(!nodes || nodes.length!==batch.length)throw new Error('No se pudo enviar el lote de reservas.');
            batch.forEach((item,index)=>item.resolve(nodes[index].job));
        }catch(error){batch.forEach(item=>item.reject(error));}
        finally{
            if(this.pendingCheckout.length)setImmediate(()=>void this.flushCheckout());
            else this.flushingCheckout=false;
        }
    }
    async status(ctx: RequestContext, id: string, wait = false) {
        let job = await this.checkout.getJob(id);
        if (!job || job.data.sessionId !== String(ctx.session?.id)) throw new UserInputError('No se encontró esta solicitud en tu sesión.');
        if (wait && !checkoutStockDecision(job)) {
            await this.waitForStock(job);
            job=(await this.checkout.getJob(id))!;
        }
        let hold=job.data.orderId!=null && this.stock ? await this.stock.get(ctx,Number(job.data.orderId)) : null;
        if (wait && hold?.status==='PENDING') {
            const preparation=await this.preparation.getJob(`prepare-${hold.orderId}`) || await this.preparation.add('prepare',{orderId:hold.orderId},{jobId:`prepare-${hold.orderId}`});
            if (preparation) await preparation.waitUntilFinished(this.preparationEvents,1000).catch(()=>{});
            hold=await this.stock.get(ctx,hold.orderId);
        }
        if (hold) {
            return {id,state:hold.status==='PENDING'?'preparing':hold.status==='READY'?'completed':'failed',result:{...checkoutStockDecision(job),orderId:hold.orderId,stockConfirmed:['PENDING','READY'].includes(hold.status),expiresAt:hold.expiresAt.toISOString()},
                errorCode:['FAILED','EXPIRED'].includes(hold.status)?'RESERVATION_FAILED':null,message:hold.message};
        }
        const decision=checkoutStockDecision(job);
        if (decision) return {id,state:decision.stockConfirmed?'completed':'failed',result:decision,errorCode:decision.errorCode,message:decision.message};
        const state=await job.getState();
        return {id,state,result:job.returnvalue,errorCode:job.failedReason?.startsWith('INSUFFICIENT_STOCK')?'INSUFFICIENT_STOCK':state==='failed'?'RESERVATION_FAILED':null,message:job.failedReason};
    }
    async forOrder(ctx: RequestContext, orderId: ID) {
        const order = await this.connection.findOneInChannel(ctx, Order, orderId, ctx.channelId, { relations: ['customer.user'] });
        if (!order) throw new ForbiddenError();
        if (ctx.apiType === 'admin') {
            if (!ctx.userHasAllPermissions([Permission.ReadOrder])) throw new ForbiddenError();
        } else if (String(ctx.session?.activeOrderId || '') !== String(order.id) && (!ctx.activeUserId || String(order.customer?.user?.id) !== String(ctx.activeUserId))) {
            const guestReceipt = !ctx.activeUserId && !order.customer?.user && ctx.authorizedAsOwnerOnly && this.config && await this.config.orderOptions.orderByCodeAccessStrategy.canAccessOrder(ctx, order);
            if (!guestReceipt) throw new ForbiddenError();
        }
        const rows = await this.connection.getRepository(ctx, MarketplaceReservation).find({
            where: order.type === 'Aggregate' ? { aggregateOrderId: Number(order.id) } : { orderId: Number(order.id) },
            relations: ['order'], order: { id: 'ASC' },
        });
        const serverTime = new Date();
        if (!rows.length && this.stock) {
            const hold=await this.stock.get(ctx,Number(orderId));
            if (hold?.status==='PENDING') return [{id:`hold-${hold.id}`,orderCode:order.code,expiresAt:hold.expiresAt,status:'PENDING',serverTime}];
        }
        return rows.filter(row => ctx.apiType !== 'admin' || ctx.userHasAllPermissions([Permission.SuperAdmin]) || row.channelId === Number(ctx.channelId))
            .map(row => ({ id: row.id, orderCode: row.order.code, expiresAt: row.expiresAt, status: row.status, serverTime }));
    }
    private async orderLock(ctx: RequestContext, id: ID) {
        await this.connection.getRepository(ctx, Order).query('SELECT id FROM "order" WHERE id = $1 FOR UPDATE', [id]);
    }
    private async rejectUnavailable(ctx: RequestContext, orderId: ID) {
        // A negative committed snapshot can reject safely; successful reservations still recheck under locks.
        const rows = await this.connection.getRepository(ctx, Order).query(`WITH requested AS (
            SELECT "productVariantId" AS variant,"sellerChannelId" AS channel,sum(quantity) AS needed FROM order_line
            WHERE "orderId"=$1 AND "sellerChannelId" IS NOT NULL GROUP BY "productVariantId","sellerChannelId"
        ) SELECT v.sku FROM requested r JOIN product_variant v ON v.id=r.variant JOIN channel c ON c.id=r.channel
            JOIN "order" o ON o.id=$1
            CROSS JOIN LATERAL (SELECT coalesce(sum(greatest(0,s."stockOnHand"-s."stockAllocated")),0) AS available
                FROM stock_level s JOIN warehouse_shelf p ON p."stockLocationId"=s."stockLocationId" AND p."channelId"=r.channel AND p.active
                JOIN stock_location_channels_channel lc ON lc."stockLocationId"=s."stockLocationId" AND lc."channelId"=r.channel WHERE s."productVariantId"=r.variant) balance
            WHERE o.state IN ('AddingItems','ArrangingPayment') AND r.needed>balance.available-greatest(0,CASE WHEN v."useGlobalOutOfStockThreshold" THEN c."outOfStockThreshold" ELSE v."outOfStockThreshold" END)
            AND NOT EXISTS(SELECT 1 FROM marketplace_reservation existing WHERE existing."aggregateOrderId"=$1) LIMIT 1`, [orderId]);
        if (rows.length) throw new UserInputError(`INSUFFICIENT_STOCK: No hay suficientes pares ubicados en perchas activas de ${rows[0].sku}.`);
    }
    async reserve(ctx: RequestContext, orderId: ID) {
        const hold = await this.stock.get(ctx,Number(orderId));
        if (hold?.status === 'PENDING') return this.prepareHold(Number(orderId));
        return this.reserveOrder(ctx,orderId);
    }
    private async reserveOrder(ctx:RequestContext,orderId:ID,expectedHold?:MarketplaceCheckoutHold) {
        if (!expectedHold) await this.rejectUnavailable(ctx, orderId);
        return this.connection.withTransaction(ctx, async tx => {
            await this.orderLock(tx, orderId);
            const order = await this.connection.getRepository(tx, Order).findOne({ where: { id: orderId } });
            if (!order || !['AddingItems', 'ArrangingPayment'].includes(order.state)) throw new UserInputError('El carrito ya no está disponible para reservar.');
            const existing = await this.connection.getRepository(tx, MarketplaceReservation).find({ where: { aggregateOrderId: Number(orderId) } });
            if (existing.length) {
                if (existing.some(item => item.status !== 'PENDING' || item.expiresAt <= new Date())) throw new UserInputError('La reserva anterior ya terminó. Inicia un carrito nuevo.');
                return { orderId, expiresAt: existing[0].expiresAt.toISOString() };
            }
            if (expectedHold) {
                const current = await this.stock.get(tx,Number(orderId));
                if (current?.status!=='PENDING' || current.expiresAt<=new Date()) throw new UserInputError('La reserva ya terminó.');
                if (current.cartVersion!==await this.stock.version(tx,Number(orderId))) throw new UserInputError('El carrito cambió después de reservar. Inicia otro pedido.');
            }
            (tx as any).marketplaceCheckout = true;
            let fresh:Order;
            if (order.state==='AddingItems') {
                const result=await this.orders.transitionToState(tx,orderId,'ArrangingPayment');
                if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
                fresh=result;
            } else fresh=(await this.orders.findOne(tx,orderId,['lines.productVariant','shippingLines','customer']))!;
            const children = await this.splitter.createSellerOrders(tx, fresh);
            await this.connection.getRepository(tx, Order).update(orderId, { type: 'Aggregate' as any });
            if (!children.length) throw new UserInputError('El carrito no contiene almacenes disponibles.');
            const ttl = this.options.reservationTtlMinutes * 60000;
            const expiresAt = expectedHold?.expiresAt || new Date(Date.now() + ttl);
            const globalInventory = (await this.settings.getSettings(tx)).trackInventory;
            if (expectedHold) {
                if (expiresAt<=new Date()) throw new UserInputError('La reserva expiró durante la preparación.');
                for(const line of children.flatMap(child=>child.lines)) if(line.productVariant.trackInventory==='FALSE'||line.productVariant.trackInventory==='INHERIT'&&!globalInventory) throw new UserInputError('El calzado debe conservar el control de inventario.');
                await this.inventory.transfer(tx,fresh,children);
                await this.connection.getRepository(tx,MarketplaceReservation).insert(children.map(child=>new MarketplaceReservation({orderId:Number(child.id),aggregateOrderId:Number(orderId),channelId:Number(child.lines[0].sellerChannelId),expiresAt,status:'PENDING'})));
                await this.expiration.addBulk(children.map(child=>({name:'expire',data:{orderId:child.id},opts:{jobId:`reservation-${child.id}`,delay:Math.max(0,expiresAt.getTime()-Date.now())}})));
                await this.connection.getRepository(tx,MarketplaceCheckoutHold).update(expectedHold.id,{status:'READY',context:null});
                return {orderId,expiresAt:expiresAt.toISOString()};
            }
            // Existing holds only change order-line ownership under the order lock; their stock counters never change.
            const ids = [...new Set(fresh.lines.map(line => Number(line.productVariantId)))].sort((a, b) => a - b);
            for (const id of ids) await this.connection.getRepository(tx, Order).query('SELECT pg_advisory_xact_lock($1, $2)', [id, 0]);
            await this.connection.getRepository(tx, Order).query('SELECT id FROM stock_level WHERE "productVariantId" = ANY($1::int[]) ORDER BY "productVariantId", "stockLocationId" FOR UPDATE', [ids]);
            for (const child of children) {
                const loaded = child;
                const channelId = loaded.lines[0].sellerChannelId!;
                const sellerCtx = tx.copy();
                (sellerCtx as any)._channel = await this.channels.findOne(tx, channelId);
                for (const line of loaded.lines) {
                    if (line.productVariant.trackInventory === 'FALSE' || (line.productVariant.trackInventory === 'INHERIT' && !globalInventory)) throw new UserInputError('Activa el control de inventario de las variantes antes de vender calzado.');
                    const rows = await this.connection.getRepository(tx, Order).query(`SELECT COALESCE(SUM(GREATEST(0, s."stockOnHand" - s."stockAllocated")), 0) AS available
                        FROM stock_level s JOIN stock_location_channels_channel c ON c."stockLocationId" = s."stockLocationId"
                        JOIN warehouse_shelf shelf ON shelf."stockLocationId" = s."stockLocationId" AND shelf."channelId" = c."channelId" AND shelf.active = true
                        WHERE s."productVariantId" = $1 AND c."channelId" = $2`, [line.productVariantId, channelId]);
                    const threshold = line.productVariant.useGlobalOutOfStockThreshold ? sellerCtx.channel.outOfStockThreshold : line.productVariant.outOfStockThreshold;
                    if (Number(rows[0].available) - Math.max(0, threshold) < line.quantity) throw new UserInputError(`INSUFFICIENT_STOCK: No hay suficientes pares ubicados en perchas activas de ${line.productVariant.sku}.`);
                }
                const allocations = await this.movements.createAllocationsForOrder(sellerCtx, loaded);
                for (const line of loaded.lines) {
                    if (allocations.filter(item => String(item.orderLine.id) === String(line.id)).reduce((sum, item) => sum + item.quantity, 0) !== line.quantity) throw new UserInputError('INSUFFICIENT_STOCK: No se pudieron asignar todos los pares a sus ubicaciones.');
                }
                await this.connection.getRepository(tx, MarketplaceReservation).save(new MarketplaceReservation({ orderId: Number(child.id), aggregateOrderId: Number(orderId), channelId: Number(channelId), expiresAt, status: 'PENDING' }));
                // A rollback can leave an orphan Redis job; it checks the committed row before doing anything.
                await this.expiration.add('expire', { orderId: child.id }, { jobId: `reservation-${child.id}`, delay: expectedHold ? Math.max(0,expiresAt.getTime()-Date.now()) : ttl });
            }
            return { orderId, expiresAt: expiresAt.toISOString() };
        });
    }
    async assertNotExpired(ctx: RequestContext, order: Order) {
        await this.orderLock(ctx, order.id);
        const where = order.type === 'Aggregate' ? { aggregateOrderId: Number(order.id) } : { orderId: Number(order.id) };
        if (order.type === 'Aggregate') {
            const children = await this.connection.getRepository(ctx, MarketplaceReservation).find({ where });
            for (const child of children.sort((a, b) => a.orderId - b.orderId)) await this.orderLock(ctx, child.orderId);
        }
        const rows = await this.connection.getRepository(ctx, MarketplaceReservation).find({ where });
        const runner = this.connection.getRepository(ctx, Order).manager.queryRunner;
        const checks = runner?.isTransactionActive ? this.paymentChecks.get(runner) || new Map<number, Date>() : new Map<number, Date>();
        // A gateway may return after the deadline; keep its pre-charge check while this transaction holds the locks.
        const checkedAt = checks.get(Number(order.id)) || new Date();
        if (!rows.length) throw new UserInputError('Este pedido debe pasar primero por la cola de reservas.');
        if (rows.some(row => ['EXPIRED', 'CANCELLED'].includes(row.status) || (row.status === 'PENDING' && row.expiresAt <= checkedAt))) throw new UserInputError('La reserva expiró o fue cancelada. No se puede aprobar el pago.');
        if (order.type === 'Aggregate' && rows.some(row => row.status !== 'PENDING')) throw new UserInputError('Una suborden ya fue pagada o cancelada. Gestiona las subórdenes de forma individual.');
        checks.set(Number(order.id), checkedAt);
        for (const row of rows) checks.set(row.orderId, checkedAt);
        if (runner?.isTransactionActive) this.paymentChecks.set(runner, checks);
    }
    async markPaid(ctx: RequestContext, order: Order) {
        const repo = this.connection.getRepository(ctx, MarketplaceReservation);
        const rows = await repo.find({ where: order.type === 'Aggregate' ? { aggregateOrderId: Number(order.id) } : { orderId: Number(order.id) } });
        for (const row of rows) {
            if (order.type === 'Aggregate') {
                const child = await this.orders.findOne(ctx, row.orderId);
                if (child?.state === 'ArrangingPayment') {
                    const result = await this.orders.addManualPaymentToOrder(ctx, { orderId: child.id, method: 'aggregate-payment-share', transactionId: `aggregate-${order.id}-${child.id}`, metadata: { aggregateOrderId: String(order.id), bookkeepingOnly: true } });
                    if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
                }
            }
            row.status = 'PAID'; await repo.save(row);
            await this.expiration.remove(`reservation-${row.orderId}`).catch(() => {});
        }
        await this.expiration.add('sync', {}, { delay: 1000 }).catch(() => {});
    }
    async markCancelled(ctx: RequestContext, order: Order) {
        const repo = this.connection.getRepository(ctx, MarketplaceReservation);
        const rows = await repo.find({ where: order.type === 'Aggregate' ? { aggregateOrderId: Number(order.id), status: 'PENDING' } : { orderId: Number(order.id), status: 'PENDING' } });
        for (const row of rows) {
            if (order.type === 'Aggregate') {
                await this.orderLock(ctx,row.orderId);
                const current=await repo.findOneByOrFail({id:row.id});
                if(current.status!=='PENDING') continue;
                await this.inventory.release(ctx,row.orderId);
                const result = await this.orders.cancelOrder(ctx, { orderId: row.orderId, reason: 'Cancelación de la orden principal', cancelShipping: true });
                if (isGraphQlErrorResult(result)) throw new UserInputError(result.message);
            }
            row.status = row.expiresAt <= new Date() ? 'EXPIRED' : 'CANCELLED'; await repo.save(row); await this.expiration.remove(`reservation-${row.orderId}`).catch(() => {});
        }
        await this.expiration.add('sync', {}, { delay: 1000 }).catch(() => {});
    }
    async expire(orderId: number) {
        const record = await this.connection.rawConnection.getRepository(MarketplaceReservation).findOne({ where: { orderId } });
        if (!record || record.status !== 'PENDING' || record.expiresAt > new Date()) return;
        const channel = await this.channels.findOne(undefined as any, record.channelId);
        if (!channel) return;
        const ctx = new RequestContext({ apiType: 'admin', channel, languageCode: channel.defaultLanguageCode, isAuthorized: true, authorizedAsOwnerOnly: false });
        await this.connection.withTransaction(ctx, async tx => {
            await this.orderLock(tx, orderId);
            const current = await this.connection.getRepository(tx, MarketplaceReservation).findOneByOrFail({ orderId });
            const order = await this.orders.findOne(tx, orderId);
            if (current.status !== 'PENDING' || !order || order.state === 'PaymentSettled') return;
            await this.inventory.release(tx,orderId);
            const result = await this.orders.cancelOrder(tx, { orderId, reason: 'Reserva expirada automáticamente al cumplirse su plazo', cancelShipping: true });
            if (isGraphQlErrorResult(result)) throw new Error(result.message);
            current.status = 'EXPIRED'; await this.connection.getRepository(tx, MarketplaceReservation).save(current);
        });
        await this.closeFinishedCheckouts();
    }
    private async recoverDeadlines() {
        const holds=await this.connection.rawConnection.getRepository(MarketplaceCheckoutHold).find({where:{status:'PENDING'},order:{id:'ASC'},take:500});
        for (const hold of holds) {
            if (hold.expiresAt<=new Date()) {
                await this.abortHold(hold.orderId,'La reserva expiró mientras se preparaba el pedido.',true);
                continue;
            }
            const job=await this.preparation.getJob(`prepare-${hold.orderId}`);
            if (!job) await this.preparation.add('prepare',{orderId:hold.orderId},{jobId:`prepare-${hold.orderId}`});
            else if (await job.getState()==='failed') await job.retry();
            if (!await this.expiration.getJob(`hold-${hold.orderId}`)) await this.expiration.add('hold',{orderId:hold.orderId},{jobId:`hold-${hold.orderId}`,delay:Math.max(0,hold.expiresAt.getTime()-Date.now())});
        }
        const due = await this.connection.rawConnection.getRepository(MarketplaceReservation).find({ where: { status: 'PENDING', expiresAt: LessThanOrEqual(new Date()) }, order: { expiresAt: 'ASC' }, take: 500 });
        for (const row of due) {
            const id = `reservation-${row.orderId}`;
            const job = await this.expiration.getJob(id);
            if (!job) await this.expiration.add('expire', { orderId: row.orderId }, { jobId: id });
            else {
                const state = await job.getState();
                if (state === 'failed') await job.retry();
                else if (state === 'delayed') await job.promote().catch(() => {});
            }
        }
        await this.closeFinishedCheckouts();
    }
    private async closeFinishedCheckouts() {
        await this.connection.rawConnection.query(`UPDATE "order" o SET active = false, "orderPlacedAt" = COALESCE(o."orderPlacedAt", now())
            WHERE o.type = 'Aggregate' AND o.active = true AND EXISTS (SELECT 1 FROM marketplace_reservation r WHERE r."aggregateOrderId" = o.id AND r.status <> 'PENDING')`);
    }
}
