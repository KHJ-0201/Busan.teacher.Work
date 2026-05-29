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

window.onload = function() {
    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) { alert("보안 인증이 필요합니다."); location.href = '../index.html'; return; }

    firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
        .then(() => {
            console.log("✅ 관리자 인증 성공");
            fetchDatabases();
        })
        .catch(error => {
            alert("인증 정보가 만료되었습니다."); location.href = '../index.html';
        });
};

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
                <button class="btn-del-version" onclick="deleteVersion('${vId}')">❌</button>
                <span class="version-label">${index + 1}.과평 버전:</span>
                <input type="text" class="version-input" value="${vData.name}" placeholder="버전명 입력" onchange="updateVersionName('${vId}', this.value)">
                <div class="part-badge ${cElec}" onclick="triggerUpload('${vId}', 'electronics')">⚡전기</div>
                <div class="part-badge ${cEng}" onclick="triggerUpload('${vId}', 'engine')">🔧엔진</div>
                <div class="part-badge ${cChas}" onclick="triggerUpload('${vId}', 'chassis')">⚙️섀시</div>
                <div class="part-badge ${cEv}" onclick="triggerUpload('${vId}', 'ev')">🔋전기차</div>
            </div>
        `;
    });
}

function addVersionRow() {
    const vId = 'v_' + Date.now();
    database.ref(`ncsVersions/${vId}`).set({ name: "신규 과평 버전", timestamp: Date.now(), data: {} });
}

// 📍 [정밀 수리 1] 삭제 락(Lock) 기능 강화
function deleteVersion(vId) {
    const userInput = prompt("⚠️ 해당 버전과 연결된 훈련기준 데이터를 모두 삭제하시겠습니까?\n삭제를 진행하시려면 창에 [ 삭제합니다 ] 라고 정확히 입력해 주세요.");
    
    if (userInput === "삭제합니다") {
        database.ref(`ncsVersions/${vId}`).remove();
        alert("✅ 해당 버전이 안전하게 삭제되었습니다.");
    } else if (userInput !== null) {
        alert("❌ 입력하신 문구가 일치하지 않아 삭제가 취소되었습니다.");
    }
}

function updateVersionName(vId, newName) {
    if(!newName.trim()) return alert("버전 이름을 입력해 주세요.");
    database.ref(`ncsVersions/${vId}/name`).set(newName);
}

// 📍 [정밀 수리 2] 중복 업로드 경고창 장착
function triggerUpload(vId, partName) {
    const vData = newVersionsCache[vId];
    
    // 이미 해당 파트에 데이터가 등록되어 있는지 검사
    if (vData && vData.data && vData.data[partName]) {
        const existingFileName = vData.data[partName].fileName || "알 수 없는 파일";
        if (!confirm(`[ ${existingFileName} ] 이 이미 등록이 되어 있습니다. 새로 변경하시겠습니까?`)) {
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

function saveToFirebase() {
    if (!tempData || !currentTargetVersionId || !currentTargetPart) return alert("저장할 데이터가 없습니다.");
    
    const saveSection = document.getElementById('save_section');
    const saveData = { fileName: uploadedFileName, data: tempData };

    database.ref(`ncsVersions/${currentTargetVersionId}/data/${currentTargetPart}`).set(saveData)
        .then(() => {
            alert("✅ 성공적으로 저장되었습니다!");
            saveSection.style.display = "none"; 
            tempData = null; 
        })
        .catch(err => alert("❌ 저장 실패: " + err.message));
}

function goToMain(className) {
    const config = firebaseConfigs[className];
    if(config) {
        localStorage.setItem('selectedClass', className);
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        localStorage.setItem('masterConfig', JSON.stringify(masterConfig));
        window.location.href = `index1.html?class=${encodeURIComponent(className)}`;
    }
}

async function resetClassData(className) {
    if (!confirm(`❗ [${className}] 공장 초기화를 진행하시겠습니까?`)) return;
    const inputPw = prompt("관리자 비밀번호를 입력해 주세요.");
    if (inputPw !== localStorage.getItem('adminPw')) return alert("❌ 비밀번호 불일치.");

    try {
        const config = firebaseConfigs[className];
        const tempApp = firebase.initializeApp(config, "reset_app_" + Date.now());
        await tempApp.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', inputPw);
        await tempApp.database().ref('/').remove();
        await tempApp.delete();
        alert(`✅ [${className}] 초기화 완료.`);
        location.reload();
    } catch (e) { alert("❌ 오류: " + e.message); }
}

function toggleResetMode() {
    document.querySelectorAll('.reset-tool').forEach(btn => { 
        btn.style.display = (btn.style.display === 'none' || btn.style.display === '') ? 'block' : 'none'; 
    });
}

let secretClickCount = 0; let lastClickTime = 0;
const footerElement = document.getElementById('system-footer');
if (footerElement) {
    footerElement.addEventListener('click', function() {
        const ct = new Date().getTime();
        if (ct - lastClickTime > 1500) secretClickCount = 0;
        secretClickCount++; lastClickTime = ct;
        if (secretClickCount === 7) {
            secretClickCount = 0;
            if (prompt("관리자 시크릿 코드") === "0936") { alert("🔓 시크릿 모드 활성화"); toggleResetMode(); } 
            else alert("❌ 권한 없음");
        }
    });
}