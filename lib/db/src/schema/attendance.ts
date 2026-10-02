import { boolean, date, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  initials: text("initials").notNull(),
  department: text("department").notNull(),
  email: text("email").unique(),
  clerkUserId: text("clerk_user_id").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  projectId: integer("project_id"),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  breakStart: text("break_start"),
  breakEnd: text("break_end"),
  endTime: text("end_time"),
  status: text("status").notNull().default("open"),
  totalHours: numeric("total_hours", { precision: 4, scale: 2 }).notNull().default("0"),
  note: text("note"),
  autoClocked: boolean("auto_clocked").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const overtimeRequestsTable = pgTable("overtime_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  cutoff: text("cutoff").notNull(),
  requestedUntil: text("requested_until").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Employee = typeof employeesTable.$inferSelect;
export type TimeEntry = typeof timeEntriesTable.$inferSelect;
export type OvertimeRequest = typeof overtimeRequestsTable.$inferSelect;