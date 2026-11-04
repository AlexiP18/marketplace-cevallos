import { Injectable } from '@nestjs/common';
import { Allocation, EventBus, Order, OrderLine, ProductVariant, Release, RequestContext, StockLocation, StockMovementEvent, TransactionalConnection } from '@vendure/core';

export type ReservationLine = {id:number; variant:number; channel:number; quantity:number; threshold:number};
export type StockRequest = {orderId:number; actor:number; channel:RequestContext['channel']; lines:ReservationLine[]};
type Balance = {id:number; variant:number; location:number; channel:number; available:number};

@Injectable()
export class WarehouseReservation {
    constructor(private connection: TransactionalConnection, private events: EventBus) {}

    async lockVariants(ctx: RequestContext, ids:number[]) {
        const sorted = [...new Set(ids)].sort((a,b)=>a-b);
        if (sorted.length) await this.connection.getRepository(ctx, Allocation).query('SELECT pg_advisory_xact_lock(id,0) FROM unnest($1::int[]) id ORDER BY id', [sorted]);
    }
    async allocate(ctx: RequestContext, requests:StockRequest[]) {
        const repo = this.connection.getRepository(ctx, Allocation);
        if (!repo.manager.queryRunner?.isTransactionActive) throw new Error('La reserva requiere una transacción.');
        const ids = requests.flatMap(request=>request.lines.map(line=>line.variant));
        await this.lockVariants(ctx,ids);
        const balances:Balance[] = ids.length ? await repo.query(`SELECT s.id,s."productVariantId" AS variant,s."stockLocationId" AS location,p."channelId" AS channel,
            greatest(0,s."stockOnHand"-s."stockAllocated")::int AS available
            FROM stock_level s JOIN warehouse_shelf p ON p."stockLocationId"=s."stockLocationId" AND p.active
            JOIN stock_location_channels_channel lc ON lc."stockLocationId"=s."stockLocationId" AND lc."channelId"=p."channelId"
            JOIN product_variant_channels_channel vc ON vc."productVariantId"=s."productVariantId" AND vc."channelId"=p."channelId"
            WHERE s."productVariantId"=ANY($1::int[]) ORDER BY s."productVariantId",s."stockLocationId" FOR UPDATE OF s`,[[...new Set(ids)]]) : [];
        const accepted = new Set<number>(), movements:Allocation[] = [], actors:number[] = [], contexts:RequestContext['channel'][]=[], deltas = new Map<number,number>();
        for (const request of requests) {
            const pending = new Map<number,number>(), allocations:Allocation[]=[];
            let sufficient = true;
            for (const line of request.lines) {
                if (!Number.isSafeInteger(line.quantity) || line.quantity<=0) {sufficient=false;break;}
                const locations = balances.filter(row=>row.variant===line.variant && row.channel===line.channel);
                const available = locations.reduce((sum,row)=>sum+row.available-(pending.get(row.id)||0),0);
                if (available-Math.max(0,line.threshold)<line.quantity) {sufficient=false;break;}
                let remaining=line.quantity;
                for (const row of locations) {
                    const quantity=Math.min(remaining,row.available-(pending.get(row.id)||0));
                    if (quantity<=0) continue;
                    pending.set(row.id,(pending.get(row.id)||0)+quantity); remaining-=quantity;
                    allocations.push(new Allocation({quantity,productVariant:new ProductVariant({id:line.variant}),stockLocation:new StockLocation({id:row.location}),orderLine:new OrderLine({id:line.id})}));
                    if (!remaining) break;
                }
            }
            if (!sufficient) continue;
            accepted.add(request.orderId);
            for (const [id,quantity] of pending) {
                balances.find(row=>row.id===id)!.available-=quantity;
                deltas.set(id,(deltas.get(id)||0)+quantity);
            }
            movements.push(...allocations); actors.push(...allocations.map(()=>request.actor));
            contexts.push(...allocations.map(()=>request.channel));
        }
        if (movements.length) {
            const input=movements.map((movement,index)=>({line:Number(movement.orderLine.id),variant:Number(movement.productVariant.id),location:Number(movement.stockLocation.id),quantity:movement.quantity,actor:actors[index]}));
            const [written]=await repo.query(`WITH input AS MATERIALIZED (
                SELECT * FROM jsonb_to_recordset($1::jsonb) AS i(line int,variant int,location int,quantity int,actor int)
            ), movements AS (
                INSERT INTO stock_movement(type,discriminator,quantity,"productVariantId","stockLocationId","orderLineId")
                SELECT 'ALLOCATION','Allocation',quantity,variant,location,line FROM input
                RETURNING id,"productVariantId" AS variant,"stockLocationId" AS location,"orderLineId" AS line
            ), notes AS (
                INSERT INTO warehouse_movement_note("stockMovementId","actorUserId",operation,reason)
                SELECT m.id,i.actor,'RESERVA_TEMPORAL','Retención FIFO del checkout'
                FROM movements m JOIN input i USING(line,variant,location)
            ), balances AS (
                UPDATE stock_level s SET "stockAllocated"=s."stockAllocated"+d.quantity,"updatedAt"=now()
                FROM jsonb_to_recordset($2::jsonb) AS d(id int,quantity int)
                WHERE s.id=d.id AND s."stockAllocated">=0 AND s."stockOnHand"-s."stockAllocated">=d.quantity RETURNING s.id
            ) SELECT (SELECT count(*)::int FROM balances) AS updated,(SELECT jsonb_agg(m) FROM movements m) AS movements`,
                [JSON.stringify(input),JSON.stringify([...deltas].map(([id,quantity])=>({id,quantity})))]);
            if(written.updated!==deltas.size) throw new Error('El inventario tiene saldos inconsistentes.');
            const ids=new Map<string,number>(written.movements.map((row:any)=>[`${row.line}:${row.variant}:${row.location}`,row.id]));
            movements.forEach((movement,index)=>{const row=input[index];movement.id=ids.get(`${row.line}:${row.variant}:${row.location}`)!;});
            for(const id of new Set(contexts.map(channel=>channel.id))){
                const eventCtx=ctx.copy(contexts.find(channel=>channel.id===id)) as RequestContext & {warehouseNotesRecorded?:boolean};
                eventCtx.warehouseNotesRecorded=true;
                await this.events.publish(new StockMovementEvent(eventCtx,movements.filter((_,index)=>contexts[index].id===id)));
            }
        }
        return accepted;
    }

    async transfer(ctx:RequestContext,parent:Order,children:Order[]) {
        const mapping=new Map<number,number>();
        for(const child of children) {
            const originals=parent.lines.filter(line=>String(line.sellerChannelId)===String(child.lines[0]?.sellerChannelId));
            if(originals.length!==child.lines.length) throw new Error('La preparación cambió los pares reservados.');
            child.lines.forEach((line,index)=>{
                const original=originals[index];
                if(String(original.productVariantId)!==String(line.productVariantId)||original.quantity!==line.quantity) throw new Error('La preparación cambió los pares reservados.');
                mapping.set(Number(original.id),Number(line.id));
            });
        }
        const rows=await this.connection.getRepository(ctx,Allocation).query(`SELECT m."productVariantId" AS variant,m."stockLocationId" AS location,m."orderLineId" AS line,
            sum(CASE m.type WHEN 'ALLOCATION' THEN m.quantity WHEN 'RELEASE' THEN -m.quantity WHEN 'SALE' THEN -m.quantity ELSE 0 END)::int AS quantity
            FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" JOIN warehouse_shelf p ON p."stockLocationId"=m."stockLocationId" AND p.active
            WHERE l."orderId"=$1 GROUP BY m."productVariantId",m."stockLocationId",m."orderLineId"
            HAVING sum(CASE m.type WHEN 'ALLOCATION' THEN m.quantity WHEN 'RELEASE' THEN -m.quantity WHEN 'SALE' THEN -m.quantity ELSE 0 END)>0`,[parent.id]);
        for(const line of parent.lines) {
            if(!mapping.has(Number(line.id))||rows.filter((row:any)=>row.line===Number(line.id)).reduce((sum:number,row:any)=>sum+row.quantity,0)!==line.quantity) throw new Error('La retención física ya no coincide con los pares del carrito.');
        }
        const releases=rows.map((row:any)=>new Release({quantity:row.quantity,productVariant:new ProductVariant({id:row.variant}),stockLocation:new StockLocation({id:row.location}),orderLine:new OrderLine({id:row.line})}));
        const allocations=rows.map((row:any)=>new Allocation({quantity:row.quantity,productVariant:new ProductVariant({id:row.variant}),stockLocation:new StockLocation({id:row.location}),orderLine:new OrderLine({id:mapping.get(row.line)!})}));
        const released=await this.connection.getRepository(ctx,Release).insert(releases);
        const allocated=await this.connection.getRepository(ctx,Allocation).insert(allocations);
        releases.forEach((movement:Release,index:number)=>Object.assign(movement,released.identifiers[index]));
        allocations.forEach((movement:Allocation,index:number)=>Object.assign(movement,allocated.identifiers[index]));
        // Ownership changes inside the transaction; the physical stock counters remain reserved throughout.
        await this.events.publish(new StockMovementEvent(ctx,[...releases,...allocations]));
    }

    async release(ctx:RequestContext,orderId:number) {
        const repo=this.connection.getRepository(ctx,Release);
        if(!repo.manager.queryRunner?.isTransactionActive) throw new Error('La liberación requiere una transacción.');
        const rows=await repo.query(`SELECT m."productVariantId" AS variant,m."stockLocationId" AS location,m."orderLineId" AS line,
            sum(CASE m.type WHEN 'ALLOCATION' THEN m.quantity WHEN 'RELEASE' THEN -m.quantity WHEN 'SALE' THEN -m.quantity ELSE 0 END)::int AS quantity
            FROM stock_movement m JOIN order_line l ON l.id=m."orderLineId" WHERE l."orderId"=$1
            GROUP BY m."productVariantId",m."stockLocationId",m."orderLineId"
            HAVING sum(CASE m.type WHEN 'ALLOCATION' THEN m.quantity WHEN 'RELEASE' THEN -m.quantity WHEN 'SALE' THEN -m.quantity ELSE 0 END)>0`,[orderId]);
        await this.lockVariants(ctx,rows.map((row:any)=>row.variant));
        if (!rows.length) return;
        await repo.query('SELECT id FROM stock_level WHERE "productVariantId"=ANY($1::int[]) ORDER BY "productVariantId","stockLocationId" FOR UPDATE',[rows.map((row:any)=>row.variant)]);
        const movements=rows.map((row:any)=>new Release({quantity:row.quantity,productVariant:new ProductVariant({id:row.variant}),stockLocation:new StockLocation({id:row.location}),orderLine:new OrderLine({id:row.line})}));
        const inserted=await repo.insert(movements);
        movements.forEach((movement:Release,index:number)=>Object.assign(movement,inserted.identifiers[index]));
        const updated=await repo.query(`UPDATE stock_level s SET "stockAllocated"=s."stockAllocated"-d.quantity,"updatedAt"=now()
            FROM (SELECT variant,location,sum(quantity)::int quantity FROM jsonb_to_recordset($1::jsonb) AS x(variant int,location int,quantity int) GROUP BY variant,location) d
            WHERE s."productVariantId"=d.variant AND s."stockLocationId"=d.location AND s."stockAllocated">=d.quantity RETURNING s.id`,[JSON.stringify(rows)]);
        if(updated[1]!==new Set(rows.map((row:any)=>`${row.variant}:${row.location}`)).size) throw new Error('La retención no coincide con el saldo reservado.');
        await this.events.publish(new StockMovementEvent(ctx,movements));
    }
}
