const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseRow, selectMarketplaceTab } = require('../mp');
const { isNonCar, loadCaptures, mergeCaptures, reviewReason, toCsv } = require('../merge');
const { parseCsv } = require('../validate');

const feed = (targetId, url) => ({ targetId, url, type: 'page', title: targetId });

test('selectMarketplaceTab prefers an explicit target, then a pinned target', () => {
  const tabs = [
    feed('one', 'https://www.facebook.com/marketplace/category/vehicles?minPrice=4000'),
    feed('two', 'https://www.facebook.com/marketplace/category/vehicles?minPrice=6000'),
  ];

  assert.equal(selectMarketplaceTab(tabs, 'two', null).targetId, 'two');
  assert.equal(selectMarketplaceTab(tabs, null, { targetId: 'one' }).targetId, 'one');
});

test('selectMarketplaceTab refuses an ambiguous unpinned capture', () => {
  const tabs = [
    feed('one', 'https://www.facebook.com/marketplace/category/vehicles?minPrice=4000'),
    feed('two', 'https://www.facebook.com/marketplace/category/vehicles?minPrice=6000'),
  ];
  assert.throws(() => selectMarketplaceTab(tabs, null, null), /Found 2 Marketplace/);
});

test('parseRow handles reduced-price card labels', () => {
  const row = parseRow({
    id: '123',
    position: 7,
    label:
      '2018 Toyota Corolla LE Sedan 4D, $4,500, reduced from $6,500, Fort Lauderdale, FL, listing 123',
  });
  assert.equal(row.parsed, true);
  assert.equal(row.price, 4500);
  assert.equal(row.wasPrice, 6500);
  assert.equal(row.make, 'Toyota');
  assert.equal(row.city, 'Fort Lauderdale');
});

test('parseRow keeps cards a quiet seller left incomplete', () => {
  const blankCity = parseRow({
    id: '1000000000000201',
    position: 3,
    label: '2007 Toyota prius Four Hatchback 4D, $4,800, , listing 1000000000000201',
  });
  assert.equal(blankCity.parsed, true);
  assert.equal(blankCity.make, 'Toyota');
  assert.equal(blankCity.price, 4800);
  assert.equal(blankCity.city, '');

  const spelledOutState = parseRow({
    id: '1000000000000202',
    position: 4,
    label: '2016 GMC acadia Sport Utility 4D, $6,000, Country Walk, Florida, listing 1000000000000202',
  });
  assert.equal(spelledOutState.parsed, true);
  assert.equal(spelledOutState.city, 'Country Walk');
  assert.equal(spelledOutState.state, 'FL');

  const noTitle = parseRow({
    id: '1000000000000203',
    position: 5,
    label: ', $5,500, Pompano Beach, FL, listing 1000000000000203',
  });
  assert.equal(noTitle.parsed, true);
  assert.equal(noTitle.price, 5500);
  assert.equal(noTitle.make, '');
  assert.equal(noTitle.city, 'Pompano Beach');

  const makeIdLeak = parseRow({
    id: '1000000000000204',
    position: 6,
    label: '2020 308436969822020 honda civic EX-L, $8,999, Miami, FL, listing 1000000000000204',
  });
  assert.equal(makeIdLeak.make, 'honda');
  assert.equal(makeIdLeak.model, 'civic EX-L');
});

test('reviewReason flags cards that cannot be triaged from the title alone', () => {
  assert.equal(reviewReason({ year: 2010, make: 'Toyota' }), '');
  assert.equal(reviewReason({ year: '', make: '' }), 'no-title');
  assert.equal(reviewReason({ year: 2011, make: 'Camry' }), 'unknown-make');
  assert.equal(reviewReason({ year: 2016, make: 'Chevrolet' }), '');
  assert.equal(reviewReason({ year: '', make: 'Toyota' }), 'no-year');
});

test('merged rows carry the review flag so a quiet card cannot vanish', () => {
  const capture = {
    file: 'pass.json',
    data: {
      capturedAt: '2026-08-21T10:00:00.000Z',
      listings: [
        { id: '1', year: 2010, make: 'Toyota', model: 'Corolla', price: 5000, label: 'a' },
        { id: '2', year: null, make: '', model: '', price: 5500, label: 'b' },
        { id: '3', year: 2011, make: 'Camry', model: 'se', price: 6300, label: 'c' },
      ],
    },
  };
  const { rows } = mergeCaptures([capture]);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));

  assert.equal(rows.length, 3, 'no row is dropped for being unreadable');
  assert.equal(byId['1'].review, '');
  assert.equal(byId['2'].review, 'no-title');
  assert.equal(byId['3'].review, 'unknown-make');
  assert.match(toCsv(rows).split('\n')[0], /,review,/);
});

test('non-car classifier catches known leaks without matching Navigation or Suzuki cars', () => {
  assert.equal(
    isNonCar({ make: 'Honda', model: 'Goldwing', label: '2014 Honda Goldwing, $5,000' }),
    true
  );
  assert.equal(
    isNonCar({ make: 'Toyota', model: 'forlikf', label: '1995 Toyota forlikf, $5,000' }),
    true
  );
  assert.equal(
    isNonCar({ make: 'Honda', model: 'Civic EX-L Navigation', label: '2014 Honda Civic EX-L Navigation' }),
    false
  );
  assert.equal(
    isNonCar({ make: 'Suzuki', model: 'SX4 Hatchback 4D', label: '2012 Suzuki SX4 Hatchback 4D' }),
    false
  );
});

test('captures merge by capturedAt and keep the latest observation internally consistent', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-merge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const earlier = {
    capturedAt: '2026-08-20T10:00:00.000Z',
    listings: [
      {
        id: '123',
        position: 8,
        year: 2018,
        make: 'Toyota',
        model: 'Corolla',
        price: 6500,
        wasPrice: null,
        city: 'Miami',
        url: 'https://www.facebook.com/marketplace/item/123/',
        label: '2018 Toyota Corolla, $6,500, Miami, FL, listing 123',
      },
    ],
  };
  const later = {
    capturedAt: '2026-08-21T10:00:00.000Z',
    listings: [
      {
        ...earlier.listings[0],
        position: 12,
        model: 'Corolla LE Sedan 4D',
        price: 4500,
        wasPrice: 6500,
        label:
          '2018 Toyota Corolla LE Sedan 4D, $4,500, reduced from $6,500, Miami, FL, listing 123',
      },
    ],
  };

  // Filenames deliberately sort in the opposite order from capture timestamps.
  fs.writeFileSync(path.join(dir, 'z-earlier.json'), JSON.stringify(earlier));
  fs.writeFileSync(path.join(dir, 'a-later.json'), JSON.stringify(later));

  const loaded = loadCaptures(dir);
  const result = mergeCaptures(loaded.captures);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].first_pass, 'z-earlier');
  assert.equal(result.rows[0].last_pass, 'a-later');
  assert.equal(result.rows[0].price, 4500);
  assert.match(result.rows[0].label, /\$4,500/);
  assert.equal(result.rows[0].price_changed, '6500->4500');

  const csv = parseCsv(toCsv(result.rows));
  assert.equal(csv.length, 2);
  assert.equal(csv[0].includes('last_pass'), true);
});
