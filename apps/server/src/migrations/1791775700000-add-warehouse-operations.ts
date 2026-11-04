import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseOperations1791775700000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "warehouse_shelf" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "sellerProfileId" integer NOT NULL REFERENCES "seller_profile"("id") ON DELETE RESTRICT, "stockLocationId" integer NOT NULL UNIQUE REFERENCES "stock_location"("id") ON DELETE RESTRICT, "code" varchar(60) NOT NULL, "description" varchar(255) NOT NULL DEFAULT '', "active" boolean NOT NULL DEFAULT true, UNIQUE ("sellerProfileId", "code"))`);
        await queryRunner.query(`CREATE TABLE "warehouse_movement_note" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "stockMovementId" integer NOT NULL UNIQUE REFERENCES "stock_movement"("id") ON DELETE RESTRICT, "actorUserId" integer NOT NULL, "operation" varchar(32) NOT NULL, "reason" varchar(500) NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "warehouse_pick_scan" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "orderId" integer NOT NULL REFERENCES "order"("id") ON DELETE RESTRICT, "orderLineId" integer NOT NULL REFERENCES "order_line"("id") ON DELETE RESTRICT, "productVariantId" integer NOT NULL REFERENCES "product_variant"("id") ON DELETE RESTRICT, "stockLocationId" integer NOT NULL REFERENCES "stock_location"("id") ON DELETE RESTRICT, "actorUserId" integer NOT NULL)`);
        await queryRunner.query(`CREATE INDEX "warehouse_pick_scan_line_location_idx" ON "warehouse_pick_scan" ("orderLineId", "stockLocationId")`);
        await queryRunner.query(`CREATE INDEX "warehouse_pick_scan_order_idx" ON "warehouse_pick_scan" ("orderId")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "warehouse_pick_scan"`);
        await queryRunner.query(`DROP TABLE "warehouse_movement_note"`);
        await queryRunner.query(`DROP TABLE "warehouse_shelf"`);
    }
}
