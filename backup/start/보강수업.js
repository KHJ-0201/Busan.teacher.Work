
    const storedConfig = localStorage.getItem('firebaseConfig');
    const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : null;

    const urlParams = new URLSearchParams(window.location.search);
    let currentClass = urlParams.get('class') || "테스트"; // ✅ 순서 변경: 먼저 선언
    
    // 2. [정밀 수리] 반 이름표 보정 (701 -> 701반)
    let dbClassKey = currentClass; 
    if (dbClassKey !== "테스트" && !dbClassKey.includes("반")) {
        dbClassKey = dbClassKey + "반"; 
    }

    // 3. 엔진 가동 안전장치
    if (!firebaseConfig) {
        alert("학급 설정 정보가 없습니다. 다시 로그인해 주세요.");
        location.href = '../index.html';
    }

    // 4. 메인 엔진 및 마스터 엔진 배선
    const masterConfig = {
        apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
        databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "busan-teacher-workall"
    };

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    const masterApp = !firebase.apps.find(app => app.name === "masterApp") 
        ? firebase.initializeApp(masterConfig, "masterApp") 
        : firebase.app("masterApp");
    const masterDatabase = masterApp.database();
    const auth = firebase.auth();

    // 나머지 전역 변수 설정
    document.getElementById('dispClass').innerText = currentClass;
    document.getElementById('backMain').href = "index1.html?class=" + currentClass;

    let fullList = [];
    let subjectMaxDates = {};
    let subjectMinDates = {}; 
    let selectedItem = null;
    let isAdmin = false;
    let imageCache = {
        common: null,
        teacherSeals: null,
        signs: null,
        reportPhotos: {}
    }; 
    // 📍 [추가/수정 배선] 출결 데이터 캐시 및 전체/과목별 진행일자 보관소
    let globalAttendanceData = {};
    let subjectDaysMap = {};
    let globalValidDates = []; // 전체 훈련일자 보관 통

auth.onAuthStateChanged((user) => {
    // 브라우저 저장소에서 관리자 비밀번호를 꺼내옵니다. (기존 adminPw 변수 대체)
    const savedPw = localStorage.getItem('adminPw');
    
    if (user) {
        // ✅ 1번 케이스: 이미 로그인 된 상태 (세션 유지)
        isAdmin = true;
        console.log(`🔒 보안 인증 확인됨: ${user.projectId || 'busan-teacher-workall'}`);
        
        // 보고서 모드 버튼이 있다면 화면에 표시 (정비소 특수 공구함 개봉)
        const reportBtn = document.getElementById('btnReportMode');
        if(reportBtn) reportBtn.style.display = 'inline-block';
        
        // 🚀 최종 시동
        initialize(); 
    } else if (savedPw) {
        // 🔑 2번 케이스: 로그인은 안 되어 있지만 저장된 비밀번호가 있는 경우 (자동 로그인 시도)
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .then((result) => { 
                isAdmin = true;
                console.log("🔒 보안 인증 실시간 복구 완료");
                
                const reportBtn = document.getElementById('btnReportMode');
                if(reportBtn) reportBtn.style.display = 'inline-block';
                
                // 🚀 최종 시동
                initialize(); 
            })
            .catch((err) => {
                console.error("❌ 자동 인증 실패:", err);
                alert("인증 정보가 만료되었습니다. 다시 로그인해주세요.");
                location.href = '../index.html'; // 인증 실패 시 퇴거
            });
    } else {
        // ⚠️ 3번 케이스: 인증 정보가 전혀 없는 경우 (무단 접근)
        console.log("⚠️ 무단 접근 감지: 인증 데이터 없음");
        alert("보안 인증이 필요한 페이지입니다.");
        location.href = '../index.html'; // 즉시 퇴거
    }
});

function goToPage(mode) {
    let target = '능력단위시간표.html?class=' + currentClass;
    if(mode === 'calendar') target += '&mode=calendar';
    if(mode === 'weekly') target += '&mode=weekly';
    location.href = target;
}

async function initialize() {
    // 📍 [연비 원칙] 데이터를 한 번만 불러와 저장소에 보관
    const cacheKey = `cache_${currentClass}_attendance`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        globalAttendanceData = JSON.parse(cachedData);
        console.log("⚡ [연비모드] 로컬 출결 데이터를 즉시 불러왔습니다.");
    }

    const [timetableSnap, manualSnap, historySnap, attSnap] = await Promise.all([
        database.ref(`${currentClass}/fullTimetable`).once('value'),
        database.ref(`${currentClass}/manualAttendance`).once('value'),
        database.ref(`${currentClass}/makeupDetails`).once('value'),
        database.ref(`${currentClass}/dailyAttendance`).once('value')
    ]);

    if (attSnap.exists()) {
        globalAttendanceData = attSnap.val();
        localStorage.setItem(cacheKey, JSON.stringify(globalAttendanceData));
    }

    const timetable = timetableSnap.val() || [];
    
    subjectMaxDates = {};
    subjectMinDates = {}; 
    subjectDaysMap = {}; 
    let tempAllDates = new Set(); // 📍 전체 훈련일자 수집용 통

    const ultraClean = (str) => {
        return String(str || "")
            .replace(/^[\[\]\d\w\s\-_.]+?(?=[가-힣])/, "") 
            .trim();
    };

    // 1. 시간표 스캔
    timetable.forEach(r => {
        const rawDate = String(r.날짜 || "").replace(/\./g, '-').trim();
        if (!rawDate) return;
        const dateObj = new Date(rawDate);
        if (isNaN(dateObj.getTime())) return;
        const formattedDate = dateObj.toISOString().split('T')[0]; 
        
        // 📍 [정밀 스캔] 전체 훈련일 무조건 수집
        tempAllDates.add(formattedDate);
        
        let sub = ultraClean(r.교과목);
        let unit = ultraClean(r.능력단위);
        
        if(sub) {
            if(!subjectMinDates[sub] || formattedDate < subjectMinDates[sub]) subjectMinDates[sub] = formattedDate;
            if(!subjectMaxDates[sub] || formattedDate > subjectMaxDates[sub]) subjectMaxDates[sub] = formattedDate;
            
            if(!subjectDaysMap[sub]) subjectDaysMap[sub] = new Set();
            subjectDaysMap[sub].add(formattedDate);
        }
        if(unit) {
            if(!subjectMinDates[unit] || formattedDate < subjectMinDates[unit]) subjectMinDates[unit] = formattedDate;
            if(!subjectMaxDates[unit] || formattedDate > subjectMaxDates[unit]) subjectMaxDates[unit] = formattedDate;
            
            if(!subjectDaysMap[unit]) subjectDaysMap[unit] = new Set();
            subjectDaysMap[unit].add(formattedDate);
        }
    });

    // 📍 수집한 전체 훈련일자를 배열로 변환 후 정렬
    globalValidDates = Array.from(tempAllDates).sort();

    const manualData = manualSnap.val() || {};
    const historyData = historySnap.val() || {};

    fullList = [];
    for (const name in manualData) {
        for (const key in manualData[name]) {
            if (key.startsWith('makeup_')) {
                const rawSubName = key.replace('makeup_', '').replace(/_/g, ' ');
                const originalSub = ultraClean(rawSubName);
                
                const totalMin = manualData[name][key];
                if (totalMin > 0) {
                    const escapedSub = key.replace('makeup_', '');
                    const studentHistory = (historyData[name] && historyData[name][escapedSub]) ? historyData[name][escapedSub] : {};
                    
                    fullList.push({
                        studentName: name, 
                        subjectName: originalSub, 
                        escapedSub: escapedSub,
                        hrdDate: subjectMaxDates[originalSub] || "미정", 
                        totalMin: totalMin, 
                        history: studentHistory
                    });
                }
            }
        }
    }
    
    const startSort = urlParams.get('sort') || 'subjectName';
renderMainTable(startSort);

    const openIdx = urlParams.get('openIdx');
    if (openIdx !== null) {
        setTimeout(() => {
            const idx = parseInt(openIdx);
            toggleStudentDetail(idx); 
            const row = document.getElementById(`mainRow_${idx}`);
            if(row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300); 
    }
}

// 📍 [정비 1] 메인 테이블 렌더링 (상세보기 제거 및 과목명 확장)
// 📍 [정비 1] 메인 테이블 렌더링 (상세보기 제거 및 과목명 확장)
function renderMainTable(sortKey) {
    const tbody = document.getElementById('makeupBody');
    const thead = document.querySelector('.attendance-table thead');

    // [1] 비상 버튼(초기화/취소) 가시성 제어
    const resetBtn = document.getElementById('btnResetMedia');
    const cancelBtn = document.getElementById('btnCancelSelect');
    
    if (sortKey === 'historyTime') {
        if(resetBtn) resetBtn.style.display = 'inline-block';
    } else {
        if(resetBtn) resetBtn.style.display = 'none';
        if(cancelBtn) cancelBtn.style.display = 'none';
        isSelectMode = false;
    }
    
    // [2] 테이블 엔진 초기화 및 클래스 세팅
    const table = document.querySelector('.attendance-table');
    table.classList.remove('mode-default', 'mode-history', 'mode-report');
    
    document.querySelectorAll('.sort-btns .btn-detail').forEach(btn => btn.classList.remove('active'));
    
    const btnMap = { 
        'subjectName': 0, 'studentName': 1, 'hrdDate': 2, 'historyTime': 3, 'reportMode': 4 
    };
    
    const targetBtn = document.querySelectorAll('.sort-btns .btn-detail')[btnMap[sortKey]];
    if (targetBtn) targetBtn.classList.add('active');

    let html = "";

    // ------------------------------------------------------------
    // [3] 모드별 헤더(thead) 및 본문(tbody) 조립 공정
    // ------------------------------------------------------------

    if (sortKey === 'reportMode') {
        table.classList.add('mode-report');
        const colWidthsReport = { num: "5%", date: "12%", time: "10%", subject: "33%", students: "30%", report: "10%" };

        const indexHeader = isSelectMode 
            ? `<th width="${colWidthsReport.num}"><input type="checkbox" onclick="toggleAllRows(this)"></th>` 
            : `<th width="${colWidthsReport.num}">순번</th>`;

        // 📍 보고서 모드용 전용 계기판 장착
        thead.innerHTML = `
            <tr>
                ${indexHeader}
                <th width="${colWidthsReport.date}">보강 날짜</th>
                <th width="${colWidthsReport.time}">보강 시간</th>
                <th width="${colWidthsReport.subject}">과목명</th>
                <th width="${colWidthsReport.students}">참여 학생 (인원)</th>
                <th width="${colWidthsReport.report}">보고서</th>
            </tr>`;

        // (기존 reportMode 데이터 처리 로직 동일...)
        let grouped = {}; 
        fullList.forEach(item => {
            Object.values(item.history || {}).forEach(h => {
                const groupKey = `${item.subjectName}_${h.date}_${h.time}`;
                if (!grouped[groupKey]) {
                    grouped[groupKey] = { subject: item.subjectName, date: h.date, time: h.time, students: [] };
                }
                if (!grouped[groupKey].students.includes(item.studentName)) grouped[groupKey].students.push(item.studentName);
            });
        });
        let sortedReport = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        if (sortedReport.length === 0) {
            html = '<tr><td colspan="6" style="padding:50px;">데이터가 없습니다.</td></tr>';
        } else {
            sortedReport.forEach((r, idx) => {
                const dateStr = `${r.date.substring(0, 4)}-${r.date.substring(4, 6)}-${r.date.substring(6, 8)} (${getDayOfWeek(r.date)})`;
                const totalMin = calculateMinutes(r.time);
                const hourStr = (totalMin / 60).toFixed(0) + "H";
                const reportKey = `${r.subject}_${r.date}_${r.time.replace(/:/g, '')}`;
                html += `<tr>
                    ${isSelectMode ? `<td><input type="checkbox" class="reset-checkbox" data-report-key="${reportKey}" data-sign-keys='${JSON.stringify(r.students.map(s => `${s}_${r.subject.replace(/ /g, '_')}_${r.date}_${r.time.replace(/:/g, '')}` ))}' style="transform:scale(1.3);"></td>` : `<td>${idx + 1}</td>`}
                    <td><span class="date-badge">${dateStr}</span></td>
                    <td> ${r.time}<b>(${hourStr})</b></td>
                    <td style="text-align:left;"><strong>${r.subject}</strong></td>
                    <td style="text-align:left; font-size:12px;">${r.students.join(', ')} <span style="color:#e67e22; font-weight:bold;">(${r.students.length}명)</span></td>
                    <td><button class="btn-detail" style="background:#8e44ad; width:100%; height:35px;" onclick="openReportView('${reportKey}')">📄보기</button></td>
                </tr>`;
            });
        }

    } else if (sortKey === 'historyTime') {
        table.classList.add('mode-history');
        const colWidths = { num: "4%", date: "14%", time: "10%", subject: "28%", name: "10%", min: "8%", sign: "10%", photo: "16%" };

        const indexHeaderHistory = isSelectMode 
            ? `<th width="${colWidths.num}"><input type="checkbox" onclick="toggleAllRows(this)"></th>` 
            : `<th width="${colWidths.num}">순번</th>`;

        // 📍 싸인등록 모드용 8구 계기판 장착
        thead.innerHTML = `
            <tr>
                ${indexHeaderHistory}
                <th width="${colWidths.date}">보강 날짜</th>
                <th width="${colWidths.time}">보강 시간</th>
                <th width="${colWidths.subject}">과목명</th>
                <th width="${colWidths.name}">성명</th>
                <th width="${colWidths.min}">보강(분)</th>
                <th width="${colWidths.sign}">싸인등록</th>
                <th width="${colWidths.photo}">사진등록</th>
            </tr>`;
        
        // (기존 historyTime 데이터 처리 로직 동일...)
        let flatHistory = [];
        fullList.forEach((item, originalIdx) => {
            Object.entries(item.history || {}).forEach(([histId, h]) => {
                flatHistory.push({ histId: histId, date: h.date, time: h.time, subjectName: item.subjectName, studentName: item.studentName, escapedSub: item.escapedSub, min: h.min, parentIdx: originalIdx });
            });
        });
        flatHistory.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.subjectName.localeCompare(b.subjectName));
        let displayNum = 0;
        flatHistory.forEach((h, idx) => {
            const signKey = `${h.studentName}_${h.escapedSub}_${h.histId}`;
            const reportKey = `${h.subjectName}_${h.date}_${h.time.replace(/:/g, '')}`; 
            let isSameGroup = false;
            if (idx > 0) {
                const prev = flatHistory[idx - 1];
                if (prev.date === h.date && prev.time === h.time && prev.subjectName === h.subjectName) isSameGroup = true;
            }
            let numTd = ""; let photoTd = "";
            if (!isSameGroup) {
                displayNum++;
                let rowSpanCount = 1;
                for (let i = idx + 1; i < flatHistory.length; i++) {
                    const next = flatHistory[i];
                    if (next.date === h.date && next.time === h.time && next.subjectName === h.subjectName) rowSpanCount++;
                    else break;
                }
                if (isSelectMode) {
                    let groupSignKeys = [];
                    for(let i = idx; i < idx + rowSpanCount; i++) {
                        const item = flatHistory[i];
                        if (item) groupSignKeys.push(`${item.studentName}_${item.escapedSub}_${item.histId}`);
                    }
                    numTd = `<td rowspan="${rowSpanCount}" style="background: #fff; vertical-align:middle;"><input type="checkbox" class="reset-checkbox" data-report-key="${reportKey}" data-sign-keys='${JSON.stringify(groupSignKeys)}' style="transform:scale(1.3); cursor:pointer;"></td>`;
                } else {
                    numTd = `<td rowspan="${rowSpanCount}" style="background: #fff; font-weight: bold; vertical-align:middle;">${displayNum}</td>`;
                }
                photoTd = `<td rowspan="${rowSpanCount}" style="background: #fff;"><div class="photo-btn-wrap" style="display:flex; gap:3px; justify-content:center;"><button id="btnImg1_${reportKey}" class="btn-detail" style="background:#27ae60; padding:4px 6px; font-size:10px;" onclick="triggerUpload('${reportKey}', 1)"><span class="pc-text">📷사진1</span><span class="mobile-text">📝1</span></button><button id="btnImg2_${reportKey}" class="btn-detail" style="background:#27ae60; padding:4px 6px; font-size:10px;" onclick="triggerUpload('${reportKey}', 2)"><span class="pc-text">📷사진2</span><span class="mobile-text">📝2</span></button></div><input type="file" id="file_${reportKey}_1" style="display:none" onchange="uploadPhoto('${reportKey}', 1, this)"><input type="file" id="file_${reportKey}_2" style="display:none" onchange="uploadPhoto('${reportKey}', 2, this)"></td>`;
            }
            html += `<tr id="mainRow_hist_${idx}">
                ${numTd}
                <td><span class="date-badge">${formatDateString(h.date)} (${getDayOfWeek(h.date)})</span></td>
                <td>${h.time}</td>
                <td style="text-align:left;">${h.subjectName}</td>
                <td><strong>${h.studentName}</strong></td>
                <td><span class="makeup-badge">${h.min}<span class="pc-text">분</span></span></td>
                <td><button id="btnSign_${signKey}" class="btn-detail" style="background:#27ae60; width: 100%;" onclick="triggerSignUpload('${signKey}', '${h.studentName}')"><span class="pc-text">싸인등록</span><span class="mobile-text">📝</span></button><input type="file" id="fileSign_${signKey}" style="display:none" onchange="uploadSignPhoto('${signKey}', this)"></td>
                ${photoTd} 
            </tr>`;
            checkSignStatus(signKey);
            if (!isSameGroup) checkPhotoStatus(reportKey);
        });

    } else {
        // 📍 [순정 보전 및 수리] 기본 모드 계기판(6구) 강제 장착
        table.classList.add('mode-default');
        
        // 🚀 [핵심 수리] 기본 모드 전용 thead.innerHTML 주입
        thead.innerHTML = `
            <tr>
                <th width="50">순번</th>
                <th>과목명</th>
                <th width="100">HRD 등록일</th>
                <th width="80">성명</th>
                <th width="120">보강(분)</th>
                <th width="100">일자등록</th>
            </tr>`;
        
        fullList.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
        
        fullList.forEach((item, idx) => {
            let currentSum = 0;
            Object.values(item.history || {}).forEach(h => currentSum += parseInt(h.min || 0));
            const isDone = currentSum >= item.totalMin;
            const btnColor = isDone ? "#565656" : "#3498db";
            const badgeStyle = isDone ? "background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9;" : "background: #fff3e0; color: #e67e22; border: 1px solid #ffcc80;";
            const btnText = isDone ? `<span class="pc-text">✅ 등록완료</span><span class="mobile-text">완료</span>` : `<span class="pc-text">일자등록</span><span class="mobile-text">등록</span>`;

            html += `
                <tr id="mainRow_${idx}">
                    <td>${idx + 1}</td>
                    <td style="text-align:left;"><strong>${item.subjectName}</strong></td>
                    <td><span class="date-badge">${item.hrdDate}</span></td>
                    <td>${item.studentName}</td>
                    <td>
                        <span class="makeup-badge" style="${badgeStyle} display: inline-block; line-height: 1.4; padding: 5px 10px;"> 
                            <span class="pc-text">${currentSum} / ${item.totalMin}분</span>
                            <span class="mobile-text">${currentSum} / ${item.totalMin}</span>
                        </span>
                    </td>
                    <td><button class="btn-detail" style="background:${btnColor}; width: 100%;" onclick="toggleStudentDetail(${idx})">${btnText}</button></td>
                </tr>
                <tr id="detailRow_${idx}" class="detail-row"><td colspan="6" id="detailArea_${idx}"></td></tr>`;
        });
    }
    tbody.innerHTML = html || '<tr><td colspan="7" style="padding:50px;">데이터가 없습니다.</td></tr>';
}

// 📍 [정비 3] 디지털 싸인 패드 엔진 (직접 서명 방식)
let signCanvas, signCtx, isDrawing = false;
let currentSignKey = "";

// 📍 [정비] 디지털 싸인 패드 엔진 (커진 사이즈 대응)
function triggerSignUpload(key, studentName) {
    currentSignKey = key;
    const modal = document.getElementById('signModal');
    
    const modalTitle = modal.querySelector('h3');
    if (modalTitle) {
        modalTitle.innerHTML = `<span style="color:#27ae60;">[${studentName}]</span> 훈련생 서명`;
    }
    
    modal.style.display = 'flex';
    
    signCanvas = document.getElementById('signCanvas');
    signCtx = signCanvas.getContext('2d');
    
    // 📍 캔버스 크기가 커졌으므로 전체 영역을 다시 흰색으로 도색
    signCtx.fillStyle = "#fff";
    signCtx.fillRect(0, 0, signCanvas.width, signCanvas.height);
    
    // 선 굵기도 패드 크기에 맞춰 살짝 더 묵직하게 조절 (3 -> 3.5)
    signCtx.strokeStyle = "#000";
    signCtx.lineWidth = 5;
    signCtx.lineCap = "round";

    if (!signCanvas.dataset.init) {
        setupSignEvents();
        signCanvas.dataset.init = "true";
    }
}

function setupSignEvents() {
    const getPos = (e) => {
        const rect = signCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let x, y;
        // 📍 [핵심 보정] 모바일 세로 모드에서 좌측 90도(-90deg) 강제 회전 감지
        const isRotated = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
        
        if (isRotated) {
            // 회전된 캔버스: 물리적 높이가 width, 너비가 height 역할을 교대함
            const scaleX = signCanvas.width / rect.height; 
            const scaleY = signCanvas.height / rect.width;
            
            // 📍 좌측 90도(-90deg) 전용 정밀 좌표 매핑
            x = (rect.bottom - clientY) * scaleX;
            y = (clientX - rect.left) * scaleY;
        } else {
            // 정상 상태 (PC 및 모바일 가로 모드)
            const scaleX = signCanvas.width / rect.width;
            const scaleY = signCanvas.height / rect.height;
            x = (clientX - rect.left) * scaleX;
            y = (clientY - rect.top) * scaleY;
        }
        return { x, y };
    };
    const start = (e) => { isDrawing = true; const p = getPos(e); signCtx.beginPath(); signCtx.moveTo(p.x, p.y); };
    const move = (e) => { if (!isDrawing) return; const p = getPos(e); signCtx.lineTo(p.x, p.y); signCtx.stroke(); e.preventDefault(); };
    const stop = () => { isDrawing = false; };
    signCanvas.addEventListener('mousedown', start);
    signCanvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    signCanvas.addEventListener('touchstart', start);
    signCanvas.addEventListener('touchmove', move, {passive: false});
    signCanvas.addEventListener('touchend', stop);
}

function clearSign() { signCtx.clearRect(0, 0, signCanvas.width, signCanvas.height); }
function closeSignModal() { document.getElementById('signModal').style.display = 'none'; }

// 📍 [데이터 경량화 튜닝] 서명 데이터 저장 함수
async function saveDigitalSign() {
    const base64Data = signCanvas.toDataURL('image/jpeg', 0.6);
    const btn = document.getElementById(`btnSign_${currentSignKey}`);
    
    try {
        if(btn) btn.innerHTML = `<span class="pc-text">저장 중</span><span class="mobile-text">⏳</span>`;
        await database.ref(`${currentClass}/makeupSigns/${currentSignKey}`).set({
            imageData: base64Data,
            timestamp: new Date().getTime()
        });
        
        alert(`✅ 서명이 경량화되어 등록되었습니다.`);
        closeSignModal();
        checkSignStatus(currentSignKey);
    } catch (e) {
        alert("❌ 실패: " + e.message);
        if(btn) btn.innerHTML = `<span class="pc-text">싸인등록</span><span class="mobile-text">📝</span>`;
    }
}

// 3. 서명 상태 확인 로직 (순정 유지)
async function checkSignStatus(signKey) {
    const snap = await database.ref(`${currentClass}/makeupSigns/${signKey}`).once('value');
    if (snap.exists()) {
        const btn = document.getElementById(`btnSign_${signKey}`);
        if(btn) { 
            btn.innerHTML = `<span class="pc-text">✅ 완료</span><span class="mobile-text">✅</span>`; 
            btn.style.background = "#2c3e50"; 
        }
    }
}

// 📍 [정비 2] 사진 업로드 엔진 (반별 독립 저장 및 실시간 교체)
function triggerUpload(key, num) {
    document.getElementById(`file_${key}_${num}`).click();
}

async function uploadPhoto(reportKey, num, input) {
    if (!input.files || !input.files[0]) return;
    
    const btns = document.querySelectorAll(`[id^="btnImg${num}_"]`);
    let targetBtn = null;
    
    btns.forEach(b => {
        if(b.id === `btnImg${num}_${reportKey}`) targetBtn = b;
    });

    const originalHtml = targetBtn ? targetBtn.innerHTML : `<span class="pc-text">📷사진${num}</span><span class="mobile-text">📝${num}</span>`;
    if(targetBtn) {
        targetBtn.innerHTML = `<span class="pc-text">업로드...</span><span class="mobile-text">⏳</span>`;
        targetBtn.style.opacity = "0.5";
    }

    processImage(input, async (base64Data) => {
        try {
            await database.ref(`${currentClass}/makeupReportImages/${reportKey}/img${num}`).set({
                imageData: base64Data,
                timestamp: new Date().getTime()
            });
            
            alert(`✅ 사진${num} 등록이 완료되었습니다.`);
            
            const allTargetBtns = document.querySelectorAll(`[id="btnImg${num}_${reportKey}"]`);
            allTargetBtns.forEach(btn => {
                btn.innerHTML = `<span class="pc-text">✅완료${num}</span><span class="mobile-text">✅${num}</span>`; 
                btn.style.background = "#2c3e50"; 
                btn.style.opacity = "1";
            });
            
        } catch (e) {
            alert("❌ 업로드 실패: " + e.message);
            if(targetBtn) {
                targetBtn.innerHTML = originalHtml;
                targetBtn.style.background = "#27ae60";
                targetBtn.style.opacity = "1";
            }
        }
    });
}

// 사진 등록 여부 실시간 확인
async function checkPhotoStatus(reportKey) {
    const snap = await database.ref(`${currentClass}/makeupReportImages/${reportKey}`).once('value');
    const data = snap.val() || {};
    if (data.img1) {
        const b1 = document.getElementById(`btnImg1_${reportKey}`);
        if(b1) { b1.innerHTML = `<span class="pc-text">✅완료1</span><span class="mobile-text">✅1</span>`; b1.style.background = "#2c3e50"; }
    }
    if (data.img2) {
        const b2 = document.getElementById(`btnImg2_${reportKey}`);
        if(b2) { b2.innerHTML = `<span class="pc-text">✅완료2</span><span class="mobile-text">✅2</span>`; b2.style.background = "#2c3e50"; }
    }
}

    async function toggleStudentDetail(idx) {
    const detailRow = document.getElementById(`detailRow_${idx}`);
    const detailArea = document.getElementById(`detailArea_${idx}`);
    if (detailRow.style.display === 'table-row') { detailRow.style.display = 'none'; return; }
    
    document.querySelectorAll('.detail-row').forEach(el => el.style.display = 'none');
    selectedItem = fullList[idx];
    detailRow.style.display = 'table-row';
    
    const hData = selectedItem.history || {};
    let currentSum = 0;
    let historyHtml = "";
    
    Object.entries(hData).forEach(([histId, h]) => {
        const hMin = calculateMinutes(h.time);
        currentSum += hMin;
        historyHtml += `
    <tr>
        <td>${h.date.substring(2,4)}.${h.date.substring(4,6)}.${h.date.substring(6,8)}</td>
        <td>${h.time}</td>
        <td><strong>${hMin}분</strong></td>
        <td><button class="btn-detail" style="background:#e74c3c; width:100%; padding:8px 0;" onclick="deleteHistory('${selectedItem.studentName}', '${selectedItem.escapedSub}', '${histId}', ${idx})">❌</button></td>
    </tr>`;
    });
    
    const remain = selectedItem.totalMin - currentSum;

    // 📍 [출결 미니 계기판 조립 엔진 - 다중 줄바꿈 10일 모드]
    let miniAttendHtml = "";
    const minDate = subjectMinDates[selectedItem.subjectName];
    const maxDate = subjectMaxDates[selectedItem.subjectName];
    
    const targetDates = globalValidDates.filter(d => d >= minDate && d <= maxDate);
    const subjectDays = subjectDaysMap[selectedItem.subjectName] || new Set();
    
    if (targetDates.length > 0) {
        const chunkSize = 10; // 📍 한 줄에 10일씩 강제 할당 (모바일 10칸 대응)
        let tableRowsHtml = "";
        const todayStr = new Date().toISOString().split('T')[0];

        for (let i = 0; i < targetDates.length; i += chunkSize) {
            const chunk = targetDates.slice(i, i + chunkSize);
            let trTop = "<tr>";
            let trBot = "<tr>";
            
            chunk.forEach(d => {
                const shortDate = parseInt(d.split('-')[1]) + "/" + parseInt(d.split('-')[2]);
                const weekStr = getDayOfWeek(d);
                const isSubjectDay = subjectDays.has(d);
                
                const headerStyle = isSubjectDay 
                    ? "background:#dcfce7; color:#166534; font-weight:bold; border-bottom: 2px solid #27ae60;" 
                    : "background:#f8fafc; color:#64748b;";
                
                // 📍 [정밀 튜닝] <br> 제거하고 한 줄로 결합, 폰트/자간 압축으로 모바일 10칸 방어
                trTop += `<th style="${headerStyle} border: 1px solid #e1e8ed; padding: 2px 0; font-size: 9px; text-align: center; letter-spacing: -0.5px; white-space: nowrap;">${shortDate}(${weekStr})</th>`;
                
                const att = (globalAttendanceData[d] && globalAttendanceData[d][selectedItem.studentName]) ? globalAttendanceData[d][selectedItem.studentName] : null;
                
                if (!att) {
                    if (d <= todayStr) { trBot += `<td class="bg-absent" style="border: 1px solid #e1e8ed; padding: 2px 0; font-size: 10px; text-align: center;">×</td>`; }
                    else { trBot += `<td class="bg-none" style="border: 1px solid #e1e8ed; padding: 2px 0; font-size: 10px; text-align: center;"></td>`; }
                } else {
                    const st = att.status || "";
                    let cls = "bg-attend", sym = "";
                    
                    if(st.includes("결석") || st === "미편입") { cls = "bg-absent"; sym = "×"; }
                    else if(st.includes("출석") || st === "정상" || st === "") { cls = "bg-attend"; sym = "○"; }
                    else if(st.includes("지각")) { cls = "bg-late"; sym = "지"; }
                    else if(st.includes("조퇴")) { cls = "bg-early"; sym = "조"; }
                    else if(st.includes("외출")) { cls = "bg-out"; sym = "외"; }
                    else if(st.includes("공가") || st.includes("병가")) { cls = "bg-attend"; sym = "공"; }
                    else if(st.includes("휴가")) { cls = "bg-attend"; sym = "휴"; }
                    else { cls = "bg-attend"; sym = "◎"; }
                    
                    trBot += `<td class="${cls}" style="border: 1px solid #e1e8ed; padding: 2px 0; font-size: 10px; text-align: center;">${sym}</td>`;
                }
            });
            
            // 마지막 줄이 빈칸일 때 레이아웃 붕괴 방지용 더미(Dummy) 부품 조립
            for(let j = chunk.length; j < chunkSize; j++) {
                trTop += `<th style="background:#f8fafc; border: 1px solid #e1e8ed; padding: 2px 0;"></th>`;
                trBot += `<td style="border: 1px solid #e1e8ed; padding: 2px 0;"></td>`;
            }
            
            trTop += "</tr>";
            trBot += "</tr>";
            tableRowsHtml += trTop + trBot;
        }
        
        miniAttendHtml = `
        <div style="margin-top: 15px; margin-bottom: 15px; width:100%;">
            <p style="margin:0 0 5px 0; font-weight:bold; color:#27ae60; font-size:12px;">📅 [${selectedItem.subjectName}] 훈련일 전체 출결 (색칠: 과목 수업일)</p>
            <div style="width: 100%; border: 1px solid #ccc; border-radius: 5px; background: #fff; padding: 2px; box-sizing: border-box;">
                <table style="border-collapse: collapse; width: 100%; table-layout: fixed;">
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>`;
    }
    
    detailArea.innerHTML = `
        <div class="inner-detail-box">
            <div class="remain-info" style="display: flex; justify-content: space-between; align-items: center;">
                <span>📊 <strong>${selectedItem.studentName}</strong>: ${currentSum}분 / 총 ${selectedItem.totalMin}분 (남음: <strong>${remain}분</strong>)</span>
                <button class="btn-detail" style="background:#666;" onclick="document.getElementById('detailRow_${idx}').style.display='none'"><span class="pc-text">상세창 닫기 ✖</span><span class="mobile-text">닫기 ✖</span></button>
            </div>
            
            <table class="history-table">
                <thead><tr><th>보강 일자</th><th>시간</th><th>분</th><th>관리</th></tr></thead>
                <tbody>${historyHtml || '<tr><td colspan="4" style="padding:20px;">내역 없음</td></tr>'}</tbody>
            </table>
            
            ${miniAttendHtml}
            
            ${remain > 0 ? `
            <div class="add-box">
                <p style="margin:0 0 10px 0; font-weight:bold; color:#2980b9;">➕ 신규 보강 기록</p>
                <div style="display:flex; gap:10px;">
                    <div class="input-group">
        <label>일자 (8자리)</label>
        <input type="number" id="addDate_${idx}" 
               placeholder="예: 20260311" 
               oninput="autoFocusNext(this, 'startTime_${idx}', 8)" 
               pattern="\\d*">
    </div>
    <div class="input-group">
        <label>시작 (4자리)</label>
        <input type="number" id="startTime_${idx}" 
               placeholder="1800" 
               oninput="autoFocusNext(this, 'endTime_${idx}', 4)" 
               pattern="\\d*">
    </div>
    <div class="input-group">
        <label>종료 (4자리)</label>
        <input type="number" id="endTime_${idx}" 
               placeholder="2000" 
               oninput="autoFocusNext(this, 'btnSaveAction_${idx}', 4)" 
               pattern="\\d*">
    </div>
    <button class="btn-save" id="btnSaveAction_${idx}" onclick="saveNewHistory(${idx})">기록 저장 (Enter)</button>
                </div>
            </div>` : '<p style="text-align:center; color:#27ae60; padding:10px;">✅ 보강이 모두 완료되었습니다.</p>'}
        </div>`;
}

// 🚀 [자동 변속 장치] 자릿수가 다 차면 다음 칸으로 자동 포커스 이동
function autoFocusNext(current, nextId, maxLength) {
    // 1. 글자수 초과 방지 (절단)
    if (current.value.length > maxLength) {
        current.value = current.value.slice(0, maxLength);
    }

    // 2. 목표 자릿수 도달 시 작동
    if (current.value.length >= maxLength) {
        const idx = current.id.split('_')[1]; // 현재 줄 번호 추출
        const nextEl = document.getElementById(nextId);
        
        // 📍 [정밀 튜닝] 스마트 건너뛰기 로직
        // 일자 입력이 끝났는데, 시작/종료 시간이 이미 4자리씩 채워져 있다면?
        if (current.id.startsWith('addDate')) {
            const sVal = document.getElementById(`startTime_${idx}`).value;
            const eVal = document.getElementById(`endTime_${idx}`).value;
            
            if (sVal.length >= 4 && eVal.length >= 4) {
                const saveBtn = document.getElementById(`btnSaveAction_${idx}`);
                if (saveBtn) { saveBtn.focus(); return; } // 바로 저장 버튼으로 발사
            }
        } 
        // 시작 시간 입력이 끝났는데, 종료 시간이 이미 채워져 있다면?
        else if (current.id.startsWith('startTime')) {
            const eVal = document.getElementById(`endTime_${idx}`).value;
            if (eVal.length >= 4) {
                const saveBtn = document.getElementById(`btnSaveAction_${idx}`);
                if (saveBtn) { saveBtn.focus(); return; } // 바로 저장 버튼으로 발사
            }
        }

        // 건너뛸 조건이 아니면 순정대로 다음 칸으로 이동
        if (nextEl) nextEl.focus();
    }
}

async function saveNewHistory(idx) {
    if (!isAdmin) {
        alert("❌ 권한이 없습니다. 관리자 로그인이 필요합니다.");
        return;
    }
    const dateField = document.getElementById(`addDate_${idx}`);
    const dateInput = dateField.value.trim(); 
    const startInput = document.getElementById('startTime_' + idx).value.trim();
    const endInput = document.getElementById('endTime_' + idx).value.trim();
    selectedItem = fullList[idx];
    if(!/^\d{8}$/.test(dateInput)) return alert("날짜 8자리를 YYYYMMDD 형식으로 입력하세요.");
    if(!/^\d{4}$/.test(startInput) || !/^\d{4}$/.test(endInput)) return alert("시간은 4자리 숫자로 입력하세요.");
    const formattedUserDate = `${dateInput.substring(0, 4)}-${dateInput.substring(4, 6)}-${dateInput.substring(6, 8)}`;
    const minDate = subjectMinDates[selectedItem.subjectName];
    const maxDate = subjectMaxDates[selectedItem.subjectName];
    if (formattedUserDate < minDate || formattedUserDate > maxDate) {
        alert(`⚠️ 기간 외 등록 불가!\n본 과목의 수업 기간은 [${minDate} ~ ${maxDate}] 입니다.`);
        dateField.value = ""; dateField.focus(); return;
    }
    const formattedStartTime = startInput.substring(0,2) + ":" + startInput.substring(2,4);
    const formattedEndTime = endInput.substring(0,2) + ":" + endInput.substring(2,4);
    const fullTimeStr = formattedStartTime + "~" + formattedEndTime;
    const newMin = calculateMinutes(fullTimeStr);
    if (newMin <= 0) { alert("❌ 종료 시간이 시작 시간보다 빠를 수 없습니다."); return; }
    let currentSum = 0;
    Object.values(selectedItem.history || {}).forEach(h => currentSum += calculateMinutes(h.time));
    if (currentSum + newMin > selectedItem.totalMin) { alert(`❌ 등록 실패: 총 보강시간을 초과합니다.`); return; }
    await database.ref(`${currentClass}/makeupDetails/${selectedItem.studentName}/${selectedItem.escapedSub}/${new Date().getTime()}`).set({
        date: dateInput, time: fullTimeStr, min: newMin
    });
    alert("✅ 저장되었습니다.");
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('openIdx', idx);
    window.location.href = currentUrl.toString();
}

    async function deleteHistory(studentName, escapedSub, histId, idx) {
        if (!isAdmin) {
    alert("❌ 권한이 없습니다. 선생님 계정으로 인증해 주세요.");
    return;
}
        if (!confirm("❗ 삭제하시겠습니까?")) return;
        await database.ref(`${currentClass}/makeupDetails/${studentName}/${escapedSub}/${histId}`).remove();
        alert("✅ 삭제되었습니다.");
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('openIdx', idx);
        window.location.href = currentUrl.toString();
    }

    function calculateMinutes(timeStr) {
        try {
            const parts = timeStr.split('~');
            const start = parts[0].split(':'), end = parts[1].split(':');
            return (parseInt(end[0])*60 + parseInt(end[1])) - (parseInt(start[0])*60 + parseInt(start[1]));
        } catch(e) { return 0; }
    }

    function formatDateString(yyyymmdd) {
        if (yyyymmdd.length !== 8) return yyyymmdd; 
        return `${yyyymmdd.substring(0, 4)}년 ${yyyymmdd.substring(4, 6)}월 ${yyyymmdd.substring(6, 8)}일`;
    }

    function getDayOfWeek(dateStr) {
        if (!dateStr || dateStr === "미정") return ""; 
        const week = ['일', '월', '화', '수', '목', '금', '토'];
        const formatted = dateStr.includes('-') ? dateStr : `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
        const day = new Date(formatted).getDay();
        return week[day];
    }

    // 📍 보고서용 사진 업로드 및 압축 엔진 (HEIC 실시간 변환기 장착)
function processImage(input, callback) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const fileName = file.name.toLowerCase();
        const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif');

        // 📍 순정 압축 엔진 블록 (안전하게 분리 보존)
        const runOriginalEngine = (targetFile) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const max_size = 1000; 
                    if (width > height) {
                        if (width > max_size) { height *= max_size / width; width = max_size; }
                    } else {
                        if (height > max_size) { width *= max_size / height; height = max_size; }
                    }
                    canvas.width = width; canvas.height = height;
                    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                    callback(canvas.toDataURL('image/jpeg', 0.8)); 
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(targetFile);
        };

        // 📍 연료(확장자) 판별기
        if (isHeic) {
            if (typeof heic2any === 'undefined') {
                alert("HEIC 변환 엔진이 로드되지 않았습니다. 인터넷 연결을 확인해주세요.");
                return;
            }
            // 항공유(HEIC)를 휘발유(JPEG)로 1차 변환 후 순정 엔진으로 전달
            heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            }).then(function (convertedBlob) {
                runOriginalEngine(convertedBlob);
            }).catch(function (error) {
                alert("HEIC 변환 중 오류가 발생했습니다: " + error.message);
            });
        } else {
            // 일반 연료(JPEG/PNG)는 즉시 순정 엔진으로 직행
            runOriginalEngine(file);
        }
    }
}

/// 📍 보고서 보기 메인 엔진 (정밀 수정본)
// 📍 보고서 보기 메인 엔진 (정밀 수리 완료: 서명 데이터 로드 배선 복구)
async function openReportView(reportKey) {
    const modal = document.getElementById('reportModal');
    modal.style.display = 'block';

    // 1. 기초 정보 파싱 (과목_날짜_시간)
    const [subName, dateStr, timeStr] = reportKey.split('_');
    const formattedDate = `${dateStr.substring(0, 4)}년 ${dateStr.substring(4, 6)}월 ${dateStr.substring(6, 8)}일`;
    
    // 2. 해당 보고서 그룹 데이터 및 학생 명단 추출
    const groupData = fullList.filter(item => {
        return Object.values(item.history || {}).some(h => h.date === dateStr && h.time.replace(/:/g, '') === timeStr && item.subjectName === subName);
    });
    const students = groupData.map(g => g.studentName);

    // 🚨 [캐시 엔진 1] 서명 데이터 창고 확인
    if (!imageCache.signs) {
        const signsSnap = await database.ref(`${currentClass}/makeupSigns`).once('value');
        imageCache.signs = signsSnap.val() || {};
        console.log("📡 [서명 데이터] 서버에서 새로 수혈했습니다.");
    } else {
        console.log("📦 [서명 데이터] 창고(캐시)에서 즉시 꺼내왔습니다.");
    }
    const allMakeupSigns = imageCache.signs;

    // 3. 실시간 마스터 데이터 로드 (훈련명, 기간, 교사)
    const masterSnap = await database.ref(`${currentClass}/masterData`).once('value');
    const masterData = masterSnap.val() || {};
    const trainName = masterData.name || "훈련과정명 미설정";
    const trainPeriod = masterData.period || "기간 미설정";
    const teacherName = masterData.teacher || "담임교사 미설정";

    // 4. 화면 데이터 주입 (1, 2페이지)
    document.querySelectorAll('.view_trainName').forEach(el => el.innerText = trainName);
    document.querySelectorAll('.view_subject_name').forEach(el => el.innerText = subName);
    document.querySelectorAll('.view_student_count').forEach(el => el.innerText = students.length + "명");

    const tableDateP2 = document.getElementById('view_table_date_p2');
    if(tableDateP2) tableDateP2.innerText = formattedDate;

    const tablePeriod = document.getElementById('view_table_period');
    if(tablePeriod) {
        let formattedPeriod = trainPeriod.replace(/-/g, '.');
        tablePeriod.innerHTML = formattedPeriod.replace("~", "<br>~");
    }
    const tableDate = document.getElementById('view_table_date');
    if(tableDate) tableDate.innerHTML = formattedDate.replace("년 ", "년<br>");

    const tableTime = document.getElementById('view_table_time');
    if (tableTime) {
        let displayTime = timeStr;
        if (!displayTime.includes(':') && displayTime.includes('~')) {
            const parts = displayTime.split('~');
            displayTime = `${parts[0].substring(0,2)}:${parts[0].substring(2,4)}~${parts[1].substring(0,2)}:${parts[1].substring(2,4)}`;
        }
        tableTime.innerHTML = displayTime.replace("~", "<br>~");
    }

    // 하단 행정 정보
    const viewTeacher = document.getElementById('view_teacher_name');
    if(viewTeacher) viewTeacher.innerText = teacherName;
    const tableDateExec = document.getElementById('view_table_date_exec');
    if(tableDateExec) tableDateExec.innerText = `${dateStr.substring(0, 4)}. ${dateStr.substring(4, 6)}. ${dateStr.substring(6, 8)}.`;
    const tableRegNum = document.getElementById('view_table_reg_num');
    if(tableRegNum) tableRegNum.innerText = `접수번호 : ${dateStr.substring(0, 4)}-${dateStr.substring(4, 8)}`;

    // 🚨 [캐시 엔진 2] 공용 이미지(로고/직인) 및 선생님 도장 창고 확인
    if (!imageCache.common || !imageCache.teacherSeals) {
        const commonSnap = await masterDatabase.ref('commonImages').once('value');
        const commonData = commonSnap.val() || {};
        imageCache.common = commonData.etcImages || {};
        imageCache.teacherSeals = commonData.teacherSeals || {};
        console.log("📡 [공용/도장] 서버에서 마스터 부품을 가져왔습니다.");
    } else {
        console.log("📦 [공용/도장] 창고(캐시) 부품을 사용합니다.");
    }
    const etcImgs = imageCache.common;
    const teacherSeals = imageCache.teacherSeals;
    

    const topLogoData = etcImgs['-OnJy52yfwa0zbIXA3k0']?.imageData;
    if(topLogoData) {
        document.getElementById('view_topLogo_L').src = topLogoData;
        document.getElementById('view_topLogo_R').src = topLogoData;
    }
    const btmLogoData = etcImgs['-OnH-XxuIFh0XtK0-qhn']?.imageData;
    if(btmLogoData) document.getElementById('view_bottom_logo').src = btmLogoData;

    const sealData = etcImgs['-OnH-acHLcGymN1jG_Y0']?.imageData;
    if(sealData) document.getElementById('view_schoolSeal').src = sealData;

    // 6. 담임 도장 배선

    const sealDataNode = teacherSeals[dbClassKey];
    const teacherSealUrl = sealDataNode ? sealDataNode.imageData : null;
    
    // 7. Page 2 학생 목록 생성 로직 (정밀 복구)
    let listHtml = "";
    const rowCount = Math.max(students.length, 12); 
    
    for(let i=0; i<rowCount; i++) {
        const sName = students[i] || "";
        let studentSpecificHistId = "";
        
        if (sName) {
            const studentItem = groupData.find(g => g.studentName === sName);
            if (studentItem && studentItem.history) {
                Object.entries(studentItem.history).forEach(([hid, h]) => {
                    if (h.date === dateStr && h.time.replace(/:/g, '') === timeStr) studentSpecificHistId = hid;
                });
            }
        }

        const currentSubKey = groupData[0]?.escapedSub || "";
        const signDataKey = (sName && studentSpecificHistId) ? `${sName}_${currentSubKey}_${studentSpecificHistId}` : "";
        
        // 학생 서명
        const studentSignData = (signDataKey && allMakeupSigns[signDataKey]) 
            ? `<img src="${allMakeupSigns[signDataKey].imageData}" style="height:40px; width:auto; object-fit:contain; mix-blend-mode:multiply; vertical-align:middle;">` 
            : "";

        // 담임 도장
        const sealImgHtml = (sName && teacherSealUrl) 
            ? `<img src="${teacherSealUrl}" style="height:50px; width:50px; object-fit:contain; vertical-align:middle; display:inline-block;">` : "";

        listHtml += `
            <tr style="height:55px;">
                <td style="border: 1px solid #000; text-align:center; vertical-align:middle;">${i+1}</td>
                <td style="border: 1px solid #000; font-size:12pt; text-align:center; vertical-align:middle;"><strong>${sName}</strong></td>
                <td style="border: 1px solid #000; text-align:center; vertical-align:middle;">${sName ? 'O' : ''}</td>
                <td style="border: 1px solid #000; text-align:center; vertical-align:middle; padding:2px;">${studentSignData}</td>
                <td style="border: 1px solid #000; text-align:center; vertical-align:middle; padding:2px;">${sealImgHtml}</td>
            </tr>`;
    }
    document.getElementById('view_studentList').innerHTML = listHtml;

    // 🚨 [캐시 엔진 3] Page 3 증빙자료 창고 확인
    if (!imageCache.reportPhotos[reportKey]) {
        const photoSnap = await database.ref(`${currentClass}/makeupReportImages/${reportKey}`).once('value');
        imageCache.reportPhotos[reportKey] = photoSnap.val() || {};
        console.log(`📡 [증빙 사진] ${reportKey} 리포트용 서버 호출.`);
    } else {
        console.log(`📦 [증빙 사진] ${reportKey} 창고(캐시)에서 로드.`);
    }
    const photoData = imageCache.reportPhotos[reportKey]

    // 훈련과정명 자동 축소 (2, 3페이지 공통)
    const containerP2 = document.getElementById('autoScaleTrainName_P2');
    if (containerP2) {
        containerP2.innerText = trainName;
        setTimeout(() => {
            const maxWidth = 640;
            const currentWidth = containerP2.offsetWidth;
            if (currentWidth > maxWidth) containerP2.style.transform = `scale(${maxWidth / currentWidth})`;
            else containerP2.style.transform = "scale(1)";
        }, 100);
    }

    let displayTime3 = timeStr;
    if (!displayTime3.includes(':') && displayTime3.includes('~')) {
        const parts = displayTime3.split('~');
        displayTime3 = `${parts[0].padStart(4,'0').replace(/(\d{2})(\d{2})/,'$1:$2')}~${parts[1].padStart(4,'0').replace(/(\d{2})(\d{2})/,'$1:$2')}`;
    }
    const totalMin = calculateMinutes(displayTime3);
    displayTime3 += ` (${(totalMin/60).toFixed(0)}시간)`;

    const viewPeriodP3 = document.getElementById('view_info_period_p3');
    if(viewPeriodP3) viewPeriodP3.innerText = "□ 훈련기간 : " + trainPeriod.replace(/-/g, '.');
    
    document.getElementById('view_photoStudents').innerText = students.join(', ');
    document.getElementById('view_photoSubject').innerText = subName;
    document.getElementById('view_photoDate').innerText = formattedDate;
    document.getElementById('view_photoTime').innerText = displayTime3;

    const containerP3 = document.getElementById('autoScaleTrainName');
    if (containerP3) {
        containerP3.innerText = trainName;
        setTimeout(() => {
            const maxWidth = 550;
            const currentWidth = containerP3.scrollWidth;
            if (currentWidth > maxWidth) containerP3.style.transform = `scale(${maxWidth / currentWidth})`;
        }, 50);
    }

    // 사진 처리 (3페이지)
    const img1 = document.getElementById('view_img1_p3');
    const noImg1 = document.getElementById('no_img1_p3');
    if (photoData.img1?.imageData) {
        img1.src = photoData.img1.imageData; img1.style.display = 'inline-block'; noImg1.style.display = 'none';
    } else {
        img1.style.display = 'none'; noImg1.style.display = 'block';
    }

    const img2 = document.getElementById('view_img2_p3');
    const noImg2 = document.getElementById('no_img2_p3');
    if (photoData.img2?.imageData) {
        img2.src = photoData.img2.imageData; img2.style.display = 'inline-block'; noImg2.style.display = 'none';
    } else {
        img2.style.display = 'none'; noImg2.style.display = 'block';
    }

    switchReportPage(1);
} // 📍 openReportView 함수 끝 (중괄호 정비 완료)

function switchReportPage(pageNum) {
    for (let i = 1; i <= 3; i++) {
        const pg = document.getElementById(`reportPage${i}`);
        const btn = document.getElementById(`btnPage${i}`);
        if(pg) pg.style.display = 'none';
        if(btn) btn.classList.remove('active');
    }
    const targetPg = document.getElementById(`reportPage${pageNum}`);
    const targetBtn = document.getElementById(`btnPage${pageNum}`);
    if(targetPg) targetPg.style.display = 'block';
    if(targetBtn) targetBtn.classList.add('active');
    document.getElementById('reportModal').scrollTop = 0;
}

function preparePrint() {
    const subName = document.querySelector('.view_subject_name').innerText;
    const dateStr = document.getElementById('view_table_date_p2').innerText;
    const timeStr = document.getElementById('view_table_time').innerText.replace(/<br>/g, "").replace(/\n/g, "");
    const studentCount = document.querySelector('.view_student_count').innerText;
    const firstStudent = document.querySelector('#view_studentList tr strong')?.innerText || "외";
    
    const cleanDate = dateStr.replace(/[^0-9]/g, "").substring(2);
    const cleanTime = timeStr.replace(/[:\s]/g, "");
    const fileName = `${cleanDate}_${cleanTime}_${subName}_${firstStudent}_${studentCount}`;

    const originalTitle = document.title;
    document.title = fileName;

    for (let i = 1; i <= 3; i++) {
        const pg = document.getElementById(`reportPage${i}`);
        if(pg) {
            pg.style.display = 'block';
            pg.style.visibility = 'visible';
        }
    }

    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.title = originalTitle;
            const activeBtn = document.querySelector('.btn-page-nav.active');
            const currentPage = activeBtn ? activeBtn.id.replace('btnPage', '') : 1;
            switchReportPage(currentPage);
        }, 500);
    }, 500);
}

let isSelectMode = false; // 선택 모드 활성화 여부

// [신규] 미디어 초기화 버튼 클릭 핸들러
function handleMediaResetClick() {
    if (!isAdmin) return alert("❌ 권한이 없습니다. 선생님 계정으로 인증해 주세요.");

    if (!isSelectMode) {
        // 1단계: 선택 모드 진입
        isSelectMode = true;
        document.getElementById('btnResetMedia').innerText = "🚩 선택 항목 삭제 실행";
        document.getElementById('btnResetMedia').style.background = "#c0392b";
        document.getElementById('btnCancelSelect').style.display = "inline-block";
        
        // 현재 활성화된 정렬 상태로 리렌더링
        const activeBtn = document.querySelector('.sort-btns .btn-detail.active');
        const currentSort = activeBtn ? getSortKeyFromBtn(activeBtn) : 'subjectName';
        renderMainTable(currentSort);
    } else {
        // 2단계: 선택 항목 삭제 실행
        executeSelectiveReset();
    }
}

// [신규] 선택 모드 취소
function cancelSelectMode() {
    isSelectMode = false;
    const resetBtn = document.getElementById('btnResetMedia');
    if(resetBtn) {
        resetBtn.innerText = "🗑️ 미디어 초기화";
        resetBtn.style.background = "#e74c3c";
    }
    const cancelBtn = document.getElementById('btnCancelSelect');
    if(cancelBtn) cancelBtn.style.display = "none";
    
    // 현재 정렬 상태 유지하며 리렌더링
    const activeBtn = document.querySelector('.sort-btns .btn-detail.active');
    renderMainTable(activeBtn ? getSortKeyFromBtn(activeBtn) : 'subjectName');
}

// [신규] 전체 선택/해제
function toggleAllRows(master) {
    const checkboxes = document.querySelectorAll('.reset-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
}

// [도우미] 버튼 텍스트로 정렬 키 추출
function getSortKeyFromBtn(btn) {
    const txt = btn.innerText;
    if (txt.includes('과목순')) return 'subjectName';
    if (txt.includes('성명순')) return 'studentName';
    if (txt.includes('HRD')) return 'hrdDate';
    if (txt.includes('보강일순')) return 'historyTime';
    if (txt.includes('보고서용')) return 'reportMode';
    return 'subjectName';
}

// 📍 [정밀 타격 엔진] 체크된 항목의 사진과 싸인만 골라서 삭제합니다.
async function executeSelectiveReset() {
    // 1. 체크박스 중 체크된 것만 다 불러오기
    const checkedBoxes = document.querySelectorAll('.reset-checkbox:checked');
    
    if (checkedBoxes.length === 0) {
        alert("선택된 항목이 없습니다. 삭제할 항목을 체크해 주세요.");
        return;
    }

    // 2. 최종 확인 (실수 방지 안전장치)
    if (!confirm(`❗ 선택한 ${checkedBoxes.length}개 항목의 사진과 서명을 모두 지울까요?\n(보강 시간 기록은 그대로 유지됩니다.)`)) return;

    try {
        const updates = {};
        checkedBoxes.forEach(cb => {
            const reportKey = cb.getAttribute('data-report-key'); // 사진 뭉치 번호
            const signKeysStr = cb.getAttribute('data-sign-keys'); // 서명 번호들
            
            // 사진 경로 지우기 예약
            if (reportKey && reportKey !== "null") {
                updates[`${currentClass}/makeupReportImages/${reportKey}`] = null;
            }

            // 서명 경로 지우기 예약
            if (signKeysStr) {
                const signKeys = JSON.parse(signKeysStr);
                signKeys.forEach(sk => {
                    updates[`${currentClass}/makeupSigns/${sk}`] = null;
                });
            }
        });

        // 3. Firebase에 한 번에 전송 (일괄 삭제)
        await database.ref().update(updates);
        
        alert("✅ 선택한 미디어가 깨끗하게 초기화되었습니다.");
        
        // 🚀 [복귀 배선] 새로고침할 때 '보강일순' 정렬값이 유지되도록 URL을 수정해서 리로드
        const currentUrl = new URL(window.location.href);
        // 여기서 sort 파라미터를 강제로 historyTime으로 고정합니다.
        window.location.href = `보강수업.html?class=${currentClass}&sort=historyTime`;
    } catch (e) {
        alert("❌ 정비 실패(오류): " + e.message);
    }
}
