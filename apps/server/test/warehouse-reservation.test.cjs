const path=require('node:path');
require('ts-node').register({project:path.join(__dirname,'../tsconfig.json'),transpileOnly:true});
const test=require('node:test'),assert=require('node:assert/strict');
const {Channel,RequestContext}=require('@vendure/core');
const {WarehouseReservation}=require('../src/plugins/warehouse/services/warehouse-reservation');

function fixture(){
    const events=[],writes=[];
    const repo={manager:{queryRunner:{isTransactionActive:true}},query:async(sql,args)=>{
        if(sql.startsWith('SELECT pg_advisory'))return [];
        if(sql.startsWith('SELECT s.id'))return [{id:1,variant:1,location:10,channel:2,available:2},{id:2,variant:2,location:20,channel:3,available:1}];
        assert.ok(sql.startsWith('WITH input'));
        const input=JSON.parse(args[0]),deltas=JSON.parse(args[1]);writes.push({input,deltas});
        return [{updated:deltas.length,movements:input.map((row,index)=>({...row,id:101+index}))}];
    }};
    const service=new WarehouseReservation({getRepository:()=>repo},{publish:async event=>events.push(event)});
    const channel=id=>new Channel({id,code:`channel-${id}`,defaultLanguageCode:'en',defaultCurrencyCode:'USD'});
    const ctx=new RequestContext({apiType:'shop',channel:channel(1),isAuthorized:true,authorizedAsOwnerOnly:true});
    return {service,ctx,events,writes,channel};
}
test('el lote conserva actores y publica eventos por canal dentro del contexto transaccional',async()=>{
    const {service,ctx,events,writes,channel}=fixture();
    const accepted=await service.allocate(ctx,[
        {orderId:1,actor:7,channel:channel(1),lines:[{id:11,variant:1,channel:2,quantity:1,threshold:0}]},
        {orderId:2,actor:8,channel:channel(3),lines:[{id:12,variant:2,channel:3,quantity:1,threshold:0}]},
    ]);
    assert.deepEqual([...accepted],[1,2]);
    assert.deepEqual(writes[0].input.map(row=>row.actor),[7,8]);
    assert.deepEqual(events.map(event=>[event.ctx.channelId,event.stockMovements.map(movement=>movement.id)]),[[1,[101]],[3,[102]]]);
    assert.ok(events.every(event=>event.ctx.warehouseNotesRecorded));
});
test('un carrito insuficiente no consume saldo parcial ni bloquea al siguiente en FIFO',async()=>{
    const {service,ctx,writes,channel}=fixture();
    const accepted=await service.allocate(ctx,[
        {orderId:1,actor:7,channel:channel(1),lines:[{id:11,variant:1,channel:2,quantity:2,threshold:0},{id:12,variant:2,channel:3,quantity:2,threshold:0}]},
        {orderId:2,actor:8,channel:channel(1),lines:[{id:13,variant:1,channel:2,quantity:2,threshold:0}]},
    ]);
    assert.deepEqual([...accepted],[2]);
    assert.deepEqual(writes[0].deltas,[{id:1,quantity:2}]);
    assert.deepEqual(writes[0].input.map(row=>row.line),[13]);
});
