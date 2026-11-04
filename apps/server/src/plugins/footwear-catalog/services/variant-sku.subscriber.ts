import { Injectable, OnModuleInit } from '@nestjs/common';
import { ProductVariant, TransactionalConnection, UserInputError } from '@vendure/core';
import { Check, EntitySubscriberInterface, Index, InsertEvent, UpdateEvent } from 'typeorm';
import { randomUUID } from 'node:crypto';

Index('product_variant_sku_unique', { synchronize: false })(ProductVariant);
Check('product_variant_sku_format', "sku ~ '^[A-Z0-9][A-Z0-9._-]{0,159}$'")(ProductVariant);

@Injectable()
export class VariantSkuSubscriber implements EntitySubscriberInterface<ProductVariant>, OnModuleInit {
    constructor(private connection: TransactionalConnection) {}
    onModuleInit() {
        const subscribers = this.connection.rawConnection.subscribers;
        if (!subscribers.some(subscriber => subscriber instanceof VariantSkuSubscriber)) subscribers.push(this);
    }
    listenTo() { return ProductVariant; }
    beforeInsert(event: InsertEvent<ProductVariant>) {
        event.entity.sku = `PV-${randomUUID().replace(/-/g, '').toUpperCase()}`;
        event.entity.customFields = { ...event.entity.customFields, codigoBarras: event.entity.sku };
    }
    beforeUpdate(event: UpdateEvent<ProductVariant>) {
        if (event.entity?.sku !== undefined && event.entity.sku !== event.databaseEntity?.sku) throw new UserInputError('El SKU se genera automáticamente y no se puede modificar.');
    }
}
