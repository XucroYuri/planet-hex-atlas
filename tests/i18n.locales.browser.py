# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Smoke every locale advertised by web/js/i18n.js on a running site."""
import argparse
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

LOCALE_LINE = re.compile(r"\{\s*tag:\s*'([^']+)',\s*label:\s*'([^']*)',\s*dir:\s*'([^']+)'")


def locales():
    source = (Path(__file__).resolve().parents[1] / 'web/js/i18n.js').read_text()
    return LOCALE_LINE.findall(source)


def main(url):
    entries = locales()
    assert len(entries) >= 24, entries
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        for tag, label, direction in entries:
            page.goto(f'{url}?lang={tag}#region=CHN&year=2024', wait_until='networkidle', timeout=60000)
            expect(page.locator('#workspace')).to_have_attribute('data-ready', 'true', timeout=40000)
            expect(page.locator('#language')).to_have_value(tag)
            assert page.evaluate('document.documentElement.lang') == tag
            assert page.evaluate('document.documentElement.dir') == direction
            assert page.evaluate('document.title.length > 0')
            assert page.locator('#inspector').inner_text().strip(), tag
            page.screenshot(path=f'/tmp/orbis-locale-{tag}.png')
        assert not errors, errors[:3]
        browser.close()
        print(f'{len(entries)} locales rendered with matching lang/direction/title and China profile.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
