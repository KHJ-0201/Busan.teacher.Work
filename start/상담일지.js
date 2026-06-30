// ==========================================
// [1. 공통 환경 및 보안 설정 통합]
// ==========================================
const masterConfig = {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
    authDomain: "busan-teacher-workall.firebaseapp.com",
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};

const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};

// 📍 [핵심 수리] 두 엔진의 배선을 하나로 통일하거나 각각 인증을 전달해야 합니다.
// 여기서는 실제 저장이 일어나는 Class DB를 기본 앱으로 설정하여 보안 문제를 원천 차단합니다.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig); // 1순위: 저장이 일어나는 Class DB를 메인으로 시동
}
const database = firebase.database();
const auth = firebase.auth();
initClassContext();

// 📍 [보조 부품] 마스터 인증이 필요한 경우를 위해 마스터 앱을 별도로 준비
const masterApp = (firebase.apps.length > 1) ? firebase.app("master") : firebase.initializeApp(masterConfig, "master");

// ==========================================
// [2. 보안 검문소] (로그인 상태를 DB 엔진에 동기화)
// ==========================================
auth.onAuthStateChanged(async (user) => {
    const savedPw = localStorage.getItem('adminPw');

    if (user) {
        // ✅ 인증 성공 상태 -> 시스템 시동
        console.log("🔒 보안 인증 확인됨 (Class DB): " + firebaseConfig.projectId);
        initialize(); 
    } else if (savedPw) {
        // 🔑 자동 로그인 시도 (Class DB 엔진에 직접 로그인)
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                await appAlert("인증 정보가 만료되었습니다. 다시 로그인해주세요.");
                location.href = "../index.html"; 
            });
    } else {
        // ⚠️ 무단 접근 차단
        await appAlert("보안 인증이 필요한 페이지입니다.");
        location.href = "../index.html"; 
    }
});

let currentClass = window.currentClass;

let rawTimetable = [], fullAttendanceData = {}, masterSubjectList = [], ncsList = [];
let unitMonths = [], studentNames = [], validTrainingDays = [];
let dropoutData = {}, earlyCompletionData = {}, counselingLogs = {}; 

let currentUnitIndex = 0; 
let currentStudent = "";  
let currentTeacherName = ""; 
let isMainView = true;
let selectedDates = []; // 📍 신규 배선: 복수 날짜를 기억하는 배열

// [날짜 및 과목 규격 포맷용 순정 부품]
function getFixDate(rawDate) {
    if (!rawDate) return "";
    let s = String(rawDate).trim().replace(/\./g, '-');
    if (s.includes('/')) {
        let p = s.split('/');
        if (p.length === 3) {
            let year = p[2].length === 2 ? "20" + p[2] : p[2];
            s = `${year}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
        }
    }
    return s.substring(0, 10);
}
function formatCounselDisplayDate(dateStr) {
    return getFixDate(dateStr).replace(/-/g, '.');
}

function getTodayDateKey() {
    const t = new Date();
    const offset = t.getTimezoneOffset() * 60000;
    return new Date(t.getTime() - offset).toISOString().split('T')[0];
}

function isCalendarWeekday(dateObj) {
    const dow = dateObj.getDay();
    return dow >= 1 && dow <= 5;
}

function hasStudentAttendanceForCounsel(studentName, dateStr) {
    const dayData = fullAttendanceData[dateStr];
    if (!dayData) return false;
    return !!dayData[studentName];
}

function isCounselDateSelectable(dateStr, studentName, todayKey) {
    if (!validTrainingDays.includes(dateStr)) return false;
    if (dateStr > todayKey) return false;
    const leaveDate = getStudentLeaveDate(studentName);
    if (leaveDate && dateStr >= leaveDate) return false;
    return true;
}

const COUNSEL_NO_ATTENDANCE_WARNING = "일일출석부 미등록으로 출결확인 불가.\n출결정보를 꼭 확인 후 상담작성 하세요.";
function isPersistedCounselLog(log) {
    if (!log) return false;
    return !!(log.updatedAt || log.counselDate || log.counselor
        || (log.content && String(log.content).trim())
        || (log.action && String(log.action).trim()));
}
function isActualSubject(subName) {
    if (!subName) return false;
    const clean = String(subName).replace(/\s+/g, "");
    return masterSubjectList.some(m => m.replace(/\s+/g, "").includes(clean)) || 
           ncsList.some(n => n.replace(/\s+/g, "").includes(clean));
}

function getStudentLeaveDate(name) {
    if (dropoutData[name]) return getFixDate(dropoutData[name]);
    if (earlyCompletionData[name]) return getFixDate(earlyCompletionData[name]);
    return null;
}

function getLeaveUnitIndex(name) {
    const leaveDate = getStudentLeaveDate(name);
    if (!leaveDate || unitMonths.length === 0) return -1;
    for (let i = 0; i < unitMonths.length; i++) {
        const u = unitMonths[i];
        if (leaveDate >= u.start && leaveDate <= u.end) return i;
    }
    if (leaveDate < unitMonths[0].start) return 0;
    return unitMonths.length;
}

function isStudentActiveForCounselingUnit(name, unitIndex) {
    const leaveUnitIdx = getLeaveUnitIndex(name);
    if (leaveUnitIdx < 0) return true;
    return unitIndex < leaveUnitIdx;
}

function hasCounselingLog(logs, name) {
    const logData = logs[name];
    if (!logData) return false;
    if (logData.date && typeof logData.date === 'string') return true;
    return Object.keys(logData).length > 0;
}

// [2. 통합 데이터 로드 엔진]
async function initialize() {
    try {
        // 📍 즉시 데이터 로드 시작
        const [masterSnap, timeSnap, attSnap, dropSnap, earlySnap, logSnap] = await Promise.all([
            classDbRef('masterData').once('value'),
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('earlyCompletions').once('value'),
            classDbRef('counselingLogs').once('value') 
        ]);

        const master = masterSnap.val() || {};
        currentTeacherName = master.teacher || master.teacherName || ""; 

        if(master.courses) {
            masterSubjectList = [...new Set(master.courses.map(c => c.subject))];
            ncsList = [...new Set(master.courses.filter(c => c.unit).map(c => c.unit))];
        }

        rawTimetable = timeSnap.val() || [];
        fullAttendanceData = attSnap.val() || {};
        dropoutData = dropSnap.val() || {};
        earlyCompletionData = earlySnap.val() || {};
        counselingLogs = logSnap.val() || {}; 

        if(rawTimetable.length > 0) {
            processBaseData(); 
            selectMainView();
        }
    } catch (e) {
        console.error("데이터 로드 실패:", e);
        await appAlert("시스템 엔진 오류: 데이터를 불러오지 못했습니다.");
    }
}

// [3. 단위개월 분할 엔진]
function processBaseData() {
    validTrainingDays = [];
    const dayCheck = new Set();
    rawTimetable.forEach(row => {
        const d = getFixDate(row.날짜);
        if(d && isActualSubject(row.교과목) && !dayCheck.has(d)) {
            validTrainingDays.push(d);
            dayCheck.add(d);
        }
    });
    validTrainingDays.sort();

    let allStudents = new Set();
    Object.values(fullAttendanceData).forEach(day => {
        Object.keys(day).forEach(name => {
            if(name !== "성명" && name !== "_metadata" && name !== "미기록") {
                allStudents.add(name);
            }
        });
    });
    studentNames = Array.from(allStudents).sort();

    unitMonths = [];
    if(validTrainingDays.length === 0) return;
    const start = new Date(validTrainingDays[0]);
    const end = new Date(validTrainingDays[validTrainingDays.length - 1]);
    let tempStart = new Date(start);
    while (tempStart <= end) {
        let uStart = new Date(tempStart);
        let uEnd = new Date(tempStart);
        uEnd.setMonth(uEnd.getMonth() + 1); uEnd.setDate(uEnd.getDate() - 1);
        const sStr = uStart.toISOString().split('T')[0];
        const eStr = uEnd.toISOString().split('T')[0];
        unitMonths.push({ 
            label: `${unitMonths.length + 1}회차`, 
            start: sStr, end: eStr, 
            days: validTrainingDays.filter(d => d >= sStr && d <= eStr) 
        });
        tempStart.setMonth(tempStart.getMonth() + 1);
    }
}

// [4. 좌측 명단 및 탭 렌더링 구역 - 상담 횟수 표시 버전]
// [4. 좌측 명단 및 탭 렌더링 구역 - 0회 방지 정밀 버전]
function renderStudentList() {
    const listBody = document.getElementById('studentList');
    if (!listBody) return;
    listBody.innerHTML = "";

    studentNames.forEach((name, index) => {
        const logData = (counselingLogs[currentUnitIndex] && counselingLogs[currentUnitIndex][name]) ? counselingLogs[currentUnitIndex][name] : null;
        const leaveDate = getStudentLeaveDate(name);
        const isDropped = !!dropoutData[name];
        const isEarly = !!earlyCompletionData[name];
        const isInactiveThisUnit = leaveDate && !isStudentActiveForCounselingUnit(name, currentUnitIndex);
        
        let badgeHtml = "";
        
        // 📍 [핵심 수리] 데이터가 없거나, 날짜 키값이 0개라면 '미작성'으로 분류
        if (!logData || Object.keys(logData).length === 0) {
            badgeHtml = `<span class="status-badge">미작성</span>`;
        } else {
            let count = 0;
            if (logData.date && typeof logData.date === 'string') {
                count = 1; 
            } else {
                count = Object.keys(logData).length;
            }
            // 📍 만약 데이터 처리가 꼬여서 0회로 잡히면 다시 한번 '미작성'으로 필터링
            badgeHtml = (count > 0)
                ? `<span class="status-badge ${count >= 2 ? 'done-multi' : 'done'}">${count}회 상담</span>`
                : `<span class="status-badge">미작성</span>`;
        }

        let leaveBadgeHtml = "";
        if (isDropped) leaveBadgeHtml = `<span class="status-badge" style="background:#fee2e2; color:#b91c1c;">탈락</span>`;
        else if (isEarly) leaveBadgeHtml = `<span class="status-badge" style="background:#dbeafe; color:#1d4ed8;">조기수료</span>`;
        const activeClass = (name === currentStudent) ? "active" : "";

        // 📍 [신규 부품] 일일출석부 데이터에서 생년월일/성별을 스캔하여 나이 계산
        let studentAge = "";
        let studentGender = "";
        
        // 이 학생의 데이터가 존재하는 날짜를 스캔하여 정보를 빼옵니다.
        for (let d of validTrainingDays) {
            if (fullAttendanceData[d] && fullAttendanceData[d][name]) {
                const info = fullAttendanceData[d][name];
                
                // 생년월일(YYYY.MM.DD)이 있으면 나이 계산
                if (info.birthDate && !studentAge) {
                    const birthYear = parseInt(info.birthDate.split('.')[0], 10);
                    const currentYear = new Date().getFullYear();
                    studentAge = (currentYear - birthYear) + "세"; // 연나이 기준
                }
                // 성별이 있으면 가져옴
                if (info.gender && !studentGender) {
                    studentGender = info.gender;
                }
                
                // 둘 다 찾았으면 더 이상 검색하지 않고 모터 중지 (연비 절약)
                if (studentAge && studentGender) break; 
            }
        }

        // 이름 옆에 붙일 정보 텍스트 조립 (예: 21세 남)
        let addInfoHtml = "";
        if (studentAge || studentGender) {
            addInfoHtml = `<span style="font-size: 11px; color: #64748b; font-weight: normal; margin-left: 5px;">${studentAge} ${studentGender}</span>`;
        }

        listBody.innerHTML += `
            <div class="student-item ${activeClass} dynamic-open-form" id="student_row_${name}" data-name="${name}" style="${isInactiveThisUnit ? 'color:#94a3b8;' : ''}">
                <div style="flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">
                    <strong>${index + 1}. ${name}</strong>${addInfoHtml} ${leaveBadgeHtml}
                </div>
                <div style="flex-shrink: 0; margin-left: 5px; pointer-events: none;">
                    ${badgeHtml}
                </div>
            </div>
        `;
    });
}

function renderTabs() {
    const menu = document.getElementById('tabMenu');
    if (!menu) return;
    menu.innerHTML = "";

    const mainBtn = document.createElement('button');
    mainBtn.className = `tab-btn tab-btn-main ${isMainView ? 'active' : ''}`;
    mainBtn.innerText = '메인';
    mainBtn.onclick = () => selectMainView();
    menu.appendChild(mainBtn);

    unitMonths.forEach((u, idx) => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${!isMainView && idx === currentUnitIndex ? 'active' : ''}`;
        btn.innerText = u.label;
        btn.onclick = () => selectUnit(idx);
        menu.appendChild(btn);
    });
}

function selectMainView() {
    isMainView = true;
    currentStudent = "";
    document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
    document.getElementById('formPanel').style.display = 'none';
    const summaryPanel = document.getElementById('summaryPanel');
    if (summaryPanel) summaryPanel.style.display = 'none';
    renderTabs();
    renderStudentList();
    renderDashboard();
}


// 📍 [신규 모터] 모든 회차의 정보를 그리드로 한눈에 보여주는 메인 멀티 계기판
function renderDashboard() {
    const dash = document.getElementById('dashboardPanel');
    if(!dash) return;
    dash.style.display = 'block';
    
    let gridHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-top: 20px;">`;
    
    // 존재하는 모든 단위개월(회차)을 순회하며 미니 카드 생성
    unitMonths.forEach((unit, idx) => {
        const logs = counselingLogs[idx] || {};
        const activeStudents = studentNames.filter(name => isStudentActiveForCounselingUnit(name, idx));
        const total = activeStudents.length;
        const done = activeStudents.filter(name => hasCounselingLog(logs, name)).length;
        const excluded = studentNames.length - total;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        const periodText = `${unit.start.replace(/-/g, '.')} ~ ${unit.end.replace(/-/g, '.')}`;
        const excludedNote = excluded > 0 ? `<span style="color: #94a3b8; font-size: 11px;"> (탈락·조기수료 ${excluded}명 제외)</span>` : "";
        
        gridHtml += `
            <div style="background: #f8fafc; border: 1px solid #e1e8ed; border-radius: 10px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="color: #1e293b; font-size: 14px;">${idx + 1}회차</strong>
                    <span style="font-size: 11px; color: #64748b;">${periodText}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px;">
                    <span style="color: #64748b;">대상 ${total}명${excludedNote}</span>
                    <span style="color: #10b981; font-weight: bold;">완료 ${done}명</span>
                    <span style="color: #ef4444; font-weight: bold;">미상담 ${total - done}명</span>
                </div>
                <div style="background: #e2e8f0; border-radius: 4px; height: 10px; width: 100%; overflow: hidden; position: relative;">
                    <div style="background: #3b82f6; height: 100%; width: ${percent}%;"></div>
                </div>
                <div style="text-align: right; font-size: 10px; color: #64748b; margin-top: 5px;">진행률 ${percent}%</div>
            </div>
        `;
    });
    gridHtml += `</div>`;

    dash.innerHTML = `
        <div style="padding: 10px;">
            <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 5px; font-size: 20px;">📊 전체 회차 상담 현황 요약</h2>
            <p style="color: #64748b; font-size: 13px; margin-top: 0;">👈 좌측 명단에서 학생을 선택하면 상세 상담일지 폼이 열립니다.</p>
            ${gridHtml}
        </div>
    `;
}

// 📍 [핵심 수리] 탭 선택 시 학생이 풀리지 않도록 연쇄 반응 제어
function selectUnit(index) {
    isMainView = false;
    currentUnitIndex = index;
    renderTabs(); 
    renderStudentList(); 
    renderSummaryCalendar(); 
    const summaryPanel = document.getElementById('summaryPanel');
    if (summaryPanel) summaryPanel.style.display = 'block';
    
    if (currentStudent !== "") {
        // 📍 탭을 누를 때는 토글 스위치가 폼을 꺼버리지 않도록 강제 열기(true) 신호 송신
        openForm(currentStudent, true);
    } else if (studentNames.length > 0) {
        openForm(studentNames[0], true);
    } else {
        document.getElementById('formPanel').style.display = 'none';
        document.getElementById('dashboardPanel').style.display = 'none';
    }
}

// [5. 출석 추출 패키징 엔진 - 정밀 분석 버전]
function calculateStudentAttendance(name, targetDays) {
    let pureAbsent = 0, lCount = 0, eCount = 0, oCount = 0, personalDays = 0, preEnroll = 0, actualPresent = 0;
    let enrollDate = "";
    for (let d of validTrainingDays) {
        const dayData = fullAttendanceData[d] ? fullAttendanceData[d][name] : null;
        if (dayData && dayData.status && dayData.status !== "미편입" && dayData.status !== "" && dayData.status !== "-") {
            enrollDate = d; break;
        }
    }

    const todayStr = typeof getTodayStrKst === 'function' ? getTodayStrKst() : new Date().toISOString().split('T')[0];

    targetDays.forEach(d => {
        const att = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : null;
        const leaveDate = getStudentLeaveDate(name);
        if (leaveDate && d >= leaveDate) { pureAbsent++; personalDays++; return; }
        if (enrollDate && d < enrollDate) { preEnroll++; return; }
        personalDays++;
        
        if(!att) {
            if (typeof shouldCountMissingAttAsAbsent === 'function' ? shouldCountMissingAttAsAbsent(d, todayStr) : d <= todayStr) pureAbsent++;
        } else {
            const st = att.status || "";
            if(st.includes("결석") || st === "미편입") pureAbsent++;
            else if(st.includes("출석") || st === "정상" || st === "") actualPresent++;
            else {
                actualPresent++;
                if(st.includes("지각")) lCount++;
                else if(st.includes("조퇴")) eCount++;
                else if(st.includes("외출")) oCount++;
            }
        }
    });

    const penaltyAbs = Math.floor((lCount + eCount + oCount) / 3);
    const finalAbsent = pureAbsent + penaltyAbs;
    const pureAttendedDays = personalDays - finalAbsent;
    
    const rate = personalDays > 0 ? (pureAttendedDays / personalDays * 100).toFixed(1) : "0.0";
    
    return {
        rate: rate,
        finalAbsent: finalAbsent,
        pureAbsent: pureAbsent,    // 📍 순결석 추가
        penaltyAbs: penaltyAbs,    // 📍 합산 결석 추가
        lCount: lCount,
        eCount: eCount,
        oCount: oCount,
        preEnroll: preEnroll 
    };
}

// 📍 [핵심 개조] 달력 렌더링 내부에 출결 마커(○, ×, 지, 조 등) 탑재
function renderCalendar(studentName, unitMonth) {
    const calArea = document.getElementById('calendarArea');
    if (!unitMonth) { calArea.innerHTML = "해당 회차 정보가 없습니다."; return; }

    const todayKey = getTodayDateKey();
    const start = new Date(unitMonth.start);
    const end = new Date(unitMonth.end);
    
    let html = `<div class="cal-grid">`;
    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    daysOfWeek.forEach(d => html += `<div class="cal-header">${d}</div>`);

    const startDayOfWeek = start.getDay();
    for(let i=0; i<startDayOfWeek; i++) {
        html += `<div></div>`; 
    }

    let tempDate = new Date(start);
    while(tempDate <= end) {
        const dateStr = tempDate.toISOString().split('T')[0];
        const dayStr = `<span style="font-size:10px; letter-spacing:-0.5px; white-space:nowrap;">${tempDate.getMonth() + 1}월 ${tempDate.getDate()}일</span>`;
        
        let statusHtml = "";
        const isTrainingDay = validTrainingDays.includes(dateStr);
        const isSelectable = isCounselDateSelectable(dateStr, studentName, todayKey);
        const att = (fullAttendanceData[dateStr] && fullAttendanceData[dateStr][studentName]) ? fullAttendanceData[dateStr][studentName] : null;
        
        if (isTrainingDay && att) {
            const st = att.status || "";
            const leaveDate = getStudentLeaveDate(studentName);
            if (leaveDate && dateStr >= leaveDate) {
                statusHtml = `<div class="cal-status" style="color:#ef4444;">${earlyCompletionData[studentName] ? '조수' : '탈락'}</div>`;
            } else if (st.includes("결석") || st === "미편입") {
                statusHtml = `<div class="cal-status" style="color:#ef4444; font-weight:bold;">×</div>`;
            } else if (st.includes("지각")) {
                statusHtml = `<div class="cal-status" style="color:#f59e0b; font-weight:bold;">지</div>`;
            } else if (st.includes("조퇴")) {
                statusHtml = `<div class="cal-status" style="color:#0369a1; font-weight:bold;">조</div>`;
            } else if (st.includes("외출")) {
                statusHtml = `<div class="cal-status" style="color:#166534; font-weight:bold;">외</div>`;
            } else if (st.includes("공가")) {
                statusHtml = `<div class="cal-status" style="color:#8e44ad; font-weight:bold;">공</div>`;
            } else if (st.includes("휴가")) {
                statusHtml = `<div class="cal-status" style="color:#8e44ad; font-weight:bold;">휴</div>`;
            } else if (st.includes("경조사")) {
                statusHtml = `<div class="cal-status" style="color:#8e44ad; font-weight:bold;">◎</div>`;
            } else {
                statusHtml = `<div class="cal-status" style="color:#27ae60; font-weight:bold;">○</div>`;
            }
        } else if (isTrainingDay && isSelectable) {
            statusHtml = `<div class="cal-status" style="color:#94a3b8; font-size:8px;">미등</div>`;
        } else if (!isTrainingDay && isCalendarWeekday(tempDate)) {
            statusHtml = `<div class="cal-status" style="color:#94a3b8; font-size:8px;">휴일</div>`;
        }
        
        let cls = "cal-day";
        if (isSelectable) {
            cls += " active dynamic-toggle-date";
        }
        if(selectedDates.includes(dateStr)) cls += " selected";
        
        html += `<div class="${cls}" id="cal_day_${dateStr}" data-date="${dateStr}">
                    <div style="pointer-events:none;">${dayStr}</div>
                    <div style="pointer-events:none;">${statusHtml}</div>
                 </div>`;
        
        tempDate.setDate(tempDate.getDate() + 1);
    }
    html += `</div>`;
    calArea.innerHTML = html;
}

// 📍 [신규 모터] 여러 날짜를 켜고 끄는 토글 방식 엔진
window.toggleDate = async function(dateStr) {
    const idx = selectedDates.indexOf(dateStr);
    let isAdded = false;

    if (idx > -1) {
        selectedDates.splice(idx, 1);
    } else {
        if (!hasStudentAttendanceForCounsel(currentStudent, dateStr)) {
            await appAlert(COUNSEL_NO_ATTENDANCE_WARNING);
        }
        selectedDates.push(dateStr);
        isAdded = true;
    }
    selectedDates.sort();
    
    document.querySelectorAll('.cal-day').forEach(el => {
        const d = el.id.replace('cal_day_', '');
        if(selectedDates.includes(d)) el.classList.add('selected');
        else el.classList.remove('selected');
    });
    
    renderDynamicForms();

    if (isAdded && currentUnitIndex > 0) {
        setTimeout(() => autoFillCounseling(dateStr), 50);
    }
};

// 📍 [신규 모듈] 클릭 시 복사 엔진 및 수정 잠금해제 엔진 (무소음 시각 피드백 탑재)
window.copyToClipboard = async function(el) {
    if (el.readOnly && el.value.trim() !== "") {
        let textToCopy = el.value;

        // 브라우저 클립보드 API 가동
        navigator.clipboard.writeText(textToCopy).then(() => {
            // 1. 기존 상태 백업
            let originalBg = el.style.backgroundColor;
            let originalColor = el.style.color;
            let originalWeight = el.style.fontWeight;
            let oldText = el.value;
            
            // 2. 시각적 타격감(피드백) 부여
            el.style.backgroundColor = "#d5f5e3"; // 연한 녹색 배경
            el.style.color = "#27ae60"; // 진한 녹색 글씨
            el.style.fontWeight = "bold";
            el.value = `✅ 복사 완료!\n(원하시는 곳에 붙여넣기 하세요)`;
            
            // 3. 1.2초 뒤 자동 원상 복구 (타이머)
            setTimeout(() => {
                el.style.backgroundColor = originalBg;
                el.style.color = originalColor;
                el.style.fontWeight = originalWeight;
                el.value = oldText;
            }, 1200);

        }).catch(async (err) => {
            await appAlert("❌ 클립보드 복사 권한이 필요하거나 지원하지 않는 브라우저입니다.");
        });
    }
};

window.enableEdit = function(id) {
    const el = document.getElementById(id);
    el.readOnly = false;
    el.style.backgroundColor = "#fff"; // 편집 가능 상태로 색상 변경
    el.style.borderStyle = "solid";
    el.focus();
};

// [6. 입력 폼 제어 및 자동기입 조립 공장]
function openForm(name, forceOpen = false) {
    if (!forceOpen && currentStudent === name) {
        selectMainView();
        return;
    }

    isMainView = false;
    renderTabs();
    currentStudent = name;
    
    document.querySelectorAll('.student-item').forEach(el => el.classList.remove('active'));
    const currentRow = document.getElementById(`student_row_${name}`);
    if(currentRow) currentRow.classList.add('active');
    
    const panel = document.getElementById('formPanel');
    panel.style.display = 'block';

    const dash = document.getElementById('dashboardPanel');
    if(dash) dash.style.display = 'none';
    
    renderSummaryCalendar();
    const summaryPanel = document.getElementById('summaryPanel');
    if (summaryPanel) summaryPanel.style.display = 'block';
    
    const unitMonthData = unitMonths[currentUnitIndex];
    const titleStart = unitMonthData.start.replace(/-/g, '.');
    const titleEnd = unitMonthData.end.replace(/-/g, '.');
    document.getElementById('formTitle').innerText = `📝 [${titleStart} ~ ${titleEnd}] ${name} 학생 상담`;
    
    const existingData = (counselingLogs[currentUnitIndex] && counselingLogs[currentUnitIndex][name]) || null;
    
    // 📍 구형 데이터 호환성 및 다중 날짜 로드
    let logsObj = {};
    if (existingData) {
        if (existingData.date && typeof existingData.date === 'string') {
            logsObj[existingData.date] = existingData; // 구형 포맷을 신형으로 래핑
        } else {
            logsObj = existingData; // 이미 신형인 경우
        }
    }
    selectedDates = Object.keys(logsObj).sort();
    
    // 📍 상담자 관련 로직 제거 및 렌더링 집중
    renderCalendar(name, unitMonthData); 
    renderDynamicForms();
}

// [6. 우측 구역에 선택된 날짜만큼 폼을 동적으로 찍어내는 공장]
function renderDynamicForms() {
    const area = document.getElementById('dynamicFormsArea');
    let html = "";
    
    // 현재 메모리에 저장된 데이터 확보
    const existingData = counselingLogs[currentUnitIndex]?.[currentStudent] || {};
    let logsObj = {};
    if (existingData.date && typeof existingData.date === 'string') {
        logsObj[existingData.date] = existingData; 
    } else {
        logsObj = existingData; 
    }

    // 📍 [정밀 피드백 엔진] 괄호 서식 정리 및 기초 데이터 생성
    let defaultContent = "";
    if (currentUnitIndex > 0) {
        const prevUnit = unitMonths[currentUnitIndex - 1]; 
        const attStats = calculateStudentAttendance(currentStudent, prevUnit.days); 
        
        const formatShortDate = (dateStr) => {
            const parts = dateStr.split('-');
            return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
        };
        const startStr = formatShortDate(prevUnit.start);
        const endStr = formatShortDate(prevUnit.end);
        
        let attFeedback = `출석률 ${attStats.rate}%`;
        if (attStats.rate !== "100.0") {
            let details = [];
            // 순결석이 있을 경우
            if (attStats.pureAbsent > 0) details.push(`순결석 ${attStats.pureAbsent}회`);
            
            // 지각/조퇴/외출 상세 구성
            let subDetails = [];
            if (attStats.lCount > 0) subDetails.push(`지각 ${attStats.lCount}회`);
            if (attStats.eCount > 0) subDetails.push(`조퇴 ${attStats.eCount}회`);
            if (attStats.oCount > 0) subDetails.push(`외출 ${attStats.oCount}회`);
            
            // 합산 결석 여부에 따른 텍스트 분기 (선생님 요청 서식 적용)
            if (attStats.penaltyAbs > 0) {
                details.push(`합산 결석 ${attStats.penaltyAbs}회(${subDetails.join(', ')})`);
            } else if (subDetails.length > 0) {
                details.push(`${subDetails.join(', ')}`);
            }
            
            if (details.length > 0) {
                // 📍 괄호 정리: 피드백[출석률 00% 상세이유] 서식으로 결합
                attFeedback = `${attStats.rate}% ${details.join(', ')}`;
            }
        }
        
        let feedbackTitle = "출결 피드백";
        if (currentUnitIndex === 1 && attStats.preEnroll > 0) feedbackTitle = "미편입 제외 출결 피드백";
        
        // 📍 [회차별 뼈대 조립기] 1~8회차 동기화
        let sessionNum = currentUnitIndex + 1;
        let isLastSession = (currentUnitIndex === unitMonths.length - 1);
        
        if (sessionNum === 1) {
            defaultContent = "실제 개인상담 후 작성예정.";
        } else {
            defaultContent = `지난 기간(${startStr}~${endStr}) ${feedbackTitle}[${attFeedback}]`;
            
            // 회차별 핵심 내용 결합
            switch(sessionNum) {
                case 2: defaultContent += ", 현재 수업 이해도, 학급분위기 적응상황"; break;
                case 3: defaultContent += ", 실습 적응도, 훈련 피로도"; break;
                case 4: defaultContent += ", 이론과 실습의 연계성 이해 및 특이사항"; break;
                case 5: defaultContent += ", 심화 정비 실습 고난도 작업 시 안전의식"; break;
                case 6: defaultContent += ", 필기 및 실기 시험 준비 및 진로방향"; break;
                case 7: defaultContent += ", 희망 취업처 조건, 수료 후 계획"; break;
                case 8: defaultContent += ", 수료 후 시험 준비계획"; break; 
            }

            // [월 센서] 단위기간 종료월 기준 자격증 추가
            let endMonth = parseInt(prevUnit.end.split('-')[1], 10);
            if ([1, 3, 6, 9].includes(endMonth)) defaultContent += ", 자기개발관련(자격증 취득관련)";

            // [종점 센서] 마지막 회차 취업 추가
            if (isLastSession) defaultContent += ", 취업 희망 분야 및 취업 준비 상황";

            // [배기구 고정]
            defaultContent += ", 개인 고민 등에 대해 상담함.";
        }
    }

    // 📍 [시동 전 예열 모드] 선택된 날짜가 없을 때 기초 자료 상시 노출
    if (selectedDates.length === 0) {
        area.innerHTML = `
        <div style="background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
            <h4 style="margin: 0 0 8px 0; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; font-size: 13px;">
                📋 상담 기초 자료 (이전 단위기간 출결 분석)
            </h4>
            <div style="font-size: 12px; line-height: 1.6; color: #1e293b; background: #fff; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
                ${defaultContent || "데이터를 불러오는 중입니다..."}
            </div>
            <p style="text-align:center; color:#94a3b8; font-size:11px; margin-top:10px; font-weight:bold;">
                👈 좌측 달력에서 날짜를 선택하면 상담 기록이 시작됩니다.
            </p>
        </div>`;
        return;
    }

    // 선택된 날짜 배열을 순회하며 폼 생성
    selectedDates.forEach((dateStr) => {
        const log = logsObj[dateStr] || {};
        const contentVal = log.content || defaultContent; 
        const actionVal = log.action || "";
        const showMetaCopy = isPersistedCounselLog(log);
        const counselDateVal = log.counselDate || formatCounselDisplayDate(dateStr);
        const counselorVal = log.counselor || currentTeacherName || "";
        const noAttWarningHtml = hasStudentAttendanceForCounsel(currentStudent, dateStr) ? "" : `
            <div style="margin-bottom: 8px; padding: 8px 10px; border-radius: 6px; background: #fff7ed; border: 1px solid #f5cba7; color: #c0392b; font-size: 11px; line-height: 1.45; font-weight: bold;">
                일일출석부 미등록으로 출결확인 불가. 출결정보를 꼭 확인 후 상담작성 하세요.
            </div>`;

        html += `
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 10px;">
            <h4 style="margin: 0 0 8px 0; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; font-size: 13px;">
                📅 ${dateStr} 상담 기록
            </h4>
            ${noAttWarningHtml}
            ${showMetaCopy ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="margin-bottom: 3px; font-size: 11px;">저장 일자 <span style="color:#94a3b8; font-weight:normal;">(클릭 복사)</span></label>
                    <input type="text" id="counselDate_${dateStr}" class="form-control dynamic-copy" value="${counselDateVal}" readonly style="font-size: 12px; padding: 6px;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="margin-bottom: 3px; font-size: 11px;">상담자 <span style="color:#94a3b8; font-weight:normal;">(클릭 복사)</span></label>
                    <input type="text" id="counselor_${dateStr}" class="form-control dynamic-copy" value="${counselorVal}" readonly style="font-size: 12px; padding: 6px;">
                </div>
            </div>
            ` : ""}
            
            <div class="form-group" style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                    <label style="margin-bottom: 0; font-size: 11px;">상담내용</label>
                    <div>
                        <button type="button" class="btn-edit dynamic-auto-fill" style="padding: 2px 5px; color: #fff; background-color: #3498db; border-color: #3498db;" data-date="${dateStr}">🤖 자동 랜덤</button>
                        <button type="button" class="btn-edit dynamic-enable-edit" style="padding: 2px 5px;" data-target="content_${dateStr}">✏️ 수정</button>
                    </div>
                </div>
                <textarea id="content_${dateStr}" class="form-control dynamic-copy" style="min-height: 50px; font-size: 12px; padding: 6px;" readonly>${contentVal}</textarea>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                    <label style="margin-bottom: 0; font-size: 11px;">조치내용</label>
                    <button type="button" class="btn-edit dynamic-enable-edit" style="padding: 2px 5px;" data-target="action_${dateStr}">✏️ 수정</button>
                </div>
                <textarea id="action_${dateStr}" class="form-control dynamic-copy" style="min-height: 70px; font-size: 12px; padding: 6px; line-height: 1.5;" readonly>${actionVal}</textarea>
            </div>
        </div>
        `;
    });
    area.innerHTML = html;
}

// [7. 파이어베이스 송신부]
function renderSummaryCalendar() {
    const sumArea = document.getElementById('summaryCalendarArea');
    const unitMonth = unitMonths[currentUnitIndex];
    if (!unitMonth) { sumArea.innerHTML = "해당 회차 정보가 없습니다."; return; }

    const logs = counselingLogs[currentUnitIndex] || {};
    const dailyCounts = {};
    
    Object.values(logs).forEach(studentLog => {
        if (studentLog.date && typeof studentLog.date === 'string') {
            dailyCounts[studentLog.date] = (dailyCounts[studentLog.date] || 0) + 1;
        } else {
            Object.keys(studentLog).forEach(date => {
                dailyCounts[date] = (dailyCounts[date] || 0) + 1;
            });
        }
    });

    const start = new Date(unitMonth.start);
    const end = new Date(unitMonth.end);
    
    let html = `<div class="cal-grid">`;
    const daysOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
    daysOfWeek.forEach(d => html += `<div class="cal-header" style="font-size:8px;">${d}</div>`);

    const startDayOfWeek = start.getDay();
    for(let i=0; i<startDayOfWeek; i++) { html += `<div></div>`; }

    let tempDate = new Date(start);
    while(tempDate <= end) {
        const dateStr = tempDate.toISOString().split('T')[0];
        // 📍 [날짜 압축] 12월 1일 -> 12.1 형식으로 변경
        const dayStr = `<span style="font-size:8.5px; font-weight:normal; letter-spacing:-0.8px;">${tempDate.getMonth() + 1}.${tempDate.getDate()}</span>`;
        
        let countHtml = "";
        let cls = "cal-day";
        
        if (validTrainingDays.includes(dateStr)) {
            cls += " active";
            const count = dailyCounts[dateStr] || 0;
            if (count > 0) {
                countHtml = `<div class="cal-status" style="color:#2980b9; font-weight:bold; font-size:9px; margin-top:1px;">${count}명</div>`;
            } else {
                countHtml = `<div class="cal-status" style="color:#cbd5e1; margin-top:1px; font-size:8px;">-</div>`;
            }
        } else if (isCalendarWeekday(tempDate)) {
            countHtml = `<div class="cal-status" style="color:#94a3b8; font-size:8px; margin-top:1px;">휴일</div>`;
        }
        
        html += `<div class="${cls}" style="cursor:default; padding: 2px 0; white-space:nowrap; overflow:hidden;">${dayStr}${countHtml}</div>`;
        tempDate.setDate(tempDate.getDate() + 1);
    }
    html += `</div>`;
    sumArea.innerHTML = html;
    document.getElementById('summaryPanel').style.display = 'block';
}

// [7. 파이어베이스 송신 및 다중 날짜 저장 엔진 - 정밀 수리 버전]
// [7. 파이어베이스 송신 및 다중 날짜 저장 엔진 - 공백 저장 허용 버전]
async function saveLog() {
    if (!currentStudent || currentStudent === "") { 
        await appAlert("학생이 선택되지 않았습니다. 좌측 명단에서 학생을 먼저 클릭해주세요."); 
        return; 
    }
    
    // 📍 [수리] "selectedDates.length === 0"일 때 막았던 체크 로직을 삭제했습니다.
    // 이제 날짜를 하나도 선택하지 않고 저장하면 해당 학생의 상담 기록이 '비워짐'으로 처리됩니다.
    
    let newLogsObj = {};
    let hasError = false;

    selectedDates.forEach(dateStr => {
        const contentEl = document.getElementById(`content_${dateStr}`);
        const actionEl = document.getElementById(`action_${dateStr}`);
        
        try {
            const contentValue = contentEl ? contentEl.value : "";
            const actionValue = actionEl ? actionEl.value : "";
            
            newLogsObj[dateStr] = {
                content: contentValue,
                action: actionValue,
                counselDate: formatCounselDisplayDate(dateStr),
                counselor: currentTeacherName || "",
                updatedAt: new Date().toISOString()
            };
        } catch (e) {
            console.error(`${dateStr} 데이터 수집 중 오류:`, e);
            hasError = true;
        }
    });

    if (hasError) {
        await appAlert("일부 날짜의 데이터를 읽어오지 못했습니다. 화면을 새로고침 후 다시 시도해주세요.");
        return;
    }

    try {
        if (selectedDates.length === 0) {
            await classDbRef(`counselingLogs/${currentUnitIndex}/${currentStudent}`).remove();
            if(counselingLogs[currentUnitIndex]) delete counselingLogs[currentUnitIndex][currentStudent]; // 📍 메모리 잔유 제거
            await appAlert(`✅ ${currentStudent} 학생의 상담 기록이 초기화(미작성)되었습니다.`);
        } else {
            await classDbRef(`counselingLogs/${currentUnitIndex}/${currentStudent}`).set(newLogsObj);
            if(!counselingLogs[currentUnitIndex]) counselingLogs[currentUnitIndex] = {};
            counselingLogs[currentUnitIndex][currentStudent] = newLogsObj;
            await appAlert(`✅ ${currentStudent} 학생의 상담 기록(${selectedDates.length}건)이 저장되었습니다.`);
        }
        
        renderStudentList(); 
        openForm(currentStudent, true); 
        renderSummaryCalendar();
        
    } catch (err) {
        console.error("파이어베이스 전송 오류:", err);
        await appAlert("저장 실패: 권한 설정을 확인해주세요.");
    }
}

// ==========================================
// 📍 [신규 모터] AI 자동 완성 펌프 엔진 (OBD 진단기 탑재)
// ==========================================
async function autoFillCounseling(dateStr) {
    if (!window.counselingActionDB) {
        await appAlert("상담일지조치.js 데이터베이스가 연결되지 않았습니다.");
        return;
    }

    // 1. 학생 나이/성별 추출 센서 가동
    let ageNum = 0;
    let genderStr = "";
    for (let d of validTrainingDays) {
        if (fullAttendanceData[d] && fullAttendanceData[d][currentStudent]) {
            const info = fullAttendanceData[d][currentStudent];
            if (info.birthDate && ageNum === 0) {
                const birthYear = parseInt(info.birthDate.split('.')[0], 10);
                ageNum = new Date().getFullYear() - birthYear;
            }
            if (info.gender && genderStr === "") genderStr = info.gender;
            if (ageNum > 0 && genderStr !== "") break;
        }
    }

    // 2. 현재 반 데이터베이스 로드 (없으면 '테스트' 순정 모드)
    let classDB = window.counselingActionDB[currentClass] || window.counselingActionDB["테스트"];
    
    // 3. 상담내용 (Content) 조립 
    const prevUnit = unitMonths[currentUnitIndex > 0 ? currentUnitIndex - 1 : 0];
    const attStats = calculateStudentAttendance(currentStudent, prevUnit.days);
    
    let attFeedback = `${attStats.rate}%`;
    if (attStats.rate !== "100.0") {
        let details = [];
        if (attStats.pureAbsent > 0) details.push(`순결석 ${attStats.pureAbsent}회`);
        let subDetails = [];
        if (attStats.lCount > 0) subDetails.push(`지각 ${attStats.lCount}회`);
        if (attStats.eCount > 0) subDetails.push(`조퇴 ${attStats.eCount}회`);
        if (attStats.oCount > 0) subDetails.push(`외출 ${attStats.oCount}회`);
        if (attStats.penaltyAbs > 0) details.push(`합산결석 ${attStats.penaltyAbs}회(${subDetails.join(',')})`);
        else if (subDetails.length > 0) details.push(subDetails.join(','));
        if (details.length > 0) attFeedback += ` ${details.join(', ')}`;
    }

    const startStr = prevUnit.start.split('-')[1] + "/" + prevUnit.start.split('-')[2];
    const endStr = prevUnit.end.split('-')[1] + "/" + prevUnit.end.split('-')[2];
    
    let contentBase = "";
    let sessionNum = currentUnitIndex + 1;
    let isLast = (currentUnitIndex === unitMonths.length - 1);
    let finalContent = "";
    
    if (sessionNum === 1) {
        finalContent = "실제 개인상담 후 작성예정.";
    } else {
        contentBase = `지난 기간(${startStr}~${endStr}) 출결 피드백[${attFeedback}]`;
        switch(sessionNum) {
            case 2: contentBase += ", 현재 수업 이해도, 학급분위기 적응상황"; break;
            case 3: contentBase += ", 실습 적응도, 훈련 피로도"; break;
            case 4: contentBase += ", 이론과 실습의 연계성 이해 및 특이사항"; break;
            case 5: contentBase += ", 심화 정비 실습 고난도 작업 시 안전의식"; break;
            case 6: contentBase += ", 필기 및 실기 시험 준비 및 진로방향"; break;
            case 7: contentBase += ", 희망 취업처 조건, 수료 후 계획"; break;
            case 8: contentBase += ", 수료 후 시험 준비계획"; break; 
        }

        let month = parseInt(dateStr.split('-')[1], 10);
        let hasCert = [1, 3, 6, 9].includes(month);
        if (hasCert) contentBase += ", 자기개발관련(자격증 취득관련)";
        if (isLast) contentBase += ", 취업 희망 분야 및 취업 준비 상황";

        finalContent = contentBase + ", 개인 고민 등에 대해 상담함.";
    }

    // 4. 조치내용 (Action) 랜덤 분사기 (고장 진단기 장착)
    let actions = [];
    const pickRandom = (arr) => arr ? arr[Math.floor(Math.random() * arr.length)] : "";

    if (sessionNum > 1) {
        // 4-1. 출결 조치
        let attKey = (attStats.rate === "100.0") ? "perfect" : "imperfect";
        if (classDB.attendance && classDB.attendance[attKey]) {
            actions.push(pickRandom(classDB.attendance[attKey])); // 📍 대괄호와 하이픈 탈거
        } else {
            actions.push("[시스템 알림] 출결 데이터 누락됨");
        }

        // 4-2. 회차별 적응 조치
        let sessKey = "session_" + sessionNum;
        if (!classDB[sessKey]) {
            actions.push(`[시스템 알림] ${currentClass}반의 ${sessKey}(${sessionNum}회차) DB가 존재하지 않습니다.`);
        } else {
            let sAgeKey = "age_under_26";
            if (ageNum >= 49) sAgeKey = "age_49_over";
            else if (ageNum >= 37) sAgeKey = "age_37_to_48";
            else if (ageNum >= 27) sAgeKey = "age_27_to_36";
            if (genderStr === "여" && classDB[sessKey]["female"]) sAgeKey = "female";

            if (classDB[sessKey][sAgeKey]) {
                actions.push(pickRandom(classDB[sessKey][sAgeKey])); // 📍 타이틀(sTitle)과 하이픈 탈거
            } else {
                actions.push(`[시스템 알림] ${sessKey} 내부에 '${sAgeKey}' 나이 데이터가 없습니다.`);
            }
        }

        // 4-3. 자격증 조치
        let month = parseInt(dateStr.split('-')[1], 10);
        let hasCert = [1, 3, 6, 9].includes(month);
        if (hasCert && classDB.certificate) {
            let cAgeKey = "age_under_33";
            if (ageNum >= 43) cAgeKey = "age_43_over";
            else if (ageNum >= 34) cAgeKey = "age_34_to_42";
            if (classDB.certificate[cAgeKey]) {
                actions.push(pickRandom(classDB.certificate[cAgeKey])); // 📍 대괄호와 하이픈 탈거
            }
        }

        // 4-4. 취업 조치
        if (isLast && classDB.job) {
            let jAgeKey = "age_under_29";
            if (ageNum >= 40) jAgeKey = "age_40_over";
            else if (ageNum >= 30) jAgeKey = "age_30_to_39";
            if (classDB.job[jAgeKey]) {
                actions.push(pickRandom(classDB.job[jAgeKey])); // 📍 대괄호와 하이픈 탈거
            }
        }
    }

    // 5. 화면에 분사
    let finalAction = actions.join(" ");
    let contentEl = document.getElementById(`content_${dateStr}`);
    let actionEl = document.getElementById(`action_${dateStr}`);
    
    if (contentEl) {
        contentEl.value = finalContent;
        contentEl.style.backgroundColor = "#fff"; 
        contentEl.style.borderStyle = "solid";
        contentEl.readOnly = false; 
    }
    if (actionEl) {
        actionEl.value = finalAction;
        actionEl.style.backgroundColor = "#fff";
        actionEl.style.borderStyle = "solid";
        actionEl.readOnly = false;
    }
    
    if(contentEl.animate) {
        contentEl.animate([{ backgroundColor: '#bbdefb' }, { backgroundColor: '#fff' }], { duration: 800 });
        actionEl.animate([{ backgroundColor: '#bbdefb' }, { backgroundColor: '#fff' }], { duration: 800 });
    }
}


// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 위임 기술 적용)

document.addEventListener('DOMContentLoaded', () => {
    // 1. 고정 네비게이션 및 저장 버튼 연결
    document.getElementById('btnGoStudentResume')?.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = classNavHref('학생이력서확인.html');
    });
    document.getElementById('btn_nav_month')?.addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('단위개월출석부.html'); });
    document.getElementById('btn_nav_main')?.addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('index1.html'); });
    document.getElementById('btn_save_log').addEventListener('click', saveLog);

    // 2. 📍 [수리 완료] 화면 전체의 동적 클릭을 감지하는 강력한 통합 센서 장착
    document.addEventListener('click', function(e) {
        
        // ① 좌측 학생 명단 클릭 감지
        const studentBtn = e.target.closest('.dynamic-open-form');
        if (studentBtn) {
            openForm(studentBtn.getAttribute('data-name'));
            return; // 찾았으면 엔진 정지 (연비 최적화)
        }

        // ② 중앙 달력 날짜 클릭 감지
        const dateBtn = e.target.closest('.dynamic-toggle-date');
        if (dateBtn) {
            toggleDate(dateBtn.getAttribute('data-date'));
            return;
        }

        // ③ 우측 폼 내부 버튼/텍스트상자 클릭 감지
        const autoBtn = e.target.closest('.dynamic-auto-fill');
        const editBtn = e.target.closest('.dynamic-enable-edit');
        const copyArea = e.target.closest('.dynamic-copy');

        if (autoBtn) {
            autoFillCounseling(autoBtn.getAttribute('data-date'));
        } else if (editBtn) {
            enableEdit(editBtn.getAttribute('data-target'));
        } else if (copyArea) {
            copyToClipboard(copyArea);
        }
    });
});