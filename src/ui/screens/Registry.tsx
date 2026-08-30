
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
import type { GroupConfig } from '../../core/types';
import { t } from '../../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { startRun, focusRun, getEngine } from '../../boot';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import { GearIcon, PauseIcon, PencilIcon, PlusIcon, QrIcon, ShareIcon, TrashIcon } from '../components/Icons';

export function RegistryScreen() {
  const groups = useApp((s) => s.registry.groups);
  const runs = useApp((s) => s.runs);
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const moveGroup = useApp((s) => s.moveGroup);

  const [deleted, setDeleted] = useState<{ group: GroupConfig; index: number } | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allTags = useMemo(() => [...new Set(groups.flatMap((g) => g.tags ?? []))], [groups]);
  const visibleGroups = useMemo(
    () => (tagFilter ? groups.filter((g) => g.tags?.includes(tagFilter)) : groups),
    [groups, tagFilter],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 260, tolerance: 8 } }));

  useEffect(() => {
    for (const r of useApp.getState().runs) {
      if (r.runStatus === 'done' || r.actualMs === 0) getEngine().dismiss(r.runId);
    }
  }, []);


  const onCardTap = (group: GroupConfig) => {
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
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeleted(null), 5000);
  };

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

  return (
    <main className="flex h-full flex-col bg-bg">
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <h1 className="text-2xl font-bold">{t(lang, 'registryTitle')}</h1>
        <div className="flex items-center gap-4 text-fg-muted">
          <button type="button" aria-label="share" onClick={() => setScreen({ name: 'share' })}>
            <ShareIcon />
          </button>
          <button type="button" aria-label="import qr" onClick={() => setScreen({ name: 'importPreview', groups: [] })}>
            <QrIcon />
          </button>
          <button type="button" aria-label="settings" onClick={() => setScreen({ name: 'settings' })}>
            <GearIcon />
          </button>
        </div>
      </header>

      {allTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          <button
            type="button"
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${tagFilter === null ? 'bg-accent font-semibold text-black' : 'bg-card text-fg-muted'}`}
            onClick={() => {
              haptic('select');
              setTagFilter(null);
            }}
          >
            {t(lang, 'tagAll')}
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${tagFilter === tag ? 'bg-accent font-semibold text-black' : 'bg-card text-fg-muted'}`}
              onClick={() => {
                haptic('select');
                setTagFilter(tagFilter === tag ? null : tag);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
            <span className="text-sm">{t(lang, 'deleted')}</span>
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
  lang,
  onTap,
  onEdit,
  onDelete,
}: {
  group: GroupConfig;
  activeRun?: { remainMs: number; status: string };
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
