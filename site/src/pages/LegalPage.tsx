import { MarkdownPage } from '../components/MarkdownPage';

const LEGAL_URLS: Record<string, { url: string; title: string }> = {
  privacy: {
    url: 'https://raw.githubusercontent.com/uzzsam/schaaq-scanner/main/legal/privacy-policy.md',
    title: 'Privacy Policy',
  },
  terms: {
    url: 'https://raw.githubusercontent.com/uzzsam/schaaq-scanner/main/legal/terms-of-service.md',
    title: 'Terms of Service',
  },
  eula: {
    url: 'https://raw.githubusercontent.com/uzzsam/schaaq-scanner/main/legal/eula.md',
    title: 'End User Licence Agreement',
  },
};

export function LegalPage({ doc }: { doc: string }) {
  const config = LEGAL_URLS[doc];
  if (!config) return <div className="mx-auto max-w-3xl px-6 py-20 text-gray-400">Not found</div>;
  return <MarkdownPage url={config.url} title={config.title} />;
}
