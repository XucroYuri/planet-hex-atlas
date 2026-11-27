# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check the China profile shows official NBS GDP and the published population years."""
import argparse
import csv
import io

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 950}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def open_profile(year):
            for _ in range(3):
                page.goto(f'{url}#region=CHN&year={year}', wait_until='networkidle', timeout=60000)
                try:
                    page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=45000)
                    return
                except Exception:
                    continue
            raise AssertionError(f'{year}: page never became ready')

        open_profile(2025)
        expect(page.locator('#inspector')).to_contain_text('1,401,879')
        expect(page.locator('#inspector')).to_contain_text('年末全国人口')
        expect(page.locator('#inspector')).to_contain_text('140,489')
        expect(page.locator('#inspector')).to_contain_text('95,380')
        expect(page.locator('#inspector')).to_contain_text('99,665')
        expect(page.locator('#inspector')).to_contain_text('1,393,700')
        expect(page.locator('#inspector')).to_contain_text('184,413')
        expect(page.locator('#inspector')).to_contain_text('71,488')
        expect(page.locator('#inspector')).to_contain_text('454,685')
        expect(page.locator('#inspector')).to_contain_text('501,202')
        expect(page.locator('#inspector')).to_contain_text('39,262')
        expect(page.locator('#inspector')).to_contain_text('43,377')
        expect(page.locator('#inspector')).to_contain_text('67.89%')
        with page.expect_download(timeout=30000) as pending:
            page.locator('[data-export-china]').click()
        download = pending.value
        assert download.suggested_filename == 'orbis-china-official.csv', download.suggested_filename
        rows = list(csv.DictReader(io.StringIO(open(download.path(), encoding='utf-8-sig').read())))
        assert len(rows) == 48, len(rows)
        assert len(rows[0]) == 22, len(rows[0])
        latest = rows[-1]
        assert latest['year'] == '2025' and latest['gdp'] == '1401879'
        assert latest['perCapitaGdp'] == '99665' and latest['urbanizationRate'] == '67.89'
        assert latest['url'].startswith('https://www.stats.gov.cn/')
        expect(page.locator('#inspector')).to_contain_text('仅在 2024、2025 年')
        open_profile(1978)
        expect(page.locator('#inspector')).to_contain_text('3,678.7')
        expect(page.locator('#inspector')).not_to_contain_text('年末全国人口')
        assert not errors, errors[:3]
        browser.close()
        print('China profile shows official GDP and the published population years only.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
