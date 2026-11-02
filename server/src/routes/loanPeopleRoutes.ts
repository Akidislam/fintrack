import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware";
import {
  createPersonController,
  deletePersonController,
  getPeople,
  getPersonByIdController,
  updatePersonController,
} from "../controllers/loanPeopleController";

const router = Router();

router.use(requireAuth);

router.get("/", getPeople);
router.post("/", createPersonController);
router.get("/:id", getPersonByIdController);
router.patch("/:id", updatePersonController);
router.delete("/:id", deletePersonController);

export default router;
