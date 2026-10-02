import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, employeesTable, overtimeRequestsTable, projectsTable, timeEntriesTable, type Employee, type Project } from "@workspace/db";
import {
  CreateOvertimeRequestBody,
  CreateOvertimeRequestResponse,
  CreateTimeEntryBody,
  CreateTimeEntryResponse,
  DecideOvertimeRequestBody,
  DecideOvertimeRequestParams,
  DecideOvertimeRequestResponse,
  GetDashboardResponse,
  ListOvertimeRequestsResponse,
  ListProjectsResponse,
  ListTimeEntriesQueryParams,
  ListTimeEntriesResponse,
  UpdateTimeEntryBody,
  UpdateTimeEntryParams,
  UpdateTimeEntryResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAppUser } from "../middlewares/auth";

const router: IRouter = Router();
const SCHEDULED_HOURS = 8;
let seedPromise: Promise<Employee[]> | null = null;
router.use(requireAppUser);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentClockTime() {
  return new Date().toTimeString().slice(0, 5);
}

function hoursBetween(start: string, end: string, breakStart?: string | null, breakEnd?: string | null) {
  const minutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const total = minutes(end) - minutes(start);
  const pause = breakStart && breakEnd ? minutes(breakEnd) - minutes(breakStart) : 0;
  return Math.max(0, Number(((total - pause) / 60).toFixed(2)));
}

async function seed(): Promise<Employee[]> {
  if (seedPromise) return seedPromise;
  seedPromise = seedOnce();
  return seedPromise;
}

async function seedOnce(): Promise<Employee[]> {
  const projectRows = await db.select().from(projectsTable).orderBy(asc(projectsTable.id));
  if (projectRows.length === 0) {
    await db.insert(projectsTable).values([
      { name: "Website vernieuwen", code: "WEB-24", client: "Intern" },
      { name: "Magazijn optimaliseren", code: "MAG-08", client: "Logistiek" },
      { name: "Klantonboarding", code: "KLA-17", client: "Sales" },
    ]);
  }
  const employees = await db.select().from(employeesTable).orderBy(asc(employeesTable.id));
  return employees;
}

async function withNames<T extends { employeeId: number }>(rows: T[]) {
  const employees = await seed();
  const names = new Map(employees.map((employee) => [employee.id, employee.name]));
  const projects = await db.select().from(projectsTable).orderBy(asc(projectsTable.id));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  return rows.map((row) => {
    const projectId = (row as { projectId?: number | null }).projectId;
    return {
      ...row,
      employeeName: names.get(row.employeeId) ?? "Onbekend",
      ...(projectId !== undefined ? { projectName: projectId ? projectNames.get(projectId) ?? null : null } : {}),
    };
  });
}

async function applyAutomaticClockOut() {
  await seed();
  const date = today();
  const current = currentClockTime();
  const entries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.date, date));
  const requests = await db.select().from(overtimeRequestsTable).where(and(eq(overtimeRequestsTable.date, date), eq(overtimeRequestsTable.status, "approved")));

  for (const entry of entries) {
    if (entry.endTime) continue;
    if (!entry.breakStart && current >= "12:00") {
      await db.update(timeEntriesTable).set({
        breakStart: "12:00",
        status: "open",
        autoClocked: true,
        note: entry.note ?? "Pauze automatisch gestart om 12:00",
      }).where(eq(timeEntriesTable.id, entry.id));
    }
    const hasLatePermission = requests.some((request) => request.employeeId === entry.employeeId && request.cutoff === "16:30" && request.requestedUntil > "16:30");
    if (current >= "16:30" && !hasLatePermission) {
      const breakStart = entry.breakStart ?? "12:00";
      const breakEnd = entry.breakEnd ?? "13:00";
      await db.update(timeEntriesTable).set({
        endTime: "16:30",
        breakStart,
        breakEnd,
        status: "complete",
        totalHours: String(hoursBetween(entry.startTime, "16:30", breakStart, breakEnd)),
        autoClocked: true,
        note: entry.note ?? "Automatisch uitgeklokt om 16:30",
      }).where(eq(timeEntriesTable.id, entry.id));
    }
  }
}

router.get("/projects", async (_req, res): Promise<void> => {
  await seed();
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.status, "active")).orderBy(asc(projectsTable.name));
  res.json(ListProjectsResponse.parse(projects));
});

router.get("/time-entries", async (req, res): Promise<void> => {
  await applyAutomaticClockOut();
  const parsed = ListTimeEntriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  if (parsed.data.date) filters.push(eq(timeEntriesTable.date, parsed.data.date));
  if (parsed.data.employeeId) filters.push(eq(timeEntriesTable.employeeId, parsed.data.employeeId));
  if (!req.employee?.isAdmin) {
    filters.push(eq(timeEntriesTable.employeeId, req.employee!.id));
  }
  const entries = await db.select().from(timeEntriesTable).where(filters.length ? and(...filters) : undefined).orderBy(desc(timeEntriesTable.date), asc(timeEntriesTable.startTime));
  const named = await withNames(entries);
  res.json(ListTimeEntriesResponse.parse(named.map((entry) => ({ ...entry, projectId: entry.projectId ?? null, projectName: entry.projectName ?? null, totalHours: Number(entry.totalHours), note: entry.note ?? null }))));
});

router.post("/time-entries", async (req, res): Promise<void> => {
  const parsed = CreateTimeEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  if (input.employeeId !== req.employee!.id) {
    res.status(403).json({ error: "Je kunt alleen je eigen werkdag registreren." });
    return;
  }
  const date = input.date;
  const time = input.time ?? currentClockTime();
  if (input.action === "clock_in" && !input.projectId) {
    res.status(400).json({ error: "Kies eerst een project voordat je inklokt." });
    return;
  }
  const [existing] = await db.select().from(timeEntriesTable).where(and(eq(timeEntriesTable.employeeId, input.employeeId), eq(timeEntriesTable.date, date)));
  let entry = existing;

  if (input.action === "clock_in" && !existing) {
    [entry] = await db.insert(timeEntriesTable).values({
      employeeId: input.employeeId,
      projectId: input.projectId ?? null,
      date,
      startTime: time,
      status: "open",
      totalHours: "0",
      note: input.note ?? null,
    }).returning();
  } else if (existing) {
    const updates = input.action === "break_start"
      ? { breakStart: time, autoClocked: false }
      : input.action === "break_end"
        ? { breakEnd: time, autoClocked: false }
        : { endTime: time, status: "complete", totalHours: String(hoursBetween(existing.startTime, time, existing.breakStart, existing.breakEnd)), autoClocked: false };
    [entry] = await db.update(timeEntriesTable).set(updates).where(eq(timeEntriesTable.id, existing.id)).returning();
  }
  if (!entry) {
    res.status(400).json({ error: "Deze actie kan nu niet worden uitgevoerd." });
    return;
  }
  const [named] = await withNames([entry]);
  res.status(201).json(CreateTimeEntryResponse.parse({ ...named, projectId: named.projectId ?? null, projectName: named.projectName ?? null, totalHours: Number(named.totalHours), note: named.note ?? null }));
});

router.patch("/time-entries/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateTimeEntryParams.safeParse(req.params);
  const parsed = UpdateTimeEntryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Ongeldige correctie." });
    return;
  }
  const current = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.id, params.data.id));
  if (!current[0]) {
    res.status(404).json({ error: "Registratie niet gevonden." });
    return;
  }
  const updates = { ...parsed.data, status: "corrected" as const };
  const [entry] = await db.update(timeEntriesTable).set(updates).where(eq(timeEntriesTable.id, params.data.id)).returning();
  const [named] = await withNames([entry]);
  res.json(UpdateTimeEntryResponse.parse({ ...named, projectId: named.projectId ?? null, projectName: named.projectName ?? null, totalHours: Number(named.totalHours), note: named.note ?? null }));
});

router.get("/overtime-requests", async (req, res): Promise<void> => {
  const employee = req.employee!;
  const requests = await db.select().from(overtimeRequestsTable)
    .where(employee.isAdmin ? undefined : eq(overtimeRequestsTable.employeeId, employee.id))
    .orderBy(desc(overtimeRequestsTable.createdAt));
  const named = await withNames(requests);
  res.json(ListOvertimeRequestsResponse.parse(named.map((request) => ({ ...request, createdAt: request.createdAt.toISOString() }))));
});

router.post("/overtime-requests", async (req, res): Promise<void> => {
  const parsed = CreateOvertimeRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.employeeId !== req.employee!.id) {
    res.status(403).json({ error: "Je kunt alleen voor jezelf overuren aanvragen." });
    return;
  }
  const [request] = await db.insert(overtimeRequestsTable).values({ ...parsed.data, status: "pending" }).returning();
  const [named] = await withNames([request]);
  res.status(201).json(CreateOvertimeRequestResponse.parse({ ...named, createdAt: named.createdAt.toISOString() }));
});

router.patch("/overtime-requests/:id/decision", requireAdmin, async (req, res): Promise<void> => {
  const params = DecideOvertimeRequestParams.safeParse(req.params);
  const parsed = DecideOvertimeRequestBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Ongeldige beslissing." });
    return;
  }
  const [request] = await db.update(overtimeRequestsTable).set({ status: parsed.data.status }).where(eq(overtimeRequestsTable.id, params.data.id)).returning();
  if (!request) {
    res.status(404).json({ error: "Verzoek niet gevonden." });
    return;
  }
  const [named] = await withNames([request]);
  res.json(DecideOvertimeRequestResponse.parse({ ...named, createdAt: named.createdAt.toISOString() }));
});

router.get("/dashboard", requireAdmin, async (_req, res): Promise<void> => {
  await applyAutomaticClockOut();
  const employees = await seed();
  const entries = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.date, today()));
  const requests = await db.select().from(overtimeRequestsTable).where(and(eq(overtimeRequestsTable.date, today()), eq(overtimeRequestsTable.status, "pending")));
  const byEmployee = new Map(entries.map((entry) => [entry.employeeId, entry]));
  const rows = employees.map((employee) => {
    const entry = byEmployee.get(employee.id);
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      status: entry?.endTime ? "complete" : entry ? "open" : "absent",
      startTime: entry?.startTime ?? null,
      endTime: entry?.endTime ?? null,
      totalHours: entry ? Number(entry.totalHours) : 0,
    };
  });
  const complete = rows.filter((row) => row.status === "complete").length;
  const open = rows.filter((row) => row.status === "open").length;
  res.json(GetDashboardResponse.parse({
    date: today(),
    present: complete + open,
    complete,
    open,
    overtimePending: requests.length,
    scheduledHours: employees.length * SCHEDULED_HOURS,
    loggedHours: rows.reduce((sum, row) => sum + row.totalHours, 0),
    employees: rows,
  }));
});

setInterval(() => {
  void applyAutomaticClockOut();
}, 60_000);

export default router;