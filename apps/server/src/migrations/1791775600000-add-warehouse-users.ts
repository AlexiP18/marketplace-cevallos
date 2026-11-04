import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWarehouseUsers1791775600000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "warehouse_user" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "sellerProfileId" integer NOT NULL REFERENCES "seller_profile"("id") ON DELETE CASCADE, "administratorId" integer NOT NULL UNIQUE REFERENCES "administrator"("id") ON DELETE CASCADE, "role" varchar(20) NOT NULL CHECK ("role" IN ('ADMINISTRADOR', 'BODEGUERO', 'DESPACHADOR')))`);
        await queryRunner.query(`CREATE INDEX "warehouse_user_seller_profile_idx" ON "warehouse_user" ("sellerProfileId")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "warehouse_user"`);
    }
}
