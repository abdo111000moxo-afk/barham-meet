const socket = io();

let currentUser = { name: '', avatar: '' };
let currentRoomId = '';
let isHost = false;
let myStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let unreadMessages = 0;
let activeTab = 'camera';

// ----------------------------------------------------
// 1. إدارة البيانات وحفظها (Local Storage)
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  const savedName = localStorage.getItem('moxo_username');
  const savedAvatar = localStorage.getItem('moxo_avatar');

  if (savedName) {
    currentUser.name = savedName;
    currentUser.avatar = savedAvatar || '';
    showScreen('dashboard-screen');
  } else {
    showScreen('login-screen');
  }

  setupCanvas();
});

document.getElementById('avatar-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentUser.avatar = event.target.result;
      document.getElementById('avatar-preview').src = currentUser.avatar;
    };
    reader.readAsDataURL(file);
  }
});

function saveProfileAndContinue() {
  const name = document.getElementById('username-input').value.trim();
  if (!name) return alert('برجاء كتابة الاسم');
  
  currentUser.name = name;
  localStorage.setItem('moxo_username', currentUser.name);
  if (currentUser.avatar) localStorage.setItem('moxo_avatar', currentUser.avatar);

  showScreen('dashboard-screen');
}

function openSettingsModal() {
  const newName = prompt('تعديل الاسم:', currentUser.name);
  if (newName) {
    currentUser.name = newName;
    localStorage.setItem('moxo_username', newName);
  }
}

// ----------------------------------------------------
// 2. إدارة الغرف والانضمام
// ----------------------------------------------------
function createRoom() {
  currentRoomId = Math.random().toString(36).substring(2, 8);
  isHost = true;
  const roomLink = `${window.location.origin}?room=${currentRoomId}`;
  document.getElementById('generated-link').value = roomLink;
  document.getElementById('room-created-modal').classList.remove('hidden');
}

function copyRoomLink() {
  const copyText = document.getElementById('generated-link');
  copyText.select();
  navigator.clipboard.writeText(copyText.value);
  alert('تم نسخ رابط الغرفة!');
}

function proceedToRoom() {
  document.getElementById('room-created-modal').classList.add('hidden');
  document.getElementById('permissions-modal').classList.remove('hidden');
}

function savePermissions() {
  document.getElementById('permissions-modal').classList.add('hidden');
  const permissions = {
    allowWhiteboard: document.getElementById('perm-board').checked,
    allowMic: document.getElementById('perm-mic').checked,
    allowCam: document.getElementById('perm-cam').checked
  };

  enterRoom(permissions);
}

function joinRoomDirect() {
  const roomId = document.getElementById('room-id-input').value.trim();
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
// 3. الوسائط والكاميرا المنبثقة
// ----------------------------------------------------
async function initLocalMedia() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    
    // إضافة الفيديو الشخصي للشبكة
    addVideoTile('my-local-video', myStream, currentUser.name, true);
    
    // إعداد الفيديو المنبثق
    document.getElementById('floating-video').srcObject = myStream;
  } catch (err) {
    console.error('الوصول للوسائط فشل:', err);
  }
}

function addVideoTile(id, stream, name, isMuted = false) {
  const grid = document.getElementById('video-grid');
  let container = document.getElementById(`container-${id}`);
  
  if (!container) {
    container = document.createElement('div');
    container.id = `container-${id}`;
    container.style.position = 'relative';

    const videoEl = document.createElement('video');
    videoEl.id = id;
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = isMuted;
    videoEl.srcObject = stream;

    const label = document.createElement('div');
    label.innerText = name;
    label.style.cssText = 'position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:4px; font-size:12px;';

    container.appendChild(videoEl);
    container.appendChild(label);
    grid.appendChild(container);
  }
}

// ----------------------------------------------------
// 4. التنقل التلقائي والأبواب (Sync Tabs)
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

  document.getElementById(`tab-${tabName}`).classList.add('active');

  // إظهار الكاميرا المنبثقة إذا كنا بره تبويب الكاميرا
  const floatingCam = document.getElementById('floating-cam');
  if (tabName !== 'camera') {
    floatingCam.classList.remove('hidden');
  } else {
    floatingCam.classList.add('hidden');
  }

  if (tabName === 'chat') {
    unreadMessages = 0;
    document.getElementById('chat-badge').classList.add('hidden');
  }
}

// ----------------------------------------------------
// 5. الصبورة (Whiteboard)
// ----------------------------------------------------
let canvas, ctx, drawing = false, currentTool = 'pen';

function setupCanvas() {
  canvas = document.getElementById('whiteboard');
  ctx = canvas.getContext('2d');
  
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mousemove', draw);
}

function setBoardTool(tool) {
  currentTool = tool;
}

function startDrawing(e) {
  drawing = true;
  draw(e);
}

function stopDrawing() {
  drawing = false;
  ctx.beginPath();
}

function draw(e) {
  if (!drawing) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const color = currentTool === 'eraser' ? '#ffffff' : document.getElementById('brush-color').value;
  const size = document.getElementById('brush-size').value;

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
  ctx.lineWidth = data.size;
  ctx.lineCap = 'round';
  ctx.strokeStyle = data.color;
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(data.x, data.y);
});

function clearBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('clear-board', { roomId: currentRoomId });
}

socket.on('clear-board', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function changeBoardBg(type) {
  canvas.className = '';
  if (type === 'black') canvas.classList.add('black-bg');
  if (type === 'grid') canvas.classList.add('grid-bg');
}

function exportBoard(format) {
  if (format === 'png') {
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
    pdf.save('whiteboard.pdf');
  }
}

// ----------------------------------------------------
// 6. وضع الشرح والتكامل مع الشات
// ----------------------------------------------------
function toggleFocusMode() {
  const isFocus = document.getElementById('focus-mode-btn').classList.toggle('active');
  socket.emit('toggle-focus-mode', { roomId: currentRoomId, enabled: isFocus });
}

socket.on('focus-mode-toggled', (enabled) => {
  const screenTab = document.getElementById('tab-screen');
  if (enabled) {
    screenTab.classList.add('focus-mode');
  } else {
    screenTab.classList.remove('focus-mode');
  }
});

function sendTextMessage() {
  const input = document.getElementById('chat-input');
  if (!input.value.trim()) return;

  socket.emit('send-chat', {
    roomId: currentRoomId,
    message: { type: 'text', content: input.value }
  });
  input.value = '';
}

socket.on('receive-chat', (data) => {
  const messagesBox = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'background:#242526; padding:8px 12px; border-radius:8px; max-width:80%;';
  
  if (data.type === 'text') {
    msgEl.innerHTML = `<strong>${data.senderName}:</strong> ${data.content}`;
  } else if (data.type === 'image') {
    msgEl.innerHTML = `<strong>${data.senderName}:</strong><br><img src="${data.content}" style="max-width:200px; border-radius:6px; margin-top:5px;">`;
  }

  messagesBox.appendChild(msgEl);

  if (activeTab !== 'chat') {
    unreadMessages++;
    const badge = document.getElementById('chat-badge');
    badge.innerText = unreadMessages;
    badge.classList.remove('hidden');
  }
});

// ----------------------------------------------------
// 7. رفع اليد وتسجيل الحلقة
// ----------------------------------------------------
let isHandRaised = false;
function toggleRaiseHand() {
  isHandRaised = !isHandRaised;
  document.getElementById('raise-hand-btn').classList.toggle('active', isHandRaised);
  socket.emit('raise-hand', { roomId: currentRoomId, raised: isHandRaised });
}

socket.on('hand-status-changed', (data) => {
  if (data.handRaised) {
    alert(`✋ العضو (${data.userName}) قام برفع يده للحديث!`);
  }
});

// تسجيل الشاشة مع الصوت
async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    document.getElementById('record-btn').classList.remove('active');
    alert('تم إنهاء التسجيل وجاري التحميل...');
  } else {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    mediaRecorder = new MediaRecorder(displayStream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moxo-lesson-${Date.now()}.webm`;
      a.click();
    };

    mediaRecorder.start();
    document.getElementById('record-btn').classList.add('active');
  }
}

// Helper Functions
function showScreen(id) {
  document.querySelectorAll('.screen, #room-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}