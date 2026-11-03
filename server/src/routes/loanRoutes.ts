import { Router } from "express";
import { createLoanController, getLoanController, listLoansController } from "../controllers/loanController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();
router.use(requireAuth);
router.get("/", listLoansController);
router.get("/:loanId", getLoanController);
router.post("/", createLoanController);

export default router;
