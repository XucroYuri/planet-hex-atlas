"""Package one immutable static release, retaining the immediately preceding release for open tabs."""

import argparse
import base64
import hashlib
import html
import re
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web'
# Bump when packaging rules change so that identical assets still get a new snapshot.
PACKAGING_VERSION = 4


def link_or_copy(source, target):
    # Previous releases are immutable. Their artifacts may be hard-linked to one another.
    try:
        os.link(source, target)
    except OSError:
        shutil.copyfile(source, target)


def package(destination):
    destination.mkdir(exist_ok=True, parents=True)
    files = sorted(path for path in PUBLIC.rglob('*') if path.is_file())
    entries = {path.relative_to(PUBLIC).as_posix():hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    digest = hashlib.sha256(json.dumps({'version':PACKAGING_VERSION,'assets':entries},sort_keys=True).encode()).hexdigest()[:16]
    final = destination / digest
    if (final/'release.json').exists():
        return final
    work = Path(tempfile.mkdtemp(prefix='.building-',dir=destination))
    subpath = f'/r/{digest}/'
    assets = work/'r'/digest
    assets.mkdir(parents=True)
    for path in files:
        if path.name == 'index.html' and path.parent == PUBLIC:
            continue
        target = assets/path.relative_to(PUBLIC)
        target.parent.mkdir(exist_ok=True,parents=True)
        shutil.copyfile(path,target)
    previous = sorted((p for p in destination.iterdir() if p != final and (p/'release.json').is_file()),key=lambda p:p.stat().st_mtime,reverse=True)
    previous_id = None
    if previous:
        prior = previous[0]
        previous_id = json.loads((prior/'release.json').read_text())['snapshot']
        if previous_id != digest and (prior/'r'/previous_id).is_dir():
            shutil.copytree(prior/'r'/previous_id,work/'r'/previous_id,copy_function=link_or_copy)
            # The snapshot root was served from the release root, not from r/<id>/,
            # so copy it in explicitly to keep /r/<previous>/ reachable for rollback.
            if (prior/'index.html').is_file():
                shutil.copyfile(prior/'index.html',work/'r'/previous_id/'index.html')
    page = (PUBLIC/'index.html').read_text()
    page = page.replace('<head>',f'<head>\n  <base href="{html.escape(subpath)}">',1)
    page = page.replace('href="./" class="brand"','href="/" class="brand"')
    (work/'index.html').write_text(page)
    if (PUBLIC/'sw.js').is_file():
        shutil.copyfile(PUBLIC/'sw.js',work/'sw.js')
    (work/'404.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Orbis Atlas · 404</title><p>Resource unavailable. <a href="/">Open the current atlas</a>.</p></html>')
    inline_scripts = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>(.*?)</script>', page, re.S)
    script_hashes = ' '.join(f"'sha256-{base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()}'" for script in inline_scripts)
    csp = "default-src 'self'; script-src 'self'"
    if script_hashes:
        csp += f' {script_hashes}'
    csp += ("; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; "
            "connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; "
            "base-uri 'self'; form-action 'self' https://github.com; frame-ancestors 'none'")
    security = ('/*\n'
                '  X-Content-Type-Options: nosniff\n'
                '  X-Frame-Options: DENY\n'
                '  Referrer-Policy: strict-origin-when-cross-origin\n'
                '  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()\n'
                f'  Content-Security-Policy: {csp}\n')
    (work/'_headers').write_text('/\n  Cache-Control: public, max-age=0, must-revalidate\n/release.json\n  Cache-Control: public, max-age=0, must-revalidate\n/r/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n' + security)
    aliases=[]
    for child in sorted(PUBLIC.iterdir()):
        # Service-worker scripts must be served directly, never through a redirect.
        if child.name == 'sw.js': continue
        if child.is_dir(): aliases.append(f'/{child.name}/* {subpath}{child.name}/:splat 302')
        elif child.name != 'index.html': aliases.append(f'/{child.name} {subpath}{child.name} 302')
    (work/'_redirects').write_text('\n'.join(aliases)+'\n')
    asset_count=sum(p.is_file() for p in work.rglob('*'))+1
    largest=max((p.stat().st_size,p.name) for p in work.rglob('*') if p.is_file())
    if asset_count>20000 or largest[0]>25*1024**2:
        raise ValueError(f'Pages Free packaging limit exceeded: {asset_count} files, largest {largest}')
    manifest={'snapshot':digest,'previous':previous_id,'builtAt':datetime.now(timezone.utc).isoformat(timespec='seconds'),
              'assets':len(entries),'deployFiles':asset_count,
              'publicBytes':sum(p.stat().st_size for p in files),'maxFileBytes':largest[0],
              'entry':'/','assetBase':subpath,'sha256':entries}
    manifest['sha256']['index.html']=hashlib.sha256((work/'index.html').read_bytes()).hexdigest()
    (work/'release.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n')
    # Publish only a complete stage. The original source tree is not hard-linked to deployed bytes.
    work.rename(final)
    return final


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--releases',type=Path,default=ROOT/'.releases')
    print(package(parser.parse_args().releases))
