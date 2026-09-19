// Le harnais doit tester le processus qu'il vient de lancer, jamais un autre site.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { startServer } from './lib.mjs';

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

test('un port occupé refuse le démarrage même si une autre page répond 200', async () => {
  const other = createServer((request, response) => response.end('autre copie'));
  const port = await listen(other);
  try {
    await assert.rejects(startServer(port), /Serveur local .*arrêt avant démarrage/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}/robots.txt`)).text(), 'autre copie');
  } finally { await close(other); }
});

test('le serveur confirmé sert la copie courante puis accepte un arrêt répété', async () => {
  const reservation = createServer();
  const port = await listen(reservation);
  await close(reservation);
  const stop = await startServer(port);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/contact`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Contact et rendez-vous/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  } finally { stop(); stop(); }
});
