import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { CountIncPreset, CustomPreset, GroupConfig, Lang, Registry, RunSnapshot, Settings } from '../core/types';
import { LIMITS } from '../core/types';

export type Screen =
  | { name: 'registry' }
  | { name: 'master'; configId?: string }
  | { name: 'run' }
  | { name: 'summary'; runId: string }
  | { name: 'share' }
  | { name: 'importPreview'; groups: GroupConfig[] }
  | { name: 'settings' };

type LastMaster = { count: number; incSec: number };

type AppState = {
  registry: Registry;
  customPresets: CustomPreset[];
  countIncPresets: CountIncPreset[];
  lastMaster: LastMaster;
  settings: Settings;
  screen: Screen;
  lang: Lang;
  runs: RunSnapshot[];
  focusedRunId: string | null;
  setScreen: (screen: Screen) => void;
  setLang: (lang: Lang) => void;
  saveGroup: (group: GroupConfig) => void;
  removeGroup: (id: string) => void;
  moveGroup: (from: number, to: number) => void;
  applyImport: (groups: GroupConfig[], mode: 'merge' | 'replace') => void;
  updateSettings: (patch: Partial<Settings>) => void;
  saveCustomPreset: (startSec: number) => void;
  removeCustomPreset: (id: string) => void;
  saveCountIncPreset: (count: number, incSec: number) => void;
  removeCountIncPreset: (id: string) => void;
  mirrorRuns: (runs: RunSnapshot[], focusedRunId: string | null) => void;
};

const emptyRegistry: Registry = { v: 1, groups: [] };

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      registry: emptyRegistry,
      customPresets: [],
      countIncPresets: [],
      lastMaster: { count: 5, incSec: 0 },
      settings: { themeMode: 'auto', langMode: 'auto', voiceOn: true, beepsOn: true, mediaKeepAlive: true },
      screen: { name: 'registry' },
      lang: 'en',
      runs: [],
      focusedRunId: null,
      setScreen: (screen) => set({ screen }),
      setLang: (lang) => set({ lang }),
      saveGroup: (group) => {
        const groups = [...get().registry.groups];
        const idx = groups.findIndex((g) => g.id === group.id);
        if (idx >= 0) groups[idx] = group;
        else groups.push(group);
        set({ registry: { v: 1, groups } });
      },
      removeGroup: (id) => {
        set({ registry: { v: 1, groups: get().registry.groups.filter((g) => g.id !== id) } });
      },
      moveGroup: (from, to) => {
        const groups = [...get().registry.groups];
        if (from < 0 || from >= groups.length || to < 0 || to >= groups.length) return;
        const [moved] = groups.splice(from, 1);
        groups.splice(to, 0, moved);
        set({ registry: { v: 1, groups } });
      },
      applyImport: (incoming, mode) => {
        if (mode === 'replace') {
          set({ registry: { v: 1, groups: incoming } });
          return;
        }
        const groups = [...get().registry.groups, ...incoming];
        set({ registry: { v: 1, groups } });
      },
      updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      saveCustomPreset: (startSec) => {
        const presets = get().customPresets.filter((p) => p.startSec !== startSec);
        presets.unshift({ id: nanoid(6), startSec });
        set({ customPresets: presets.slice(0, LIMITS.customPresetsMax) });
      },
      removeCustomPreset: (id) => {
        set({ customPresets: get().customPresets.filter((p) => p.id !== id) });
      },
      saveCountIncPreset: (count, incSec) => {
        const presets = get().countIncPresets.filter((p) => p.count !== count || p.incSec !== incSec);
        presets.unshift({ id: nanoid(6), count, incSec });
        set({ countIncPresets: presets.slice(0, LIMITS.customPresetsMax) });
      },
      removeCountIncPreset: (id) => {
        set({ countIncPresets: get().countIncPresets.filter((p) => p.id !== id) });
      },
      mirrorRuns: (runs, focusedRunId) => set({ runs, focusedRunId }),
    }),
    {
      name: 'resttimer',
      partialize: (s) => ({
        registry: s.registry,
        customPresets: s.customPresets,
        countIncPresets: s.countIncPresets,
        settings: s.settings,
        lastMaster: s.lastMaster,
      }),
    },
  ),
);
