// ─── Mollie Payment Service ───────────────────────────────────────
// Bancontact + QR code via l'API Mollie

const { createMollieClient } = require('@mollie/api-client');

let client = null;

function getMollieClient() {
  if (!client) {
    if (!process.env.MOLLIE_API_KEY) {
      throw new Error('MOLLIE_API_KEY manquante dans .env');
    }
    client = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
  }
  return client;
}

// ─── Créer un paiement Mollie ─────────────────────────────────────
// Retourne { id, checkoutUrl }

async function createPayment({ token, amount, description, metadata }) {
  const mollie = getMollieClient();

  const payment = await mollie.payments.create({
    amount: {
      currency: 'EUR',
      value:    amount.toFixed(2),  // ex: "95.00"
    },
    description,
    redirectUrl: `${process.env.MOLLIE_REDIRECT_URL}?token=${token}`,
    webhookUrl:  process.env.MOLLIE_WEBHOOK_URL,
    method:      ['bancontact'],
    locale:      'fr_BE',
    metadata,
  });

  return {
    id:          payment.id,
    checkoutUrl: payment._links.checkout.href,
  };
}

// ─── Récupérer le statut d'un paiement ───────────────────────────

async function getPayment(paymentId) {
  const mollie = getMollieClient();
  return mollie.payments.get(paymentId);
}

module.exports = { createPayment, getPayment };
