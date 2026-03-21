// ─── Tournai Expert Immo — Backend ──────────────────────────────
require('dotenv').config();

const express   = require('express');
const { v4: uuid } = require('uuid');
const db        = require('./db');
const calendar  = require('./calendar');
const mailer    = require('./mailer');
const gmailTrash = require('./gmail-trash');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Santé ──────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', message: 'Tournai Expert Immo API' });
});

// ─── GET /api/slots?date=YYYY-MM-DD&duration=30|90 ──────────────
// Retourne les créneaux disponibles pour une date donnée

app.get('/api/slots', async (req, res) => {
  const { date, duration } = req.query;

  // Validation
  if (!date || !duration) {
    return res.status(400).json({ error: 'Paramètres date et duration requis.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Format de date invalide. Attendu : YYYY-MM-DD' });
  }
  const dur = parseInt(duration, 10);
  if (![30, 90].includes(dur)) {
    return res.status(400).json({ error: 'Duration doit être 30 ou 90.' });
  }

  // Vérifier que la date n'est pas dans le passé
  const today = new Date();
  today.setHours(0,0,0,0);
  const requestedDate = new Date(date + 'T00:00:00');
  if (requestedDate < today) {
    return res.status(400).json({ error: 'La date est dans le passé.' });
  }

  try {
    const slots = await calendar.getAvailableSlots(date, dur);
    blockPendingSlots(slots, date, dur);
    res.json({ slots });
  } catch (err) {
    console.error('[/api/slots]', err.message);
    // En cas d'erreur Google Calendar, retourner tous les créneaux comme disponibles
    // (plutôt que bloquer complètement le service)
    const fallbackSlots = generateFallbackSlots(dur);
    blockPendingSlots(fallbackSlots, date, dur);
    res.json({ slots: fallbackSlots, warning: 'Disponibilités Google Calendar non vérifiées.' });
  }
});

// Marque comme indisponibles les créneaux qui chevauchent un RDV pending ou confirmed en DB
function blockPendingSlots(slots, date, requestedDuration) {
  const booked = db.getPendingOrConfirmedOnDate.all(date);
  if (!booked.length) return;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  slots.forEach(slot => {
    if (!slot.available) return;
    const sStart = toMin(slot.time);
    const sEnd   = sStart + requestedDuration;
    for (const b of booked) {
      const bStart = toMin(b.slot);
      const bEnd   = bStart + b.duration;
      // Chevauchement si les deux périodes se recouvrent
      if (sStart < bEnd && sEnd > bStart) { slot.available = false; break; }
    }
  });
}

function generateFallbackSlots(duration) {
  const slots = [];
  const endH = 13;
  let h = 8, m = 30;
  while (true) {
    const endMin = h * 60 + m + duration;
    if (endMin > endH * 60) break;
    slots.push({ time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, available: true });
    m += 90;
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  }
  return slots;
}

// ─── POST /api/appointments ──────────────────────────────────────
// Enregistre une demande et notifie l'admin

app.post('/api/appointments', async (req, res) => {
  const {
    category, service, service_label, property, property_label,
    extras, date, slot, duration,
    prenom, nom, email, telephone, adresse_bien,
    theme,
    bailleur_prenom, bailleur_nom, bailleur_email, bailleur_telephone,
  } = req.body;

  // Validation minimale
  const required = { category, service, property, date, slot, duration, prenom, nom, email, telephone, adresse_bien };
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants : ${missing.join(', ')}` });
  }

  // Validation email basique
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  const token = uuid();

  try {
    db.insertAppointment.run({
      token,
      category,
      service,
      service_label:  service_label  || service,
      property,
      property_label: property_label || property,
      extras:         JSON.stringify(Array.isArray(extras) ? extras : []),
      date,
      slot,
      duration:       parseInt(duration, 10),
      prenom,
      nom,
      email,
      telephone,
      adresse_bien,
      theme:              theme === 'light' ? 'light' : 'dark',
      bailleur_prenom:    bailleur_prenom    || '',
      bailleur_nom:       bailleur_nom       || '',
      bailleur_email:     bailleur_email     || '',
      bailleur_telephone: bailleur_telephone || '',
    });

    // Notification à l'admin (async, ne bloque pas la réponse si ça échoue)
    const appt = db.getByToken.get(token);
    mailer.sendAdminNotification(appt).catch(err =>
      console.error('[mailer] Notification admin:', err.message)
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[/api/appointments POST]', err.message);
    res.status(500).json({ error: 'Erreur interne. Veuillez réessayer.' });
  }
});

// ─── GET /api/appointments/confirm/:token ────────────────────────
// Lien cliqué par l'admin dans l'email de notification

app.get('/api/appointments/confirm/:token', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);

  if (!appt) {
    return res.status(404).send(htmlPage('Introuvable',
      'Ce lien de confirmation est invalide ou a déjà été utilisé.'));
  }
  if (appt.status !== 'pending') {
    return res.send(htmlPage('Déjà traité',
      `Ce rendez-vous a déjà été <strong>${appt.status === 'confirmed' ? 'confirmé' : 'refusé'}</strong>.`));
  }

  try {
    // Créer l'événement dans Google Calendar
    let gcalId = null;
    try {
      gcalId = await calendar.createCalendarEvent(appt);
    } catch (err) {
      console.error('[calendar] Création événement:', err.message);
      // On continue même si Google Calendar échoue
    }

    db.confirmAppointment.run(gcalId, appt.token);

    // Envoyer la confirmation au client
    await mailer.sendClientConfirmation(appt);

    // Supprimer l'email admin de la boîte Gmail (non-bloquant)
    gmailTrash.trashAdminEmail(appt.token).catch(() => {});

    res.send(closePage());
  } catch (err) {
    console.error('[/confirm]', err.message);
    res.status(500).send(htmlPage('Erreur', 'Une erreur est survenue. ' + err.message));
  }
});

// ─── GET /api/appointments/reject/:token ─────────────────────────
// Lien cliqué par l'admin pour refuser

app.get('/api/appointments/reject/:token', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);

  if (!appt) {
    return res.status(404).send(htmlPage('Introuvable',
      'Ce lien de refus est invalide ou a déjà été utilisé.'));
  }
  if (appt.status !== 'pending') {
    return res.send(htmlPage('Déjà traité',
      `Ce rendez-vous a déjà été <strong>${appt.status === 'confirmed' ? 'confirmé' : 'refusé'}</strong>.`));
  }

  try {
    db.rejectAppointment.run(appt.token);
    await mailer.sendClientRejection(appt);

    // Supprimer l'email admin de la boîte Gmail (non-bloquant)
    gmailTrash.trashAdminEmail(appt.token).catch(() => {});

    res.send(closePage());
  } catch (err) {
    console.error('[/reject]', err.message);
    res.status(500).send(htmlPage('Erreur', 'Une erreur est survenue. ' + err.message));
  }
});

// ─── GET /api/appointments/reschedule/:token ──────────────────────
// Page de replanification — calendrier interactif pour l'admin

app.get('/api/appointments/reschedule/:token', (req, res) => {
  // Forcer une URL unique pour contourner le cache du navigateur Gmail
  if (!req.query._v) {
    return res.redirect(302, `/api/appointments/reschedule/${req.params.token}?_v=${Date.now()}`);
  }

  const appt = db.getByToken.get(req.params.token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Ce lien est invalide.'));
  if (appt.status !== 'pending') return res.send(htmlPage('Déjà traité',
    `Ce rendez-vous a déjà été <strong>${appt.status === 'confirmed' ? 'confirmé' : 'replanifié'}</strong>.`));

  const currentDateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  res.set('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Replanifier — Tournai Expert Immo</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;background:#10212B;color:#EFFBDB;min-height:100vh;padding:32px 20px}
    .wrap{max-width:600px;margin:0 auto}
    h1{font-size:1.6rem;font-weight:300;letter-spacing:-.02em;margin:0 0 8px}
    .sub{font-family:monospace;font-size:.6rem;letter-spacing:.15em;text-transform:uppercase;color:#8FA464;margin-bottom:28px}
    .info{border:1px solid rgba(143,164,100,.2);padding:20px;margin-bottom:28px}
    .info-row{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(143,164,100,.1);font-size:.9rem;font-weight:300}
    .info-row:last-child{border-bottom:none}
    .lbl{font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:#8FA464;width:110px;flex-shrink:0;padding-top:3px}
    .section-title{font-family:monospace;font-size:.6rem;letter-spacing:.15em;text-transform:uppercase;color:#8FA464;margin-bottom:14px}
    .cal-wrap{margin-bottom:24px}
    .cal-header-row{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:4px}
    .cal-hd{font-family:monospace;font-size:.5rem;text-transform:uppercase;letter-spacing:.08em;text-align:center;color:rgba(239,251,219,.35);padding:4px 0}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
    .cal-day{padding:6px 4px 4px;text-align:center;font-size:.85rem;font-weight:300;cursor:pointer;border:1px solid transparent;transition:border-color .2s;display:flex;flex-direction:column;align-items:center;gap:3px}
    .cal-day:hover:not(.disabled){border-color:rgba(143,164,100,.4)}
    .cal-day.selected{background:#8FA464;color:#10212B}
    .cal-day.disabled{opacity:.2;cursor:default}
    .cal-day.today{border-color:#e05555 !important}
    .cal-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .cal-dot.green{background:#5cb85c}
    .cal-dot.red{background:#e05555}
    .slots-wrap{margin-bottom:80px;min-height:40px}
    .slots-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .slot{font-family:monospace;font-size:.8rem;padding:10px 4px;border:1px solid rgba(143,164,100,.3);background:none;color:#EFFBDB;cursor:pointer;transition:background .15s;text-align:center}
    .slot:hover:not(.busy){background:rgba(143,164,100,.15)}
    .slot.selected{background:#8FA464;color:#10212B;border-color:#8FA464}
    .slot.busy{opacity:.2;cursor:default;text-decoration:line-through}
    .loading{font-family:monospace;font-size:.6rem;color:rgba(239,251,219,.4)}
    .btn-submit{font-family:monospace;font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;padding:16px 0;background:#8FA464;color:#10212B;border:none;cursor:pointer;display:none;position:fixed;bottom:0;left:0;right:0;width:100%;text-align:center}
    .btn-submit.show{display:block}
    @media(prefers-color-scheme:light){
      body{background:#C9D8DC;color:#10212B}
      .slot{color:#10212B}
      .slot.selected{color:#10212B}
    }
  </style>
</head>
<body>
<div class="wrap">
  <div class="sub">Tournai Expert Immo — Replanifier</div>
  <h1>Choisir un nouveau<br>créneau</h1>
  <div class="info">
    <div class="info-row"><span class="lbl">Client</span>${appt.prenom} ${appt.nom}</div>
    <div class="info-row"><span class="lbl">Prestation</span>${appt.service_label}</div>
    <div class="info-row"><span class="lbl">Adresse</span>${appt.adresse_bien}</div>
    <div class="info-row"><span class="lbl">Créneau actuel</span>${currentDateFr} à ${appt.slot}</div>
  </div>

  <div class="cal-wrap">
    <div class="section-title" id="cal-month"></div>
    <div class="cal-header-row">
      <div class="cal-hd">Lun</div><div class="cal-hd">Mar</div><div class="cal-hd">Mer</div>
      <div class="cal-hd">Jeu</div><div class="cal-hd">Ven</div><div class="cal-hd">Sam</div>
      <div class="cal-hd">Dim</div>
    </div>
    <div class="cal-grid" id="cal-grid"></div>
  </div>

  <div class="slots-wrap" id="slots-wrap" style="display:none">
    <div class="section-title" id="slots-title"></div>
    <div class="slots-grid" id="slots-grid"></div>
  </div>

  <button class="btn-submit" id="btn-submit" onclick="submitReschedule()">Valider ce créneau</button>
</div>
<script>
  const DURATION = ${appt.duration};
  let selDate = null, selSlot = null;

  function buildCal() {
    const grid = document.getElementById('cal-grid');
    const today = new Date(); today.setHours(0,0,0,0);

    // Démarrer au lundi de la semaine courante
    const start = new Date(today);
    const dow = start.getDay() || 7;
    if (dow !== 1) start.setDate(start.getDate() - (dow - 1));

    const mo = today.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
    document.getElementById('cal-month').textContent = mo.charAt(0).toUpperCase() + mo.slice(1);

    const futureDates = [];
    const elMap = {};

    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const el = document.createElement('div');
      el.className = 'cal-day';

      const isToday = d.getTime() === today.getTime();
      const isPast  = d < today;   // strictement avant aujourd'hui
      const isSun   = d.getDay() === 0;

      if (isPast) {
        // Cellule vide — pas de numéro, pas de boule, pas d'interaction
        el.style.visibility = 'hidden';
      } else if (isSun) {
        // Dimanche : numéro visible mais grisé, non cliquable
        const num = document.createElement('span');
        num.textContent = d.getDate();
        el.appendChild(num);
        el.classList.add('disabled');
      } else {
        // Aujourd'hui ou jour futur (lundi→samedi) : cliquable + boule de dispo
        const num = document.createElement('span');
        num.textContent = d.getDate();
        el.appendChild(num);

        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        el.appendChild(dot);

        if (isToday) el.classList.add('today');

        const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        el.dataset.date = ds;
        el.addEventListener('click', () => pickDate(el, ds, d));
        futureDates.push(ds);
        elMap[ds] = dot;
      }
      grid.appendChild(el);
    }

    // Charger la disponibilité de tous les jours en parallèle
    futureDates.forEach(ds => {
      fetch('/api/slots?date=' + ds + '&duration=' + DURATION)
        .then(r => r.json())
        .then(data => {
          const slots = data.slots || data;
          const hasAvail = slots.some(s => s.available);
          const dot = elMap[ds];
          if (dot) dot.classList.add(hasAvail ? 'green' : 'red');
        })
        .catch(() => {
          // En cas d'erreur API, afficher rouge (prudence = indisponible)
          const dot = elMap[ds];
          if (dot) dot.classList.add('red');
        });
    });
  }

  function pickDate(el, ds, d) {
    document.querySelectorAll('.cal-day').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected');
    selDate = ds; selSlot = null;
    document.getElementById('btn-submit').classList.remove('show');
    const title = d.toLocaleDateString('fr-BE', { weekday:'long', day:'numeric', month:'long' });
    document.getElementById('slots-title').textContent = title.charAt(0).toUpperCase() + title.slice(1);
    const sw = document.getElementById('slots-wrap');
    sw.style.display = 'block';
    document.getElementById('slots-grid').innerHTML = '<span class="loading">Chargement…</span>';
    fetch('/api/slots?date=' + ds + '&duration=' + DURATION)
      .then(r => r.json()).then(data => {
        const slots = data.slots || data;
        const g = document.getElementById('slots-grid');
        g.innerHTML = '';
        slots.forEach(s => {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = s.time;
          b.className = 'slot' + (s.available ? '' : ' busy');
          if (s.available) b.addEventListener('click', () => pickSlot(b, s.time));
          g.appendChild(b);
        });
        // Auto-scroll vers les créneaux sur mobile
        document.getElementById('slots-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
  }

  function pickSlot(btn, time) {
    document.querySelectorAll('.slot').forEach(x => x.classList.remove('selected'));
    btn.classList.add('selected');
    selSlot = time;
    document.getElementById('btn-submit').classList.add('show');
  }

  buildCal();

  async function submitReschedule() {
    if (!selDate || !selSlot) return;
    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
      const res = await fetch('/api/appointments/reschedule/${appt.token}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selDate, slot: selSlot }),
      });
      if (res.ok) {
        btn.textContent = '✓ Replanifié';
        // Retour à Gmail comme pour la confirmation
        setTimeout(() => {
          if (!window.close()) history.go(-(history.length));
          window.close();
        }, 800);
      } else {
        btn.textContent = 'Erreur — réessayez';
        btn.disabled = false;
      }
    } catch(e) {
      btn.textContent = 'Erreur réseau';
      btn.disabled = false;
    }
  }
</script>
</body></html>`);
});

// ─── POST /api/appointments/reschedule/:token ─────────────────────
// Valide le nouveau créneau choisi par l'admin

app.post('/api/appointments/reschedule/:token', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Lien invalide.'));
  if (appt.status !== 'pending') return res.send(closePage());

  const { date, slot } = req.body;
  if (!date || !slot) return res.status(400).send(htmlPage('Erreur', 'Date ou créneau manquant.'));

  try {
    // Créer l'événement Google Calendar (comme pour une confirmation)
    let gcalId = appt.gcal_event_id || null;
    try {
      if (gcalId) {
        await calendar.updateCalendarEvent(gcalId, { ...appt, date, slot });
      } else {
        gcalId = await calendar.createCalendarEvent({ ...appt, date, slot });
      }
    } catch (e) { console.error('[reschedule] gcal:', e.message); }

    // Mettre à jour la DB : nouveau créneau + confirmer le RDV
    db.rescheduleAppointment.run({ date, slot, token: appt.token });
    db.confirmAppointment.run(gcalId, appt.token);

    // Supprimer l'email admin dès maintenant (avant sendClientReschedule pour éviter
    // toute interférence Gmail entre l'envoi SMTP et la recherche API)
    gmailTrash.trashAdminEmail(appt.token).catch(() => {});

    // Envoyer email au client avec le nouveau créneau
    await mailer.sendClientReschedule({ ...appt, date, slot });

    res.send(closePage());
  } catch (err) {
    console.error('[/reschedule]', err.message);
    res.status(500).send(htmlPage('Erreur', err.message));
  }
});

// ─── Page auto-fermeture (succès confirm/reject admin) ───────────
// Ferme l'onglet immédiatement — retourne à Gmail sans rien afficher.

function closePage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OK</title>
  <style>
    body { font-family: Georgia, serif; background: #10212B; color: #EFFBDB;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; }
    p { font-family: monospace; font-size: .65rem; letter-spacing: .15em;
        text-transform: uppercase; color: #8FA464; }
    @media (prefers-color-scheme: light) {
      body { background: #C9D8DC; }
    }
  </style>
</head>
<body>
  <p>✓ Traité</p>
  <script>window.close();</script>
</body>
</html>`;
}

// ─── Page HTML simple pour les réponses admin ────────────────────

function htmlPage(title, message) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5;url=https://tournaiexpertimmo.be">
  <title>${title} — Tournai Expert Immo</title>
  <style>
    body { font-family: Georgia, serif; background: #10212B; color: #EFFBDB;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; padding: 2rem; box-sizing: border-box; }
    .box { max-width: 480px; width: 100%; }
    .label { font-family: monospace; font-size: .6rem; letter-spacing: .2em;
             text-transform: uppercase; color: #8FA464; margin-bottom: 1rem; }
    h1 { font-size: 2rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 1.5rem; }
    p { font-size: 1rem; font-weight: 300; line-height: 1.8; color: rgba(239,251,219,.7); }
    .redirect { font-family: monospace; font-size: .6rem; letter-spacing: .1em;
                text-transform: uppercase; color: rgba(239,251,219,.35); margin-top: 2rem; }
    @media (prefers-color-scheme: light) {
      body { background: #C9D8DC; color: #10212B; }
      p { color: rgba(16,33,43,.65); }
      .redirect { color: rgba(16,33,43,.35); }
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="label">Tournai Expert Immo</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="redirect">Redirection automatique dans 5 secondes…</div>
  </div>
</body>
</html>`;
}

// ─── Démarrage ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[TEI] Backend démarré sur le port ${PORT}`);
});
