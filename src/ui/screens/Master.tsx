import { useMemo, useState } from 'react';
import { nanoid } from 'nanoid';
import { fmtMs, plannedMs } from '../../core/time';
import { LIMITS } from '../../core/types';
import type { GroupConfig } from '../../core/types';
import { t } from '../../i18n';
import { useApp } from '../../store/app';
import { haptic } from '../../tg/tg';
import { Wheel } from '../components/Wheel';
import type { WheelItem } from '../components/Wheel';

const minuteItems: WheelItem[] = Array.from({ length: 31 }, (_, m) => ({ value: m * 60, label: String(m) }));
const secItems: WheelItem[] = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, '0') }));
const countItems: WheelItem[] = Array.from({ length: LIMITS.countMax }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const incItems: WheelItem[] = Array.from({ length: 13 }, (_, i) => ({ value: i * 5, label: `+${i * 5}` }));

export function MasterScreen() {
  const configId = useApp((s) => (s.screen.name === 'master' ? s.screen.configId : undefined));
  const existing = useApp((s) => (configId ? s.registry.groups.find((g) => g.id === configId) : undefined));
  const saveGroup = useApp((s) => s.saveGroup);
  const setScreen = useApp((s) => s.setScreen);
  const lang = useApp((s) => s.lang);
  const customPresets = useApp((s) => s.customPresets);
  const saveCustomPreset = useApp((s) => s.saveCustomPreset);

  const [step, setStep] = useState(0);
  const [startSec, setStartSec] = useState(() =>
    Math.min(LIMITS.startSecMax, Math.max(LIMITS.startSecMin, existing?.startSec ?? 60)),
  );
  const [count, setCount] = useState(existing?.count ?? 8);
  const [incSec, setIncSec] = useState(existing?.incSec ?? 0);
  const [name, setName] = useState(existing?.name ?? '');

  const presetValues = useMemo(
    () => [...customPresets.map((p) => p.startSec), 30, 45, 60, 90, 120, 180].filter((v, i, arr) => arr.indexOf(v) === i),
    [customPresets],
  );

  const draft: GroupConfig = { id: existing?.id ?? 'draft', startSec, count, incSec };
  const sum = plannedMs(draft);

  const minutes = Math.floor(startSec / 60);
  const seconds = startSec % 60;

  const save = () => {
    const final: GroupConfig = {
      id: existing?.id ?? nanoid(8),
      name: name.trim() === '' ? undefined : name.trim().slice(0, LIMITS.nameMax),
      startSec: Math.max(LIMITS.startSecMin, startSec),
      count,
      incSec,
    };
    saveGroup(final);
    haptic('notify');
    setScreen({ name: 'registry' });
  };

  return (
    <main className="flex h-full flex-col bg-bg px-4 pb-6 pt-4">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="min-w-16 text-left text-fg-muted"
          onClick={() => (step === 0 ? setScreen({ name: 'registry' }) : setStep(step - 1))}
        >
          {step === 0 ? t(lang, 'cancel') : '‹'}
        </button>
        <h1 className="text-base font-semibold">{t(lang, existing ? 'masterTitleEdit' : 'masterTitleNew')}</h1>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= step ? 'bg-accent' : 'bg-fg-faint'}`} />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-center text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'stepStart')}</h2>
          <div className="flex flex-1 items-center justify-center gap-8">
            <div className="flex flex-col items-center">
              <Wheel
                className="w-24"
                items={minuteItems}
                value={minutes * 60}
                onChange={(v) => setStartSec(Math.max(LIMITS.startSecMin, v + seconds))}
              />
              <span className="mt-1 text-xs text-fg-muted">{t(lang, 'min')}</span>
            </div>
            <div className="flex flex-col items-center">
              <Wheel
                className="w-24"
                items={secItems}
                value={seconds}
                onChange={(v) => setStartSec(Math.max(LIMITS.startSecMin, minutes * 60 + v))}
              />
              <span className="mt-1 text-xs text-fg-muted">{t(lang, 'sec')}</span>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <PresetRow
              label={customPresets.length > 0 ? t(lang, 'customPresetsLabel') : t(lang, 'presetsLabel')}
              values={presetValues}
              customCount={customPresets.length}
              current={startSec}
              onPick={(v) => {
                haptic('tap');
                setStartSec(v);
              }}
            />
            <button
              type="button"
              className="w-full rounded-full bg-accent-soft px-3 py-2 text-xs text-accent active:opacity-70"
              onClick={() => {
                saveCustomPreset(startSec);
                haptic('notify');
              }}
            >
              {t(lang, 'savePreset')}
            </button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex min-h-0 flex-1 flex-col justify-center gap-10">
          <div>
            <h2 className="mb-2 text-center text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'stepCount')}</h2>
            <div className="flex justify-center">
              <Wheel className="w-28" items={countItems} value={count} onChange={setCount} />
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-center text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'stepInc')}</h2>
            <div className="flex justify-center">
              <Wheel className="w-28" items={incItems} value={incSec} onChange={setIncSec} />
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex min-h-0 flex-1 flex-col justify-center gap-6">
          <div>
            <h2 className="mb-2 text-xs uppercase tracking-widest text-fg-muted">
              {t(lang, 'stepName')} <span className="normal-case tracking-normal text-fg-faint">({t(lang, 'stepNameHint')})</span>
            </h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.nameMax}
              placeholder={t(lang, 'namePlaceholder')}
              className="w-full rounded-xl border border-card-border bg-card px-4 py-3 text-base outline-none placeholder:text-fg-faint focus:border-accent"
            />
          </div>
          <div className="rounded-2xl bg-card p-4 text-center">
            <p className="text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'previewSum')}</p>
            <p className="font-mono-timer text-4xl tabular-nums">{fmtMs(sum)}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {startSec}×{count}
              {incSec > 0 ? ` (+${incSec})` : ''}
            </p>
          </div>
        </section>
      )}

      <button
        type="button"
        className="mt-4 w-full rounded-2xl bg-go py-4 text-base font-semibold text-black active:opacity-80"
        onClick={() => (step === 2 ? save() : setStep(step + 1))}
      >
        {step === 2 ? t(lang, 'save') : t(lang, 'done')}
      </button>
    </main>
  );
}

function PresetRow({
  label,
  values,
  customCount,
  current,
  onPick,
}: {
  label: string;
  values: number[];
  customCount: number;
  current: number;
  onPick: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-fg-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`rounded-full px-3.5 py-1.5 font-mono-timer text-sm tabular-nums active:opacity-70 ${
              v === current ? 'bg-accent text-black' : i < customCount ? 'bg-accent-soft text-accent' : 'bg-card text-fg-muted'
            }`}
          >
            {v < 60 ? `${v}` : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`}
          </button>
        ))}
      </div>
    </div>
  );
}
