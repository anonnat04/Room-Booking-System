const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // รหัสผ่าน MySQL ของคุณ
  database: "auth_system"
});

async function fixAdmin() {
  try {
    const email = "admin@gmail.com";
    const password = "Admin123";
    
    console.log("🔐 กำลังสร้าง hash สำหรับรหัสผ่าน:", password);
    const hash = await bcrypt.hash(password, 12);
    
    console.log("✅ Hash สร้างเสร็จแล้ว:", hash);
    console.log("\n📝 กำลังอัพเดต database...");
    
    // ลบ admin เก่า
    db.query("DELETE FROM admin", (err) => {
      if (err) {
        console.error("❌ Error deleting:", err);
        return;
      }
      
      // สร้าง admin ใหม่
      db.query(
        "INSERT INTO admin (email, password, created_at) VALUES (?, ?, NOW())",
        [email, hash],
        (err, result) => {
          if (err) {
            console.error("❌ Error inserting:", err);
          } else {
            console.log("✅ Admin created successfully!");
            console.log("\n📧 Email:", email);
            console.log("🔑 Password:", password);
            console.log("\n🌐 ลอง Login ที่: http://localhost:3000/login.html");
          }
          
          db.end();
        }
      );
    });
  } catch (error) {
    console.error("❌ Error:", error);
    db.end();
  }
}

fixAdmin();