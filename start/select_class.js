// 1. 관제탑(WorkALL) 공통 경로
const masterConfig = {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
    authDomain: "busan-teacher-workall.firebaseapp.com",
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};

// 2. 반별 경로
const firebaseConfigs = {
    "501반": { apiKey: "AIzaSyA_OfNQJUhb6XbzqOrYZ-4UT10XTy2jmAM", databaseURL: "https://busan-teacher-work1-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work1" },
    "601반": { apiKey: "AIzaSyCGl6ZNFhuG17wMLUoxHGjusXIbFswOYTs", databaseURL: "https://busan-teacher-work2-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work2" },
    "602반": { apiKey: "AIzaSyDfRhTX-rlbD_fEjZXml6GWa7TvmYEptU0", databaseURL: "https://busan-teacher-work3-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work3" },
    "603반": { apiKey: "AIzaSyAOX076DWEcgnxysedIRJHSTVTfuICbkoM", databaseURL: "https://busan-teacher-work603-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work603" },
    "701반": { apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E", databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work" },
    "702반": { apiKey: "AIzaSyDtHUvud9_LoHbZSOCwuWxIhBh2wbdtEqs", databaseURL: "https://busan-teacher-work702-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work702" },
    "703반": { apiKey: "AIzaSyBVViar868so0eUO0_sAL3uww_1asdKaB4", databaseURL: "https://busan-teacher-work703-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "busan-teacher-work703" },
    "테스트": masterConfig
};

if (!firebase.apps.length) firebase.initializeApp(masterConfig);
const database = firebase.database();

let currentTargetVersionId = ""; 
let currentTargetPart = ""; 
let uploadedFileName = ""; 
let tempData = null; 

let legacyDataCache = {};
let newVersionsCache = {};
let requiredModalVersionId = '';
let requiredModalSelection = { electronics: [], engine: [], chassis: [], ev: [] };

const NCS_PART_KEYS = NcsRequiredUtils.PART_KEYS;
const NCS_PART_LABELS = NcsRequiredUtils.PART_LABELS;

window.onload = async function() {
    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) { await appAlert("보안 인증이 필요합니다."); location.href = '../index.html'; return; }

    firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
        .then(() => {
            console.log("✅ 관리자 인증 성공");
            fetchDatabases();
            loadTeacherNames();
            preloadAllCohortMeta();
        })
        .catch(async (error) => {
            await appAlert("인증 정보가 만료되었습니다."); location.href = '../index.html';
        });
};

// 📍 [초정밀 터보 엔진] 캐시 + 병렬 처리로 로딩 속도 0초 체감 구현
async function loadTeacherNames() {
    const savedPw = localStorage.getItem('adminPw');
    const classBtns = document.querySelectorAll('.btn-main-nav');

    // 1. 캐시 메모리(잔상) 즉시 출력: 브라우저가 기억하는 이름을 대기 시간 없이 즉시 띄웁니다.
    classBtns.forEach(btn => {
        const className = btn.getAttribute('data-class');
        const cachedName = localStorage.getItem('cache_teacher_' + className);
        if (cachedName) {
            btn.innerText = `${className} ${cachedName} 선생님`;
        }
    });

    // 2. 동시 다발적 접속 (병렬 처리 엔진 세팅)
    const fetchTasks = Array.from(classBtns).map(async (btn) => {
        const className = btn.getAttribute('data-class');

        // 테스트반 처리
        if (className === '테스트') {
            try {
                const snap = await database.ref(`${className}/masterData/teacher`).once('value');
                const tName = snap.val();
                if (tName) {
                    btn.innerText = `${className} ${tName} 선생님`;
                    localStorage.setItem('cache_teacher_' + className, tName); // 캐시 갱신
                }
            } catch(e) { console.warn("테스트반 로딩 에러"); }
            return;
        }

        // 501반 ~ 703반 동시 처리
        const config = firebaseConfigs[className];
        if (config) {
            try {
                const tempAppName = "fetch_app_" + className; 
                const tempApp = firebase.initializeApp(config, tempAppName);
                
                await tempApp.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw);
                const snap = await tempApp.database().ref(`${className}/masterData/teacher`).once('value');
                const teacherName = snap.val();

                if (teacherName) {
                    btn.innerText = `${className} ${teacherName} 선생님`;
                    localStorage.setItem('cache_teacher_' + className, teacherName); // 최신 이름으로 캐시 갱신
                }

                await tempApp.delete(); // 메모리 정리
            } catch (err) {
                console.warn(`[${className}] 담임선생님 정보 로딩 실패:`, err);
            }
        }
    });

    // 3. 7개의 엔진을 동시에 풀악셀로 가동합니다.
    await Promise.all(fetchTasks);
}

function fetchDatabases() {
    database.ref('commonStandards').on('value', snap => {
        legacyDataCache = snap.val() || {};
        renderAllVersions();
    });
    database.ref('ncsVersions').on('value', snap => {
        newVersionsCache = snap.val() || {};
        renderAllVersions();
    });
}

function renderAllVersions() {
    const container = document.getElementById('versionListArea');
    if (!container) return;
    container.innerHTML = "";

    if (Object.keys(legacyDataCache).length > 0) {
        const cElec = legacyDataCache['electronics'] ? 'part-green' : 'part-red';
        const cEng  = legacyDataCache['engine'] ? 'part-green' : 'part-red';
        const cChas = legacyDataCache['chassis'] ? 'part-green' : 'part-red';
        const cEv   = legacyDataCache['ev'] ? 'part-green' : 'part-red';

        container.innerHTML += `
            <div class="version-row">
                <span class="version-label" style="color:#e74c3c;">[기존 공통]</span>
                <input type="text" class="version-input readonly" value="(구버전) 기존 등록 훈련기준" readonly>
                <div class="part-badge ${cElec} part-legacy" title="기존 데이터 보존중">⚡전기</div>
                <div class="part-badge ${cEng} part-legacy" title="기존 데이터 보존중">🔧엔진</div>
                <div class="part-badge ${cChas} part-legacy" title="기존 데이터 보존중">⚙️섀시</div>
                <div class="part-badge ${cEv} part-legacy" title="기존 데이터 보존중">🔋전기차</div>
            </div>
        `;
    }

    const keys = Object.keys(newVersionsCache).sort((a, b) => newVersionsCache[a].timestamp - newVersionsCache[b].timestamp);
    keys.forEach((vId, index) => {
        const vData = newVersionsCache[vId];
        const parts = vData.data || {};
        
        const cElec = parts['electronics'] ? 'part-green' : 'part-red';
        const cEng  = parts['engine'] ? 'part-green' : 'part-red';
        const cChas = parts['chassis'] ? 'part-green' : 'part-red';
        const cEv   = parts['ev'] ? 'part-green' : 'part-red';

        container.innerHTML += `
            <div class="version-row">
                <button class="btn-del-version dynamic-del-btn" data-vid="${vId}">❌</button>
                <span class="version-label">${index + 1}.과평 버전:</span>
                <input type="text" class="version-input dynamic-name-input" value="${vData.name}" placeholder="버전명 입력" data-vid="${vId}">
                <div class="part-badge ${cElec} dynamic-upload-btn" data-vid="${vId}" data-part="electronics">⚡전기</div>
                <div class="part-badge ${cEng} dynamic-upload-btn" data-vid="${vId}" data-part="engine">🔧엔진</div>
                <div class="part-badge ${cChas} dynamic-upload-btn" data-vid="${vId}" data-part="chassis">⚙️섀시</div>
                <div class="part-badge ${cEv} dynamic-upload-btn" data-vid="${vId}" data-part="ev">🔋전기차</div>
                <div class="part-badge part-purple dynamic-required-btn" data-vid="${vId}">필수과목</div>
            </div>
        `;
    });
}

function normalizeRequiredSelection(raw) {
    const out = { electronics: [], engine: [], chassis: [], ev: [] };
    if (!raw) return out;
    NCS_PART_KEYS.forEach((part) => {
        const bucket = raw[part];
        if (Array.isArray(bucket)) out[part] = bucket.filter(Boolean).map(String);
        else if (bucket && typeof bucket === 'object') out[part] = Object.keys(bucket).filter(Boolean);
    });
    return out;
}

function updateRequiredCountBar() {
    const bar = document.getElementById('requiredCountBar');
    if (!bar) return;
    let total = 0;
    const chips = NCS_PART_KEYS.map((part) => {
        const n = (requiredModalSelection[part] || []).length;
        total += n;
        return `<span class="required-count-chip">${NCS_PART_LABELS[part]} <strong>${n}</strong></span>`;
    });
    chips.push(`<span class="required-count-chip required-count-total">총 <strong>${total}</strong></span>`);
    bar.innerHTML = chips.join('');
}

function buildRequiredUnitItemButton(sub, part, isRequired) {
    const code = String(sub.code);
    const safeCode = code.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
    const safeName = String(sub.subjectName || '').replace(/</g, '&lt;');
    const codeLabel = NcsRequiredUtils.formatCodeBracketLabel(code);
    const partChip = isRequired
        ? `<span class="required-part-chip">${NCS_PART_LABELS[part]}</span>`
        : '';
    return `<button type="button" class="required-unit-item ${isRequired ? 'is-required' : ''}" data-part="${part}" data-code="${safeCode}">${partChip}<span class="req-code">[${codeLabel}]</span> ${safeName}</button>`;
}

function buildRequiredUnitsListHtml(vData) {
    let hasAny = false;
    const selectedEntries = [];

    NCS_PART_KEYS.forEach((part) => {
        const partPack = (vData.data && vData.data[part]) ? vData.data[part] : null;
        const subjects = partPack && Array.isArray(partPack.data) ? partPack.data : [];
        const valid = subjects.filter((sub) => sub && sub.code);
        if (!valid.length) return;
        hasAny = true;
        const selectedCodes = requiredModalSelection[part] || [];
        valid.forEach((sub) => {
            const code = String(sub.code);
            if (selectedCodes.includes(code)) {
                selectedEntries.push({ sub, part });
            }
        });
    });

    if (!hasAny) {
        return '<p style="text-align:center;color:#7f8c8d;font-size:12px;padding:20px 8px;">먼저 전기·엔진·섀시·전기차 훈련기준을 업로드해 주세요.</p>';
    }

    selectedEntries.sort((a, b) =>
        String(a.sub.subjectName || '').localeCompare(String(b.sub.subjectName || ''), 'ko')
    );

    let html = '';
    if (selectedEntries.length) {
        html += '<div class="required-selected-section">';
        html += '<div class="required-section-title required-section-title--selected">✅ 선택된 필수과목 (클릭하여 해제)</div>';
        selectedEntries.forEach(({ sub, part }) => {
            html += buildRequiredUnitItemButton(sub, part, true);
        });
        html += '</div>';
    } else {
        html += '<div class="required-selected-empty">선택된 필수과목이 없습니다.<br>아래 전체 과목에서 클릭하여 추가하세요.</div>';
    }

    html += '<div class="required-catalog-section">';
    html += '<div class="required-section-title">📋 전체 과목 (클릭하여 필수 선택)</div>';
    NCS_PART_KEYS.forEach((part) => {
        const partPack = (vData.data && vData.data[part]) ? vData.data[part] : null;
        const subjects = partPack && Array.isArray(partPack.data) ? partPack.data : [];
        const selectedCodes = requiredModalSelection[part] || [];
        const unselected = subjects
            .filter((sub) => sub && sub.code && !selectedCodes.includes(String(sub.code)))
            .sort((a, b) => String(a.subjectName || '').localeCompare(String(b.subjectName || ''), 'ko'));
        if (!unselected.length) return;
        html += `<div class="required-part-title">${NCS_PART_LABELS[part]}</div>`;
        unselected.forEach((sub) => {
            html += buildRequiredUnitItemButton(sub, part, false);
        });
    });
    html += '</div>';

    return html;
}

function refreshRequiredUnitsList() {
    const vData = newVersionsCache[requiredModalVersionId];
    const listEl = document.getElementById('requiredUnitsList');
    if (!vData || !listEl) return;
    listEl.innerHTML = buildRequiredUnitsListHtml(vData);
}

async function openRequiredUnitsModal(vId) {
    const vData = newVersionsCache[vId];
    if (!vData) {
        await appAlert('버전 정보를 찾을 수 없습니다.');
        return;
    }
    requiredModalVersionId = vId;
    requiredModalSelection = normalizeRequiredSelection(vData.requiredUnits);

    const titleEl = document.getElementById('requiredModalTitle');
    if (titleEl) titleEl.textContent = `필수과목 설정 — ${vData.name || '과평 버전'}`;

    const listEl = document.getElementById('requiredUnitsList');
    if (!listEl) return;

    listEl.innerHTML = buildRequiredUnitsListHtml(vData);
    updateRequiredCountBar();

    const overlay = document.getElementById('requiredUnitsOverlay');
    if (overlay) {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    }
}

function closeRequiredUnitsModal() {
    requiredModalVersionId = '';
    const overlay = document.getElementById('requiredUnitsOverlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    }
}

function toggleRequiredUnitSelection(part, code) {
    if (!part || !code) return;
    const list = requiredModalSelection[part] || [];
    const idx = list.indexOf(code);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(code);
    requiredModalSelection[part] = list;
    updateRequiredCountBar();
    refreshRequiredUnitsList();
}

async function saveRequiredUnitsModal() {
    if (!requiredModalVersionId) return;
    const payload = {
        electronics: [...(requiredModalSelection.electronics || [])],
        engine: [...(requiredModalSelection.engine || [])],
        chassis: [...(requiredModalSelection.chassis || [])],
        ev: [...(requiredModalSelection.ev || [])]
    };
    try {
        await database.ref(`ncsVersions/${requiredModalVersionId}/requiredUnits`).set(payload);
        await appAlert('✅ 필수과목 설정이 공용 DB에 저장되었습니다.');
        closeRequiredUnitsModal();
    } catch (err) {
        console.error(err);
        await appAlert('❌ 저장 실패: ' + err.message);
    }
}

function addVersionRow() {
    const vId = 'v_' + Date.now();
    database.ref(`ncsVersions/${vId}`).set({ name: "신규 과평 버전", timestamp: Date.now(), data: {} });
}

// 📍 [정밀 수리 1] 삭제 락(Lock) 기능 강화
async function deleteVersion(vId) {
    const userInput = await appPrompt("⚠️ 해당 버전과 연결된 훈련기준 데이터를 모두 삭제하시겠습니까?\n삭제를 진행하시려면 창에 [ 삭제합니다 ] 라고 정확히 입력해 주세요.");
    
    if (userInput === "삭제합니다") {
        database.ref(`ncsVersions/${vId}`).remove();
        await appAlert("✅ 해당 버전이 안전하게 삭제되었습니다.");
    } else if (userInput !== null) {
        await appAlert("❌ 입력하신 문구가 일치하지 않아 삭제가 취소되었습니다.");
    }
}

async function updateVersionName(vId, newName) {
    if(!newName.trim()) return await appAlert("버전 이름을 입력해 주세요.");
    database.ref(`ncsVersions/${vId}/name`).set(newName);
}

// 📍 [정밀 수리 2] 중복 업로드 경고창 장착
async function triggerUpload(vId, partName) {
    const vData = newVersionsCache[vId];
    
    // 이미 해당 파트에 데이터가 등록되어 있는지 검사
    if (vData && vData.data && vData.data[partName]) {
        const existingFileName = vData.data[partName].fileName || "알 수 없는 파일";
        if (!await appConfirm(`[ ${existingFileName} ] 이 이미 등록이 되어 있습니다. 새로 변경하시겠습니까?`)) {
            return; // 사용자가 '취소'를 누르면 여기서 멈춤
        }
    }

    currentTargetVersionId = vId;
    currentTargetPart = partName;
    document.getElementById('globalFileInput').click(); 
}

function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    uploadedFileName = file.name;
    const saveSection = document.getElementById('save_section');
    const saveBtn = document.getElementById('btn_save_db'); 
    
    saveSection.style.display = "block";
    saveBtn.innerText = "⏳ 엑셀 분석 중...";
    saveBtn.style.backgroundColor = "#f39c12";

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            
            let trainingData = [];
            let currentSubject = null;
            const partPattern = { electronics: "15060301", engine: "15060302", chassis: "15060303", ev: "15060307" }[currentTargetPart];
            
            // 💡 [신규 추가] 어떤 버튼을 눌러서 업로드했는지에 따라 한글 대분류명 결정
            const categoryNames = { 
                electronics: "자동차전기·전자장치정비", 
                engine: "자동차엔진정비", 
                chassis: "자동차섀시정비", 
                ev: "전기자동차정비" 
            };
            const currentCategoryName = categoryNames[currentTargetPart];

            rows.forEach((row) => {
                const rowStr = row.join('|');
                const codeMatch = rowStr.match(new RegExp(`${partPattern}\\d{2}_\\d+v\\d+`));

                if (codeMatch) {
                    if (currentSubject && currentSubject.subjectName && currentSubject.subjectName !== "과목명 확인 필요") {
                        trainingData.push(currentSubject);
                    }
                    // 💡 [수정] currentSubject 객체 생성 시 categoryName(대분류) 속성 추가
                    currentSubject = { 
                        categoryName: currentCategoryName, // "자동차 섀시정비" 등이 자동 삽입됨
                        code: codeMatch[0], 
                        subjectName: String(row[19] || "").trim(), 
                        goal: "", 
                        level: "", 
                        elements: [], 
                        equipments: [], 
                        isCollectingEquip: false 
                    };
                }
                if (!currentSubject) return;

                const cellA = String(row[0] || "").trim();
                const cellH = String(row[7] || "").trim();
                const cellK = String(row[10] || "").trim();
                const cleanA = cellA.replace(/\s/g, '');

                if (cleanA.includes("훈련목표")) currentSubject.goal = cellH;
                if (cleanA.includes("수준")) currentSubject.level = cellH;

                if (/^\d+\.\d+/.test(cellK)) {
                    const elementIdx = Math.floor(parseFloat(cellK)) - 1;
                    if (elementIdx >= 0) {
                        if (!currentSubject.elements[elementIdx]) currentSubject.elements[elementIdx] = { name: cellA, contents: [], k: "", s: "", t: "" };
                        currentSubject.elements[elementIdx].contents.push(...cellK.split('\n').map(s => s.trim()).filter(s => s !== ""));
                    }
                }

                if (currentSubject.elements.length > 0) {
                    const lastEl = currentSubject.elements[currentSubject.elements.length - 1];
                    if (cleanA === "지식") lastEl.k = cellK;
                    if (cleanA === "기술") lastEl.s = cellK;
                    if (cleanA === "태도") lastEl.t = cellK;
                }

                if (cleanA === "장비명") { currentSubject.isCollectingEquip = true; return; }
                if (currentSubject.isCollectingEquip) {
                    const cellC = String(row[2] || "").trim();
                    if (cellC && cleanA !== "시설명" && cleanA !== "장비명") {
                        currentSubject.equipments.push({ name: cellC, unit: String(row[11] || "").trim(), type: String(row[23] || "").trim(), capacity: String(row[32] || "").trim() });
                    }
                    if (cleanA === "시설명") currentSubject.isCollectingEquip = false;
                }
            });

            if (currentSubject) trainingData.push(currentSubject);

            if (trainingData.length > 0) {
                tempData = trainingData;
                saveBtn.style.backgroundColor = "#27ae60";
                saveBtn.innerText = `💾 [${uploadedFileName}] ${trainingData.length}개 분석완료! DB 저장 (클릭)`;
                saveBtn.onclick = function() { saveToFirebase(); };
            } else {
                saveBtn.style.backgroundColor = "#e74c3c";
                saveBtn.innerText = "❌ 검색 패턴 불일치 (엑셀 확인)";
                setTimeout(() => { saveSection.style.display = "none"; }, 3000);
            }
        } catch (error) {
            saveBtn.style.backgroundColor = "#e74c3c";
            saveBtn.innerText = "❌ 분석 오류 발생";
        }
        input.value = "";
    };
    reader.readAsArrayBuffer(file);
}

async function saveToFirebase() {
    if (!tempData || !currentTargetVersionId || !currentTargetPart) return await appAlert("저장할 데이터가 없습니다.");
    
    const saveSection = document.getElementById('save_section');
    const saveData = { fileName: uploadedFileName, data: tempData };

    database.ref(`ncsVersions/${currentTargetVersionId}/data/${currentTargetPart}`).set(saveData)
        .then(async () => {
            await appAlert("✅ 성공적으로 저장되었습니다!");
            saveSection.style.display = "none"; 
            tempData = null; 
        })
        .catch(async (err) => { await appAlert("❌ 저장 실패: " + err.message); });
}

let pendingClassName = '';
let cohortMetaCache = {};

function cohortPrefKey(className) {
    return 'classCohortPref_' + className;
}

function getCohortPreference(className) {
    const v = localStorage.getItem(cohortPrefKey(className));
    return v && v !== 'legacy' ? v : 'legacy';
}

function setCohortPreference(className, cohortId) {
    if (!cohortId || cohortId === 'legacy') {
        localStorage.removeItem(cohortPrefKey(className));
    } else {
        localStorage.setItem(cohortPrefKey(className), cohortId);
    }
    updateClassCohortStrips();
}

function cohortLabelStoreKey(className) {
    return 'classCohortLabels_' + className;
}

function getCohortLabelStore(className) {
    try {
        return JSON.parse(localStorage.getItem(cohortLabelStoreKey(className)) || '{}');
    } catch (e) {
        return {};
    }
}

function rememberCohortLabel(className, cohortId, label) {
    if (!className || !cohortId || !label) return;
    const trimmed = String(label).trim();
    if (!trimmed) return;

    const store = getCohortLabelStore(className);
    store[cohortId] = trimmed;
    localStorage.setItem(cohortLabelStoreKey(className), JSON.stringify(store));

    if (!cohortMetaCache[className]) cohortMetaCache[className] = {};
    cohortMetaCache[className][cohortId] = {
        ...(cohortMetaCache[className][cohortId] || {}),
        label: trimmed
    };
}

function forgetCohortLabel(className, cohortId) {
    const store = getCohortLabelStore(className);
    if (!store[cohortId]) return;
    delete store[cohortId];
    localStorage.setItem(cohortLabelStoreKey(className), JSON.stringify(store));
    if (cohortMetaCache[className]) delete cohortMetaCache[className][cohortId];
}

function syncCohortMetaFromArchive(className, meta) {
    cohortMetaCache[className] = meta || {};
    Object.keys(cohortMetaCache[className]).forEach(cohortId => {
        const label = cohortMetaCache[className][cohortId]?.label;
        if (label) rememberCohortLabel(className, cohortId, label);
    });
}

async function preloadAllCohortMeta() {
    const classNames = Array.from(document.querySelectorAll('.btn-main-nav'))
        .map(btn => btn.getAttribute('data-class'))
        .filter(cn => cn && firebaseConfigs[cn]);

    await Promise.all(classNames.map(async (className) => {
        try {
            const tempApp = await getClassDbApp(className, 'cohort_preload');
            const metaSnap = await tempApp.database().ref(`${className}/archiveMeta`).once('value');
            syncCohortMetaFromArchive(className, metaSnap.val() || {});
            await tempApp.delete();
        } catch (e) {
            console.warn(`[${className}] 기수 이름 로드 실패`, e);
        }
    }));

    updateClassCohortStrips();
}

async function resolveCohortLabel(className, cohortId) {
    const cached = getCohortDisplayLabel(className, cohortId);
    if (cached !== cohortId) return cached;

    if (!firebaseConfigs[className]) return cohortId;

    try {
        const tempApp = await getClassDbApp(className, 'cohort_label');
        const db = tempApp.database();
        const metaLabelSnap = await db.ref(`${className}/archiveMeta/${cohortId}/label`).once('value');
        let label = metaLabelSnap.val();
        if (!label) {
            const masterLabelSnap = await db.ref(`${className}/${cohortId}/masterData/label`).once('value');
            label = masterLabelSnap.val();
        }
        await tempApp.delete();
        if (label) {
            rememberCohortLabel(className, cohortId, label);
            return String(label).trim();
        }
    } catch (e) {
        console.warn(`[${className}] 기수 이름 조회 실패`, e);
    }
    return cohortId;
}

function getCohortDisplayLabel(className, cohortId) {
    if (!cohortId || cohortId === 'legacy') return '현재 운영 반';
    const meta = cohortMetaCache[className] || {};
    if (meta[cohortId]?.label) return meta[cohortId].label;
    const store = getCohortLabelStore(className);
    if (store[cohortId]) return store[cohortId];
    return cohortId;
}

function getCohortStripShort(className) {
    const pref = getCohortPreference(className);
    if (pref === 'legacy') return '운영';
    const label = getCohortDisplayLabel(className, pref);
    if (label.length <= 4) return label;
    return label.slice(0, 4);
}

function updateClassCohortStrips() {
    document.querySelectorAll('.class-btn-cohort').forEach(btn => {
        const cn = btn.getAttribute('data-class');
        const short = getCohortStripShort(cn);
        const labelEl = btn.querySelector('.cohort-strip-label');
        if (labelEl) labelEl.textContent = short;
        btn.title = `수료 반 선택 · 입장 (현재: ${getCohortDisplayLabel(cn, getCohortPreference(cn))})`;
    });
}

async function updateCohortModalHighlight() {
    if (!pendingClassName) return;
    const pref = getCohortPreference(pendingClassName);

    document.querySelectorAll('#cohortListArea .cohort-check-input').forEach(input => {
        const isActive = input.value === pref;
        input.checked = isActive;
        input.closest('.cohort-check-row')?.classList.toggle('is-selected', isActive);
    });

    let label = getCohortDisplayLabel(pendingClassName, pref);
    if (pref !== 'legacy' && label === pref) {
        const activeInput = document.querySelector(`#cohortListArea .cohort-check-input[value="${pref}"]`);
        if (activeInput?.dataset.label) {
            rememberCohortLabel(pendingClassName, pref, activeInput.dataset.label);
            label = activeInput.dataset.label;
        } else {
            label = await resolveCohortLabel(pendingClassName, pref);
        }
    }

    const cur = document.getElementById('cohortModalCurrent');
    if (cur) cur.textContent = `선택 중: ${label}`;
}

function escapeCohortHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function applyCohortCheckboxSelection(className, cohortId, label) {
    if (cohortId && cohortId !== 'legacy' && label) {
        rememberCohortLabel(className, cohortId, label);
    }
    setCohortPreference(className, cohortId);
    document.querySelectorAll('#cohortListArea .cohort-check-input').forEach(input => {
        const isActive = input.value === cohortId;
        input.checked = isActive;
        input.closest('.cohort-check-row')?.classList.toggle('is-selected', isActive);
    });
    updateCohortModalHighlight();
}

function buildCohortCheckListHtml(className, meta, selectedPref) {
    const keys = Object.keys(meta).sort((a, b) => (meta[a].createdAt || 0) - (meta[b].createdAt || 0));
    let html = '<div class="cohort-check-list">';

    const legacySelected = selectedPref === 'legacy';
    html += `
        <label class="cohort-check-row cohort-row-legacy${legacySelected ? ' is-selected' : ''}">
            <input type="checkbox" class="cohort-check-input" value="legacy" data-label="현재 운영 반"${legacySelected ? ' checked' : ''}>
            <span class="cohort-check-order">—</span>
            <span class="cohort-check-label">🏫 현재 운영 반 (진행 중)</span>
        </label>`;

    keys.forEach((cohortId, index) => {
        const label = meta[cohortId].label || getCohortDisplayLabel(className, cohortId);
        rememberCohortLabel(className, cohortId, label);
        const isSelected = selectedPref === cohortId;
        html += `
        <label class="cohort-check-row${isSelected ? ' is-selected' : ''}">
            <input type="checkbox" class="cohort-check-input" value="${escapeCohortHtml(cohortId)}" data-label="${escapeCohortHtml(label)}"${isSelected ? ' checked' : ''}>
            <span class="cohort-check-order">${index + 1}</span>
            <span class="cohort-check-label">${escapeCohortHtml(label)}</span>
            <button type="button" class="cohort-del-btn" data-cohort="${escapeCohortHtml(cohortId)}" data-label="${escapeCohortHtml(label)}" title="이 수료 반 보관 삭제">🗑</button>
        </label>`;
    });

    html += '</div>';
    return html;
}

function closeCohortPicker() {
    document.getElementById('cohortOverlay')?.classList.remove('open');
    pendingClassName = '';
}

function enterSelectedCohort() {
    if (!pendingClassName) return;
    const className = pendingClassName;
    const cohortId = getCohortPreference(className);
    closeCohortPicker();
    goToMain(className, cohortId);
}

function isCohortStorageKey(key) {
    return key === 'archiveMeta' || (key && key.indexOf('c_') === 0);
}

/** 현재 운영 반(legacy 루트)에 묶인 Firebase 키 — 수료 보관(copyLegacyDataToCohort)과 동일 범위 */
var OPERATING_CLASS_DATA_LABELS = {
    masterData: '기본정보·교과목·능력단위',
    fullTimetable: '전체 시간표',
    timetableStorage: '시간표 업로드 백업',
    rdStorage: 'RD 파일 정보',
    rdTimetableDraft: '시간표만들기 초안',
    dailyAttendance: '일일출석부',
    dropouts: '중도탈락',
    earlyCompletions: '조기수료',
    deletedLogs: '출석 삭제 로그',
    manualAttendance: '능력단위 수동출석',
    evaluationDates: '평가일',
    makeupDetails: '보강수업 상세',
    makeupSigns: '보강서명',
    makeupReportImages: '보강사진',
    makeupWaivers: '보강면제',
    evalPlans: '평가지(계획·원장·채점기준 등)',
    evalPhotos: '평가사진',
    evalScores: '평가점수',
    evalCompletions: '평가완료 표시',
    counselingLogs: '상담일지',
    studentResumes: '학생 이력서',
    studentEmploymentStatus: '학생 취업 상태',
    studentAccess: '학생용 접속 설정',
    studentDataRevision: '학생용 캐시 버전',
    userConfig: '화면 설정(과목/NCS 보기 등)'
};

function formatOperatingDataScopeText() {
    return Object.values(OPERATING_CLASS_DATA_LABELS).map(function (v) { return '• ' + v; }).join('\n');
}

function formatRemovedKeysSummary(keys) {
    return keys.map(function (k) {
        return OPERATING_CLASS_DATA_LABELS[k] ? (OPERATING_CLASS_DATA_LABELS[k] + ' (' + k + ')') : k;
    }).join('\n• ');
}

async function wipeLegacyOperatingData(db, className) {
    const snap = await db.ref(className).once('value');
    const root = snap.val() || {};
    const keys = Object.keys(root).filter(function (k) { return !isCohortStorageKey(k); });
    if (!keys.length) return { removedKeys: [], empty: true };

    const updates = {};
    keys.forEach(function (k) { updates[className + '/' + k] = null; });
    await db.ref().update(updates);
    return { removedKeys: keys, empty: false };
}

function clearLegacyClassLocalCaches(className) {
    [
        'defaultViewMode',
        'cache_attendance',
        'cache_teacher',
        'studentCache_revision',
        'studentCache_bundle',
        'studentView_selectedStudent',
        'selectedVersion'
    ].forEach(function (prefix) {
        try { localStorage.removeItem(prefix + '_' + className); } catch (e) { /* ignore */ }
    });
    try {
        if (localStorage.getItem('selectedClass') === className) {
            localStorage.removeItem('selectedCohort');
        }
    } catch (e) { /* ignore */ }
}

async function resetOperatingClassData(className) {
    if (!className || !firebaseConfigs[className]) {
        await appAlert('❌ 지원하지 않는 학급입니다.');
        return;
    }

    if (!await appConfirm(
        '⚠️ [' + className + '] 현재 운영 반 데이터를 전부 삭제합니다.\n\n' +
        '다음 시간표 연동 데이터가 한 번에 지워집니다:\n' +
        formatOperatingDataScopeText() + '\n\n' +
        '✅ 보존됨: 수료 반 보관함 · 훈련기준(NCS) · 공통 이미지(도장·서명)\n' +
        '❌ 복구 불가 — 반드시 「수료 반 보관하기」를 먼저 하셨는지 확인하세요.\n\n' +
        '계속하시겠습니까?'
    )) return;

    if (!await appConfirm(
        '한 번 더 확인합니다.\n\n' +
        '• 보관된 수료 반(c_*) 데이터는 삭제되지 않습니다.\n' +
        '• 현재 운영 반만 공백 상태가 됩니다.\n' +
        '• 이 작업은 되돌릴 수 없습니다.\n\n' +
        '정말 초기화하시겠습니까?'
    )) return;

    const typeConfirm = await appPrompt(
        '삭제를 확인하려면 아래와 같이 정확히 입력하세요:\n' + className + ' 초기화'
    );
    if (typeConfirm !== className + ' 초기화') {
        await appAlert('❌ 확인 문구가 일치하지 않아 취소되었습니다.');
        return;
    }

    const inputPw = await appPrompt('관리자 비밀번호를 입력해 주세요.');
    if (inputPw !== localStorage.getItem('adminPw')) {
        await appAlert('❌ 비밀번호 불일치.');
        return;
    }

    let tempApp = null;
    try {
        tempApp = await getClassDbApp(className, 'class_reset');
        const result = await wipeLegacyOperatingData(tempApp.database(), className);
        await tempApp.delete();
        tempApp = null;

        clearLegacyClassLocalCaches(className);
        setCohortPreference(className, 'legacy');

        const btn = document.querySelector('.btn-main-nav[data-class="' + className + '"]');
        if (btn) btn.innerText = className;

        if (result.empty) {
            await appAlert('✅ [' + className + '] 현재 운영 반에 삭제할 데이터가 없었습니다.');
        } else {
            await appAlert(
                '✅ [' + className + '] 현재 운영 반 데이터가 초기화되었습니다.\n\n' +
                '삭제된 항목 (' + result.removedKeys.length + '개):\n• ' +
                formatRemovedKeysSummary(result.removedKeys) + '\n\n' +
                '메인에서 새 시간표·RD를 업로드한 뒤 사용하세요.'
            );
        }

        updateClassCohortStrips();
        if (pendingClassName === className) {
            await renderCohortModalList(className);
        }
    } catch (e) {
        if (tempApp) {
            try { await tempApp.delete(); } catch (delErr) { /* ignore */ }
        }
        await appAlert('❌ 초기화 오류: ' + e.message);
    }
}

async function copyLegacyDataToCohort(db, className, cohortId) {
    const snap = await db.ref(className).once('value');
    const root = snap.val() || {};
    const payload = {};
    Object.keys(root).forEach(key => {
        if (isCohortStorageKey(key)) return;
        payload[key] = root[key];
    });
    const copiedKeys = Object.keys(payload);
    if (!copiedKeys.length) {
        return { copiedKeys: 0, empty: true, keys: [], evalKeys: [], makeupKeys: [] };
    }
    // 원자적 저장 — 기수별 경로에 운영 반 데이터 전체를 한 번에 기록 (다른 기수·운영 반과 분리)
    await db.ref(`${className}/${cohortId}`).set(payload);

    const evalKeys = ['evalPlans', 'evalPhotos', 'evalScores', 'evalCompletions'].filter(k => copiedKeys.includes(k));
    const makeupKeys = ['makeupDetails', 'makeupSigns', 'makeupReportImages', 'makeupWaivers'].filter(k => copiedKeys.includes(k));
    return { copiedKeys: copiedKeys.length, empty: false, keys: copiedKeys, evalKeys, makeupKeys };
}

async function rollbackCohortCreate(db, className, cohortId) {
    if (!cohortId || !db) return;
    await db.ref(`${className}/${cohortId}`).remove();
    await db.ref(`${className}/archiveMeta/${cohortId}`).remove();
}

async function openCohortPicker(className) {
    pendingClassName = className;
    document.getElementById('cohortModalTitle').innerText = `${className} — 수료 반 선택`;
    document.getElementById('cohortOverlay').classList.add('open');
    await renderCohortModalList(className);
}

async function getClassDbApp(className, appPrefix) {
    const config = firebaseConfigs[className];
    if (!config) return null;
    const savedPw = localStorage.getItem('adminPw');
    const tempApp = firebase.initializeApp(config, appPrefix + '_' + className + '_' + Date.now());
    if (savedPw) {
        await tempApp.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw);
    }
    return tempApp;
}

async function renderCohortModalList(className) {
    const listArea = document.getElementById('cohortListArea');
    if (!listArea) return;
    listArea.innerHTML = '<p style="font-size:11px;color:#999;text-align:center;">불러오는 중...</p>';

    if (!firebaseConfigs[className]) {
        listArea.innerHTML = '';
        await updateCohortModalHighlight();
        return;
    }

    try {
        const tempApp = await getClassDbApp(className, 'cohort_list');
        const metaSnap = await tempApp.database().ref(`${className}/archiveMeta`).once('value');
        const meta = metaSnap.val() || {};
        syncCohortMetaFromArchive(className, meta);
        const selectedPref = getCohortPreference(className);

        if (!Object.keys(meta).length) {
            listArea.innerHTML = buildCohortCheckListHtml(className, meta, selectedPref)
                + '<p style="font-size:11px;color:#7f8c8d;margin:8px 0 0;">아직 보관된 수료 반이 없습니다.<br>수료 후 「수료 반 보관하기」를 이용하세요.</p>';
        } else {
            listArea.innerHTML = buildCohortCheckListHtml(className, meta, selectedPref);
        }

        await tempApp.delete();
        updateClassCohortStrips();
        await updateCohortModalHighlight();
    } catch (e) {
        listArea.innerHTML = `<p style="font-size:11px;color:#c0392b;">목록 로드 실패: ${e.message}</p>`;
        await updateCohortModalHighlight();
    }
}

async function createNewCohort(className) {
    const label = await appPrompt(
        '보관할 수료 반 이름을 입력하세요.\n(예: 2025년 1기 수료, 24학년도 2기)',
        ''
    );
    if (!label || !String(label).trim()) return;

    if (!await appConfirm(
        `「${String(label).trim()}」(으)로 현재 운영 반 데이터를 복사·보관합니다.\n\n` +
        '• 출석·시간표·평가·학생 이력서·취업 상태 등 현재 데이터가 수료 보관함에 저장됩니다.\n' +
        '• 현재 운영 반 데이터는 그대로 유지됩니다.\n\n' +
        '계속하시겠습니까?'
    )) return;

    const cohortId = 'c_' + Date.now();
    const trimmed = String(label).trim();
    let tempApp = null;

    try {
        tempApp = await getClassDbApp(className, 'cohort_create');
        const db = tempApp.database();

        const copyResult = await copyLegacyDataToCohort(db, className, cohortId);

        await db.ref(`${className}/archiveMeta/${cohortId}`).set({
            label: trimmed,
            createdAt: Date.now(),
            archivedFrom: 'legacy',
            type: 'graduated',
            copiedKeys: copyResult.keys || []
        });

        if (!copyResult.empty) {
            await db.ref(`${className}/${cohortId}/masterData`).update({
                cohortId: cohortId,
                label: trimmed,
                archivedAt: Date.now(),
                archivedFrom: 'legacy'
            });
        } else {
            await db.ref(`${className}/${cohortId}/masterData`).set({
                cohortId: cohortId,
                label: trimmed,
                archivedAt: Date.now(),
                archivedFrom: 'legacy',
                createdAt: Date.now()
            });
        }

        await tempApp.delete();
        tempApp = null;

        rememberCohortLabel(className, cohortId, trimmed);
        setCohortPreference(className, cohortId);
        updateClassCohortStrips();

        let copyMsg = copyResult.empty
            ? '\n(현재 운영 반에 복사할 데이터가 없어 이름만 등록되었습니다.)'
            : `\n(${copyResult.copiedKeys}개 항목이 보관되었습니다.)`;
        if (copyResult.evalKeys?.length) {
            copyMsg += `\n• 평가지 데이터: ${copyResult.evalKeys.join(', ')}`;
        }
        if (copyResult.makeupKeys?.length) {
            copyMsg += `\n• 보강수업 데이터: ${copyResult.makeupKeys.join(', ')}`;
        }
        await appAlert(`✅ 수료 반 「${trimmed}」 보관이 완료되었습니다.${copyMsg}`);
        if (pendingClassName === className) {
            await renderCohortModalList(className);
        }
    } catch (e) {
        if (tempApp) {
            try {
                await rollbackCohortCreate(tempApp.database(), className, cohortId);
            } catch (rbErr) {
                console.warn('[cohort_create] 롤백 실패', rbErr);
            }
            try { await tempApp.delete(); } catch (delErr) { /* ignore */ }
        }
        await appAlert('❌ 수료 반 보관 실패: ' + e.message + '\n\n(오류 시 부분 저장분은 자동으로 되돌렸습니다.)');
    }
}

async function deleteCohortData(className, cohortId, labelHint) {
    if (!cohortId || cohortId.indexOf('c_') !== 0) return;
    const displayName = labelHint || getCohortDisplayLabel(className, cohortId);
    if (!await appConfirm(
        `⚠️ 보관된 수료 반 「${displayName}」만 삭제합니다.\n` +
        `현재 운영 반 데이터는 절대 삭제되지 않습니다.\n\n계속하시겠습니까?`
    )) return;
    const inputPw = await appPrompt('관리자 비밀번호를 입력해 주세요.');
    if (inputPw !== localStorage.getItem('adminPw')) return await appAlert('❌ 비밀번호 불일치.');

    try {
        const tempApp = await getClassDbApp(className, 'cohort_del');
        const db = tempApp.database();
        await db.ref(`${className}/${cohortId}`).remove();
        await db.ref(`${className}/archiveMeta/${cohortId}`).remove();
        await tempApp.delete();
        forgetCohortLabel(className, cohortId);
        const pref = getCohortPreference(className);
        if (pref === cohortId) setCohortPreference(className, 'legacy');
        await appAlert(`✅ 「${displayName}」 보관 데이터가 삭제되었습니다.`);
        updateClassCohortStrips();
        if (pendingClassName === className) {
            await renderCohortModalList(className);
        }
    } catch (e) {
        await appAlert('❌ 삭제 오류: ' + e.message);
    }
}

function goToMain(className, cohortId) {
    const config = firebaseConfigs[className];
    if(config) {
        localStorage.setItem('selectedClass', className);
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        localStorage.setItem('masterConfig', JSON.stringify(masterConfig));

        const isArchived = cohortId && cohortId !== 'legacy';
        if (isArchived) {
            localStorage.setItem('selectedCohort', cohortId);
        } else {
            localStorage.removeItem('selectedCohort');
        }
        setCohortPreference(className, isArchived ? cohortId : 'legacy');

        let qs = 'class=' + encodeURIComponent(className);
        if (isArchived) {
            qs += '&cohort=' + encodeURIComponent(cohortId);
        }

        const isMobileWidth = window.matchMedia("(max-width: 768px)").matches;
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobileWidth || isMobileDevice) {
            window.location.href = `모바일매뉴.html?${qs}`;
        } else {
            window.location.href = `index1.html?${qs}`;
        }
    }
}

// 🛡️ 운영 반 초기화 — 수료 보관함(archiveMeta, c_*)은 절대 삭제하지 않음
async function resetClassData(className) {
    await resetOperatingClassData(className);
}

function toggleResetMode() {
    document.querySelectorAll('.reset-tool').forEach(btn => { 
        btn.style.display = (btn.style.display === 'none' || btn.style.display === '') ? 'block' : 'none'; 
    });
}

let secretClickCount = 0; let lastClickTime = 0;
const footerElement = document.getElementById('system-footer');
if (footerElement) {
    footerElement.addEventListener('click', async function() {
        const ct = new Date().getTime();
        if (ct - lastClickTime > 1500) secretClickCount = 0;
        secretClickCount++; lastClickTime = ct;
        if (secretClickCount === 7) {
            secretClickCount = 0;
            if (await appPrompt("관리자 시크릿 코드") === "0936") { await appAlert("🔓 시크릿 모드 활성화"); toggleResetMode(); } 
            else await appAlert("❌ 권한 없음");
        }
    });
}

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 및 동적 이벤트 위임

// 1. 단일 고정 버튼 연결
document.getElementById('btnStandardsList').addEventListener('click', function() { location.href = '훈련기준.html'; });
document.getElementById('btnDataEtc').addEventListener('click', function() { location.href = '데이터자료.html'; });
document.getElementById('btnAddVersion').addEventListener('click', addVersionRow);
document.getElementById('globalFileInput').addEventListener('change', function() { handleFileUpload(this); });

// 2. 반 버튼: 왼쪽(80%) 바로 진입 / 오른쪽(20%) 기수 창만
document.querySelectorAll('.btn-main-nav').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const className = this.getAttribute('data-class');
        goToMain(className, 'legacy');
    });
});
document.querySelectorAll('.class-btn-cohort').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openCohortPicker(this.getAttribute('data-class'));
    });
});
document.getElementById('btnCohortNew')?.addEventListener('click', () => {
    if (pendingClassName) createNewCohort(pendingClassName);
});
document.getElementById('btnCohortResetOperating')?.addEventListener('click', () => {
    if (pendingClassName) resetOperatingClassData(pendingClassName);
});
document.getElementById('btnCohortEnter')?.addEventListener('click', enterSelectedCohort);
document.getElementById('btnCohortCancel')?.addEventListener('click', closeCohortPicker);
document.getElementById('cohortOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) closeCohortPicker();
});
document.getElementById('cohortListArea')?.addEventListener('click', function(e) {
    const delBtn = e.target.closest('.cohort-del-btn');
    if (delBtn && pendingClassName) {
        e.preventDefault();
        e.stopPropagation();
        deleteCohortData(
            pendingClassName,
            delBtn.getAttribute('data-cohort'),
            delBtn.getAttribute('data-label')
        );
        return;
    }

    const row = e.target.closest('.cohort-check-row');
    if (!row || !pendingClassName) return;

    const input = row.querySelector('.cohort-check-input');
    if (!input) return;

    if (e.target === input) return;

    applyCohortCheckboxSelection(
        pendingClassName,
        input.value,
        input.getAttribute('data-label') || input.value
    );
});
document.getElementById('cohortListArea')?.addEventListener('change', function(e) {
    const input = e.target.closest('.cohort-check-input');
    if (!input || !pendingClassName) return;

    document.querySelectorAll('#cohortListArea .cohort-check-input').forEach(cb => {
        if (cb !== input) cb.checked = false;
    });
    input.checked = true;

    applyCohortCheckboxSelection(
        pendingClassName,
        input.value,
        input.getAttribute('data-label') || input.value
    );
});
document.getElementById('cohortListArea')?.addEventListener('dblclick', function(e) {
    if (e.target.closest('.cohort-del-btn')) return;
    const row = e.target.closest('.cohort-check-row');
    if (!row || !pendingClassName) return;
    const input = row.querySelector('.cohort-check-input');
    if (!input) return;
    applyCohortCheckboxSelection(
        pendingClassName,
        input.value,
        input.getAttribute('data-label') || input.value
    );
    enterSelectedCohort();
});

updateClassCohortStrips();
document.querySelectorAll('.reset-tool').forEach(btn => {
    btn.addEventListener('click', function() { resetClassData(this.getAttribute('data-class')); });
});

// 3. 📍 동적 생성 HTML 제어 (이벤트 위임 기술)
// 버전 리스트가 동적으로 생기므로, 부모인 versionListArea가 클릭을 감지하여 자식에게 명령을 하달함
document.getElementById('versionListArea').addEventListener('click', function(e) {
    const target = e.target;
    // 삭제 버튼 클릭 시
    if (target.classList.contains('dynamic-del-btn')) {
        deleteVersion(target.getAttribute('data-vid'));
    }
    // 각 파트(전기, 엔진 등) 업로드 뱃지 클릭 시
    if (target.classList.contains('dynamic-upload-btn') && !target.classList.contains('part-legacy')) {
        triggerUpload(target.getAttribute('data-vid'), target.getAttribute('data-part'));
    }
    if (target.classList.contains('dynamic-required-btn')) {
        openRequiredUnitsModal(target.getAttribute('data-vid'));
    }
});

document.getElementById('requiredUnitsList')?.addEventListener('click', function(e) {
    const btn = e.target.closest('.required-unit-item');
    if (!btn) return;
    toggleRequiredUnitSelection(btn.getAttribute('data-part'), btn.getAttribute('data-code'));
});

document.getElementById('btnSaveRequiredUnits')?.addEventListener('click', saveRequiredUnitsModal);
document.getElementById('btnCloseRequiredUnits')?.addEventListener('click', closeRequiredUnitsModal);
document.getElementById('requiredUnitsOverlay')?.addEventListener('click', function(e) {
    if (e.target === this) closeRequiredUnitsModal();
});

// 이름 변경(input) 감지
document.getElementById('versionListArea').addEventListener('change', function(e) {
    const target = e.target;
    if (target.classList.contains('dynamic-name-input')) {
        updateVersionName(target.getAttribute('data-vid'), target.value);
    }
});