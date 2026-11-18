const GITHUB_PAGES_HOST = 'chuyuehuang118-debug.github.io';
const GITHUB_PAGES_BASE = '/main-study';
const DATA_BACKEND = (
  import.meta.env.VITE_DATA_BACKEND ||
  'https://jutwnwxspgzenyjxdfeb.supabase.co/functions/v1/study-api'
).replace(/\/+$/, '');

function isGitHubPages() {
  return (
    typeof window !== 'undefined' &&
    window.location.hostname === GITHUB_PAGES_HOST
  );
}

export function apiUrl(path: string) {
  return isGitHubPages() ? `${DATA_BACKEND}${path}` : path;
}

export function assetUrl(path: string) {
  return isGitHubPages() ? `${GITHUB_PAGES_BASE}${path}` : path;
}
