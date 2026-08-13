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

    // إنشاء غرفة
    socket.on('create-room', ({ userName, userPic, roomId }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        
        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push({ id: socket.id, name: userName, pic: userPic, isHost: true });

        if (callback) callback({ success: true, roomId });
        io.to(roomId).emit('update-users', rooms[roomId]);
    });

    // انضمام لغرفة
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push({ id: socket.id, name: userName, pic: userPic, isHost: false });

        if (callback) callback({ success: true, isHost: false });
        io.to(roomId).emit('update-users', rooms[roomId]);
    });

    // الشات المباشر (إرسال لكل المتصلين بالغرفة)
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });

    // مزامنة التبويبات (لما المحاضر يغير التبويب)
    socket.on('change-tab', ({ roomId, tab }) => {
        socket.to(roomId).emit('sync-tab', tab);
    });

    // رسم السبورة
    socket.on('draw-board', ({ roomId, drawData }) => {
        socket.to(roomId).emit('draw-board', drawData);
    });

    // تغيير صفحة السبورة
    socket.on('change-page', ({ roomId, pageIndex, totalPages }) => {
        socket.to(roomId).emit('change-page', { pageIndex, totalPages });
    });

    // مسح السبورة
    socket.on('clear-board', ({ roomId }) => {
        socket.to(roomId).emit('clear-board');
    });

    // عند الخروج
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