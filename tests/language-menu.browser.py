# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the language menu groups curated and machine translations."""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page.goto(url, wait_until='domcontentloaded', timeout=60000)
        page.wait_for_function('document.querySelectorAll("#language optgroup").length === 2', timeout=45000)
        menu = page.locator('#language')
        groups = menu.locator('optgroup')
        expect(groups).to_have_count(2)
        expect(groups.nth(0)).to_have_attribute('label', '人工整理')
        expect(groups.nth(1)).to_have_attribute('label', '机器翻译 · MT')
        assert menu.locator('option').count() >= 41, menu.locator('option').count()
        assert menu.locator('optgroup').nth(0).locator('option').count() == 8
        assert menu.locator('optgroup').nth(1).locator('option').count() >= 33
        values = menu.locator('option').evaluate_all('els => els.map(el => el.value)')
        assert values[0] == 'zh-CN' and 'ar' in values and 'ta' in values
        browser.close()
        print('Language menu groups curated and machine locales.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
