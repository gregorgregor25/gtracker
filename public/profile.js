setActiveNav('nav-profile');

(async function init() {
  try {
    const profile = await fetchJSON('/api/profile');
    fillForm(profile);
  } catch (err) {
    showBanner('Unable to load profile', true);
  }
})();

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    age: document.getElementById('age').value,
    sex: document.getElementById('sex').value,
    height_cm: document.getElementById('height_cm').value,
    goal_weight: document.getElementById('goal_weight').value,
    activity_level: document.getElementById('activity_level').value,
  };
  try {
    await fetchJSON('/api/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showBanner('Profile saved');
    showToast('Profile updated');
  } catch (err) {
    showBanner('Save failed', true);
  }
});

function fillForm(profile) {
  document.getElementById('age').value = profile.age ?? '';
  document.getElementById('sex').value = profile.sex || 'male';
  document.getElementById('height_cm').value = profile.height_cm ?? '';
  document.getElementById('goal_weight').value = profile.goal_weight ?? '';
  document.getElementById('activity_level').value = profile.activity_level || 'moderate';
}

function showBanner(text, danger = false) {
  const banner = document.getElementById('profile-status');
  banner.style.display = 'block';
  banner.textContent = text;
  banner.style.background = danger ? '#fee2e2' : '#e0f2fe';
  banner.style.color = danger ? '#991b1b' : '#075985';
}
