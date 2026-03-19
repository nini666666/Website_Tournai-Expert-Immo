// ─── Auth — JWT + bcrypt ──────────────────────────────────────────

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db     = require('./db');

const JWT_EXPIRY = '8h';

// ─── Seed admin au démarrage ──────────────────────────────────────
// Crée l'utilisateur admin depuis les variables d'environnement si absent

async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn('[auth] ADMIN_USERNAME ou ADMIN_PASSWORD manquant — panneau admin désactivé');
    return;
  }

  const existing = db.getAdminByUsername.get(username);
  if (!existing) {
    const hash = await bcrypt.hash(password, 12);
    db.insertAdmin.run(username, hash);
    console.log(`[auth] Utilisateur admin créé : ${username}`);
  }
}

// ─── Générer un token JWT ─────────────────────────────────────────

function signToken(userId, username) {
  return jwt.sign(
    { sub: userId, username },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// ─── Middleware Express — vérifier le token ───────────────────────

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant.' });
  }

  const token = header.slice(7);
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

// ─── Handler login ────────────────────────────────────────────────

async function handleLogin(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants manquants.' });
  }

  const user = db.getAdminByUsername.get(username);
  if (!user) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = signToken(user.id, user.username);
  res.json({ token, expiresIn: JWT_EXPIRY, username: user.username });
}

module.exports = { seedAdmin, requireAuth, handleLogin };
