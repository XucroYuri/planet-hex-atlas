# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Search must find places and also switch to indicators."""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('#launch-search').click()
        input = page.locator('#overlay-body input')
        expect(input).to_be_focused()
        input.fill('预期寿命')
        metric = page.locator('#overlay-body [data-action="search-lens"]')
        expect(metric).to_have_count(1, timeout=20000)
        expect(metric).to_contain_text('预期寿命')
        expect(metric).to_contain_text('指标')
        metric.click()
        expect(page.locator('#overlay')).not_to_be_visible()
        expect(page.locator('#lens-label')).to_contain_text('预期寿命')
        expect(page.locator('#legend')).to_be_visible()
        page.locator('#launch-search').click()
        page.locator('#overlay-body input').fill('东京')
        city = page.locator('#overlay-body [data-action="search-city"]')
        expect(city.first).to_be_visible(timeout=20000)
        page.keyboard.press('Escape')
        assert not errors, errors[:3]
        browser.close()
        print('Search finds both indicators and cities.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
