import LZString from '../node_modules/lz-string/libs/lz-string.js';
import os from 'node:os';
import QRCode from '../node_modules/qrcode/lib/index.js';

const DEMO_GROUPS = [
  ['Кардио-интервалы', 20, 12, 5, ['кардио', 'утро']],
  ['Растяжка', 45, 4, 0, ['Дима', 'вечер']],
  ['Пресс-круг', 30, 8, 10, ['пресс', 'вечер']],
  ['Бицепс/трицепс', 45, 8, 5, ['руки', 'вечер']],
  ['Подтягивания', 120, 5, 10, ['Маша', 'спина']],
  ['Румынская тяга', 120, 5, 20, ['Дима', 'спина']],
  ['Отжимания на брусьях', 90, 6, 15, ['Маша', 'грудь', 'утро']],
  ['Планка-отдых', 30, 5, 0, ['пресс', 'утро']],
  ['Выпады', 60, 10, 5, ['Дима', 'ноги']],
  ['Тяга верхнего блока', 75, 5, 10, ['Маша', 'спина']],
  ['Приседания', 120, 6, 0, ['Дима', 'ноги']],
  ['Жим лёжа', 90, 8, 15, ['Маша', 'грудь']],
];

const DEMO_TAG_GROUPS = [
  ['Утро', ['утро', 'пресс', 'кардио']],
  ['Маша', ['Маша']],
  ['Верх тела', ['грудь', 'спина', 'руки']],
];

const baseArgIdx = process.argv.indexOf('--base');
const customBase = baseArgIdx >= 0 ? process.argv[baseArgIdx + 1] : null;

function detectLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const base = customBase ?? `http://${detectLanIp()}:5179/RestTimer/`;

const wire = {
  v: 1,
  g: DEMO_GROUPS.map(([name, startSec, count, incSec, tags]) => [name, startSec, count, incSec, tags]),
  tg: DEMO_TAG_GROUPS.map(([name, tags]) => [name, tags]),
};

const payload = LZString.compressToEncodedURIComponent(JSON.stringify(wire));
const url = `${base}?cfg=${payload}`;

console.log(`\nRestTimer demo config`);
console.log(`серий: ${DEMO_GROUPS.length}, групп тегов: ${DEMO_TAG_GROUPS.length}`);
console.log(`длина пейлоада: ${payload.length} симв. (QR-бюджет ~1200, Telegram-диплинк 512)`);
console.log(`\n1) запусти сервер:  pnpm dev --host --port 5179`);
console.log(`2) открой на телефоне по ссылке (та же WiFi-сеть):\n`);
console.log(url);
console.log(`\n3) в импорте выбери «Заменить весь реестр» — получишь все серии, теги и группы тегов.\n`);

if (payload.length <= 1150) {
  const qr = await QRCode.toString(url, { type: 'terminal', small: true, margin: 1, errorCorrectionLevel: 'L' });
  console.log('или отсканируй QR с экрана Mac:\n');
  console.log(qr);
} else {
  console.log('Пейлоад слишком плотный для терминального QR — используй ссылку выше.');
  console.log('QR для телефона можно собрать на экране «Поделиться» уже после импорта.');
}
