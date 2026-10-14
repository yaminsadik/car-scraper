#!/usr/bin/env node
//
// Deal tracker — Tier 3.
//
// `seen_listings.md` answers "have I seen this car, and why did I keep or drop
// it?" across ~1,700 rows. It is the wrong shape for the question that starts
// the moment a seller replies: "where does this conversation stand, what did
// the VIN say, what did the photos show, and when am I seeing the car?"
// Answering that in the big tracker means rewriting a megabyte-sized table to
// change one cell.
//
// So a deal gets its own file: deals/<listing-id>.md, a couple of kilobytes,
// cheap to read whole and cheap to edit. deals/INDEX.md is regenerated from
// those files and is the only thing you need to read to see the whole board.
//
// No search rule lives here. The pre-visit requirements are read out of
// used_car_buying_playbook.md §11 at run time and the distance bands out of
// §7, so the playbook stays the only place the rules exist (CLAUDE.md,
// "Single source of truth"). This module decides nothing about which cars are
// worth buying; it records what happened to the ones already shortlisted.
//
// It never contacts a seller. Playbook §11: the send stays a human keystroke.

const fs = require('fs');
const path = require('path');

const msg = require('./msg.js');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals');
const INDEX = path.join(DEALS, 'INDEX.md');
const CAPTURES = path.join(ROOT, 'captures');

const UNSET = '—';
const blank = (v) => !v || v === UNSET || !String(v).trim();

// The workflow position. Ordered, because the board sorts by it and because
// "did this move forward?" is the question the index exists to answer.
const STAGES = [
  'queued',        // shortlisted, nothing sent yet
  'asked-price',   // §11 price-verification message sent
  'asked-vin',     // §11 near/long template sent — VIN + dashboard requested
  'has-vin',       // VIN in hand, history not yet run
  'vin-checked',   // history report run and filed
  'ready',         // everything §11 requires for this band is satisfied
  'scheduled',     // appointment set
  'visited',       // saw the car
  'closed',        // terminal — see outcome
];

const OUTCOMES = ['bought', 'passed', 'sold-to-other', 'ghosted', 'scam', 'price-too-high'];

// Frontmatter keys, in file order. Everything here is one short line, so a
// deal file stays small enough to read in full without thinking about it.
const FIELDS = [
  'listing_id',
  'vehicle',
  'url',
  'price',
  'effective_cash_price',
  'mileage',
  'title_status',
  'location',
  'band',
  'seller',
  'stage',
  'next_action',
  'next_action_date',
  'vin',
  'vin_report',
  'thread_key',
  'photos_seen',
  'photos_reviewed',
  'dashboard',
  'coldstart_video',
  'odometer_photo',
  'title_confirmed',
  'price_confirmed',
  'appointment',
  'appointment_place',
  'outcome',
  'first_contact',
  'updated',
];

const SECTIONS = ['Listing description', 'VIN & history', 'Photos', 'Appointment', 'Timeline'];

// --- playbook extraction -----------------------------------------------

// §11's pre-visit table is prose, deliberately: it is written for a human
// about to spend an hour driving. What is mechanical about it is which
// recorded facts each row demands, so that is the only part read in code —
// the requirement text itself stays in the playbook and is printed verbatim.
const REQUIREMENT_KEYS = [
  [/17[-\s]?character VIN|complete VIN|\bVIN\b/i, 'vin'],
  [/running[-\s]?dashboard photo|dashboard photo/i, 'dashboard'],
  [/title status/i, 'title_confirmed'],
  [/cash price/i, 'price_confirmed'],
  [/cold[-\s]?start[^|]*video/i, 'coldstart_video'],
  [/odometer photo/i, 'odometer_photo'],
  [/appointment window/i, 'appointment'],
];

function extractRequirements(playbook) {
  const m = playbook.match(/^##\s+11\..*$/m);
  if (!m) throw new Error('Could not find §11 in used_car_buying_playbook.md.');
  const rest = playbook.slice(m.index);
  const end = rest.search(/^##\s+12\./m);
  const body = end === -1 ? rest : rest.slice(0, end);

  const reqs = new Map();
  const order = [];
  for (const line of body.split('\n')) {
    const row = line.match(/^\|\s*\*\*([\d]+(?:[–-][\d]+|\+))\s*mi\*\*\s*\|(.+?)\|\s*$/);
    if (!row) continue;
    const band = row[1].replace(/-/g, '–').replace(/\s+/g, '') + 'mi';
    const text = row[2].replace(/\*\*/g, '').trim();
    const fields = REQUIREMENT_KEYS.filter(([re]) => re.test(text)).map(([, f]) => f);
    // "The above, plus…" / "All of the above, plus…" — the table is cumulative,
    // so a far car owes everything a near car owes and then some.
    const cumulative = /the above/i.test(text) && order.length
      ? [...reqs.get(order[order.length - 1]).fields]
      : [];
    reqs.set(band, { band, text, fields: [...new Set([...cumulative, ...fields])] });
    order.push(band);
  }
  if (!reqs.size) {
    throw new Error(
      'The §11 pre-visit table parsed to nothing. The heading or table moved — ' +
        'fix the pattern in deal.js rather than copying the requirements here; ' +
        'the playbook stays the source of truth.'
    );
  }
  return reqs;
}

// What §11 still owes on this deal, given its distance band.
function owed(deal, requirements) {
  const band = normaliseBand(deal.band);
  const req = requirements.get(band) || requirements.get([...requirements.keys()].pop());
  const missing = req.fields.filter((f) => blank(deal[f]));
  return { band: req.band, text: req.text, fields: req.fields, missing };
}

// Unreviewed photos are not a §11 requirement — §11 asks for a dashboard
// photo, not for an inbox to be empty — so this is kept out of `owed()` and
// reported separately. It is the one gap the tool can detect but cannot close:
// it knows an image arrived and knows nobody has looked at it, and that is
// exactly the handoff a smaller model needs spelled out rather than inferred.
function pendingPhotos(deal) {
  const seen = Number(deal.photos_seen) || 0;
  const reviewed = Number(deal.photos_reviewed) || 0;
  return Math.max(0, seen - reviewed);
}

function normaliseBand(b) {
  if (!b || b === UNSET) return null;
  return String(b).replace(/-/g, '–').replace(/\s+/g, '').replace(/mi.*$/i, '') + 'mi';
}

// --- VIN ----------------------------------------------------------------

// A transcription slip in a VIN is worth catching before you pay for a history
// report on the wrong car, let alone before you drive an hour. The check digit
// is arithmetic — no network, no lookup — so there is no reason not to run it.
const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
const REGIONS = {
  1: 'USA', 4: 'USA', 5: 'USA', 2: 'Canada', 3: 'Mexico', 9: 'Brazil',
  J: 'Japan', K: 'Korea', L: 'China', S: 'UK', W: 'Germany',
  V: 'France/Spain', Y: 'Sweden/Finland', Z: 'Italy', 6: 'Australia', T: 'Europe',
};

function vinCheck(raw, listedYear) {
  const vin = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const problems = [];
  if (vin.length !== 17) {
    problems.push(`${vin.length} characters, not 17 — that is a partial VIN, and §11 says a partial VIN is a "don't schedule".`);
    return { vin, ok: false, problems };
  }
  if (/[IOQ]/.test(vin)) problems.push('contains I, O or Q — those letters are not used in VINs, so a 1/0 was mistyped.');

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? Number(c) : TRANSLIT[c];
    if (v === undefined) { problems.push(`illegal character "${c}" at position ${i + 1}.`); return { vin, ok: false, problems }; }
    sum += v * WEIGHTS[i];
  }
  const expected = sum % 11 === 10 ? 'X' : String(sum % 11);
  const checkOk = vin[8] === expected;
  if (!checkOk) problems.push(`check digit is "${vin[8]}", should be "${expected}" — the VIN is mistyped or made up. Ask the seller to resend it as a photo of the door jamb or windshield plate.`);

  const idx = YEAR_CODES.indexOf(vin[9]);
  const modelYear = idx === -1 ? null : idx < 21 ? 2010 + idx : 2001 + (idx - 21);
  const region = REGIONS[vin[0]] || 'unknown region';

  if (modelYear && listedYear && modelYear !== Number(listedYear)) {
    problems.push(
      `decodes to model year ${modelYear}, listing says ${listedYear}` +
        (modelYear - 30 === Number(listedYear) || modelYear + 30 === Number(listedYear)
          ? ' (30-year VIN year cycle — probably fine, confirm against the title).'
          : ' — §11 says confirm it decodes to the advertised year/make/model before going further.')
    );
  }
  return { vin, ok: checkOk && !problems.length, checkOk, expected, modelYear, region, problems };
}


// One VIN on more than one listing is not a coincidence. §6 already treats a
// repeated seller fingerprint as a curbstoning signal; a repeated *VIN* is the
// same signal with the excuse removed — the seller is answering "send me the
// VIN" with a number that belongs to some other car. Cheap to detect once the
// VINs are collected in one place, so it runs on every board and index.
function duplicateVins(deals, trackerMd) {
  const seen = new Map();
  const add = (vin, where) => {
    const v = String(vin || '').toUpperCase();
    // A tracker row whose ID cell isn't a plain listing number has nothing to
    // report against; counting it would inflate the duplicate count with null.
    if (!where || !/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return;
    if (!seen.has(v)) seen.set(v, new Set());
    seen.get(v).add(where);
  };
  for (const d of deals) add(d.vin, d.listing_id);
  if (trackerMd) {
    for (const row of msg.parseTracker(trackerMd).rows) {
      const m = String(row['VIN Status'] || '').match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
      if (m) add(m[1], msg.listingId(row));
    }
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([vin, ids]) => ({ vin, listings: [...ids].sort() }));
}

// --- deal files ---------------------------------------------------------

function parseDeal(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('Deal file has no frontmatter block.');
  const deal = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) deal[kv[1]] = kv[2].trim();
  }
  const body = text.slice(m[0].length);
  const sections = {};
  const re = /^##\s+(.+)$/gm;
  let hit;
  const marks = [];
  while ((hit = re.exec(body))) marks.push({ name: hit[1].trim(), start: hit.index + hit[0].length });
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? body.lastIndexOf('\n##', marks[i + 1].start) : body.length;
    sections[mk.name] = body.slice(mk.start, end).trim();
  });
  return { ...deal, _sections: sections };
}

function renderDeal(deal) {
  const front = FIELDS.map((f) => `${f}: ${deal[f] === undefined || deal[f] === '' ? UNSET : deal[f]}`).join('\n');
  const s = deal._sections || {};
  const body = SECTIONS.map((name) => `## ${name}\n\n${s[name] ? s[name] : '_not recorded_'}\n`).join('\n');
  const title = `# ${deal.vehicle || deal.listing_id}${blank(deal.price) ? '' : ` — ${deal.price}`}`;
  return `---\n${front}\n---\n\n${title}\n\n${body}`;
}

function dealPath(id) {
  return path.join(DEALS, `${String(id).replace(/[^0-9]/g, '')}.md`);
}

function listDeals(dir = DEALS) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.md$/.test(f))
    .map((f) => ({ file: path.join(dir, f), ...parseDeal(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

// --- seeding ------------------------------------------------------------

// A deal is opened from the tracker row, not typed by hand: the vehicle,
// price, mileage, title, band and seller fingerprint are already known and
// re-typing them is how two records start disagreeing.
function seedFromRow(row, band, description, today) {
  const id = msg.listingId(row);
  const deal = {
    listing_id: id,
    vehicle: msg.cleanVehicle(row.Vehicle),
    url: msg.listingUrl(row),
    price: row['Last Price'] || UNSET,
    effective_cash_price: row['Effective Cash Price'] || UNSET,
    mileage: row.Mileage || UNSET,
    title_status: row['Title Status'] || UNSET,
    location: row['Location / Distance'] || UNSET,
    band: band || UNSET,
    seller: (row['Seller Fingerprint'] || UNSET).split(';')[0].trim(),
    stage: 'queued',
    next_action: 'send §11 price-verification message',
    next_action_date: today,
    vin: UNSET,
    vin_report: UNSET,
    thread_key: UNSET,
    photos_seen: UNSET,
    photos_reviewed: UNSET,
    dashboard: UNSET,
    coldstart_video: UNSET,
    odometer_photo: UNSET,
    title_confirmed: UNSET,
    price_confirmed: /seller[-\s]?confirmed/i.test(row['Price Type'] || '') ? row['Price Type'] : UNSET,
    appointment: UNSET,
    appointment_place: UNSET,
    outcome: UNSET,
    first_contact: UNSET,
    updated: today,
  };

  // Carry the state the tracker already knows, so opening a deal never loses
  // a fact that was recorded before this file existed.
  const vinCell = row['VIN Status'] || '';
  const foundVin = vinCell.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i);
  if (foundVin) { deal.vin = foundVin[1].toUpperCase(); deal.stage = 'has-vin'; }
  // §11 counts a running-dashboard photo, not the seller's word for it: an
  // engine-off photo already proves nothing, and "no warning lights" typed in
  // a message proves less. Only a recorded observation carries over; anything
  // hedged as a claim leaves the field empty so the chase list still shows it.
  const dash = String(row['Dashboard Status'] || '').trim();
  if (/^(verified clear|warning lights)\b/i.test(dash) && !/claim|unverified|not recorded/i.test(dash)) {
    deal.dashboard = dash;
  } else if (dash && !/^(not recorded|unverified|not provided|—)$/i.test(dash)) {
    deal._claimedDashboard = dash;
  }

  deal._sections = {
    'Listing description': description || '_no capture on file — paste the seller\'s description here._',
    'VIN & history': foundVin ? `VIN from tracker: \`${deal.vin}\` (history report not filed yet).` : '_no VIN yet._',
    Photos: '_no photos reviewed yet._',
    Appointment: '_not scheduled._',
    Timeline: `- ${today} — deal opened from \`seen_listings.md\`. Tracker status was \`${row.Status || UNSET}\`, score ${row.Score || UNSET}, ${row.Tier || UNSET}.`,
  };
  if (deal._claimedDashboard) {
    deal._sections.Photos =
      `_no dashboard photo yet._ The tracker records an unverified seller claim: ` +
      `"${deal._claimedDashboard}". §11 needs a photo of the dashboard with the engine ` +
      `running in Park, odometer and warning-light area visible — a claim does not clear this.`;
    delete deal._claimedDashboard;
  }
  if ((row.Notes || '').trim() && row.Notes !== UNSET) {
    deal._sections.Timeline += `\n- ${today} — carried from tracker notes: ${row.Notes.trim()}`;
  }
  return deal;
}

// The seller's own words are the part of a listing that goes stale fastest —
// listings get edited and deleted — so the description is copied into the deal
// file rather than left behind a link.
function descriptionFor(id, capturesDir = CAPTURES) {
  const files = [];
  for (const dir of [capturesDir, path.join(capturesDir, 'items')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) files.push(path.join(dir, f));
  }
  for (const file of files.reverse()) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!raw.includes(String(id))) continue;
    let items;
    try { items = JSON.parse(raw); } catch { continue; }
    const item = (Array.isArray(items) ? items : [items]).find((x) => String(x.id) === String(id));
    if (!item || !item.text) continue;
    const m = item.text.match(/Seller's description\s*\n([\s\S]*?)(?:\n\s*See translation|\n[^\n]*·\s*Location is approximate|\nSeller information)/);
    const desc = m ? m[1].trim() : null;
    if (desc) return `${desc}\n\n_(captured from \`${path.relative(ROOT, file)}\`)_`;
  }
  return null;
}


// A freshly opened deal already knows what it is waiting for: §11's table for
// its band, minus what the tracker could tell us. Setting the next action from
// that gap is the difference between a board you can work off and a list of
// twenty rows all claiming the same generic next step.
function applyGap(deal, requirements, when) {
  const gap = owed(deal, requirements);
  if (!gap.missing.length) {
    deal.stage = STAGES.indexOf(deal.stage) < STAGES.indexOf('ready') ? 'ready' : deal.stage;
    deal.next_action = `§11 satisfied for ${gap.band} — book the visit`;
  } else if (gap.missing.includes('price_confirmed') && blank(deal.price_confirmed)) {
    deal.next_action = 'send §11 price-verification message (node mp.js msg ' + deal.listing_id + ' --next)';
  } else if (gap.missing.includes('vin')) {
    deal.next_action = 'send §11 verification request — VIN first (node mp.js msg ' + deal.listing_id + ' --next)';
  } else {
    deal.next_action = `chase ${gap.missing.join(', ')}`;
  }
  deal.next_action_date = when;
  return gap;
}

// --- index --------------------------------------------------------------

// The whole point: this file is what gets read to see the board, so it has to
// stay small. One line per deal, no prose — the prose is in the deal file.
function renderIndex(deals, today, warnings = []) {
  const rank = (d) => {
    const i = STAGES.indexOf(d.stage);
    return i === -1 ? STAGES.length : i;
  };
  const open = deals.filter((d) => d.stage !== 'closed');
  const closed = deals.filter((d) => d.stage === 'closed');
  const overdue = (d) => !blank(d.next_action_date) && d.next_action_date <= today && d.stage !== 'closed';

  const row = (d) =>
    `| ${overdue(d) ? '**' + (d.next_action_date || '') + '**' : d.next_action_date || UNSET} | ${d.stage} | ${d.vehicle} | ${d.price} | ${(d.band || UNSET).replace('mi', '')} | ` +
    `${blank(d.vin) ? '—' : '✓'} | ${blank(d.dashboard) ? '—' : '✓'} | ${blank(d.appointment) ? '—' : d.appointment} | ` +
    `${pendingPhotos(d) ? `**${pendingPhotos(d)} unreviewed photo(s)** — ` : ''}${d.next_action} | [${d.listing_id}](${d.url}) |`;

  const head =
    '| Next | Stage | Vehicle | Price | Band | VIN | Dash | Appt | Next action | Listing |\n' +
    '|---|---|---|---|---|---|---|---|---|---|';

  const byStage = open.reduce((a, d) => ({ ...a, [d.stage]: (a[d.stage] || 0) + 1 }), {});
  const summary = STAGES.filter((s) => byStage[s]).map((s) => `${byStage[s]} ${s}`).join(' · ') || 'none open';

  return [
    '# Deal Index',
    '',
    'Generated by `node mp.js deal index` — **do not hand-edit**. Every line here',
    'comes from a `deals/<listing-id>.md` file; edit that file (or use',
    '`node mp.js deal set|log|vin|appt`) and regenerate.',
    '',
    'This is Tier 3 of the log (playbook §12): `captures/master.csv` is every card',
    'ever seen, `seen_listings.md` is every car triaged, and `deals/` is the handful',
    'that turned into a conversation. Discovery facts stay in `seen_listings.md`;',
    'what a seller said, what the VIN showed, and when you are seeing the car live here.',
    '',
    `**${open.length} open** (${summary}) · ${closed.length} closed · updated ${today}`,
    '',
    ...(warnings.length
      ? ['## ⚠ Repeated VINs', '', 'One VIN on several listings — the seller answered the VIN request with some',
         'other car. Curbstoner signal (§6); do not drive to any of these on that VIN.', '',
         ...warnings.map((w) => `- \`${w.vin}\` — ${w.listings.join(', ')}`), '']
      : []),
    '## Open',
    '',
    open.length ? head : '_none._',
    ...open.sort((a, b) => rank(a) - rank(b) || String(a.next_action_date).localeCompare(String(b.next_action_date))).map(row),
    '',
    '## Closed',
    '',
    closed.length ? head : '_none._',
    ...closed.map(row),
    '',
  ].join('\n');
}

// --- tracker sync -------------------------------------------------------

// The deal file is the authority on a conversation; `seen_listings.md` keeps
// its one-cell summary so a sweep that never opens the deal file still sees
// that a VIN exists. Written mechanically, one line rewritten, same as
// msg.markSent does.
function syncRow(md, deal) {
  const { rows, lines, columns } = msg.parseTracker(md);
  const matches = rows.filter((r) => msg.listingId(r) === String(deal.listing_id));
  if (!matches.length) throw new Error(`No tracker row with Listing ID ${deal.listing_id}.`);
  if (matches.length > 1) throw new Error(`Listing ID ${deal.listing_id} appears on ${matches.length} rows — fix the duplicate first.`);

  const row = matches[0];
  const updated = { ...row };
  const changes = [];
  const set = (col, val) => {
    if (val && updated[col] !== val) { changes.push(`${col}: ${updated[col] || UNSET} -> ${val}`); updated[col] = val; }
  };

  if (!blank(deal.vin)) set('VIN Status', `Provided (${deal.vin})`);
  if (!blank(deal.dashboard)) set('Dashboard Status', deal.dashboard);
  if (!blank(deal.effective_cash_price)) set('Effective Cash Price', deal.effective_cash_price);
  if (!blank(deal.price_confirmed) && /confirmed/i.test(deal.price_confirmed)) set('Price Type', deal.price_confirmed);
  if (deal.stage === 'closed' && !blank(deal.outcome)) {
    set('Status', deal.outcome === 'bought' ? 'Sold' : deal.outcome === 'sold-to-other' ? 'Sold' : 'Deprioritized');
  }
  const pointer = `Deal file: deals/${deal.listing_id}.md.`;
  if (!String(updated.Notes || '').includes(pointer)) {
    updated.Notes = blank(updated.Notes) ? pointer : `${updated.Notes} ${pointer}`;
    changes.push(`Notes += "${pointer}"`);
  }

  const out = lines.slice();
  out[row.lineIndex] = '| ' + columns.map((c) => updated[c] ?? '').join(' | ') + ' |';
  return { text: out.join('\n'), changes };
}


// --- CLI ----------------------------------------------------------------
//
// Kept here rather than in mp.js because nothing about a deal touches the
// browser: mp.js is the DevTools Protocol client, and this command never
// connects to Chrome.

const PLAYBOOK = path.join(ROOT, 'used_car_buying_playbook.md');
const TRACKER = path.join(ROOT, 'seen_listings.md');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEAL_USAGE = [
  'Deal tracker (Tier 3) — one file per conversation, in deals/.',
  '',
  '  deal                              the board: every open deal, most urgent first',
  '  deal due                          only what is owed today, with the §11 gap for each',
  '  deal <id>                         print one deal file',
  '  deal open <id...>                 create deals/<id>.md, seeded from seen_listings.md',
  '  deal set <id> k=v [k=v...]        update frontmatter (stage, next_action, price_confirmed, …)',
  '  deal log <id> "what happened"     append a dated line to the Timeline',
  '  deal note <id> <section> "text"   append to Listing description | VIN & history | Photos | Appointment',
  '  deal vin <id> <VIN>               record + validate a VIN (check digit, model year, region)',
  '  deal thread <id> "<key>"          bind this deal to an inbox conversation (from: node mp.js inbox)',
  '  deal appt <id> "<when>" [--where "<place>"]   record an appointment',
  '  deal close <id> <outcome>         ' + OUTCOMES.join(' | '),
  '  deal index                        regenerate deals/INDEX.md',
  '',
  '  vin and close write back to seen_listings.md by default (VIN/dashboard/price',
  '  cells) — pass --no-sync to skip that. --dry prints what would change, writes nothing.',
].join('\n');

function loadDeal(id) {
  const file = dealPath(id);
  if (!fs.existsSync(file)) {
    throw new Error(`No deal file for ${id}. Open one first:\n  node mp.js deal open ${id}`);
  }
  return { file, deal: parseDeal(fs.readFileSync(file, 'utf8')) };
}

function saveDeal(file, deal, opts) {
  deal.updated = today();
  if (opts.dry) { console.log(`[dry] would write ${path.relative(ROOT, file)}`); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderDeal(deal));
}

function appendSection(deal, name, text) {
  const cur = (deal._sections[name] || '').replace(/^_[^_]*_$/, '').trim();
  deal._sections[name] = cur ? `${cur}\n\n${text}` : text;
}

function logLine(deal, text) {
  const cur = (deal._sections.Timeline || '').trim();
  deal._sections.Timeline = `${cur}\n- ${today()} — ${text}`.trim();
}

function writeIndex(opts) {
  const deals = listDeals();
  const tracker = fs.existsSync(TRACKER) ? fs.readFileSync(TRACKER, 'utf8') : null;
  const warnings = duplicateVins(deals, tracker).filter((d) =>
    d.listings.some((id) => deals.some((x) => x.listing_id === id && x.stage !== 'closed'))
  );
  const text = renderIndex(deals, today(), warnings);
  if (opts.dry) { console.log(text); return deals.length; }
  fs.mkdirSync(DEALS, { recursive: true });
  fs.writeFileSync(INDEX, text);
  return deals.length;
}

function maybeSync(deal, opts) {
  if (!opts.sync) return;
  const md = fs.readFileSync(TRACKER, 'utf8');
  const { text, changes } = syncRow(md, deal);
  if (!changes.length) { console.log('seen_listings.md: already current.'); return; }
  if (opts.dry) { console.log('[dry] seen_listings.md:\n  ' + changes.join('\n  ')); return; }
  fs.writeFileSync(TRACKER, text);
  console.log('seen_listings.md updated:\n  ' + changes.join('\n  '));
}

// Hand over the file, not the fact that a file exists. Anything downstream —
// a person, or a smaller model being told what to do — should not have to go
// looking for the image it is being asked to read.
function unreviewedFiles(deal, threadsRoot) {
  if (blank(deal.thread_key)) return [];
  let inbox;
  try { inbox = require('./inbox.js'); } catch { return []; }
  const dir = inbox.threadDir(deal.thread_key);
  const manifest = inbox.readManifest(dir);
  return manifest.images
    .filter((i) => !i.reviewed)
    .map((i) => path.relative(ROOT, path.join(dir, i.file)));
}

// Clearing the flag has to touch the manifest as well as the count, or the
// next `mp.js thread` read would re-offer images you have already looked at.
function markPhotosReviewed(deal, opts) {
  const before = pendingPhotos(deal);
  if (!before) return 0;
  deal.photos_reviewed = String(Number(deal.photos_seen) || 0);
  if (!blank(deal.thread_key) && !opts.dry) {
    try {
      const inbox = require('./inbox.js');
      const dir = inbox.threadDir(deal.thread_key);
      const manifest = inbox.readManifest(dir);
      manifest.images.forEach((i) => { i.reviewed = true; });
      inbox.writeManifest(dir, manifest);
    } catch { /* no capture on disk yet — the count is still the record */ }
  }
  return before;
}

function printBoard(deals, requirements, onlyDue) {
  const now = today();
  const rank = (d) => { const i = STAGES.indexOf(d.stage); return i === -1 ? STAGES.length : i; };
  let open = deals.filter((d) => d.stage !== 'closed');
  if (onlyDue) open = open.filter((d) => !blank(d.next_action_date) && d.next_action_date <= now);
  open.sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)) || rank(a) - rank(b));

  const dupes = duplicateVins(deals, fs.existsSync(TRACKER) ? fs.readFileSync(TRACKER, 'utf8') : null)
    .filter((d) => d.listings.some((id) => open.some((o) => o.listing_id === id)));
  for (const dup of dupes) {
    console.log(`!! VIN ${dup.vin} is on ${dup.listings.length} listings:`);
    for (const id of dup.listings) {
      const d = deals.find((x) => x.listing_id === id);
      console.log(`   ${id}  ${d ? `${d.vehicle} ${d.price} ${d.location}` : '(tracker row, no deal file)'}`);
    }
    console.log(
      '   Same vehicle and price across all of them means one car relisted.\n' +
        '   Different vehicles, prices or cities means the seller answered the VIN\n' +
        '   request with some other car — curbstoner network (§6). Check before driving.\n'
    );
  }
  if (!open.length) {
    console.log(onlyDue ? 'Nothing owed today.' : 'No open deals. Start one with: node mp.js deal open <listing id>');
    return;
  }
  console.log(`${open.length} ${onlyDue ? 'owed today' : 'open deal(s)'} — ${deals.length - open.length} closed\n`);
  for (const d of open) {
    const gap = owed(d, requirements);
    const late = !blank(d.next_action_date) && d.next_action_date < now;
    console.log(
      `${late ? '!' : ' '} ${(d.next_action_date || '—').padEnd(11)} ${d.stage.padEnd(12)} ${String(d.vehicle).slice(0, 34).padEnd(34)} ` +
        `${String(d.price).padEnd(8)} ${(d.band || '—').padEnd(8)} ${d.listing_id}`
    );
    console.log(`    next: ${d.next_action}`);
    const waiting = pendingPhotos(d);
    if (waiting) {
      const dir = path.join(ROOT, 'captures', 'threads');
      console.log(`    BLOCKED — needs you: ${waiting} unreviewed image(s)`);
      for (const f of unreviewedFiles(d, dir)) console.log(`      ${f}`);
      console.log(`      look, then: node mp.js deal note ${d.listing_id} photos "what it showed"`);
    }
    console.log(
      `    §11 ${gap.band}: ` +
        (gap.missing.length ? `still owed — ${gap.missing.join(', ')}` : 'satisfied — you can book the visit')
    );
  }
  console.log('\n! = the date you set has passed.  Full requirement text: node mp.js deal <id>');
}

async function cmdDeal(argv) {
  // vin/close write a fact that belongs in both places — the VIN or the
  // final outcome — so they sync by default, the same way msg.js writes
  // seen_listings.md on `msg --sent` without asking for a flag. `--no-sync`
  // is the escape hatch, not `--sync` the opt-in.
  const opts = {
    sync: !argv.includes('--no-sync'),
    dry: argv.includes('--dry'),
    where: argv.includes('--where') ? argv[argv.indexOf('--where') + 1] : null,
  };
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--where') { i++; continue; }
    if (String(argv[i]).startsWith('--')) continue;
    args.push(argv[i]);
  }

  const playbook = fs.readFileSync(PLAYBOOK, 'utf8');
  const requirements = extractRequirements(playbook);
  const sub = args[0];

  if (!sub || sub === 'board') { printBoard(listDeals(), requirements, false); return; }
  if (sub === 'help' || sub === '--help') { console.log(DEAL_USAGE); return; }
  if (sub === 'due') { printBoard(listDeals(), requirements, true); return; }
  if (sub === 'index') { const n = writeIndex(opts); console.log(`deals/INDEX.md — ${n} deal(s).`); return; }

  // `deal <id>` with no verb prints the file — the common case, so it is the
  // shortest thing to type.
  if (/^\d{8,}$/.test(sub)) {
    const { file, deal } = loadDeal(sub);
    console.log(fs.readFileSync(file, 'utf8'));
    const gap = owed(deal, requirements);
    console.log(`\n§11 before you drive (${gap.band}): ${gap.text}`);
    console.log(gap.missing.length ? `Still owed: ${gap.missing.join(', ')}` : 'All satisfied — book the visit.');
    return;
  }

  const id = args[1];
  if (!id) { console.log(DEAL_USAGE); return; }

  if (sub === 'open') {
    const md = fs.readFileSync(TRACKER, 'utf8');
    const { rows } = msg.parseTracker(md);
    const bands = msg.extractBands(playbook);
    for (const wanted of args.slice(1)) {
      const row = rows.find((r) => msg.listingId(r) === String(wanted));
      if (!row) { console.error(`No seen_listings.md row for ${wanted} — is it in the tracker?`); continue; }
      const file = dealPath(wanted);
      if (fs.existsSync(file)) { console.log(`${path.relative(ROOT, file)} already exists — left alone.`); continue; }
      const band = normaliseBand(msg.bandOf(row, bands));
      const desc = descriptionFor(wanted);
      const deal = seedFromRow(row, band, desc, today());
      const gap = applyGap(deal, requirements, today());
      saveDeal(file, deal, opts);
      console.log(
        `${path.relative(ROOT, file)} — ${deal.vehicle} ${deal.price}, ${deal.band}` +
          `${desc ? ', description carried from captures' : ', no description capture found'}\n` +
          `  §11 owes: ${gap.missing.join(', ') || 'nothing'}`
      );
    }
    if (!opts.dry) writeIndex(opts);
    return;
  }

  const { file, deal } = loadDeal(id);

  switch (sub) {
    case 'set': {
      const changes = [];
      for (const pair of args.slice(2)) {
        const m = pair.match(/^([a-z_]+)=([\s\S]*)$/);
        if (!m) throw new Error(`"${pair}" is not key=value.`);
        const [, k, v] = m;
        if (!FIELDS.includes(k)) throw new Error(`Unknown field "${k}". Fields: ${FIELDS.join(', ')}`);
        if (k === 'stage' && !STAGES.includes(v)) throw new Error(`stage must be one of: ${STAGES.join(', ')}`);
        if (k === 'outcome' && v !== UNSET && !OUTCOMES.includes(v)) throw new Error(`outcome must be one of: ${OUTCOMES.join(', ')}`);
        changes.push(`${k}: ${deal[k] || UNSET} -> ${v}`);
        deal[k] = v;
      }
      if (!changes.length) throw new Error('Nothing to set.');
      logLine(deal, changes.join('; '));
      saveDeal(file, deal, opts);
      console.log(changes.join('\n'));
      break;
    }
    case 'log': {
      const text = args.slice(2).join(' ');
      if (!text) throw new Error('deal log <id> "what happened"');
      logLine(deal, text);
      if (blank(deal.first_contact)) deal.first_contact = today();
      saveDeal(file, deal, opts);
      console.log(`${path.relative(ROOT, file)}: logged.`);
      break;
    }
    case 'note': {
      // Match on any word of the heading, so both "description" and "listing"
      // reach "Listing description" — the README documents the short forms.
      const want = String(args[2] || '').toLowerCase();
      const section = want && SECTIONS.find((s) => s.toLowerCase().includes(want));
      const text = args.slice(3).join(' ');
      if (!section || !text) throw new Error(`deal note <id> <${SECTIONS.join('|')}> "text"`);
      appendSection(deal, section, `**${today()}** — ${text}`);
      let cleared = 0;
      if (section === 'Photos') cleared = markPhotosReviewed(deal, opts);
      saveDeal(file, deal, opts);
      console.log(`${path.relative(ROOT, file)}: added to "${section}".`);
      if (cleared) console.log(`  ${cleared} image(s) marked reviewed — no longer blocking.`);
      break;
    }
    case 'vin': {
      const listedYear = (String(deal.vehicle).match(/\b(19|20)\d{2}\b/) || [])[0];
      const res = vinCheck(args[2], listedYear);
      console.log(`VIN ${res.vin}`);
      if (res.modelYear) console.log(`  decodes to: ${res.modelYear} model year, built in ${res.region}`);
      if (res.problems.length) res.problems.forEach((p) => console.log(`  ! ${p}`));
      else console.log('  check digit valid.');
      if (!res.checkOk) { console.log('\nNot recorded. Fix the VIN first — §11: refusal or a bad VIN means do not schedule.'); return; }
      deal.vin = res.vin;
      if (STAGES.indexOf(deal.stage) < STAGES.indexOf('has-vin')) deal.stage = 'has-vin';
      appendSection(deal, 'VIN & history', `**${today()}** — VIN \`${res.vin}\` received. Check digit valid; decodes to ${res.modelYear} (${res.region}).${res.problems.length ? ' ' + res.problems.join(' ') : ''}`);
      logLine(deal, `VIN received: ${res.vin}`);
      // A history report already on file (vin_report set, or the deal is past
      // vin-checked) means the next step isn't "go run the report" — that
      // would regress a deal that has already moved on. Recompute the real
      // §11 gap instead of hardcoding the first-time path.
      if (blank(deal.vin_report) && STAGES.indexOf(deal.stage) <= STAGES.indexOf('has-vin')) {
        deal.next_action = 'run the history report (Carfax / AutoCheck / free NMVTIS) and file it under VIN & history';
        deal.next_action_date = today();
      } else {
        applyGap(deal, requirements, today());
      }
      saveDeal(file, deal, opts);
      maybeSync(deal, opts);
      console.log(`\nRecorded. Next: ${deal.next_action}`);
      break;
    }
    case 'thread': {
      const key = args.slice(2).join(' ').trim();
      if (!key || !key.includes('|')) {
        throw new Error(
          'deal thread <id> "<name>|<listing>"\n' +
            '  The key is printed next to every unlinked conversation by: node mp.js inbox'
        );
      }
      const clash = listDeals().find((d) => d.thread_key === key && d.listing_id !== deal.listing_id);
      if (clash) {
        throw new Error(
          `That conversation is already bound to ${clash.listing_id} (${clash.vehicle}).\n` +
            '  One conversation is about one car. Unbind that one first if this is the right listing:\n' +
            `  node mp.js deal set ${clash.listing_id} thread_key=${UNSET}`
        );
      }
      deal.thread_key = key;
      logLine(deal, `bound to inbox conversation "${key}"`);
      saveDeal(file, deal, opts);
      console.log(`${deal.vehicle} <- conversation "${key}"`);
      console.log('Open that conversation in the inbox tab, then: node mp.js thread');
      break;
    }
    case 'appt': {
      const when = args[2];
      if (!when) throw new Error('deal appt <id> "<when>" [--where "<place>"]');
      const gap = owed(deal, requirements);
      if (gap.missing.length) {
        console.log(`Warning — §11 for ${gap.band} is not satisfied yet: ${gap.missing.join(', ')}.`);
        console.log(`  "${gap.text}"`);
        console.log('  Recording the appointment anyway; chase the rest before you drive.\n');
      }
      deal.appointment = when;
      if (opts.where) deal.appointment_place = opts.where;
      deal.stage = 'scheduled';
      deal.next_action = `see the car — ${when}${opts.where ? ` at ${opts.where}` : ''}`;
      deal.next_action_date = (when.match(/\d{4}-\d{2}-\d{2}/) || [today()])[0];
      appendSection(deal, 'Appointment', `**${today()}** — set for ${when}${opts.where ? ` at ${opts.where}` : ''}. Playbook §11 at the sale: public place, daylight, bring someone, never pay before seeing it.`);
      logLine(deal, `appointment set: ${when}${opts.where ? ` at ${opts.where}` : ''}`);
      saveDeal(file, deal, opts);
      console.log(`Scheduled: ${when}${opts.where ? ` at ${opts.where}` : ''}`);
      break;
    }
    case 'close': {
      const outcome = args[2];
      if (!OUTCOMES.includes(outcome)) throw new Error(`outcome must be one of: ${OUTCOMES.join(', ')}`);
      deal.outcome = outcome;
      deal.stage = 'closed';
      deal.next_action = UNSET;
      deal.next_action_date = UNSET;
      logLine(deal, `closed — ${outcome}${args[3] ? `: ${args.slice(3).join(' ')}` : ''}`);
      saveDeal(file, deal, opts);
      maybeSync(deal, opts);
      console.log(`${deal.vehicle}: closed as ${outcome}.`);
      break;
    }
    default:
      console.log(DEAL_USAGE);
      return;
  }
  if (!opts.dry) writeIndex(opts);
}

module.exports = {
  DEALS, INDEX, UNSET, STAGES, OUTCOMES, FIELDS, SECTIONS,
  blank, normaliseBand,
  extractRequirements, owed, pendingPhotos,
  vinCheck,
  parseDeal, renderDeal, dealPath, listDeals,
  seedFromRow, descriptionFor,
  renderIndex, syncRow, applyGap, duplicateVins,
  cmdDeal, today, DEAL_USAGE,
};
