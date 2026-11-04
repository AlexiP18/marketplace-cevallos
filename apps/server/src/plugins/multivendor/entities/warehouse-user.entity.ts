import { Administrator, DeepPartial, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { SellerProfile } from './seller-profile.entity';

export type WarehouseRole = 'ADMINISTRADOR' | 'BODEGUERO' | 'DESPACHADOR';

@Entity('warehouse_user')
export class WarehouseUser extends VendureEntity {
    constructor(input?: DeepPartial<WarehouseUser>) { super(input); }

    @ManyToOne(() => SellerProfile, { onDelete: 'CASCADE' })
    @JoinColumn()
    sellerProfile: SellerProfile;

    @Index({ unique: true })
    @OneToOne(() => Administrator, { onDelete: 'CASCADE' })
    @JoinColumn()
    administrator: Administrator;

    @Column({ type: 'varchar', length: 20 })
    role: WarehouseRole;
}
