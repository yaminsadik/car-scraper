#!/usr/bin/env node
//
// Seller-message work queue.
//
// This module renders the messages *you* send by hand. It never sends
// anything, never opens a Messenger thread, and never touches the network:
// it reads the tracker, picks the template the playbook says applies, fills
// the blanks, and puts the text on your clipboard. Playbook §11 is explicit
// that the agent must never contact sellers automatically, and Facebook bans
// accounts for scripted messaging — the send stays a human keystroke.
//
// No search rule lives here. The templates are read out of
// used_car_buying_playbook.md at run time and the distance bands out of its
// its §7 table, so the playbook stays the only place the rules exist
// (CLAUDE.md, "Single source of truth"). If a heading below stops matching,
// this fails loudly rather than falling back to a stale copy.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PLAYBOOK = path.join(ROOT, 'used_car_buying_playbook.md');
const TRACKER = path.join(ROOT, 'seen_listings.md');

// --- playbook extraction -----------------------------------------------

function sectionAfter(md, headingRe, what) {
  const m = md.match(headingRe);
  if (!m) {
    throw new Error(
      `Could not find ${what} in used_car_buying_playbook.md. ` +
        'The heading moved or was reworded — fix the pattern in msg.js rather ' +
        'than copying the text here; the playbook stays the source of truth.'
    );
  }
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const end = rest.search(/^#{2,3}\s/m);
  return end === -1 ? rest : rest.slice(0, end);
}

function blockquote(md, headingRe, what) {
  const body = sectionAfter(md, headingRe, what);
  const quoted = body
    .split('\n')
    .filter((l) => /^>\s?/.test(l))
    .map((l) => l.replace(/^>\s?/, '').trim())
    .filter(Boolean);
  if (!quoted.length) throw new Error(`No blockquote found under ${what}.`);
  return quoted.join(' ');
}

function extractTemplates(md) {
  return {
    price: blockquote(md, /^###\s+Price-verification message.*$/m, 'the price-verification message (§11)'),
    near: blockquote(md, /^###\s+Seller message template\s+—\s+near.*$/m, 'the near-distance template (§11)'),
    long: blockquote(md, /^###\s+Seller message template\s+—\s+long.*$/m, 'the long-drive template (§11)'),
  };
}

// §7's band table, as { city (lowercased) -> band }. Only used when a
// tracker row has no band written in its Location / Distance cell.
function extractBands(md) {
  const body = sectionAfter(md, /^##\s+7\..*$/m, 'the distance band table (§7)');
  const bands = new Map();
  for (const line of body.split('\n')) {
    const m = line.match(/^\|\s*\*\*([\d]+(?:[–-][\d]+|\+))\s*mi\*\*\s*\|(.+?)\|\s*$/);
    if (!m) continue;
    const band = normaliseBand(m[1]);
    for (const city of m[2].split(',')) {
      const key = city.trim().toLowerCase();
      if (key) bands.set(key, band);
    }
  }
  if (!bands.size) throw new Error('§7 band table parsed to nothing.');
  return bands;
}

function normaliseBand(raw) {
  return String(raw || '').replace(/\s+/g, '').replace(/-/g, '–');
}

// §5's Negotiability table — the three signals that say a seller is likely to
// move on price. Points, the days-on-market threshold, and the description
// keywords are all read out of the table rather than hardcoded, so editing §5
// changes the ranking. A missing row just drops that signal.
function extractNegotiability(md) {
  const body = sectionAfter(md, /^###\s+Negotiability\s*$/m, 'the negotiability table (§5)');
  const spec = { reduced: null, age: null, language: null };

  for (const line of body.split('\n')) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*([+-]?\d+)\s*\|\s*$/);
    if (!m) continue;
    const [, signal, rawPoints] = m;
    if (/^signal$/i.test(signal) || /^-+$/.test(signal)) continue;
    const points = Number(rawPoints);

    if (/reduc/i.test(signal)) {
      spec.reduced = { points };
    } else if (/listed\s+(\d+)\+?\s*days?/i.test(signal)) {
      spec.age = { points, days: Number(signal.match(/listed\s+(\d+)/i)[1]) };
    } else if (/description/i.test(signal)) {
      const keywords = [...signal.matchAll(/"([^"]+)"/g)].map((k) => k[1].toLowerCase());
      if (keywords.length) spec.language = { points, keywords };
    }
  }

  if (!spec.reduced && !spec.age && !spec.language) {
    throw new Error('§5 negotiability table parsed to nothing.');
  }
  return spec;
}

// The seller's own words live in Seller Fingerprint; Notes often quotes them.
// Both are searched, but "not negotiable" and "non-negotiable" must not count
// as a negotiability signal — that is the opposite of one.
function hasSellerLanguage(row, keywords) {
  const haystack = `${row['Seller Fingerprint'] || ''} ${row.Notes || ''}`;
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<!not\\s)(?<!non[-\\s])${escaped}`, 'i').test(haystack);
  });
}

// Returns { score, signals } — how likely this seller is to move on price,
// and which of §5's signals fired, so a ranking can be explained rather than
// just asserted.
function negotiabilityScore(row, spec) {
  let score = 0;
  const signals = [];

  if (spec.reduced && !blank(row['Price History'])) {
    score += spec.reduced.points;
    signals.push('reduced');
  }
  const days = Number(String(row['Days on Market'] || '').trim());
  if (spec.age && Number.isFinite(days) && days >= spec.age.days) {
    score += spec.age.points;
    signals.push(`${days}d`);
  }
  if (spec.language && hasSellerLanguage(row, spec.language.keywords)) {
    score += spec.language.points;
    signals.push('says-obo');
  }
  return { score, signals };
}

// --- tracker parsing ---------------------------------------------------

// Returns rows keyed by column name, each carrying the index of the line it
// came from so an update can rewrite that one line and nothing else.
function parseTracker(md) {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex((l) => /^\|\s*Listing ID\s*\|/.test(l));
  if (headerIdx === -1) throw new Error('No tracker table found in seen_listings.md.');

  const cells = (line) =>
    line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const columns = cells(lines[headerIdx]);

  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\|/.test(line)) continue;
    const values = cells(line);
    if (values.length !== columns.length) continue;
    const row = { lineIndex: i };
    columns.forEach((col, j) => {
      row[col] = values[j];
    });
    rows.push(row);
  }
  return { columns, rows, lines, headerIdx };
}

const blank = (v) => !v || /^(—|-|n\/a|none|unknown)$/i.test(String(v).trim());

function listingId(row) {
  const m = String(row['Listing ID'] || '').match(/\b(\d{8,})\b/);
  return m ? m[1] : null;
}

function listingUrl(row) {
  const fromCell = String(row.URL || '').match(/https?:\/\/\S*marketplace\/item\/\d+\/?/);
  if (fromCell) return fromCell[0];
  const id = listingId(row);
  return id ? `https://www.facebook.com/marketplace/item/${id}/` : null;
}

function bandOf(row, bands) {
  const cell = String(row['Location / Distance'] || '');
  const written = cell.match(/(\d+\s*[–-]\s*\d+|\d+\s*\+)\s*mi/);
  if (written) return normaliseBand(written[1]);
  const city = cell.split('/')[0].split(',').pop().trim().toLowerCase();
  return bands.get(city) || null;
}

const NEAR_BANDS = new Set(['0–10', '10–20']);
const BAND_MILES = { '0–10': 8, '10–20': 15, '20–30': 25, '30+': 35 };

// Statuses where a seller's answer still changes something. "Not yet
// evaluated" and "Must open" owe an open, not a message; rejections owe
// nothing.
function isEligible(row) {
  const status = String(row.Status || '').trim();
  return (
    /^active$/i.test(status) ||
    /^pending info$/i.test(status) ||
    /^suspected down payment$/i.test(status)
  );
}

// Playbook §11: the short price question goes first — "there is no point
// requesting a cold-start video for a car whose price turns out to be a
// monthly payment." Only `Cash (seller confirmed)` closes it (§12).
function stageFor(row) {
  if (!/seller[-\s]?confirmed/i.test(String(row['Price Type'] || ''))) {
    return { stage: 'price', why: `price type is "${row['Price Type'] || '—'}"` };
  }
  const vinMissing = blank(row['VIN Status']) || /^(not provided|not recorded|refused)/i.test(row['VIN Status']);
  const dashMissing =
    blank(row['Dashboard Status']) || /^(not recorded|unverified|refused)/i.test(row['Dashboard Status']);
  if (vinMissing || dashMissing) {
    const gaps = [vinMissing && 'VIN', dashMissing && 'dashboard'].filter(Boolean);
    return { stage: 'verify', why: `${gaps.join(' + ')} not recorded` };
  }
  return { stage: null, why: 'price confirmed, VIN and dashboard on file' };
}

// --- rendering ---------------------------------------------------------

function cleanVehicle(v) {
  return String(v || '')
    .replace(/\s+\d+D\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderMessage(row, stage, templates, band) {
  if (stage === 'price') {
    const price = String(row['Last Price'] || '').replace(/^\$/, '').trim();
    return templates.price.replace(/\[price\]/g, price || 'price');
  }
  const template = NEAR_BANDS.has(band) ? templates.near : templates.long;
  return template
    .replace(/\[year, make, model\]/g, cleanVehicle(row.Vehicle) || 'car')
    .replace(/\[X\]/g, String(BAND_MILES[band] || 30));
}

const scoreOf = (row) => {
  const n = Number(String(row.Score || '').trim());
  return Number.isFinite(n) ? n : -1;
};
const priceOf = (row) => {
  const n = Number(String(row['Last Price'] || '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : Infinity;
};

// Builds the display/message payload for one row, or null if nothing is
// owed — either because the row isn't in an eligible status, or because
// price, VIN and dashboard are all already on file. Shared by the ranked
// queue and by a listing named explicitly on the command line, so an
// explicit pick still gets the right template and can't be sent when there
// is genuinely nothing left to ask.
function itemFor(row, templates, bands, negSpec) {
  if (!row) return null;
  const { stage, why } = stageFor(row);
  if (!stage) return null;
  const band = bandOf(row, bands);
  const neg = negSpec ? negotiabilityScore(row, negSpec) : { score: 0, signals: [] };
  return {
    id: listingId(row),
    url: listingUrl(row),
    vehicle: cleanVehicle(row.Vehicle),
    price: row['Last Price'] || '—',
    band: band || '?',
    status: row.Status,
    score: scoreOf(row),
    tier: row.Tier || '',
    title: row['Title Status'] || '',
    neg: neg.score,
    negSignals: neg.signals,
    stage,
    why,
    message: renderMessage(row, stage, templates, band),
    row,
  };
}

// Sorting is a re-ranking, never a filter — nothing leaves the queue because
// of how it is ordered. `score` is the playbook's own §5 quality score, where
// a clean title is worth +2, so a good clean-title deal stays near the top by
// default. `negotiability` reorders by how likely the seller is to move on
// price. Both numbers travel with every item either way, so a listing that is
// strong on one axis is still visible when sorted by the other.
const SORTS = {
  score: (a, b) => b.score - a.score || priceOf(a.row) - priceOf(b.row),
  negotiability: (a, b) => b.neg - a.neg || b.score - a.score || priceOf(a.row) - priceOf(b.row),
};

function buildQueue(rows, templates, bands, opts = {}) {
  const queue = [];
  for (const row of rows) {
    if (!isEligible(row)) continue;
    const item = itemFor(row, templates, bands, opts.negotiability);
    if (!item) continue;
    if (opts.stage && opts.stage !== item.stage) continue;
    if (opts.minScore != null && item.score < opts.minScore) continue;
    queue.push(item);
  }
  const sort = SORTS[opts.sort || 'score'];
  if (!sort) throw new Error(`--sort takes ${Object.keys(SORTS).join(' or ')}.`);
  queue.sort(sort);
  return queue;
}

// Listings named explicitly (by you, or by an agent you told which ones to
// message) rather than pulled off the ranked queue. Order is whatever order
// they were named in — a deliberate pick isn't re-ranked by score. Each
// entry is either an item (still owed something) or a skip reason (unknown
// id, or nothing left to ask), so the caller can report both.
function pickQueue(rows, templates, bands, ids, negSpec) {
  const picked = [];
  const skipped = [];
  for (const id of ids) {
    const row = rows.find((r) => listingId(r) === String(id));
    if (!row) {
      skipped.push({ id, reason: 'no tracker row with this Listing ID' });
      continue;
    }
    const item = itemFor(row, templates, bands, negSpec);
    if (!item) {
      skipped.push({ id, reason: 'nothing owed — price confirmed, VIN and dashboard on file' });
      continue;
    }
    picked.push(item);
  }
  return { picked, skipped };
}

// --- tracker update ----------------------------------------------------

// Rewrites exactly one line. Everything else in the file is byte-identical:
// seen_listings.md is update-in-place data and must never be regenerated.
function markSent(md, id, { date, stage, note }) {
  const { rows, lines, columns } = parseTracker(md);
  const matches = rows.filter((r) => listingId(r) === String(id));
  if (!matches.length) throw new Error(`No tracker row with Listing ID ${id}.`);
  if (matches.length > 1) throw new Error(`Listing ID ${id} appears on ${matches.length} rows — fix the duplicate first.`);

  const row = matches[0];
  const changes = [];
  const label = stage === 'price' ? '§11 price-verification' : '§11 verification request';
  const stamp = note || `${label} sent ${date} (awaiting reply).`;

  const updated = { ...row };
  if (row['Last Seen'] !== date) {
    changes.push(`Last Seen ${row['Last Seen'] || '—'} -> ${date}`);
    updated['Last Seen'] = date;
  }
  // Pending info means "a field we need is simply absent" (§12) — exactly the
  // state a sent question puts an Active row into. A down-payment suspicion is
  // its own flag and is left alone.
  if (/^active$/i.test(String(row.Status || '').trim())) {
    changes.push(`Status Active -> Pending info`);
    updated.Status = 'Pending info';
  }
  if (!String(row.Notes || '').includes(stamp)) {
    updated.Notes = blank(row.Notes) ? stamp : `${row.Notes} ${stamp}`;
    changes.push(`Notes += "${stamp}"`);
  }

  const rebuilt = '| ' + columns.map((c) => updated[c] ?? '').join(' | ') + ' |';
  const out = lines.slice();
  out[row.lineIndex] = rebuilt;
  return { text: out.join('\n'), changes, row: updated };
}

function load(trackerPath = TRACKER, playbookPath = PLAYBOOK) {
  for (const [file, what] of [[playbookPath, 'playbook'], [trackerPath, 'tracker']]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${what}: ${file}`);
  }
  const playbook = fs.readFileSync(playbookPath, 'utf8');
  const tracker = fs.readFileSync(trackerPath, 'utf8');
  return {
    tracker,
    templates: extractTemplates(playbook),
    bands: extractBands(playbook),
    negotiability: extractNegotiability(playbook),
    ...parseTracker(tracker),
  };
}

module.exports = {
  PLAYBOOK,
  TRACKER,
  extractTemplates,
  extractBands,
  parseTracker,
  bandOf,
  isEligible,
  stageFor,
  renderMessage,
  cleanVehicle,
  extractNegotiability,
  negotiabilityScore,
  buildQueue,
  pickQueue,
  itemFor,
  markSent,
  listingId,
  listingUrl,
  load,
};
