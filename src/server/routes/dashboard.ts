import { Router } from 'express';
import type { Repository } from '../db/repository';
import { safeError } from '../middleware/safe-error';

export function dashboardRoutes(repo: Repository): Router {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const stats = repo.getDashboardStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/dashboard') });
    }
  });

  return router;
}
