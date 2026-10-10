import {MigrationInterface, QueryRunner} from "typeorm";

export class AddProductTipoEstilo1791160151139 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsTipo" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsEstilo" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsEstilo"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsTipo"`, undefined);
   }

}
