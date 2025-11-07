import express from 'express';
import { addManualRCA, getAlerts, getTrends } from '../controllers/alertController.js';

const router = express.Router();

router.get('/', getAlerts);
router.post('/trends', getTrends);
router.post('/addManualRCA', addManualRCA)

export default router;
