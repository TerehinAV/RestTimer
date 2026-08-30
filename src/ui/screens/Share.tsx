import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { encodeGroups, QR_BUDGET, STARTAPP_BUDGET } from '../../core/codec';
import { fmtMs, plannedMs } from '../../core/time';
import type { GroupConfig } from '../../core/types';
import { t } from '../../i18n';
import { useApp } from '../../store/app';
import { isTelegram, openTelegramShare } from '../../tg/tg';
import { diagCount } from '../../diagnostics/diagnostics';
import { useSwipeBack } from '../useSwipeBack';
import { haptic } from '../../tg/tg';

export function ShareScreen() {
  const groups = useApp((s) => s.registry.groups);
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const swipeBack = useSwipeBack(() => setScreen({ name: 'registry' }));
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g, i) => [g.id, i < maxExportableCount(groups)])),
  );

  const chosen = useMemo(() => groups.filter((g) => selected[g.id]), [groups, selected]);
  const payload = useMemo(() => (chosen.length > 0 ? encodeGroups(chosen) : ''), [chosen]);
  const url = useMemo(() => {
    if (!payload) return '';
    const base = `${location.origin}${import.meta.env.BASE_URL}`;
    return `${base}?cfg=${payload}`;
  }, [payload]);

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: 264,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }, [url]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const shareUrl = async () => {
    haptic('tap');
    if (isTelegram()) {
      diagCount('share.telegram');
      openTelegramShare(url);
      return;
    }
    if (navigator.share) {
      diagCount('share.system');
      try {
        await navigator.share({ url });
      } catch {
        /* user cancelled the share sheet */
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setToast(t(lang, 'copied'));
  };

  const saveQr = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    haptic('tap');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'resttimer-qr.png';
    a.click();
    setToast(t(lang, 'qrSaved'));
  };

  const tgClass = payload.length <= STARTAPP_BUDGET ? 'text-go' : 'text-warn';
  const qrClass = payload.length <= QR_BUDGET ? 'text-go' : 'text-warn';

  return (
    <main className="relative flex h-full flex-col bg-bg" {...swipeBack}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button type="button" className="text-2xl leading-none text-fg-muted" onClick={() => setScreen({ name: 'registry' })}>
          ‹
        </button>
        <h1 className="text-lg font-semibold">{t(lang, 'shareTitle')}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-2 text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'sharePick')}</p>
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left active:opacity-70 ${
                  selected[g.id] ? 'bg-card' : 'bg-card/40 opacity-55'
                }`}
                onClick={() => {
                  haptic('select');
                  setSelected((s) => ({ ...s, [g.id]: !s[g.id] }));
                }}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    selected[g.id] ? 'border-go bg-go text-black' : 'border-fg-faint'
                  }`}
                >
                  {selected[g.id] && '✓'}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name ?? `#${g.startSec}s`}</span>
                <span className="font-mono-timer text-xs tabular-nums text-fg-muted">{fmtMs(plannedMs(g))}</span>
              </button>
            </li>
          ))}
        </ul>

        {url && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <canvas ref={canvasRef} className="rounded-xl bg-white p-1" />
            <div className="w-full max-w-72 space-y-1 text-center text-xs">
              <p className={`font-mono-timer tabular-nums ${tgClass}`}>{t(lang, 'shareSizeTg', { n: payload.length })}</p>
              <p className={`font-mono-timer tabular-nums ${qrClass}`}>{t(lang, 'shareSizeQr', { n: payload.length })}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2.5 px-4 pb-6">
        <button
          type="button"
          disabled={!url}
          className="w-full rounded-2xl bg-go py-4 font-semibold text-black active:opacity-80 disabled:opacity-40"
          onClick={shareUrl}
        >
          {isTelegram() ? t(lang, 'shareTg') : t(lang, 'shareSystem')}
        </button>
        {!isTelegram() && (
          <button
            type="button"
            disabled={!url || payload.length > QR_BUDGET}
            className="w-full rounded-2xl bg-card py-3.5 text-sm font-medium text-fg active:opacity-70 disabled:opacity-40"
            onClick={saveQr}
          >
            {t(lang, 'shareQr')}
          </button>
        )}
      </div>

      {toast && (
        <div className="absolute inset-x-0 bottom-40 z-30 mx-auto w-fit rounded-full bg-bg-elev px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function maxExportableCount(groups: GroupConfig[]): number {
  for (let i = groups.length; i >= 0; i -= 1) {
    if (i === 0) return 0;
    if (encodeGroups(groups.slice(0, i)).length <= QR_BUDGET) return i;
  }
  return 0;
}
