import express from 'express';
import { getTriggers, createTrigger, editTrigger, deleteTrigger } from '../controllers/triggerController.js';

const router = express.Router();

router.get('/', getTriggers);
router.post('/', createTrigger);
router.patch('/:id', editTrigger);
router.delete('/:id', deleteTrigger);

export default router;
