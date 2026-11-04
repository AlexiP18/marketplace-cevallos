import gql from 'graphql-tag';

export const warehouseAdminApi = gql`
    type WarehouseShelf { id: ID! code: String! description: String! active: Boolean! stockLocationId: ID! pairs: Int! }
    type WarehouseStock { variantId: ID! sku: String! variantName: String! shelfId: ID! shelfCode: String! onHand: Int! allocated: Int! available: Int! }
    type WarehouseUnlocatedStock { variantId: ID! sourceLocationId: ID! sku: String! sourceName: String! onHand: Int! allocated: Int! }
    type WarehouseReceipt { variantId: ID! shelfCode: String! onHand: Int! }
    type WarehousePickShelf { shelfId: ID! code: String! quantity: Int! scanned: Int! }
    type WarehousePickLine { id: ID! variantId: ID! sku: String! quantity: Int! scanned: Int! unlocated: Int! shelves: [WarehousePickShelf!]! }
    type WarehousePickOrder { id: ID! code: String! state: String! lines: [WarehousePickLine!]! }
    type WarehouseScanResult { id: ID! scanned: Int! expected: Int! shelfCode: String! }
    type WarehouseKardexEntry {
        id: ID! createdAt: DateTime! type: String! quantity: Int! sku: String! modelCode: String variantId: ID!
        orderLineId: ID locationCode: String! actorUserId: ID actorName: String operation: String reason: String
        onHandAfter: Int! allocatedAfter: Int!
    }
    type WarehouseKardex { totalItems: Int! items: [WarehouseKardexEntry!]! }
    type WarehouseKardexActor { id: ID! name: String! }
    input CreateWarehouseShelfInput { code: String! description: String sourceLocationId: ID }
    input WarehouseStockInput { variantId: ID! shelfId: ID! quantity: Int! reason: String }
    input WarehousePlacementInput { variantId: ID! sourceLocationId: ID! shelfId: ID! quantity: Int! }
    input WarehouseMoveInput { variantId: ID! fromShelfId: ID! toShelfId: ID! quantity: Int! reason: String! }
    input WarehouseScanInput { orderLineId: ID! shelfId: ID! code: String! }
    input WarehouseKardexFilter { from: String to: String type: String sku: String userId: ID skip: Int take: Int }
    extend type Query {
        warehouseDispatchOrders: [JSON!]!
        warehousePaymentProof(orderId: ID!): String!
        warehouseShelves: [WarehouseShelf!]!
        warehouseInventory(search: String): [WarehouseStock!]!
        warehouseUnlocatedStock: [WarehouseUnlocatedStock!]!
        warehousePickOrders: [WarehousePickOrder!]!
        warehouseKardex(filter: WarehouseKardexFilter): WarehouseKardex!
        warehouseKardexActors: [WarehouseKardexActor!]!
    }
    extend type Mutation {
        saveWarehousePaymentProof(orderId: ID!, reference: String!, institution: String!, amount: Int!, file: String!): Boolean!
        reviewWarehousePayment(orderId: ID!, approve: Boolean!, reason: String): Boolean!
        dispatchWarehouseOrder(orderId: ID!, carrier: String!, trackingCode: String!): Boolean!
        createWarehouseShelf(input: CreateWarehouseShelfInput!): WarehouseShelf!
        receiveWarehouseStock(input: WarehouseStockInput!): WarehouseReceipt!
        placeWarehouseStock(input: WarehousePlacementInput!): WarehouseReceipt!
        moveWarehouseStock(input: WarehouseMoveInput!): WarehouseReceipt!
        adjustWarehouseStock(input: WarehouseStockInput!): WarehouseReceipt!
        scanWarehousePair(input: WarehouseScanInput!): WarehouseScanResult!
    }
`;
