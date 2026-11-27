# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the local A-share ZIP path end-to-end in a real browser.

The fixture is generated in memory and written to a temporary file; the browser
reads it locally, so nothing is uploaded.

uv run --with playwright python tests/market.browser.py https://earth.xuyu.net/
"""
import argparse
import io
import tempfile
import zipfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

HEADER = '股票代码,股票名称,交易日期,开盘价,最高价,最低价,收盘价,前收盘价,成交量,成交额,流通市值,总市值'
ROWS = [
    'sh600000,示例证券,2022-04-25,9,11,8,10,9.5,1230,12300,50000,100000',
    'sh600000,示例证券,2022-04-26,10,12,9,11,10,1500,16000,51000,101000',
    'sz000001,另一证券,2022-04-25,2,3,2,2.1,2,450,900,70000,200000',
]


def fixture(directory):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('stock/sh600000.csv', ('\ufeff' + HEADER + '\n' + '\n'.join(ROWS[:2]) + '\n').encode('gb18030'), zipfile.ZIP_DEFLATED)
        archive.writestr('stock/sz000001.csv', ('\ufeff' + HEADER + '\n' + ROWS[2] + '\n').encode('utf-8'), zipfile.ZIP_STORED)
    path = Path(directory) / 'a-shares.zip'
    path.write_bytes(buffer.getvalue())
    return path


def main(url):
    with tempfile.TemporaryDirectory() as directory, sync_playwright() as playwright:
        archive = fixture(directory)
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.get_by_text('证券日历', exact=True).first.click()
        expect(page.locator('.oa-markets')).to_be_visible(timeout=30000)
        page.get_by_role('button', name='本地 A 股').click()
        page.locator('.oa-markets input[type=file]').set_input_files(archive)
        expect(page.locator('.market-overview')).to_contain_text('ZIP 内有 2 只证券', timeout=30000)
        selector = page.locator('.oa-markets select').first
        selector.select_option('sh600000')
        expect(page.locator('.market-history')).to_be_visible(timeout=30000)
        expect(page.locator('.market-history canvas')).to_be_visible()
        rows = page.locator('.market-scroll tbody tr')
        expect(rows.first).to_be_visible(timeout=30000)
        assert rows.count() >= 1
        expect(page.locator('.market-coverage')).to_contain_text('2022')
        assert not errors, errors[:3]
        browser.close()
        print('Local A-share ZIP import rendered overview, chart and table.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
