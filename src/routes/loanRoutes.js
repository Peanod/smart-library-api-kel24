import express from 'express';
import { LoanController } from '../controllers/loanController.js';

const router = express.Router();

// ENDPOINT BARU: GET /api/loans/top-borrowers
// Harus ditaruh sebelum route lain agar tidak terjadi konflik pembacaan URL
router.get('/top-borrowers', LoanController.getTopBorrowers);

// ENDPOINT LAMA
router.get('/', LoanController.getLoans);
router.post('/', LoanController.createLoan);

export default router;