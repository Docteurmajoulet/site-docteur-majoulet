"""Régressions du serveur d'aperçu : fichiers publics et réponses HTTP."""
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import serve


class PreviewServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'site'
        self.root.mkdir()
        (self.root / 'fonts').mkdir()
        (self.root / 'index.html').write_text('Accueil de test')
        (self.root / 'contact.html').write_text('Consultation de test')
        (self.root / '404.html').write_text('Page introuvable')
        (self.base / 'temoin.txt').write_text('Fichier hors du site')
        self.patcher = patch.object(serve, 'ROOT', str(self.root))
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def request(self, method, path):
        handler = serve.H.__new__(serve.H)
        handler.path, handler.command = path, method
        handler.request_version = 'HTTP/1.1'
        handler.requestline = method + ' ' + path + ' HTTP/1.1'
        handler.headers = {}
        handler.wfile = io.BytesIO()
        getattr(handler, 'do_' + method)()
        headers, body = handler.wfile.getvalue().split(b'\r\n\r\n', 1)
        return headers.decode(), body

    def test_public_pages_and_query(self):
        for path in ['/', '/contact', '/contact.html', '/cont%61ct?v=123']:
            with self.subTest(path=path):
                headers, body = self.request('GET', path)
                self.assertIn('200 OK', headers)
                self.assertIn(body, [b'Accueil de test', b'Consultation de test'])

    def test_parent_paths_never_serve_outside_root(self):
        for path in ['/fonts/../../temoin.txt', '/fonts/%2e%2e/%2e%2e/temoin.txt', '/%2e%2e/temoin.txt']:
            with self.subTest(path=path):
                headers, body = self.request('GET', path)
                self.assertIn('404 Not Found', headers)
                self.assertEqual(body, b'Page introuvable')

    def test_symlink_outside_root_is_not_served(self):
        (self.root / 'lien.txt').symlink_to(self.base / 'temoin.txt')
        headers, body = self.request('GET', '/lien.txt')
        self.assertIn('404 Not Found', headers)
        self.assertEqual(body, b'Page introuvable')

    def test_private_files_remain_private_after_normalization(self):
        for folder in ['_tests', '.github', '.cache']:
            (self.root / folder).mkdir()
            (self.root / folder / 'interne.txt').write_text('Contenu interne')
            for path in [f'/{folder}/interne.txt', f'/fonts/../{folder}/interne.txt']:
                with self.subTest(path=path):
                    headers, body = self.request('GET', path)
                    self.assertIn('404 Not Found', headers)
                    self.assertEqual(body, b'Page introuvable')

    def test_invalid_and_missing_paths_return_real_404(self):
        for path in ['/introuvable', '/contact%00.html']:
            with self.subTest(path=path):
                headers, body = self.request('GET', path)
                self.assertIn('404 Not Found', headers)
                self.assertEqual(body, b'Page introuvable')

    def test_head_has_get_headers_without_body(self):
        for path in ['/contact', '/introuvable']:
            with self.subTest(path=path):
                get_headers, get_body = self.request('GET', path)
                head_headers, head_body = self.request('HEAD', path)
                self.assertEqual(head_body, b'')
                self.assertIn(f'Content-Length: {len(get_body)}', head_headers)
                self.assertEqual(head_headers.splitlines()[0], get_headers.splitlines()[0])
                self.assertIn('Content-Security-Policy:', head_headers)


if __name__ == '__main__':
    unittest.main()
