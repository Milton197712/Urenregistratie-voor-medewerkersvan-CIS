import { clerkClient } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  employeesTable,
  type Employee,
} from "@workspace/db";
import {
  InviteEmployeeBody,
  InviteEmployeeResponse,
  ListEmployeesResponse,
} from "@workspace/api-zod";
import {
  employeeWithAccountStatus,
  requireAdmin,
  requireAppUser,
} from "../middlewares/auth";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

const router: IRouter = Router();

router.use(requireAppUser, requireAdmin);

router.get("/employees", async (_req, res): Promise<void> => {
  const employees = await db
    .select()
    .from(employeesTable)
    .orderBy(employeesTable.name);
  res.json(ListEmployeesResponse.parse(employees.map(employeeWithAccountStatus)));
});

router.post("/employees/invitations", async (req, res): Promise<void> => {
  const parsed = InviteEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Vul een geldig e-mailadres en profiel in." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const employeeId = parsed.data.employeeId;
  const [emailOwner] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.email, email))
    .limit(1);
  if (emailOwner && emailOwner.id !== employeeId) {
    res.status(409).json({ error: "Dit e-mailadres is al aan een profiel gekoppeld." });
    return;
  }

  let employee: Employee | undefined;
  let createdNewProfile = false;
  if (employeeId !== undefined) {
    const [existing] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Medewerkersprofiel niet gevonden." });
      return;
    }
    if (existing.isAdmin || existing.clerkUserId || existing.email) {
      res.status(409).json({ error: "Dit profiel is al gekoppeld of uitgenodigd." });
      return;
    }

    [employee] = await db
      .update(employeesTable)
      .set({ email })
      .where(and(eq(employeesTable.id, existing.id), isNull(employeesTable.clerkUserId)))
      .returning();
  } else {
    const initials =
      parsed.data.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "TV";
    [employee] = await db
      .insert(employeesTable)
      .values({
        name: parsed.data.name.trim(),
        role: "Medewerker",
        initials,
        department: parsed.data.department.trim(),
        email,
      })
      .returning();
    createdNewProfile = true;
  }

  if (!employee) {
    res.status(409).json({ error: "Dit profiel kan niet worden uitgenodigd." });
    return;
  }

  const host = getClerkProxyHost(req)?.split(",")[0]?.trim().toLowerCase();
  const allowedHosts = new Set(
    [
      ...(process.env.REPLIT_DOMAINS ?? "").split(","),
      process.env.REPLIT_DEV_DOMAIN ?? "",
    ]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!host || !allowedHosts.has(host)) {
    if (createdNewProfile) {
      await db.delete(employeesTable).where(eq(employeesTable.id, employee.id));
    } else {
      await db
        .update(employeesTable)
        .set({ email: null })
        .where(eq(employeesTable.id, employee.id));
    }
    res.status(400).json({ error: "De app-link voor de uitnodiging kon niet worden bepaald." });
    return;
  }

  try {
    await clerkClient.invitations.createInvitation({
      emailAddress: email,
      ignoreExisting: true,
      redirectUrl: `https://${host}/sign-up`,
    });
  } catch (error) {
    req.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Could not send employee invitation",
    );
    if (createdNewProfile) {
      await db.delete(employeesTable).where(eq(employeesTable.id, employee.id));
    } else {
      await db
        .update(employeesTable)
        .set({ email: null })
        .where(eq(employeesTable.id, employee.id));
    }
    res.status(502).json({ error: "De uitnodiging kon niet worden verzonden. Probeer het opnieuw." });
    return;
  }

  res.status(201).json(InviteEmployeeResponse.parse(employeeWithAccountStatus(employee)));
});

export default router;