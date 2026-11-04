import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddMarketplaceReservations1791776200000 implements MigrationInterface {
    async up(runner: QueryRunner) {
        await runner.query(`CREATE TABLE marketplace_reservation (
            id SERIAL PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            "orderId" integer NOT NULL REFERENCES "order"(id), "aggregateOrderId" integer NOT NULL REFERENCES "order"(id),
            "channelId" integer NOT NULL REFERENCES channel(id), "expiresAt" timestamp NOT NULL,
            status varchar NOT NULL DEFAULT 'PENDING', CONSTRAINT marketplace_reservation_order_unique UNIQUE ("orderId")
        )`);
        await runner.query('CREATE INDEX marketplace_reservation_pending_idx ON marketplace_reservation ("expiresAt") WHERE status = \'PENDING\'');
    }
    async down(runner: QueryRunner) { await runner.query('DROP TABLE marketplace_reservation'); }
}
