const mysql = require("mysql2");

/* ===== Database Connection Pool ===== */
const mysql = require("mysql2");

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // โฮสต์ cloud ส่วนใหญ่บังคับ SSL ถ้าเชื่อมไม่ได้ให้เปิดบรรทัดนี้
  // ssl: { rejectUnauthorized: true }
});


module.exports = pool.promise();


/* ===== Test Connection ===== */
pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    return;
  }
  console.log("✅ Database connected successfully");
  conn.release();
});

module.exports = pool;
