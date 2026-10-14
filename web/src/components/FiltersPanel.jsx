import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function FiltersPanel({ open, filters, brands, brandLegend, distanceBands, statuses, onApply, onClose, onReset }) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => setDraft(filters), [filters, open]);
  if (!open) return null;

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const toggleBrand = (brand) => {
    const next = draft.brands.includes(brand)
      ? draft.brands.filter((item) => item !== brand)
      : [...draft.brands, brand];
    update({ brands: next });
  };

  return (
    <section id="filters-panel" className="filters-panel" aria-label="Listing filters">
      <div className="filters-panel-heading">
        <div>
          <strong>Filter listings</strong>
          <span>Choose only the evidence you want to review.</span>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close filters">
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      <form
        className="filters-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onApply(draft);
        }}
      >
        <fieldset className="brand-fieldset">
          <legend>{brandLegend}</legend>
          <div className="brand-options">
            {brands.map((brand) => (
              <label key={brand} className="check-option">
                <input
                  type="checkbox"
                  checked={draft.brands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                />
                <span>{brand}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field-label">
          <span>Tier</span>
          <select value={draft.tier} onChange={(event) => update({ tier: event.target.value })}>
            <option value="">Any tier</option>
            <option value="Strong match">Strong match</option>
            <option value="Worth a look">Worth a look</option>
            <option value="Marginal">Marginal</option>
            <option value="Needs evaluation">Needs evaluation</option>
          </select>
        </label>

        <label className="field-label">
          <span>Title status</span>
          <select value={draft.titleStatus} onChange={(event) => update({ titleStatus: event.target.value })}>
            <option value="">Any title status</option>
            <option value="clean">Clean title</option>
            <option value="rebuilt">Rebuilt title</option>
            <option value="not-provided">Not provided</option>
          </select>
        </label>

        <label className="field-label">
          <span>Distance band</span>
          <select value={draft.distance} onChange={(event) => update({ distance: event.target.value })}>
            <option value="">Any distance</option>
            {distanceBands.map(({ band }) => <option key={band} value={band}>{band}</option>)}
            <option value="Unmapped">Unmapped cities</option>
          </select>
        </label>

        <label className="field-label">
          <span>Evaluation status</span>
          <select value={draft.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="">Any status</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <div className="field-pair">
          <label className="field-label">
            <span>Minimum price</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="100"
              value={draft.minPrice}
              onChange={(event) => update({ minPrice: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field-label">
            <span>Maximum price</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="100"
              value={draft.maxPrice}
              onChange={(event) => update({ maxPrice: Number(event.target.value) || 0 })}
            />
          </label>
        </div>

        <div className="field-pair">
          <label className="field-label">
            <span>Minimum year</span>
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max="2030"
              value={draft.minYear}
              onChange={(event) => update({ minYear: event.target.value })}
            />
          </label>
          <label className="field-label">
            <span>Maximum year</span>
            <input
              type="number"
              inputMode="numeric"
              min="1900"
              max="2030"
              value={draft.maxYear}
              onChange={(event) => update({ maxYear: event.target.value })}
            />
          </label>
        </div>

        <div className="binary-filters">
          <label className="switch-option">
            <input type="checkbox" checked={draft.newOnly} onChange={(event) => update({ newOnly: event.target.checked })} />
            <span>New in latest snapshot</span>
          </label>
          <label className="switch-option">
            <input type="checkbox" checked={draft.changed} onChange={(event) => update({ changed: event.target.checked })} />
            <span>Recorded price changes</span>
          </label>
        </div>

        <div className="filter-actions">
          <button type="button" className="ghost-button" onClick={onReset}>Reset filters</button>
          <button type="submit" className="primary-button">Apply filters</button>
        </div>
      </form>
    </section>
  );
}
