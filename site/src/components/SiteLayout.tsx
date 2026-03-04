import { Link, NavLink, Outlet } from 'react-router-dom';

const navLinks = [
  { to: '/#features', label: 'Features' },
  { to: '/download', label: 'Download' },
  { to: '/docs/start', label: 'Docs' },
  { to: '/changelog', label: 'Changelog' },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-schaaq-500 text-white font-display font-bold text-lg group-hover:bg-schaaq-400 transition-colors">
        Q
      </span>
      <span className="font-display font-semibold text-white text-lg tracking-tight">
        Schaaq Scanner
      </span>
    </Link>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0A0F1A]/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        <Logo />

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Link
          to="/download"
          className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-schaaq-500 text-white text-sm font-semibold hover:bg-schaaq-400 transition-colors"
        >
          Download
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

const footerColumns = [
  {
    title: 'Product',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/download', label: 'Download' },
      { to: '/changelog', label: 'Changelog' },
      { to: '/security', label: 'Security' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { to: '/docs/start', label: 'Getting Started' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/legal/privacy', label: 'Privacy Policy' },
      { to: '/legal/terms', label: 'Terms of Service' },
      { to: '/legal/eula', label: 'EULA' },
    ],
  },
];

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#060A14]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 text-sm text-gray-500 leading-relaxed">
              Data quality diagnostic tool. Scan, assess, remediate.
            </p>
          </div>

          {/* Nav columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Schaaq. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {/* GitHub placeholder */}
            <a
              href="https://github.com/schaaq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-400 transition-colors"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
