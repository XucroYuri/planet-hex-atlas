# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check adaptive classification, legend disclosure and palette differentiation per lens."""
import argparse
import sys

from playwright.sync_api import expect, sync_playwright

LENSES = [
    ('income', '自然断点', 5), ('life', '等距', 5), ('growth', '对称发散', 7),
    ('forest', '百分比', 5), ('industry', '百分比', 5), ('co2', '自然断点', 5),
    ('gridPop', '分位数', 5), ('density', '分位数', 5), ('height', '固定分级', 7),
]


def chip_colors(page):
    return page.eval_on_selector_all(
        '#legend .legend-class:not(.legend-missing) i',
        'els => els.map(el => getComputedStyle(el).backgroundColor)',
    )


def distance(a, b):
    nums = lambda s: [int(x) for x in s[s.index('(') + 1:s.index(')')].split(',')[:3]]
    return sum(abs(x - y) for x, y in zip(nums(a), nums(b)))


def main(url):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        expect(page.locator('#workspace')).to_have_attribute('data-ready', 'true', timeout=40000)
        signature = {}
        for lens, method, minimum in LENSES:
            page.locator('#lens-button').click()
            page.locator(f'[data-lens="{lens}"]').click()
            page.wait_for_timeout(700)
            legend = page.locator('#legend')
            text = legend.inner_text()
            assert method in text, f'{lens}: method missing from legend: {text[:120]}'
            rows = legend.locator('.legend-class:not(.legend-missing)')
            assert rows.count() >= minimum, f'{lens}: only {rows.count()} classes'
            colors = chip_colors(page)
            assert len(colors) == rows.count()
            assert len(set(colors)) == len(colors) or lens in ('height',), f'{lens}: duplicate class colours'
            signature[lens] = colors[0]
            page.screenshot(path=f'/tmp/orbis-viz-{lens}.png')
        # Semantically different families must not look identical on screen.
        family_pairs = [('income', 'life'), ('growth', 'income'), ('density', 'height'), ('forest', 'co2')]
        for a, b in family_pairs:
            assert distance(signature[a], signature[b]) > 20, f'{a} and {b} palettes are too similar'
        # Missing values are explicitly disclosed where the source has gaps.
        page.locator('#lens-button').click()
        page.locator('[data-lens="income"]').click()
        page.wait_for_timeout(500)
        assert page.locator('#legend .legend-missing').count() == 1
        assert not errors, errors
        browser.close()
        print('Adaptive classification, legend disclosure and palette differentiation passed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
