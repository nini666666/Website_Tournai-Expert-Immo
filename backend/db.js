// ─── Base de données SQLite ───────────────────────────────────────
// Migration via PRAGMA user_version (auto-run au démarrage)

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'data', 'appointments.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Migrations ───────────────────────────────────────────────────

const CURRENT_VERSION = 3;

function migrate() {
  const v = db.pragma('user_version', { simple: true });

  if (v < 1) {
    // Version 1 : table appointments initiale
    db.exec(`
      CREATE TABLE IF NOT EXISTS appointments (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        token          TEXT    UNIQUE NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'pending',
        category       TEXT    NOT NULL,
        service        TEXT    NOT NULL,
        service_label  TEXT    NOT NULL,
        property       TEXT    NOT NULL,
        property_label TEXT    NOT NULL,
        extras         TEXT    NOT NULL DEFAULT '[]',
        date           TEXT    NOT NULL,
        slot           TEXT    NOT NULL,
        duration       INTEGER NOT NULL,
        prenom         TEXT    NOT NULL,
        nom            TEXT    NOT NULL,
        email          TEXT    NOT NULL,
        telephone      TEXT    NOT NULL,
        adresse_bien   TEXT    NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        confirmed_at   DATETIME,
        rejected_at    DATETIME,
        gcal_event_id  TEXT
      );
    `);
    db.pragma('user_version = 1');
  }

  if (v < 2) {
    // Version 2 : colonnes paiement + CRM + rappels
    const cols = db.pragma("table_info('appointments')").map(c => c.name);
    const add = (col, def) => {
      if (!cols.includes(col)) db.exec(`ALTER TABLE appointments ADD COLUMN ${col} ${def}`);
    };
    add('amount_eur',          'REAL DEFAULT 0');
    add('mollie_payment_id',   'TEXT');
    add('payment_url',         'TEXT');
    add('payment_expires_at',  'TEXT');
    add('paid_at',             'DATETIME');
    add('client_id',           'INTEGER');
    add('reminder_48h_sent',   'INTEGER DEFAULT 0');
    add('reminder_24h_sent',   'INTEGER DEFAULT 0');
    add('cancelled_at',        'DATETIME');
    add('cancelled_by',        'TEXT');

    db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        email      TEXT    UNIQUE NOT NULL,
        prenom     TEXT    NOT NULL,
        nom        TEXT    NOT NULL,
        telephone  TEXT,
        notes      TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blocked_slots (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT    NOT NULL,
        slot       TEXT,
        reason     TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, slot)
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    UNIQUE NOT NULL,
        password_hash TEXT    NOT NULL
      );
    `);
    db.pragma('user_version = 2');
  }

  if (v < 3) {
    // Version 3 : table tarifs
    db.exec(`
      CREATE TABLE IF NOT EXISTS prices (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        service      TEXT    NOT NULL,
        property     TEXT    NOT NULL,
        base_eur     REAL    NOT NULL,
        extra_meuble REAL    NOT NULL DEFAULT 0,
        extra_piece  REAL    NOT NULL DEFAULT 0,
        UNIQUE(service, property)
      );
    `);
    seedDefaultPrices();
    db.pragma('user_version = 3');
  }
}

// ─── Tarifs par défaut ────────────────────────────────────────────
// À ajuster depuis le panneau admin

function seedDefaultPrices() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO prices (service, property, base_eur, extra_meuble, extra_piece)
    VALUES (?, ?, ?, ?, ?)
  `);

  const expertise = ['avant_achat', 'litige', 'valeur_locative', 'assurance'];
  const etl = ['entree', 'sortie', 'travaux', 'constat'];
  const properties = ['studio', 'appt_1ch', 'appt_2ch', 'appt_3ch', 'maison_3ch', 'maison_4ch', 'devis'];

  // Tarifs expertise (montants fictifs — à configurer dans l'admin)
  const expertisePrices = { studio: 120, appt_1ch: 130, appt_2ch: 140, appt_3ch: 150, maison_3ch: 160, maison_4ch: 175, devis: 0 };
  expertise.forEach(s => {
    properties.forEach(p => insert.run(s, p, expertisePrices[p], 0, 0));
  });

  // Tarifs ETL (montants fictifs — à configurer dans l'admin)
  const etlPrices = { studio: 75, appt_1ch: 85, appt_2ch: 95, appt_3ch: 110, maison_3ch: 125, maison_4ch: 145, devis: 0 };
  etl.forEach(s => {
    properties.forEach(p => insert.run(s, p, etlPrices[p], 15, 10));
  });
}

migrate();

// ─── Helpers — appointments ───────────────────────────────────────

const insertAppointment = db.prepare(`
  INSERT INTO appointments
    (token, status, category, service, service_label, property, property_label,
     extras, date, slot, duration, prenom, nom, email, telephone, adresse_bien,
     amount_eur, mollie_payment_id, payment_url, payment_expires_at, client_id)
  VALUES
    (@token, @status, @category, @service, @service_label, @property, @property_label,
     @extras, @date, @slot, @duration, @prenom, @nom, @email, @telephone, @adresse_bien,
     @amount_eur, @mollie_payment_id, @payment_url, @payment_expires_at, @client_id)
`);

const getByToken = db.prepare(`SELECT * FROM appointments WHERE token = ?`);

const getByMollieId = db.prepare(`SELECT * FROM appointments WHERE mollie_payment_id = ?`);

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

const markPaid = db.prepare(`
  UPDATE appointments
  SET status = 'awaiting_confirmation', paid_at = CURRENT_TIMESTAMP, mollie_payment_id = ?
  WHERE token = ?
`);

const cancelAppointment = db.prepare(`
  UPDATE appointments
  SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ?
  WHERE token = ?
`);

const expireAppointment = db.prepare(`
  UPDATE appointments
  SET status = 'expired'
  WHERE token = ?
`);

const getConfirmedOnDate = db.prepare(`
  SELECT slot, duration FROM appointments
  WHERE date = ? AND status IN ('confirmed', 'awaiting_confirmation')
`);

const getPendingExpired = db.prepare(`
  SELECT * FROM appointments
  WHERE status = 'pending_payment' AND payment_expires_at <= date('now')
`);

const getReminders48h = db.prepare(`
  SELECT * FROM appointments
  WHERE status = 'confirmed' AND date = date('now', '+2 days') AND reminder_48h_sent = 0
`);

const getReminders24h = db.prepare(`
  SELECT * FROM appointments
  WHERE status = 'confirmed' AND date = date('now', '+1 day') AND reminder_24h_sent = 0
`);

const markReminder48h = db.prepare(`UPDATE appointments SET reminder_48h_sent = 1 WHERE id = ?`);
const markReminder24h = db.prepare(`UPDATE appointments SET reminder_24h_sent = 1 WHERE id = ?`);

// ─── Helpers — clients ────────────────────────────────────────────

const upsertClient = db.prepare(`
  INSERT INTO clients (email, prenom, nom, telephone, updated_at)
  VALUES (@email, @prenom, @nom, @telephone, CURRENT_TIMESTAMP)
  ON CONFLICT(email) DO UPDATE SET
    prenom     = excluded.prenom,
    nom        = excluded.nom,
    telephone  = excluded.telephone,
    updated_at = CURRENT_TIMESTAMP
`);

const getClientById   = db.prepare(`SELECT * FROM clients WHERE id = ?`);
const getClientByEmail = db.prepare(`SELECT * FROM clients WHERE email = ?`);

const listClients = db.prepare(`
  SELECT c.*,
    COUNT(a.id)     AS total_rdv,
    MAX(a.date)     AS last_date,
    SUM(CASE WHEN a.status = 'confirmed' THEN a.amount_eur ELSE 0 END) AS total_eur
  FROM clients c
  LEFT JOIN appointments a ON a.client_id = c.id
  WHERE (@search IS NULL OR c.nom LIKE @search OR c.prenom LIKE @search OR c.email LIKE @search)
  GROUP BY c.id
  ORDER BY c.updated_at DESC
  LIMIT @limit OFFSET @offset
`);

const updateClientNotes = db.prepare(`
  UPDATE clients SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const getClientHistory = db.prepare(`
  SELECT * FROM appointments WHERE client_id = ? ORDER BY date DESC
`);

// ─── Helpers — blocked_slots ─────────────────────────────────────

const listBlockedSlots = db.prepare(`SELECT * FROM blocked_slots ORDER BY date, slot`);

const insertBlockedSlot = db.prepare(`
  INSERT OR IGNORE INTO blocked_slots (date, slot, reason) VALUES (?, ?, ?)
`);

const deleteBlockedSlot = db.prepare(`DELETE FROM blocked_slots WHERE id = ?`);

const getBlockedForDate = db.prepare(`
  SELECT * FROM blocked_slots WHERE date = ?
`);

// ─── Helpers — prices ─────────────────────────────────────────────

const getPrices = db.prepare(`SELECT * FROM prices ORDER BY service, property`);

const getPrice = db.prepare(`SELECT * FROM prices WHERE service = ? AND property = ?`);

const upsertPrice = db.prepare(`
  INSERT INTO prices (service, property, base_eur, extra_meuble, extra_piece)
  VALUES (@service, @property, @base_eur, @extra_meuble, @extra_piece)
  ON CONFLICT(service, property) DO UPDATE SET
    base_eur     = excluded.base_eur,
    extra_meuble = excluded.extra_meuble,
    extra_piece  = excluded.extra_piece
`);

// ─── Helpers — admin_users ────────────────────────────────────────

const getAdminByUsername = db.prepare(`SELECT * FROM admin_users WHERE username = ?`);

const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)
`);

// ─── Admin — appointments list ────────────────────────────────────

const listAppointments = db.prepare(`
  SELECT a.*, c.notes AS client_notes
  FROM appointments a
  LEFT JOIN clients c ON c.id = a.client_id
  WHERE
    (@status IS NULL OR a.status = @status)
    AND (@from IS NULL OR a.date >= @from)
    AND (@to   IS NULL OR a.date <= @to)
    AND (@search IS NULL OR a.nom LIKE @search OR a.prenom LIKE @search OR a.email LIKE @search OR a.token LIKE @search)
  ORDER BY a.date ASC, a.slot ASC
  LIMIT @limit OFFSET @offset
`);

const getAppointmentById = db.prepare(`SELECT * FROM appointments WHERE id = ?`);

const adminUpdateStatus = db.prepare(`
  UPDATE appointments
  SET status = @status,
      confirmed_at  = CASE WHEN @status = 'confirmed'  THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
      rejected_at   = CASE WHEN @status = 'rejected'   THEN CURRENT_TIMESTAMP ELSE rejected_at END,
      cancelled_at  = CASE WHEN @status = 'cancelled'  THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
      cancelled_by  = CASE WHEN @status = 'cancelled'  THEN 'admin'            ELSE cancelled_by END,
      gcal_event_id = COALESCE(@gcal_event_id, gcal_event_id)
  WHERE id = @id
`);

// ─── Admin — stats ────────────────────────────────────────────────

const statsMonth = db.prepare(`
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('expired', 'rejected'))               AS total,
    COUNT(*) FILTER (WHERE status = 'confirmed')                                 AS confirmed,
    COUNT(*) FILTER (WHERE status IN ('pending_payment', 'awaiting_confirmation')) AS pending,
    COALESCE(SUM(amount_eur) FILTER (WHERE status = 'confirmed'), 0)             AS revenue_confirmed,
    COALESCE(SUM(amount_eur) FILTER (WHERE status = 'awaiting_confirmation'), 0) AS revenue_pending
  FROM appointments
  WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
`);

const recentPending = db.prepare(`
  SELECT * FROM appointments
  WHERE status IN ('pending_payment', 'awaiting_confirmation')
  ORDER BY created_at DESC
  LIMIT 5
`);

module.exports = {
  db,
  // appointments
  insertAppointment,
  getByToken,
  getByMollieId,
  confirmAppointment,
  rejectAppointment,
  markPaid,
  cancelAppointment,
  expireAppointment,
  getConfirmedOnDate,
  getPendingExpired,
  getReminders48h,
  getReminders24h,
  markReminder48h,
  markReminder24h,
  listAppointments,
  getAppointmentById,
  adminUpdateStatus,
  // clients
  upsertClient,
  getClientById,
  getClientByEmail,
  listClients,
  updateClientNotes,
  getClientHistory,
  // blocked_slots
  listBlockedSlots,
  insertBlockedSlot,
  deleteBlockedSlot,
  getBlockedForDate,
  // prices
  getPrices,
  getPrice,
  upsertPrice,
  // admin_users
  getAdminByUsername,
  insertAdmin,
  // stats
  statsMonth,
  recentPending,
};
