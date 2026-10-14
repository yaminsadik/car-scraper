import { Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

export function SearchToolbar({ query, sort, direction, onSearch, onSortChange, filtersOpen, onToggleFilters }) {
  const [draft, setDraft] = useState(query);
  const inputRef = useRef(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => setDraft(query), [query]);

  const submit = (event) => {
    event.preventDefault();
    if (!composing) onSearch(draft.trim());
  };

  const clear = () => {
    setDraft("");
    onSearch("");
    inputRef.current?.focus();
  };

  return (
    <div className="toolbar-row">
      <form className="search-form" role="search" noValidate onSubmit={submit}>
        <MagnifyingGlass size={20} aria-hidden="true" />
        <label className="sr-only" htmlFor="listing-search">Search listings</label>
        <input
          ref={inputRef}
          id="listing-search"
          type="search"
          value={draft}
          placeholder="Search make, model, city, label, or id…"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!composing && !event.nativeEvent.isComposing) onSearch(draft.trim());
          }}
        />
        {draft ? (
          <button type="button" className="search-clear" onClick={clear} aria-label="Clear search">
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
        <button type="submit" className="primary-button search-submit">Search</button>
      </form>

      <button
        type="button"
        className="filter-toggle"
        aria-expanded={filtersOpen}
        aria-controls="filters-panel"
        onClick={onToggleFilters}
      >
        <Funnel size={18} aria-hidden="true" />
        Filters
      </button>

      <label className="sort-select">
        <span>Sort by</span>
        <select
          value={`${sort}:${direction}`}
          onChange={(event) => {
            const [nextSort, nextDirection] = event.target.value.split(":");
            onSortChange(nextSort, nextDirection);
          }}
        >
          <option value="score:desc">Highest score</option>
          <option value="rank:asc">Best search rank</option>
          <option value="price:asc">Lowest price</option>
          <option value="price:desc">Highest price</option>
          <option value="lastSeen:desc">Most recently seen</option>
          <option value="year:desc">Newest model year</option>
          <option value="distance:asc">Nearest distance band</option>
          <option value="timesSeen:desc">Seen most often</option>
        </select>
      </label>
    </div>
  );
}
