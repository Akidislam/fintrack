-- FinTrack Database Migration 001: Initial Schema
-- Supports users, accounts, categories, transactions, budgets, people, and debt tracking

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed default user for single-tenant local operation until full auth is introduced
INSERT INTO users (id, email, name, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'default@fintrack.local', 'Default User', 'USD')
ON CONFLICT (id) DO NOTHING;

-- 2. Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('Cash', 'Bank Account', 'Mobile Wallet', 'Credit Card')),
  opening_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  note TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);

-- 3. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  icon VARCHAR(50),
  color VARCHAR(20),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_system ON categories(name, type) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_user ON categories(user_id, name, type) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);

-- Seed default FinTrack categories
INSERT INTO categories (user_id, name, type, icon, is_system) VALUES
  (NULL, 'Salary', 'income', '💰', TRUE),
  (NULL, 'Freelance', 'income', '💻', TRUE),
  (NULL, 'Investments', 'income', '📈', TRUE),
  (NULL, 'Housing', 'expense', '🏠', TRUE),
  (NULL, 'Groceries', 'expense', '🛒', TRUE),
  (NULL, 'Dining', 'expense', '☕', TRUE),
  (NULL, 'Transportation', 'expense', '🚗', TRUE),
  (NULL, 'Utilities', 'expense', '⚡', TRUE),
  (NULL, 'Entertainment', 'expense', '🎬', TRUE),
  (NULL, 'Healthcare', 'expense', '🏥', TRUE),
  (NULL, 'Shopping', 'expense', '🛍️', TRUE),
  (NULL, 'Other', 'expense', '🏷️', TRUE),
  (NULL, 'Transfer', 'transfer', '🔄', TRUE)
ON CONFLICT DO NOTHING;

-- 4. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  note TEXT,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_transfer_accounts CHECK (
    type <> 'transfer' OR (account_id IS NULL OR to_account_id IS NULL OR account_id <> to_account_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_name ON transactions(category_name);

-- 5. Monthly Category Budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  category_name VARCHAR(50) NOT NULL,
  monthly_limit NUMERIC(15, 2) NOT NULL CHECK (monthly_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_budgets_user_category UNIQUE (user_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

-- 6. People table (Peer Contacts for Personal Lending/Borrowing Ledgers)
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_people_user_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_people_user_id ON people(user_id);

-- 7. Debt Records table (Lending & Borrowing Ledger)
CREATE TABLE IF NOT EXISTS debt_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('lent', 'borrowed')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  description VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'cancelled')),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debt_records_user_id ON debt_records(user_id);
CREATE INDEX IF NOT EXISTS idx_debt_records_person_id ON debt_records(person_id);
CREATE INDEX IF NOT EXISTS idx_debt_records_status ON debt_records(status);

-- 8. Debt Repayments table
CREATE TABLE IF NOT EXISTS debt_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES debt_records(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  repayment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_debt_repayments_debt_id ON debt_repayments(debt_id);
