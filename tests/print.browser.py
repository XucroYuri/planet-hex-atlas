# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the print stylesheet hides chrome but keeps the map, legend and profile."""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900})
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.emulate_media(media='print')
        expect(page.locator('.topbar')).to_be_hidden()
        expect(page.locator('.timebar')).to_be_hidden()
        expect(page.locator('.map-actions')).to_be_hidden()
        expect(page.locator('#atlas-map')).to_be_visible()
        expect(page.locator('#legend')).to_be_visible()
        expect(page.locator('#inspector')).to_be_visible()
        pdf = page.pdf(format='A4', landscape=True, print_background=True)
        assert len(pdf) > 2000, len(pdf)
        assert pdf[:5] == b'%PDF-', pdf[:5]
        browser.close()
        print(f'Print layout keeps the map, legend and profile; PDF is {len(pdf)} bytes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
