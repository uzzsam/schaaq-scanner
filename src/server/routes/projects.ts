import { Router } from 'express';
import type { Repository } from '../db/repository';

export function projectRoutes(repo: Repository): Router {
  const router = Router();

  // List all projects
  router.get('/', (req, res) => {
    try {
      const projects = repo.listProjects();
      res.json(projects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create project
  router.post('/', (req, res) => {
    try {
      const project = repo.createProject(req.body);
      res.status(201).json(project);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update project
  router.patch('/:id', (req, res) => {
    try {
      const project = repo.updateProject(req.params.id, req.body);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(project);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Archive project (soft delete)
  router.delete('/:id', (req, res) => {
    try {
      repo.archiveProject(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // List scans for a project
  router.get('/:id/scans', (req, res) => {
    try {
      const scans = repo.listScans(req.params.id);
      res.json(scans);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
