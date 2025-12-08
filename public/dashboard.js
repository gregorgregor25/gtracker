(async function init() {
  setActiveNav('nav-dashboard');
  await loadToday();
  await loadSummary();
})();

async function loadToday() {
  try {
    const entry = await fetchJSON('/api/entries/today');
    document.getElementById('today-date').textContent = entry.date;
    const gymBadge = document.getElementById('gym-status');
    if (entry.gym_done) {
      gymBadge.textContent = 'Gym done';
      gymBadge.classList.add('success');
    } else {
      gymBadge.textContent = 'Gym not yet';
      gymBadge.classList.add('danger');
    }

    document.getElementById('stat-calories').textContent = entry.calories_burned || 0;
    document.getElementById('stat-carbs').textContent = entry.carbs || 0;
    document.getElementById('stat-weight').textContent = formatNumber(entry.weight_kg, 1);
    document.getElementById('stat-treadmill').textContent = entry.treadmill_minutes || 0;

    const progress = Math.min(100, Math.round(((entry.treadmill_minutes || 0) / 120) * 100));
    document.getElementById('treadmill-progress').style.width = `${progress}%`;

    const message = entry.gym_done && entry.treadmill_minutes >= 120
      ? 'You smashed it today! Perfect training day!'
      : entry.gym_done
      ? 'Great job hitting the gym!'
      : 'You got this. Gym time awaits.';
    document.getElementById('today-message').textContent = message;
  } catch (err) {
    document.getElementById('today-message').textContent = 'Unable to load today\'s data';
  }
}

async function loadSummary() {
  try {
    const [summary, streaks] = await Promise.all([
      fetchJSON('/api/summary/week'),
      fetchJSON('/api/summary/streaks'),
    ]);

    document.getElementById('current-streak').textContent = streaks.current_gym_streak;
    document.getElementById('best-streak').textContent = streaks.longest_gym_streak;

    document.getElementById('consistency-score').textContent = summary.consistency_score;
    document.getElementById('consistency-label').textContent = motivationalText(summary.consistency_score);
    document.getElementById('consistency-progress').style.width = `${summary.consistency_score}%`;

    const badgeContainer = document.getElementById('badge-container');
    badgeContainer.innerHTML = '';
    badgeList(summary, streaks).forEach((text) => {
      const span = document.createElement('span');
      span.className = 'badge success';
      span.textContent = text;
      badgeContainer.appendChild(span);
    });
  } catch (err) {
    document.getElementById('consistency-label').textContent = 'Unable to load summary';
  }
}
