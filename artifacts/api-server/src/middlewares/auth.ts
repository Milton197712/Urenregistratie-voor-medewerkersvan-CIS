import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import type { Request, RequestHandler } from "express";
import { db, employeesTable, type Employee } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      clerkUserId?: string;
      employee?: Employee;
    }
  }
}

async function findOrProvisionEmployee(userId: string): Promise<Employee | null> {
  const [linked] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.clerkUserId, userId))
    .limit(1);
  if (linked) return linked;

  const clerkUser = await clerkClient.users.getUser(userId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId,
  );
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    return null;
  }

  const email = primaryEmail.emailAddress.trim().toLowerCase();
  const firstAdminEmail = process.env.TIJDVAST_INITIAL_ADMIN_EMAIL
    ?.trim()
    .toLowerCase();
  const isFirstAdmin = Boolean(firstAdminEmail && email === firstAdminEmail);

  const [invited] = await db
    .select()
    .from(employeesTable)
    .where(and(eq(employeesTable.email, email), isNull(employeesTable.clerkUserId)))
    .limit(1);

  if (invited) {
    const [claimed] = await db
      .update(employeesTable)
      .set({
        clerkUserId: userId,
        isAdmin: invited.isAdmin || isFirstAdmin,
        role: isFirstAdmin ? "Beheerder" : invited.role,
      })
      .where(
        and(
          eq(employeesTable.id, invited.id),
          isNull(employeesTable.clerkUserId),
        ),
      )
      .returning();
    if (claimed) return claimed;

    const [raced] = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.clerkUserId, userId))
      .limit(1);
    return raced ?? null;
  }

  if (!isFirstAdmin) return null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email.split("@")[0];
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TV";

  const [created] = await db
    .insert(employeesTable)
    .values({
      name,
      role: "Beheerder",
      initials,
      department: "Beheer",
      email,
      clerkUserId: userId,
      isAdmin: true,
    })
    .onConflictDoNothing({ target: employeesTable.clerkUserId })
    .returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.clerkUserId, userId))
    .limit(1);
  return raced ?? null;
}

export async function getRequestEmployee(
  req: Request,
): Promise<Employee | null> {
  const { userId } = getAuth(req);
  if (!userId) return null;
  return findOrProvisionEmployee(userId);
}

export const requireAppUser: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Meld je aan om verder te gaan." });
    return;
  }

  const employee = await findOrProvisionEmployee(userId);
  if (!employee) {
    res.status(403).json({
      error: "Toegang tot Tijdvast is alleen mogelijk op uitnodiging.",
      code: "INVITATION_REQUIRED",
    });
    return;
  }

  req.clerkUserId = userId;
  req.employee = employee;
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.employee?.isAdmin) {
    res.status(403).json({ error: "Beheerdersrechten zijn vereist." });
    return;
  }
  next();
};

export function employeeWithAccountStatus(employee: Employee) {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    initials: employee.initials,
    department: employee.department,
    email: employee.email,
    isAdmin: employee.isAdmin,
    accountStatus: employee.clerkUserId
      ? "active"
      : employee.email
        ? "invited"
        : "unlinked",
  } as const;
}