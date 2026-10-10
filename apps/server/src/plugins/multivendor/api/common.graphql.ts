import gql from 'graphql-tag';

export const commonApiExtensions = gql`
    enum RegimenSri {
        GENERAL
        RIMPE_EMPRENDEDOR
        RIMPE_NEGOCIO_POPULAR
        OTRO
    }

    enum BankAccountType {
        AHORROS
        CORRIENTE
    }

    enum SellerProfileStatus {
        PENDING_APPROVAL
        ACTIVE
        REJECTED
        SUSPENDED
    }

    type SocialLinks {
        facebook: String
        instagram: String
        tiktok: String
        whatsapp: String
        website: String
    }

    input SocialLinksInput {
        facebook: String
        instagram: String
        tiktok: String
        whatsapp: String
        website: String
    }

    type PaymentModalities {
        payphone: Boolean!
        deuna: Boolean!
        paypal: Boolean!
        transferenciaBancaria: Boolean!
        pagoEnLocal: Boolean!
    }

    input PaymentModalitiesInput {
        payphone: Boolean!
        deuna: Boolean!
        paypal: Boolean!
        transferenciaBancaria: Boolean!
        pagoEnLocal: Boolean!
    }

    type BankAccount {
        bankName: String!
        accountType: BankAccountType!
        accountNumber: String!
        accountHolderName: String
        accountHolderId: String
    }

    input BankAccountInput {
        bankName: String!
        accountType: BankAccountType!
        accountNumber: String!
        accountHolderName: String
        accountHolderId: String
    }

    type PublicSellerProfile implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        businessName: String!
        slug: String!
        address: String!
        contactPhone: String!
        socialLinks: SocialLinks
        paymentModalities: PaymentModalities!
        logo: Asset
        status: SellerProfileStatus!
    }

    type PublicSellerProfileList implements PaginatedList {
        items: [PublicSellerProfile!]!
        totalItems: Int!
    }

    input SellerProfileFilterParameter {
        status: StringOperators
        slug: StringOperators
        businessName: StringOperators
    }

    input SellerProfileSortParameter {
        id: SortOrder
        createdAt: SortOrder
        updatedAt: SortOrder
        businessName: SortOrder
        slug: SortOrder
        status: SortOrder
    }

    input SellerProfileListOptions {
        skip: Int
        take: Int
        sort: SellerProfileSortParameter
        filter: SellerProfileFilterParameter
    }

    input BusinessDataInput {
        logoAssetId: ID
        name: String!
        slug: String!
        address: String!
        contactPhone: String!
        socialLinks: SocialLinksInput
    }

    input TaxDataInput {
        obligadoContabilidad: Boolean!
        ruc: String!
        contactPhone: String!
        regimenSri: RegimenSri!
        calificacionArtesanalJnda: String
    }

    input AdministratorDataInput {
        firstName: String!
        lastName: String!
        emailAddress: String!
        password: String!
        confirmPassword: String!
        contactPhone: String!
    }

    input RegisterSellerInput {
        business: BusinessDataInput!
        tax: TaxDataInput!
        administrator: AdministratorDataInput!
        paymentModalities: PaymentModalitiesInput!
        primaryBankAccount: BankAccountInput!
        secondaryBankAccount: BankAccountInput
    }

    type RegisterSellerResult {
        success: Boolean!
        message: String!
        profile: PublicSellerProfile
    }
`;
