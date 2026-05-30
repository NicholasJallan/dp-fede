// DP Assistant — Formulaire plongeur partagé (création rapide depuis profil / palanquées)
// Reprend l'exact même UX que screen-admin-divers.jsx mais en mode modal compact.

const NIVEAUX_PLONGEUR_QUICK  = ['N1','N2','N3'];
const NIVEAUX_ENCADRANT_QUICK = ['N4','N5','E1','E2','E3','E4'];
const DIPLOMES_PRO_QUICK      = ['BEES1','DEJEPS','DESJEPS','Autre'];
const RECYCLEURS_QUICK        = ['Revo','AP','Triton','JJccr','Xccr','Megalodon','Shark','Submatix','Autre'];

const emptyDiverQuick = () => ({
  nom:'', prenom:'', licence:'',
  niveau_plongeur:'', niveau_encadrant:'',
  nitrox:[], trimix:[], recycleurs:[],
  diplome_pro:'', rifap:false, tiv:false,
  aptitudes_sup:[], medical:'', notes:'',
});

// ── Aptitudes (réutilisé de admin-divers) ─────────────────────────────────
function AptitudesGroupQuick({ form, setField }) {
  const np  = form.niveau_plongeur;
  const ne  = form.niveau_encadrant;
  if (!np && !ne) return null;

  const map = window.APTITUDE_MAP || {};
  const mandatory = new Set();
  const optional  = new Set();
  if (np && map[np]) {
    map[np].mandatory.forEach(a => mandatory.add(a));
    map[np].optional.forEach(a => optional.add(a));
  }
  if (ne && map[ne]) {
    map[ne].mandatory.forEach(a => mandatory.add(a));
    map[ne].optional.forEach(a => optional.add(a));
  }
  const allApts = [...mandatory, ...optional];
  if (allApts.length === 0) return null;

  const toggle = (a) => {
    if (mandatory.has(a)) return;
    const cur = form.aptitudes_sup || [];
    setField('aptitudes_sup', cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]);
  };
  const isOn = (a) => mandatory.has(a) || (form.aptitudes_sup || []).includes(a);

  return (
    <div className="field" style={{ marginTop:10 }}>
      <label>Aptitudes</label>
      <div className="qualifs-grid">
        {allApts.map(a => {
          const locked = mandatory.has(a);
          const on     = isOn(a);
          return (
            <label key={a} className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}
              title={locked ? 'Aptitude obligatoire pour ce niveau' : ''}>
              <input type="checkbox" checked={on} onChange={() => toggle(a)} disabled={locked} />
              {a}
            </label>
          );
        })}
      </div>
      <div className="field-hint">Les aptitudes grisées sont incluses de droit avec le niveau.</div>
    </div>
  );
}

// ── DiverQuickAdd ─────────────────────────────────────────────────────────
function DiverQuickAdd({ onCreated, onClose, initialName = '', allowBapteme = false, baptemeOnSave = null }) {
  const parts = initialName.trim().split(/\s+/);
  const [form, setForm] = useState(() => ({
    ...emptyDiverQuick(),
    prenom: parts.length > 1 ? parts[0] : initialName,
    nom:    parts.length > 1 ? parts.slice(1).join(' ') : '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isBapteme, setIsBapteme] = useState(false);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setNiveauEncadrant = (ne) => {
    setForm(f => ({
      ...f,
      niveau_encadrant: ne,
      niveau_plongeur: ne ? 'N3' : f.niveau_plongeur,
      rifap: ne ? true : f.rifap,
    }));
  };

  const setDiplomePro = (val) => {
    setForm(f => {
      let ne = f.niveau_encadrant;
      let nx = [...f.nitrox];
      if (val === 'DEJEPS') {
        if (!['E3','E4'].includes(ne)) ne = 'E3';
        if (!nx.includes('PN'))   nx.push('PN');
        if (!nx.includes('PN-C')) nx.push('PN-C');
      } else if (val === 'DESJEPS') {
        if (ne !== 'E4') ne = 'E4';
        if (!nx.includes('PN'))   nx.push('PN');
        if (!nx.includes('PN-C')) nx.push('PN-C');
      }
      return {
        ...f,
        diplome_pro: val,
        niveau_encadrant: ne,
        niveau_plongeur: ne ? 'N3' : f.niveau_plongeur,
        rifap: ne ? true : f.rifap,
        nitrox: nx,
      };
    });
  };

  const toggleNitrox = (val) => setForm(f => {
    let nx = [...f.nitrox];
    if (nx.includes(val)) {
      nx = nx.filter(x => x !== val);
      if (val === 'PN') nx = nx.filter(x => x !== 'PN-C');
    } else {
      nx.push(val);
      if (val === 'PN-C' && !nx.includes('PN')) nx.push('PN');
    }
    return { ...f, nitrox: nx };
  });

  const toggleTrimix = (val) => setForm(f => {
    let tx = [...f.trimix];
    if (tx.includes(val)) {
      tx = tx.filter(x => x !== val);
      if (val === 'PTH-70') tx = tx.filter(x => x !== 'PTH-120');
    } else {
      tx.push(val);
      if (val === 'PTH-120' && !tx.includes('PTH-70')) tx.push('PTH-70');
    }
    return { ...f, trimix: tx };
  });

  // PTH-70 / PTH-120 nécessitent PN-C + (N3 ou encadrant).
  const canHoldTrimix = form.nitrox.includes('PN-C')
    && (form.niveau_plongeur === 'N3' || !!form.niveau_encadrant);

  // Nettoyage automatique si les pré-requis disparaissent
  useEffect(() => {
    if (form.trimix.length > 0 && !canHoldTrimix) {
      setForm(f => ({ ...f, trimix: [] }));
    }
  }, [canHoldTrimix, form.trimix.length]);

  const toggleRecycleur = (val) => setForm(f => ({
    ...f,
    recycleurs: f.recycleurs.includes(val)
      ? f.recycleurs.filter(x => x !== val)
      : [...f.recycleurs, val],
  }));

  const onSave = async () => {
    if (!form.nom.trim() && !isBapteme) { setErr('Le nom est requis'); return; }
    if (isBapteme && !form.prenom.trim() && !form.nom.trim()) { setErr('Saisir au moins le prénom ou le nom du baptisé'); return; }
    if (!isBapteme && !form.medical) { setErr('La date du certificat médical est obligatoire'); return; }
    // Pas de niveau = licencié débutant (Baptême ou PE20 en formation uniquement).
    setErr('');
    setSaving(true);
    try {
      if (isBapteme && baptemeOnSave) {
        // Baptême : juste un objet local, pas d'ajout DB
        baptemeOnSave({
          id: 'bap-' + Math.random().toString(36).slice(2, 9),
          nom: form.nom || '?',
          prenom: form.prenom || '',
          niveau_plongeur: null,
          niveau_encadrant: null,
          aptitudes_sup: [],
          nitrox: [], trimix: [], recycleurs: [],
          medical: null,
          _bapteme: true,
        });
      } else {
        const payload = {
          ...form,
          diplome_pro: form.diplome_pro || null,
          niveau_plongeur: form.niveau_plongeur || null,
          niveau_encadrant: form.niveau_encadrant || null,
        };
        const d = await api.divers.create(payload);
        onCreated(d);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <h3>Nouveau plongeur — création rapide</h3>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <Alert tone="warn" style={{ marginBottom: 10 }}>{err}</Alert>}

          {allowBapteme && (
            <div className="field" style={{ marginBottom: 10 }}>
              <label className={`qualif-toggle ${isBapteme ? 'on' : ''}`} style={{ width: 'auto' }}>
                <input type="checkbox" checked={isBapteme} onChange={() => setIsBapteme(v => !v)} />
                Baptême (non enregistré dans l'annuaire)
              </label>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Prénom</label>
              <input className="input" value={form.prenom}
                onChange={e => setField('prenom', e.target.value)} />
            </div>
            <div className="field">
              <label>Nom {!isBapteme && '*'}</label>
              <input className="input" value={form.nom}
                onChange={e => setField('nom', e.target.value)} />
            </div>
          </div>

          {!isBapteme && (
            <>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Numéro de licence</label>
                <input className="input" value={form.licence}
                  onChange={e => setField('licence', e.target.value)}
                  placeholder="A-29-001234" style={{ fontFamily: 'var(--t-mono)' }} />
              </div>

              <hr />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Niveau plongeur</label>
                  <select className="input" value={form.niveau_plongeur}
                    onChange={e => setField('niveau_plongeur', e.target.value)}
                    disabled={!!form.niveau_encadrant}>
                    <option value="">— aucun —</option>
                    {NIVEAUX_PLONGEUR_QUICK.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {form.niveau_encadrant && <div className="field-hint">Forcé à N3 (niveau encadrant)</div>}
                </div>
                <div className="field">
                  <label>Niveau encadrant</label>
                  <select className="input" value={form.niveau_encadrant}
                    onChange={e => setNiveauEncadrant(e.target.value)}>
                    <option value="">— aucun —</option>
                    {NIVEAUX_ENCADRANT_QUICK.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <AptitudesGroupQuick form={form} setField={setField} />

              {!form.niveau_plongeur && !form.niveau_encadrant && (
                <div className="field-hint" style={{ marginTop:6, color:'var(--coral)' }}>
                  Sans niveau = licencié débutant — autorisé en Baptême ou PE20, uniquement
                  dans une palanquée de formation (avec un enseignant E1→E4).
                </div>
              )}

              <hr />

              <div className="qualif-section">
                <div className="qualif-section-label">Nitrox</div>
                <div className="qualif-row">
                  {['PN','PN-C'].map(q => {
                    const on = form.nitrox.includes(q);
                    const locked = q === 'PN' && form.nitrox.includes('PN-C');
                    return (
                      <label key={q} className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleNitrox(q)} disabled={locked} />
                        {q}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="qualif-section">
                <div className="qualif-section-label">Trimix / PTH</div>
                <div className="qualif-row">
                  {['PTH-70','PTH-120'].map(q => {
                    const on = form.trimix.includes(q);
                    const lockedByImpl = q === 'PTH-70' && form.trimix.includes('PTH-120');
                    const locked = lockedByImpl || !canHoldTrimix;
                    const reason = !canHoldTrimix
                      ? 'PTH-70 / PTH-120 requièrent PN-C et niveau N3 (ou encadrant)'
                      : (lockedByImpl ? 'PTH-70 implicite via PTH-120' : '');
                    return (
                      <label key={q}
                        className={`qualif-toggle ${on ? 'on' : ''} ${locked ? 'locked' : ''}`}
                        title={reason}>
                        <input type="checkbox" checked={on}
                          onChange={() => !locked && toggleTrimix(q)} disabled={locked} />
                        {q}
                      </label>
                    );
                  })}
                </div>
                {!canHoldTrimix && (
                  <div className="field-hint" style={{ marginTop:4 }}>
                    Trimix verrouillé : pré-requis = PN-C + niveau N3 (ou encadrant).
                  </div>
                )}
              </div>

              <div className="qualif-section">
                <div className="qualif-section-label">Recycleur</div>
                <div className="qualifs-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))' }}>
                  {RECYCLEURS_QUICK.map(q => {
                    const on = form.recycleurs.includes(q);
                    return (
                      <label key={q} className={`qualif-toggle ${on ? 'on' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleRecycleur(q)} />
                        {q}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div className="qualif-section">
                  <div className="qualif-section-label">Diplôme pro</div>
                  <select className="input" value={form.diplome_pro}
                    onChange={e => setDiplomePro(e.target.value)}>
                    <option value="">— aucun —</option>
                    {DIPLOMES_PRO_QUICK.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="qualif-section">
                  <div className="qualif-section-label">Autres</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[['rifap','RIFAP'],['tiv','TIV']].map(([k, label]) => (
                      <label key={k} className={`qualif-toggle ${form[k] ? 'on' : ''}`}>
                        <input type="checkbox" checked={!!form[k]}
                          onChange={() => setField(k, !form[k])} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <hr />

              <div className="field" style={{ marginTop: 10 }}>
                <label>Certificat médical (date d'émission) *</label>
                <input className="input" type="date" value={form.medical}
                  onChange={e => setField('medical', e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={onSave} disabled={saving}>
            {saving ? 'Enregistrement…' : (isBapteme ? 'Ajouter le baptême' : 'Créer le plongeur')}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DiverQuickAdd, AptitudesGroupQuick, emptyDiverQuick });
