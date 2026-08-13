const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// تخزين بيانات الغرف
const rooms = {};

io.on('connection', (socket) => {
  
  // 1. دخول الغرفة أو إنشاؤها
  socket.on('join-room', ({ roomId, user }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        hostId: socket.id,
        permissions: { allowWhiteboard: true, allowMic: true, allowCam: true },
        participants: {},
        currentTab: 'camera'
      };
    }

    rooms[roomId].participants[socket.id] = { ...user, socketId: socket.id, handRaised: false };

    // إرسال البيانات للعضو الجديد
    socket.emit('init-room-state', {
      isHost: rooms[roomId].hostId === socket.id,
      permissions: rooms[roomId].permissions,
      participants: rooms[roomId].participants,
      currentTab: rooms[roomId].currentTab
    });

    // إبلاغ الجميع بالعضو الجديد
    io.to(roomId).emit('user-joined', { socketId: socket.id, user });
  });

  // 2. تحديث الصلاحيات من الهوست
  socket.on('update-permissions', ({ roomId, permissions }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      rooms[roomId].permissions = permissions;
      io.to(roomId).emit('permissions-updated', permissions);
    }
  });

  // 3. التنقل الموحد بين الأزرار (أنا انتقلت لزر كله ينتقل له)
  socket.on('switch-tab', ({ roomId, tabName }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      rooms[roomId].currentTab = tabName;
      io.to(roomId).emit('tab-switched', tabName);
    }
  });

  // 4. وضع الشرح (Focus Presentation Mode)
  socket.on('toggle-focus-mode', ({ roomId, enabled }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      io.to(roomId).emit('focus-mode-toggled', enabled);
    }
  });

  // 5. رسم الصبورة المباشر Sync
  socket.on('draw-stroke', ({ roomId, strokeData }) => {
    socket.to(roomId).emit('draw-stroke', strokeData);
  });

  socket.on('clear-board', ({ roomId }) => {
    socket.to(roomId).emit('clear-board');
  });

  // 6. رفع اليد
  socket.on('raise-hand', ({ roomId, raised }) => {
    if (rooms[roomId] && rooms[roomId].participants[socket.id]) {
      rooms[roomId].participants[socket.id].handRaised = raised;
      io.to(roomId).emit('hand-status-changed', {
        socketId: socket.id,
        userName: rooms[roomId].participants[socket.id].name,
        handRaised: raised
      });
    }
  });

  // 7. التحكم في مايك/كاميرا عضو من الهوست
  socket.on('toggle-user-media', ({ roomId, targetSocketId, type, enabled }) => {
    if (rooms[roomId] && rooms[roomId].hostId === socket.id) {
      io.to(targetSocketId).emit('force-media-toggle', { type, enabled });
    }
  });

  // 8. الشات والمرفقات
  socket.on('send-chat', ({ roomId, message }) => {
    io.to(roomId).emit('receive-chat', {
      senderId: socket.id,
      senderName: rooms[roomId]?.participants[socket.id]?.name || 'مجهول',
      ...message
    });
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].participants[socket.id]) {
        delete rooms[roomId].participants[socket.id];
        io.to(roomId).emit('user-left', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));