import type { Request, Response, NextFunction } from 'express';

/**
 * Optional API key authentication middleware.
 *
 * If the DALC_API_KEY environment variable is set, all /api/* requests
 * must include a matching `Authorization: Bearer <key>` header.
 * If DALC_API_KEY is not set, this middleware is a no-op — preserving
 * the existing localhost-only open-access behaviour.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.DALC_API_KEY;

  // No key configured — skip auth (localhost-only default)
  if (!apiKey) {
    next();
    return;
  }

  // Health endpoint is always open (for load-balancer probes)
  if (req.path === '/api/health') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "
  if (token !== apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
