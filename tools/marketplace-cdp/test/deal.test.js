const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractRequirements,
  owed,
  vinCheck,
  parseDeal,
  renderDeal,
  seedFromRow,
  renderIndex,
  syncRow,
  applyGap,
  normaliseBand,
  pendingPhotos,
  STAGES,
} = require('../deal');
const { parseTracker } = require('../msg');

// Synthetic stand-ins. The real playbook and tracker are private and
// gitignored, so the fixtures carry only the shape the parsers depend on:
// the §11 pre-visit table, and the tracker's column order.

const PLAYBOOK = `## 11. Safety, Verification & Negotiation

### Pre-visit verification — the bar scales with the drive

| Distance | Required before you drive |
|---|---|
| **0–10 mi** | Complete 17-character VIN + a current running-dashboard photo |
| **10–20 mi** | The above, plus written confirmation of title status and the actual cash price |
| **20+ mi** | All of the above, plus a **cold-start dashboard video**, a clear odometer photo, direct answers to specific-defect questions, and a confirmed appointment window. |

## 12. Recurring Runs
`;

const COLUMNS =
  '| Listing ID | Vehicle | Listed Date | First Seen | Last Seen | Last Price | Effective Cash Price | ' +
  'Price Type | Price History | Days on Market | Mileage | Title Status | Location / Distance | ' +
  'Seller Fingerprint | VIN Status | Dashboard Status | Score | Tier | Status | Rejected At | Notes | URL |';

function tracker(overrides = {}) {
  const cells = {
    'Listing ID': '1234567890123456',
    Vehicle: '2016 Honda Accord LX Sedan 4D',
    'Listed Date': '2026-08-01',
    'First Seen': '2026-08-10',
    'Last Seen': '2026-08-20',
    'Last Price': '$8,500',
    'Effective Cash Price': '—',
    'Price Type': 'Cash stated',
    'Price History': '—',
    'Days on Market': '19',
    Mileage: '92,000',
    'Title Status': 'Clean',
    'Location / Distance': 'Hialeah / 10–20mi',
    'Seller Fingerprint': 'Test Seller (Joined 2012); "runs great"',
    'VIN Status': 'Not provided',
    'Dashboard Status': 'Not recorded',
    Score: '7',
    Tier: 'Worth a look',
    Status: 'Active',
    'Rejected At': 'listing',
    Notes: 'Test note.',
    URL: 'https://www.facebook.com/marketplace/item/1234567890123456/',
    ...overrides,
  };
  const order = COLUMNS.replace(/^\| | \|$/g, '').split(' | ');
  const md = `${COLUMNS}\n|${order.map(() => '---').join('|')}|\n| ${order.map((c) => cells[c]).join(' | ')} |\n`;
  return { md, row: parseTracker(md).rows[0] };
}

// --- §11 requirements ---------------------------------------------------

test('§11 requirements are read from the playbook and accumulate by band', () => {
  const reqs = extractRequirements(PLAYBOOK);
  assert.deepEqual(reqs.get('0–10mi').fields, ['vin', 'dashboard']);
  assert.deepEqual(reqs.get('10–20mi').fields, ['vin', 'dashboard', 'title_confirmed', 'price_confirmed']);
  // "All of the above, plus…" — a far car owes everything a near car owes.
  assert.deepEqual(reqs.get('20+mi').fields, [
    'vin', 'dashboard', 'title_confirmed', 'price_confirmed',
    'coldstart_video', 'odometer_photo', 'appointment',
  ]);
});

test('a reworded §11 table fails loudly rather than falling back to a stale copy', () => {
  assert.throws(() => extractRequirements('## 11. Safety\n\nno table here\n\n## 12. Runs\n'), /parsed to nothing/);
});

test('bands past the last row of the table inherit the strictest requirements', () => {
  const reqs = extractRequirements(PLAYBOOK);
  // §7 has 20–30mi and 30+mi bands that §11's table does not name; a 30-mile
  // drive must not end up owing less than a 20-mile one.
  assert.equal(owed({ band: '30+mi' }, reqs).band, '20+mi');
  assert.equal(owed({ band: '20–30mi' }, reqs).missing.length, 7);
});

test('owed() reports only the facts still missing', () => {
  const reqs = extractRequirements(PLAYBOOK);
  const deal = { band: '10–20mi', vin: '1HGCV1F31JA000000', dashboard: 'Verified clear', title_confirmed: '—' };
  assert.deepEqual(owed(deal, reqs).missing, ['title_confirmed', 'price_confirmed']);
});

// --- VIN ----------------------------------------------------------------

test('a valid VIN passes the check digit and decodes year and region', () => {
  const res = vinCheck('SHHFK7H41MU000003', 2021);
  assert.equal(res.ok, true);
  assert.equal(res.modelYear, 2021);
  assert.equal(res.region, 'UK');
  assert.deepEqual(res.problems, []);
});

test('a mistyped VIN is caught by the check digit', () => {
  const res = vinCheck('SHHFK7H49MU000003', 2021);
  assert.equal(res.checkOk, false);
  assert.match(res.problems[0], /check digit is "9", should be "1"/);
});

test('a short VIN is rejected as a partial, not padded or accepted', () => {
  const res = vinCheck('SHHFK7H41MU0000', 2021);
  assert.equal(res.ok, false);
  assert.match(res.problems[0], /15 characters, not 17/);
});

test('I, O and Q are flagged — they never appear in a VIN', () => {
  const res = vinCheck('SHHFK7H4IMU000003', 2021);
  assert.match(res.problems.join(' '), /not used in VINs/);
});

test('a VIN whose year contradicts the listing is flagged', () => {
  const res = vinCheck('SHHFK7H41MU000003', 2017);
  assert.match(res.problems.join(' '), /model year 2021, listing says 2017/);
});

// --- deal files ---------------------------------------------------------

test('a deal round-trips through render and parse without losing a section', () => {
  const { row } = tracker();
  const deal = seedFromRow(row, '10–20mi', 'Runs great, no issues.', '2026-08-27');
  const back = parseDeal(renderDeal(deal));
  assert.equal(back.listing_id, '1234567890123456');
  assert.equal(back.price, '$8,500');
  assert.equal(back.band, '10–20mi');
  assert.match(back._sections['Listing description'], /Runs great/);
  assert.match(back._sections.Timeline, /deal opened from/);
});

test('seeding carries a VIN the tracker already recorded', () => {
  const { row } = tracker({ 'VIN Status': 'Provided (1HGCV1F31JA000000)' });
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  assert.equal(deal.vin, '1HGCV1F31JA000000');
  assert.equal(deal.stage, 'has-vin');
});

test("a seller's dashboard *claim* is not carried as verification", () => {
  // §11: an engine-off photo proves nothing, so "no warning lights" typed into
  // a message proves less. The claim is preserved as context, not as a pass.
  const { row } = tracker({ 'Dashboard Status': 'Clear claim ("no warning lights, no leaks")' });
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  assert.equal(deal.dashboard, '—');
  assert.match(deal._sections.Photos, /unverified seller claim/);
  assert.match(deal._sections.Photos, /engine\s+running in Park/);
});

test('a recorded dashboard observation is carried', () => {
  const { row } = tracker({ 'Dashboard Status': 'Verified clear' });
  assert.equal(seedFromRow(row, '10–20mi', null, '2026-08-27').dashboard, 'Verified clear');
});

test('applyGap sets the next action from what §11 still owes', () => {
  const reqs = extractRequirements(PLAYBOOK);
  const { row } = tracker({ 'VIN Status': 'Provided (1HGCV1F31JA000000)' });
  const deal = seedFromRow(row, '0–10mi', null, '2026-08-27');
  applyGap(deal, reqs, '2026-08-27');
  assert.match(deal.next_action, /chase dashboard/);
});

test('a deal that satisfies §11 for its band is marked ready to visit', () => {
  const reqs = extractRequirements(PLAYBOOK);
  const { row } = tracker({ 'VIN Status': 'Provided (1HGCV1F31JA000000)', 'Dashboard Status': 'Verified clear' });
  const deal = seedFromRow(row, '0–10mi', null, '2026-08-27');
  applyGap(deal, reqs, '2026-08-27');
  assert.equal(deal.stage, 'ready');
  assert.match(deal.next_action, /book the visit/);
});

test('normaliseBand accepts the shapes the tracker actually writes', () => {
  assert.equal(normaliseBand('10-20mi'), '10–20mi');
  assert.equal(normaliseBand('10–20 mi'), '10–20mi');
  assert.equal(normaliseBand('—'), null);
});

// --- index --------------------------------------------------------------

test('the index lists open deals in stage order and separates closed ones', () => {
  const { row } = tracker();
  const open = seedFromRow(row, '10–20mi', null, '2026-08-27');
  const done = seedFromRow({ ...row, 'Listing ID': '9999999999999999' }, '0–10mi', null, '2026-08-27');
  done.stage = 'closed';
  done.outcome = 'passed';
  const md = renderIndex([done, open], '2026-08-27');
  assert.match(md, /\*\*1 open\*\*/);
  assert.match(md, /1 closed/);
  assert.ok(md.indexOf('## Open') < md.indexOf('## Closed'));
  assert.ok(md.indexOf('1234567890123456') < md.indexOf('## Closed'));
  assert.ok(md.indexOf('9999999999999999') > md.indexOf('## Closed'));
});

test('every index row stays short enough to scan', () => {
  const { row } = tracker();
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  const rows = renderIndex([deal], '2026-08-27').split('\n').filter((l) => l.includes('1234567890123456'));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].length < 220, `index row is ${rows[0].length} chars`);
});

// --- tracker sync -------------------------------------------------------

test('syncRow writes the VIN back into seen_listings.md and leaves other cells alone', () => {
  const { md, row } = tracker();
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  deal.vin = '1HGCV1F31JA000000';
  const { text, changes } = syncRow(md, deal);
  assert.match(changes.join(' '), /VIN Status/);
  const after = parseTracker(text).rows[0];
  assert.equal(after['VIN Status'], 'Provided (1HGCV1F31JA000000)');
  assert.equal(after['Last Price'], '$8,500');
  assert.equal(after.Score, '7');
  assert.match(after.Notes, /Test note\. Deal file: deals\/1234567890123456\.md\./);
});

test('syncRow does not duplicate the deal-file pointer on a second run', () => {
  const { md, row } = tracker();
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  const once = syncRow(md, deal).text;
  const twice = syncRow(once, deal).text;
  assert.equal(once, twice);
});

test('syncRow refuses to guess when a listing ID appears twice', () => {
  const { md, row } = tracker();
  const dup = md + md.split('\n')[2] + '\n';
  const deal = seedFromRow(row, '10–20mi', null, '2026-08-27');
  assert.throws(() => syncRow(dup, deal), /appears on 2 rows/);
});

test('stages are ordered so "further along" is a comparison, not a lookup', () => {
  assert.ok(STAGES.indexOf('has-vin') > STAGES.indexOf('asked-vin'));
  assert.ok(STAGES.indexOf('scheduled') > STAGES.indexOf('ready'));
  assert.equal(STAGES[STAGES.length - 1], 'closed');
});

// --- repeated VINs ------------------------------------------------------

test('a VIN appearing on more than one listing is reported', () => {
  const { duplicateVins } = require('../deal');
  const dupes = duplicateVins(
    [
      { listing_id: '111', vin: '1HGCV1F31JA000000' },
      { listing_id: '222', vin: '1HGCV1F31JA000000' },
      { listing_id: '333', vin: 'SHHFK7H41MU000003' },
    ],
    null
  );
  assert.equal(dupes.length, 1);
  assert.deepEqual(dupes[0].listings, ['111', '222']);
});

test('repeated VINs are found across the tracker too, not just open deals', () => {
  const { duplicateVins } = require('../deal');
  const a = tracker({ 'Listing ID': '1111111111111111', 'VIN Status': 'Provided (1HGCV1F31JA000000)' });
  const b = tracker({ 'Listing ID': '2222222222222222', 'VIN Status': 'Provided (1HGCV1F31JA000000)' });
  const md = a.md + b.md.split('\n').slice(2).join('\n');
  const dupes = duplicateVins([], md);
  assert.equal(dupes.length, 1);
  assert.deepEqual(dupes[0].listings, ['1111111111111111', '2222222222222222']);
});

test('a partial or malformed VIN is never treated as a duplicate', () => {
  const { duplicateVins } = require('../deal');
  assert.deepEqual(
    duplicateVins([{ listing_id: '1', vin: '—' }, { listing_id: '2', vin: '—' }, { listing_id: '3', vin: 'SHORT' }], null),
    []
  );
});

test('a tracker row without a usable listing ID is not counted as a duplicate', () => {
  const { duplicateVins } = require('../deal');
  const dupes = duplicateVins([{ listing_id: '111', vin: '1HGCV1F31JA000000' }, { listing_id: null, vin: '1HGCV1F31JA000000' }], null);
  assert.deepEqual(dupes, []);
});

test('section shorthands reach the section the README documents', () => {
  const { SECTIONS } = require('../deal');
  for (const want of ['description', 'vin', 'photos', 'appointment', 'timeline']) {
    const hit = SECTIONS.filter((s) => s.toLowerCase().includes(want));
    assert.equal(hit.length, 1, `"${want}" matched ${hit.length} sections`);
  }
});

// --- photos the tool can see but cannot read ----------------------------

test('pendingPhotos counts what arrived minus what you have looked at', () => {
  assert.equal(pendingPhotos({ photos_seen: '3', photos_reviewed: '1' }), 2);
  assert.equal(pendingPhotos({ photos_seen: '2', photos_reviewed: '2' }), 0);
  // An unset count is not a negative one.
  assert.equal(pendingPhotos({ photos_seen: '—', photos_reviewed: '—' }), 0);
  assert.equal(pendingPhotos({ photos_seen: '1', photos_reviewed: '4' }), 0);
});

test('the index flags a deal that is blocked on a photo nobody has read', () => {
  const base = {
    listing_id: '1234567890123456',
    vehicle: '2016 Honda Accord LX',
    price: '$8,500',
    band: '0–10mi',
    stage: 'has-vin',
    vin: '1HGCV1F38LA000009',
    next_action: 'chase dashboard',
    next_action_date: '2026-08-27',
    url: 'https://example.invalid/1',
  };
  const blocked = renderIndex([{ ...base, photos_seen: '2', photos_reviewed: '0' }], '2026-08-27');
  assert.match(blocked, /2 unreviewed photo\(s\)/);

  // Once you have described what they showed, the deal stops shouting.
  const clear = renderIndex([{ ...base, photos_seen: '2', photos_reviewed: '2' }], '2026-08-27');
  assert.ok(!/unreviewed photo/.test(clear));
});
