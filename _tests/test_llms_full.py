"""La date de modification ne doit jamais être présentée comme une relecture médicale."""
import tempfile
import unittest
from pathlib import Path

from llms_full import page_markdown, page_meta


class MedicalReviewDateTest(unittest.TestCase):
    def test_later_edit_keeps_actual_review_date(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'page.html').write_text(
                '<script type="application/ld+json">'
                '{"dateModified":"2026-09-19","lastReviewed":"2026-09-01"}'
                '</script>', encoding='utf-8')
            self.assertEqual(page_meta(root, 'page'), '2026-09-01')

    def test_modification_alone_does_not_claim_a_review(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'page.html').write_text(
                '<script type="application/ld+json">'
                '{"dateModified":"2026-09-19"}'
                '</script>', encoding='utf-8')
            self.assertEqual(page_meta(root, 'page'), '')



class HiddenContentTest(unittest.TestCase):
    """TECH69AM : un bloc masqué par l’attribut hidden (sans valeur) n’entre pas dans llms-full.txt."""
    def test_hidden_block_is_left_out(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, 'page.html').write_text(
                '<main><h1>Titre</h1><p>Texte visible.</p>'
                '<div data-urgences-ferme hidden><p>Le cabinet est fermé.</p></div></main>', encoding='utf-8')
            texte = page_markdown(root, 'page')
            self.assertIn('Texte visible.', texte)
            self.assertNotIn('Le cabinet est fermé', texte)

if __name__ == '__main__':
    unittest.main()
