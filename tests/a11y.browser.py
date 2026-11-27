# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Run axe-core WCAG A/AA checks across map, dialogs and research workspaces.

The vendored axe-core snapshot (MPL-2.0) lives in tests/vendor/axe.min.js so the
check works offline.

uv run --with playwright python tests/a11y.browser.py https://earth.xuyu.net/
"""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

AXE = Path(__file__).resolve().parent / 'vendor' / 'axe.min.js'
TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
SURFACES = 0


def audit(page, label):
    global SURFACES
    result = page.evaluate(
        """async tags => await axe.run(document, { runOnly: { type: 'tag', values: tags } })""",
        TAGS,
    )
    SURFACES += 1
    violations = result['violations']
    if violations:
        detail = '; '.join(f"{item['id']} ({item['impact']}) {item['nodes'][0]['target']}" for item in violations)
        raise AssertionError(f'{label}: {detail}')
    print(f'{label}: 0 violations')


def ready(page, base=None):
    if base:
        page.goto(base, wait_until='networkidle', timeout=60000)
    page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)


def fresh_axe(page):
    page.add_script_tag(path=str(AXE))


def close_dialog(page):
    page.keyboard.press('Escape')
    expect(page.locator('#overlay')).not_to_be_visible(timeout=10000)


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        ready(page, url)
        fresh_axe(page)
        page.locator('#show-sources').click()
        page.wait_for_timeout(700)
        audit(page, 'sources dialog')
        close_dialog(page)

        page.locator('#launch-search').click()
        page.wait_for_timeout(500)
        audit(page, 'search dialog')
        close_dialog(page)

        ready(page, url + '#region=CHN&year=2024')
        fresh_axe(page)
        audit(page, 'country profile')
        targets = [('scenario', 'scenario', '#region=CHN&year=2024'), ('explorer', 'explorer', '#region=CHN&year=2024'),
                   ('council', 'council', ''), ('advisors', 'advisors', '#region=CHN&year=2024')]
        for action, label, suffix in targets:
            ready(page, url + suffix)
            trigger = page.locator(f'#inspector button[data-action="{action}"]').first
            trigger.focus()
            trigger.click()
            page.wait_for_timeout(1500)
            fresh_axe(page)
            audit(page, f'{label} dialog')
            close_dialog(page)

        trigger = page.locator('#inspector button[data-action="standards"]').first
        trigger.focus()
        trigger.click()
        page.wait_for_timeout(500)
        assert page.evaluate('document.querySelector("#overlay").contains(document.activeElement)'), 'focus must enter the dialog'
        fresh_axe(page)
        audit(page, 'standards dialog')
        close_dialog(page)
        assert page.evaluate('document.activeElement?.getAttribute("data-action") === "standards"'), 'focus must return to the trigger'

        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(1200)
        for tab, label in [('太空足迹', 'space'), ('证券日历', 'markets'), ('数据愿望清单', 'wishlist'), ('长时段历史', 'history')]:
            page.get_by_text(tab, exact=True).first.click()
            page.wait_for_timeout(2200)
            fresh_axe(page)
            audit(page, f'{label} tab')

        ready(page, url + '#city=1850147')
        fresh_axe(page)
        audit(page, 'city profile')
        ready(page, url + '#site=whc-1')
        fresh_axe(page)
        audit(page, 'wonder profile')

        page.set_viewport_size({'width': 375, 'height': 812})
        ready(page, url)
        fresh_axe(page)
        audit(page, 'mobile map')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile overflow'

        assert not errors, errors[:3]
        browser.close()
        print(f'Accessibility checks passed ({SURFACES} surfaces, WCAG A/AA, axe-core).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
