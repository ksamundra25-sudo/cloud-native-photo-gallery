const sqlite3 = require('sqlite3').verbose();

// create/open DB
const db = new sqlite3.Database('./gallery.db', (err) => {
    if (err) {
        console.error("❌ Error:", err.message);
    } else {
        console.log("✅ Connected to SQLite database");
    }
});

// create table
db.run(`
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    imageUrl TEXT,
    category TEXT,
    description TEXT,
    tags TEXT,
    filename TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

module.exports = db;