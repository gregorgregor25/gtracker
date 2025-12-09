const TREADMILL_GOAL = TREADMILL_GOAL_MINUTES;

(async function init() {
  setActiveNav('nav-badges');
  try {
    const [entries, summary, streaks] = await Promise.all([
      fetchJSON('/api/entries'),
      fetchJSON('/api/summary/week'),
      fetchJSON('/api/summary/streaks'),
    ]);

    const badgeCatalog = buildBadgeCatalog(entries, summary, streaks);
    renderBadgeHero(badgeCatalog);
    renderBadgeSummary(entries, summary, streaks, badgeCatalog);
    renderBadgeList(badgeCatalog);
  } catch (err) {
    const list = document.getElementById('badge-list');
    if (list) list.innerHTML = '<p class="muted">Unable to load badges right now.</p>';
  }
})();

function renderBadgeHero(badges) {
  const unlocked = badges.filter((b) => b.achieved);
  const progress = document.getElementById('badge-progress');
  if (progress) progress.textContent = `${unlocked.length} / ${badges.length} unlocked`;

  const highlight = document.getElementById('badge-highlight');
  if (highlight) highlight.textContent = unlocked.length ? 'Keep stacking badges' : 'First badge is waiting';

  const spotlight = document.getElementById('badge-spotlight');
  const detail = document.getElementById('badge-spotlight-detail');
  const target = unlocked.length ? unlocked[0] : badges.find((b) => !b.achieved) || badges[0];
  if (spotlight) spotlight.textContent = target ? `${target.icon} ${target.title}` : 'Badges ready';
  if (detail) detail.textContent = target?.description || 'Progress updates as you log days.';
}

function renderBadgeSummary(entries, summary, streaks, badges) {
  const totalDistance = entries.reduce((sum, e) => sum + (Number(e.treadmill_distance_km) || 0), 0);
  const totalMinutes = entries.reduce((sum, e) => sum + (Number(e.treadmill_minutes) || 0), 0);
  const treadmillGoalDays = entries.filter((e) => (Number(e.treadmill_minutes) || 0) >= TREADMILL_GOAL).length;
  const latestWeight = [...entries].reverse().find((e) => e.weight_kg !== null && e.weight_kg !== undefined)?.weight_kg;
  const bestWeight = entries.find((e) => e.weight_kg !== null && e.weight_kg !== undefined)?.weight_kg;
  const weightDelta = bestWeight !== undefined && latestWeight !== undefined ? bestWeight - latestWeight : null;

  const streakGrid = document.getElementById('badge-summary-grid');
  if (streakGrid) {
    streakGrid.innerHTML = '';
    streakGrid.appendChild(renderMiniStat('Current streak', `${streaks.current_gym_streak} days`));
    streakGrid.appendChild(renderMiniStat('Best streak', `${streaks.longest_gym_streak} days`));
    streakGrid.appendChild(renderMiniStat('Weekly consistency', `${summary.consistency_score || 0}%`));
    streakGrid.appendChild(renderMiniStat('Logged days', `${(summary.entries || []).length || 0}/7`));
  }

  const milestoneGrid = document.getElementById('badge-milestones');
  if (milestoneGrid) {
    milestoneGrid.innerHTML = '';
    milestoneGrid.appendChild(renderMiniStat('Treadmill km', `${totalDistance.toFixed(1)} km`));
    milestoneGrid.appendChild(renderMiniStat('Treadmill minutes', `${totalMinutes} min`));
    milestoneGrid.appendChild(renderMiniStat('Goal days', `${treadmillGoalDays} days ≥120m`));
    const weightLabel = weightDelta !== null ? `${weightDelta.toFixed(1)} kg change` : '—';
    milestoneGrid.appendChild(renderMiniStat('Weight shift', weightLabel));
  }
}

function renderMiniStat(title, value) {
  const wrap = document.createElement('div');
  wrap.className = 'stat';
  wrap.innerHTML = `<div>${title}</div><strong>${value}</strong>`;
  return wrap;
}

function renderBadgeList(badges) {
  const list = document.getElementById('badge-list');
  if (!list) return;
  list.innerHTML = '';

  const categories = Array.from(new Set(badges.map((b) => b.category)));
  document.getElementById('badge-filter-label').textContent = `${categories.length} categories`;

  categories.forEach((category) => {
    const header = document.createElement('h3');
    header.textContent = category;
    header.className = 'section-title';
    list.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid two';
    badges
      .filter((b) => b.category === category)
      .forEach((badge) => grid.appendChild(renderBadgeCard(badge)));
    list.appendChild(grid);
  });
}

function renderBadgeCard(badge) {
  const card = document.createElement('div');
  card.className = `card badge-card fade-in ${badge.achieved ? 'achieved' : 'locked'}`;
  card.innerHTML = `
    <div class="badge-icon">${badge.icon}</div>
    <div class="badge-content">
      <div class="flex" style="justify-content: space-between; align-items:center; gap:8px;">
        <h3>${badge.title}</h3>
        <span class="badge ${badge.achieved ? 'success' : ''}">${badge.achieved ? 'Unlocked' : 'Locked'}</span>
      </div>
      <p class="muted">${badge.description}</p>
      <div class="badge-status">${badge.detail || ''}</div>
    </div>
  `;
  return card;
}
