import { Router, type IRouter } from "express";
import authRouter from "./auth";
import employeesRouter from "./employees";
import healthRouter from "./health";
import timeRouter from "./time";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(employeesRouter);
router.use(timeRouter);

export default router;
