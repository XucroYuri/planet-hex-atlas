# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Export a history series to CSV and verify its header and rows."""
import argparse
import csv
import io

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 1000}, accept_downloads=True)
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(900)
        page.get_by_text('长时段历史', exact=True).first.click()
        page.wait_for_timeout(2200)
        selects = page.locator('#overlay-body select')
        region_index = None
        for index in range(selects.count()):
            values = selects.nth(index).locator('option').evaluate_all('els => els.map(el => el.value)')
            if 'CHN' in values:
                region_index = index
                break
        assert region_index is not None
        selects.nth(region_index).select_option('CHN')
        page.wait_for_timeout(2200)
        with page.expect_download(timeout=30000) as pending:
            page.locator('[data-export="series"]').click()
        download = pending.value
        assert download.suggested_filename == 'orbis-CHN-population.csv', download.suggested_filename
        text = open(download.path(), encoding='utf-8-sig').read()
        rows = list(csv.reader(io.StringIO(text)))
        assert rows[0] == ['year', 'value', 'unit', 'status', 'source'], rows[0]
        assert len(rows) > 60, len(rows)
        assert all(len(row) == 5 for row in rows[1:])
        assert all(row[0].lstrip('-').isdigit() for row in rows[1:])
        browser.close()
        print(f'History CSV exported with {len(rows) - 1} data rows.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
