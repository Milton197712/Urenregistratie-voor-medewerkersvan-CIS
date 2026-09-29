import { Router, type IRouter } from "express";
import healthRouter from "./health";
import timeRouter from "./time";

const router: IRouter = Router();

router.use(healthRouter);
router.use(timeRouter);

export default router;
