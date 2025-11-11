import express from 'express';
import { addPlausibleRCA, editPlausibleRCA, fetchPlausibleRCA, deletePlausibleRCA } from '../controllers/plausibleController.js';

const router = express.Router();

router.get('/', fetchPlausibleRCA)
router.post('/add', addPlausibleRCA)
router.patch('/:id', editPlausibleRCA)
router.delete('/:id', deletePlausibleRCA)

export default router;
