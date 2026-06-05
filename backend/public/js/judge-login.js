document.getElementById('judge-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('login-error');
  
  if (errorEl) {
    errorEl.style.display = 'none';
  }

  try {
    const res = await fetch('/api/judge/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();

    if (res.ok && data.token) {
      // Save details to localStorage
      localStorage.setItem('techfusion_judge_token', data.token);
      localStorage.setItem('techfusion_judge_round', data.round);
      localStorage.setItem('techfusion_judge_email', email);
      
      // Redirect to the judge dashboard page
      window.location.href = '/judge-dashboard';
    } else {
      if (errorEl) {
        errorEl.textContent = data.message || 'Invalid judge credentials.';
        errorEl.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Judge login error:', err);
    if (errorEl) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }
  }
});
