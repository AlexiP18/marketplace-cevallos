import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProtectStockKardex1791775900000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE FUNCTION prevent_stock_movement_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Los asientos del kardex son inmutables; registra un nuevo ajuste.'; END; $$ LANGUAGE plpgsql`);
        await queryRunner.query(`CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON "stock_movement" FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_change()`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER stock_movement_immutable ON "stock_movement"`);
        await queryRunner.query(`DROP FUNCTION prevent_stock_movement_change()`);
    }
}
