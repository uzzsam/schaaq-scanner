import { useState, useEffect, useCallback } from 'react';
import {
  fetchProjects,
  fetchProject,
  createProject as apiCreate,
  updateProject as apiUpdate,
  deleteProject as apiDelete,
  type Project,
  type CreateProjectInput,
} from '../api/client';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProjects();
      setProjects(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreateProjectInput) => {
    const project = await apiCreate(input);
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  const update = useCallback(async (id: string, updates: Partial<CreateProjectInput>) => {
    const project = await apiUpdate(id, updates);
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    return project;
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiDelete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, error, refresh: load, create, update, remove };
}

export function useProject(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProject(id);
      setProject(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { project, loading, error, refresh: load };
}
