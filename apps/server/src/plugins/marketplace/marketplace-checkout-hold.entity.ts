import { DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('marketplace_checkout_hold')
export class MarketplaceCheckoutHold extends VendureEntity {
    constructor(input?: DeepPartial<MarketplaceCheckoutHold>) { super(input); }
    @Index('IDX_checkout_hold_order',{ unique: true }) @Column() orderId: number;
    @ManyToOne(() => Order, { nullable: false }) @JoinColumn({name:'orderId',foreignKeyConstraintName:'marketplace_checkout_hold_orderId_fkey'}) order: Order;
    @Column({type:'timestamptz'}) expiresAt: Date;
    @Column({length:255}) status: 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED';
    @Column({type:'text',default:''}) message: string;
    @Column({length:255}) cartVersion: string;
    @Column({type:'jsonb',nullable:true}) context: ReturnType<import('@vendure/core').RequestContext['serialize']> | null;
}
