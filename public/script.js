const socket = io();
let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

let unreadChatCount = 0;
let activeTab = 'main';
let boardPages = [[]];
let currentPageIndex = 0;

const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d') : null;
let drawing = false;

// 1. عند فتح الصفحة - قراءة البيانات والرابط
window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('alboulaqi_user_name');
    const savedPic = localStorage.getItem('alboulaqi_user_pic');

    if (savedName) {
        userName = savedName;
        if (savedPic) userPic = savedPic;
        updateHomeUI();

        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');

        if (roomIdFromUrl) {
            const roomInput = document.getElementById('room-id-input');
            if (roomInput) roomInput.value = roomIdFromUrl;
            showScreen('home-screen');
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
    showScreen('home-screen');
}

function updateHomeUI() {
    const nameEl = document.getElementById('home-user-name');
    const imgEl = document.getElementById('home-user-img');

    if (nameEl) nameEl.textContent = userName;
    if (imgEl) imgEl.src = userPic;
}

// إنشاء وانضمام
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
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function leaveRoom() {
    if (confirm('هل أنت تأكد من الخروج من الغرفة؟')) {
        window.location.href = window.location.origin;
    }
}

// التنقل بين التبويبات
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
        if (badge) badge.classList.add('hidden');
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

// ------------ الشات المباشر المضمون ------------
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

    if (activeTab !== 'chat') {
        unreadChatCount++;
        const badge = document.getElementById('chat-badge');
        if (badge) {
            badge.textContent = unreadChatCount;
            badge.classList.remove('hidden');
        }
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-bubble-item';
    msgDiv.innerHTML = `<strong style="color:#10b981">${data.sender}</strong> <small style="opacity:0.6; font-size:0.75rem">(${data.time})</small>: <p style="margin:4px 0 0 0; color:#f1f5f9">${data.message}</p>`;
    
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;
});

// ------------ السبورة ------------
function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}