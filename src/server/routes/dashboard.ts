import { Router } from 'express';
import type { Repository } from '../db/repository';

export function dashboardRoutes(repo: Repository): Router {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const stats = repo.getDashboardStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
