import { t } from '../../i18n';
import { useApp } from '../../store/app';
import type { LangMode, ThemeMode } from '../../core/types';
import { haptic } from '../../tg/tg';
import { useSwipeBack } from '../useSwipeBack';

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);
  const lang = useApp((s) => s.lang);
  const setScreen = useApp((s) => s.setScreen);
  const swipeBack = useSwipeBack(() => setScreen({ name: 'registry' }));

  const pick = <T,>(value: T, apply: () => void) => () => {
    haptic('select');
    apply();
  };

  return (
    <main className="flex h-full flex-col bg-bg" {...swipeBack}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button type="button" className="text-2xl leading-none text-fg-muted" onClick={() => setScreen({ name: 'registry' })}>
          ‹
        </button>
        <h1 className="text-lg font-semibold">{t(lang, 'settings')}</h1>
      </header>

      <div className="flex-1 space-y-6 px-4 pt-4">
        <section>
          <p className="mb-2 text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'themeTitle')}</p>
          <Segmented<ThemeMode>
            value={settings.themeMode}
            options={[
              ['auto', t(lang, 'themeAuto')],
              ['dark', t(lang, 'themeDark')],
              ['light', t(lang, 'themeLight')],
            ]}
            onSelect={(v) => pick(v, () => updateSettings({ themeMode: v }))()}
          />
        </section>

        <section>
          <p className="mb-2 text-xs uppercase tracking-widest text-fg-muted">{t(lang, 'langTitle')}</p>
          <Segmented<LangMode>
            value={settings.langMode}
            options={[
              ['auto', t(lang, 'langAuto')],
              ['ru', 'Русский'],
              ['en', 'English'],
            ]}
            onSelect={(v) => pick(v, () => updateSettings({ langMode: v }))()}
          />
        </section>

        <section className="space-y-2">
          <ToggleRow label={t(lang, 'voiceTitle')} on={settings.voiceOn} onChange={(on) => updateSettings({ voiceOn: on })} />
          <ToggleRow label={t(lang, 'beepsTitle')} on={settings.beepsOn} onChange={(on) => updateSettings({ beepsOn: on })} />
          <ToggleRow
            label={t(lang, 'headsetTitle')}
            on={settings.mediaKeepAlive}
            onChange={(on) => updateSettings({ mediaKeepAlive: on })}
          />
        </section>
      </div>
    </main>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: readonly [T, string][];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-card p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm transition-colors ${
            v === value ? 'bg-accent font-semibold text-black' : 'text-fg-muted'
          }`}
          onClick={() => onSelect(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl bg-card px-4 py-3.5 active:opacity-70"
      onClick={() => {
        haptic('select');
        onChange(!on);
      }}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-go' : 'bg-fg-faint'}`}>
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
