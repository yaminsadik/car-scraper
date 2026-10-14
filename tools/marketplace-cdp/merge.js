#!/usr/bin/env node
/**
 * Fold search-card capture JSONs into one chronological, deduplicated CSV.
 *
 * Mechanical only: buying criteria remain in used_car_buying_playbook.md.
 * The only exclusions here are vehicle classes that are not passenger cars.
 *
 *   node merge.js
 *   node merge.js --dir path/to/feed-captures --out path/to/master.csv
 *   node merge.js --keep-all
 */

const fs = require('fs');
const path = require('path');
const { parseRow } = require('./mp');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_FEED_DIR = path.join(PROJECT_ROOT, 'captures', 'feeds');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'captures', 'master.csv');

const MOTORCYCLE_ONLY_MAKES = new Set([
  'yamaha',
  'ducati',
  'kawasaki',
  'harley-davidson',
  'harley davidson',
  'ktm',
  'aprilia',
  'triumph',
  'vespa',
  'piaggio',
  'moto guzzi',
  'can-am',
  'sea-doo',
]);

const NON_CAR_CLASS =
  /\b(?:motorcycle|motorbike|scooter|moped|atv|jet ski|trailer|camper|motorhome|boat|pontoon|forklift|golf cart|semi[- ]?truck|truck tractor)\b/i;

const MOTORCYCLE_MODEL =
  /\b(?:cbr\d*|gsx-?[rs]\d*|yzf-?r\d*|ninja|grom|hornet)\b/i;

const HONDA_NON_CAR_MODEL =
  /^(?:stateline|interstate|trx\s*\d|ctx\d|gold\s*wing|goldwing|scl\d|vtx\d*|pcx\d*|fourtrax|crf\d|rebel\s*\d|cb\d+|cbr\d*|adv\s*\d|navi(?:\s|$)|acty(?:\s|$))/i;

const SUZUKI_MOTORCYCLE_MODEL =
  /^(?:gsx-?[rs]?\d*|hayabusa|boulevard|v-?strom|dr-?z?\d*|katana|burgman|sv\d+|rm-?z?\d*)/i;

// Every make Marketplace realistically returns here, approved or not. This is
// spelling vocabulary, not buying criteria — it answers "is this a recognisable
// brand at all," never "is this a brand we want." A card that fails it is
// flagged for a human to open, not dropped.
const KNOWN_MAKES = new Set(
  `acura alfa alfa-romeo amc aston astonmartin audi bentley bmw bugatti buick
   cadillac chevrolet chevy chrysler citroen daewoo daihatsu datsun dodge eagle
   ferrari fiat fisker ford genesis geo gmc honda hummer hyundai infiniti isuzu
   jaguar jeep kia lamborghini lancia land landrover lexus lincoln lotus lucid
   maserati maybach mazda mclaren mercedes mercedes-benz mercury mg mini
   mitsubishi morgan nissan oldsmobile opel packard peugeot plymouth polestar
   pontiac porsche ram renault rivian rolls rolls-royce saab saturn scion seat
   skoda smart sterling studebaker subaru suzuki tesla toyota triumph vw
   volkswagen volvo willys yugo`.split(/\s+/)
);

const normalize = (value) => String(value || '').trim().toLowerCase();

// Why a card cannot be triaged from its title alone. Empty means it can.
function reviewReason(row) {
  const make = normalize(row.make);
  const hasYear = /^\d{4}$/.test(String(row.year || ''));

  if (!make && !hasYear) return 'no-title';
  if (!make) return 'no-make';
  if (!KNOWN_MAKES.has(make)) return 'unknown-make';
  if (!hasYear) return 'no-year';
  return '';
}

function isNonCar(row) {
  const label = String(row.label || '');
  const make = normalize(row.make);
  const model = normalize(row.model);

  if (NON_CAR_CLASS.test(label)) return true;
  if (MOTORCYCLE_ONLY_MAKES.has(make)) return true;
  if (MOTORCYCLE_MODEL.test(model)) return true;
  if (make === 'honda' && HONDA_NON_CAR_MODEL.test(model)) return true;
  if (make === 'suzuki' && SUZUKI_MOTORCYCLE_MODEL.test(model)) return true;
  if (make === 'toyota' && /^(?:forlikf|forklift)\b/i.test(model)) return true;
  if (make === 'volvo' && Number(row.year) >= 2000 && /^780(?:\s|$)/.test(model)) {
    return true;
  }
  return false;
}

// Captures store the card's raw aria-label alongside the fields parsed at read
// time, so re-deriving here makes a parser fix retroactive: a card the old
// parser gave up on is recovered from history instead of needing a re-scroll.
function reparse(row) {
  if (!row || !row.label) return row;
  const fresh = parseRow({ id: row.id, position: row.position, label: row.label });
  return fresh.parsed ? { ...row, ...fresh } : row;
}

function captureTimestamp(capture) {
  const timestamp = Date.parse(capture.data.capturedAt || '');
  return Number.isNaN(timestamp) ? null : timestamp;
}

function loadCaptures(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `No feed-capture directory at ${dir}. ` +
        'Run mp.js read --out captures/feeds/<name>.json first.'
    );
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
  if (!files.length) throw new Error(`No .json feed captures in ${dir}.`);

  const captures = [];
  const warnings = [];
  let itemFiles = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      warnings.push(`skipping ${file}: ${err.message}`);
      continue;
    }

    if (Array.isArray(data)) {
      itemFiles++;
      continue;
    }
    if (!data || !Array.isArray(data.listings)) {
      warnings.push(`skipping ${file}: expected an object with a listings array`);
      continue;
    }

    captures.push({ file, data });
  }

  captures.sort((a, b) => {
    const aTime = captureTimestamp(a);
    const bTime = captureTimestamp(b);
    if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
    return a.file.localeCompare(b.file);
  });

  return { captures, warnings, itemFiles };
}

function mergeCaptures(captures, { keepAll = false } = {}) {
  const master = new Map();
  let totalRows = 0;
  let dropped = 0;

  for (const capture of captures) {
    const passName = path.basename(capture.file, '.json');
    let fresh = 0;

    for (const raw of capture.data.listings) {
      totalRows++;
      if (!raw || !raw.id) continue;
      const row = reparse(raw);
      if (!keepAll && isNonCar(row)) {
        dropped++;
        continue;
      }

      const previous = master.get(String(row.id));
      if (previous) {
        if (!previous.passes.includes(passName)) previous.passes.push(passName);
        previous.times_seen++;
        if (
          row.position != null &&
          (previous.best_rank === '' || Number(row.position) < Number(previous.best_rank))
        ) {
          previous.best_rank = row.position;
        }

        if (row.price != null && previous._priceHistory.at(-1) !== row.price) {
          previous._priceHistory.push(row.price);
        }

        // Keep the latest observation together so a new price is never paired
        // with an old raw label, model, or city.
        previous.year = row.year ?? previous.year;
        previous.make = row.make ?? previous.make;
        previous.model = row.model ?? previous.model;
        previous.price = row.price ?? previous.price;
        previous.was_price = row.wasPrice ?? '';
        previous.city = row.city ?? previous.city;
        previous.url = row.url || previous.url;
        previous.label = row.label ?? previous.label;
        previous.review = reviewReason(previous);
        previous.last_pass = passName;
        previous.last_seen = capture.data.capturedAt || '';
        continue;
      }

      fresh++;
      master.set(String(row.id), {
        id: String(row.id),
        year: row.year ?? '',
        make: row.make ?? '',
        model: row.model ?? '',
        price: row.price ?? '',
        was_price: row.wasPrice ?? '',
        city: row.city ?? '',
        best_rank: row.position ?? '',
        first_pass: passName,
        last_pass: passName,
        first_seen: capture.data.capturedAt || '',
        last_seen: capture.data.capturedAt || '',
        passes: [passName],
        times_seen: 1,
        _priceHistory: row.price == null ? [] : [row.price],
        url: row.url || `https://www.facebook.com/marketplace/item/${row.id}/`,
        label: row.label ?? '',
        review: reviewReason(row),
      });
    }

    capture.fresh = fresh;
  }

  const rank = (value) => (value === '' || value == null ? 1e9 : Number(value));
  const rows = [...master.values()]
    .map((row) => ({
      ...row,
      price_changed: row._priceHistory.length > 1 ? row._priceHistory.join('->') : '',
    }))
    .sort((a, b) => rank(a.best_rank) - rank(b.best_rank));

  return { rows, totalRows, dropped };
}

const COLS = [
  'id',
  'year',
  'make',
  'model',
  'price',
  'was_price',
  'city',
  'best_rank',
  'first_pass',
  'last_pass',
  'first_seen',
  'last_seen',
  'times_seen',
  'price_changed',
  'review',
  'url',
  'label',
];

const csvEscape = (value) => {
  const string = String(value ?? '');
  return /[",\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
};

function toCsv(rows) {
  return (
    [
      COLS.join(','),
      ...rows.map((row) => COLS.map((column) => csvEscape(row[column])).join(',')),
    ].join('\n') + '\n'
  );
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function main(args = process.argv.slice(2)) {
  const dir = path.resolve(argumentValue(args, '--dir') || DEFAULT_FEED_DIR);
  const out = path.resolve(argumentValue(args, '--out') || DEFAULT_OUT);
  const keepAll = args.includes('--keep-all');
  const { captures, warnings, itemFiles } = loadCaptures(dir);
  if (!captures.length) throw new Error(`No valid feed captures in ${dir}.`);

  for (const warning of warnings) console.warn(`! ${warning}`);
  if (itemFiles) {
    console.warn(`! ignored ${itemFiles} item-page array(s); keep those under captures/items`);
  }

  const result = mergeCaptures(captures, { keepAll });
  for (const capture of captures) {
    console.log(
      `${capture.file.padEnd(58)} ${String(capture.data.listings.length).padStart(4)} rows, ` +
        `${String(capture.fresh).padStart(4)} new`
    );
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toCsv(result.rows));

  const repeats = result.rows.filter((row) => row.times_seen > 1).length;
  const overlapPct = result.rows.length
    ? Math.round((repeats / result.rows.length) * 100)
    : 0;

  console.log(`\n${captures.length} feed capture(s), ${result.totalRows} rows in`);
  if (result.dropped) {
    console.log(`${result.dropped} non-car rows dropped (--keep-all to retain)`);
  }
  console.log(`${result.rows.length} unique listings -> ${out}`);
  console.log(`${repeats} seen in more than one pass (${overlapPct}% overlap)`);
  console.log(`${result.rows.filter((row) => row.price_changed).length} price change(s) detected`);

  const needsReview = result.rows.filter((row) => row.review);
  if (needsReview.length) {
    const byReason = needsReview.reduce((acc, row) => {
      acc[row.review] = (acc[row.review] || 0) + 1;
      return acc;
    }, {});
    const breakdown = Object.entries(byReason)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(', ');
    console.log(
      `\n${needsReview.length} listing(s) cannot be triaged from the card title (${breakdown}).`
    );
    console.log('These count toward N and must be opened — see playbook §12.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  COLS,
  isNonCar,
  loadCaptures,
  mergeCaptures,
  reviewReason,
  toCsv,
};
