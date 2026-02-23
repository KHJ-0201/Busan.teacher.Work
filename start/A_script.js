const currentClass = sessionStorage.getItem('selectedClass'); 
let currentViewMode = 'subject'; 

if (!currentClass) { 
    alert("반 선택 정보가 없습니다."); 
    location.href = 'index.html'; 
}

// --- 파이어베이스 연결 부품 추가 ---
const firebaseConfig = {
  apiKey: "AIzaSyDs15RTlqQSz4u1Gr6NLQ2Kx25Raey2TtA",
  authDomain: "khj-teacher-work.firebaseapp.com",
  databaseURL: "https://khj-teacher-work-default-rtdb.firebaseio.com",
  projectId: "khj-teacher-work",
  storageBucket: "khj-teacher-work.firebasestorage.app",
  messagingSenderId: "384706353235",
  appId: "1:384706353235:web:9ab057e382bad1010b0ea6"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();
// --------------------------------

/* [공용] 상단 알림 배너 생성 함수 */
function showBanner(message, color = "#3498db") {
    const existingBanner = document.getElementById('statusBanner');
    if (existingBanner) existingBanner.remove();
    const banner = document.createElement('div');
    banner.id = 'statusBanner';
    banner.innerText = message;
    banner.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        background: ${color}; color: white; padding: 10px 25px; border-radius: 30px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 10001; font-weight: bold;
        transition: opacity 0.5s ease; opacity: 0;
    `;
    document.body.appendChild(banner);
    setTimeout(() => { banner.style.opacity = '1'; }, 10);
    setTimeout(() => { 
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 500);
    }, 2500);
}

window.onload = function() { 
    const banner = document.getElementById('currentClassBanner'); 
    if (banner) banner.innerText = `현재 접속 중인 반: ${currentClass}`; 
    loadFixedInfo(currentClass);
    loadSavedSubjects(); 
    setTimeout(() => {
        const activeCheck = document.querySelector('.sub-active-check:checked');
        if (activeCheck) {
            const subName = activeCheck.closest('.sub-subject-group').querySelector('.sub-name').value;
            showBanner(`📢 현재 활성화 과목: ${subName || '이름 없음'}`, "#2c3e50");
        } else {
            showBanner("📝 현재 활성화된 과목이 없습니다.", "#95a5a6");
        }
    }, 800);
};

// LocalStorage 대신 Firebase Realtime Database를 사용하도록 변경
function DB_Save(key, data) { 
    // 경로를 CONFIG/(학급명)/fullConfig 형태로 명확히 지정합니다.
    database.ref("CONFIG/" + key.replace(/_/g, '/')).set(data); 
}

async function DB_Load(key) { 
    // 불러올 때도 동일한 CONFIG 경로에서 가져옵니다.
    const snapshot = await database.ref("CONFIG/" + key.replace(/_/g, '/')).once('value');
    return snapshot.val();
}

function loadFixedInfo(targetClass) {
    const fields = ['groupName', 'groupPeriod', 'teacherName', 'verifierName'];
    fields.forEach(id => {
        const val = localStorage.getItem(`${targetClass}_${id}`);
        const el = document.getElementById(id);
        if(val && el) {
            el.value = val;
            if(typeof checkInputStatus === 'function') checkInputStatus(el);
        }
    });
    loadStampPreview(targetClass, 'teacher');
    loadStampPreview(targetClass, 'verifier');
}

function importClassData() {
    const targetClass = document.getElementById('importClassSelect').value;
    if (!targetClass) { alert("데이터를 가져올 반을 선택해주세요."); return; }
    if (!confirm(`${targetClass}의 '문제 데이터'만 현재 화면으로 불러오시겠습니까?`)) { return; }
    
    const rawData = localStorage.getItem(`${targetClass}_fullConfig`);
    if (rawData) {
        const data = JSON.parse(rawData);
        document.getElementById('ncsSubjectContainer').innerHTML = '';
        document.getElementById('nonNcsSubjectContainer').innerHTML = '';
        rebuildUI('ncsSubjectContainer', data.ncs, 'ncs');
        rebuildUI('nonNcsSubjectContainer', data.nonNcs, 'non-ncs');
        
        setTimeout(() => {
            document.querySelectorAll('input, textarea, select').forEach(el => {
                if(typeof checkInputStatus === 'function') checkInputStatus(el);
            });
            showBanner(`${targetClass}의 데이터가 로드되었습니다. '설정 저장하기'를 눌러주세요.`, "#16a085");
        }, 300);
        
    } else {
        alert(`${targetClass}에 저장된 문제 데이터가 없습니다.`);
    }
}

function createMainSubject(type, name = null, forceId = null) { 
    const sName = name || prompt("NCS 세분류명 입력"); 
    if(!sName) return; 
    const containerId = type === 'ncs' ? 'ncsSubjectContainer' : 'nonNcsSubjectContainer'; 
    const container = document.getElementById(containerId); 
    const sId = forceId || Date.now() + Math.random(); 
    const sDiv = document.createElement('div'); 
    sDiv.className = `main-subject-card ${type}-card`; 
    sDiv.id = `main_${sId}`; 
    sDiv.innerHTML = `<div class="main-subject-title" onclick="toggleMainSubject(this)"><div class="main-title-text"><span>📂 ${sName} <small class="sub-count-badge">(능력단위: 0)</small></span> <span class="toggle-status">[열기]</span></div><div class="main-btn-group"><button onclick="event.stopPropagation(); editMainTitle('${sId}')" class="small-btn gray" style="font-size:10px; padding:2px 5px; margin-right:5px;">명칭수정</button><button onclick="event.stopPropagation(); addSubSubject('${sId}')" class="small-btn navy" style="background:#2980b9; border:1px solid #fff;">+ 능력단위 추가</button><button onclick="event.stopPropagation(); deleteMainSubject('${sId}')" class="del-btn" style="background:rgba(0,0,0,0.3); border:1px solid #fff; margin-left:5px;">삭제</button></div></div><div class="sub-subject-container" id="subContainer_${sId}" style="display:none;"></div>`; 
    container.appendChild(sDiv); 
    sortMainSubjects(containerId); 
    updateMainBadge(sId); 
}

function addSubSubject(mId, savedData = null, forceId = null) {
    const subContainer = document.getElementById(`subContainer_${mId}`);
    const subId = forceId || Date.now() + Math.random();
    const subDiv = document.createElement('div');
    subDiv.className = 'sub-subject-group';
    subDiv.id = `subGroup_${subId}`;
    const qCount = savedData ? savedData.questions.length : 0;
    const isActive = savedData ? savedData.isActive : false;
    subDiv.innerHTML = `<div class="sub-header" onclick="toggleSubSubject(this)"><span class="arrow">▶</span><span class="sub-header-summary"><input type="checkbox" class="sub-active-check" ${isActive ? 'checked' : ''} onclick="handleActiveCheck(this); event.stopPropagation();" title="B페이지 노출 여부"><b class="sum-name">${savedData ? savedData.name : '신규 능력단위'}</b><span class="sum-code">${savedData && savedData.ncsCode ? '['+savedData.ncsCode+']' : ''}</span><span class="sum-qcount">(문제: ${qCount})</span></span><div class="sub-header-btns"><button onclick="event.stopPropagation(); editSubTitle(this)" class="small-btn gray" style="font-size:10px; padding:2px 5px;">명칭수정</button><span class="toggle-status-sub" style="margin-left:5px;">[열기]</span><button onclick="event.stopPropagation(); deleteSubSubject('${mId}', this)" class="del-btn" style="background:#e74c3c; padding:2px 8px; font-size:11px; margin-left:10px;">그룹 삭제</button></div></div>
    <div class="sub-body" style="display:none;">
        <div class="sub-info-inputs">
            <input type="text" placeholder="능력단위명" class="sub-name" value="${savedData ? savedData.name : ''}" oninput="updateSubSummary(this); checkInputStatus(this);">
            <input type="text" placeholder="능력단위코드" class="sub-ncs-code" value="${savedData ? savedData.ncsCode : ''}" oninput="updateSubSummary(this); checkInputStatus(this);">
            <input type="date" class="sub-date" value="${savedData ? savedData.date : ''}" oninput="checkInputStatus(this);">
        </div>
        <div style="margin-bottom:15px;"><textarea placeholder="사전평가 목적 입력" class="sub-purpose" style="width:100%; height:60px; padding:10px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;" oninput="checkInputStatus(this)">${savedData ? savedData.purpose : ''}</textarea></div>
        <div class="q-list-area" id="qArea_${subId}" style="padding:10px; background:#f1f1f1; border-radius:5px; margin-top:10px;"></div><button onclick="addQuestionRow('${subId}', null, '${mId}')" class="q-add-btn" style="background:#3498db;">+ 문제 추가</button>
    </div>`;
    subContainer.appendChild(subDiv);
    updateMainBadge(mId);
}

function handleActiveCheck(obj) {
    const allChecks = document.querySelectorAll('.sub-active-check');
    const subName = obj.closest('.sub-subject-group').querySelector('.sub-name').value || "이름 없음";
    if (obj.checked) {
        allChecks.forEach(chk => { if (chk !== obj) chk.checked = false; });
        showBanner(`✅ 활성화 과목 변경: ${subName}`, "#27ae60");
    } else {
        showBanner(`❌ 활성화 해제: ${subName}`, "#e74c3c");
    }
    setTimeout(() => { saveAllData(true); }, 100); 
}

function addQuestionRow(subId, qData = null, mId = null) { 
    const qArea = document.getElementById(`qArea_${subId}`); const rowId = Date.now() + Math.random(); const row = document.createElement('div'); row.className = 'q-input-row'; const currentNum = qArea.querySelectorAll('.q-input-row').length + 1; 
    row.innerHTML = `<div class="q-no-badge">Q ${currentNum}</div><div class="q-text-with-img"><textarea placeholder="문제 입력" oninput="checkInputStatus(this)">${qData ? qData.text : ''}</textarea><div id="qImgFrame_${rowId}" class="q-img-frame" style="display:${qData && qData.img ? 'block' : 'none'};"><div id="qImgPrev_${rowId}" class="q-img-inner-view">${qData && qData.img ? `<img src="${qData.img}" data-img="${qData.img}"><button onclick="removeQuestionImage('${rowId}')" class="img-del-x">X</button>` : ''}</div></div><div class="q-img-upload-box"><input type="file" id="qImg_${rowId}" accept="image/*" style="display:none;" onchange="handleQuestionImage(this, '${rowId}')"><button onclick="document.getElementById('qImg_${rowId}').click()" class="small-btn gray">🖼️ 사진</button></div></div><div class="opts"><input type="text" placeholder="1번" value="${qData ? qData.options[0] : ''}" oninput="checkInputStatus(this)"><input type="text" placeholder="2번" value="${qData ? qData.options[1] : ''}" oninput="checkInputStatus(this)"><input type="text" placeholder="3번" value="${qData ? qData.options[2] : ''}" oninput="checkInputStatus(this)"><input type="text" placeholder="4번" value="${qData ? qData.options[3] : ''}" oninput="checkInputStatus(this)"></div><div class="ans-exp">정답: <select onchange="checkInputStatus(this)"><option value="" ${!qData ? 'selected' : ''}>선택</option><option value="1" ${qData && qData.answer == '1' ? 'selected' : ''}>1</option><option value="2" ${qData && qData.answer == '2' ? 'selected' : ''}>2</option><option value="3" ${qData && qData.answer == '3' ? 'selected' : ''}>3</option><option value="4" ${qData && qData.answer == '4' ? 'selected' : ''}>4</option></select> 해설: <input type="text" class="exp-input" placeholder="해설" value="${qData ? qData.explain : ''}" oninput="checkInputStatus(this)"><button onclick="this.parentElement.parentElement.remove(); renumberQuestions('${subId}');" class="del-btn">삭제</button></div>`; 
    qArea.appendChild(row); 
    row.querySelectorAll('input, textarea, select').forEach(el => checkInputStatus(el)); 
    updateSubSummaryById(subId); 
}

function saveFixedInfo() { 
    const fields = ['groupName', 'groupPeriod', 'teacherName', 'verifierName']; 
    fields.forEach(id => { 
        const el = document.getElementById(id); 
        if(el) localStorage.setItem(`${currentClass}_${id}`, el.value.trim()); 
    }); 
}

function saveStampImage(type) { 
    const file = document.getElementById(`${type}Stamp`).files[0]; 
    if (!file) return; 
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        localStorage.setItem(`${currentClass}_${type}StampImg`, e.target.result); 
        loadStampPreview(currentClass, type); 
    }; 
    reader.readAsDataURL(file); 
}

function loadStampPreview(cls, type) { 
    const data = localStorage.getItem(`${cls}_${type}StampImg`); 
    const prevDiv = document.getElementById(`${type}StampPrev`); 
    if (data && prevDiv) prevDiv.innerHTML = `<img src="${data}" style="width:40px; height:40px;">`; 
}

function saveAllData(silent = false) { 
    const fields = ['groupName', 'groupPeriod', 'teacherName', 'verifierName'];
    let isAllFilled = true;
    fields.forEach(id => {
        const el = document.getElementById(id);
        if(!el || el.value.trim() === "") {
            isAllFilled = false;
            if(el) el.classList.add('empty-field');
        }
    });

    if(!isAllFilled) {
        showBanner("⚠️ 학급 기본 설정을 모두 입력해야 저장이 가능합니다.", "#e74c3c");
        if(!silent) alert("학급 기본 설정(훈련과정, 기간, 교사, 검증자)을 모두 입력해주세요.");
        return;
    }

    try {
        const ncsData = extractSubjectData('ncsSubjectContainer');
        const nonNcsData = extractSubjectData('nonNcsSubjectContainer');
        const data = { ncs: ncsData, nonNcs: nonNcsData }; 
        
        DB_Save(`${currentClass}_fullConfig`, data); 
        saveFixedInfo(); 
        
        if (silent !== true) {
            showBanner("🚀 클라우드 데이터베이스에 실시간 저장되었습니다.", "#27ae60");
        }
    } catch (e) {
        console.error("저장 오류 상세:", e);
        alert("저장 중 오류가 발생했습니다.");
    }
}

function deleteSubSubject(mId, btn) {
    if(!confirm("이 능력단위(그룹)를 삭제하시겠습니까?\n포함된 모든 문제가 함께 삭제됩니다.")) return;
    const subGroup = btn.closest('.sub-subject-group');
    if(subGroup) {
        subGroup.remove();
        updateMainBadge(mId);
        showBanner("🗑️ 능력단위가 삭제되었습니다.", "#e67e22");
    }
}

function deleteMainSubject(sId) {
    if(!confirm("이 세분류를 삭제하시겠습니까?\n포함된 모든 능력단위와 문제가 삭제됩니다.")) return;
    const mainCard = document.getElementById(`main_${sId}`);
    if(mainCard) {
        mainCard.remove();
        showBanner("🗑️ 세분류가 삭제되었습니다.", "#e74c3c");
    }
}

function editMainTitle(sId) {
    const card = document.getElementById(`main_${sId}`);
    const titleSpan = card.querySelector('.main-subject-title span');
    const oldTitle = titleSpan.childNodes[0].textContent.replace('📂 ', '').trim();
    const newTitle = prompt("수정할 세분류명 입력", oldTitle);
    if(newTitle && newTitle !== oldTitle) {
        const subBadge = card.querySelector('.sub-count-badge').outerHTML;
        titleSpan.innerHTML = `📂 ${newTitle} ${subBadge}`;
        showBanner("✏️ 명칭이 수정되었습니다.");
    }
}

function editSubTitle(btn) {
    const group = btn.closest('.sub-subject-group');
    const nameInput = group.querySelector('.sub-name');
    const oldName = nameInput.value;
    const newName = prompt("수정할 능력단위명 입력", oldName);
    if(newName && newName !== oldName) {
        nameInput.value = newName;
        updateSubSummary(nameInput);
        showBanner("✏️ 명칭이 수정되었습니다.");
    }
}

function extractSubjectData(containerId) {
    const subjects = []; const container = document.getElementById(containerId); if(!container) return [];
    const cards = container.querySelectorAll('.main-subject-card');
    cards.forEach(card => {
        const titleEl = card.querySelector('.main-subject-title span');
        if(!titleEl) return;
        const subject = { title: titleEl.childNodes[0].textContent.replace('📂 ', '').trim(), subSubjects: [] };
        card.querySelectorAll('.sub-subject-group').forEach(group => {
            const subData = {
                isActive: group.querySelector('.sub-active-check').checked,
                name: group.querySelector('.sub-name').value,
                ncsCode: group.querySelector('.sub-ncs-code').value,
                date: group.querySelector('.sub-date').value,
                purpose: group.querySelector('.sub-purpose').value,
                questions: []
            };
            group.querySelectorAll('.q-input-row').forEach(q => {
                const imgTag = q.querySelector('.q-img-inner-view img');
                const textTask = q.querySelector('textarea');
                const optionsTask = q.querySelectorAll('.opts input');
                const selectTask = q.querySelector('select');
                const expTask = q.querySelector('.exp-input');
                if(textTask && optionsTask && selectTask) {
                    subData.questions.push({ 
                        text: textTask.value, 
                        img: imgTag ? imgTag.getAttribute('data-img') : null, 
                        options: Array.from(optionsTask).map(i => i.value), 
                        answer: selectTask.value, 
                        explain: expTask ? expTask.value : ""
                    });
                }
            });
            subject.subSubjects.push(subData);
        });
        subjects.push(subject);
    });
    return subjects;
}

async function loadSavedSubjects() { 
    const data = await DB_Load(`${currentClass}_fullConfig`); 
    if (!data) return; 
    document.getElementById('ncsSubjectContainer').innerHTML = ''; 
    document.getElementById('nonNcsSubjectContainer').innerHTML = ''; 
    rebuildUI('ncsSubjectContainer', data.ncs, 'ncs'); 
    rebuildUI('nonNcsSubjectContainer', data.nonNcs, 'non-ncs'); 
}

function rebuildUI(containerId, subjects, type) { if(!subjects) return; subjects.forEach(s => { const sId = Date.now() + Math.random(); createMainSubject(type, s.title, sId); s.subSubjects.forEach(sub => { const subId = Date.now() + Math.random(); addSubSubject(sId, sub, subId); sub.questions.forEach(q => addQuestionRow(subId, q, sId)); }); }); sortMainSubjects(containerId); }
function toggleMainSubject(header) { const body = header.nextElementSibling; const status = header.querySelector('.toggle-status'); if(body.style.display === "none") { body.style.display = "block"; status.innerText = "[접기]"; header.style.opacity = "1"; } else { body.style.display = "none"; status.innerText = "[열기]"; header.style.opacity = "0.7"; } }
function toggleSubSubject(header) { const body = header.nextElementSibling; const arrow = header.querySelector('.arrow'); const status = header.querySelector('.toggle-status-sub'); if (body.style.display === "none") { body.style.display = "block"; arrow.innerText = "▼"; status.innerText = "[접기]"; } else { body.style.display = "none"; arrow.innerText = "▶"; status.innerText = "[열기]"; } }
function sortMainSubjects(containerId) { const container = document.getElementById(containerId); if(!container) return; const cards = Array.from(container.querySelectorAll('.main-subject-card')); cards.sort((a, b) => { const titleA = a.querySelector('.main-subject-title span').childNodes[0].textContent.replace('📂 ', '').trim(); const titleB = b.querySelector('.main-subject-title span').childNodes[0].textContent.replace('📂 ', '').trim(); return titleA.localeCompare(titleB, 'ko'); }); cards.forEach(card => container.appendChild(card)); }
function renumberQuestions(subId) { const qArea = document.getElementById(`qArea_${subId}`); if(!qArea) return; const rows = qArea.querySelectorAll('.q-input-row'); rows.forEach((row, idx) => { row.querySelector('.q-no-badge').innerText = `Q ${idx + 1}`; }); updateSubSummaryById(subId); }
function updateSubSummary(el) { const group = el.closest('.sub-subject-group'); if(!group) return; const name = group.querySelector('.sub-name').value; const code = group.querySelector('.sub-ncs-code').value; group.querySelector('.sum-name').innerText = name || '신규 능력단위'; group.querySelector('.sum-code').innerText = code ? '['+code+']' : ''; }
function updateSubSummaryById(subId) { const qArea = document.getElementById(`qArea_${subId}`); if(!qArea) return; const count = qArea.querySelectorAll('.q-input-row').length; const group = qArea.closest('.sub-subject-group'); if(group) group.querySelector('.sum-qcount').innerText = `(문제: ${count})`; }
function updateMainBadge(mId) { const container = document.getElementById(`subContainer_${mId}`); if(!container) return; const count = container.querySelectorAll('.sub-subject-group').length; const header = container.previousElementSibling; if(header) header.querySelector('.sub-count-badge').innerText = `(능력단위: ${count})`; }
function handleQuestionImage(input, rowId) { const file = input.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { document.getElementById(`qImgFrame_${rowId}`).style.display = 'block'; document.getElementById(`qImgPrev_${rowId}`).innerHTML = `<img src="${e.target.result}" data-img="${e.target.result}"><button onclick="removeQuestionImage('${rowId}')" class="img-del-x">X</button>`; }; reader.readAsDataURL(file); }
function removeQuestionImage(rowId) { document.getElementById(`qImgFrame_${rowId}`).style.display = 'none'; document.getElementById(`qImgPrev_${rowId}`).innerHTML = ''; }
function switchView(mode) { currentViewMode = mode; document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); if(mode === 'subject') { document.getElementById('viewBySubjectBtn').classList.add('active'); document.querySelector('.vertical-layout').style.display = 'flex'; document.getElementById('dateViewContainer').style.display = 'none'; loadSavedSubjects(); } else { document.getElementById('viewByDateBtn').classList.add('active'); document.querySelector('.vertical-layout').style.display = 'none'; document.getElementById('dateViewContainer').style.display = 'block'; renderDateView(); } }
function updateDateInListView(subGroupId, newDate) { const subGroup = document.getElementById(subGroupId); if (subGroup) { const dateInput = subGroup.querySelector('.sub-date'); if (dateInput) { dateInput.value = newDate; checkInputStatus(dateInput); } } renderDateView(); }
function renderDateView() { const list = document.getElementById('dateViewList'); if(!list) return; list.innerHTML = ''; const allGroups = document.querySelectorAll('.sub-subject-group'); let datedSubs = []; let undatedSubs = []; allGroups.forEach(group => { const card = group.closest('.main-subject-card'); if(!card) return; const mTitle = card.querySelector('.main-subject-title span').childNodes[0].textContent.replace('📂 ', '').trim(); const subName = group.querySelector('.sub-name').value; const subDate = group.querySelector('.sub-date').value; const qCount = group.querySelectorAll('.q-input-row').length; const originalId = group.id; const item = { mainTitle: mTitle, name: subName, date: subDate, questionsCount: qCount, originalId: originalId }; if (subDate) datedSubs.push(item); else undatedSubs.push(item); }); datedSubs.sort((a, b) => new Date(a.date) - new Date(b.date)); list.innerHTML += `<h3 style="color:#2980b9; border-bottom:2px solid #2980b9; padding-bottom:10px;">📅 날짜 확정 능력단위</h3>`; datedSubs.forEach(sub => { const row = document.createElement('div'); row.className = 'date-item-row'; row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div><input type="date" value="${sub.date}" onchange="updateDateInListView('${sub.originalId}', this.value)" style="padding:4px; border:1px solid #2980b9; border-radius:4px; margin-right:15px; font-weight:bold;"><span style="color:#666; font-size:13px; margin-right:5px;">[${sub.mainTitle}]</span><span style="font-weight:bold;">${sub.name}</span></div><div style="font-size:12px; color:#e74c3c; font-weight:bold;">문제: ${sub.questionsCount}개</div></div>`; list.appendChild(row); }); list.innerHTML += `<h3 style="color:#7f8c8d; border-bottom:2px solid #7f8c8d; padding-bottom:10px; margin-top:40px;">❔ 날짜 미정 능력단위 (작성 중)</h3>`; undatedSubs.forEach(sub => { const row = document.createElement('div'); row.className = 'date-item-row'; row.style.background = "#fffafa"; row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;"><div><input type="date" onchange="updateDateInListView('${sub.originalId}', this.value)" style="padding:4px; border:1px solid #ccc; border-radius:4px; margin-right:15px;"><span style="color:#666; font-size:13px; margin-right:5px;">[${sub.mainTitle}]</span><span style="font-weight:bold; color:#7f8c8d;">${sub.name}</span></div><div style="font-size:12px; color:#e74c3c; font-weight:bold;">문제: ${sub.questionsCount}개</div></div>`; list.appendChild(row); }); }
function exportBackup() { const allData = {}; for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if(key.includes(currentClass)) allData[key] = localStorage.getItem(key); } const dataStr = JSON.stringify(allData); const blob = new Blob([dataStr], {type: "application/json"}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `백업_${currentClass}.json`; link.click(); }
function importBackup(input) { const file = input.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const data = JSON.parse(e.target.result); for (const k in data) localStorage.setItem(k, data[k]); location.reload(); } catch(err) { alert("백업 파일 형식이 올바르지 않습니다."); } }; reader.readAsText(file); }