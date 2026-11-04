import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLabelTemplates1791775200000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "label_template" ("id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" varchar(100) NOT NULL, "widthMm" double precision NOT NULL, "heightMm" double precision NOT NULL, "design" text NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "FK_1eb1250e55833c05448f3d856fd" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE)`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "label_template"`);
    }
}
