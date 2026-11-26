const express = require('express');
const router = express.Router();

// Middleware to require admin authentication
const requireAdmin = (req, res, next) => {
  if (!req.session.adminId || req.session.userType !== 'admin') {
    return res.status(401).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
};

module.exports = (pool) => {
  // Apply requireAdmin middleware to all routes
  router.use(requireAdmin);

  /* ==================== ADMIN PROFILE ==================== */
  
  // Get Admin Profile
  router.get('/profile', async (req, res) => {
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

  // Update Admin Email
  router.put('/update-email', async (req, res) => {
    try {
      const { newEmail, password } = req.body;
      const sanitizeInput = (str) => str ? str.trim().replace(/[<>]/g, '') : str;
      const validateEmail = (email) => /^[a-zA-Z0-9._-]+@gmail\.com$/.test(email);

      if (!newEmail || !password) {
        return res.json({ success: false, message: "กรุณากรอกข้อมูลให้ครบ" });
      }

      const cleanEmail = sanitizeInput(newEmail);

      if (!validateEmail(cleanEmail)) {
        return res.json({ success: false, message: "อีเมลต้องเป็น Gmail (@gmail.com) เท่านั้น" });
      }

      const bcrypt = require('bcryptjs');
      const [admins] = await pool.query('SELECT * FROM admin WHERE admin_id = ?', [req.session.adminId]);

      if (admins.length === 0) {
        return res.json({ success: false, message: "ไม่พบข้อมูลแอดมิน" });
      }

      const isMatch = await bcrypt.compare(password, admins[0].password);
      if (!isMatch) {
        return res.json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" });
      }

      const [existingEmails] = await pool.query(
        'SELECT admin_id FROM admin WHERE email = ? AND admin_id != ?',
        [cleanEmail, req.session.adminId]
      );

      if (existingEmails.length > 0) {
        return res.json({ success: false, message: "อีเมลนี้ถูกใช้แล้ว" });
      }

      await pool.query('UPDATE admin SET email = ? WHERE admin_id = ?', [cleanEmail, req.session.adminId]);
      req.session.email = cleanEmail;

      console.log(`✅ Admin email updated: ${cleanEmail}`);
      res.json({ success: true, message: "แก้ไขอีเมลสำเร็จ", email: cleanEmail });
    } catch (error) {
      console.error("❌ Update admin email error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
  });

  // Change Admin Password
  router.post('/change-password', async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const bcrypt = require('bcryptjs');
      const validatePassword = (pwd) => pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd);

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

      const [admins] = await pool.query('SELECT password FROM admin WHERE admin_id = ?', [req.session.adminId]);

      if (admins.length === 0) {
        return res.json({ success: false, message: "ไม่พบข้อมูลแอดมิน" });
      }

      const isMatch = await bcrypt.compare(currentPassword, admins[0].password);
      if (!isMatch) {
        return res.json({ 
          success: false, 
          field: "currentPassword",
          message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" 
        });
      }

      const hash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE admin SET password = ? WHERE admin_id = ?', [hash, req.session.adminId]);

      console.log(`✅ Admin password changed: ${req.session.adminId}`);
      res.json({ success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ" });
    } catch (error) {
      console.error("❌ Admin change password error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  /* ==================== BOOKINGS MANAGEMENT ==================== */

  // Get All Bookings
  router.get('/bookings', async (req, res) => {
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

  // ✅ FIXED: Get Calendar Data (แสดงการจองจนถึงสิ้นวันเช็คเอาท์ + ห้องที่ปิด)
  router.get('/calendar', async (req, res) => {
    try {
      const { roomNo, month, year } = req.query;
      
      // Query การจอง
      let query = `
        SELECT b.*, r.Type, r.Rate, u.Name, u.LastName, u.Tel, u.mail
        FROM bookings b
        LEFT JOIN rooms r ON b.Room_No = r.Room_No
        LEFT JOIN users u ON b.User_ID = u.User_ID
        WHERE b.Status IN ('รออนุมัติ', 'อนุมัติแล้ว')
        AND DATE(b.Check_out) > CURDATE()
      `;
      
      const params = [];
      
      if (roomNo) {
        query += ' AND b.Room_No = ?';
        params.push(roomNo);
      }
      
      if (month && year) {
        query += ' AND (YEAR(b.Check_in) = ? OR YEAR(b.Check_out) = ?) AND (MONTH(b.Check_in) = ? OR MONTH(b.Check_out) = ?)';
        params.push(year, year, month, month);
      }
      
      query += ' ORDER BY b.Check_in';
      
      const [bookings] = await pool.query(query, params);
      
      // ✅ NEW: Query ห้องที่ปิดปรับปรุง
      let closuresQuery = `
        SELECT 
          Room_No,
          Type,
          Status,
          Rate
        FROM rooms 
        WHERE Status = 'ปิดปรับปรุง'
      `;
      const closuresParams = [];
      
      if (roomNo) {
        closuresQuery += ' AND Room_No = ?';
        closuresParams.push(roomNo);
      }
      
      closuresQuery += ' ORDER BY Room_No';
      
      const [closures] = await pool.query(closuresQuery, closuresParams);
      const [rooms] = await pool.query('SELECT Room_No, Type, Status FROM rooms ORDER BY Room_No');
      
      console.log(`📅 Calendar loaded: ${bookings.length} bookings, ${closures.length} closed rooms`);
      
      res.json({ success: true, bookings, closures, rooms });
    } catch (error) {
      console.error("Get calendar data error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  // Approve Booking
  router.put('/bookings/:bookId/approve', async (req, res) => {
    try {
      const { bookId } = req.params;

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

  // ✅ FIXED: Reject/Cancel Booking (ยกเลิกได้ทุกสถานะ)
  router.put('/bookings/:bookId/reject', async (req, res) => {
    const { bookId } = req.params;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      console.log(`🔄 Admin attempting to cancel booking: ${bookId}`);

      const [bookings] = await connection.query(
        'SELECT * FROM bookings WHERE Book_ID = ?',
        [bookId]
      );

      if (bookings.length === 0) {
        await connection.rollback();
        console.log(`❌ Booking not found: ${bookId}`);
        return res.status(404).json({ 
          success: false, 
          message: "ไม่พบการจองนี้ในระบบ" 
        });
      }

      const booking = bookings[0];
      
      if (booking.Status === 'ยกเลิก') {
        await connection.rollback();
        console.log(`⚠️ Booking already cancelled: ${bookId}`);
        return res.status(400).json({ 
          success: false, 
          message: "การจองนี้ถูกยกเลิกไปแล้ว" 
        });
      }

      console.log(`📝 Booking details:`, {
        bookId: booking.Book_ID,
        roomNo: booking.Room_No,
        status: booking.Status,
        checkIn: booking.Check_in,
        checkOut: booking.Check_out
      });

      const [updateResult] = await connection.query(
        'UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?',
        [bookId]
      );

      console.log(`✅ Booking cancelled: ${bookId} (${updateResult.affectedRows} row updated)`);

      const today = new Date().toISOString().split('T')[0];
      const [otherBookings] = await connection.query(`
        SELECT COUNT(*) as count FROM bookings 
        WHERE Room_No = ? 
        AND Status = 'อนุมัติแล้ว'
        AND Book_ID != ?
        AND DATE(Check_out) > ?
      `, [booking.Room_No, bookId, today]);

      console.log(`🔍 Other active bookings for room ${booking.Room_No}: ${otherBookings[0].count}`);

      if (otherBookings[0].count === 0) {
        const [roomUpdate] = await connection.query(
          'UPDATE rooms SET Status = "ว่าง" WHERE Room_No = ?',
          [booking.Room_No]
        );
        console.log(`✅ Room ${booking.Room_No} set to available (${roomUpdate.affectedRows} row updated)`);
      } else {
        console.log(`ℹ️ Room ${booking.Room_No} kept as booked (other bookings exist)`);
      }

      await connection.commit();
      
      console.log(`✅ Successfully cancelled booking ${bookId}`);
      
      res.json({ 
        success: true, 
        message: "ยกเลิกการจองสำเร็จ",
        booking: {
          bookId: booking.Book_ID,
          roomNo: booking.Room_No,
          previousStatus: booking.Status,
          newStatus: 'ยกเลิก'
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error("❌ Cancel booking error:", error);
      res.status(500).json({ 
        success: false, 
        message: "เกิดข้อผิดพลาด: " + error.message 
      });
    } finally {
      connection.release();
    }
  });

  // ✅ NEW: Force Cancel (Emergency - ยกเลิกบังคับ)
  router.put('/bookings/:bookId/force-cancel', async (req, res) => {
    const { bookId } = req.params;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      console.log(`⚠️ FORCE CANCEL requested for booking: ${bookId}`);

      const [bookings] = await connection.query(
        'SELECT * FROM bookings WHERE Book_ID = ?',
        [bookId]
      );

      if (bookings.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: "ไม่พบการจองนี้" });
      }

      const booking = bookings[0];

      if (booking.Status !== 'ยกเลิก') {
        await connection.query(
          'UPDATE bookings SET Status = "ยกเลิก" WHERE Book_ID = ?',
          [bookId]
        );

        const today = new Date().toISOString().split('T')[0];
        const [otherBookings] = await connection.query(`
          SELECT COUNT(*) as count FROM bookings 
          WHERE Room_No = ? 
          AND Status = 'อนุมัติแล้ว'
          AND Book_ID != ?
          AND DATE(Check_out) > ?
        `, [booking.Room_No, bookId, today]);

        if (otherBookings[0].count === 0) {
          await connection.query(
            'UPDATE rooms SET Status = "ว่าง" WHERE Room_No = ?',
            [booking.Room_No]
          );
        }
      }

      await connection.commit();
      
      console.log(`✅ Force cancelled booking ${bookId}`);
      
      res.json({ 
        success: true, 
        message: "บังคับยกเลิกการจองสำเร็จ" 
      });

    } catch (error) {
      await connection.rollback();
      console.error("❌ Force cancel error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    } finally {
      connection.release();
    }
  });

  // ✅ NEW: Debug Booking
  router.get('/bookings/:bookId/debug', async (req, res) => {
    try {
      const { bookId } = req.params;
      
      const [bookings] = await pool.query(
        'SELECT * FROM bookings WHERE Book_ID = ?',
        [bookId]
      );

      if (bookings.length === 0) {
        return res.json({ success: false, message: "Booking not found" });
      }

      const booking = bookings[0];
      const today = new Date().toISOString().split('T')[0];

      const [room] = await pool.query(
        'SELECT * FROM rooms WHERE Room_No = ?',
        [booking.Room_No]
      );

      const [relatedBookings] = await pool.query(`
        SELECT Book_ID, Status, Check_in, Check_out 
        FROM bookings 
        WHERE Room_No = ? 
        AND Status != 'ยกเลิก'
        ORDER BY Check_in
      `, [booking.Room_No]);

      res.json({
        success: true,
        debug: {
          booking: booking,
          room: room[0],
          today: today,
          canCancel: booking.Status !== 'ยกเลิก',
          relatedBookings: relatedBookings
        }
      });

    } catch (error) {
      console.error("Debug error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  /* ==================== ROOM CLOSURES (ใช้ Status = "ปิดปรับปรุง") ==================== */

  // ✅ NEW: Get Closed Rooms
  router.get('/room-closures', async (req, res) => {
    try {
      const [closures] = await pool.query(`
        SELECT Room_No, Type, Rate, Status, created_at
        FROM rooms
        WHERE Status = 'ปิดปรับปรุง'
        ORDER BY Room_No
      `);
      
      res.json({ success: true, closures });
    } catch (error) {
      console.error("Get room closures error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  // ✅ NEW: Close Room (ปิดห้อง)
  router.post('/room-closures', async (req, res) => {
    const { roomNo } = req.body;

    if (!roomNo) {
      return res.status(400).json({ 
        success: false, 
        message: "กรุณาระบุหมายเลขห้อง" 
      });
    }

    try {
      // ตรวจสอบว่าห้องมีอยู่จริง
      const [rooms] = await pool.query('SELECT * FROM rooms WHERE Room_No = ?', [roomNo]);
      
      if (rooms.length === 0) {
        return res.status(404).json({ success: false, message: "ไม่พบหมายเลขห้องนี้" });
      }

      // ตรวจสอบว่าห้องปิดอยู่แล้วหรือไม่
      if (rooms[0].Status === 'ปิดปรับปรุง') {
        return res.status(400).json({ 
          success: false, 
          message: "ห้องนี้ปิดปรับปรุงอยู่แล้ว" 
        });
      }

      // ตรวจสอบว่ามีการจองอยู่หรือไม่
      const [existingBookings] = await pool.query(`
        SELECT COUNT(*) as count 
        FROM bookings 
        WHERE Room_No = ? 
        AND Status IN ('รออนุมัติ', 'อนุมัติแล้ว')
        AND DATE(Check_out) > CURDATE()
      `, [roomNo]);

      if (existingBookings[0].count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "ไม่สามารถปิดห้องได้เนื่องจากมีการจองอยู่" 
        });
      }

      // ปิดห้อง
      await pool.query(
        'UPDATE rooms SET Status = "ปิดปรับปรุง" WHERE Room_No = ?',
        [roomNo]
      );

      console.log(`✅ Room closed: ${roomNo}`);
      res.json({ success: true, message: "ปิดห้องสำเร็จ" });
    } catch (error) {
      console.error("❌ Close room error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
  });

  // ✅ NEW: Open Room (เปิดห้องคืน)
  router.delete('/room-closures/:roomNo', async (req, res) => {
    const { roomNo } = req.params;

    try {
      // ตรวจสอบว่าห้องปิดอยู่จริง
      const [rooms] = await pool.query(
        'SELECT * FROM rooms WHERE Room_No = ? AND Status = "ปิดปรับปรุง"',
        [roomNo]
      );

      if (rooms.length === 0) {
        return res.status(404).json({ success: false, message: "ไม่พบห้องที่ปิดนี้" });
      }

      // เปิดห้อง
      const [result] = await pool.query(
        'UPDATE rooms SET Status = "ว่าง" WHERE Room_No = ?',
        [roomNo]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "ไม่พบห้องนี้" });
      }

      console.log(`✅ Room opened: ${roomNo}`);
      res.json({ success: true, message: "เปิดห้องคืนสำเร็จ" });
    } catch (error) {
      console.error("Open room error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  // ✅ NEW: Check if room is closed
  router.post('/room-closures/check', async (req, res) => {
    const { roomNo } = req.body;

    try {
      const [rooms] = await pool.query(`
        SELECT * FROM rooms
        WHERE Room_No = ?
        AND Status = 'ปิดปรับปรุง'
      `, [roomNo]);

      const isClosed = rooms.length > 0;

      res.json({ 
        success: true, 
        isClosed,
        room: isClosed ? rooms[0] : null
      });
    } catch (error) {
      console.error("Check room closure error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  /* ==================== ROOMS MANAGEMENT ==================== */

  // Get All Rooms (รวมห้องที่ปิด)
  router.get('/rooms', async (req, res) => {
    try {
      const [rooms] = await pool.query('SELECT * FROM rooms ORDER BY Room_No');
      res.json({ success: true, rooms });
    } catch (error) {
      console.error("Get rooms error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
    }
  });

  // Add Room
  router.post('/rooms', async (req, res) => {
    const { roomNo, rate, type, maxGuests, description, image1, image2, image3, image4 } = req.body;

    if (!roomNo || !rate || !type) {
      return res.status(400).json({ 
        success: false, 
        message: "กรุณากรอกข้อมูลให้ครบถ้วน" 
      });
    }

    try {
      const [existing] = await pool.query('SELECT * FROM rooms WHERE Room_No = ?', [roomNo]);
      
      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: "หมายเลขห้องนี้มีในระบบแล้ว" });
      }

      await pool.query(
        'INSERT INTO rooms (Room_No, Rate, Type, Max_Guests, Description, Image1, Image2, Image3, Image4, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "ว่าง")',
        [roomNo, parseFloat(rate), type, parseInt(maxGuests) || 2, description || '', image1 || '', image2 || '', image3 || '', image4 || '']
      );

      console.log(`✅ Room added: ${roomNo}`);
      res.json({ success: true, message: "เพิ่มห้องพักสำเร็จ" });
    } catch (error) {
      console.error("❌ Add room error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
  });

  // Update Room
  router.put('/rooms/:roomNo', async (req, res) => {
    const { roomNo } = req.params;
    const { rate, type, maxGuests, description, image1, image2, image3, image4, status } = req.body;

    try {
      const [result] = await pool.query(
        'UPDATE rooms SET Rate = ?, Type = ?, Max_Guests = ?, Description = ?, Image1 = ?, Image2 = ?, Image3 = ?, Image4 = ?, Status = ? WHERE Room_No = ?',
        [parseFloat(rate), type, parseInt(maxGuests) || 2, description || '', image1 || '', image2 || '', image3 || '', image4 || '', status, roomNo]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "ไม่พบห้องพักนี้" });
      }

      console.log(`✅ Room updated: ${roomNo}`);
      res.json({ success: true, message: "อัพเดทข้อมูลห้องพักสำเร็จ" });
    } catch (error) {
      console.error("❌ Update room error:", error);
      res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด: " + error.message });
    }
  });

  // Delete Room
  router.delete('/rooms/:roomNo', async (req, res) => {
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

  /* ==================== USERS MANAGEMENT ==================== */

  // Get All Users
  router.get('/users', async (req, res) => {
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

  // Delete User
  router.delete('/users/:userId', async (req, res) => {
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

  /* ==================== STATISTICS ==================== */

  // Get Dashboard Statistics
  router.get('/stats', async (req, res) => {
    try {
      const [totalRooms] = await pool.query('SELECT COUNT(*) as count FROM rooms');
      const [availableRooms] = await pool.query('SELECT COUNT(*) as count FROM rooms WHERE Status = "ว่าง"');
      const [totalUsers] = await pool.query('SELECT COUNT(*) as count FROM users');
      const [pendingBookings] = await pool.query('SELECT COUNT(*) as count FROM bookings WHERE Status = "รออนุมัติ"');
      const [approvedBookings] = await pool.query('SELECT COUNT(*) as count FROM bookings WHERE Status = "อนุมัติแล้ว"');
      const [totalRevenue] = await pool.query('SELECT SUM(Total) as total FROM bookings WHERE Status = "อนุมัติแล้ว"');
      
      // ✅ NEW: เพิ่มสถิติห้องที่ปิด
      const [closedRooms] = await pool.query(`SELECT COUNT(*) as count FROM rooms WHERE Status = 'ปิดปรับปรุง'`);

      res.json({
        success: true,
        stats: {
          totalRooms: totalRooms[0].count,
          availableRooms: availableRooms[0].count,
          bookedRooms: totalRooms[0].count - availableRooms[0].count - closedRooms[0].count,
          closedRooms: closedRooms[0].count,
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
  

  console.log('✅ Admin routes loaded - Room Closure using Status field only');

  
  
  return router;
};