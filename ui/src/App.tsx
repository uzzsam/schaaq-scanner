import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectForm } from './pages/ProjectForm';
import { ScanProgress } from './pages/ScanProgress';
import { ScanResults } from './pages/ScanResults';
import { ScanProperties } from './pages/ScanProperties';
import { ScanReport } from './pages/ScanReport';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/new" element={<ProjectForm />} />
          <Route path="/projects/:id/edit" element={<ProjectForm />} />
          <Route path="/scans/:scanId/progress" element={<ScanProgress />} />
          <Route path="/scans/:scanId/results" element={<ScanResults />} />
          <Route path="/scans/:scanId/properties" element={<ScanProperties />} />
          <Route path="/scans/:scanId/report" element={<ScanReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
