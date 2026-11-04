import { Channel, DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('warehouse_order_operation')
@Unique('warehouse_order_operation_channelId_orderId_key', ['channelId', 'orderId'])
export class WarehouseOrderOperation extends VendureEntity {
    constructor(input?: DeepPartial<WarehouseOrderOperation>) { super(input); }
    @Column() channelId: number;
    @Column() orderId: number;
    @ManyToOne(() => Channel, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'warehouse_order_operation_channelId_fkey' })
    channel: Channel;
    @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'orderId', foreignKeyConstraintName: 'warehouse_order_operation_orderId_fkey' })
    order: Order;
    @Column({ type: 'jsonb', default: {} }) details: Record<string, any>;
    @Column({ type: 'text', select: false, default: '' }) proof: string;
}
