import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdministratorPersonalProfile1791775400000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "administrator_personal_profile" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "administratorId" integer NOT NULL UNIQUE REFERENCES "administrator"("id") ON DELETE CASCADE, "photoId" integer REFERENCES "asset"("id") ON DELETE SET NULL, "phone" varchar(50))`);
        await queryRunner.query(`INSERT INTO "administrator_personal_profile" ("administratorId", "phone") SELECT DISTINCT ON ("administratorId") "administratorId", NULLIF("adminPhone", '') FROM "seller_profile" WHERE "administratorId" IS NOT NULL ORDER BY "administratorId", "updatedAt" DESC`);
    }
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "administrator_personal_profile"`);
    }
}
