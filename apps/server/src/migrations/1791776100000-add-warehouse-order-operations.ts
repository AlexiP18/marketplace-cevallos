import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseOrderOperations1791776100000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`UPDATE "role" SET "permissions" = "permissions" || ',ManageWarehouseDispatch' WHERE ("code" LIKE 'seller-admin-%' OR "code" LIKE 'warehouse-despachador-%') AND "permissions" NOT LIKE '%ManageWarehouseDispatch%'`);
        await queryRunner.query('ALTER TABLE "warehouse_pick_scan" ADD COLUMN "scanCode" varchar(100) UNIQUE');
        await queryRunner.query(`CREATE TABLE "warehouse_order_operation" (
            "id" SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            "channelId" integer NOT NULL REFERENCES "channel"("id") ON DELETE RESTRICT,
            "orderId" integer NOT NULL REFERENCES "order"("id") ON DELETE RESTRICT,
            "details" jsonb NOT NULL DEFAULT '{}', "proof" text NOT NULL DEFAULT '',
            UNIQUE ("channelId", "orderId")
        )`);
    }
    async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE "warehouse_order_operation"'); await queryRunner.query('ALTER TABLE "warehouse_pick_scan" DROP COLUMN "scanCode"'); }
}
