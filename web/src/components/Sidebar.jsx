import {
  ArrowCounterClockwise,
  Binoculars,
  Car,
  ChatCircleText,
  CheckCircle,
  Flag,
  FolderSimple,
  Rocket,
  ShieldCheck,
  Star,
  TrendDown,
} from "@phosphor-icons/react";
import { formatDate, integer } from "../lib/format.js";

const VIEW_ITEMS = [
  { key: "all", label: "All listings", count: "all", Icon: FolderSimple },
  { key: "approved", label: "Approved brands", count: "approved", Icon: CheckCircle },
  { key: "strong", label: "Strong matches", count: "strong", Icon: Star },
  { key: "worth", label: "Worth a look", count: "worth", Icon: CheckCircle },
  { key: "marginal", label: "Marginal", count: "marginal", Icon: Flag },
  { key: "needs", label: "Needs evaluation", count: "needsEvaluation", Icon: Flag },
  { key: "changed", label: "Price changes", count: "priceChanges", Icon: TrendDown },
];

// Playbook §3b. Kept out of the scored funnel above because none of these is a quality
// tier — one is a risk appetite, one is a work queue, one is an off-brand look-queue.
const BET_ITEMS = [
  { key: "longshots", label: "Long shots", count: "longShots", Icon: Rocket, note: "2019+ under $10.5k" },
  { key: "asking", label: "Worth asking", count: "worthAsking", Icon: ChatCircleText, note: "Price unconfirmed — one message" },
  { key: "outside", label: "Outside approved", count: "outsideApproved", Icon: Binoculars, note: "Infiniti, Mitsubishi, … · look only" },
];

export function Sidebar({ aggregate, germanAggregate, activeView, onOpenGuide, onViewChange, onReset, snapshotDate }) {
  const germanActive = activeView === "german" || activeView.startsWith("german-");

  return (
    <aside className="sidebar">
      <div className="brand-lockup" aria-label="Evidence Desk">
        <ShieldCheck size={38} weight="regular" aria-hidden="true" />
        <div>
          <strong>Evidence Desk</strong>
          <span>Private used-car finder</span>
        </div>
      </div>

      <nav className="saved-views" aria-label="Saved listing views">
        <p className="nav-eyebrow">Saved views</p>
        <div className="saved-view-list">
          {VIEW_ITEMS.map(({ key, label, count, Icon }) => (
            <button
              key={key}
              type="button"
              className="saved-view"
              data-active={activeView === key}
              aria-current={activeView === key ? "page" : undefined}
              onClick={() => onViewChange(key)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
              <b>{integer.format(aggregate[count] ?? 0)}</b>
            </button>
          ))}
        </div>
        <div className="bet-nav">
          <p className="nav-eyebrow">High risk, high reward</p>
          {BET_ITEMS.map(({ key, label, count, note, Icon }) => (
            <button
              key={key}
              type="button"
              className="saved-view"
              data-active={activeView === key}
              aria-current={activeView === key ? "page" : undefined}
              onClick={() => onViewChange(key)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
              <b>{integer.format(aggregate[count] ?? 0)}</b>
              <small>{note}</small>
            </button>
          ))}
        </div>
        <div className="german-nav">
          <p className="nav-eyebrow">German sweep</p>
          <button
            type="button"
            className="saved-view"
            data-active={germanActive}
            aria-current={germanActive ? "page" : undefined}
            onClick={() => onViewChange("german")}
          >
            <Car size={20} aria-hidden="true" />
            <span>German cars</span>
            <b>{integer.format(germanAggregate.all ?? 0)}</b>
          </button>
          <small>Exploratory · not approved</small>
        </div>
      </nav>

      <div className="sidebar-tools">
        <p className="nav-eyebrow">Tools</p>
        <button type="button" className="sidebar-reset" onClick={onReset}>
          <ArrowCounterClockwise size={20} aria-hidden="true" />
          Reset filters
        </button>
        <button type="button" className="sidebar-reset sidebar-guide" onClick={onOpenGuide}>
          <ShieldCheck size={20} aria-hidden="true" />
          How to use this
        </button>
      </div>

      <div className="snapshot-note">
        <span>Snapshot updated</span>
        <strong>{snapshotDate ? formatDate(snapshotDate) : "Unknown"}</strong>
        <small>Static data · No live backend</small>
      </div>
    </aside>
  );
}
