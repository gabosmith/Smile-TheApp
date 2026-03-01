'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const Stripe = require('stripe');

let _db = null;
function db() {
  if (!_db) {
    if (!admin.apps.length) admin.initializeApp();
    _db = admin.firestore();
  }
  return _db;
}

const PRICES = {
  plan_solo: 'price_1T6ACOLHxsBx9pJ7jp5gbbOm',
  plan_base_clinica: 'price_1T6ACjLHxsBx9pJ7TLpST2vr',
  modulo_adicional: 'price_1T6AD0LHxsBx9pJ7WKz63YSd',
  sucursal_adicional: 'price_1T6ADLLHxsBx9pJ74bu6Ltkb',
  usuario_adicional: 'price_1T6ADcLHxsBx9pJ7OzEjuP3f',
};

const APP_URL = 'https://smile-theapp.web.app';

function getClinicSettingsRef(clinicId) {
  return db().collection('clinicas').doc(clinicId).collection('config').doc('settings');
}

async function findClinicByStripeCustomer(customerId) {
  const snap = await db().collection('clinicas').get();
  for (const doc of snap.docs) {
    const c = await doc.ref.collection('config').doc('settings').get();
    if (c.exists && c.data().stripeCustomerId === customerId) return doc.id;
  }
  return null;
}

exports.createCheckoutSession = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { clinicId } = req.body;
    if (!clinicId) { res.status(400).json({ error: 'clinicId requerido' }); return; }
    const cfgSnap = await getClinicSettingsRef(clinicId).get();
    if (!cfgSnap.exists) { res.status(404).json({ error: 'Clinica no encontrada' }); return; }
    const cfg = cfgSnap.data();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    let customerId = cfg.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: cfg.nombre || clinicId, metadata: { clinicId } });
      customerId = customer.id;
      await getClinicSettingsRef(clinicId).set({ stripeCustomerId: customerId }, { merge: true });
    }
    const items = [{ price: cfg.plan === 'solo' ? PRICES.plan_solo : PRICES.plan_base_clinica, quantity: 1 }];
    if ((cfg.modulos || []).length > 0) items.push({ price: PRICES.modulo_adicional, quantity: cfg.modulos.length });
    const trialHasta = cfg.trialHasta ? new Date(cfg.trialHasta) : null;
    const enTrial = trialHasta && trialHasta > new Date();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription', customer: customerId, line_items: items,
      subscription_data: { metadata: { clinicId }, ...(enTrial && { trial_end: Math.floor(trialHasta.getTime() / 1000) }) },
      metadata: { clinicId },
      success_url: APP_URL + '/app.html?clinica=' + clinicId + '&stripe=success',
      cancel_url: APP_URL + '/app.html?clinica=' + clinicId + '&stripe=cancelled',
      allow_promotion_codes: true, locale: 'es',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

exports.stripeWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) { res.status(400).send('Webhook Error: ' + err.message); return; }
  res.json({ received: true });
  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const cid = s.metadata && s.metadata.clinicId;
      if (!cid) return;
      const sub = await stripe.subscriptions.retrieve(s.subscription);
      await getClinicSettingsRef(cid).set({ stripeSubscriptionId: s.subscription, stripeCustomerId: s.customer, subscripcionActiva: true, suspendida: false, pagoPendiente: false, gracePeriodHasta: null, proximoPago: new Date(sub.current_period_end * 1000).toISOString(), suscripcionCreadaEn: new Date().toISOString() }, { merge: true });
    } else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object;
      const clinicId = await findClinicByStripeCustomer(inv.customer);
      if (clinicId) {
        await getClinicSettingsRef(clinicId).set({ pagoPendiente: true, gracePeriodHasta: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }, { merge: true });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const clinicId = await findClinicByStripeCustomer(sub.customer);
      if (clinicId) {
        await getClinicSettingsRef(clinicId).set({ subscripcionActiva: false, suspendida: true, activa: false }, { merge: true });
      }
    }
  } catch (err) { console.error('[webhook]', err.message); }
});

exports.createPortalSession = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { clinicId } = req.body;
    if (!clinicId) { res.status(400).json({ error: 'clinicId requerido' }); return; }
    const cfgSnap = await getClinicSettingsRef(clinicId).get();
    if (!cfgSnap.exists || !cfgSnap.data().stripeCustomerId) { res.status(400).json({ error: 'Sin suscripcion activa' }); return; }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const session = await stripe.billingPortal.sessions.create({ customer: cfgSnap.data().stripeCustomerId, return_url: APP_URL + '/app.html?clinica=' + clinicId });
    res.json({ url: session.url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
