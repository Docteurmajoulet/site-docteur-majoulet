// Outils communs des tests navigateur (serveur local, liste des pages).
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  const proc = spawn('python3', [join(TESTS_DIR, 'serve.py'), String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`http://127.0.0.1:${port}/robots.txt`); if (r.ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return () => { try { proc.kill(); } catch {} };
}
