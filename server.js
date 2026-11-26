const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const mysql = require("mysql2/promise");
const cors = require("cors");
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const otpRoutes = require('./routes/otp.routes'); 
const app = express();

/* ===== Database Configuration ===== */
/* ===== Database Configuration ===== */
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "auth_system",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true  // ✅ เพิ่มบรรทัดนี้ครับ (สำคัญมาก)
};

const pool = mysql.createPool(dbConfig);

// Test database connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ Database connected successfully");
    connection.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.log("\n💡 แก้ไข:");
    console.log("1. ตรวจสอบ MySQL เปิดอยู่หรือไม่");
    console.log("2. แก้รหัสผ่านใน server.js");
    console.log("3. สร้าง database 'auth_system' ใน MySQL\n");
  }
})();

/* ===== Middleware Configuration ===== */

// CORS
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: "hotel-booking-secret-key-2024-change-this-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict'
  }
}));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Static Files
app.use(express.static(path.join(__dirname, "public")));

// Clean URL routing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin-calendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-calendar.html'));
});

/* ===== Authentication Middleware ===== */
const requireAuth = (req, res, next) => {
  if (!req.session.userId || req.session.userType !== 'user') {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
};

/* ===== Make pool and bcrypt available to routes ===== */
app.set('pool', pool);
app.set('bcrypt', bcrypt);

/* ===== Helper Functions ===== */
const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@gmail\.com$/;
  return emailRegex.test(email);
};

const validatePassword = (pwd) => {
  return pwd.length >= 8 && 
         /[A-Z]/.test(pwd) && 
         /[a-z]/.test(pwd) && 
         /[0-9]/.test(pwd);
};

const sanitizeInput = (str) => {
  if (!str) return str;
  return str.trim().replace(/[<>]/g, '');
};

const generateUserId = () => {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `US${randomNum}`;
};

const generateBookingId = () => {
  return `BK${Date.now()}`;
};

// ✨ NEW: Helper function สำหรับคำนวณวันที่ถูกต้อง
const calculateDays = (checkInStr, checkOutStr) => {
  const checkInDate = new Date(checkInStr + 'T00:00:00');
  const checkOutDate = new Date(checkOutStr + 'T00:00:00');
  const timeDiff = checkOutDate.getTime() - checkInDate.getTime();
  const diffDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  return diffDays + 1; // รวมทั้งวันเช็คอินและเช็คเอาท์
};

/* ===== SETUP ADMIN ===== */
app.get("/setup-admin", async (req, res) => {
  try {
    const email = "admin@gmail.com";
    const password = "Admin123";
    
    const [rows] = await pool.query("SELECT * FROM admin WHERE email=?", [email]);
    
    if (rows.length > 0) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Admin Already Exists</title>
          <style>
            body { font-family: Arial; padding: 50px; text-align: center; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2 10px rgba(0,0,0,0.1); }
            h1 { color: #ff9800; }
            .info { background: #f0f0f0; padding: 20px; border-radius: 5px; margin: 20px 0; }
            a { display: inline-block; margin-top: 20px; padding: 10px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
            a:hover { background: #5568d3; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Admin Already Exists</h1>
            <div class="info">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> Admin123</p>
            </div>
            <a href="/login">Go to Login</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO admin (email, password, created_at) VALUES (?, ?, NOW())",
      [email, hash]
    );
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Created</title>
        <style>
          body { font-family: Arial; padding: 50px; text-align: center; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
          h1 { color: #4caf50; }
          .info { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          a { display: inline-block; margin-top: 20px; padding: 10px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
          a:hover { background: #5568d3; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Admin Created Successfully!</h1>
          <div class="info">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> ${password}</p>
          </div>
          <p style="color: #f44336; margin-top: 20px;"><strong>⚠️ โปรดเปลี่ยนรหัสผ่านหลังจาก Login ครั้งแรก</strong></p>
          <a href="/login">Go to Login</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Setup admin error:", error);
    res.send(`
      <h1 style="color: red; text-align: center; margin-top: 50px;">❌ Error</h1>
      <p style="text-align: center;">${error.message}</p>
    `);
  }
});

/* ===== ROUTES REGISTRATION ===== */
app.use('/api', otpRoutes);

/* ==================== AUTH APIs ==================== */

// Check Session Status
app.get("/api/auth/check-session", (req, res) => {
  if (req.session.userId && req.session.userType === 'user') {
    res.json({ 
      loggedIn: true, 
      userType: 'user',
      userId: req.session.userId 
    });
  } else if (req.session.adminId && req.session.userType === 'admin') {
    res.json({ 
      loggedIn: true, 
      userType: 'admin',
      adminId: req.session.adminId 
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// User Register
app.post("/register", async (req, res) => {
  try {
    const { name, lastname, tel, mail, password, confirm_password } = req.body;

    const cleanName = sanitizeInput(name);
    const cleanLastname = sanitizeInput(lastname);
    const cleanTel = sanitizeInput(tel);
    const cleanMail = sanitizeInput(mail);

    if (!cleanName || !cleanLastname || !cleanTel || !cleanMail || !password || !confirm_password) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    if (!/^[A-Za-z]+$/.test(cleanName)) {
      return res.json({ success: false, field: "name", message: "ชื่อใช้ได้เฉพาะภาษาอังกฤษเท่านั้น (A-Z, a-z)" });
    }

    if (!/^[A-Za-z]+$/.test(cleanLastname)) {
      return res.json({ success: false, field: "lastname", message: "นามสกุลใช้ได้เฉพาะภาษาอังกฤษเท่านั้น (A-Z, a-z)" });
    }

    if (!/^\d+$/.test(cleanTel)) {
      return res.json({ success: false, field: "tel", message: "เบอร์โทรต้องเป็นตัวเลข" });
    }

    if (cleanTel.length < 9 || cleanTel.length > 10) {
      return res.json({ success: false, field: "tel", message: "เบอร์ต้อง 9-10 หลัก" });
    }

    if (!validateEmail(cleanMail) || cleanMail.toLowerCase() === "admin@gmail.com") {
      return res.json({
        success: false,
        field: "mail",
        message: "อนุญาตให้สมัครด้วย Gmail (@gmail.com) เท่านั้น และห้ามใช้ admin@gmail.com"
      });
    }

    if (!validatePassword(password)) {
      return res.json({ 
        success: false, 
        field: "password", 
        message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว ประกอบด้วยตัวพิมพ์ใหญ่ เล็ก และตัวเลข" 
      });
    }

    if (password !== confirm_password) {
      return res.json({ success: false, field: "confirm", message: "รหัสผ่านไม่ตรงกัน" });
    }

    const [nameRows] = await pool.query(
      "SELECT User_ID FROM users WHERE Name=? AND LastName=?", 
      [cleanName, cleanLastname]
    );

    if (nameRows.length > 0) {
      return res.json({ 
        success: false, 
        field: "name", 
        message: "ชื่อและนามสกุลนี้มีผู้ใช้แล้ว กรุณาใช้ชื่ออื่น" 
      });
    }

    const [telRows] = await pool.query("SELECT User_ID FROM users WHERE Tel=?", [cleanTel]);
    if (telRows.length > 0) {
      return res.json({ 
        success: false, 
        field: "tel", 
        message: "เบอร์โทรนี้ถูกใช้แล้ว" 
      });
    }

    const [mailRows] = await pool.query("SELECT User_ID FROM users WHERE mail=?", [cleanMail]);
    if (mailRows.length > 0) {
      return res.json({ 
        success: false, 
        field: "mail", 
        message: "อีเมลนี้ถูกใช้แล้ว" 
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const user_id = generateUserId();

    await pool.query(
      "INSERT INTO users (User_ID, Name, LastName, Tel, mail, password, created_at) VALUES (?,?,?,?,?,?,NOW())",
      [user_id, cleanName, cleanLastname, cleanTel, cleanMail, hash]
    );

    console.log(`✅ New user registered: ${cleanMail} (ID: ${user_id})`);
    res.json({ success: true, message: "สมัครสมาชิกสำเร็จ" });

  } catch (error) {
    console.error("Register error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// User/Admin Login
app.post("/login", async (req, res) => {
  try {
    const { mail, password } = req.body;

    if (!mail || !password) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const cleanMail = sanitizeInput(mail);

    // Check Admin first
    const [adminRows] = await pool.query("SELECT * FROM admin WHERE email=?", [cleanMail]);
    
    if (adminRows.length > 0) {
      const admin = adminRows[0];
      const isMatch = await bcrypt.compare(password, admin.password);

      if (!isMatch) {
        return res.json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      }

      await pool.query("UPDATE admin SET last_login=NOW() WHERE admin_id=?", [admin.admin_id]);

      req.session.adminId = admin.admin_id;
      req.session.email = admin.email;
      req.session.userType = 'admin';

      console.log(`✅ Admin logged in: ${admin.email}`);
      return res.json({
        success: true,
        role: "admin",
        email: admin.email
      });
    }

    // Check User
    const [userRows] = await pool.query("SELECT * FROM users WHERE mail=?", [cleanMail]);
    
    if (userRows.length === 0) {
      return res.json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = userRows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
    }

    await pool.query("UPDATE users SET last_login=NOW() WHERE User_ID=?", [user.User_ID]);

    req.session.userId = user.User_ID;
    req.session.name = user.Name;
    req.session.userType = 'user';

    console.log(`✅ User logged in: ${user.mail} (ID: ${user.User_ID})`);
    res.json({
      success: true,
      role: "user",
      name: user.Name,
      userId: user.User_ID
    });

  } catch (error) {
    console.error("Login error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  const userName = req.session.name || req.session.email || 'Unknown';
  req.session.destroy((err) => {
    if (err) {
      return res.json({ success: false, message: "ออกจากระบบไม่สำเร็จ" });
    }
    console.log(`✅ User logged out: ${userName}`);
    res.json({ success: true, message: "ออกจากระบบสำเร็จ" });
  });
});

/* ==================== USER APIs ==================== */

// Get User Profile
app.get("/profile", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT User_ID, Name, LastName, Tel, mail, created_at, last_login FROM users WHERE User_ID=?",
      [req.session.userId]
    );
    
    if (rows.length === 0) {
      return res.json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }
    
    res.json({ success: true, user: rows[0], isAdmin: false });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Change Password
app.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    if (!validatePassword(newPassword)) {
      return res.json({ 
        success: false, 
        field: "newPassword",
        message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว ประกอบด้วยตัวพิมพ์ใหญ่ เล็ก และตัวเลข" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.json({ 
        success: false, 
        field: "confirmPassword",
        message: "รหัสผ่านใหม่ไม่ตรงกัน" 
      });
    }

    const [rows] = await pool.query("SELECT password FROM users WHERE User_ID=?", [req.session.userId]);
    
    if (rows.length === 0) {
      return res.json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);

    if (!isMatch) {
      return res.json({ 
        success: false, 
        field: "currentPassword",
        message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" 
      });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE users SET password=?, updated_at=NOW() WHERE User_ID=?",
      [hash, req.session.userId]
    );

    console.log(`✅ Password changed for user: ${req.session.userId}`);
    res.json({ success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" });

  } catch (error) {
    console.error("Change password error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Get All Rooms
app.get("/api/rooms", async (req, res) => {
  try {
    const [rooms] = await pool.query(
      'SELECT * FROM rooms WHERE Status != "ปิดปรับปรุง" ORDER BY Room_No'
    );
    
    console.log(`📋 Fetched ${rooms.length} available rooms (excluding closed rooms)`);
    res.json({ success: true, rooms });
  } catch (error) {
    console.error("❌ Get rooms error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
  }
});

// Get All Bookings (Public)
app.get("/api/bookings/all", async (req, res) => {
  try {
    const [bookings] = await pool.query(
      'SELECT Book_ID, Room_No, Check_in, Check_out, Status FROM bookings WHERE Status IN ("รออนุมัติ", "อนุมัติแล้ว") ORDER BY Check_in'
    );
    res.json({ success: true, bookings });
  } catch (error) {
    console.error("❌ Get bookings error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
  }
});

// Create Booking - ✨ แก้ไขการคำนวณวัน
app.post("/api/bookings", requireAuth, async (req, res) => {
  const { roomNo, checkIn, checkOut } = req.body;

  if (!roomNo || !checkIn || !checkOut) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [rooms] = await connection.query('SELECT * FROM rooms WHERE Room_No = ?', [roomNo]);

    if (rooms.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "ไม่พบห้องนี้ในระบบ" });
    }

    const room = rooms[0];

    if (room.Status === 'ปิดปรับปรุง') {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: "ห้องนี้ปิดปรับปรุงชั่วคราว ไม่สามารถจองได้" 
      });
    }

    const [conflictBookings] = await connection.query(
      `SELECT * FROM bookings 
       WHERE Room_No = ? 
       AND Status IN ('รออนุมัติ', 'อนุมัติแล้ว')
       AND NOT (Check_out <= ? OR Check_in >= ?)`,
      [roomNo, checkIn, checkOut]
    );

    if (conflictBookings.length > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: "ห้องนี้ถูกจองในช่วงวันที่ที่เลือกแล้ว กรุณาเลือกวันอื่น" 
      });
    }

    // ✨ ใช้ฟังก์ชัน calculateDays แทน
    const days = calculateDays(checkIn, checkOut);

    if (days < 1) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "วันเช็คเอาท์ต้องหลังจากวันเช็คอิน" });
    }

    const total = room.Rate * days;
    const bookId = generateBookingId();
    const dateBook = new Date().toISOString().split('T')[0];

    await connection.query(
      `INSERT INTO bookings (Book_ID, User_ID, DateBook, Check_in, Check_out, TypeRoom, Room_No, Day, Total, Status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'รออนุมัติ')`,
      [bookId, req.session.userId, dateBook, checkIn, checkOut, room.Type, roomNo, days, total]
    );

    await connection.commit();

    console.log(`✅ Booking created successfully: ${bookId} (${days} วัน)`);

    res.json({
      success: true,
      message: "จองห้องสำเร็จ! รอการอนุมัติจากแอดมิน",
      booking: { bookId, roomNo, checkIn, checkOut, days, total, roomType: room.Type }
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Create booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการจอง: " + error.message });
  } finally {
    connection.release();
  }
});

// Get User's Bookings
app.get("/api/my-bookings", requireAuth, async (req, res) => {
  try {
    const [bookings] = await pool.query(
      'SELECT * FROM bookings WHERE User_ID = ? ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json({ success: true, bookings });
  } catch (error) {
    console.error("❌ Get bookings error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Cancel Booking (DELETE method)
app.delete("/api/bookings/:bookId", requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      'SELECT * FROM bookings WHERE Book_ID = ? AND User_ID = ? AND Status = "รออนุมัติ"',
      [bookId, req.session.userId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "ไม่สามารถยกเลิกการจองนี้ได้" });
    }

    await connection.query('UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?', [bookId]);

    await connection.commit();
    console.log(`✅ Booking cancelled: ${bookId}`);
    res.json({ success: true, message: "ยกเลิกการจองสำเร็จ" });

  } catch (error) {
    await connection.rollback();
    console.error("Cancel booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  } finally {
    connection.release();
  }
});

// Cancel Booking (POST method)
app.post("/api/bookings/:bookId/cancel", requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      'SELECT * FROM bookings WHERE Book_ID = ? AND User_ID = ? AND Status = "รออนุมัติ"',
      [bookId, req.session.userId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: "ไม่สามารถยกเลิกการจองนี้ได้ (ยกเลิกได้เฉพาะสถานะ 'รออนุมัติ')" 
      });
    }

    await connection.query('UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?', [bookId]);

    await connection.commit();
    console.log(`✅ Booking cancelled: ${bookId} by User: ${req.session.userId}`);
    res.json({ success: true, message: "ยกเลิกการจองสำเร็จ" });

  } catch (error) {
    await connection.rollback();
    console.error("Cancel booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
  } finally {
    connection.release();
  }
});

/* ==================== ADMIN ROUTES ==================== */
const adminRoutes = require('./routes/admin.routes')(pool);
app.use('/api/admin', adminRoutes);

/* ===== AUTO CHECK-OUT SYSTEM ===== */
cron.schedule('0 12 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`🔄 [${new Date().toLocaleString('th-TH')}] Running auto check-out...`);
    
    const [expiredBookings] = await pool.query(`
      SELECT DISTINCT Room_No, Book_ID
      FROM bookings 
      WHERE Check_out = ? 
      AND Status = 'อนุมัติแล้ว'
    `, [todayStr]);
    
    if (expiredBookings.length > 0) {
      const roomNumbers = expiredBookings.map(b => b.Room_No);
      
      const [updateResult] = await pool.query(`
        UPDATE rooms 
        SET Status = 'ว่าง' 
        WHERE Room_No IN (?) 
        AND Status = 'จอง'
      `, [roomNumbers]);
      
      console.log(`✅ Auto check-out completed:`);
      console.log(`   - Rooms affected: ${roomNumbers.join(', ')}`);
      console.log(`   - Updated ${updateResult.affectedRows} room(s)`);
    } else {
      console.log(`ℹ️  No check-outs scheduled for ${todayStr}`);
    }
  } catch (error) {
    console.error('❌ Auto check-out error:', error);
  }
});

// Room Status Sync
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const [rooms] = await pool.query('SELECT Room_No, Status FROM rooms');
    
    for (const room of rooms) {
      if (room.Status === 'ปิดปรับปรุง') {
        continue;
      }
      
      const [currentBookings] = await pool.query(`
        SELECT * FROM bookings 
        WHERE Room_No = ? 
        AND Status = 'อนุมัติแล้ว'
        AND Check_in <= ?
        AND Check_out > ?
      `, [room.Room_No, todayStr, todayStr]);
      
      if (currentBookings.length > 0) {
        if (room.Status !== 'จอง') {
          await pool.query(`UPDATE rooms SET Status = 'จอง' WHERE Room_No = ?`, [room.Room_No]);
        }
      } else {
        if (room.Status === 'จอง') {
          await pool.query(`UPDATE rooms SET Status = 'ว่าง' WHERE Room_No = ?`, [room.Room_No]);
        }
      }
    }
  } catch (error) {
    console.error('❌ Room status check error:', error);
  }
});

/* ===== 404 Handler ===== */
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Page Not Found</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          color: white;
          text-align: center;
        }
        .container {
          background: white;
          color: #333;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
        }
        h1 { font-size: 72px; margin: 0; color: #667eea; }
        p { font-size: 18px; margin: 20px 0; }
        a {
          display: inline-block;
          padding: 12px 30px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin-top: 20px;
          transition: transform 0.2s;
        }
        a:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3); 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>404</h1>
        <p>ไม่พบหน้าที่คุณต้องการ</p>
        <a href="/login">กลับสู่หน้า Login</a>
      </div>
    </body>
    </html>
  `);
});

/* ===== Error Handler ===== */
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในระบบ" });
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 Server running on http://localhost:" + PORT);
  console.log("=".repeat(70));
  console.log("📝 Pages:");
  console.log("   - Login:          http://localhost:" + PORT + "/login");
  console.log("   - Register:       http://localhost:" + PORT + "/register");
  console.log("   - Forgot Password: http://localhost:" + PORT + "/forgot-password");
  console.log("   - User Dashboard: http://localhost:" + PORT + "/user");
  console.log("   - Admin:          http://localhost:" + PORT + "/admin");
  console.log("   - Admin Calendar: http://localhost:" + PORT + "/admin-calendar");
  console.log("   - Setup Admin:    http://localhost:" + PORT + "/setup-admin");
  console.log("=".repeat(70));
  console.log("✨ Enhanced Features:");
  console.log("   ✓ OTP Email System (Forgot Password)");
  console.log("   ✓ FIXED: Date calculation (+1 for inclusive dates)");
  console.log("   ✓ Room Closure System (Status-based)");
  console.log("   ✓ Auto Check-out (Daily 12:00 PM)");
  console.log("   ✓ Hourly Status Sync");
  console.log("=".repeat(70) + "\n");
});