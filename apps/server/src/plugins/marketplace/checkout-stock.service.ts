import { Injectable } from '@nestjs/common';
import { ActiveOrderService, GlobalSettingsService, Order, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { MarketplaceCheckoutHold } from './marketplace-checkout-hold.entity';
import { StockRequest, WarehouseReservation } from '../warehouse/services/warehouse-reservation';

export type CheckoutRequest = {ctx:RequestContext; orderId:number};
export type StockDecision = {orderId:number; stockConfirmed:boolean; preparing?:boolean; processedAt?:number; decidedAt?:number; expiresAt?:string; errorCode?:string; message?:string};
const versionSql = `md5(o."updatedAt"::text||coalesce((SELECT string_agg(l.id::text||':'||l."updatedAt"::text||':'||l.quantity::text||':'||l."productVariantId"::text,',' ORDER BY l.id) FROM order_line l WHERE l."orderId"=o.id),''))`;

@Injectable()
export class CheckoutStockService {
    constructor(private connection:TransactionalConnection,private inventory:WarehouseReservation,private settings:GlobalSettingsService,private activeOrders:ActiveOrderService) {}
    get(ctx:RequestContext,orderId:number) {return this.connection.getRepository(ctx,MarketplaceCheckoutHold).findOneBy({orderId});}
    async version(ctx:RequestContext,orderId:number) {
        const [row]=await this.connection.getRepository(ctx,Order).query(`SELECT ${versionSql} AS version FROM "order" o WHERE o.id=$1`,[orderId]);
        return row?.version;
    }
    async assertEditable(ctx:RequestContext,orderId?:number) {
        const order=orderId ? {id:orderId} : await this.activeOrders.getActiveOrder(ctx,undefined);
        if (order && (await this.get(ctx,Number(order.id)))?.status==='PENDING') throw new UserInputError('El stock está reservado y el pedido se está preparando. Espera a que termine para continuar.');
    }
    async admit(requests:CheckoutRequest[],ttl:number) {
        if (!requests.length) return new Map<number,StockDecision>();
        return this.connection.withTransaction(requests[0].ctx,async tx=>{
            const repo=this.connection.getRepository(tx,Order),ids=[...new Set(requests.map(request=>request.orderId))].sort((a,b)=>a-b);
            const orders=await repo.query(`SELECT o.id,o.state,o.active,o."customerId",c."userId",${versionSql} AS version,
                h.status AS "holdStatus",h."expiresAt" AS "holdExpires",h.message AS "holdMessage",
                ARRAY(SELECT oc."channelId" FROM order_channels_channel oc WHERE oc."orderId"=o.id) AS channels,
                EXISTS(SELECT 1 FROM shipping_line sl WHERE sl."orderId"=o.id) AS shipping,
                ARRAY(SELECT r.status FROM marketplace_reservation r WHERE r."aggregateOrderId"=o.id) AS legacy,
                (SELECT min(r."expiresAt") FROM marketplace_reservation r WHERE r."aggregateOrderId"=o.id) AS "legacyExpires"
                FROM "order" o LEFT JOIN customer c ON c.id=o."customerId" LEFT JOIN marketplace_checkout_hold h ON h."orderId"=o.id
                WHERE o.id=ANY($1::int[]) ORDER BY o.id FOR UPDATE OF o`,[ids]);
            const lines=await repo.query(`SELECT l.id,l."orderId" AS "orderId",l."productVariantId" AS variant,l."sellerChannelId" AS channel,l.quantity,
                v.enabled AND p.enabled AND v."deletedAt" IS NULL AND p."deletedAt" IS NULL AS enabled,v."trackInventory" AS tracking,
                CASE WHEN v."useGlobalOutOfStockThreshold" THEN c."outOfStockThreshold" ELSE v."outOfStockThreshold" END AS threshold,
                sp.status='ACTIVE' AS seller,
                (SELECT count(*) FROM seller_profile owner JOIN product_variant_channels_channel vc ON vc."channelId"=owner."channelId" WHERE vc."productVariantId"=v.id) AS owners,
                ARRAY(SELECT vc."channelId" FROM product_variant_channels_channel vc JOIN product_channels_channel pc ON pc."productId"=p.id AND pc."channelId"=vc."channelId" WHERE vc."productVariantId"=v.id) AS channels
                FROM order_line l JOIN product_variant v ON v.id=l."productVariantId" JOIN product p ON p.id=v."productId"
                LEFT JOIN channel c ON c.id=l."sellerChannelId" LEFT JOIN seller_profile sp ON sp."channelId"=c.id
                WHERE l."orderId"=ANY($1::int[]) ORDER BY l.id`,[ids]);
            const globalTracking=(await this.settings.getSettings(tx)).trackInventory;
            const decisions=new Map<number,StockDecision>(),eligible:StockRequest[]=[];
            const unique=new Map(requests.map(request=>[request.orderId,request]));
            for (const request of unique.values()) {
                const order=orders.find((row:any)=>row.id===request.orderId);
                const existing=order?.holdStatus ? {status:order.holdStatus,expiresAt:order.holdExpires,message:order.holdMessage} : undefined;
                let message='';
                if (!order || !order.channels.includes(Number(request.ctx.channelId)) || (request.ctx.apiType==='shop' && Number(request.ctx.session?.activeOrderId)!==request.orderId && (!request.ctx.activeUserId || Number(request.ctx.activeUserId)!==order.userId))) message='El carrito no pertenece a esta sesión o canal.';
                else if (existing) {
                    const valid=existing.expiresAt>new Date() && (existing.status==='PENDING'||existing.status==='READY'&&order.legacy.length>0&&order.legacy.every((status:string)=>status==='PENDING'));
                    decisions.set(request.orderId,valid ? {orderId:request.orderId,stockConfirmed:true,preparing:existing.status==='PENDING',expiresAt:existing.expiresAt.toISOString()} : {orderId:request.orderId,stockConfirmed:false,errorCode:'RESERVATION_FAILED',message:existing.message||'La reserva anterior terminó. Inicia otro carrito.'});
                    continue;
                } else if (order.legacy.length) {
                    decisions.set(request.orderId,order.legacy.every((status:string)=>status==='PENDING') && order.legacyExpires>new Date() ? {orderId:request.orderId,stockConfirmed:true,expiresAt:order.legacyExpires.toISOString()} : {orderId:request.orderId,stockConfirmed:false,errorCode:'RESERVATION_FAILED',message:'La reserva anterior terminó. Inicia otro carrito.'});
                    continue;
                } else if (!order.active || !['AddingItems','ArrangingPayment'].includes(order.state) || !order.customerId || !order.shipping) message='Completa el cliente y el envío de un carrito activo antes de reservar.';
                const items=lines.filter((line:any)=>line.orderId===request.orderId);
                if (!items.length) message='El carrito está vacío.';
                if (items.some((line:any)=>!line.enabled||!line.seller||Number(line.owners)!==1||!line.channels.includes(line.channel)||!line.channels.includes(Number(request.ctx.channelId))||line.tracking==='FALSE'||line.tracking==='INHERIT'&&!globalTracking)) message='El carrito contiene calzado o un almacén no disponible para reservar.';
                if (message) decisions.set(request.orderId,{orderId:request.orderId,stockConfirmed:false,errorCode:'RESERVATION_FAILED',message});
                else eligible.push({orderId:request.orderId,actor:Number(request.ctx.activeUserId||0),channel:request.ctx.channel,lines:items});
            }
            const accepted=await this.inventory.allocate(tx,eligible),expiresAt=new Date(Date.now()+ttl);
            const created:MarketplaceCheckoutHold[]=[];
            for (const request of eligible) {
                if (accepted.has(request.orderId)) {
                    created.push(new MarketplaceCheckoutHold({orderId:request.orderId,expiresAt,status:'PENDING',message:'',cartVersion:orders.find((row:any)=>row.id===request.orderId).version,context:unique.get(request.orderId)!.ctx.serialize()}));
                    decisions.set(request.orderId,{orderId:request.orderId,stockConfirmed:true,preparing:true,expiresAt:expiresAt.toISOString()});
                } else decisions.set(request.orderId,{orderId:request.orderId,stockConfirmed:false,errorCode:'INSUFFICIENT_STOCK',message:'No hay suficientes pares en las perchas activas del almacén.'});
            }
            if (created.length) await this.connection.getRepository(tx,MarketplaceCheckoutHold).insert(created);
            return decisions;
        });
    }
}
