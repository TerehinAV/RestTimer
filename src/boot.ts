import { AudioService } from './audio/AudioService';
import { decodeCfg } from './core/codec';
import type { GroupConfig } from './core/types';
import { TimerEngine } from './engine/TimerEngine';
import type { EngineEvent } from './engine/TimerEngine';
import { attachLoop } from './engine/loop';
import { resolveLang } from './i18n';
import { diag, diagCount } from './diagnostics/diagnostics';
import { useApp } from './store/app';
import { haptic, tgLocale, tgReady, tgStartParam, watchContentSafeArea } from './tg/tg';
import { initTheme, navLangs } from './theme/apply';

let engine: TimerEngine | null = null;
let audio: AudioService | null = null;

export type RunAction = 'tap' | 'pause' | 'resume' | 'skip' | 'restart' | 'previous' | 'finish';

export function getEngine(): TimerEngine {
  if (!engine) throw new Error('boot() not called');
  return engine;
}

export function getAudio(): AudioService {
  if (!audio) throw new Error('boot() not called');
  return audio;
}

export function startRun(config: GroupConfig): void {
  diagCount('run.start');
  getEngine().start(config);
  useApp.getState().setScreen({ name: 'run' });
  haptic('notify');
}

export function runAction(action: RunAction, runId?: string): void {
  getEngine()[action](runId);
  haptic('tap');
}

export function focusRun(runId: string): void {
  getEngine().focus(runId);
  haptic('select');
}

function handleEngineEvent(e: EngineEvent): void {
  const app = useApp.getState();
  const svc = audio!;
  switch (e.type) {
    case 'snapshot': {
      app.mirrorRuns(e.runs, getEngine().focusedRunId);
      syncKeepAlive();
      const focused = e.runs.find((r) => r.runId === getEngine().focusedRunId);
      const status = focused?.timers[focused.current]?.status;
      audio!.syncMediaState(status === 'running' ? 'playing' : status === 'paused' ? 'paused' : 'none');
      break;
    }
    case 'timerStarted':
      if (e.focused) svc.voice('start');
      break;
    case 'cue':
      if (e.focused) svc.voice(e.key);
      else svc.beep('tick');
      break;
    case 'timerEnded':
      if (e.focused) {
        svc.voice('end');
        svc.beep('end');
      } else {
        svc.beep('chime');
      }
      break;
    case 'groupFinished':
      if (e.focused) svc.voice('groupDone');
      else svc.beep('chime');
      if (e.focused) useApp.getState().setScreen({ name: 'summary', runId: e.runId });
      break;
  }
}

const HEADSET_CONTROL_ENABLED = false;

function syncKeepAlive(): void {
  const active = HEADSET_CONTROL_ENABLED && useApp.getState().settings.mediaKeepAlive && getEngine().hasStartedRuns();
  audio!.setKeepAlive(active);
}

export function boot(): void {
  if (engine) return;
  diag('boot', { href: location.href });
  window.addEventListener('error', (e) => diag('error', { msg: e.message, src: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => diag('unhandledrejection', String(e.reason).slice(0, 300)));
  document.addEventListener('visibilitychange', () => diagCount(`visibility.${document.visibilityState}`));
  tgReady();
  watchContentSafeArea();

  audio = new AudioService({
    lang: () => useApp.getState().lang,
    voiceOn: () => useApp.getState().settings.voiceOn,
    beepsOn: () => useApp.getState().settings.beepsOn,
    onMediaAction: (a) => {
      const eng = getEngine();
      if (a === 'play') eng.tap();
      else if (a === 'pause') eng.pause();
      else if (a === 'next') eng.skip();
      else eng.restart();
    },
  });

  engine = new TimerEngine({ onEvent: handleEngineEvent });
  attachLoop(engine);

  const app = useApp.getState();
  initTheme(() => useApp.getState().settings.themeMode);
  useApp.getState().setLang(resolveLang(app.settings.langMode, tgLocale(), navLangs()));

  document.addEventListener(
    'pointerdown',
    () => {
      audio!.unlock();
      syncKeepAlive();
    },
    { once: true, capture: true },
  );

  useApp.subscribe((state, prev) => {
    if (state.settings.mediaKeepAlive !== prev.settings.mediaKeepAlive) {
      diag('settings.mediaKeepAlive', state.settings.mediaKeepAlive);
      syncKeepAlive();
    }
    if (state.screen.name !== prev.screen.name) diagCount(`screen.${state.screen.name}`);
    if (state.registry.groups.length !== prev.registry.groups.length) {
      diag('registry.size', state.registry.groups.length);
    }
  });

  const raw = new URLSearchParams(window.location.search).get('cfg') ?? tgStartParam();
  if (raw) {
    const groups = decodeCfg(raw);
    if (groups) {
      useApp.getState().setScreen({ name: 'importPreview', groups });
    }
  }
}
