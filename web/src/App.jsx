import { Scales, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CompareView } from "./components/CompareView.jsx";
import { DecisionRail } from "./components/DecisionRail.jsx";
import { FilterChips } from "./components/FilterChips.jsx";
import { FiltersPanel } from "./components/FiltersPanel.jsx";
import { Inspector } from "./components/Inspector.jsx";
import { ListingsTable } from "./components/ListingsTable.jsx";
import { ModalDialog } from "./components/ModalDialog.jsx";
import { OnboardingDialog } from "./components/OnboardingDialog.jsx";
import { ScoringGuide } from "./components/ScoringGuide.jsx";
import { SearchToolbar } from "./components/SearchToolbar.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { loadCore, loadRest, viewNeedsAllListings } from "./lib/snapshot.js";
import { MAX_PRICE_CEILING, resetFilterState, readUrlState, writeUrlState } from "./lib/url-state.js";
import { classifyTitleStatus } from "./lib/title-status.js";

const DISTANCE_ORDER = new Map([
  ["0–10 mi", 0], ["10–20 mi", 1], ["20–30 mi", 2], ["30+ mi", 3], ["Unmapped", 4],
]);
const COMPARE_STORAGE_KEY = "evidence-desk:compare:v1";

const stringCompare = (left, right) => String(left || "").localeCompare(String(right || ""), "en", { numeric: true });
const isGermanView = (view) => view === "german" || view.startsWith("german-");

function matchesView(listing, view) {
  if (view === "german-reviewed") return listing.reviewed;
  if (view === "german-scored") return listing.evaluated;
  if (view === "german-worth") return listing.tier === "Worth a look";
  if (isGermanView(view)) return true;
  if (view === "approved") return listing.approved;
  if (view === "evaluated") return listing.evaluated;
  if (view === "strong") return listing.tier === "Strong match";
  if (view === "worth") return listing.tier === "Worth a look";
  if (view === "marginal") return listing.tier === "Marginal";
  if (view === "needs") return /^(needs evaluation|not yet evaluated|pending info|must open)$/i.test(listing.status);
  if (view === "changed") return listing.priceChanged;
  if (view === "longshots") return listing.longShot;
  if (view === "asking") return listing.worthAsking;
  if (view === "outside") return listing.outsideApproved;
  return true;
}

function compareListings(left, right, key) {
  if (key === "score") return (left.score ?? -999) - (right.score ?? -999);
  if (key === "rank") return (left.bestRank ?? 999999) - (right.bestRank ?? 999999);
  if (key === "price") return (left.price ?? 9999999) - (right.price ?? 9999999);
  if (key === "year") return (left.year ?? 0) - (right.year ?? 0);
  if (key === "distance") return (DISTANCE_ORDER.get(left.distanceBand) ?? 99) - (DISTANCE_ORDER.get(right.distanceBand) ?? 99);
  if (key === "timesSeen") return (left.timesSeen ?? 0) - (right.timesSeen ?? 0);
  if (key === "tier") return stringCompare(left.tier, right.tier);
  return stringCompare(left.lastSeen, right.lastSeen);
}

function filterListings(listings, state, snapshotDate) {
  const search = state.q.toLowerCase();
  return listings.filter((listing) => {
    if (!matchesView(listing, state.view)) return false;
    if (search) {
      const haystack = [listing.id, listing.year, listing.make, listing.model, listing.city, listing.label]
        .join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (state.brands.length && !state.brands.includes(listing.make)) return false;
    if (state.tier && listing.tier !== state.tier) return false;
    if (state.status && listing.status !== state.status) return false;
    if (state.titleStatus && classifyTitleStatus(listing.titleStatus) !== state.titleStatus) return false;
    if (state.distance && listing.distanceBand !== state.distance) return false;
    if (listing.price != null && (listing.price < state.minPrice || listing.price > state.maxPrice)) return false;
    if (listing.price == null && (state.minPrice > 0 || state.maxPrice < MAX_PRICE_CEILING)) return false;
    if (state.minYear && (listing.year ?? 0) < Number(state.minYear)) return false;
    if (state.maxYear && (listing.year ?? 9999) > Number(state.maxYear)) return false;
    if (state.changed && !listing.priceChanged) return false;
    if (state.newOnly && listing.firstSeen !== snapshotDate) return false;
    return true;
  });
}

function readStoredCompare() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [state, setState] = useState(readUrlState);
  const [core, setCore] = useState(null);
  const [rest, setRest] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.matchMedia("(min-width: 1181px)").matches);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState(readStoredCompare);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const commitState = useCallback((patch, mode = "push") => {
    setState((current) => {
      const next = { ...current, ...patch };
      writeUrlState(next, mode);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadCore()
      .then((payload) => { if (active) setCore(payload); })
      .catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => setState(readUrlState());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (state.q) document.title = `${state.q} · Evidence Desk`;
    else if (isGermanView(state.view)) document.title = "German cars · Evidence Desk";
    else if (state.view === "outside") document.title = "Outside approved brands · Evidence Desk";
    else document.title = "Evidence Desk · Used-car finder";
  }, [state.q, state.view]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(compareIds));
    } catch {
      // Compare remains available for this tab if storage is unavailable.
    }
  }, [compareIds]);

  const germanView = isGermanView(state.view);
  const outsideView = state.view === "outside";
  const mainListings = useMemo(
    () => (core ? [...core.listings, ...(rest?.listings ?? [])] : []),
    [core, rest],
  );
  const activeListings = germanView ? (core?.germanListings ?? []) : mainListings;
  const activeBrands = germanView
    ? (core?.germanBrands ?? [])
    : outsideView
      ? (core?.outsideBrands ?? [])
      : (core?.approvedBrands ?? []);

  // The remainder payload holds only cards that no view except "All listings" can reach,
  // plus anything a stored compare selection still points at.
  const unresolvedCompare = core != null && compareIds.some(
    (id) => !mainListings.some((listing) => listing.id === id)
      && !(core.germanListings ?? []).some((listing) => listing.id === id),
  );
  const needsRest = core != null && rest == null && (viewNeedsAllListings(state.view) || unresolvedCompare);

  useEffect(() => {
    if (!needsRest) return;
    let active = true;
    loadRest()
      .then((payload) => { if (active) setRest(payload); })
      .catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [needsRest]);

  const filtered = useMemo(() => {
    if (!core) return [];
    const matches = filterListings(activeListings, state, core.snapshotDate);
    return [...matches].sort((left, right) => {
      const result = compareListings(left, right, state.sort);
      if (result === 0) return stringCompare(left.id, right.id);
      return state.direction === "asc" ? result : -result;
    });
  }, [core, activeListings, state]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  const safePage = Math.min(state.page, pageCount);
  const pageListings = filtered.slice((safePage - 1) * state.pageSize, safePage * state.pageSize);

  const selectedListing = useMemo(
    () => filtered.find((listing) => listing.id === state.selected) || pageListings[0] || null,
    [filtered, pageListings, state.selected],
  );

  // Page clamping and selection fall-back are reconciled together; committing them from
  // separate effects would let one overwrite the other's patch.
  useEffect(() => {
    if (!core || needsRest) return;
    const patch = {};
    if (safePage !== state.page) patch.page = safePage;
    const nextSelected = selectedListing?.id ?? "";
    if (nextSelected !== state.selected) patch.selected = nextSelected;
    if (Object.keys(patch).length) commitState(patch, "replace");
  }, [core, needsRest, safePage, state.page, selectedListing, state.selected, commitState]);

  const allListingsById = useMemo(() => {
    const map = new Map();
    // German records are indexed under a namespaced key because the same listing ID also
    // appears in the master collection with no German score.
    for (const listing of mainListings) map.set(listing.id, listing);
    for (const listing of core?.germanListings ?? []) map.set(`german:${listing.id}`, listing);
    return map;
  }, [mainListings, core]);

  const comparedListings = compareIds
    .map((id) => allListingsById.get(id) ?? allListingsById.get(`german:${id.replace(/^german:/, "")}`))
    .filter(Boolean);

  const resetAll = () => {
    const next = resetFilterState(germanView ? "german" : "evaluated");
    setFiltersOpen(false);
    setInspectorOpen(true);
    setState(next);
    writeUrlState(next);
    setAnnouncement("All filters reset.");
  };

  const openScoringFromGuide = () => {
    setOnboardingOpen(false);
    window.requestAnimationFrame(() => setScoringOpen(true));
  };

  const patchFilters = (patch) => commitState({ ...patch, page: 1 });
  const changeView = (view) => {
    const crossesCollection = isGermanView(view) !== germanView;
    const brandUniverseChanges = crossesCollection || (view === "outside") !== outsideView;
    patchFilters({
      view,
      ...(brandUniverseChanges ? {
        q: "",
        brands: [],
        tier: "",
        status: "",
        changed: false,
        newOnly: false,
        selected: "",
      } : {}),
    });
  };
  const patchActiveFilters = (patch) => (
    Object.hasOwn(patch, "view") ? changeView(patch.view) : patchFilters(patch)
  );
  const selectListing = (id) => {
    commitState({ selected: id }, "replace");
    setInspectorOpen(true);
  };

  const compareKey = (listing) => (listing.collection === "german" ? `german:${listing.id}` : listing.id);
  const toggleCompare = (listing) => {
    const key = compareKey(listing);
    setCompareIds((current) => {
      if (current.includes(key)) {
        setAnnouncement("Listing removed from compare.");
        return current.filter((item) => item !== key);
      }
      if (current.length >= 3) return current;
      setAnnouncement("Listing added to compare.");
      return [...current, key];
    });
  };

  const statuses = useMemo(
    () => [...new Set(activeListings.map((listing) => listing.status).filter(Boolean))].sort(stringCompare),
    [activeListings],
  );

  if (loadError) {
    return (
      <div className="app-loading" role="alert">
        <strong>The listing snapshot could not be loaded.</strong>
        <p className="muted-copy">{loadError}</p>
      </div>
    );
  }

  if (!core) {
    return (
      <div className="app-loading" role="status">
        <strong>Loading the evidence snapshot…</strong>
        <p className="muted-copy">Reading the sanitized listing data.</p>
      </div>
    );
  }

  const selectedKey = selectedListing ? compareKey(selectedListing) : null;

  return (
    <div className="app-shell" data-inspector-open={inspectorOpen && Boolean(selectedListing)}>
      <a className="skip-link" href="#results-title">Skip to listing results</a>
      <Sidebar
        aggregate={core.aggregate}
        germanAggregate={core.germanAggregate}
        activeView={state.view}
        snapshotDate={core.snapshotDate}
        onViewChange={changeView}
        onOpenGuide={() => setOnboardingOpen(true)}
        onReset={resetAll}
      />

      <main className="workspace-main">
        <DecisionRail
          aggregate={core.aggregate}
          germanAggregate={core.germanAggregate}
          activeView={state.view}
          onViewChange={changeView}
        />
        <section className="workspace-controls" aria-label="Search and filter listings">
          <SearchToolbar
            query={state.q} sort={state.sort} direction={state.direction} filtersOpen={filtersOpen}
            onSearch={(q) => patchFilters({ q })}
            onSortChange={(sort, direction) => patchFilters({ sort, direction })}
            onToggleFilters={() => setFiltersOpen((open) => !open)}
          />
          <FiltersPanel
            open={filtersOpen} filters={state} brands={activeBrands}
            brandLegend={germanView ? "German brands" : outsideView ? "Makes in this look-queue" : "Approved brands"}
            distanceBands={core.distanceBands} statuses={statuses}
            onApply={(filters) => {
              patchFilters(filters);
              setFiltersOpen(false);
              setAnnouncement("Filters applied.");
            }}
            onClose={() => setFiltersOpen(false)} onReset={resetAll}
          />
          <FilterChips state={state} onPatch={patchActiveFilters} onReset={resetAll} />
        </section>

        {needsRest ? (
          <div className="app-loading" role="status">
            <strong>Loading the full listing set…</strong>
            <p className="muted-copy">The unfiltered view includes cards outside the approved brands.</p>
          </div>
        ) : (
          <ListingsTable
            listings={pageListings} total={filtered.length} page={safePage} pageSize={state.pageSize}
            pageCount={pageCount} selectedId={selectedListing?.id} snapshotDate={core.snapshotDate}
            sort={state.sort} direction={state.direction}
            onSort={(sort, direction) => patchFilters({ sort, direction })}
            onSelect={selectListing} onPageChange={(page) => commitState({ page })}
            onPageSizeChange={(pageSize) => patchFilters({ pageSize })} onReset={resetAll}
          />
        )}
      </main>

      {inspectorOpen && selectedListing ? (
        <button className="inspector-backdrop" type="button" aria-label="Close evidence inspector" onClick={() => setInspectorOpen(false)} />
      ) : null}

      <Inspector
        listing={selectedListing} open={inspectorOpen}
        compared={Boolean(selectedKey && compareIds.includes(selectedKey))}
        compareDisabled={compareIds.length >= 3} onClose={() => setInspectorOpen(false)}
        onToggleCompare={() => selectedListing && toggleCompare(selectedListing)}
        onOpenScoring={() => setScoringOpen(true)}
      />

      {compareIds.length ? (
        <div className="compare-dock" role="region" aria-label="Compare tray">
          <Scales size={20} aria-hidden="true" />
          <strong>{compareIds.length} of 3 selected</strong>
          <button type="button" className="text-button" onClick={() => setCompareOpen(true)}>Compare cars</button>
          <button type="button" className="icon-button" onClick={() => setCompareIds([])} aria-label="Clear compared cars">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <ModalDialog
        open={scoringOpen} title="How the score works"
        description="The app mirrors the decision rules in the used-car buying playbook. Distance adds convenience points; it does not automatically reject a car."
        onClose={() => setScoringOpen(false)} className="scoring-dialog"
      >
        <ScoringGuide guide={core.scoringGuide} />
      </ModalDialog>

      <ModalDialog
        open={compareOpen} title="Compare evidence"
        description="Review up to three candidates using the same decision fields."
        onClose={() => setCompareOpen(false)} className="compare-dialog"
      >
        {comparedListings.length ? <CompareView listings={comparedListings} onRemove={toggleCompare} /> : <p className="muted-copy">Add a listing from the evidence inspector to begin comparing.</p>}
      </ModalDialog>

      <OnboardingDialog
        open={onboardingOpen}
        approvedBrands={core.approvedBrands}
        scoringGuide={core.scoringGuide}
        onClose={() => setOnboardingOpen(false)}
        onOpenScoring={openScoringFromGuide}
        onBrowseApproved={() => {
          changeView("approved");
          setOnboardingOpen(false);
          setAnnouncement("Approved brands opened.");
        }}
        onShowStrong={() => {
          changeView("strong");
          setOnboardingOpen(false);
          setAnnouncement("Strong matches opened.");
        }}
      />

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
