// DP Assistant — Écran "Fiche de sécurité" (Art. A322-72)

function ScreenFiche({ answers, palanquees, divers }) {
  const diversById = useMemo(() => {
    const m = {};
    divers.forEach(d => m[d.id] = d);
    return m;
  }, [divers]);

  const onPrint = () => window.print();

  const onExportJson = () => {
    const blob = new Blob([JSON.stringify({ answers, palanquees, divers, exportedAt: new Date().toISOString() }, null, 2)],
      { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fiche-securite-${(answers.date || "").slice(0,10)}.json`;
    a.click();
  };

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 4 / 4 · Fiche de sécurité</div>
        <h1>Fiche de sécurité — Art. A322-72</h1>
        <p>Document à compléter avant la mise à l'eau et à conserver 1 an minimum par l'établissement. Imprimable A4 portrait, lisible en noir et blanc.</p>
      </div>

      <div className="fiche-actions">
        <button className="btn" onClick={onExportJson}>⤓ Export JSON</button>
        <button className="btn">🔗 Lien partageable</button>
        <button className="btn primary" onClick={onPrint}>🖨 Imprimer / PDF</button>
      </div>

      <div className="fiche">
        <div className="fheader">
          <div className="left">
            <b>FICHE DE SÉCURITÉ — Art. A322-72 du Code du Sport</b>
            <h1>{answers.site || "—"}</h1>
            <div className="muted" style={{ fontFamily: "var(--t-mono)", fontSize: 11 }}>
              {answers.structure || "Structure non renseignée"} · Affiliation FFESSM n° A-29-———
            </div>
          </div>
          <div className="right">
            <b>{formatDateTime(answers.date)}</b>
            <div>DP : {answers.dp_nom || "—"} ({answers.dp_qual || "—"})</div>
            <div>Activité : {answers.activite || "—"}</div>
          </div>
        </div>

        <div className="fiche-grid">
          <div className="cell">
            <div className="k">Milieu</div>
            <div className="v">{answers.milieu || "—"}</div>
          </div>
          <div className="cell">
            <div className="k">Départ</div>
            <div className="v">{answers.depart || "—"}{answers.embarcation ? ` · ${answers.embarcation}` : ""}</div>
          </div>
          <div className="cell">
            <div className="k">Distance / Délai secours</div>
            <div className="v">{answers.distance_cote ? `${answers.distance_cote} M · ` : ""}{answers.delai_secours || "—"}</div>
          </div>
          <div className="cell">
            <div className="k">Conditions</div>
            <div className="v" style={{ fontSize: 12, fontWeight: 500 }}>{answers.meteo || "—"}</div>
          </div>
        </div>

        <h2>Palanquées — paramètres prévus</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Plongeur</th>
              <th>Aptitude</th>
              <th>Fonction</th>
              <th>Mélange</th>
              <th>Prof. prévue</th>
              <th>Durée prévue</th>
              <th>DTR</th>
            </tr>
          </thead>
          <tbody>
            {palanquees.map((p, pi) => (
              <React.Fragment key={p.id}>
                {p.membres.map((m, mi) => {
                  const d = diversById[m.diverId] || {};
                  const role = window.PAL_ROLES.find(r => r.id === m.role)?.label || m.role;
                  return (
                    <tr key={m.diverId}>
                      {mi === 0 && (
                        <td rowSpan={p.membres.length || 1} style={{ verticalAlign: "top", fontWeight: 700, fontFamily: "var(--t-mono)" }}>
                          P{pi + 1}
                        </td>
                      )}
                      <td>
                        <b>{diverFullName(d)}</b>
                        <br />
                        <span className="muted" style={{ fontFamily: "var(--t-mono)", fontSize: 10 }}>{d.licence || "—"}</span>
                      </td>
                      <td>
                        {d.niveau}
                        {(d.qualifs || []).length > 0 &&
                          <><br /><span className="muted" style={{ fontSize: 10.5 }}>{d.qualifs.join(" · ")}</span></>}
                      </td>
                      <td>{role}</td>
                      {mi === 0 && (
                        <>
                          <td rowSpan={p.membres.length || 1} style={{ verticalAlign: "top" }}>{p.melange}</td>
                          <td rowSpan={p.membres.length || 1} style={{ verticalAlign: "top", fontVariantNumeric: "tabular-nums" }}>{p.profMax} m</td>
                          <td rowSpan={p.membres.length || 1} style={{ verticalAlign: "top", fontVariantNumeric: "tabular-nums" }}>{p.duree} min</td>
                          <td rowSpan={p.membres.length || 1} style={{ verticalAlign: "top", fontVariantNumeric: "tabular-nums" }}>{p.dtr} min</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <h2>Paramètres réalisés — à compléter au retour</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Palanquée</th>
              <th>Prof. max réalisée</th>
              <th>Durée réelle</th>
              <th>Paliers effectués</th>
              <th>Heure de sortie</th>
              <th>Incidents / observations</th>
            </tr>
          </thead>
          <tbody>
            {palanquees.map((p, pi) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700, fontFamily: "var(--t-mono)" }}>P{pi + 1}</td>
                <td>{p.nom}</td>
                <td style={{ minWidth: 80 }}></td>
                <td style={{ minWidth: 80 }}></td>
                <td style={{ minWidth: 120 }}></td>
                <td style={{ minWidth: 80 }}></td>
                <td style={{ minWidth: 160 }}></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Sécurité surface</h2>
        <div style={{ fontSize: 12, columns: 2, columnGap: 24 }}>
          <div>• Sécurité surface : <b>{answers.sec_surface ? "Présente" : "Non identifiée"}</b></div>
          <div>• Plan de secours : <b>{answers.plan_secours ? "Affiché et à jour" : "À vérifier"}</b></div>
          <div>• Matériel O₂ vérifié : <b>{answers.o2 ? "Oui" : "Non"}</b></div>
          <div>• Trousse de secours + couv. iso : <b>{answers.trousse ? "Oui" : "Non"}</b></div>
          <div>• VHF : <b>{answers.vhf ? "Embarquée et testée" : "—"}</b></div>
          <div>• Pavillon Alpha : <b>{answers.pavillon_alpha || answers.bouee_surface ? "Hissé/présent" : "—"}</b></div>
          <div>• Eau douce potable : <b>{answers.eau_potable ? "Oui" : "Non"}</b></div>
          <div>• Moyen de rappel : <b>{answers.rappel ? "Oui" : "—"}</b></div>
        </div>

        <div className="signatures">
          <div className="sig">
            <div className="area"></div>
            <div className="k">Signature DP — {answers.dp_nom || "—"}</div>
          </div>
          <div className="sig">
            <div className="area"></div>
            <div className="k">Signature Encadrant(s)</div>
          </div>
          <div className="sig">
            <div className="area"></div>
            <div className="k">Signature Exploitant</div>
          </div>
        </div>

        <div className="legal">
          Document à conserver 1 an minimum par l'établissement (Art. A322-72 du Code du Sport).
          Outil d'aide à la décision — la responsabilité personnelle du Directeur de Plongée demeure pleine et entière.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenFiche });
