#!/usr/bin/env node
// Fails the build if the published snapshot carries anything that should have stayed in
// the private captures. The snapshot is served from a public URL, so this runs before
// every production build rather than being left to review.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../public/data");
const files = ["evidence-core.json", "evidence-rest.json"];

// Listing IDs are long digit runs, so phone matching requires punctuation or spacing
// that a bare ID would never contain.
const RULES = [
  { name: "phone number", re: /\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { name: "email address", re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi },
  { name: "contact solicitation", re: /\b(?:call or text|text me|whatsapp|llame al|escr[ií]bame)\b/gi },
  { name: "VIN", re: /\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]*[A-HJ-NPR-Z])[A-HJ-NPR-Z0-9]{17}\b/g },
];

// Fields carrying analyst wording. Tracker notes and seller fingerprints must never
// appear at all, so their absence is checked structurally rather than by pattern.
const FORBIDDEN_KEYS = ["notes", "sellerFingerprint", "seller", "vin", "vinStatus", "dashboardStatus", "description"];

let failures = 0;

for (const file of files) {
  const path = resolve(dataDir, file);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);

  for (const { name, re } of RULES) {
    const hits = [...new Set(raw.match(re) ?? [])];
    if (hits.length) {
      failures += hits.length;
      console.error(`${file}: ${hits.length} ${name}(s) found -> ${hits.slice(0, 5).join(", ")}`);
    }
  }

  const listings = [...(parsed.listings ?? []), ...(parsed.germanListings ?? [])];
  const present = FORBIDDEN_KEYS.filter((key) => listings.some((listing) => key in listing));
  if (present.length) {
    failures += present.length;
    console.error(`${file}: forbidden field(s) present -> ${present.join(", ")}`);
  }
  console.log(`${file}: ${listings.length} listings scanned.`);
}

if (failures) {
  console.error(`\nSnapshot scan failed with ${failures} finding(s). Fix the generator before publishing.`);
  process.exit(1);
}
console.log("Snapshot scan passed: no contact details, VINs, notes or seller fields.");
