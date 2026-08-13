const socket = io();
let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let localStream = null;

let unreadChatCount = 0;
let activeTab = 'main';
let boardPages = [[]];
let currentPageIndex = 0;

const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d') : null;
let drawing = false;
let currentTool = 'pen';
let currentColor = '#10b981';
let currentSize = 5;

// 1️⃣ فحص الرابط عند الفتح أوتوماتيكياً (حل مشكلة الرابط)
window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('alboulaqi_user_name');
    const savedPic = localStorage.getItem('alboulaqi_user_pic');

    if (savedName) {
        userName = savedName;
        if (savedPic) userPic = savedPic;
        updateHomeUI();
        
        // التقاط كود الغرفة من الرابط إذا وجد (?room=xxxx)
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');
        
        if (roomIdFromUrl) {
            const roomInput = document.getElementById('room-id-input');
            if (roomInput) roomInput.value = roomIdFromUrl;
            // انضمام تلقائي عبر الرابط
            setTimeout(() => { joinRoom(); }, 300);
        } else {
            showScreen('home-screen');
        }
    } else {
        showScreen('login-screen');
    }
});

function saveInitialProfile() {
    const nameInput = document.getElementById('username-input');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) return alert('يرجى كتابة اسمك أولاً');

    userName = name;
    localStorage.setItem('alboulaqi_user_name', userName);
    localStorage.setItem('alboulaqi_user_pic', userPic);

    updateHomeUI();

    // فحص لو جاي من رابط مباشر
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (roomIdFromUrl) {
        const roomInput = document.getElementById('room-id-input');
        if (roomInput) roomInput.value = roomIdFromUrl;
        joinRoom();
    } else {
        showScreen('home-screen');
    }
}

function updateHomeUI() {
    const nameEl = document.getElementById('home-user-name');
    const imgEl = document.getElementById('home-user-img');

    if (nameEl) nameEl.textContent = userName;
    if (imgEl) imgEl.src = userPic;
}

const userPicInput = document.getElementById('userpic-input');
if (userPicInput) {
    userPicInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) { 
                userPic = evt.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

function openSettingsModal() {
    const nameInput = document.getElementById('modal-username-input');
    const imgPreview = document.getElementById('modal-preview-img');
    const modal = document.getElementById('settings-modal');

    if (nameInput) nameInput.value = userName;
    if (imgPreview) imgPreview.src = userPic;
    if (modal) modal.classList.remove('hidden');
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
}

const modalPicInput = document.getElementById('modal-userpic-input');
if (modalPicInput) {
    modalPicInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) { 
                userPic = evt.target.result;
                const imgPreview = document.getElementById('modal-preview-img');
                if (imgPreview) imgPreview.src = userPic;
            };
            reader.readAsDataURL(file);
        }
    });
}

function saveSettingsChanges() {
    const nameInput = document.getElementById('modal-username-input');
    if (nameInput && nameInput.value.trim()) {
        userName = nameInput.value.trim();
        localStorage.setItem('alboulaqi_user_name', userName);
        localStorage.setItem('alboulaqi_user_pic', userPic);
        updateHomeUI();
        closeSettingsModal();
        alert('تم حفظ البيانات بنجاح! 🎉');
    }
}

function createRoom() {
    const generatedId = Math.random().toString(36).substring(2, 8);
    currentRoomId = generatedId;
    isHost = true;

    socket.emit('create-room', { userName, userPic, roomId: generatedId }, (res) => {
        if (res && res.roomId) currentRoomId = res.roomId;
    });

    applyHostPermissions();

    const linkInput = document.getElementById('created-room-link');
    if (linkInput) linkInput.value = `${window.location.origin}/?room=${currentRoomId}`;
    showScreen('share-screen');
}

function joinRoom() {
    const roomInput = document.getElementById('room-id-input');
    const roomId = roomInput ? roomInput.value.trim() : '';

    if (!roomId) return alert('يرجى كتابة كود الغرفة أولاً');

    currentRoomId = roomId;

    socket.emit('join-room', { roomId, userName, userPic }, (res) => {
        if (res && res.success) {
            isHost = res.isHost || false;
            applyHostPermissions();
            enterRoom();
        } else {
            enterRoom();
        }
    });
}

function applyHostPermissions() {
    document.querySelectorAll('.host-only').forEach(el => {
        el.style.display = isHost ? '' : 'none';
    });
}

function copyRoomLink() {
    const linkInput = document.getElementById('created-room-link');
    if (linkInput) {
        linkInput.select();
        navigator.clipboard.writeText(linkInput.value);
        alert('تم نسخ الرابط بنجاح! 🎉');
    }
}

function enterRoom() {
    const roomDisplay = document.getElementById('current-room-id');
    if (roomDisplay) roomDisplay.textContent = currentRoomId;
    
    showScreen('room-screen');
    setTimeout(resizeCanvas, 100);
    startLocalCamera();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function leaveRoom() {
    if (confirm('هل أنت تأكد من الخروج من الغرفة؟')) {
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        socket.emit('leave-room', { roomId: currentRoomId });
        window.location.href = window.location.origin; // العودة للصفحة الرئيسية بدون كود غرفة بالرابط
    }
}

function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    const content = document.getElementById(`tab-${tab}`);

    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');

    if (tab === 'chat') {
        unreadChatCount = 0;
        const badge = document.getElementById('chat-badge');
        if (badge) {
            badge.textContent = '0';
            badge.classList.add('hidden');
        }
    }

    if (tab === 'whiteboard') setTimeout(resizeCanvas, 50);

    if (isHost) {
        socket.emit('change-tab', { roomId: currentRoomId, tab });
    }
}

socket.on('sync-tab', (tab) => switchTab(tab));

socket.on('update-users', (users) => {
    const grid = document.getElementById('users-grid');
    if (!grid || !Array.isArray(users)) return;
    grid.innerHTML = users.map(u => `
        <div class="user-card">
            <img src="${u.pic || userPic}">
            <h4>${u.name} ${u.isHost ? '👑' : ''}</h4>
        </div>
    `).join('');
});

// ------------ السبورة ------------
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    redrawCurrentPage();
}
window.addEventListener('resize', resizeCanvas);

if (canvas) {
    canvas.addEventListener('mousedown', () => drawing = true);
    canvas.addEventListener('mouseup', () => { drawing = false; if(ctx) ctx.beginPath(); });
    canvas.addEventListener('mousemove', draw);

    canvas.addEventListener('touchstart', (e) => { drawing = true; drawTouch(e); });
    canvas.addEventListener('touchend', () => { drawing = false; if(ctx) ctx.beginPath(); });
    canvas.addEventListener('touchmove', drawTouch);
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${tool}`);
    if (btn) btn.classList.add('active');
}

function draw(e) {
    if (!drawing || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    executeDraw(e.clientX - rect.left, e.clientY - rect.top);
}

function drawTouch(e) {
    if (!drawing || !ctx) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0];
    executeDraw(t.clientX - rect.left, t.clientY - rect.top);
}

function executeDraw(x, y) {
    const colorEl = document.getElementById('brush-color');
    const sizeEl = document.getElementById('brush-size');
    
    currentColor = colorEl ? colorEl.value : '#10b981';
    currentSize = sizeEl ? sizeEl.value : 5;

    const lineStyle = (currentTool === 'eraser') ? '#ffffff' : currentColor;

    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = lineStyle;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (!boardPages[currentPageIndex]) boardPages[currentPageIndex] = [];
    boardPages[currentPageIndex].push({ x, y, color: lineStyle, size: currentSize });

    socket.emit('draw-board', {
        roomId: currentRoomId,
        drawData: { x, y, color: lineStyle, size: currentSize, pageIndex: currentPageIndex }
    });
}

socket.on('draw-board', ({ x, y, color, size, pageIndex }) => {
    if (pageIndex !== currentPageIndex) return;
    if (!ctx) return;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
});

function updatePageDisplay() {
    const pageDisplay = document.getElementById('page-num-display');
    if (pageDisplay) {
        pageDisplay.textContent = `${currentPageIndex + 1} / ${boardPages.length}`;
    }
}

function addBoardPage() {
    boardPages.push([]);
    currentPageIndex = boardPages.length - 1;
    clearCanvasScreen();
    updatePageDisplay();
    socket.emit('change-page', { roomId: currentRoomId, pageIndex: currentPageIndex, totalPages: boardPages.length });
}

function prevBoardPage() {
    if (currentPageIndex > 0) {
        currentPageIndex--;
        redrawCurrentPage();
        updatePageDisplay();
        socket.emit('change-page', { roomId: currentRoomId, pageIndex: currentPageIndex, totalPages: boardPages.length });
    }
}

function nextBoardPage() {
    if (currentPageIndex < boardPages.length - 1) {
        currentPageIndex++;
        redrawCurrentPage();
        updatePageDisplay();
        socket.emit('change-page', { roomId: currentRoomId, pageIndex: currentPageIndex, totalPages: boardPages.length });
    }
}

socket.on('change-page', ({ pageIndex, totalPages }) => {
    while (boardPages.length < totalPages) boardPages.push([]);
    currentPageIndex = pageIndex;
    redrawCurrentPage();
    updatePageDisplay();
});

function clearCanvasScreen() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function redrawCurrentPage() {
    clearCanvasScreen();
    const currentLines = boardPages[currentPageIndex] || [];
    currentLines.forEach(line => {
        ctx.lineWidth = line.size;
        ctx.lineCap = 'round';
        ctx.strokeStyle = line.color;
        ctx.lineTo(line.x, line.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
    });
}

function clearBoard() {
    boardPages[currentPageIndex] = [];
    clearCanvasScreen();
    socket.emit('clear-board', { roomId: currentRoomId, pageIndex: currentPageIndex });
}

socket.on('clear-board', () => {
    boardPages[currentPageIndex] = [];
    clearCanvasScreen();
});

function changeBoardBg(bgClass) {
    const container = document.getElementById('canvas-container');
    if (container) container.className = 'canvas-fullscreen-container ' + bgClass;
    socket.emit('change-bg', { roomId: currentRoomId, bgClass });
}

socket.on('change-bg', (bgClass) => {
    const container = document.getElementById('canvas-container');
    if (container) container.className = 'canvas-fullscreen-container ' + bgClass;
});

function downloadBoard() {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Al-Boulaqi-Board-Page-${currentPageIndex + 1}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

function loadPDF(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') return alert('اختر ملف PDF صحيح');

    const reader = new FileReader();
    reader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                    const viewport = page.getViewport({ scale: 1.5 });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    page.render({ canvasContext: ctx, viewport: viewport });
                });
            });
        }
    };
    reader.readAsArrayBuffer(file);
}

// 2️⃣ إظهار الشات المباشر أوتوماتيكياً (حل مشكلة الرسائل)
function renderChatMessage(data) {
    const box = document.getElementById('chat-messages');
    if (!box) return;

    if (activeTab !== 'chat' && data.sender !== userName) {
        unreadChatCount++;
        const badge = document.getElementById('chat-badge');
        if (badge) {
            badge.textContent = unreadChatCount;
            badge.classList.remove('hidden');
        }
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-bubble-item';

    let fileHTML = '';
    if (data.fileUrl) {
        if (data.fileType === 'image') {
            fileHTML = `<br><img src="${data.fileUrl}" style="max-width:100%; border-radius:8px; margin-top:8px;">`;
        } else {
            fileHTML = `<br><a href="${data.fileUrl}" download="${data.fileName || 'file'}" class="btn-chat-file"><i class="fa-solid fa-download"></i> تحميل ${data.fileName || 'الملف'}</a>`;
        }
    }

    msgDiv.innerHTML = `<strong style="color:#10b981">${data.sender}</strong> <small style="opacity:0.6; font-size:0.75rem">(${data.time})</small>: <p style="margin:4px 0 0 0; color:#f1f5f9">${data.message}</p>${fileHTML}`;
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    const chatData = {
        roomId: currentRoomId,
        sender: userName,
        message: msg,
        fileUrl: null,
        fileType: null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // إظهار الرسالة فوراً في الشاشة المحلية للراسل
    renderChatMessage(chatData);

    // إرسال الرسالة للسيرفر للآخرين
    socket.emit('send-chat', chatData);
    input.value = '';
}

function sendChatFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const isImage = file.type.startsWith('image/');
        const chatData = {
            roomId: currentRoomId,
            sender: userName,
            message: `مرفق: ${file.name}`,
            fileUrl: evt.target.result,
            fileType: isImage ? 'image' : 'file',
            fileName: file.name,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        renderChatMessage(chatData);
        socket.emit('send-chat', chatData);
    };
    reader.readAsDataURL(file);
}

function handleChatKey(e) {
    if (e.key === 'Enter') sendChatMessage();
}

socket.on('receive-chat', (data) => {
    // عدم تكرار الرسالة إذا كانت قادمة من نفس المستخدم
    if (data.sender !== userName) {
        renderChatMessage(data);
    }
});

// باقي الدوال السابقة
function raiseHand() {
    socket.emit('raise-hand', { roomId: currentRoomId, userName });
    alert('تم إرسال طلب الكلمة للمحاضر ✋');
}

socket.on('notify-hand', (name) => {
    alert(`✋ ${name} يطلب الكلمة الآن!`);
});

function startLocalCamera() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            const video = document.getElementById('my-pip-video');
            if (video) video.srcObject = stream;
        }).catch(() => console.log('الكاميرا غير متاحة'));
}

function startScreenShare() {
    if (!isHost) return alert('مشاركة الشاشة للمحاضر فقط');
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(stream => {
            const video = document.getElementById('shared-screen-video');
            if (video) video.srcObject = stream;
        }).catch(() => {});
}

let laserActive = false;
function toggleLaser() {
    laserActive = !laserActive;
    const btn = document.getElementById('laser-btn');
    if (btn) btn.classList.toggle('btn-danger', laserActive);
}

const screenWrapper = document.getElementById('screen-wrapper');
if (screenWrapper) {
    screenWrapper.addEventListener('mousemove', (e) => {
        if (!laserActive) return;
        const rect = screenWrapper.getBoundingClientRect();
        moveLaser(e.clientX - rect.left, e.clientY - rect.top, true);
        socket.emit('laser-move', { roomId: currentRoomId, x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
    });

    screenWrapper.addEventListener('mouseleave', () => {
        moveLaser(0, 0, false);
        socket.emit('laser-move', { roomId: currentRoomId, x: 0, y: 0, visible: false });
    });
}

function moveLaser(x, y, visible) {
    const laser = document.getElementById('laser-pointer');
    if (!laser) return;
    laser.style.display = visible ? 'block' : 'none';
    laser.style.left = `${x}px`;
    laser.style.top = `${y}px`;
}

socket.on('laser-move', ({ x, y, visible }) => moveLaser(x, y, visible));

let presentationActive = false;
function togglePresentation() {
    if (!isHost) return alert('هذه الميزة لمنشئ الغرفة فقط');
    presentationActive = !presentationActive;
    document.body.classList.toggle('presentation-mode', presentationActive);
    socket.emit('presentation-mode', { roomId: currentRoomId, active: presentationActive });
}

socket.on('presentation-mode', (active) => {
    document.body.classList.toggle('presentation-mode', active);
});

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

async function toggleRecording() {
    const recordBtn = document.getElementById('record-btn');

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: "screen" },
                audio: true
            });

            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = saveRecording;
            mediaRecorder.start();
            isRecording = true;

            if (recordBtn) {
                recordBtn.innerHTML = '<i class="fa-solid fa-square"></i> إيقاف وحفظ التسجيل';
                recordBtn.style.backgroundColor = '#dc2626';
            }

            stream.getVideoTracks()[0].onended = () => {
                if (isRecording) toggleRecording();
            };

        } catch (err) {
            alert('لم يتم السماح بتسجيل الشاشة.');
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;

        if (recordBtn) {
            recordBtn.innerHTML = '<i class="fa-solid fa-circle"></i> بدء تسجيل المحاضرة';
            recordBtn.style.backgroundColor = '';
        }
    }
}

function saveRecording() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `محاضرة-Al-Boulaqi-Meet.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}