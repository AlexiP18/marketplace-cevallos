const path = require('node:path');
require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), compiler: require.resolve('typescript', { paths: [path.join(__dirname, '..')] }), transpileOnly: true });
const test = require('node:test');
const assert = require('node:assert/strict');
const { MarketplacePlugin } = require('../src/plugins/marketplace/marketplace.plugin');
const { ReservationService,checkoutStockDecision } = require('../src/plugins/marketplace/reservation.service');
const { WarehouseManualPaymentGuard } = require('../src/plugins/warehouse/api/warehouse-manual-payment.guard');

test('el plazo usa 45 minutos por defecto y rechaza configuraciones inválidas', () => {
    const options = { redis: {}, privateFiles: '', apiOrigin: '', queuePrefix: '' };
    MarketplacePlugin.init(options);
    assert.equal(MarketplacePlugin.options.reservationTtlMinutes, 45);
    MarketplacePlugin.init({ ...options, reservationTtlMinutes: 10 });
    assert.equal(MarketplacePlugin.options.reservationTtlMinutes, 10);
    for (const value of [0, -1, 1.5, 1441, NaN, Infinity]) assert.throws(() => MarketplacePlugin.init({ ...options, reservationTtlMinutes: value }), /entero/);
    for(const workerRole of ['all','general','admission']){
        MarketplacePlugin.init({...options,workerRole});assert.equal(MarketplacePlugin.options.workerRole,workerRole);
    }
    assert.throws(()=>MarketplacePlugin.init({...options,workerRole:'invalid'}),/MARKETPLACE_WORKER_ROLE/);
});

test('el estado de reserva exige propiedad de la orden y alcance de canal', async () => {
    const order = { id: 10, type: 'Aggregate', customer: { user: { id: 7 } } };
    const connection = { findOneInChannel: async ctx => ctx.channelId === 1 ? order : null,
        getRepository: () => ({ find: async () => [{ id: 20, channelId: 2, order: { code: 'SELLER-1' }, status: 'PENDING', expiresAt: new Date() }] }) };
    const service = new ReservationService(connection, {}, {}, {}, {}, {}, {}, {}, {});
    assert.equal((await service.forOrder({ apiType: 'shop', channelId: 1, activeUserId: 7 }, 10)).length, 1);
    assert.equal((await service.forOrder({ apiType: 'shop', channelId: 1, session: { activeOrderId: 10 } }, 10))[0].orderCode, 'SELLER-1');
    await assert.rejects(service.forOrder({ apiType: 'shop', channelId: 1, activeUserId: 8 }, 10));
    await assert.rejects(service.forOrder({ apiType: 'shop', channelId: 1 }, 10));
    await assert.rejects(service.forOrder({ apiType: 'shop', channelId: 3, activeUserId: 7 }, 10));
    await assert.rejects(service.forOrder({ apiType: 'admin', channelId: 1, userHasAllPermissions: () => false }, 10));
});

test('un recibo de invitado conserva la política de acceso por código de Vendure', async () => {
    let permitted = true;
    const connection = { findOneInChannel: async () => ({ id: 10, type: 'Aggregate', customer: {} }), getRepository: () => ({ find: async () => [] }) };
    const service = new ReservationService(connection, {}, {}, {}, {}, {}, {}, {}, {}, { orderOptions: { orderByCodeAccessStrategy: { canAccessOrder: async () => permitted } } });
    const ctx = { apiType: 'shop', channelId: 1, authorizedAsOwnerOnly: true };
    assert.deepEqual(await service.forOrder(ctx, 10), []);
    permitted = false;
    await assert.rejects(service.forOrder(ctx, 10));
});

test('la espera de checkout valida la sesión antes de suscribirse y devuelve el resultado actualizado', async () => {
    let waits = 0, finished = false;
    const service = new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {});
    service.checkoutEvents = new (require('node:events').EventEmitter)();
    service.checkout = { getJob: async () => {
        if(service.checkoutEvents.listenerCount('completed:1')){
            waits++;setImmediate(()=>{finished=true;service.checkoutEvents.emit('completed:1',{returnvalue:{orderId:5}});});
        }
        return { id:'1',data: { sessionId: 'owner' }, returnvalue: finished ? { orderId: 5 } : null,
            getState: async () => finished ? 'completed' : 'waiting' };
    }};
    await assert.rejects(service.status({ session: { id: 'other' } }, '1', true));
    assert.equal(waits, 0);
    const result = await service.status({ session: { id: 'owner' } }, '1', true);
    assert.equal(waits, 1); assert.equal(result.state, 'completed'); assert.deepEqual(result.result, { orderId: 5 });
    assert.equal(service.checkoutEvents.eventNames().length,0);
});

test('la espera termina por stock confirmado o timeout y retira sus suscripciones',async()=>{
    const service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {});
    service.checkoutEvents=new(require('node:events').EventEmitter)();
    service.checkout={getJob:async()=>({data:{}})};
    const decision={orderId:5,stockConfirmed:true};
    const pending=service.waitForStock({id:'1'},100);
    service.checkoutEvents.emit('progress:1',{data:{stockDecision:decision}});
    assert.deepEqual(await pending,decision);
    assert.equal(service.checkoutEvents.eventNames().length,0);
    assert.equal(await service.waitForStock({id:'2'},5),undefined);
    assert.equal(service.checkoutEvents.eventNames().length,0);
});

test('el lote conserva FIFO y comunica stock comprometido antes de iniciar preparación',async()=>{
    const calls=[],service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {reservationTtlMinutes:45}, {}, {
        admit:async requests=>{
            assert.deepEqual(requests.map(request=>request.orderId),[1,2]);calls.push('commit');
            return new Map(requests.map(({orderId})=>[orderId,{orderId,stockConfirmed:true,preparing:true,expiresAt:new Date(Date.now()+2700000).toISOString()}]));
        }
    });
    const job=orderId=>({timestamp:Date.now(),data:{ctx:{_channel:{}},orderId},updateProgress:async function(progress){this.progress=progress;calls.push('decision');}});
    const first=job(1),second=job(2);
    service.checkout={getWaiting:async()=>[second]};
    service.expiration={addBulk:async()=>calls.push('ttl')};service.preparation={addBulk:async()=>calls.push('prepare')};
    assert.equal((await service.processCheckout(first)).stockConfirmed,true);
    await service.scheduling;
    assert.deepEqual(calls,['commit','decision','decision','ttl','prepare']);
    assert.equal(checkoutStockDecision(second).stockConfirmed,true);
});

test('los cierres de trabajos ya decididos no posponen las solicitudes nuevas',async()=>{
    let admitted=[];
    const service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {reservationTtlMinutes:45}, {}, {
        admit:async requests=>{admitted=requests.map(request=>request.orderId);return new Map(requests.map(({orderId})=>[orderId,{orderId,stockConfirmed:false,errorCode:'INSUFFICIENT_STOCK'}]));}
    });
    const cached={timestamp:Date.now(),data:{orderId:1,stockDecision:{orderId:1,stockConfirmed:true}}};
    const pending={timestamp:Date.now(),data:{orderId:2,ctx:{_channel:{}}},updateProgress:async function(progress){this.progress=progress;}};
    service.checkout={getWaiting:async()=>[cached,pending]};
    assert.equal((await service.processCheckout(cached)).stockConfirmed,true);
    assert.deepEqual(admitted,[2]);assert.equal(checkoutStockDecision(pending).errorCode,'INSUFFICIENT_STOCK');
});

test('la API agrupa solicitudes FIFO, elimina cabeceras HTTP y responde al commit sin releer stock',async()=>{
    const batches=[],service=new ReservationService({}, {}, {getActiveOrder:()=>{throw Error('No debe releer el carrito');}}, {}, {}, {}, {}, {}, {}, {}, {});
    service.checkout={name:'marketplace-checkout',defaultJobOptions:{removeOnComplete:{age:86400}}};
    service.checkoutProducer={addBulk:async batch=>{batches.push(batch);return batch.map(item=>({job:{id:item.opts.jobId,data:item.data}}));}};
    service.waitForStock=async()=>({stockConfirmed:true,preparing:true});
    service.status=()=>{throw Error('No debe releer una decisión comprometida');};
    const ctx=id=>({session:{id:`session-${id}`,activeOrderId:id},serialize:()=>({_req:{headers:{authorization:'private-token'}},_channel:{id:1},_session:{id:`session-${id}`}})});
    const results=await Promise.all([service.enqueue(ctx(1)),service.enqueue(ctx(2))]);
    assert.equal(batches.length,1);assert.deepEqual(batches[0].map(job=>job.data.orderId),[1,2]);
    assert.ok(batches[0].every(job=>job.queueName==='marketplace-checkout'&&job.opts.removeOnComplete.age===86400));
    assert.ok(batches[0].every(job=>job.data.ctx._req===undefined));
    assert.deepEqual(results.map(result=>[result.state,result.result.stockConfirmed]),[['preparing',true],['preparing',true]]);
});

test('un fallo al encolar rechaza el lote completo y permite el siguiente intento',async()=>{
    const service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {});
    let failed=true;
    service.checkout={name:'marketplace-checkout',defaultJobOptions:{}};
    service.checkoutProducer={addBulk:async batch=>{if(failed)throw Error('Redis no disponible');return batch.map(item=>({job:{id:'3',data:item.data}}));}};
    service.waitForStock=async()=>({stockConfirmed:true,preparing:true});
    const ctx=id=>({session:{id:String(id),activeOrderId:id},serialize:()=>({_channel:{id:1}})});
    const results=await Promise.allSettled([service.enqueue(ctx(1)),service.enqueue(ctx(2))]);
    assert.ok(results.every(result=>result.status==='rejected'));
    assert.equal(service.pendingCheckout.length,0);assert.equal(service.flushingCheckout,false);
    failed=false;assert.equal((await service.enqueue(ctx(3))).result.stockConfirmed,true);
});

test('el FIFO se libera mientras la programación sigue pendiente y la decisión sobrevive en progress',async()=>{
    let release;
    const blocked=new Promise(resolve=>release=resolve),calls=[];
    const service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {reservationTtlMinutes:45}, {}, {
        admit:async()=>new Map([[1,{orderId:1,stockConfirmed:true,preparing:true,expiresAt:new Date(Date.now()+2700000).toISOString()}]])
    });
    const job={timestamp:Date.now(),data:{orderId:1,ctx:{_channel:{}}},updateProgress:async function(progress){this.progress=progress;}};
    service.checkout={getWaiting:async()=>[]};
    service.expiration={addBulk:async()=>{calls.push('ttl');await blocked;}};
    service.preparation={addBulk:async()=>calls.push('prepare')};
    assert.equal((await service.processCheckout(job)).stockConfirmed,true);
    assert.equal(job.data.stockDecision,undefined);
    assert.equal(checkoutStockDecision(job).stockConfirmed,true);
    assert.deepEqual(calls,['ttl']);
    release();await service.scheduling;assert.deepEqual(calls,['ttl','prepare']);
});

test('la consulta reconoce decisiones persistidas en progress y conserva trabajos anteriores',async()=>{
    const service=new ReservationService({}, {}, {}, {}, {}, {}, {}, {}, {});
    const decision={orderId:1,stockConfirmed:false,errorCode:'INSUFFICIENT_STOCK'};
    service.checkout={getJob:async()=>({data:{sessionId:'owner'},progress:{stockDecision:decision}})};
    const result=await service.status({session:{id:'owner'}},'opaque');
    assert.equal(result.state,'failed');assert.equal(result.errorCode,'INSUFFICIENT_STOCK');
    assert.deepEqual(checkoutStockDecision({data:{stockDecision:decision},progress:0}),decision);
});

test('la mutación nativa de pago manual no permite saltar el comprobante ni suplantar una pasarela', () => {
    const guard = new WarehouseManualPaymentGuard();
    const context = fieldName => ({ getType: () => 'graphql', getArgs: () => [null, { input: { method: 'paypal' } }, {}, { fieldName }], getClass: () => Object, getHandler: () => Function });
    assert.throws(() => guard.canActivate(context('addManualPaymentToOrder')), /comprobante/);
    assert.equal(guard.canActivate(context('reviewWarehousePayment')), true);
    assert.equal(guard.canActivate(context('addPaymentToOrder')), true);
    assert.equal(guard.canActivate({ getType: () => 'http' }), true);
});
