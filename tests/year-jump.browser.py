# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Jump to a year with the numeric input and clamp out-of-range values."""
import argparse

from playwright.sync_api import expect, sync_playwright


def ready(page, url):
    for _ in range(3):
        page.goto(url, wait_until='networkidle', timeout=60000)
        try:
            page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=45000)
            return
        except Exception:
            continue
    raise AssertionError('page never became ready')


def jump(page, value):
    box = page.locator('#year-jump')
    box.fill(str(value))
    box.press('Enter')
    page.wait_for_timeout(1200)


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        ready(page, url)
        expect(page.locator('#year-jump')).to_have_value('')
        jump(page, 1978)
        expect(page.locator('#year-label')).to_have_text('1978')
        expect(page.locator('#year-jump')).to_have_value('')
        expect(page.locator('#year')).to_have_value('1978')
        jump(page, 1900)
        expect(page.locator('#year-label')).to_have_text('1960')
        jump(page, 9999)
        expect(page.locator('#year-label')).to_have_text('2025')
        assert not errors, errors[:3]
        browser.close()
        print('Year jump input changes and clamps the selected year.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
