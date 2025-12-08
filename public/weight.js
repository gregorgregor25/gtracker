setActiveNav('nav-weight');
renderChart();

async function renderChart() {
  try {
    const entries = await fetchJSON('/api/entries');
    const weightEntries = entries.filter((e) => e.weight_kg !== null && e.weight_kg !== undefined);
    const labels = weightEntries.map((e) => e.date);
    const data = weightEntries.map((e) => e.weight_kg);

    if (!data.length) {
      document.getElementById('weight-stats').innerHTML = '<p class="muted">No weight data yet.</p>';
      return;
    }

    const ctx = document.getElementById('weight-chart');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Weight (kg)',
            data,
            borderColor: '#2563eb',
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: false },
        },
      },
    });

    const latest = data[data.length - 1];
    const first = data[0];
    const diff = latest - first;
    const pct = ((diff / first) * 100).toFixed(1);

    document.getElementById('weight-stats').innerHTML = `
      <div class="stat"><div>Latest weight</div><strong>${formatNumber(latest, 1)} kg</strong></div>
      <div class="stat"><div>First logged</div><strong>${formatNumber(first, 1)} kg</strong></div>
      <div class="stat"><div>Change</div><strong>${formatNumber(diff, 1)} kg</strong></div>
      <div class="stat"><div>Percent change</div><strong>${pct}%</strong></div>
    `;
  } catch (err) {
    document.getElementById('weight-stats').innerHTML = '<p class="muted">Unable to load chart.</p>';
  }
}
