#!/usr/bin/env node
/**
 * Filter the existing Tier 1 capture (captures/master.csv) down to German-make
 * candidates, as a separate, exploratory CSV that never touches
 * seen_listings.md or the approved-brand grid.
 *
 * Mechanical only, same spirit as merge.js: no scoring, no criteria decisions
 * beyond the same non-car / body-type / §3a card-level flags already used
 * elsewhere in this project. German brands are NOT on the playbook's approved
 * list (used_car_buying_playbook.md §2) — this script does not change that.
 * It only answers "what does the inventory already captured look like for
 * these brands," using data already sitting in master.csv from the approved-
 * brand sweep (no new scrolling or scraping required).
 *
 *   node german_brands.js
 *   node german_brands.js --makes "BMW,Audi" --out path/to/file.csv
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_IN = path.join(PROJECT_ROOT, 'captures', 'master.csv');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'captures', 'german_brands.csv');
const DEFAULT_MAKES = ['BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'MINI'];

// Additional motorcycle model leaks specific to German makes, on top of the
// generic NON_CAR_CLASS keyword check merge.js already applied before this
// data ever reached master.csv.
const BMW_MOTORCYCLE_MODEL =
  /\b(?:r\s*nine\s*t|r\d{3,4}(?:gs|rt|rs|r)?|s\s*1000\s*(?:rr|r|xr)?|f\s*\d{3}(?:gs|r|s)?|g\s*\d{3}(?:gs|r)?|k\s*1600|k\s*1300|c\s*400|c\s*650|r\s*18)\b/i;

const CONVERTIBLE_MODEL =
  /\b(?:convertible|cabriolet|cabrio|roadster|spyder|boxster|slk|z3|z4)\b/i;

const EXCLUDED_BODY_MODEL = /\b(?:pickup|minivan|cargo van|passenger van)\b/i;

const normalize = (value) => String(value || '').trim().toLowerCase();

function classify(row) {
  const label = String(row.label || '');
  const model = String(row.model || '');
  const year = Number(row.year);
  const price = Number(row.price);

  const isMotorcycle =
    normalize(row.make) === 'bmw' && BMW_MOTORCYCLE_MODEL.test(model);

  // z4 "Coupe" is a real hard-top coupe, not a roadster — don't mis-flag it.
  const isConvertible =
    CONVERTIBLE_MODEL.test(label) && !/\bcoupe\b/i.test(label);

  const isExcludedBody = EXCLUDED_BODY_MODEL.test(label);

  const isSuspectedDownPayment =
    !Number.isNaN(year) && !Number.isNaN(price) && year >= 2019 && price <= 10500;

  let status = 'Candidate';
  if (isMotorcycle) status = 'Excluded: not a car';
  else if (isExcludedBody) status = 'Excluded: body type';
  else if (isConvertible) status = 'Flagged: convertible (excluded by default, §2)';
  else if (isSuspectedDownPayment) status = 'Flagged: suspected down payment (§3a)';

  return { isMotorcycle, isConvertible, isExcludedBody, isSuspectedDownPayment, status };
}

function readMasterCsv(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n').filter((line) => line.length);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    header.forEach((key, index) => (row[key] = values[index] ?? ''));
    return row;
  });
}

// Minimal CSV line parser sufficient for master.csv's own csvEscape output
// (quoted fields only when they contain a comma, quote, or newline).
function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

const OUT_COLS = [
  'id',
  'year',
  'make',
  'model',
  'price',
  'city',
  'status',
  'best_rank',
  'times_seen',
  'price_changed',
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
      OUT_COLS.join(','),
      ...rows.map((row) => OUT_COLS.map((column) => csvEscape(row[column])).join(',')),
    ].join('\n') + '\n'
  );
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function main(args = process.argv.slice(2)) {
  const inFile = path.resolve(argumentValue(args, '--in') || DEFAULT_IN);
  const outFile = path.resolve(argumentValue(args, '--out') || DEFAULT_OUT);
  const makesArg = argumentValue(args, '--makes');
  const makes = new Set(
    (makesArg ? makesArg.split(',') : DEFAULT_MAKES).map((m) => m.trim())
  );

  if (!fs.existsSync(inFile)) {
    throw new Error(`No master CSV at ${inFile}. Run merge.js first.`);
  }

  const allRows = readMasterCsv(inFile);
  const rows = allRows.filter((row) => makes.has(row.make));

  const out = rows
    .map((row) => ({ row, cls: classify(row) }))
    .sort((a, b) => Number(a.row.price) - Number(b.row.price))
    .map(({ row, cls }) => ({ ...row, status: cls.status }));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, toCsv(out));

  const counts = {};
  for (const row of out) counts[row.status] = (counts[row.status] || 0) + 1;
  const byMake = {};
  for (const row of out) byMake[row.make] = (byMake[row.make] || 0) + 1;

  console.log(`${allRows.length} total rows in ${path.relative(PROJECT_ROOT, inFile)}`);
  console.log(`${rows.length} rows matched makes: ${[...makes].join(', ')}`);
  console.log(`-> ${path.relative(PROJECT_ROOT, outFile)}`);
  console.log('\nBy make:');
  for (const [make, count] of Object.entries(byMake).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${make}: ${count}`);
  }
  console.log('\nBy status:');
  for (const [status, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
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

module.exports = { classify, readMasterCsv, toCsv, DEFAULT_MAKES };
