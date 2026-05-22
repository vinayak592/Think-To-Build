(function () {
  'use strict';

  const countdowns = document.querySelectorAll('[data-countdown-target]');
  if (countdowns.length === 0) return;

  function formatValue(value) {
    return String(value).padStart(2, '0');
  }

  function updateCountdown(countdown) {
    const target = new Date(countdown.dataset.countdownTarget);
    if (Number.isNaN(target.getTime())) return false;

    const remainingMs = Math.max(0, target.getTime() - Date.now());
    const totalSeconds = Math.floor(remainingMs / 1000);
    const values = {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60
    };

    Object.entries(values).forEach(([key, value]) => {
      const valueEl = countdown.querySelector(`[data-countdown-value="${key}"]`);
      if (valueEl) valueEl.textContent = formatValue(value);
    });

    const reachedTarget = remainingMs === 0;
    countdown.classList.toggle('is-complete', reachedTarget);

    const title = countdown.querySelector('.event-countdown-copy strong');
    if (title && reachedTarget) title.textContent = 'June 5 is here';

    return !reachedTarget;
  }

  const activeCountdowns = Array.from(countdowns).filter(updateCountdown);
  if (activeCountdowns.length === 0) return;

  const intervalId = window.setInterval(() => {
    const stillRunning = activeCountdowns.map(updateCountdown).some(Boolean);
    if (!stillRunning) window.clearInterval(intervalId);
  }, 1000);
})();
