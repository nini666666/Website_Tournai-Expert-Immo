// ─── Google Calendar API ─────────────────────────────────────────
// Lecture des disponibilités + création d'événements
// Auth : OAuth2 avec refresh token stocké dans .env

const { google }  = require('googleapis');
const path        = require('path');
const fs          = require('fs');

// Chemin du fichier de tokens (généré par auth-setup.js)
const TOKENS_PATH = path.join(__dirname, 'tokens.json');

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI   // http://localhost:3000/auth/callback
  );

  // Charger les tokens depuis le fichier
  if (!fs.existsSync(TOKENS_PATH)) {
    throw new Error(
      'tokens.json introuvable. Lancez "node auth-setup.js" pour authentifier le compte Google.'
    );
  }
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  client.setCredentials(tokens);

  // Mettre à jour automatiquement le token si rafraîchi
  client.on('tokens', updated => {
    const current = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    const merged  = { ...current, ...updated };
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
  });

  return client;
}

// ─── Vérifier les disponibilités pour une date ───────────────────
// Retourne la liste des plages occupées (busy) sur la journée

async function getBusySlots(dateStr) {
  const auth    = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = `${dateStr}T00:00:00+01:00`;
  const timeMax = `${dateStr}T23:59:59+01:00`;

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'Europe/Brussels',
      items: [{ id: process.env.GOOGLE_CALENDAR_ID || 'primary' }],
    },
  });

  const busy = res.data.calendars[process.env.GOOGLE_CALENDAR_ID || 'primary']?.busy || [];
  return busy; // [{start, end}, ...]
}

// ─── Générer les créneaux disponibles ────────────────────────────
// Horaires : 10h00 – 14h00, incrément 30 min

function generateSlots(duration) {
  const slots = [];
  const startH = 10, endH = 14;

  let h = startH, m = 0;
  while (true) {
    const endMin = h * 60 + m + duration;
    if (endMin > endH * 60) break;

    const label = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    slots.push(label);

    m += 30;
    if (m >= 60) { h++; m -= 60; }
  }
  return slots;
}

// ─── Vérifier si un créneau est libre ───────────────────────────
function isSlotFree(timeStr, duration, busyPeriods, dateStr, timezone = 'Europe/Brussels') {
  const [h, min] = timeStr.split(':').map(Number);

  // Construire start et end en UTC
  const slotStart = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00+01:00`);
  const slotEnd   = new Date(slotStart.getTime() + duration * 60 * 1000);

  for (const period of busyPeriods) {
    const busyStart = new Date(period.start);
    const busyEnd   = new Date(period.end);
    // Chevauchement si le créneau commence avant la fin du busy et finit après le début
    if (slotStart < busyEnd && slotEnd > busyStart) return false;
  }
  return true;
}

// ─── API principale : créneaux d'une date ────────────────────────
async function getAvailableSlots(dateStr, duration) {
  const busyPeriods = await getBusySlots(dateStr);
  const allSlots    = generateSlots(duration);

  return allSlots.map(time => ({
    time,
    available: isSlotFree(time, duration, busyPeriods, dateStr),
  }));
}

// ─── Créer un événement dans Google Calendar ─────────────────────
async function createCalendarEvent({ date, slot, duration, prenom, nom, email,
                                     telephone, service_label, property_label,
                                     extras, adresse_bien }) {
  const auth    = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const [h, m]  = slot.split(':').map(Number);
  const startDt = new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+01:00`);
  const endDt   = new Date(startDt.getTime() + duration * 60 * 1000);

  const extrasArr = typeof extras === "string" ? JSON.parse(extras || "[]") : (extras || []);
  const extrasStr = extrasArr && extrasArr.length ? `\nOptions : ${extrasArr.join(', ')}` : '';
  const description = [
    `Prestation : ${service_label}`,
    `Bien : ${property_label}${extrasStr}`,
    `Adresse du bien : ${adresse_bien}`,
    ``,
    `Client : ${prenom} ${nom}`,
    `Email : ${email}`,
    `Tél. : ${telephone}`,
  ].join('\n');

  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    requestBody: {
      summary: `RDV — ${service_label} (${prenom} ${nom})`,
      description,
      start: {
        dateTime: startDt.toISOString(),
        timeZone: 'Europe/Brussels',
      },
      end: {
        dateTime: endDt.toISOString(),
        timeZone: 'Europe/Brussels',
      },
      location: adresse_bien,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email',  minutes: 24 * 60 },
          { method: 'popup',  minutes: 60 },
        ],
      },
    },
  });

  return event.data.id;
}

module.exports = { getAvailableSlots, createCalendarEvent };
