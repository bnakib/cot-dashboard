#!/usr/bin/env python3
"""Fetch official Legacy Futures Only COT history and publish validated static JSON."""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json'
SOURCE = 'https://publicreporting.cftc.gov/d/6dca-aqww'
START = date(2023, 1, 1)
GROUPS = {'large': 'noncomm', 'small': 'nonrept', 'commercial': 'comm'}

def key(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())

def field(row, *names, required=True):
    normalized = {key(k): v for k, v in row.items()}
    for name in names:
        if key(name) in normalized and normalized[key(name)] not in (None, ''):
            return normalized[key(name)]
    if required:
        raise ValueError(f'Missing field: {names[0]}')
    return ''

def number(value):
    text = str(value).replace(',', '').strip()
    if not re.fullmatch(r'\d+(?:\.0+)?', text):
        raise ValueError(f'Invalid nonnegative contract count: {value!r}')
    return int(text.split('.')[0])

def category(name):
    name = name.upper()
    if any(x in name for x in ('CRUDE', 'GAS', 'GASOLINE', 'HEATING', 'FUEL', 'POWER', 'ELECTRIC', 'COAL', 'ETHANOL', 'CARBON', 'EMISSION', 'PROPANE', 'BUTANE', 'NAPHTHA')):
        return 'Energy'
    if any(x in name for x in ('GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM', 'ALUMIN', 'STEEL', 'IRON', 'COBALT', 'LITHIUM', 'ZINC', 'NICKEL')):
        return 'Metals'
    if any(x in name for x in ('WHEAT', 'CORN', 'SOY', 'OATS', 'RICE', 'COTTON', 'COFFEE', 'COCOA', 'SUGAR', 'CATTLE', 'HOG', 'MILK', 'BUTTER', 'CHEESE', 'LUMBER', 'ORANGE', 'CANOLA', 'DAIRY')):
        return 'Agriculture'
    if any(x in name for x in ('DOLLAR', 'EURO', 'YEN', 'POUND', 'FRANC', 'PESO', 'REAL', 'RAND', 'TREASURY', 'T-NOTE', 'T-BOND', 'SOFR', 'FED FUNDS', 'S&P', 'NASDAQ', 'DOW', 'RUSSELL', 'BITCOIN', 'ETHER', 'VIX', 'INDEX', 'NIKKEI', 'MSCI')):
        return 'Financial'
    return 'Other'

def normalize(row):
    day = date.fromisoformat(str(field(row, 'report_date_as_yyyy_mm_dd', 'As of Date in Form YYYY-MM-DD'))[:10])
    if day < START:
        return None
    code = str(field(row, 'cftc_contract_market_code')).strip()
    if not re.fullmatch(r'[A-Za-z0-9+]+', code):
        raise ValueError(f'Unsafe market code: {code}')
    name = str(field(row, 'market_and_exchange_names')).strip()
    oi = number(field(row, 'open_interest_all'))
    spread = number(field(row, 'noncomm_postions_spread_all', 'noncomm_positions_spread_all', 'Noncommercial Positions-Spreading (All)'))
    record = {'date': day.isoformat(), 'openInterest': oi, 'spreading': spread}
    labels = {'large': 'Noncommercial', 'small': 'Nonreportable', 'commercial': 'Commercial'}
    for group, prefix in GROUPS.items():
        long = number(field(row, f'{prefix}_positions_long_all', f'{labels[group]} Positions-Long (All)'))
        short = number(field(row, f'{prefix}_positions_short_all', f'{labels[group]} Positions-Short (All)'))
        record[group] = {'long': long, 'short': short, 'net': long - short}
    for side in ('long', 'short'):
        total = sum(record[g][side] for g in GROUPS) + spread
        if total != oi:
            raise ValueError(f'{code} {day}: {side} total {total} does not equal open interest {oi}')
    if sum(record[g]['net'] for g in GROUPS) != 0:
        raise ValueError(f'{code} {day}: net positions do not balance')
    return code, name, record

def request(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'cot-dashboard/1.0 (open-source personal dashboard)', 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 3:
                raise
            print(f'Retrying source request after {type(exc).__name__}', flush=True)
            time.sleep(2 ** (attempt + 1))

def api_rows():
    rows, offset = [], 0
    while True:
        query = urllib.parse.urlencode({'$where': "report_date_as_yyyy_mm_dd >= '2023-01-01T00:00:00'", '$order': 'report_date_as_yyyy_mm_dd,cftc_contract_market_code', '$limit': 5000, '$offset': offset})
        page = json.loads(request(f'{API}?{query}'))
        if not isinstance(page, list):
            raise ValueError('CFTC API did not return a list')
        rows.extend(page)
        if len(page) < 5000:
            break
        offset += len(page)
        time.sleep(0.5)
    return rows

def archive_rows():
    rows = []
    for year in range(START.year, date.today().year + 1):
        # Official annual Legacy Futures Only comma-delimited archive.
        url = f'https://www.cftc.gov/files/dea/history/deacot{year}.zip'
        content = request(url)
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            files = [n for n in archive.namelist() if n.lower().endswith(('.txt', '.csv'))]
            if len(files) != 1:
                raise ValueError(f'Unexpected archive members for {year}')
            decoded = archive.read(files[0]).decode('utf-8-sig', errors='strict')
            rows.extend(csv.DictReader(io.StringIO(decoded)))
        time.sleep(0.5)
    return rows

def build(rows):
    markets = {}
    for row in rows:
        result = normalize(row)
        if result is None:
            continue
        code, name, record = result
        market = markets.setdefault(code, {'code': code, 'name': name, 'category': category(name), 'records': {}})
        previous = market['records'].get(record['date'])
        if previous is not None and previous != record:
            raise ValueError(f'Conflicting duplicate {code} {record["date"]}')
        market['records'][record['date']] = record
        # Use the latest name, allowing CFTC market labels to change over time.
        if record['date'] == max(market['records']):
            market['name'], market['category'] = name, category(name)
    if not markets:
        raise ValueError('No COT records returned; preserving previous data')
    for market in markets.values():
        records = sorted(market['records'].values(), key=lambda r: r['date'])
        for i, record in enumerate(records):
            previous = records[i - 1] if i else None
            record['previousDate'] = previous['date'] if previous else None
            record['gapDays'] = (date.fromisoformat(record['date']) - date.fromisoformat(previous['date'])).days if previous else None
            for group in GROUPS:
                record[group]['change'] = ({k: record[group][k] - previous[group][k] for k in ('long', 'short', 'net')} if previous else None)
        market['records'] = records
    return markets

def dumps(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False) + '\n'

def publish(markets, target, source):
    latest = max(m['records'][-1]['date'] for m in markets.values())
    count = sum(len(m['records']) for m in markets.values())
    old_path = target / 'index.json'
    old = json.loads(old_path.read_text()) if old_path.exists() else None
    # Refuse a suspiciously truncated full-history response.
    if old and old.get('recordCount', 0):
        if count < old['recordCount'] * 0.95 or latest < old['latestDate']:
            raise ValueError('Source history shrank or regressed; preserving previous data')
    payloads = {f'{code}.json': dumps(market) for code, market in markets.items()}
    checksum = hashlib.sha256(''.join(payloads[n] for n in sorted(payloads)).encode()).hexdigest()
    index = {'schemaVersion': 1, 'reportType': 'Legacy Futures Only', 'sourceUrl': SOURCE, 'retrievalMethod': source,
             'startDate': START.isoformat(), 'latestDate': latest, 'recordCount': count, 'checksum': checksum,
             'updatedAt': datetime.now(timezone.utc).isoformat(),
             'markets': [{'code': m['code'], 'name': m['name'], 'category': m['category'], 'firstDate': m['records'][0]['date'],
                          'latestDate': m['records'][-1]['date'], 'count': len(m['records'])} for m in sorted(markets.values(), key=lambda m: m['name'])]}
    if old and old.get('checksum') == checksum:
        print(f'No changes: {len(markets)} markets, {count} observations through {latest}')
        return False
    # All data are validated and staged before any tracked files are replaced.
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as directory:
        staged = Path(directory)
        for name, content in payloads.items():
            (staged / name).write_text(content)
        (staged / 'index.json').write_text(dumps(index))
        target.mkdir(exist_ok=True)
        for path in staged.iterdir():
            path.replace(target / path.name)
        for path in target.glob('*.json'):
            if path.name != 'index.json' and path.name not in payloads:
                path.unlink()
    print(f'Published {len(markets)} markets, {count} observations through {latest}')
    return True

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Read a local API-format JSON fixture instead of fetching')
    parser.add_argument('--output', type=Path, default=ROOT / 'site/data')
    args = parser.parse_args()
    if args.input:
        rows, source = json.loads(args.input.read_text()), 'Local fixture'
    else:
        try:
            rows, source = api_rows(), 'CFTC public reporting API'
            markets = build(rows)
        except Exception as exc:
            print(f'API unavailable or invalid ({type(exc).__name__}: {exc}); trying official annual archives', flush=True)
            rows, source = archive_rows(), 'CFTC annual archives'
    markets = build(rows)
    publish(markets, args.output, source)

if __name__ == '__main__':
    main()
