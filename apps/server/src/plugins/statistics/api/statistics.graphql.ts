import gql from 'graphql-tag';

export const statisticsAdminApi = gql`
    input FootwearStatisticsInput {
        startDate: DateTime!
        endDate: DateTime!
    }

    type FootwearStatisticsSummary {
        currencyCode: CurrencyCode!
        orderCount: Int!
        pairCount: Int!
        refundedPairs: Int!
        articleSales: Money!
        refundedAmount: Money!
        averageOrderValue: Money!
        previousOrderCount: Int!
        previousPairCount: Int!
        previousArticleSales: Money!
    }

    type FootwearStatisticsDay {
        date: String!
        orderCount: Int!
        pairCount: Int!
        articleSales: Money!
    }

    type FootwearStatisticsVariant {
        variantId: ID!
        productId: ID!
        productName: String!
        productCode: String!
        sku: String!
        color: String!
        size: String!
        upper: String!
        sole: String!
        gender: String!
        type: String!
        style: String!
        pairCount: Int!
        refundedPairs: Int!
        articleSales: Money!
        stockOnHand: Int!
        stockAllocated: Int!
        tracksInventory: Boolean!
        outOfStockThreshold: Int!
        inCatalog: Boolean!
    }

    type FootwearStatisticsOverview {
        modelCount: Int!
        variantCount: Int!
        unsoldModelCount: Int!
        stagnantModelCount: Int!
        trackedVariantCount: Int!
        physicalPairs: Int!
        allocatedPairs: Int!
        depletedVariantCount: Int!
    }

    type FootwearStatisticsSegment {
        dimension: String!
        value: String!
        pairCount: Int!
        stockAvailable: Int!
    }

    type FootwearStatisticsMatrixCell {
        color: String!
        size: String!
        pairCount: Int!
        stockAvailable: Int!
    }

    type FootwearStatisticsReport {
        summary: FootwearStatisticsSummary!
        days: [FootwearStatisticsDay!]!
        overview: FootwearStatisticsOverview!
        segments: [FootwearStatisticsSegment!]!
        matrix: [FootwearStatisticsMatrixCell!]!
        variants: [FootwearStatisticsVariant!]!
    }

    extend type Query {
        footwearStatistics(input: FootwearStatisticsInput!): FootwearStatisticsReport!
    }
`;
