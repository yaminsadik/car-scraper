#!/usr/bin/env node
/**
 * Read-only consistency checks for private captures and local workflow state.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PATHS = {
  feeds: path.join(PROJECT_ROOT, 'captures', 'feeds'),
  items: path.join(PROJECT_ROOT, 'captures', 'items'),
  master: path.join(PROJECT_ROOT, 'captures', 'master.csv'),
  tracker: path.join(PROJECT_ROOT, 'seen_listings.md'),
  checkpoint: path.join(PROJECT_ROOT, 'search_checkpoint.md'),
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function trackerRows(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => /^\| \d+ /.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function addDuplicateErrors(values, label, errors) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  for (const [value, count] of counts) {
    if (count > 1) errors.push(`${label} ${value} appears ${count} times`);
  }
}

function validateFeedCaptures(dir, errors, warnings) {
  if (!fs.existsSync(dir)) {
    errors.push(`feed-capture directory is missing: ${dir}`);
    return { files: 0, rows: 0 };
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  let rows = 0;
  for (const file of files) {
    const full = path.join(dir, file);
    let capture;
    try {
      capture = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      errors.push(`${file} is not valid JSON: ${err.message}`);
      continue;
    }
    if (!capture || Array.isArray(capture) || !Array.isArray(capture.listings)) {
      errors.push(`${file} is not a feed-capture object with a listings array`);
      continue;
    }
    if (!capture.url || !capture.capturedAt) {
      errors.push(`${file} is missing url or capturedAt metadata`);
    }
    if (capture.count !== capture.listings.length) {
      errors.push(
        `${file} count=${capture.count} but contains ${capture.listings.length} listings`
      );
    }
    const ids = capture.listings.map((row) => String(row.id || ''));
    if (ids.some((id) => !id)) errors.push(`${file} contains a listing without an id`);
    addDuplicateErrors(ids.filter(Boolean), `${file} listing id`, errors);
    const unparsed = capture.listings.filter((row) => !row.parsed).length;
    if (unparsed) warnings.push(`${file} contains ${unparsed} unparsed card label(s)`);
    rows += capture.listings.length;
  }
  return { files: files.length, rows };
}

function validateItemCaptures(dir, errors) {
  if (!fs.existsSync(dir)) {
    errors.push(`item-capture directory is missing: ${dir}`);
    return { files: 0, rows: 0 };
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  let rows = 0;
  for (const file of files) {
    let items;
    try {
      items = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (err) {
      errors.push(`${file} is not valid JSON: ${err.message}`);
      continue;
    }
    if (!Array.isArray(items)) {
      errors.push(`${file} is not an item-page array`);
      continue;
    }
    if (items.some((item) => !item || !item.id || typeof item.text !== 'string')) {
      errors.push(`${file} contains an invalid item-page record`);
    }
    rows += items.length;
  }
  return { files: files.length, rows };
}

function validateMaster(file, errors, warnings) {
  if (!fs.existsSync(file)) {
    errors.push(`master CSV is missing: ${file}`);
    return { rows: 0, ids: new Set() };
  }

  const csv = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!csv.length) {
    errors.push('master CSV is empty');
    return { rows: 0, ids: new Set() };
  }
  const header = csv[0];
  const required = ['id', 'price', 'first_pass', 'last_pass', 'price_changed', 'label'];
  for (const column of required) {
    if (!header.includes(column)) errors.push(`master CSV is missing column: ${column}`);
  }

  const records = csv.slice(1).filter((row) => row.some(Boolean));
  const objects = records.map((row) =>
    Object.fromEntries(header.map((column, index) => [column, row[index] ?? '']))
  );
  addDuplicateErrors(objects.map((row) => row.id), 'master listing id', errors);

  for (const row of objects) {
    const labelPrice = row.label.match(/,\s*\$([\d,]+(?:\.\d+)?),/i)?.[1];
    if (
      labelPrice &&
      row.price !== '' &&
      Number(labelPrice.replace(/,/g, '')) !== Number(row.price)
    ) {
      errors.push(`master listing ${row.id} has price ${row.price} but label price ${labelPrice}`);
    }
    if (row.price_changed) {
      const latest = row.price_changed.split('->').at(-1);
      if (Number(latest) !== Number(row.price)) {
        errors.push(
          `master listing ${row.id} price history ends at ${latest}, not current price ${row.price}`
        );
      }
    }
    if (row.first_seen && row.last_seen && row.first_seen > row.last_seen) {
      errors.push(`master listing ${row.id} has first_seen after last_seen`);
    }
  }

  if (!objects.length) warnings.push('master CSV contains no listing rows');
  return { rows: objects.length, ids: new Set(objects.map((row) => row.id)) };
}

function validateTracker(file, errors) {
  if (!fs.existsSync(file)) {
    errors.push(`tracker is missing: ${file}`);
    return { rows: 0, ids: new Set() };
  }

  const rows = trackerRows(fs.readFileSync(file, 'utf8'));
  const ids = rows.map((row) => row[0]);
  addDuplicateErrors(ids, 'tracker listing id', errors);
  for (const row of rows) {
    if (row.length !== 22) {
      errors.push(`tracker listing ${row[0] || '(unknown)'} has ${row.length} columns, expected 22`);
    }
  }
  return { rows: rows.length, ids: new Set(ids) };
}

function validateCheckpoint(file, tracker, errors, warnings) {
  if (!fs.existsSync(file)) {
    errors.push(`checkpoint is missing: ${file}`);
    return;
  }
  const text = fs.readFileSync(file, 'utf8');
  const declared = text.match(/\| Listings in tracker \|\s*(\d+)\s*\|/)?.[1];
  if (!declared) {
    warnings.push('checkpoint does not declare a tracker listing count');
  } else if (Number(declared) !== tracker.ids.size) {
    errors.push(
      `checkpoint declares ${declared} tracker listings; tracker contains ${tracker.ids.size} unique ids`
    );
  }
  if (/12-cell grid|all 12 grid cells|4 price slices × 3 sorts/i.test(text)) {
    errors.push('checkpoint still refers to the retired 12-cell/3-sort grid');
  }
}

function runValidation(paths = PATHS) {
  const errors = [];
  const warnings = [];
  const feeds = validateFeedCaptures(paths.feeds, errors, warnings);
  const items = validateItemCaptures(paths.items, errors);
  const master = validateMaster(paths.master, errors, warnings);
  const tracker = validateTracker(paths.tracker, errors);
  validateCheckpoint(paths.checkpoint, tracker, errors, warnings);
  return { errors, warnings, stats: { feeds, items, master: master.rows, tracker: tracker.rows } };
}

function main() {
  const result = runValidation();
  console.log(
    `Validated ${result.stats.feeds.files} feed capture(s) / ${result.stats.feeds.rows} cards, ` +
      `${result.stats.items.files} item capture(s) / ${result.stats.items.rows} pages, ` +
      `${result.stats.master} master rows, and ${result.stats.tracker} tracker rows.`
  );
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
  for (const error of result.errors) console.error(`Error: ${error}`);
  if (result.errors.length) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  parseCsv,
  trackerRows,
  runValidation,
};
