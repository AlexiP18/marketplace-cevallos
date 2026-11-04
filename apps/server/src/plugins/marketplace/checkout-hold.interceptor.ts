import { NestInterceptor, CallHandler, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { internal_getRequestContext } from '@vendure/core/dist/api/common/request-context';
import { CheckoutStockService } from './checkout-stock.service';

const shopEdits=new Set(['addItemToOrder','adjustOrderLine','removeOrderLine','removeAllOrderLines','setCustomerForOrder','setOrderCustomFields','setOrderShippingAddress','setOrderBillingAddress','setOrderShippingMethod','applyCouponCode','removeCouponCode','transitionOrderToState','addPaymentToOrder']);
const adminEdits=new Set(['modifyOrder','cancelOrder','transitionOrderToState','addManualPaymentToOrder']);
@Injectable()
export class CheckoutHoldInterceptor implements NestInterceptor {
    constructor(private stock:CheckoutStockService) {}
    async intercept(context:ExecutionContext,next:CallHandler) {
        if (context.getType<string>()!=='graphql') return next.handle();
        const gql=GqlExecutionContext.create(context),info=gql.getInfo();
        if (info?.operation.operation!=='mutation') return next.handle();
        const request=gql.getContext().req;
        const ctx=internal_getRequestContext(request,context);
        if (!ctx) return next.handle();
        const field=info.fieldName,args=gql.getArgs();
        if (ctx.apiType==='shop' && shopEdits.has(field)) await this.stock.assertEditable(ctx);
        else if (ctx.apiType==='admin' && adminEdits.has(field)) {
            const orderId=args.input?.orderId||args.orderId||(field==='transitionOrderToState'?args.id:undefined);
            if (orderId) await this.stock.assertEditable(ctx,Number(orderId));
        }
        return next.handle();
    }
}
