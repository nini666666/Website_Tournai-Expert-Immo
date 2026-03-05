// ─── Tournai Expert Immo — Backend ──────────────────────────────
require('dotenv').config();

const express   = require('express');
const { v4: uuid } = require('uuid');
const db        = require('./db');
const calendar  = require('./calendar');
const mailer    = require('./mailer');

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
    res.json({ slots });
  } catch (err) {
    console.error('[/api/slots]', err.message);
    // En cas d'erreur Google Calendar, retourner tous les créneaux comme disponibles
    // (plutôt que bloquer complètement le service)
    const fallbackSlots = generateFallbackSlots(dur);
    res.json({ slots: fallbackSlots, warning: 'Disponibilités Google Calendar non vérifiées.' });
  }
});

function generateFallbackSlots(duration) {
  const slots = [];
  const endH = 14;
  let h = 10, m = 0;
  while (true) {
    const endMin = h * 60 + m + duration;
    if (endMin > endH * 60) break;
    slots.push({ time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, available: true });
    m += 30;
    if (m >= 60) { h++; m -= 60; }
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

    res.send(htmlPage('Rendez-vous confirmé ✓',
      `Le rendez-vous de <strong>${appt.prenom} ${appt.nom}</strong> le <strong>${appt.date}</strong> à <strong>${appt.slot}</strong> a été confirmé.<br>Un email de confirmation a été envoyé au client.`));
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

    res.send(htmlPage('Rendez-vous refusé',
      `La demande de <strong>${appt.prenom} ${appt.nom}</strong> a été refusée.<br>Un email d'information a été envoyé au client.`));
  } catch (err) {
    console.error('[/reject]', err.message);
    res.status(500).send(htmlPage('Erreur', 'Une erreur est survenue. ' + err.message));
  }
});

// ─── Page HTML simple pour les réponses admin ────────────────────

function htmlPage(title, message) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
    a { color: #8FA464; text-decoration: none; font-family: monospace; font-size: .7rem;
        letter-spacing: .1em; text-transform: uppercase; display: inline-block; margin-top: 2rem;
        border-bottom: 1px solid #8FA464; padding-bottom: 2px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="label">Tournai Expert Immo</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="http://tournaiexpertimmo.be">← Retour au site</a>
  </div>
</body>
</html>`;
}

// ─── Démarrage ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[TEI] Backend démarré sur le port ${PORT}`);
});
