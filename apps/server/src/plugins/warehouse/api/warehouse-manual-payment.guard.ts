import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserInputError } from '@vendure/core';

@Injectable()
export class WarehouseManualPaymentGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        if (context.getType<string>() === 'graphql' && GqlExecutionContext.create(context).getInfo()?.fieldName === 'addManualPaymentToOrder') {
            // Internal Vendure calls still distribute verified gateway payments between seller orders.
            throw new UserInputError('Valida el comprobante del pago manual en Bodega, en Pagos y despacho.');
        }
        return true;
    }
}
