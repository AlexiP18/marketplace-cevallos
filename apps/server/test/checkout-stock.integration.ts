import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {bootstrap,runMigrations,ChannelService,OrderService,ProductService,ProductVariantService,RequestContextService,ShippingMethod,StockLevel,TransactionalConnection,User} from '@vendure/core';
import {GlobalFlag} from '@vendure/common/lib/generated-types';
import {Queue} from 'bullmq';
import {config} from '../src/vendure-config';
import {MarketplacePlugin} from '../src/plugins/marketplace/marketplace.plugin';
import {LabelingPlugin} from '../src/plugins/labeling/labeling.plugin';
import {StatisticsPlugin} from '../src/plugins/statistics/statistics.plugin';
import {MarketplaceCheckoutHold} from '../src/plugins/marketplace/marketplace-checkout-hold.entity';
import {MarketplaceReservation} from '../src/plugins/marketplace/marketplace-reservation.entity';
import {ReservationService} from '../src/plugins/marketplace/reservation.service';
import {WarehouseService} from '../src/plugins/warehouse/services/warehouse.service';

async function until(check:()=>Promise<boolean>,message:string) {
    const end=Date.now()+60000;
    while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}
    throw new Error(message);
}
async function main(){
    const database=process.env.MARKETPLACE_TEST_DB||'';
    assert.match(database,/^vendure_mq_test_\d+$/);assert.ok(process.env.REDIS_PREFIX?.startsWith('mq-test-'));
    (config.dbConnectionOptions as any).database=database;config.apiOptions.port=0;
    const files=await mkdtemp(path.join(os.tmpdir(),'vendure-hold-api-'));
    for(const plugin of [MarketplacePlugin,LabelingPlugin,StatisticsPlugin])plugin.options.privateFiles=files;
    await runMigrations(config);
    const app=await bootstrap(config);
    const child=spawn(process.execPath,[path.resolve(__dirname,'../dist/index-worker.js')],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DB_NAME:database,MARKETPLACE_WORKER_ROLE:'all',PRIVATE_JOB_FILES_PATH:files},stdio:['ignore','pipe','pipe']});
    const closed=once(child,'exit');let workerLog='';
    child.stdout!.on('data',data=>{workerLog=(workerLog+data).slice(-12000);});child.stderr!.on('data',data=>{workerLog=(workerLog+data).slice(-12000);});
    const options={connection:MarketplacePlugin.options.redis,prefix:MarketplacePlugin.options.queuePrefix};
    const preparation=new Queue('marketplace-preparation',options),expiration=new Queue('marketplace-expiration',options);
    try{
        await until(async()=>workerLog.includes('Vendure Worker is ready'),'No inició el Worker de prueba');
        const connection=app.get(TransactionalConnection),channels=app.get(ChannelService),warehouse=app.get(WarehouseService);
        const user=await connection.rawConnection.getRepository(User).findOneOrFail({where:{identifier:process.env.SUPERADMIN_USERNAME},relations:['roles.channels']});
        const ctx=await app.get(RequestContextService).create({apiType:'admin',channelOrToken:await channels.getDefaultChannel(),user});
        const [seller]=await connection.rawConnection.query("SELECT \"channelId\" id FROM seller_profile WHERE status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(seller);
        const sellerCtx=ctx.copy();(sellerCtx as any)._channel=await channels.findOne(ctx,seller.id);
        const stamp=Date.now();
        const product=await app.get(ProductService).create(sellerCtx,{translations:[{languageCode:ctx.languageCode,name:'Prueba checkout web',slug:`hold-web-${stamp}`,description:''}]});
        const [variant]=await app.get(ProductVariantService).create(sellerCtx,[{productId:product.id,sku:'',price:1000,trackInventory:GlobalFlag.TRUE,useGlobalOutOfStockThreshold:false,outOfStockThreshold:0,translations:[{languageCode:ctx.languageCode,name:'Par web'}]}]);
        for(let index=0;index<2;index++){
            const shelf=await connection.withTransaction(sellerCtx,tx=>warehouse.createShelf(tx,{code:`WEB-${stamp}-${index}`}));
            await connection.withTransaction(sellerCtx,tx=>warehouse.receive(tx,{variantId:variant.id,shelfId:shelf.id,quantity:2,reason:'Fixture de reserva distribuida entre dos perchas'}));
        }
        const shipping=await connection.getRepository(ctx,ShippingMethod).createQueryBuilder('s').innerJoin('s.channels','c','c.id=:id',{id:ctx.channelId}).getOne();assert.ok(shipping);
        const port=(app.getHttpServer().address() as any).port,url=`http://localhost:${port}/shop-api`;
        function buyer(){
            let token='';
            return async(query:string,allowErrors=false)=>{
                const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Apollo-Require-Preflight':'true',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({query})});
                token=response.headers.get('vendure-auth-token')||token;
                const body=await response.json();if(!allowErrors)assert.equal(body.errors,undefined,JSON.stringify(body.errors));
                return body;
            };
        }
        async function cart(quantity:number,name:string){
            const request=buyer();
            const added=await request(`mutation {addItemToOrder(productVariantId:"${variant.id}",quantity:${quantity}){__typename ...on Order{id code lines{id}}}}`);
            assert.equal(added.data.addItemToOrder.__typename,'Order',JSON.stringify(added));
            const order=added.data.addItemToOrder;
            await request(`mutation {setCustomerForOrder(input:{firstName:"Prueba",lastName:"Web",emailAddress:"web-${name}-${stamp}@example.invalid"}){__typename}}`);
            await request('mutation {setOrderShippingAddress(input:{fullName:"Prueba web",streetLine1:"Dirección de prueba",city:"Quito",province:"Pichincha",postalCode:"170150",countryCode:"EC"}){__typename}}');
            await request(`mutation {setOrderShippingMethod(shippingMethodId:["${shipping!.id}"]){__typename}}`);
            return {request,order};
        }
        const reserve='mutation {reserveMarketplaceCheckout{id state result errorCode message}}';
        const status=(id:string)=>`{marketplaceCheckoutJob(id:"${id}",wait:true){state result errorCode message}}`;
        const allocated=async()=>Number((await connection.rawConnection.query('SELECT sum("stockAllocated")::int total FROM stock_level WHERE "productVariantId"=$1',[variant.id]))[0].total);
        await preparation.pause();
        const a=await cart(3,'a'),b=await cart(3,'b');
        const first=(await a.request(reserve)).data.reserveMarketplaceCheckout;assert.equal(first.result.stockConfirmed,true,JSON.stringify(first));
        assert.equal(first.state,'preparing');assert.equal(await allocated(),3);
        const again=(await a.request(reserve)).data.reserveMarketplaceCheckout;
        assert.equal(again.result.expiresAt,first.result.expiresAt);assert.equal(await allocated(),3);
        const second=(await b.request(reserve)).data.reserveMarketplaceCheckout;assert.equal(second.errorCode,'INSUFFICIENT_STOCK');assert.equal(await allocated(),3);
        await connection.rawConnection.query('DELETE FROM product_variant_channels_channel WHERE "productVariantId"=$1 AND "channelId"=$2',[variant.id,ctx.channelId]);
        const unpublished=(await b.request(reserve)).data.reserveMarketplaceCheckout;
        assert.equal(unpublished.errorCode,'RESERVATION_FAILED');assert.equal(await allocated(),3);
        await connection.rawConnection.query('INSERT INTO product_variant_channels_channel("productVariantId","channelId") VALUES($1,$2)',[variant.id,ctx.channelId]);
        const denied=await b.request(status(first.id),true);assert.ok(denied.errors?.length,'Otra sesión no debe leer la decisión');
        const changed=await a.request(`mutation {adjustOrderLine(orderLineId:"${a.order.lines[0].id}",quantity:1){__typename}}`,true);
        assert.match(changed.errors?.[0]?.message||'',/preparando/);
        const payment=await a.request('mutation {addPaymentToOrder(input:{method:"dummy-payment-method",metadata:{}}){__typename}}',true);
        assert.match(payment.errors?.[0]?.message||'',/preparando/);
        const clock=(await a.request('{activeOrder{marketplaceReservations{id status expiresAt serverTime}}}')).data.activeOrder.marketplaceReservations[0];
        assert.equal(clock.status,'PENDING');assert.ok(Date.parse(clock.expiresAt)-Date.parse(clock.serverTime)>2600000);
        // Simulate an internal caller bypassing the API guard: preparation must detect the changed cart and compensate exact shelf quantities.
        await connection.rawConnection.query('UPDATE order_line SET quantity=1 WHERE "orderId"=$1',[a.order.id]);
        await preparation.resume();
        await until(async()=>((await a.request(status(first.id))).data.marketplaceCheckoutJob.state)==='failed','No se compensó el cambio del carrito');
        assert.equal(await allocated(),0);
        const releases=await connection.rawConnection.query(`SELECT m.quantity FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1 AND m.type='RELEASE' ORDER BY m.quantity`,[a.order.id]);
        assert.deepEqual(releases.map((row:any)=>row.quantity),[1,2]);
        assert.equal((await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({orderId:Number(a.order.id)})).context,null);
        const c=await cart(3,'c'),third=(await c.request(reserve)).data.reserveMarketplaceCheckout;
        await until(async()=>((await c.request(status(third.id))).data.marketplaceCheckoutJob.state)==='completed','No se preparó el pedido válido');
        assert.equal(await allocated(),3);
        const parent=(await app.get(OrderService).findOne(ctx,c.order.id))!,children=await app.get(OrderService).getSellerOrders(ctx,parent);
        assert.equal(children.length,1);assert.equal(children[0].totalWithTax,parent.totalWithTax);
        assert.equal((await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({orderId:Number(c.order.id)})).context,null);
        await preparation.pause();
        const d=await cart(1,'d'),fourth=(await d.request(reserve)).data.reserveMarketplaceCheckout;
        await until(async()=>!!await expiration.getJob(`hold-${d.order.id}`),'No se despachó el TTL persistido');
        await connection.getRepository(ctx,MarketplaceCheckoutHold).update({orderId:Number(d.order.id)},{expiresAt:new Date(Date.now()-1000)});
        const expiry=await expiration.getJob(`hold-${d.order.id}`);assert.ok(expiry);await expiry.promote();
        await until(async()=>((await d.request(status(fourth.id))).data.marketplaceCheckoutJob.state)==='failed','No expiró la retención sin preparar');
        assert.equal(await allocated(),3);
        const repeat=await expiration.add('hold',{orderId:Number(d.order.id)},{jobId:`repeat-${d.order.id}`});
        await until(async()=>await repeat.getState()==='completed'||await repeat.getState()==='unknown','No se procesó el reintento de expiración');
        assert.equal(Number((await connection.rawConnection.query(`SELECT coalesce(sum(m.quantity),0) total FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1 AND m.type='RELEASE'`,[d.order.id]))[0].total),1);
        const child=children[0];
        await connection.getRepository(ctx,MarketplaceReservation).update({orderId:Number(child.id)},{expiresAt:new Date(Date.now()-1000)});
        await app.get(ReservationService).expire(Number(child.id));
        assert.equal(await allocated(),0);
        const childReleases=await connection.rawConnection.query(`SELECT m.quantity FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1 AND m.type='RELEASE' ORDER BY m.quantity`,[child.id]);
        assert.deepEqual(childReleases.map((row:any)=>row.quantity),[1,2]);
        await app.get(ReservationService).expire(Number(child.id));
        assert.equal(await allocated(),0);
        const e=await cart(1,'e'),fifth=(await e.request(reserve)).data.reserveMarketplaceCheckout;
        const hold=await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({orderId:Number(e.order.id)});
        await until(async()=>!!await preparation.getJob(`prepare-${e.order.id}`)&&!!await expiration.getJob(`hold-${e.order.id}`),'No se despacharon los trabajos persistidos');
        await (await preparation.getJob(`prepare-${e.order.id}`))!.remove();await (await expiration.getJob(`hold-${e.order.id}`))!.remove();
        await (app.get(ReservationService) as any).recoverDeadlines();
        assert.ok(await preparation.getJob(`prepare-${e.order.id}`));assert.ok(await expiration.getJob(`hold-${e.order.id}`));
        assert.equal((await connection.getRepository(ctx,MarketplaceCheckoutHold).findOneByOrFail({orderId:hold.orderId})).expiresAt.getTime(),hold.expiresAt.getTime());
        await preparation.resume();
        await until(async()=>((await e.request(status(fifth.id))).data.marketplaceCheckoutJob.state)==='completed','No se recuperó la preparación perdida');
        assert.equal(await allocated(),1);
        const f=await cart(3,'f'),sixth=(await f.request(reserve)).data.reserveMarketplaceCheckout;
        await until(async()=>((await f.request(status(sixth.id))).data.marketplaceCheckoutJob.state)==='completed','No se preparó la prueba de rechazo');
        const finalParent=(await app.get(OrderService).findOne(ctx,f.order.id))!,[rejected]=await app.get(OrderService).getSellerOrders(ctx,finalParent);
        const proof=`data:application/pdf;base64,${Buffer.from('%PDF-1.4\nPrueba').toString('base64')}`;
        await connection.withTransaction(sellerCtx,tx=>warehouse.saveProof(tx,{orderId:rejected.id,reference:`WEB-${stamp}`,institution:'Banco de prueba',amount:rejected.totalWithTax,file:proof}));
        await connection.withTransaction(sellerCtx,tx=>warehouse.reviewPayment(tx,rejected.id,false,'El importe no fue acreditado'));
        assert.equal(await allocated(),1);
        const [rejection]=await connection.rawConnection.query(`SELECT sum(m.quantity)::int total FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1 AND m.type='RELEASE'`,[rejected.id]);
        assert.equal(rejection.total,3);
        console.log('PASS Shop API: retención real, sesiones, bloqueo de edición/pago, compensación en dos perchas, preparación, expiración idempotente y recuperación sin ampliar TTL.');
    }catch(error){console.error(workerLog.slice(-2000));throw error;}
    finally{
        await preparation.resume().catch(()=>{});await preparation.close();await expiration.close();
        if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,10000))]);if(child.exitCode===null){child.kill('SIGKILL');await closed;}}
        await app.close();await rm(files,{recursive:true,force:true});
    }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1);});
