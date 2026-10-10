import {MigrationInterface, QueryRunner} from "typeorm";

export class AddProductFootwearCustomFields1790661573602 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSuela" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsCapellada" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsRangotallas" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsTipoestilo" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsTipoestilo"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsRangotallas"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsCapellada"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSuela"`, undefined);
   }

}
