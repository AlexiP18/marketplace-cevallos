import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { EventBus, StockMovementEvent, TransactionalConnection, UserInputError } from '@vendure/core';
import { WarehouseShelf } from '../entities/warehouse-shelf.entity';
import { WarehouseMovementNote } from '../entities/warehouse-movement-note.entity';

@Injectable()
export class WarehouseStockSubscriber implements OnApplicationBootstrap {
    constructor(private events: EventBus, private connection: TransactionalConnection) {}

    onApplicationBootstrap() {
        this.events.registerBlockingEventHandler({
            event: StockMovementEvent,
            id: 'warehouse-kardex-actor',
            handler: async event => {
                const directAdjustments = event.stockMovements.filter(movement => movement.type === 'ADJUSTMENT');
                if (directAdjustments.length && !(event.ctx as typeof event.ctx & { warehouseStockWrite?: boolean }).warehouseStockWrite) {
                    const managed = await this.connection.getRepository(event.ctx, WarehouseShelf)
                        .createQueryBuilder('shelf')
                        .innerJoin('product_variant_channels_channel', 'variantChannel', '"variantChannel"."channelId" = "shelf"."channelId"')
                        .where('"variantChannel"."productVariantId" IN (:...ids)', { ids: directAdjustments.map(movement => movement.productVariant.id) })
                        .getExists();
                    if (managed) throw new UserInputError('Registra el stock en Bodega indicando una percha y una referencia.');
                }
                if ((event.ctx as typeof event.ctx & {warehouseNotesRecorded?:boolean}).warehouseNotesRecorded) return;
                const notes = event.stockMovements.map(movement => ({
                    stockMovementId: Number(movement.id), actorUserId: Number(event.ctx.activeUserId || 0),
                    operation: movement.type, reason: '',
                }));
                if (notes.length) await this.connection.getRepository(event.ctx, WarehouseMovementNote)
                    .createQueryBuilder().insert().values(notes).orIgnore().execute();
            },
        });
    }
}
