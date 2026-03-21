# Projet Site Web — Tournai Expert Immo

## Infos générales
- **URL** : https://tournaiexpertimmo.be
- **Hébergement** : NAS Synology DS415 — IP `10.0.0.10` — Docker Compose
- **Container backend** : `tei-backend` (Node.js 18)
- **Container frontend** : `tei-nginx` (Nginx Alpine, port 8080)
- **Google Calendar** : `expertimmotournai@gmail.com`
- **Couleurs** : `#10212B` (fond dark) · `#C9D8DC` (fond light) · `#8FA464` (accent vert) · `#EFFBDB` (texte dark)

---

## Règle de travail — Workflow obligatoire

> **À respecter systématiquement pour chaque correction ou évolution :**

```
1. Claude corrige le bug / développe la fonctionnalité
2. Claude déploie sur le NAS et teste
3. Denis valide ("ok", "ça marche", etc.)
          ↓
4. Claude met à jour les fichiers locaux (PC)    ← OBLIGATOIRE
5. Claude commit + push sur GitHub               ← OBLIGATOIRE
```

**Aucune correction n'est considérée comme terminée tant que les fichiers PC et GitHub ne sont pas à jour.**

Chaque commit doit décrire clairement le bug corrigé ou la fonctionnalité ajoutée.

---

## Stack technique

| Couche | Techno |
|--------|--------|
| Frontend | HTML/CSS/JS vanilla — SPA 6 pages |
| Backend | Node.js 18 + Express |
| Base de données | SQLite via `better-sqlite3` |
| Agenda | Google Calendar API v3 (OAuth2) |
| Email | Gmail SMTP via Nodemailer + Gmail API (suppression) |
| Auth Google | OAuth2 — tokens stockés dans `backend/tokens.json` |
| Déploiement | Docker Compose + script `deploy.py` (paramiko SFTP+SSH) |

---

## Structure des fichiers

```
tournai-expert-immo/
├── backend/
│   ├── server.js          # Express — toutes les routes API
│   ├── db.js              # SQLite — schéma + prepared statements
│   ├── calendar.js        # Google Calendar — créneaux + événements
│   ├── mailer.js          # Emails HTML (4 types)
│   ├── gmail-trash.js     # Suppression email admin après action
│   ├── auth-setup.js      # Script one-time OAuth2 (génère tokens.json)
│   ├── tokens.json        # Tokens OAuth2 (NE PAS COMMITTER)
│   ├── .env               # Variables d'environnement (NE PAS COMMITTER)
│   ├── package.json
│   └── data/
│       └── appointments.db  # SQLite (créé automatiquement)
├── frontend/
│   ├── index.html         # SPA — 6 pages + modal booking 7 étapes
│   ├── main.js            # Navigation, thème dark/light, burger menu
│   ├── booking.js         # Wizard réservation (7 étapes) + appels API
│   ├── style.css          # Styles globaux
│   ├── booking.css        # Styles modal réservation
│   ├── logo.png
│   └── 19656.jpg          # Image hero (croquis architectural)
├── nginx/conf.d/
│   └── default.conf       # Reverse proxy + HTTPS redirect
├── docker-compose.yml
└── deploy.py              # Script déploiement NAS
```

---

## Variables d'environnement (`backend/.env`)

```env
# Google OAuth2
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_CALENDAR_ID=

# Gmail SMTP (mot de passe d'application Google)
GMAIL_USER=expertimmotournai@gmail.com
GMAIL_APP_PASS=

# App
BASE_URL=https://tournaiexpertimmo.be
PORT=3000
```

**Scopes OAuth2** (dans `auth-setup.js`) :
- `https://www.googleapis.com/auth/calendar`
- `https://mail.google.com/`

> Pour régénérer `tokens.json` : `node auth-setup.js` puis coller l'URL dans le navigateur.

---

## Base de données SQLite

**Fichier** : `backend/data/appointments.db`

**Table `appointments`** :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | Auto-incrément |
| `token` | TEXT UNIQUE | UUID — identifiant des liens confirm/reschedule |
| `status` | TEXT | `pending` · `confirmed` · `rejected` |
| `category` | TEXT | `expertise` · `etl` |
| `service` | TEXT | `avant_achat` · `entree` · `sortie` · `litige` … |
| `service_label` | TEXT | Libellé affiché |
| `property` | TEXT | `studio` · `appt_1ch` … |
| `property_label` | TEXT | Libellé affiché |
| `extras` | TEXT | JSON array ex: `["Meublé", "+2 ch."]` |
| `date` | TEXT | `YYYY-MM-DD` |
| `slot` | TEXT | `HH:MM` |
| `duration` | INTEGER | Minutes (30 ou 90) |
| `prenom` | TEXT | |
| `nom` | TEXT | |
| `email` | TEXT | |
| `telephone` | TEXT | |
| `adresse_bien` | TEXT | |
| `theme` | TEXT | `dark` · `light` (thème actif lors de la réservation) |
| `proprietaire` | TEXT | |
| `bailleur_prenom` | TEXT | |
| `bailleur_nom` | TEXT | |
| `bailleur_email` | TEXT | |
| `bailleur_telephone` | TEXT | |
| `gcal_event_id` | TEXT | ID événement Google Calendar (après confirmation) |
| `created_at` | DATETIME | |
| `confirmed_at` | DATETIME | |
| `rejected_at` | DATETIME | |

---

## Routes API (`backend/server.js`)

### Routes publiques

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/status` | Health check |
| GET | `/api/slots?date=YYYY-MM-DD&duration=30\|90` | Créneaux disponibles (Google Calendar) |
| POST | `/api/appointments` | Enregistre une demande + envoie email admin |
| GET | `/api/appointments/confirm/:token` | Confirme le RDV → Calendar + email client + supprime email admin |
| GET | `/api/appointments/reject/:token` | Refuse → email client + supprime email admin |
| GET | `/api/appointments/reschedule/:token` | Page calendrier interactif (admin) |
| POST | `/api/appointments/reschedule/:token` | Valide le nouveau créneau → Calendar + email client + supprime email admin |

---

## Flux de réservation complet

```
Client remplit le wizard (7 étapes)
          ↓
POST /api/appointments → SQLite (status: pending)
          ↓
sendAdminNotification → Email HTML à Denis
  [ref:TOKEN] dans le sujet (pour suppression Gmail)
  Boutons : ✓ Confirmer · ↺ Replanifier
          ↓
          Denis clique...

  ┌─ Confirmer ─────────────────────────────────┐
  │ GET /confirm/:token                          │
  │ → createCalendarEvent() → gcal_event_id      │
  │ → status = confirmed                         │
  │ → sendClientConfirmation() → client + bailleur│
  │ → trashAdminEmail() → supprime email Gmail   │
  │ → closePage() → onglet fermé                 │
  └──────────────────────────────────────────────┘

  ┌─ Replanifier ───────────────────────────────┐
  │ GET /reschedule/:token → calendrier admin    │
  │   Denis choisit nouvelle date + créneau      │
  │ POST /reschedule/:token                      │
  │ → rescheduleAppointment() → nouvelle date    │
  │ → createCalendarEvent() → gcal_event_id      │
  │ → status = confirmed                         │
  │ → trashAdminEmail() → supprime email Gmail   │
  │ → sendClientReschedule() → client + bailleur │
  │ → window.close() → onglet fermé             │
  └──────────────────────────────────────────────┘
```

---

## Google Calendar (`backend/calendar.js`)

- **Créneaux** : 10h00 → 14h00, incrément 30 min
- **Durées** : 30 min (expertise) ou 90 min (EDL)
- **Timezone** : `Europe/Brussels` (`+01:00`)
- **Vérification** : `freebusy.query()` → liste des plages occupées
- **Événement créé** :
  ```
  Titre : RDV — État des lieux d'entrée (Jean Dupont)
  Lieu  : adresse du bien
  Description :
    Prestation : ...
    Bien : ...
    Adresse du bien : ...

    Client : Prénom Nom
    Email : ...
    Tél. : ...

    Bailleur : Prénom Nom       ← si renseigné
    Email bailleur : ...
    Tél. bailleur : ...
  ```
- **Rappels** : email 24h avant, popup 1h avant

---

## Emails (`backend/mailer.js`)

| Fonction | Destinataire | Déclencheur |
|----------|-------------|-------------|
| `sendAdminNotification(appt)` | Denis (GMAIL_USER) | POST /api/appointments |
| `sendClientConfirmation(appt)` | client + bailleur | Clic "Confirmer" |
| `sendClientRejection(appt)` | client + bailleur | Clic "Refuser" |
| `sendClientReschedule(appt)` | client + bailleur | POST /reschedule |

**Thème** : les emails client utilisent `appt.theme` (capturé au moment de la soumission du formulaire) pour choisir dark `#10212B` ou light `#C9D8DC`.

**Sujet email admin** : `[ref:TOKEN] [RDV] État des lieux — Jean Dupont — 2026-03-21`
→ Le `[ref:TOKEN]` permet à `gmail-trash.js` de retrouver et supprimer l'email.

---

## Suppression email admin (`backend/gmail-trash.js`)

1. Recherche dans Gmail : `subject:"[ref:TOKEN]"` (includeSpamTrash: true)
2. Jusqu'à 5 tentatives espacées de 3s (indexation Gmail)
3. Suppression définitive (`messages.delete`, pas trash)
4. Appelé en background (non-bloquant) après confirmation ou replanification

---

## Page replanification (`GET /api/appointments/reschedule/:token`)

- Rendu HTML côté serveur (template inline dans server.js)
- Calendrier 6 semaines avec points de disponibilité (vert/rouge)
- Chargement parallèle des disponibilités de tous les jours
- Jours passés : cellules vides (invisibles)
- Dimanches : grisés uniquement
- Aujourd'hui : inclus avec boule de dispo
- Slots en grille 3 colonnes (pas de scroll sur mobile)
- Bouton "Valider ce créneau" fixe en bas (position:fixed)
- Soumission via `fetch POST` + `window.close()` après 800ms
- Cache-buster : redirect vers `?_v=Date.now()` si pas de `_v` (contourne le cache Gmail)

---

## Déploiement (`deploy.py`)

```bash
# Déploiement complet (git commit + push + NAS)
python deploy.py

# Backend seulement
python deploy.py --backend-only

# Frontend seulement
python deploy.py --frontend-only

# Sans git (NAS uniquement)
python deploy.py --no-git
```

**Workflow** :
1. `git add -A` + prompt message de commit (défaut : `"deploy"`)
2. `git commit` + `git push origin master`
3. Upload des fichiers sur le NAS via SSH/base64
4. `docker-compose restart backend` (+ `nginx -s reload` si frontend touché)

**Fichiers déployés** :
- `backend/` : server.js, db.js, mailer.js, calendar.js, gmail-trash.js, package.json
- `frontend/` : booking.js, index.html
- `nginx/conf.d/default.conf`

**Commande restart** :
```
echo Karmaa69 | sudo -S /usr/local/bin/docker-compose -f /volume1/docker/tournai-expert-immo/docker-compose.yml restart backend
```

**Chemin NAS** : `/volume1/docker/tournai-expert-immo/`
**Container** : `tei-backend`

---

## Sections du site (frontend)

| Page | ID | Contenu |
|------|----|---------|
| Accueil | `home` | Hero + présentation |
| À propos | `about` | Denis Latour |
| États des lieux | `etl` | Services EDL |
| Tarifs | `tarifs` | Grille tarifaire |
| Rendez-vous | `rdv` | Bouton ouverture booking |
| Contact | `contact` | Formulaire + coordonnées |

**Wizard réservation** (7 étapes dans `booking.js`) :
1. Catégorie (expertise / état des lieux)
2. Type de prestation
3. Type de bien + options
4. Sélection de date (calendrier)
5. Sélection du créneau
6. Formulaire client (+ bailleur si ETL)
7. Récapitulatif + confirmation

> **Note** : La section Expertises est **masquée** côté client (mobile + desktop) en attendant le lancement de cette offre.

---

## Points d'attention

- `tokens.json` : doit exister dans `backend/` sur le NAS. Si expiré → `node auth-setup.js`
- `appointments.db` : dans `backend/data/` — ne pas écraser lors du déploiement
- Le `deploy.py` utilise `base64` pour transférer les fichiers (contournement permissions SFTP)
- Migrations SQLite : pattern `try { db.exec(ALTER TABLE...) } catch(_) {}` dans `db.js`
- Thème capturé dans `booking.js` via `document.body.classList.contains('dark')`
