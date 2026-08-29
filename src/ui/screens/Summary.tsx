import { fmtMs } from '../../core/time';
import { getEngine, startRun } from '../../boot';
import { t } from '../../i18n';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import { useSwipeBack } from '../useSwipeBack';

export function SummaryScreen() {
  const runId = useApp((s) => (s.screen.name === 'summary' ? s.screen.runId : ''));
  const run = useApp((s) => s.runs.find((r) => r.runId === runId));
  const config = useApp((s) => (run ? s.registry.groups.find((g) => g.id === run.configId) : undefined));
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const swipeBack = useSwipeBack(() => {
    getEngine().dismiss(runId);
    setScreen({ name: 'registry' });
  });

  if (!run) {
    return (
      <main className="flex h-full items-center justify-center bg-bg">
        <button type="button" className="text-fg-muted" onClick={() => setScreen({ name: 'registry' })}>
          {t(lang, 'backToList')}
        </button>
      </main>
    );
  }

  const repeat = () => {
    if (!config) return;
    getEngine().dismiss(run.runId);
    startRun(config);
  };

  return (
    <main className="flex h-full flex-col bg-bg px-6 pb-8 pt-6" {...swipeBack}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-go">✓ {t(lang, 'summaryTitle')}</p>
        {run.label && <h1 className="text-xl font-semibold">{run.label}</h1>}
        <p className="text-sm text-fg-muted">{t(lang, 'summaryGreat')}</p>

        <div className="mt-8 grid w-full max-w-72 grid-cols-3 gap-2 text-center">
          <Stat label={t(lang, 'summaryActual')} value={fmtMs(run.actualMs)} accent />
          <Stat label={t(lang, 'summaryPlanned')} value={fmtMs(run.plannedMs)} />
          <Stat label={t(lang, 'summaryTimers')} value={String(run.timers.filter((x) => x.status === 'done').length)} />
        </div>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          className="w-full rounded-2xl bg-go py-4 font-semibold text-black active:opacity-80"
          onClick={() => {
            haptic('notify');
            repeat();
          }}
        >
          {t(lang, 'repeat')}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            className="flex-1 rounded-2xl bg-card py-3.5 text-sm font-medium text-fg active:opacity-70"
            onClick={() => (config ? setScreen({ name: 'master', configId: config.id }) : setScreen({ name: 'registry' }))}
          >
            {t(lang, 'editGroup')}
          </button>
          <button
            type="button"
            className="flex-1 rounded-2xl bg-card py-3.5 text-sm font-medium text-fg-muted active:opacity-70"
            onClick={() => {
              getEngine().dismiss(run.runId);
              setScreen({ name: 'registry' });
            }}
          >
            {t(lang, 'close')}
          </button>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? 'bg-go-soft' : 'bg-card'}`}>
      <p className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</p>
      <p className={`mt-1 font-mono-timer text-lg tabular-nums ${accent ? 'text-go' : ''}`}>{value}</p>
    </div>
  );
}
