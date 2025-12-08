let installPromptEvent = null;
let lastGymDone = null;
let lastBestStreak = null;

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error('Request failed');
  }
  return res.json();
}

function setActiveNav(id) {
  document.querySelectorAll('.nav a').forEach((link) => {
    if (link.id === id) link.classList.add('active');
    else link.classList.remove('active');
  });
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(digits);
}

function motivationalText(score) {
  if (score >= 80) return "You're on fire 🔥";
  if (score >= 60) return 'Solid momentum 💪';
  if (score >= 40) return 'Getting going 🚀';
  return 'Fresh start week ✨';
}

function badgeList(summary, streaks) {
  const badges = [];
  if (streaks.current_gym_streak >= 5) badges.push(`${streaks.current_gym_streak}-day gym streak`);
  if (summary.treadmill_days >= 3) badges.push('3+ treadmill days this week');
  if (summary.consistency_score >= 80) badges.push('Consistency beast');
  if (summary.gym_days >= 4) badges.push('Gym majority week');
  return badges;
}

// Theme handling
const root = document.documentElement;
const storedTheme = localStorage.getItem('gtracker-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
setTheme(initialTheme);

function setTheme(mode) {
  root.setAttribute('data-theme', mode);
  localStorage.setItem('gtracker-theme', mode);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.textContent = mode === 'dark' ? '☀️' : '🌙';
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('gtracker-theme')) {
    setTheme(e.matches ? 'dark' : 'light');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  setTheme(root.getAttribute('data-theme'));
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  registerServiceWorker();
  setupInstallPrompt();
});

// Toast utility
const toast = document.getElementById('toast');
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// Confetti
function launchConfetti() {
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = `hsl(${Math.random() * 360}, 80%, 60%)`;
    piece.style.animationDuration = `${1 + Math.random()}s`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1600);
  }
}

// PWA Install handling
function setupInstallPrompt() {
  const installCard = document.getElementById('install-card');
  const installButton = document.getElementById('install-btn');
  const navInstall = document.getElementById('nav-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    if (installCard) installCard.style.display = 'block';
    if (navInstall) navInstall.style.display = 'inline-flex';
  });

  const handler = () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.finally(() => {
      installPromptEvent = null;
      if (installCard) installCard.style.display = 'none';
      if (navInstall) navInstall.style.display = 'none';
    });
  };

  if (installButton) installButton.addEventListener('click', handler);
  if (navInstall) navInstall.addEventListener('click', handler);
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
    } catch (err) {
      console.error('SW registration failed', err);
    }
  }
}

function updateMoodBadge(value) {
  const el = document.getElementById('today-mood');
  if (el) el.textContent = `Mood: ${value || '—'}`;
}

function animateRing(el, percent) {
  if (!el) return;
  const deg = Math.min(100, percent) * 3.6;
  el.style.background = `conic-gradient(var(--accent) ${deg}deg, var(--accent-2) ${deg + 10}deg, rgba(255,255,255,0.1) ${deg + 10}deg)`;
  const text = el.querySelector('span');
  if (text) text.textContent = `${Math.round(percent)}%`;
}

function rippleify(button) {
  button.addEventListener('click', (e) => {
    const circle = document.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.position = 'absolute';
    circle.style.borderRadius = '50%';
    circle.style.background = 'rgba(255,255,255,0.35)';
    circle.style.opacity = '0.8';
    circle.style.transform = 'scale(0)';
    circle.style.pointerEvents = 'none';
    circle.style.transition = 'transform 300ms ease, opacity 300ms ease';
    const rect = button.getBoundingClientRect();
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;
    button.style.position = 'relative';
    button.style.overflow = 'hidden';
    button.appendChild(circle);
    requestAnimationFrame(() => {
      circle.style.transform = 'scale(2)';
      circle.style.opacity = '0';
    });
    setTimeout(() => circle.remove(), 350);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('button, .btn').forEach(rippleify);
});
