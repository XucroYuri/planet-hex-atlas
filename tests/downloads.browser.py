# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check that the raw-data download links resolve to real JSON files."""
import argparse
import csv
import io

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
        page.wait_for_timeout(1000)
        page.get_by_text('数据愿望清单', exact=True).first.click()
        section = page.locator('[data-downloads]')
        expect(section).to_be_visible(timeout=30000)
        expect(section).to_contain_text('原始数据下载')
        links = section.locator('a')
        assert links.count() == 7, links.count()
        assert links.evaluate_all('els => els.every(el => el.hasAttribute("download"))')
        hrefs = links.evaluate_all('els => els.map(el => el.href)')
        for href in hrefs:
            response = page.request.get(href)
            assert response.ok, f'{href}: {response.status}'
            content_type = response.headers.get('content-type', '')
            if href.endswith('.zip'):
                assert 'zip' in content_type, href
            else:
                assert 'json' in content_type, href
        assert any('/data/annual/' in href for href in hrefs), hrefs
        assert any('/data/history/catalog.json' in href for href in hrefs), hrefs
        assert any('/data/space/launches.json' in href for href in hrefs), hrefs
        annual = section.locator('[data-export-annual]')
        expect(annual).to_be_enabled(timeout=30000)
        with page.expect_download(timeout=30000) as pending:
            annual.click()
        download = pending.value
        assert download.suggested_filename == 'orbis-annual-2023.csv', download.suggested_filename
        rows = list(csv.reader(io.StringIO(open(download.path(), encoding='utf-8-sig').read())))
        assert rows[0][0] == 'region' and len(rows[0]) == 30, rows[0]
        assert len(rows) > 200, len(rows)
        assert any(any(cell == '' for cell in row[1:]) for row in rows[1:]), 'missing values should stay blank'
        assert not errors, errors[:3]
        browser.close()
        print(f'All {len(hrefs)} download links (JSON + open-data ZIP) and the annual CSV export are valid.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
