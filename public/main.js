let installPromptEvent = null;
let lastGymDone = null;
let lastBestStreak = null;

const TREADMILL_GOAL_MINUTES = 120;

/* FETCH WRAPPER */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

/* NAV HIGHLIGHTING */
function setActiveNav(id) {
  document.querySelectorAll(".nav a").forEach((link) => {
    if (link.id === id) link.classList.add("active");
    else link.classList.remove("active");
  });
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(digits);
}

/* MOTIVATION TEXT */
function motivationalText(score) {
  if (score >= 80) return "You're on fire 🔥";
  if (score >= 60) return "Solid momentum 💪";
  if (score >= 40) return "Getting going 🚀";
  return "Fresh start week ✨";
}

/* FULL BADGE CATALOG FOR BADGES PAGE */
function buildBadgeCatalog(entries = [], summary = {}, streaks = {}) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const totalTreadmillMinutes = sorted.reduce(
    (sum, e) => sum + (Number(e.treadmill_minutes) || 0),
    0
  );

  const totalTreadmillDistance = sorted.reduce(
    (sum, e) => sum + (Number(e.treadmill_distance_km) || 0),
    0
  );

  const treadmillGoalDays = sorted.filter(
    (e) => (Number(e.treadmill_minutes) || 0) >= TREADMILL_GOAL_MINUTES
  ).length;

  const gymDays = sorted.filter((e) => e.gym_done).length;

  const firstWeight = sorted.find(
    (e) => e.weight_kg !== null && e.weight_kg !== undefined
  )?.weight_kg;

  const latestWeight = [...sorted]
    .reverse()
    .find((e) => e.weight_kg !== null && e.weight_kg !== undefined)?.weight_kg;

  const weightDelta =
    firstWeight !== undefined && latestWeight !== undefined
      ? firstWeight - latestWeight
      : 0;

  const weeklyConsistency = summary?.consistency_score ?? 0;
  const loggedDaysThisWeek = (summary?.entries || []).filter(
    (e) => e && e.date
  ).length;

  const longestStreak = streaks?.longest_gym_streak || 0;
  const currentStreak = streaks?.current_gym_streak || 0;

  return [
    {
      id: "gym-3",
      category: "Gym streaks",
      title: "3-day Gym Streak",
      icon: "💥",
      description: "Stack three gym days back-to-back.",
      achieved: longestStreak >= 3,
      detail: `${currentStreak}-day current streak`,
    },
    {
      id: "gym-7",
      category: "Gym streaks",
      title: "7-day Gym Streak",
      icon: "🏆",
      description: "Hold the line for a full week.",
      achieved: longestStreak >= 7,
      detail: `Best streak: ${longestStreak} days`,
    },
    {
      id: "gym-14",
      category: "Gym streaks",
      title: "14-day Gym Streak",
      icon: "⚡",
      description: "Two unstoppable weeks in a row.",
      achieved: longestStreak >= 14,
      detail: `Longest: ${longestStreak} days`,
    },
    {
      id: "consistency-beast",
      category: "Consistency awards",
      title: "Consistency Beast (80+)",
      icon: "🦁",
      description: "Keep weekly consistency above 80.",
      achieved: weeklyConsistency >= 80,
      detail: `This week: ${weeklyConsistency}%`,
    },
    {
      id: "consistency-solid",
      category: "Consistency awards",
      title: "Solid Momentum (60+)",
      icon: "🚀",
      description: "Stay at 60+ weekly consistency.",
      achieved: weeklyConsistency >= 60,
      detail: `This week: ${weeklyConsistency}%`,
    },
    {
      id: "logging-week",
      category: "Consistency awards",
      title: "Logged Every Day",
      icon: "📅",
      description: "Capture all seven days this week.",
      achieved: loggedDaysThisWeek >= 7,
      detail: `${loggedDaysThisWeek}/7 days logged`,
    },
    {
      id: "tread-100km",
      category: "Treadmill milestones",
      title: "Treadmill 100 km total",
      icon: "🛣️",
      description: "Accumulate 100 km on the belt.",
      achieved: totalTreadmillDistance >= 100,
      detail: `${totalTreadmillDistance.toFixed(1)} km total`,
    },
    {
      id: "tread-10h",
      category: "Treadmill milestones",
      title: "10 Hours Moving",
      icon: "⏱️",
      description: "Spend 600 minutes on the treadmill.",
      achieved: totalTreadmillMinutes >= 600,
      detail: `${totalTreadmillMinutes} min total`,
    },
    {
      id: "tread-goal-week",
      category: "Treadmill milestones",
      title: "Goal Crusher",
      icon: "🥇",
      description: "Hit 120 minutes on 5+ days.",
      achieved: treadmillGoalDays >= 5,
      detail: `${treadmillGoalDays} days at goal`,
    },
    {
      id: "weight-1",
      category: "Weight milestones",
      title: "Weight –1 kg",
      icon: "🎯",
      description: "Lose the first kilogram from your start.",
      achieved: weightDelta >= 1,
      detail: `Change: ${weightDelta.toFixed(1)} kg`,
    },
    {
      id: "weight-3",
      category: "Weight milestones",
      title: "Weight –3 kg",
      icon: "🪶",
      description: "Trim three kilograms from your baseline.",
      achieved: weightDelta >= 3,
      detail: `Change: ${weightDelta.toFixed(1)} kg`,
    },
    {
      id: "gym-50",
      category: "Gym streaks",
      title: "Gym Century-in-Progress",
      icon: "💪",
      description: "Log 50 lifetime gym days.",
      achieved: gymDays >= 50,
      detail: `${gymDays} gym days total`,
    },
  ];
}

/* SIMPLE BADGE LIST FOR DASHBOARD */
function badgeList(summary, streaks) {
  const badges = [];
  if (streaks.current_gym_streak >= 5)
    badges.push(`${streaks.current_gym_streak}-day gym streak`);
  if (summary.treadmill_days >= 3) badges.push("3+ treadmill days this week");
  if (summary.consistency_score >= 80) badges.push("Consistency beast");
  if (summary.gym_days >= 4) badges.push("Gym majority week");
  return badges;
}

/* THEME HANDLING */
const root = document.documentElement;
const storedTheme = localStorage.getItem("gtracker-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme = storedTheme || (prefersDark ? "dark" : "light");
setTheme(initialTheme);

function setTheme(mode) {
  root.setAttribute("data-theme", mode);
  localStorage.setItem("gtracker-theme", mode);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = mode === "dark" ? "☀️" : "🌙";
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
  if (!localStorage.getItem("gtracker-theme")) {
    setTheme(e.matches ? "dark" : "light");
  }
});

/* ON LOAD */
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("theme-toggle");
  setTheme(root.getAttribute("data-theme"));

  if (toggle) {
    toggle.addEventListener("click", () => {
      const next =
        root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  registerServiceWorker();
  setupInstallPrompt();
});

/* TOAST */
const toast = document.getElementById("toast");
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

/* CONFETTI */
function launchConfetti() {
  for (let i = 0; i < 18; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = `hsl(${Math.random() * 360}, 80%, 60%)`;
    piece.style.animationDuration = `${1 + Math.random()}s`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 1600);
  }
}

/* PWA INSTALL HANDLING */
function setupInstallPrompt() {
  const installCard = document.getElementById("install-card");
  const installButton = document.getElementById("install-btn");
  const navInstall = document.getElementById("nav-install");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPromptEvent = e;
    if (installCard) installCard.style.display = "block";
    if (navInstall) navInstall.style.display = "inline-flex";
  });

  const handler = () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.finally(() => {
      installPromptEvent = null;
      if (installCard) installCard.style.display = "none";
      if (navInstall) navInstall.style.display = "none";
    });
  };

  if (installButton) installButton.addEventListener("click", handler);
  if (navInstall) navInstall.addEventListener("click", handler);
}

/* SERVICE WORKER */
async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (err) {
      console.error("SW registration failed", err);
    }
  }
}

function updateMoodBadge(value) {
  const el = document.getElementById("today-mood");
  if (el) el.textContent = `Mood: ${value || "—"}`;
}

/* PROGRESS RING */
function animateRing(el, percent) {
  if (!el) return;
  const deg = Math.min(100, percent) * 3.6;
  el.style.background = `conic-gradient(var(--accent) ${deg}deg,
                                       var(--accent-2) ${deg + 10}deg,
                                       rgba(255,255,255,0.1) ${deg + 10}deg)`;
  const text = el.querySelector("span");
  if (text) text.textContent = `${Math.round(percent)}%`;
}

/* BUTTON RIPPLE EFFECT */
function rippleify(button) {
  button.addEventListener("click", (e) => {
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.position = "absolute";
    circle.style.borderRadius = "50%";
    circle.style.background = "rgba(255,255,255,0.35)";
    circle.style.opacity = "0.8";
    circle.style.transform = "scale(0)";
    circle.style.pointerEvents = "none";
    circle.style.transition = "transform 300ms ease, opacity 300ms ease";

    const rect = button.getBoundingClientRect();
    circle.style.left = `${e.clientX - rect.left - radius}px`;
    circle.style.top = `${e.clientY - rect.top - radius}px`;

    button.style.position = "relative";
    button.style.overflow = "hidden";
    button.appendChild(circle);

    requestAnimationFrame(() => {
      circle.style.transform = "scale(2)";
      circle.style.opacity = "0";
    });

    setTimeout(() => circle.remove(), 350);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("button, .btn").forEach(rippleify);
});
