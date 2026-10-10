import gql from 'graphql-tag';
import { commonApiExtensions } from './common.graphql';

export const adminApiExtensions = gql`
    ${commonApiExtensions}

    type SellerProfile implements Node {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        seller: Seller!
        channel: Channel!
        administrator: Administrator
        logo: Asset

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
        name: String
        address: String
        contactPhone: String
        socialLinks: SocialLinksInput
    }

    input UpdateSellerProfileTaxInput {
        obligadoContabilidad: Boolean
        contactPhone: String
        regimenSri: RegimenSri
        calificacionArtesanalJnda: String
    }

    input UpdateSellerProfileInput {
        id: ID!
        business: UpdateSellerProfileBusinessInput
        tax: UpdateSellerProfileTaxInput
        paymentModalities: PaymentModalitiesInput
        primaryBankAccount: BankAccountInput
        hasSecondaryAccount: Boolean
        secondaryBankAccount: BankAccountInput
    }

    extend type Query {
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
    }

    extend type Mutation {
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
