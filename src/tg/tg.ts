type HapticKind = 'tap' | 'select' | 'notify' | 'warn';

type TgWebApp = {
  ready(): void;
  expand(): void;
  platform?: string;
  colorScheme?: 'light' | 'dark';
  initDataUnsafe?: { user?: { language_code?: string }; start_param?: string };
  HapticFeedback?: {
    impactOccurred(style: string): void;
    notificationOccurred(type: string): void;
    selectionChanged(): void;
  };
  openTelegramLink(url: string): void;
  contentSafeAreaInsetTop?: number;
  contentSafeAreaInsetBottom?: number;
  headerHeight?: number;
  onEvent?(event: string, handler: () => void): void;
};

export function tg(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const app = (window as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  if (!app || !app.platform || app.platform === 'unknown') return null;
  return app;
}

export const isTelegram = (): boolean => tg() !== null;

export function tgColorScheme(): 'dark' | 'light' | null {
  const scheme = tg()?.colorScheme;
  return scheme === 'dark' || scheme === 'light' ? scheme : null;
}

export function tgLocale(): string | null {
  return tg()?.initDataUnsafe?.user?.language_code ?? null;
}

export function tgStartParam(): string | null {
  const fromApi = tg()?.initDataUnsafe?.start_param;
  if (fromApi) return fromApi;
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    return q.get('tgWebAppStartParam');
  }
  return null;
}

export function haptic(kind: HapticKind): void {
  const hf = tg()?.HapticFeedback;
  if (!hf) {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'warn' ? 40 : kind === 'notify' ? 25 : 10);
    }
    return;
  }
  try {
    if (kind === 'tap') hf.impactOccurred('light');
    else if (kind === 'select') hf.selectionChanged();
    else if (kind === 'notify') hf.notificationOccurred('success');
    else hf.notificationOccurred('error');
  } catch {
    /* haptics unavailable */
  }
}

export function openTelegramShare(url: string): void {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}`;
  const app = tg();
  if (app) app.openTelegramLink(share);
  else if (typeof window !== 'undefined') window.open(share, '_blank');
}

export function tgReady(): void {
  const app = tg();
  if (!app) return;
  try {
    app.ready();
    app.expand();
  } catch {
    /* not ready yet */
  }
}

const TG_HEADER_MIN_PX = 56;

export function applyContentSafeArea(): void {
  if (typeof document === 'undefined') return;
  const app = tg();
  let top = 0;
  let bottom = 0;
  if (app) {
    if (typeof app.contentSafeAreaInsetTop === 'number') top = Math.max(top, app.contentSafeAreaInsetTop);
    if (typeof app.contentSafeAreaInsetBottom === 'number') bottom = Math.max(bottom, app.contentSafeAreaInsetBottom);
    if (typeof app.headerHeight === 'number') top = Math.max(top, app.headerHeight);
    top = Math.max(top, TG_HEADER_MIN_PX);
  }
  const root = document.documentElement;
  root.style.setProperty('--tg-inset-top', `${top}px`);
  root.style.setProperty('--tg-inset-bottom', `${bottom}px`);
}

export function watchContentSafeArea(): void {
  applyContentSafeArea();
  const app = tg();
  if (!app || typeof app.onEvent !== 'function') return;
  try {
    app.onEvent('contentSafeAreaChanged', applyContentSafeArea);
  } catch {
    /* older SDK without this event */
  }
}
