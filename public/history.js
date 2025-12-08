setActiveNav('nav-history');
let entries = [];
let newestFirst = true;

(async function init() {
  entries = await fetchJSON('/api/entries');
  render();
})();

document.getElementById('month-filter').addEventListener('change', render);

document.getElementById('toggle-sort').addEventListener('click', () => {
  newestFirst = !newestFirst;
  document.getElementById('toggle-sort').textContent =
    newestFirst ? 'Newest first' : 'Oldest first';
  render();
});

function render() {
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  const filter = document.getElementById('month-filter').value;
  let filtered = entries;

  if (filter) {
    filtered = entries.filter((e) => e.date.startsWith(filter));
  }

  filtered = filtered.sort((a, b) =>
    newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
  );

  filtered.forEach((e) => {
    const tr = document.createElement('tr');
    const gymClass = e.gym_done ? 'badge success' : 'badge danger';
    const gymText = e.gym_done ? '✅' : '❌';
    const totalCalories = e.calories_total ?? e.calories_burned ?? 0;

    tr.innerHTML = `
      <td>${e.date}</td>
      <td><span class="${gymClass}">${gymText}</span></td>
      <td>${e.treadmill_minutes || 0}</td>
      <td>${totalCalories}</td>
      <td>${e.carbs || 0}</td>
      <td>${formatNumber(e.weight_kg, 1)}</td>
      <td>${e.mood || '—'}</td>
      <td>${e.notes ? e.notes : ''}</td>
    `;
    tbody.appendChild(tr);
  });
}
