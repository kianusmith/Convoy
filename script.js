// Convoy — script.js

// Waitlist form submission via Formspree
const form = document.querySelector('.signup-form');
const formNote = form ? form.querySelector('.form-note') : null;

if (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const email = form.querySelector('input[name="email"]').value;
    const button = form.querySelector('button[type="submit"]');

    // Basic validation
    if (!email) return;

    // Loading state
    button.disabled = true;
    button.textContent = 'Joining...';

    try {
      const response = await fetch('https://formspree.io/f/xkoeqlro', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        // Success state
        form.querySelector('.input-row').style.display = 'none';
        form.querySelector('label').style.display = 'none';
        formNote.textContent = "You're on the list. We'll be in touch before launch.";
        formNote.style.color = 'var(--color-brand, #4f46e5)';
        formNote.style.fontWeight = '500';
      } else {
        throw new Error('Submission failed');
      }
    } catch (err) {
      button.disabled = false;
      button.innerHTML = 'Join <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      formNote.textContent = 'Something went wrong — please try again.';
      formNote.style.color = '#ef4444';
    }
  });
}

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
