// =========================================================
// EL-BOULAQI MEET - CLIENT JAVASCRIPT (FULL COMPLETE CODE)
// =========================================================

const socket = typeof io !== 'undefined' ? io() : null;

// حالة التطبيق
let currentUser = {
  name: 'عضو مميز',
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=VIPUser'
};

let currentRoomId = null;
let isHost = false;
let localStream = null;
let screenStream = null;
let isAudioMuted = false;
let isVideoStopped = false;
let peerConnections = {};
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// تسجيل المحاضرة
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// السبورة التفاعلية
let canvas, ctx;
let isDrawing = false;
let currentTool = 'pen';
let currentColor = '#f1c40f';
let currentSize = 4;
let whiteboardPages = [[]];
let currentPageIdx = 0;

document.addEventListener('DOMContentLoaded', () => {

  // عناصر واجهة تسجيل الدخول
  const loginStep = document.getElementById('loginStep');
  const actionStep = document.getElementById('actionStep');
  const userNameInput = document.getElementById('userNameInput');
  const avatarInput = document.getElementById('avatarInput');
  const avatarPreview = document.getElementById('avatarPreview');

  // بطاقة المستخدم والإعدادات
  const userBadgeAvatar = document.getElementById('userBadgeAvatar');
  const userBadgeName = document.getElementById('userBadgeName');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const joinRoomIdInput = document.getElementById('joinRoomIdInput');
  const roomLinkBox = document.getElementById('roomLinkBox');
  const generatedLinkText = document.getElementById('generatedLinkText');
  const btnCopyRoomLink = document.getElementById('btnCopyRoomLink');
  const btnProceedToRoom = document.getElementById('btnProceedToRoom');

  // نافذة الإعدادات
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettingsModal = document.getElementById('btnOpenSettingsModal');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const settingsAvatarPreview = document.getElementById('settingsAvatarPreview');
  const settingsAvatarInput = document.getElementById('settingsAvatarInput');
  const settingsNameInput = document.getElementById('settingsNameInput');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // 1. تفعيل ومعاينة الصورة الشخصية فوراً عند اختيارها
  if (avatarInput) {
    avatarInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
          currentUser.avatar = e.target.result;
          if (avatarPreview) avatarPreview.src = e.target.result;
          if (userBadgeAvatar) userBadgeAvatar.src = e.target.result;
        };
        reader.readAsDataURL(this.files[0]);
      }
    });
  }

  // 2. الدخول التلقائي فور الضغط على Enter في حقل الاسم
  if (userNameInput) {
    userNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        
        const entered = this.value.trim();
        if (entered) {
          currentUser.name = entered;
        }

        if (userBadgeName) userBadgeName.textContent = currentUser.name;
        if (userBadgeAvatar) userBadgeAvatar.src = currentUser.avatar;

        if (loginStep) {
          loginStep.classList.remove('active');
          loginStep.style.display = 'none';
        }
        if (actionStep) {
          actionStep.classList.add('active');
          actionStep.style.display = 'block';
        }
      }
    });
  }

  // 3. الإعدادات وتحديث البروفايل
  if (btnOpenSettingsModal) {
    btnOpenSettingsModal.addEventListener('click', () => {
      if (settingsNameInput) settingsNameInput.value = currentUser.name;
      if (settingsAvatarPreview) settingsAvatarPreview.src = currentUser.avatar;
      if (settingsModal) settingsModal.classList.remove('hidden');
    });
  }

  if (btnCloseSettingsModal) {
    btnCloseSettingsModal.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }

  if (settingsAvatarInput) {
    settingsAvatarInput.addEventListener('change', function () {
      if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
          if (settingsAvatarPreview) settingsAvatarPreview.src = e.target.result;
        };
        reader.readAsDataURL(this.files[0]);
      }
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      if (settingsNameInput && settingsNameInput.value.trim()) {
        currentUser.name = settingsNameInput.value.trim();
      }
      if (settingsAvatarPreview && settingsAvatarPreview.src) {
        currentUser.avatar = settingsAvatarPreview.src;
      }
      if (userBadgeName) userBadgeName.textContent = currentUser.name;
      if (userBadgeAvatar) userBadgeAvatar.src = currentUser.avatar;
      
      const rName = document.getElementById('roomUserName');
      const rAvt = document.getElementById('roomUserAvatar');
      const lName = document.getElementById('localCardName');
      if (rName) rName.textContent = currentUser.name;
      if (rAvt) rAvt.src = currentUser.avatar;
      if (lName) lName.textContent = currentUser.name + (isHost ? ' (المضيف)' : ' (أنت)');

      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }

  // 4. إنشاء الغرف ومتابعة الدخول
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
      currentRoomId = 'ELB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      isHost = true;
      if (generatedLinkText) {
        generatedLinkText.value = `${window.location.origin}?room=${currentRoomId}`;
      }
      if (roomLinkBox) {
        roomLinkBox.classList.remove('hidden');
        roomLinkBox.style.display = 'block';
      }
    });
  }

  if (btnCopyRoomLink) {
    btnCopyRoomLink.addEventListener('click', () => {
      if (generatedLinkText) {
        navigator.clipboard.writeText(generatedLinkText.value);
        alert('تم نسخ رابط الغرفة بنجاح!');
      }
    });
  }

  if (btnProceedToRoom) {
    btnProceedToRoom.addEventListener('click', () => {
      enterRoom(currentRoomId, true);
    });
  }

  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', () => {
      const code = joinRoomIdInput ? joinRoomIdInput.value.trim() : '';
      if (!code) return alert('يرجى كتابة كود الغرفة');
      currentRoomId = code;
      isHost = false;
      enterRoom(currentRoomId, false);
    });
  }

  // فحص رابط الدعوة التلقائي
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam && joinRoomIdInput) {
    joinRoomIdInput.value = roomParam;
  }

  initWhiteboard();
  initSidebar();
  initMediaControls();
  initChat();
});

// =========================================================
// الدخول إلى غرفة الاجتماع وتهيئة الاتصال
// =========================================================
async function enterRoom(roomId, hostStatus) {
  isHost = hostStatus;
  const authScreen = document.getElementById('authScreen');
  const roomScreen = document.getElementById('roomScreen');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const roomUserName = document.getElementById('roomUserName');
  const roomUserAvatar = document.getElementById('roomUserAvatar');
  const localCardName = document.getElementById('localCardName');
  const localVideo = document.getElementById('localVideo');

  if (authScreen) authScreen.classList.remove('active-view');
  if (roomScreen) roomScreen.classList.add('active-view');

  if (roomCodeDisplay) roomCodeDisplay.textContent = `غرفة: #${roomId}`;
  if (roomUserName) roomUserName.textContent = currentUser.name;
  if (roomUserAvatar) roomUserAvatar.src = currentUser.avatar;
  if (localCardName) localCardName.textContent = currentUser.name + (hostStatus ? ' (المضيف)' : ' (أنت)');

  if (hostStatus) {
    const hostHeader = document.getElementById('hostControlsHeader');
    const hostExplain = document.getElementById('hostExplainControl');
    if (hostHeader) hostHeader.classList.remove('hidden');
    if (hostExplain) hostExplain.classList.remove('hidden');
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    console.warn("الكاميرا أو المايكروفون غير متوفرين:", err);
  }

  if (socket) {
    socket.emit('join-room', { roomId, user: currentUser, isHost: hostStatus });
  }
}

// =========================================================
// إدارة الشريط الجانبي والتنقل
// =========================================================
function initSidebar() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      switchTab(targetTab);
      if (isHost && socket) {
        socket.emit('sync-navigation', { roomId: currentRoomId, tabId: targetTab });
      }
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => {
    i.classList.toggle('active', i.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === tabId);
  });

  if (tabId === 'tab-whiteboard') {
    resizeCanvas();
  }
  if (tabId === 'tab-chat') {
    const badge = document.getElementById('chatUnreadBadge');
    if (badge) badge.classList.add('hidden');
  }
}

if (socket) {
  socket.on('navigation-synced', ({ tabId }) => switchTab(tabId));
}

// =========================================================
// السبورة التفاعلية
// =========================================================
function initWhiteboard() {
  canvas = document.getElementById('whiteboardCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  window.addEventListener('resize', resizeCanvas);
  
  canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);

    const pt = { type: 'start', x: x / canvas.width, y: y / canvas.height, tool: currentTool, color: currentColor, size: currentSize };
    whiteboardPages[currentPageIdx].push(pt);
    if (socket) socket.emit('whiteboard-draw', { roomId: currentRoomId, drawData: pt });
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.strokeStyle = currentTool === 'eraser' ? '#181c27' : currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.stroke();

    const pt = { type: 'line', x: x / canvas.width, y: y / canvas.height, tool: currentTool, color: currentColor, size: currentSize };
    whiteboardPages[currentPageIdx].push(pt);
    if (socket) socket.emit('whiteboard-draw', { roomId: currentRoomId, drawData: pt });
  });

  canvas.addEventListener('mouseup', () => { if (isDrawing) { ctx.closePath(); isDrawing = false; } });
  canvas.addEventListener('mouseleave', () => { if (isDrawing) { ctx.closePath(); isDrawing = false; } });

  // الأدوات
  const penBtn = document.getElementById('wbToolPen');
  const eraserBtn = document.getElementById('wbToolEraser');
  if (penBtn && eraserBtn) {
    penBtn.addEventListener('click', () => {
      currentTool = 'pen';
      penBtn.classList.add('active');
      eraserBtn.classList.remove('active');
    });
    eraserBtn.addEventListener('click', () => {
      currentTool = 'eraser';
      eraserBtn.classList.add('active');
      penBtn.classList.remove('active');
    });
  }

  const clr = document.getElementById('wbColorPicker');
  if (clr) clr.addEventListener('input', (e) => currentColor = e.target.value);

  const sz = document.getElementById('wbSizeSlider');
  if (sz) sz.addEventListener('input', (e) => {
    currentSize = e.target.value;
    document.getElementById('wbSizeDisplay').textContent = `${currentSize}px`;
  });

  // الصفحات
  const addP = document.getElementById('wbAddPage');
  const prvP = document.getElementById('wbPrevPage');
  const nxtP = document.getElementById('wbNextPage');
  const clrBtn = document.getElementById('wbClearBtn');

  if (addP) addP.addEventListener('click', () => {
    whiteboardPages.push([]);
    currentPageIdx = whiteboardPages.length - 1;
    updateWbPage();
  });
  if (prvP) prvP.addEventListener('click', () => {
    if (currentPageIdx > 0) { currentPageIdx--; updateWbPage(); }
  });
  if (nxtP) nxtP.addEventListener('click', () => {
    if (currentPageIdx < whiteboardPages.length - 1) { currentPageIdx++; updateWbPage(); }
  });
  if (clrBtn) clrBtn.addEventListener('click', () => {
    whiteboardPages[currentPageIdx] = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (socket) socket.emit('whiteboard-clear', { roomId: currentRoomId, pageIndex: currentPageIdx });
  });

  // التصدير
  const expImg = document.getElementById('wbExportImgBtn');
  const expPdf = document.getElementById('wbExportPdfBtn');
  if (expImg) expImg.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `whiteboard-${currentRoomId}.png`;
    a.href = canvas.toDataURL();
    a.click();
  });
  if (expPdf) expPdf.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    doc.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 10, 10, 275, 185);
    doc.save(`whiteboard-${currentRoomId}.pdf`);
  });
}

function updateWbPage() {
  document.getElementById('wbPageCounter').textContent = `صفحة ${currentPageIdx + 1} / ${whiteboardPages.length}`;
  redrawWb();
  if (socket) socket.emit('whiteboard-page-change', { roomId: currentRoomId, pageIndex: currentPageIdx, totalPages: whiteboardPages.length });
}

function redrawWb() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const acts = whiteboardPages[currentPageIdx] || [];
  acts.forEach(pt => {
    const x = pt.x * canvas.width;
    const y = pt.y * canvas.height;
    if (pt.type === 'start') {
      ctx.beginPath(); ctx.moveTo(x, y);
    } else if (pt.type === 'line') {
      ctx.lineTo(x, y);
      ctx.strokeStyle = pt.tool === 'eraser' ? '#181c27' : pt.color;
      ctx.lineWidth = pt.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  });
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  redrawWb();
}

if (socket) {
  socket.on('whiteboard-draw', (pt) => {
    if (!canvas || !ctx) return;
    const x = pt.x * canvas.width;
    const y = pt.y * canvas.height;
    if (pt.type === 'start') {
      ctx.beginPath(); ctx.moveTo(x, y);
    } else if (pt.type === 'line') {
      ctx.lineTo(x, y);
      ctx.strokeStyle = pt.tool === 'eraser' ? '#181c27' : pt.color;
      ctx.lineWidth = pt.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    whiteboardPages[currentPageIdx].push(pt);
  });

  socket.on('whiteboard-clear', ({ pageIndex }) => {
    whiteboardPages[pageIndex] = [];
    if (currentPageIdx === pageIndex && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

// =========================================================
// الشات والملفات
// =========================================================
function initChat() {
  const chatForm = document.getElementById('chatForm');
  const chatTextInput = document.getElementById('chatTextInput');
  const chatFileInput = document.getElementById('chatFileInput');

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatTextInput.value.trim();
      if (text && socket) {
        const msg = {
          senderId: socket.id,
          senderName: currentUser.name,
          senderAvatar: currentUser.avatar,
          text: text,
          file: null,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        };
        socket.emit('send-chat-message', { roomId: currentRoomId, message: msg });
        chatTextInput.value = '';
      }
    });
  }

  if (chatFileInput) {
    chatFileInput.addEventListener('change', function () {
      if (this.files && this.files[0] && socket) {
        const file = this.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          const msg = {
            senderId: socket.id,
            senderName: currentUser.name,
            senderAvatar: currentUser.avatar,
            text: `أرسل ملفاً: ${file.name}`,
            file: { data: evt.target.result, name: file.name, type: file.type },
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          };
          socket.emit('send-chat-message', { roomId: currentRoomId, message: msg });
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

if (socket) {
  socket.on('new-chat-message', (msg) => {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const isMe = msg.senderId === socket.id;
    const b = document.createElement('div');
    b.className = `chat-bubble ${isMe ? 'mine' : 'other'}`;
    
    let fileHtml = '';
    if (msg.file) {
      if (msg.file.type.startsWith('image/')) {
        fileHtml = `<br><img class="bubble-file-img" src="${msg.file.data}">`;
      } else {
        fileHtml = `<br><a class="bubble-file-link" href="${msg.file.data}" download="${msg.file.name}"><i class="fa-solid fa-file-arrow-down"></i> تحميل الملف (${msg.file.name})</a>`;
      }
    }

    b.innerHTML = `
      <img class="chat-avatar" src="${msg.senderAvatar}" alt="Avatar">
      <div class="bubble-content">
        <div class="bubble-author">${msg.senderName} • <small style="color:#9ca3af">${msg.time}</small></div>
        <div class="bubble-text">${msg.text}${fileHtml}</div>
      </div>
    `;
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
  });
}

// =========================================================
// أزرار التحكم بالصوت والكاميرا والشاشة ورفع اليد
// =========================================================
function initMediaControls() {
  const btnAudio = document.getElementById('btnToggleAudio');
  const btnVideo = document.getElementById('btnToggleVideo');
  const btnLeave = document.getElementById('btnLeaveRoom');
  const btnRaise = document.getElementById('btnRaiseHand');
  const btnRecord = document.getElementById('btnRecordLecture');
  const btnStartShare = document.getElementById('btnStartScreenShare');
  const btnStopShare = document.getElementById('btnStopScreenShare');
  const btnExplain = document.getElementById('btnToggleExplainMode');

  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      if (localStream && localStream.getAudioTracks()[0]) {
        isAudioMuted = !isAudioMuted;
        localStream.getAudioTracks()[0].enabled = !isAudioMuted;
        btnAudio.classList.toggle('muted', isAudioMuted);
        btnAudio.innerHTML = isAudioMuted ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
      }
    });
  }

  if (btnVideo) {
    btnVideo.addEventListener('click', () => {
      if (localStream && localStream.getVideoTracks()[0]) {
        isVideoStopped = !isVideoStopped;
        localStream.getVideoTracks()[0].enabled = !isVideoStopped;
        btnVideo.classList.toggle('muted', isVideoStopped);
        btnVideo.innerHTML = isVideoStopped ? '<i class="fa-solid fa-camera-slash"></i>' : '<i class="fa-solid fa-camera"></i>';
      }
    });
  }

  if (btnLeave) {
    btnLeave.addEventListener('click', () => {
      if (confirm('هل تريد بالتأكيد مغادرة الغرفة؟')) window.location.reload();
    });
  }

  if (btnRaise) {
    btnRaise.addEventListener('click', () => {
      if (socket) socket.emit('raise-hand', { roomId: currentRoomId });
      btnRaise.style.background = 'var(--gold-hover)';
      btnRaise.style.color = '#000';
      setTimeout(() => { btnRaise.style.background = ''; btnRaise.style.color = ''; }, 2000);
    });
  }

  // مشاركة الشاشة
  if (btnStartShare && btnStopShare) {
    btnStartShare.addEventListener('click', async () => {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const scrVideo = document.getElementById('screenVideo');
        const placeHolder = document.getElementById('noScreenPlaceholder');
        if (scrVideo) {
          scrVideo.srcObject = screenStream;
          scrVideo.classList.remove('hidden');
        }
        if (placeHolder) placeHolder.classList.add('hidden');
        btnStartShare.classList.add('hidden');
        btnStopShare.classList.remove('hidden');

        screenStream.getVideoTracks()[0].onended = () => {
          btnStopShare.click();
        };
      } catch (e) {
        console.error(e);
      }
    });

    btnStopShare.addEventListener('click', () => {
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
      }
      const scrVideo = document.getElementById('screenVideo');
      const placeHolder = document.getElementById('noScreenPlaceholder');
      if (scrVideo) scrVideo.classList.add('hidden');
      if (placeHolder) placeHolder.classList.remove('hidden');
      btnStartShare.classList.remove('hidden');
      btnStopShare.classList.add('hidden');
    });
  }

  // وضع الشرح للمضيف
  let explainActive = false;
  if (btnExplain) {
    btnExplain.addEventListener('click', () => {
      if (!isHost) return;
      explainActive = !explainActive;
      btnExplain.innerHTML = explainActive ? 
        '<i class="fa-solid fa-xmark"></i> <span>إنهاء وضع الشرح</span>' : 
        '<i class="fa-solid fa-chalkboard-user"></i> <span>تفعيل وضع الشرح</span>';
      
      const pip = document.getElementById('pipHostOverlay');
      const pipVid = document.getElementById('pipHostVideo');
      if (explainActive) {
        switchTab('tab-screenshare');
        if (pip) pip.classList.remove('hidden');
        if (pipVid && localStream) pipVid.srcObject = localStream;
      } else {
        if (pip) pip.classList.add('hidden');
      }

      if (socket) socket.emit('toggle-explain-mode', { roomId: currentRoomId, active: explainActive });
    });
  }

  // تسجيل المحاضرة المدمج
  if (btnRecord) {
    btnRecord.addEventListener('click', async () => {
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          recordedChunks = [];
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0)لتنفيذ الكود بالكامل من البداية، حدد لي فقط المشروع أو الملفين المطلوبين (مثل: `index.html` مع `style.css` أو `script.js`، وبوت تيليجرام، أو غيرها)، وسأكتبهما لك بنسخة نظيفة ومتكاملة فوراً.

ما هو المشروع والوظائف المحددة التي تريد تضمينها في الملفين؟