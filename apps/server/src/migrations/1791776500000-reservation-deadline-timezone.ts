import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationDeadlineTimezone1791776500000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        // Legacy deadlines were written in the Ecuador local deployment timezone.
        await queryRunner.query(`DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                AND table_name = 'marketplace_reservation' AND column_name = 'expiresAt' AND data_type = 'timestamp without time zone') THEN
                ALTER TABLE marketplace_reservation ALTER COLUMN "expiresAt" TYPE timestamptz
                    USING "expiresAt" AT TIME ZONE 'America/Guayaquil';
            END IF;
        END $$`);
    }
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE marketplace_reservation ALTER COLUMN "expiresAt" TYPE timestamp
            USING "expiresAt" AT TIME ZONE 'America/Guayaquil'`);
    }
}
