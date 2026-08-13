const socket = io({ transports: ['websocket', 'polling'] });

let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let localStream = null;

let unreadChatCount = 0;
let activeTab = 'main';
let boardPages = [[]];
let currentPageIndex = 0;
let currentUsersList = [];

const canvas = document.getElementById('whiteboard');
const ctx = canvas ? canvas.getContext('2d') : null;
let drawing = false;
let currentTool = 'pen';
let currentColor = '#10b981';
let currentSize = 5;

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
        }
        showScreen('home-screen');
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
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = (roomInput && roomInput.value.trim()) ? roomInput.value.trim() : urlParams.get('room');

    if (!roomId) return alert('يرجى كتابة كود الغرفة أولاً');

    currentRoomId = roomId;

    socket.emit('join-room', { roomId: currentRoomId, userName, userPic }, (res) => {
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
    renderUsersGrid(currentUsersList);
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
        window.location.href = window.location.origin;
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
        if (badge) badge.classList.add('hidden');
    }

    if (tab === 'whiteboard') setTimeout(resizeCanvas, 50);

    if (isHost) {
        socket.emit('change-tab', { roomId: currentRoomId, tab });
    }
}

socket.on('sync-tab', (tab) => switchTab(tab));

// 👥 رسم قائمة الحضور مع خيارات كتم الصوت والفيديو للـ Host
function renderUsersGrid(users) {
    const grid = document.getElementById('users-grid');
    if (!grid || !Array.isArray(users)) return;

    grid.innerHTML = users.map(u => `
        <div class="user-card">
            <img src="${u.pic || userPic}">
            <h4>${u.name} ${u.isHost ? '👑 (Host)' : ''}</h4>
            ${isHost && !u.isHost ? `
                <div class="host-controls mt-2">
                    <button class="btn-ctrl ${u.micMuted ? 'muted' : ''}" onclick="toggleUserMedia('${u.id}', 'audio', ${!u.micMuted})">
                        <i class="fa-solid ${u.micMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
                    </button>
                    <button class="btn-ctrl ${u.camOff ? 'muted' : ''}" onclick="toggleUserMedia('${u.id}', 'video', ${!u.camOff})">
                        <i class="fa-solid ${u.camOff ? 'fa-video-slash' : 'fa-video'}"></i>
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function toggleUserMedia(userId, type, state) {
    socket.emit('toggle-user-media', { roomId: currentRoomId, targetUserId: userId, type, state });
}

socket.on('force-media-control', ({ type, state }) => {
    if (localStream) {
        if (type === 'audio') {
            localStream.getAudioTracks().forEach(t => t.enabled = !state);
            alert(state ? 'قام المحاضر بكتِم الميكروفون الخاص بك 🔇' : 'قام المحاضر بفتح الميكروفون لك 🎙️');
        }
        if (type === 'video') {
            localStream.getVideoTracks().forEach(t => t.enabled = !state);
            alert(state ? 'قام المحاضر بإيقاف كاميرتك 📷' : 'قام المحاضر بتشغيل كاميرتك 📹');
        }
    }
});

socket.on('update-users', (users) => {
    currentUsersList = users;
    renderUsersGrid(users);
});

socket.on('sync-initial-state', ({ messages, currentTab, users }) => {
    if (users) {
        currentUsersList = users;
        renderUsersGrid(users);
    }
    if (messages && Array.isArray(messages)) {
        const box = document.getElementById('chat-messages');
        if (box) box.innerHTML = '';
        messages.forEach(msg => appendMessageToDOM(msg));
    }
    if (currentTab) switchTab(currentTab);
});

// 💬 الشات المباشر الشامل
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    socket.emit('send-chat', {
        roomId: currentRoomId,
        sender: userName,
        message: msg,
        fileUrl: null,
        fileType: null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    input.value = '';
}

function appendMessageToDOM(data) {
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

socket.on('receive-chat', (data) => {
    appendMessageToDOM(data);
});

// الكاميرات والسبورة
function startLocalCamera() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            const video = document.getElementById('my-pip-video');
            if (video) video.srcObject = stream;
        }).catch(() => console.log('الكاميرا غير متاحة'));
}