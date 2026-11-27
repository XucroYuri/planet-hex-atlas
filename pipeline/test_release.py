"""Exercise content-addressed releases without modifying the source tree."""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import package_site


def test():
    with tempfile.TemporaryDirectory() as temporary:
        root=Path(temporary)
        public=root/'source';public.mkdir()
        (public/'index.html').write_text('<head></head><a href="./" class="brand">home</a>')
        (public/'app.js').write_text('export const VERSION = 1;')
        (public/'sw.js').write_text('// service worker')
        (public/'data').mkdir()
        (public/'data'/'value.json').write_text('{"v":1}')
        with patch.object(package_site,'PUBLIC',public):
            releases=root/'releases'
            a=package_site.package(releases)
            before=(a/'r'/a.name/'app.js').read_text()
            assert package_site.package(releases)==a
            headers=(a/'_headers').read_text()
            assert "Content-Security-Policy: default-src 'self'" in headers
            assert "frame-ancestors 'none'" in headers
            assert 'Referrer-Policy: strict-origin-when-cross-origin' in headers
            assert 'Permissions-Policy:' in headers
            assert 'Strict-Transport-Security: max-age=' in headers
            (public/'app.js').write_text('export const VERSION = 2;')
            assert (a/'r'/a.name/'app.js').read_text()==before, 'release was hard-linked to mutable sources'
            b=package_site.package(releases)
            assert a != b and (b/'r'/a.name/'app.js').read_text()==before
            manifest=json.loads((b/'release.json').read_text())
            assert manifest['previous']==a.name
            assert f'<base href="/r/{b.name}/">' in (b/'index.html').read_text()
            retained=(b/'r'/a.name/'index.html')
            assert retained.is_file()
            assert retained.read_bytes()==(a/'index.html').read_bytes()
            assert f'<base href="/r/{a.name}/">' in retained.read_text()
            assert '/data/* /r/' in (b/'_redirects').read_text()
            assert '/sw.js' not in (b/'_redirects').read_text()
            assert (b/'sw.js').is_file()
            assert 'immutable' in (b/'_headers').read_text()
            print('Release isolation, previous-version retention, URL aliases and cache policy passed.')


if __name__=='__main__':test()
