const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
});

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {

    // 1️⃣ إنشاء غرفة جديدة
    socket.on('create-room', ({ userName, userPic, roomId }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        socket.isHost = true;
        
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                users: [], 
                messages: [], 
                currentTab: 'main',
                permissions: { canDraw: false, canMic: true, canCam: true },
                viewMode: 'grid'
            };
        }

        rooms[roomId].users = [{ id: socket.id, name: userName, pic: userPic, isHost: true, micMuted: false, camOff: false }];

        if (callback) callback({ success: true, roomId, permissions: rooms[roomId].permissions });
        io.to(roomId).emit('update-users', rooms[roomId].users);
    });

    // 2️⃣ انضمام للغرفة
    socket.on('join-room', ({ roomId, userName, userPic }, callback) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        socket.isHost = false;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                users: [], 
                messages: [], 
                currentTab: 'main',
                permissions: { canDraw: false, canMic: true, canCam: true },
                viewMode: 'grid'
            };
        }

        const existing = rooms[roomId].users.find(u => u.id === socket.id);
        if (!existing) {
            rooms[roomId].users.push({ id: socket.id, name: userName, pic: userPic, isHost: false, micMuted: false, camOff: false });
        }

        if (callback) callback({ success: true, isHost: false, permissions: rooms[roomId].permissions });

        // إرسال تحديث الحضور المباشر
        io.to(roomId).emit('update-users', rooms[roomId].users);

        // إعلام الجميع بوجود عضو جديد للاتصال بالفيديو (WebRTC)
        socket.to(roomId).emit('user-joined-webrtc', { userId: socket.id, userName });

        socket.emit('sync-initial-state', {
            messages: rooms[roomId].messages,
            currentTab: rooms[roomId].currentTab,
            users: rooms[roomId].users,
            permissions: rooms[roomId].permissions,
            viewMode: rooms[roomId].viewMode
        });
    });

    // 📹 3️⃣ إشارات WebRTC للصوت والصورة
    socket.on('webrtc-offer', ({ targetId, offer }) => {
        io.to(targetId).emit('webrtc-offer', { senderId: socket.id, offer });
    });

    socket.on('webrtc-answer', ({ targetId, answer }) => {
        io.to(targetId).emit('webrtc-answer', { senderId: socket.id, answer });
    });

    socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
        io.to(targetId).emit('webrtc-ice-candidate', { senderId: socket.id, candidate });
    });

    // 🔐 4️⃣ تحديث الصلاحيات من قِبَل المنشئ
    socket.on('update-permissions', ({ roomId, permissions }) => {
        if (rooms[roomId]) {
            rooms[roomId].permissions = permissions;
            io.to(roomId).emit('permissions-updated', permissions);
        }
    });

    // 🎥 5️⃣ تغيير وضع عرض الكاميرات (Host Focus vs Grid Mode)
    socket.on('change-view-mode', ({ roomId, mode }) => {
        if (rooms[roomId]) {
            rooms[roomId].viewMode = mode;
            io.to(roomId).emit('view-mode-changed', mode);
        }
    });

    // 💬 6️⃣ الشات المباشر
    socket.on('send-chat', (data) => {
        if (data && data.roomId) {
            socket.join(data.roomId);
            if (rooms[data.roomId]) rooms[data.roomId].messages.push(data);
            io.to(data.roomId).emit('receive-chat', data);
        }
    });

    // 🎙️ 7️⃣ التحكم الفردي بالمايك/الكاميرا
    socket.on('toggle-user-media', ({ roomId, targetUserId, type, state }) => {
        io.to(targetUserId).emit('force-media-control', { type, state });
        if (rooms[roomId]) {
            const target = rooms[roomId].users.find(u => u.id === targetUserId);
            if (target) {
                if (type === 'audio') target.micMuted = state;
                if (type === 'video') target.camOff = state;
            }
            io.to(roomId).emit('update-users', rooms[roomId].users);
        }
    });

    // باقي الأحداث
    socket.on('change-tab', ({ roomId, tab }) => {
        if (rooms[roomId]) rooms[roomId].currentTab = tab;
        socket.to(roomId).emit('sync-tab', tab);
    });

    socket.on('draw-board', ({ roomId, drawData }) => socket.to(roomId).emit('draw-board', drawData));
    socket.on('change-page', ({ roomId, pageIndex, totalPages }) => socket.to(roomId).emit('change-page', { pageIndex, totalPages }));
    socket.on('clear-board', ({ roomId }) => socket.to(roomId).emit('clear-board'));
    socket.on('change-bg', ({ roomId, bgClass }) => socket.to(roomId).emit('change-bg', bgClass));
    socket.on('raise-hand', ({ roomId, userName }) => socket.to(roomId).emit('notify-hand', userName));
    socket.on('laser-move', ({ roomId, x, y, visible }) => socket.to(roomId).emit('laser-move', { x, y, visible }));
    socket.on('presentation-mode', ({ roomId, active }) => socket.to(roomId).emit('presentation-mode', active));

    socket.on('leave-room', ({ roomId }) => handleDisconnect(socket, roomId));
    socket.on('disconnect', () => {
        if (socket.roomId) handleDisconnect(socket, socket.roomId);
    });
});

function handleDisconnect(socket, roomId) {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].users) {
        rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
        io.to(roomId).emit('update-users', rooms[roomId].users);
        io.to(roomId).emit('user-disconnected', socket.id);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));