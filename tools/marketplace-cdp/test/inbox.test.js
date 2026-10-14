const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseInboxList,
  parseThread,
  vinCandidates,
  threadKey,
  classify,
  isCarThread,
  diffRows,
  matchCandidates,
} = require('../inbox');

// Synthetic stand-ins. A real inbox carries seller names and phone numbers and
// is gitignored for that reason; these fixtures carry only the shape the
// parsers depend on — the nav chrome above the list, the row layout, and the
// accessibility lines Facebook writes for each message.

const INBOX = `
Marketplace
Categories
Vehicles
Buy and sell groups
More
Selling
Buying
Jobs
Morgan

 · 2016 Subaru Impreza · 2.0i Premium Sedan 4D
Morgan is waiting for your response about 2016 Subaru Impreza · 2.0i Premium Sedan 4D.
10:55 AM
Priya

 · 2017 Toyota Corolla · LE Eco Premium Sedan 4D
Priya sent a photo.
10:32 AM
Dana

 · 2018 Toyota RAV4 · Limited Sport Utility 4D
What is the VIN?
Sun
Avery

 · 2018 Toyota RAV4 · Limited Sport Utility 4D
You: cash price?
Sun
Jordan

 · 2013 Lexus CT · CT 200h Premium Hatchback 4D
Jordan marked the listing as sold.
Mon
Casey

 · Apple MacBook Pro Space Black
Casey sent a photo.
10:42 AM
`;

const THREAD = `
Marketplace
$8,500 - 2016 Subaru Impreza · 2.0i Premium Sedan 4D
See details
Messages
Joined Facebook in 2015
Enter, Conversation details
Hello, is this still available?
Enter, Message sent 12:57 AM by You: Hello, is this still available?
Yes it is
Enter, Message sent 4:27 AM by Morgan: Yes it is
Enter, Message sent 10:51 AM by You: Could you send the 17-character VIN?
Enter, Message sent 3:49 PM by Morgan: 4S3GKAA68J3000006 and it is rebuilt
Compose
Write to Morgan · 2016 Subaru Impreza · 2.0i Premium Sedan 4D
`;

test('parseInboxList skips the nav chrome and reads one row per conversation', () => {
  const rows = parseInboxList(INBOX);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].name, 'Morgan');
  assert.equal(rows[0].listing, '2016 Subaru Impreza · 2.0i Premium Sedan 4D');
  assert.equal(rows[0].time, '10:55 AM');
  assert.match(rows[0].snippet, /waiting for your response/);
});

test('parseInboxList stops at the open conversation pane', () => {
  // The pane is in the same innerText and has bare timestamps of its own; read
  // as rows they would be invented conversations.
  const rows = parseInboxList(INBOX + THREAD);
  assert.equal(rows.length, 6);
  assert.ok(!rows.some((r) => /Could you send/.test(r.snippet || '')));
});

test('classify separates the states that decide who moves next', () => {
  const rows = parseInboxList(INBOX);
  const state = Object.fromEntries(rows.map((r) => [r.name, classify(r)]));
  assert.equal(state.Morgan, 'waiting-on-you');
  assert.equal(state.Priya, 'photo');
  assert.equal(state.Dana, 'unclear');
  assert.equal(state.Avery, 'you-sent-last');
  assert.equal(state.Jordan, 'sold');
});

test('isCarThread drops the half of the inbox that is not a car', () => {
  const rows = parseInboxList(INBOX);
  assert.equal(rows.filter(isCarThread).length, 5);
  assert.ok(!isCarThread(rows.find((r) => r.name === 'Casey')));
});

test('threadKey is stable across the ways Facebook cases a title', () => {
  assert.equal(
    threadKey('Riley', '2016 Mazda MAZDA MAZDA3 · 2.0 Sedan 4D'),
    threadKey('riley', '2016 Mazda Mazda Mazda3 - 2.0 Sedan 4D')
  );
});

test('parseThread reads the transcript with speaker and time attached', () => {
  const t = parseThread(THREAD);
  assert.equal(t.header.price, '$8,500');
  assert.equal(t.header.name, 'Morgan');
  assert.equal(t.header.joined, '2015');
  assert.equal(t.messages.length, 4);
  assert.deepEqual(t.messages[1], { time: '4:27 AM', who: 'Morgan', text: 'Yes it is' });
  // The visible copy of each message sits directly above its accessibility
  // line; reading both would double every transcript.
  assert.equal(t.messages.filter((m) => m.text === 'Yes it is').length, 1);
});

test('vinCandidates finds a VIN a seller typed, and stays a candidate', () => {
  const t = parseThread(THREAD);
  const vins = vinCandidates(t.messages);
  assert.equal(vins.length, 1);
  assert.equal(vins[0].vin, '4S3GKAA68J3000006');
  assert.equal(vins[0].who, 'Morgan');
});

test('diffRows reports only what moved since the baseline', () => {
  const rows = parseInboxList(INBOX).filter(isCarThread);
  const state = {
    swept: '2026-08-26',
    rows: { [rows[0].key]: { snippet: rows[0].snippet, time: rows[0].time } },
  };
  const diffed = diffRows(rows, state);
  assert.equal(diffed.find((r) => r.name === 'Morgan').changed, false);
  assert.equal(diffed.find((r) => r.name === 'Priya').isNew, true);
});

test('matchCandidates proposes but never picks between identical vehicles', () => {
  // The failure this guards: three people selling the same year/model collapse
  // onto one deal under any title-similarity score, and a wrong join sends you
  // to the wrong car.
  const deals = [
    { listing_id: '111', vehicle: '2018 Toyota RAV4 Limited Sport Utility', price: '$9,000', seller: 'Dana R', stage: 'queued' },
    { listing_id: '222', vehicle: '2018 Toyota RAV4 Limited Sport Utility', price: '$9,500', seller: 'Avery M', stage: 'queued' },
  ];
  const rows = parseInboxList(INBOX).filter(isCarThread);
  const dana = rows.find((r) => r.name === 'Dana');
  const { linked, candidates } = matchCandidates(dana, deals);
  assert.equal(linked, null, 'must not auto-link');
  assert.ok(candidates.length > 1, 'both look plausible, so both are offered');
});

test('matchCandidates honours a stored binding and stops guessing', () => {
  const rows = parseInboxList(INBOX).filter(isCarThread);
  const dana = rows.find((r) => r.name === 'Dana');
  const deals = [{ listing_id: '111', vehicle: '2018 Toyota RAV4', thread_key: dana.key, stage: 'queued' }];
  const { linked, candidates } = matchCandidates(dana, deals);
  assert.equal(linked.listing_id, '111');
  assert.equal(candidates.length, 0);
});
