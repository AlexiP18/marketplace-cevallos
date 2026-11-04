import { Channel, DeepPartial, StockLocation, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('warehouse_shelf')
@Index('warehouse_shelf_channel_code_key', ['channel', 'code'], { unique: true })
export class WarehouseShelf extends VendureEntity {
    constructor(input?: DeepPartial<WarehouseShelf>) { super(input); }

    @ManyToOne(() => Channel, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ foreignKeyConstraintName: 'warehouse_shelf_channel_fk' })
    channel: Channel;

    @Index('warehouse_shelf_stock_location_unique', { unique: true })
    @ManyToOne(() => StockLocation, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ foreignKeyConstraintName: 'warehouse_shelf_stockLocationId_fkey' })
    stockLocation: StockLocation;

    @Column({ type: 'varchar', length: 60 })
    code: string;

    @Column({ type: 'varchar', length: 255, default: '' })
    description: string;

    @Column({ type: 'boolean', default: true })
    active: boolean;
}
