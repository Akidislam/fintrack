import { Router } from "express";
import { createLoanController } from "../controllers/loanController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();
router.use(requireAuth);
router.post("/", createLoanController);

export default router;
