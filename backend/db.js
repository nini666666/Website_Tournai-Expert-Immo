// ─── Base de données SQLite ───────────────────────────────────────
// Table : appointments (demandes de rendez-vous)

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'data', 'appointments.db');
const db      = new Database(DB_PATH);

// Optimisations SQLite
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Création de la table si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    token          TEXT    UNIQUE NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'pending',
    -- pending | confirmed | rejected

    -- Prestation
    category       TEXT    NOT NULL,   -- expertise | etl
    service        TEXT    NOT NULL,   -- avant_achat | litige | entree | sortie | ...
    service_label  TEXT    NOT NULL,
    property       TEXT    NOT NULL,   -- studio | appt_1ch | ...
    property_label TEXT    NOT NULL,
    extras         TEXT    NOT NULL DEFAULT '[]',  -- JSON array ['Meublé', '+2 ch.']

    -- Créneau
    date           TEXT    NOT NULL,   -- YYYY-MM-DD
    slot           TEXT    NOT NULL,   -- HH:MM
    duration       INTEGER NOT NULL,   -- minutes (30 ou 90)

    -- Client
    prenom         TEXT    NOT NULL,
    nom            TEXT    NOT NULL,
    email          TEXT    NOT NULL,
    telephone      TEXT    NOT NULL,
    adresse_bien   TEXT    NOT NULL,
    proprietaire       TEXT    NOT NULL DEFAULT '',
    theme              TEXT    NOT NULL DEFAULT 'dark',  -- 'dark' | 'light'

    -- Bailleur (optionnel)
    bailleur_prenom    TEXT    NOT NULL DEFAULT '',
    bailleur_nom       TEXT    NOT NULL DEFAULT '',
    bailleur_email     TEXT    NOT NULL DEFAULT '',
    bailleur_telephone TEXT    NOT NULL DEFAULT '',

    -- Horodatages
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at   DATETIME,
    rejected_at    DATETIME,

    -- ID de l'événement Google Calendar (rempli après confirmation)
    gcal_event_id  TEXT
  )
`);

// ─── Helpers ────────────────────────────────────────────────────────

// Migrations
try { db.exec(`ALTER TABLE appointments ADD COLUMN proprietaire TEXT NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'`); } catch (_) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN bailleur_prenom TEXT NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN bailleur_nom TEXT NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN bailleur_email TEXT NOT NULL DEFAULT ''`); } catch (_) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN bailleur_telephone TEXT NOT NULL DEFAULT ''`); } catch (_) {}

const insertAppointment = db.prepare(`
  INSERT INTO appointments
    (token, category, service, service_label, property, property_label,
     extras, date, slot, duration, prenom, nom, email, telephone, adresse_bien, theme,
     bailleur_prenom, bailleur_nom, bailleur_email, bailleur_telephone)
  VALUES
    (@token, @category, @service, @service_label, @property, @property_label,
     @extras, @date, @slot, @duration, @prenom, @nom, @email, @telephone, @adresse_bien, @theme,
     @bailleur_prenom, @bailleur_nom, @bailleur_email, @bailleur_telephone)
`);

const getByToken = db.prepare(`
  SELECT * FROM appointments WHERE token = ?
`);

const confirmAppointment = db.prepare(`
  UPDATE appointments
  SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP, gcal_event_id = ?
  WHERE token = ?
`);

const rejectAppointment = db.prepare(`
  UPDATE appointments
  SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP
  WHERE token = ?
`);

const getConfirmedOnDate = db.prepare(`
  SELECT slot, duration FROM appointments
  WHERE date = ? AND status = 'confirmed'
`);

// Pending < 12h uniquement — les confirmed sont gérés par Google Calendar
// (si supprimé manuellement dans GCal, le créneau redevient libre automatiquement)
const getPendingOrConfirmedOnDate = db.prepare(`
  SELECT slot, duration FROM appointments
  WHERE date = ? AND status = 'pending' AND created_at > datetime('now', '-12 hours')
`);

const rescheduleAppointment = db.prepare(`
  UPDATE appointments
  SET date = @date, slot = @slot
  WHERE token = @token
`);

module.exports = {
  db,
  insertAppointment,
  getByToken,
  confirmAppointment,
  rejectAppointment,
  getConfirmedOnDate,
  getPendingOrConfirmedOnDate,
  rescheduleAppointment,
};
