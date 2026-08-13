const socket = io();
let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let localStream = null;

// السبورة
const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d') : null;
let drawing = false;
let currentTool = 'pen';
let currentColor = '#10b981';
let currentSize = 5;

// ضبط أبعاد السبورة
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// قراءة الصورة الشخصية
const userPicInput = document.getElementById('userpic-input');
if (userPicInput) {
    userPicInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(evt) { userPic = evt.target.result; };
            reader.readAsDataURL(file);
        }
    });
}

// 1️⃣ إنشاء غرفة جديدة (Host) - مضمونة ومباشرة
function createRoom() {
    const userInput = document.getElementById('username-input');
    userName = (userInput && userInput.value.trim()) ? userInput.value.trim() : 'المحاضر';
    
    // توليد كود الغرفة محلياً كخطة بديلة فورية
    const generatedId = Math.random().toString(36).substring(2, 8);
    currentRoomId = generatedId;
    isHost = true;

    // محاولة الاتصال بالسيرفر
    socket.emit('create-room', { userName, userPic, roomId: generatedId }, (res) => {
        if (res && res.roomId) {
            currentRoomId = res.roomId;
        }
    });

    // الانتقال الفوري لشاشة الرابط دون انتظار الشبكة
    applyHostPermissions();
    const linkInput = document.getElementById('created-room-link');
    if (linkInput) {
        linkInput.value = `${window.location.origin}?room=${currentRoomId}`;
    }
    showScreen('share-screen');
}

// 2️⃣ الانضمام لغرفة (Viewer)
function joinRoom() {
    const userInput = document.getElementById('username-input');
    const roomInput = document.getElementById('room-id-input');
    
    userName = (userInput && userInput.value.trim()) ? userInput.value.trim() : 'حاضر';
    const roomId = roomInput ? roomInput.value.trim() : '';

    if (!roomId) return alert('يرجى كتابة كود الغرفة أولاً');

    currentRoomId = roomId;

    socket.emit('join-room', { roomId, userName, userPic }, (res) => {
        if (res && res.success) {
            isHost = res.isHost || false;
            applyHostPermissions();
            enterRoom();
        } else {
            // انضمام مباشر لو السيرفر أرسل موافقة أو تعذر
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

// 🚪 الخروج من الغرفة
function leaveRoom() {
    if (confirm('هل أنت تأكد من الخروج من الغرفة؟')) {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        socket.emit('leave-room', { roomId: currentRoomId });
        location.reload();
    }
}

// التنقل بين التبويبات
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`[data-tab="${tab}"]`);
    const content = document.getElementById(`tab-${tab}`);

    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');

    if (tab === 'whiteboard') setTimeout(resizeCanvas, 50);

    if (isHost) {
        socket.emit('change-tab', { roomId: currentRoomId, tab });
    }
}

socket.on('sync-tab', (tab) => switchTab(tab));

// تحديث قائمة المشتركين
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

    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = (currentTool === 'eraser') ? '#ffffff' : currentColor;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    socket.emit('draw-board', {
        roomId: currentRoomId,
        drawData: { x, y, color: ctx.strokeStyle, size: currentSize }
    });
}

socket.on('draw-board', ({ x, y, color, size }) => {
    if (!ctx) return;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
});

function clearBoard() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear-board', currentRoomId);
}

socket.on('clear-board', () => {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function changeBoardBg(bgClass) {
    const container = document.getElementById('canvas-container');
    if (container) container.className = 'canvas-container ' + bgClass;
    socket.emit('change-bg', { roomId: currentRoomId, bgClass });
}

socket.on('change-bg', (bgClass) => {
    const container = document.getElementById('canvas-container');
    if (container) container.className = 'canvas-container ' + bgClass;
});

function downloadBoard() {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'Barham-Whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
}

// ------------ رفع واستعراض PDF ------------
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

// ------------ الشات المباشر ------------
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    socket.emit('send-chat', {
        roomId: currentRoomId,
        sender: userName,
        message: msg,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    input.value = '';
}

function handleChatKey(e) {
    if (e.key === 'Enter') sendChatMessage();
}

socket.on('receive-chat', (data) => {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = "8px";
    msgDiv.innerHTML = `<strong>${data.sender}</strong> <small style="opacity:0.7">(${data.time})</small>: <p style="margin:2px 0 0 0">${data.message}</p>`;
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
});

// ------------ طلب الكلمة / رفع اليد ------------
function raiseHand() {
    socket.emit('raise-hand', { roomId: currentRoomId, userName });
    alert('تم إرسال طلب الكلمة للمحاضر ✋');
}

socket.on('notify-hand', (name) => {
    alert(`✋ ${name} يطلب الكلمة الآن!`);
});

// ------------ الكاميرات ومشاركة الشاشة ------------
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

// ------------ مؤشر الليزر ------------
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

// ------------ وضعية الشرح ------------
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

// ------------ تسجيل المحاضرة ------------
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
    a.download = `محاضرة-Barham-Meet.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}