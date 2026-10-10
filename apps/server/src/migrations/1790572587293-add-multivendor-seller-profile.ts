import {MigrationInterface, QueryRunner} from "typeorm";

export class AddMultivendorSellerProfile1790572587293 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "seller_profile" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "businessName" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "address" text NOT NULL DEFAULT '', "contactPhone" character varying(50) NOT NULL DEFAULT '', "socialLinks" text, "obligadoContabilidad" boolean NOT NULL DEFAULT false, "ruc" character varying(20) NOT NULL, "taxContactPhone" character varying(50) NOT NULL DEFAULT '', "regimenSri" character varying(50) NOT NULL DEFAULT 'GENERAL', "calificacionArtesanalJnda" character varying(100), "adminFirstName" character varying(100) NOT NULL, "adminLastName" character varying(100) NOT NULL, "adminEmail" character varying(255) NOT NULL, "adminPhone" character varying(50) NOT NULL DEFAULT '', "paymentModalities" text NOT NULL DEFAULT '{"payphone":false,"deuna":false,"paypal":false,"transferenciaBancaria":true,"pagoEnLocal":false}', "primaryBankAccount" text NOT NULL, "hasSecondaryAccount" boolean NOT NULL DEFAULT false, "secondaryBankAccount" text, "status" character varying(30) NOT NULL DEFAULT 'PENDING_APPROVAL', "rejectionReason" text, "id" SERIAL NOT NULL, "sellerId" integer, "channelId" integer, "administratorId" integer, "logoId" integer, CONSTRAINT "REL_3ea826315b0eff2acd12188014" UNIQUE ("sellerId"), CONSTRAINT "REL_87dd8404d542a06ae7af737872" UNIQUE ("channelId"), CONSTRAINT "PK_1455fd9c9540da78423b04567a1" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a01945e3e58610fdddf06bdb41" ON "seller_profile" ("slug") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_007f932b786c9197c5e7986407" ON "seller_profile" ("ruc") `, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" ADD CONSTRAINT "FK_3ea826315b0eff2acd121880141" FOREIGN KEY ("sellerId") REFERENCES "seller"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" ADD CONSTRAINT "FK_87dd8404d542a06ae7af7378725" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" ADD CONSTRAINT "FK_96fb6af0f5fcd6f53b48f44b0d9" FOREIGN KEY ("administratorId") REFERENCES "administrator"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" ADD CONSTRAINT "FK_d64fd7303a20d50bdb1d78dd01c" FOREIGN KEY ("logoId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "seller_profile" DROP CONSTRAINT "FK_d64fd7303a20d50bdb1d78dd01c"`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" DROP CONSTRAINT "FK_96fb6af0f5fcd6f53b48f44b0d9"`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" DROP CONSTRAINT "FK_87dd8404d542a06ae7af7378725"`, undefined);
        await queryRunner.query(`ALTER TABLE "seller_profile" DROP CONSTRAINT "FK_3ea826315b0eff2acd121880141"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_007f932b786c9197c5e7986407"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a01945e3e58610fdddf06bdb41"`, undefined);
        await queryRunner.query(`DROP TABLE "seller_profile"`, undefined);
   }

}
