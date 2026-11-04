import { MigrationInterface, QueryRunner } from 'typeorm';
import { initialFinancialInstitutions } from '../plugins/multivendor/data/financial-institutions';

export class AddFinancialInstitutions1791775300000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "financial_institution" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" varchar(255) NOT NULL, "kind" varchar(30) NOT NULL, "ruc" varchar(13), "active" boolean NOT NULL DEFAULT true)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "financial_institution_name_unique" ON "financial_institution" (lower(trim("name")))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "financial_institution_ruc_unique" ON "financial_institution" ("ruc") WHERE "ruc" IS NOT NULL`);
        for (const item of initialFinancialInstitutions) {
            await queryRunner.query(`INSERT INTO "financial_institution" ("name", "kind", "ruc") VALUES ($1, $2, $3)`, [item.name, item.kind, item.ruc]);
        }
    }
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "financial_institution"`);
    }
}
