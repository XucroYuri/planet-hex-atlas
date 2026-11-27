# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Measure first-paint performance and guard against payload regressions.

Budgets are regression guards derived from this project's measured baseline on
the Cloudflare Pages deployment, not universal speed targets.

uv run --with playwright python tests/performance.browser.py https://earth.xuyu.net/
"""
import argparse
import json
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

SCRIPT = """() => new Promise(resolve => {
  const out = { lcp: 0, cls: 0 };
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) out.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) out.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
  setTimeout(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const sum = (filter) => resources.filter(filter).reduce((total, entry) => total + (entry.transferSize || 0), 0);
    const byName = (suffix) => resources.find(entry => entry.name.endsWith(suffix));
    out.dcl = nav.domContentLoadedEventEnd;
    out.load = nav.loadEventEnd;
    out.ttfb = nav.responseStart;
    out.requests = resources.length;
    out.transfer = sum(() => true);
    out.js = sum(entry => entry.name.endsWith('.js'));
    out.data = sum(entry => entry.name.includes('/data/'));
    out.atlasStart = byName('/data/atlas.json')?.startTime ?? -1;
    out.appStart = byName('/js/app.js')?.startTime ?? -1;
    out.relief = resources.find(entry => /\/data\/relief[^/]*\.webp$/.test(entry.name))?.name.split('/').at(-1) ?? '';
    resolve(out);
  }, 1200);
})"""

BUDGETS = {
    'desktop': {'lcp': 3500, 'cls': 0.1, 'requests': 60, 'transfer': 1_300_000, 'js': 350_000},
    'mobile': {'lcp': 6500, 'cls': 0.1, 'requests': 60, 'transfer': 1_300_000, 'js': 350_000},
}


def measure(browser, url, profile):
    context = browser.new_context(viewport={'width': 1400, 'height': 900} if profile == 'desktop' else {'width': 390, 'height': 844})
    page = context.new_page()
    cdp = context.new_cdp_session(page)
    cdp.send('Network.enable')
    if profile == 'mobile':
        cdp.send('Network.emulateNetworkConditions', {
            'offline': False, 'latency': 150,
            'downloadThroughput': 1.6 * 1024 * 1024 / 8, 'uploadThroughput': 750 * 1024 / 8,
        })
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
    page.goto(url, wait_until='load', timeout=120_000)
    page.wait_for_function('document.querySelector("#workspace")?.dataset.ready === "true"', timeout=120_000)
    page.wait_for_timeout(1_200)
    result = page.evaluate(SCRIPT)
    context.close()
    return result


def main(url):
    failures = []
    report = {}
    local = urlparse(url).hostname in ('127.0.0.1', 'localhost')
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        for profile in ('desktop', 'mobile'):
            metrics = measure(browser, url, profile)
            report[profile] = metrics
            # Local servers do not compress, so only enforce payload budgets on the
            # deployed site. The preload ordering check applies everywhere.
            budget = {} if local else BUDGETS[profile]
            for key, limit in budget.items():
                if metrics[key] > limit:
                    failures.append(f'{profile}: {key}={metrics[key]:.1f} over budget {limit}')
            if metrics['atlasStart'] < 0 or metrics['appStart'] < 0 or metrics['atlasStart'] > metrics['appStart']:
                failures.append(f'{profile}: atlas.json preload did not start before app.js ({metrics["atlasStart"]:.0f} vs {metrics["appStart"]:.0f})')
            expected = 'relief-compact.webp' if profile == 'mobile' else 'relief.webp'
            if metrics['relief'] != expected:
                failures.append(f'{profile}: expected {expected}, loaded {metrics["relief"] or "nothing"}')
        browser.close()
    def shown(value):
        return round(value, 1) if isinstance(value, (int, float)) else value
    print(json.dumps({profile: {key: shown(value) for key, value in metrics.items()}
                      for profile, metrics in report.items()}, ensure_ascii=False))
    if failures:
        raise SystemExit('\n'.join(failures))
    print('Performance budgets passed (desktop and throttled mobile).' if not local
          else 'Local run: preload ordering checked; payload budgets apply to the deployed site.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
