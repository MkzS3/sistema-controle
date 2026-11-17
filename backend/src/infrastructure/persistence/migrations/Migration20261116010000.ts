import { Migration } from '@mikro-orm/migrations';

export class Migration20261116010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE transactional_outbox
        DROP CONSTRAINT transactional_outbox_status_check,
        ADD COLUMN dead_lettered_at timestamptz,
        ADD CONSTRAINT ck_transactional_outbox_status
          CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTERED')),
        ADD CONSTRAINT ck_transactional_outbox_dead_lettered_at
          CHECK ((status = 'DEAD_LETTERED') = (dead_lettered_at IS NOT NULL));
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      UPDATE transactional_outbox
      SET status = 'PENDING', dead_lettered_at = NULL, available_at = now()
      WHERE status = 'DEAD_LETTERED';
    `);

    this.addSql(`
      ALTER TABLE transactional_outbox
        DROP CONSTRAINT ck_transactional_outbox_dead_lettered_at,
        DROP CONSTRAINT ck_transactional_outbox_status,
        DROP COLUMN dead_lettered_at,
        ADD CONSTRAINT transactional_outbox_status_check
          CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED'));
    `);
  }
}
