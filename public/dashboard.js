const TREADMILL_GOAL = 120;
const GLUCOSE_INTERVAL_MS = 5 * 60 * 1000;
let glucoseRefreshTimer = null;

(async function init() {
  setActiveNav('nav-dashboard');
  await loadToday();
  await loadSummary();
  await loadGlucose();
  const refresh = document.getElementById('glucose-refresh');
  if (refresh) {
    refresh.addEventListener('click', () => loadGlucose(true));
  }
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

    const caloriesGym = entry.calories_gym ?? 0;
    const caloriesTread = entry.calories_treadmill ?? 0;
    const caloriesTotal = entry.calories_total ?? entry.calories_burned ?? caloriesGym + caloriesTread;
    document.getElementById('stat-calories-gym').textContent = caloriesGym;
    document.getElementById('stat-calories-tread').textContent = caloriesTread;
    document.getElementById('stat-calories-total').textContent = caloriesTotal;
    document.getElementById('stat-carbs').textContent = entry.carbs || 0;
    document.getElementById('stat-weight').textContent = formatNumber(entry.weight_kg, 1);
    document.getElementById('stat-treadmill').textContent = entry.treadmill_minutes || 0;

    const progress = Math.min(100, Math.round(((entry.treadmill_minutes || 0) / TREADMILL_GOAL) * 100));
    document.getElementById('treadmill-progress').style.width = `${progress}%`;
    animateRing(document.getElementById('treadmill-ring'), progress);

    const message = entry.gym_done && entry.treadmill_minutes >= TREADMILL_GOAL
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
    const [summary, streaks, entries, dailyGoal] = await Promise.all([
      fetchJSON('/api/summary/week'),
      fetchJSON('/api/summary/streaks'),
      fetchJSON('/api/entries'),
      fetchJSON('/api/summary/daily-goal'),
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

    const badgeCatalog = buildBadgeCatalog(entries, summary, streaks);
    const unlocked = badgeCatalog.filter((b) => b.achieved).slice(0, 3);
    if (unlocked.length) {
      unlocked.forEach((badge) => {
        const chip = document.createElement('span');
        chip.className = 'badge subtle';
        chip.textContent = `${badge.icon} ${badge.title}`;
        badgeContainer.appendChild(chip);
      });
    }

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

    const target = Math.round(dailyGoal.recommended_calories || 0);
    const burnedToday = Math.round(dailyGoal.calories_burned || dailyGoal.today_total_burned || 0);
    const consumedToday = Math.round(dailyGoal.calories_consumed || 0);
    const netToday = Math.round(dailyGoal.net_calories || (consumedToday - burnedToday));
    document.getElementById('stat-bmr').textContent = Math.round(dailyGoal.bmr || 0);
    document.getElementById('stat-tdee').textContent = Math.round(dailyGoal.tdee || 0);
    document.getElementById('stat-target').textContent = target;
    document.getElementById('stat-consumed').textContent = consumedToday;
    document.getElementById('stat-burned').textContent = burnedToday;
    document.getElementById('stat-net').textContent = netToday;
    const netStatus = document.getElementById('net-status');
    netStatus.classList.remove('success', 'danger');
    if (netToday > 0) {
      netStatus.textContent = 'Surplus';
      netStatus.classList.add('danger');
    } else {
      netStatus.textContent = 'Deficit';
      netStatus.classList.add('success');
    }
    const surplusLabel = netToday > 0 ? 'surplus' : 'deficit';
    document.getElementById('energy-note').textContent = `Eaten: ${consumedToday} kcal • Burned: ${burnedToday} kcal • Net: ${netToday} kcal (${surplusLabel}) • Target: ${target} kcal`;
  } catch (err) {
    document.getElementById('consistency-label').textContent = 'Unable to load summary';
    const netStatus = document.getElementById('net-status');
    if (netStatus) {
      netStatus.textContent = 'Unavailable';
      netStatus.classList.add('danger');
    }
  }
}

function addAchievement(container, icon, text) {
  const badge = document.createElement('div');
  badge.className = 'achievement';
  badge.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
  container.appendChild(badge);
}

async function loadGlucose(fromButton = false) {
  const valueEl = document.getElementById('glucose-value');
  const trendEl = document.getElementById('glucose-trend');
  const timeEl = document.getElementById('glucose-time');
  if (!valueEl || !trendEl || !timeEl) return;
  if (fromButton) {
    valueEl.textContent = 'Refreshing...';
  }
  try {
    const data = await fetchJSON('/api/glucose/latest');
    if (!data.ok || !data.reading) throw new Error('No reading');
    const reading = data.reading;
    const unit = reading.unit ? ` ${reading.unit}` : '';
    valueEl.textContent = reading.value !== undefined && reading.value !== null ? `${reading.value}${unit}` : '—';
    trendEl.textContent = `Trend: ${reading.trend || '—'}`;
    const time = reading.timestamp ? new Date(reading.timestamp) : null;
    timeEl.textContent = time ? `Updated: ${time.toLocaleString()}` : 'Updated: —';
    scheduleNextGlucoseRefresh(time ? time.getTime() : null);
  } catch (err) {
    console.error('Glucose fetch failed', err);
    valueEl.textContent = 'Unavailable';
    trendEl.textContent = 'Could not fetch current glucose from LibreLinkUp.';
    timeEl.textContent = 'Updated: —';
    scheduleNextGlucoseRefresh(null);
  }
}

function scheduleNextGlucoseRefresh(lastTimestamp) {
  if (glucoseRefreshTimer) {
    clearTimeout(glucoseRefreshTimer);
  }
  let delay = GLUCOSE_INTERVAL_MS;
  if (lastTimestamp) {
    const targetTime = lastTimestamp + GLUCOSE_INTERVAL_MS;
    const untilTarget = targetTime - Date.now();
    delay = Math.max(30 * 1000, untilTarget);
  }
  glucoseRefreshTimer = setTimeout(() => loadGlucose(), delay + 10 * 1000);
}
