import { X } from "@phosphor-icons/react";
import { currency } from "../lib/format.js";
import { TITLE_STATUS_LABELS } from "../lib/title-status.js";

function Chip({ label, onRemove }) {
  return (
    <span className="filter-chip">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label} filter`}>
        <X size={14} aria-hidden="true" />
      </button>
    </span>
  );
}

const VIEW_LABELS = {
  all: "All listings",
  approved: "Approved brands",
  evaluated: "Evaluated",
  strong: "Strong matches",
  worth: "Worth a look",
  marginal: "Marginal",
  needs: "Needs evaluation",
  changed: "Price changes",
  longshots: "Long shots",
  asking: "Worth asking",
  outside: "Outside approved brands",
  german: "German cars",
  "german-reviewed": "German reviewed",
  "german-scored": "German scored",
  "german-worth": "German worth a look",
};

export function FilterChips({ state, onPatch, onReset }) {
  const chips = [];
  if (state.view !== "all") {
    const clearedView = state.view.startsWith("german-") ? "german" : "all";
    chips.push(<Chip key="view" label={`View: ${VIEW_LABELS[state.view] || state.view}`} onRemove={() => onPatch({ view: clearedView })} />);
  }
  if (state.q) chips.push(<Chip key="q" label={`Search: ${state.q}`} onRemove={() => onPatch({ q: "" })} />);
  if (state.brands.length) chips.push(<Chip key="brands" label={`Brands: ${state.brands.length}`} onRemove={() => onPatch({ brands: [] })} />);
  chips.push(
    <Chip
      key="price"
      label={`Price: ${currency.format(state.minPrice)}–${currency.format(state.maxPrice)}`}
      onRemove={() => onPatch({ minPrice: 0, maxPrice: 100000 })}
    />,
  );
  if (state.tier) chips.push(<Chip key="tier" label={`Tier: ${state.tier}`} onRemove={() => onPatch({ tier: "" })} />);
  if (state.titleStatus) {
    chips.push(
      <Chip
        key="title-status"
        label={`Title: ${TITLE_STATUS_LABELS[state.titleStatus]}`}
        onRemove={() => onPatch({ titleStatus: "" })}
      />,
    );
  }
  if (state.minYear || state.maxYear) {
    chips.push(<Chip key="year" label={`Year: ${state.minYear || "Any"}–${state.maxYear || "Any"}`} onRemove={() => onPatch({ minYear: "", maxYear: "" })} />);
  }
  if (state.distance) chips.push(<Chip key="distance" label={`Distance: ${state.distance}`} onRemove={() => onPatch({ distance: "" })} />);
  if (state.status) chips.push(<Chip key="status" label={`Status: ${state.status}`} onRemove={() => onPatch({ status: "" })} />);
  if (state.newOnly) chips.push(<Chip key="new" label="New in latest snapshot" onRemove={() => onPatch({ newOnly: false })} />);
  if (state.changed) chips.push(<Chip key="changed" label="Price changed" onRemove={() => onPatch({ changed: false })} />);

  return (
    <div className="chips-row" aria-label="Active filters">
      <div className="chip-list">{chips}</div>
      {chips.length > 1 ? <button type="button" className="clear-all" onClick={onReset}>Clear all</button> : null}
    </div>
  );
}
