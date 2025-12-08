setActiveNav('nav-edit');
loadForm();

document.getElementById('today-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    gym_done: document.getElementById('gym_done').checked,
    treadmill_minutes: document.getElementById('treadmill_minutes').value,
    treadmill_distance_km: document.getElementById('treadmill_distance_km').value,
    calories_burned: document.getElementById('calories_burned').value,
    carbs: document.getElementById('carbs').value,
    weight_kg: document.getElementById('weight_kg').value,
    mood: document.getElementById('mood').value,
    notes: document.getElementById('notes').value,
  };

  try {
    const saved = await fetchJSON('/api/entries', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    showStatus('Saved! Nice work.');
    if (saved.gym_done && saved.treadmill_minutes >= 120) {
      showStatus('You smashed it today! Perfect training day!');
    }
  } catch (err) {
    showStatus('Save failed. Please try again.', true);
  }
});

async function loadForm() {
  try {
    const entry = await fetchJSON('/api/entries/today');
    document.getElementById('gym_done').checked = !!entry.gym_done;
    document.getElementById('treadmill_minutes').value = entry.treadmill_minutes || '';
    document.getElementById('treadmill_distance_km').value = entry.treadmill_distance_km || '';
    document.getElementById('calories_burned').value = entry.calories_burned || '';
    document.getElementById('carbs').value = entry.carbs || '';
    document.getElementById('weight_kg').value = entry.weight_kg || '';
    document.getElementById('mood').value = entry.mood || '';
    document.getElementById('notes').value = entry.notes || '';
  } catch (err) {
    showStatus('Unable to load today\'s entry', true);
  }
}

function showStatus(text, danger = false) {
  const banner = document.getElementById('save-status');
  banner.style.display = 'block';
  banner.textContent = text;
  banner.style.background = danger ? '#fee2e2' : '#e0f2fe';
  banner.style.color = danger ? '#991b1b' : '#075985';
}
