# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check the quantified data-coverage overview on the wishlist tab."""
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
        page.get_by_text('数据愿望清单', exact=True).first.click()
        summary = page.locator('[data-coverage-summary]')
        expect(summary).to_contain_text('覆盖概览', timeout=30000)
        expect(summary).to_contain_text('217', timeout=30000)
        expect(summary).to_contain_text('预期寿命')
        tables = summary.locator('table')
        assert tables.count() == 2, tables.count()
        annual_rows = summary.locator('table').nth(0).locator('tbody tr')
        history_rows = summary.locator('table').nth(1).locator('tbody tr')
        assert annual_rows.count() == 29, annual_rows.count()
        assert history_rows.count() >= 10, history_rows.count()
        expect(summary).to_contain_text('年龄')
        expect(summary).to_contain_text('覆盖')
        annual_links = summary.locator('table').nth(0).locator('tbody a')
        history_links = summary.locator('table').nth(1).locator('tbody a')
        assert annual_links.count() == 29, annual_links.count()
        assert history_links.count() >= 10, history_links.count()
        expect(annual_links.first).to_contain_text('SP.')
        expect(summary).to_contain_text('2026-11-11')
        with page.expect_download(timeout=30000) as pending:
            summary.locator('[data-export-coverage]').click()
        download = pending.value
        assert download.suggested_filename == 'orbis-coverage.csv'
        text = open(download.path(), encoding='utf-8-sig').read().strip().splitlines()
        assert text[0] == 'section,metric,unit,code,updated,count,total,coverage', text[0]
        assert len(text) == 1 + 29 + 10, len(text)
        assert text[1].startswith('annual,')
        assert not errors, errors[:3]
        annual_count, history_count = annual_rows.count(), history_rows.count()
        browser.close()
        print(f'Coverage overview rendered {annual_count} annual rows and {history_count} history rows.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
