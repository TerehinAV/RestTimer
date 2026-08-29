import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { fmtMs } from '../../core/time';
import { focusRun, runAction } from '../../boot';
import { t } from '../../i18n';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import { PrevIcon, RestartIcon, SkipIcon } from '../components/Icons';

export function RunScreen() {
  const runs = useApp((s) => s.runs);
  const focusedRunId = useApp((s) => s.focusedRunId);
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const touchStart = useRef<number | null>(null);
  const [confirmAbort, setConfirmAbort] = useState(false);

  const run = runs.find((r) => r.runId === focusedRunId) ?? runs[0];

  useEffect(() => {
    if (runs.length === 0) setScreen({ name: 'registry' });
  }, [runs.length, setScreen]);

  if (!run) return <main className="flex h-full items-center justify-center bg-bg" />;

  const timer = run.timers[run.current];
  const status = timer?.status ?? 'done';
  const doneList = run.timers.slice(0, run.current);
  const queue = run.timers.slice(run.current + 1);

  const digitsColor = status === 'paused' ? 'text-accent' : status === 'waiting' ? 'text-fg-muted' : 'text-fg';

  const switchRun = (dir: 1 | -1) => {
    const idx = runs.findIndex((r) => r.runId === run.runId);
    const next = runs[idx + dir];
    if (next) {
      focusRun(next.runId);
    } else if (dir === -1) {
      haptic('tap');
      setScreen({ name: 'registry' });
    }
  };

  return (
    <main
      className="relative flex h-full flex-col bg-bg"
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(dx) > 64 && e.changedTouches[0].clientY > 140) switchRun(dx < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <header className="flex items-center gap-2 px-3 pt-4">
        <button type="button" className="px-2 py-1 text-2xl leading-none text-fg-muted" onClick={() => setScreen({ name: 'registry' })}>
          ‹
        </button>
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {runs.map((r) => {
            const st = r.timers[r.current]?.status;
            const isFocused = r.runId === run.runId;
            return (
              <button
                key={r.runId}
                type="button"
                onClick={() => focusRun(r.runId)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  isFocused ? 'bg-card text-fg' : 'bg-card/40 text-fg-muted'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    r.runStatus === 'done' ? 'bg-fg-faint' : st === 'running' ? 'bg-go' : st === 'paused' ? 'bg-accent' : 'bg-fg-faint'
                  }`}
                />
                <span className="max-w-28 truncate">{r.label || `#${r.timers[0].durMs / 1000}s`}</span>
                {r.unseenFinish && <span className="h-2 w-2 rounded-full bg-warn" />}
              </button>
            );
          })}
        </div>
        {run.runStatus === 'active' && (
          <button
            type="button"
            className="shrink-0 px-2 py-1 text-sm text-fg-muted active:opacity-60"
            onClick={() => setConfirmAbort(true)}
          >
            {t(lang, 'abortSeries')}
          </button>
        )}
      </header>

      <section
        className="flex min-h-0 flex-1 cursor-pointer select-none flex-col items-center justify-center"
        onClick={() => runAction('tap')}
      >
        {doneList.length > 0 && (
          <div className="mb-6 flex max-h-16 w-full items-center justify-center gap-2 overflow-x-auto px-8 opacity-40">
            {doneList.map((d, i) => (
              <span key={i} className="shrink-0 font-mono-timer text-xs tabular-nums text-fg-muted line-through">
                {fmtMs(d.durMs)}
              </span>
            ))}
          </div>
        )}

        <p className={status === 'running' ? 'mb-3 text-xs uppercase tracking-[0.3em] text-go' : 'mb-3 h-4 text-xs uppercase tracking-[0.3em] text-fg-faint'}>
          {status === 'running' && `● ${t(lang, 'resting')}`}
        </p>

        <p className={`px-4 text-center font-mono-timer text-[21vw] leading-none tracking-tighter tabular-nums transition-colors sm:text-[128px] ${digitsColor}`}>
          {fmtMs(timer?.remainMs ?? 0)}
        </p>

        <div className="mt-4 h-6">
          {status === 'waiting' && (
            <p className="animate-pulse text-sm text-fg-muted">{t(lang, 'tapToStart')}</p>
          )}
          {status === 'paused' && <p className="text-sm text-accent">{t(lang, 'paused')}</p>}
        </div>

        <div className="mt-6 flex items-center gap-8 opacity-45">
          <button
            type="button"
            aria-label={t(lang, 'restart')}
            disabled={status === 'waiting' || status === 'done'}
            onClick={(e) => {
              e.stopPropagation();
              runAction('restart');
            }}
            className="disabled:opacity-30"
          >
            <RestartIcon className="h-7 w-7" />
          </button>
          <button
            type="button"
            aria-label={t(lang, 'prevTimer')}
            disabled={run.runStatus === 'done' || run.current === 0}
            onClick={(e) => {
              e.stopPropagation();
              runAction('previous');
            }}
            className="disabled:opacity-30"
          >
            <PrevIcon className="h-7 w-7" />
          </button>
          <button
            type="button"
            aria-label={t(lang, 'skip')}
            disabled={status === 'done'}
            onClick={(e) => {
              e.stopPropagation();
              runAction('skip');
            }}
            className="disabled:opacity-30"
          >
            <SkipIcon className="h-7 w-7" />
          </button>
        </div>
      </section>

      <footer className="px-6 pb-8">
        <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
          <span className="font-mono-timer tabular-nums">
            {run.current + 1}/{run.timers.length}
          </span>
          <span className="font-mono-timer tabular-nums">
            ⏱ {fmtMs(run.actualMs)} / {fmtMs(run.plannedMs)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3">
          <AnimatePresence mode="popLayout">
            {queue.slice(0, 3).map((q, i) => (
              <motion.span
                key={run.current + 1 + i}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1 - i * 0.28, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="rounded-lg bg-card/60 px-3 py-1.5 font-mono-timer text-sm tabular-nums text-fg-muted"
              >
                {fmtMs(q.durMs)}
              </motion.span>
            ))}
          </AnimatePresence>
          {queue.length > 3 && (
            <span className="text-xs text-fg-faint">{t(lang, 'more', { n: queue.length - 3 })}</span>
          )}
        </div>
      </footer>

      {confirmAbort && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 px-8" onClick={() => setConfirmAbort(false)}>
          <div className="w-full max-w-72 rounded-2xl bg-bg-elev p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm">{t(lang, 'abortConfirm')}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="flex-1 rounded-xl bg-card py-2.5 text-sm" onClick={() => setConfirmAbort(false)}>
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-warn py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  setConfirmAbort(false);
                  runAction('finish');
                }}
              >
                {t(lang, 'abortSeries')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
