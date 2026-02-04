const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const mysql = require("mysql2/promise");
const cors = require("cors");
const nodemailer = require('nodemailer');

const app = express();

/* ===== Database Configuration ===== */
const dbConfig = {
  host: "localhost",
  user: "root",
  password: "", // ⬅️ เปลี่ยนรหัสผ่าน MySQL ของคุณที่นี่
  database: "auth_system",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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
    secure: false, // เปลี่ยนเป็น true เมื่อใช้ HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
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

// Clean URL routing (ไม่ต้องใช้ .html)

// หน้าแรก (Homepage)
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

/* ===== Authentication Middleware ===== */
const requireAuth = (req, res, next) => {
  if (!req.session.userId || req.session.userType !== 'user') {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.adminId || req.session.userType !== 'admin') {
    return res.status(401).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};

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

/* ===== SETUP ADMIN (สำหรับสร้าง Admin ครั้งแรก) ===== */
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
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
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
            <a href="/login.html">Go to Login</a>
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
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
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
          <a href="/login.html">Go to Login</a>
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

/* ==================== AUTH APIs ==================== */

// Check Session Status (สำหรับตรวจสอบว่า login แล้วหรือยัง)
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

// OTP Storage (In production, use Redis or Database)
const otpStore = new Map(); // { email: { otp, expires, resetToken } }

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Generate Reset Token
const generateResetToken = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Mask Email
const maskEmail = (email) => {
  if (!email) return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return email;
  return name[0] + '***' + name.slice(-1) + '@' + domain;
};

// Send OTP via Email (ใช้ Nodemailer)
const sendOTP = async (email, otp) => {
  try {
    // สร้าง transporter สำหรับ Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'anonnut123@gmail.com',
        pass: 'cagwpmtxdjdstucy'     // ถูก! ไม่มี space
      }
    });

    const mailOptions = {
      from: '"OTP" <anonnut123@gmail.com>',
      to: email,
      subject: '🔐 รหัส OTP สำหรับรีเซ็ตรหัสผ่าน',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .content {
              padding: 40px 30px;
              text-align: center;
            }
            .otp-box {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              font-size: 48px;
              font-weight: bold;
              padding: 20px;
              border-radius: 15px;
              letter-spacing: 10px;
              margin: 30px 0;
              display: inline-block;
            }
            .message {
              color: #666;
              font-size: 16px;
              line-height: 1.6;
              margin: 20px 0;
            }
            .warning {
              background: #fff3cd;
              border: 2px solid #ffc107;
              border-radius: 10px;
              padding: 15px;
              margin: 20px 0;
              color: #856404;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #666;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> รีเซ็ตรหัสผ่าน</h1>
            </div>
            <div class="content">
              <h2>รหัส OTP สำหรับรีเซ็ตรหัสผ่าน</h2>
              <p class="message">คุณได้ขอรีเซ็ตรหัสผ่าน กรุณากรอกรหัส OTP ด้านล่างนี้:</p>
              <div class="otp-box">${otp}</div>
              <div class="warning">
                <strong>⚠️ คำเตือน:</strong> รหัส OTP นี้จะหมดอายุภายใน <strong>5 นาที</strong><br>
                หากคุณไม่ได้ร้องขอการรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยอีเมลนี้
              </div>
              <p class="message" style="color: #999; font-size: 14px;">
                อีเมลนี้ถูกส่งอัตโนมัติ กรุณาอย่าตอบกลับ
              </p>
            </div>
            <div class="footer">
              © 2024 Hotel Booking System. All rights reserved.
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 ✅ OTP email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Send email error:', error.message);
    console.error('Error details:', error);
    // แสดง OTP ใน console เป็น backup
    console.log(`📱 BACKUP - OTP for ${email}: ${otp}`);
    return false;
  }
};

// Forgot Password - Send OTP
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ success: false, message: "กรุณากรอกอีเมล" });
    }

    const cleanMail = sanitizeInput(email);
    const [users] = await pool.query("SELECT mail FROM users WHERE mail=?", [cleanMail]);
    
    if (users.length === 0) {
      return res.json({ success: false, message: "ไม่พบอีเมลนี้ในระบบ" });
    }

    const otp = generateOTP();
    const resetToken = generateResetToken();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpStore.set(cleanMail, { otp, resetToken, expires });
    
    const emailSent = await sendOTP(cleanMail, otp);

    console.log(`✅ OTP generated for ${cleanMail}: ${otp}`);
    
    res.json({ 
      success: true, 
      message: emailSent 
        ? "ส่ง OTP ไปยังอีเมลของคุณแล้ว" 
        : "ส่งอีเมลไม่สำเร็จ กรุณาดู OTP ใน console",
      maskedEmail: maskEmail(cleanMail),
      emailSent: emailSent
      // ⚠️ ในระบบจริงไม่ควรส่ง OTP กลับไปให้ client
      // แต่สำหรับ development สามารถเพิ่มได้ถ้าต้องการ test
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const cleanMail = sanitizeInput(email);
    const storedData = otpStore.get(cleanMail);

    if (!storedData) {
      return res.json({ success: false, message: "ไม่พบรหัส OTP หรือหมดอายุแล้ว" });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(cleanMail);
      return res.json({ success: false, message: "รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" });
    }

    if (otp !== storedData.otp) {
      return res.json({ success: false, message: "รหัส OTP ไม่ถูกต้อง" });
    }

    console.log(`✅ OTP verified for ${cleanMail}`);
    res.json({ success: true, message: "ยืนยัน OTP สำเร็จ", resetToken: storedData.resetToken });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Reset Password
app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const cleanMail = sanitizeInput(email);
    const storedData = otpStore.get(cleanMail);

    if (!storedData || storedData.resetToken !== resetToken) {
      return res.json({ success: false, message: "ไม่สามารถรีเซ็ตรหัสผ่านได้" });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(cleanMail);
      return res.json({ success: false, message: "หมดเวลาในการรีเซ็ตรหัสผ่าน" });
    }

    if (!validatePassword(newPassword)) {
      return res.json({ success: false, message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว ประกอบด้วยตัวพิมพ์ใหญ่ เล็ก และตัวเลข" });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password=?, updated_at=NOW() WHERE mail=?", [hash, cleanMail]);
    otpStore.delete(cleanMail);

    console.log(`✅ Password reset successful for ${cleanMail}`);
    res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
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

    // Validation
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

    // Check duplicates
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

    // Create user
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

// Check Session
app.get("/check-session", (req, res) => {
  if (req.session.userId) {
    res.json({ 
      authenticated: true,
      userType: 'user',
      isAdmin: false,
      name: req.session.name,
      userId: req.session.userId
    });
  } else if (req.session.adminId) {
    res.json({ 
      authenticated: true,
      userType: 'admin',
      isAdmin: true,
      email: req.session.email,
      adminId: req.session.adminId
    });
  } else {
    res.json({ authenticated: false });
  }
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

// Get All Available Rooms
app.get("/api/rooms", async (req, res) => {
  try {
    const [rooms] = await pool.query(
      'SELECT * FROM rooms WHERE Status = "ว่าง" ORDER BY Room_No'
    );
    res.json({ success: true, rooms });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Create Booking
app.post("/api/bookings", requireAuth, async (req, res) => {
  const { roomNo, checkIn, checkOut } = req.body;

  if (!roomNo || !checkIn || !checkOut) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // ตรวจสอบห้องว่าง
    const [rooms] = await connection.query(
      'SELECT * FROM rooms WHERE Room_No = ? AND Status = "ว่าง"',
      [roomNo]
    );

    if (rooms.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "ห้องนี้ไม่ว่างหรือไม่มีในระบบ" });
    }

    const room = rooms[0];

    // คำนวณจำนวนวัน
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const days = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

    if (days < 1) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "วันเช็คเอาท์ต้องหลังจากวันเช็คอิน" });
    }

    // คำนวณราคารวม
    const total = room.Rate * days;
    const bookId = generateBookingId();
    const dateBook = new Date().toISOString().split('T')[0];

    // สร้างการจอง
    await connection.query(
      `INSERT INTO bookings (Book_ID, User_ID, DateBook, Check_in, Check_out, TypeRoom, Room_No, Day, Total, Status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'รออนุมัติ')`,
      [bookId, req.session.userId, dateBook, checkIn, checkOut, room.Type, roomNo, days, total]
    );

    // อัพเดทสถานะห้อง
    await connection.query(
      'UPDATE rooms SET Status = "จองแล้ว" WHERE Room_No = ?',
      [roomNo]
    );

    await connection.commit();

    console.log(`✅ New booking created: ${bookId} by user ${req.session.userId}`);

    res.json({
      success: true,
      message: "จองห้องสำเร็จ! รอการอนุมัติจากแอดมิน",
      booking: {
        bookId,
        roomNo,
        checkIn,
        checkOut,
        days,
        total,
        roomType: room.Type
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error("Create booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการจอง" });
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
    console.error("Get bookings error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Cancel Booking (User)
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

    const booking = bookings[0];

    await connection.query(
      'UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?',
      [bookId]
    );

    await connection.query(
      'UPDATE rooms SET Status = "ว่าง" WHERE Room_No = ?',
      [booking.Room_No]
    );

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

/* ==================== ADMIN APIs ==================== */

// Get Admin Profile
app.get("/api/admin/profile", requireAdmin, async (req, res) => {
  try {
    const [admins] = await pool.query(
      'SELECT admin_id, email, created_at, last_login FROM admin WHERE admin_id = ?',
      [req.session.adminId]
    );
    
    if (admins.length === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลแอดมิน" });
    }

    res.json({ success: true, admin: admins[0] });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Get All Users (Admin)
app.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT User_ID, Name, LastName, Tel, mail, created_at, last_login FROM users ORDER BY created_at DESC"
    );
    res.json({ success: true, users: rows });
  } catch (error) {
    console.error("Get users error:", error);
    res.json({ success: false, message: "ดึงข้อมูลไม่สำเร็จ" });
  }
});

// Delete User (Admin)
app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    // ตรวจสอบการจองค้างอยู่
    const [bookings] = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE User_ID = ? AND Status IN ("รออนุมัติ", "อนุมัติแล้ว")',
      [userId]
    );

    if (bookings[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "ไม่สามารถลบผู้ใช้ที่มีการจองค้างอยู่ได้" 
      });
    }

    const [result] = await pool.query("DELETE FROM users WHERE User_ID=?", [userId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้นี้" });
    }

    console.log(`✅ User deleted: ${userId}`);
    res.json({ success: true, message: "ลบผู้ใช้สำเร็จ" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.json({ success: false, message: "ลบผู้ใช้ไม่สำเร็จ" });
  }
});

// Get All Bookings (Admin)
app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT b.*, u.Name, u.LastName, u.Tel, u.mail 
      FROM bookings b 
      LEFT JOIN users u ON b.User_ID = u.User_ID 
      ORDER BY b.created_at DESC
    `);
    res.json({ success: true, bookings });
  } catch (error) {
    console.error("Get all bookings error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Approve Booking (Admin)
app.put("/api/admin/bookings/:bookId/approve", requireAdmin, async (req, res) => {
  const { bookId } = req.params;

  try {
    const [result] = await pool.query(
      'UPDATE bookings SET Status = "อนุมัติแล้ว" WHERE Book_ID = ? AND Status = "รออนุมัติ"',
      [bookId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ success: false, message: "ไม่สามารถอนุมัติการจองนี้ได้" });
    }

    console.log(`✅ Booking approved: ${bookId}`);
    res.json({ success: true, message: "อนุมัติการจองสำเร็จ" });
  } catch (error) {
    console.error("Approve booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Reject Booking (Admin)
app.put("/api/admin/bookings/:bookId/reject", requireAdmin, async (req, res) => {
  const { bookId } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [bookings] = await connection.query(
      'SELECT * FROM bookings WHERE Book_ID = ? AND Status = "รออนุมัติ"',
      [bookId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "ไม่สามารถยกเลิกการจองนี้ได้" });
    }

    const booking = bookings[0];

    await connection.query(
      'UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?',
      [bookId]
    );

    await connection.query(
      'UPDATE rooms SET Status = "ว่าง" WHERE Room_No = ?',
      [booking.Room_No]
    );

    await connection.commit();
    console.log(`✅ Booking rejected: ${bookId}`);
    res.json({ success: true, message: "ยกเลิกการจองสำเร็จ" });

  } catch (error) {
    await connection.rollback();
    console.error("Reject booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  } finally {
    connection.release();
  }
});

// Get All Rooms (Admin)
app.get("/api/admin/rooms", requireAdmin, async (req, res) => {
  try {
    const [rooms] = await pool.query('SELECT * FROM rooms ORDER BY Room_No');
    res.json({ success: true, rooms });
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Add New Room (Admin)
// Add New Room (Admin)
app.post("/api/admin/rooms", requireAdmin, async (req, res) => {
  const { roomNo, rate, type, maxGuests, description, image1, image2, image3, image4 } = req.body;

  if (!roomNo || !rate || !type) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    const [existing] = await pool.query('SELECT * FROM rooms WHERE Room_No = ?', [roomNo]);
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "หมายเลขห้องนี้มีในระบบแล้ว" });
    }

    await pool.query(
      'INSERT INTO rooms (Room_No, Rate, Type, Max_Guests, Description, Image1, Image2, Image3, Image4, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "ว่าง")',
      [roomNo, rate, type, maxGuests || 2, description || '', image1 || '', image2 || '', image3 || '', image4 || '']
    );

    console.log(`✅ New room added: ${roomNo}`);
    res.json({ success: true, message: "เพิ่มห้องพักสำเร็จ" });
  } catch (error) {
    console.error("Add room error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Update Room (Admin)
app.put("/api/admin/rooms/:roomNo", requireAdmin, async (req, res) => {
  const { roomNo } = req.params;
  const { rate, type, maxGuests, description, image1, image2, image3, image4, status } = req.body;

  try {
    const [result] = await pool.query(
      'UPDATE rooms SET Rate = ?, Type = ?, Max_Guests = ?, Description = ?, Image1 = ?, Image2 = ?, Image3 = ?, Image4 = ?, Status = ? WHERE Room_No = ?',
      [rate, type, maxGuests || 2, description || '', image1 || '', image2 || '', image3 || '', image4 || '', status, roomNo]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบห้องพักนี้" });
    }

    console.log(`✅ Room updated: ${roomNo}`);
    res.json({ success: true, message: "อัพเดทข้อมูลห้องพักสำเร็จ" });
  } catch (error) {
    console.error("Update room error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Delete Room (Admin)
app.delete("/api/admin/rooms/:roomNo", requireAdmin, async (req, res) => {
  const { roomNo } = req.params;

  try {
    const [bookings] = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE Room_No = ? AND Status IN ("รออนุมัติ", "อนุมัติแล้ว")',
      [roomNo]
    );

    if (bookings[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "ไม่สามารถลบห้องที่มีการจองค้างอยู่ได้" 
      });
    }

    const [result] = await pool.query('DELETE FROM rooms WHERE Room_No = ?', [roomNo]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบห้องพักนี้" });
    }

    console.log(`✅ Room deleted: ${roomNo}`);
    res.json({ success: true, message: "ลบห้องพักสำเร็จ" });
  } catch (error) {
    console.error("Delete room error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Get Dashboard Statistics (Admin)
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [totalRooms] = await pool.query('SELECT COUNT(*) as count FROM rooms');
    const [availableRooms] = await pool.query('SELECT COUNT(*) as count FROM rooms WHERE Status = "ว่าง"');
    const [totalUsers] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [pendingBookings] = await pool.query('SELECT COUNT(*) as count FROM bookings WHERE Status = "รออนุมัติ"');
    const [approvedBookings] = await pool.query('SELECT COUNT(*) as count FROM bookings WHERE Status = "อนุมัติแล้ว"');
    const [totalRevenue] = await pool.query('SELECT SUM(Total) as total FROM bookings WHERE Status = "อนุมัติแล้ว"');

    res.json({
      success: true,
      stats: {
        totalRooms: totalRooms[0].count,
        availableRooms: availableRooms[0].count,
        bookedRooms: totalRooms[0].count - availableRooms[0].count,
        totalUsers: totalUsers[0].count,
        pendingBookings: pendingBookings[0].count,
        approvedBookings: approvedBookings[0].count,
        totalRevenue: totalRevenue[0].total || 0
      }
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});


// Get All Users (Admin)
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT User_ID, Name, LastName, Tel, mail, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Delete User (Admin)
app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const [bookings] = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE User_ID = ? AND Status IN ("รออนุมัติ", "อนุมัติแล้ว")',
      [userId]
    );

    if (bookings[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "ไม่สามารถลบผู้ใช้ที่มีการจองค้างอยู่ได้" 
      });
    }

    await pool.query('DELETE FROM bookings WHERE User_ID = ?', [userId]);
    const [result] = await pool.query('DELETE FROM users WHERE User_ID = ?', [userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้นี้" });
    }

    console.log(`✅ User deleted: ${userId}`);
    res.json({ success: true, message: "ลบผู้ใช้สำเร็จ" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
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
        <a href="/login.html">กลับสู่หน้า Login</a>
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
  console.log("\n" + "=".repeat(60));
  console.log("🚀 Server running on http://localhost:" + PORT);
  console.log("=".repeat(60));
  console.log("📝 Pages:");
  console.log("   - Login:       http://localhost:" + PORT + "/login.html");
  console.log("   - Register:    http://localhost:" + PORT + "/register.html");
  console.log("   - Setup Admin: http://localhost:" + PORT + "/setup-admin");
  console.log("=".repeat(60));
  console.log("📦 Database: auth_system");
  console.log("📧 Email: anonnat@gmail.com (Gmail OTP enabled)");
  console.log("=".repeat(60));
  console.log("\n💡 First time setup:");
  console.log("   1. สร้าง database: CREATE DATABASE auth_system;");
  console.log("   2. Import ไฟล์ SQL structure");
  console.log("   3. Visit: http://localhost:" + PORT + "/setup-admin");
  console.log("=".repeat(60) + "\n");
});