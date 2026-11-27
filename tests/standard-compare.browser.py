# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2", "pillow>=10"]
# ///
"""Load a local standard-map image into the standards dialog without uploading it."""
import argparse
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright


def fixture(directory):
    image = Image.new('RGB', (640, 360), '#e8e2ca')
    draw = ImageDraw.Draw(image)
    draw.rectangle((20, 20, 620, 340), outline='#294f60', width=4)
    draw.text((40, 40), 'STANDARD MAP PREVIEW', fill='#294f60')
    path = Path(directory) / 'standard-map.png'
    image.save(path)
    return path


def main(url):
    with tempfile.TemporaryDirectory() as directory, sync_playwright() as p:
        source = fixture(directory)
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 950})
        writes = []
        page.on('request', lambda request: writes.append(request.method) if request.method not in ('GET', 'HEAD', 'OPTIONS') else None)
        page.goto(url + '#region=CHN&year=2025', wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('#inspector button[data-action="standards"]').first.click()
        page.wait_for_timeout(500)
        page.locator('[data-standard-compare] input[type=file]').set_input_files(source)
        page.locator('[name=approval-number]').fill('GS(2024)1234号')
        figure = page.locator('[data-standard-compare] figure')
        expect(figure).to_be_visible(timeout=10000)
        image = figure.locator('img')
        expect(image).to_be_visible()
        assert page.evaluate('document.querySelector("[data-standard-compare] img").naturalWidth') == 640
        expect(page.locator('[data-standard-compare] [data-caption]')).to_contain_text('GS(2024)1234号')
        expect(page.locator('[data-standard-compare] [data-caption]')).to_contain_text('仅本机预览')
        assert not writes, writes
        browser.close()
        print('Standard-map comparison previewed a local image and never uploaded it.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
