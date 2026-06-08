import { getSupabase } from '../../lib/supabase.js';
import { getStripe } from '../../lib/stripe.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const {
      trip_id,
      slug,
      name,
      email,
      success_url,
      cancel_url,
    } = body;

    if ((!trip_id && !slug) || !name || !email) {
      return json(res, 400, { error: 'Missing required fields: slug (or trip_id), name, email' });
    }

    const supabase = getSupabase();
    const stripe = getStripe();

    let tripQuery = supabase.from('trips').select('*');
    tripQuery = trip_id ? tripQuery.eq('id', trip_id) : tripQuery.eq('slug', slug);

    const { data: trip, error: tripError } = await tripQuery.single();

    if (tripError || !trip) {
      return json(res, 404, { error: 'Trip not found' });
    }

    if (trip.status === 'cancelled') {
      return json(res, 400, { error: 'This trip is no longer accepting payments' });
    }

    const { count: paidCount, error: countError } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('status', 'paid');

    if (countError) {
      console.error('Failed to count participants:', countError);
      return json(res, 500, { error: 'Failed to verify trip capacity' });
    }

    const { data: existingParticipant } = await supabase
      .from('participants')
      .select('*')
      .eq('trip_id', trip.id)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingParticipant?.status === 'paid') {
      return json(res, 400, { error: 'This participant has already paid' });
    }

    if (!existingParticipant && paidCount >= trip.group_size) {
      return json(res, 400, { error: 'This trip is fully booked' });
    }

    const appUrl = getAppUrl(req);
    const resolvedSuccessUrl = success_url ?? `${appUrl}/pay/${trip.slug}?paid=1`;
    const resolvedCancelUrl = cancel_url ?? `${appUrl}/pay/${trip.slug}?cancelled=1`;

    let participant = existingParticipant;

    if (!participant) {
      const { data: createdParticipant, error: participantError } = await supabase
        .from('participants')
        .insert({
          trip_id: trip.id,
          name,
          email: email.toLowerCase(),
          status: 'invited',
        })
        .select()
        .single();

      if (participantError) {
        console.error('Failed to create participant:', participantError);
        return json(res, 500, { error: 'Failed to create participant' });
      }

      participant = createdParticipant;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email.toLowerCase(),
      line_items: [
        {
          price_data: {
            currency: trip.currency,
            unit_amount: trip.price_per_person_cents,
            product_data: {
              name: `${trip.title} — your share`,
              description: `Group trip to ${trip.destination}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        trip_id: trip.id,
        participant_id: participant.id,
        trip_slug: trip.slug,
      },
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
    });

    const { error: updateError } = await supabase
      .from('participants')
      .update({
        status: 'checkout_started',
        stripe_checkout_session_id: session.id,
      })
      .eq('id', participant.id);

    if (updateError) {
      console.error('Failed to update participant checkout session:', updateError);
      return json(res, 500, { error: 'Failed to save checkout session' });
    }

    return json(res, 200, {
      checkout_url: session.url,
      session_id: session.id,
      participant_id: participant.id,
    });
  } catch (err) {
    console.error('Checkout creation error:', err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
