import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { CountIncPreset, CustomPreset, GroupConfig, Lang, Registry, RegistrySort, RunSnapshot, Settings, TagGroup } from '../core/types';
import { LIMITS } from '../core/types';

export type Screen =
  | { name: 'registry' }
  | { name: 'master'; configId?: string }
  | { name: 'run' }
  | { name: 'summary'; runId: string }
  | { name: 'share' }
  | { name: 'importPreview'; groups: GroupConfig[]; tagGroups: TagGroup[] }
  | { name: 'settings' };

type LastMaster = { count: number; incSec: number };

type AppState = {
  registry: Registry;
  customPresets: CustomPreset[];
  countIncPresets: CountIncPreset[];
  tagGroups: TagGroup[];
  sortMode: RegistrySort;
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
  applyImport: (groups: GroupConfig[], mode: 'merge' | 'replace', tagGroups?: TagGroup[]) => void;
  setSortMode: (mode: RegistrySort) => void;
  touchGroup: (id: string) => void;
  saveTagGroup: (name: string, tags: string[]) => void;
  renameTagGroup: (id: string, name: string) => void;
  updateTagGroup: (id: string, patch: { name?: string; tags?: string[] }) => void;
  deleteTagGroup: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  saveCustomPreset: (startSec: number) => void;
  removeCustomPreset: (id: string) => void;
  saveCountIncPreset: (count: number, incSec: number) => void;
  removeCountIncPreset: (id: string) => void;
  renameTag: (from: string, to: string) => void;
  deleteTag: (tag: string) => void;
  mirrorRuns: (runs: RunSnapshot[], focusedRunId: string | null) => void;
};

const emptyRegistry: Registry = { v: 1, groups: [] };

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      registry: emptyRegistry,
      customPresets: [],
      countIncPresets: [],
      tagGroups: [],
      sortMode: 'date-desc',
      lastMaster: { count: 5, incSec: 0 },
      settings: { themeMode: 'auto', langMode: 'auto', voiceOn: true, beepsOn: false, mediaKeepAlive: true, voiceInSilentMode: true },
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
      applyImport: (incoming, mode, tagGroups) => {
        if (mode === 'replace') {
          set({ registry: { v: 1, groups: incoming }, tagGroups: tagGroups ?? [] });
          return;
        }
        const groups = [...get().registry.groups, ...incoming];
        const existingKeys = new Set(get().tagGroups.map((gr) => gr.name + '|' + [...gr.tags].sort().join(',')));
        const mergedGroups = [...get().tagGroups];
        for (const group of tagGroups ?? []) {
          const key = group.name + '|' + [...group.tags].sort().join(',');
          if (existingKeys.has(key)) continue;
          existingKeys.add(key);
          mergedGroups.push(group);
        }
        set({ registry: { v: 1, groups }, tagGroups: mergedGroups });
      },
      setSortMode: (mode) => set({ sortMode: mode }),
      touchGroup: (id) => {
        set({ registry: { v: 1, groups: get().registry.groups.map((g) => (g.id === id ? { ...g, lastUsedAt: Date.now() } : g)) } });
      },
      saveTagGroup: (rawName, tags) => {
        const name = rawName.trim().slice(0, LIMITS.nameMax);
        if (!name || tags.length === 0) return;
        const key = name + '|' + [...tags].sort().join(',');
        const rest = get().tagGroups.filter((gr) => gr.name + '|' + [...gr.tags].sort().join(',') !== key);
        set({ tagGroups: [...rest, { id: nanoid(8), name, tags: [...tags] }].slice(-20) });
      },
      updateTagGroup: (id, patch) => {
        set({ tagGroups: get().tagGroups.map((gr) => (gr.id === id ? { ...gr, ...patch } : gr)) });
      },
      renameTagGroup: (id, rawName) => {
        const name = rawName.trim().slice(0, LIMITS.nameMax);
        if (!name) return;
        set({ tagGroups: get().tagGroups.map((gr) => (gr.id === id ? { ...gr, name } : gr)) });
      },
      deleteTagGroup: (id) => {
        set({ tagGroups: get().tagGroups.filter((gr) => gr.id !== id) });
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
      renameTag: (from, rawTo) => {
        const to = rawTo.trim().slice(0, LIMITS.tagMax);
        if (!to || to === from) return;
        const groups = get().registry.groups.map((group) => {
          if (!group.tags?.includes(from)) return group;
          const tags = [...new Set(group.tags.map((tag) => (tag === from ? to : tag)))];
          return { ...group, tags };
        });
        set({ registry: { v: 1, groups } });
      },
      deleteTag: (tag) => {
        const groups = get().registry.groups.map((group) => {
          if (!group.tags?.includes(tag)) return group;
          const tags = group.tags.filter((item) => item !== tag);
          return { ...group, tags: tags.length > 0 ? tags : undefined };
        });
        set({ registry: { v: 1, groups } });
      },
      mirrorRuns: (runs, focusedRunId) => set({ runs, focusedRunId }),
    }),
    {
      name: 'resttimer',
      partialize: (s) => ({
        registry: s.registry,
        customPresets: s.customPresets,
        countIncPresets: s.countIncPresets,
        tagGroups: s.tagGroups,
        sortMode: s.sortMode,
        settings: s.settings,
        lastMaster: s.lastMaster,
      }),
    },
  ),
);
