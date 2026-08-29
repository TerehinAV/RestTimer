import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { resolveLang } from './i18n';
import { useApp } from './store/app';
import type { Screen } from './store/app';
import { ImportScreen } from './ui/screens/Import';
import { MasterScreen } from './ui/screens/Master';
import { RegistryScreen } from './ui/screens/Registry';
import { RunScreen } from './ui/screens/Run';
import { SettingsScreen } from './ui/screens/Settings';
import { ShareScreen } from './ui/screens/Share';
import { SummaryScreen } from './ui/screens/Summary';
import { applyThemeClass, navLangs, resolveTheme } from './theme/apply';
import { tgLocale } from './tg/tg';

function screenKey(screen: Screen): string {
  switch (screen.name) {
    case 'master':
      return `master:${screen.configId ?? 'new'}`;
    case 'summary':
      return `summary:${screen.runId}`;
    default:
      return screen.name;
  }
}

function renderScreen(screen: Screen) {
  switch (screen.name) {
    case 'registry':
      return <RegistryScreen />;
    case 'master':
      return <MasterScreen />;
    case 'run':
      return <RunScreen />;
    case 'summary':
      return <SummaryScreen />;
    case 'share':
      return <ShareScreen />;
    case 'importPreview':
      return <ImportScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function EnvironmentSync() {
  const themeMode = useApp((s) => s.settings.themeMode);
  const langMode = useApp((s) => s.settings.langMode);

  useEffect(() => {
    applyThemeClass(resolveTheme(themeMode));
  }, [themeMode]);

  useEffect(() => {
    useApp.getState().setLang(resolveLang(langMode, tgLocale(), navLangs()));
  }, [langMode]);

  return null;
}

export default function App() {
  const screen = useApp((s) => s.screen);
  return (
    <div className="h-full pt-[max(env(safe-area-inset-top),var(--tg-inset-top,0px))] pb-[max(env(safe-area-inset-bottom),var(--tg-inset-bottom,0px))]">
      <EnvironmentSync />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screenKey(screen)}
          className="h-full"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {renderScreen(screen)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
