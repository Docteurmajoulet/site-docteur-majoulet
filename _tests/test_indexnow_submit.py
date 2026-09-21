"""Une erreur Git ne prouve ni la fraîcheur ni la suppression d’une page publiée."""
import contextlib
import hashlib
import io
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import indexnow_submit as indexnow


def result(code=0, body=b''):
    return subprocess.CompletedProcess(['git'], code, stdout=body, stderr=b'')


class LatestBlobTests(unittest.TestCase):
    def test_successful_sync_returns_hash(self):
        body = b'page du dernier commit'
        with patch.object(indexnow.subprocess, 'run', side_effect=[result(), result(body=body)]):
            self.assertEqual(indexnow.latest_blob('index.html'), hashlib.sha256(body).hexdigest())

    def test_failed_sync_does_not_accept_cached_remote(self):
        with patch.object(indexnow.subprocess, 'run', side_effect=[result(1), result(body=b'ancien commit')]):
            self.assertEqual(indexnow.latest_blob('index.html'), '')

    def test_read_error_is_not_a_deletion(self):
        for tree in [result(128), result(body=b'index.html\n')]:
            with self.subTest(tree=tree), patch.object(indexnow.subprocess, 'run', side_effect=[result(), result(128), tree]):
                self.assertEqual(indexnow.latest_blob('index.html'), '')

    def test_confirmed_missing_page_is_a_deletion(self):
        with patch.object(indexnow.subprocess, 'run', side_effect=[result(), result(128), result()]):
            self.assertIsNone(indexnow.latest_blob('index.html'))

    def test_unavailable_git_or_timeout_is_unknown(self):
        for error in [OSError('Git indisponible'), subprocess.TimeoutExpired(['git', 'fetch'], 20)]:
            with self.subTest(error=error), patch.object(indexnow.subprocess, 'run', side_effect=error):
                self.assertEqual(indexnow.latest_blob('index.html'), '')


class ProductionWaitTests(unittest.TestCase):
    def wait_with(self, production, commands):
        # Aucun accès réseau ni écriture dans le dépôt du site.
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'index.html').write_bytes(b'nouvelle page locale')
            with patch.object(indexnow, 'ROOT', root), \
                 patch.object(indexnow.subprocess, 'run', side_effect=commands), \
                 patch.object(indexnow, 'fetch', return_value=(200, production)), \
                 patch.object(indexnow.time, 'time', side_effect=[0, 0, 0, 361]), \
                 patch.object(indexnow.time, 'sleep'), \
                 contextlib.redirect_stdout(io.StringIO()):
                return indexnow.wait_for_prod('https://exemple.test', 'index.html')

    def test_old_production_is_not_ready_after_failed_sync(self):
        old = b'ancienne page publiee'
        self.assertFalse(self.wait_with(old, [result(1), result(body=old)]))

    def test_local_version_can_be_confirmed_without_remote(self):
        # L’empreinte exacte du commit attendu suffit, même si Git est indisponible.
        self.assertTrue(self.wait_with(b'nouvelle page locale', [result(1), result(128)]))

    def test_later_successfully_synced_commit_is_still_accepted(self):
        later = b'page issue du push suivant'
        self.assertTrue(self.wait_with(later, [result(), result(body=later)]))


if __name__ == '__main__':
    unittest.main()
