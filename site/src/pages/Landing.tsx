import { Link } from 'react-router-dom';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/* ─── Radar chart SVG for report preview ─── */
function RadarChart() {
  // 8-point polygon (DAMA properties) — data values as fractions of radius
  const cx = 100, cy = 100, r = 70;
  const values = [0.85, 0.6, 0.45, 0.7, 0.9, 0.55, 0.75, 0.35];
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const n = values.length;

  const toPoint = (i: number, frac: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * frac * Math.cos(angle), cy + r * frac * Math.sin(angle)];
  };

  const gridPaths = gridLevels.map((lv) => {
    const pts = Array.from({ length: n }, (_, i) => toPoint(i, lv).join(','));
    return pts.join(' ');
  });

  const dataPts = values.map((v, i) => toPoint(i, v).join(',')).join(' ');
  const axisPts = Array.from({ length: n }, (_, i) => toPoint(i, 1));

  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      {/* Grid rings */}
      {gridPaths.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="#1e293b" strokeWidth={0.5} />
      ))}
      {/* Axis lines */}
      {axisPts.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1e293b" strokeWidth={0.5} />
      ))}
      {/* Data polygon */}
      <polygon points={dataPts} fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={1.5} />
      {/* Data dots */}
      {values.map((v, i) => {
        const [x, y] = toPoint(i, v);
        return <circle key={i} cx={x} cy={y} r={2.5} fill="#3b82f6" />;
      })}
    </svg>
  );
}

/* ─── OS icons ─── */
function WindowsIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}
function AppleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}
function LinuxIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.345 1.884 1.345.305 0 .599-.063.886-.21 1.042-.536 1.598-1.718 1.34-2.878-.172-.77-.766-1.437-1.573-1.852-.752-.381-1.625-.536-2.455-.413-.025-.108-.071-.198-.12-.298a2.37 2.37 0 00-.082-.157c.366-.547.506-1.245.388-2.042-.178-1.408-.936-2.845-1.739-3.98-.376-.533-.779-1.01-1.148-1.458-.371-.443-.687-.845-.867-1.197-.34-.67-.54-1.592-.54-2.457 0-.595.047-1.167.132-1.648.088-.468.2-.856.384-1.102.247-.33.63-.497 1.108-.497.235 0 .494.033.765.1 1.037.262 2.165 1.061 2.764 2.065.354.593.526 1.221.526 1.834 0 .369-.054.722-.159 1.054-.089.297-.296.569-.296.569l.004.003c.24.172.56.2.833.095a1.24 1.24 0 00.658-.567c.174-.31.265-.678.265-1.098 0-.893-.267-1.815-.783-2.662-.811-1.338-2.276-2.388-3.726-2.756-.395-.1-.792-.152-1.175-.152z" />
    </svg>
  );
}

/* ─── Section wrapper with scroll-margin for anchor nav ─── */
function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={className} style={{ scrollMarginTop: '5rem' }}>
      {children}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   LANDING PAGE
   ════════════════════════════════════════════════════════════════════════ */

export function Landing() {
  useDocumentTitle('');
  const revealRef = useScrollReveal();

  return (
    <div ref={revealRef}>

      {/* ── SECTION 1: HERO ─────────────────────────────────────────────── */}
      <Section className="relative overflow-hidden">
        {/* Background: gradient mesh + grid pattern */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {/* Radial glow — top center */}
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[900px] h-[700px] bg-schaaq-500/[0.07] rounded-full blur-[120px]" />
          {/* Secondary warm glow — offset */}
          <div className="absolute top-[10%] right-[10%] w-[400px] h-[400px] bg-purple-500/[0.04] rounded-full blur-[100px]" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.5) 59px, rgba(255,255,255,0.5) 60px), repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.5) 59px, rgba(255,255,255,0.5) 60px)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-24 text-center">
          {/* Pill badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-gray-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            v1.0 — Free for individual use
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] tracking-tight">
            Find the hidden cost
            <br />
            <span className="text-schaaq-400">of bad data.</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Schaaq Scanner connects to your database, runs 18 automated checks
            across 8 DAMA-aligned properties, and calculates the annual cost of
            data architecture disorder&nbsp;&mdash; with a remediation roadmap.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/download"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-schaaq-500 text-white font-semibold text-base hover:bg-schaaq-400 transition-colors shadow-lg shadow-schaaq-500/20"
            >
              Download for Free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
              </svg>
            </Link>
            <a
              href="#report-preview"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl border border-white/10 text-gray-300 font-semibold text-base hover:bg-white/5 transition-colors"
            >
              View Demo Report
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* OS availability */}
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5"><WindowsIcon /> Windows</span>
            <span className="inline-flex items-center gap-1.5"><AppleIcon /> macOS</span>
            <span className="inline-flex items-center gap-1.5"><LinuxIcon /> Linux</span>
          </div>
        </div>
      </Section>

      {/* ── SECTION 2: THE COST NUMBER ──────────────────────────────────── */}
      <Section className="py-20 sm:py-28">
        <div data-reveal className="reveal-up mx-auto max-w-4xl px-6 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-4">
            The cost of inaction
          </p>
          <p className="font-display text-5xl sm:text-6xl md:text-7xl font-bold text-white tracking-tight">
            $2.4M
          </p>
          <p className="mt-2 text-lg sm:text-xl text-gray-400">
            average annual data disorder cost per organisation
          </p>
          <p className="mt-4 text-sm text-gray-500 max-w-md mx-auto">
            Across mining, energy, and environmental sectors.
            Schaaq Scanner quantifies this in your first scan.
          </p>
        </div>
      </Section>

      {/* ── SECTION 3: HOW IT WORKS ────────────────────────────────────── */}
      <Section id="how-it-works" className="py-20 sm:py-28 bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="reveal-up text-center mb-16">
            <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-3">
              How it works
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              Three steps to clarity
            </h2>
          </div>

          <div data-reveal data-reveal-stagger className="grid md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.num} data-reveal-child className="reveal-up p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-4">
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-schaaq-500/10 font-mono text-sm font-bold text-schaaq-400">
                    {s.num}
                  </span>
                  <h3 className="font-display text-lg font-semibold text-white">{s.title}</h3>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>

          <p data-reveal className="reveal-up mt-10 text-center text-xs text-gray-500 max-w-lg mx-auto">
            Powered by information theory, economic input-output modelling,
            statistical simulation, and AI governance frameworks.
          </p>
        </div>
      </Section>

      {/* ── SECTION 4: THE 7 PROPERTIES ────────────────────────────────── */}
      <Section id="features" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="reveal-up text-center mb-16">
            <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-3">
              What we check
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              8 DAMA-aligned data properties
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              Each scan evaluates your database across eight fundamental properties
              of data architecture quality.
            </p>
          </div>

          <div data-reveal data-reveal-stagger className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {properties.map((p) => (
              <div
                key={p.id}
                data-reveal-child
                className="reveal-up group p-6 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-schaaq-500/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-schaaq-500/5 transition-all duration-300"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-md bg-schaaq-500/10 font-mono text-xs font-bold text-schaaq-400">
                    P{p.id}
                  </span>
                  <span className="text-lg">{p.icon}</span>
                </div>
                <h3 className="font-display font-semibold text-white text-sm mb-1.5">{p.name}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{p.question}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── SECTION 4b: AI READINESS CALLOUT ─────────────────────────── */}
      <Section className="pb-20 sm:pb-28">
        <div data-reveal className="reveal-up mx-auto max-w-4xl px-6">
          <div className="p-8 sm:p-10 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/[0.06] to-schaaq-500/[0.04] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[300px] h-[200px] bg-purple-500/[0.05] rounded-full blur-[80px] pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{'\u{1F916}'}</span>
                <div>
                  <h3 className="font-display text-xl font-bold text-white">AI Readiness Assessment</h3>
                  <p className="text-xs text-purple-300/70">New in v1.0 — Property P8</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                Three dedicated checks evaluate whether your data architecture can support safe, compliant AI/ML workloads:
                lineage completeness for model auditability, bias-relevant attribute documentation, and reproducibility support.
                Evidence-backed by EU AI Act Articles 10–13, NIST AI RMF, and ISO/IEC 5259.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── SECTION 5: REPORT PREVIEW ──────────────────────────────────── */}
      <Section id="report-preview" className="py-20 sm:py-28 bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="reveal-up text-center mb-12">
            <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-3">
              Report output
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              Executive-ready reports with white-label branding
            </h2>
            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
              Radar charts, 5-year cost projections, severity-rated findings,
              and database-specific remediation advice.
            </p>
          </div>

          {/* Fake report mockup */}
          <div data-reveal className="reveal-up mx-auto max-w-3xl">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#0F1629] to-[#0A0F1A] overflow-hidden shadow-2xl">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                <span className="w-3 h-3 rounded-full bg-red-500/60" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <span className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-3 text-xs text-gray-500 font-mono">schaaq-report-2026-03.html</span>
              </div>

              <div className="p-6 sm:p-8">
                {/* Header bar */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Data Quality Assessment</p>
                    <h3 className="font-display text-xl font-bold text-white">Executive Summary</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Annual Cost Estimate</p>
                    <p className="font-display text-2xl font-bold text-red-400">$4.9M</p>
                  </div>
                </div>

                {/* Radar chart + stats */}
                <div className="grid sm:grid-cols-2 gap-8">
                  <div className="aspect-square max-w-[240px] mx-auto sm:mx-0">
                    <RadarChart />
                  </div>
                  <div className="space-y-4">
                    {/* Severity badges */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Findings</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-semibold">4 Critical</span>
                        <span className="px-2.5 py-1 rounded-md bg-orange-500/10 text-orange-400 text-xs font-semibold">5 Major</span>
                        <span className="px-2.5 py-1 rounded-md bg-yellow-500/10 text-yellow-400 text-xs font-semibold">7 Minor</span>
                      </div>
                    </div>
                    {/* Maturity score */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Maturity Score</p>
                      <div className="flex items-end gap-2">
                        <span className="font-display text-3xl font-bold text-white">42</span>
                        <span className="text-sm text-gray-500 mb-1">/ 100</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full w-[42%] rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500" />
                      </div>
                    </div>
                    {/* Top remediation */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Top Remediation</p>
                      <p className="text-sm text-gray-300">Add primary keys to 12 unkeyed tables</p>
                      <p className="text-xs text-gray-500 mt-0.5">Est. savings: $840K/yr</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── SECTION 6: WHO IT'S FOR ────────────────────────────────────── */}
      <Section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="reveal-up text-center mb-16">
            <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-3">
              Built for
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              Who uses Schaaq Scanner
            </h2>
          </div>

          <div data-reveal data-reveal-stagger className="grid md:grid-cols-3 gap-6">
            {personas.map((p) => (
              <div key={p.title} data-reveal-child className="reveal-up p-7 rounded-2xl border border-white/5 bg-white/[0.02]">
                <span className="text-2xl mb-3 block">{p.icon}</span>
                <h3 className="font-display font-semibold text-white text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── SECTION 7: SECTORS ─────────────────────────────────────────── */}
      <Section className="py-20 sm:py-28 bg-white/[0.01]">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="reveal-up text-center mb-16">
            <p className="text-sm font-medium uppercase tracking-widest text-schaaq-400 mb-3">
              Industry focus
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
              Built for regulated industries
            </h2>
          </div>

          <div data-reveal data-reveal-stagger className="grid md:grid-cols-3 gap-6">
            {sectors.map((s) => (
              <div key={s.title} data-reveal-child className="reveal-up p-7 rounded-2xl border border-white/5 bg-white/[0.02]">
                <span className="text-2xl mb-3 block">{s.icon}</span>
                <h3 className="font-display font-semibold text-white text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── SECTION 8: CTA FOOTER ──────────────────────────────────────── */}
      <Section className="py-24 sm:py-32">
        <div data-reveal className="reveal-up mx-auto max-w-3xl px-6 text-center">
          <div className="p-12 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[500px] h-[300px] bg-schaaq-500/[0.06] rounded-full blur-[80px]" />
            </div>

            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                Start scanning in 2 minutes.
              </h2>
              <p className="mt-4 text-gray-400 max-w-md mx-auto">
                No account required. No data leaves your machine.
              </p>
              <Link
                to="/download"
                className="mt-8 inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-schaaq-500 text-white font-semibold text-lg hover:bg-schaaq-400 transition-colors shadow-lg shadow-schaaq-500/20"
              >
                Download for Free
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </Section>

    </div>
  );
}

/* ─── Data ─────────────────────────────────────────────────────────────── */

const steps = [
  {
    num: '01',
    title: 'Connect',
    description:
      'Point Scanner at any PostgreSQL, MySQL, or SQL Server database. Or upload CSV/Excel files for offline analysis.',
  },
  {
    num: '02',
    title: 'Scan',
    description:
      '18 automated checks evaluate naming, types, relationships, governance, null rates, audit trails, AI readiness, and more.',
  },
  {
    num: '03',
    title: 'Report',
    description:
      'Get a branded PDF with cost projections, maturity scores, and a prioritised remediation roadmap.',
  },
];

const properties = [
  { id: 1, name: 'Semantic Identity', question: 'Are your entities named consistently?', icon: '\u{1F3F7}\uFE0F' },
  { id: 2, name: 'Controlled Reference', question: 'Are data types and vocabularies standardised?', icon: '\u{1F4DA}' },
  { id: 3, name: 'Domain Ownership', question: 'Are domain boundaries clean or bleeding together?', icon: '\u{1F9E9}' },
  { id: 4, name: 'Anti-Corruption', question: 'Are there signs of data import shortcuts?', icon: '\u{1F6E1}\uFE0F' },
  { id: 5, name: 'Schema Governance', question: 'Do tables have primary keys and naming conventions?', icon: '\u{1F3DB}\uFE0F' },
  { id: 6, name: 'Quality Measurement', question: "What's the null rate, index coverage, and data health?", icon: '\u{1F4CA}' },
  { id: 7, name: 'Regulatory Traceability', question: 'Do you have audit columns and referential integrity?', icon: '\u{1F4DC}' },
  { id: 8, name: 'AI Readiness', question: 'Is your data architecture ready for safe, compliant, auditable AI/ML workloads?', icon: '\u{1F916}' },
];

const personas = [
  {
    icon: '\u{1F6E0}\uFE0F',
    title: 'Data Engineers',
    description:
      'Run Scanner against your staging database before every release. Catch schema drift, missing constraints, and naming violations automatically.',
  },
  {
    icon: '\u{1F4D0}',
    title: 'Data Architects & Consultants',
    description:
      'Generate branded assessment reports for clients. White-label with your firm\'s logo and deliver executive-ready findings.',
  },
  {
    icon: '\u{1F4C8}',
    title: 'IT Leaders & CDOs',
    description:
      'Get a dollar figure for data disorder. Use the 5-year projection to build the business case for data governance investment.',
  },
];

const sectors = [
  {
    icon: '\u{26CF}\uFE0F',
    title: 'Mining & Resources',
    description:
      'Sector-specific calibration for geological survey data, resource estimation databases, and environmental monitoring systems.',
  },
  {
    icon: '\u{26A1}',
    title: 'Energy & Utilities',
    description:
      'Tailored checks for SCADA historians, asset management databases, and regulatory reporting schemas.',
  },
  {
    icon: '\u{1F33F}',
    title: 'Environmental & Sustainability',
    description:
      'Calibrated for environmental monitoring, emissions tracking, and ESG reporting data architectures.',
  },
];
