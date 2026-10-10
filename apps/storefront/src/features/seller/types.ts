export type RegimenSri = 'GENERAL' | 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR' | 'OTRO';
export type BankAccountType = 'AHORROS' | 'CORRIENTE';
export type SellerProfileStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

export interface SocialLinksInput {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    whatsapp?: string;
    website?: string;
}

export interface BusinessDataInput {
    name: string;
    slug: string;
    address: string;
    contactPhone: string;
    socialLinks?: SocialLinksInput;
    logoAssetId?: string;
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

export interface PaymentModalitiesInput {
    payphone: boolean;
    deuna: boolean;
    paypal: boolean;
    transferenciaBancaria: boolean;
    pagoEnLocal: boolean;
}

export interface BankAccountInput {
    bankName: string;
    accountType: BankAccountType;
    accountNumber: string;
    accountHolderName?: string;
    accountHolderId?: string;
}

export interface RegisterSellerInput {
    business: BusinessDataInput;
    tax: TaxDataInput;
    administrator: AdministratorDataInput;
    paymentModalities: PaymentModalitiesInput;
    primaryBankAccount: BankAccountInput;
    secondaryBankAccount?: BankAccountInput;
}

export interface RegisteredSellerProfile {
    id: string;
    businessName: string;
    slug: string;
    address: string;
    contactPhone: string;
    status: SellerProfileStatus;
    paymentModalities: {
        payphone: boolean;
        deuna: boolean;
        paypal: boolean;
        transferenciaBancaria: boolean;
        pagoEnLocal: boolean;
    };
}

export interface RegisterSellerResult {
    success: boolean;
    message: string;
    profile?: RegisteredSellerProfile;
    error?: string;
}
