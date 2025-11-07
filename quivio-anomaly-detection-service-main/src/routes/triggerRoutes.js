import express from 'express';
import { getTriggers, createTrigger, editTrigger } from '../controllers/triggerController.js';

const router = express.Router();

router.get('/', getTriggers);
router.post('/', createTrigger);
router.patch('/:id', editTrigger);

export default router;
