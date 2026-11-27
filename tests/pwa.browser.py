# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Validate the web app manifest and install icons."""
import argparse
import json

from playwright.sync_api import sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page.goto(url, wait_until='domcontentloaded', timeout=60000)
        manifest_href = page.locator('link[rel="manifest"]').get_attribute('href')
        assert manifest_href, 'manifest link missing'
        manifest = page.request.get(page.evaluate('href => new URL(href, document.baseURI).href', manifest_href))
        assert manifest.ok, manifest.status
        data = json.loads(manifest.body())
        assert data['name'] and data['short_name']
        assert data['start_url'] == '/'
        assert data['display'] == 'standalone'
        assert data['background_color'] == '#f5f4eb'
        assert len(data['icons']) >= 3
        assert data.get('id') == '/'
        shortcuts = data.get('shortcuts') or []
        assert len(shortcuts) == 3, shortcuts
        assert {shortcut['url'] for shortcut in shortcuts} == {'/?mode=space', '/?mode=history', '/?mode=sources'}
        for shortcut in shortcuts:
            assert shortcut['name'] and shortcut['description'] and shortcut['icons']
        for icon in data['icons']:
            assert icon['sizes'] in ('192x192', '512x512'), icon
            response = page.request.get(page.evaluate('href => new URL(href, new URL(document.querySelector("link[rel=manifest]").href, document.baseURI)).href', icon['src']))
            assert response.ok, (icon['src'], response.status)
            assert response.headers.get('content-type', '').startswith('image/png')
            assert response.body()[:8] == b'\x89PNG\r\n\x1a\n'
        apple = page.locator('link[rel="apple-touch-icon"]').get_attribute('href')
        assert apple and page.request.get(page.evaluate('href => new URL(href, document.baseURI).href', apple)).ok
        browser.close()
        print('Manifest, icons and apple-touch-icon are valid.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
