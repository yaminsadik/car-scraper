#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { browserClient, pageTargets, attach, evaluate, sleep } = require('./cdp');
const msglib = require('./msg');
const inboxlib = require('./inbox');

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
        (ref ? /serp|search|category_feed/.test(ref) : false),
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

// Photo attachments, fetched inside the page so the browser's own session
// carries the request. Facebook's CDN links are signed and short-lived, so the
// bytes come back now rather than a URL that will 403 by the time anyone opens
// it.
//
// Scoping matters more here than it looks. A listing page carries the seller's
// whole photo carousel — 64 images at 960x720 on the page I tested, against
// four in the conversation — so the search climbs from the first message
// marker to the largest ancestor that still does not engulf the carousel. That
// works on the listing page and in the inbox pane alike.
async function pageImages() {
  const big = (el) => Array.from(el.querySelectorAll('img')).filter((i) => i.naturalWidth >= 200).length;
  const pageBig = big(document);

  let scope = document;
  const marker = Array.from(document.querySelectorAll('span')).find((e) =>
    /Message sent/.test(e.textContent || '')
  );
  if (marker) {
    let node = marker.parentElement;
    let best = null;
    for (let i = 0; i < 25 && node; i++) {
      if (pageBig && big(node) >= pageBig * 0.5) break;
      best = node;
      node = node.parentElement;
    }
    if (best) scope = best;
  }

  const seen = new Set();
  const out = [];
  for (const img of Array.from(scope.querySelectorAll('img'))) {
    if (img.naturalWidth < 200 || img.naturalHeight < 200) continue;
    if (!/scontent|fbcdn/.test(img.src) || seen.has(img.src)) continue;
    seen.add(img.src);
    if (out.length >= 12) break;
    try {
      const blob = await (await fetch(img.src)).blob();
      const data = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1]);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      out.push({
        url: img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        ext: (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg'),
        data,
      });
    } catch (e) {
      /* one unreadable attachment is not a reason to lose the rest */
    }
  }
  return JSON.stringify({ scoped: scope !== document, pageBig, images: out });
}

const IMAGES_EXPR = `(${pageImages.toString()})()`;

// Facebook sometimes writes the state out in full, and a seller can leave the
// city blank or give the listing no title at all. None of that is a reason to
// lose the card, so every segment after the price is optional.
const STATE_NAMES = {
  florida: 'FL',
  georgia: 'GA',
  alabama: 'AL',
  louisiana: 'LA',
  mississippi: 'MS',
  'south carolina': 'SC',
  'north carolina': 'NC',
  tennessee: 'TN',
  texas: 'TX',
};

function parseLocation(text) {
  const location = String(text || '').trim().replace(/,$/, '');
  if (!location) return { city: '', state: '' };

  const split = location.match(/^(.*),\s*([A-Za-z][A-Za-z. ]*)$/);
  if (!split) return { city: location, state: '' };

  const [, city, rawState] = split;
  const key = rawState.trim().toLowerCase().replace(/\./g, '');
  if (key.length === 2) return { city: city.trim(), state: key.toUpperCase() };
  if (STATE_NAMES[key]) return { city: city.trim(), state: STATE_NAMES[key] };
  return { city: location, state: '' };
}

function parseVehicle(text) {
  const vehicle = String(text || '').trim();
  if (!vehicle) return { year: null, make: '', model: '' };

  const m = vehicle.match(/^(\d{4})\s+(.*)$/);
  if (!m) return { year: null, make: vehicle, model: '' };

  // A numeric second token is Facebook's internal make ID leaking into the
  // title (e.g. "2020 308436969822020 honda civic EX-L"); the real make follows.
  const rest = m[2].replace(/^\d{6,}\s+/, '').trim();
  const parts = rest.split(/\s+/);
  return {
    year: Number(m[1]),
    make: parts[0] || '',
    model: parts.slice(1).join(' '),
  };
}

function parseRow(row) {
  const base = {
    id: row.id,
    position: row.position,
    url: `https://www.facebook.com/marketplace/item/${row.id}/`,
    label: row.label || row.text,
  };

  // Price-reduced cards insert an extra "reduced from $X" segment before the city.
  const m = String(row.label || '').match(
    /^(.*?),\s*\$([\d,]+(?:\.\d+)?),\s*(?:reduced from\s*\$([\d,]+(?:\.\d+)?),\s*)?(.*?),?\s*listing\s*(\d+)$/i
  );
  if (!m) return { ...base, parsed: false };

  const [, vehicleText, price, wasPrice, location] = m;
  const num = (s) => Number(String(s).replace(/,/g, ''));
  const { year, make, model } = parseVehicle(vehicleText);
  const { city, state } = parseLocation(location);

  return {
    ...base,
    parsed: true,
    year,
    make,
    model,
    price: num(price),
    wasPrice: wasPrice ? num(wasPrice) : null,
    city,
    state,
  };
}

function isMarketplaceFeed(url) {
  return /facebook\.com\/marketplace\/(?:category\/|[^/]+\/)?(?:search|vehicles|[a-zA-Z0-9_-]+)/.test(
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

function isInboxTab(url) {
  return /facebook\.com\/(?:marketplace\/inbox|messages)/.test(url || '');
}

async function findInboxTab(client) {
  const tabs = (await pageTargets(client)).filter((t) => isInboxTab(t.url));
  if (!tabs.length) {
    throw new Error(
      'No Marketplace inbox tab open. Open https://www.facebook.com/marketplace/inbox ' +
        'in Chrome, scroll the conversation list to the bottom by hand, then run this again.'
    );
  }
  return tabs[0];
}

async function readInboxTab(client) {
  const tab = await findInboxTab(client);
  const sessionId = await attach(client, tab.targetId);
  try {
    return { tab, text: await evaluate(client, sessionId, 'document.body.innerText') };
  } finally {
    await client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}

// The sweep. Reads whatever the list has loaded, classifies it, and diffs it
// against the last run. Read-only: it never clicks a conversation open, never
// scrolls, and never sends — playbook §11 and §8a both apply here unchanged.
async function cmdInbox(client, opts) {
  const { text } = await readInboxTab(client);
  const rows = inboxlib.parseInboxList(text);
  if (!rows.length) {
    throw new Error(
      'Read the inbox tab but parsed no conversations. Either the list had not ' +
        'rendered yet, or Facebook changed its markup — check with: node mp.js inbox --raw'
    );
  }

  const state = inboxlib.loadState();
  const cars = rows.filter(inboxlib.isCarThread).map((r) => ({ ...r, state: inboxlib.classify(r) }));
  const other = rows.length - cars.length;
  const diffed = inboxlib.diffRows(cars, state);
  const deals = require('./deal.js').listDeals();

  console.log(`Inbox read — ${rows.length} conversation(s): ${cars.length} about cars, ${other} other.`);
  console.log(`Last sweep : ${state.swept || 'never — everything below is new'}`);
  // The conversation list is virtualised exactly like the search feed (§8a).
  // A short read is far more often an unscrolled tab than a small inbox, and
  // silently sweeping a third of the list is the failure worth shouting about.
  if (rows.length <= 20) {
    console.log(
      `\n!! Only ${rows.length} conversations loaded. Facebook renders the list in ` +
        'pages as you scroll — if you have more than this, the tab was not scrolled.\n' +
        '   Scroll the conversation list to the bottom by hand and run this again.'
    );
  }

  const groups = [
    ['NEW PHOTOS', (r) => r.state === 'photo'],
    ['WAITING ON YOU', (r) => r.state === 'waiting-on-you'],
    ['LAST SPEAKER UNCLEAR', (r) => r.state === 'unclear'],
    ['YOU SENT LAST', (r) => r.state === 'you-sent-last'],
    ['MARKED SOLD', (r) => r.state === 'sold'],
  ];
  const shown = opts.all ? diffed : diffed.filter((r) => r.changed);
  console.log(`\n${shown.length} ${opts.all ? 'car conversation(s)' : 'changed since last sweep'}\n`);

  const unlinked = [];
  for (const [label, pick] of groups) {
    const set = shown.filter(pick);
    if (!set.length) continue;
    console.log(`  ${label} (${set.length})`);
    for (const r of set) {
      const { linked, candidates } = inboxlib.matchCandidates(r, deals);
      const tag = linked ? `deal ${linked.listing_id}` : candidates.length ? 'UNLINKED' : 'NOT TRACKED';
      console.log(`    ${(r.name || '?').slice(0, 18).padEnd(18)} ${String(r.listing).slice(0, 44).padEnd(44)} ${r.time.padEnd(9)} ${tag}`);
      if (!linked) unlinked.push({ row: r, candidates });
    }
    console.log('');
  }

  if (unlinked.length) {
    console.log(`  ${unlinked.length} conversation(s) not bound to a deal file.`);
    console.log('  Bind each one once — the key is stored and never asked again:\n');
    for (const { row, candidates } of unlinked.slice(0, opts.limit || 12)) {
      console.log(`    ${row.name} · ${row.listing}`);
      if (!candidates.length) {
        console.log('      no candidate deal — this conversation is not tracked anywhere.');
      } else {
        for (const c of candidates) {
          console.log(`      ${c.deal.listing_id}  ${String(c.deal.vehicle).slice(0, 40).padEnd(40)} ${c.deal.price}`);
        }
        console.log(`      node mp.js deal thread <id above> "${row.key}"`);
      }
      console.log('');
    }
  }

  if (!opts.dry) {
    const when = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(inboxlib.INBOX_DIR, { recursive: true });
    writeJson(path.join(inboxlib.INBOX_DIR, `${when}_inbox.json`), cars);
    inboxlib.saveState(cars, when);
    console.log(`Baseline saved — next run reports what changed after ${when}.`);
  }
}

// Reads one conversation. Two ways in, and the listing-page route is the one
// to prefer:
//
//   node mp.js thread <listing-id>   opens that listing; the conversation with
//                                    its seller is on the page. The listing ID
//                                    is known by construction, so there is
//                                    nothing to match and nothing to guess.
//   node mp.js thread                reads whichever conversation is open in
//                                    the inbox tab — for conversations that
//                                    have no deal file yet.
//
// Either way it saves the transcript, downloads the photos before Facebook's
// signed URLs expire, and reports what it could not do. Reading a photo is the
// human's job and it says so out loud rather than guessing at the contents.
async function cmdThread(client, ids, opts) {
  const id = ids[0];
  if (id && !/^\d{8,}$/.test(id)) throw new Error(`invalid Marketplace listing id: ${id}`);

  let sessionId;
  let tab;
  if (id) {
    const url = `https://www.facebook.com/marketplace/item/${id}/`;
    tab = (await pageTargets(client, `/marketplace/item/${id}`))[0];
    if (!tab) {
      const { targetId } = await client.send('Target.createTarget', { url });
      await client.send('Target.activateTarget', { targetId });
      console.log(
        `Opened ${url}\n` +
          'Click "Message" on that page so the conversation is on screen, then run:\n' +
          `  node mp.js thread ${id}`
      );
      return;
    }
    await client.send('Target.activateTarget', { targetId: tab.targetId }).catch(() => {});
    sessionId = await attach(client, tab.targetId);
  } else {
    tab = await findInboxTab(client);
    sessionId = await attach(client, tab.targetId);
  }

  let text;
  let shot = { images: [], scoped: false };
  try {
    text = await evaluate(client, sessionId, 'document.body.innerText');
    shot = JSON.parse(await evaluate(client, sessionId, IMAGES_EXPR));
  } finally {
    await client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }

  const thread = inboxlib.parseThread(text);
  if (!thread.messages.length) {
    throw new Error(
      id
        ? `That listing page has no conversation on screen. Click "Message" on the tab for ${id}, then run this again.`
        : 'No open conversation found in the inbox tab. Click a conversation so its messages are on screen, then run this again.'
    );
  }

  const dealLib = require('./deal.js');
  const deals = dealLib.listDeals();
  const deal = id
    ? deals.find((d) => d.listing_id === id)
    : deals.find((d) => d.thread_key === thread.key);

  const when = new Date().toISOString().slice(0, 10);
  const dir = inboxlib.threadDir(id || thread.key);
  const file = inboxlib.saveTranscript(dir, thread, when);
  const { added, manifest } = inboxlib.saveImages(dir, shot.images, when);

  console.log(`${thread.header.name || '?'} · ${thread.header.title || '?'}${thread.header.price ? ` — ${thread.header.price}` : ''}`);
  console.log(`${thread.messages.length} message(s) -> ${path.relative(inboxlib.ROOT, file)}`);
  for (const m of thread.messages.slice(-6)) {
    console.log(`  [${m.time}] ${m.who}: ${String(m.text).slice(0, 88)}`);
  }
  if (!shot.scoped && shot.pageBig > 12) {
    console.log(
      `\n  ! Could not isolate the conversation from the rest of the page ` +
        `(${shot.pageBig} large images on it). Check the saved files are attachments, not listing photos.`
    );
  }

  const vins = inboxlib.vinCandidates(thread.messages);
  if (vins.length) {
    console.log('\n  VIN candidate(s) typed in the conversation:');
    for (const v of vins) {
      console.log(`    ${v.vin}  (${v.who}, ${v.time})`);
      // Deliberately not recorded here. deal.js runs the check digit and owns
      // the stage; a candidate scraped off a chat is not a verified fact.
      if (deal) console.log(`    verify + record: node mp.js deal vin ${deal.listing_id} ${v.vin}`);
    }
  }

  if (added.length) {
    console.log(`\n  ${added.length} new image(s) saved:`);
    for (const i of added) console.log(`    ${path.relative(inboxlib.ROOT, path.join(dir, i.file))}  (${i.width}x${i.height})`);
  }

  const unreviewed = manifest.images.filter((i) => !i.reviewed).length;
  if (unreviewed) {
    console.log(`\n  BLOCKED — needs you: ${unreviewed} unreviewed image(s).`);
    console.log('  Reading a photo is not something this tool can do. Look at the files above, then:');
    console.log(`    node mp.js deal note ${deal ? deal.listing_id : '<listing id>'} photos "what it showed"`);
  }

  if (!deal) {
    console.log('\n  No deal file for this conversation.');
    console.log(`    node mp.js deal open <listing id>        # if it is in seen_listings.md`);
    console.log(`    node mp.js deal thread <listing id> "${thread.key}"`);
    return;
  }
  if (opts.dry) return;

  // The photo count is the only thing written back automatically. What a photo
  // showed, and whether a VIN is real, both stay behind their own commands —
  // this read is evidence collection, not a verdict.
  const target = dealLib.dealPath(deal.listing_id);
  const parsed = dealLib.parseDeal(fs.readFileSync(target, 'utf8'));
  parsed.photos_seen = String(manifest.images.length);
  if (dealLib.blank(parsed.photos_reviewed)) parsed.photos_reviewed = '0';
  // Reading via the listing page teaches us the inbox key for free, which is
  // what lets `mp.js inbox` show this conversation as linked next sweep
  // without anyone doing a binding pass for it.
  if (dealLib.blank(parsed.thread_key) && thread.key && thread.key !== '|') parsed.thread_key = thread.key;
  parsed.updated = when;
  parsed._sections.Timeline =
    `${(parsed._sections.Timeline || '').trim()}\n- ${when} — conversation read: ` +
    `${thread.messages.length} message(s), ${manifest.images.length} image(s) on file` +
    `${vins.length ? `, VIN candidate ${vins.map((v) => v.vin).join(', ')}` : ''}.`;
  fs.writeFileSync(target, dealLib.renderDeal(parsed));
  console.log(`\n  ${path.relative(inboxlib.ROOT, target)} updated (photos_seen=${parsed.photos_seen}).`);
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
      let text = '';
      try {
        text = await evaluate(client, sessionId, 'document.body ? document.body.innerText : ""');
        if (!text || text.length < 200) {
          await sleep(2500);
          text = await evaluate(client, sessionId, 'document.body ? document.body.innerText : ""');
        }
      } catch (evalErr) {
        text = '';
      }
      let title = '';
      try {
        title = await evaluate(client, sessionId, 'document.title || ""');
      } catch (titleErr) {
        title = '';
      }
      const id = url.match(/\/marketplace\/item\/(\d+)/)?.[1] || idOrUrl;
      console.log(`Captured ${id} — "${title}" (${text ? text.length : 0} chars)`);
      results.push({ id, url, title: title || '', text: text || '' });
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

// --- msg -----------------------------------------------------------------
//
// Renders the seller messages you send by hand. Nothing here contacts a
// seller: `--next` opens the listing and fills your clipboard, and you press
// paste and send yourself. Playbook §11 forbids automated contact, and scripted
// Messenger traffic is what gets Marketplace accounts banned.

function copyToClipboard(text) {
  if (process.platform !== 'darwin') return false;
  return spawnSync('pbcopy', { input: text }).status === 0;
}

function writeTracker(text) {
  const tmp = `${msglib.TRACKER}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, msglib.TRACKER);
}

// The listing opens in its own tab and the pinned capture tab is left alone —
// the pin belongs to a search feed, and losing it costs a whole slice.
async function openListingTab(client, url) {
  const { targetId } = await client.send('Target.createTarget', { url });
  await client.send('Target.activateTarget', { targetId });
  return targetId;
}

const QUEUE_HEADER =
  '  #  sc neg  listing id           price  band   title      vehicle';

// Both scores are always shown, whichever way the queue is sorted: a strong
// clean-title deal must stay visible when ranking by negotiability, and a
// motivated seller must stay visible when ranking by score.
function printQueueRow(n, item, withText) {
  const title = (item.title || '—').split(/[(/]/)[0].trim().slice(0, 9);
  console.log(
    `${String(n).padStart(3)}  ${String(item.score).padStart(2)} ${String(item.neg).padStart(3)}  ` +
      `${(item.id || '(no id)').padEnd(17)} ${String(item.price).padStart(8)}  ` +
      `${item.band.padEnd(6)} ${title.padEnd(10)} ${item.vehicle.slice(0, 34)}`
  );
  if (withText) {
    console.log(`     ${item.url || '(no URL on the tracker row — open by hand)'}`);
    const neg = item.negSignals.length ? `negotiability: ${item.negSignals.join(', ')}` : 'no negotiability signals';
    console.log(`     ${item.why} | ${neg}`);
    console.log(`     ${item.message}\n`);
  }
}

function reportSkipped(skipped) {
  skipped.forEach((s) => console.log(`  skipped ${s.id}: ${s.reason}`));
}

async function cmdMsg(getClient, ids, opts) {
  const data = msglib.load();
  const today = new Date().toISOString().slice(0, 10);

  if (opts.sent) {
    const row = data.rows.find((r) => msglib.listingId(r) === String(opts.sent));
    if (!row) throw new Error(`No tracker row with Listing ID ${opts.sent}.`);
    const { stage } = msglib.stageFor(row);
    const { text, changes } = msglib.markSent(data.tracker, opts.sent, { date: today, stage });
    if (text.split('\n').length !== data.tracker.split('\n').length) {
      throw new Error('Refusing to write: the update changed the tracker line count.');
    }
    if (!changes.length) return console.log(`${opts.sent}: already recorded, nothing to change.`);
    if (opts.dry) {
      console.log(`${opts.sent} (dry run) would change:`);
    } else {
      writeTracker(text);
      console.log(`${opts.sent} updated in seen_listings.md:`);
    }
    changes.forEach((c) => console.log(`  ${c}`));
    return;
  }

  // Listing IDs named on the command line pick specific rows — in the order
  // given, not re-ranked by score — instead of pulling from the full ranked
  // queue. This is how you (or an agent you told which ones) work a chosen
  // handful rather than the whole tracker.
  const explicit = ids.length > 0;
  const { picked, skipped } = explicit
    ? msglib.pickQueue(data.rows, data.templates, data.bands, ids, data.negotiability)
    : { picked: null, skipped: [] };

  if (explicit && skipped.length) reportSkipped(skipped);

  const queue = explicit
    ? picked
    : msglib.buildQueue(data.rows, data.templates, data.bands, {
        stage: opts.stage,
        minScore: opts.minScore,
        sort: opts.sort,
        negotiability: data.negotiability,
      });

  if (!queue.length) {
    return console.log(
      explicit
        ? 'None of the named listings are owed a message right now.'
        : 'Nothing is owed a message. Every eligible row has a confirmed cash price, a VIN and a dashboard on file.'
    );
  }

  if (opts.next) {
    const item = queue.find((q) => q.url);
    if (!item) throw new Error('The next listing has no URL on its tracker row — open it by hand.');
    console.log(`${item.vehicle} — ${item.price} — ${item.band}mi — score ${item.score} (${item.status})`);
    console.log(`${item.stage === 'price' ? 'Price-verification' : 'Verification request'}: ${item.why}\n`);
    console.log(item.message + '\n');
    const copied = opts.dry ? false : copyToClipboard(item.message);
    console.log(copied ? 'Copied to clipboard.' : 'Not copied — copy the text above by hand.');
    if (!opts.dry) {
      await openListingTab(await getClient(), item.url);
      console.log(`Opened ${item.url}`);
    }
    console.log(
      `\nClick Message, paste, read it once, send. Then: node mp.js msg --sent ${item.id}`
    );
    const remaining = explicit ? queue.slice(1) : [];
    if (remaining.length) {
      console.log(
        `\n${remaining.length} more you named: ${remaining.map((r) => r.id).join(', ')} — ` +
          `run --next ${remaining[0].id} when ready for the next one.`
      );
    }
    return;
  }

  const limit = explicit ? queue.length : opts.all ? queue.length : opts.limit || 20;
  const shown = queue.slice(0, limit);
  const byStage = queue.reduce((a, q) => ({ ...a, [q.stage]: (a[q.stage] || 0) + 1 }), {});
  console.log(
    `${queue.length} listing(s) owed a message ` +
      `(${Object.entries(byStage).map(([k, v]) => `${v} ${k}`).join(', ')})` +
      `${explicit ? ', in the order you named' : `, ranked by ${opts.sort || 'score'}`}` +
      `${!explicit && shown.length < queue.length ? ` — showing top ${shown.length}, --all for the rest` : ''}\n`
  );
  console.log(QUEUE_HEADER);
  shown.forEach((item, i) => printQueueRow(i + 1, item, opts.text));
  if (!opts.text) {
    console.log(
      '\nsc = §5 quality score (clean title +2) · neg = §5 negotiability signals (0-3)\n' +
        '--text for each rendered message · --sort negotiability to rank by who will move on price'
    );
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
        '  item <id...> [--out f]            dump listing-page text\n' +
        '  msg [--text] [--all] [--limit n]  seller-message queue from seen_listings.md\n' +
        '  msg <id...> [--text]              only the listings you name, in that order\n' +
        '  msg --sort negotiability          rank by who is likeliest to drop their price\n' +
        '  msg [<id...>] --next              render + copy the next message, open that listing\n' +
        '  msg --sent <id>                   record that you sent it (updates the tracker)\n' +
        '  inbox [--all] [--dry]             sweep the inbox — what changed, what is waiting on you\n' +
        '  thread [<id>] [--dry]             read the ONE open conversation: transcript + photos\n' +
        '  deal [due|open|set|log|note|vin|thread|appt|close|index]  per-conversation tracker in deals/\n' +
        '  deal help                         the whole deal surface\n' +
        '\n' +
        'inbox and thread read a tab you opened. They never scroll, click, or send.\n' +
        'Scroll the conversation list to the bottom by hand first — it pages like the feed (§8a).'
    );
    return;
  }
  const VALUE_FLAGS = ['--out', '--target', '--sent', '--limit', '--stage', '--min-score', '--sort'];
  const value = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
  const opts = {
    all: rest.includes('--all'),
    out: value('--out'),
    target: value('--target'),
    next: rest.includes('--next'),
    text: rest.includes('--text'),
    dry: rest.includes('--dry'),
    sent: value('--sent'),
    stage: value('--stage'),
    sort: value('--sort'),
    limit: value('--limit') ? Number(value('--limit')) : null,
    minScore: value('--min-score') ? Number(value('--min-score')) : null,
  };
  if (opts.stage && !['price', 'verify'].includes(opts.stage)) {
    throw new Error('--stage takes "price" or "verify".');
  }
  const ids = [];
  for (let i = 0; i < rest.length; i++) {
    if (VALUE_FLAGS.includes(rest[i])) { i++; continue; }
    if (rest[i].startsWith('--')) continue;
    ids.push(rest[i]);
  }

  // Only the commands that actually drive Chrome pay the cost of connecting to
  // it; `msg` works off the tracker alone unless it is opening a listing.
  let client = null;
  const getClient = async () => (client = client || (await browserClient()));
  // `deal` never touches Chrome either — it reads and writes files only.
  if (!['msg', 'deal'].includes(cmd) || (cmd === 'msg' && opts.next && !opts.dry)) await getClient();

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
      case 'msg':
        await cmdMsg(getClient, ids, opts);
        break;
      case 'inbox':
        await cmdInbox(client, opts);
        break;
      case 'thread':
        await cmdThread(client, ids, opts);
        break;
      case 'deal':
        await require('./deal.js').cmdDeal(rest);
        break;
      default:
        console.log(
          'Commands:\n' +
            '  tabs                    list open browser tabs\n' +
            '  open "<url>"            open a Marketplace search and focus it\n' +
            '  read [--out f] [--all] [--target id]  extract listings from the pinned Marketplace tab\n' +
            '  item <id...> [--out f]  open one or more listing pages, dump page text (read-only, never scrolls/clicks/messages)\n' +
            '  msg [--text] [--all] [--limit n] [--stage price|verify] [--min-score n]  queue of listings owed a seller message\n' +
            '  msg <id...> [--text]    only the listings you name, in the order you name them\n' +
            '  msg [<id...>] --next [--dry]  render the next message, copy it, open that listing (you paste and send)\n' +
            '  msg --sent <id> [--dry] stamp the tracker row after you sent it\n' +
            '  inbox [--all] [--dry]   sweep the Marketplace inbox: what changed, what is waiting on you (scroll the list first)\n' +
            '  thread [<id>] [--dry]   read the ONE conversation you have open — transcript + photos to captures/threads/\n' +
            '  deal [<sub>]            per-conversation tracker (VIN, photos, appointments) — deal help for the full surface'
        );
    }
  } finally {
    if (client) client.close();
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
