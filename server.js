const express = require('express');
const path = require('path');
const { run, get, all } = require('./db');
const {
  fetchLatestReading,
  fetchGlucoseSeries,
  setCredentials,
  setPreferredUnitFromPayload,
  getPreferredUnit,
  getCredentialStatus,
} = require('./librelinkup');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to format date as YYYY-MM-DD in local time
function todayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEntry(payload) {
  const toInt = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  };

  const toFloat = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  return {
    date: payload.date || todayString(),
    gym_done: payload.gym_done ? 1 : 0,
    treadmill_minutes: toInt(payload.treadmill_minutes) || 0,
    treadmill_distance_km: toFloat(payload.treadmill_distance_km),
    calories_gym: toInt(payload.calories_gym) ?? 0,
    calories_treadmill: toInt(payload.calories_treadmill) ?? 0,
    calories_total:
      (toInt(payload.calories_gym) ?? 0) + (toInt(payload.calories_treadmill) ?? 0) ||
      toInt(payload.calories_burned) ||
      0,
    calories_burned: toInt(payload.calories_burned) ||
      ((toInt(payload.calories_gym) ?? 0) + (toInt(payload.calories_treadmill) ?? 0) || 0),
    calories_consumed: toInt(payload.calories_consumed),
    carbs: toInt(payload.carbs) || 0,
    weight_kg: toFloat(payload.weight_kg),
    mood: payload.mood || null,
    notes: payload.notes || null,
  };
}

// Create or update an entry for a date
async function upsertEntry(entry) {
  const existing = await get('SELECT id FROM entries WHERE date = ?', [entry.date]);
  if (existing) {
    await run(
      `UPDATE entries SET gym_done=?, treadmill_minutes=?, treadmill_distance_km=?, calories_gym=?, calories_treadmill=?, calories_total=?, calories_burned=?, calories_consumed=?, carbs=?, weight_kg=?, mood=?, notes=? WHERE date=?`,
      [
        entry.gym_done,
        entry.treadmill_minutes,
        entry.treadmill_distance_km,
        entry.calories_gym,
        entry.calories_treadmill,
        entry.calories_total,
        entry.calories_total,
        entry.calories_total,
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
    `INSERT INTO entries (date, gym_done, treadmill_minutes, treadmill_distance_km, calories_gym, calories_treadmill, calories_total, calories_burned, calories_consumed, carbs, weight_kg, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.gym_done,
      entry.treadmill_minutes,
      entry.treadmill_distance_km,
      entry.calories_gym,
      entry.calories_treadmill,
      entry.calories_total,
      entry.calories_total,
      entry.calories_consumed,
      entry.carbs,
      entry.weight_kg,
      entry.mood,
      entry.notes,
    ]
  );
  return { ...entry, id: result.lastID };
}

// Routes
app.get('/api/entries', async (_req, res) => {
  try {
    const entries = await all('SELECT * FROM entries ORDER BY date ASC');
    res.json(entries);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

app.get('/api/entries/today', async (_req, res) => {
  try {
    const today = todayString();
    let entry = await get('SELECT * FROM entries WHERE date = ?', [today]);
    if (!entry) {
      const blank = normalizeEntry({ date: today });
      entry = await upsertEntry(blank);
    }
    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today\'s entry' });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const entry = normalizeEntry(req.body || {});
    const saved = await upsertEntry(entry);
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// Debug route to generate fake data
app.post('/api/debug/generate-fake', async (req, res) => {
  try {
    const moods = ['low', 'ok', 'good', 'great'];
    const days = Math.max(1, parseInt(req.body?.days, 10) || 90);
    const today = new Date();
    let baseWeight = 110;
    let created = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);

      const gymDone = Math.random() < 0.5;
      const treadmillZero = Math.random() < 0.4;
      const treadmillMinutes = treadmillZero ? 0 : Math.floor(Math.random() * 61);
      const treadmillDistanceZero = Math.random() < 0.4;
      const treadmillDistance = treadmillDistanceZero ? 0 : parseFloat((Math.random() * 3).toFixed(2));
      const caloriesGym = gymDone ? Math.floor(Math.random() * 351) : 0;
      const caloriesTreadmill = treadmillMinutes ? Math.floor(Math.random() * 251) : 0;
      const caloriesConsumed = 1200 + Math.floor(Math.random() * 2301); // 1200-3500
      const carbs = Math.floor(Math.random() * 201);

      const weightVariance = (Math.random() - 0.5) * 5; // ±2.5kg
      const weight = baseWeight + weightVariance;
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
      created += 1;
    }

    res.json({ ok: true, count: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate fake data' });
  }
});

// Debug route to clear all entries
app.post('/api/debug/reset', async (_req, res) => {
  try {
    await run('DELETE FROM entries');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset entries' });
  }
});

// Weekly summary endpoint
app.get('/api/summary/week', async (_req, res) => {
  try {
    const today = todayString();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const start = sevenDaysAgo.toISOString().slice(0, 10);

    const entries = await all('SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date ASC', [start, today]);
    const daysCount = entries.length || 1;
    const gymDays = entries.filter((e) => e.gym_done === 1).length;
    const totalTreadmillMinutes = entries.reduce((sum, e) => sum + (e.treadmill_minutes || 0), 0);
    const carbsAvg = entries.reduce((sum, e) => sum + (e.carbs || 0), 0) / daysCount;
    const totalCalories = entries.reduce((sum, e) => sum + (e.calories_total ?? e.calories_burned ?? 0), 0);
    const totalCaloriesConsumed = entries.reduce((sum, e) => sum + (e.calories_consumed || 0), 0);

    const weightValues = entries.map((e) => e.weight_kg).filter((v) => v !== null && v !== undefined);
    const weightAvg = weightValues.length ? weightValues.reduce((a, b) => a + b, 0) / weightValues.length : null;

    const treadmillDays = entries.filter((e) => (e.treadmill_minutes || 0) > 0).length;
    const gymPercent = (gymDays / daysCount) * 100;
    const treadmillPercent = (treadmillDays / daysCount) * 100;
    const consistency_score = Math.round((gymPercent * 0.6 + treadmillPercent * 0.4));

    res.json({
      start,
      end: today,
      gym_days: gymDays,
      total_treadmill_minutes: totalTreadmillMinutes,
      total_calories: totalCalories,
      total_calories_consumed: totalCaloriesConsumed,
      avg_calories_consumed: Math.round(totalCaloriesConsumed / daysCount),
      avg_carbs: Math.round(carbsAvg),
      avg_weight: weightAvg !== null ? parseFloat(weightAvg.toFixed(1)) : null,
      consistency_score: Math.max(0, Math.min(100, consistency_score)),
      treadmill_days: treadmillDays,
      entries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate weekly summary' });
  }
});

function defaultProfile() {
  return { age: 30, sex: 'male', height_cm: 175, goal_weight: 80, activity_level: 'moderate' };
}

async function fetchProfile() {
  const profile = await get('SELECT * FROM profile LIMIT 1');
  return profile || defaultProfile();
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
    activity_level: allowedActivity.includes(body.activity_level) ? body.activity_level : defaults.activity_level,
    preferred_glucose_unit: body.preferred_glucose_unit,
  };
}

app.get('/api/profile', async (_req, res) => {
  try {
    const profile = await fetchProfile();
    res.json({ ...profile, preferred_glucose_unit: getPreferredUnit() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const sanitized = sanitizeProfile(req.body || {});
    const existing = await get('SELECT id FROM profile LIMIT 1');
    if (sanitized.preferred_glucose_unit) {
      setPreferredUnitFromPayload(sanitized.preferred_glucose_unit);
    }
    if (existing) {
      await run(
        'UPDATE profile SET age=?, sex=?, height_cm=?, goal_weight=?, activity_level=? WHERE id=?',
        [sanitized.age, sanitized.sex, sanitized.height_cm, sanitized.goal_weight, sanitized.activity_level, existing.id]
      );
    } else {
      await run(
        'INSERT INTO profile (age, sex, height_cm, goal_weight, activity_level) VALUES (?, ?, ?, ?, ?)',
        [sanitized.age, sanitized.sex, sanitized.height_cm, sanitized.goal_weight, sanitized.activity_level]
      );
    }
    const saved = await fetchProfile();
    res.json({ ...saved, preferred_glucose_unit: getPreferredUnit() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

function calculateBMR(profile, weight) {
  const age = profile.age || 0;
  const height = profile.height_cm || 0;
  if (!weight) return 0;
  if ((profile.sex || 'male') === 'female') {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
  return 10 * weight + 6.25 * height - 5 * age + 5;
}

function activityMultiplier(level) {
  switch (level) {
    case 'sedentary':
      return 1.2;
    case 'light':
      return 1.375;
    case 'moderate':
      return 1.55;
    case 'active':
      return 1.725;
    default:
      return 1.2;
  }
}

async function latestWeight() {
  const row = await get('SELECT weight_kg FROM entries WHERE weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1');
  return row ? row.weight_kg : null;
}

function totalBurned(entry) {
  if (!entry) return 0;
  return entry.calories_total ?? entry.calories_burned ?? ((entry.calories_gym || 0) + (entry.calories_treadmill || 0));
}

app.get('/api/summary/daily-goal', async (_req, res) => {
  try {
    const profile = await fetchProfile();
    const weight = (await latestWeight()) ?? profile.goal_weight ?? 0;
    const bmr = calculateBMR(profile, weight);
    const tdee = bmr * activityMultiplier(profile.activity_level);
    const recommended = Math.max(0, Math.round(tdee - 500));
    const todayEntry = await get('SELECT calories_total, calories_burned, calories_gym, calories_treadmill, calories_consumed FROM entries WHERE date = ?', [todayString()]);
    const todayTotal = totalBurned(todayEntry);
    const caloriesConsumed = todayEntry?.calories_consumed ?? 0;
    const netCalories = (caloriesConsumed || 0) - todayTotal;

    res.json({
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      recommended_calories: recommended,
      profile,
      latest_weight: weight || null,
      today_total_burned: todayTotal,
      calories_consumed: caloriesConsumed,
      calories_burned: todayTotal,
      net_calories: netCalories,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate daily goal' });
  }
});

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Streak endpoint
app.get('/api/summary/streaks', async (_req, res) => {
  try {
    const entries = await all('SELECT date, gym_done FROM entries ORDER BY date ASC');
    let currentStreak = 0;
    let longestStreak = 0;

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].gym_done === 1) {
        currentStreak = 1;
        let j = i - 1;
        let prevDate = parseDate(entries[i].date);
        while (j >= 0) {
          const candidate = entries[j];
          if (candidate.gym_done !== 1) break;
          const dayDiff = (prevDate - parseDate(candidate.date)) / (1000 * 60 * 60 * 24);
          if (dayDiff === 1) {
            currentStreak += 1;
            prevDate = parseDate(candidate.date);
            j--;
          } else {
            break;
          }
        }
        longestStreak = Math.max(longestStreak, currentStreak);
      }
    }

    // Determine current streak ending today
    const today = todayString();
    const reversed = [...entries].reverse();
    let ongoing = 0;
    let expectedDate = parseDate(today);
    for (const entry of reversed) {
      const entryDate = parseDate(entry.date);
      const diff = (expectedDate - entryDate) / (1000 * 60 * 60 * 24);
      if (diff === 0 && entry.gym_done === 1) {
        ongoing += 1;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (diff === 1 && entry.gym_done === 1) {
        ongoing += 1;
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (diff === 0 && entry.gym_done !== 1) {
        ongoing = 0;
        break;
      } else if (diff > 1) {
        break;
      } else if (entry.gym_done !== 1) {
        break;
      } else {
        break;
      }
    }

    res.json({ current_gym_streak: ongoing, longest_gym_streak: longestStreak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate streaks' });
  }
});

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
    const { email, password, region, tld, unit } = req.body || {};
    const status = getCredentialStatus();

    if ((!email || !password) && status.configured && unit) {
      setPreferredUnitFromPayload(unit);
      return res.json({ ok: true, ...getCredentialStatus() });
    }

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required' });
    }

    setCredentials({ email, password, region, tld, unit });
    if (unit) {
      setPreferredUnitFromPayload(unit);
    }
    const updated = getCredentialStatus();
    res.json({ ok: true, ...updated });
  } catch (err) {
    console.error('LibreLinkUp config save error:', err.message || err);
    res.status(500).json({ ok: false, error: 'Unable to save LibreLinkUp credentials' });
  }
});

app.get('/api/glucose/latest', async (_req, res) => {
  try {
    const reading = await fetchLatestReading();
    res.json({
      ok: true,
      reading: {
        value_mgdl: reading?.glucose_mgdl ?? null,
        trend: reading?.trend ?? 'Unknown',
        timestamp: reading?.timestamp ?? null,
      },
      preferred_unit: getPreferredUnit(),
    });
  } catch (err) {
    console.error('LibreLinkUp error:', err.message || err);
    res.status(500).json({ ok: false, error: err.message || 'Unable to fetch glucose data' });
  }
});

app.get('/api/glucose/history', async (_req, res) => {
  try {
    const readings = await fetchGlucoseSeries();
    res.json({
      ok: true,
      preferred_unit: getPreferredUnit(),
      readings: readings.map((r) => ({
        value_mgdl: r?.glucose_mgdl ?? null,
        timestamp: r?.timestamp ?? null,
        trend: r?.trend ?? 'Unknown',
      })),
    });
  } catch (err) {
    console.error('LibreLinkUp history error:', err.message || err);
    res.status(500).json({ ok: false, error: err.message || 'Unable to fetch glucose history' });
  }
});

app.listen(PORT, () => {
  console.log(`Health tracker server running on http://localhost:${PORT}`);
});
