import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../controllers/accountController";

const router = Router();

// Protect all account endpoints with authentication
router.use(requireAuth);

router.get("/", getAccounts);
router.get("/:id", getAccountById);
router.post("/", createAccount);
router.put("/:id", updateAccount);
router.delete("/:id", deleteAccount);

export default router;
