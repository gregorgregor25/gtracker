async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error('Request failed');
  }
  return res.json();
}

function setActiveNav(id) {
  document.querySelectorAll('.nav a').forEach((link) => {
    if (link.id === id) link.classList.add('active');
    else link.classList.remove('active');
  });
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(digits);
}

function motivationalText(score) {
  if (score >= 80) return 'You\'re on fire 🔥';
  if (score >= 60) return 'Solid momentum 💪';
  if (score >= 40) return 'Getting going 🚀';
  return 'Fresh start week ✨';
}

function badgeList(summary, streaks) {
  const badges = [];
  if (streaks.current_gym_streak >= 5) badges.push(`${streaks.current_gym_streak}-day gym streak`);
  if (summary.treadmill_days >= 3) badges.push('3+ treadmill days this week');
  if (summary.consistency_score >= 80) badges.push('Consistency beast');
  if (summary.gym_days >= 4) badges.push('Gym majority week');
  return badges;
}
