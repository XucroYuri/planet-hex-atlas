# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.56,<2"]
# ///
"""Check social metadata, JSON-LD, robots.txt and sitemap.xml."""
import argparse
import json
import xml.etree.ElementTree as ElementTree

from playwright.sync_api import sync_playwright


def main(url):
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
        page.goto(url, wait_until='domcontentloaded', timeout=60000)
        meta = page.evaluate("""() => {
          const value = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
          const link = (selector) => document.querySelector(selector)?.getAttribute('href') || '';
          const ld = document.querySelector('script[type="application/ld+json"]')?.textContent || '';
          return {
            canonical: link('link[rel=canonical]'),
            ogType: value('meta[property="og:type"]'),
            ogTitle: value('meta[property="og:title"]'),
            ogDescription: value('meta[property="og:description"]'),
            ogImage: value('meta[property="og:image"]'),
            ogUrl: value('meta[property="og:url"]'),
            twitterCard: value('meta[name="twitter:card"]'),
            description: value('meta[name="description"]'),
            ld,
          };
        }""")
        assert meta['canonical'].startswith('https://'), meta['canonical']
        assert meta['ogType'] == 'website'
        assert 'Orbis Atlas' in meta['ogTitle']
        assert len(meta['ogDescription']) >= 20
        assert meta['ogImage'].endswith('/meta/social.jpg')
        assert meta['ogUrl'].startswith('https://')
        assert meta['twitterCard'] == 'summary_large_image'
        assert len(meta['description']) >= 20
        schema = json.loads(meta['ld'])
        assert schema['@type'] == 'WebApplication'
        assert schema['name'] and schema['url'].startswith('https://')

        image = page.request.get(meta['ogImage'])
        if not image.ok and '127.0.0.1' in url or not image.ok and 'localhost' in url:
            # Local servers do not own the public https URL; check the packaged path instead.
            image = page.request.get(url + 'meta/social.jpg')
        assert image.ok, image.status
        assert image.headers.get('content-type', '').startswith('image/')
        assert len(image.body()) > 10_000

        robots = page.request.get(url + 'robots.txt')
        assert robots.ok and 'Sitemap:' in robots.text()
        sitemap = page.request.get(url + 'sitemap.xml')
        assert sitemap.ok
        root = ElementTree.fromstring(sitemap.body())
        namespace = {'sitemap': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        locations = [node.text for node in root.findall('sitemap:url/sitemap:loc', namespace)]
        assert any(location.startswith('https://') for location in locations), locations
        browser.close()
        print('Social metadata, JSON-LD, robots.txt and sitemap.xml are valid.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    main(parser.parse_args().url.rstrip('/') + '/')
