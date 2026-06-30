
/**
 * =============================================================================
 * [CORE — AI·개발자 필독] start/일일출석부.js
 * =============================================================================
 * 일일 출석부 업로드·날짜 목록·진행과목 표시의 핵심 화면입니다.
 * 집/회사/노트북 등 여러 PC에서 Cursor AI로 지속 수정 중 — 임의 대규모 변경 금지.
 *
 * ⚠️ 휴일·수업 행 판별( index1·능력단위시간표와 동일 규칙 — 반드시 유지 ):
 *    - isStudyTimetableRow: 교과목 + 능력단위명 둘 다 있을 때만 훈련일·진행과목
 *
 * ⚠️ 연관 핵심: start/index1.js, start/능력단위시간표.js
 * ⚠️ copy 파일명 백업은 사용자 요청 없이 수정하지 말 것 (.cursor/rules 참고)
 * =============================================================================
 */

// [개조] 브라우저에 저장된 해당 반의 DB 설정을 가져옵니다.
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};

// 2. [엔진 시동] 파이어베이스 초기화
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth(); // 📍 보안 인증 객체 생성
initClassContext();

// 3. [보안 검문소] 관리자 인증 후 데이터 로드
const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged(async (user) => {
    // 1. 브라우저 저장소에서 비밀번호를 가져옵니다.
    const savedPw = localStorage.getItem('adminPw');
    const reportBtn = document.getElementById('btnReportMode');

    if (user) {
        // ✅ [상황 1] 이미 로그인된 상태
        isAdmin = true;
        console.log("🔒 보안 인증 확인됨: " + firebaseConfig.projectId);
        
        // 관리자 전용 버튼 표시
        if(reportBtn) reportBtn.style.display = 'inline-block';
        
        // 정비소 시스템 가동
        initialize(); 
    } else if (savedPw) {
        // 🔑 [상황 2] 자동 로그인 시도 (비밀번호 저장됨)
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .then(() => {
                isAdmin = true;
                console.log("🔒 보안 인증 성공! 관리자 권한을 획득했습니다.");
                
                if(reportBtn) reportBtn.style.display = 'inline-block';
                
                initialize(); 
            })
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                // 기존의 '그냥 시동' 로직을 폐기하고 보안을 위해 퇴거 조치합니다.
                await appAlert("인증 정보가 만료되었습니다. 다시 로그인해주세요.");
                location.href = "../index.html"; 
            });
    } else {
        // ⚠️ [상황 3] 인증 정보가 전혀 없음
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        await appAlert("보안 인증이 필요한 페이지입니다.");
        location.href = "../index.html"; 
    }
});

let currentClass = window.currentClass;
document.getElementById('dispClass').innerText = formatClassHudText();

let rawTimetable = [];
let uploadedDates = {};
let masterCourses = [];
let selectedTargetDate = "";
window.masterSubjectList = [];
window.ncsList = [];
let defaultViewMode = localStorage.getItem(classStorageKey('defaultViewMode')) || 'subject';
let dropoutData = {}; // 📍 중도탈락자 명단 저장소
let earlyCompletionData = {}; // 📍 [신규] 조기수료자 명단 저장소
let deletedLogs = {}; // 📍 영구 삭제 이력 저장소

/** 훈련생용 출석 페이지 캐시 무효화용 revision (학생 페이지가 1회만 전체 스캔) */
function bumpStudentDataRevision() {
    const rev = Date.now();
    return classDbRef('studentDataRevision').set(rev).catch(err => {
        console.warn('studentDataRevision 갱신 실패:', err);
    });
}

function formatExcelTime(val) {
    if (!val || val === "-" || val === "") return "00:00:00";
    if (typeof val === 'number') {
        let totalSeconds = Math.round(val * 86400);
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        let s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return String(val).trim();
}
// 1. [날짜 정밀 교정] 어떤 형식이 들어와도 YYYY-MM-DD로 변환합니다.
function getFixDate(rawDate) {
    if (!rawDate) return "";
    let s = String(rawDate).trim();
    
    // 2025.08.13 -> 2025-08-13 (마침표 제거)
    s = s.replace(/\./g, '-');
    
    // 08/13/25 (엑셀 날짜 형식) 처리
    if (s.includes('/')) {
        let parts = s.split('/');
        if (parts.length === 3) {
            // 연도가 2글자(25)면 20을 붙여 4글자(2025)로 만듬
            let year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
            let month = parts[0].padStart(2, '0');
            let day = parts[1].padStart(2, '0');
            s = `${year}-${month}-${day}`;
        }
    }
    
    // 최종적으로 10글자(YYYY-MM-DD)만 남깁니다.
    return s.substring(0, 10);
}

// 2. [초기화 로직] 실시간 수신기를 안정화합니다.
function initialize() {
    // 과정 정보 로드
    classDbRef('masterData').once('value', snap => {
        const d = snap.val() || {};
        document.getElementById('courseInfo').innerText = `${d.name || ""} (${d.period || ""})`;
    });

    // 📍 [연비 모드] 실시간 감시(on)를 1회 호출(once)로 교체하여 데이터 절약
    classDbRef('dailyAttendance').once('value', snap => {
        uploadedDates = snap.val() || {};
        renderDateList();
    });

    // 전체 시간표 로드 (표준화된 날짜로 목록 생성)
    classDbRef('fullTimetable').once('value', snap => {
        rawTimetable = snap.val() || [];
        renderDateList();
    });
}

/** [CORE] index1 processTimetable studyRows와 동일: 교과목·능력단위명이 모두 있을 때만 수업 행 (휴일 제외) */
function isStudyTimetableRow(row) {
    if (!row || String(row.교시 || "").trim() === "점심") return false;
    const subjectName = String(row.교과목 || "").trim();
    const unitName = String(row.능력단위 || "").trim();
    return subjectName !== "" && unitName !== "";
}

// [수정] 목록 출력 로직 - 능력단위시간표의 필터링 방식을 적용
function renderDateList() {
    const tbody = document.getElementById('dateListBody');
    if (rawTimetable.length === 0) return;

    // 📍 [수정] select 대신 전역 변수 defaultViewMode 사용
    const displayMode = defaultViewMode;

    const dayMap = {};
    rawTimetable.forEach(row => {
        const d = getFixDate(row.날짜);
        if(!d) return;

        // 1. 회차(일수) 정보 세척
        let dayNumRaw = row.일수;
// 📍 [수리] 1/1, 1/2 형식이 들어올 경우 앞의 숫자만 추출하거나 
// 형식을 유지하되 중복 계산되지 않도록 처리
let dayNumStr = dayNumRaw ? String(dayNumRaw).trim() : "";

// 만약 '1/1' 형태라면, 통계 계산을 위해 순수 숫자만 뽑아낸 변수를 별도로 관리해야 함
let pureDayNum = dayNumStr.includes('/') ? dayNumStr.split('/')[0] : dayNumStr;
        
        // 2. 과목명, 능력단위, 장소, 교시 데이터 추출 배선 연결
        const subjectName = row.교과목 ? String(row.교과목).trim() : "";
        const unitName = row.능력단위 ? String(row.능력단위).trim() : "";
        const locationName = row.장소 ? String(row.장소).trim() : "미지정";
        const periodNum = parseInt(row.교시) || 0;
        
        // [핵심 필터] index1과 동일: 교과목+능력단위 동시 존재 시에만 훈련일·진행과목으로 인식
        if (dayNumStr === "" || dayNumStr === "-" || !isStudyTimetableRow(row)) {
            return; 
        }

        if(!dayMap[d]) {
            dayMap[d] = { 
                date: d, 
                dayNum: dayNumStr, 
                weekday: row.요일 || "", 
                amList: new Set(), // 오전 임시 저장소
                pmList: new Set()  // 오후 임시 저장소
            };
        }
        
        // 선택된 스위치에 따라 이름 결정
        const targetName = (displayMode === 'ncs' && unitName !== "") ? unitName : subjectName;
        
        // 📍 [장소 도색 작업] 장소 텍스트에만 시각적 강조 색상(주황색) 코팅 적용
        const displayString = `${targetName}-<span style="color:#e67e22; font-weight:bold;">${locationName}</span>`;

        // 교시 번호에 따라 오전/오후 구동축으로 배분
        if (periodNum > 0 && periodNum <= 4) {
            dayMap[d].amList.add(displayString);
        } else if (periodNum >= 5) {
            dayMap[d].pmList.add(displayString);
        }
    });

    const sortedDates = Object.keys(dayMap).sort();
    
    const totalDays = sortedDates.length;
    let doneCount = 0;

    sortedDates.forEach(dKey => {
        if (uploadedDates[dKey]) doneCount++; 
    });

    const noneCount = totalDays - doneCount; 

    document.getElementById('totalWorkDays').innerText = totalDays;
    document.getElementById('doneWorkDays').innerText = doneCount;
    document.getElementById('noneWorkDays').innerText = noneCount;

    if (sortedDates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:50px; color:#999;">표시할 실제 훈련일이 없습니다.</td></tr>`;
        return;
    }

    // [renderDateList 함수 내부 수정 구간]
tbody.innerHTML = sortedDates.map(dKey => {
    const info = dayMap[dKey];
    const dayData = uploadedDates[dKey] || {}; 
    const isDone = uploadedDates[dKey] ? true : false;
    
    // 1. 과목/장소 텍스트 생성
    let timeStrings = [];
    if (info.amList.size > 0) timeStrings.push(`(오전)${Array.from(info.amList).join(', ')}`);
    if (info.pmList.size > 0) timeStrings.push(`(오후)${Array.from(info.pmList).join(', ')}`);
    const finalSubjectText = timeStrings.join('<br>');

    // 2. 직권 신청 및 외출 상태 정밀 감지
    let hasPendingRequest = false;
    let hasOutingRequest = false;

    Object.values(dayData).forEach(student => {
        if (student && typeof student === 'object' && student.status) {
            if (student.status.includes("(신청)")) {
                hasPendingRequest = true;
                if (student.status.includes("외출")) {
                    hasOutingRequest = true;
                }
            }
        }
    });

    const meta = dayData._metadata || null;
    const fileName = meta ? meta.fileName : "";
    const uploadTime = meta ? meta.uploadTime : "";

    return `
        <tr>
            <td class="dynamic-show-detail" data-date="${dKey}" data-daynum="${info.dayNum}" style="cursor:pointer; text-decoration:underline; color:#2980b9; font-weight:bold;">${info.dayNum}회차</td>
            <td><strong>${info.date}</strong><br><span style="font-size:11px; color:#555;">(${info.weekday})</span></td>
            <td style="text-align:left; font-size:12px; line-height:1.5;">${finalSubjectText}</td>
            <td><span class="status-badge ${isDone ? 'status-done' : 'status-none'}">${isDone ? '✔ 완료' : '미등록'}</span></td>
            
            <td style="padding: 5px 2px; vertical-align: top;">
                <button class="btn btn-upload dynamic-trigger-upload" data-date="${info.date}" style="padding: 4px 6px; font-size: 10px; min-width: 60px; width:100%;">
                    ${isDone ? '재업로드' : '파일찾기'}
                </button>
                ${isDone ? `
                    <div style="font-size: 8px; color: #888; margin-top: 4px; line-height: 1.2;">
                        ${fileName ? `📄 ${fileName}<br>` : ''}
                        ⏰ ${uploadTime || '기록없음'}
                    </div>
                ` : ''}
            </td>

            <td style="padding: 5px 2px; vertical-align: middle;">
                ${hasPendingRequest ? `
                    <div style="background: #fff3e0; color: #e65100; border: 1px solid #ffcc80; padding: 4px 2px; border-radius: 4px; font-size: 9px; font-weight: bold; line-height: 1.3; animation: glow-pulse 2s infinite;">
                        ⚠️ 직권신청 중
                        ${hasOutingRequest ? `<hr style="margin:2px 0; border:0; border-top:1px dashed #ffcc80;"><span style="color:#d35400;">🏃 외출 신청</span>` : ''}
                    </div>
                ` : `
                    <div style="font-size: 9px; color: #ccc;">-</div>
                `}
            </td>
        </tr>`;
}).join('');
}

// initialize 함수 내부에 masterSubjectList와 ncsList를 뽑아내는 로직도 추가되어야 합니다.
async function initialize() {
    // 1. [수리] 로그 및 조기수료 데이터 로드 배선 추가
    const [masterSnap, attSnap, timetableSnap, userConfigSnap, dropoutSnap, earlySnap, logsSnap] = await Promise.all([
        classDbRef('masterData').once('value'),
        classDbRef('dailyAttendance').once('value'),
        classDbRef('fullTimetable').once('value'),
        classDbRef('userConfig/defaultView').once('value'),
        classDbRef('dropouts').once('value'),
        classDbRef('earlyCompletions').once('value'), // 📍 [연결] 조기수료 DB 수신
        classDbRef('deletedLogs').once('value')
    ]);

    // 2. 과정 정보 및 과목 리스트 추출
    const d = masterSnap.val() || {};
    const infoEl = document.getElementById('courseInfo');
    if(infoEl) infoEl.innerText = `${d.name || ""} (${d.period || ""})`;
    
    if(d.courses) {
        masterCourses = d.courses;
        window.masterSubjectList = [...new Set(d.courses.map(c => c.subject))];
        window.ncsList = [...new Set(d.courses.filter(c => c.unit).map(c => c.unit))];
    }

    rawTimetable = normalizeTimetableRows(timetableSnap.val());
    ({ masterSubjectList: window.masterSubjectList, ncsList: window.ncsList } =
        hydrateSubjectListsFromTimetable(rawTimetable, window.masterSubjectList, window.ncsList));

    // 3. 출석 및 시간표 데이터 동기화
    uploadedDates = attSnap.val() || {};
    dropoutData = dropoutSnap.val() || {}; 
    earlyCompletionData = earlySnap.val() || {}; // 📍 [장착] 조기수료 데이터 보관
    deletedLogs = logsSnap.val() || {};
    
    // 4. [수리] 설정값 동기화 (보관함 이름 통일 및 규격 검증)
    const dbViewMode = userConfigSnap.val();
    if (dbViewMode === 'subject' || dbViewMode === 'ncs') { // 📍 'ncs'로 명칭 통일
        defaultViewMode = dbViewMode;
        localStorage.setItem(classStorageKey('defaultViewMode'), dbViewMode);
    }

    // 5. UI 갱신 (라디오 버튼)
    const radio = document.querySelector(`input[name="defaultView"][value="${defaultViewMode}"]`);
    if(radio) radio.checked = true;

    renderDateList();
    updateSideMonitor();
    updateDirectAuthMonitor();
    tryScrollToFirstEmptyFromUrl();
    if (typeof loadCohortLabelFromDb === 'function') loadCohortLabelFromDb();
    else if (typeof refreshClassHud === 'function') refreshClassHud();
}

// 📍 [신규 함수] 사이드 모니터 출력 엔진
function updateSideMonitor() {
    const listEl = document.getElementById('sideMonitorList');
    if (!listEl) return;

    // 1. 중도탈락 명단 생성
    const dropoutNames = Object.keys(dropoutData);
    let dropoutHTML = dropoutNames.sort((a, b) => dropoutData[b].localeCompare(dropoutData[a])).map(name => `
        <div class="dropout-item">
            <strong>🚫 ${name}</strong>
            탈락일: <span>${dropoutData[name]}</span>
        </div>
    `).join('');

    // 📍 [신규] 조기수료 명단 생성
    const earlyNames = Object.keys(earlyCompletionData);
    let earlyHTML = earlyNames.sort((a, b) => earlyCompletionData[b].localeCompare(earlyCompletionData[a])).map(name => `
        <div class="dropout-item" style="background:#f4f9fd; border-color:#bbdefb;">
            <strong>🎓 ${name}</strong>
            조수일: <span style="color:#2980b9;">${earlyCompletionData[name]}</span>
        </div>
    `).join('');

    if (dropoutNames.length === 0 && earlyNames.length === 0) {
        dropoutHTML = '<div style="color:#ccc; text-align:center; padding:10px; font-size:11px;">해당 학생 없음</div>';
    }

    // 2. 영구 삭제 로그 섹션 생성
    const deleteNames = Object.keys(deletedLogs);
    let logHTML = deleteNames.sort((a, b) => deletedLogs[b].localeCompare(deletedLogs[a])).map(name => `
        <div class="delete-log-card">
            <strong>🗑️ ${name}</strong>
            삭제시각: ${deletedLogs[name]}
        </div>
    `).join('');

    if (deleteNames.length === 0) logHTML = '<div style="color:#eee; text-align:center; padding:10px; font-size:11px;">삭제 이력 없음</div>';

    // 3. 통합 출력
    listEl.innerHTML = `
        <div style="margin-top:5px;">${dropoutHTML}${earlyHTML}</div>
        <div class="monitor-title" style="margin-top:20px; color:#7f8c8d; border-color:#eee; font-size:12px;">🕒 영구 삭제 이력</div>
        <div style="margin-top:5px;">${logHTML}</div>
    `;
}

function cleanDirectAuthCompareText(value) {
    return String(value || '').replace(/\s+/g, '');
}

function updateDirectAuthMonitor() {
    if (typeof DirectAuthAPI === 'undefined') return;

    const listEl = document.getElementById('directAuthList');
    const countEl = document.getElementById('directAuthSectionCount');
    const labelEl = document.getElementById('directAuthUnitLabel');
    const ddayEl = document.getElementById('directAuthDdayLabel');
    if (!listEl) return;

    const subjectList = [...new Set(masterCourses.map(c => cleanDirectAuthCompareText(c.subject)).filter(Boolean))];
    const unitList = [...new Set(masterCourses.map(c => cleanDirectAuthCompareText(c.unit)).filter(Boolean))];
    const timetableRows = Array.isArray(rawTimetable) ? rawTimetable : Object.values(rawTimetable || {});
    const todayKey = DirectAuthAPI.getTodayDateKey();

    const directAuthData = DirectAuthAPI.buildDirectAuthList({
        dailyAttendance: uploadedDates,
        rawTimetable: timetableRows,
        subjectList,
        unitList,
        todayKey
    });

    DirectAuthAPI.renderAlertPanel(listEl, countEl, labelEl, directAuthData, ddayEl, todayKey);
}

// 📍 [신규] 보기 설정 저장 및 갱신 함수 (참고 파일에서 이식)
async function saveDefaultView(mode) {
    try {
        await classDbRef('userConfig').update({ defaultView: mode });
        // 📍 보관함 키값에 반 이름을 붙여 능력단위시간표와 통일합니다.
        localStorage.setItem(classStorageKey('defaultViewMode'), mode); 
        
        defaultViewMode = mode;
        renderDateList(); 
        await appAlert(`✅ 기본 설정이 [${mode === 'subject' ? '교과목별' : '능력단위별'}]로 고정되었습니다.`);
    } catch(e) { 
        await appAlert("저장 실패: " + e.message); 
    }
}

function triggerUpload(date) {
    selectedTargetDate = date;
    document.getElementById('hiddenFileInput').click();
}

// [데이터 삭제 기능]
async function clearAllAttendance() {
    // 📍 [이중 안전장치 장착] 정확한 문구를 입력해야만 작동하도록 개조
    const expectedText = `${currentClass} 삭제합니다`;
    const userInput = await appPrompt(`❗ 경고: [ ${currentClass} ] 학급의 모든 출석 데이터가 삭제됩니다.\n\n안전을 위해 아래 입력창에 띄어쓰기까지 정확히 입력해 주세요.\n\n입력할 문구: ${expectedText}`);

    if (userInput === expectedText) {
        classDbRef('dailyAttendance').remove()
            .then(async () => {
                await bumpStudentDataRevision();
                await appAlert(`✅ [ ${currentClass} ] 학급의 모든 데이터가 초기화되었습니다. 엑셀을 다시 업로드해 주세요.`);
            })
            .catch(async (err) => { await appAlert("삭제 실패: " + err); });
    } else if (userInput !== null) {
        // 취소 버튼을 누른 게 아니라, 글자를 틀리게 적었을 경우의 계기판 알림
        await appAlert("❌ 입력한 문구가 일치하지 않아 초기화가 안전하게 취소되었습니다.");
    }
}


function tryScrollToFirstEmptyFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('findEmpty') !== '1') return;
    setTimeout(() => { scrollToFirstEmpty(); }, 350);
}

// [기능 추가] 미등록 데이터 중 가장 첫 번째(오름차순) 위치로 이동
async function scrollToFirstEmpty() {
    // 1. 모든 행을 가져옵니다.
    const rows = document.querySelectorAll('#dateListBody tr');
    let targetRow = null;

    // 2. 위에서부터 순차적으로 '미등록' 뱃지가 있는 행을 찾습니다.
    for (let row of rows) {
        if (row.querySelector('.status-none')) {
            targetRow = row;
            break;
        }
    }

    if (targetRow) {
        // 3. 해당 행으로 부드럽게 스크롤 이동
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 4. 시각적 강조 효과 (잠깐 반짝임)
        targetRow.style.backgroundColor = "#fff9c4";
        setTimeout(() => { targetRow.style.backgroundColor = ""; }, 2000);
    } else {
        await appAlert("🎉 모든 회차의 출석부가 등록되어 있습니다!");
    }
}

// 팝업 열기 함수
async function showDayDetail(date, dayNum) {
    const dayData = uploadedDates[date];
    if (!dayData) { await appAlert("데이터가 없습니다."); return; }

    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = "";

    // 1. [6교시 인식 로직] 실제 과목이 등록된 행만 필터링 (NaN 데이터 무시)
    const daySchedule = rawTimetable.filter(row => {
        const rowDate = getFixDate(row.날짜);
        return rowDate === date && isStudyTimetableRow(row);
    });

    let maxSchedEnd = 1050; // 기본 17:30
    let lastPeriod = 8;

    if (daySchedule.length > 0) {
        const periods = daySchedule.map(s => {
    let pVal = s.교시;
    // 📍 [수리] "1교시" 등 텍스트가 섞인 경우 숫자만 추출하는 필터 장착
    if (typeof pVal === 'string') pVal = pVal.replace(/[^0-9]/g, "");
    return parseInt(pVal) || 0;
}).filter(p => p > 0);

        if (periods.length > 0) {
            lastPeriod = Math.max(...periods);
        }

        // 교시별 종료 시간 배선
        if (lastPeriod <= 6) maxSchedEnd = 930;       // 15:30
        else if (lastPeriod === 7) maxSchedEnd = 990;  // 16:30
        else maxSchedEnd = 1050;                       // 17:30
    }

    document.getElementById('modalTitle').innerText = `📅 ${dayNum}회차 (${date}) 상세 [${lastPeriod}교시 기준]`;

    // 그날의 기준 수업 시간 (예: 6교시 360분, 8교시 450분)
    const standardTotalMin = (maxSchedEnd - 540) - 30;
    const sortedNames = Object.keys(dayData).filter(key => key !== "_metadata").sort();
    
    sortedNames.forEach(name => {
        const info = dayData[name];
        const st = info.status || "";
        
        const toMin = (t) => {
            if (!t || !t.includes(':') || t === "00:00:00") return 0;
            const p = t.split(':');
            return parseInt(p[0]) * 60 + parseInt(p[1]);
        };

        const sIn = toMin(info.inTime), sOut = toMin(info.outTime);
        const lIn = toMin(info.leaveTime), rIn = toMin(info.returnTime);
        const isSpecial = ["공가", "휴가", "경조사", "훈련수당", "기타", "출석인정"].some(k => st.includes(k));

        let actualMin = 0;
        if (isSpecial) {
            actualMin = standardTotalMin; 
        } else if (sIn > 0 && sOut > 0) {
            const aStart = Math.max(sIn, 540); 
            const aEnd = Math.min(sOut, maxSchedEnd); 
            
            if (aEnd > aStart) {
                actualMin = aEnd - aStart;
                const lS = 780, lE = 810; 
                const overlapLunch = Math.max(0, Math.min(aEnd, lE) - Math.max(aStart, lS));
                actualMin -= overlapLunch;
                
                if (lIn > 0 && rIn > 0) {
                    const oL = Math.max(0, Math.min(rIn, lE) - Math.max(lIn, lS));
                    actualMin -= ((rIn - lIn) - oL);
                }
            }
        }
        actualMin = Math.max(0, Math.round(actualMin));

        // 📍 [엔진 개조] 중도탈락 및 조기수료 감지 센서 작동
        let displayStatus = st;
        if (dropoutData[name] && date >= dropoutData[name]) {
            displayStatus = "중도탈락";
            actualMin = 0; // 0분 처리
        } else if (earlyCompletionData[name] && date >= earlyCompletionData[name]) {
            displayStatus = "조기수료";
            actualMin = 0; // 0분 처리
        }

        // [수정 1] 실제 출석(분) 칸만 노란색 강조 (기준 시간과 다를 때)
        const timeHighlight = (actualMin !== standardTotalMin) ? 'background-color: #fff9c4;' : '';

        // [수정 2] 상태별 색상 규정 적용
        let statusClass = "status-done"; // 기본 초록: 출석
        if (displayStatus === "중도탈락" || displayStatus === "조기수료") statusClass = "status-none"; // 📍 빨간색 뱃지
        else if (displayStatus.includes("결석") || displayStatus === "미편입") statusClass = "status-none"; 
        else if (displayStatus.includes("지각") || displayStatus.includes("조퇴")) statusClass = "status-late"; 
        else if (displayStatus.includes("외출") || isSpecial) statusClass = "status-special";

        // [수정 3] 외출 시간 정보가 있을 때만 표시 (수동 입력기 탑재 - '신청' 상태 전용)
        let leaveHTML = "-";
        let returnHTML = "-";

        // 📍 엔진 점검: 승인 완료된 '외출'은 건드리지 않고, '외출(신청)' 상태일 때만 수동 텍스트 입력창 개방
        if (displayStatus.includes("외출(신청)")) {
            const lVal = (lIn > 0 && info.leaveTime && info.leaveTime !== '-') ? info.leaveTime.substring(0, 5) : "";
            const rVal = (rIn > 0 && info.returnTime && info.returnTime !== '-') ? info.returnTime.substring(0, 5) : "";
            
            leaveHTML = `<input type="text" placeholder="0900 형식" maxlength="5" value="${lVal}" onchange="updateSpecialTime('${date}', '${dayNum}', '${name}', 'leaveTime', this.value)" style="width: 90%; border: 1px solid #bbdefb; background: #f8f9fa; font-size: 10px; padding: 2px; border-radius: 3px; text-align: center;">`;
            returnHTML = `<input type="text" placeholder="1730 형식" maxlength="5" value="${rVal}" onchange="updateSpecialTime('${date}', '${dayNum}', '${name}', 'returnTime', this.value)" style="width: 90%; border: 1px solid #bbdefb; background: #f8f9fa; font-size: 10px; padding: 2px; border-radius: 3px; text-align: center;">`;
        } else {
            // 승인 완료된 외출이거나 다른 상태일 때는 기존처럼 안전하게 텍스트로만 렌더링
            const leaveDisp = (lIn > 0) ? info.leaveTime : "-";
            const returnDisp = (rIn > 0) ? info.returnTime : "-";
            leaveHTML = (leaveDisp && leaveDisp !== '-') ? leaveDisp.substring(0, 5) : '-';
            returnHTML = (returnDisp && returnDisp !== '-') ? returnDisp.substring(0, 5) : '-';
        }

        let noteStyle = "text-align:left;";
        const currentNote = info.note || "";
        // 사유에 (신청), (회수), (반려)가 있으면 노란색 배경 강조
        if (currentNote.includes("(신청)") || currentNote.includes("(회수)") || currentNote.includes("(반려)")) {
            noteStyle += " background-color: #fff9c4; font-weight: bold; color: #d35400;";
        }

        tbody.innerHTML += `
            <tr>
                <td>${info.studentNum || '-'}</td> 
                <td><strong>${name}</strong></td>
                <td><span class="status-badge ${statusClass}">${displayStatus}</span></td>
                <td style="font-weight:bold; color:#e67e22; ${timeHighlight}">${actualMin}분</td>
                <td>${(info.inTime && info.inTime !== '-') ? info.inTime.substring(0, 5) : '-'}</td>
                <td>${(info.outTime && info.outTime !== '-') ? info.outTime.substring(0, 5) : '-'}</td>
                <td>${leaveHTML}</td>
                <td>${returnHTML}</td>
                <td style="${noteStyle}">${currentNote || '-'}</td> 
            </tr>
        `;
    });
    document.getElementById('detailModal').style.display = "block";
}

// 팝업 닫기 함수
function closeModal() {
    document.getElementById('detailModal').style.display = "none";
}

// 📍 [신규] ESC 키 입력 시 모달 닫기 회로
window.addEventListener('keydown', function(event) {
    const modal = document.getElementById('detailModal');
    const dropoutModal = document.getElementById('dropoutModal');
    if (event.key === "Escape") {
        if (modal && modal.style.display === "block") closeModal();
        if (dropoutModal && dropoutModal.style.display === "block") closeDropoutModal();
    }
});

// 📍 [신규] 통합 날짜 추출 엔진 (4가지 규격 완벽 대응)
function extractDateFromFileName(fileName) {
    // 1. 4자리 표준: 2026-03-18 또는 2026.03.18
    const regNormal4 = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;
    
    // 2. 2자리 기호 형식: 25.10.27 또는 25-10-28 (신규 추가)
    const regNormal2 = /(\d{2})[.\-](\d{2})[.\-](\d{2})/;

    // 3. 8자리 붙은 숫자: 20260318
    const regStick8 = /(\d{4})(\d{2})(\d{2})/;

    // 4. 6자리 붙은 숫자: 260318 (앞에 20 추가)
    const regStick6 = /(\d{2})(\d{2})(\d{2})/;

    let match;

    // [검색 1순위] 4자리 연도 표준 (가장 확실함)
    if (match = fileName.match(regNormal4)) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 2순위] 2자리 연도 + 기호(. 또는 -) (선생님 요청 사항)
    // 예: 25.10.27 -> 2025-10-27
    if (match = fileName.match(regNormal2)) {
        return `20${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 3순위] 순수 숫자 8자리
    if (match = fileName.match(regStick8)) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 4순위] 순수 숫자 6자리
    const numbers = fileName.match(/\d+/g);
    if (numbers) {
        for (let num of numbers) {
            if (num.length === 6) {
                return `20${num.substring(0, 2)}-${num.substring(2, 4)}-${num.substring(4, 6)}`;
            }
        }
    }

    return null; 
}

// 📍 [신규] 멀티 업로드 트리거
function triggerMultiUpload() {
    selectedTargetDate = "MULTI_MODE"; // 멀티 모드임을 표시
    document.getElementById('hiddenFileInput').click();
}

// 📍 [개조] 통합 파일 처리 엔진 (외출 시간 보존 및 영구 삭제자 방어 탑재)
async function handleFileSelect(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    // 1. [회로 판별] 일괄 업로드 모드인지 확인
    const isMultiMode = (selectedTargetDate === "MULTI_MODE");

    if (isMultiMode) {
        if (!await appConfirm(`${files.length}개의 파일을 날짜별로 자동 분류하여 등록하시겠습니까?`)) {
            input.value = ""; return;
        }
    }

    let successCount = 0;
    let failFiles = [];

    // 2. 파일 루프 가동
    for (let file of files) {
        try {
            let targetDate = "";

            if (isMultiMode) {
                // [A회로] 일괄 업로드: 파일명에서 날짜 추출
                targetDate = extractDateFromFileName(file.name);
                if (!targetDate) {
                    failFiles.push(`${file.name}(날짜미검출)`);
                    continue;
                }
            } else {
                // [B회로] 단독 업로드: 리스트에서 클릭한 그 날짜 그대로 사용 (파일명 무관)
                targetDate = selectedTargetDate;
            }

            // 3. 엑셀 데이터 분석 시작
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (rows.length < 3) {
                failFiles.push(`${file.name}(내용부족)`);
                continue;
            }

            const dailyUpdate = {};
            dailyUpdate["_metadata"] = {
                fileName: file.name,
                uploadTime: new Date().toLocaleString('ko-KR', { 
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                })
            };

            // 4. 학생 데이터 수집 (선생님의 순정 정밀 로직 적용)
            for (let i = 2; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 2) continue;

                const studentNum = row[0] ? String(row[0]).trim() : "-";
                const name = row[1] ? String(row[1]).trim() : "";
                if (!name || name === "성명") continue;

                // 💡 [수리 포인트 1: 영구 삭제자 부활 방지 쉴드]
                // 영구 삭제된 학생은 엑셀에 이름이 있어도 데이터 수집을 강제로 건너뜁니다.
                if (deletedLogs[name]) continue;

                // 📍 [신규 배선] C열(row[2]) 주민등록번호 추출 및 생년월일(YYYY.MM.DD) 자동 변환기
                let birthDateRaw = row[2] ? String(row[2]).trim() : "";
                let birthDate = "";
                let gender = ""; // 📍 [추가 부품] 성별 데이터 저장소

                if (birthDateRaw) {
                    // '-' 기준으로 앞자리만 분리하고 순수 숫자만 추출 (예: "061202")
                    let juminFront = birthDateRaw.split('-')[0].replace(/[^0-9]/g, '');
                    if (juminFront.length === 6) {
                        let yy = parseInt(juminFront.substring(0, 2), 10);
                        let mm = juminFront.substring(2, 4);
                        let dd = juminFront.substring(4, 6);
                        
                        let currentYear = new Date().getFullYear(); // 시스템의 현재 연도 (예: 2026)
                        let assumedYear = 1900 + yy; // 일단 1900년대로 가정
                        
                        // 💡 90살 이상은 없다는 규칙(안전장치) 적용
                        if (currentYear - assumedYear >= 90) {
                            assumedYear = 2000 + yy;
                        }
                        
                        // "2006.12.02" 형식으로 최종 조립
                        birthDate = `${assumedYear}.${mm}.${dd}`;
                    }

                    // 📍 [신규 센서] '-' 기준 뒷자리가 존재할 경우 성별 감별
                    let juminParts = birthDateRaw.split('-');
                    if (juminParts.length > 1 && juminParts[1]) {
                        let juminBack = juminParts[1].replace(/[^0-9]/g, '');
                        if (juminBack.length >= 1) {
                            let genderDigit = juminBack.charAt(0);
                            // 1, 3, 5는 남성 / 2, 4, 6은 여성 (외국인 규격 포함)
                            if (['1', '3', '5'].includes(genderDigit)) gender = "남";
                            else if (['2', '4', '6'].includes(genderDigit)) gender = "여";
                        }
                    }
                }

               // --- [순정 로직 이식 및 L열 중심 개조 시작] ---
                let statusG = row[6] ? String(row[6]).trim() : "";  
                let statusL = row[11] ? String(row[11]).trim() : ""; 
                let statusM = row[12] ? String(row[12]).trim() : ""; 
                let status = statusG;

                // 📍 [사유 칸 시각적 강조 배선]
                let finalNote = row[13] ? String(row[13]).trim() : ""; 
                const highlightStatus = ["신청", "회수", "반려"];
                if (highlightStatus.includes(statusL)) {
                    if (!finalNote.includes(`(${statusL})`)) {
                        finalNote = finalNote ? `${finalNote} (${statusL})` : `(${statusL})`;
                    }
                }

                let inTime = formatExcelTime(row[7]);  
                let outTime = formatExcelTime(row[8]); 
                let leaveTime = formatExcelTime(row[9]);
                let returnTime = formatExcelTime(row[10]);

                // 💡 [수리 포인트 2: 외출/복귀 시간 기존 메모리 보존 회로]
                // 엑셀에서 추출한 시간이 비어있을 때, 파이어베이스에 기존에 입력한 시간이 있다면 살려냅니다.
                if (uploadedDates[targetDate] && uploadedDates[targetDate][name]) {
                    const existingData = uploadedDates[targetDate][name];
                    if (leaveTime === "" || leaveTime === "00:00:00" || leaveTime === "-") {
                        leaveTime = existingData.leaveTime || "";
                    }
                    if (returnTime === "" || returnTime === "00:00:00" || returnTime === "-") {
                        returnTime = existingData.returnTime || "";
                    }
                }

                // 📍 [L열 중심 중앙 통제소]
                const specialKeywords = ["공가", "휴가", "경조사", "훈련수당", "기타", "출석"];
                const partialKeywords = ["지각", "조퇴", "외출"];

                const isM_Special = specialKeywords.some(k => statusM.includes(k));
                const isM_Partial = partialKeywords.some(k => statusM.includes(k));

                if (statusL === "신청" || statusL === "승인") {
                    if (isM_Special || isM_Partial) {
                        status = (statusL === "신청") ? `${statusM}(신청)` : statusM;
                    }
                } else if (status === "" || status === "-") {
                    status = "미편입";
                }

                // 📍 [시간 주입 및 결석 정밀 타격 로직]
                if (isM_Special && (statusL === "신청" || statusL === "승인")) {
                    // 특수 출결(공가 등) 시 09:00~17:30 강제 주입
                    inTime = "09:00:00"; outTime = "17:30:00";
                    leaveTime = ""; returnTime = "";
                } else if (status.includes("결석") || status === "미편입") {
                    // 결석 센서 가동
                    if (inTime !== "00:00:00") {
                        // 💡 입실 기록이 살아있는데 결석 처리된 경우 = 50% 미만 출석
                        status = "50/100결석";
                        // (inTime, outTime 등 실제 시간은 소각하지 않고 순정 상태로 보존됨)
                    } else {
                        // 입실 기록이 없는 순수 결석 또는 미편입
                        inTime = "00:00:00"; outTime = "00:00:00";
                        leaveTime = ""; returnTime = "";
                        if (status === "-") status = "결석";
                    }
                }
                // --- [순정 로직 이식 끝] ---

                // [표준 규격 송신]
                dailyUpdate[name] = {
                    studentNum, inTime, outTime, leaveTime, returnTime, 
                    status, note: finalNote,
                    birthDate: birthDate, 
                    gender: gender 
                };
            }

            // 5. 파이어베이스 전송 (단독 모드일 때만 confirm창 띄움)
            if (!isMultiMode) {
                if(await appConfirm(`[${targetDate}] 데이터를 저장하시겠습니까?`)) {
                    await classDbRef(`dailyAttendance/${targetDate}`).set(dailyUpdate);
                    await bumpStudentDataRevision();
                    await appAlert(`✅ [${targetDate}] 저장 완료!`);
                }
            } else {
                await classDbRef(`dailyAttendance/${targetDate}`).set(dailyUpdate);
                successCount++;
            }

        } catch (err) {
            console.error(`처리 오류 [${file.name}]:`, err);
            failFiles.push(file.name);
        }
    }

    // 6. 결과 보고
    if (isMultiMode) {
        if (successCount > 0) await bumpStudentDataRevision();
        let resultMsg = `✅ 일괄 업로드 결과\n- 성공: ${successCount}건`;
        if (failFiles.length > 0) resultMsg += `\n- 실패: ${failFiles.length}건\n(${failFiles.join(', ')})`;
        await appAlert(resultMsg);
    }

    input.value = ""; 
    initialize(); 
}


// 📍 [신규] 외출/복귀 시간 수동 수정 및 실시간 계산기 (자동 보정 필터 장착)
async function updateSpecialTime(date, dayNum, studentName, field, newValue) {
    let finalValue = String(newValue).trim();
    let formattedTime = "";

    if (finalValue !== "") {
        // 입력된 값에서 순수 숫자만 추출 (안전장치)
        let numOnly = finalValue.replace(/[^0-9]/g, '');
        
        // 1430 처럼 숫자만 4자리 연속으로 입력했을 경우, 자동으로 콜론(:) 조립
        if (numOnly.length === 4) {
            finalValue = numOnly.substring(0, 2) + ":" + numOnly.substring(2, 4);
        }
        
        // 파이어베이스 엔진 규격(HH:mm:00)으로 최종 변환
        formattedTime = finalValue + ":00";
    }
    
    // 파이어베이스 해당 학생의 특정 필드만 정밀 업데이트
    classDbRef(`dailyAttendance/${date}/${studentName}`).update({
        [field]: formattedTime
    }).then(async () => {
        // 1. 로컬 메모리 데이터 즉시 동기화
        uploadedDates[date][studentName][field] = formattedTime;
        await bumpStudentDataRevision();
        
        // 2. 모달창 즉시 리렌더링 (분 단위 자동 재계산)
        showDayDetail(date, dayNum);
    }).catch(async (err) => { await appAlert("시간 업데이트 실패: " + err); });
}

// ==========================================
// 📍 [신규 모듈] 중도탈락 처리 전용 엔진 구동부
// ==========================================

// 중도탈락/조기수료 모달 열기
async function openDropoutModal() {
    const selectEl = document.getElementById('dropoutStudentSelect');
    selectEl.innerHTML = '<option value="">학생을 선택하세요</option>';
    
    const dates = Object.keys(uploadedDates);
    if (dates.length === 0) return await appAlert("엑셀 데이터가 업로드되지 않았습니다.");
    
    const allStudentsSet = new Set();
    dates.forEach(date => {
        if (uploadedDates[date]) {
            Object.keys(uploadedDates[date]).forEach(key => {
                if (key !== "_metadata") allStudentsSet.add(key);
            });
        }
    });
    
    const studentNames = Array.from(allStudentsSet).sort();
    studentNames.forEach(name => {
        // 이미 처리된 학생인지 확인하여 텍스트 추가
        let extraText = "";
        if (dropoutData[name]) extraText = ` (🚫탈락: ${dropoutData[name]})`;
        else if (earlyCompletionData[name]) extraText = ` (🎓조수: ${earlyCompletionData[name]})`;
        
        selectEl.innerHTML += `<option value="${name}">${name}${extraText}</option>`;
    });
    
    document.getElementById('dropoutDateInput').value = "";
    document.getElementById('dropoutModal').style.display = "block";
}

// 📍 [복구된 부품] 중도탈락/조기수료 모달 닫기
function closeDropoutModal() {
    document.getElementById('dropoutModal').style.display = "none";
}

// 데이터 DB 저장 (보안 송신)
async function saveDropout() {
    const studentName = document.getElementById('dropoutStudentSelect').value;
    const dropDate = document.getElementById('dropoutDateInput').value; 
    const processType = document.querySelector('input[name="processType"]:checked').value; // 📍 라디오 버튼 스캔
    
    if (!studentName || !dropDate) return await appAlert("학생과 일자를 모두 선택해주세요.");
    
    const typeLabel = processType === "early" ? "조기수료" : "중도탈락";
    const dbPath = processType === "early" ? "earlyCompletions" : "dropouts";

    if(await appConfirm(`[${studentName}] 학생을 ${dropDate} 일자로 '${typeLabel}' 처리하시겠습니까?`)) {
        // 📍 안전을 위해 반대쪽 그룹에 데이터가 있다면 미리 지워줍니다.
        const oppPath = processType === "early" ? "dropouts" : "earlyCompletions";
        classDbRef(`${oppPath}/${studentName}`).remove();

        classDbRef(`${dbPath}/${studentName}`).set(dropDate)
            .then(async () => {
                await bumpStudentDataRevision();
                await appAlert(`✅ ${typeLabel} 처리가 완료되었습니다.`);
                closeDropoutModal();
                initialize(); 
            }).catch(async (err) => { await appAlert("저장 실패: " + err); });
    }
}

// 처리 취소 (DB 기록 삭제 및 정상 복구)
async function cancelDropout() {
    const studentName = document.getElementById('dropoutStudentSelect').value;
    if (!studentName) return await appAlert("복구할 학생을 선택해주세요.");
    
    if(await appConfirm(`[${studentName}] 학생의 탈락/조기수료 처리를 취소하고 정상 상태로 복구하시겠습니까?`)) {
        // 📍 양쪽 그룹 모두에서 깨끗하게 소각합니다.
        Promise.all([
            classDbRef(`dropouts/${studentName}`).remove(),
            classDbRef(`earlyCompletions/${studentName}`).remove()
        ]).then(async () => {
            await bumpStudentDataRevision();
            await appAlert("✅ 정상 출석부로 복구되었습니다.");
            closeDropoutModal();
            initialize();
        }).catch(async (err) => { await appAlert("취소 실패: " + err); });
    }
}

// 훈련생 영구 삭제 엔진 (부품 완전 탈거)
async function deleteStudentPermanently() {
    const studentName = document.getElementById('dropoutStudentSelect').value;
    if (!studentName) return await appAlert("명단에서 완전히 삭제할 학생을 선택해주세요.");

    const confirmMsg = `❗ [초강력 경고] ❗\n\n[ ${studentName} ] 학생의 모든 출석 기록을 영구 삭제합니다.\n정말로 완전히 제거하시겠습니까?`;
    
    if (await appConfirm(confirmMsg)) {
        const finalCheck = await appPrompt(`삭제할 학생의 성명을 똑같이 입력해주세요.\n(입력 대상: ${studentName})`);
        if (finalCheck === studentName) {
            try {
                const dates = Object.keys(uploadedDates);
                const removePromises = [];

                dates.forEach(date => {
                    if (uploadedDates[date] && uploadedDates[date][studentName]) {
                        removePromises.push(classDbRef(`dailyAttendance/${date}/${studentName}`).remove());
                    }
                });

                // 📍 탈락 및 조수 DB 모두 청소
                removePromises.push(classDbRef(`dropouts/${studentName}`).remove());
                removePromises.push(classDbRef(`earlyCompletions/${studentName}`).remove());

                const deleteTime = new Date().toLocaleString('ko-KR', { 
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                });
                removePromises.push(classDbRef(`deletedLogs/${studentName}`).set(deleteTime));

                await Promise.all(removePromises);
                await bumpStudentDataRevision();
                await appAlert(`✅ [ ${studentName} ] 학생의 모든 기록이 완전히 삭제되었습니다.`);
                closeDropoutModal();
                initialize();
            } catch (err) { await appAlert("❌ 삭제 실패: " + err); }
        } else if (finalCheck !== null) {
            await appAlert("❌ 입력한 이름이 일치하지 않아 안전하게 차단되었습니다.");
        }
    }
}

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 위임 기술 적용)

document.addEventListener('DOMContentLoaded', () => {
    // 1. 고정 네비게이션 및 기능 버튼
    document.getElementById('btn_nav_main').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('index1.html'); });
    document.getElementById('btn_nav_unit').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('능력단위시간표.html'); });
    document.getElementById('btnOpenDirectAuthAlert')?.addEventListener('click', () => {
        location.href = classNavHref('직권신청.html');
    });
    document.getElementById('btn_find_empty').addEventListener('click', scrollToFirstEmpty);
    document.getElementById('btn_multi_upload').addEventListener('click', triggerMultiUpload);
    document.getElementById('hiddenFileInput').addEventListener('change', function() { handleFileSelect(this); });

    // 2. 보기 고정 스위치 (라디오 버튼)
    document.getElementById('radio_view_subject').addEventListener('change', () => saveDefaultView('subject'));
    document.getElementById('radio_view_ncs').addEventListener('change', () => saveDefaultView('ncs'));

    // 3. 위험 제어 구역 (중도탈락 / 전체 데이터 초기화)
    document.getElementById('btn_open_dropout').addEventListener('click', openDropoutModal);
    document.getElementById('btn_clear_all').addEventListener('click', clearAllAttendance);

    // 4. 모달창 닫기 및 중도탈락 제어 버튼들
    document.getElementById('btn_close_detail').addEventListener('click', closeModal);
    document.getElementById('btn_close_dropout').addEventListener('click', closeDropoutModal);
    document.getElementById('btn_save_dropout').addEventListener('click', saveDropout);
    document.getElementById('btn_cancel_dropout').addEventListener('click', cancelDropout);
    document.getElementById('btn_delete_permanently').addEventListener('click', deleteStudentPermanently);

    // 5. 모달 바깥쪽(배경) 클릭 감지 - 누유(window.onclick) 수리 완료
    document.addEventListener('click', function(e) {
        const detailModal = document.getElementById('detailModal');
        const dropoutModal = document.getElementById('dropoutModal');
        if (e.target === detailModal) closeModal();
        if (e.target === dropoutModal) closeDropoutModal();
    });

    // 6. 📍 동적 생성 부품(표 내부) 통제소 (이벤트 위임)
    document.getElementById('dateListBody').addEventListener('click', function(e) {
        const detailBtn = e.target.closest('.dynamic-show-detail');
        const uploadBtn = e.target.closest('.dynamic-trigger-upload');

        if (detailBtn) {
            showDayDetail(detailBtn.getAttribute('data-date'), detailBtn.getAttribute('data-daynum'));
        } else if (uploadBtn) {
            triggerUpload(uploadBtn.getAttribute('data-date'));
        }
    });

    // 7. 📍 [신규] 사이드 모니터 접이식 패널 구동 모터
    document.getElementById('btnToggleSide').addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('sideMonitor').classList.toggle('collapsed');
    });

    document.getElementById('sideMonitorCollapsedText').addEventListener('click', function(e) {
        e.stopPropagation();
        document.getElementById('sideMonitor').classList.remove('collapsed');
    });
});