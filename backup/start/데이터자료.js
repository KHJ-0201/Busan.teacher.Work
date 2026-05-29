
    const masterConfig = {
        apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
        authDomain: "busan-teacher-workall.firebaseapp.com",
        databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "busan-teacher-workall"
    };

    if (!firebase.apps.length) firebase.initializeApp(masterConfig);
    const database = firebase.database();
    const classList = ['501반', '601반', '602반', '603반', '701반', '702반', '703반', '테스트'];

   window.onload = function() {
        const savedPw = localStorage.getItem('adminPw');

        // 1. 로컬 스토리지에 열쇠가 없으면 즉시 퇴거
        if (!savedPw) { 
            alert("보안 인증이 필요합니다. 메인 화면으로 이동합니다.");
            location.href = '../index.html'; // 👈 요청하신 경로로 수정
            return; 
        }

        // 2. 파이어베이스 서버에 열쇠가 맞는지 최종 확인
        firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .then(() => {
                console.log("🔒 관리자 인증 성공");
                // 인증 성공 시에만 데이터 로드 함수 실행
                initTeacherSeals(); 
                loadCommonSeals(); 
                loadEtcImages();
            })
            .catch(err => {
                console.error("❌ 인증 실패:", err);
                alert("인증 정보가 올바르지 않거나 만료되었습니다.");
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
                <div class="seal-preview" id="preview_${cls}"><span>미등록</span></div>
                <label class="file-label">📂 등록<input type="file" style="display:none;" onchange="uploadTeacherSeal('${cls}', this)"></label>
                <code class="db-path-label">teacherSeals/${cls}</code>
            `;
            grid.appendChild(card);
            database.ref(`commonImages/teacherSeals/${cls}`).once('value', snap => {
                if(snap.val()) updatePreview(`preview_${cls}`, snap.val().imageData);
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
                        <input type="text" class="etc-name-input" value="${item.title}" onchange="updateEtcTitle('${id}', this.value)">
                        <code class="db-path-label">etcImages/${id}</code>
                    </div>
                    <button class="btn-delete" onclick="deleteEtcImage('${id}')">삭제</button>
                `;
                area.appendChild(div);
            });
        });
    }

    function addNewEtcSlot() {
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = function() {
            processImage(this, (base64) => {
                const title = prompt("이미지 제목:", "새 이미지");
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

    function deleteEtcImage(id) {
        if(confirm("삭제하시겠습니까?")) database.ref(`commonImages/etcImages/${id}`).remove();
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

