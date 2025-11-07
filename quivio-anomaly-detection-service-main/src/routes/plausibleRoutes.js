import express from 'express';
import { addPlausibleRCA, editPlausibleRCA, fetchPlausibleRCA } from '../controllers/plausibleController.js';

const router = express.Router();

router.get('/', fetchPlausibleRCA)
router.post('/add', addPlausibleRCA)
router.patch('/:id', editPlausibleRCA)

export default router;
