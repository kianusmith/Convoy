import Stripe from 'stripe';

let stripeClient;

export function getStripe() {
  if (!stripeClient) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    }

    stripeClient = new Stripe(stripeSecretKey);
  }

  return stripeClient;
}
