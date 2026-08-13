const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// تخزين بيانات الغرف
const rooms = {};

io.on('connection', (socket) => {
    console.log('⚡ متصل جديد:', socket.id);

    // 1. إنشاء غرفة (Host)
    socket.on('create-room', ({ userName, userPic }, callback) => {
        const roomId = Math.random().toString(36).substring(2, 8);
        
        rooms[roomId] = {
            host: socket.id,
            users: {},
            currentTab: 'main'
        };

        rooms[roomId].users[socket.id] = { id: socket.id, name: userName, pic: userPic, isHost: true };
        
        socket.join(roomId);
        socket.roomId = roomId;

        // رد للعميل بتأكيد النجاح مع كود الغرفة
        callback({ success: true, roomId });

        // إرسال قائمة المشتركين للـ Host فوراً
        io.to(roomId).emit('update-users', Object.values(rooms[roomId].users));
    });

    // 2. الانضمام لغرفة (Viewer)
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        if (!rooms[roomId]) {
            return callback({ success: false, message: 'الغرفة غير موجودة أو الكود خاطئ!' });
        }

        rooms[roomId].users[socket.id] = { id: socket.id, name: userName, pic: userPic, isHost: false };
        socket.join(roomId);
        socket.roomId = roomId;

        // إبلاغ الجميع بالقائمة المحدثة
        io.to(roomId).emit('update-users', Object.values(rooms[roomId].users));

        // مزامنة التبويب الحالي مع العضو الجديد
        socket.emit('sync-tab', rooms[roomId].currentTab);

        callback({ success: true, roomId, isHost: false });
    });

    // مزامنة تنقل التبويبات (للآدمن فقط)
    socket.on('change-tab', ({ roomId, tab }) => {
        if (rooms[roomId] && rooms[roomId].host === socket.id) {
            rooms[roomId].currentTab = tab;
            socket.to(roomId).emit('sync-tab', tab);
        }
    });

    // رسم السبورة اللحظي
    socket.on('draw-board', ({ roomId, drawData }) => {
        socket.to(roomId).emit('draw-board', drawData);
    });

    // مزامنة خلفية وحذف السبورة
    socket.on('clear-board', (roomId) => {
        socket.to(roomId).emit('clear-board');
    });

    socket.on('change-bg', ({ roomId, bgClass }) => {
        socket.to(roomId).emit('change-bg', bgClass);
    });

    // الشات المباشر
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });

    // طلب الكلمة / رفع اليد
    socket.on('raise-hand', ({ roomId, userName }) => {
        io.to(roomId).emit('notify-hand', userName);
    });

    // مؤشر الليزر اللحظي
    socket.on('laser-move', ({ roomId, x, y, visible }) => {
        socket.to(roomId).emit('laser-move', { x, y, visible });
    });

    // وضع الشرح تلقائي للجميع
    socket.on('presentation-mode', ({ roomId, active }) => {
        socket.to(roomId).emit('presentation-mode', active);
    });

    // الخروج الصريح من الغرفة
    socket.on('leave-room', ({ roomId }) => {
        removeUserFromRoom(socket, roomId);
    });

    // قطع الاتصال تلقائياً
    socket.on('disconnect', () => {
        if (socket.roomId) {
            removeUserFromRoom(socket, socket.roomId);
        }
    });
});

// دالة تنظيف ومسح المستخدم عند الخروج
function removeUserFromRoom(socket, roomId) {
    if (rooms[roomId] && rooms[roomId].users[socket.id]) {
        delete rooms[roomId].users[socket.id];
        
        // تحديث القائمة للباقيين
        io.to(roomId).emit('update-users', Object.values(rooms[roomId].users));

        // لو الغرفة فضيت تماماً نمسحها من الذاكرة
        if (Object.keys(rooms[roomId].users).length === 0) {
            delete rooms[roomId];
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على البورت: ${PORT}`);
});