import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'motion/react';
import { fmtMs, plannedMs } from '../../core/time';
import type { GroupConfig, RegistrySort } from '../../core/types';
import { t } from '../../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { startRun, focusRun, getEngine } from '../../boot';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GearIcon,
  PauseIcon,
  PencilIcon,
  PlusIcon,
  QrIcon,
  SearchIcon,
  ShareIcon,
  SortIcon,
  SpeakerIcon,
  TrashIcon,
  XIcon,
} from '../components/Icons';
import { APP_VERSION } from '../../diagnostics/diagnostics';
import { currentChangelog, changelogSeen, markChangelogSeen } from '../../diagnostics/changelog';

const TAG_ROW_PX = 36;

export function RegistryScreen() {
  const groups = useApp((s) => s.registry.groups);
  const runs = useApp((s) => s.runs);
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const moveGroup = useApp((s) => s.moveGroup);
  const touchGroup = useApp((s) => s.touchGroup);

  const [deleted, setDeleted] = useState<{ group: GroupConfig; index: number } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(10);
  const focusedRunId = useApp((s) => s.focusedRunId);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortMode = useApp((s) => s.sortMode);
  const setSortMode = useApp((s) => s.setSortMode);
  const tagGroups = useApp((s) => s.tagGroups);
  const saveTagGroup = useApp((s) => s.saveTagGroup);
  const updateTagGroup = useApp((s) => s.updateTagGroup);
  const deleteTagGroup = useApp((s) => s.deleteTagGroup);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagRowsMax, setTagRowsMax] = useState(1);
  const [tagCanExpand, setTagCanExpand] = useState(false);
  const [tagMultiLine, setTagMultiLine] = useState(false);
  const [tagSearchOpen, setTagSearchOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [groupQuery, setGroupQuery] = useState('');
  const [groupRowsMax, setGroupRowsMax] = useState(1);
  const [groupCanExpand, setGroupCanExpand] = useState(false);
  const [groupMultiLine, setGroupMultiLine] = useState(false);
  const [groupDraft, setGroupDraft] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupTags, setEditingGroupTags] = useState<string[]>([]);
  const [groupRenameDraft, setGroupRenameDraft] = useState('');
  const [listOverflows, setListOverflows] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [seenChangelog, setSeenChangelog] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const tagBlockRef = useRef<HTMLDivElement>(null);
  const groupBlockRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSeenChangelog(changelogSeen()), []);

  const allTags = useMemo(() => [...new Set(groups.flatMap((g) => g.tags ?? []))], [groups]);

  const visibleTagList = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    const base = q ? allTags.filter((tag) => tag.toLowerCase().includes(q)) : allTags;
    return [...base].sort((a, b) => {
      const sa = selectedTags.includes(a) ? 0 : 1;
      const sb = selectedTags.includes(b) ? 0 : 1;
      return sa - sb;
    });
  }, [allTags, tagQuery, selectedTags]);

  const visibleGroups = useMemo(() => {
    let list = groups;
    if (selectedTags.length > 0) {
      list = list.filter((g) => selectedTags.every((tag) => g.tags?.includes(tag)));
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((g) => (g.name ?? `#${g.startSec}s`).toLowerCase().includes(query));
    }
    const sorted = [...list];
    if (sortMode === 'date-desc') sorted.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    else if (sortMode === 'date-asc') sorted.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    else if (sortMode === 'title-asc') sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', lang));
    else if (sortMode === 'title-desc') sorted.sort((a, b) => (b.name ?? '').localeCompare(a.name ?? '', lang));
    else if (sortMode === 'usage') sorted.sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0));
    return sorted;
  }, [groups, selectedTags, searchQuery, sortMode, lang]);

  const selectionKey = useMemo(() => [...selectedTags].sort().join('|'), [selectedTags]);

  const blurClose = (setter: (v: boolean) => void, isEmpty: boolean) => {
    if (!isEmpty) return;
    setTimeout(() => setter(false), 120);
  };

  const toggleSeriesSearch = () => {
    haptic('tap');
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
      return;
    }
    setTagSearchOpen(false);
    setTagQuery('');
    setGroupSearchOpen(false);
    setGroupQuery('');
    setSearchOpen(true);
  };

  const toggleTagSearch = () => {
    haptic('tap');
    if (tagSearchOpen) {
      setTagSearchOpen(false);
      setTagQuery('');
      return;
    }
    setSearchOpen(false);
    setSearchQuery('');
    setGroupSearchOpen(false);
    setGroupQuery('');
    setTagSearchOpen(true);
  };

  const toggleGroupSearch = () => {
    haptic('tap');
    if (groupSearchOpen) {
      setGroupSearchOpen(false);
      setGroupQuery('');
      return;
    }
    setSearchOpen(false);
    setSearchQuery('');
    setTagSearchOpen(false);
    setTagQuery('');
    setGroupSearchOpen(true);
  };

  const visibleTagGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    const list = q ? tagGroups.filter((gr) => gr.name.toLowerCase().includes(q)) : tagGroups;
    return [...list].sort((a, b) => {
      const ka = [...a.tags].sort().join('|') === selectionKey ? 0 : 1;
      const kb = [...b.tags].sort().join('|') === selectionKey ? 0 : 1;
      return ka - kb;
    });
  }, [tagGroups, groupQuery, selectionKey]);

  useEffect(() => {
    const el = tagBlockRef.current;
    if (!el) return;
    const check = () => {
      setTagCanExpand(el.scrollHeight > tagRowsMax * TAG_ROW_PX + 4);
      setTagMultiLine(el.scrollHeight > TAG_ROW_PX + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleTagList.length, tagRowsMax]);

  useEffect(() => {
    const el = groupBlockRef.current;
    if (!el) return;
    const check = () => {
      setGroupCanExpand(el.scrollHeight > groupRowsMax * TAG_ROW_PX + 4);
      setGroupMultiLine(el.scrollHeight > TAG_ROW_PX + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleTagGroups.length, groupRowsMax, editingGroupId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => setListOverflows(el.scrollHeight > el.clientHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visibleGroups.length]);

  useEffect(() => {
    if (!deleted) return;
    setUndoCountdown(10);
    const iv = setInterval(() => setUndoCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, [deleted]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 260, tolerance: 8 } }));

  useEffect(() => {
    for (const r of useApp.getState().runs) {
      if (r.runStatus === 'done' || r.actualMs === 0) getEngine().dismiss(r.runId);
    }
  }, []);

  const onCardTap = (group: GroupConfig) => {
    touchGroup(group.id);
    const active = runs.find((r) => r.configId === group.id && r.runStatus === 'active' && r.actualMs > 0);
    if (active) {
      focusRun(active.runId);
      setScreen({ name: 'run' });
    } else {
      startRun(group);
    }
  };

  const removeAt = (index: number) => {
    const group = visibleGroups[index];
    for (const r of useApp.getState().runs) {
      if (r.configId === group.id) getEngine().dismiss(r.runId);
    }
    useApp.getState().removeGroup(group.id);
    haptic('warn');
    setDeleted({ group, index });
  };

  useEffect(() => {
    if (deleted) {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setDeleted(null), 10_000);
    }
  }, [deleted]);

  const undo = () => {
    if (!deleted) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const restored = groups.slice();
    restored.splice(Math.min(deleted.index, restored.length), 0, deleted.group);
    useApp.setState({ registry: { v: 1, groups: restored } });
    setDeleted(null);
    haptic('tap');
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = groups.findIndex((g) => g.id === active.id);
    const to = groups.findIndex((g) => g.id === over.id);
    if (from < 0 || to < 0) return;
    moveGroup(from, to);
    useApp.setState({ registry: { v: 1, groups: arrayMove(groups, from, to) } });
    haptic('tap');
  };

  const applyGroup = (tags: string[]) => {
    haptic('select');
    setSelectedTags((prev) => {
      const allSelected = tags.every((tag) => prev.includes(tag));
      if (allSelected) return prev.filter((tag) => !tags.includes(tag));
      return [...tags];
    });
  };

  const selectionMatchesGroup = useMemo(() => {
    const key = [...selectedTags].sort().join('|');
    return tagGroups.some((gr) => [...gr.tags].sort().join('|') === key);
  }, [selectedTags, tagGroups]);

  const saveEditingGroup = () => {
    if (editingGroupId) {
      const gr = tagGroups.find((x) => x.id === editingGroupId);
      if (gr) updateTagGroup(gr.id, { name: groupRenameDraft, tags: editingGroupTags });
      haptic('notify');
    }
    setEditingGroupId(null);
  };

  const toggleMembershipTag = (tag: string) => {
    setEditingGroupTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag];
      setSelectedTags([...next]);
      return next;
    });
  };

  const changelog = currentChangelog(lang);
  const changelogFeatures = changelog.filter((n) => n.kind !== 'fix');
  const changelogFixes = changelog.filter((n) => n.kind === 'fix');

  return (
    <main className="flex h-full flex-col bg-bg">
      <header className="flex items-center justify-between gap-2 px-4 pb-2 pt-5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-2xl font-black tracking-tighter">RT</h1>
          <button
            type="button"
            aria-label="what's new"
            className="relative flex shrink-0 flex-col items-center justify-center rounded-lg bg-accent-soft px-1.5 py-0.5 text-center leading-none active:opacity-70"
            onClick={() => {
              setWhatsNewOpen((v) => !v);
              if (!seenChangelog) {
                markChangelogSeen();
                setSeenChangelog(true);
              }
              haptic('tap');
            }}
          >
            <span className="text-[10px] font-semibold text-accent">{APP_VERSION}</span>
            <span className="mt-px text-[7px] font-bold uppercase tracking-widest text-accent/50">beta</span>
            {!seenChangelog && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-warn" />
            )}
          </button>
        </div>
        <div className="relative flex shrink-0 items-center gap-2.5 text-fg-muted">
          <button
            type="button"
            aria-label="sort"
            className={sortOpen ? 'text-accent' : ''}
            onClick={() => {
              haptic('tap');
              setSortOpen((v) => !v);
            }}
          >
            <SortIcon />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-9 z-40 w-48 rounded-xl bg-bg-elev p-1 shadow-lg">
              {(
                [
                  ['date-desc', t(lang, 'sortDateDesc')],
                  ['usage', t(lang, 'sortUsage')],
                  ['date-asc', t(lang, 'sortDateAsc')],
                  ['title-asc', t(lang, 'sortTitleAsc')],
                  ['title-desc', t(lang, 'sortTitleDesc')],
                  ['manual', t(lang, 'sortManual')],
                ] as [RegistrySort, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${
                    sortMode === mode ? 'bg-accent-soft font-semibold text-accent' : 'text-fg-muted'
                  }`}
                  onClick={() => {
                    setSortMode(mode);
                    setSortOpen(false);
                    haptic('select');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button type="button" aria-label="share" onClick={() => setScreen({ name: 'share' })}>
            <ShareIcon />
          </button>
          <button type="button" aria-label="import qr" onClick={() => setScreen({ name: 'importPreview', groups: [], tagGroups: [] })}>
            <QrIcon />
          </button>
          <button type="button" aria-label="settings" onClick={() => setScreen({ name: 'settings' })}>
            <GearIcon />
          </button>
        </div>
      </header>

      {whatsNewOpen && <div className="fixed inset-0 z-40" onClick={() => setWhatsNewOpen(false)} />}
      {whatsNewOpen && changelog.length > 0 && (
        <div className="relative z-50 mx-4 mb-2 max-h-56 overflow-y-auto rounded-xl bg-bg-elev p-3.5 text-xs leading-relaxed text-fg-muted shadow-lg">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-accent">
            {t(lang, 'whatsNewTitle')} · {APP_VERSION}
          </p>
          <ul className="space-y-2">
            {changelogFeatures.map((note) => (
              <li key={note.where + note.what}>
                <span className="font-semibold text-fg">{note.where}: </span>
                {note.what}
                <span className="block text-fg-faint">{note.try}</span>
              </li>
            ))}
          </ul>
          {changelogFixes.length > 0 && (
            <>
              <hr className="my-2.5 border-sep" />
              <ul className="space-y-1.5">
                {changelogFixes.map((note) => (
                  <li key={note.where + note.what}>
                    <span className="font-semibold text-fg">{note.where}: </span>
                    {note.what}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {allTags.length > 0 && (
        <div className={`relative px-4 pb-2 ${editingGroupId ? 'z-30' : ''}`}>
          <p className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-fg-faint">
            {t(lang, 'tagsLabel')}
            {tagMultiLine && (
              <button
                type="button"
                aria-label="search tags"
                className={`normal-case ${tagSearchOpen ? 'text-accent' : 'text-fg-muted'}`}
                onClick={toggleTagSearch}
              >
                {tagSearchOpen ? <XIcon className="h-3.5 w-3.5" /> : <SearchIcon className="h-3.5 w-3.5" />}
              </button>
            )}
          </p>
          <div
            ref={tagBlockRef}
            className="flex w-full min-w-0 flex-wrap gap-2 overflow-hidden transition-[max-height]"
            style={{ maxHeight: `${tagRowsMax * TAG_ROW_PX}px` }}
          >
            {visibleTagList.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                  selectedTags.includes(tag) ? 'bg-accent font-semibold text-black' : 'bg-card text-fg-muted'
                }`}
                onClick={() => {
                  haptic('select');
                  if (editingGroupId) {
                    toggleMembershipTag(tag);
                    return;
                  }
                  setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
                  if (tagSearchOpen && !tagQuery.trim()) {
                    setTagSearchOpen(false);
                  }
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedTags.length >= 2 && !selectionMatchesGroup && (
            <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full border border-dashed border-accent bg-transparent pl-3 pr-1 text-xs text-accent">
              <input
                value={groupDraft}
                onChange={(e) => setGroupDraft(e.target.value)}
                maxLength={20}
                placeholder={t(lang, 'groupNamePlaceholder')}
                className="w-24 bg-transparent py-1.5 text-xs text-fg outline-none placeholder:text-fg-faint"
              />
              {groupDraft.trim() !== '' ? (
                <button
                  type="button"
                  aria-label="save group"
                  className="flex h-6 w-6 items-center justify-center text-accent active:opacity-60"
                  onClick={() => {
                    saveTagGroup(groupDraft, selectedTags);
                    setGroupDraft('');
                    haptic('notify');
                  }}
                >
                  <CheckIcon className="h-4 w-4" />
                </button>
              ) : (
                <span className="flex h-6 w-6 items-center justify-center text-fg-faint">
                  <CheckIcon className="h-4 w-4 opacity-30" />
                </span>
              )}
            </span>
          )}
          <div className="mt-1 flex justify-center gap-4">
            {tagCanExpand && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-fg-muted active:opacity-60"
                onClick={() => {
                  haptic('tap');
                  setTagRowsMax((v) => (v === 1 ? 3 : v + 3));
                }}
              >
                {t(lang, 'showMore')}
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {tagRowsMax > 1 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-fg-muted active:opacity-60"
                onClick={() => {
                  haptic('tap');
                  setTagRowsMax(1);
                }}
              >
                {t(lang, 'collapse')}
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {tagSearchOpen && (
            <div className="relative mt-1.5">
              <input
                autoFocus
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                onBlur={() => blurClose(setTagSearchOpen, !tagQuery.trim())}
                placeholder={t(lang, 'searchPlaceholder')}
                className="w-full rounded-xl border border-card-border bg-card py-2 pl-3.5 pr-9 text-xs outline-none placeholder:text-fg-faint focus:border-accent"
              />
              {tagQuery && (
                <button
                  type="button"
                  aria-label="clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-faint active:opacity-60"
                  onClick={() => setTagQuery('')}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tagGroups.length > 0 && (
        <div className="relative z-30 px-4 pb-2">
          <p className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-fg-faint">
            {t(lang, 'tagGroupsLabel')}
            {groupMultiLine && (
              <button
                type="button"
                aria-label="search groups"
                className={`normal-case ${groupSearchOpen ? 'text-accent' : 'text-fg-muted'}`}
                onClick={toggleGroupSearch}
              >
                {groupSearchOpen ? <XIcon className="h-3.5 w-3.5" /> : <SearchIcon className="h-3.5 w-3.5" />}
              </button>
            )}
          </p>
          {groupSearchOpen && (
            <div className="relative mb-2">
              <input
                autoFocus
                value={groupQuery}
                onChange={(e) => setGroupQuery(e.target.value)}
                onBlur={() => blurClose(setGroupSearchOpen, !groupQuery.trim())}
                placeholder={t(lang, 'groupsSearchPlaceholder')}
                className="w-full rounded-xl border border-card-border bg-card py-2 pl-3.5 pr-9 text-xs outline-none placeholder:text-fg-faint focus:border-accent"
              />
              {groupQuery && (
                <button
                  type="button"
                  aria-label="clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-faint active:opacity-60"
                  onClick={() => setGroupQuery('')}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div
            ref={groupBlockRef}
            className="flex w-full min-w-0 flex-wrap gap-2 overflow-hidden transition-[max-height]"
            style={{ maxHeight: `${groupRowsMax * TAG_ROW_PX}px` }}
          >
            {visibleTagGroups.length === 0 && (
              <p className="text-xs text-fg-faint">{t(lang, 'groupsNoMatch')}</p>
            )}
            {visibleTagGroups.map((group) => {
              const isActive = [...group.tags].sort().join('|') === selectionKey;
              const editing = editingGroupId === group.id;
              return (
                <span
                  key={group.id}
                  className={`flex shrink-0 items-center rounded-full py-1 pl-3 pr-1 text-xs ${isActive ? 'bg-accent-soft text-accent' : 'bg-card text-fg-muted'}`}
                >
                  {editing ? (
                    <input
                      autoFocus
                      value={groupRenameDraft}
                      maxLength={20}
                      className="w-20 bg-transparent text-xs outline-none"
                      onChange={(e) => setGroupRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditingGroup();
                        if (e.key === 'Escape') setEditingGroupId(null);
                      }}
                    />
                  ) : (
                    <button type="button" className="text-left font-medium active:opacity-70" onClick={() => applyGroup(group.tags)}>
                      {group.name}
                    </button>
                  )}
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      aria-label={editing ? 'save group' : 'edit group'}
                      className="flex h-7 w-7 items-center justify-center text-fg-muted active:opacity-60"
                      onClick={() => {
                        if (editing) {
                          saveEditingGroup();
                        } else {
                          setEditingGroupId(group.id);
                          setGroupRenameDraft(group.name);
                          setEditingGroupTags([...group.tags]);
                          setSelectedTags([...group.tags]);
                          haptic('select');
                        }
                      }}
                    >
                      {editing ? <CheckIcon className="h-4 w-4 text-go" /> : <PencilIcon className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      aria-label="delete group"
                      className="flex h-7 w-7 items-center justify-center text-fg-faint active:opacity-60"
                      onClick={() => {
                        deleteTagGroup(group.id);
                        haptic('warn');
                      }}
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-1 flex justify-center gap-4">
            {groupCanExpand && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-fg-muted active:opacity-60"
                onClick={() => {
                  haptic('tap');
                  setGroupRowsMax((v) => v + 3);
                }}
              >
                {t(lang, 'showMore')}
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {groupRowsMax > 1 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-fg-muted active:opacity-60"
                onClick={() => {
                  haptic('tap');
                  setGroupRowsMax(1);
                }}
              >
                {t(lang, 'collapse')}
                <ChevronUpIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {editingGroupId && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-card/60 p-2.5">
              {allTags.map((tag) => {
                const on = editingGroupTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full px-2.5 py-1 text-[11px] ${on ? 'bg-accent text-black' : 'bg-card text-fg-faint'}`}
                    onClick={() => toggleMembershipTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editingGroupId && <div className="fixed inset-0 z-20" onClick={saveEditingGroup} />}

      <div className="px-4 pb-1.5">
        <p className="flex items-center justify-between text-[10px] uppercase tracking-widest text-fg-faint">
          {t(lang, 'registryTitle')}
          {listOverflows && (
            <button
              type="button"
              aria-label="search"
              className={`normal-case ${searchOpen ? 'text-accent' : 'text-fg-muted'}`}
              onClick={toggleSeriesSearch}
            >
              {searchOpen ? <XIcon className="h-3.5 w-3.5" /> : <SearchIcon className="h-3.5 w-3.5" />}
            </button>
          )}
        </p>
      </div>

      {searchOpen && (
        <div className="relative px-4 pb-2">
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => blurClose(setSearchOpen, !searchQuery.trim())}
            placeholder={t(lang, 'searchPlaceholder')}
            className="w-full rounded-xl border border-card-border bg-card px-4 py-2.5 pr-10 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="clear"
              className="absolute right-6 top-1/2 -translate-y-1/2 p-1 text-fg-faint active:opacity-60"
              onClick={() => setSearchQuery('')}
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium">{t(lang, 'registryEmpty')}</p>
            <p className="max-w-60 text-sm text-fg-muted">{t(lang, 'registryEmptyHint')}</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-2.5 pt-1">
                {visibleGroups.map((group, i) => {
                  const active = runs.find((r) => r.configId === group.id && r.runStatus === 'active');
                  const activeTimer = active?.timers[active.current];
                  return (
                    <SortableCard
                      key={group.id}
                      group={group}
                      lang={lang}
                      activeRun={
                        active && activeTimer ? { remainMs: activeTimer.remainMs, status: activeTimer.status } : undefined
                      }
                      isVoiced={active?.runId === focusedRunId}
                      onTap={() => onCardTap(group)}
                      onEdit={() => setScreen({ name: 'master', configId: group.id })}
                      onDelete={() => removeAt(i)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="px-4 pb-safe">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-go py-4 text-base font-semibold text-black active:opacity-80"
          onClick={() => setScreen({ name: 'master' })}
        >
          <PlusIcon className="h-5 w-5" />
          {t(lang, 'addGroup')}
        </button>
      </div>

      <AnimatePresence>
        {deleted && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            className="absolute inset-x-4 bottom-24 z-30 flex items-center justify-between rounded-xl bg-bg-elev px-4 py-3 shadow-lg"
          >
            <span className="text-sm">
              {t(lang, 'deleted')} · {undoCountdown}с
            </span>
            <button type="button" className="text-sm font-semibold text-accent" onClick={undo}>
              {t(lang, 'undo')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function SortableCard({
  group,
  activeRun,
  isVoiced,
  lang,
  onTap,
  onEdit,
  onDelete,
}: {
  group: GroupConfig;
  activeRun?: { remainMs: number; status: string };
  isVoiced?: boolean;
  lang: 'ru' | 'en';
  onTap: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const sum = plannedMs(group);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative overflow-hidden rounded-2xl ${isDragging ? 'z-20 opacity-80 shadow-xl' : ''}`}
    >
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-warn/15 text-warn">
        <TrashIcon className="h-6 w-6" />
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.06}
        onDragEnd={(_, info) => {
          if (info.offset.x < -72) onDelete();
        }}
        className={`relative touch-pan-y border-l-[3px] ${activeRun ? 'border-l-go' : 'border-l-transparent'} bg-card`}
      >
        <div {...attributes} {...listeners} className="flex items-center gap-3 px-4 py-3.5" onClick={onTap}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium">{group.name ?? `#${group.startSec}s`}</p>
            <p className="mt-0.5 font-mono-timer text-sm tabular-nums text-fg-muted">
              {group.startSec / 60 >= 1
                ? `${Math.floor(group.startSec / 60)}:${String(group.startSec % 60).padStart(2, '0')}`
                : `${group.startSec}`}
              {' × '}
              {group.count}
              {group.incSec > 0 ? ` +${group.incSec}` : ''}
            </p>
            {group.tags && group.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {group.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end">
            <p className="font-mono-timer text-lg tabular-nums">{fmtMs(sum)}</p>
            {activeRun ? (
              <p
                className={`flex items-center gap-1 font-mono-timer text-xs tabular-nums ${
                  activeRun.status === 'running' ? 'text-go' : activeRun.status === 'paused' ? 'text-accent' : 'text-fg-muted'
                }`}
              >
                {isVoiced && <SpeakerIcon className="h-3.5 w-3.5" />}
                {activeRun.status === 'paused' ? (
                  <PauseIcon className="h-3 w-3" />
                ) : (
                  <span className={`h-2 w-2 rounded-full ${activeRun.status === 'running' ? 'bg-go' : 'bg-fg-faint'}`} />
                )}
                {fmtMs(activeRun.remainMs)}
              </p>
            ) : (
              <p className="text-[11px] text-fg-faint">
                {group.count} {lang === 'ru' ? 'тайм.' : 'timers'}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="ml-1 shrink-0 p-1.5 text-fg-muted active:opacity-60"
          >
            <PencilIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      </motion.div>
    </li>
  );
}
