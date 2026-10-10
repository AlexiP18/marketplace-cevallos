import { Administrator, Asset, Channel, DeepPartial, Seller, VendureEntity } from '@vendure/core';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import {
    BankAccount,
    BankAccountType,
    PaymentModalities,
    RegimenSri,
    SellerProfileStatus,
    SocialLinks,
} from '../types';

@Entity('seller_profile')
export class SellerProfile extends VendureEntity {
    constructor(input?: DeepPartial<SellerProfile>) {
        super(input);
    }

    // Relations with Vendure Core entities
    @OneToOne(() => Seller, { eager: true, onDelete: 'CASCADE' })
    @JoinColumn()
    seller: Seller;

    @OneToOne(() => Channel, { eager: true, onDelete: 'CASCADE' })
    @JoinColumn()
    channel: Channel;

    @ManyToOne(() => Administrator, { eager: true, onDelete: 'SET NULL', nullable: true })
    @JoinColumn()
    administrator?: Administrator | null;

    @ManyToOne(() => Asset, { eager: true, onDelete: 'SET NULL', nullable: true })
    @JoinColumn()
    logo?: Asset | null;

    // 1. Datos Negocio
    @Column({ type: 'varchar', length: 255 })
    businessName: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 255 })
    slug: string;

    @Column({ type: 'text', default: '' })
    address: string;

    @Column({ type: 'varchar', length: 50, default: '' })
    contactPhone: string;

    @Column({ type: 'simple-json', nullable: true })
    socialLinks: SocialLinks;

    // 2. Datos Tributación (Ecuador / SRI / JNDA)
    @Column({ type: 'boolean', default: false })
    obligadoContabilidad: boolean;

    @Index()
    @Column({ type: 'varchar', length: 20 })
    ruc: string;

    @Column({ type: 'varchar', length: 50, default: '' })
    taxContactPhone: string;

    @Column({ type: 'varchar', length: 50, default: RegimenSri.GENERAL })
    regimenSri: RegimenSri;

    @Column({ type: 'varchar', length: 100, nullable: true })
    calificacionArtesanalJnda?: string | null;

    // 3. Datos Propietario / Administrador Taller
    @Column({ type: 'varchar', length: 100 })
    adminFirstName: string;

    @Column({ type: 'varchar', length: 100 })
    adminLastName: string;

    @Column({ type: 'varchar', length: 255 })
    adminEmail: string;

    @Column({ type: 'varchar', length: 50, default: '' })
    adminPhone: string;

    // 4. Modalidades de Pago
    @Column({
        type: 'simple-json',
        default: () => "'{\"payphone\":false,\"deuna\":false,\"paypal\":false,\"transferenciaBancaria\":true,\"pagoEnLocal\":false}'",
    })
    paymentModalities: PaymentModalities;

    // 5. Datos Bancarios
    @Column({ type: 'simple-json' })
    primaryBankAccount: BankAccount;

    @Column({ type: 'boolean', default: false })
    hasSecondaryAccount: boolean;

    @Column({ type: 'simple-json', nullable: true })
    secondaryBankAccount?: BankAccount | null;

    // Estado y revisión
    @Column({ type: 'varchar', length: 30, default: SellerProfileStatus.PENDING_APPROVAL })
    status: SellerProfileStatus;

    @Column({ type: 'text', nullable: true })
    rejectionReason?: string | null;
}
