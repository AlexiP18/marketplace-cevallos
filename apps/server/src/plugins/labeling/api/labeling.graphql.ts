import gql from 'graphql-tag';

export const labelingAdminApi = gql`
    type LabelTemplate {
        id: ID!
        name: String!
        widthMm: Float!
        heightMm: Float!
        design: String!
    }

    enum LabelBusinessLogoStatus { AVAILABLE MISSING AMBIGUOUS NO_SELLER }
    type LabelBusinessLogoCandidate { id: ID! name: String! hasLogo: Boolean! }
    type LabelBusinessLogo { status: LabelBusinessLogoStatus! logo: Asset candidates: [LabelBusinessLogoCandidate!]! }

    input SaveLabelTemplateInput {
        id: ID
        name: String!
        widthMm: Float!
        heightMm: Float!
        design: String!
    }

    extend type Query {
        labelTemplates: [LabelTemplate!]!
        labelTemplate(id: ID!): LabelTemplate
        labelProductBusinessLogo(productId: ID!, sellerProfileId: ID): LabelBusinessLogo!
    }

    extend type Mutation {
        saveLabelTemplate(input: SaveLabelTemplateInput!): LabelTemplate!
        deleteLabelTemplate(id: ID!): DeletionResponse!
    }
`;
