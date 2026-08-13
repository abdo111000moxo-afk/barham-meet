const socket = io();

// البيانات الأساسية
let currentUser = { name: '', avatar: '' };
let currentRoomId = '';
let isHost = false;
let myStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let unreadMessages = 0;
let activeTab = 'camera';

// متغيرة للصبورة
let canvas, ctx, drawing = false, currentTool = 'pen';

// ----------------------------------------------------
// 1. التهيئة وإدارة التسجيل والبيانات (Local Storage)
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // قراءة البيانات المحفوظة إن وجدت
  const savedName = localStorage.getItem('moxo_username');
  const savedAvatar = localStorage.getItem('moxo_avatar');

  if (savedName) {
    currentUser.name = savedName;
    currentUser.avatar = savedAvatar || '';
    showScreen('dashboard-screen');
  } else {
    showScreen('login-screen');
  }

  // اختيار الصورة الشخصية
  const avatarInput = document.getElementById('avatar-input');
  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          currentUser.avatar = event.target.result;
          const preview = document.getElementById('avatar-preview');
          if (preview) preview.src = currentUser.avatar;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // تجهيز الكانفاس للصبورة
  setupCanvas();
});

// دالة حفظ الاسم والدخول للتطبيق
function saveProfileAndContinue() {
  const nameInput = document.getElementById('username-input');
  const name = nameInput ? nameInput.value.trim() : '';

  if (!name) {
    alert('برجاء كتابة الاسم أولاً');
    return;
  }
  
  currentUser.name = name;
  localStorage.setItem('moxo_username', currentUser.name);
  if (currentUser.avatar) {
    localStorage.setItem('moxo_avatar', currentUser.avatar);
  }

  showScreen('dashboard-screen');
}

// تعديل بيانات المستخدم من الإعدادات
function openSettingsModal() {
  const newName = prompt('تعديل الاسم:', currentUser.name);
  if (newName && newName.trim() !== '') {
    currentUser.name = newName.trim();
    localStorage.setItem('moxo_username', currentUser.name);
    alert('تم تحديث الاسم بنجاح!');
  }
}

// التنقل الآمن بين الشاشات
function showScreen(id) {
  const screens = document.querySelectorAll('.screen, #room-screen');
  screens.forEach(s => s.classList.add('hidden'));

  const targetScreen = document.getElementById(id);
  if (targetScreen) {
    targetScreen.classList.remove('hidden');
  } else {
    console.error('الشاشة غير موجودة:', id);
  }
}

// ----------------------------------------------------
// 2. إدارة الغرف والصلاحيات
// ----------------------------------------------------
function createRoom() {
  currentRoomId = Math.random().toString(36).substring(2, 8);
  isHost = true;
  const roomLink = `${window.location.origin}?room=${currentRoomId}`;
  
  const linkInput = document.getElementById('generated-link');
  if (linkInput) linkInput.value = roomLink;
  
  const createdModal = document.getElementById('room-created-modal');
  if (createdModal) createdModal.classList.remove('hidden');
}

function copyRoomLink() {
  const copyText = document.getElementById('generated-link');
  if (copyText) {
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert('تم نسخ رابط الغرفة!');
  }
}

function proceedToRoom() {
  const createdModal = document.getElementById('room-created-modal');
  if (createdModal) createdModal.classList.add('hidden');
  
  const permModal = document.getElementById('permissions-modal');
  if (permModal) permModal.classList.remove('hidden');
}

function savePermissions() {
  const permModal = document.getElementById('permissions-modal');
  if (permModal) permModal.classList.add('hidden');
  
  const permissions = {
    allowWhiteboard: document.getElementById('perm-board')?.checked ?? true,
    allowMic: document.getElementById('perm-mic')?.checked ?? true,
    allowCam: document.getElementById('perm-cam')?.checked ?? true
  };

  enterRoom(permissions);
}

function joinRoomDirect() {
  const roomIdInput = document.getElementById('room-id-input');
  const roomId = roomIdInput ? roomIdInput.value.trim() : '';
  
  if (!roomId) return alert('أدخل كود الغرفة');
  currentRoomId = roomId;
  isHost = false;
  enterRoom();
}

function enterRoom(permissions = null) {
  showScreen('room-screen');
  initLocalMedia();

  socket.emit('join-room', { roomId: currentRoomId, user: currentUser });

  if (isHost && permissions) {
    socket.emit('update-permissions', { roomId: currentRoomId, permissions });
  }
}

// ----------------------------------------------------
// 3. الصوت والكاميرا
// ----------------------------------------------------
async function initLocalMedia() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    addVideoTile('my-local-video', myStream, currentUser.name, true);
    
    const floatingVideo = document.getElementById('floating-video');
    if (floatingVideo) floatingVideo.srcObject = myStream;
  } catch (err) {
    console.warn('تعذر الوصول للكاميرا/المايك، تم الدخول بدون وسائط:', err);
  }
}

function addVideoTile(id, stream, name, isMuted = false) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  let container = document.getElementById(`container-${id}`);
  
  if (!container) {
    container = document.createElement('div');
    container.id = `container-${id}`;
    container.style.cssText = 'position: relative; width: 100%; height: 200px; background: #000; border-radius: 8px; overflow: hidden;';

    const videoEl = document.createElement('video');
    videoEl.id = id;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = isMuted;
    videoEl.srcObject = stream;
    videoEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

    const label = document.createElement('div');
    label.innerText = name;
    label.style.cssText = 'position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #fff;';

    container.appendChild(videoEl);
    container.appendChild(label);
    grid.appendChild(container);
  }
}

function toggleMyCam() {
  if (myStream) {
    const videoTrack = myStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      alert(videoTrack.enabled ? 'تم تشغيل الكاميرا' : 'تم إيقاف الكاميرا');
    }
  }
}

function toggleMyMic() {
  if (myStream) {
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      alert(audioTrack.enabled ? 'تم تشغيل المايك' : 'تم إيقاف المايك');
    }
  }
}

function toggleViewMode(mode) {
  if (!isHost) return;
  alert(mode === 'all' ? 'تم تفعيل وضع: الكل يرى الجميع' : 'تم تفعيل وضع: رؤية الهوست فقط');
}

// ----------------------------------------------------
// 4. التوجيه التلقائي بين الأزرار (Sync Tabs)
// ----------------------------------------------------
function hostSwitchTab(tabName) {
  if (isHost) {
    socket.emit('switch-tab', { roomId: currentRoomId, tabName });
  } else {
    switchTabUI(tabName);
  }
}

socket.on('tab-switched', (tabName) => {
  switchTabUI(tabName);
});

function switchTabUI(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));

  const activeTabEl = document.getElementById(`tab-${tabName}`);
  if (activeTabEl) activeTabEl.classList.add('active');

  const floatingCam = document.getElementById('floating-cam');
  if (floatingCam) {
    if (tabName !== 'camera') {
      floatingCam.classList.remove('hidden');
    } else {
      floatingCam.classList.add('hidden');
    }
  }

  if (tabName === 'chat') {
    unreadMessages = 0;
    const badge = document.getElementById('chat-badge');
    if (badge) badge.classList.add('hidden');
  }
}

// ----------------------------------------------------
// 5. الصبورة (Whiteboard)
// ----------------------------------------------------
function setupCanvas() {
  canvas = document.getElementById('whiteboard');
  if (!canvas) return;
  
  ctx = canvas.getContext('2d');
  resizeCanvas();

  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseleave', stopDrawing);
}

function resizeCanvas() {
  if (canvas && canvas.parentElement) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
}

function setBoardTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.board-tool').forEach(btn => btn.classList.remove('active'));
}

function startDrawing(e) {
  drawing = true;
  draw(e);
}

function stopDrawing() {
  drawing = false;
  if (ctx) ctx.beginPath();
}

function draw(e) {
  if (!drawing || !ctx) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const colorInput = document.getElementById('brush-color');
  const sizeInput = document.getElementById('brush-size');

  const color = currentTool === 'eraser' ? '#ffffff' : (colorInput ? colorInput.value : '#000000');
  const size = sizeInput ? sizeInput.value : 5;

  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;

  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);

  socket.emit('draw-stroke', {
    roomId: currentRoomId,
    strokeData: { x, y, color, size, tool: currentTool }
  });
}

socket.on('draw-stroke', (data) => {
  if (!ctx) return;
  ctx.lineWidth = data.size;
  ctx.lineCap = 'round';
  ctx.strokeStyle = data.color;
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(data.x, data.y);
});

function clearBoard() {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear-board', { roomId: currentRoomId });
  }
}

socket.on('clear-board', () => {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
});

function changeBoardBg(type) {
  if (!canvas) return;
  canvas.className = '';
  if (type === 'black') canvas.classList.add('black-bg');
  if (type === 'grid') canvas.classList.add('grid-bg');
}

function exportBoard(format) {
  if (!canvas) return;
  if (format === 'png') {
    const link = document.createElement('a');
    link.download = 'moxo-whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
  } else if (format === 'pdf') {
    if (window.jspdf) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('l', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
      pdf.save('moxo-whiteboard.pdf');
    } else {
      alert('جاري تحميل مكتبة PDF، حاول مرة أخرى.');
    }
  }
}

// ----------------------------------------------------
// 6. مشاركة الشاشة ووضع الشرح
// ----------------------------------------------------
async function startScreenShare() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenVideo = document.getElementById('screen-video');
    if (screenVideo) screenVideo.srcObject = screenStream;
  } catch (err) {
    console.error('تعذر مشاركة الشاشة:', err);
  }
}

function toggleFocusMode() {
  const btn = document.getElementById('focus-mode-btn');
  const isFocus = btn ? btn.classList.toggle('active') : false;
  socket.emit('toggle-focus-mode', { roomId: currentRoomId, enabled: isFocus });
}

socket.on('focus-mode-toggled', (enabled) => {
  const screenTab = document.getElementById('tab-screen');
  if (screenTab) {
    if (enabled) screenTab.classList.add('focus-mode');
    else screenTab.classList.remove('focus-mode');
  }
});

// ----------------------------------------------------
// 7. غرفة الشات
// ----------------------------------------------------
function sendTextMessage() {
  const input = document.getElementById('chat-input');
  if (!input || !input.value.trim()) return;

  socket.emit('send-chat', {
    roomId: currentRoomId,
    message: { type: 'text', content: input.value }
  });
  input.value = '';
}

function sendChatFile(inputEl) {
  const file = inputEl.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      socket.emit('send-chat', {
        roomId: currentRoomId,
        message: { type: 'image', content: e.target.result }
      });
    };
    reader.readAsDataURL(file);
  }
}

socket.on('receive-chat', (data) => {
  const messagesBox = document.getElementById('chat-messages');
  if (!messagesBox) return;

  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'background:#242526; padding:8px 12px; border-radius:8px; max-width:80%; margin-bottom:8px; color:#fff;';
  
  if (data.type === 'text') {
    msgEl.innerHTML = `<strong>${data.senderName}:</strong> ${data.content}`;
  } else if (data.type === 'image') {
    msgEl.innerHTML = `<strong>${data.senderName}:</strong><br><img src="${data.content}" style="max-width:200px; border-radius:6px; margin-top:5px;">`;
  }

  messagesBox.appendChild(msgEl);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  if (activeTab !== 'chat') {
    unreadMessages++;
    const badge = document.getElementById('chat-badge');
    if (badge) {
      badge.innerText = unreadMessages;
      badge.classList.remove('hidden');
    }
  }
});

// ----------------------------------------------------
// 8. رفع اليد والتسجيل
// ----------------------------------------------------
let isHandRaised = false;
function toggleRaiseHand() {
  isHandRaised = !isHandRaised;
  const btn = document.getElementById('raise-hand-btn');
  if (btn) btn.classList.toggle('active', isHandRaised);
  socket.emit('raise-hand', { roomId: currentRoomId, raised: isHandRaised });
}

socket.on('hand-status-changed', (data) => {
  if (data.handRaised) {
    alert(`✋ العضو (${data.userName}) قام برفع يده للحديث!`);
  }
});

async function toggleRecording() {
  const btn = document.getElementById('record-btn');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    if (btn) btn.classList.remove('active');
    alert('تم إنهاء التسجيل وجاري تحميل الملف...');
  } else {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      mediaRecorder = new MediaRecorder(displayStream);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `moxo-recording-${Date.now()}.webm`;
        a.click();
      };

      mediaRecorder.start();
      if (btn) btn.classList.add('active');
    } catch (err) {
      console.error('لم يتم بدء التسجيل:', err);
    }
  }
}