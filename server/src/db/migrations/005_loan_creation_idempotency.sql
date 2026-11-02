-- Persist request idempotency keys for loan creation retries.
-- This migration is intentionally additive; do not edit migrations 001-004.
CREATE TABLE loan_creation_idempotency (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  debt_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT uq_loan_creation_idempotency_debt UNIQUE (user_id, debt_id),
  CONSTRAINT fk_loan_creation_idempotency_debt_owner
    FOREIGN KEY (user_id, debt_id)
    REFERENCES debt_records(user_id, id)
    ON DELETE CASCADE
);
