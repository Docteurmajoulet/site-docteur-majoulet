"""Cas de régression : une correction éditoriale ne devient pas une relecture médicale."""
import unittest

from page_dates import check_visible_dates


class VisibleDatesTest(unittest.TestCase):
    def setUp(self):
        self.node = {'lastReviewed': '2026-09-01', 'dateModified': '2026-09-20'}

    def test_separate_review_and_modification_are_valid(self):
        source = '''<p>Dernière révision&nbsp;: <time datetime="2026-09-01">1<sup>er</sup> septembre 2026</time>.</p>
        <p>Dernière mise à jour : <time datetime="2026-09-20">20 septembre 2026</time>.</p>'''
        self.assertEqual(check_visible_dates(source, self.node), [])

    def test_edit_cannot_be_presented_as_medical_review(self):
        errors = check_visible_dates('Dernière révision : <time datetime="2026-09-20">20 septembre 2026</time>', self.node)
        self.assertTrue(any('lastReviewed' in error for error in errors))

    def test_stale_update_date_is_rejected(self):
        errors = check_visible_dates('Dernière mise à jour : <time datetime="2026-09-01">1er septembre 2026</time>', self.node)
        self.assertTrue(any('dateModified' in error for error in errors))

    def test_practical_information_and_publications_are_updates(self):
        for label in ['Informations pratiques mises à jour', 'Page actualisée le']:
            with self.subTest(label=label):
                self.assertEqual(check_visible_dates(f"{label}\n<time class='date' datetime='2026-09-20'>20 septembre 2026</time>", self.node), [])

    def test_human_text_must_match_datetime(self):
        errors = check_visible_dates('Dernière mise à jour : <time datetime="2026-09-20">21 septembre 2026</time>', self.node)
        self.assertTrue(any('date écrite' in error for error in errors))

    def test_invalid_calendar_day_is_rejected(self):
        errors = check_visible_dates('Dernière mise à jour : <time datetime="2026-02-30">30 février 2026</time>', self.node)
        self.assertTrue(any('date écrite' in error for error in errors))

    def test_plain_text_date_is_rejected(self):
        errors = check_visible_dates('Dernière révision&nbsp;: 1<sup>er</sup> septembre 2026', self.node)
        self.assertTrue(any('sans <time datetime>' in error for error in errors))

    def test_update_does_not_require_medical_review_metadata(self):
        source = 'Dernière mise à jour : <time datetime="2026-09-20">20 septembre 2026</time>'
        self.assertEqual(check_visible_dates(source, {'dateModified': '2026-09-20'}), [])

    def test_event_and_comment_dates_are_not_page_updates(self):
        source = '''<p>Congrès le <time datetime="2026-09-12">12 septembre 2026</time></p>
        <!-- Dernière révision : <time datetime="2026-09-20">20 septembre 2026</time> -->'''
        self.assertEqual(check_visible_dates(source, self.node), [])


if __name__ == '__main__':
    unittest.main()
