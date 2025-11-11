import express from 'express';
import { addManualRCA, getAlerts, getTrends, getStateHistory, addStateHistory} from '../controllers/alertController.js';

const router = express.Router();

router.get('/', getAlerts);
router.post('/trends', getTrends);
router.post('/addManualRCA', addManualRCA)
router.get('/stateHistory', getStateHistory);
router.post('/stateHistory', addStateHistory);

export default router;
