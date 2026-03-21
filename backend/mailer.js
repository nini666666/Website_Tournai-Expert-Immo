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

  const confirmUrl    = `${BASE_URL}/api/appointments/confirm/${appt.token}`;
  const rescheduleUrl = `${BASE_URL}/api/appointments/reschedule/${appt.token}`;

  const extras = appt.extras ? JSON.parse(appt.extras) : [];
  const extrasLine = extras.length ? `<br><strong>Options :</strong> ${extras.join(', ')}` : '';

  const dateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: #10212B; margin: 0; padding: 0; }
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
      .btn-reschedule { background: transparent; color: #EFFBDB; border: 1px solid rgba(239,251,219,.3); }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: rgba(239,251,219,.4); text-transform: uppercase; margin-top: 32px; }
      @media (prefers-color-scheme: light) {
        body { background: #C9D8DC; }
        .wrap { background: #C9D8DC; color: #10212B; }
        td { border-bottom-color: rgba(16,33,43,.12); }
        .btn-reschedule { color: #10212B; border-color: rgba(16,33,43,.3); }
        .footer { color: rgba(16,33,43,.35); }
      }
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
        ${appt.notes ? `<tr><td>Notes</td><td>${appt.notes}</td></tr>` : ''}
      </table>

      <div class="btn-row">
        <a class="btn btn-confirm"     href="${confirmUrl}">✓ Confirmer</a>
        <a class="btn btn-reschedule" href="${rescheduleUrl}">↺ Replanifier</a>
      </div>

      <div class="footer">Référence : ${appt.token}</div>
    </div>
    </body></html>
  `;

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      process.env.GMAIL_USER,
    subject: `[ref:${appt.token}] [RDV] ${appt.service_label} — ${appt.prenom} ${appt.nom} — ${appt.date}`,
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

  const dark = appt.theme !== 'light';
  const bg   = dark ? '#10212B' : '#C9D8DC';
  const fg   = dark ? '#EFFBDB' : '#10212B';
  const sep  = dark ? 'rgba(143,164,100,.2)' : 'rgba(16,33,43,.12)';
  const note = dark ? 'rgba(239,251,219,.5)' : 'rgba(16,33,43,.5)';
  const foot = dark ? 'rgba(239,251,219,.35)' : 'rgba(16,33,43,.35)';

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: ${bg}; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: ${bg}; color: ${fg}; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
      td { padding: 18px 0; border-bottom: 1px solid ${sep};
           font-size: .95rem; font-weight: 300; vertical-align: top; }
      td:first-child { font-family: monospace; font-size: .6rem; letter-spacing: .12em;
                       text-transform: uppercase; color: #8FA464; width: 38%; }
      .note { font-family: monospace; font-size: .6rem; letter-spacing: .08em;
              color: ${note}; line-height: 1.8; margin-top: 24px; }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: ${foot}; text-transform: uppercase; margin-top: 32px; }
    </style></head>
    <body>
    <div class="wrap">
      <h1>Rendez-vous<br>confirmé</h1>
      <div class="sub">Tournai Expert Immo</div>

      <table>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Prestation</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.service_label}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Bien</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.property_label}${extrasLine}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Adresse</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.adresse_bien}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Date</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${dateFr}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Horaire</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.slot}</td></tr>
        ${appt.notes ? `<tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Notes</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.notes}</td></tr>` : ''}
      </table>

      <p class="note">
        Pour annuler ou modifier ce rendez-vous, contactez-nous directement :<br><br>
        📞 <a href="tel:+3247603278" style="color:#8FA464;text-decoration:none;">+32 476/03.27.88</a><br>
        ✉️ expertimmotournai@gmail.com<br>
        📍 159 Rue Saint-Eleuthère, 7500 Tournai
      </p>
      <div class="footer"><span style="text-transform:none">Denis pour</span><br>Tournai Expert Immo</div>
    </div>
    </body></html>
  `;

  // Envoyer au locataire + bailleur si son email est renseigné
  const toConfirm = [appt.email];
  if (appt.bailleur_email) toConfirm.push(appt.bailleur_email);

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      toConfirm.join(', '),
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

  const dark2 = appt.theme !== 'light';
  const bg2   = dark2 ? '#10212B' : '#C9D8DC';
  const fg2   = dark2 ? '#EFFBDB' : '#10212B';
  const body2 = dark2 ? 'rgba(239,251,219,.75)' : 'rgba(16,33,43,.75)';
  const foot2 = dark2 ? 'rgba(239,251,219,.35)' : 'rgba(16,33,43,.35)';

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: ${bg2}; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: ${bg2}; color: ${fg2}; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      p { font-size: 1rem; font-weight: 300; line-height: 1.8; color: ${body2}; }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: ${foot2}; text-transform: uppercase; margin-top: 32px; }
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
        à nous contacter directement au <strong>+32 476/03.27.88</strong>.
      </p>
      <div class="footer">Tournai Expert Immo — 159 Rue Saint-Eleuthère, 7500 Tournai</div>
    </div>
    </body></html>
  `;

  // Envoyer au locataire + bailleur si son email est renseigné
  const toReject = [appt.email];
  if (appt.bailleur_email) toReject.push(appt.bailleur_email);

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      toReject.join(', '),
    subject: `Votre demande de rendez-vous — ${dateFr}`,
    html,
  });
}

// ─── Email de replanification au client ──────────────────────────

async function sendClientReschedule(appt) {
  const transporter = getTransporter();

  const newDateFr = new Date(appt.date + 'T00:00:00').toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const dark = appt.theme !== 'light';
  const bg   = dark ? '#10212B' : '#C9D8DC';
  const fg   = dark ? '#EFFBDB' : '#10212B';
  const sep  = dark ? 'rgba(143,164,100,.2)' : 'rgba(16,33,43,.12)';
  const note = dark ? 'rgba(239,251,219,.5)' : 'rgba(16,33,43,.5)';
  const foot = dark ? 'rgba(239,251,219,.35)' : 'rgba(16,33,43,.35)';

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="UTF-8"><style>
      body { font-family: Georgia, serif; background: ${bg}; margin: 0; padding: 0; }
      .wrap { max-width: 560px; margin: 40px auto; background: ${bg}; color: ${fg}; padding: 40px; }
      h1 { font-size: 1.6rem; font-weight: 300; letter-spacing: -.02em; margin: 0 0 8px; }
      .sub { font-family: monospace; font-size: .65rem; letter-spacing: .15em; text-transform: uppercase;
             color: #8FA464; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
      td { padding: 18px 0; border-bottom: 1px solid ${sep};
           font-size: .95rem; font-weight: 300; vertical-align: top; }
      td:first-child { font-family: monospace; font-size: .6rem; letter-spacing: .12em;
                       text-transform: uppercase; color: #8FA464; width: 38%; }
      .note { font-family: monospace; font-size: .6rem; letter-spacing: .08em;
              color: ${note}; line-height: 1.8; margin-top: 24px; }
      .footer { font-family: monospace; font-size: .55rem; letter-spacing: .1em;
                color: ${foot}; text-transform: uppercase; margin-top: 32px; }
    </style></head>
    <body>
    <div class="wrap">
      <h1>Rendez-vous<br>replanifié</h1>
      <div class="sub">Tournai Expert Immo</div>

      <table>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Prestation</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.service_label}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Bien</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.property_label}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Adresse</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.adresse_bien}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Nouvelle date</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${newDateFr}</td></tr>
        <tr><td style="width:46%;padding:18px 0;border-bottom:1px solid ${sep};font-family:monospace;font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:#8FA464;vertical-align:top">Horaire</td><td style="padding:18px 0;border-bottom:1px solid ${sep};font-size:.95rem;font-weight:300;vertical-align:top">${appt.slot}</td></tr>
      </table>

      <p class="note">
        Pour toute question, contactez-nous directement :<br><br>
        📞 <a href="tel:+3247603278" style="color:#8FA464;text-decoration:none;">+32 476/03.27.88</a><br>
        ✉️ expertimmotournai@gmail.com<br>
        📍 159 Rue Saint-Eleuthère, 7500 Tournai
      </p>
      <div class="footer"><span style="text-transform:none">Denis pour</span><br>Tournai Expert Immo</div>
    </div>
    </body></html>
  `;

  const toList = [appt.email];
  if (appt.bailleur_email) toList.push(appt.bailleur_email);

  await transporter.sendMail({
    from:    `"Tournai Expert Immo" <${process.env.GMAIL_USER}>`,
    to:      toList.join(', '),
    subject: `Votre rendez-vous a été replanifié — ${newDateFr} à ${appt.slot}`,
    html,
  });
}

module.exports = { sendAdminNotification, sendClientConfirmation, sendClientRejection, sendClientReschedule };
