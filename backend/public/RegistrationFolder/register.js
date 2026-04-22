async function registerTeam() {
  const teamNameInput = document.getElementById('team-name');
  const emailInput = document.getElementById('team-email');
  const errorEl = document.getElementById('error-msg');
  
  const teamName = teamNameInput.value.trim();
  const email = emailInput.value.trim();
  
  const formCard = document.getElementById('registration-form-card');
  const successModal = document.getElementById('success-modal');
  const generatedIdEl = document.getElementById('generated-team-id');

  errorEl.style.display = 'none';

  if (!teamName || !email) {
    errorEl.textContent = 'Please fill in all fields.';
    errorEl.style.display = 'block';
    return;
  }

  // Find the submit button inside the form
  const btn = document.querySelector('#registration-form button[type="submit"]');
  const originalBtnText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-text">INITIALIZING...</span>';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_name: teamName, email: email })
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      errorEl.textContent = data.error || 'Registration failed. Please try again.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = originalBtnText;
    } else if (data.success) {
      formCard.style.display = 'none';
      successModal.style.display = 'block';
      generatedIdEl.textContent = data.team_id;
    }
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'A network error occurred. Please try again.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = originalBtnText;
  }
}

document.getElementById('registration-form').addEventListener('submit', (event) => {
  event.preventDefault();
  registerTeam();
});
