const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickQueue,
  extractNegotiability,
  negotiabilityScore,
  extractTemplates,
  extractBands,
  parseTracker,
  bandOf,
  isEligible,
  stageFor,
  renderMessage,
  buildQueue,
  markSent,
  listingUrl,
} = require('../msg');

// Synthetic stand-ins for the playbook and the tracker. The real files are
// private and gitignored, so the fixtures carry only the shape the parsers
// depend on — the headings, the band table, and the column order.

const PLAYBOOK = `## 5. Scoring

### Negotiability

| Signal | Points |
|---|---|
| Price already reduced (struck-through on card) | +1 |
| Listed 30+ days ago | +1 |
| "OBO" / "negotiable" / "must sell" in description | +1 |

## 7. Distance & Drive-Cost Bands from Pembroke Pines, FL

| Band | Cities |
|---|---|
| **0–10 mi** | Pembroke Pines, Miramar, Hollywood |
| **10–20 mi** | Fort Lauderdale, Hialeah, Miami |
| **20–30 mi** | Pompano Beach, Coral Gables |
| **30+ mi** | Boca Raton, Kendall |

## 11. Safety, Verification & Negotiation

### Price-verification message — send this first, to anything in "Worth asking"

Preamble prose that is not part of the message.

> Hi — is the $[price] in your listing the cash price to buy the car outright,
> or is it a down payment?

### Seller message template — near (0–20 mi)

> Hi, I'm interested in the [year, make, model]. Could you send the VIN?

### Seller message template — long drive (20+ mi)

> Hi, I'm interested in the [year, make, model]. I'd be driving about [X] miles.

### Language

Not a template.
`;

const COLUMNS = [
  'Listing ID', 'Vehicle', 'Listed Date', 'First Seen', 'Last Seen', 'Last Price',
  'Effective Cash Price', 'Price Type', 'Price History', 'Days on Market', 'Mileage',
  'Title Status', 'Location / Distance', 'Seller Fingerprint', 'VIN Status',
  'Dashboard Status', 'Score', 'Tier', 'Status', 'Rejected At', 'Notes', 'URL',
];

function row(overrides = {}) {
  const base = {
    'Listing ID': '1000000000000001', Vehicle: '2014 Mazda Mazda3 Sedan 4D',
    'Listed Date': '2026-08-19', 'First Seen': '2026-08-20', 'Last Seen': '2026-08-20',
    'Last Price': '$6,990', 'Effective Cash Price': '—', 'Price Type': 'Unconfirmed',
    'Price History': '—', 'Days on Market': '7', Mileage: '80,000', 'Title Status': 'Clean',
    'Location / Distance': 'Miami / 10–20mi', 'Seller Fingerprint': 'seller',
    'VIN Status': 'Not provided', 'Dashboard Status': 'Not recorded', Score: '9',
    Tier: 'Strong match', Status: 'Active', 'Rejected At': 'listing', Notes: 'note',
    URL: 'https://www.facebook.com/marketplace/item/1000000000000001/',
  };
  return { ...base, ...overrides };
}

function tracker(rows) {
  return [
    '# Seen Listings Tracker', '', '## Tracker', '',
    `| ${COLUMNS.join(' | ')} |`,
    `|${COLUMNS.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${COLUMNS.map((c) => r[c] ?? '').join(' | ')} |`),
    '',
  ].join('\n');
}

test('extractTemplates pulls the three §11 blockquotes and stops at the next heading', () => {
  const t = extractTemplates(PLAYBOOK);
  assert.match(t.price, /^Hi — is the \$\[price\]/);
  assert.doesNotMatch(t.price, /Preamble/);
  assert.doesNotMatch(t.price, /interested in/);
  assert.match(t.near, /Could you send the VIN\?$/);
  assert.match(t.long, /driving about \[X\] miles\.$/);
});

test('extractTemplates fails loudly rather than falling back to a stale copy', () => {
  assert.throws(
    () => extractTemplates(PLAYBOOK.replace('### Price-verification message', '### Opening message')),
    /Could not find the price-verification message/
  );
});

test('extractBands reads the §7 city table', () => {
  const bands = extractBands(PLAYBOOK);
  assert.equal(bands.get('hialeah'), '10–20');
  assert.equal(bands.get('pembroke pines'), '0–10');
  assert.equal(bands.get('boca raton'), '30+');
});

test('bandOf prefers the band written on the row, then falls back to §7', () => {
  const bands = extractBands(PLAYBOOK);
  assert.equal(bandOf(row({ 'Location / Distance': 'Pompano Beach / 20–30mi' }), bands), '20–30');
  assert.equal(bandOf(row({ 'Location / Distance': 'Boca Raton' }), bands), '30+');
  // A street address still ends in the city, which is what the lookup needs.
  assert.equal(bandOf(row({ 'Location / Distance': '100 Example St, Miami' }), bands), '10–20');
  assert.equal(bandOf(row({ 'Location / Distance': 'Ocala' }), bands), null);
});

test('only rows whose answer still changes something are eligible', () => {
  assert.ok(isEligible(row({ Status: 'Active' })));
  assert.ok(isEligible(row({ Status: 'Pending info' })));
  assert.ok(isEligible(row({ Status: 'Suspected down payment' })));
  // These owe an open, not a message.
  assert.ok(!isEligible(row({ Status: 'Not yet evaluated' })));
  assert.ok(!isEligible(row({ Status: 'Must open' })));
  // And these owe nothing.
  assert.ok(!isEligible(row({ Status: 'Rejected: mileage' })));
  assert.ok(!isEligible(row({ Status: 'Suspected curbstoner duplicate' })));
});

test('the price question comes first, and only a seller reply retires it', () => {
  // §12: `Cash (seller confirmed)` is reserved for a reply. Everything else —
  // including a confident-sounding "Cash stated" read off the ad — still owes
  // the question.
  assert.equal(stageFor(row({ 'Price Type': 'Cash stated' })).stage, 'price');
  assert.equal(stageFor(row({ 'Price Type': 'Cash (confirmed in description)' })).stage, 'price');
  assert.equal(stageFor(row({ 'Price Type': 'Down payment (explicit)' })).stage, 'price');
  assert.equal(stageFor(row({ 'Price Type': 'Cash (seller confirmed)' })).stage, 'verify');
});

test('once price is settled the gaps in VIN and dashboard drive the stage', () => {
  const confirmed = { 'Price Type': 'Cash (seller confirmed)' };
  assert.match(stageFor(row({ ...confirmed, 'VIN Status': 'Not provided' })).why, /VIN/);
  assert.match(
    stageFor(row({ ...confirmed, 'VIN Status': 'JM1BM1T76E1000002 matched', 'Dashboard Status': 'Not recorded' })).why,
    /dashboard/
  );
  assert.equal(
    stageFor(row({ ...confirmed, 'VIN Status': 'JM1BM1T76E1000002 matched', 'Dashboard Status': 'Verified clear' })).stage,
    null
  );
});

test('renderMessage fills the blanks and picks the template by band', () => {
  const t = extractTemplates(PLAYBOOK);
  // The template already carries the dollar sign, so the price goes in bare.
  assert.match(renderMessage(row(), 'price', t, '10–20'), /is the \$6,990 in your listing/);

  const near = renderMessage(row(), 'verify', t, '10–20');
  assert.match(near, /interested in the 2014 Mazda Mazda3 Sedan\./); // body code stripped
  assert.doesNotMatch(near, /driving about/);

  assert.match(renderMessage(row(), 'verify', t, '20–30'), /driving about 25 miles/);
  assert.match(renderMessage(row(), 'verify', t, '30+'), /driving about 35 miles/);
});

test('buildQueue ranks by score then by price, and drops what owes nothing', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([
    row({ 'Listing ID': '1000000000000001', Score: '5', 'Last Price': '$5,000' }),
    row({ 'Listing ID': '1000000000000002', Score: '9', 'Last Price': '$8,000' }),
    row({ 'Listing ID': '1000000000000003', Score: '9', 'Last Price': '$6,000' }),
    row({ 'Listing ID': '1000000000000004', Status: 'Rejected: brand', Score: '12' }),
    row({
      'Listing ID': '1000000000000005', Score: '11',
      'Price Type': 'Cash (seller confirmed)', 'VIN Status': 'VIN matched',
      'Dashboard Status': 'Verified clear',
    }),
  ])).rows;

  const queue = buildQueue(rows, t, bands);
  assert.deepEqual(
    queue.map((q) => q.id),
    ['1000000000000003', '1000000000000002', '1000000000000001']
  );
  assert.equal(queue[0].band, '10–20');
});

test('buildQueue honours the stage and score filters', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([
    row({ 'Listing ID': '1000000000000001', Score: '4' }),
    row({
      'Listing ID': '1000000000000002', Score: '9',
      'Price Type': 'Cash (seller confirmed)', 'VIN Status': 'Not provided',
    }),
  ])).rows;

  assert.deepEqual(buildQueue(rows, t, bands, { minScore: 5 }).map((q) => q.id), ['1000000000000002']);
  assert.deepEqual(buildQueue(rows, t, bands, { stage: 'price' }).map((q) => q.id), ['1000000000000001']);
  assert.deepEqual(buildQueue(rows, t, bands, { stage: 'verify' }).map((q) => q.id), ['1000000000000002']);
});

test('a row with no listing ID is still readable but has no URL to open', () => {
  const [noId] = parseTracker(tracker([row({ 'Listing ID': '— (Quinn)', URL: '—' })])).rows;
  assert.equal(listingUrl(noId), null);
});

test('markSent rewrites one line and leaves every other byte alone', () => {
  const before = tracker([
    row({ 'Listing ID': '1000000000000001' }),
    row({ 'Listing ID': '1000000000000002', Notes: 'untouched' }),
  ]);
  const { text, changes } = markSent(before, '1000000000000002', { date: '2026-08-27', stage: 'price' });

  const beforeLines = before.split('\n');
  const afterLines = text.split('\n');
  assert.equal(afterLines.length, beforeLines.length);
  const differing = afterLines.map((l, i) => (l === beforeLines[i] ? null : i)).filter((i) => i !== null);
  assert.equal(differing.length, 1);

  const changed = afterLines[differing[0]];
  assert.match(changed, /1000000000000002/);
  assert.match(changed, /untouched §11 price-verification sent 2026-08-27 \(awaiting reply\)\./);
  assert.match(changed, /\| Pending info \|/);
  assert.deepEqual(changes.length, 3);
});

test('markSent leaves a down-payment suspicion classified as it was', () => {
  const before = tracker([row({ Status: 'Suspected down payment' })]);
  const { text } = markSent(before, '1000000000000001', { date: '2026-08-27', stage: 'price' });
  assert.match(text, /\| Suspected down payment \|/);
  assert.doesNotMatch(text, /Pending info/);
});

test('markSent is idempotent — a second run adds no second stamp', () => {
  const before = tracker([row()]);
  const once = markSent(before, '1000000000000001', { date: '2026-08-27', stage: 'price' });
  const twice = markSent(once.text, '1000000000000001', { date: '2026-08-27', stage: 'price' });
  assert.equal(twice.text, once.text);
  assert.equal(twice.changes.length, 0);
});

test('markSent refuses an unknown or duplicated listing ID', () => {
  const before = tracker([row(), row()]);
  assert.throws(() => markSent(before, '9999999999999999', { date: '2026-08-27', stage: 'price' }), /No tracker row/);
  assert.throws(() => markSent(before, '1000000000000001', { date: '2026-08-27', stage: 'price' }), /appears on 2 rows/);
});

test('pickQueue takes the listings you name, in the order you named them', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([
    row({ 'Listing ID': '1000000000000001', Score: '4' }),
    row({ 'Listing ID': '1000000000000002', Score: '12' }),
    row({ 'Listing ID': '1000000000000003', Score: '8' }),
  ])).rows;

  // A deliberate pick is not re-ranked by score the way the queue is.
  const { picked, skipped } = pickQueue(rows, t, bands, [
    '1000000000000003', '1000000000000001', '1000000000000002',
  ]);
  assert.deepEqual(picked.map((p) => p.id), [
    '1000000000000003', '1000000000000001', '1000000000000002',
  ]);
  assert.equal(skipped.length, 0);
  assert.match(picked[0].message, /is the \$6,990 in your listing/);
});

test('pickQueue reports an unknown id instead of silently dropping it', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([row()])).rows;

  const { picked, skipped } = pickQueue(rows, t, bands, ['9999999999999999', '1000000000000001']);
  assert.deepEqual(picked.map((p) => p.id), ['1000000000000001']);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /no tracker row/);
});

test('pickQueue refuses a listing that has nothing left to ask', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([
    row({
      'Price Type': 'Cash (seller confirmed)',
      'VIN Status': 'VIN matched',
      'Dashboard Status': 'Verified clear',
    }),
  ])).rows;

  const { picked, skipped } = pickQueue(rows, t, bands, ['1000000000000001']);
  assert.equal(picked.length, 0);
  assert.match(skipped[0].reason, /nothing owed/);
});

test('a named listing still gets the template its distance band calls for', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([
    row({
      'Listing ID': '1000000000000009',
      'Location / Distance': 'Boca Raton / 30+mi',
      'Price Type': 'Cash (seller confirmed)',
      'VIN Status': 'Not provided',
    }),
  ])).rows;

  const { picked } = pickQueue(rows, t, bands, ['1000000000000009']);
  assert.equal(picked[0].stage, 'verify');
  assert.match(picked[0].message, /driving about 35 miles/);
});

test('extractNegotiability reads §5 points, the day threshold, and the keywords', () => {
  const spec = extractNegotiability(PLAYBOOK);
  assert.equal(spec.reduced.points, 1);
  assert.equal(spec.age.days, 30);
  assert.deepEqual(spec.language.keywords, ['obo', 'negotiable', 'must sell']);
});

test('extractNegotiability picks up an edited threshold rather than a hardcoded 30', () => {
  const spec = extractNegotiability(PLAYBOOK.replace('Listed 30+ days ago', 'Listed 45+ days ago'));
  assert.equal(spec.age.days, 45);
});

test('each negotiability signal fires on its own and they sum', () => {
  const spec = extractNegotiability(PLAYBOOK);
  const at = (over) => negotiabilityScore(row(over), spec);

  assert.equal(at({ 'Price History': '—', 'Days on Market': '3' }).score, 0);
  assert.equal(at({ 'Price History': '$8,200 -> $7,500' }).score, 1);
  assert.equal(at({ 'Price History': '—', 'Days on Market': '133' }).score, 1);
  assert.equal(at({ 'Price History': '—', 'Days on Market': '3', Notes: 'seller says OBO' }).score, 1);

  const all = at({ 'Price History': '$8,200 -> $7,500', 'Days on Market': '133', Notes: 'must sell' });
  assert.equal(all.score, 3);
  assert.deepEqual(all.signals, ['reduced', '133d', 'says-obo']);
});

test('"not negotiable" is the opposite of a negotiability signal', () => {
  const spec = extractNegotiability(PLAYBOOK);
  const at = (fp) => negotiabilityScore(row({ 'Price History': '—', 'Days on Market': '1', 'Seller Fingerprint': fp, Notes: '' }), spec);
  assert.equal(at('price is negotiable').score, 1);
  assert.equal(at('price not negotiable').score, 0);
  assert.equal(at('non-negotiable, firm').score, 0);
});

test('a day count below the threshold does not fire, and Unknown never does', () => {
  const spec = extractNegotiability(PLAYBOOK);
  const at = (days) => negotiabilityScore(row({ 'Price History': '—', 'Days on Market': days, Notes: '' }), spec).score;
  assert.equal(at('29'), 0);
  assert.equal(at('30'), 1);
  assert.equal(at('Unknown'), 0);
});

test('sorting by negotiability reorders the queue without dropping anything', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const negotiability = extractNegotiability(PLAYBOOK);
  const rows = parseTracker(tracker([
    // A strong clean-title deal whose seller shows no urgency at all.
    row({ 'Listing ID': '1000000000000001', Score: '13', 'Title Status': 'Clean', 'Price History': '—', 'Days on Market': '1', Notes: 'fresh' }),
    // A weak listing whose seller is plainly motivated.
    row({ 'Listing ID': '1000000000000002', Score: '3', 'Price History': '$9,000 -> $7,000', 'Days on Market': '120', Notes: 'must sell' }),
  ])).rows;

  const byScore = buildQueue(rows, t, bands, { negotiability });
  const byNeg = buildQueue(rows, t, bands, { negotiability, sort: 'negotiability' });

  assert.deepEqual(byScore.map((q) => q.id), ['1000000000000001', '1000000000000002']);
  assert.deepEqual(byNeg.map((q) => q.id), ['1000000000000002', '1000000000000001']);
  // Re-ranking is not filtering: the clean-title deal is still in the queue,
  // and still carries its score, when sorted by how motivated the seller is.
  assert.equal(byNeg.length, byScore.length);
  assert.equal(byNeg[1].score, 13);
  assert.equal(byNeg[1].title, 'Clean');
});

test('buildQueue rejects an unknown sort rather than silently using the default', () => {
  const t = extractTemplates(PLAYBOOK);
  const bands = extractBands(PLAYBOOK);
  const rows = parseTracker(tracker([row()])).rows;
  assert.throws(() => buildQueue(rows, t, bands, { sort: 'price' }), /--sort takes/);
});
