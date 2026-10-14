export function ScoringGuide({ guide }) {
  return (
    <div className="scoring-guide">
      {guide.categories.map((category) => (
        <section key={category.name}>
          <h3>{category.name}</h3>
          <table>
            <thead>
              <tr>
                {category.rows[0] ? Object.keys(category.rows[0]).map((header) => <th key={header} scope="col">{header}</th>) : null}
              </tr>
            </thead>
            <tbody>
              {category.rows.map((row, index) => (
                <tr key={index}>
                  {Object.values(row).map((value, cellIndex) => <td key={cellIndex}>{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section>
        <h3>Tiers</h3>
        <ul className="tier-guide">
          {guide.tiers.map((tier) => <li key={tier.range}><strong>{tier.range}</strong><span>{tier.meaning}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
