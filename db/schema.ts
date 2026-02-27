import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const decks = pgTable("decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentDeckId: uuid("parent_deck_id").references((): AnyPgColumn => decks.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => decks.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  dueDate: date("due_date").notNull(),
  intervalDays: integer("interval_days").notNull().default(1),
  easeFactor: numeric("ease_factor", { precision: 4, scale: 2 })
    .notNull()
    .default("2.50"),
  lastDifficulty: text("last_difficulty"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deckVersions = pgTable("deck_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => decks.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deckVersionCards = pgTable("deck_version_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => deckVersions.id, { onDelete: "cascade" }),
  cardId: uuid("card_id").notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  dueDate: date("due_date").notNull(),
  intervalDays: integer("interval_days").notNull().default(1),
  easeFactor: numeric("ease_factor", { precision: 4, scale: 2 })
    .notNull()
    .default("2.50"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deckStudySettings = pgTable("deck_study_settings", {
  deckId: uuid("deck_id")
    .primaryKey()
    .references(() => decks.id, { onDelete: "cascade" }),
  dailyGoal: integer("daily_goal").notNull().default(20),
  goalConfigured: boolean("goal_configured").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const deckStudyDays = pgTable(
  "deck_study_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    studyDate: date("study_date").notNull(),
    goal: integer("goal").notNull(),
    reviewedCount: integer("reviewed_count").notNull().default(0),
    easyCount: integer("easy_count").notNull().default(0),
    mediumCount: integer("medium_count").notNull().default(0),
    hardCount: integer("hard_count").notNull().default(0),
    dueCountSnapshot: integer("due_count_snapshot").notNull().default(0),
    overdueCountSnapshot: integer("overdue_count_snapshot").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    deckDateUnique: uniqueIndex("deck_study_days_deck_date_unique").on(table.deckId, table.studyDate),
  })
);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  theme: text("theme").notNull().default("light"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
