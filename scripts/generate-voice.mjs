import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const MANIFEST_PATH = path.join(ROOT, 'scripts', 'manifest.phrases.json');
const HASHES_PATH = path.join(AUDIO_DIR, '.hashes.json');

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey && !dryRun) {
  console.error('OPENAI_API_KEY is required (or pass --dry-run). Get one at https://platform.openai.com/api-keys');
  process.exit(1);
}

let hashes = {};
if (existsSync(HASHES_PATH)) {
  hashes = JSON.parse(await readFile(HASHES_PATH, 'utf8'));
}

const jobs = [];
for (const [key, translations] of Object.entries(manifest.phrases)) {
  for (const [lang, text] of Object.entries(translations)) {
    jobs.push({ key, lang, text });
  }
}

let created = 0;
let skipped = 0;

for (const { key, lang, text } of jobs) {
  const dir = path.join(AUDIO_DIR, lang);
  const file = path.join(dir, `${key}.mp3`);
  const hash = createHash('sha256').update(`${manifest.model}|${manifest.voices[lang]}|${text}`).digest('hex').slice(0, 16);

  if (existsSync(file) && hashes[`${lang}/${key}`] === hash) {
    skipped += 1;
    continue;
  }

  if (dryRun) {
    console.log(`[dry-run] ${lang}/${key}: "${text}"`);
    created += 1;
    continue;
  }

  await mkdir(dir, { recursive: true });
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: manifest.model,
      voice: manifest.voices[lang],
      input: text,
      response_format: manifest.format,
      speed: manifest.speed,
    }),
  });

  if (!res.ok) {
    console.error(`FAILED ${lang}/${key}: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    continue;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  hashes[`${lang}/${key}`] = hash;
  await writeFile(HASHES_PATH, JSON.stringify(hashes, null, 2) + '\n');
  console.log(`ok ${lang}/${key}.mp3 (${(buf.length / 1024).toFixed(1)} KB) "${text}"`);
  created += 1;
}

console.log(`\n${created} generated, ${skipped} unchanged (total ${jobs.length} files expected in public/audio/{ru,en}/)`);
if (!dryRun && created + skipped !== jobs.length) {
  process.exitCode = 1;
}
