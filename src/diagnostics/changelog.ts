import { APP_VERSION } from './diagnostics';

export type ChangeNote = { where: string; what: string; try: string; kind?: 'feature' | 'fix' };

const NOTES: Record<string, { ru: ChangeNote[]; en: ChangeNote[] }> = {
  '0.2.1': {
    ru: [
      {
        where: 'Реестр',
        what: 'Заголовок и бета-шилдик переработаны, иконки компактнее — ничего не обрезается',
        try: 'Открой главную на телефоне: «Мои таймеры» видно целиком',
      },
      {
        where: 'Теги и группы',
        what: 'Свернуто — 1 строка с «ещё»; поиск по тегам и группам; повторный клик по группе снимает её теги; редактирование состава группы галочкой',
        try: 'Кликни группу «Утро» дважды; нажми карандаш→галку у группы и отметь теги',
      },
      {
        where: 'Реестр',
        what: 'Удаление серии показывает обратный отсчёт отмены',
        try: 'Смахни карточку влево — в снекбаре тикают секунды до 10',
      },
      {
        where: 'Мастер',
        what: 'Барабаны «Количество» и «Шаг» стали рядом — шаг с шаблонами помещается без скролла',
        try: 'Создай таймер: второй этап весь на экране',
      },
      {
        where: 'Поделиться',
        what: 'Группы тегов выбираются для экспорта вместе с сериями',
        try: 'Поделиться → отметь серии и группы → QR',
      },
    ],
    en: [
      { where: 'Registry', what: 'Header and beta badge reworked, compact icons — nothing is clipped', try: 'Open the home screen on a phone: full title fits' },
      { where: 'Tags & groups', what: 'Collapsed to 1 line with "more"; tag/group search; second tap on a group deselects its tags; checkmark edits group membership', try: 'Tap the group twice; tap pencil→check and toggle tags' },
      { where: 'Registry', what: 'Series deletion shows an undo countdown', try: 'Swipe a card left — seconds tick down in the snackbar' },
      { where: 'Master', what: 'Count and Step wheels are side by side — no scrolling on step 2', try: 'Create a timer: the whole step fits the screen' },
      { where: 'Share', what: 'Tag groups are selectable for export along with series', try: 'Share → pick series and groups → QR' },
    ],
  },
};

export function currentChangelog(lang: 'ru' | 'en'): ChangeNote[] {
  return NOTES[APP_VERSION]?.[lang] ?? [];
}

const seenFlag = () => `whats-new-seen:${APP_VERSION}`;

export function changelogSeen(): boolean {
  try {
    return localStorage.getItem(seenFlag()) === '1';
  } catch {
    return true;
  }
}

export function markChangelogSeen(): void {
  try {
    localStorage.setItem(seenFlag(), '1');
  } catch {
    /* private mode */
  }
}
