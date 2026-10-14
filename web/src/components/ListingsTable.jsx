import { ArrowsDownUp, CaretDown, CaretUp, CaretLeft, CaretRight, TrendDown } from "@phosphor-icons/react";
import { currency, formatDate, integer, normalizeTier, scoreLabel, vehicleName } from "../lib/format.js";

const COLUMNS = [
  { key: "score", label: "Score", defaultDirection: "desc" },
  { key: "year", label: "Year / Make / Model", defaultDirection: "desc" },
  { key: "distance", label: "City / Distance", defaultDirection: "asc" },
  { key: "price", label: "Price", defaultDirection: "asc" },
  { key: "tier", label: "Status", defaultDirection: "asc" },
  { key: "lastSeen", label: "Last seen", defaultDirection: "desc" },
];

function SortIcon({ active, direction }) {
  if (!active) return <ArrowsDownUp className="sort-placeholder" size={13} aria-hidden="true" />;
  return direction === "asc" ? <CaretUp size={13} aria-hidden="true" /> : <CaretDown size={13} aria-hidden="true" />;
}

function pageRange(current, total) {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

export function ListingsTable({
  listings,
  total,
  page,
  pageSize,
  pageCount,
  selectedId,
  snapshotDate,
  sort,
  direction,
  onSort,
  onSelect,
  onPageChange,
  onPageSizeChange,
  onReset,
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, total);
  const pages = pageRange(page, pageCount);

  return (
    <section className="table-section" aria-labelledby="results-title">
      <h2 id="results-title" className="sr-only">Car listing results</h2>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Filtered used-car listings with scores and evidence status</caption>
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const active = sort === column.key;
                return (
                  <th key={column.key} scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => onSort(column.key, active && direction === "asc" ? "desc" : column.defaultDirection)}>
                      {column.label}
                      <SortIcon active={active} direction={direction} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => {
              const displayStatus = listing.evaluated ? listing.tier : listing.status;
              const tierClass = normalizeTier(displayStatus);
              const isNew = listing.firstSeen === snapshotDate;
              return (
                <tr key={listing.id} data-selected={listing.id === selectedId}>
                  <td>
                    <span className="score-cell" data-tier={tierClass}>{scoreLabel(listing)}</span>
                  </td>
                  <td className="vehicle-cell">
                    <button type="button" onClick={() => onSelect(listing.id)} aria-label={`View evidence for ${vehicleName(listing)}`}>
                      <strong>{vehicleName(listing)}</strong>
                      <span>{listing.label && listing.label !== vehicleName(listing) ? listing.label.replace(/^\d{4}\s+/i, "") : "Marketplace listing"}</span>
                    </button>
                  </td>
                  <td>
                    <strong>{listing.city}</strong>
                    <span>{listing.distanceBand}</span>
                  </td>
                  <td className="price-cell">
                    <strong>{listing.price == null ? "Not listed" : currency.format(listing.price)}</strong>
                    {listing.priceChangeKind ? (
                      <span className="price-changed">
                        <TrendDown size={13} aria-hidden="true" />
                        {listing.priceChangeKind === "observed"
                          ? "Dropped since last capture"
                          : `was ${currency.format(listing.wasPrice)}`}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className="status-badge" data-tier={tierClass}>{displayStatus}</span>
                    {listing.cappedFrom ? <span className="row-note">capped from {listing.cappedFrom}</span> : null}
                  </td>
                  <td>
                    <strong>{formatDate(listing.lastSeen)}</strong>
                    <span className="row-flags">
                      {isNew ? <small className="new-badge">New</small> : null}
                      <small>{integer.format(listing.timesSeen)}× seen</small>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!listings.length ? (
          <div className="no-results" role="status">
            <strong>No listings match these filters.</strong>
            <span>Clear the filters to return to the full evidence set.</span>
            <button type="button" className="outline-button" onClick={onReset}>Clear filters</button>
          </div>
        ) : null}
      </div>

      <footer className="table-footer">
        <div>
          <span>Showing {integer.format(start)}–{integer.format(end)} of {integer.format(total)} results</span>
          <label>
            Rows
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="48">48</option>
            </select>
          </label>
        </div>
        <nav className="pagination" aria-label="Result pages">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
            <CaretLeft size={16} aria-hidden="true" />
          </button>
          {pages.map((pageNumber, index) => {
            const previous = pages[index - 1];
            return (
              <span className="page-slot" key={pageNumber}>
                {previous && pageNumber - previous > 1 ? <span className="page-ellipsis">…</span> : null}
                <button
                  type="button"
                  data-current={pageNumber === page}
                  aria-current={pageNumber === page ? "page" : undefined}
                  onClick={() => onPageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              </span>
            );
          })}
          <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="Next page">
            <CaretRight size={16} aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  );
}
