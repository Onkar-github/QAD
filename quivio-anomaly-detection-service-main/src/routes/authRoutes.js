import express from 'express';
import { loginUser, refreshAlerts } from '../controllers/authController.js';

const router = express.Router();

router.post('/', loginUser);
router.post('/refreshAlerts', refreshAlerts)

export default router;
