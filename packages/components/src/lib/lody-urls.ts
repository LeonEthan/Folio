import { isNativeAppShell } from './native-platform';

const LODY_FALLBACK_ORIGIN = 'https://lody.ai';

/** Public invite for the Lody Discord server (sidebar + About → Join community). */
export const LODY_DISCORD_URL = 'https://discord.gg/E8mZtMu38s';

/**
 * Resolve the origin to use for Lody marketing/site links (download page,
 * website, etc.). Borrows the current web origin when there is a real one so
 * staging/preview builds link to themselves, and falls back to the canonical
 * production origin when there isn't (native shells, `file://` Electron
 * bundles, SSR).
 */
export function getLodyOrigin(): string {
  if (typeof window === 'undefined' || isNativeAppShell()) {
    return LODY_FALLBACK_ORIGIN;
  }
  if (window.location.protocol === 'file:' || window.location.origin === 'null') {
    return LODY_FALLBACK_ORIGIN;
  }
  return window.location.origin;
}

export function getDownloadPageUrl(language: string | undefined): string {
  const isChinese = language?.startsWith('zh') ?? false;
  const path = isChinese ? '/zh/download' : '/download';
  return new URL(path, getLodyOrigin()).toString();
}

export function getChangelogUrl(_language: string | undefined): string {
  return 'https://github.com/LeonEthan/Geon/releases';
}

export function getWebsiteUrl(language: string | undefined): string {
  const isChinese = language?.startsWith('zh') ?? false;
  const path = isChinese ? '/zh/' : '/home';
  return new URL(path, getLodyOrigin()).toString();
}

/** Geon public help; upstream Lody URLs above retain their original attribution. */
export const GEON_REPOSITORY_URL = 'https://github.com/LeonEthan/Geon';
export const GEON_ISSUES_URL = `${GEON_REPOSITORY_URL}/issues`;
export function getGeonDocumentationUrl(language: string | undefined): string {
  return language?.startsWith('zh')
    ? `${GEON_REPOSITORY_URL}/blob/main/README.zh-CN.md`
    : `${GEON_REPOSITORY_URL}#readme`;
}
