export const LIMITS = {
  startSecMin: 15,
  startSecMax: 1800,
  startStep: 5,
  countMin: 1,
  countMax: 30,
  incSecMin: 0,
  incSecMax: 60,
  incStep: 5,
  nameMax: 40,
  customPresetsMax: 6,
} as const;

export type GroupConfig = {
  id: string;
  name?: string;
  startSec: number;
  count: number;
  incSec: number;
};

export type Registry = { v: 1; groups: GroupConfig[] };

export type TimerStatus = 'waiting' | 'running' | 'paused' | 'done';

export type TimerSnapshot = {
  status: TimerStatus;
  remainMs: number;
  durMs: number;
};

export type RunStatus = 'active' | 'done';

export type RunSnapshot = {
  runId: string;
  configId: string;
  label: string;
  timers: TimerSnapshot[];
  current: number;
  plannedMs: number;
  actualMs: number;
  runStatus: RunStatus;
  unseenFinish: boolean;
};

export type VoiceKey =
  | 'start'
  | 'n15'
  | 'n10'
  | 'n5'
  | 'n4'
  | 'n3'
  | 'n2'
  | 'n1'
  | 'end'
  | 'groupDone'
  | 'cfgLoaded'
  | 'hello';

export type Lang = 'ru' | 'en';

export type ThemeMode = 'auto' | 'dark' | 'light';
export type LangMode = 'auto' | Lang;

export const DEFAULT_PRESETS_SEC = [30, 45, 60, 90, 120, 180] as const;

export type CustomPreset = { id: string; startSec: number };

export type Settings = {
  themeMode: ThemeMode;
  langMode: LangMode;
  voiceOn: boolean;
  beepsOn: boolean;
};
