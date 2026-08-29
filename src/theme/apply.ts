import type { ThemeMode } from '../core/types';
import { tgColorScheme } from '../tg/tg';

export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'auto') return mode;
  const tgScheme = tgColorScheme();
  if (tgScheme) return tgScheme;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyThemeClass(resolved: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function initTheme(getMode: () => ThemeMode): () => void {
  const apply = () => applyThemeClass(resolveTheme(getMode()));
  apply();
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}

export function navLangs(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en'];
  return navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}
