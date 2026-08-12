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

    // إنشاء غرفة
    socket.on('create-room', ({ userName, userPic }, callback) => {
        const roomId = Math.random().toString(36).substring(2, 8);
        rooms[roomId] = {
            host: socket.id,
            users: {},
            currentTab: 'main'
        };
        rooms[roomId].users[socket.id] = { name: userName, pic: userPic, isHost: true };
        socket.join(roomId);
        callback({ success: true, roomId });
    });

    // الانضمام لغرفة
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        if (!rooms[roomId]) {
            return callback({ success: false, message: 'الغرفة غير موجودة!' });
        }
        rooms[roomId].users[socket.id] = { name: userName, pic: userPic, isHost: false };
        socket.join(roomId);
        
        // إبلاغ الجميع بالمستخدم الجديد
        io.to(roomId).emit('update-users', Object.values(rooms[roomId].users));
        
        // مزامنة التبويب الحالي مع العضو الجديد
        socket.emit('sync-tab', rooms[roomId].currentTab);
        
        callback({ success: true, roomId });
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

    // مؤشر الليزر اللحظي
    socket.on('laser-move', ({ roomId, x, y, visible }) => {
        socket.to(roomId).emit('laser-move', { x, y, visible });
    });

    // وضع الشرح تلقائي للجميع
    socket.on('presentation-mode', ({ roomId, active }) => {
        socket.to(roomId).emit('presentation-mode', active);
    });

    // قطع الاتصال
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].users[socket.id]) {
                delete rooms[roomId].users[socket.id];
                io.to(roomId).emit('update-users', Object.values(rooms[roomId].users));
                if (Object.keys(rooms[roomId].users).length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بنجاح على: http://localhost:${PORT}`);
});