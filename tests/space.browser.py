# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the space timeline includes the Chinese crewed and lunar milestones."""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(900)
        page.get_by_text('太空足迹', exact=True).first.click()
        page.wait_for_timeout(2800)
        events = page.locator('[data-events]')
        expect(events).to_contain_text('神舟五号', timeout=30000)
        expect(events).to_contain_text('神舟七号')
        expect(events).to_contain_text('嫦娥四号')
        expect(events).to_contain_text('天问一号')
        expect(events).to_contain_text('嫦娥六号')
        hrefs = events.locator('a').evaluate_all('els => els.map(el => el.href)')
        assert any('cnsa.gov.cn' in href for href in hrefs), hrefs
        assert any('cmse.gov.cn' in href for href in hrefs), hrefs
        crewed = page.locator('.space-crewed')
        expect(crewed).to_contain_text('载人深空任务', timeout=20000)
        rows = crewed.locator('tbody tr')
        assert rows.count() == 10, rows.count()
        expect(crewed).to_contain_text('Apollo 11')
        expect(crewed).to_contain_text('1969-07-16')
        assert crewed.locator('tbody tr', has_text='✓').count() == 6
        assert crewed.locator('a[href*="nasa.gov"]').count() >= 2
        assert not errors, errors[:3]
        browser.close()
        print('Space timeline includes Chinese crewed and lunar milestones.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
