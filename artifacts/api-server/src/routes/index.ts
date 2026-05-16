import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import signalsRouter from "./signals";
import subscribersRouter from "./subscribers";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(signalsRouter);
router.use(subscribersRouter);
router.use(statsRouter);

export default router;
