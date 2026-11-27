# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Audit production security headers and check CSP causes no runtime violations.

Strict CSP blocks Playwright's string-eval helpers and script injection, so this
test only uses locators/expect and console events. Full interaction suites run
against the local server (no CSP) or cover production paths that avoid eval.
"""
import argparse

from playwright.sync_api import expect, sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        response = page.request.get(url)
        headers = {key.lower(): value for key, value in response.headers.items()}
        csp = headers.get('content-security-policy')
        if not csp:
            print('No Content-Security-Policy header (local development server); skipped.')
            browser.close()
            return
        assert "default-src 'self'" in csp and "frame-ancestors 'none'" in csp, csp
        assert "script-src 'self'" in csp and 'sha256-' in csp, csp
        assert 'unsafe-eval' not in csp and 'unsafe-inline' not in csp.split('style-src')[0], csp
        assert headers.get('x-frame-options') == 'DENY'
        assert headers.get('referrer-policy') == 'strict-origin-when-cross-origin'
        assert 'geolocation=()' in headers.get('permissions-policy', '')
        assert headers.get('x-content-type-options') == 'nosniff'

        violations = []
        page.on('console', lambda message: violations.append(message.text)
                if 'Content Security Policy' in message.text or 'Refused to' in message.text else None)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        expect(page.locator('#workspace')).to_have_attribute('data-ready', 'true', timeout=60000)
        page.locator('#launch-search').click()
        page.locator('#overlay-body input').fill('预期寿命')
        expect(page.locator('#overlay-body [data-action="search-lens"]').first).to_be_visible(timeout=20000)
        page.keyboard.press('Escape')
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(1200)
        page.keyboard.press('Escape')
        assert not violations, violations[:5]
        assert not errors, errors[:5]
        browser.close()
        print('Production CSP, frame, referrer and permissions headers are enforced without violations.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
