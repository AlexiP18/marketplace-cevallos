import {MigrationInterface, QueryRunner} from "typeorm";

export class UpdateProductRangoTallasList1791240000000 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsRangotallas" TYPE text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product" ALTER COLUMN "customFieldsRangotallas" TYPE character varying(255)`, undefined);
   }

}
