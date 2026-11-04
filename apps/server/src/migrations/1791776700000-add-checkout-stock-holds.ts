import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddCheckoutStockHolds1791776700000 implements MigrationInterface {
    async up(runner: QueryRunner) {
        await runner.query(`CREATE TABLE marketplace_checkout_hold (
            id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            "orderId" integer NOT NULL REFERENCES "order"(id), "expiresAt" timestamptz NOT NULL,
            status varchar(255) NOT NULL CHECK(status IN ('PENDING','READY','FAILED','EXPIRED')),
            message text NOT NULL DEFAULT '', "cartVersion" varchar(255) NOT NULL, context jsonb, CHECK(status<>'PENDING' OR context IS NOT NULL)
        )`);
        await runner.query('CREATE UNIQUE INDEX "IDX_checkout_hold_order" ON marketplace_checkout_hold ("orderId")');
        await runner.query("CREATE INDEX checkout_hold_pending ON marketplace_checkout_hold (\"expiresAt\") WHERE status='PENDING'");
    }
    async down(runner: QueryRunner) { await runner.query('DROP TABLE marketplace_checkout_hold'); }
}
