import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  getCategories,
  createCategory,
  deleteCategory,
} from "../controllers/categoryController";

const router = Router();

// Protect all category endpoints with authentication
router.use(requireAuth);

router.get("/", getCategories);
router.post("/", createCategory);
router.delete("/:id", deleteCategory);

export default router;
