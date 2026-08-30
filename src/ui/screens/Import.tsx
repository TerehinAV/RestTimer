import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { decodeCfg } from '../../core/codec';
import { fmtMs, plannedMs } from '../../core/time';
import type { GroupConfig } from '../../core/types';
import { getAudio } from '../../boot';
import { diag, diagCount } from '../../diagnostics/diagnostics';
import { t } from '../../i18n';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import { CameraIcon, ImageIcon } from '../components/Icons';
import { useSwipeBack } from '../useSwipeBack';

type ScanMode = 'camera' | 'gallery' | null;

const NO_GROUPS: GroupConfig[] = [];

function extractCfg(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      return u.searchParams.get('cfg') ?? u.searchParams.get('tgWebAppStartParam') ?? u.searchParams.get('startapp');
    } catch {
      return null;
    }
  }
  return text;
}

export function ImportScreen() {
  const screen = useApp((s) => s.screen);
  const incoming = screen.name === 'importPreview' ? screen.groups : NO_GROUPS;
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const applyImport = useApp((s) => s.applyImport);

  const [mode, setMode] = useState<ScanMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(incoming.map((_, i) => [i, true])),
  );
  const [confirmReplace, setConfirmReplace] = useState(false);
  const swipeBack = useSwipeBack(() => {
    if (mode === 'camera') {
      stopCamera();
      setMode(null);
      return;
    }
    setScreen({ name: 'registry' });
  });

  const cameraRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  useEffect(() => stopCamera, []);

  const acceptPayload = (raw: string) => {
    const cfg = extractCfg(raw);
    const groups = cfg ? decodeCfg(cfg) : null;
    stopCamera();
    if (!groups) {
      setError(t(lang, 'scanInvalid'));
      haptic('warn');
      return;
    }
    setMode(null);
    setError(null);
    useApp.getState().setScreen({ name: 'importPreview', groups });
    haptic('notify');
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
  };

  const startCamera = async () => {
    setError(null);
    setMode('camera');
    try {
      diagCount('scan.camera.start');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = cameraRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      scanLoop(video);
    } catch (err) {
      diag('scan.camera.fail', String(err).slice(0, 160));
      setMode(null);
      setError(t(lang, 'scanDenied'));
    }
  };

  const scanLoop = (video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const tick = () => {
      if (!streamRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          diag('scan.camera.found', `len=${found.data.length}`);
          acceptPayload(found.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const onFile = async (file: File) => {
    diagCount('scan.gallery');
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      setError(t(lang, 'scanInvalid'));
      return;
    }
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(img.data, img.width, img.height);
    if (found?.data) acceptPayload(found.data);
    else {
      setError(t(lang, 'scanInvalid'));
      haptic('warn');
    }
  };

  const finish = (target: 'merge' | 'replace') => {
    const picked = incoming.filter((_, i) => selected[i]);
    if (picked.length === 0) return;
    applyImport(picked, target);
    getAudio().voice('cfgLoaded');
    haptic('notify');
    setScreen({ name: 'registry' });
  };

  return (
    <main className="relative flex h-full flex-col bg-bg" {...swipeBack}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button
          type="button"
          className="text-2xl leading-none text-fg-muted"
          onClick={() => {
            stopCamera();
            setScreen({ name: 'registry' });
          }}
        >
          ‹
        </button>
        <h1 className="text-lg font-semibold">{t(lang, 'importTitle')}</h1>
      </header>

      {incoming.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8">
          <button
            type="button"
            className="flex w-full max-w-64 items-center gap-3 rounded-2xl bg-card px-5 py-4 active:opacity-70"
            onClick={startCamera}
          >
            <CameraIcon className="h-6 w-6 text-accent" />
            <span className="font-medium">{t(lang, 'scanCamera')}</span>
          </button>
          <button
            type="button"
            className="flex w-full max-w-64 items-center gap-3 rounded-2xl bg-card px-5 py-4 active:opacity-70"
            onClick={() => {
              setMode('gallery');
              fileRef.current?.click();
            }}
          >
            <ImageIcon className="h-6 w-6 text-accent" />
            <span className="font-medium">{t(lang, 'scanGallery')}</span>
          </button>
          {error && <p className="max-w-64 text-center text-sm text-warn">{error}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
              e.target.value = '';
              setMode(null);
            }}
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <p className="mb-2 text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'importPick')}</p>
            <ul className="flex flex-col gap-2">
              {incoming.map((g, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left active:opacity-70 ${
                      selected[i] ? 'bg-card' : 'bg-card/40 opacity-55'
                    }`}
                    onClick={() => {
                      haptic('select');
                      setSelected((s) => ({ ...s, [i]: !s[i] }));
                    }}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        selected[i] ? 'border-go bg-go text-black' : 'border-fg-faint'
                      }`}
                    >
                      {selected[i] && '✓'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.name ?? `#${g.startSec}s`}</span>
                    <span className="font-mono-timer text-xs tabular-nums text-fg-muted">
                      {g.startSec}×{g.count}
                      {g.incSec > 0 ? `+${g.incSec}` : ''} · {fmtMs(plannedMs(g))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2.5 px-4 pb-safe">
            <button
              type="button"
              disabled={!Object.values(selected).some(Boolean)}
              className="w-full rounded-2xl bg-go py-4 font-semibold text-black active:opacity-80 disabled:opacity-40"
              onClick={() => finish('merge')}
            >
              {t(lang, 'importAdd')}
            </button>
            <button
              type="button"
              disabled={!Object.values(selected).some(Boolean)}
              className="w-full rounded-2xl bg-card py-3.5 text-sm font-medium text-warn active:opacity-70 disabled:opacity-40"
              onClick={() => setConfirmReplace(true)}
            >
              {t(lang, 'importReplace')}
            </button>
          </div>
        </>
      )}

      {mode === 'camera' && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black">
          <video ref={cameraRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 aspect-square -translate-y-1/2 rounded-3xl border-2 border-white/70" />
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white"
            onClick={() => {
              stopCamera();
              setMode(null);
            }}
          >
            ✕
          </button>
        </div>
      )}

      {confirmReplace && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-8">
          <div className="w-full max-w-72 rounded-2xl bg-bg-elev p-5 text-center">
            <p className="text-sm">{t(lang, 'importReplaceConfirm')}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-card py-2.5 text-sm"
                onClick={() => setConfirmReplace(false)}
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-warn py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  setConfirmReplace(false);
                  finish('replace');
                }}
              >
                {t(lang, 'importYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
