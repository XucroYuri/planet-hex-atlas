# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Fail the first app.js request once and verify the page recovers via the boot retry."""
import argparse
import sys

from playwright.sync_api import sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        failed = []

        def fail_once(route):
            if not failed:
                failed.append(route.request.url)
                route.abort('connectionreset')
            else:
                route.continue_()

        page.route('**/js/app.js', fail_once)
        page.goto(url, wait_until='domcontentloaded', timeout=60000)
        # The inline guard reloads after 9 s; give the second boot enough time.
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=45000)
        assert failed, 'app.js was never failed'
        assert page.evaluate('document.readyState') == 'complete'
        context.close()
        browser.close()
        print('Boot retry recovered after one failed app.js request.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
