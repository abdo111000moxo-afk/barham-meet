const socket = io();
let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let localStream = null;

// السبورة
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let currentTool = 'pen';
let currentColor = '#10b981';
let currentSize = 5;

// إعداد أبعاد الكانفاس
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// تحويل الصورة لرابط
document.getElementById('userpic-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) { userPic = evt.target.result; };
        reader.readAsDataURL(file);
    }
});

// 1. إنشاء غرفة (Host)
function createRoom() {
    userName = document.getElementById('username-input').value.trim() || 'المحاضر';
    socket.emit('create-room', { userName, userPic }, (res) => {
        if (res.success) {
            currentRoomId = res.roomId;
            isHost = true;
            applyHostPermissions();
            document.getElementById('created-room-link').value = `${window.location.origin}?room=${currentRoomId}`;
            showScreen('share-screen');
        }
    });
}

// 2. الانضمام لغرفة (Viewer/Host)
function joinRoom() {
    userName = document.getElementById('username-input').value.trim() || 'حاضر';
    const roomId = document.getElementById('room-id-input').value.trim();
    if (!roomId) return alert('يرجى كتابة كود الغرفة');

    socket.emit('join-room', { roomId, userName, userPic }, (res) => {
        if (res.success) {
            currentRoomId = roomId;
            isHost = res.isHost || false;
            applyHostPermissions();
            enterRoom();
        } else {
            alert(res.message || 'تعذر الانضمام للغرفة');
        }
    });
}

// إخفاء/إظهار عناصر الأدوات حسب صلاحية الـ Host
function applyHostPermissions() {
    document.querySelectorAll('.host-only').forEach(el => {
        if (isHost) {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

function copyRoomLink() {
    const linkInput = document.getElementById('created-room-link');
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value);
    alert('تم نسخ الرابط بنجاح!');
}

function enterRoom() {
    document.getElementById('current-room-id').textContent = currentRoomId;
    showScreen('room-screen');
    setTimeout(resizeCanvas, 100);
    startLocalCamera();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// 🚪 خروج من الغرفة
function leaveRoom() {
    if (confirm('هل أنت تأكد من رغبتك في الخروج من الغرفة؟')) {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        socket.emit('leave-room', { roomId: currentRoomId });
        location.reload();
    }
}

// التنقل بين التبويبات
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    const activeContent = document.getElementById(`tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    if (tab === 'whiteboard') setTimeout(resizeCanvas, 50);

    if (isHost) {
        socket.emit('change-tab', { roomId: currentRoomId, tab });
    }
}

socket.on('sync-tab', (tab) => {
    switchTab(tab);
});

// تحديث قائمة الأعضاء
socket.on('update-users', (users) => {
    const grid = document.getElementById('users-grid');
    if (!grid) return;
    grid.innerHTML = users.map(u => `
        <div class="user-card">
            <img src="${u.pic || userPic}">
            <h4>${u.name} ${u.isHost ? '👑 (Host)' : ''}</h4>
        </div>
    `).join('');
});

// ------------ رسم السبورة ------------
canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mousemove', draw);

// دعم اللمس للموبايل
canvas.addEventListener('touchstart', (e) => { drawing = true; drawTouch(e); });
canvas.addEventListener('touchend', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('touchmove', drawTouch);

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${tool}`);
    if (btn) btn.classList.add('active');
}

function draw(e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    executeDraw(x, y);
}

function drawTouch(e) {
    if (!drawing) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    executeDraw(x, y);
}

function executeDraw(x, y) {
    currentColor = document.getElementById('brush-color').value;
    currentSize = document.getElementById('brush-size').value;

    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';

    if (currentTool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
    } else {
        ctx.strokeStyle = currentColor;
    }

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
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
});

function clearBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear-board', currentRoomId);
}

socket.on('clear-board', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function changeBoardBg(bgClass) {
    const container = document.getElementById('canvas-container');
    container.className = 'canvas-container ' + bgClass;
    socket.emit('change-bg', { roomId: currentRoomId, bgClass });
}

socket.on('change-bg', (bgClass) => {
    const container = document.getElementById('canvas-container');
    if (container) container.className = 'canvas-container ' + bgClass;
});

function downloadBoard() {
    const link = document.createElement('a');
    link.download = 'Barham-Whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
}

// ------------ رفع واستعراض PDF ------------
function loadPDF(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') return alert('يرجى اختيار ملف PDF صحيح');

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            pdf.getPage(1).then(page => {
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                page.render(renderContext);
            });
        });
    };
    fileReader.readAsArrayBuffer(file);
}

// ------------ الشات المباشر ------------
function sendChatMessage() {
    const input = document.getElementById('chat-input');
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
    msgDiv.className = 'chat-bubble';
    msgDiv.innerHTML = `<strong>${data.sender}</strong> <small>(${data.time})</small>: <p>${data.message}</p>`;
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
});

// ------------ طلب الكلمة / رفع اليد ------------
function raiseHand() {
    socket.emit('raise-hand', { roomId: currentRoomId, userName });
    alert('تم إرسال طلب الكلمة للمحاضر ✋');
}

socket.on('notify-hand', (name) => {
    alert(`✋ ${name} يطلب الكلمة الان!`);
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
    if (!isHost) return alert('مشاركة الشاشة متاحة للمحاضر فقط');
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(stream => {
            document.getElementById('shared-screen-video').srcObject = stream;
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
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        moveLaser(x, y, true);
        socket.emit('laser-move', { roomId: currentRoomId, x, y, visible: true });
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

socket.on('laser-move', ({ x, y, visible }) => {
    moveLaser(x, y, visible);
});

// ------------ وضعية الشرح للجميع ------------
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

// ------------ خاصية تسجيل المحاضرة ------------
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
            alert('لم يتم السماح بتسجيل الشاشة أو حدث خطأ.');
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
    a.download = `محاضرة-Barham-Meet-${new Date().toLocaleDateString('ar-EG')}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
    alert('تم حفظ فيديو المحاضرة بنجاح على جهازك! 🎉');
}