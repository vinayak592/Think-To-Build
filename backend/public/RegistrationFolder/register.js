async function registerTeam() {
  const teamNameInput = document.getElementById('team-name');
  const emailInput = document.getElementById('team-email');
  const participantNameInput = document.getElementById('participant-name');
  const memberCountInput = document.getElementById('member-count');
  const memberTwoNameInput = document.getElementById('member-2-name');
  const errorEl = document.getElementById('error-msg');
  
  const teamName = teamNameInput.value.trim();
  const email = emailInput.value.trim();
  const participantName = participantNameInput.value.trim();
  const memberCount = Number(memberCountInput.value);
  const secondMemberName = memberTwoNameInput.value.trim();
  
  const formCard = document.getElementById('registration-form-card');
  const successModal = document.getElementById('success-modal');
  const generatedIdEl = document.getElementById('generated-team-id');

  errorEl.style.display = 'none';

  if (!teamName || !email || !participantName) {
    errorEl.textContent = 'Please fill in all required fields.';
    errorEl.style.display = 'block';
    return;
  }

  if (memberCount === 2 && !secondMemberName) {
    errorEl.textContent = 'Please enter the second member name.';
    errorEl.style.display = 'block';
    return;
  }

  // Find the submit button inside the form
  const btn = document.querySelector('#registration-form button[type="submit"]');
  const originalBtnText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-text">INITIALIZING...</span>';

  try {
    const members = [participantName];
    if (memberCount === 2) members.push(secondMemberName);

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team_name: teamName,
        email: email,
        participant_name: participantName,
        member_count: memberCount,
        members
      })
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
