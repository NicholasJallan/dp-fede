# CLAUDE.md — DP Assistant

Outil d'aide au Directeur de Plongée (FFESSM / Code du Sport).
Application web standalone : React 18 + Babel CDN, zéro build, zéro dépendances.

## Lancer localement

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/DP%20Assistant.html
```

## Déployer sur le Raspberry Pi

Le Pi sert le site depuis `/var/www/html/dp-fede` via nginx.
Pas de git sur le Pi — déployer par rsync :

```bash
# Projet complet
rsync -av --rsync-path="sudo rsync" \
  --exclude='.git' \
  /Users/nicholas/projects/dpchecklist/ \
  pi@bullesenvalais.ch:/var/www/html/dp-fede/

# Toujours corriger les permissions après rsync
ssh pi@bullesenvalais.ch "sudo chown -R www-data:www-data /var/www/html/dp-fede"
```

> L'entrée nginx sert `index.html` (copie de `DP Assistant.html`).
> Après rsync, répliquer manuellement si `DP Assistant.html` a changé :
> `ssh pi@bullesenvalais.ch "sudo cp '/var/www/html/dp-fede/DP Assistant.html' /var/www/html/dp-fede/index.html && sudo chown www-data:www-data /var/www/html/dp-fede/index.html"`

Après modification de la config nginx :
```bash
ssh pi@bullesenvalais.ch "sudo nginx -t && sudo systemctl reload nginx"
```

## Accès

- **URL** : https://dp-fede.bullesenvalais.ch *(HTTPS actif une fois DNS + cert en place)*
- **SSH Pi** : `pi@bullesenvalais.ch`
- **Dossier web** : `/var/www/html/dp-fede/`
- **Config nginx** : `/etc/nginx/sites-available/bullesenvalais` (bloc `dp-fede` en bas du fichier)
- **GitHub** : https://github.com/NicholasJallan/dp-fede

## DNS à créer (requis pour HTTPS)

Ajouter chez le registrar / DNS provider :

| Nom | Type | Valeur |
|-----|------|--------|
| `dp-fede` | A | `213.230.59.20` |

Une fois le DNS propagé, relancer certbot pour étendre le certificat :

```bash
ssh pi@bullesenvalais.ch "sudo certbot certonly --webroot \
  -w /var/www/html/dive \
  --expand \
  -d bullesenvalais.ch \
  -d dive.bullesenvalais.ch \
  -d shop.bullesenvalais.ch \
  -d www.bullesenvalais.ch \
  -d dp-fede.bullesenvalais.ch \
  --non-interactive --agree-tos && sudo systemctl reload nginx"
```

## Architecture

Même stack que `bulles_en_valais/` (dive.bullesenvalais.ch) :
- React 18 + Babel Standalone depuis unpkg CDN (SRI hashes)
- JSX transpiré **dans le navigateur** à l'exécution
- Chaque fichier `.jsx` expose ses composants via `Object.assign(window, {...})`
- `data.js` contient toutes les règles métier — modifiable sans toucher au code

## Données métier

Tout est dans `data.js` (aucun build requis pour modifier) :
- `QUESTIONS` — 8 sections, questions conditionnelles
- `CHECKLIST_RULES` — 5 phases, items conditionnels
- `LEVELS` / `QUALIFICATIONS` — niveaux FFESSM et qualifs complémentaires
- `PAL_RULES` — règles de composition des palanquées
- `SEED_*` — données de démonstration
