const DEFAULTS = {
  view: "evaluated",
  q: "",
  brands: [],
  tier: "",
  minPrice: 4000,
  maxPrice: 10500,
  minYear: "",
  maxYear: "",
  distance: "",
  status: "",
  titleStatus: "",
  changed: false,
  newOnly: false,
  sort: "score",
  direction: "desc",
  page: 1,
  pageSize: 12,
  selected: "",
};

export const VIEWS = [
  "all", "approved", "evaluated", "strong", "worth", "marginal", "needs", "changed",
  "longshots", "asking", "outside",
  "german", "german-reviewed", "german-scored", "german-worth",
];
export const SORTS = ["score", "rank", "price", "year", "distance", "lastSeen", "timesSeen", "tier"];
const TITLE_STATUSES = ["clean", "rebuilt", "not-provided"];
const PAGE_SIZES = [12, 24, 48];
const MAX_PRICE_CEILING = 100000;

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// Prices may legitimately be 0 (clearing the price filter to reveal listings with no
// price), so only negative and non-finite values fall back.
const priceParam = (params, key, fallback) => {
  const raw = params.get(key);
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_PRICE_CEILING) : fallback;
};

const positiveInt = (params, key, fallback) => {
  const value = Number(params.get(key));
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const yearParam = (params, key) => {
  const raw = params.get(key);
  if (!raw) return "";
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1900 && value <= 2100 ? String(value) : "";
};

export function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  return {
    ...DEFAULTS,
    view: oneOf(params.get("view"), VIEWS, DEFAULTS.view),
    q: params.get("q") || "",
    brands: (params.get("brands") || "").split(",").map((brand) => brand.trim()).filter(Boolean),
    tier: params.get("tier") || "",
    minPrice: priceParam(params, "minPrice", DEFAULTS.minPrice),
    maxPrice: priceParam(params, "maxPrice", DEFAULTS.maxPrice),
    minYear: yearParam(params, "minYear"),
    maxYear: yearParam(params, "maxYear"),
    distance: params.get("distance") || "",
    status: params.get("status") || "",
    titleStatus: oneOf(params.get("title"), TITLE_STATUSES, ""),
    changed: params.get("changed") === "1",
    newOnly: params.get("new") === "1",
    sort: oneOf(params.get("sort"), SORTS, DEFAULTS.sort),
    direction: params.get("direction") === "asc" ? "asc" : "desc",
    page: positiveInt(params, "page", 1),
    pageSize: oneOf(positiveInt(params, "pageSize", DEFAULTS.pageSize), PAGE_SIZES, DEFAULTS.pageSize),
    selected: params.get("selected") || "",
  };
}

export function writeUrlState(state, mode = "push") {
  const params = new URLSearchParams();
  params.set("view", state.view || DEFAULTS.view);
  if (state.q) params.set("q", state.q);
  if (state.brands.length) params.set("brands", state.brands.join(","));
  if (state.tier) params.set("tier", state.tier);
  if (state.minPrice !== DEFAULTS.minPrice) params.set("minPrice", state.minPrice);
  if (state.maxPrice !== DEFAULTS.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.minYear) params.set("minYear", state.minYear);
  if (state.maxYear) params.set("maxYear", state.maxYear);
  if (state.distance) params.set("distance", state.distance);
  if (state.status) params.set("status", state.status);
  if (state.titleStatus) params.set("title", state.titleStatus);
  if (state.changed) params.set("changed", "1");
  if (state.newOnly) params.set("new", "1");
  if (state.sort !== DEFAULTS.sort) params.set("sort", state.sort);
  if (state.direction !== DEFAULTS.direction) params.set("direction", state.direction);
  if (state.page !== 1) params.set("page", state.page);
  if (state.pageSize !== DEFAULTS.pageSize) params.set("pageSize", state.pageSize);
  if (state.selected) params.set("selected", state.selected);
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history[mode === "replace" ? "replaceState" : "pushState"]({}, "", url);
}

export function resetFilterState(view = DEFAULTS.view) {
  return { ...DEFAULTS, view, brands: [] };
}

export { DEFAULTS, MAX_PRICE_CEILING };
