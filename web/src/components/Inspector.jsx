import {
  ArrowSquareOut,
  CalendarBlank,
  ChatCircleText,
  Check,
  ClockCounterClockwise,
  Info,
  Rocket,
  Scales,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { currency, formatDate, formatPoints, normalizeTier, vehicleName } from "../lib/format.js";

function EvidenceItem({ label, value }) {
  return (
    <div className="evidence-item">
      <dt>{label}</dt>
      <dd>{value || "Not recorded"}</dd>
    </div>
  );
}

// Playbook §11. The one question that lifts the §5 price cap, so it is worth having ready
// rather than retyping per listing.
const priceQuestion = (listing) =>
  `Hi — is the ${listing.price == null ? "price" : currency.format(listing.price)} in your listing the cash price to buy the car outright, `
  + "or is it a down payment? And are there any dealer, doc, or transfer fees on top? Thanks.";

export function Inspector({ listing, open, compared, compareDisabled, onClose, onToggleCompare, onOpenScoring }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [listing?.id]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!listing) return null;
  const displayStatus = listing.evaluated ? listing.tier : listing.status;
  const tierClass = normalizeTier(displayStatus);

  const copyQuestion = async () => {
    try {
      await navigator.clipboard.writeText(priceQuestion(listing));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="inspector" data-open={open} aria-label={`Evidence for ${vehicleName(listing)}`}>
      <div className="inspector-header">
        <span>Evidence inspector</span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close evidence inspector">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="inspector-scroll">
        <section className="vehicle-summary">
          {listing.collection === "german" ? (
            <div className="collection-note">
              <WarningCircle size={17} aria-hidden="true" />
              <span>German exploratory sweep · not an approved-brand recommendation</span>
            </div>
          ) : listing.outsideApproved ? (
            <div className="collection-note">
              <WarningCircle size={17} aria-hidden="true" />
              <span>Outside approved brands · look-queue only, not a recommendation</span>
            </div>
          ) : null}
          {listing.longShot || listing.outsideApproved ? (
            <div className="longshot-note">
              <Rocket size={17} aria-hidden="true" />
              <span>
                {listing.outsideApproved && listing.year >= 2022
                  ? `A ${listing.year} at this price is almost certainly a down payment — verify before travelling`
                  : `Long shot · a ${listing.year} at this price is either an exceptional deal or has a reason — verify before travelling`}
              </span>
            </div>
          ) : null}
          <h2>{vehicleName(listing)}</h2>
          <div className="vehicle-summary-grid">
            <strong>{listing.price == null ? "Price unknown" : currency.format(listing.price)}</strong>
            <span>{listing.city}<small>{listing.distanceBand}</small></span>
            <span>{listing.mileageLabel || "Mileage unavailable"}<small>{listing.titleStatus || "Title unavailable"}</small></span>
          </div>
        </section>

        <section className="score-card" aria-labelledby="score-heading">
          <div className="score-heading" data-tier={tierClass}>
            <strong>{listing.score ?? "—"}</strong>
            <span>{listing.score == null ? "Not scored" : "points"}</span>
            <b>{displayStatus}</b>
          </div>

          {listing.cappedFrom ? (
            <p className="tier-cap-note">
              {listing.score} points would place this at <strong>{listing.cappedFrom}</strong>. It is held at{" "}
              <strong>{listing.tier}</strong> by a documented cap recorded during evaluation
              {listing.collection === "german" ? " — German candidates are never presented as strong matches." : "."}
            </p>
          ) : null}

          <h3 id="score-heading" className="sr-only">Score breakdown</h3>
          {listing.scoreFactors.length ? (
            <ol className="score-ledger">
              {listing.scoreFactors.map((factor, index) => (
                <li key={`${factor.label}-${index}`}>
                  <span className="factor-points" data-negative={factor.points < 0}>{formatPoints(factor.points)}</span>
                  <span className="factor-label">{factor.label}</span>
                  <small>{factor.evidence}</small>
                </li>
              ))}
              <li className="score-total">
                <strong>{listing.score}</strong>
                <span>Total points</span>
              </li>
            </ol>
          ) : listing.score != null ? (
            <div className="score-empty">
              <Info size={20} aria-hidden="true" />
              <div>
                <strong>Score recorded without a factor breakdown.</strong>
                <span>The tracker holds a score but not the structured fields needed to itemise it.</span>
              </div>
            </div>
          ) : (
            <div className="score-empty">
              <Info size={20} aria-hidden="true" />
              <div>
                <strong>No score is recorded yet.</strong>
                <span>Evaluate mileage, title, price type, distance, and reliability in the tracker, then rebuild this snapshot.</span>
              </div>
            </div>
          )}

          <div className="provenance-note">
            <strong>Data provenance</strong>
            <p>{listing.scoreFactors.length && !listing.ledgerComplete
              ? "Every line above is computed from a recorded field. The last line covers the judgement factors the playbook leaves to review — negotiability, reliability outlook and service records — which are kept in the private tracker notes."
              : "Every line above is computed from a recorded field."}</p>
            <p>{listing.collection === "german"
              ? "Price and city come from the separate German capture. Mileage, title, reliability, and final score come from the German tracker. Distance points use the same playbook city bands."
              : "Price and city come from the master CSV. Mileage, title, reliability, and final score come from the evaluated tracker. Distance points come from the playbook city band."}</p>
            <button type="button" className="text-button" onClick={onOpenScoring}>How scoring works</button>
          </div>
        </section>

        {listing.worthAsking ? (
          <section className="evidence-card ask-card" aria-labelledby="ask-heading">
            <h3 id="ask-heading"><ChatCircleText size={17} aria-hidden="true" /> Price not confirmed yet</h3>
            <p className="muted-copy">
              This listing carries financing language, so the figure shown may or may not be the cash
              price. Asked directly, a good share of these sellers have confirmed it is — and most
              said there are no dealer fees. Until one answers, the tier stays capped.
            </p>
            <p className="ask-message">{priceQuestion(listing)}</p>
            <button type="button" className="text-button" onClick={copyQuestion}>
              {copied ? "Copied to clipboard" : "Copy this message"}
            </button>
          </section>
        ) : null}

        <section className="evidence-card" aria-labelledby="evidence-summary-heading">
          <h3 id="evidence-summary-heading"><CalendarBlank size={17} aria-hidden="true" /> Evidence summary</h3>
          <dl>
            <EvidenceItem label="First seen" value={formatDate(listing.firstSeen)} />
            <EvidenceItem label="Last seen" value={formatDate(listing.lastSeen)} />
            <EvidenceItem label="Times seen" value={`${listing.timesSeen} capture${listing.timesSeen === 1 ? "" : "s"}`} />
            <EvidenceItem label="Best search rank" value={listing.bestRank == null ? null : `#${listing.bestRank}`} />
            <EvidenceItem label="Evaluation status" value={listing.status} />
          </dl>
        </section>

        <section className="evidence-card" aria-labelledby="price-history-heading">
          <h3 id="price-history-heading"><ClockCounterClockwise size={17} aria-hidden="true" /> Price history</h3>
          {listing.priceHistory || listing.priceChangeLabel ? (
            <p className="price-history-copy">{listing.priceHistory || listing.priceChangeLabel}</p>
          ) : listing.wasPrice ? (
            <p className="price-history-copy">Card showed {currency.format(listing.wasPrice)} before {currency.format(listing.price)}.</p>
          ) : (
            <p className="muted-copy">No recorded price change in this snapshot.</p>
          )}
        </section>
      </div>

      <div className="inspector-actions">
        <a className="primary-button" href={listing.url} target="_blank" rel="noreferrer">
          Open on Marketplace
          <ArrowSquareOut size={18} aria-hidden="true" />
        </a>
        <button
          type="button"
          className="outline-button"
          aria-pressed={compared}
          disabled={compareDisabled && !compared}
          onClick={onToggleCompare}
        >
          {compared ? <Check size={18} aria-hidden="true" /> : <Scales size={18} aria-hidden="true" />}
          {compared ? "Added to compare" : "Add to compare"}
        </button>
      </div>
    </aside>
  );
}
