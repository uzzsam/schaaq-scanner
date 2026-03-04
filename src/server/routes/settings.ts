import { Router } from 'express';
import multer from 'multer';
import type { Repository } from '../db/repository';
import { safeError } from '../middleware/safe-error';

const ALLOWED_KEYS = new Set([
  'consultant_name',
  'consultant_tagline',
  'report_title',
  'report_subtitle',
  'consultant_logo',
  'client_logo',
]);

const MAX_LOGO_BYTES = 500 * 1024; // 500 KB

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image type: ${file.mimetype}. Allowed: PNG, JPEG, SVG.`));
    }
  },
});

export function settingsRoutes(repo: Repository): Router {
  const router = Router();

  // GET /api/settings — return all settings as { key: value }
  router.get('/', (_req, res) => {
    try {
      const settings = repo.getAllSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/settings') });
    }
  });

  // PUT /api/settings/:key — update a single text setting
  router.put('/:key', (req, res) => {
    try {
      const { key } = req.params;
      if (!ALLOWED_KEYS.has(key)) {
        res.status(400).json({ error: `Unknown setting key: ${key}` });
        return;
      }
      // Don't allow logo updates via PUT (use POST /logo/:type instead)
      if (key === 'consultant_logo' || key === 'client_logo') {
        res.status(400).json({ error: 'Use POST /api/settings/logo/:type to upload logos' });
        return;
      }
      const { value } = req.body;
      if (typeof value !== 'string') {
        res.status(400).json({ error: 'Body must contain { value: string }' });
        return;
      }
      repo.setSetting(key, value);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'PUT /api/settings/:key') });
    }
  });

  // POST /api/settings/logo/:type — upload a logo image (multipart)
  router.post('/logo/:type', logoUpload.single('file'), (req, res) => {
    try {
      const { type } = req.params;
      if (type !== 'consultant' && type !== 'client') {
        res.status(400).json({ error: 'Logo type must be "consultant" or "client"' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Convert to base64 data URI
      const mimeType = file.mimetype;
      const base64 = file.buffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64}`;

      const key = `${type}_logo`;
      repo.setSetting(key, dataUri);

      res.json({ ok: true, size: file.size });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'POST /api/settings/logo/:type') });
    }
  });

  // DELETE /api/settings/logo/:type — remove a logo
  router.delete('/logo/:type', (req, res) => {
    try {
      const { type } = req.params;
      if (type !== 'consultant' && type !== 'client') {
        res.status(400).json({ error: 'Logo type must be "consultant" or "client"' });
        return;
      }
      const key = `${type}_logo`;
      repo.setSetting(key, '');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'DELETE /api/settings/logo/:type') });
    }
  });

  return router;
}
