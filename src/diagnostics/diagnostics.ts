const MAX_ENTRIES = 400;

type DiagEntry = { t: number; kind: string; data?: unknown };

let entries: DiagEntry[] = [];
let counters: Record<string, number> = {};
let bootedAt = Date.now();

export const APP_VERSION = '1.1.0';

export function diag(kind: string, data?: unknown): void {
  try {
    entries.push({ t: Date.now(), kind, data });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  } catch {
    /* diagnostics must never break the app */
  }
}

export function diagCount(name: string): void {
  counters[name] = (counters[name] ?? 0) + 1;
}

function envPart(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    standalone?: boolean;
    mediaSession?: { playbackState?: string; setActionHandler?: unknown };
  };
  let storageBytes = -1;
  try {
    storageBytes = (localStorage.getItem('resttimer') ?? '').length;
  } catch {
    storageBytes = -1;
  }
  let swState = 'unsupported';
  try {
    swState = 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'controlled' : 'registered-none') : 'unsupported';
  } catch {
    /* keep swState */
  }
  return {
    appVersion: APP_VERSION,
    sessionUptimeMs: Date.now() - bootedAt,
    ua: navigator.userAgent,
    platform: navigator.platform ?? null,
    languages: navigator.languages ?? [navigator.language],
    online: navigator.onLine,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    safeAreaTopCss: getComputedStyle(document.documentElement).getPropertyValue('--tg-inset-top').trim() || null,
    standalone: nav.standalone ?? false,
    storageBytes,
    serviceWorker: swState,
    mediaSessionPresent: typeof nav.mediaSession === 'object',
    mediaSessionPlaybackState: nav.mediaSession?.playbackState ?? null,
    localStoragePersisted: typeof navigator.storage?.persisted === 'function' ? null : null,
  };
}

function telegramPart(): Record<string, unknown> {
  const app = (window as { Telegram?: { WebApp?: Record<string, unknown> } }).Telegram?.WebApp;
  if (!app) return { telegram: 'script-not-loaded' };
  const pick = (key: string): unknown => {
    const v = app[key];
    return typeof v === 'function' ? `[fn ${key}]` : v === undefined ? null : v;
  };
  return {
    telegram: 'loaded',
    platform: pick('platform'),
    colorScheme: pick('colorScheme'),
    version: pick('version'),
    isExpanded: pick('isExpanded'),
    viewportHeight: pick('viewportHeight'),
    viewportStableHeight: pick('viewportStableHeight'),
    contentSafeAreaInsetTop: pick('contentSafeAreaInsetTop'),
    contentSafeAreaInsetBottom: pick('contentSafeAreaInsetBottom'),
    headerHeight: pick('headerHeight'),
    initDataPresent: Boolean((app.initDataUnsafe as { user?: unknown } | undefined)?.user),
    languageCode: (app.initDataUnsafe as { user?: { language_code?: string } } | undefined)?.user?.language_code ?? null,
    startParamLength: String(pick('initDataUnsafe') ?? '').length,
    hapticPresent: Boolean(app.HapticFeedback),
  };
}

export function snapshotDiagnostics(): Record<string, unknown> {
  return {
    meta: { version: APP_VERSION, at: new Date().toISOString() },
    env: envPart(),
    telegram: telegramPart(),
    counters,
    entries,
  };
}

export function diagnosticsBase64(): string {
  const json = JSON.stringify(snapshotDiagnostics());
  const utf8 = new TextEncoder().encode(json);
  let bin = '';
  utf8.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

export function resetDiagnostics(): void {
  entries = [];
  counters = {};
  bootedAt = Date.now();
}
