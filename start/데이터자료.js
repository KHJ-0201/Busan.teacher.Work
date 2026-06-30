
    const masterConfig = {
        apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
        authDomain: "busan-teacher-workall.firebaseapp.com",
        databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "busan-teacher-workall"
    };

    if (!firebase.apps.length) firebase.initializeApp(masterConfig);
    const database = firebase.database();
    const classList = ['501반', '601반', '602반', '603반', '701반', '702반', '703반', '테스트'];

   window.onload = async function() {
        const savedPw = localStorage.getItem('adminPw');

        // 1. 로컬 스토리지에 열쇠가 없으면 즉시 퇴거
        if (!savedPw) { 
            await appAlert("보안 인증이 필요합니다. 메인 화면으로 이동합니다.");
            location.href = '../index.html'; // 👈 요청하신 경로로 수정
            return; 
        }

        // 2. 파이어베이스 서버에 열쇠가 맞는지 최종 확인
        firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .then(() => {
                console.log("🔒 관리자 인증 성공");
                initTeacherSeals(); 
                loadCommonSeals(); 
                loadEtcImages();
                loadDocImages(); // 👈 [신규] 서류 이미지 자료 로드
            })
            .catch(async (err) => {
                console.error("❌ 인증 실패:", err);
                await appAlert("인증 정보가 올바르지 않거나 만료되었습니다.");
                location.href = '../index.html'; // 👈 비번이 틀려도 퇴거
            });
    };

    function initTeacherSeals() {
        const grid = document.getElementById('teacherSealGrid');
        grid.innerHTML = '';
        classList.forEach(cls => {
            const card = document.createElement('div');
            card.className = 'seal-card';
            card.innerHTML = `
                <h4>${cls}</h4>
                                <h5 style="margin: 5px 0; color: #555;">직인</h5>
                <div class="seal-preview" id="preview_${cls}"><span>미등록</span></div>
                <label class="file-label">📂 직인 등록<input type="file" style="display:none;" class="dynamic-upload-seal" data-class="${cls}"></label>
                <code class="db-path-label">teacherSeals/${cls}</code>
                
                <hr style="margin: 15px 0; border: 0; border-top: 1px dashed #ccc;">
                
                                <h5 style="margin: 5px 0; color: #555;">싸인</h5>
                <div class="seal-preview" id="preview_sign_${cls}"><span>미등록</span></div>
                <div style="display: flex; gap: 5px; justify-content: center; margin-top: 5px;">
                    <button class="dynamic-btn-signpad" data-class="${cls}" style="background:#27ae60; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">✍️ 스마트 패드</button>
                    <label class="file-label" style="margin:0; padding:5px 8px; font-size:12px;">📂 파일<input type="file" style="display:none;" class="dynamic-upload-sign" data-class="${cls}"></label>
                </div>
                <code class="db-path-label" style="display:block; margin-top:5px;">teacherSigns/${cls}</code>
            `;
            grid.appendChild(card);
            
            // 기존 직인 데이터 로드
            database.ref(`commonImages/teacherSeals/${cls}`).once('value', snap => {
                if(snap.val()) updatePreview(`preview_${cls}`, snap.val().imageData);
            });
            
            // 신규 싸인 데이터 로드
            database.ref(`commonImages/teacherSigns/${cls}`).once('value', snap => {
                if(snap.val()) updatePreview(`preview_sign_${cls}`, snap.val().imageData);
            });
        });
    }

    function uploadTeacherSeal(className, input) {
        processImage(input, (base64) => {
            database.ref(`commonImages/teacherSeals/${className}`).set({
                imageData: base64,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => { updatePreview(`preview_${className}`, base64); });
        });
    }

    // [신규 추가] 담임선생님 싸인 전용 업로드 모듈 (teacherSigns 경로 사용)
    function uploadTeacherSign(className, input) {
        processImage(input, (base64) => {
            database.ref(`commonImages/teacherSigns/${className}`).set({
                imageData: base64,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => { updatePreview(`preview_sign_${className}`, base64); });
        });
    }

    function loadCommonSeals() {
        ['vicePrincipal', 'principal'].forEach(key => {
            database.ref(`commonImages/commonSeals/${key}`).once('value', snap => {
                if(snap.val()) updatePreview(`preview_${key}`, snap.val().imageData);
            });
        });
    }

    function uploadCommonImage(key, input) {
        processImage(input, (base64) => {
            database.ref(`commonImages/commonSeals/${key}`).set({
                imageData: base64,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            }).then(() => { updatePreview(`preview_${key}`, base64); });
        });
    }

    function loadEtcImages() {
        const area = document.getElementById('etcImageArea');
        database.ref(`commonImages/etcImages`).on('value', snap => {
            area.innerHTML = '';
            const data = snap.val();
            if (!data) return;
            Object.entries(data).forEach(([id, item]) => {
                const div = document.createElement('div');
                div.className = 'etc-item';
                div.innerHTML = `
                    <div class="seal-preview" style="margin:0;"><img src="${item.imageData}"></div>
                    <div class="etc-info">
                        <input type="text" class="etc-name-input dynamic-etc-title" value="${item.title}" data-id="${id}">
                        <code class="db-path-label">etcImages/${id}</code>
                    </div>
                    <button class="btn-delete dynamic-etc-delete" data-id="${id}">삭제</button>
                `;
                area.appendChild(div);
            });
        });
    }

    async function addNewEtcSlot() {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async function() {
            processImage(this, async (base64) => {
                const title = await appPrompt("이미지 제목:", "새 이미지");
                if(!title) return;
                // 파이어베이스 push 기능을 사용하여 유니크한 ID 생성
                database.ref(`commonImages/etcImages`).push({
                    title: title,
                    imageData: base64,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                });
            });
        };
        input.click();
    }

    function updateEtcTitle(id, newTitle) {
        database.ref(`commonImages/etcImages/${id}`).update({ title: newTitle });
    }

    async function deleteEtcImage(id) {
        if(await appConfirm("삭제하시겠습니까?")) database.ref(`commonImages/etcImages/${id}`).remove();
    }

    function processImage(input, callback) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                const MAX_SIZE = 1000;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                callback(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function updatePreview(id, data) {
        const el = document.getElementById(id);
        if(el) el.innerHTML = `<img src="${data}">`;
    }


    // 📍 [신규 추가] 서류 이미지 자료 (고정 경로) 관련 함수
function loadDocImages() {
    const keys = ['makeupBwLogo', 'makeupColorLogo', 'makeupSeal', 'evalFirstBg'];
    keys.forEach(key => {
        database.ref(`commonImages/docImages/${key}`).once('value', snap => {
            if(snap.val()) updatePreview(`preview_${key}`, snap.val().imageData);
        });
    });
}

async function uploadDocImage(key, input) {
    processImage(input, async (base64) => {
        database.ref(`commonImages/docImages/${key}`).set({
            imageData: base64,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(async () => { 
            updatePreview(`preview_${key}`, base64); 
            await appAlert("✅ 업로드 완료! 경로가 고정되어 있어 코드를 수정할 필요가 없습니다.");
        }).catch(async (err) => { await appAlert("❌ 오류: " + err.message); });
    });
}

// 📍 [신규 장착] 담임선생님 디지털 서명 패드 엔진
let tSignCanvas, tSignCtx, isTDrawing = false;
let targetClassName = "";

function openTeacherSignPad(className) {
    targetClassName = className;
    const modal = document.getElementById('teacherSignModal');
    const modalTitle = modal.querySelector('.sign-title');
    if (modalTitle) modalTitle.innerHTML = `<span style="color:#27ae60;">[${className}]</span> 담임선생님 서명`;
    
    modal.style.display = 'flex';
    tSignCanvas = document.getElementById('teacherSignCanvas');
    tSignCtx = tSignCanvas.getContext('2d');
    
    // 배경 도색 (투명도 방지용 흰색 베이스)
    tSignCtx.fillStyle = "#fff";
    tSignCtx.fillRect(0, 0, tSignCanvas.width, tSignCanvas.height);
    
    tSignCtx.strokeStyle = "#000";
    tSignCtx.lineWidth = 4; // 싸인은 약간 굵게
    tSignCtx.lineCap = "round";

    if (!tSignCanvas.dataset.init) {
        setupTeacherSignEvents();
        tSignCanvas.dataset.init = "true";
    }
}

function setupTeacherSignEvents() {
    const getPos = (e) => {
        const rect = tSignCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let x, y;
        const isRotated = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
        
        if (isRotated) { // 모바일 세로 모드 (-90도 회전 보정)
            const scaleX = tSignCanvas.width / rect.height; 
            const scaleY = tSignCanvas.height / rect.width;
            x = (rect.bottom - clientY) * scaleX;
            y = (clientX - rect.left) * scaleY;
        } else { // 정상 상태 (PC 및 모바일 가로)
            const scaleX = tSignCanvas.width / rect.width;
            const scaleY = tSignCanvas.height / rect.height;
            x = (clientX - rect.left) * scaleX;
            y = (clientY - rect.top) * scaleY;
        }
        return { x, y };
    };
    const start = (e) => { isTDrawing = true; const p = getPos(e); tSignCtx.beginPath(); tSignCtx.moveTo(p.x, p.y); };
    const move = (e) => { if (!isTDrawing) return; const p = getPos(e); tSignCtx.lineTo(p.x, p.y); tSignCtx.stroke(); e.preventDefault(); };
    const stop = () => { isTDrawing = false; };
    
    tSignCanvas.addEventListener('mousedown', start);
    tSignCanvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    tSignCanvas.addEventListener('touchstart', start);
    tSignCanvas.addEventListener('touchmove', move, {passive: false});
    tSignCanvas.addEventListener('touchend', stop);
}

function clearTeacherSign() { 
    tSignCtx.clearRect(0, 0, tSignCanvas.width, tSignCanvas.height); 
    tSignCtx.fillStyle = "#fff"; 
    tSignCtx.fillRect(0, 0, tSignCanvas.width, tSignCanvas.height); 
}

function closeTeacherSignModal() { 
    document.getElementById('teacherSignModal').style.display = 'none'; 
}

async function saveTeacherDigitalSign() {
    // 0.8 품질로 경량화하여 JPEG 저장 (보강수업 로직 동일)
    const base64Data = tSignCanvas.toDataURL('image/jpeg', 0.8); 
    
    try {
        await database.ref(`commonImages/teacherSigns/${targetClassName}`).set({
            imageData: base64Data,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        await appAlert(`✅ [${targetClassName}] 담임선생님 서명이 마스터 DB에 등록되었습니다.`);
        closeTeacherSignModal();
        
        // 미리보기 화면 즉각 갱신
        updatePreview(`preview_sign_${targetClassName}`, base64Data);
    } catch (e) {
        await appAlert("❌ 저장 실패: " + e.message);
    }
}

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 리스너 매립)

// [이식 완료] 시크릿 도어 로직 (HTML에서 뜯어와서 안전하게 암호화 영역으로 편입)
let secretClickCount = 0;
let secretClickTimer;

function triggerSecretDoor() {
    secretClickCount++;
    clearTimeout(secretClickTimer);
    // 2초 내에 연속으로 안 누르면 초기화
    secretClickTimer = setTimeout(() => { secretClickCount = 0; }, 2000); 

    if (secretClickCount >= 5) {
        secretClickCount = 0; // 카운터 리셋
        console.log("🔓 엔지니어 모드: 인증 절차를 건너뛰고 계측 화면으로 점프합니다.");
        location.href = '../차체/계측.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. 단일 고정 버튼/파일 인풋 (HTML에 고정된 부품들)
    document.getElementById('title_secret_door').addEventListener('click', triggerSecretDoor);
    document.getElementById('btn_add_etc').addEventListener('click', addNewEtcSlot);
    
    document.getElementById('upload_vicePrincipal').addEventListener('change', function() { uploadCommonImage('vicePrincipal', this); });
    document.getElementById('upload_principal').addEventListener('change', function() { uploadCommonImage('principal', this); });
    
    document.getElementById('upload_makeupBwLogo').addEventListener('change', function() { uploadDocImage('makeupBwLogo', this); });
    document.getElementById('upload_makeupColorLogo').addEventListener('change', function() { uploadDocImage('makeupColorLogo', this); });
    document.getElementById('upload_makeupSeal').addEventListener('change', function() { uploadDocImage('makeupSeal', this); });
    document.getElementById('upload_evalFirstBg').addEventListener('change', function() { uploadDocImage('evalFirstBg', this); });

    // 2. 모달창 내 디지털 서명 버튼
    document.getElementById('btn_sign_clear').addEventListener('click', clearTeacherSign);
    document.getElementById('btn_sign_save').addEventListener('click', saveTeacherDigitalSign);
    document.getElementById('btn_sign_close').addEventListener('click', closeTeacherSignModal);

    // 3. 📍 동적 생성 부품 제어 (이벤트 위임 기술)
    // 담임 교사 직인 그리드 구역 (직인 업로드, 서명 업로드, 스마트패드 열기 감지)
    document.getElementById('teacherSealGrid').addEventListener('change', function(e) {
        const target = e.target;
        if (target.classList.contains('dynamic-upload-seal')) {
            uploadTeacherSeal(target.getAttribute('data-class'), target);
        } else if (target.classList.contains('dynamic-upload-sign')) {
            uploadTeacherSign(target.getAttribute('data-class'), target);
        }
    });

    document.getElementById('teacherSealGrid').addEventListener('click', function(e) {
        const target = e.target;
        if (target.classList.contains('dynamic-btn-signpad')) {
            openTeacherSignPad(target.getAttribute('data-class'));
        }
    });

    // 기타 이미지 자료 구역 (제목 수정, 삭제 감지)
    document.getElementById('etcImageArea').addEventListener('change', function(e) {
        const target = e.target;
        if (target.classList.contains('dynamic-etc-title')) {
            updateEtcTitle(target.getAttribute('data-id'), target.value);
        }
    });

    document.getElementById('etcImageArea').addEventListener('click', function(e) {
        const target = e.target;
        if (target.classList.contains('dynamic-etc-delete')) {
            deleteEtcImage(target.getAttribute('data-id'));
        }
    });
});