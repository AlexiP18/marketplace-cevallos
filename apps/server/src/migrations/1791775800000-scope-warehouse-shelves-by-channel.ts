import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeWarehouseShelvesByChannel1791775800000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD "channelId" integer`);
        await queryRunner.query(`UPDATE "warehouse_shelf" shelf SET "channelId" = profile."channelId" FROM "seller_profile" profile WHERE profile."id" = shelf."sellerProfileId"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ALTER COLUMN "channelId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_channel_fk" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE RESTRICT`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP COLUMN "sellerProfileId"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_channel_code_key" UNIQUE ("channelId", "code")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const central = await queryRunner.query(`SELECT COUNT(*) AS count FROM "warehouse_shelf" shelf LEFT JOIN "seller_profile" profile ON profile."channelId" = shelf."channelId" WHERE profile."id" IS NULL`);
        if (Number(central[0].count)) throw new Error('No se puede revertir mientras existan perchas del canal general.');
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD "sellerProfileId" integer`);
        await queryRunner.query(`UPDATE "warehouse_shelf" shelf SET "sellerProfileId" = profile."id" FROM "seller_profile" profile WHERE profile."channelId" = shelf."channelId"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ALTER COLUMN "sellerProfileId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP CONSTRAINT "warehouse_shelf_channel_code_key"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP CONSTRAINT "warehouse_shelf_channel_fk"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" DROP COLUMN "channelId"`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_seller_profile_fk" FOREIGN KEY ("sellerProfileId") REFERENCES "seller_profile"("id") ON DELETE RESTRICT`);
        await queryRunner.query(`ALTER TABLE "warehouse_shelf" ADD CONSTRAINT "warehouse_shelf_seller_profile_code_key" UNIQUE ("sellerProfileId", "code")`);
    }
}
