# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Download and inspect the open-data ZIP from the packaged site."""
import argparse
import io
import json
import zipfile

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page.goto(url, wait_until='networkidle', timeout=60000)
        expect(page.locator('#workspace')).to_have_attribute('data-ready', 'true', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.get_by_text('数据愿望清单', exact=True).first.click()
        link = page.locator('a[href$="orbis-open-data.zip"]')
        expect(link).to_be_visible(timeout=20000)
        href = link.get_attribute('href')
        response = page.request.get(page.evaluate('href => new URL(href, document.baseURI).href', href))
        assert response.ok, response.status
        assert response.headers.get('content-type', '').startswith('application/zip'), response.headers
        payload = response.body()
        assert len(payload) > 1_000_000, len(payload)
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
            assert manifest['counts']['annualYears'] == 66
            assert 'china-population-official.json' in archive.namelist()
            official = json.loads(archive.read('china-official.json'))
            assert official['series']['2025']['energyConsumption'] == 61.7
            assert official['series']['2025']['cleanEnergyShare'] == 30.4
        browser.close()
        print(f'Open data bundle downloaded and verified: {len(payload)} bytes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
