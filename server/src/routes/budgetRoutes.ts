import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getBudgets,
  getBudgetById,
  createBudget,
  updateBudget,
  deleteBudget,
} from "../controllers/budgetController";

const router = Router();

// Protect all budget endpoints with authentication
router.use(requireAuth);

router.get("/", getBudgets);
router.get("/:id", getBudgetById);
router.post("/", createBudget);
router.put("/:id", updateBudget);
router.delete("/:id", deleteBudget);

export default router;
