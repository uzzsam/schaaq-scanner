import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DisplayModeProvider } from './config/DisplayModeContext';
import { Layout } from './components/Layout';
import { WhatsNew } from './components/WhatsNew';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectForm } from './pages/ProjectForm';
import { ScanProgress } from './pages/ScanProgress';
import { ScanResults } from './pages/ScanResults';
import { ScanProperties } from './pages/ScanProperties';
import { ScanReport } from './pages/ScanReport';
import { BrandingSettings } from './pages/BrandingSettings';

const VERSION_KEY = 'schaaq_last_seen_version';

export default function App() {
  const [whatsNewVersion, setWhatsNewVersion] = useState<string | null>(null);

  // Check whether the app version has changed since last launch
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const version = window.schaaq?.getVersion
          ? await window.schaaq.getVersion()
          : await fetch('/api/version').then((r) => r.json()).then((d) => d.version as string);

        if (!version) return;

        const lastSeen = localStorage.getItem(VERSION_KEY);

        if (lastSeen && lastSeen !== version) {
          // Version changed since last visit → show What's New
          setWhatsNewVersion(version);
        }

        // Always persist the current version
        localStorage.setItem(VERSION_KEY, version);
      } catch {
        // Silently ignore — version check is non-critical
      }
    };
    checkVersion();
  }, []);

  return (
    <DisplayModeProvider>
      <BrowserRouter>
        {whatsNewVersion && (
          <WhatsNew
            version={whatsNewVersion}
            onDismiss={() => setWhatsNewVersion(null)}
          />
        )}
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
            <Route path="/settings/branding" element={<BrandingSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </DisplayModeProvider>
  );
}
