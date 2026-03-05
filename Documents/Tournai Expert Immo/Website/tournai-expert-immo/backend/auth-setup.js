// ─── Auth Setup — À lancer UNE SEULE FOIS sur le Synology ───────
// Ce script génère le fichier tokens.json nécessaire au backend.
//
// Usage :
//   node auth-setup.js
//   → Ouvrez l'URL affichée dans un navigateur
//   → Autorisez l'accès Google Calendar
//   → Copiez le code affiché, collez-le ici
//   → tokens.json est créé automatiquement

require('dotenv').config();

const { google } = require('googleapis');
const readline   = require('readline');
const fs         = require('fs');
const path       = require('path');

const TOKENS_PATH = path.join(__dirname, 'tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt:      'consent',  // force le refresh_token à être retourné
  scope:       SCOPES,
});

console.log('\n═══════════════════════════════════════════════════════');
console.log('  TOURNAI EXPERT IMMO — Configuration Google Calendar');
console.log('═══════════════════════════════════════════════════════\n');
console.log('1. Ouvrez cette URL dans votre navigateur :\n');
console.log('   ' + authUrl);
console.log('\n2. Connectez-vous avec expertimmotournai@gmail.com');
console.log('3. Autorisez l\'accès à Google Calendar');
console.log('4. Copiez le code d\'autorisation affiché\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('→ Collez le code ici : ', async (code) => {
  rl.close();
  try {
    const { tokens } = await client.getToken(code.trim());
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
    console.log('\n✓ tokens.json créé avec succès !');
    console.log('  Le backend peut maintenant accéder à votre Google Calendar.');
    console.log('\n  Vous pouvez démarrer le serveur : npm start\n');
  } catch (err) {
    console.error('\n✗ Erreur :', err.message);
    console.error('  Vérifiez le code et réessayez.\n');
    process.exit(1);
  }
});
