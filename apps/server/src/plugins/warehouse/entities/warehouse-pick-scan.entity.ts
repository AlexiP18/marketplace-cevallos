import { DeepPartial, Order, OrderLine, ProductVariant, StockLocation, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { LabelCode } from '../../labeling/entities/label-code.entity';

@Entity('warehouse_pick_scan')
@Index('warehouse_pick_scan_line_location_idx', ['orderLineId', 'stockLocationId'])
@Unique('warehouse_pick_scan_scanCode_key', ['scanCode'])
export class WarehousePickScan extends VendureEntity {
    constructor(input?: DeepPartial<WarehousePickScan>) { super(input); }

    @Column({ type: 'varchar', length: 100, nullable: true })
    scanCode: string | null;

    @Index('warehouse_pick_scan_label_unique', { unique: true, where: '"labelCodeId" IS NOT NULL' })
    @Column({ type: 'int', nullable: true }) labelCodeId: number | null;
    @ManyToOne(() => LabelCode, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'labelCodeId', foreignKeyConstraintName: 'warehouse_pick_scan_labelCodeId_fkey' }) labelCode: LabelCode | null;

    @Index('warehouse_pick_scan_order_idx')
    @Column({ type: 'int' })
    orderId: number;

    @ManyToOne(() => Order, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'orderId', foreignKeyConstraintName: 'warehouse_pick_scan_orderId_fkey' })
    order: Order;

    @Column({ type: 'int' })
    orderLineId: number;

    @ManyToOne(() => OrderLine, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'orderLineId', foreignKeyConstraintName: 'warehouse_pick_scan_orderLineId_fkey' })
    orderLine: OrderLine;

    @Column({ type: 'int' })
    productVariantId: number;

    @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'productVariantId', foreignKeyConstraintName: 'warehouse_pick_scan_productVariantId_fkey' })
    productVariant: ProductVariant;

    @Column({ type: 'int' })
    stockLocationId: number;

    @ManyToOne(() => StockLocation, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'stockLocationId', foreignKeyConstraintName: 'warehouse_pick_scan_stockLocationId_fkey' })
    stockLocation: StockLocation;

    @Column({ type: 'int' })
    actorUserId: number;
}
