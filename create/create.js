const form = document.getElementById('create-form');
const note = document.getElementById('form-note');

function poundsToCents(value) {
  const pounds = Number.parseFloat(value);
  if (!Number.isFinite(pounds) || pounds <= 0) return null;
  return Math.round(pounds * 100);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  const title = form.title.value.trim();
  const destination = form.destination.value.trim();
  const startDate = form.start_date.value || null;
  const endDate = form.end_date.value || null;
  const pricePerPersonCents = poundsToCents(form.price_per_person.value);
  const groupSize = Number.parseInt(form.group_size.value, 10);
  const organizerName = form.organizer_name.value.trim();
  const organizerEmail = form.organizer_email.value.trim();

  if (!title || !destination || !organizerName || !organizerEmail) {
    note.textContent = 'Fill in all required fields to continue.';
    note.className = 'pay-note is-error';
    return;
  }

  if (!pricePerPersonCents) {
    note.textContent = 'Enter a valid cost per person in pounds.';
    note.className = 'pay-note is-error';
    return;
  }

  if (!Number.isFinite(groupSize) || groupSize < 2) {
    note.textContent = 'Group size must be at least 2.';
    note.className = 'pay-note is-error';
    return;
  }

  if (startDate && endDate && startDate > endDate) {
    note.textContent = 'End date must be on or after the start date.';
    note.className = 'pay-note is-error';
    return;
  }

  button.disabled = true;
  button.textContent = 'Creating link…';
  note.textContent = '';
  note.className = 'pay-note';

  try {
    const response = await fetch('/api/trips/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title,
        destination,
        start_date: startDate,
        end_date: endDate,
        group_size: groupSize,
        price_per_person_cents: pricePerPersonCents,
        currency: 'gbp',
        organizer_name: organizerName,
        organizer_email: organizerEmail,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.trip?.slug) {
      throw new Error(payload.error || 'Could not create the trip.');
    }

    window.location.href = `/pay/${encodeURIComponent(payload.trip.slug)}`;
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Create payment link';
    note.textContent = error.message;
    note.className = 'pay-note is-error';
  }
});
