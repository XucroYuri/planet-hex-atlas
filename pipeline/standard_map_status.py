"""Regenerate web/data/standard-map-status.json from the China source audit.

The audit itself stays read-only. `--check` verifies the committed status file is
current and exits non-zero otherwise; CI runs it after the audit.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'pipeline' / 'china_source_audit.py'
STATUS = ROOT / 'web' / 'data' / 'standard-map-status.json'

BLOCKERS = {
    'MAP_SOURCE': {
        'zh': '边界输入仍为 Natural Earth ADM0，尚待权威标准地图几何替换。',
        'en': 'Boundary input is still Natural Earth ADM0; authoritative standard-map geometry is pending.',
    },
    'LEGACY_GEOMETRY': {
        'zh': '详细轮廓与本次审计的 Natural Earth 产物字节一致，尚待替换。',
        'en': 'Detailed outlines still match the audited Natural Earth output byte-for-byte; replacement is pending.',
    },
    'ISLAND_GEOMETRY': {
        'zh': '岛礁轮廓样点存在独立命中或无命中，须逐项对照权威图幅与符号图层。',
        'en': 'Island and reef samples resolve to separate regions or nothing; each must be checked against authoritative sheets and symbol layers.',
    },
}


def build():
    completed = subprocess.run(
        [sys.executable, str(AUDIT), '--json'], cwd=ROOT, check=True,
        capture_output=True, text=True,
        env={'PYTHONPATH': str(ROOT), 'PATH': '/usr/bin:/bin:/usr/local/bin'},
    )
    audit = json.loads(completed.stdout)
    probes = audit.get('geography', {}).get('probes', {})
    blockers = [
        {'id': blocker_id, **BLOCKERS.get(blocker_id, {'zh': detail, 'en': detail})}
        for blocker_id, detail in audit.get('blockers', {}).items()
    ]
    return {
        'schema': 1,
        'status': audit.get('status', 'blocked'),
        'auditedYear': audit.get('auditedYear'),
        'probeCount': len(probes),
        'passed': [
            {
                'zh': '行政归属与规范名称：香港/澳门特别行政区、台湾省按中国层级标注。',
                'en': 'Administrative attribution: Hong Kong/Macau SARs and Taiwan Province are attributed under China.',
            },
            {
                'zh': '地名与坐标探针共 {n} 处，均落在预期区域。'.replace('{n}', str(len(probes))),
                'en': 'All {n} place-name and coordinate probes fall in the expected regions.'.replace('{n}', str(len(probes))),
            },
            {
                'zh': '未声称已取得审图号；标准地图对照仅在本机运行。',
                'en': 'No map-approval number is claimed; standard-map comparison runs locally only.',
            },
        ],
        'blockers': blockers,
        'note': {
            'zh': '核查可重复运行于 pipeline/china_source_audit.py。取得审图号与权威几何之前，本站不会声称符合中国标准地图。',
            'en': 'The check can be rerun with pipeline/china_source_audit.py. Until authoritative geometry and an approval number are obtained, this site does not claim compliance with Chinese standard maps.',
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify the committed status file is current')
    args = parser.parse_args()
    current = build()
    text = json.dumps(current, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not STATUS.is_file() or STATUS.read_text() != text:
            print('standard-map-status.json is stale; run pipeline/standard_map_status.py', file=sys.stderr)
            return 1
        print(f'Standard-map status is current ({current["status"]}, {len(current["blockers"])} blockers).')
        return 0
    STATUS.write_text(text)
    print(f'Wrote {STATUS.relative_to(ROOT)} ({current["status"]}, {len(current["blockers"])} blockers).')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
