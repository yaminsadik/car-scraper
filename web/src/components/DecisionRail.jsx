import { CaretRight } from "@phosphor-icons/react";
import { integer } from "../lib/format.js";

const STAGES = [
  {
    key: "all",
    count: "all",
    title: "All listings",
    detail: "Deduplicated master CSV",
  },
  {
    key: "approved",
    count: "approved",
    title: "Approved brands",
    detail: "Playbook-approved makes",
  },
  {
    key: "evaluated",
    count: "evaluated",
    title: "Evaluated / scored",
    detail: "Mileage, title and reliability",
  },
  {
    key: "strong",
    count: "strong",
    title: "Strong matches",
    detail: "8+ points · best opportunities",
  },
];

const GERMAN_STAGES = [
  {
    key: "german",
    count: "all",
    title: "German candidates",
    detail: "BMW, Mercedes, Audi, MINI, Porsche",
  },
  {
    key: "german-reviewed",
    count: "reviewed",
    title: "Reviewed",
    detail: "Opened or triaged in the tracker",
  },
  {
    key: "german-scored",
    count: "evaluated",
    title: "Evaluated / scored",
    detail: "Same playbook scoring rules",
  },
  {
    key: "german-worth",
    count: "worth",
    title: "Worth a look",
    detail: "Exploratory candidates only",
  },
];

export function DecisionRail({ aggregate, germanAggregate, activeView, onViewChange }) {
  const germanActive = activeView === "german" || activeView.startsWith("german-");
  const stages = germanActive ? GERMAN_STAGES : STAGES;
  const counts = germanActive ? germanAggregate : aggregate;

  return (
    <section className="decision-section" aria-labelledby="decision-title">
      <div className="decision-heading">
        <p id="decision-title" className="section-eyebrow">{germanActive ? "German exploratory rail" : "Scored evidence rail"}</p>
        {germanActive ? <span>Separate sweep · these brands are not playbook-approved</span> : null}
      </div>
      <div className="decision-rail" data-collection={germanActive ? "german" : "approved"}>
        {stages.map((stage, index) => (
          <div className="decision-stage-wrap" key={stage.key}>
            <button
              type="button"
              className="decision-stage"
              data-active={activeView === stage.key}
              aria-current={activeView === stage.key ? "page" : undefined}
              onClick={() => onViewChange(stage.key)}
            >
              <span>{stage.title}</span>
              <small>{stage.detail}</small>
              <strong>{integer.format(counts[stage.count] ?? 0)}</strong>
            </button>
            {index < stages.length - 1 ? (
              <CaretRight className="decision-caret" size={18} aria-hidden="true" />
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
