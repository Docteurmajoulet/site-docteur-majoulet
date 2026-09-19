"""La date de modification ne doit jamais être présentée comme une relecture médicale."""
import tempfile
import unittest
from pathlib import Path

from llms_full import page_meta


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


if __name__ == '__main__':
    unittest.main()
