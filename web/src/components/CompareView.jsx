import { ArrowSquareOut, Trash, WarningCircle } from "@phosphor-icons/react";
import { currency, formatDate, normalizeTier, vehicleName } from "../lib/format.js";

const ROWS = [
  ["Collection", (listing) => (listing.collection === "german"
    ? "German exploratory · not playbook-approved"
    : "Approved-brand funnel")],
  ["Score", (listing) => listing.score ?? "Not scored"],
  ["Status", (listing) => (listing.evaluated
    ? listing.tier + (listing.cappedFrom ? ` (capped from ${listing.cappedFrom})` : "")
    : listing.status)],
  ["Price", (listing) => listing.price == null ? "Unknown" : currency.format(listing.price)],
  ["Location", (listing) => `${listing.city} · ${listing.distanceBand}`],
  ["Mileage", (listing) => listing.mileageLabel || "Not recorded"],
  ["Title", (listing) => listing.titleStatus || "Not recorded"],
  ["Last seen", (listing) => formatDate(listing.lastSeen)],
];

export function CompareView({ listings, onRemove }) {
  const hasGerman = listings.some((listing) => listing.collection === "german");

  return (
    <div className="compare-view">
      {hasGerman ? (
        <div className="collection-note">
          <WarningCircle size={17} aria-hidden="true" />
          <span>This comparison includes German exploratory candidates, which are not playbook-approved recommendations.</span>
        </div>
      ) : null}
      <div className="compare-columns" style={{ "--compare-count": listings.length }}>
        <span />
        {listings.map((listing) => (
          <div className="compare-heading" key={listing.id}>
            <span className="score-cell" data-tier={normalizeTier(listing.tier)}>{listing.score ?? "—"}</span>
            <strong>{vehicleName(listing)}</strong>
            <button type="button" className="icon-button" onClick={() => onRemove(listing)} aria-label={`Remove ${vehicleName(listing)} from compare`}>
              <Trash size={18} aria-hidden="true" />
            </button>
          </div>
        ))}

        {ROWS.map(([label, render]) => (
          <div className="compare-row" key={label}>
            <strong>{label}</strong>
            {listings.map((listing) => <span key={listing.id}>{render(listing)}</span>)}
          </div>
        ))}
      </div>
      <div className="compare-links">
        {listings.map((listing) => (
          <a key={listing.id} href={listing.url} target="_blank" rel="noreferrer" className="outline-button">
            Open {listing.make}
            <ArrowSquareOut size={16} aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}
