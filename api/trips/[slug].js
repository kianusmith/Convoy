import { getSupabase } from '../../lib/supabase.js';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function formatMoney(cents, currency) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const slug = req.query.slug;
  if (!slug) {
    return json(res, 400, { error: 'Missing trip slug' });
  }

  try {
    const supabase = getSupabase();
    const { data: trip, error } = await supabase
      .from('trips')
      .select('id, slug, title, description, destination, start_date, end_date, group_size, price_per_person_cents, currency, organizer_name, status')
      .eq('slug', slug)
      .single();

    if (error || !trip) {
      return json(res, 404, { error: 'Trip not found' });
    }

    const { count: paidCount, error: countError } = await supabase
      .from('participants')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', trip.id)
      .eq('status', 'paid');

    if (countError) {
      console.error('Failed to count paid participants:', countError);
      return json(res, 500, { error: 'Failed to load trip progress' });
    }

    const spotsRemaining = Math.max(trip.group_size - paidCount, 0);

    return json(res, 200, {
      trip: {
        ...trip,
        price_per_person: formatMoney(trip.price_per_person_cents, trip.currency),
      },
      paid_count: paidCount,
      spots_remaining: spotsRemaining,
      is_full: spotsRemaining === 0 || trip.status === 'fully_paid',
      accepts_payments: trip.status !== 'cancelled' && spotsRemaining > 0 && trip.status !== 'fully_paid',
    });
  } catch (err) {
    console.error('Trip lookup error:', err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
