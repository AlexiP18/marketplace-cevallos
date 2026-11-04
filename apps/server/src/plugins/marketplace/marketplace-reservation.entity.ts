import { Channel, DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('marketplace_reservation')
@Unique('marketplace_reservation_order_unique', ['orderId'])
@Index('marketplace_reservation_pending_idx', { synchronize: false })
export class MarketplaceReservation extends VendureEntity {
    constructor(input?: DeepPartial<MarketplaceReservation>) { super(input); }
    @Column() orderId: number;
    @Column() aggregateOrderId: number;
    @Column() channelId: number;
    @ManyToOne(() => Order, { nullable: false })
    @JoinColumn({ name: 'orderId', foreignKeyConstraintName: 'marketplace_reservation_orderId_fkey' }) order: Order;
    @ManyToOne(() => Order, { nullable: false })
    @JoinColumn({ name: 'aggregateOrderId', foreignKeyConstraintName: 'marketplace_reservation_aggregateOrderId_fkey' }) aggregateOrder: Order;
    @ManyToOne(() => Channel, { nullable: false })
    @JoinColumn({ name: 'channelId', foreignKeyConstraintName: 'marketplace_reservation_channelId_fkey' }) channel: Channel;
    @Column({ type: 'timestamptz' }) expiresAt: Date;
    @Column({ default: 'PENDING' }) status: string;
}
