const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

app.use(express.static('public'));

// تخزين بيانات الغرف (الأعضاء + الشات + التبويب الحالي)
const rooms = {};

io.on('connection', (socket) => {

    // 1️⃣ إنشاء غرفة جديدة
    socket.on('create-room', ({ userName, userPic, roomId }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        
        rooms[roomId] = {
            users: [{ id: socket.id, name: userName, pic: userPic, isHost: true }],
            messages: [],
            currentTab: 'main'
        };

        if (callback) callback({ success: true, roomId });
        
        // إرسال التحديث لجميع الأعضاء
        io.to(roomId).emit('update-users', rooms[roomId].users);
    });

    // 2️⃣ انضمام لغرفة موجودة
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: [],
                messages: [],
                currentTab: 'main'
            };
        }

        // إضافة العضو إذا لم يكن موجوداً
        const existingUser = rooms[roomId].users.find(u => u.id === socket.id);
        if (!existingUser) {
            rooms[roomId].users.push({ id: socket.id, name: userName, pic: userPic, isHost: false });
        }

        if (callback) callback({ success: true, isHost: false });

        // إرسال التحديث لجميع الأعضاء
        io.to(roomId).emit('update-users', rooms[roomId].users);

        // مزامنة الشات والتبويب الحالي للعضو الجديد المُنضم فوراً
        socket.emit('sync-initial-state', {
            messages: rooms[roomId].messages,
            currentTab: rooms[roomId].currentTab
        });
    });

    // 3️⃣ إرسال الشات وبثه لجميع الموجودين في الغرفة
    socket.on('send-chat', (data) => {
        if (rooms[data.roomId]) {
            rooms[data.roomId].messages.push(data);
        }
        io.to(data.roomId).emit('receive-chat', data);
    });

    // 4️⃣ تغيير التبويب وبثه
    socket.on('change-tab', ({ roomId, tab }) => {
        if (rooms[roomId]) {
            rooms[roomId].currentTab = tab;
        }
        socket.to(roomId).emit('sync-tab', tab);
    });

    // 5️⃣ رسم السبورة
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

    // 🚪 عند خروج أي مستخدم
    socket.on('leave-room', ({ roomId }) => {
        handleDisconnect(socket, roomId);
    });

    socket.on('disconnect', () => {
        if (socket.roomId) {
            handleDisconnect(socket, socket.roomId);
        }
    });
});

function handleDisconnect(socket, roomId) {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].users) {
        rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
        io.to(roomId).emit('update-users', rooms[roomId].users);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});