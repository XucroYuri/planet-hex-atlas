# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check historical series rendering and the model-versus-baseline verdict."""
import argparse

from playwright.sync_api import expect, sync_playwright


def pick(page, region, metric):
    selects = page.locator('#overlay-body select')
    region_index = metric_index = None
    for index in range(selects.count()):
        values = selects.nth(index).locator('option').evaluate_all('els => els.map(el => el.value)')
        if region in values:
            region_index = index
        if metric in values:
            metric_index = index
    assert region_index is not None and metric_index is not None, (region, metric)
    selects.nth(region_index).select_option(region)
    selects.nth(metric_index).select_option(metric)
    page.wait_for_timeout(2200)


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1400, 'height': 1000})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=60000)
        page.locator('[data-view="history"]').click()
        page.wait_for_timeout(1000)
        page.get_by_text('长时段历史', exact=True).first.click()
        page.wait_for_timeout(2200)
        pick(page, 'CHN', 'population')
        verdict = page.locator('#overlay-body .hl-verdict')
        expect(verdict).to_be_visible(timeout=20000)
        expect(verdict).to_contain_text('基线')
        expect(verdict).to_contain_text('%')
        pick(page, 'CHN', 'officialPopulation')
        expect(page.locator('#overlay-body')).to_contain_text('中国官方年末人口', timeout=20000)
        expect(page.locator('#overlay-body')).to_contain_text('62 个发布值')
        pick(page, 'CHN', 'officialGdp')
        expect(page.locator('#overlay-body')).to_contain_text('中国官方 GDP（人民币）')
        expect(page.locator('#overlay-body')).to_contain_text('48 个发布值')
        pick(page, 'WORLD', 'lifeExpectancy')
        expect(page.locator('#overlay-body .hl-verdict')).to_be_visible(timeout=20000)
        expect(page.locator('#overlay-body .hl-backtest-result')).to_be_visible()
        assert not errors, errors[:3]
        browser.close()
        print('History series, holdout stats and model verdict rendered.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
