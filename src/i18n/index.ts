import type { Lang } from '../core/types';
import { en } from './en';
import { ru } from './ru';
import type { Dict } from './ru';

const dicts: Record<Lang, Dict> = { ru, en };

export function t(lang: Lang, key: keyof Dict, params?: Record<string, string | number>): string {
  let s: string = dicts[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

export function resolveLang(mode: 'auto' | Lang, tgLocale: string | null, navLangs: readonly string[]): Lang {
  if (mode !== 'auto') return mode;
  const raw = tgLocale ?? navLangs[0] ?? 'en';
  return raw.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
