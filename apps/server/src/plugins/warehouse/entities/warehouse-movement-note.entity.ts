import { DeepPartial, StockMovement, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('warehouse_movement_note')
export class WarehouseMovementNote extends VendureEntity {
    constructor(input?: DeepPartial<WarehouseMovementNote>) { super(input); }

    @Index('warehouse_movement_note_stockMovementId_key', { unique: true })
    @Column({ type: 'int' })
    stockMovementId: number;

    @ManyToOne(() => StockMovement, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'stockMovementId', foreignKeyConstraintName: 'warehouse_movement_note_stockMovementId_fkey' })
    stockMovement: StockMovement;

    @Column({ type: 'int' })
    actorUserId: number;

    @Column({ type: 'varchar', length: 32 })
    operation: string;

    @Column({ type: 'varchar', length: 500 })
    reason: string;
}
