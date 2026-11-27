"""Build a dated heliocentric ephemeris for planets and civilian exploration missions."""

import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

END = 2026
NASA = 'https://science.nasa.gov/mission/'
BODIES = [
    ('mercury', '199', '水星', 'Mercury', 1957, 'planet', 'https://science.nasa.gov/mercury/'),
    ('venus', '299', '金星', 'Venus', 1957, 'planet', 'https://science.nasa.gov/venus/'),
    ('earth', '399', '地球', 'Earth', 1957, 'planet', 'https://science.nasa.gov/earth/'),
    ('mars', '499', '火星', 'Mars', 1957, 'planet', 'https://science.nasa.gov/mars/'),
    ('jupiter', '599', '木星', 'Jupiter', 1957, 'planet', 'https://science.nasa.gov/jupiter/'),
    ('saturn', '699', '土星', 'Saturn', 1957, 'planet', 'https://science.nasa.gov/saturn/'),
    ('uranus', '799', '天王星', 'Uranus', 1957, 'planet', 'https://science.nasa.gov/uranus/'),
    ('neptune', '899', '海王星', 'Neptune', 1957, 'planet', 'https://science.nasa.gov/neptune/'),
    ('voyager1', '-31', '旅行者 1 号', 'Voyager 1', 1977, 'probe', NASA+'voyager/voyager-1/'),
    ('voyager2', '-32', '旅行者 2 号', 'Voyager 2', 1977, 'probe', NASA+'voyager/voyager-2/'),
    ('pioneer10', '-23', '先驱者 10 号', 'Pioneer 10', 1972, 'probe', NASA+'pioneer-10/'),
    ('pioneer11', '-24', '先驱者 11 号', 'Pioneer 11', 1973, 'probe', NASA+'pioneer-11/'),
    ('newhorizons', '-98', '新视野号', 'New Horizons', 2006, 'probe', NASA+'new-horizons/'),
]


def request_body(code, start, end, cache):
    args = dict(format='json', COMMAND=f"'{code}'", CENTER="'500@10'", MAKE_EPHEM="'YES'", EPHEM_TYPE="'VECTORS'",
                START_TIME=f"'{start}-11-27'", STOP_TIME=f"'{end}-11-28'", STEP_SIZE="'1 y'",
                OUT_UNITS="'AU-D'", VEC_TABLE="'2'", REF_PLANE="'ECLIPTIC'", CSV_FORMAT="'YES'", VEC_LABELS="'NO'", OBJ_DATA="'NO'")
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(args)
    path = cache/f'{code}-{start}-{end}.json'
    if path.exists():
        raw = path.read_bytes()
    else:
        request = urllib.request.Request(url, headers={'User-Agent':'Orbis Atlas ephemeris/1.0'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=50) as response:
                    raw = response.read()
                break
            except urllib.error.HTTPError as error:
                if error.code not in (429, 502, 503, 504) or attempt == 2:
                    raise
                time.sleep(2 ** (attempt + 1))
        payload = json.loads(raw)
        if '$$SOE' in payload.get('result',''):
            path.write_bytes(raw)
    return json.loads(raw), url, hashlib.sha256(raw).hexdigest()


def series(body, cache):
    key, code, zh, en, start, kind, source = body
    end = END
    data, url, digest = request_body(code,start,end,cache)
    text = data.get('result','')
    if '$$SOE' not in text:
        reply = data.get('error', '') + '\n' + text
        # Some retired probes have a finite archived trajectory. Stop at its last complete Nov 27 epoch.
        match = re.search(r'after A\.D\.\s*(\d{4}-[A-Za-z]{3}-\d{2})', reply, re.IGNORECASE)
        if not match:
            raise ValueError(f'{key}: {reply[-450:]}')
        final = datetime.strptime(match[1], '%Y-%b-%d')
        end = final.year - int((final.month, final.day) < (11,28))
        data, url, digest = request_body(code,start,end,cache)
        text = data.get('result','')
    if '$$SOE' not in text:
        raise ValueError(f'{key} missing ephemeris: {text[-300:]}')
    records = []
    for row in csv.reader(io.StringIO(text.split('$$SOE',1)[1].split('$$EOE',1)[0].strip())):
        epoch = datetime.strptime(row[1].strip()[5:16], '%Y-%b-%d')
        if epoch.month != 11 or epoch.day != 27:
            raise ValueError(f'Nonmatching epoch for {code}: {row[1]}')
        records.append([epoch.year, *(round(float(x),9) for x in row[2:5])])
    print(f'{en}: {len(records)} positions, {records[0][0]}–{records[-1][0]}',flush=True)
    return dict(id=key,horizons=code,zh=zh,en=en,kind=kind,missionUrl=source,source=url,sha256=digest,positions=records)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,default=Path('.cache/horizons'))
    parser.add_argument('--output',type=Path,default=Path('web/data/space/ephemeris.json'))
    args=parser.parse_args()
    args.cache.mkdir(exist_ok=True,parents=True)
    objects = [series(body, args.cache) for body in BODIES]
    archive=dict(source='NASA/JPL Horizons', frame='Heliocentric ecliptic J2000; geometric Cartesian AU',
                 epoch='November 27, 00:00 TDB', issue='2026-11-27',auKm=149597870.7,objects=objects)
    args.output.parent.mkdir(exist_ok=True,parents=True)
    args.output.write_text(json.dumps(archive,ensure_ascii=False,separators=(',',':'))+'\n')


if __name__=='__main__':
    main()
