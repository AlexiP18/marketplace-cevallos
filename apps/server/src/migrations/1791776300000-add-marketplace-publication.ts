import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddMarketplacePublication1791776300000 implements MigrationInterface {
    async up(runner: QueryRunner) { await runner.query(`CREATE TABLE marketplace_hidden_product (
        id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
        "productId" integer NOT NULL REFERENCES product(id), "channelId" integer NOT NULL REFERENCES channel(id),
        CONSTRAINT marketplace_hidden_product_unique UNIQUE ("productId")
    )`); }
    async down(runner: QueryRunner) { await runner.query('DROP TABLE marketplace_hidden_product'); }
}
