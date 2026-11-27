# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the map PNG export downloads a valid image with a stable name."""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.wait_for_timeout(800)
        with page.expect_download(timeout=30000) as pending:
            page.locator('#export-map').click()
        download = pending.value
        path = Path(download.path())
        data = path.read_bytes()
        assert download.suggested_filename == 'orbis-map-2023-terrain.png', download.suggested_filename
        assert data[:8] == b'\x89PNG\r\n\x1a\n', data[:8]
        assert len(data) > 50_000, len(data)
        assert not errors, errors[:3]
        browser.close()
        print(f'Map export downloaded a valid {len(data)}-byte PNG.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
