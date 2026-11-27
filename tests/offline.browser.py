# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Verify the service worker serves the cached shell when the network is offline."""
import argparse

from playwright.sync_api import expect, sync_playwright


def ready(page):
    page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=90000)


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        page.goto(url, wait_until='networkidle', timeout=60000)
        ready(page)
        page.evaluate('navigator.serviceWorker.ready')
        page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=30000)
        # Second online load lets the worker cache the shell and immutable assets.
        page.reload(wait_until='networkidle')
        ready(page)
        page.wait_for_timeout(1000)
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        ready(page)
        expect(page.locator('#legend')).to_be_visible()
        context.set_offline(False)
        assert not errors, errors[:3]
        browser.close()
        print('Offline reload served the cached atlas shell and map.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
