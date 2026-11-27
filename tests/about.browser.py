# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check the sources dialog exposes the release snapshot and version links."""
import argparse
import re

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(locale='zh-CN', viewport={'width': 1280, 'height': 950},
                                      permissions=['clipboard-read', 'clipboard-write'])
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('#show-sources').click()
        build = page.locator('[data-build]')
        expect(build).to_contain_text('当前快照', timeout=30000)
        text = build.inner_text()
        assert re.search(r'[0-9a-f]{16}', text), text
        expect(build).to_contain_text('构建于')
        expect(page.locator('.about-build')).to_contain_text('数据规模')
        changelog = page.locator('[data-changelog]')
        expect(changelog).to_contain_text('数据更新', timeout=20000)
        expect(changelog).to_contain_text('2026-11-28')
        expect(changelog.locator('li')).to_have_count(6)
        expect(page.locator('.about-build')).to_contain_text('无第三方分析')
        repo = page.locator('.about-build a[href="https://github.com/XucroYuri/planet-hex-atlas"]')
        expect(repo).to_have_count(1)
        citation = page.locator('[data-citation]')
        expect(citation).to_be_visible(timeout=20000)
        expect(citation).to_contain_text('寰宇图志')
        page.locator('[data-copy-citation]').click()
        expect(page.locator('[data-citation-status]')).to_contain_text('引用已复制')
        copied = page.evaluate('navigator.clipboard.readText()')
        assert 'https://earth.xuyu.net/' in copied, copied
        assert re.search(r'[0-9a-f]{16}', copied), copied
        assert not errors, errors[:3]
        browser.close()
        print('About section shows the release snapshot, data scale and repository links.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
