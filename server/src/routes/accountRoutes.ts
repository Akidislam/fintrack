import { Router } from "express";
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../controllers/accountController";

const router = Router();

router.get("/", getAccounts);
router.get("/:id", getAccountById);
router.post("/", createAccount);
router.put("/:id", updateAccount);
router.delete("/:id", deleteAccount);

export default router;
