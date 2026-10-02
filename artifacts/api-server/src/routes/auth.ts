import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import { employeeWithAccountStatus, requireAppUser } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAppUser, (req, res): void => {
  if (!req.employee) {
    res.status(401).json({ error: "Meld je aan om verder te gaan." });
    return;
  }
  const employee = employeeWithAccountStatus(req.employee);
  res.json(
    GetCurrentUserResponse.parse({
      employee,
      isAdmin: req.employee.isAdmin,
    }),
  );
});

export default router;