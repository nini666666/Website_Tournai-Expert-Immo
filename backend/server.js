// ─── Tournai Expert Immo — Backend ──────────────────────────────
require('dotenv').config();

const express     = require('express');
const rateLimit   = require('express-rate-limit');
const { v4: uuid } = require('uuid');

const db        = require('./db');
const calendar  = require('./calendar');
const mailer    = require('./mailer');
const mollie    = require('./mollie');
const { requireAuth, handleLogin, seedAdmin } = require('./auth');
const scheduler = require('./scheduler');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Rate limiting ────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 5,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 min
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ─── Santé ───────────────────────────────────────────────────────

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', message: 'Tournai Expert Immo API', version: '2.0.0' });
});

// ─── GET /api/slots ───────────────────────────────────────────────

app.get('/api/slots', async (req, res) => {
  const { date, duration } = req.query;

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedDate = new Date(date + 'T00:00:00');
  if (requestedDate < today) {
    return res.status(400).json({ error: 'La date est dans le passé.' });
  }

  try {
    let slots = await calendar.getAvailableSlots(date, dur);

    // Vérifier les créneaux bloqués en admin
    const blocked = db.getBlockedForDate.all(date);
    const dayBlocked = blocked.some(b => b.slot === null);

    if (dayBlocked) {
      slots = slots.map(s => ({ ...s, available: false }));
    } else {
      const blockedTimes = new Set(blocked.map(b => b.slot));
      // Vérifier les RDV existants confirmés / en attente de confirmation
      const existing = db.getConfirmedOnDate.all(date);
      slots = slots.map(s => {
        if (blockedTimes.has(s.time)) return { ...s, available: false };
        const sMin = toMin(s.time);
        const conflict = existing.some(e => {
          const eMin = toMin(e.slot);
          return sMin < eMin + e.duration && sMin + dur > eMin;
        });
        return conflict ? { ...s, available: false } : s;
      });
    }

    res.json({ slots });
  } catch (err) {
    console.error('[/api/slots]', err.message);
    const fallback = generateFallbackSlots(dur);
    // Appliquer quand même les blocages DB sur le fallback
    const blocked  = db.getBlockedForDate.all(date);
    const dayBlocked = blocked.some(b => b.slot === null);
    const blockedTimes = new Set(blocked.map(b => b.slot));
    const existing = db.getConfirmedOnDate.all(date);
    const slots = dayBlocked ? fallback.map(s => ({ ...s, available: false })) : fallback.map(s => {
      if (blockedTimes.has(s.time)) return { ...s, available: false };
      const sMin = toMin(s.time);
      const conflict = existing.some(e => {
        const eMin = toMin(e.slot);
        return sMin < eMin + e.duration && sMin + dur > eMin;
      });
      return conflict ? { ...s, available: false } : s;
    });
    res.json({ slots, warning: 'Disponibilités Google Calendar non vérifiées.' });
  }
});

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function generateFallbackSlots(duration) {
  const slots = [];
  const endH = 14;
  let h = 10, m = 0;
  while (true) {
    const endMin = h * 60 + m + duration;
    if (endMin > endH * 60) break;
    slots.push({ time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, available: true });
    m += 30;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

// ─── POST /api/appointments ───────────────────────────────────────

app.post('/api/appointments', async (req, res) => {
  const {
    category, service, service_label, property, property_label,
    extras, date, slot, duration,
    prenom, nom, email, telephone, adresse_bien,
  } = req.body;

  // Validation
  const required = { category, service, property, date, slot, duration, prenom, nom, email, telephone, adresse_bien };
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return res.status(400).json({ error: `Champs manquants : ${missing.join(', ')}` });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  // Règle : paiement impossible si RDV dans moins de 5 jours
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const rdvDate = new Date(date + 'T00:00:00');
  const diffDays = Math.ceil((rdvDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 5 && property !== 'devis') {
    return res.status(400).json({
      error: 'Ce rendez-vous est trop proche. Veuillez nous appeler directement au +32 473/58.98.91.',
      call_required: true,
    });
  }

  const token = uuid();

  // Calculer le montant
  const extrasArr = Array.isArray(extras) ? extras : [];
  let amount = 0;
  let isDevis = property === 'devis';

  if (!isDevis) {
    const price = db.getPrice.get(service, property);
    if (price) {
      amount = price.base_eur;
      if (extrasArr.some(e => e.toLowerCase().includes('meublé'))) amount += price.extra_meuble;
      const extraPieces = extrasArr.find(e => e.match(/\+\d+/));
      if (extraPieces) {
        const n = parseInt(extraPieces.match(/\d+/)[0], 10);
        amount += n * price.extra_piece;
      }
    }
  }

  // Upsert client
  db.upsertClient.run({ email, prenom, nom, telephone });
  const clientRecord = db.getClientByEmail.get(email);
  const clientId = clientRecord ? clientRecord.id : null;

  // Date d'expiration paiement = date RDV - 5 jours
  const payExpiry = new Date(rdvDate);
  payExpiry.setDate(payExpiry.getDate() - 5);
  const payExpiryStr = payExpiry.toISOString().split('T')[0];

  try {
    let mollieId   = null;
    let paymentUrl = null;
    let status     = isDevis ? 'pending' : 'pending_payment';

    if (!isDevis && amount > 0) {
      const payment = await mollie.createPayment({
        token,
        amount,
        description: `Tournai Expert Immo — ${service_label} (${prenom} ${nom})`,
        metadata: { token, email, service, property },
      });
      mollieId   = payment.id;
      paymentUrl = payment.checkoutUrl;
    }

    db.insertAppointment.run({
      token,
      status,
      category,
      service,
      service_label:  service_label  || service,
      property,
      property_label: property_label || property,
      extras:         JSON.stringify(extrasArr),
      date,
      slot,
      duration:       parseInt(duration, 10),
      prenom,
      nom,
      email,
      telephone,
      adresse_bien,
      amount_eur:          amount,
      mollie_payment_id:   mollieId,
      payment_url:         paymentUrl,
      payment_expires_at:  payExpiryStr,
      client_id:           clientId,
    });

    const appt = db.getByToken.get(token);

    if (isDevis || amount === 0) {
      // Flux devis : notification admin immédiate (ancien comportement)
      mailer.sendAdminNotification(appt).catch(err =>
        console.error('[mailer] Notification admin devis:', err.message)
      );
      return res.json({ success: true, token, is_devis: true });
    }

    // Flux paiement : envoyer email avec lien de paiement au client
    mailer.sendPaymentRequest(appt).catch(err =>
      console.error('[mailer] Email paiement client:', err.message)
    );

    res.json({ success: true, token, payment_url: paymentUrl, amount_eur: amount });

  } catch (err) {
    console.error('[/api/appointments POST]', err.message);
    res.status(500).json({ error: 'Erreur interne. Veuillez réessayer.' });
  }
});

// ─── POST /api/payments/webhook ───────────────────────────────────
// Appelé par Mollie après paiement

app.post('/api/payments/webhook', async (req, res) => {
  // Mollie envoie id en form-urlencoded
  const paymentId = req.body.id;
  if (!paymentId) return res.status(400).send('Missing id');

  try {
    const payment = await mollie.getPayment(paymentId);
    const appt    = db.getByMollieId.get(paymentId);

    if (!appt) {
      console.warn('[webhook] Appointment introuvable pour Mollie ID:', paymentId);
      return res.status(200).send('ok'); // Toujours 200 pour Mollie
    }

    if (payment.status === 'paid' && appt.status === 'pending_payment') {
      db.markPaid.run(paymentId, appt.token);
      const updated = db.getByToken.get(appt.token);

      // Notification admin avec liens confirmer/refuser
      mailer.sendAdminNotification(updated).catch(err =>
        console.error('[mailer] Notification admin après paiement:', err.message)
      );

      // Accusé de réception au client
      mailer.sendPaymentConfirmed(updated).catch(err =>
        console.error('[mailer] Email paiement confirmé client:', err.message)
      );
    } else if (['failed', 'expired', 'canceled'].includes(payment.status)) {
      if (appt.status === 'pending_payment') {
        db.expireAppointment.run(appt.token);
        mailer.sendPaymentFailed(appt).catch(err =>
          console.error('[mailer] Email paiement échoué:', err.message)
        );
      }
    }

    res.status(200).send('ok');
  } catch (err) {
    console.error('[webhook]', err.message);
    res.status(500).send('error');
  }
});

// ─── GET /api/appointments/return ─────────────────────────────────
// Page de retour après paiement Mollie

app.get('/api/appointments/return', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send(htmlPage('Erreur', 'Lien invalide.'));

  const appt = db.getByToken.get(token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Référence introuvable.'));

  const msg = appt.status === 'awaiting_confirmation'
    ? 'Votre paiement a bien été reçu. Votre demande de rendez-vous est en cours de validation. Vous recevrez un email de confirmation dans les plus brefs délais.'
    : 'Votre paiement est en cours de traitement. Vous recevrez un email de confirmation.';

  res.send(htmlPage('Merci !', msg));
});

// ─── Annulation client ────────────────────────────────────────────

app.get('/api/appointments/:token/cancel', (req, res) => {
  const appt = db.getByToken.get(req.params.token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Lien invalide.'));
  if (!['confirmed', 'awaiting_confirmation'].includes(appt.status)) {
    return res.send(htmlPage('Déjà traité', 'Ce rendez-vous a déjà été annulé ou est terminé.'));
  }

  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const rdvDate = new Date(appt.date + 'T00:00:00');
  const diffDays = Math.ceil((rdvDate - today) / (1000 * 60 * 60 * 24));
  const dateFr  = rdvDate.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (diffDays <= 7) {
    return res.send(htmlPage(
      'Annulation impossible',
      `Le délai de 7 jours pour annuler est dépassé (rendez-vous le <strong>${dateFr}</strong>).<br><br>Pour toute demande, contactez-nous :<br><strong>+32 473/58.98.91</strong><br>expertimmotournai@gmail.com`
    ));
  }

  // Page de confirmation d'annulation
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Annuler le rendez-vous — Tournai Expert Immo</title>
<style>
  body{font-family:Georgia,serif;background:#10212B;color:#EFFBDB;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;box-sizing:border-box}
  .box{max-width:480px;width:100%}
  .label{font-family:monospace;font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:#8FA464;margin-bottom:1rem}
  h1{font-size:2rem;font-weight:300;letter-spacing:-.02em;margin:0 0 1rem}
  p{font-size:1rem;font-weight:300;line-height:1.8;color:rgba(239,251,219,.7)}
  .btn{display:inline-block;padding:14px 28px;font-family:monospace;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;cursor:pointer;border:none;margin-top:1.5rem;margin-right:1rem}
  .btn-confirm{background:#c0392b;color:#fff}
  .btn-cancel{background:transparent;color:#EFFBDB;border:1px solid rgba(239,251,219,.3)}
</style></head>
<body>
<div class="box">
  <div class="label">Tournai Expert Immo</div>
  <h1>Annuler le rendez-vous</h1>
  <p>Êtes-vous certain de vouloir annuler votre rendez-vous du <strong>${dateFr} à ${appt.slot}</strong> (${appt.service_label}) ?</p>
  <p>Cette action est irréversible. Aucun remboursement automatique n'est effectué — contactez-nous si besoin.</p>
  <form method="POST" action="/api/appointments/${appt.token}/cancel">
    <button class="btn btn-confirm" type="submit">Confirmer l'annulation</button>
    <a class="btn btn-cancel" href="https://tournaiexpertimmo.be">Garder le rendez-vous</a>
  </form>
</div>
</body></html>`);
});

app.use('/api/appointments/:token/cancel', express.urlencoded({ extended: false }));
app.post('/api/appointments/:token/cancel', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);
  if (!appt || !['confirmed', 'awaiting_confirmation'].includes(appt.status)) {
    return res.status(400).send(htmlPage('Erreur', 'Action impossible.'));
  }

  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const rdvDate = new Date(appt.date + 'T00:00:00');
  const diffDays = Math.ceil((rdvDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) {
    return res.status(400).send(htmlPage('Délai dépassé', 'Annulation impossible.'));
  }

  db.cancelAppointment.run('client', appt.token);

  mailer.sendClientCancellation(appt).catch(err =>
    console.error('[mailer] Email annulation client:', err.message)
  );
  mailer.sendAdminCancellationNotice(appt).catch(err =>
    console.error('[mailer] Email annulation admin:', err.message)
  );

  res.send(htmlPage('Rendez-vous annulé', 'Votre rendez-vous a bien été annulé. Vous recevrez un email de confirmation.'));
});

// ─── Confirmation / Refus admin (liens email) ─────────────────────

app.get('/api/appointments/confirm/:token', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Lien invalide.'));
  if (appt.status !== 'awaiting_confirmation' && appt.status !== 'pending') {
    return res.send(htmlPage('Déjà traité', `Statut actuel : <strong>${appt.status}</strong>.`));
  }

  try {
    let gcalId = null;
    try {
      gcalId = await calendar.createCalendarEvent(appt);
    } catch (err) {
      console.error('[calendar]', err.message);
    }

    db.adminUpdateStatus.run({ id: appt.id, status: 'confirmed', gcal_event_id: gcalId });
    await mailer.sendClientConfirmation(appt);

    res.send(htmlPage('Rendez-vous confirmé ✓',
      `Le rendez-vous de <strong>${appt.prenom} ${appt.nom}</strong> le <strong>${appt.date}</strong> à <strong>${appt.slot}</strong> a été confirmé.<br>Un email de confirmation a été envoyé au client.`));
  } catch (err) {
    console.error('[/confirm]', err.message);
    res.status(500).send(htmlPage('Erreur', err.message));
  }
});

app.get('/api/appointments/reject/:token', async (req, res) => {
  const appt = db.getByToken.get(req.params.token);
  if (!appt) return res.status(404).send(htmlPage('Introuvable', 'Lien invalide.'));
  if (!['awaiting_confirmation', 'pending'].includes(appt.status)) {
    return res.send(htmlPage('Déjà traité', `Statut actuel : <strong>${appt.status}</strong>.`));
  }

  try {
    db.adminUpdateStatus.run({ id: appt.id, status: 'rejected', gcal_event_id: null });
    await mailer.sendClientRejection(appt);
    res.send(htmlPage('Refusé', `La demande de <strong>${appt.prenom} ${appt.nom}</strong> a été refusée.`));
  } catch (err) {
    console.error('[/reject]', err.message);
    res.status(500).send(htmlPage('Erreur', err.message));
  }
});

// ─── Admin — login ─────────────────────────────────────────────────

app.post('/api/admin/login', loginLimiter, handleLogin);

// ─── Admin — appointments ─────────────────────────────────────────

app.get('/api/admin/appointments', requireAuth, (req, res) => {
  const { status, from, to, search, limit = 50, offset = 0 } = req.query;
  const rows = db.listAppointments.all({
    status:  status  || null,
    from:    from    || null,
    to:      to      || null,
    search:  search  ? `%${search}%` : null,
    limit:   parseInt(limit, 10),
    offset:  parseInt(offset, 10),
  });
  res.json({ appointments: rows });
});

app.get('/api/admin/appointments/:id', requireAuth, (req, res) => {
  const appt = db.getAppointmentById.get(parseInt(req.params.id, 10));
  if (!appt) return res.status(404).json({ error: 'Introuvable.' });
  res.json({ appointment: appt });
});

app.patch('/api/admin/appointments/:id', requireAuth, async (req, res) => {
  const id     = parseInt(req.params.id, 10);
  const appt   = db.getAppointmentById.get(id);
  if (!appt) return res.status(404).json({ error: 'Introuvable.' });

  const { action } = req.body;  // 'confirm' | 'reject' | 'cancel'

  if (action === 'confirm') {
    let gcalId = null;
    try { gcalId = await calendar.createCalendarEvent(appt); } catch {}
    db.adminUpdateStatus.run({ id, status: 'confirmed', gcal_event_id: gcalId });
    mailer.sendClientConfirmation(appt).catch(console.error);
  } else if (action === 'reject') {
    db.adminUpdateStatus.run({ id, status: 'rejected', gcal_event_id: null });
    mailer.sendClientRejection(appt).catch(console.error);
  } else if (action === 'cancel') {
    db.adminUpdateStatus.run({ id, status: 'cancelled', gcal_event_id: null });
    mailer.sendClientCancellation(appt).catch(console.error);
  } else {
    return res.status(400).json({ error: 'Action invalide.' });
  }

  const updated = db.getAppointmentById.get(id);
  res.json({ appointment: updated });
});

// ─── Admin — clients ──────────────────────────────────────────────

app.get('/api/admin/clients', requireAuth, (req, res) => {
  const { search, limit = 50, offset = 0 } = req.query;
  const rows = db.listClients.all({
    search: search ? `%${search}%` : null,
    limit:  parseInt(limit, 10),
    offset: parseInt(offset, 10),
  });
  res.json({ clients: rows });
});

app.get('/api/admin/clients/:id', requireAuth, (req, res) => {
  const id     = parseInt(req.params.id, 10);
  const client = db.getClientById.get(id);
  if (!client) return res.status(404).json({ error: 'Introuvable.' });
  const history = db.getClientHistory.all(id);
  res.json({ client, history });
});

app.patch('/api/admin/clients/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { notes } = req.body;
  db.updateClientNotes.run(notes || null, id);
  const client = db.getClientById.get(id);
  res.json({ client });
});

// ─── Admin — blocked slots ────────────────────────────────────────

app.get('/api/admin/blocked-slots', requireAuth, (_req, res) => {
  res.json({ blocked_slots: db.listBlockedSlots.all() });
});

app.post('/api/admin/blocked-slots', requireAuth, (req, res) => {
  const { date, slot, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'Date requise.' });
  try {
    db.insertBlockedSlot.run(date, slot || null, reason || null);
    res.json({ success: true, blocked_slots: db.listBlockedSlots.all() });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Créneau déjà bloqué.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/blocked-slots/:id', requireAuth, (req, res) => {
  db.deleteBlockedSlot.run(parseInt(req.params.id, 10));
  res.json({ success: true });
});

// ─── Admin — prices ───────────────────────────────────────────────

app.get('/api/admin/prices', requireAuth, (_req, res) => {
  res.json({ prices: db.getPrices.all() });
});

app.put('/api/admin/prices', requireAuth, (req, res) => {
  const { prices } = req.body;
  if (!Array.isArray(prices)) return res.status(400).json({ error: 'Format invalide.' });
  const upsert = db.db.transaction(() => {
    prices.forEach(p => db.upsertPrice.run({
      service:      p.service,
      property:     p.property,
      base_eur:     parseFloat(p.base_eur) || 0,
      extra_meuble: parseFloat(p.extra_meuble) || 0,
      extra_piece:  parseFloat(p.extra_piece) || 0,
    }));
  });
  upsert();
  res.json({ prices: db.getPrices.all() });
});

// ─── Admin — stats ────────────────────────────────────────────────

app.get('/api/admin/stats', requireAuth, (_req, res) => {
  const stats  = db.statsMonth.get();
  const recent = db.recentPending.all();
  res.json({ stats, recent_pending: recent });
});

// ─── Page HTML utilitaire ─────────────────────────────────────────

function htmlPage(title, message) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Tournai Expert Immo</title>
  <style>
    body{font-family:Georgia,serif;background:#10212B;color:#EFFBDB;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;box-sizing:border-box}
    .box{max-width:480px;width:100%}
    .label{font-family:monospace;font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:#8FA464;margin-bottom:1rem}
    h1{font-size:2rem;font-weight:300;letter-spacing:-.02em;margin:0 0 1.5rem}
    p{font-size:1rem;font-weight:300;line-height:1.8;color:rgba(239,251,219,.7)}
    a{color:#8FA464;text-decoration:none;font-family:monospace;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;display:inline-block;margin-top:2rem;border-bottom:1px solid #8FA464;padding-bottom:2px}
  </style>
</head>
<body>
  <div class="box">
    <div class="label">Tournai Expert Immo</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://tournaiexpertimmo.be">← Retour au site</a>
  </div>
</body>
</html>`;
}

// ─── Démarrage ────────────────────────────────────────────────────

async function start() {
  await seedAdmin();
  scheduler.start();
  app.listen(PORT, () => {
    console.log(`[TEI] Backend v2 démarré sur le port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[TEI] Erreur démarrage :', err.message);
  process.exit(1);
});
