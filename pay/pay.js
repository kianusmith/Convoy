const root = document.getElementById('pay-root');

function getSlugFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const payIndex = parts.indexOf('pay');
  if (payIndex === -1 || !parts[payIndex + 1]) return null;
  return decodeURIComponent(parts[payIndex + 1]);
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'Dates TBC';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (startDate && endDate) {
    return `${formatter.format(new Date(startDate))} – ${formatter.format(new Date(endDate))}`;
  }

  return formatter.format(new Date(startDate || endDate));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLoading() {
  root.innerHTML = `
    <section class="pay-card pay-loading" aria-live="polite">
      <p class="eyebrow">Shared payment link</p>
      <h1>Loading trip…</h1>
      <p class="pay-muted">Fetching the latest group details.</p>
    </section>
  `;
}

function renderError(message) {
  root.innerHTML = `
    <section class="pay-card" aria-live="polite">
      <p class="eyebrow">Shared payment link</p>
      <h1>Trip not found</h1>
      <p class="pay-muted">${escapeHtml(message)}</p>
      <div class="pay-status is-warning">
        <p>This payment link may be invalid or expired. Ask the organiser to send a fresh Convoy link.</p>
      </div>
    </section>
  `;
}

function renderTripPage(data, state) {
  const { trip, paid_count: paidCount, spots_remaining: spotsRemaining, accepts_payments: acceptsPayments } = data;
  const progress = Math.min((paidCount / trip.group_size) * 100, 100);
  const paidQuery = new URLSearchParams(window.location.search).get('paid') === '1';
  const cancelledQuery = new URLSearchParams(window.location.search).get('cancelled') === '1';

  let statusBlock = '';

  if (paidQuery || state === 'paid') {
    statusBlock = `
      <div class="pay-status is-success">
        <h2>Payment received</h2>
        <p>You're in. The organiser will see your spot confirmed once Stripe finishes processing.</p>
      </div>
    `;
  } else if (cancelledQuery || state === 'cancelled') {
    statusBlock = `
      <div class="pay-status is-warning">
        <h2>Checkout cancelled</h2>
        <p>No worries — your spot is still open. Fill in your details below when you're ready to pay.</p>
      </div>
    `;
  } else if (!acceptsPayments) {
    statusBlock = `
      <div class="pay-status is-warning">
        <h2>This trip is no longer taking payments</h2>
        <p>${trip.status === 'cancelled' ? 'The organiser cancelled this trip.' : 'All spots are currently filled.'}</p>
      </div>
    `;
  }

  const formBlock = acceptsPayments && state !== 'paid' ? `
    <form class="pay-form" id="checkout-form" novalidate>
      <div>
        <label for="name">Your name</label>
        <input id="name" name="name" type="text" autocomplete="name" required>
      </div>
      <div>
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
      </div>
      <button type="submit">Pay ${escapeHtml(trip.price_per_person)} with Stripe</button>
      <p class="pay-note" id="form-note" role="status" aria-live="polite"></p>
    </form>
  ` : '';

  root.innerHTML = `
    <section class="pay-card" aria-live="polite">
      <p class="eyebrow">Shared payment link</p>
      <h1>${escapeHtml(trip.title)}</h1>
      <p class="pay-muted">${escapeHtml(trip.destination)} · Organised by ${escapeHtml(trip.organizer_name)}</p>

      <div class="pay-meta">
        <div class="pay-meta-row">
          <span>Dates</span>
          <span>${escapeHtml(formatDateRange(trip.start_date, trip.end_date))}</span>
        </div>
        <div class="pay-meta-row">
          <span>Your share</span>
          <strong>${escapeHtml(trip.price_per_person)}</strong>
        </div>
        <div class="pay-meta-row">
          <span>Group size</span>
          <span>${trip.group_size} people</span>
        </div>
      </div>

      <div class="pay-progress" aria-label="Payment progress">
        <strong>${paidCount} of ${trip.group_size} paid</strong>
        <span class="pay-muted">${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left</span>
        <div class="pay-progress-bar" aria-hidden="true">
          <div class="pay-progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>

      ${statusBlock}
      ${formBlock}
    </section>
  `;

  if (acceptsPayments && state !== 'paid') {
    bindCheckoutForm(trip.slug);
  }
}

async function loadTrip(slug) {
  renderLoading();

  const response = await fetch(`/api/trips/${encodeURIComponent(slug)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    renderError(payload.error || 'We could not load this trip.');
    return;
  }

  renderTripPage(payload);
}

function bindCheckoutForm(slug) {
  const form = document.getElementById('checkout-form');
  const note = document.getElementById('form-note');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = form.querySelector('#name').value.trim();
    const email = form.querySelector('#email').value.trim();
    const button = form.querySelector('button[type="submit"]');

    if (!name || !email) {
      note.textContent = 'Enter your name and email to continue.';
      note.className = 'pay-note is-error';
      return;
    }

    button.disabled = true;
    button.textContent = 'Redirecting to Stripe…';
    note.textContent = '';
    note.className = 'pay-note';

    try {
      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          slug,
          name,
          email,
          success_url: `${window.location.origin}/pay/${encodeURIComponent(slug)}?paid=1`,
          cancel_url: `${window.location.origin}/pay/${encodeURIComponent(slug)}?cancelled=1`,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.checkout_url) {
        throw new Error(payload.error || 'Could not start checkout.');
      }

      window.location.href = payload.checkout_url;
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Try again with Stripe';
      note.textContent = error.message;
      note.className = 'pay-note is-error';
    }
  });
}

const slug = getSlugFromPath();

if (!slug) {
  renderError('This payment link is missing a trip code.');
} else {
  loadTrip(slug);
}
