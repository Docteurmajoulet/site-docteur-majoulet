"""Une ancienne adresse doit conduire à une page et à une rubrique qui existent."""
from pathlib import Path
import tempfile
import unittest

from check_static import Page, check_redirects


class RedirectTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.pages = {}
        for name, source in {
            'index.html': '<h1 id="contact">Accueil</h1>',
            'glaucome.html': '<h1>Glaucome</h1><h2 id="chirurgie">Chirurgie</h2><h2 id="accès">Accès</h2>',
        }.items():
            path = self.root / name
            path.write_text(source)
            self.pages[name] = Page(str(path))
        # Un fichier déjà présent exige une règle forcée ; ce n’est pas une page canonique.
        (self.root / 'ancienne').write_text('Ancien contenu')
        self.canonicals = '/index.html / 301!\n/glaucome.html /glaucome 301!\n'

    def check(self, rules, canonicals=None):
        (self.root / '_redirects').write_text((self.canonicals if canonicals is None else canonicals) + rules)
        return check_redirects(str(self.root), self.pages)

    def test_existing_fragments_keep_the_forced_status(self):
        for destination in ['/glaucome#chirurgie', '/glaucome?origine=ancien#chirurgie',
                            '/glaucome#acc%C3%A8s', '/#contact']:
            with self.subTest(destination=destination):
                self.assertEqual(self.check('/ancienne ' + destination + ' 301!\n'), [])

    def test_missing_fragment_is_rejected(self):
        for destination in ['/glaucome#absente', '/#absente']:
            with self.subTest(destination=destination):
                errors = self.check('/ancienne ' + destination + ' 301!\n')
                self.assertTrue(any('rubrique inexistante ' + destination in error for error in errors))

    def test_missing_page_is_rejected_even_with_a_fragment(self):
        errors = self.check('/ancienne /inconnue#chirurgie 301!\n')
        self.assertTrue(any('cible inexistante /inconnue#chirurgie' in error for error in errors))

    def test_existing_source_still_requires_a_forced_redirect(self):
        errors = self.check('/ancienne /glaucome#chirurgie 301\n')
        self.assertTrue(any('ignorera la règle' in error for error in errors))

    def test_comments_and_external_fragments_are_not_local_targets(self):
        self.assertEqual(self.check('  # /ancienne /inconnue#absente 301\n'
                                   '/ancienne https://exemple.test/document#rubrique 301!\n'), [])

    def test_first_canonical_rule_takes_precedence(self):
        good = self.canonicals + '/glaucome.html /glaucome#chirurgie 301!\n'
        bad = '/glaucome.html /glaucome#chirurgie 301!\n' + self.canonicals
        self.assertEqual(self.check('', canonicals=good), [])
        self.assertTrue(any('doit rediriger directement' in error for error in self.check('', canonicals=bad)))


if __name__ == '__main__':
    unittest.main()
