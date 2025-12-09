setActiveNav('nav-profile');

(async function init() {
  try {
    const profile = await fetchJSON('/api/profile');
    fillForm(profile);
  } catch (err) {
    showBanner('Unable to load profile', true);
  }
  await loadLibreLinkConfig();
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

async function loadLibreLinkConfig() {
  try {
    const cfg = await fetchJSON('/api/glucose/config');
    const statusEl = document.getElementById('llu-status');
    if (cfg.ok && cfg.configured) {
      statusEl.textContent = `Configured for ${cfg.email || 'your account'} (${cfg.region || 'default region'} / ${cfg.tld || 'io'})`;
      statusEl.style.background = '#e0f2fe';
      statusEl.style.color = '#075985';
    } else {
      statusEl.textContent = 'LibreLinkUp not configured yet. Enter your login to enable glucose fetches.';
      statusEl.style.background = '#fff7ed';
      statusEl.style.color = '#9a3412';
    }
    setUnitPreference(cfg.unit || 'mg/dL');
    statusEl.style.display = 'block';
  } catch (err) {
    const statusEl = document.getElementById('llu-status');
    statusEl.textContent = 'Unable to load LibreLinkUp configuration.';
    statusEl.style.display = 'block';
    statusEl.style.background = '#fee2e2';
    statusEl.style.color = '#991b1b';
  }
}

document.getElementById('llu-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    email: document.getElementById('llu-email').value.trim(),
    password: document.getElementById('llu-password').value,
    region: document.getElementById('llu-region').value.trim(),
    tld: document.getElementById('llu-tld').value.trim(),
    unit: document.getElementById('llu-unit').value,
  };
  const statusEl = document.getElementById('llu-status');
  try {
    const res = await fetchJSON('/api/glucose/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    statusEl.textContent = `Saved. Configured for ${res.email || 'your account'} (${res.region || 'default region'} / ${res.tld || 'io'}).`;
    statusEl.style.display = 'block';
    statusEl.style.background = '#e0f2fe';
    statusEl.style.color = '#075985';
    setUnitPreference(res.unit || payload.unit);
    showToast('LibreLinkUp credentials saved');
    document.getElementById('llu-password').value = '';
  } catch (err) {
    statusEl.textContent = 'Could not save LibreLinkUp credentials. Please check your details and try again.';
    statusEl.style.display = 'block';
    statusEl.style.background = '#fee2e2';
    statusEl.style.color = '#991b1b';
  }
});

document.querySelectorAll('#llu-unit-toggle button').forEach((btn) => {
  btn.addEventListener('click', () => setUnitPreference(btn.dataset.unit));
});

function setUnitPreference(unit) {
  const normalized = unit && unit.toLowerCase().includes('mmol') ? 'mmol/L' : 'mg/dL';
  document.getElementById('llu-unit').value = normalized;
  document.querySelectorAll('#llu-unit-toggle button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.unit === normalized);
  });
}
