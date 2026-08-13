const socket = io({ transports: ['websocket', 'polling'] });

let currentRoomId = null;
let isHost = false;
let userName = "";
let userPic = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
let localStream = null;
const peerConnections = {};

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

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('alboulaqi_user_name');
    const savedPic = localStorage.getItem('alboulaqi_user_pic');

    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');

    if (savedName) {
        userName = savedName;
        if (savedPic) userPic = savedPic;
        updateHomeUI();

        if (roomIdFromUrl) {
            const roomInput = document.getElementById('room-id-input');
            if (roomInput) roomInput.value = roomIdFromUrl;
        }
        showScreen('home-screen');
    } else {
        showScreen('login-screen');
    }

    const pipBox = document.getElementById('floating-cam-box');
    if (pipBox) makeElementDraggable(pipBox);
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        targetScreen.style.display = 'flex';
    }
}

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

async function enterRoom() {
    const roomDisplay = document.getElementById('current-room-id');
    if (roomDisplay) roomDisplay.textContent = currentRoomId;

    showScreen('room-screen');
    renderUsersGrid(currentUsersList);
    setTimeout(resizeCanvas, 100);
    
    // تشغيل الكاميرا محلياً وبدء ربط الفيديوهات مع الحاضرين
    await startLocalCamera();
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

// 👥 الحضور والشبكة
function renderUsersGrid(users) {
    const grid = document.getElementById('users-grid');
    if (!grid || !Array.isArray(users)) return;

    grid.innerHTML = users.map(u => `
        <div class="user-card">
            <img src="${u.pic || userPic}">
            <h4>${u.name} ${u.isHost ? '👑 (Host)' : ''}</h4>
            ${isHost && !u.isHost ? `
                <div class="host-controls mt-2">
                    <button class="btn-ctrl ${u.micMuted ? 'muted' : ''}" onclick="toggleUserMedia('${u.id}', 'audio', ${!u.micMuted})" title="كتم/فتح الصوت">
                        <i class="fa-solid ${u.micMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
                    </button>
                    <button class="btn-ctrl ${u.camOff ? 'muted' : ''}" onclick="toggleUserMedia('${u.id}', 'video', ${!u.camOff})" title="إيقاف/تشغيل الكاميرا">
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
            alert(state ? 'قام المنظم بكتِم الصوت لك 🔇' : 'قام المنظم بفتح الميكروفون لك 🎙️');
        }
        if (type === 'video') {
            localStream.getVideoTracks().forEach(t => t.enabled = !state);
            alert(state ? 'قام المنظم بإيقاف الكاميرا الخاصة بك 📷' : 'قام المنظم بتشغيل كاميرتك 📹');
        }
    }
});

socket.on('update-users', (users) => {
    currentUsersList = users;
    renderUsersGrid(users);

    users.forEach(u => {
        if (u.id !== socket.id && !peerConnections[u.id]) {
            createPeerConnection(u.id, true);
        }
    });
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

// 📹📹 تشغيل الميديا المحلية وربط أجهزة الحاضرين بها
async function startLocalCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // عرض الفيديو المترابط بالـ Pip والـ Grid
        const pipVideo = document.getElementById('my-pip-video');
        if (pipVideo) {
            pipVideo.srcObject = localStream;
            pipVideo.play().catch(() => {});
        }
        
        addVideoStream('local-user', localStream, userName + ' (أنت)');
    } catch (e) {
        alert('يرجى إعطاء الإذن للمتصفح للوصول إلى الكاميرا والمايك');
    }
}

function createPeerConnection(targetId, isOffer) {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[targetId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.ontrack = (event) => {
        const remoteUser = currentUsersList.find(u => u.id === targetId);
        const name = remoteUser ? remoteUser.name : 'حاضر';
        addVideoStream(targetId, event.streams[0], name);
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', { targetId, candidate: event.candidate });
        }
    };

    if (isOffer) {
        pc.createOffer().then(offer => {
            pc.setLocalDescription(offer);
            socket.emit('webrtc-offer', { targetId, offer });
        });
    }

    return pc;
}

socket.on('webrtc-offer', async ({ senderId, offer }) => {
    const pc = peerConnections[senderId] || createPeerConnection(senderId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { targetId: senderId, answer });
});

socket.on('webrtc-answer', async ({ senderId, answer }) => {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
    const pc = peerConnections[senderId];
    if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-disconnected', (userId) => {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    const card = document.getElementById(`cam-card-${userId}`);
    if (card) card.remove();
});

function addVideoStream(id, stream, name) {
    const grid = document.getElementById('cameras-grid');
    if (!grid) return;

    let card = document.getElementById(`cam-card-${id}`);
    if (!card) {
        card = document.createElement('div');
        card.id = `cam-card-${id}`;
        card.className = 'camera-video-card';
        card.innerHTML = `
            <video id="cam-video-${id}" autoplay playsinline ${id === 'local-user' ? 'muted' : ''}></video>
            <span>${name}</span>
        `;
        grid.appendChild(card);
    }

    const video = document.getElementById(`cam-video-${id}`);
    if (video && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play().catch(() => {});
    }
}

function toggleLocalAudio() {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const btn = document.getElementById('toggle-mic-btn');
        if (btn) btn.innerHTML = track.enabled ? '<i class="fa-solid fa-microphone"></i> الميكروفون: مفعل' : '<i class="fa-solid fa-microphone-slash"></i> الميكروفون: مكتوم';
    }
}

function toggleLocalVideo() {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) {
        track.enabled = !track.enabled;
        const btn = document.getElementById('toggle-cam-btn');
        if (btn) btn.innerHTML = track.enabled ? '<i class="fa-solid fa-video"></i> الكاميرا: مفعله' : '<i class="fa-solid fa-video-slash"></i> الكاميرا: معطلة';
    }
}

function toggleFloatingCam() {
    const box = document.getElementById('floating-cam-box');
    if (box) box.classList.toggle('hidden');
}

function makeElementDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const handle = document.getElementById('floating-cam-handle') || elmnt;

    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.bottom = 'auto';
        elmnt.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }

    function dragTouchStart(e) {
        const touch = e.touches[0];
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        document.ontouchend = closeTouchDrag;
        document.ontouchmove = touchDrag;
    }

    function touchDrag(e) {
        const touch = e.touches[0];
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.bottom = 'auto';
        elmnt.style.right = 'auto';
    }

    function closeTouchDrag() {
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}

// 💬 الشات المباشر
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    const roomIdToSend = currentRoomId || new URLSearchParams(window.location.search).get('room');

    socket.emit('send-chat', {
        roomId: roomIdToSend,
        sender: userName,
        message: msg,
        fileUrl: null,
        fileType: null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    input.value = '';
}

function sendChatFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const roomIdToSend = currentRoomId || new URLSearchParams(window.location.search).get('room');

    const reader = new FileReader();
    reader.onload = function(evt) {
        const isImage = file.type.startsWith('image/');
        socket.emit('send-chat', {
            roomId: roomIdToSend,
            sender: userName,
            message: `مرفق: ${file.name}`,
            fileUrl: evt.target.result,
            fileType: isImage ? 'image' : 'file',
            fileName: file.name,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    };
    reader.readAsDataURL(file);
}

function handleChatKey(e) {
    if (e.key === 'Enter') sendChatMessage();
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

// السبورة والمشاركة
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
    if (pageDisplay) pageDisplay.textContent = `${currentPageIndex + 1} / ${boardPages.length}`;
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
    socket.emit('clear-board', { roomId: currentRoomId });
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

function raiseHand() {
    socket.emit('raise-hand', { roomId: currentRoomId, userName });
    alert('تم إرسال طلب الكلمة للمحاضر ✋');
}

socket.on('notify-hand', (name) => {
    alert(`✋ ${name} يطلب الكلمة الآن!`);
});

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