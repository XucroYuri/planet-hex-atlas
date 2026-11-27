"""Build a handoff package for a licensed map-compilation partner.

The package contains the current audit state, source inventory, application
fields and submission docs. It deliberately contains no standard-map geometry
and makes no compliance claim: geometry and a 审图号 can only be supplied by an
authorized partner.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'pipeline' / 'china_source_audit.py'
DATA = ROOT / 'web' / 'data'

SMALL_FILES = [
    'docs/china-standards.md',
    'docs/china-map-submission/README.md',
    'docs/china-map-submission/application-fields.md',
    'web/data/source-lock.json',
    'web/data/ATTRIBUTION.txt',
    'web/data/standard-map-status.json',
    'web/data/china-official.json',
    'web/data/missing-notes.json',
]

README = """# 寰宇图志 · 标准地图送审交接材料

本包用于移交给具备测绘资质的地图编制/送审合作方，**不包含**标准地图几何、审图号或任何已审核的图幅。

## 包内内容

- `audit.json`：`pipeline/china_source_audit.py` 的完整机器核查结果（当前状态、阻断项、探针、来源哈希）。
- `standard-map-status.json`：站内展示的核查状态摘要。
- `inventory.csv`：随包数据文件的大小与 SHA-256。
- `application-fields.md` / `docs/china-map-submission/README.md`：《地图管理条例》要求、送审材料清单与申请字段。
- `docs/china-standards.md`：中国官方经济基准与地图标准核查记录。
- `source-lock.json` / `ATTRIBUTION.txt`：输入地址、校验值和完整署名。

## 现状与本包的作用

1. 现有边界输入为 Natural Earth ADM0，详细轮廓与审计产物字节一致，岛礁样点需逐项对照权威图幅；这些是 `audit.json` 中的阻断项。
2. 本站当前**未取得审图号，也不声称符合中国标准地图**。
3. 合作方需要提供：经审核的标准地图几何或可合法派生的图幅、审图号、审核意见要求，以及按《地图管理条例》提交的完整材料。
4. 替换几何后，应运行 `pipeline/standard_map_intake.py` 校验批准号、坐标系与必需区域，再运行 `pipeline/china_source_audit.py` 复核全部探针，最后更新 `pipeline/standard_map_status.py` 的状态。

## 重新生成

```bash
uv run python pipeline/build_submission_package.py
```

输出默认写入 `dist/standard-map-submission.zip`；此目录不提交到 Git。
"""


def file_entry(path):
    payload = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}


def build(out):
    completed = subprocess.run(
        [sys.executable, str(AUDIT), '--json'], cwd=ROOT, check=True,
        capture_output=True, text=True, env={'PYTHONPATH': str(ROOT), 'PATH': '/usr/bin:/bin:/usr/local/bin'},
    )
    audit = json.loads(completed.stdout)
    status = json.loads((DATA / 'standard-map-status.json').read_text())
    inventory = [file_entry(ROOT / name) for name in SMALL_FILES]
    for sub in ('history/sources.json', 'space/launches.json', 'markets/index.json'):
        inventory.append(file_entry(DATA / sub))
    manifest = {
        'schema': 1,
        'generated': date.today().isoformat(),
        'status': status.get('status'),
        'blockers': [blocker['id'] for blocker in status.get('blockers', [])],
        'auditedYear': audit.get('auditedYear'),
        'files': inventory,
        'note': '交接包不含标准地图几何与审图号；请由持测绘资质合作方补齐后再送审。',
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    inventory_csv = ['path,bytes,sha256'] + [f"{entry['path']},{entry['bytes']},{entry['sha256']}" for entry in inventory]
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr('README.md', README)
        archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        archive.writestr('audit.json', json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
        archive.writestr('standard-map-status.json', json.dumps(status, ensure_ascii=False, indent=2) + '\n')
        archive.writestr('inventory.csv', '\n'.join(inventory_csv) + '\n')
        for name in SMALL_FILES:
            archive.write(ROOT / name, name)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / 'dist' / 'standard-map-submission.zip')
    args = parser.parse_args()
    out = args.out if args.out.is_absolute() else ROOT / args.out
    manifest = build(out)
    shown = out.relative_to(ROOT) if out.is_relative_to(ROOT) else out
    print(f'Wrote {shown} ({out.stat().st_size} bytes, {manifest["status"]}, '
          f'{len(manifest["blockers"])} blockers, {len(manifest["files"])} inventoried files).')


if __name__ == '__main__':
    main()
