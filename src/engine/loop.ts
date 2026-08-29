import type { TimerEngine } from './TimerEngine';

export function attachLoop(engine: TimerEngine, intervalMs = 250): () => void {
  let ticker: ReturnType<typeof setInterval> | null = null;
  const sync = () => {
    if (engine.size > 0 && ticker === null) {
      ticker = setInterval(() => engine.tick(), intervalMs);
    } else if (engine.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
  const watchdog = setInterval(sync, 1000);
  const onVisibility = () => engine.handleVisibility(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVisibility);
  sync();
  return () => {
    if (ticker) clearInterval(ticker);
    clearInterval(watchdog);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
