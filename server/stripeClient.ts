import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: '2025-08-27.basil' as any,
  typescript: true,
});

export function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("STRIPE_SECRET_KEY is not set");
  }
  return stripe;
}

export function getStripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || "";
}
