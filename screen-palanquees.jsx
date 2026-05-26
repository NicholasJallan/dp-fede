// DP Assistant — Écran "Plongeurs & Palanquées"

function ScreenPalanquees({ divers, palanquees, setPalanquees, answers }) {
  const [filter, setFilter] = useState("");

  const diversById = useMemo(() => {
    const m = {};
    divers.forEach(d => m[d.id] = d);
    return m;
  }, [divers]);

  const assignedIds = useMemo(() => {
    const s = new Set();
    palanquees.forEach(p => p.membres.forEach(m => s.add(m.diverId)));
    return s;
  }, [palanquees]);

  const filteredPool = useMemo(() => {
    const f = filter.toLowerCase();
    return divers.filter(d =>
      !f || d.nom.toLowerCase().includes(f) || d.prenom.toLowerCase().includes(f) ||
      (d.niveau || "").toLowerCase().includes(f)
    );
  }, [divers, filter]);

  const addToPal = (palId, diverId) => {
    setPalanquees(prev => prev.map(p => {
      if (p.id !== palId) return p;
      if (p.membres.find(m => m.diverId === diverId)) return p;
      const d = diversById[diverId];
      const role = (d && window.LEVELS[d.niveau]?.canBeGuide && !p.membres.find(m => m.role === "guide")) ? "guide" : "autonome";
      return { ...p, membres: [...p.membres, { diverId, role }] };
    }));
  };

  const removeFromPal = (palId, diverId) => {
    setPalanquees(prev => prev.map(p =>
      p.id === palId ? { ...p, membres: p.membres.filter(m => m.diverId !== diverId) } : p
    ));
  };

  const setRole = (palId, diverId, role) => {
    setPalanquees(prev => prev.map(p =>
      p.id === palId ? { ...p, membres: p.membres.map(m => m.diverId === diverId ? { ...m, role } : m) } : p
    ));
  };

  const setPalField = (palId, field, value) => {
    setPalanquees(prev => prev.map(p => p.id === palId ? { ...p, [field]: value } : p));
  };

  const addPal = () => {
    const id = "p" + (Math.max(0, ...palanquees.map(p => parseInt(p.id.slice(1)) || 0)) + 1);
    setPalanquees(prev => [...prev, {
      id, nom: `Palanquée ${prev.length + 1}`,
      membres: [], profMax: 25, duree: 35, dtr: 5, melange: "Air"
    }]);
  };

  const removePal = (palId) => {
    setPalanquees(prev => prev.filter(p => p.id !== palId));
  };

  // Validation per palanquée
  const validatePal = (pal) => {
    const issues = [];
    const members = pal.membres.map(m => ({ ...m, diver: diversById[m.diverId] })).filter(m => m.diver);
    const guide = members.find(m => m.role === "guide" || m.role === "encadrant");
    const max = window.PAL_RULES.maxBySpace[`PE-${["6","12","20","40","60"].find(p => pal.profMax <= parseInt(p)) || "60"}`] || 4;

    if (members.length === 0) {
      issues.push({ tone: "warn", text: "Palanquée vide." });
      return issues;
    }
    if (members.length > 4) {
      issues.push({ tone: "err", text: `Palanquée de ${members.length} plongeurs — maximum 4 (Annexe III-16a).` });
    }
    if (!guide && members.length > 1) {
      issues.push({ tone: "warn", text: "Pas de guide / encadrant désigné — palanquée en autonomie." });
    }

    // Profondeur vs prérogatives
    members.forEach(m => {
      const lvl = window.LEVELS[m.diver.niveau] || {};
      if (m.role === "autonome") {
        if (lvl.autoMax !== undefined && pal.profMax > lvl.autoMax) {
          issues.push({ tone: "err", text: `${diverFullName(m.diver)} (${m.diver.niveau}) en autonomie au-delà de ${lvl.autoMax} m — prof. prévue ${pal.profMax} m.` });
        }
      } else if (m.role === "encadre") {
        if (lvl.encMax !== undefined && pal.profMax > lvl.encMax) {
          issues.push({ tone: "err", text: `${diverFullName(m.diver)} (${m.diver.niveau}) encadré au-delà de ${lvl.encMax} m.` });
        }
      } else if (m.role === "guide" || m.role === "encadrant") {
        if (lvl.kind === "encadrant" && lvl.maxProfEns !== undefined && pal.profMax > lvl.maxProfEns) {
          issues.push({ tone: "err", text: `Encadrant ${diverFullName(m.diver)} (${m.diver.niveau}) — prof. max enseignement ${lvl.maxProfEns} m dépassée.` });
        }
      }
    });

    // Nitrox check
    if (pal.melange.startsWith("EAN") || pal.melange.toLowerCase().includes("nitrox")) {
      members.forEach(m => {
        if (!(m.diver.qualifs || []).some(q => q.startsWith("PN"))) {
          issues.push({ tone: "warn", text: `${diverFullName(m.diver)} respire ${pal.melange} sans qualification Nitrox enregistrée.` });
        }
      });
    }

    // Médical
    members.forEach(m => {
      const med = new Date(m.diver.medical);
      const event = new Date(answers.date || Date.now());
      if (!isNaN(med) && med < event) {
        issues.push({ tone: "err", text: `Certificat médical de ${diverFullName(m.diver)} expiré (${m.diver.medical}).` });
      }
    });

    if (issues.length === 0) {
      issues.push({ tone: "ok", text: `Composition conforme (max ${max} plongeurs en espace ≤${pal.profMax} m).` });
    }
    return issues;
  };

  // DP qualification check (global)
  const dpQualOK = useMemo(() => {
    const q = answers.dp_qual;
    const lvl = window.LEVELS[q];
    if (!lvl || !lvl.canBeDP) {
      return { tone: "err", text: `Qualification DP "${q || "—"}" insuffisante. Minimum E3 en milieu naturel (Art. A322-72).` };
    }
    if ((answers.activite === "Enseignement" || answers.activite === "Mixte") && parseFloat(answers.prof_max) > 40 && q !== "E4") {
      return { tone: "err", text: `Enseignement > 40 m : DP doit être E4 (Annexe III-16a). DP actuel : ${q}.` };
    }
    return { tone: "ok", text: `Qualification DP ${q} valide pour ce contexte.` };
  }, [answers]);

  return (
    <div>
      <div className="page-head">
        <div className="eyebrow">Étape 2 / 4 · Plongeurs & palanquées</div>
        <h1>Constituer les palanquées</h1>
        <p>Glissez les plongeurs depuis l'annuaire vers les palanquées. Les règles du Code du Sport (annexes III-16a/b, III-17 b/c) sont vérifiées en temps réel.</p>
      </div>

      <Alert tone={dpQualOK.tone}>{dpQualOK.text}</Alert>

      <div className="divers-grid">
        {/* Annuaire (pool) */}
        <div className="diver-pool">
          <h4>Annuaire — {divers.length} plongeurs</h4>
          <input
            className="input small"
            type="text"
            placeholder="Rechercher (nom, niveau…)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {filteredPool.map(d => {
            const assigned = assignedIds.has(d.id);
            return (
              <div className={`diver-card ${assigned ? "assigned" : ""}`} key={d.id}>
                <div className="info">
                  <b>{diverFullName(d)}</b>
                  <small>{d.niveau} · {(d.qualifs || []).join(" / ") || "—"}</small>
                </div>
                {!assigned && palanquees.length > 0 && (
                  <select
                    className="role-sel"
                    onChange={(e) => {
                      if (e.target.value) addToPal(e.target.value, d.id);
                      e.target.value = "";
                    }}
                    value=""
                  >
                    <option value="">+ Ajouter à…</option>
                    {palanquees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          <button className="btn ghost" style={{ marginTop: 8, width: "100%" }}>+ Nouveau plongeur</button>
        </div>

        {/* Palanquées */}
        <div className="pal-list">
          {palanquees.map((p, idx) => {
            const issues = validatePal(p);
            return (
              <div className="pal" key={p.id}>
                <div className="pal-head">
                  <span className="num">{idx + 1}</span>
                  <input
                    className="input small"
                    style={{ flex: 1, fontWeight: 600 }}
                    value={p.nom}
                    onChange={(e) => setPalField(p.id, "nom", e.target.value)}
                  />
                  <div className="pal-actions">
                    <button className="btn ghost" onClick={() => removePal(p.id)}>×</button>
                  </div>
                </div>

                <div className="pal-params">
                  <div className="p">
                    <span>Prof. max</span>
                    <b>
                      <input className="input small num"
                        type="number" value={p.profMax}
                        onChange={(e) => setPalField(p.id, "profMax", parseFloat(e.target.value) || 0)} /> m
                    </b>
                  </div>
                  <div className="p">
                    <span>Durée</span>
                    <b>
                      <input className="input small num"
                        type="number" value={p.duree}
                        onChange={(e) => setPalField(p.id, "duree", parseFloat(e.target.value) || 0)} /> min
                    </b>
                  </div>
                  <div className="p">
                    <span>DTR</span>
                    <b>
                      <input className="input small num"
                        type="number" value={p.dtr}
                        onChange={(e) => setPalField(p.id, "dtr", parseFloat(e.target.value) || 0)} /> min
                    </b>
                  </div>
                  <div className="p">
                    <span>Mélange</span>
                    <b>
                      <select className="input small tight" value={p.melange}
                        onChange={(e) => setPalField(p.id, "melange", e.target.value)}>
                        <option>Air</option>
                        <option>EAN32</option>
                        <option>EAN36</option>
                        <option>Trimix</option>
                        <option>Héliox</option>
                      </select>
                    </b>
                  </div>
                </div>

                {p.membres.length === 0 && (
                  <div className="empty" style={{ padding: 18, fontSize: 13 }}>
                    Aucun plongeur. Ajoutez-en depuis l'annuaire.
                  </div>
                )}

                {p.membres.map(m => {
                  const d = getDiver(diversById, m.diverId);
                  return (
                    <div className="diver-row" key={m.diverId}>
                      <Pill tone="ink">{d.niveau || "?"}</Pill>
                      <div className="name">
                        <b>{diverFullName(d)}</b>
                        <small>{(d.qualifs || []).join(" / ") || "—"}</small>
                      </div>
                      <select className="role-sel"
                        value={m.role}
                        onChange={(e) => setRole(p.id, m.diverId, e.target.value)}>
                        {window.PAL_ROLES.map(r => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                      <button className="x" onClick={() => removeFromPal(p.id, m.diverId)} title="Retirer">×</button>
                    </div>
                  );
                })}

                <div className="val-list" style={{ marginTop: 10 }}>
                  {issues.map((v, i) => (
                    <div className={`v ${v.tone === "err" ? "err" : v.tone === "warn" ? "warn" : "ok"}`} key={i}>
                      <span className="tag">{v.tone === "err" ? "BLOQUANT" : v.tone === "warn" ? "ALERTE" : "OK"}</span>
                      <span>{v.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button className="pal-add" onClick={addPal}>+ Ajouter une palanquée</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenPalanquees });
