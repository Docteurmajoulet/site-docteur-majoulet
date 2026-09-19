// Outils communs des tests navigateur (serveur local, liste des pages).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(TESTS_DIR, '..');

export function pages() {
  return readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort();
}

export function urlFor(slug, port) {
  return `http://127.0.0.1:${port}/` + (slug === 'index' ? '' : slug === '404' ? '404.html' : slug);
}

/** Lance _tests/serve.py sur `port` et attend qu'il réponde ; renvoie une fonction d'arrêt. */
export async function startServer(port) {
  const proc = spawn('python3', [join(TESTS_DIR, 'serve.py'), String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  // Seul le processus lancé peut confirmer qu'il a lié le port à cette copie.
  // Un GET réussi sur un port déjà occupé pouvait valider une autre branche.
  await new Promise((ready, reject) => {
    let settled = false, output = '', diagnostic = '';
    const fail = reason => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      reject(new Error(`Serveur local ${port} : ${reason}${diagnostic ? '\n' + diagnostic.trim() : ''}`));
    };
    const timer = setTimeout(() => fail('démarrage non confirmé après 15 secondes'), 15000);
    proc.once('error', error => fail(error.message));
    proc.once('exit', (code, signal) => fail(`arrêt avant démarrage (${signal || code})`));
    proc.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
    proc.stdout.on('data', chunk => {
      output = (output + chunk).slice(-4000);
      if (!settled && output.includes(`Site servi sur http://127.0.0.1:${port}/ (racine ${resolve(ROOT)},`)) {
        settled = true;
        clearTimeout(timer);
        ready();
      }
    });
  });
  return () => { try { proc.kill(); } catch {} };
}
