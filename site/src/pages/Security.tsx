import { MarkdownPage } from '../components/MarkdownPage';

const SECURITY_URL =
  'https://raw.githubusercontent.com/uzzsam/schaaq-scanner/main/legal/security-practices.md';

export function Security() {
  return <MarkdownPage url={SECURITY_URL} title="Security Practices" />;
}
