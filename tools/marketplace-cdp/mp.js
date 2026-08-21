#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { browserClient, pageTargets, attach, evaluate, sleep } = require('./cdp');

const PAGE_SIZE = 24;
const PIN_FILE = path.join(__dirname, '.marketplace-target.json');

function writeJson(file, value) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2) + '\n');
}

function pageExtract() {
  const links = Array.from(
    document.querySelectorAll('a[href*="/marketplace/item/"]')
  );
  const seen = new Map();

  for (const a of links) {
    const idMatch = a.href.match(/item\/(\d+)/);
    if (!idMatch) continue;

    let ref = null;
    let qid = null;
    let position = null;
    try {
      const params = new URL(a.href).searchParams;
      ref = params.get('ref');
      const tracking = params.get('tracking');
      if (tracking) {
        const parsed = JSON.parse(tracking);
        qid = parsed.qid || null;
        const rank =
          typeof parsed.commerce_rank_obj === 'string'
            ? JSON.parse(parsed.commerce_rank_obj)
            : parsed.commerce_rank_obj;
        if (rank && typeof rank.primary_position === 'number') {
          position = rank.primary_position;
        }
      }
    } catch (e) {
      /* malformed tracking blob — fall back to ref alone */
    }

    const row = {
      id: idMatch[1],
      ref,
      qid,
      position,
      isResult:
        position !== null ||
        (ref ? /serp|category_feed/.test(ref) : false),
      label: (a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
      text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    };

    const prev = seen.get(row.id);
    if (!prev || (row.isResult && !prev.isResult)) seen.set(row.id, row);
  }

  const el = document.scrollingElement;
  return JSON.stringify({
    url: location.href,
    scrollY: Math.round(window.scrollY),
    scrollHeight: el ? el.scrollHeight : 0,
    innerHeight: window.innerHeight,
    atBottom: el
      ? window.scrollY + window.innerHeight > el.scrollHeight - 400
      : false,
    rows: Array.from(seen.values()),
  });
}

const EXTRACT_EXPR = `(${pageExtract.toString()})()`;

function parseRow(row) {
  const base = {
    id: row.id,
    position: row.position,
    url: `https://www.facebook.com/marketplace/item/${row.id}/`,
    label: row.label || row.text,
  };

  // Price-reduced cards insert an extra "reduced from $X" segment before the city.
  const m = row.label.match(
    /^(.*?),\s*\$([\d,]+(?:\.\d+)?),\s*(?:reduced from\s*\$([\d,]+(?:\.\d+)?),\s*)?(.+?),\s*([A-Za-z]{2}),\s*listing\s*(\d+)$/i
  );
  if (!m) return { ...base, parsed: false };

  const [, vehicle, price, wasPrice, city, state] = m;
  const v = vehicle.match(/^(\d{4})\s+(\S+)\s*(.*)$/);
  const num = (s) => Number(String(s).replace(/,/g, ''));
  return {
    ...base,
    parsed: true,
    year: v ? Number(v[1]) : null,
    make: v ? v[2] : vehicle,
    model: v ? v[3] : '',
    price: num(price),
    wasPrice: wasPrice ? num(wasPrice) : null,
    city,
    state: state.toUpperCase(),
  };
}

function isMarketplaceFeed(url) {
  return /facebook\.com\/marketplace\/(?:category\/|[^/]+\/)?(?:search|vehicles)/.test(
    url || ''
  );
}

function loadPinnedTarget() {
  if (!fs.existsSync(PIN_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(PIN_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`Pinned Marketplace tab state is malformed: ${err.message}`);
  }
}

function savePinnedTarget(target) {
  fs.writeFileSync(
    PIN_FILE,
    JSON.stringify(
      {
        targetId: target.targetId,
        url: target.url,
        pinnedAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
}

function selectMarketplaceTab(tabs, explicitTargetId, pinnedTarget) {
  const pages = tabs.filter((t) => t.type === 'page');

  if (explicitTargetId) {
    const selected = pages.find((t) => t.targetId === explicitTargetId);
    if (!selected) throw new Error(`Chrome target not found: ${explicitTargetId}`);
    if (!isMarketplaceFeed(selected.url)) {
      throw new Error(`Target ${explicitTargetId} is not a Marketplace search feed.`);
    }
    return selected;
  }

  if (pinnedTarget?.targetId) {
    const selected = pages.find((t) => t.targetId === pinnedTarget.targetId);
    if (selected && isMarketplaceFeed(selected.url)) return selected;
  }

  const feeds = pages.filter((t) => isMarketplaceFeed(t.url));
  if (!feeds.length) return null;
  if (feeds.length === 1) return feeds[0];

  throw new Error(
    `Found ${feeds.length} Marketplace search tabs and none is pinned. ` +
      'Run "node mp.js tabs", then "node mp.js read --target <target-id>"; ' +
      'or use "node mp.js open <url>" to pin a new tab.'
  );
}

async function findMarketplaceTab(client, explicitTargetId) {
  const tabs = await pageTargets(client);
  return selectMarketplaceTab(tabs, explicitTargetId, loadPinnedTarget());
}

async function cmdTabs(client) {
  const tabs = await pageTargets(client);
  if (!tabs.length) return console.log('No open tabs.');
  const pinned = loadPinnedTarget();
  tabs.forEach((t) => {
    const mark = t.url.includes('/marketplace/') ? '*' : ' ';
    const pin = t.targetId === pinned?.targetId ? '>' : ' ';
    console.log(
      `${pin}${mark} ${t.targetId} ${(t.title || '').slice(0, 38).padEnd(38)} ${t.url.slice(0, 90)}`
    );
  });
  console.log('\n> = pinned capture tab, * = Marketplace tab');
}

async function cmdOpen(client, url) {
  if (!url) throw new Error('usage: node mp.js open "<marketplace url>"');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('open expects a valid Marketplace URL.');
  }
  if (!/(^|\.)facebook\.com$/i.test(parsed.hostname) || !parsed.pathname.startsWith('/marketplace/')) {
    throw new Error('open only accepts facebook.com/marketplace URLs.');
  }
  const { targetId } = await client.send('Target.createTarget', { url });
  await client.send('Target.activateTarget', { targetId });
  savePinnedTarget({ targetId, url });
  console.log(
    `Opened, focused, and pinned target ${targetId}.\n` +
      'Scroll it to the bottom by hand, wait for loading to stop, then: node mp.js read'
  );
}

async function cmdRead(client, opts) {
  const tab = await findMarketplaceTab(client, opts.target);
  if (!tab) throw new Error('No Marketplace tab open. Use: node mp.js open "<url>"');
  savePinnedTarget(tab);

  const sessionId = await attach(client, tab.targetId);
  let data;
  try {
    data = JSON.parse(await evaluate(client, sessionId, EXTRACT_EXPR));
  } finally {
    await client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }

  const all = data.rows;
  const results = opts.all ? all : all.filter((r) => r.isResult);
  const rows = results.map(parseRow);
  rows.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));

  const batches = new Set(results.map((r) => r.qid).filter(Boolean)).size;
  const maxPos = results.reduce(
    (max, r) => (r.position !== null && r.position > max ? r.position : max),
    -1
  );
  const unparsed = rows.filter((r) => !r.parsed).length;

  console.log(`URL      : ${data.url}`);
  console.log(`Target   : ${tab.targetId} (pinned)`);
  console.log(
    `Scroll   : ${data.scrollY} / ${data.scrollHeight}px${data.atBottom ? ' (at bottom)' : ''}`
  );
  console.log(
    `Listings : ${rows.length} results` +
      (opts.all ? ` (${all.length} incl. recommendations)` : '') +
      (batches ? ` across ${batches} batch(es), highest rank ${maxPos}` : '')
  );
  if (unparsed) {
    console.log(`Warning  : ${unparsed} card(s) had an unrecognised label format`);
  }

  if (rows.length <= PAGE_SIZE) {
    console.log(
      `\nOnly ${rows.length} results (page size is ${PAGE_SIZE}). If you have not scrolled\n` +
        'this tab by hand yet, do that first — automated scrolling does not trigger\n' +
        'Facebook\'s loader. See playbook 8a.'
    );
  }

  if (opts.out) {
    writeJson(opts.out, {
      url: data.url,
      capturedAt: new Date().toISOString(),
      count: rows.length,
      batches,
      listings: rows,
    });
    console.log(`\nWrote ${rows.length} listings to ${opts.out}`);
    return;
  }

  console.log('');
  rows.forEach((r) => {
    if (!r.parsed) return console.log(`[unparsed] ${r.label.slice(0, 80)} ${r.id}`);
    const name = `${r.make} ${r.model}`.trim().slice(0, 32);
    console.log(
      `${String(r.position ?? '').padStart(4)}  ${String(r.year || '????')} ${name.padEnd(32)} ` +
        `$${String(r.price).padStart(7)}  ${(r.city || '').padEnd(18)} ${r.id}`
    );
  });
}

async function cmdItem(client, ids, opts) {
  if (!ids.length) {
    throw new Error('usage: node mp.js item <id-or-url> [<id-or-url> ...] [--out file.json]');
  }
  const results = [];
  for (const idOrUrl of ids) {
    let url;
    if (/^https?:/.test(idOrUrl)) {
      const parsed = new URL(idOrUrl);
      if (
        !/(^|\.)facebook\.com$/i.test(parsed.hostname) ||
        !/^\/marketplace\/item\/\d+/.test(parsed.pathname)
      ) {
        throw new Error(`item only accepts Facebook Marketplace item URLs: ${idOrUrl}`);
      }
      url = parsed.href;
    } else {
      if (!/^\d+$/.test(idOrUrl)) throw new Error(`invalid Marketplace listing id: ${idOrUrl}`);
      url = `https://www.facebook.com/marketplace/item/${idOrUrl}/`;
    }
    let targetId;
    let sessionId;
    try {
      ({ targetId } = await client.send('Target.createTarget', { url }));
      await sleep(3500);
      sessionId = await attach(client, targetId);
      let text = await evaluate(client, sessionId, 'document.body.innerText');
      if (!text || text.length < 200) {
        await sleep(2500);
        text = await evaluate(client, sessionId, 'document.body.innerText');
      }
      const title = await evaluate(client, sessionId, 'document.title');
      const id = url.match(/\/marketplace\/item\/(\d+)/)?.[1] || idOrUrl;
      console.log(`Captured ${id} — "${title}" (${text ? text.length : 0} chars)`);
      results.push({ id, url, title, text: text || '' });
    } finally {
      if (sessionId) {
        await client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
      if (targetId) {
        await client.send('Target.closeTarget', { targetId }).catch(() => {});
      }
    }
  }
  if (opts.out) {
    writeJson(opts.out, results);
    console.log(`\nWrote ${results.length} item page(s) to ${opts.out}`);
  } else {
    console.log('\n(no --out given — nothing written to disk)');
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(
      'Commands:\n' +
        '  tabs                              list open browser tabs\n' +
        '  open "<url>"                      open and pin a Marketplace search\n' +
        '  read [--out f] [--all] [--target id]  extract the pinned search tab\n' +
        '  item <id...> [--out f]            dump listing-page text'
    );
    return;
  }
  const opts = {
    all: rest.includes('--all'),
    out: rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : null,
    target: rest.includes('--target') ? rest[rest.indexOf('--target') + 1] : null,
  };
  const ids = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out') { i++; continue; }
    if (rest[i] === '--target') { i++; continue; }
    if (rest[i] === '--all') continue;
    ids.push(rest[i]);
  }

  const client = await browserClient();
  try {
    switch (cmd) {
      case 'tabs':
        await cmdTabs(client);
        break;
      case 'open':
        await cmdOpen(client, rest[0]);
        break;
      case 'read':
        await cmdRead(client, opts);
        break;
      case 'item':
        await cmdItem(client, ids, opts);
        break;
      default:
        console.log(
          'Commands:\n' +
            '  tabs                    list open browser tabs\n' +
            '  open "<url>"            open a Marketplace search and focus it\n' +
            '  read [--out f] [--all] [--target id]  extract listings from the pinned Marketplace tab\n' +
            '  item <id...> [--out f]  open one or more listing pages, dump page text (read-only, never scrolls/clicks/messages)'
        );
    }
  } finally {
    client.close();
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  );
}

module.exports = {
  parseRow,
  isMarketplaceFeed,
  selectMarketplaceTab,
};
