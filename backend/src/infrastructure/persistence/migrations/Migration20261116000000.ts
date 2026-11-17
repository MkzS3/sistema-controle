import { Migration } from '@mikro-orm/migrations';

export class Migration20261116000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE dividends (
        id text PRIMARY KEY,
        currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
        terms jsonb NOT NULL,
        declared_amount numeric,
        status text NOT NULL CHECK (status IN ('DRAFT', 'DECLARED')),
        created_at timestamptz NOT NULL,
        record_date timestamptz,
        payment_date timestamptz,
        declared_at timestamptz,
        CONSTRAINT ck_dividend_terms_amount CHECK (
          terms->>'kind' IS NOT NULL AND (
          (terms->>'kind' = 'FIXED_AMOUNT' AND declared_amount IS NOT NULL AND declared_amount > 0 AND declared_amount = trunc(declared_amount, 2))
          OR (terms->>'kind' = 'PARAMETERS' AND declared_amount IS NULL
              AND jsonb_typeof(terms->'parameters') = 'object')
          )
        ),
        CONSTRAINT ck_dividend_declaration_state CHECK (
          (status = 'DRAFT' AND declared_at IS NULL)
          OR (status = 'DECLARED' AND declared_at IS NOT NULL)
        )
      );
    `);

    this.addSql(`
      CREATE FUNCTION guard_dividend_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.terms IS DISTINCT FROM OLD.terms
           OR NEW.declared_amount IS DISTINCT FROM OLD.declared_amount
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.record_date IS DISTINCT FROM OLD.record_date
           OR NEW.payment_date IS DISTINCT FROM OLD.payment_date THEN
          RAISE EXCEPTION 'dividend declaration terms are immutable'
            USING ERRCODE = '55000';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          IF OLD.status <> 'DRAFT' OR NEW.status <> 'DECLARED' THEN
            RAISE EXCEPTION 'invalid dividend status transition: % to %', OLD.status, NEW.status
              USING ERRCODE = '55000';
          END IF;
        ELSIF NEW.declared_at IS DISTINCT FROM OLD.declared_at THEN
          RAISE EXCEPTION 'dividend declaration time cannot change independently of declaration'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_dividend_state_guard
      BEFORE UPDATE ON dividends
      FOR EACH ROW EXECUTE FUNCTION guard_dividend_update();
    `);

    this.addSql(`
      CREATE FUNCTION reject_dividend_removal() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'dividend declarations cannot be deleted or truncated; % is forbidden', TG_OP
          USING ERRCODE = '55000';
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_dividend_removal_guard
      BEFORE DELETE OR TRUNCATE ON dividends
      FOR EACH STATEMENT EXECUTE FUNCTION reject_dividend_removal();
    `);

    this.addSql(`
      CREATE TABLE beneficiaries (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL
      );
    `);

    this.addSql(`
      CREATE TABLE idempotency_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        scope text NOT NULL CHECK (length(btrim(scope)) > 0),
        key text NOT NULL CHECK (length(btrim(key)) > 0),
        payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
        result_type text NOT NULL CHECK (length(btrim(result_type)) > 0),
        result_id text NOT NULL CHECK (length(btrim(result_id)) > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_idempotency_scope_key UNIQUE (scope, key)
      );
    `);

    this.addSql(`
      CREATE TABLE dividend_obligations (
        id text PRIMARY KEY,
        dividend_id text NOT NULL REFERENCES dividends(id) ON DELETE RESTRICT,
        beneficiary_id text NOT NULL REFERENCES beneficiaries(id) ON DELETE RESTRICT,
        amount numeric NOT NULL CHECK (amount > 0 AND amount = trunc(amount, 2)),
        currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
        status text NOT NULL CHECK (status IN ('DUE', 'PAYMENT_REQUESTED', 'PAYMENT_UNKNOWN', 'PAID')),
        created_at timestamptz NOT NULL,
        unknown_at timestamptz,
        paid_at timestamptz,
        CONSTRAINT uq_obligation_dividend_beneficiary UNIQUE (dividend_id, beneficiary_id),
        CONSTRAINT uq_obligation_id_beneficiary UNIQUE (id, beneficiary_id),
        CONSTRAINT ck_obligation_status_timestamps CHECK (
          ((status = 'PAID') = (paid_at IS NOT NULL))
          AND (status IN ('PAYMENT_UNKNOWN', 'PAID') OR unknown_at IS NULL)
          AND (status <> 'PAYMENT_UNKNOWN' OR unknown_at IS NOT NULL)
        )
      );
    `);

    this.addSql(`
      CREATE INDEX ix_obligations_dividend_status
      ON dividend_obligations (dividend_id, status);
    `);

    this.addSql(`
      CREATE INDEX ix_obligations_beneficiary
      ON dividend_obligations (beneficiary_id);
    `);

    this.addSql(`
      CREATE FUNCTION guard_obligation_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.dividend_id IS DISTINCT FROM OLD.dividend_id
           OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
           OR NEW.amount IS DISTINCT FROM OLD.amount
           OR NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'obligation financial identity and amount are immutable'
            USING ERRCODE = '55000';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status THEN
          IF NOT (
            (OLD.status = 'DUE' AND NEW.status = 'PAYMENT_REQUESTED')
            OR (OLD.status = 'PAYMENT_REQUESTED' AND NEW.status IN ('PAYMENT_UNKNOWN', 'PAID'))
            OR (OLD.status = 'PAYMENT_UNKNOWN' AND NEW.status = 'PAID')
          ) THEN
            RAISE EXCEPTION 'invalid obligation status transition: % to %', OLD.status, NEW.status
              USING ERRCODE = '55000';
          END IF;
        ELSIF NEW.unknown_at IS DISTINCT FROM OLD.unknown_at
           OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
          RAISE EXCEPTION 'obligation transition timestamps cannot change without a state transition'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_obligation_state_guard
      BEFORE UPDATE ON dividend_obligations
      FOR EACH ROW EXECUTE FUNCTION guard_obligation_update();
    `);

    this.addSql(`
      CREATE TABLE payments (
        id text PRIMARY KEY,
        obligation_id text NOT NULL,
        beneficiary_id text NOT NULL,
        idempotency_scope text NOT NULL,
        idempotency_key text NOT NULL,
        amount numeric NOT NULL CHECK (amount > 0 AND amount = trunc(amount, 2)),
        currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
        requested_at timestamptz NOT NULL,
        CONSTRAINT fk_payment_obligation_beneficiary FOREIGN KEY (obligation_id, beneficiary_id)
          REFERENCES dividend_obligations(id, beneficiary_id) ON DELETE RESTRICT,
        CONSTRAINT uq_payment_obligation UNIQUE (obligation_id),
        CONSTRAINT fk_payment_idempotency FOREIGN KEY (idempotency_scope, idempotency_key)
          REFERENCES idempotency_records(scope, key) ON DELETE RESTRICT,
        CONSTRAINT uq_payment_idempotency_scope_key UNIQUE (idempotency_scope, idempotency_key)
      );
    `);

    this.addSql(`
      CREATE FUNCTION validate_payment_instruction() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE obligation_amount numeric;
      DECLARE obligation_currency text;
      DECLARE obligation_status text;
      DECLARE idem_result_type text;
      DECLARE idem_result_id text;
      BEGIN
        SELECT amount, currency, status INTO obligation_amount, obligation_currency, obligation_status
        FROM dividend_obligations WHERE id = NEW.obligation_id;
        SELECT result_type, result_id INTO idem_result_type, idem_result_id
        FROM idempotency_records
        WHERE scope = NEW.idempotency_scope AND key = NEW.idempotency_key;
        IF NOT FOUND OR obligation_status <> 'PAYMENT_REQUESTED'
           OR NEW.amount <> obligation_amount OR NEW.currency <> obligation_currency
           OR idem_result_type <> 'PAYMENT' OR idem_result_id <> NEW.id THEN
          RAISE EXCEPTION 'payment instruction must match a requested obligation and its idempotency result'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_payment_instruction_consistency
      BEFORE INSERT ON payments
      FOR EACH ROW EXECUTE FUNCTION validate_payment_instruction();
    `);

    this.addSql(`
      CREATE FUNCTION reject_payment_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'payments is append-only; % is forbidden', TG_OP
          USING ERRCODE = '55000';
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_payments_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON payments
      FOR EACH STATEMENT EXECUTE FUNCTION reject_payment_mutation();
    `);

    this.addSql(`
      CREATE FUNCTION ensure_payment_for_obligation_state() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 'DUE' AND EXISTS (SELECT 1 FROM payments WHERE obligation_id = NEW.id) THEN
          RAISE EXCEPTION 'DUE obligation % cannot already have a payment instruction', NEW.id
            USING ERRCODE = '23514';
        ELSIF NEW.status <> 'DUE' AND NOT EXISTS (SELECT 1 FROM payments WHERE obligation_id = NEW.id) THEN
          RAISE EXCEPTION 'obligation % requires its unique payment instruction for this state', NEW.id
            USING ERRCODE = '23514';
        END IF;
        RETURN NULL;
      END;
      $$;
    `);

    this.addSql(`
      CREATE CONSTRAINT TRIGGER trg_obligation_requires_payment_instruction
      AFTER INSERT OR UPDATE ON dividend_obligations
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ensure_payment_for_obligation_state();
    `);

    this.addSql(`
      CREATE TABLE ledger_entries (
        id text PRIMARY KEY,
        obligation_id text NOT NULL REFERENCES dividend_obligations(id) ON DELETE RESTRICT,
        kind text NOT NULL CHECK (kind IN ('OBLIGATION_RECOGNIZED', 'PAYMENT_SETTLED', 'PAYMENT_REVERSED')),
        source_type text NOT NULL CHECK (source_type IN ('OBLIGATION', 'PAYMENT', 'REVERSAL')),
        source_id text NOT NULL,
        amount numeric NOT NULL CHECK (amount > 0 AND amount = trunc(amount, 2)),
        currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
        created_at timestamptz NOT NULL,
        CONSTRAINT uq_ledger_source_kind UNIQUE (source_type, source_id, kind),
        CONSTRAINT ck_ledger_kind_source CHECK (
          (kind = 'OBLIGATION_RECOGNIZED' AND source_type = 'OBLIGATION' AND source_id = obligation_id)
          OR (kind = 'PAYMENT_SETTLED' AND source_type = 'PAYMENT')
          OR (kind = 'PAYMENT_REVERSED' AND source_type = 'REVERSAL')
        )
      );
    `);

    this.addSql(`
      CREATE INDEX ix_ledger_obligation_kind
      ON ledger_entries (obligation_id, kind);
    `);

    this.addSql(`
      CREATE FUNCTION validate_obligation_recognition_ledger_entry() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE obligation_amount numeric;
      DECLARE obligation_currency text;
      BEGIN
        IF NEW.kind = 'OBLIGATION_RECOGNIZED' THEN
          SELECT amount, currency INTO obligation_amount, obligation_currency
          FROM dividend_obligations WHERE id = NEW.obligation_id;
          IF NOT FOUND OR NEW.source_id <> NEW.obligation_id
             OR NEW.amount <> obligation_amount OR NEW.currency <> obligation_currency THEN
            RAISE EXCEPTION 'obligation recognition ledger entry must match its obligation'
              USING ERRCODE = '23514';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_ledger_obligation_consistency
      BEFORE INSERT ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION validate_obligation_recognition_ledger_entry();
    `);

    this.addSql(`
      CREATE FUNCTION reject_ledger_mutation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'ledger_entries is append-only; % is forbidden', TG_OP
          USING ERRCODE = '55000';
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_ledger_entries_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON ledger_entries
      FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_mutation();
    `);

    this.addSql(`
      CREATE FUNCTION ensure_obligation_recognition_ledger_entry() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM ledger_entries
          WHERE obligation_id = NEW.id
            AND kind = 'OBLIGATION_RECOGNIZED'
            AND source_type = 'OBLIGATION'
            AND source_id = NEW.id
            AND amount = NEW.amount
            AND currency = NEW.currency
        ) THEN
          RAISE EXCEPTION 'obligation % must have a matching recognition ledger entry', NEW.id
            USING ERRCODE = '23514';
        END IF;
        RETURN NULL;
      END;
      $$;
    `);

    this.addSql(`
      CREATE CONSTRAINT TRIGGER trg_obligation_requires_recognition_ledger
      AFTER INSERT ON dividend_obligations
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ensure_obligation_recognition_ledger_entry();
    `);

    this.addSql(`
      CREATE TABLE inbox_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        consumer_name text NOT NULL CHECK (length(btrim(consumer_name)) > 0),
        message_id text NOT NULL CHECK (length(btrim(message_id)) > 0),
        payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
        status text NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSING', 'PROCESSED')),
        attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        last_error text,
        CONSTRAINT uq_inbox_consumer_message UNIQUE (consumer_name, message_id),
        CONSTRAINT ck_inbox_processed_timestamp CHECK ((status = 'PROCESSED') = (processed_at IS NOT NULL))
      );
    `);

    this.addSql(`
      CREATE INDEX ix_inbox_status_received
      ON inbox_messages (status, received_at);
    `);

    this.addSql(`
      CREATE TABLE transactional_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
        aggregate_type text NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
        aggregate_id text NOT NULL CHECK (length(btrim(aggregate_id)) > 0),
        payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED')),
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        available_at timestamptz NOT NULL DEFAULT now(),
        claimed_until timestamptz,
        lease_token uuid,
        published_at timestamptz,
        last_error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_outbox_processing_lease CHECK (
          (status = 'PROCESSING' AND claimed_until IS NOT NULL AND lease_token IS NOT NULL)
          OR (status <> 'PROCESSING' AND claimed_until IS NULL AND lease_token IS NULL)
        ),
        CONSTRAINT ck_outbox_published_timestamp CHECK ((status = 'PUBLISHED') = (published_at IS NOT NULL))
      );
    `);

    this.addSql(`
      CREATE INDEX ix_outbox_pending_available
      ON transactional_outbox (available_at, created_at)
      WHERE status = 'PENDING';
    `);

    this.addSql(`
      CREATE INDEX ix_outbox_expired_lease
      ON transactional_outbox (claimed_until, created_at)
      WHERE status = 'PROCESSING';
    `);

    this.addSql(`
      CREATE VIEW obligation_ledger_reconciliation AS
      SELECT o.id AS obligation_id,
             o.amount AS obligation_amount,
             o.currency AS obligation_currency,
             le.id AS ledger_entry_id,
             le.amount AS ledger_amount,
             le.currency AS ledger_currency,
             CASE
               WHEN le.id IS NULL THEN 'MISSING'
               WHEN le.amount <> o.amount OR le.currency <> o.currency THEN 'MISMATCH'
               ELSE 'MATCHED'
             END AS reconciliation_status
      FROM dividend_obligations AS o
      LEFT JOIN ledger_entries AS le
        ON le.obligation_id = o.id AND le.kind = 'OBLIGATION_RECOGNIZED';
    `);
  }

  override async down(): Promise<void> {
    this.addSql('DROP VIEW obligation_ledger_reconciliation;');
    this.addSql('DROP TABLE transactional_outbox;');
    this.addSql('DROP TABLE inbox_messages;');
    this.addSql('DROP TRIGGER trg_obligation_requires_recognition_ledger ON dividend_obligations;');
    this.addSql('DROP FUNCTION ensure_obligation_recognition_ledger_entry();');
    this.addSql('DROP TRIGGER trg_obligation_requires_payment_instruction ON dividend_obligations;');
    this.addSql('DROP FUNCTION ensure_payment_for_obligation_state();');
    this.addSql('DROP TRIGGER trg_payments_immutable ON payments;');
    this.addSql('DROP FUNCTION reject_payment_mutation();');
    this.addSql('DROP TRIGGER trg_payment_instruction_consistency ON payments;');
    this.addSql('DROP FUNCTION validate_payment_instruction();');
    this.addSql('DROP TRIGGER trg_obligation_state_guard ON dividend_obligations;');
    this.addSql('DROP FUNCTION guard_obligation_update();');
    this.addSql('DROP TRIGGER trg_ledger_entries_immutable ON ledger_entries;');
    this.addSql('DROP TRIGGER trg_ledger_obligation_consistency ON ledger_entries;');
    this.addSql('DROP FUNCTION reject_ledger_mutation();');
    this.addSql('DROP FUNCTION validate_obligation_recognition_ledger_entry();');
    this.addSql('DROP TRIGGER trg_dividend_state_guard ON dividends;');
    this.addSql('DROP FUNCTION guard_dividend_update();');
    this.addSql('DROP TRIGGER trg_dividend_removal_guard ON dividends;');
    this.addSql('DROP FUNCTION reject_dividend_removal();');
    this.addSql('DROP TABLE ledger_entries;');
    this.addSql('DROP TABLE payments;');
    this.addSql('DROP TABLE dividend_obligations;');
    this.addSql('DROP TABLE idempotency_records;');
    this.addSql('DROP TABLE beneficiaries;');
    this.addSql('DROP TABLE dividends;');
  }
}
