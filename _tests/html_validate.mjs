#!/usr/bin/env node
// Validation HTML W3C de toutes les pages avec le Nu Html Checker (vnu.jar, fourni par le paquet npm vnu-jar) — TECH18AQ-2026-09-15.
//   node _tests/html_validate.mjs        (ou : cd _tests && npm run test:html)
// Erreurs ET avertissements sont des échecs, sauf deux avertissements assumés : role="list" sur <ul> (Safari/VoiceOver retire la
// sémantique de liste quand list-style: none) et role="contentinfo" sur <footer> (redondant, sans effet). Java ≥ 11 requis :
// absent → contrôle sauté avec un message (il tourne sur GitHub à chaque push, où Java est installé). Le paquet vnu-jar ne
// télécharge rien : _tests/.npmrc (ignore-scripts) désactive son script d'installation, qui irait chercher un Java s'il manquait.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, TESTS_DIR } from './lib.mjs';

const JAR = join(TESTS_DIR, 'node_modules', 'vnu-jar', 'build', 'dist', 'vnu.jar');
const ACCEPTED = [/^The “list” role is unnecessary for element “ul”\.$/, /^The “contentinfo” role is unnecessary for element “footer”\.$/];

if (!existsSync(JAR)) { console.log('html_validate : vnu.jar absent (cd _tests && npm ci) — ÉCHEC'); process.exit(1); }
const probe = spawnSync('java', ['-version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) { console.log('html_validate : Java absent — validation W3C sautée (elle tourne sur GitHub à chaque push).'); process.exit(0); }
const version = (spawnSync('java', ['-jar', JAR, '--version'], { encoding: 'utf8' }).stdout || '').trim();
const files = readdirSync(ROOT).filter(f => f.endsWith('.html')).sort().map(f => join(ROOT, f));
const r = spawnSync('java', ['-jar', JAR, '--format', 'json', '--skip-non-html', ...files], { encoding: 'utf8', maxBuffer: 64 << 20 });
let messages;
try {   // le JSON est écrit sur stderr (une ligne) ; on ignore les lignes de la JVM (« Picked up JAVA_TOOL_OPTIONS… »)
  messages = JSON.parse((r.stderr || '').split('\n').filter(l => l.startsWith('{')).join('\n')).messages;
} catch (e) { console.log('html_validate : sortie du validateur illisible — ' + ((r.stderr || r.stdout || String(r.error)).slice(0, 400))); process.exit(1); }
const failures = []; let accepted = 0;
for (const m of messages) {
  if (ACCEPTED.some(re => re.test(m.message))) { accepted++; continue; }
  failures.push(`${m.type}${m.subType ? '/' + m.subType : ''} ${(m.url || '').split('/').pop()}:${m.lastLine || ''} — ${m.message}`);
}
for (const f of failures) console.log('  ÉCHEC : ' + f);
console.log(`html_validate : ${files.length} pages, ${failures.length} problème(s), ${accepted} avertissement(s) assumé(s) ignoré(s) — Nu Html Checker ${version}.`);
process.exit(failures.length ? 1 : 0);
