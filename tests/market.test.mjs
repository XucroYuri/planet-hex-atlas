import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { indexMarketZip, parseMarketCsv, readMarketZipSecurity } from '../web/js/market-worker.js';
import { marketCsv, marketRange, rowsInMarketRange } from '../web/js/markets.js';

const header = '股票代码,股票名称,交易日期,开盘价,最高价,最低价,收盘价,前收盘价,成交量,成交额,流通市值,总市值';
const sample = [
  '合成测试样本',
  header,
  'sh600000,"示例,证券",2022-04-25,9,11,8,10,9.5,"1,230",12300,50000,100000',
  'sz000001,另一证券,2022-04-26,2,3,2,2.1,2,450,900,70000,200000',
  'sh600000,"示例,证券",2022-04-25,9,11,8,10.25,9.5,"1,230",12300,50000,100000',
  'sh600000,"示例,证券",2022-04-27,,,,,10.25,0,0,,',
  'sh600000,"示例,证券",2022-02-30,8,11,8,11,9,100,1000,,',
].join('\r\n');

test('UTF-8 CSV 支持说明行、引号、重复日期和无成交记录', () => {
  const securities = parseMarketCsv(new TextEncoder().encode(`\uFEFF${sample}`));
  assert.deepEqual([...securities.keys()], ['sh600000', 'sz000001']);
  const security = securities.get('sh600000');
  assert.equal(security.name, '示例,证券');
  assert.equal(security.currency, 'CNY');
  assert.deepEqual(security.rows.map(row => [row.date, row.close, row.volume]), [
    ['2022-04-25', 10.25, 1230],
    ['2022-04-27', null, 0],
  ]);
  assert.equal(security.rows[0].previousClose, 9.5);
  assert.equal(security.rows[0].totalCap, 100000);
  assert.equal(security.rows[1].pe, null);
  assert.throws(() => parseMarketCsv(new TextEncoder().encode('date,close\n2022-04-27,10')), { code: 'noCsvHeader' });
});

function zippedCsv() {
  const script = `
import io, sys, zipfile
text = sys.stdin.buffer.read().decode("utf-8")
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, "w") as archive:
    archive.writestr("ignored.bin", bytes(200000))
    archive.writestr("backup/stock/sh600000.csv", text.encode("gb18030"), zipfile.ZIP_DEFLATED)
    archive.writestr("stock/sz000001.csv", text.encode("utf-8"), zipfile.ZIP_STORED)
    archive.comment = b'comment with PK\\x05\\x06 before the end'
sys.stdout.buffer.write(buffer.getvalue())
`;
  return execFileSync('python3', ['-c', script], { input: sample });
}

test('ZIP 仅切片读取目录和所选证券，支持 GB18030 Deflate 与 UTF-8 Stored', async () => {
  const bytes = zippedCsv();
  const blob = new Blob([bytes]);
  const slices = [];
  const file = {
    size: blob.size,
    slice(start, end) { slices.push([start, end]); return blob.slice(start, end); },
  };
  const archive = await indexMarketZip(file);
  assert.deepEqual([...archive.entries.keys()], ['sh600000', 'sz000001']);
  assert.equal(slices.length, 2);
  assert.deepEqual(slices[0], [blob.size - 65557, blob.size]);
  assert.equal(slices[1][0], archive.directory);
  assert.ok(slices[1][1] - archive.directory < 512);
  const sh = await readMarketZipSecurity(file, archive, 'sh600000');
  assert.equal(sh.name, '示例,证券');
  assert.equal(sh.rows[0].close, 10.25);
  const entry = archive.entries.get('sh600000');
  assert.deepEqual(slices[2], [entry.offset, entry.offset + 30]);
  assert.equal(slices[3][1] - slices[3][0], entry.compressedSize);
  const sz = await readMarketZipSecurity(file, archive, 'sz000001');
  assert.equal(sz.name, '另一证券');
  assert.equal(sz.rows.length, 1);
  assert.ok(slices.reduce((sum, [start, end]) => sum + end - start, 0) < blob.size / 2);
  const stored = archive.entries.get('sz000001');
  const start = stored.offset + 30 + bytes.readUInt16LE(stored.offset + 26) + bytes.readUInt16LE(stored.offset + 28);
  bytes[start] ^= 1;
  await assert.rejects(readMarketZipSecurity(new Blob([bytes]), archive, 'sz000001'), { code: 'invalidZip' });
  await assert.rejects(indexMarketZip(blob.slice(0, 100)), { code: 'invalidZip' });
});

test('时间窗口以最后实际日期为准，并保留交易日间的空档', () => {
  const rows = ['2024-02-28', '2024-02-29', '2024-03-04', '2024-03-31'].map(date => ({ date }));
  const lastMonth = marketRange(rows, 1, '', '');
  assert.deepEqual(lastMonth, { from: '2024-02-29', to: '2024-03-31' });
  assert.deepEqual(rowsInMarketRange(rows, lastMonth).map(row => row.date), rows.slice(1).map(row => row.date));
  assert.deepEqual(rowsInMarketRange(rows, marketRange(rows, null, '2024-03-05', '2024-03-30')), []);
});

test('导出所选范围时保留空值、币种和授权，转义名称中的公式及引号', () => {
  const csv = marketCsv(
    { code: '2330', name: '=EXAMPLE,"Security"', currency: 'TWD' },
    [{ date: '2026-01-02', open: 10, close: 11, volume: 0 }],
    false,
  );
  assert.match(csv, /\uFEFFcode,name,currency,date,open,high,low,close,volume,value,pe,pb,dividendYield,source,license/);
  assert.match(csv, /2330,"'=EXAMPLE,""Security""",TWD,2026-01-02,10,,,11,0,,,,/);
  assert.match(csv, /https:\/\/data\.gov\.tw\/license/);
});

test('TWSE 按日期和代码归并，日档优先并保留行情空值', async context => {
  const temp = await mkdtemp(join(tmpdir(), 'orbis-market-test-'));
  context.after(() => rm(temp, { recursive: true, force: true }));
  const input = join(temp, 'inputs');
  const output = join(temp, 'output');
  await Promise.all([mkdir(join(input, 'archive'), { recursive: true }), mkdir(join(input, 'ratios'), { recursive: true })]);
  const quoteColumns = [
    'Security Code', 'Security Name', 'Opening Price', 'Highest Price', 'Lowest Price', 'Closing Price',
    'Trade Volume', 'Trade Value', 'Price-Earning ratio',
  ];
  const ratioColumns = ['Security Code', 'P/E ratio', 'P/B ratio', 'Dividend yield (%)'];
  const monthly = {
    stat: 'OK', date: '20260101', title: '2026/01 Daily Trading Value/Volume of 2330',
    fields: ['Date', 'Trade Volume', 'Trade Value', 'Opening Price', 'Highest Price', 'Lowest Price', 'Closing Price'],
    data: [
      ['115/01/02', '120', '1,680', '10', '14', '10', '14'],
      ['2026/01/05', '1', '5', '5', '5', '5', '5'],
      ['2026/01/08', '200', '300', '9', '15', '7', '11'],
    ],
  };
  const daily = (date, data) => ({
    stat: 'OK', date,
    tables: [{ fields: ['Index', 'Close'], data: [['TWII', '24111']] }, { fields: quoteColumns, data }, {}],
  });
  const valuations = (date, data) => ({ stat: 'OK', date, fields: ratioColumns, data });
  const samples = {
    'tw-month.json': monthly,
    'stock-2330-202601.json': { ...monthly, data: [['115/01/02', '130', '1,820', '10', '14', '10', '14']] },
    'archive/20260105.json': daily('20260105', [
      ['2330', '样本甲', '--', '--', '--', '--', '0', '0', '0.00'],
      ['2317', '样本乙', '11', '14', '9', '10', '300', '3,000', '27.29'],
      ['00636K', '样本基金+U', '8', '9', '6', '8.5', '300', '2,550', '0.00'],
    ]),
    'archive/20260109.json': daily('20260105', [['7777', '过期日期样本', '1', '1', '1', '1', '5', '5', '10']]),
    'tw-history.json': { dates: [{ date: '20260107', raw: daily('20260107', [['2317', '', '12', '14', '9', '12', '10', '120', '28.5']]) }] },
    'tw-prices.json': [{
      Date: '1150105', Code: '2330', Name: '样本甲',
      OpeningPrice: '17', HighestPrice: '18', LowestPrice: '17', ClosingPrice: '18', TradeVolume: '20', TradeValue: '350',
    }],
    'tw-ratios.json': [{ Date: '1150108', Code: '2330', PEratio: '42.2', PBratio: '3', DividendYield: '2' }],
    'ratios/20260105.json': valuations('20260105', [['2330', '39.2', '4.22', '0.00'], ['8888', '33', '4', '4']]),
    'ratios/20260107.json': valuations('20260106', [['2317', '66', '5', '3']]),
  };
  await Promise.all(Object.entries(samples).map(([filename, value]) => writeFile(join(input, filename), JSON.stringify(value))));
  const script = fileURLToPath(new URL('../pipeline/market_data.py', import.meta.url));
  const run = () => execFileSync('python3', [script, '--input', input, '--output', output], { encoding: 'utf8' });
  run();
  const indexText = await readFile(join(output, 'index.json'), 'utf8');
  const index = JSON.parse(indexText);
  assert.equal(index.sessions, 4);
  assert.equal(index.rows, 6);
  assert.equal(index.first, '2026-01-02');
  assert.equal(index.last, '2026-01-08');
  assert.deepEqual(index.symbols.map(symbol => [symbol.code, symbol.currency]), [
    ['00636K', 'USD'], ['2317', 'TWD'], ['2330', 'TWD'],
  ]);
  async function rowsOf(code) {
    const { shard } = index.symbols.find(symbol => symbol.code === code);
    return JSON.parse(await readFile(join(output, shard), 'utf8'))[code];
  }
  assert.deepEqual(await rowsOf('2330'), [
    ['2026-01-02', 10, 14, 10, 14, 130, 1820, null, null, null],
    ['2026-01-05', null, null, null, null, 0, 0, 39.2, 4.22, 0],
    ['2026-01-08', 9, 15, 7, 11, 200, 300, 42.2, 3, 2],
  ]);
  assert.deepEqual((await rowsOf('2317')).map(row => row.slice(7)), [[27.29, null, null], [28.5, null, null]]);
  assert.deepEqual((await rowsOf('00636K'))[0].slice(7), [null, null, null]);
  run();
  assert.equal(await readFile(join(output, 'index.json'), 'utf8'), indexText);
});
