import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBlock } from '../components/docs/CodeBlock';
import { Callout } from '../components/docs/Callout';
import { StepNumber } from '../components/docs/StepNumber';
import { useActiveSection } from '../hooks/useActiveSection';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/* ─── Table of contents data ─── */

const toc = [
  { id: 'prerequisites', label: 'Prerequisites' },
  { id: 'install', label: 'Step 1: Install' },
  { id: 'project', label: 'Step 2: Create a Project' },
  { id: 'connect', label: 'Step 3: Connect' },
  { id: 'scan', label: 'Step 4: Run the Scan' },
  { id: 'review', label: 'Step 5: Review Findings' },
  { id: 'report', label: 'Step 6: Export Report' },
  { id: 'next', label: 'Next Steps' },
];

/* ─── TOC sidebar ─── */

function TocSidebar({ activeId }: { activeId: string }) {
  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
        On this page
      </p>
      {toc.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${
            activeId === item.id
              ? 'text-schaaq-400 bg-schaaq-500/10 font-medium'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/* ─── Mobile TOC dropdown ─── */

function MobileToc({ activeId }: { activeId: string }) {
  const [open, setOpen] = useState(false);
  const current = toc.find((t) => t.id === activeId) ?? toc[0];

  return (
    <div className="lg:hidden sticky top-16 z-30 -mx-6 px-6 py-3 bg-[#0A0F1A]/90 backdrop-blur-xl border-b border-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-white/5 text-sm text-gray-300"
      >
        <span>{current.label}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="mt-2 p-2 rounded-lg bg-[#0F1629] border border-white/5 space-y-0.5">
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => setOpen(false)}
              className={`block px-3 py-1.5 rounded-md text-sm transition-colors ${
                activeId === item.id
                  ? 'text-schaaq-400 bg-schaaq-500/10 font-medium'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Section heading helper ─── */

function SectionHead({ id, step, title }: { id: string; step?: number; title: string }) {
  return (
    <div id={id} data-section className="flex items-center gap-3 scroll-mt-28 pt-10 first:pt-0">
      {step != null && <StepNumber n={step} />}
      <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   GETTING STARTED PAGE
   ════════════════════════════════════════════════════════════════════════ */

export function GettingStarted() {
  useDocumentTitle('Getting Started');
  const activeId = useActiveSection();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {/* Page title */}
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-2">Documentation</p>
        <h1 className="font-display text-4xl font-bold text-white">Getting Started</h1>
        <p className="mt-3 text-gray-400 max-w-xl">
          Go from download to your first data quality report in under five minutes.
        </p>
      </div>

      {/* Mobile TOC */}
      <MobileToc activeId={activeId} />

      {/* Two-column layout */}
      <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
        {/* ── Main content ── */}
        <article className="min-w-0 space-y-8">

          {/* ── Prerequisites ── */}
          <SectionHead id="prerequisites" title="Prerequisites" />
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Schaaq Scanner installed (<Link to="/download" className="text-schaaq-400 hover:underline">Download</Link>)
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              A database to scan (PostgreSQL, MySQL, or SQL Server) <span className="text-gray-500">or</span> CSV/Excel files
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Database credentials with <strong className="text-white font-medium">read-only access</strong> (we never write to your database)
            </li>
          </ul>

          {/* ── Step 1: Install ── */}
          <SectionHead id="install" step={1} title="Install" />
          <p className="text-sm text-gray-400 leading-relaxed">
            Download the installer for your platform from the{' '}
            <Link to="/download" className="text-schaaq-400 hover:underline">Download page</Link>.
          </p>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Windows</h3>
              <p className="text-sm text-gray-400">
                Run the <code className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-xs">.exe</code> installer and follow the wizard. Accept the EULA when prompted. No admin rights required.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">macOS</h3>
              <p className="text-sm text-gray-400">
                Open the <code className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-xs">.dmg</code> file and drag Schaaq Scanner to your Applications folder.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Linux</h3>
              <p className="text-sm text-gray-400">
                Make the AppImage executable and run it:
              </p>
              <CodeBlock lang="bash">{`chmod +x Schaaq-Scanner-*-linux-x86_64.AppImage
./Schaaq-Scanner-*-linux-x86_64.AppImage`}</CodeBlock>
            </div>
          </div>

          <Callout type="tip" title="First launch">
            On first launch, the welcome wizard appears automatically. It walks you through creating your first project and running a demo scan.
          </Callout>

          {/* ── Step 2: Create a Project ── */}
          <SectionHead id="project" step={2} title="Create a Project" />
          <p className="text-sm text-gray-400 leading-relaxed">
            Projects group your scans, connections, and reports together.
          </p>
          <ol className="space-y-3 text-sm text-gray-400 list-none">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded bg-white/5 flex items-center justify-center font-mono text-xs text-gray-500">1</span>
              Click <strong className="text-white font-medium">New Project</strong> from the dashboard.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded bg-white/5 flex items-center justify-center font-mono text-xs text-gray-500">2</span>
              Enter a project name, e.g. <code className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-xs">Production DB Audit — March 2026</code>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded bg-white/5 flex items-center justify-center font-mono text-xs text-gray-500">3</span>
              Select the <strong className="text-white font-medium">sector</strong>: Mining &amp; Resources, Energy &amp; Utilities, or Environmental &amp; Sustainability.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded bg-white/5 flex items-center justify-center font-mono text-xs text-gray-500">4</span>
              Enter the <strong className="text-white font-medium">organisation name</strong> (used in report headers and branding).
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded bg-white/5 flex items-center justify-center font-mono text-xs text-gray-500">5</span>
              Click <strong className="text-white font-medium">Create</strong>.
            </li>
          </ol>

          {/* ── Step 3: Connect ── */}
          <SectionHead id="connect" step={3} title="Connect Your Database" />

          <h3 className="text-base font-semibold text-white mt-4">Option A: Live database connection</h3>
          <p className="text-sm text-gray-400 leading-relaxed mt-1">
            Enter your connection details: host, port, database name, username, and password.
            Click <strong className="text-white font-medium">Test Connection</strong> to verify access.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {[
              { label: 'Read-only access', desc: 'Scanner runs SELECT queries only — it never writes to your database.' },
              { label: 'Encrypted at rest', desc: 'Credentials are stored locally with AES-256-GCM encryption.' },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>

          <h3 className="text-base font-semibold text-white mt-8">Option B: CSV / Excel upload</h3>
          <p className="text-sm text-gray-400 leading-relaxed mt-1">
            Drag and drop CSV or Excel files into the project. Each file is treated as a table.
            Great for quick assessments, non-database data sources, or demos.
          </p>

          <Callout type="tip" title="Demo data">
            For your first scan, try the built-in demo data. Click{' '}
            <strong className="text-white">Run Demo Scan</strong> in the welcome wizard — no database needed.
          </Callout>

          {/* ── Step 4: Scan ── */}
          <SectionHead id="scan" step={4} title="Run the Scan" />
          <p className="text-sm text-gray-400 leading-relaxed">
            Click <strong className="text-white font-medium">Scan</strong> to start the analysis.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-400">
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              15 automated checks across 7 DAMA-aligned properties
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Real-time progress bar with per-check status
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-schaaq-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Typical scan time: <strong className="text-white font-medium">10 &ndash; 30 seconds</strong> for databases up to 200 tables
            </li>
          </ul>

          {/* ── Step 5: Review ── */}
          <SectionHead id="review" step={5} title="Review Findings" />
          <p className="text-sm text-gray-400 leading-relaxed">
            Once the scan completes, the results dashboard shows:
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            {reviewViews.map((v) => (
              <div key={v.title} className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="text-base">{v.icon}</span>
                  {v.title}
                </h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>

          {/* ── Step 6: Export ── */}
          <SectionHead id="report" step={6} title="Export Your Report" />
          <p className="text-sm text-gray-400 leading-relaxed">
            Generate a report from the scan results:
          </p>
          <div className="mt-4 space-y-3">
            {reportFormats.map((f) => (
              <div key={f.format} className="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02]">
                <span className="flex-shrink-0 text-lg">{f.icon}</span>
                <div>
                  <p className="text-sm font-medium text-white">{f.format}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
                </div>
              </div>
            ))}
          </div>

          <Callout type="note" title="Data stays local">
            All reports are generated on your machine. No data is transmitted to any server.
          </Callout>

          {/* ── Next Steps ── */}
          <SectionHead id="next" title="Next Steps" />
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <span className="text-lg flex-shrink-0">{'\u{1F3A8}'}</span>
              <div>
                <p className="text-sm font-medium text-white">Customise branding</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Go to <strong className="text-gray-300">Settings &rarr; Branding</strong> to add your logo and consultant details to reports.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <span className="text-lg flex-shrink-0">{'\u{1F517}'}</span>
              <div>
                <p className="text-sm font-medium text-white">Explore the API</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Scanner exposes a local REST API at{' '}
                  <code className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-xs">http://localhost:23847/api/</code>{' '}
                  for automation and integrations.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <span className="text-lg flex-shrink-0">{'\u{1F4DD}'}</span>
              <div>
                <p className="text-sm font-medium text-white">Read the changelog</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  See what&rsquo;s new in the latest release on the{' '}
                  <Link to="/changelog" className="text-schaaq-400 hover:underline">Changelog</Link> page.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom spacer */}
          <div className="h-16" />
        </article>

        {/* ── Desktop TOC sidebar ── */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <TocSidebar activeId={activeId} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ─── Data ─── */

const reviewViews = [
  {
    icon: '\u{1F4CA}',
    title: 'Dashboard',
    description: 'Overall maturity score, severity breakdown, and cost headline at a glance.',
  },
  {
    icon: '\u{1F9E9}',
    title: 'Properties View',
    description: 'Drill into each of the 7 DAMA-aligned properties with per-property scores.',
  },
  {
    icon: '\u{1F50D}',
    title: 'Findings',
    description: 'Individual issues with severity ratings, affected objects, and database-specific remediation advice.',
  },
  {
    icon: '\u{2705}',
    title: 'Strengths',
    description: "What's working well — positive observations and passing checks.",
  },
];

const reportFormats = [
  {
    icon: '\u{1F310}',
    format: 'HTML Report',
    description: 'Self-contained file that opens in any browser. Best for sharing via email or intranet.',
  },
  {
    icon: '\u{1F4C4}',
    format: 'PDF Report',
    description: 'Executive-ready with page breaks, branded headers, and print-optimised layout. Best for presentations and board packs.',
  },
  {
    icon: '\u{1F4C1}',
    format: 'CSV Export',
    description: 'Raw findings data for your own analysis in Excel, Power BI, or other tools.',
  },
];
