// Aperçu HTTPS pour les moteurs qui appliquent upgrade-insecure-requests au localhost.
// Le certificat éphémère reste dans un dossier temporaire privé et est supprimé à l’arrêt.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './lib.mjs';

export async function startHttpsServer(port) {
    const temporary = await mkdtemp(join(tmpdir(), 'majoulet-https-'));
    let stop, proxy;
    let closed = false;
    async function close() {
        if (closed) return;
        closed = true;
        if (proxy?.listening) {
            proxy.closeAllConnections();
            await new Promise(resolve => proxy.close(resolve));
        }
        stop?.();
        await rm(temporary, { recursive: true, force: true });
    }
    try {
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
            '-subj', '/CN=localhost', '-keyout', join(temporary, 'key.pem'),
            '-out', join(temporary, 'cert.pem')], { stdio: 'ignore', timeout: 15000 });
        stop = await startServer(port);
        proxy = createServer({ key: await readFile(join(temporary, 'key.pem')),
            cert: await readFile(join(temporary, 'cert.pem')) }, async (request, response) => {
            try {
                const upstream = await fetch(`http://127.0.0.1:${port}${request.url}`, {
                    method: request.method,
                    headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(10000),
                });
                response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
                response.end(Buffer.from(await upstream.arrayBuffer()));
            } catch { response.writeHead(502); response.end(); }
        });
        await new Promise((resolve, reject) => {
            proxy.once('error', reject);
            proxy.listen(0, '127.0.0.1', resolve);
        });
        return { origin: `https://127.0.0.1:${proxy.address().port}`, close };
    } catch (error) { await close(); throw error; }
}
