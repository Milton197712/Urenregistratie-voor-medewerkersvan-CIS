import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  client: text("client").notNull(),
  status: text("status").notNull().default("active"),
});

export type Project = typeof projectsTable.$inferSelect;