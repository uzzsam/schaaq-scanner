import { Router } from 'express';
import type { Repository, ProjectRow } from '../db/repository';
import { safeError } from '../middleware/safe-error';
import { validateBody } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../schemas';

/**
 * Strip decrypted credentials from API responses.
 * Returns a boolean indicator so the UI knows whether a password is configured.
 */
function redactCredentials(project: ProjectRow): Record<string, unknown> {
  const { db_password, db_connection_uri, ...safe } = project;
  return {
    ...safe,
    db_password_set: db_password != null && db_password !== '',
    db_connection_uri_set: db_connection_uri != null && db_connection_uri !== '',
  };
}

export function projectRoutes(repo: Repository): Router {
  const router = Router();

  // List all projects
  router.get('/', (req, res) => {
    try {
      const projects = repo.listProjects();
      res.json(projects.map(redactCredentials));
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects') });
    }
  });

  // Get single project
  router.get('/:id', (req, res) => {
    try {
      const project = repo.getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(redactCredentials(project));
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects/:id') });
    }
  });

  // Create project
  router.post('/', validateBody(createProjectSchema), (req, res) => {
    try {
      const project = repo.createProject(req.body);
      res.status(201).json(redactCredentials(project));
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/projects') });
    }
  });

  // Update project
  router.patch('/:id', validateBody(updateProjectSchema), (req, res) => {
    try {
      const project = repo.updateProject(req.params.id as string, req.body);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(redactCredentials(project));
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'PATCH /api/projects/:id') });
    }
  });

  // Archive project (soft delete)
  router.delete('/:id', (req, res) => {
    try {
      repo.archiveProject(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'DELETE /api/projects/:id') });
    }
  });

  // List scans for a project
  router.get('/:id/scans', (req, res) => {
    try {
      const scans = repo.listScans(req.params.id);
      res.json(scans);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects/:id/scans') });
    }
  });

  return router;
}
