// public/app.js - الإصدار المصحح بالكامل

const socket = typeof io !== 'undefined' ? io() : null;

// حالة التطبيق
let currentUser = {
  name: 'عضو البولاقي',
  avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=VIPUser'
};
let currentRoomId = null;
let isHost = false;
let localStream = null;

// تأكيد تشغيل الكود بعد اكتمال تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {

  // العناصر الرئيسية
  const authScreen = document.getElementById('authScreen');
  const roomScreen = document.getElementById('roomScreen');
  const loginStep = document.getElementById('loginStep');
  const actionStep = document.getElementById('actionStep');
  const userNameInput = document.getElementById('userNameInput');
  const avatarInput = document.getElementById('avatarInput');
  const avatarPreview = document.getElementById('avatarPreview');
  const btnEnterApp = document.getElementById('btnEnterApp');

  const userBadgeAvatar = document.getElementById('userBadgeAvatar');
  const userBadgeName = document.getElementById('userBadgeName');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const joinRoomIdInput = document.getElementById('joinRoomIdInput');
  const roomLinkBox = document.getElementById('roomLinkBox');
  const generatedLinkText = document.getElementById('generatedLinkText');
  const btnProceedToRoom = document.getElementById('btnProceedToRoom');

  // 1. تغيير الصورة الشخصية
  if (avatarInput) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          currentUser.avatar = evt.target.result;
          if (avatarPreview) avatarPreview.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // 2. زر دخول التطبيق (تصليح العطل)
  if (btnEnterApp) {
    btnEnterApp.addEventListener('click', (e) => {
      e.preventDefault();

      // أخذ الاسم إذا كُتب أو وضع اسم افتراضي VIP
      const enteredName = userNameInput ? userNameInput.value.trim() : '';
      if (enteredName) {
        currentUser.name = enteredName;
      } else {
        currentUser.name = 'عضو مميز';
      }

      // تحديث البيانات في بطاقة المستخدم
      if (userBadgeName) userBadgeName.textContent = currentUser.name;
      if (userBadgeAvatar) userBadgeAvatar.src = currentUser.avatar;

      // إخفاء الخطوة الأولى وإظهار خطوة الغرف
      if (loginStep) {
        loginStep.style.display = 'none';
        loginStep.classList.remove('active');
      }
      if (actionStep) {
        actionStep.style.display = 'block';
        actionStep.classList.add('active');
      }
    });
  }

  // 3. إنشاء غرفة
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

  // 4. متابعة للغرفة بعد الإنشاء
  if (btnProceedToRoom) {
    btnProceedToRoom.addEventListener('click', () => {
      enterRoom(currentRoomId, true);
    });
  }

  // 5. الانضمام لغرفة عبر الكود
  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', () => {
      const code = joinRoomIdInput ? joinRoomIdInput.value.trim() : '';
      if (!code) {
        alert('يرجى كتابة كود الغرفة أولاً');
        return;
      }
      currentRoomId = code;
      isHost = false;
      enterRoom(currentRoomId, false);
    });
  }

  // 6. التحقق من الرابط التلقائي إن وجد
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam && joinRoomIdInput) {
    joinRoomIdInput.value = roomParam;
  }
});

// دالة الدخول الفعلي للغرفة
async function enterRoom(roomId, hostStatus) {
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

  // تشغيل الكاميرا والمايك
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    console.warn("الكاميرا أو المايك غير متوفرين أو تم رفض الإذن:", err);
  }

  if (socket) {
    socket.emit('join-room', { roomId, user: currentUser, isHost: hostStatus });
  }
}