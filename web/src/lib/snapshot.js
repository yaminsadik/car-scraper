// The snapshot is fetched rather than imported so the listing data stays out of the
// JavaScript bundle and is cached independently of the app code.
const asset = (name) => `${import.meta.env.BASE_URL}data/${name}`;

async function loadJson(name) {
  const response = await fetch(asset(name), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
  const type = response.headers.get("content-type") ?? "";
  // A static host that rewrites unknown paths to the app shell would otherwise surface
  // as an unreadable JSON parse error.
  if (!type.includes("json")) throw new Error(`${name} was served as ${type || "an unknown type"} instead of JSON`);
  return response.json();
}

export const loadCore = () => loadJson("evidence-core.json");
export const loadRest = () => loadJson("evidence-rest.json");

// Only the unfiltered "All listings" view reaches beyond the core payload; every other
// view filters on a field that guarantees membership in core.
export const viewNeedsAllListings = (view) => view === "all";
