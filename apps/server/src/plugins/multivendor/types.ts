import { CurrencyCode, LanguageCode, Permission } from '@vendure/core';

export enum RegimenSri {
    GENERAL = 'GENERAL',
    RIMPE_EMPRENDEDOR = 'RIMPE_EMPRENDEDOR',
    RIMPE_NEGOCIO_POPULAR = 'RIMPE_NEGOCIO_POPULAR',
    OTRO = 'OTRO',
}

export enum BankAccountType {
    AHORROS = 'AHORROS',
    CORRIENTE = 'CORRIENTE',
}

export enum SellerProfileStatus {
    PENDING_APPROVAL = 'PENDING_APPROVAL',
    ACTIVE = 'ACTIVE',
    REJECTED = 'REJECTED',
    SUSPENDED = 'SUSPENDED',
}

export interface SocialLinks {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    whatsapp?: string;
    website?: string;
}

export interface PaymentModalities {
    payphone: boolean;
    deuna: boolean;
    paypal: boolean;
    transferenciaBancaria: boolean;
    pagoEnLocal: boolean;
}

export interface BankAccount {
    bankName: string;
    accountType: BankAccountType;
    accountNumber: string;
    accountHolderName?: string;
    accountHolderId?: string;
}

export interface MultivendorPluginOptions {
    /**
     * If true, newly registered sellers are automatically marked as ACTIVE.
     * If false, they will have status PENDING_APPROVAL until an administrator approves them.
     * Default: false
     */
    autoApproveSellers?: boolean;

    /**
     * Custom permissions for the generated seller role.
     * If omitted, default seller management permissions will be granted.
     */
    sellerPermissions?: Permission[];

    /**
     * Default currency for new seller channels. Falls back to default channel currency.
     */
    defaultCurrencyCode?: CurrencyCode;

    /**
     * Default language for new seller channels. Falls back to default channel language.
     */
    defaultLanguageCode?: LanguageCode;
}

export interface BusinessDataInput {
    logoAssetId?: string | number;
    name: string;
    slug: string;
    address: string;
    contactPhone: string;
    socialLinks?: SocialLinks;
}

export interface TaxDataInput {
    obligadoContabilidad: boolean;
    ruc: string;
    contactPhone: string;
    regimenSri: RegimenSri;
    calificacionArtesanalJnda?: string;
}

export interface AdministratorDataInput {
    firstName: string;
    lastName: string;
    emailAddress: string;
    password: string;
    confirmPassword: string;
    contactPhone: string;
}

export interface RegisterSellerInput {
    business: BusinessDataInput;
    tax: TaxDataInput;
    administrator: AdministratorDataInput;
    paymentModalities: PaymentModalities;
    primaryBankAccount: BankAccount;
    secondaryBankAccount?: BankAccount;
}

export interface UpdateSellerProfileInput {
    id: string | number;
    business?: Partial<BusinessDataInput>;
    tax?: Partial<TaxDataInput>;
    paymentModalities?: Partial<PaymentModalities>;
    primaryBankAccount?: Partial<BankAccount>;
    hasSecondaryAccount?: boolean;
    secondaryBankAccount?: Partial<BankAccount>;
}
