import { Info } from "@phosphor-icons/react";
import { ModalDialog } from "./ModalDialog.jsx";

function getShortCategoryName(name) {
  if (name.startsWith("Distance")) return "Distance";
  if (name.startsWith("Missing information")) return "Missing information";
  return name;
}

function getTierParts(range) {
  const [points, label] = range.split("→").map((part) => part.trim());
  return { points, label };
}

export function OnboardingDialog({ approvedBrands, onBrowseApproved, onClose, onOpenScoring, onShowStrong, open, scoringGuide }) {
  return (
    <ModalDialog
      open={open}
      title="How to analyze listings"
      description="A quick guide to narrowing the snapshot."
      onClose={onClose}
      className="onboarding-dialog"
    >
      <ol className="analysis-guide" aria-label="How to analyze listings">
        <li className="analysis-guide-step">
          <span className="analysis-step-number" aria-hidden="true">1</span>
          <div>
            <h3>Start with approved brands</h3>
            <p>These are the makes selected in the buying playbook.</p>
            <ul className="approved-brand-list" aria-label="Approved brands">
              {approvedBrands.map((brand) => <li key={brand}>{brand}</li>)}
            </ul>
          </div>
        </li>
        <li className="analysis-guide-step">
          <span className="analysis-step-number" aria-hidden="true">2</span>
          <div>
            <div className="analysis-step-heading">
              <h3>Use the score</h3>
              <button
                type="button"
                className="outline-button scoring-details-button"
                aria-haspopup="dialog"
                onClick={onOpenScoring}
              >
                <Info size={15} aria-hidden="true" />
                Scoring details
              </button>
            </div>
            <p>Listings gain or lose points using the checks below. Some answers can limit the final tier or reject a listing.</p>
            <ul className="scoring-factor-list" aria-label="Scoring factors">
              {scoringGuide.categories.map(({ name }) => (
                <li key={name}>{getShortCategoryName(name)}</li>
              ))}
            </ul>
            <ul className="scoring-tier-list" aria-label="Score tiers">
              {scoringGuide.tiers.map(({ range }) => {
                const tier = getTierParts(range);
                return (
                  <li className="scoring-tier" key={range}>
                    <strong>{tier.points}</strong>
                    <span>{tier.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </li>
        <li className="analysis-guide-step">
          <span className="analysis-step-number" aria-hidden="true">3</span>
          <div>
            <h3>Check the evidence</h3>
            <p>Open a car to see why it received its score. Compare up to three cars before deciding what to investigate.</p>
          </div>
        </li>
      </ol>

      <p className="onboarding-boundary"><strong>German cars are separate and exploratory.</strong> They are not approved brands.</p>

      <div className="onboarding-actions">
        <button type="button" className="primary-button" onClick={onShowStrong}>Show strong matches</button>
        <button type="button" className="outline-button" onClick={onBrowseApproved}>Browse approved brands</button>
        <button type="button" className="text-button onboarding-close" onClick={onClose}>Close</button>
      </div>
    </ModalDialog>
  );
}
