const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Database helper that exposes promise-friendly wrappers
const dbFile = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE,
      gym_done INTEGER DEFAULT 0,
      treadmill_minutes INTEGER DEFAULT 0,
      treadmill_distance_km REAL,
      calories_burned INTEGER DEFAULT 0,
      calories_gym INTEGER DEFAULT 0,
      calories_treadmill INTEGER DEFAULT 0,
      calories_total INTEGER DEFAULT 0,
      calories_consumed INTEGER,
      carbs INTEGER DEFAULT 0,
      weight_kg REAL,
      mood TEXT,
      notes TEXT
    )
  `);

  addColumnIfMissing('entries', 'calories_gym', 'INTEGER DEFAULT 0');
  addColumnIfMissing('entries', 'calories_treadmill', 'INTEGER DEFAULT 0');
  addColumnIfMissing('entries', 'calories_total', 'INTEGER DEFAULT 0');
  addColumnIfMissing('entries', 'calories_consumed', 'INTEGER');

  db.run(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      age INTEGER,
      sex TEXT,
      height_cm INTEGER,
      goal_weight REAL,
      activity_level TEXT
    )
  `);
});

function addColumnIfMissing(table, column, definition) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) return;
    const exists = rows.some((row) => row.name === column);
    if (!exists) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  });
}

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { db, run, get, all };
