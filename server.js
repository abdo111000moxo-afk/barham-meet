const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {

    // 1️⃣ إنشاء غرفة
    socket.on('create-room', ({ userName, userPic, roomId }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        
        if (!rooms[roomId]) rooms[roomId] = [];
        // إضافة المنظم
        rooms[roomId].push({ id: socket.id, name: userName, pic: userPic, isHost: true });

        if (callback) callback({ success: true, roomId });
        
        // إرسال التحديث لجميع من في الغرفة (بما فيهم المنظم)
        io.to(roomId).emit('update-users', rooms[roomId]);
    });

    // 2️⃣ انضمام لغرفة
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push({ id: socket.id, name: userName, pic: userPic, isHost: false });

        if (callback) callback({ success: true, isHost: false });
        
        // إرسال التحديث لجميع الحضور
        io.to(roomId).emit('update-users', rooms[roomId]);
    });

    // 3️⃣ الشات المباشر (يُبث للجميع بما فيهم الراسل)
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });

    // 4️⃣ باقي الميزات
    socket.on('change-tab', ({ roomId, tab }) => {
        socket.to(roomId).emit('sync-tab', tab);
    });

    socket.on('draw-board', ({ roomId, drawData }) => {
        socket.to(roomId).emit('draw-board', drawData);
    });

    socket.on('change-page', ({ roomId, pageIndex, totalPages }) => {
        socket.to(roomId).emit('change-page', { pageIndex, totalPages });
    });

    socket.on('clear-board', ({ roomId }) => {
        socket.to(roomId).emit('clear-board');
    });

    socket.on('change-bg', ({ roomId, bgClass }) => {
        socket.to(roomId).emit('change-bg', bgClass);
    });

    socket.on('raise-hand', ({ roomId, userName }) => {
        socket.to(roomId).emit('notify-hand', userName);
    });

    socket.on('laser-move', ({ roomId, x, y, visible }) => {
        socket.to(roomId).emit('laser-move', { x, y, visible });
    });

    socket.on('presentation-mode', ({ roomId, active }) => {
        socket.to(roomId).emit('presentation-mode', active);
    });

    socket.on('disconnect', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId] = rooms[socket.roomId].filter(u => u.id !== socket.id);
            io.to(socket.roomId).emit('update-users', rooms[socket.roomId]);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});