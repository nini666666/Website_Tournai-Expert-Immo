// ─── Mailer — Gmail SMTP via nodemailer ──────────────────────────

const nodemailer = require('nodemailer');

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,       // expertimmotournai@gmail.com
      pass: process.env.GMAIL_APP_PASS,   // Mot de passe d'application Google
    },
  });
}

// ─── Email de notification à l'admin ─────────────────────────────

async function sendAdminNotification(appt) {
  const transporter = getTransporter();
  const BASE_URL    = process.env.BASE_URL || 'http://tournaiexpertimmo.be';

  const confirmUrl = `${BASE_URL}/api/appointments/confirm/${appt.token}`;
  const rejectUrl  = `${BASE_URL}/api/appointments/reject/${appt.token}`;

  const extras = appt.extras ? JSON.parse(appt.extras) : [];
  const extrasLine = extras.length ? `<br><strong>Options :</strong> ${extras.join(', ')}` : '';

  const dateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: #f5f5f0; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: #10212B; color: #EFFBDB; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
      td { padding: 10px 0; border-bottom: 1px solid rgba(143,164,100,.2);
           font-size: .95rem; font-weight: 300; vertical-align: top; }
      td:first-child { font-family: monospace; font-size: .6rem; letter-spacing: .12em;
                       text-transform: uppercase; color: #8FA464; width: 38%; }
      .btn-row { display: flex; gap: 12px; flex-wrap: wrap; }
      .btn { display: inline-block; padding: 14px 28px; font-family: monospace;
             font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             text-decoration: none; cursor: pointer; }
      .btn-confirm { background: #8FA464; color: #10212B; }
      .btn-reject  { background: transparent; color: #EFFBDB; border: 1px solid rgba(239,251,219,.3); }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: rgba(239,251,219,.4); text-transform: uppercase; margin-top: 32px; }
    </style></head>
    <body>
    <div class="wrap">
      <h1>Nouvelle demande<br>de rendez-vous</h1>
      <div class="sub">Tournai Expert Immo — À valider</div>

      <table>
        <tr><td>Prestation</td><td>${appt.service_label}</td></tr>
        <tr><td>Bien</td><td>${appt.property_label}${extrasLine}</td></tr>
        <tr><td>Adresse du bien</td><td>${appt.adresse_bien}</td></tr>
        <tr><td>Date</td><td>${dateFr}</td></tr>
        <tr><td>Horaire</td><td>${appt.slot} (${appt.duration} min)</td></tr>
        <tr><td>Client</td><td>${appt.prenom} ${appt.nom}</td></tr>
        <tr><td>Email</td><td>${appt.email}</td></tr>
        <tr><td>Téléphone</td><td>${appt.telephone}</td></tr>
      </table>

      <div class="btn-row">
        <a class="btn btn-confirm" href="${confirmUrl}">✓ Confirmer</a>
        <a class="btn btn-reject"  href="${rejectUrl}">✗ Refuser</a>
      </div>

      <div class="footer">Référence : ${appt.token}</div>
    </div>
    </body></html>
  `;

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      process.env.GMAIL_USER,
    subject: `[RDV] ${appt.service_label} — ${appt.prenom} ${appt.nom} — ${appt.date}`,
    html,
  });
}

// ─── Email de confirmation au client ─────────────────────────────

async function sendClientConfirmation(appt) {
  const transporter = getTransporter();
  const extras = appt.extras ? JSON.parse(appt.extras) : [];
  const extrasLine = extras.length ? `<br><strong>Options :</strong> ${extras.join(', ')}` : '';

  const dateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: #f5f5f0; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: #EFFBDB; color: #10212B; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
      td { padding: 10px 0; border-bottom: 1px solid rgba(16,33,43,.1);
           font-size: .95rem; font-weight: 300; vertical-align: top; }
      td:first-child { font-family: monospace; font-size: .6rem; letter-spacing: .12em;
                       text-transform: uppercase; color: #8FA464; width: 38%; }
      .note { font-family: monospace; font-size: .6rem; letter-spacing: .08em;
              color: rgba(16,33,43,.5); line-height: 1.8; margin-top: 24px; }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: rgba(16,33,43,.35); text-transform: uppercase; margin-top: 32px; }
    </style></head>
    <body>
    <div class="wrap">
      <h1>Rendez-vous<br>confirmé</h1>
      <div class="sub">Tournai Expert Immo</div>

      <table>
        <tr><td>Prestation</td><td>${appt.service_label}</td></tr>
        <tr><td>Bien</td><td>${appt.property_label}${extrasLine}</td></tr>
        <tr><td>Adresse</td><td>${appt.adresse_bien}</td></tr>
        <tr><td>Date</td><td>${dateFr}</td></tr>
        <tr><td>Horaire</td><td>${appt.slot}</td></tr>
      </table>

      <p class="note">
        Pour annuler ou modifier ce rendez-vous, contactez-nous directement :<br>
        +32 473/58.98.91 — expertimmotournai@gmail.com
      </p>
      <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
    </div>
    </body></html>
  `;

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre rendez-vous est confirmé — ${dateFr} à ${appt.slot}`,
    html,
  });
}

// ─── Email de refus au client ────────────────────────────────────

async function sendClientRejection(appt) {
  const transporter = getTransporter();

  const dateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: #f5f5f0; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: #EFFBDB; color: #10212B; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      p { font-size: 1rem; font-weight: 300; line-height: 1.8; color: rgba(16,33,43,.75); }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: rgba(16,33,43,.35); text-transform: uppercase; margin-top: 32px; }
    </style></head>
    <body>
    <div class="wrap">
      <h1>Demande de<br>rendez-vous</h1>
      <div class="sub">Tournai Expert Immo</div>
      <p>
        Bonjour ${appt.prenom},<br><br>
        Malheureusement, le créneau demandé (${dateFr} à ${appt.slot})
        n'est plus disponible.<br><br>
        N'hésitez pas à soumettre une nouvelle demande sur notre site ou
        à nous contacter directement au <strong>+32 473/58.98.91</strong>.
      </p>
      <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
    </div>
    </body></html>
  `;

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      appt.email,
    subject: `Votre demande de rendez-vous — ${dateFr}`,
    html,
  });
}

module.exports = { sendAdminNotification, sendClientConfirmation, sendClientRejection };
