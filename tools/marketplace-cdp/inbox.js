#!/usr/bin/env node
//
// Marketplace inbox reader — the sweep, not the conversation.
//
// The problem this solves is arithmetic, not judgement. A Marketplace inbox
// with a hundred conversations in it gives you no way to see which ones moved
// since yesterday, which are waiting on you, and which are about cars at all
// (mine is half MacBooks). Opening all of them to find the eight that changed
// is the part that does not scale, so that is the part that is mechanical here.
//
// Two things this deliberately does NOT do:
//
//   - It never clicks, scrolls, or sends. Facebook's list is virtualised the
//     same way the search feed is (playbook §8a), so you scroll it by hand and
//     the tool reads what loaded. The send stays a human keystroke — §11.
//   - It never decides which conversation belongs to which listing. Facebook
//     does not put a listing ID anywhere in the inbox (checked: the rows are
//     bare divs, no anchor, and `marketplace/item` appears zero times on the
//     page), so a match on seller name and vehicle title is a guess. Three
//     different people selling a "2018 Toyota RAV4" collapse onto one deal
//     under any title-similarity scheme, and a wrong join sends you to the
//     wrong car. So the tool proposes candidates and you confirm one, once,
//     with `deal thread`. After that the key is stored and never asked again.
//
// No search rule and no buying criterion lives here. This module moves rows
// around; used_car_buying_playbook.md decides what any of it means.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CAPTURES = path.join(ROOT, 'captures');
const INBOX_DIR = path.join(CAPTURES, 'inbox');
const THREADS_DIR = path.join(CAPTURES, 'threads');
const STATE_FILE = path.join(INBOX_DIR, 'state.json');

// --- inbox list parsing --------------------------------------------------

// A row in the left-hand list renders as:
//
//   Morgan
//    · 2016 Subaru Impreza · 2.0i Premium Sedan 4D
//   Morgan is waiting for your response about 2016 Subaru Impreza…
//   10:55 AM
//
// The timestamp is the only reliable delimiter — names, listings and snippets
// are all free text — so rows are closed on it rather than opened on anything.
const TIME_LINE =
  /^(?:\d{1,2}:\d{2}\s*(?:AM|PM)|\d+[wdhm]|Yesterday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]{2} \d{1,2})$/;

// Everything above the first conversation is Marketplace's own chrome (the
// category list, the location picker). The tab strip is the last thing before
// the rows, so the last one of these lines is the boundary.
const LIST_START = /^(?:Buying|Selling|Jobs)$/;

// When a conversation is open, its pane is in the same innerText as the list
// and contains bare timestamps of its own, which would otherwise be read as
// more rows. The pane always opens with the listing header, and "See details"
// is the first line of it that cannot appear in the list.
const PANE_START = /^(?:See details|Enter, )/;

function parseInboxList(text) {
  let lines = String(text || '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim());

  const cut = lines.findIndex((l) => PANE_START.test(l));
  if (cut !== -1) lines = lines.slice(0, cut);

  let start = -1;
  for (let i = 0; i < lines.length; i++) if (LIST_START.test(lines[i])) start = i;
  lines = lines.slice(start + 1).filter(Boolean);

  const rows = [];
  let buf = [];
  for (const line of lines) {
    if (TIME_LINE.test(line) && buf.length) {
      const row = buildRow(buf, line);
      if (row) rows.push(row);
      buf = [];
    } else if (TIME_LINE.test(line)) {
      buf = [];
    } else {
      buf.push(line);
    }
  }
  return rows;
}

function buildRow(buf, time) {
  const name = buf[0];
  if (!name) return null;
  let listing = null;
  const snippets = [];
  for (const line of buf.slice(1)) {
    if (line.startsWith('·')) listing = line.replace(/^·\s*/, '').trim();
    else if (line !== name) snippets.push(line);
  }
  // Facebook sometimes runs the name and the listing into one line for the
  // compact rows: "Marcelo · Youngla compression size M".
  if (!listing && name.includes(' · ')) {
    const [first, ...rest] = name.split(' · ');
    return finishRow(first.trim(), rest.join(' · ').trim(), snippets, time);
  }
  return finishRow(name, listing, snippets, time);
}

function finishRow(name, listing, snippets, time) {
  if (!name) return null;
  return {
    name,
    listing: listing || null,
    snippet: snippets.length ? snippets[snippets.length - 1] : null,
    time,
    key: threadKey(name, listing),
  };
}

// The join key. Facebook gives no listing ID, so the only stable handle on a
// conversation is who it is with and what it is about. Normalised hard so that
// "MAZDA MAZDA3" and "Mazda Mazda3" are the same thread across sweeps.
function threadKey(name, listing) {
  const norm = (s) =>
    String(s || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(name)}|${norm(listing)}`;
}

// --- classification ------------------------------------------------------

// Facebook writes the row's snippet differently depending on who spoke last,
// and those phrasings are the whole triage. "waiting for your response" is the
// expensive one — it means a seller answered and the conversation is stalled
// on you.
const STATES = [
  ['sold', /marked the listing as sold|is no longer available/i],
  ['photo', /sent (?:a|\d+) photos?|sent an attachment/i],
  ['waiting-on-you', /is waiting for your response/i],
  ['you-sent-last', /^You(?::| sent)/i],
  ['busy-seller', /is getting a lot of messages/i],
];

// Everything above is one of Facebook's own fixed phrasings, so those four
// states are as reliable as the page itself. What is left is the raw text of
// the last message, and Facebook prefixes "You:" only sometimes — "what is the
// VIN?" is mine and "Ok in minutes" is theirs, with nothing in the row to tell
// them apart. That bucket is labelled unclear rather than guessed at, because
// a wrong guess here sends you to re-read a conversation that owes you nothing.
function classify(row) {
  for (const [state, re] of STATES) if (re.test(row.snippet || '')) return state;
  return 'unclear';
}

// Half my inbox is laptops and furniture. A car row is one whose listing title
// carries a model year and an approved-looking make; anything else is noise
// for this tool's purposes and is counted but not listed.
const CAR = /\b(?:19|20)\d{2}\b/;
const MAKE =
  /honda|toyota|mazda|subaru|volkswagen|vw|acura|lexus|nissan|hyundai|kia|ford|chevrolet|chevy|bmw|mercedes|audi|jeep|dodge|chrysler|buick|gmc|infiniti|mitsubishi|volvo|ram/i;

function isCarThread(row) {
  const t = row.listing || '';
  return CAR.test(t) && MAKE.test(t);
}

// --- conversation pane parsing -------------------------------------------

// The open conversation is in the same innerText as the list, and Facebook
// helpfully writes an accessibility line for every message that already
// carries speaker and timestamp:
//
//   Enter, Message sent 4:27 AM by Marcelo: Yes
//
// The visible copy of the text appears immediately above it, so reading only
// the "Enter," lines gets the transcript attributed and de-duplicated in one
// pass.
const MESSAGE_LINE = /^Enter, Message sent (.+?) by ([^:]+?): ([\s\S]*)$/;

function parseThread(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim());

  const messages = [];
  for (const line of lines) {
    const m = line.match(MESSAGE_LINE);
    if (!m) continue;
    const body = m[3].trim();
    if (!body || /^You started this chat\.$/i.test(body)) continue;
    messages.push({ time: m[1].trim(), who: m[2].trim(), text: body });
  }

  const header = { title: null, price: null, name: null, joined: null };
  for (let i = 0; i < lines.length; i++) {
    const price = lines[i].match(/^\$([\d,]+(?:\.\d+)?)\s*-\s*(.+)$/);
    if (price && !header.price) {
      header.price = `$${price[1]}`;
      header.title = price[2].trim();
    }
    const joined = lines[i].match(/^Joined Facebook in (\d{4})$/);
    if (joined) header.joined = joined[1];
    const compose = lines[i].match(/^Write to (.+?)(?: · (.+))?$/);
    if (compose) {
      header.name = compose[1].trim();
      if (!header.title && compose[2]) header.title = compose[2].trim();
    }
  }
  return { header, messages, key: threadKey(header.name, header.title) };
}

// A VIN a seller typed into the chat is worth pulling out mechanically — it is
// the single most-requested fact and it has a shape. Anything found here is a
// *candidate*: deal.js still runs the check digit before it is recorded, so a
// misread never advances a stage on its own.
function vinCandidates(messages) {
  const found = new Map();
  for (const m of messages) {
    for (const hit of String(m.text).toUpperCase().matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g)) {
      if (!found.has(hit[0])) found.set(hit[0], m);
    }
  }
  return [...found.entries()].map(([vin, m]) => ({ vin, who: m.who, time: m.time }));
}

// --- sweep state ---------------------------------------------------------

// The diff is the product. Without a baseline the tool can only tell you what
// the inbox says right now, which you can already see; with one it tells you
// what changed since you last looked, which you cannot.
function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { swept: null, rows: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`captures/inbox/state.json is malformed: ${err.message}`);
  }
}

function saveState(rows, when) {
  const byKey = {};
  for (const r of rows) byKey[r.key] = { snippet: r.snippet, time: r.time, state: r.state };
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ swept: when, rows: byKey }, null, 2) + '\n');
}

function diffRows(rows, state) {
  const prev = state.rows || {};
  return rows.map((r) => {
    const before = prev[r.key];
    return {
      ...r,
      isNew: !before,
      changed: !before || before.snippet !== r.snippet || before.time !== r.time,
    };
  });
}

// --- joining rows to deals ----------------------------------------------

// Deliberately returns *candidates*, never a decision. A single candidate is
// still only a suggestion; see the header comment for why auto-joining on
// title similarity is unsafe.
function matchCandidates(row, deals) {
  const bound = deals.find((d) => d.thread_key && d.thread_key === row.key);
  if (bound) return { linked: bound, candidates: [] };

  const tokens = (s) =>
    new Set(
      String(s || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1)
    );
  const rowTokens = tokens(row.listing);
  const firstName = String(row.name || '').split(/\s+/)[0].toLowerCase();

  const scored = deals
    .filter((d) => d.stage !== 'closed' && !d.thread_key)
    .map((d) => {
      const overlap = [...tokens(d.vehicle)].filter((t) => rowTokens.has(t)).length;
      const sellerFirst = String(d.seller || '').split(/\s+/)[0].toLowerCase();
      const nameHit = firstName && sellerFirst && firstName === sellerFirst ? 3 : 0;
      return { deal: d, score: overlap + nameHit };
    })
    .filter((c) => c.score >= 3)
    .sort((a, b) => b.score - a.score);

  return { linked: null, candidates: scored.slice(0, 4) };
}

// --- thread capture on disk ---------------------------------------------

function threadDir(key) {
  return path.join(THREADS_DIR, key.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80));
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return { images: [] };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { images: [] };
  }
}

function writeManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

// Facebook's CDN URLs are signed and expire within hours. Storing the link
// would mean the photo is gone by the time anyone looks, so the bytes are
// written to disk at read time and the URL is kept only for provenance.
function saveImages(dir, images, when) {
  const manifest = readManifest(dir);
  const known = new Set(manifest.images.map((i) => i.sha));
  const added = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const img of images) {
    const sha = require('crypto').createHash('sha1').update(img.data).digest('hex').slice(0, 12);
    if (known.has(sha)) continue;
    const name = `${when}_${sha}.${img.ext || 'jpg'}`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(img.data, 'base64'));
    const record = { sha, file: name, url: img.url, width: img.width, height: img.height, seen: when, reviewed: false };
    manifest.images.push(record);
    added.push(record);
    known.add(sha);
  }
  writeManifest(dir, manifest);
  return { added, manifest };
}

function saveTranscript(dir, thread, when) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${when}_transcript.txt`);
  const head =
    `${thread.header.name || '?'} — ${thread.header.title || '?'}` +
    `${thread.header.price ? ` (${thread.header.price})` : ''}` +
    `${thread.header.joined ? ` — joined Facebook ${thread.header.joined}` : ''}\n` +
    `read ${when}, ${thread.messages.length} message(s)\n\n`;
  fs.writeFileSync(file, head + thread.messages.map((m) => `[${m.time}] ${m.who}: ${m.text}`).join('\n') + '\n');
  return file;
}

module.exports = {
  INBOX_DIR,
  THREADS_DIR,
  STATE_FILE,
  ROOT,
  parseInboxList,
  parseThread,
  vinCandidates,
  threadKey,
  classify,
  isCarThread,
  loadState,
  saveState,
  diffRows,
  matchCandidates,
  threadDir,
  readManifest,
  writeManifest,
  saveImages,
  saveTranscript,
};
