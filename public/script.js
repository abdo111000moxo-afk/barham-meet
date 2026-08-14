const socket = io();

let currentUser = { name: 'عضو البولاقي', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=VIPUser' };
let currentRoomId = null;
let isHost = false;
let localStream = null;
let screenStream = null;
let peerConnections = {};
let iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// السبورة
let canvas, ctx, isDrawing = false, currentTool = 'pen', currentColor = '#f1c40f', currentSize = 4;
let whiteboardPages = [[]], currentPageIdx = 0;

// عناصر الدخول
const authScreen = document.getElementById('authScreen');
const roomScreen = document.getElementById('roomScreen');
const userNameInput = document.getElementById('userNameInput');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const btnEnterApp = document.getElementById('btnEnterApp');

avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      currentUser.avatar = evt.target.result;
      avatarPreview.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }
});

btnEnterApp.addEventListener('click', () => {
  if (userNameInput.value.trim()) currentUser.name = userNameInput.value.trim();
  document.getElementById('userBadgeName').textContent = currentUser.name;
  document.getElementById('userBadgeAvatar').src = currentUser.avatar;
  document.getElementById('loginStep').classList.remove('active');
  document.getElementById('actionStep').classList.add('active');
});

// إنشاء وانضمام الغرف
document.getElementById('btnCreateRoom').addEventListener('click', () => {
  currentRoomId = 'ELB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  isHost = true;
  document.getElementById('generatedLinkText').value = `${window.location.origin}?room=${currentRoomId}`;
  document.getElementById('roomLinkBox').classList.remove('hidden');
});

document.getElementById('btnProceedToRoom').addEventListener('click', () => enterRoom(currentRoomId, true));
document.getElementById('btnJoinRoom').addEventListener('click', () => {
  const code = document.getElementById('joinRoomIdInput').value.trim();
  if (code) { currentRoomId = code; isHost = false; enterRoom(currentRoomId, false); }
});

async function enterRoom(roomId, hostStatus) {
  authScreen.classList.remove('active-view');
  roomScreen.classList.add('active-view');
  document.getElementById('roomCodeDisplay').textContent = `غرفة: #${roomId}`;
  document.getElementById('roomUserName').textContent = currentUser.name;
  document.getElementById('roomUserAvatar').src = currentUser.avatar;
  document.getElementById('localCardName').textContent = currentUser.name + (hostStatus ? ' (المضيف)' : ' (أنت)');

  if (hostStatus) {
    document.getElementById('hostControlsHeader').classList.remove('hidden');
    document.getElementById('hostExplainControl').classList.remove('hidden');
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('localVideo').srcObject = localStream;
  } catch (err) { console.warn(err); }

  socket.emit('join-room', { roomId, user: currentUser, isHost: hostStatus });
}

// التنقل في الشريط الجانبي
document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const targetTab = item.getAttribute('data-tab');
    switchTab(targetTab);
    if (isHost) socket.emit('sync-navigation', { roomId: currentRoomId, tabId: targetTab });
  });
});

function switchTab(tabId) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.toggle('active', i.getAttribute('data-tab') === tabId));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
  if (tabId === 'tab-whiteboard') resizeCanvas();
}
socket.on('navigation-synced', ({ tabId }) => switchTab(tabId));

// رفع اليد (حصري للمضيف)
document.getElementById('btnRaiseHand').addEventListener('click', () => {
  socket.emit('raise-hand', { roomId: currentRoomId });
});

socket.on('hand-raised-notification', ({ userName, timestamp }) => {
  const container = document.getElementById('hostNotificationContainer');
  const toast = document.createElement('div');
  toast.className = 'hand-raise-toast';
  toast.innerHTML = `<h5>✋ رفع يد: ${userName}</h5><small>${timestamp}</small>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
});

// تهيئة السبورة
function resizeCanvas() {
  canvas = document.getElementById('whiteboardCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('DOMContentLoaded', () => { resizeCanvas(); });