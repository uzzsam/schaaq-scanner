import { MarkdownPage } from '../components/MarkdownPage';

const CHANGELOG_URL =
  'https://raw.githubusercontent.com/uzzsam/schaaq-scanner/main/CHANGELOG.md';

export function Changelog() {
  return <MarkdownPage url={CHANGELOG_URL} title="Changelog" />;
}
