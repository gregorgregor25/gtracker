const TREADMILL_GOAL = 120;

(function init() {
  setActiveNav('nav-weekly');
  loadWeekly();
})();

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  const start = new Date(d);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dailyScore(entry) {
  const gymScore = entry.gym_done ? 60 : 0;
  const treadRatio = Math.min((entry.treadmill_minutes || 0) / TREADMILL_GOAL, 1);
  const treadScore = Math.round(treadRatio * 40);
  return gymScore + treadScore;
}

async function loadWeekly() {
  try {
    const entries = await fetchJSON('/api/entries');
    const range = startOfWeek();
    const weeklyEntries = entries.filter((e) => {
      const date = parseDate(e.date);
      return date >= range.start && date <= range.end;
    });

    const rangeLabel = `${formatLocalDate(range.start)} → ${formatLocalDate(range.end)}`;
    document.getElementById('week-range').textContent = rangeLabel;

    if (!weeklyEntries.length) {
      document.getElementById('weekly-status').textContent = 'No entries yet this week';
      document.getElementById('day-list').innerHTML = '<p class="muted">Log a day to see insights.</p>';
      return;
    }

    renderWeeklyStats(weeklyEntries);
    renderDailyCards(weeklyEntries);
  } catch (err) {
    document.getElementById('weekly-status').textContent = 'Unable to load weekly summary';
    document.getElementById('day-list').innerHTML = '<p class="muted">Please try again later.</p>';
  }
}

function renderWeeklyStats(entries) {
  const totals = entries.reduce(
    (acc, e) => {
      acc.calories += e.calories_total ?? e.calories_burned ?? 0;
      acc.treadmill += e.treadmill_minutes || 0;
      acc.gymDays += e.gym_done ? 1 : 0;
      if (e.weight_kg !== null && e.weight_kg !== undefined) {
        acc.weightValues.push(e.weight_kg);
      }
      if (e.mood) acc.moods.push(e.mood);
      acc.dailyScores.push(dailyScore(e));
      if ((e.treadmill_minutes || 0) >= TREADMILL_GOAL) acc.treadGoalHits += 1;
      if (e.carbs || e.carbs === 0) {
        if (acc.lowestCarbs === null || e.carbs < acc.lowestCarbs.value) {
          acc.lowestCarbs = { value: e.carbs, date: e.date };
        }
      }
      return acc;
    },
    { calories: 0, treadmill: 0, gymDays: 0, weightValues: [], moods: [], dailyScores: [], treadGoalHits: 0, lowestCarbs: null }
  );

  const avgWeight = totals.weightValues.length
    ? (totals.weightValues.reduce((a, b) => a + b, 0) / totals.weightValues.length).toFixed(1)
    : '—';
  const consistency = totals.dailyScores.length
    ? Math.round(totals.dailyScores.reduce((a, b) => a + b, 0) / totals.dailyScores.length)
    : 0;
  const bestMood = selectBestMood(totals.moods);
  const bestDay = selectBestDay(entries);

  document.getElementById('weekly-calories').textContent = totals.calories;
  document.getElementById('weekly-treadmill').textContent = totals.treadmill;
  document.getElementById('weekly-weight').textContent = avgWeight;
  document.getElementById('weekly-gym-days').textContent = totals.gymDays;
  document.getElementById('weekly-consistency').textContent = `${consistency}%`;
  document.getElementById('weekly-consistency-progress').style.width = `${consistency}%`;
  document.getElementById('weekly-consistency-label').textContent = motivationalText(consistency);
  document.getElementById('weekly-mood').textContent = bestMood.label;
  document.getElementById('best-mood-badge').textContent = `Mood: ${bestMood.label}`;

  document.getElementById('insight-best-day').textContent = bestDay ? bestDay.date : '—';
  document.getElementById('insight-best-day-detail').textContent = bestDay
    ? `Consistency score ${bestDay.score}%`
    : 'Log more days to unlock this insight';
  document.getElementById('insight-tread-goal').textContent = `${totals.treadGoalHits} day(s)`;
  document.getElementById('insight-carbs').textContent = totals.lowestCarbs
    ? `${totals.lowestCarbs.value}g`
    : '—';
  document.getElementById('insight-carbs-detail').textContent = totals.lowestCarbs
    ? `Lowest on ${totals.lowestCarbs.date}`
    : 'No carb data yet';

  const status = document.getElementById('weekly-status');
  status.textContent = consistency >= 80 ? 'You are on fire this week' : consistency >= 60 ? 'Solid groove' : 'Fresh start in progress';
}

function selectBestMood(moods) {
  const order = ['low', 'ok', 'good', 'great'];
  let best = null;
  moods.forEach((mood) => {
    if (best === null || order.indexOf(mood) > order.indexOf(best)) best = mood;
  });
  if (!best) return { label: '—' };
  const emoji = { low: '🌥️', ok: '🙂', good: '😄', great: '🤩' }[best] || '';
  return { label: `${best}${emoji ? ' ' + emoji : ''}` };
}

function selectBestDay(entries) {
  if (!entries.length) return null;
  return entries.reduce(
    (best, e) => {
      const score = dailyScore(e);
      if (!best || score > best.score) return { date: e.date, score };
      return best;
    },
    null
  );
}

function renderDailyCards(entries) {
  const container = document.getElementById('day-list');
  container.innerHTML = '';

  entries
    .slice()
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'mini-card';
      const weightLabel = entry.weight_kg || entry.weight_kg === 0 ? entry.weight_kg.toFixed(1) : '—';
      card.innerHTML = `
        <div class="flex" style="justify-content: space-between; align-items:center;">
          <strong>${entry.date}</strong>
          <span class="badge ${entry.gym_done ? 'success' : 'danger'}">${entry.gym_done ? 'Gym ✔️' : 'Gym ❌'}</span>
        </div>
        <div class="muted">Calories: ${entry.calories_total ?? entry.calories_burned ?? 0} • Carbs: ${entry.carbs || 0}g</div>
        <div class="muted">Treadmill: ${entry.treadmill_minutes || 0} min • Weight: ${weightLabel} kg</div>
        <div class="progress" aria-label="Daily consistency">
          <span style="width:${dailyScore(entry)}%"></span>
        </div>
      `;
      container.appendChild(card);
    });
}
