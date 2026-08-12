const socket = io();
let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

// السبورة
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
let drawing = false;
let currentTool = 'pen';
let currentColor = '#10b981';
let currentSize = 5;

// إعداد أبعاد الكانفاس
function resizeCanvas() {
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

// 1. إنشاء غرفة
function createRoom() {
    userName = document.getElementById('username-input').value.trim() || 'عضو';
    socket.emit('create-room', { userName, userPic }, (res) => {
        if (res.success) {
            currentRoomId = res.roomId;
            isHost = true;
            document.getElementById('created-room-link').value = `${window.location.origin}?room=${currentRoomId}`;
            showScreen('share-screen');
        }
    });
}

// 2. الانضمام لغرفة
function joinRoom() {
    userName = document.getElementById('username-input').value.trim() || 'عضو';
    const roomId = document.getElementById('room-id-input').value.trim();
    if (!roomId) return alert('يرجى كتابة كود الغرفة');

    socket.emit('join-room', { roomId, userName, userPic }, (res) => {
        if (res.success) {
            currentRoomId = roomId;
            enterRoom();
        } else {
            alert(res.message);
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
    resizeCanvas();
    startLocalCamera();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// التنقل بين التبويبات
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'whiteboard') resizeCanvas();

    // إرسال تنبيه للمشتركين لو كنت الآدمن
    if (isHost) {
        socket.emit('change-tab', { roomId: currentRoomId, tab });
    }
}

// استقبال مزامنة التبويب للجميع
socket.on('sync-tab', (tab) => {
    switchTab(tab);
});

// تحديث قوائم الأعضاء
socket.on('update-users', (users) => {
    const grid = document.getElementById('users-grid');
    grid.innerHTML = users.map(u => `
        <div class="user-card">
            <img src="${u.pic}">
            <h4>${u.name} ${u.isHost ? '👑' : ''}</h4>
        </div>
    `).join('');
});

// ------------ رسم السبورة ------------
canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => { drawing = false; ctx.beginPath(); });
canvas.addEventListener('mousemove', draw);

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tool-${tool}`).classList.add('active');
}

function draw(e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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

    // إرسال الكود للآخرين
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
    document.getElementById('canvas-container').className = 'canvas-container ' + bgClass;
});

function downloadBoard() {
    const link = document.createElement('a');
    link.download = 'Barham-Whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
}

// ------------ الكاميرات ومشاركة الشاشة ------------
function startLocalCamera() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            document.getElementById('my-pip-video').srcObject = stream;
        }).catch(err => console.log('الكاميرا غير متاحة'));
}

function startScreenShare() {
    navigator.mediaDevices.getDisplayMedia({ video: true })
        .then(stream => {
            document.getElementById('shared-screen-video').srcObject = stream;
        });
}

// ------------ مؤشر الليزر ------------
let laserActive = false;
function toggleLaser() {
    laserActive = !laserActive;
    document.getElementById('laser-btn').classList.toggle('btn-danger', laserActive);
}

const screenWrapper = document.getElementById('screen-wrapper');
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

function moveLaser(x, y, visible) {
    const laser = document.getElementById('laser-pointer');
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