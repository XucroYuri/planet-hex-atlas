const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_CSV_BYTES = 64 * 1024 * 1024;
const ZIP_END = 0x06054b50;
const ZIP64_END = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CODE = /(?:^|\/)((?:sh|sz|bj)\d{6})\.csv$/i;

class MarketFileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireFile(condition, code = 'invalidZip') {
  if (!condition) throw new MarketFileError(code);
}

async function viewAt(file, offset, size) {
  requireFile(offset >= 0 && size >= 0 && offset + size <= file.size);
  const bytes = await file.slice(offset, offset + size).arrayBuffer();
  requireFile(bytes.byteLength === size);
  return new DataView(bytes);
}

function uint64(view, offset) {
  const value = view.getBigUint64(offset, true);
  requireFile(value <= BigInt(Number.MAX_SAFE_INTEGER), 'unsupportedZip');
  return Number(value);
}

async function zipDirectoryLocation(file) {
  const start = Math.max(0, file.size - 22 - 65535);
  const tail = await viewAt(file, start, file.size - start);
  for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
    if (tail.getUint32(offset, true) !== ZIP_END) continue;
    if (offset + 22 + tail.getUint16(offset + 20, true) !== tail.byteLength) continue;
    requireFile(tail.getUint32(offset + 4, true) === 0, 'unsupportedZip');

    const entriesOnDisk = tail.getUint16(offset + 8, true);
    const count = tail.getUint16(offset + 10, true);
    const size = tail.getUint32(offset + 12, true);
    const directory = tail.getUint32(offset + 16, true);
    requireFile(entriesOnDisk === count, 'unsupportedZip');
    if (count < 0xffff && size < 0xffffffff && directory < 0xffffffff) {
      return { count, size, directory, end: start + offset };
    }

    const locator = await viewAt(file, start + offset - 20, 20);
    requireFile(locator.getUint32(0, true) === ZIP64_LOCATOR);
    requireFile(locator.getUint32(4, true) === 0 && locator.getUint32(16, true) === 1, 'unsupportedZip');
    const end = uint64(locator, 8);
    const zip64 = await viewAt(file, end, 56);
    requireFile(zip64.getUint32(0, true) === ZIP64_END);
    requireFile(zip64.getUint32(16, true) === 0 && zip64.getUint32(20, true) === 0, 'unsupportedZip');
    requireFile(uint64(zip64, 24) === uint64(zip64, 32), 'unsupportedZip');
    return { count: uint64(zip64, 32), size: uint64(zip64, 40), directory: uint64(zip64, 48), end };
  }
  throw new MarketFileError('invalidZip');
}

function entryLocation(view, extraOffset, extraEnd, entry) {
  const fields = ['size', 'compressedSize', 'offset'].filter(key => entry[key] === 0xffffffff);
  if (!fields.length) return;
  for (let offset = extraOffset; offset + 4 <= extraEnd;) {
    const type = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    offset += 4;
    requireFile(offset + size <= extraEnd);
    if (type === 1) {
      requireFile(size >= fields.length * 8);
      fields.forEach((key, index) => { entry[key] = uint64(view, offset + index * 8); });
      return;
    }
    offset += size;
  }
  throw new MarketFileError('invalidZip');
}

export async function indexMarketZip(file) {
  const { count, size, directory, end } = await zipDirectoryLocation(file);
  requireFile(size <= MAX_DIRECTORY_BYTES, 'directoryTooLarge');
  requireFile(directory + size <= end && count * 46 <= size);
  const view = await viewAt(file, directory, size);
  const decoder = new TextDecoder();
  const entries = new Map();
  let offset = 0;
  for (let record = 0; record < count; record += 1) {
    requireFile(offset + 46 <= size && view.getUint32(offset, true) === ZIP_CENTRAL_FILE);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + commentLength;
    requireFile(next <= size);
    const path = decoder.decode(new Uint8Array(view.buffer, nameStart, nameLength)).replaceAll('\\', '/');
    const code = ZIP_CODE.exec(path)?.[1]?.toLowerCase();
    if (code && !entries.has(code)) {
      const entry = {
        flags: view.getUint16(offset + 8, true),
        method: view.getUint16(offset + 10, true),
        crc: view.getUint32(offset + 16, true),
        compressedSize: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true),
        offset: view.getUint32(offset + 42, true),
      };
      requireFile(view.getUint16(offset + 34, true) === 0, 'unsupportedZip');
      entryLocation(view, extraStart, extraStart + extraLength, entry);
      entries.set(code, entry);
    }
    offset = next;
  }
  requireFile(entries.size, 'noZipSecurities');
  return { entries, directory };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, byte) => {
  let crc = byte;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return crc;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function inflate(blob, size) {
  let decoder;
  try {
    decoder = new DecompressionStream('deflate-raw');
  } catch {
    throw new MarketFileError('noDecompressor');
  }
  const bytes = new Uint8Array(size);
  const reader = blob.stream().pipeThrough(decoder).getReader();
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      requireFile(offset + value.length <= size);
      bytes.set(value, offset);
      offset += value.length;
    }
    requireFile(offset === size);
    return bytes;
  } catch {
    throw new MarketFileError('invalidZip');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function readMarketZipSecurity(file, archive, code) {
  const entry = archive.entries.get(code);
  requireFile(entry, 'noZipSecurities');
  requireFile(!(entry.flags & 1) && [0, 8].includes(entry.method), 'unsupportedEntry');
  requireFile(entry.size <= MAX_CSV_BYTES, 'csvTooLarge');
  const header = await viewAt(file, entry.offset, 30);
  requireFile(header.getUint32(0, true) === ZIP_LOCAL_FILE && header.getUint16(8, true) === entry.method);
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const end = start + entry.compressedSize;
  requireFile(end <= archive.directory);
  if (entry.method === 0) requireFile(entry.compressedSize === entry.size);
  const content = file.slice(start, end);
  const bytes = entry.method === 8
    ? await inflate(content, entry.size)
    : new Uint8Array(await content.arrayBuffer());
  requireFile(bytes.length === entry.size && crc32(bytes) === entry.crc);
  const securities = parseMarketCsv(bytes, code);
  return securities.get(code);
}

const CSV_FIELDS = {
  date: ['交易日期', '日期', 'Trading Date'],
  code: ['股票代码', '股票代碼', '證券代號', '证券代码', 'Security Code', 'Stock Code'],
  name: ['股票名称', '股票名稱', '證券名稱', '证券名称', 'Security Name', 'Stock Name'],
  currency: ['币种', '幣別'],
  open: ['开盘价', '開盤價', 'Opening Price'],
  high: ['最高价', '最高價', 'Highest Price'],
  low: ['最低价', '最低價', 'Lowest Price'],
  close: ['收盘价', '收盤價', 'Closing Price'],
  previousClose: ['前收盘价', '前收盤價', 'Previous Close'],
  volume: ['成交量', '成交股數', 'Trade Volume'],
  value: ['成交额', '成交金額', 'Trade Value'],
  floatCap: ['流通市值', 'Float Market Cap'],
  totalCap: ['总市值', '總市值', 'Total Market Cap'],
  pe: ['市盈率', '本益比', 'P/E ratio'],
  pb: ['市净率', '股價淨值比', 'P/B ratio'],
  dividendYield: ['股息率', '殖利率', '殖利率(%)', 'Dividend yield (%)'],
};
const NUMERIC_FIELDS = Object.keys(CSV_FIELDS).slice(4);
const REQUIRED_FIELDS = ['date', 'code', 'open', 'high', 'low', 'close', 'volume', 'value'];

function columnKey(value) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\s_/-]/g, '');
}

const CSV_ALIASES = new Map(Object.entries(CSV_FIELDS).flatMap(([field, names]) => (
  [field, ...names].map(name => [columnKey(name), field])
)));

function decodeCsv(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('gb18030', { fatal: true }).decode(bytes);
    } catch {
      throw new MarketFileError('invalidEncoding');
    }
  }
}

function* csvRows(text) {
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell) {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' || char === '\n') {
      yield [...row, cell];
      row = [];
      cell = '';
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      cell += char;
    }
  }
  requireFile(!quoted, 'invalidCsv');
  if (row.length || cell) yield [...row, cell];
}

function csvDate(value) {
  const parts = value.trim().match(/^(\d{4})(\d{2})(\d{2})$/)
    || value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const time = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === iso ? iso : null;
}

function csvCode(value, expected) {
  const code = value.trim().toLowerCase().replaceAll('.', '');
  const exchangeSuffix = /^(\d{6})(sh|sz|bj)$/.exec(code);
  const normalized = exchangeSuffix ? exchangeSuffix[2] + exchangeSuffix[1] : code;
  if (expected) return normalized === expected || normalized === expected.slice(2) ? expected : null;
  return /^(?:(?:sh|sz|bj)?\d{6})$/.test(normalized) ? normalized : null;
}

function csvNumber(value) {
  const text = value.normalize('NFKC').trim().replaceAll(',', '').replace(/%$/, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function parseMarketCsv(bytes, expectedCode = null) {
  const securities = new Map();
  let columns;
  for (const cells of csvRows(decodeCsv(bytes))) {
    if (!columns) {
      const fields = cells.map(cell => CSV_ALIASES.get(columnKey(cell)));
      if (REQUIRED_FIELDS.every(field => fields.includes(field))) {
        columns = Object.fromEntries(fields.flatMap((field, index) => field ? [[field, index]] : []));
      }
      continue;
    }
    const get = field => cells[columns[field]] ?? '';
    const date = csvDate(get('date'));
    const code = csvCode(get('code'), expectedCode);
    if (!date || !code) continue;
    const name = get('name').trim();
    const currency = get('currency').trim().toUpperCase();
    const security = securities.get(code) ?? { code, name: '', currency: 'CNY', namedOn: '', rows: new Map() };
    if (date >= security.namedOn) {
      security.name = name || security.name;
      if (/^[A-Z]{3}$/.test(currency)) security.currency = currency;
      if (name || currency) security.namedOn = date;
    }
    const row = { date };
    for (const field of NUMERIC_FIELDS) row[field] = csvNumber(get(field));
    security.rows.set(date, row);
    securities.set(code, security);
  }
  requireFile(columns, 'noCsvHeader');
  requireFile(securities.size, 'noCsvRows');
  for (const [code, security] of securities) {
    const rows = [...security.rows.values()].sort((left, right) => left.date.localeCompare(right.date));
    securities.set(code, { code, name: security.name, currency: security.currency, rows });
  }
  return securities;
}

function metadata({ code, name, currency, rows }) {
  return { code, name, currency, first: rows[0].date, last: rows.at(-1).date, count: rows.length };
}

function startWorker() {
  let file;
  let zip;
  let csv;
  let pending;
  let active = false;

  async function handle(message) {
    if (message.type === 'open') {
      file = message.file;
      if (/\.zip$/i.test(file.name)) {
        zip = await indexMarketZip(file);
        const symbols = [...zip.entries.keys()].sort().map(code => ({ code, name: '', currency: 'CNY' }));
        return { kind: 'zip', symbols };
      }
      requireFile(/\.csv$/i.test(file.name), 'fileType');
      requireFile(file.size <= MAX_CSV_BYTES, 'csvTooLarge');
      csv = parseMarketCsv(new Uint8Array(await file.arrayBuffer()));
      const symbols = [...csv.values()].map(metadata).sort((left, right) => left.code.localeCompare(right.code));
      const first = symbols.reduce((min, symbol) => symbol.first < min ? symbol.first : min, symbols[0].first);
      const last = symbols.reduce((max, symbol) => symbol.last > max ? symbol.last : max, symbols[0].last);
      return { kind: 'csv', symbols, first, last };
    }
    const result = zip
      ? await readMarketZipSecurity(file, zip, message.code)
      : csv?.get(message.code);
    requireFile(result, 'noCsvRows');
    return { symbol: metadata(result), rows: result.rows };
  }

  globalThis.addEventListener('message', async ({ data }) => {
    pending = data;
    if (active) return;
    active = true;
    while (pending) {
      const message = pending;
      pending = null;
      try {
        globalThis.postMessage({ id: message.id, data: await handle(message) });
      } catch (error) {
        globalThis.postMessage({ id: message.id, error: error.code || 'readFailure' });
      }
    }
    active = false;
  });
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) startWorker();
