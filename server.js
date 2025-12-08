const express = require('express');
const path = require('path');
const { run, get, all } = require('./db');

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
    calories_burned: toInt(payload.calories_burned) || 0,
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
      `UPDATE entries SET gym_done=?, treadmill_minutes=?, treadmill_distance_km=?, calories_burned=?, carbs=?, weight_kg=?, mood=?, notes=? WHERE date=?`,
      [
        entry.gym_done,
        entry.treadmill_minutes,
        entry.treadmill_distance_km,
        entry.calories_burned,
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
    `INSERT INTO entries (date, gym_done, treadmill_minutes, treadmill_distance_km, calories_burned, carbs, weight_kg, mood, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.date,
      entry.gym_done,
      entry.treadmill_minutes,
      entry.treadmill_distance_km,
      entry.calories_burned,
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

app.listen(PORT, () => {
  console.log(`Health tracker server running on http://localhost:${PORT}`);
});
