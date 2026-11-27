# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the standards dialog shows the machine-checked status and its blockers."""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 950})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url + '#region=CHN&year=2025', wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('#inspector button[data-action="standards"]').first.click()
        status = page.locator('[data-standard-status]')
        expect(status).to_be_visible(timeout=20000)
        expect(status).to_contain_text('标准核查状态')
        expect(status).to_contain_text('3 项待解决', timeout=20000)
        blockers = status.locator('[data-blocker]')
        expect(blockers).to_have_count(3)
        expect(status).to_contain_text('MAP_SOURCE')
        expect(status).to_contain_text('Natural Earth')
        assert status.locator('.status-pill').count() == 3
        body = page.locator('#overlay-body').inner_text()
        assert '尚未取得审图号' in body
        assert '本站不会声称符合中国标准地图' in body
        assert not errors, errors[:3]
        browser.close()
        print('Standards dialog lists 3 unresolved map blockers without claiming compliance.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
