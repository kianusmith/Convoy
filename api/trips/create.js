import crypto from 'crypto';
import { getSupabase } from '../../lib/supabase.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function generateSlug() {
  return crypto.randomBytes(6).toString('base64url');
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
      title,
      description,
      destination,
      start_date,
      end_date,
      group_size,
      price_per_person_cents,
      currency = 'gbp',
      organizer_name,
      organizer_email,
    } = body;

    if (!title || !destination || !group_size || !price_per_person_cents || !organizer_name || !organizer_email) {
      return json(res, 400, {
        error: 'Missing required fields: title, destination, group_size, price_per_person_cents, organizer_name, organizer_email',
      });
    }

    const slug = generateSlug();

    const supabase = getSupabase();
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        slug,
        title,
        description: description ?? null,
        destination,
        start_date: start_date ?? null,
        end_date: end_date ?? null,
        group_size,
        price_per_person_cents,
        currency: currency.toLowerCase(),
        organizer_name,
        organizer_email,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create trip:', error);
      return json(res, 500, { error: 'Failed to create trip' });
    }

    const shareUrl = `${getAppUrl(req)}/pay/${trip.slug}`;

    return json(res, 201, { trip, share_url: shareUrl });
  } catch (err) {
    console.error('Trip creation error:', err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
