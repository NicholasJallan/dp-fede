# Audit GCP — DP Assistant

Checklist à dérouler trimestriellement (ou avant toute mise en production
d'une nouvelle origine / sous-domaine).

GCP Project : `api-project-813155202106`
OAuth Client ID : `813155202106-jlddu3nmfuq552p9673odcegrf5kuke7.apps.googleusercontent.com`

---

## 1. OAuth Consent Screen

GCP Console → APIs & Services → OAuth consent screen

- [ ] **Publishing status** : `In production` (et non `Testing`)
- [ ] **User type** : `External`
- [ ] **App name** : `DP Assistant` (visible sur l'écran de consentement)
- [ ] **Support email** : `nicholas.jallan@gmail.com`
- [ ] **Domaine autorisé** : `bullesenvalais.ch`
- [ ] **Privacy policy URL** : présente
- [ ] **Terms of service URL** : présente
- [ ] **Scopes demandés** :
  - `openid`, `email`, `profile` (login)
  - `https://www.googleapis.com/auth/drive.file` (upload limité aux fichiers créés par l'app)
- [ ] **Scopes interdits** : `drive`, `drive.readonly`, `drive.metadata` — toute escalade doit être justifiée.

---

## 2. OAuth Client

GCP Console → APIs & Services → Credentials → OAuth 2.0 Client IDs

- [ ] **Authorized JavaScript origins** : `https://dp-fede.bullesenvalais.ch` UNIQUEMENT.
- [ ] **Authorized redirect URIs** : aucune si on n'utilise pas le flow code (front pure GIS).
- [ ] **Aucune origine `http://`** ni de sous-domaines de dev en prod.
- [ ] **Client secret** : absent (client public, pas de secret).

---

## 3. API Keys (Maps + Places)

GCP Console → APIs & Services → Credentials → API Keys

La clé visible dans `DP Assistant.html` (`AIzaSyCTMJRl4wywovs3dkkDMJgmhAsMsHofYCM`)
**doit** être restreinte. Vérifier :

- [ ] **Application restrictions** : `HTTP referrers (web sites)`
- [ ] **Referrer accepted** : `https://dp-fede.bullesenvalais.ch/*` UNIQUEMENT
- [ ] **API restrictions** : `Maps JavaScript API` + `Places API` (rien d'autre)
- [ ] **Quotas custom** : 1000 requêtes/jour max (alerte budget si dépassé)

Sans ces restrictions, n'importe quel site peut consommer le quota.

---

## 4. APIs activées

GCP Console → APIs & Services → Enabled APIs

Doit contenir EXACTEMENT :

- [ ] `Google Identity Services` (auto)
- [ ] `Google Drive API`
- [ ] `Maps JavaScript API`
- [ ] `Places API` (legacy ou New)

Désactiver toute API qui n'est plus utilisée (Geocoding, Calendar, etc.).

---

## 5. Quota & Budget

GCP Console → Billing → Budgets & alerts

- [ ] **Budget** : 5 €/mois (Maps + Places ont un free tier de 200 $/mois,
      tout dépassement → erreur de config)
- [ ] **Alertes** : 50%, 90%, 100% du budget par email
- [ ] **Drive API quota** : Drive API a un quota gratuit large (1 milliard de
      lecture/jour). Surveiller via Metrics si volumétrie inhabituelle.

---

## 6. Activité OAuth

GCP Console → APIs & Services → Credentials → OAuth client → API Activity

- [ ] **Erreurs récentes** : ratio `error/success` < 1 % sur 7 jours
- [ ] **Origines détectées** : que `dp-fede.bullesenvalais.ch`
- [ ] **Pas de requêtes anormales** (volume soudain × 10 → audit incident)

---

## 7. Logs d'accès

GCP Console → Logging → Logs Explorer
Filtre : `resource.type="oauth2_client"`

- [ ] **Logs activés** pour OAuth client
- [ ] **Rétention** : 30 jours minimum
- [ ] **Pas d'anomalie d'IP** (concentration en France + Suisse attendue)

---

## 8. Renouvellements

- Clé Maps : pas de rotation forcée (pas de secret) ; mais si compromission,
  régénérer dans GCP et republier `DP Assistant.html`.
- OAuth Client ID : idem, pas de rotation forcée, mais peut être rotaté en
  cas de besoin (impact : tous les utilisateurs doivent re-autoriser).
- JWKS Google : rotation automatique côté Google, cache APCu 6h côté backend
  (cf. `Auth::JWKS_CACHE_TTL`).

---

## 9. Réponse incident

Si compromission soupçonnée :

1. **GCP Console** → Credentials → Reset secret / Régénérer la clé.
2. **MariaDB** : `DELETE FROM sessions;` (invalide toutes les sessions actives).
3. **Tous les utilisateurs** doivent se reconnecter.
4. **Audit logs** Stackdriver des 7 derniers jours.
5. **Pi** : `tail -n 1000 /var/log/nginx/dp-fede.access.log` pour les IPs anormales.

---

## 10. Suivi

Date du dernier audit : `____________________`
Auditeur : `____________________`
Anomalies trouvées : `____________________`
