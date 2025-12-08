const TREADMILL_GOAL = 120;

(async function init() {
  setActiveNav('nav-dashboard');
  await loadToday();
  await loadSummary();
})();

async function loadToday() {
  try {
    const entry = await fetchJSON('/api/entries/today');
    document.getElementById('today-date').textContent = entry.date;
    updateMoodBadge(entry.mood);

    const previousGym = localStorage.getItem('gtracker-lastGym') === 'true';
    const previousTreadGoal = localStorage.getItem('gtracker-lastTreadGoal') === 'true';

    const gymBadge = document.getElementById('gym-status');
    if (entry.gym_done) {
      gymBadge.textContent = '✔️ Gym done';
      gymBadge.classList.add('success');
      gymBadge.classList.remove('danger');
      if (!previousGym) {
        launchConfetti();
        showToast('Gym complete!');
      }
    } else {
      gymBadge.textContent = '⚠️ Gym not yet';
      gymBadge.classList.add('danger');
      gymBadge.classList.remove('success');
    }

    document.getElementById('stat-calories').textContent = entry.calories_burned || 0;
    document.getElementById('stat-carbs').textContent = entry.carbs || 0;
    document.getElementById('stat-weight').textContent = formatNumber(entry.weight_kg, 1);
    document.getElementById('stat-treadmill').textContent = entry.treadmill_minutes || 0;

    const progress = Math.min(
      100,
      Math.round(((entry.treadmill_minutes || 0) / TREADMILL_GOAL) * 100)
    );
    document.getElementById('treadmill-progress').style.width = `${progress}%`;
    animateRing(document.getElementById('treadmill-ring'), progress);

    const message =
      entry.gym_done && entry.treadmill_minutes >= TREADMILL_GOAL
        ? 'You smashed it today! Perfect training day!'
        : entry.gym_done
        ? 'Great job hitting the gym!'
        : 'You got this. Gym time awaits.';
    document.getElementById('today-message').textContent = message;

    if (entry.gym_done && entry.treadmill_minutes >= TREADMILL_GOAL && !previousTreadGoal) {
      launchConfetti();
      showToast('Treadmill target crushed!');
    }

    localStorage.setItem('gtracker-lastGym', !!entry.gym_done);
    localStorage.setItem('gtracker-lastTreadGoal', entry.treadmill_minutes >= TREADMILL_GOAL);
  } catch (err) {
    document.getElementById('today-message').textContent = "Unable to load today's data";
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
    document.getElementById('streak-ribbon').textContent = `${streaks.current_gym_streak}-day streak`;

    const score = summary.consistency_score;
    document.getElementById('consistency-score').textContent = score;
    document.getElementById('consistency-label').textContent = motivationalText(score);
    document.getElementById('consistency-progress').style.width = `${score}%`;
    document.getElementById('motivation-heading').textContent = motivationalText(score);

    const badgeContainer = document.getElementById('badge-container');
    badgeContainer.innerHTML = '';
    badgeList(summary, streaks).forEach((text) => {
      const span = document.createElement('span');
      span.className = 'badge success';
      span.textContent = text;
      badgeContainer.appendChild(span);
    });

    const achievementArea = document.getElementById('achievement-badges');
    achievementArea.innerHTML = '';
    if (streaks.current_gym_streak >= 5) addAchievement(achievementArea, '🏆', '5-day streak');
    if (summary.treadmill_days >= 3) addAchievement(achievementArea, '🚶‍♂️', '3 treadmill sessions');
    if ((summary.entries || []).length >= 7) addAchievement(achievementArea, '🗓️', 'Logged every day this week');

    const storedBest = Number(localStorage.getItem('gtracker-bestStreak') || 0);
    if (streaks.longest_gym_streak > storedBest) {
      showToast('New best streak!');
      launchConfetti();
      localStorage.setItem('gtracker-bestStreak', streaks.longest_gym_streak);
    }
  } catch (err) {
    document.getElementById('consistency-label').textContent = 'Unable to load summary';
  }
}

function addAchievement(container, icon, text) {
  const badge = document.createElement('div');
  badge.className = 'achievement';
  badge.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
  container.appendChild(badge);
}
