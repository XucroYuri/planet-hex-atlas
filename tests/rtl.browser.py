# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check right-to-left locales on a phone viewport for overflow."""
import argparse

from playwright.sync_api import expect, sync_playwright

LOCALES = ['ar', 'he', 'fa', 'ur']


def ready(page, url, lang):
    for _ in range(3):
        page.goto(f'{url}?lang={lang}', wait_until='networkidle', timeout=60000)
        try:
            page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=45000)
            return
        except Exception:
            continue
    raise AssertionError(f'{lang}: page never became ready')


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        for lang in LOCALES:
            page = browser.new_page(locale=lang, viewport={'width': 375, 'height': 812})
            ready(page, url, lang)
            assert page.evaluate('document.documentElement.dir') == 'rtl', lang
            assert page.evaluate('document.documentElement.lang') == lang, lang
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'{lang}: page overflow'
            page.locator('#inspector button[data-action="standards"]').first.click()
            page.wait_for_timeout(500)
            expect(page.locator('#overlay')).to_be_visible()
            assert page.locator('#overlay').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), f'{lang}: standards overflow'
            page.keyboard.press('Escape')
            page.wait_for_timeout(300)
            page.locator('[data-view="history"]').click()
            page.wait_for_timeout(1600)
            expect(page.locator('#overlay')).to_be_visible()
            assert page.locator('#overlay').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), f'{lang}: research overflow'
            page.close()
        browser.close()
        print(f'RTL layout fits a 375px viewport for {", ".join(LOCALES)}.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
