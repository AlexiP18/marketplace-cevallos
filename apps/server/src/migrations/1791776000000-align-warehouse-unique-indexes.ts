import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignWarehouseUniqueIndexes1791776000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP CONSTRAINT "warehouse_shelf_channel_code_key"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "warehouse_shelf_channel_code_key" ON "warehouse_shelf" ("channelId", "code")`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP CONSTRAINT "warehouse_shelf_stockLocationId_key"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "warehouse_shelf_stock_location_unique" ON "warehouse_shelf" ("stockLocationId")`);
        await queryRunner.query(`ALTER TABLE "warehouse_movement_note" DROP CONSTRAINT "warehouse_movement_note_stockMovementId_key"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "warehouse_movement_note_stockMovementId_key" ON "warehouse_movement_note" ("stockMovementId")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "warehouse_movement_note_stockMovementId_key"`);
        await queryRunner.query(`ALTER TABLE "warehouse_movement_note" ADD CONSTRAINT "warehouse_movement_note_stockMovementId_key" UNIQUE ("stockMovementId")`);
        await queryRunner.query(`DROP INDEX "warehouse_shelf_stock_location_unique"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_stockLocationId_key" UNIQUE ("stockLocationId")`);
        await queryRunner.query(`DROP INDEX "warehouse_shelf_channel_code_key"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_channel_code_key" UNIQUE ("channelId", "code")`);
    }
}
