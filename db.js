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
      carbs INTEGER DEFAULT 0,
      weight_kg REAL,
      mood TEXT,
      notes TEXT
    )
  `);
});

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
