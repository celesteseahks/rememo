const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./data.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS image_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaded_image TEXT,
    ocr_result TEXT,
    engine TEXT,
    generated_image TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT
  )`);
  console.log("Table created successfully.");
});

db.close();
