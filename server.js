const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8 // 100 MB لتبادل الملفات والصور
});

app.use(express.static(path.join(__dirname, 'public')));

// تخزين حالات الغرف
const rooms = {};

io.on('connection', (socket) => {
  // الانضمام للغرفة
  socket.on('join-room', ({ roomId, user, isHost }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        hostId: isHost ? socket.id : null,
        users: {},
        viewMode: 'grid',
        explainMode: false,
        activeTab: 'camera'
      };
    }
    
    if (isHost && !rooms[roomId].hostId) {
      rooms[roomId].hostId = socket.id;
    }

    rooms[roomId].users[socket.id] = {
      id: socket.id,
      name: user.name || 'مستخدم مميز',
      avatar: user.avatar || '',
      isHost: rooms[roomId].hostId === socket.id
    };

    socket.emit('room-joined', {
      roomId,
      isHost: rooms[roomId].hostId === socket.id,
      roomState: rooms[roomId],
      existingUsers: rooms[roomId].users
    });

    socket.to(roomId).emit('user-connected', {
      userId: socket.id,
      user: rooms[roomId].users[socket.id]
    });
  });

  // إشارات WebRTC
  socket.on('signal-offer', ({ targetId, offer }) => {
    io.to(targetId).emit('signal-offer', { senderId: socket.id, offer });
  });

  socket.on('signal-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('signal-answer', { senderId: socket.id, answer });
  });

  socket.on('signal-ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('signal-ice-candidate', { senderId: socket.id, candidate });
  });

  // أوضاع الرؤية (خاص بالمضيف)
  socket.on('change-view-mode', ({ roomId, mode }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      rooms[roomId].viewMode = mode;
      io.to(roomId).emit('view-mode-changed', { mode });
    }
  });

  // وضع الشرح التفاعلي (خاص بالمضيف)
  socket.on('toggle-explain-mode', ({ roomId, active }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      rooms[roomId].explainMode = active;
      io.to(roomId).emit('explain-mode-changed', { active, hostId: socket.id });
    }
  });

  // مزامنة التنقل اللحظي مع المضيف
  socket.on('sync-navigation', ({ roomId, tabId }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      rooms[roomId].activeTab = tabId;
      io.to(roomId).emit('navigation-synced', { tabId });
    }
  });

  // مزامنة السبورة التفاعلية
  socket.on('whiteboard-draw', ({ roomId, drawData }) => {
    socket.to(roomId).emit('whiteboard-draw', drawData);
  });

  socket.on('whiteboard-page-change', ({ roomId, pageIndex, totalPages }) => {
    socket.to(roomId).emit('whiteboard-page-change', { pageIndex, totalPages });
  });

  socket.on('whiteboard-clear', ({ roomId, pageIndex }) => {
    socket.to(roomId).emit('whiteboard-clear', { pageIndex });
  });

  // الشات والملفات
  socket.on('send-chat-message', ({ roomId, message }) => {
    io.to(roomId).emit('new-chat-message', message);
  });

  // رفع اليد (يرسل حصرياً للمضيف فقط)
  socket.on('raise-hand', ({ roomId }) => {
    if (rooms[roomId]) {
      const user = rooms[roomId].users[socket.id];
      const hostId = rooms[roomId].hostId;
      if (hostId && user) {
        io.to(hostId).emit('hand-raised-notification', {
          userId: socket.id,
          userName: user.name,
          userAvatar: user.avatar,
          timestamp: new Date().toLocaleTimeString('ar-EG')
        });
      }
    }
  });

  // مغادرة المستخدم
  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const userName = rooms[roomId].users[socket.id].name;
        delete rooms[roomId].users[socket.id];
        
        if (rooms[roomId].hostId === socket.id) {
          rooms[roomId].hostId = null;
        }

        io.to(roomId).emit('user-disconnected', { userId: socket.id, userName });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`خادم البولاقي ميت يعمل بنجاح على: http://localhost:${PORT}`);
});