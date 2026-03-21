// ─── Gmail Trash — Supprime l'email admin après confirmation/refus ─
// Utilise les mêmes credentials OAuth2 que Google Calendar.
// Le mail admin contient [ref:TOKEN] dans son sujet pour être identifiable.

require('dotenv').config();

const { google } = require('googleapis');
const fs         = require('fs');
const path       = require('path');

const TOKENS_PATH = path.join(__dirname, 'tokens.json');

function getGmailClient() {
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  const auth   = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  auth.setCredentials(tokens);
  // Persist le refresh automatique du token
  auth.on('tokens', (newTokens) => {
    const current = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    if (newTokens.refresh_token) current.refresh_token = newTokens.refresh_token;
    current.access_token = newTokens.access_token;
    current.expiry_date  = newTokens.expiry_date;
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(current, null, 2));
  });
  return google.gmail({ version: 'v1', auth });
}

// Cherche et supprime définitivement l'email admin correspondant au token
async function trashAdminEmail(token) {
  try {
    const gmail = getGmailClient();

    // Attendre que Gmail indexe le message (peut prendre quelques secondes)
    const delay = ms => new Promise(r => setTimeout(r, ms));
    let messages = [];
    for (let attempt = 1; attempt <= 5; attempt++) {
      await delay(3000);
      const res = await gmail.users.messages.list({
        userId:           'me',
        q:                `subject:"[ref:${token}]"`,
        maxResults:       10,
        includeSpamTrash: true,
      });
      messages = res.data.messages || [];
      console.log(`[Gmail] Tentative ${attempt} — ${messages.length} email(s) trouvé(s)`);
      if (messages.length) break;
    }

    for (const msg of messages) {
      await gmail.users.messages.delete({ userId: 'me', id: msg.id });
      console.log(`[Gmail] Email admin supprimé définitivement: ${msg.id}`);
    }
  } catch (err) {
    console.error('[Gmail trash]', err.message);
  }
}

module.exports = { trashAdminEmail };
