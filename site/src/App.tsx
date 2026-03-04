import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Download } from './pages/Download';
import { GettingStarted } from './pages/GettingStarted';
import { Changelog } from './pages/Changelog';
import { LegalPage } from './pages/LegalPage';
import { Security } from './pages/Security';
import { NotFound } from './pages/NotFound';
import { SiteLayout } from './components/SiteLayout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/download" element={<Download />} />
          <Route path="/docs/start" element={<GettingStarted />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/legal/privacy" element={<LegalPage doc="privacy" />} />
          <Route path="/legal/terms" element={<LegalPage doc="terms" />} />
          <Route path="/legal/eula" element={<LegalPage doc="eula" />} />
          <Route path="/security" element={<Security />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
