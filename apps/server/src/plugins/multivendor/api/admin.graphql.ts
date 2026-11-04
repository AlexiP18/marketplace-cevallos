import gql from 'graphql-tag';
import { commonApiExtensions } from './common.graphql';

export const adminApiExtensions = gql`
    ${commonApiExtensions}

    type FinancialInstitution { id: ID! name: String! kind: String! ruc: String active: Boolean! }
    input SaveFinancialInstitutionInput { id: ID name: String! kind: String! ruc: String active: Boolean! }
    type AdministratorPersonalData { phone: String photo: Asset }
    input UpdateMyPersonalDataInput { phone: String photoAssetId: ID }

    enum WarehouseRole { ADMINISTRADOR BODEGUERO DESPACHADOR }
    type WarehouseUser { id: ID! firstName: String! lastName: String! emailAddress: String! role: WarehouseRole! owner: Boolean! }
    type WarehouseUsers { businessName: String! owner: WarehouseUser users: [WarehouseUser!]! }
    input SaveWarehouseUserInput { id: ID firstName: String! lastName: String! emailAddress: String! password: String role: WarehouseRole! }

    type SellerProfile implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        seller: Seller!
        channel: Channel!
        administrator: Administrator
        logo: Asset
        administratorPhoto: Asset

        # 1. Datos Negocio
        businessName: String!
        slug: String!
        address: String!
        contactPhone: String!
        socialLinks: SocialLinks

        # 2. Datos Tributación (Ecuador / SRI / JNDA)
        obligadoContabilidad: Boolean!
        ruc: String!
        taxContactPhone: String!
        regimenSri: RegimenSri!
        calificacionArtesanalJnda: String

        # 3. Datos Administrador
        adminFirstName: String!
        adminLastName: String!
        adminEmail: String!
        adminPhone: String!

        # 4. Modalidades de Pago
        paymentModalities: PaymentModalities!

        # 5. Datos Bancarios
        primaryBankAccount: BankAccount!
        hasSecondaryAccount: Boolean!
        secondaryBankAccount: BankAccount

        # Estado y revisión
        status: SellerProfileStatus!
        rejectionReason: String
    }

    type SellerProfileList implements PaginatedList {
        items: [SellerProfile!]!
        totalItems: Int!
    }

    input UpdateSellerProfileBusinessInput {
        logoAssetId: ID
        name: String
        address: String
        contactPhone: String
        socialLinks: SocialLinksInput
    }

    input UpdateSellerProfileTaxInput {
        obligadoContabilidad: Boolean
        ruc: String
        contactPhone: String
        regimenSri: RegimenSri
        calificacionArtesanalJnda: String
    }

    input UpdateSellerProfileAdministratorInput {
        firstName: String
        lastName: String
        emailAddress: String
        contactPhone: String
        photoAssetId: ID
    }

    input UpdateSellerProfileInput {
        id: ID!
        business: UpdateSellerProfileBusinessInput
        tax: UpdateSellerProfileTaxInput
        administrator: UpdateSellerProfileAdministratorInput
        paymentModalities: PaymentModalitiesInput
        primaryBankAccount: BankAccountInput
        hasSecondaryAccount: Boolean
        secondaryBankAccount: BankAccountInput
    }

    extend type Query {
        myAdministratorPersonalData: AdministratorPersonalData
        warehouseUsers: WarehouseUsers!
        financialInstitutions: [FinancialInstitution!]!
        """
        Lists all registered seller profiles with pagination, filtering and sorting.
        """
        sellerProfiles(options: SellerProfileListOptions): SellerProfileList!

        """
        Retrieves a single seller profile by ID.
        """
        sellerProfile(id: ID!): SellerProfile

        """
        Retrieves the seller profile belonging to the currently authenticated administrator.
        """
        currentSellerProfile: SellerProfile

        """Preferencia de envío del almacén asociado al canal activo."""
        channelCombinedShippingPreference: Boolean

        """Returns whether an administrator email can be used for a new seller."""
        sellerEmailAvailable(email: String!): Boolean!
    }

    extend type Mutation {
        setChannelCombinedShippingPreference(enabled: Boolean!): Boolean!
        updateMyAdministratorPersonalData(input: UpdateMyPersonalDataInput!): AdministratorPersonalData!
        saveWarehouseUser(input: SaveWarehouseUserInput!): WarehouseUser!
        removeWarehouseUser(id: ID!): Boolean!
        saveFinancialInstitution(input: SaveFinancialInstitutionInput!): FinancialInstitution!
        """Creates and activates a seller with its channel, role and administrator."""
        createSellerProfile(input: RegisterSellerInput!): SellerProfile!

        """
        Updates an existing seller profile.
        """
        updateSellerProfile(input: UpdateSellerProfileInput!): SellerProfile!

        """
        Approves a pending seller profile and marks it as ACTIVE.
        """
        approveSellerProfile(id: ID!): SellerProfile!

        """
        Rejects a seller profile with a reason.
        """
        rejectSellerProfile(id: ID!, reason: String): SellerProfile!

        """
        Suspends an active seller profile with a reason.
        """
        suspendSellerProfile(id: ID!, reason: String): SellerProfile!
    }
`;
