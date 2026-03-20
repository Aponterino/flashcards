import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | null = null;
let schemaInitPromise: Promise<void> | null = null;

export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new Pool({ connectionString });
  }

  return drizzle(pool);
}

async function initializeSchema() {
  if (!pool) {
    getDb();
  }

  if (!pool) {
    throw new Error("Database pool was not initialized");
  }

  await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS decks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      parent_deck_id uuid REFERENCES decks(id) ON DELETE SET NULL,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz
  `);

  await pool.query(`
    ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS parent_deck_id uuid
  `);

  await pool.query(`
    ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'decks_parent_deck_id_fkey'
      ) THEN
        ALTER TABLE decks
        ADD CONSTRAINT decks_parent_deck_id_fkey
        FOREIGN KEY (parent_deck_id) REFERENCES decks(id) ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS decks_parent_deck_id_idx
    ON decks(parent_deck_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS decks_parent_sort_order_idx
    ON decks(parent_deck_id, sort_order, created_at)
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY parent_deck_id ORDER BY sort_order, created_at, id) - 1 AS next_order
      FROM decks
    )
    UPDATE decks
    SET sort_order = ranked.next_order
    FROM ranked
    WHERE decks.id = ranked.id
      AND decks.sort_order IS DISTINCT FROM ranked.next_order
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      front text NOT NULL,
      back text NOT NULL,
      due_date date NOT NULL,
      interval_days integer NOT NULL DEFAULT 1,
      ease_factor numeric(4,2) NOT NULL DEFAULT 2.50,
      last_difficulty text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS last_difficulty text
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deck_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deck_version_cards (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      version_id uuid NOT NULL REFERENCES deck_versions(id) ON DELETE CASCADE,
      card_id uuid NOT NULL,
      front text NOT NULL,
      back text NOT NULL,
      due_date date NOT NULL,
      interval_days integer NOT NULL DEFAULT 1,
      ease_factor numeric(4,2) NOT NULL DEFAULT 2.50,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deck_study_settings (
      deck_id uuid PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
      daily_goal integer NOT NULL DEFAULT 20,
      goal_configured boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE deck_study_settings
    ADD COLUMN IF NOT EXISTS goal_configured boolean NOT NULL DEFAULT false
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deck_study_days (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      study_date date NOT NULL,
      goal integer NOT NULL,
      reviewed_count integer NOT NULL DEFAULT 0,
      easy_count integer NOT NULL DEFAULT 0,
      medium_count integer NOT NULL DEFAULT 0,
      hard_count integer NOT NULL DEFAULT 0,
      due_count_snapshot integer NOT NULL DEFAULT 0,
      overdue_count_snapshot integer NOT NULL DEFAULT 0,
      started_at timestamptz,
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE deck_study_days
    ADD COLUMN IF NOT EXISTS easy_count integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE deck_study_days
    ADD COLUMN IF NOT EXISTS medium_count integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE deck_study_days
    ADD COLUMN IF NOT EXISTS hard_count integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE deck_study_days
    ADD COLUMN IF NOT EXISTS due_count_snapshot integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    ALTER TABLE deck_study_days
    ADD COLUMN IF NOT EXISTS overdue_count_snapshot integer NOT NULL DEFAULT 0
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS deck_study_days_deck_date_unique
    ON deck_study_days(deck_id, study_date)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id text PRIMARY KEY,
      theme text NOT NULL DEFAULT 'light',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light'
  `);
}

export async function ensureDbReady() {
  if (!schemaInitPromise) {
    schemaInitPromise = initializeSchema().catch((error) => {
      schemaInitPromise = null;
      throw error;
    });
  }

  await schemaInitPromise;
}
