const express = require('express');
const path = require('path');
const { run, get, all } = require('./db');
const {
  fetchLatestReading,
  setCredentials,
  getCredentialStatus,
} = require('./librelinkup');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to format date as YYYY-MM-DD in local time
function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeEntry(payload) {
  const toInt = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  };

  const toFloat = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = parseFloat(value);
    return isNaN(n) ? null : n;
  };

  const gym = toInt(payload.calories_gym) ?? 0;
  const tread = toInt(payload.calories_treadmill) ?? 0;
  const burnedFallback = gym + tread;

  const calories_total =
    burnedFallback ||
    toInt(payload.calories_burned) ||
    0;

  return {
    date: payload.date || todayString(),
    gym_done: payload.gym_done ? 1 : 0,
    treadmill_minutes: toInt(payload.treadmill_minutes) || 0,
    treadmill_distance_km: toFloat(payload.treadmill_distance_km),

    calories_gym: gym,
    calories_treadmill: tread,
    calories_total,

    calories_burned:
      toInt(payload.calories_burned) ??
      burnedFallback,

    calories_consumed: toInt(payload.calories_consumed),

    carbs: toInt(payload.carbs) || 0,
    weight_kg: toFloat(payload.weight_kg),
    mood: payload.mood || null,
    notes: payload.notes || null,
  };
}

// UPSERT ENTRY
async function upsertEntry(entry) {
  const existing = await get('SELECT id FROM entries WHERE date = ?', [entry.date]);

  if (existing) {
    await run(
      `UPDATE entries SET 
         gym_done=?,
         treadmill_minutes=?, 
         treadmill_distance_km=?,
         calories_gym=?,
         calories_treadmill=?,
         calories_total=?,
         calories_burned=?,
         calories_consumed=?,
         carbs=?,
         weight_kg=?,
         mood=?,
         notes=?
       WHERE date=?`,
      [
        entry.gym_done,
        entry.treadmill_minutes,
        entry.treadmill_distance_km,
        entry.calories_gym,
        entry.calories_treadmill,
        entry.calories_total,
        entry.calories_burned,
        entry.calories_consumed,
        entry.carbs,
        entry.weight_kg,
        entry.mood,
        entry.notes,
        entry.date,
      ]
    );
    return { ...entry, id: existing.id };
  }

  const result = await run(
    `INSERT INTO entries 
     (date, gym_done, treadmill_minutes, treadmill_distance_km,
      calories_gym, calories_treadmill, calories_total, calories_burned, calories_consumed,
      carbs, weight_kg, mood, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.gym_done,
      entry.treadmill_minutes,
      entry.treadmill_distance_km,
      entry.calories_gym,
      entry.calories_treadmill,
      entry.calories_total,
      entry.calories_burned,
      entry.calories_consumed,
      entry.carbs,
      entry.weight_kg,
      entry.mood,
      entry.notes,
    ]
  );

  return { ...entry, id: result.lastID };
}

/* ROUTES */

app.get('/api/entries', async (_req, res) => {
  try {
    const entries = await all('SELECT * FROM entries ORDER BY date ASC');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

app.get('/api/entries/today', async (_req, res) => {
  try {
    const today = todayString();
    let entry = await get('SELECT * FROM entries WHERE date = ?', [today]);

    if (!entry) {
      entry = await upsertEntry(normalizeEntry({ date: today }));
    }

    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch today's entry" });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const saved = await upsertEntry(normalizeEntry(req.body || {}));
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

/* DEBUG — FAKE DATA */

app.post('/api/debug/generate-fake', async (req, res) => {
  try {
    const moods = ['low', 'ok', 'good', 'great'];
    const days = Math.max(1, parseInt(req.body?.days, 10) || 90);
    const today = new Date();
    let baseWeight = 110;
    let count = 0;

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const gymDone = Math.random() < 0.5;
      const treadmillMinutes = Math.random() < 0.4 ? 0 : Math.floor(Math.random() * 61);
      const treadmillDistance = Math.random() < 0.4 ? 0 : parseFloat((Math.random() * 3).toFixed(2));

      const caloriesGym = gymDone ? Math.floor(Math.random() * 351) : 0;
      const caloriesTreadmill = treadmillMinutes ? Math.floor(Math.random() * 251) : 0;

      const caloriesConsumed = 1200 + Math.floor(Math.random() * 2301); // 1200–3500
      const carbs = Math.floor(Math.random() * 201);

      const weight = baseWeight + (Math.random() - 0.5) * 5; // ±2.5kg
      baseWeight = weight;

      const entry = normalizeEntry({
        date: dateStr,
        gym_done: gymDone,
        treadmill_minutes: treadmillMinutes,
        treadmill_distance_km: treadmillDistance,
        calories_gym: caloriesGym,
        calories_treadmill: caloriesTreadmill,
        calories_consumed: caloriesConsumed,
        carbs,
        weight_kg: parseFloat(weight.toFixed(1)),
        mood: moods[Math.floor(Math.random() * moods.length)],
        notes: '',
      });

      await upsertEntry(entry);
      count++;
    }

    res.json({ ok: true, count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate fake data' });
  }
});

/* DEBUG — RESET */

app.post('/api/debug/reset', async (_req, res) => {
  try {
    await run('DELETE FROM entries');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset entries' });
  }
});

/* WEEKLY SUMMARY WITH CALORIES_CONSUMED */

app.get('/api/summary/week', async (_req, res) => {
  try {
    const today = todayString();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6);
    const start = startDate.toISOString().slice(0, 10);

    const entries = await all(
      'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date ASC',
      [start, today]
    );

    const days = entries.length || 1;

    const gymDays = entries.filter(e => e.gym_done === 1).length;
    const treadmillMinutes = entries.reduce((s, e) => s + (e.treadmill_minutes || 0), 0);
    const treadmillDays = entries.filter(e => (e.treadmill_minutes || 0) > 0).length;

    const totalCalories = entries.reduce(
      (s, e) => s + (e.calories_total ?? e.calories_burned ?? 0),
      0
    );

    const totalCaloriesConsumed = entries.reduce(
      (s, e) => s + (e.calories_consumed || 0),
      0
    );

    const avgCaloriesConsumed = Math.round(totalCaloriesConsumed / days);

    const avgCarbs = Math.round(
      entries.reduce((s, e) => s + (e.carbs || 0), 0) / days
    );

    const weights = entries
      .map(e => e.weight_kg)
      .filter(v => v !== null && v !== undefined);

    const avgWeight =
      weights.length
        ? parseFloat((weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1))
        : null;

    const gymPercent = (gymDays / days) * 100;
    const treadmillPercent = (treadmillDays / days) * 100;

    const consistency_score = Math.min(
      100,
      Math.max(0, Math.round(gymPercent * 0.6 + treadmillPercent * 0.4))
    );

    res.json({
      start,
      end: today,
      entries,
      gym_days: gymDays,
      treadmill_days: treadmillDays,
      total_treadmill_minutes: treadmillMinutes,
      total_calories: totalCalories,
      total_calories_consumed: totalCaloriesConsumed,
      avg_calories_consumed: avgCaloriesConsumed,
      avg_carbs: avgCarbs,
      avg_weight: avgWeight,
      consistency_score,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate weekly summary' });
  }
});

/* PROFILE */

function defaultProfile() {
  return {
    age: 30,
    sex: 'male',
    height_cm: 175,
    goal_weight: 80,
    activity_level: 'moderate',
  };
}

async function fetchProfile() {
  const p = await get('SELECT * FROM profile LIMIT 1');
  return p || defaultProfile();
}

function sanitizeProfile(body = {}) {
  const toInt = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseInt(value, 10);
    return Number.isNaN(num) ? null : num;
  };

  const toFloat = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(value);
    return Number.isNaN(num) ? null : num;
  };

  const allowedActivity = ['sedentary', 'light', 'moderate', 'active'];
  const allowedSex = ['male', 'female'];
  const defaults = defaultProfile();

  return {
    age: toInt(body.age) ?? defaults.age,
    sex: allowedSex.includes(body.sex) ? body.sex : defaults.sex,
    height_cm: toInt(body.height_cm) ?? defaults.height_cm,
    goal_weight: toFloat(body.goal_weight) ?? defaults.goal_weight,
    activity_level: allowedActivity.includes(body.activity_level)
      ? body.activity_level
      : defaults.activity_level,
  };
}

app.get('/api/profile', async (_req, res) => {
  try {
    res.json(await fetchProfile());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const p = sanitizeProfile(req.body || {});
    const existing = await get('SELECT id FROM profile LIMIT 1');

    if (existing) {
      await run(
        'UPDATE profile SET age=?, sex=?, height_cm=?, goal_weight=?, activity_level=? WHERE id=?',
        [p.age, p.sex, p.height_cm, p.goal_weight, p.activity_level, existing.id]
      );
    } else {
      await run(
        'INSERT INTO profile (age, sex, height_cm, goal_weight, activity_level) VALUES (?, ?, ?, ?, ?)',
        [p.age, p.sex, p.height_cm, p.goal_weight, p.activity_level]
      );
    }

    res.json(await fetchProfile());
  } catch (err) {
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

/* DAILY GOAL */

function calculateBMR(profile, weight) {
  const age = profile.age || 0;
  const height = profile.height_cm || 0;
  if (!weight) return 0;

  return profile.sex === 'female'
    ? 10 * weight + 6.25 * height - 5 * age - 161
    : 10 * weight + 6.25 * height - 5 * age + 5;
}

function activityMultiplier(level) {
  return {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  }[level] || 1.2;
}

async function latestWeight() {
  const row = await get(
    'SELECT weight_kg FROM entries WHERE weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1'
  );
  return row ? row.weight_kg : null;
}

function totalBurned(entry) {
  if (!entry) return 0;
  return (
    entry.calories_total ??
    entry.calories_burned ??
    (entry.calories_gym || 0) + (entry.calories_treadmill || 0)
  );
}

app.get('/api/summary/daily-goal', async (_req, res) => {
  try {
    const profile = await fetchProfile();
    const weight = (await latestWeight()) ?? profile.goal_weight ?? 0;

    const bmr = calculateBMR(profile, weight);
    const tdee = bmr * activityMultiplier(profile.activity_level);
    const recommended = Math.round(Math.max(0, tdee - 500));

    const todayEntry = await get(
      'SELECT calories_total, calories_burned, calories_gym, calories_treadmill, calories_consumed FROM entries WHERE date=?',
      [todayString()]
    );

    const burned = totalBurned(todayEntry);
    const consumed = todayEntry?.calories_consumed ?? 0;
    const net = (consumed || 0) - burned;

    res.json({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      recommended_calories: recommended,
      profile,
      latest_weight: weight || null,
      today_total_burned: burned,
      calories_consumed: consumed,
      calories_burned: burned,
      net_calories: net,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate daily goal' });
  }
});

/* STREAKS */

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

app.get('/api/summary/streaks', async (_req, res) => {
  try {
    const entries = await all(
      'SELECT date, gym_done FROM entries ORDER BY date ASC'
    );

    let longest = 0;
    let current = 0;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].gym_done === 1) {
        current = 1;
        let prev = parseDate(entries[i].date);
        let j = i - 1;

        while (j >= 0) {
          const e = entries[j];
          if (e.gym_done !== 1) break;

          const diff = (prev - parseDate(e.date)) / 86400000;
          if (diff === 1) {
            current++;
            prev = parseDate(e.date);
            j--;
          } else break;
        }

        longest = Math.max(longest, current);
      }
    }

    const today = todayString();
    const reversed = [...entries].reverse();
    let ongoing = 0;
    let expected = parseDate(today);

    for (const e of reversed) {
      const d = parseDate(e.date);
      const diff = (expected - d) / 86400000;

      if ((diff === 0 || diff === 1) && e.gym_done === 1) {
        ongoing++;
        expected.setDate(expected.getDate() - 1);
      } else break;
    }

    res.json({
      current_gym_streak: ongoing,
      longest_gym_streak: longest,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to calculate streaks' });
  }
});

/* LIBRELINKUP CONFIG + LATEST */

app.get('/api/glucose/config', (_req, res) => {
  try {
    const status = getCredentialStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    console.error('LibreLinkUp config error:', err.message || err);
    res.status(500).json({ ok: false, error: 'Unable to load LibreLinkUp config' });
  }
});

app.post('/api/glucose/config', (req, res) => {
  try {
    const { email, password, region, tld } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }
    setCredentials({ email, password, region, tld });
    const status = getCredentialStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    console.error('LibreLinkUp config save error:', err.message || err);
    res.status(500).json({ ok: false, error: 'Unable to save LibreLinkUp credentials' });
  }
});

app.get('/api/glucose/latest', async (_req, res) => {
  try {
    const reading = await fetchLatestReading();
    res.json({ ok: true, reading });
  } catch (err) {
    console.error('LibreLinkUp error:', err.message || err);
    res.status(500).json({ ok: false, error: err.message || 'Unable to fetch glucose data' });
  }
});

app.listen(PORT, () => {
  console.log(`Health tracker running on http://localhost:${PORT}`);
});
