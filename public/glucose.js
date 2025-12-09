setActiveNav('nav-glucose');
injectQuickActions();

let glucoseChart = null;
let glucoseData = [];
let currentRange = '7d';

(async function init() {
  const refreshBtn = document.getElementById('glucose-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadLatest(true));
  document.getElementById('glucose-range-1d').addEventListener('click', () => setRange('1d'));
  document.getElementById('glucose-range-7d').addEventListener('click', () => setRange('7d'));
  await loadLatest();
  await loadHistory();
})();

async function loadLatest(fromButton = false) {
  const latestEl = document.getElementById('glucose-latest');
  const trendEl = document.getElementById('glucose-trend');
  const timeEl = document.getElementById('glucose-timestamp');
  const unitEl = document.getElementById('glucose-unit');
  const statusEl = document.getElementById('glucose-status');
  if (fromButton) latestEl.textContent = 'Refreshing...';
  try {
    const res = await fetchJSON('/api/glucose/latest');
    if (!res.ok || !res.reading) throw new Error('No reading');
    const { value, unit, trend, timestamp } = res.reading;
    latestEl.textContent = value !== undefined && value !== null ? `${value} ${unit || ''}` : '—';
    trendEl.textContent = trend || '—';
    unitEl.textContent = unit || '—';
    const ts = timestamp ? new Date(timestamp) : null;
    timeEl.textContent = ts ? `Updated: ${ts.toLocaleString()}` : 'Updated: —';
    statusEl.style.display = 'none';
  } catch (err) {
    console.error('Glucose latest error', err);
    latestEl.textContent = 'Unavailable';
    trendEl.textContent = 'Could not fetch current glucose';
    unitEl.textContent = '—';
    timeEl.textContent = 'Updated: —';
    statusEl.textContent = 'Could not fetch current glucose from LibreLinkUp.';
    statusEl.style.display = 'block';
  }
}

async function loadHistory() {
  try {
    const res = await fetchJSON('/api/glucose/history');
    if (!res.ok || !Array.isArray(res.readings)) throw new Error('No readings');
    glucoseData = res.readings
      .filter((r) => r && r.timestamp)
      .map((r) => ({
        ...r,
        ts: new Date(r.timestamp),
      }))
      .sort((a, b) => a.ts - b.ts);
    renderChart();
    renderStats();
  } catch (err) {
    console.error('Glucose history error', err);
    const ctx = document.getElementById('glucose-chart').getContext('2d');
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = 'var(--text-muted)';
    ctx.fillText('Unable to load glucose history', 12, 24);
  }
}

function setRange(range) {
  currentRange = range;
  document.getElementById('glucose-range-1d').classList.toggle('secondary', range !== '1d');
  document.getElementById('glucose-range-7d').classList.toggle('secondary', range !== '7d');
  renderChart();
  renderStats();
}

function filteredData() {
  if (currentRange === '1d') {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return glucoseData.filter((d) => d.ts.getTime() >= cutoff);
  }
  return glucoseData;
}

function renderChart() {
  const points = filteredData();
  const ctx = document.getElementById('glucose-chart').getContext('2d');
  const labels = points.map((p) => p.ts.toLocaleString());
  const values = points.map((p) => p.value);
  const unitForIndex = (idx) => points[idx]?.unit || '';
  if (glucoseChart) glucoseChart.destroy();
  glucoseChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Glucose',
          data: values,
          borderColor: 'var(--accent)',
          backgroundColor: 'rgba(91, 124, 250, 0.15)',
          tension: 0.25,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.formattedValue} ${unitForIndex(ctx.dataIndex)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true },
          grid: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
      },
    },
  });
}

function renderStats() {
  const container = document.getElementById('glucose-stats');
  container.innerHTML = '';
  const points = filteredData();
  if (!points.length) return;
  const values = points.map((p) => Number(p.value)).filter((v) => !Number.isNaN(v));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const unit = points[0].unit || '';
  [
    { label: 'Average', value: `${avg.toFixed(1)} ${unit}` },
    { label: 'Lowest', value: `${min.toFixed(1)} ${unit}` },
    { label: 'Highest', value: `${max.toFixed(1)} ${unit}` },
  ].forEach((stat) => {
    const div = document.createElement('div');
    div.className = 'stat card-lite';
    div.innerHTML = `<p class="muted">${stat.label}</p><strong>${stat.value}</strong>`;
    container.appendChild(div);
  });
}
