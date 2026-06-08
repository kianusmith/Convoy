import { buffer } from 'micro';
import { getSupabase } from '../../lib/supabase.js';
import { getStripe } from '../../lib/stripe.js';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function markTripFullyPaidIfComplete(tripId) {
  const supabase = getSupabase();
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('group_size, status')
    .eq('id', tripId)
    .single();

  if (tripError || !trip || trip.status === 'fully_paid') return;

  const { count, error: countError } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('status', 'paid');

  if (countError) {
    console.error('Failed to count paid participants:', countError);
    return;
  }

  if (count >= trip.group_size) {
    const { error: updateError } = await supabase
      .from('trips')
      .update({ status: 'fully_paid' })
      .eq('id', tripId);

    if (updateError) {
      console.error('Failed to mark trip fully paid:', updateError);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return json(res, 500, { error: 'Webhook not configured' });
  }

  let event;

  try {
    const rawBody = await buffer(req);
    const signature = req.headers['stripe-signature'];
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return json(res, 400, { error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const participantId = session.metadata?.participant_id;
        const tripId = session.metadata?.trip_id;

        if (!participantId || !tripId) {
          console.error('Checkout session missing metadata:', session.id);
          break;
        }

        const amountPaidCents = session.amount_total ?? null;
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const supabase = getSupabase();
        const { error } = await supabase
          .from('participants')
          .update({
            status: 'paid',
            stripe_payment_intent_id: paymentIntentId,
            amount_paid_cents: amountPaidCents,
            paid_at: new Date().toISOString(),
          })
          .eq('id', participantId)
          .eq('stripe_checkout_session_id', session.id);

        if (error) {
          console.error('Failed to mark participant as paid:', error);
          return json(res, 500, { error: 'Failed to update participant' });
        }

        await markTripFullyPaidIfComplete(tripId);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const participantId = session.metadata?.participant_id;

        if (!participantId) break;

        const supabase = getSupabase();
        const { error } = await supabase
          .from('participants')
          .update({ status: 'invited', stripe_checkout_session_id: null })
          .eq('id', participantId)
          .eq('status', 'checkout_started');

        if (error) {
          console.error('Failed to reset expired checkout participant:', error);
        }
        break;
      }

      default:
        break;
    }

    return json(res, 200, { received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return json(res, 500, { error: 'Webhook handler failed' });
  }
}
