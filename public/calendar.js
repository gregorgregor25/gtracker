const TREADMILL_GOAL = 120;

(async function init() {
  setActiveNav('nav-calendar');
  await Promise.all([loadHeatmap(), loadStreaks()]);
})();

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfHeatmap(today = new Date()) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 364);
  const offset = (start.getDay() + 6) % 7; // align to Monday
  start.setDate(start.getDate() - offset);
  return start;
}

function dailyScore(entry) {
  if (!entry) return 0;
  const gymScore = entry.gym_done ? 60 : 0;
  const treadRatio = Math.min((entry.treadmill_minutes || 0) / TREADMILL_GOAL, 1);
  const treadScore = Math.round(treadRatio * 40);
  return gymScore + treadScore;
}

async function loadHeatmap() {
  try {
    const entries = await fetchJSON('/api/entries');
    const map = new Map(entries.map((e) => [e.date, e]));
    const today = new Date();
    const start = startOfHeatmap(today);
    const end = new Date(today);
    end.setHours(0, 0, 0, 0);

    document.getElementById('calendar-range').textContent = `${formatLocalDate(start)} → ${formatLocalDate(end)}`;

    const heatmap = document.getElementById('heatmap');
    heatmap.innerHTML = '';
    const tooltip = document.getElementById('heatmap-tooltip');

    let cursor = new Date(start);
    let peak = { score: -1, date: null };
    let totalScore = 0;
    let scoredDays = 0;

    while (cursor <= end) {
      const week = document.createElement('div');
      week.className = 'week';

      for (let i = 0; i < 7; i++) {
        const dateStr = formatLocalDate(cursor);
        const entry = map.get(dateStr);
        const score = dailyScore(entry);
        if (score > peak.score) peak = { score, date: dateStr, entry };
        if (entry) {
          totalScore += score;
          scoredDays += 1;
        }

        const cell = document.createElement('div');
        cell.className = `day level-${score === 0 ? 0 : score < 40 ? 1 : score < 70 ? 2 : 3}`;
        cell.dataset.date = dateStr;
        cell.dataset.score = score;
        cell.dataset.gym = entry?.gym_done ? 'Yes' : 'No';
        cell.dataset.treadmill = entry?.treadmill_minutes || 0;
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `${dateStr} score ${score}`);

        if (entry?.gym_done) {
          const dot = document.createElement('span');
          dot.className = 'gym-dot';
          cell.appendChild(dot);
        }

        cell.addEventListener('mouseenter', (e) => showTooltip(e, tooltip));
        cell.addEventListener('mouseleave', () => hideTooltip(tooltip));
        cell.addEventListener('click', (e) => showTooltip(e, tooltip, true));

        week.appendChild(cell);
        cursor.setDate(cursor.getDate() + 1);
        if (cursor > end) break;
      }
      heatmap.appendChild(week);
    }

    const avgScore = scoredDays ? Math.round(totalScore / scoredDays) : 0;
    document.getElementById('calendar-summary-pill').textContent = motivationalText(avgScore);
    document.getElementById('calendar-peak-date').textContent = peak.date || '—';
    document.getElementById('calendar-peak-score').textContent = peak.date
      ? `Score ${peak.score}% • Gym ${peak.entry?.gym_done ? 'yes' : 'no'}`
      : 'Log days to reveal a peak';
  } catch (err) {
    document.getElementById('heatmap').innerHTML = '<p class="muted">Unable to load calendar.</p>';
    document.getElementById('calendar-summary-pill').textContent = 'Load error';
  }
}

function showTooltip(event, tooltip, lock = false) {
  const cell = event.currentTarget;
  tooltip.textContent = `${cell.dataset.date} — Score: ${cell.dataset.score} — Gym: ${cell.dataset.gym} — Treadmill: ${cell.dataset.treadmill} min`;
  tooltip.style.opacity = '1';
  const rect = cell.getBoundingClientRect();
  tooltip.style.left = `${rect.left + window.scrollX}px`;
  tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
  if (lock) {
    setTimeout(() => hideTooltip(tooltip), 2000);
  }
}

function hideTooltip(tooltip) {
  tooltip.style.opacity = '0';
}

async function loadStreaks() {
  try {
    const streaks = await fetchJSON('/api/summary/streaks');
    document.getElementById('calendar-streaks').textContent = `${streaks.current_gym_streak}-day streak now`;
    document.getElementById('calendar-best-streak').textContent = `${streaks.longest_gym_streak} days`;
    document.getElementById('calendar-best-detail').textContent = 'Your all-time best run';
    document.getElementById('calendar-current-streak').textContent = `${streaks.current_gym_streak} days`;
  } catch (err) {
    document.getElementById('calendar-streaks').textContent = 'Streaks unavailable';
  }
}
