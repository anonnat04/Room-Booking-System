/**
 * ✅ FIXED: Local Storage Persistence System
 * แก้ปัญหา Timezone - บันทึกวันที่เป็น YYYY-MM-DD (local time) ไม่ใช้ UTC
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'pendingBooking';
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * ✅ แปลง Date object เป็น YYYY-MM-DD โดยใช้ local timezone
     * ป้องกันการเลื่อนวันเพราะ UTC offset
     */
    function dateToLocalString(date) {
        if (!date) return null;
        
        // ถ้าเป็น string YYYY-MM-DD อยู่แล้ว ให้ return เลย
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return date;
        }
        
        // แปลงเป็น Date object
        const d = date instanceof Date ? date : new Date(date);
        
        // ใช้ local time components (ไม่ใช้ UTC)
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    /**
     * บันทึกข้อมูลการจองลง localStorage
     */
    function saveBookingData(checkIn, checkOut, guests, roomNo, roomType, rate) {
        try {
            // ✅ CRITICAL: แปลงวันที่เป็น YYYY-MM-DD local time
            const checkInLocal = dateToLocalString(checkIn);
            const checkOutLocal = dateToLocalString(checkOut);
            
            console.log('💾 Saving to localStorage:', {
                original_checkIn: checkIn,
                converted_checkIn: checkInLocal,
                original_checkOut: checkOut,
                converted_checkOut: checkOutLocal,
                guests: guests
            });
            
            const data = {
                checkIn: checkInLocal,
                checkOut: checkOutLocal,
                guests: guests || 2,
                roomNo: roomNo || null,
                roomType: roomType || null,
                rate: rate || null,
                timestamp: Date.now()
            };
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            console.log('✅ Saved successfully:', data);
            return true;
        } catch (error) {
            console.error('❌ Save error:', error);
            return false;
        }
    }

    /**
     * โหลดข้อมูลการจองจาก localStorage
     */
    function loadBookingData() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) {
                console.log('ℹ️ No saved booking data');
                return null;
            }

            const data = JSON.parse(stored);
            
            // ตรวจสอบอายุของข้อมูล
            if (data.timestamp && (Date.now() - data.timestamp > MAX_AGE)) {
                console.log('⚠️ Data expired, clearing...');
                clearBookingData();
                return null;
            }
            
            console.log('✅ Loaded booking data:', data);
            return data;
        } catch (error) {
            console.error('❌ Load error:', error);
            return null;
        }
    }

    /**
     * ลบข้อมูลการจอง
     */
    function clearBookingData() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('🗑️ Cleared booking data');
            return true;
        } catch (error) {
            console.error('❌ Clear error:', error);
            return false;
        }
    }

    /**
     * ลบข้อมูลหลังจากจองสำเร็จ
     */
    function clearAfterBookingSuccess() {
        return clearBookingData();
    }

    /**
     * ตรวจสอบว่ามีข้อมูลที่บันทึกไว้หรือไม่
     */
    function hasStoredBooking() {
        const data = loadBookingData();
        return data !== null;
    }

    // Export API
    window.BookingPersistence = {
        save: saveBookingData,
        saveBookingData: saveBookingData,
        load: loadBookingData,
        loadBookingData: loadBookingData,
        clear: clearBookingData,
        clearBookingData: clearBookingData,
        clearAfterBookingSuccess: clearAfterBookingSuccess,
        hasStored: hasStoredBooking,
        hasStoredBooking: hasStoredBooking,
        dateToLocalString: dateToLocalString
    };

    console.log('✅ BookingPersistence system loaded');
})();