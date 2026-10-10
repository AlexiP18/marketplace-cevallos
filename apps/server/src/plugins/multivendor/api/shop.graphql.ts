import gql from 'graphql-tag';
import { commonApiExtensions } from './common.graphql';

export const shopApiExtensions = gql`
    ${commonApiExtensions}

    extend type Query {
        """
        Retrieves a public store/vendor profile by its unique URL slug.
        """
        sellerProfileBySlug(slug: String!): PublicSellerProfile

        """
        Lists all active vendor profiles for marketplace storefront discovery.
        """
        activeSellerProfiles(options: SellerProfileListOptions): PublicSellerProfileList!
    }

    extend type Mutation {
        """
        Public mutation for new vendors/almacenistas to register into the marketplace.
        Automatically orchestrates Seller, Channel, Role, Administrator and SellerProfile creation.
        """
        registerSeller(input: RegisterSellerInput!): RegisterSellerResult!
    }
`;
