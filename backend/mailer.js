// ─── Mailer — Gmail SMTP via nodemailer ──────────────────────────

const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

function dateFr(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function extrasLine(appt) {
  const extras = appt.extras ? JSON.parse(appt.extras) : [];
  return extras.length ? `<br><strong>Options :</strong> ${extras.join(', ')}` : '';
}

function rdvTable(appt) {
  return `
    <table>
      <tr><td>Prestation</td><td>${appt.service_label}</td></tr>
      <tr><td>Bien</td><td>${appt.property_label}${extrasLine(appt)}</td></tr>
      <tr><td>Adresse</td><td>${appt.adresse_bien}</td></tr>
      <tr><td>Date</td><td>${dateFr(appt.date)}</td></tr>
      <tr><td>Horaire</td><td>${appt.slot} (${appt.duration} min)</td></tr>
    </table>`;
}

// ─── Templates HTML ───────────────────────────────────────────────

function darkTemplate(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><style>
  body{font-family:Georgia,serif;background:#f5f5f0;margin:0;padding:0}
  .wrap{max-width:560px;margin:40px auto;background:#10212B;color:#EFFBDB;padding:40px}
  h1{font-size:1.6rem;font-weight:300;letter-spacing:-.02em;margin:0 0 8px}
  .sub{font-family:monospace;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:#8FA464;margin-bottom:32px}
  table{width:100%;border-collapse:collapse;margin-bottom:32px}
  td{padding:10px 0;border-bottom:1px solid rgba(143,164,100,.2);font-size:.95rem;font-weight:300;vertical-align:top}
  td:first-child{font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;width:38%}
  .btn-row{display:flex;gap:12px;flex-wrap:wrap}
  .btn{display:inline-block;padding:14px 28px;font-family:monospace;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none}
  .btn-confirm{background:#8FA464;color:#10212B}
  .btn-reject{background:transparent;color:#EFFBDB;border:1px solid rgba(239,251,219,.3)}
  .btn-pay{background:#8FA464;color:#10212B}
  .note{font-family:monospace;font-size:.6rem;letter-spacing:.08em;color:rgba(239,251,219,.5);line-height:1.8;margin-top:24px}
  .footer{font-family:monospace;font-size:.55rem;letter-spacing:.1em;color:rgba(239,251,219,.4);text-transform:uppercase;margin-top:32px}
</style></head>
<body><div class="wrap">${content}</div></body>
</html>`;
}

function lightTemplate(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><style>
  body{font-family:Georgia,serif;background:#f5f5f0;margin:0;padding:0}
  .wrap{max-width:560px;margin:40px auto;background:#EFFBDB;color:#10212B;padding:40px}
  h1{font-size:1.6rem;font-weight:300;letter-spacing:-.02em;margin:0 0 8px}
  .sub{font-family:monospace;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:#8FA464;margin-bottom:32px}
  table{width:100%;border-collapse:collapse;margin-bottom:32px}
  td{padding:10px 0;border-bottom:1px solid rgba(16,33,43,.1);font-size:.95rem;font-weight:300;vertical-align:top}
  td:first-child{font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;width:38%}
  p{font-size:1rem;font-weight:300;line-height:1.8;color:rgba(16,33,43,.75)}
  .btn{display:inline-block;padding:14px 28px;font-family:monospace;font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;text-decoration:none;background:#10212B;color:#EFFBDB;margin-top:8px}
  .note{font-family:monospace;font-size:.6rem;letter-spacing:.08em;color:rgba(16,33,43,.5);line-height:1.8;margin-top:24px}
  .footer{font-family:monospace;font-size:.55rem;letter-spacing:.1em;color:rgba(16,33,43,.35);text-transform:uppercase;margin-top:32px}
</style></head>
<body><div class="wrap">${content}</div></body>
</html>`;
}

// ─── 1. Demande de paiement → client ─────────────────────────────
// Après création du RDV, avant confirmation

async function sendPaymentRequest(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);
  const amount = appt.amount_eur ? `${appt.amount_eur.toFixed(2)} €` : '';

  const html = lightTemplate(`
    <h1>Votre demande de<br>rendez-vous</h1>
    <div class="sub">Tournai Expert Immo — Paiement requis</div>
    ${rdvTable(appt)}
    ${amount ? `<table><tr><td>Montant</td><td><strong>${amount}</strong></td></tr></table>` : ''}
    <p>Pour confirmer votre réservation, veuillez procéder au paiement sécurisé via Bancontact.</p>
    <a class="btn" href="${appt.payment_url}">Payer ${amount} →</a>
    <p class="note">
      Ce lien de paiement est valable jusqu'au ${new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })} (5 jours avant le rendez-vous).<br>
      Sans paiement, votre réservation sera automatiquement annulée.
    </p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre réservation — Paiement requis (${d})`,
    html,
  });
}

// ─── 2. Paiement reçu → client ────────────────────────────────────
// Après webhook Mollie paid

async function sendPaymentConfirmed(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Paiement reçu</h1>
    <div class="sub">Tournai Expert Immo</div>
    ${rdvTable(appt)}
    <p>Votre paiement a bien été reçu. Votre rendez-vous est en cours de validation et vous recevrez un email de confirmation définitive dans les plus brefs délais.</p>
    <p class="note">Référence : ${appt.token}</p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Paiement reçu — En attente de confirmation (${d})`,
    html,
  });
}

// ─── 3. Notification admin (après paiement / devis) ───────────────

async function sendAdminNotification(appt) {
  const t = getTransporter();
  const BASE_URL   = process.env.BASE_URL || 'https://tournaiexpertimmo.be';
  const confirmUrl = `${BASE_URL}/api/appointments/confirm/${appt.token}`;
  const rejectUrl  = `${BASE_URL}/api/appointments/reject/${appt.token}`;
  const d = dateFr(appt.date);
  const isPaid = appt.status === 'awaiting_confirmation';
  const amount = appt.amount_eur ? `<tr><td>Montant</td><td><strong>${appt.amount_eur.toFixed(2)} €</strong> ${isPaid ? '✓ Payé' : ''}</td></tr>` : '';

  const html = darkTemplate(`
    <h1>${isPaid ? 'RDV à confirmer' : 'Nouvelle demande'}<br>(sur devis)</h1>
    <div class="sub">Tournai Expert Immo — Action requise</div>
    <table>
      <tr><td>Prestation</td><td>${appt.service_label}</td></tr>
      <tr><td>Bien</td><td>${appt.property_label}${extrasLine(appt)}</td></tr>
      <tr><td>Adresse</td><td>${appt.adresse_bien}</td></tr>
      <tr><td>Date</td><td>${d}</td></tr>
      <tr><td>Horaire</td><td>${appt.slot} (${appt.duration} min)</td></tr>
      ${amount}
      <tr><td>Client</td><td>${appt.prenom} ${appt.nom}</td></tr>
      <tr><td>Email</td><td>${appt.email}</td></tr>
      <tr><td>Téléphone</td><td>${appt.telephone}</td></tr>
    </table>
    <div class="btn-row">
      <a class="btn btn-confirm" href="${confirmUrl}">✓ Confirmer</a>
      <a class="btn btn-reject"  href="${rejectUrl}">✗ Refuser</a>
    </div>
    <div class="footer">Référence : ${appt.token}</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      process.env.GMAIL_USER,
    subject: `[RDV${isPaid ? ' PAYÉ' : ''}] ${appt.service_label} — ${appt.prenom} ${appt.nom} — ${appt.date}`,
    html,
  });
}

// ─── 4. Confirmation définitive → client ─────────────────────────

async function sendClientConfirmation(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);
  const cancelUrl = `${process.env.BASE_URL || 'https://tournaiexpertimmo.be'}/api/appointments/${appt.token}/cancel`;

  const html = lightTemplate(`
    <h1>Rendez-vous<br>confirmé</h1>
    <div class="sub">Tournai Expert Immo</div>
    ${rdvTable(appt)}
    <p class="note">
      Pour annuler ou modifier ce rendez-vous (au moins 7 jours à l'avance) :<br>
      <a href="${cancelUrl}">Annuler ce rendez-vous</a><br><br>
      Au-delà de ce délai, contactez-nous directement :<br>
      +32 473/58.98.91 — expertimmotournai@gmail.com
    </p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre rendez-vous est confirmé — ${d} à ${appt.slot}`,
    html,
  });
}

// ─── 5. Refus → client ────────────────────────────────────────────

async function sendClientRejection(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Demande de<br>rendez-vous</h1>
    <div class="sub">Tournai Expert Immo</div>
    <p>Bonjour ${appt.prenom},<br><br>
    Malheureusement, le créneau demandé (${d} à ${appt.slot}) n'est plus disponible.<br><br>
    N'hésitez pas à soumettre une nouvelle demande sur notre site ou à nous contacter directement au <strong>+32 473/58.98.91</strong>.</p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre demande de rendez-vous — ${d}`,
    html,
  });
}

// ─── 6. Annulation → client ───────────────────────────────────────

async function sendClientCancellation(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Rendez-vous<br>annulé</h1>
    <div class="sub">Tournai Expert Immo</div>
    ${rdvTable(appt)}
    <p>Votre rendez-vous du ${d} à ${appt.slot} a bien été annulé. Si vous souhaitez reprendre rendez-vous, vous pouvez le faire sur notre site.</p>
    <p>Pour toute question concernant un éventuel remboursement, contactez-nous :<br>
    <strong>+32 473/58.98.91</strong> — expertimmotournai@gmail.com</p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Annulation — Rendez-vous du ${d}`,
    html,
  });
}

// ─── 7. Annulation → admin ────────────────────────────────────────

async function sendAdminCancellationNotice(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = darkTemplate(`
    <h1>Rendez-vous annulé<br>par le client</h1>
    <div class="sub">Tournai Expert Immo</div>
    <table>
      <tr><td>Prestation</td><td>${appt.service_label}</td></tr>
      <tr><td>Date</td><td>${d} à ${appt.slot}</td></tr>
      <tr><td>Client</td><td>${appt.prenom} ${appt.nom}</td></tr>
      <tr><td>Email</td><td>${appt.email}</td></tr>
      <tr><td>Téléphone</td><td>${appt.telephone}</td></tr>
    </table>
    <div class="footer">Référence : ${appt.token}</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      process.env.GMAIL_USER,
    subject: `[ANNULATION] ${appt.prenom} ${appt.nom} — ${appt.date}`,
    html,
  });
}

// ─── 8. Paiement échoué → client ──────────────────────────────────

async function sendPaymentFailed(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Paiement non reçu</h1>
    <div class="sub">Tournai Expert Immo</div>
    <p>Bonjour ${appt.prenom},<br><br>
    Votre réservation pour le ${d} à ${appt.slot} n'a pas pu être confirmée car le paiement n'a pas abouti.<br><br>
    Vous pouvez soumettre une nouvelle demande sur notre site, ou nous contacter :<br>
    <strong>+32 473/58.98.91</strong> — expertimmotournai@gmail.com</p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre réservation — Paiement non reçu (${d})`,
    html,
  });
}

// ─── 9. Rappel 48h → client ───────────────────────────────────────

async function sendReminder48h(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Rappel — Votre rendez-vous<br>dans 2 jours</h1>
    <div class="sub">Tournai Expert Immo</div>
    ${rdvTable(appt)}
    <p class="note">
      Pour annuler ce rendez-vous, il est malheureusement trop tard (délai de 7 jours dépassé).<br>
      Pour toute urgence : <strong>+32 473/58.98.91</strong>
    </p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Rappel — Rendez-vous dans 2 jours (${d} à ${appt.slot})`,
    html,
  });
}

// ─── 10. Rappel 24h → client ──────────────────────────────────────

async function sendReminder24h(appt) {
  const t = getTransporter();
  const d = dateFr(appt.date);

  const html = lightTemplate(`
    <h1>Rappel — Votre rendez-vous<br>demain</h1>
    <div class="sub">Tournai Expert Immo</div>
    ${rdvTable(appt)}
    <p class="note">
      Pour toute urgence : <strong>+32 473/58.98.91</strong>
    </p>
    <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
  `);

  await t.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Rappel — Rendez-vous demain (${d} à ${appt.slot})`,
    html,
  });
}

module.exports = {
  sendPaymentRequest,
  sendPaymentConfirmed,
  sendAdminNotification,
  sendClientConfirmation,
  sendClientRejection,
  sendClientCancellation,
  sendAdminCancellationNotice,
  sendPaymentFailed,
  sendReminder48h,
  sendReminder24h,
};
