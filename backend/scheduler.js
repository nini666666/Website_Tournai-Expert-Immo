// ─── Scheduler — node-cron ────────────────────────────────────────
// Rappels 48h/24h + expiration des paiements non reçus

const cron   = require('node-cron');
const db     = require('./db');
const mailer = require('./mailer');

function start() {
  // Toutes les heures à :00
  cron.schedule('0 * * * *', async () => {
    console.log('[scheduler] Vérification rappels et expirations...');

    // ─── Expirations ──────────────────────────────────────────────
    // RDV non payés dont la date d'expiration est dépassée
    try {
      const expired = db.getPendingExpired.all();
      for (const appt of expired) {
        db.expireAppointment.run(appt.token);
        await mailer.sendPaymentFailed(appt).catch(err =>
          console.error('[scheduler] Email expiration:', err.message, 'token:', appt.token)
        );
        console.log('[scheduler] RDV expiré (paiement non reçu):', appt.token);
      }
    } catch (err) {
      console.error('[scheduler] Erreur expirations:', err.message);
    }

    // ─── Rappels 48h ─────────────────────────────────────────────
    try {
      const list = db.getReminders48h.all();
      for (const appt of list) {
        await mailer.sendReminder48h(appt).catch(err =>
          console.error('[scheduler] Email rappel 48h:', err.message, 'token:', appt.token)
        );
        db.markReminder48h.run(appt.id);
        console.log('[scheduler] Rappel 48h envoyé:', appt.token);
      }
    } catch (err) {
      console.error('[scheduler] Erreur rappels 48h:', err.message);
    }

    // ─── Rappels 24h ─────────────────────────────────────────────
    try {
      const list = db.getReminders24h.all();
      for (const appt of list) {
        await mailer.sendReminder24h(appt).catch(err =>
          console.error('[scheduler] Email rappel 24h:', err.message, 'token:', appt.token)
        );
        db.markReminder24h.run(appt.id);
        console.log('[scheduler] Rappel 24h envoyé:', appt.token);
      }
    } catch (err) {
      console.error('[scheduler] Erreur rappels 24h:', err.message);
    }
  });

  console.log('[scheduler] Démarré — rappels toutes les heures');
}

module.exports = { start };
