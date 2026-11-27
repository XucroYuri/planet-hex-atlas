"""把 TWSE 公开缓存重建为可按需加载的市场数据。"""

import argparse
import hashlib
import json
import math
import re
import unicodedata
import zlib
from collections import defaultdict
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile


QUOTES = ("open", "high", "low", "close", "volume", "value")
RATIOS = ("pe", "pb", "dividendYield")
FIELDS = ("date", *QUOTES, *RATIOS)
FIELD_NAMES = {
    "date": ("Date", "日期", "交易日期", "資料日期"),
    "code": ("Code", "Security Code", "Stock Code", "證券代號", "股票代號"),
    "name": ("Name", "Security Name", "Stock Name", "證券名稱", "股票名稱"),
    "currency": ("Currency", "幣別", "交易幣別"),
    "open": ("OpeningPrice", "Opening Price", "Open Price", "開盤價"),
    "high": ("HighestPrice", "Highest Price", "High Price", "最高價"),
    "low": ("LowestPrice", "Lowest Price", "Low Price", "最低價"),
    "close": ("ClosingPrice", "Closing Price", "Close Price", "收盤價"),
    "volume": ("TradeVolume", "Trade Volume", "Trade Volume (share)", "成交股數", "成交量"),
    "value": ("TradeValue", "Trade Value", "Trade Value (NT$)", "成交金額"),
    "pe": ("PEratio", "P/E ratio", "Price-Earning ratio", "本益比"),
    "pb": ("PBratio", "P/B ratio", "股價淨值比", "股價淨值比(倍)"),
    "dividendYield": ("DividendYield", "Dividend yield (%)", "殖利率", "殖利率(%)"),
}
LICENSE = "https://data.gov.tw/license"
SOURCES = (
    "https://data.gov.tw/dataset/11549",
    "https://data.gov.tw/dataset/11547",
    "https://data.gov.tw/dataset/11764",
    "https://www.twse.com.tw/en/trading/historical/mi-index.html",
    "https://www.twse.com.tw/en/trading/historical/stock-day.html",
    "https://www.twse.com.tw/zh/products/system/dual-etf/introduction.html",
)


def field_key(value):
    return re.sub(r"[\s/_-]", "", unicodedata.normalize("NFKC", str(value)).lower())


ALIASES = {field_key(name): key for key, names in FIELD_NAMES.items() for name in names}


def iso_date(value):
    text = str(value or "").strip()
    parts = re.fullmatch(r"(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})", text)
    if parts:
        year, month, day = parts.groups()
    elif re.fullmatch(r"\d{7,8}", text):
        year, month, day = text[:-4], text[-4:-2], text[-2:]
    else:
        return None
    try:
        return date(int(year) + (1911 if len(year) < 4 else 0), int(month), int(day)).isoformat()
    except ValueError:
        return None


def number(value):
    text = unicodedata.normalize("NFKC", str(value)).strip().replace(",", "").rstrip("%")
    if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", text):
        return None
    if re.fullmatch(r"[+-]?\d+", text):
        return int(text)
    result = float(text)
    return result if math.isfinite(result) else None


def quote_value(value, field):
    result = number(value)
    if result is None or result < 0 or (result == 0 and field in QUOTES[:4]):
        return None
    return result


def ratio_value(value, field):
    result = number(value)
    if result == 0 and field in ("pe", "pb"):
        return None
    return result


def symbol(value):
    text = str(value or "").strip().upper()
    return text if re.fullmatch(r"\d[A-Z0-9]{3,7}", text) else None


def from_report(payload, forced_date=None, forced_code=None):
    if payload.get("stat", "OK") != "OK":
        return
    declared = iso_date(payload.get("date") or payload.get("Date"))
    if forced_date and declared and declared != forced_date:
        return
    report_day = forced_date or declared
    tables = [payload, *(payload.get("tables") or [])]
    tables.extend(
        {"fields": payload[key], "data": payload.get("data" + key[6:])}
        for key in payload if re.fullmatch(r"fields\d+", key)
    )
    for table in tables:
        if not isinstance(table, dict) or not table.get("fields") or not table.get("data"):
            continue
        columns = [ALIASES.get(field_key(field)) for field in table["fields"]]
        is_quote = all(field in columns for field in QUOTES)
        is_ratio = all(field in columns for field in RATIOS)
        if not (is_quote or is_ratio) or not (forced_code or "code" in columns):
            continue
        for row in table["data"]:
            values = {key: value for key, value in zip(columns, row) if key}
            code = symbol(values.get("code")) or forced_code
            day = iso_date(values["date"]) if "date" in values else report_day
            if not code or not day or (forced_code and code != forced_code):
                continue
            if not forced_code and report_day and day != report_day:
                continue
            if forced_code and report_day and day[:7] != report_day[:7]:
                continue
            yield code, day, values, is_quote


def snapshot(rows):
    for row in rows:
        if not isinstance(row, dict):
            continue
        values = {ALIASES.get(field_key(key)): value for key, value in row.items()}
        code, day = symbol(values.get("code")), iso_date(values.get("date"))
        is_quote = all(field in values for field in QUOTES)
        if code and day and (is_quote or all(field in values for field in RATIOS)):
            yield code, day, values, is_quote


def history_reports(node, day=None):
    if isinstance(node, list):
        yield from snapshot(node)
        for item in node:
            yield from history_reports(item, day)
    elif isinstance(node, dict):
        current_day = iso_date(node.get("date") or node.get("Date")) or day
        if any(key == "tables" or re.fullmatch(r"fields\d*", key) for key in node):
            yield from from_report(node, current_day)
        else:
            for key, value in node.items():
                yield from history_reports(value, iso_date(key) or current_day)


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def input_rows(directory):
    legacy_month = directory / "tw-month.json"
    if legacy_month.is_file():
        payload = load(legacy_month)
        match = re.search(r"(?<!\d)(\d{4})(?![\d/])\s*$", payload.get("title", ""))
        if match:
            yield from from_report(payload, forced_code=match[1])
    for path in sorted(directory.rglob("stock-*.json")):
        match = re.fullmatch(r"stock-(\d[A-Za-z0-9]{3,7})-(\d{6})", path.stem)
        if match:
            code, month = match.groups()
            month_start = iso_date(month + "01")
            payload = load(path)
            declared = iso_date(payload.get("date"))
            if month_start and (not declared or declared[:7] == month_start[:7]):
                yield from from_report(payload, forced_date=declared or month_start,
                                       forced_code=code.upper())

    for name in ("tw-prices.json", "tw-ratios.json", "tw-archive.json", "tw-history.json"):
        path = directory / name
        if path.is_file():
            yield from history_reports(load(path))

    for folder in ("archive", "ratios"):
        for path in sorted((directory / folder).glob("*.json")):
            day = iso_date(path.stem) if re.fullmatch(r"\d{8}", path.stem) else None
            if day:
                yield from from_report(load(path), day)


def currency_for(code, name, currency):
    if re.fullmatch(r"[A-Z]{3}", currency):
        return currency
    if re.fullmatch(r"00\d{3}[KMSCV]", code):
        suffix = unicodedata.normalize("NFKC", name).strip().upper()[-2:]
        return {"+R": "CNY", "+U": "USD"}.get(suffix)
    return "TWD"


def merge(rows):
    quotes = defaultdict(dict)
    valuations = defaultdict(dict)
    names = {}
    currencies = {}
    for code, day, values, is_quote in rows:
        name = str(values.get("name") or "").strip()
        if name and day >= names.get(code, ("", ""))[0]:
            names[code] = (day, name)
        currency = str(values.get("currency") or "").strip().upper()
        if currency and day >= currencies.get(code, ("", ""))[0]:
            currencies[code] = (day, currency)
        if is_quote:
            embedded_pe = ratio_value(values.get("pe"), "pe")
            quotes[code][day] = ([quote_value(values[field], field) for field in QUOTES], embedded_pe)
        else:
            valuations[code][day] = tuple(ratio_value(values.get(field), field) for field in RATIOS)

    for code, series in sorted(quotes.items()):
        name = names.get(code, ("", ""))[1]
        currency = currency_for(code, name, currencies.get(code, ("", ""))[1])
        history = [
            [day, *values, *valuations[code].get(day, (embedded_pe, None, None))]
            for day, (values, embedded_pe) in sorted(series.items())
        ]
        yield code, name, currency, history


def serialize(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def write_atomic(target, data):
    with NamedTemporaryFile(dir=target.parent, prefix=".market-", delete=False) as handle:
        path = Path(handle.name)
        try:
            handle.write(data.encode("utf-8"))
            handle.close()
            path.replace(target)
        finally:
            path.unlink(missing_ok=True)


def build(source, output):
    buckets = defaultdict(dict)
    symbols = []
    sessions = set()
    ratio_sessions = set()
    count = 0
    for code, name, currency, rows in merge(input_rows(source)):
        shard = f"quotes-{zlib.crc32(code.encode()) % 48:02}.json"
        buckets[shard][code] = rows
        symbols.append({
            "code": code, "name": name, "currency": currency, "shard": shard,
            "first": rows[0][0], "last": rows[-1][0], "count": len(rows),
        })
        sessions.update(row[0] for row in rows)
        ratio_sessions.update(row[0] for row in rows if any(value is not None for value in row[7:]))
        count += len(rows)
    if not sessions:
        raise ValueError("未在缓存中找到 TWSE 行情。")

    output.mkdir(parents=True, exist_ok=True)
    for file, contents in sorted(buckets.items()):
        lines = [f"{serialize(code)}:{serialize(rows)}" for code, rows in contents.items()]
        write_atomic(output / file, "{\n" + ",\n".join(lines) + "\n}\n")
    index = {
        "version": 1, "fields": FIELDS, "symbols": symbols,
        "first": min(sessions), "last": max(sessions), "sessions": len(sessions),
        "ratioSessions": len(ratio_sessions), "rows": count,
        "provider": "Taiwan Stock Exchange / Securities and Futures Bureau, FSC",
        "license": LICENSE, "sources": SOURCES,
    }
    write_atomic(output / "index.json", serialize(index) + "\n")
    manifest = source / 'public-inputs.json'
    published = json.loads(manifest.read_text()) if manifest.exists() else []
    provenance = {row['file']: row for row in published}
    for name in ('tw-prices.json', 'tw-ratios.json', 'tw-month.json', 'tw-archive.json', 'tw-history.json'):
        path = source / name
        if path.exists():
            provenance[name] = {'file': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                                'catalog': 'https://data.gov.tw/dataset/11549' if 'ratio' not in name else 'https://data.gov.tw/dataset/11547'}
    write_atomic(output / 'source-lock.json', serialize({'inputs': list(provenance.values())}) + '\n')
    print(f"{len(symbols):,} 个证券，{count:,} 条日记录，{len(sessions):,} 个有数据的日期"
          f"（{index['first']} 至 {index['last']}）")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="TWSE 公开缓存目录")
    parser.add_argument("--output", type=Path, default=Path("web/data/markets"), help="静态数据目录")
    args = parser.parse_args()
    build(args.input, args.output)
