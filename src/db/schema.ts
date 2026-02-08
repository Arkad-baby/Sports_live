import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

export const matchStatusEnum = pgEnum("status", [
  "scheduled",
  "live",
  "finished",
]);

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  sport: text("sport").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  status: matchStatusEnum("status").notNull().default("scheduled"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  createdAt: timestamp("create_at").notNull().defaultNow(),
});

export const commentary = pgTable("commentary", {
  id: serial("id").primaryKey(),
  matchesId: integer("matchesId")
    .notNull()
    .references(() => matches.id),
    minute:integer('minute'),
    sequence:integer('sequence'),
    period:text('period'),
    eventType:text('event_type'),
    actor:text('actor'),
    team:text('team'),
    message:text('message').notNull(),
    metadata:jsonb('metadata'),
    tags:text('tags').array(),
    createdAt: timestamp("create_at").notNull().defaultNow(),
});

export type matches = typeof matches.$inferSelect;
export type commentary = typeof commentary.$inferSelect;
