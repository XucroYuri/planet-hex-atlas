# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""End-to-end check against the local 370 MB A-share archive when it is mounted.

Skips (exit 0) when the volume is unavailable, e.g. in CI.

uv run --with playwright python tests/market-real.browser.py http://127.0.0.1:8000/
"""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ARCHIVE = Path('/Volumes/团队文件-图书馆/金融数据库/A股每日数据/xbx_stock_day_data.zip')


def main(url):
    if not ARCHIVE.is_file():
        print('Local A-share archive is not mounted; skipped.')
        return
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 1000})
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(800)
        page.get_by_text('证券日历', exact=True).first.click()
        page.wait_for_timeout(1200)
        page.get_by_role('button', name='本地 A 股').click()
        page.locator('.oa-markets input[type=file]').set_input_files(str(ARCHIVE))
        overview = page.locator('.market-overview')
        expect(overview).to_contain_text('只证券', timeout=120000)
        text = overview.inner_text()
        count = int(text.split('ZIP 内有')[1].split('只证券')[0].replace(',', '').strip())
        assert count >= 4000, text

        page.locator('.market-lookup input').fill('600000')
        page.wait_for_timeout(700)
        selector = page.locator('.oa-markets select').first
        options = selector.locator('option').evaluate_all('els => els.map(el => el.value)')
        assert 'sh600000' in options, options[:10]
        selector.select_option('sh600000')
        page.wait_for_timeout(2500)
        coverage = page.locator('.market-coverage').inner_text()
        assert '1999' in coverage and '2022' in coverage, coverage
        assert page.locator('.market-history').is_visible()
        assert page.locator('.market-scroll tbody tr').count() > 0
        browser.close()
        print(f'Real A-share archive indexed {count} securities; sh600000 opened ({coverage}).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
