const express = require('express');
const path = require('path');
const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: format date as YYYY-MM-DD
function todayString() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

function normalizeEntry(payload) {
  const toInt = (v) => (v === '' || v === null || v === undefined ? null : (isNaN(parseInt(v)) ? null : parseInt(v)));
  const toFloat = (v) => (v === '' || v === null || v === undefined ? null : (isNaN(parseFloat(v)) ? null : parseFloat(v)));

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
    `INSERT INTO entries (date, gym_done, treadmill_minutes, treadmill_distance_km, calories_burned, carbs, weight_kg, mood, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

/* -----------------------
   ROUTES
------------------------ */

// Fetch all entries
app.get('/api/entries', async (_req, res) => {
  try {
    const rows = await all('SELECT * FROM entries ORDER BY date ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Fetch today's entry (create if none exists)
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
    res.status(500).json({ error: "Failed to fetch today's entry" });
  }
});

// Create or update entry
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

/* -----------------------
   DEBUG ROUTES
------------------------ */

// Generate fake data
app.post('/api/debug/generate-fake', async (req, res) => {
  try {
    const moods = ['low', 'ok', 'good', 'great'];
    const days = Math.max(1, parseInt(req.body?.days, 10) || 90);

    const today = new Date();
    let baseWeight = 110;
    let created = 0;

    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      const gymDone = Math.random() < 0.5;
      const treadmillMinutes = Math.random() < 0.4 ? 0 : Math.floor(Math.random() * 61);
      const treadmillDistance = Math.random() < 0.4 ? 0 : parseFloat((Math.random() * 3).toFixed(2));
      const calories = Math.floor(Math.random() * 501);
      const carbs = Math.floor(Math.random() * 201);

      const weight = baseWeight + (Math.random() - 0.5) * 5;
      baseWeight = weight;

      const entry = normalizeEntry({
        date: dateStr,
        gym_done: gymDone,
        treadmill_minutes: treadmillMinutes,
        treadmill_distance_km: treadmillDistance,
        calories_burned: calories,
        carbs,
        weight_kg: parseFloat(weight.toFixed(1)),
        mood: moods[Math.floor(Math.random() * moods.length)],
        notes: '',
      });

      await upsertEntry(entry);
      created++;
    }

    res.json({ ok: true, count: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate fake data' });
  }
});

// Reset all entries
app.post('/api/debug/reset', async (_req, res) => {
  try {
    await run('DELETE FROM entries');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset entries' });
  }
});

/* -----------------------
   WEEKLY SUMMARY
------------------------ */

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
    const gymDays = entries.filter((e) => e.gym_done === 1).length;
    const treadmillMinutes = entries.reduce((s, e) => s + (e.treadmill_minutes || 0), 0);
    const treadmillDays = entries.filter((e) => (e.treadmill_minutes || 0) > 0).length;

    const avgCarbs = Math.round(entries.reduce((s, e) => s + (e.carbs || 0), 0) / days);

    const weightValues = entries
      .map((e) => e.weight_kg)
      .filter((v) => v !== null && v !== undefined);

    const avgWeight =
      weightValues.length ? parseFloat((weightValues.reduce((a, b) => a + b, 0) / weightValues.length).toFixed(1)) : null;

    const gymPercent = (gymDays / days) * 100;
    const treadmillPercent = (treadmillDays / days) * 100;

    const consistency = Math.round(gymPercent * 0.6 + treadmillPercent * 0.4);

    res.json({
      start,
      end: today,
      gym_days: gymDays,
      total_treadmill_minutes: treadmillMinutes,
      avg_carbs: avgCarbs,
      avg_weight: avgWeight,
      consistency_score: Math.max(0, Math.min(100, consistency)),
      treadmill_days: treadmillDays,
      entries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate weekly summary' });
  }
});

/* -----------------------
   STREAKS
------------------------ */

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

app.get('/api/summary/streaks', async (_req, res) => {
  try {
    const entries = await all('SELECT date, gym_done FROM entries ORDER BY date ASC');

    let longest = 0;
    let current = 0;

    // Compute longest streak
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].gym_done === 1) {
        current = 1;
        let j = i - 1;
        let prev = parseDate(entries[i].date);

        while (j >= 0) {
          const candidate = entries[j];
          if (candidate.gym_done !== 1) break;

          const diff = (prev - parseDate(candidate.date)) / 86400000;
          if (diff === 1) {
            current++;
            prev = parseDate(candidate.date);
            j--;
          } else break;
        }

        longest = Math.max(longest, current);
      }
    }

    // Compute streak ending today
    const today = todayString();
    const reversed = [...entries].reverse();

    let ongoing = 0;
    let expected = parseDate(today);

    for (const entry of reversed) {
      const d = parseDate(entry.date);
      const diff = (expected - d) / 86400000;

      if ((diff === 0 || diff === 1) && entry.gym_done === 1) {
        ongoing++;
        expected.setDate(expected.getDate() - 1);
      } else break;
    }

    res.json({
      current_gym_streak: ongoing,
      longest_gym_streak: longest
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate streaks' });
  }
});

app.listen(PORT, () => {
  console.log(`Health tracker server running at http://localhost:${PORT}`);
});
