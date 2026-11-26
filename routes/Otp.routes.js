const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

/* ===== CONFIG ===== */
const OTP_TTL = 5 * 60 * 1000;        // OTP หมดอายุ 5 นาที
const RESEND_COOLDOWN = 60 * 1000;    // ขอ OTP ใหม่ได้ทุก 60 วินาที
const MAX_ATTEMPTS = 5;               // กรอก OTP ผิดได้สูงสุด 5 ครั้ง

/* ===== OTP STORAGE ===== */
// Production จริงควรใช้ Redis หรือ Database แทน Map
const otpStore = new Map();

// ล้าง OTP ที่หมดอายุทุก 1 นาที
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (now > value.expires) otpStore.delete(key);
  }
}, 60 * 1000).unref();

/* ===== RATE LIMITERS ===== */
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง" }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "ลองบ่อยเกินไป กรุณาลองใหม่ภายหลัง" }
});

/* ===== HELPER FUNCTIONS ===== */

// สร้าง OTP 6 หลักแบบปลอดภัย
const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

// สร้าง reset token
const generateResetToken = () => crypto.randomBytes(32).toString('hex');

// ล้างข้อมูลที่ผู้ใช้กรอก
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

// ซ่อนอีเมล (a***n@gmail.com)
const maskEmail = (email) => {
  if (!email) return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [name, domain] = parts;
  if (name.length <= 2) return '***@' + domain;
  return name[0] + '***' + name.slice(-1) + '@' + domain;
};

// ตรวจความแข็งแรงของรหัสผ่าน
const validatePassword = (pwd) => {
  return typeof pwd === 'string' &&
         pwd.length >= 8 &&
         /[A-Z]/.test(pwd) &&
         /[a-z]/.test(pwd) &&
         /[0-9]/.test(pwd);
};

// เทียบ string แบบ timing-safe
const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/* ===== EMAIL ===== */

// สร้าง transporter ครั้งเดียว อ่านค่าจาก .env
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn('⚠️ EMAIL_USER / EMAIL_PASS ยังไม่ได้ตั้งค่าใน .env');
}

const buildEmailHTML = (otp) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 40px 30px; text-align: center; }
    .otp-box { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-size: 48px; font-weight: bold; padding: 20px; border-radius: 15px; letter-spacing: 10px; margin: 30px 0; display: inline-block; }
    .message { color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0; }
    .warning { background: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 15px; margin: 20px 0; color: #856404; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>🔐 รีเซ็ตรหัสผ่าน</h1></div>
    <div class="content">
      <h2>รหัส OTP สำหรับรีเซ็ตรหัสผ่าน</h2>
      <p class="message">คุณได้ขอรีเซ็ตรหัสผ่าน กรุณากรอกรหัส OTP ด้านล่างนี้:</p>
      <div class="otp-box">${otp}</div>
      <div class="warning">
        <strong>⚠️ คำเตือน:</strong> รหัส OTP นี้จะหมดอายุภายใน <strong>5 นาที</strong><br>
        หากคุณไม่ได้ร้องขอการรีเซ็ตรหัสผ่าน กรุณาเพิกเฉยอีเมลนี้
      </div>
      <p class="message" style="color: #999; font-size: 14px;">อีเมลนี้ถูกส่งอัตโนมัติ กรุณาอย่าตอบกลับ</p>
    </div>
    <div class="footer">© ${new Date().getFullYear()} LuxeStay. All rights reserved.</div>
  </div>
</body>
</html>`;

const sendOTP = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: `"LuxeStay 🏨" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🔐 รหัส OTP สำหรับรีเซ็ตรหัสผ่าน',
      html: buildEmailHTML(otp)
    });
    console.log(`📧 OTP email sent to ${maskEmail(email)}`);
    return true;
  } catch (error) {
    console.error('❌ Send email error:', error.message);
    // โหมด dev เท่านั้นที่แสดง OTP ใน console
    if (!isProd) console.log(`📱 DEV BACKUP - OTP for ${email}: ${otp}`);
    return false;
  }
};

/* ===== ROUTES ===== */

// Route 1: Forgot Password - ส่ง OTP
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  try {
    const cleanMail = sanitizeInput(req.body.email).toLowerCase();

    if (!cleanMail) {
      return res.json({ success: false, message: "กรุณากรอกอีเมล" });
    }

    // ข้อความตอบกลับเหมือนกันเสมอ (กัน user enumeration)
    const genericResponse = {
      success: true,
      message: "หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งรหัส OTP ไปให้แล้ว",
      maskedEmail: maskEmail(cleanMail)
    };

    const pool = req.app.get('pool');
    const [users] = await pool.query("SELECT mail FROM users WHERE mail = ?", [cleanMail]);

    if (users.length === 0) {
      return res.json(genericResponse);
    }

    // กันกดขอ OTP รัวๆ
    const existing = otpStore.get(cleanMail);
    if (existing && Date.now() - existing.createdAt < RESEND_COOLDOWN) {
      const wait = Math.ceil((RESEND_COOLDOWN - (Date.now() - existing.createdAt)) / 1000);
      return res.json({ success: false, message: `กรุณารอ ${wait} วินาที ก่อนขอรหัสใหม่` });
    }

    const otp = generateOTP();
    otpStore.set(cleanMail, {
      otp,
      resetToken: generateResetToken(),
      expires: Date.now() + OTP_TTL,
      createdAt: Date.now(),
      attempts: 0,
      verified: false
    });

    await sendOTP(cleanMail, otp);
    if (!isProd) console.log(`✅ [DEV] OTP for ${cleanMail}: ${otp}`);

    res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Route 2: Verify OTP
router.post('/verify-otp', verifyLimiter, async (req, res) => {
  try {
    const cleanMail = sanitizeInput(req.body.email).toLowerCase();
    const otp = sanitizeInput(String(req.body.otp || ''));

    if (!cleanMail || !otp) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const storedData = otpStore.get(cleanMail);

    if (!storedData) {
      return res.json({ success: false, message: "ไม่พบรหัส OTP หรือหมดอายุแล้ว" });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(cleanMail);
      return res.json({ success: false, message: "รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่" });
    }

    // จำกัดจำนวนครั้งที่กรอกผิด
    storedData.attempts += 1;
    if (storedData.attempts > MAX_ATTEMPTS) {
      otpStore.delete(cleanMail);
      return res.json({ success: false, message: "ลองผิดเกินกำหนด กรุณาขอรหัสใหม่" });
    }

    if (!safeEqual(otp, storedData.otp)) {
      const left = MAX_ATTEMPTS - storedData.attempts;
      return res.json({ success: false, message: `รหัส OTP ไม่ถูกต้อง (เหลืออีก ${left} ครั้ง)` });
    }

    storedData.verified = true;

    res.json({
      success: true,
      message: "ยืนยัน OTP สำเร็จ",
      resetToken: storedData.resetToken
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// Route 3: Reset Password
router.post('/reset-password', verifyLimiter, async (req, res) => {
  try {
    const cleanMail = sanitizeInput(req.body.email).toLowerCase();
    const { resetToken, newPassword } = req.body;

    if (!cleanMail || !resetToken || !newPassword) {
      return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const storedData = otpStore.get(cleanMail);

    // ต้องผ่านการยืนยัน OTP แล้ว และ token ต้องตรง
    if (!storedData || !storedData.verified || !safeEqual(resetToken, storedData.resetToken)) {
      return res.json({ success: false, message: "ไม่สามารถรีเซ็ตรหัสผ่านได้" });
    }

    if (Date.now() > storedData.expires) {
      otpStore.delete(cleanMail);
      return res.json({ success: false, message: "หมดเวลาในการรีเซ็ตรหัสผ่าน" });
    }

    if (!validatePassword(newPassword)) {
      return res.json({
        success: false,
        message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว ประกอบด้วยตัวพิมพ์ใหญ่ เล็ก และตัวเลข"
      });
    }

    const pool = req.app.get('pool');
    const bcrypt = req.app.get('bcrypt');

    const hash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      "UPDATE users SET password = ?, updated_at = NOW() WHERE mail = ?",
      [hash, cleanMail]
    );

    otpStore.delete(cleanMail);

    console.log(`✅ Password reset successful for ${maskEmail(cleanMail)}`);
    res.json({ success: true, message: "รีเซ็ตรหัสผ่านสำเร็จ" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

/* ===== DEBUG ROUTE (เปิดเฉพาะตอน dev เท่านั้น) ===== */
if (!isProd) {
  router.get('/debug/otp-store', (req, res) => {
    const otpData = {};
    otpStore.forEach((value, key) => {
      otpData[key] = {
        otp: value.otp,
        attempts: value.attempts,
        expiresIn: Math.max(0, Math.floor((value.expires - Date.now()) / 1000)) + ' seconds'
      };
    });
    res.json({ success: true, count: otpStore.size, otpStore: otpData });
  });
}

module.exports = router;