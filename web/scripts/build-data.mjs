import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { classifyTitleStatus } from "../src/lib/title-status.js";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..");
const dataDir = resolve(appRoot, "public/data");
const corePath = resolve(dataDir, "evidence-core.json");
const restPath = resolve(dataDir, "evidence-rest.json");

const REAL_SOURCES = {
  master: resolve(repoRoot, "captures/master.csv"),
  tracker: resolve(repoRoot, "seen_listings.md"),
  germanCapture: resolve(repoRoot, "captures/german_brands.csv"),
  germanTracker: resolve(repoRoot, "german_seen_listings.md"),
};

// `--demo` swaps the private inputs for the synthetic fixtures in web/demo/, so the app can
// be built from a fresh clone. Parsing, scoring and the snapshot scan are unchanged.
const DEMO = process.argv.includes("--demo");
const demoDir = resolve(appRoot, "demo");
const PRIVATE_SOURCES = DEMO
  ? {
      master: resolve(demoDir, "master.csv"),
      tracker: resolve(demoDir, "tracker.md"),
      germanCapture: resolve(demoDir, "german_brands.csv"),
      germanTracker: resolve(demoDir, "german_tracker.md"),
    }
  : REAL_SOURCES;
const playbookPath = resolve(repoRoot, "used_car_buying_playbook.md");

const cleanMarkdown = (value = "") =>
  value.replace(/\*\*/g, "").replace(/`/g, "").replace(/&nbsp;/g, " ").trim();

const toNumber = (value) => {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

/* ---------------------------------------------------------------- sanitising */

// Sellers write Marketplace titles by hand and routinely paste phone numbers,
// contact pitches, and VINs into them. The snapshot is served from a public URL,
// so private tokens are removed before titles are published.
const PRIVATE_PATTERNS = [
  /(?:\+?\d[\s.\-()]*){9,}/g,
  /\b(?:call|text|txt|whatsapp|whats app|dm|llame|llamar|escriba|escribir)\b[^,;.]*/gi,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi,
  /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{17}\b/g,
];

const stripContactInfo = (value = "") => {
  let output = value;
  for (const pattern of PRIVATE_PATTERNS) output = output.replace(pattern, " ");
  return output
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:!?.\-–—]+|[\s,;:!?\-–—]+$/g, "")
    .trim();
};

// Tracker cells quote short fragments of the seller's own description. The quoted span
// is dropped; the analyst's classification around it is kept.
const stripQuotedText = (value) => {
  if (!value) return value;
  const output = value
    .replace(/["“][^"”]{0,200}["”]/g, "")
    .replace(/\(\s*[—–-]?\s*\)/g, "")
    .replace(/\s*[—–-]\s*\)/g, ")")
    .replace(/\(\s*,?\s*/g, "(")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\)/g, ")")
    .replace(/\(\)/g, "")
    .replace(/[\s,;:—–-]+$/g, "")
    .trim();
  return output || null;
};

/* ------------------------------------------------------------ playbook parsing */

const normalizeDistanceBand = (value = "") => {
  const compact = cleanMarkdown(value).toLowerCase().replace(/\s/g, "").replace(/-/g, "–");
  if (compact.includes("0–10")) return "0–10 mi";
  if (compact.includes("10–20")) return "10–20 mi";
  if (compact.includes("20–30")) return "20–30 mi";
  if (compact.includes("30+")) return "30+ mi";
  return "Unmapped";
};

const parseFirstTable = (markdown) => {
  const lines = markdown.split("\n");
  const tableLines = [];
  let started = false;

  for (const line of lines) {
    if (line.startsWith("|")) {
      started = true;
      tableLines.push(line);
    } else if (started && line.trim()) {
      break;
    }
  }

  if (tableLines.length < 3) return [];
  const split = (line) => line.slice(1, -1).split("|").map(cleanMarkdown);
  const headers = split(tableLines[0]);
  return tableLines.slice(2).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
};

const parseTracker = (markdown) => {
  const start = markdown.indexOf("## Tracker");
  if (start < 0) return [];
  const lines = markdown.slice(start).split("\n").filter((line) => line.startsWith("| "));
  if (lines.length < 2) return [];
  const split = (line) => line.slice(1, -1).split("|").map(cleanMarkdown);
  const headers = split(lines[0]);

  return lines.slice(1).flatMap((line) => {
    const cells = split(line);
    if (cells.length !== headers.length || !/^\d+$/.test(cells[0])) return [];
    return [Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))];
  });
};

const parseBrandList = (playbook, header, trimAfter) => {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = playbook.match(new RegExp(`\\| \\*\\*${escaped}\\*\\* \\| ([^|]+) \\|`));
  if (!match) return [];
  return match[1]
    .replace(trimAfter, "")
    .split(",")
    .map((brand) => cleanMarkdown(brand.replace(/\band\b/gi, "")).replace(/[.;:]$/, ""))
    .filter(Boolean);
};

const parseApprovedBrands = (playbook) =>
  parseBrandList(playbook, "Approved brands", /Only these;.*$/i);

const parseExcludedBrands = (playbook) =>
  parseBrandList(playbook, "Explicitly excluded brands", /Hard rejects\.?.*$/i);

const parseDistanceBands = (playbook) => {
  const section = playbook.match(/## 7\.[\s\S]*?(?=\n## 8\.)/)?.[0] ?? "";
  const tableStart = section.indexOf("| Band | Cities |");
  const rows = tableStart >= 0 ? parseFirstTable(section.slice(tableStart)) : [];
  return rows.map((row) => ({
    band: normalizeDistanceBand(row.Band),
    cities: row.Cities.split(",").map((city) => city.trim()).filter(Boolean),
  }));
};

const parseScoringGuide = (playbook) => {
  const section = playbook.match(/## 5\.[\s\S]*?(?=\n## 6\.)/)?.[0] ?? "";
  const categoryMatches = [...section.matchAll(/^### (.+)$/gm)];
  const categories = categoryMatches.map((match, index) => {
    const name = cleanMarkdown(match[1]);
    const bodyStart = match.index + match[0].length;
    const bodyEnd = categoryMatches[index + 1]?.index ?? section.length;
    const body = section.slice(bodyStart, bodyEnd);
    const tableStart = body.search(/^\|/m);
    if (tableStart < 0) return { name, rows: [] };
    return { name, rows: parseFirstTable(body.slice(tableStart)) };
  });
  const tiers = [...section.matchAll(/^- \*\*(.+?)\*\* — (.+)$/gm)].map((match) => ({
    range: cleanMarkdown(match[1]),
    meaning: cleanMarkdown(match[2]),
  }));
  return { categories, tiers };
};

const parseLocation = (value = "") => {
  const [cityPart, bandPart] = value.split("/").map((part) => part.trim());
  return { city: cityPart || "Unknown", distanceBand: normalizeDistanceBand(bandPart) };
};

/* -------------------------------------------------------------------- scoring */

const distancePoints = (band = "") => {
  if (band.includes("0–10")) return 2;
  if (band.includes("10–20")) return 1;
  if (band.includes("20–30")) return 0;
  if (band.includes("30+")) return -1;
  return null;
};

const pricePoints = (price) => {
  if (price == null) return null;
  if (price <= 6000) return 3;
  if (price <= 7500) return 2;
  if (price <= 9000) return 1;
  if (price <= 10500) return 0;
  return null;
};

const mileagePoints = (mileage) => {
  if (mileage == null) return null;
  if (mileage < 60000) return 2;
  if (mileage <= 90000) return 1;
  if (mileage <= 110000) return 0;
  return null;
};

// Playbook §5 tiers. Derived from the score so a hand-typed tier label can never hide a
// listing from its own tier view.
const TIER_STRONG = "Strong match";
const TIER_WORTH = "Worth a look";
const TIER_MARGINAL = "Marginal";
const TIER_RANK = { [TIER_MARGINAL]: 0, [TIER_WORTH]: 1, [TIER_STRONG]: 2 };

const tierFromScore = (score) => (score >= 8 ? TIER_STRONG : score >= 4 ? TIER_WORTH : TIER_MARGINAL);

const canonicalTier = (value = "") => {
  const tier = value.toLowerCase();
  if (tier.includes("strong")) return TIER_STRONG;
  if (tier.includes("worth")) return TIER_WORTH;
  if (tier.includes("marginal")) return TIER_MARGINAL;
  return null;
};

// Playbook §3b categories. Derived, never tagged by hand, so a listing cannot fall out
// of one by being forgotten.
//
// The distinction the playbook insists on: "financing available" alongside a price is an
// offer and leaves the price merely unverified, while "$1,500 down" IS the price
// statement and means the headline number is not what the car costs. Only the second
// removes the price band.
const LONG_SHOT_MIN_YEAR = 2019;
const LONG_SHOT_MAX_PRICE = 10500;

// Spelling vocabulary copied from tools/marketplace-cdp/merge.js. It answers "is this a
// recognisable car brand," never "is this a brand we want." Hard-rejected brands are
// subtracted separately from the playbook exclude list.
const KNOWN_CAR_MAKES = new Set(
  `acura alfa alfa-romeo amc aston astonmartin audi bentley bmw bugatti buick
   cadillac chevrolet chevy chrysler citroen daewoo daihatsu datsun dodge eagle
   ferrari fiat fisker ford genesis geo gmc honda hummer hyundai infiniti isuzu
   jaguar jeep kia lamborghini lancia land landrover lexus lincoln lotus lucid
   maserati maybach mazda mclaren mercedes mercedes-benz mercury mg mini
   mitsubishi morgan nissan oldsmobile opel packard peugeot plymouth polestar
   pontiac porsche ram renault rivian rolls rolls-royce saab saturn scion seat
   skoda smart studebaker subaru suzuki tesla toyota vw volkswagen volvo
   willys yugo`.split(/\s+/),
);

const MOTORCYCLE_ONLY_MAKES = new Set([
  "yamaha", "ducati", "kawasaki", "harley-davidson", "harley davidson", "ktm",
  "aprilia", "triumph", "vespa", "piaggio", "moto guzzi", "can-am", "sea-doo",
  "indian", "husqvarna", "cfmoto",
]);

const BMW_MOTORCYCLE_MODEL =
  /\b(?:r\s*nine\s*t|rnine\s*t|rninet|rninte|r\d{3,4}(?:gs|rt|rs|r|xr)?|s\s*1000\s*(?:rr|r|xr)?|f\s*\d{3}(?:gs|r|s|xr)?|g\s*\d{3}(?:gs|r)?|k\s*1600|k\s*1300|c\s*400|c\s*650|c\s*600|r\s*18)\b/i;

const EXCLUDED_BODY_MODEL = /\b(?:pickup|minivan|cargo van|passenger van|crew cab|double cab)\b/i;

const GERMAN_MAKES = new Set([
  "bmw", "mercedes-benz", "mercedes", "audi", "porsche", "mini", "volkswagen", "vw",
]);

const isMotorcycleListing = (make, model = "") =>
  MOTORCYCLE_ONLY_MAKES.has(make) || (make === "bmw" && BMW_MOTORCYCLE_MODEL.test(model));

const isLateModelEconomyPrice = (year, price) =>
  (year ?? 0) >= LONG_SHOT_MIN_YEAR && price != null && price <= LONG_SHOT_MAX_PRICE;

const isOutsideApprovedLook = ({ make, model, label, year, price, approved, excludedSet }) => {
  const normalized = String(make || "").toLowerCase();
  if (approved || excludedSet.has(normalized) || GERMAN_MAKES.has(normalized)) return false;
  if (!KNOWN_CAR_MAKES.has(normalized)) return false;
  if (isMotorcycleListing(normalized, model)) return false;
  if (EXCLUDED_BODY_MODEL.test(label || "") || EXCLUDED_BODY_MODEL.test(model || "")) return false;
  return isLateModelEconomyPrice(year, price);
};

const isStatedDownPayment = (priceType = "") => /^down ?payment \(explicit\)/i.test(priceType);
const isCashConfirmed = (priceType = "") => /^cash/i.test(priceType) && /confirmed|stated|explicit/i.test(priceType);

// Silence is not doubt: a listing that never mentions financing is not capped, and is not
// in the ask queue either. Only an actual financing signal puts it there — either recorded
// in Price Type once the page was read, or a card-level §3a flag on a listing nobody has
// opened yet. The card-level flags matter most here: they are the ones the 2026-08-21
// audit showed were 75% wrong, so they are exactly what a message resolves.
const hasFinancingSignal = (priceType = "", status = "") =>
  /down ?payment|financ/i.test(priceType) || /suspected down payment/i.test(status);

// Everything the residual line can legitimately cover: negotiability (0/+1),
// reliability (−2/0/+2) and service records (0/+1). Used only to flag tracker rows
// whose score cannot be reconciled with the playbook.
const RESIDUAL_MIN = -2;
const RESIDUAL_MAX = 4;
const RESIDUAL_LABEL = "Negotiability, reliability and service records";
const RESIDUAL_EVIDENCE = "Judgement factors recorded in the evaluated tracker notes";

// Every ledger line is computed from a structured tracker column, so a displayed factor
// is never inferred from prose. Whatever the playbook leaves to judgement is reported as
// a single labelled residual rather than guessed at.
const buildScoreLedger = (row, resolvedDistanceBand) => {
  const score = toNumber(row.Score);
  if (score == null) return { factors: [], complete: false, residual: null, withinPlaybook: true };

  const factors = [];
  const push = (label, points, evidence) => {
    if (points == null) return;
    factors.push({ label, points, evidence });
  };

  const priceType = row["Price Type"] ?? "";
  const price = toNumber(row["Last Price"]);

  if (isStatedDownPayment(priceType)) {
    // The ad says the figure is a down payment, so there is no car price to band. Playbook
    // §5 caps rather than penalises: the tier cap carries the uncertainty, not the score.
    push("No price to band", 0, "The listing states its figure is a down payment, not the price of the car");
  } else {
    push("Asking price band", pricePoints(price), price == null ? "Price not recorded" : `$${price.toLocaleString("en-US")} asking price`);
    if (isCashConfirmed(priceType)) {
      push("Confirmed cash price", 1, "Cash price documented on the listing");
    }
  }

  const titleClass = classifyTitleStatus(row["Title Status"]);
  if (titleClass === "clean") push("Clean title", 2, "Title recorded as clean");
  else if (titleClass === "rebuilt") push("Rebuilt title (disclosed)", 0, "Rebuilt title disclosed by the seller");
  else if (titleClass === "not-provided") push("Title not provided", -1, "Title status still needs verification");

  const mileage = toNumber(row.Mileage);
  push("Mileage band", mileagePoints(mileage), mileage == null ? "Mileage not recorded" : `${mileage.toLocaleString("en-US")} miles`);

  const distanceBand = resolvedDistanceBand || parseLocation(row["Location / Distance"]).distanceBand;
  push("Distance band", distancePoints(distanceBand), `City band ${distanceBand}`);

  const priceHistory = row["Price History"];
  if (priceHistory && priceHistory !== "—") push("Price already reduced", 1, "Seller has lowered the asking price");

  const days = toNumber(row["Days on Market"]);
  if (days != null && days >= 30) push("Listed 30+ days", 1, `${days} days on market`);

  const residual = score - factors.reduce((sum, factor) => sum + factor.points, 0);
  if (residual !== 0) push(RESIDUAL_LABEL, residual, RESIDUAL_EVIDENCE);

  return {
    factors,
    complete: residual === 0,
    residual,
    withinPlaybook: residual >= RESIDUAL_MIN && residual <= RESIDUAL_MAX,
  };
};

/* ------------------------------------------------------------------- assembly */

const readPrivateSources = async () => {
  const entries = await Promise.all(
    Object.entries(PRIVATE_SOURCES).map(async ([key, path]) => {
      try {
        return [key, await readFile(path, "utf8")];
      } catch (error) {
        if (error?.code === "ENOENT") return [key, null];
        throw error;
      }
    }),
  );
  return Object.fromEntries(entries);
};

const main = async () => {
  if (DEMO) {
    const real = await Promise.all(Object.values(REAL_SOURCES).map((path) => readFile(path).then(() => path, () => null)));
    if (real.some(Boolean)) {
      throw new Error(
        "Private captures are present, and --demo would overwrite their snapshot in public/data.\n" +
          "Build the demo from a clone without private data.",
      );
    }
  }

  const sources = await readPrivateSources();
  const missing = Object.keys(PRIVATE_SOURCES).filter((key) => sources[key] == null);

  if (missing.length === Object.keys(PRIVATE_SOURCES).length) {
    // A remote build (Vercel) has none of the private inputs and reuses the committed
    // snapshot. Both payloads must already exist or the site would load half its data.
    for (const path of [corePath, restPath]) {
      await readFile(path, "utf8");
    }
    console.log("No private captures present; reusing the committed sanitized snapshot.");
    return;
  }

  if (missing.length > 0) {
    // A partial set means a local refresh would silently publish stale data.
    throw new Error(
      `Private source files are partially missing: ${missing.map((key) => PRIVATE_SOURCES[key]).join(", ")}.\n` +
        "Restore them, or remove all of them to reuse the committed snapshot.",
    );
  }

  const playbook = await readFile(playbookPath, "utf8");

  const masterRows = parse(sources.master, { columns: true, skip_empty_lines: true, bom: true });
  const trackerById = new Map(parseTracker(sources.tracker).map((row) => [row["Listing ID"], row]));
  const germanCaptureRows = parse(sources.germanCapture, { columns: true, skip_empty_lines: true, bom: true })
    .filter((row) => row.status !== "Excluded: not a car" && !isMotorcycleListing(String(row.make).toLowerCase(), row.model));
  const germanTrackerById = new Map(parseTracker(sources.germanTracker).map((row) => [row["Listing ID"], row]));

  const approvedBrands = parseApprovedBrands(playbook);
  const approvedSet = new Set(approvedBrands.map((brand) => brand.toLowerCase()));
  const excludedBrands = parseExcludedBrands(playbook);
  const excludedSet = new Set(excludedBrands.map((brand) => brand.toLowerCase()));
  const distanceBands = parseDistanceBands(playbook);
  const cityToBand = new Map(
    distanceBands.flatMap(({ band, cities }) => cities.map((city) => [city.toLowerCase(), band])),
  );

  const anomalies = [];

  const buildListing = (row, tracker, { approved, collection }) => {
    const trackerLocation = tracker ? parseLocation(tracker["Location / Distance"]) : null;
    const city = row.city || trackerLocation?.city || "Unknown";
    const distanceBand = trackerLocation?.distanceBand && trackerLocation.distanceBand !== "Unmapped"
      ? trackerLocation.distanceBand
      : cityToBand.get(city.toLowerCase()) || "Unmapped";

    const score = tracker ? toNumber(tracker.Score) : null;
    const price = toNumber(row.price);
    const wasPrice = toNumber(row.was_price);

    let fallbackStatus = collection === "german" || approved ? "Needs evaluation" : "Outside approved brands";
    if (collection === "german" && !tracker) {
      if (row.status === "Flagged: suspected down payment (§3a)" || isLateModelEconomyPrice(toNumber(row.year), price)) {
        fallbackStatus = "Suspected down payment";
      } else if (row.status === "Flagged: convertible (excluded by default, §2)" || row.status === "Excluded: body type") {
        fallbackStatus = "Rejected: body type";
      }
    }
    const status = cleanMarkdown(tracker?.Status || fallbackStatus);

    const priceType = cleanMarkdown(tracker?.["Price Type"] !== "—" ? tracker?.["Price Type"] || "" : "");

    // A tracker tier below the score's tier is a documented cap (poor reliability, a
    // scam-network match, a brand caveat) and is preserved. The price caps in playbook §5
    // are re-derived here rather than trusted from the hand-typed Tier column, so the rule
    // and the display cannot drift apart. German candidates are exploratory and never
    // presented as strong matches.
    const trackerTier = canonicalTier(cleanMarkdown(tracker?.Tier || ""));
    const scoredTier = score == null ? null : tierFromScore(score);
    const collectionCeiling = collection === "german" ? TIER_WORTH : TIER_STRONG;
    const priceCeiling = isCashConfirmed(priceType)
      ? TIER_STRONG
      : isStatedDownPayment(priceType)
        ? TIER_MARGINAL
        : hasFinancingSignal(priceType, status) ? TIER_WORTH : TIER_STRONG;
    let tier = scoredTier ?? (trackerTier || fallbackStatus);
    let cappedFrom = null;

    if (scoredTier) {
      const candidates = [scoredTier, collectionCeiling, priceCeiling, trackerTier].filter(Boolean);
      tier = candidates.reduce((lowest, current) => (TIER_RANK[current] < TIER_RANK[lowest] ? current : lowest), scoredTier);
      if (tier !== scoredTier) cappedFrom = scoredTier;
    }

    const observedChange = row.price_changed || null;
    const cardReduction = wasPrice != null && price != null && wasPrice !== price
      ? `${wasPrice}->${price}`
      : null;

    const ledger = tracker ? buildScoreLedger(tracker, distanceBand) : { factors: [], complete: false, residual: null, withinPlaybook: true };
    if (score != null && !ledger.withinPlaybook) {
      anomalies.push({ id: row.id, collection, score, residual: ledger.residual });
    }

    return {
      id: row.id,
      year: toNumber(row.year),
      make: row.make || "Unknown",
      model: stripContactInfo(row.model || row.label || "") || "Unknown model",
      label: stripContactInfo(row.label || ""),
      price,
      wasPrice,
      city,
      distanceBand,
      distancePoints: distancePoints(distanceBand),
      bestRank: toNumber(row.best_rank),
      firstSeen: row.first_seen?.slice(0, 10) || tracker?.["First Seen"] || null,
      lastSeen: row.last_seen?.slice(0, 10) || tracker?.["Last Seen"] || null,
      timesSeen: toNumber(row.times_seen) ?? 1,
      // Facebook's struck-through "was" price is a reduction the seller already made and
      // earns a playbook negotiability point, so it counts as a price change alongside
      // reductions observed between captures.
      priceChanged: Boolean(observedChange || cardReduction),
      priceChangeKind: observedChange ? "observed" : cardReduction ? "card" : null,
      priceChangeLabel: observedChange || cardReduction,
      url: row.url,
      // Set by the capture tool when a card could not be triaged from its title alone.
      review: row.review || null,
      approved,
      collection,
      reviewed: Boolean(tracker),
      score,
      tier,
      cappedFrom,
      status,
      evaluated: score != null,
      // Playbook §3b. A late-model car at an economy price: mostly rebuilt titles and
      // financing figures, occasionally the best value in the whole search.
      longShot: approved && isLateModelEconomyPrice(toNumber(row.year), price),
      // Playbook §3b. Known car make, neither approved nor hard-rejected. Look-queue only.
      outsideApproved: collection === "marketplace" && isOutsideApprovedLook({
        make: row.make,
        model: row.model,
        label: row.label,
        year: toNumber(row.year),
        price,
        approved,
        excludedSet,
      }),
      // Playbook §3b. Financing language, so the price is unverified — but the user's own
      // seller replies show a good share are cash at the listed price. One message settles it.
      worthAsking: approved && Boolean(tracker) && hasFinancingSignal(priceType, status)
        && !isCashConfirmed(priceType) && !/^rejected|^not seen/i.test(status),
      cashConfirmed: isCashConfirmed(priceType),
      listedDate: tracker?.["Listed Date"] && tracker["Listed Date"] !== "Unknown" ? tracker["Listed Date"] : null,
      effectiveCashPrice: stripQuotedText(tracker?.["Effective Cash Price"] !== "—" ? tracker?.["Effective Cash Price"] : null),
      priceType: stripQuotedText(tracker?.["Price Type"] !== "—" ? tracker?.["Price Type"] : null),
      priceHistory: tracker?.["Price History"] && tracker["Price History"] !== "—" ? tracker["Price History"] : null,
      daysOnMarket: tracker ? toNumber(tracker["Days on Market"]) : null,
      mileage: tracker ? toNumber(tracker.Mileage) : null,
      mileageLabel: stripQuotedText(tracker?.Mileage !== "Not recorded" ? tracker?.Mileage : null),
      titleStatus: stripQuotedText(tracker?.["Title Status"] !== "Not recorded" ? tracker?.["Title Status"] : null),
      scoreFactors: ledger.factors,
      ledgerComplete: ledger.complete,
      rejectedAt: tracker?.["Rejected At"] || null,
    };
  };

  const listings = masterRows.map((row) => buildListing(row, trackerById.get(row.id), {
    approved: approvedSet.has(String(row.make).toLowerCase()),
    collection: "marketplace",
  }));

  const germanListings = germanCaptureRows.map((row) => buildListing(row, germanTrackerById.get(row.id), {
    approved: false,
    collection: "german",
  }));

  const snapshotDate = listings.map((listing) => listing.lastSeen).filter(Boolean).sort().at(-1) ?? null;

  const countTier = (rows, tier) => rows.filter((listing) => listing.tier === tier).length;
  const aggregate = {
    all: listings.length,
    approved: listings.filter((listing) => listing.approved).length,
    evaluated: listings.filter((listing) => listing.evaluated).length,
    strong: countTier(listings, TIER_STRONG),
    worth: countTier(listings, TIER_WORTH),
    marginal: countTier(listings, TIER_MARGINAL),
    needsEvaluation: listings.filter((listing) => /^(not yet evaluated|needs evaluation|pending info|must open)$/i.test(listing.status)).length,
    priceChanges: listings.filter((listing) => listing.priceChanged).length,
    longShots: listings.filter((listing) => listing.longShot).length,
    worthAsking: listings.filter((listing) => listing.worthAsking).length,
    outsideApproved: listings.filter((listing) => listing.outsideApproved).length,
  };
  const germanAggregate = {
    all: germanListings.length,
    reviewed: germanListings.filter((listing) => listing.reviewed).length,
    evaluated: germanListings.filter((listing) => listing.evaluated).length,
    worth: countTier(germanListings, TIER_WORTH),
    marginal: countTier(germanListings, TIER_MARGINAL),
    suspectedDownPayment: germanListings.filter((listing) => /suspected down payment/i.test(listing.status)).length,
    needsEvaluation: germanListings.filter((listing) => (!listing.reviewed && !/suspected down payment|rejected/i.test(listing.status)) || /^(not yet evaluated|needs evaluation|pending info|must open)$/i.test(listing.status)).length,
    priceChanges: germanListings.filter((listing) => listing.priceChanged).length,
  };

  // Core carries every listing the app knows something about. Only the unfiltered "All
  // listings" view needs the remainder, so every other view is correct from core alone.
  const inCore = (listing) => listing.approved || listing.reviewed || listing.evaluated
    || listing.priceChanged || Boolean(listing.review) || listing.outsideApproved;
  const outsideBrands = [...new Set(
    listings.filter((listing) => listing.outsideApproved).map((listing) => listing.make),
  )].sort((left, right) => left.localeCompare(right, "en"));
  const core = {
    generatedAt: new Date().toISOString(),
    snapshotDate,
    aggregate,
    germanAggregate,
    approvedBrands,
    outsideBrands,
    germanBrands: [...new Set(germanListings.map((listing) => listing.make))].sort(),
    distanceBands,
    scoringGuide: parseScoringGuide(playbook),
    listings: listings.filter(inCore),
    germanListings,
  };
  const rest = { listings: listings.filter((listing) => !inCore(listing)) };

  await mkdir(dataDir, { recursive: true });
  await writeFile(corePath, `${JSON.stringify(core)}\n`, "utf8");
  await writeFile(restPath, `${JSON.stringify(rest)}\n`, "utf8");

  const mb = (value) => `${(Buffer.byteLength(JSON.stringify(value)) / 1024 / 1024).toFixed(2)} MB`;
  console.log(`Snapshot ${snapshotDate}: ${aggregate.all.toLocaleString("en-US")} listings, ${aggregate.approved} approved, ${aggregate.evaluated} evaluated, ${aggregate.strong} strong, ${aggregate.priceChanges} price changes.`);
  console.log(`Playbook §3b: ${aggregate.longShots} long shots, ${aggregate.worthAsking} worth asking, ${aggregate.outsideApproved} outside approved.`);
  console.log(`German: ${germanAggregate.all} candidates, ${germanAggregate.evaluated} evaluated, ${germanAggregate.worth} worth a look.`);
  console.log(`Wrote core ${mb(core)} (${core.listings.length} listings) and rest ${mb(rest)} (${rest.listings.length} listings).`);

  if (anomalies.length) {
    console.warn(`\n${anomalies.length} scored listing(s) cannot be reconciled with playbook §5; the tracker score is worth re-checking:`);
    for (const item of anomalies) {
      console.warn(`  ${item.collection} ${item.id}: score ${item.score} leaves an unexplained ${item.residual > 0 ? "+" : ""}${item.residual}`);
    }
  }
};

await main();
