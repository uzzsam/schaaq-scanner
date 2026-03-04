import { useEffect, useMemo, useState } from 'react';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const FALLBACK_VERSION = '0.2.2';
const REPO = 'uzzsam/schaaq-scanner';

type OS = 'windows' | 'mac' | 'linux' | 'unknown';

function detectOS(): OS {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

/* ─── OS icons (sized for cards) ─── */

function WindowsIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function AppleIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function LinuxIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.345 1.884 1.345.305 0 .599-.063.886-.21 1.042-.536 1.598-1.718 1.34-2.878-.172-.77-.766-1.437-1.573-1.852-.752-.381-1.625-.536-2.455-.413-.025-.108-.071-.198-.12-.298a2.37 2.37 0 00-.082-.157c.366-.547.506-1.245.388-2.042-.178-1.408-.936-2.845-1.739-3.98-.376-.533-.779-1.01-1.148-1.458-.371-.443-.687-.845-.867-1.197-.34-.67-.54-1.592-.54-2.457 0-.595.047-1.167.132-1.648.088-.468.2-.856.384-1.102.247-.33.63-.497 1.108-.497.235 0 .494.033.765.1 1.037.262 2.165 1.061 2.764 2.065.354.593.526 1.221.526 1.834 0 .369-.054.722-.159 1.054-.089.297-.296.569-.296.569l.004.003c.24.172.56.2.833.095a1.24 1.24 0 00.658-.567c.174-.31.265-.678.265-1.098 0-.893-.267-1.815-.783-2.662-.811-1.338-2.276-2.388-3.726-2.756-.395-.1-.792-.152-1.175-.152z" />
    </svg>
  );
}

/* ─── Download info per OS ─── */

interface PlatformInfo {
  os: OS;
  label: string;
  icon: React.ReactNode;
  fileName: (v: string) => string;
  url: (v: string) => string;
  size: string;
  arch: string;
  req: string;
}

const platforms: PlatformInfo[] = [
  {
    os: 'windows',
    label: 'Windows',
    icon: <WindowsIcon />,
    fileName: (v) => `Schaaq-Scanner-Setup-${v}-win-x64.exe`,
    url: (v) => `https://github.com/${REPO}/releases/latest/download/Schaaq-Scanner-Setup-${v}-win-x64.exe`,
    size: '~85 MB',
    arch: '64-bit (x64)',
    req: 'Windows 10 or later (64-bit)',
  },
  {
    os: 'mac',
    label: 'macOS',
    icon: <AppleIcon />,
    fileName: (v) => `Schaaq-Scanner-${v}-mac-arm64.dmg`,
    url: (v) => `https://github.com/${REPO}/releases/latest/download/Schaaq-Scanner-${v}-mac-arm64.dmg`,
    size: '~90 MB',
    arch: 'Universal (Intel + Apple Silicon)',
    req: 'macOS 12 Monterey or later',
  },
  {
    os: 'linux',
    label: 'Linux',
    icon: <LinuxIcon />,
    fileName: (v) => `Schaaq-Scanner-${v}-linux-x86_64.AppImage`,
    url: (v) => `https://github.com/${REPO}/releases/latest/download/Schaaq-Scanner-${v}-linux-x86_64.AppImage`,
    size: '~95 MB',
    arch: 'x86_64 (AppImage)',
    req: 'Ubuntu 20.04+, Fedora 36+, or equivalent',
  },
];

/* ─── Download card component ─── */

function DownloadCard({ platform, version, isPrimary }: { platform: PlatformInfo; version: string; isPrimary: boolean }) {
  return (
    <div
      className={`relative p-6 rounded-2xl border transition-all ${
        isPrimary
          ? 'border-schaaq-500/30 bg-schaaq-500/[0.04] shadow-lg shadow-schaaq-500/5'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10'
      }`}
    >
      {isPrimary && (
        <span className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-schaaq-500 text-white text-xs font-semibold">
          Recommended
        </span>
      )}

      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 ${isPrimary ? 'text-schaaq-400' : 'text-gray-500'}`}>
          {platform.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-white text-lg">{platform.label}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{platform.arch}</p>

          <a
            href={platform.url(version)}
            className={`mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isPrimary
                ? 'bg-schaaq-500 text-white hover:bg-schaaq-400 shadow-md shadow-schaaq-500/20'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
            </svg>
            Download for {platform.label}
          </a>

          <div className="mt-3 text-xs text-gray-500 space-y-0.5">
            <p className="font-mono truncate">{platform.fileName(version)}</p>
            <p>{platform.size}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   DOWNLOAD PAGE
   ════════════════════════════════════════════════════════════════════════ */

export function Download() {
  useDocumentTitle('Download');
  const revealRef = useScrollReveal();
  const [version, setVersion] = useState(FALLBACK_VERSION);
  const detectedOS = useMemo(detectOS, []);

  // Try to fetch latest version from GitHub Releases
  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((r) => r.json())
      .then((data: { tag_name?: string }) => {
        if (data.tag_name) setVersion(data.tag_name.replace(/^v/, ''));
      })
      .catch(() => {}); // Fail silently, use fallback
  }, []);

  // Sort platforms: detected OS first
  const sorted = useMemo(() => {
    const primary = platforms.find((p) => p.os === detectedOS);
    const others = platforms.filter((p) => p.os !== detectedOS);
    return primary ? [primary, ...others] : platforms;
  }, [detectedOS]);

  const osLabel: Record<OS, string> = {
    windows: 'Windows',
    mac: 'macOS',
    linux: 'Linux',
    unknown: 'your platform',
  };

  return (
    <div ref={revealRef}>
      {/* ── Hero ─── */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-8 text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">
          Download Schaaq Scanner
        </h1>
        <p className="mt-4 text-lg text-gray-400">
          {detectedOS !== 'unknown' ? (
            <>
              We detected you&rsquo;re on <span className="text-white font-medium">{osLabel[detectedOS]}</span>.
            </>
          ) : (
            'Select your platform below.'
          )}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Version {version} &middot; Free for individual use
        </p>
      </section>

      {/* ── Download cards ─── */}
      <section data-reveal className="reveal-up mx-auto max-w-2xl px-6 pb-16">
        <div className="space-y-4">
          {sorted.map((p, i) => (
            <DownloadCard
              key={p.os}
              platform={p}
              version={version}
              isPrimary={i === 0 && detectedOS !== 'unknown'}
            />
          ))}
        </div>

        {/* macOS Intel note */}
        <p className="mt-4 text-center text-xs text-gray-600">
          macOS Intel (x64) build also available on the{' '}
          <a
            href={`https://github.com/${REPO}/releases/latest`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-schaaq-400 hover:underline"
          >
            GitHub Releases page
          </a>
          .
        </p>
      </section>

      {/* ── System requirements ─── */}
      <section data-reveal className="reveal-up py-16 bg-white/[0.01]">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-2xl font-bold text-white mb-8 text-center">
            System Requirements
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {platforms.map((p) => (
              <div key={p.os} className="p-5 rounded-xl border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 mb-3 text-gray-400">
                  <span className="w-5 h-5">{p.os === 'windows' ? <WindowsIcon className="w-5 h-5" /> : p.os === 'mac' ? <AppleIcon className="w-5 h-5" /> : <LinuxIcon className="w-5 h-5" />}</span>
                  <span className="font-display font-semibold text-white text-sm">{p.label}</span>
                </div>
                <p className="text-sm text-gray-400">{p.req}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">
            All platforms: 200 MB disk space, 4 GB RAM recommended.
          </p>
        </div>
      </section>

      {/* ── SHA256 checksums ─── */}
      <section data-reveal className="reveal-up py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-display text-2xl font-bold text-white mb-4">
            Verify Your Download
          </h2>
          <p className="text-sm text-gray-400 max-w-lg mx-auto">
            SHA256 checksums are published with each release. Verify your download against the checksums file on the{' '}
            <a
              href={`https://github.com/${REPO}/releases/latest`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-schaaq-400 hover:underline"
            >
              GitHub Releases
            </a>{' '}
            page.
          </p>
        </div>
      </section>

      {/* ── What happens after install ─── */}
      <section data-reveal className="reveal-up py-16 bg-white/[0.01]">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="font-display text-2xl font-bold text-white mb-8 text-center">
            What happens after install?
          </h2>
          <div className="space-y-6">
            {postInstallSteps.map((step) => (
              <div key={step.num} className="flex gap-4">
                <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-schaaq-500/10 font-mono text-xs font-bold text-schaaq-400">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-white text-sm">{step.title}</h3>
                  <p className="mt-0.5 text-sm text-gray-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust signals ─── */}
      <section data-reveal className="reveal-up py-16">
        <div className="mx-auto max-w-3xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trustSignals.map((signal) => (
              <div key={signal} className="flex items-start gap-2 text-sm text-gray-400">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Data ─── */

const postInstallSteps = [
  {
    num: '01',
    title: 'Open Schaaq Scanner',
    description: 'Launch from your Start Menu, Applications folder, or desktop.',
  },
  {
    num: '02',
    title: 'Welcome wizard',
    description: 'The guided setup walks you through your first scan configuration.',
  },
  {
    num: '03',
    title: 'Connect a data source',
    description: 'Point at a PostgreSQL, MySQL, or SQL Server database — or upload CSV/Excel files.',
  },
  {
    num: '04',
    title: 'View findings & export',
    description: 'Review your findings in the web UI and export a branded PDF or HTML report.',
  },
];

const trustSignals = [
  'Code signed installer',
  'No account required',
  'All data stays local',
  'Automatic updates',
];
