# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Exercise the shipped UI on a local server or on a Cloudflare deployment."""

import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def check(url, screenshots):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(viewport={'width': 1420, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.url.startswith(url) and r.status >= 400 else None)
        page.goto(url, wait_until='networkidle', timeout=60000)
        expect(page.locator('#workspace')).to_have_attribute('data-ready', 'true', timeout=30000)
        expect(page.locator('#inspector')).to_contain_text('288,122')
        expect(page.locator('#projection')).to_have_text('展图')
        if screenshots:
            screenshots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshots / 'globe.png')
        canvas = page.locator('#atlas-map')
        box = canvas.bounding_box()
        assert box
        x, y = box['x'] + box['width'] * .5, box['y'] + box['height'] * .5
        before = page.locator('#bearing').inner_text()
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x+100, y, steps=5)
        page.mouse.up()
        expect(page.locator('#bearing')).not_to_have_text(before)
        page.get_by_role('button', name='切换为平面地图').click()
        expect(page.locator('#projection')).to_have_text('球面')
        page.locator('#lens-button').click()
        page.locator('[data-lens="income"]').click()
        expect(page.locator('#legend')).to_contain_text('人均 GDP')
        page.locator('#year').fill('2010')
        expect(page.locator('#legend')).to_contain_text('2010')
        page.get_by_role('button', name='打开数据台', exact=True).click()
        expect(page.locator('.oe-scatter')).to_be_visible()
        page.get_by_label('横轴指标').select_option('income')
        page.get_by_label('纵轴指标').select_option('life')
        page.get_by_label('地区一', exact=True).select_option('JPN')
        page.get_by_label('地区二', exact=True).select_option('CHN')
        expect(page.locator('.oe-scatter .oe-readout')).to_contain_text('日本')
        with page.expect_download() as downloaded:
            page.get_by_role('button',name='本年 CSV').click()
        assert downloaded.value.suggested_filename.endswith('.csv')
        page.get_by_role('button',name='在地图定位').click()
        expect(page.locator('#inspector h1')).to_have_text('日本')
        page.get_by_role('button', name='搜索城市或地区').click()
        page.locator('.search-field input').fill('上海')
        page.locator('.search-results button').first.click()
        expect(page.locator('#inspector h1')).to_have_text('上海')
        expect(page.locator('#scale-indicator')).to_contain_text('R4', timeout=20000)
        expect(page.locator('#inspector')).to_contain_text('文明城区', timeout=20000)
        page.locator('#lens-button').click()
        page.locator('[data-lens="terrain"]').click()
        if screenshots:
            page.screenshot(path=screenshots / 'shanghai.png')
        page.get_by_role('button',name='复制当前地图链接').click()
        link = page.evaluate('navigator.clipboard.readText()')
        assert 'city=1796236' in link and 'year=2010' in link
        page.goto(link, wait_until='networkidle')
        expect(page.locator('#inspector h1')).to_have_text('上海',timeout=20000)
        page.get_by_role('button',name='查看城市所在格').click()
        expect(page.locator('#inspector')).to_contain_text('格网编号',timeout=10000)
        page.get_by_role('button',name='搜索城市或地区').click()
        page.locator('.search-field input').fill('泰姬陵')
        page.get_by_role('button',name='泰姬陵').first.click()
        expect(page.locator('#inspector')).to_contain_text('1983')
        page.locator('#year').fill('2023')
        page.get_by_role('button',name='百年推演',exact=True).click()
        page.locator('.oas-origin-controls select[name=country]').select_option('CHN')
        adopt = page.get_by_role('button',name='采用起点')
        if adopt.is_enabled():
            adopt.click()
        page.get_by_role('button',name='推演至百年').click()
        expect(page.locator('[data-role=progress]')).to_contain_text('100')
        with page.expect_download() as saved:
            page.get_by_role('button',name='导出 JSON').click()
        assert saved.value.suggested_filename.endswith('.json')
        page.get_by_role('button',name='进入地方议事').click()
        expect(page.get_by_role('heading',name='目标对照')).to_be_visible()
        page.locator('select[name=policy-a]').select_option('services')
        page.locator('select[name=policy-b]').select_option('hold')
        page.get_by_role('button',name='推进 1 年').click()
        page.locator('select[name=policy-a]').select_option('hold')
        for _ in range(4):
            page.get_by_role('button',name='推进 1 年').click()
        page.locator('select[name=role]').select_option('workers')
        expect(page.locator('#overlay-body')).to_contain_text('2028')
        page.get_by_text('规则与复演', exact=True).click()
        page.get_by_role('button',name='按记录复演').click()
        if screenshots:
            page.locator('#overlay').screenshot(path=screenshots / 'council.png')
        page.get_by_role('button',name='关闭弹窗').click()
        page.goto(url+'#projection=flat&view=-16.6,179.95,77&cell=-16.6,179.95,4',wait_until='networkidle')
        expect(page.locator('#inspector')).to_contain_text('格网编号',timeout=20000)
        page.goto(url+'#projection=flat&view=-89.5,12,77&cell=-89.5,12,4',wait_until='networkidle')
        expect(page.locator('#inspector')).to_contain_text('南极洲',timeout=20000)
        for width,height in [(375,812),(812,375),(768,1024)]:
            page.set_viewport_size({'width':width,'height':height})
            page.emulate_media(reduced_motion='reduce')
            page.goto(url,wait_until='networkidle')
            expect(page.locator('#workspace')).to_have_attribute('data-ready','true',timeout=20000)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}px'
            if screenshots and width == 375:
                page.screenshot(path=screenshots / 'phone.png')
            page.get_by_role('button',name='数据台',exact=True).click()
            expect(page.locator('.oe-scatter')).to_be_visible()
            assert page.locator('#overlay').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), f'Explorer overflow at {width}px'
            page.keyboard.press('Escape')
            expect(page.locator('#overlay')).not_to_be_visible()
        page.set_viewport_size({'width':375,'height':812})
        for mode, title in [('council','地方议事'), ('scenario','百年推演')]:
            page.goto(url+f'#mode={mode}&region=JPN&year=2000', wait_until='networkidle')
            expect(page.locator('#overlay-title')).to_have_text(title, timeout=15000)
            expect(page.locator('#overlay')).to_be_visible()
            assert page.locator('#overlay').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), f'{mode} overflow at 375px'
            if mode == 'council':
                expect(page.locator('select[name=region]')).to_have_value('JPN')
                expect(page.locator('select[name=year]')).to_have_value('2000')
                page.get_by_role('button',name='推进 1 年').click()
            page.get_by_role('button',name='关闭弹窗').click()
        browser.close()
        assert not errors, errors
        print('Passed globe rotation, projection, temporal lens, linked explorer, CSV, city/cell/wonder, sharing, 100 years, council replay, pole, date line and three responsive sizes.')


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('url')
    args.add_argument('--screenshots', type=Path)
    options = args.parse_args()
    check(options.url.rstrip('/')+'/', options.screenshots)
