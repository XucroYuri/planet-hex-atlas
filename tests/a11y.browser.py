# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Run axe-core WCAG A/AA checks on the map, standards dialog and history lab.

The vendored axe-core snapshot (MPL-2.0) lives in tests/vendor/axe.min.js so the
check works offline.

uv run --with playwright python tests/a11y.browser.py https://earth.xuyu.net/
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

AXE = Path(__file__).resolve().parent / 'vendor' / 'axe.min.js'
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']


def audit(page, label):
    result = page.evaluate(
        """async tags => await axe.run(document, { runOnly: { type: 'tag', values: tags } })""",
        TAGS,
    )
    violations = result['violations']
    if violations:
        detail = '; '.join(f"{item['id']} ({item['impact']}) {item['nodes'][0]['target']}" for item in violations)
        raise AssertionError(f'{label}: {detail}')
    print(f'{label}: 0 violations')


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.add_script_tag(path=str(AXE))
        audit(page, 'map overview')
        page.goto(url + '#region=CHN&year=2024', wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#inspector h1")', timeout=30000)
        page.add_script_tag(path=str(AXE))
        audit(page, 'country profile')
        page.locator('#inspector button[data-action="standards"]').first.click()
        page.wait_for_timeout(600)
        page.add_script_tag(path=str(AXE))
        audit(page, 'standards dialog')
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(1500)
        page.add_script_tag(path=str(AXE))
        audit(page, 'research')
        assert not errors, errors[:3]
        browser.close()
        print('Accessibility checks passed (WCAG A/AA, axe-core).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
