
/**
 * =============================================================================
 * [CORE — AI·개발자 필독] start/index1.js
 * =============================================================================
 * 시간표 엑셀 업로드, 교과목(courses) 설정, fullTimetable DB 저장의 기준 진입점.
 * 집/회사/노트북 등 여러 PC에서 Cursor AI로 지속 수정 중 — 임의 대규모 변경 금지.
 *
 * ⚠️ 휴일·수업 행 판별( 다른 화면과 동일 규칙 유지 ):
 *    - processTimetable studyRows: 교과목 + 능력단위명 둘 다 있을 때만 교과 설정·집계
 *    - downloadSavedTimetable: 능력단위 없고 교과목만 있으면 휴일로 재출력
 *
 * ⚠️ 연관 핵심: start/일일출석부.js, start/능력단위시간표.js
 * ⚠️ copy 파일명 백업은 사용자 요청 없이 수정하지 말 것 (.cursor/rules 참고)
 * =============================================================================
 */

// [수정 후 - 테스트 모드 완벽 대응]
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
initClassContext();

const masterFirebaseConfig = {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};
const masterApp = firebase.apps.find(app => app.name === 'masterApp')
    ? firebase.app('masterApp')
    : firebase.initializeApp(masterFirebaseConfig, 'masterApp');
const masterDatabase = masterApp.database();
const masterAuth = masterApp.auth();

async function ensureMasterAuth() {
    if (masterAuth.currentUser) return true;
    const pw = localStorage.getItem('adminPw');
    if (!pw) return false;
    try {
        await masterAuth.signInWithEmailAndPassword('ghlwns0201@naver.com', pw);
        return true;
    } catch (e) {
        console.warn('마스터 DB 인증 실패:', e);
        return false;
    }
}

async function fetchNcsRequiredCodeSet() {
    if (!await ensureMasterAuth()) return new Set();
    try {
        const snap = await masterDatabase.ref('ncsVersions').once('value');
        return NcsRequiredUtils.buildRequiredCodeSetFromVersions(snap.val() || {});
    } catch (e) {
        console.warn('필수과목 코드 로드 실패:', e);
        return new Set();
    }
}

// 2. 인증 및 데이터 로드 (시동 후 연료 공급)
const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log("🔒 보안 인증 확인됨: " + firebaseConfig.projectId);
        if (adminPw) ensureMasterAuth();
        initializePage(); 
    } else if (adminPw) {
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw)
            .then(async () => {
                console.log("🔒 보안 인증 성공!");
                await ensureMasterAuth();
                initializePage();
            })
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                // 인증 실패 시 메인으로 튕겨냄
                await appAlert("인증 정보가 올바르지 않습니다. 메인 화면으로 이동합니다.");
                location.href = "../index.html"; 
            });
    } else {
        // 📍 [보안 강화] 인증 정보가 아예 없는 경우 즉시 퇴거 조치
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        await appAlert("로그인이 필요한 서비스입니다.");
        location.href = "../index.html"; 
    }
});
function updateSelectColor(select) {
    if (!select) return;
    const val = select.value;
    let color = "#ffffff"; // 기본 흰색

    if (val === "NCS교과") color = "#e3f2fd";      // 연한 파랑
    else if (val === "비NCS교과") color = "#f3e5f5"; // 연한 보라
    else if (val === "소양교과") color = "#f5f5f5";   // 연한 회색
    else if (val === "필수능력단위") color = "#fff1f0"; // 연한 분홍
    else if (val === "선택능력단위") color = "#fff7e6"; // 연한 주황
    
    select.style.backgroundColor = color;
}

// 📍 특정 분류 구역으로 부드럽게 이동하는 함수
async function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        window.scrollTo({ top: el.offsetTop - 100, behavior: 'smooth' });
    } else {
        await appAlert("해당 분류의 데이터가 없습니다.");
    }
}
function handleSubjectTypeChange(selectElement, groupId) {
    const isNCS = selectElement.value === 'NCS교과';
    const rows = document.querySelectorAll(`tr[data-group="${groupId}"]`);
    rows.forEach(row => {
        const unitTypeContainer = row.querySelector('.unit-type-container');
        if (unitTypeContainer) unitTypeContainer.style.display = isNCS ? 'flex' : 'none';
    });
}

function setUnitType(btn, typeValue) {
    const container = btn.parentElement;
    const buttons = container.querySelectorAll('.type-toggle-btn');
    const hiddenInput = container.querySelector('.c-unit-type-val');

    if (hiddenInput.value === typeValue) {
        hiddenInput.value = '';
        buttons.forEach(b => b.classList.remove('active-req', 'active-opt'));
    } else {
        hiddenInput.value = typeValue;
        buttons.forEach(b => b.classList.remove('active-req', 'active-opt'));
        if (typeValue === '필수능력단위') btn.classList.add('active-req');
        else btn.classList.add('active-opt');
    }
}

function collectUnitTypesFromCourseTable() {
    const map = {};
    let lastSubjectType = '';
    document.querySelectorAll('#courseTableBody tr:not(.summary-row)').forEach(r => {
        const typeInput = r.querySelector('.c-subject-type');
        if (typeInput) lastSubjectType = typeInput.value;
        const unitInput = r.querySelector('.c-unit-input');
        const unitTypeVal = r.querySelector('.c-unit-type-val');
        if (!unitInput || !unitTypeVal || lastSubjectType !== 'NCS교과') return;
        map[unitInput.value] = unitTypeVal.value;
    });
    return map;
}

function mergeCourseUnitTypes(existingCourses, unitTypeMap) {
    if (!unitTypeMap || !Object.keys(unitTypeMap).length) return existingCourses || [];
    return (existingCourses || []).map(c => {
        if (unitTypeMap[c.unit] === undefined) return c;
        return { ...c, unitType: unitTypeMap[c.unit] };
    });
}
const connectedRef = database.ref(".info/connected");
connectedRef.on("value", (snap) => {
    const statusDiv = document.getElementById("connectionStatus");
    if (snap.val() === true) {
        statusDiv.innerText = "✅ 서버 연결됨";
        statusDiv.className = "status-online";
    } else {
        statusDiv.innerText = "❌ 연결 끊김";
        statusDiv.className = "status-offline";
    }
});

let currentClass = window.currentClass;
function refreshClassHud() {
    const el = document.getElementById('currentClassDisplay');
    if (el) el.innerText = formatClassHudText();
}
refreshClassHud();
if (typeof loadCohortLabelFromDb === 'function') loadCohortLabelFromDb();

let tempJsonData = null; let tempFileName = "";

// 📍 기수(훈련) 안전장치 — 훈련 시작일이 같으면 같은 훈련으로 취급
function parseCohortStartDate(periodStr, timetableRows) {
    if (periodStr) {
        const part = String(periodStr).split('~')[0].trim().replace(/\./g, '-');
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
    }
    if (timetableRows && timetableRows.length) {
        const dates = timetableRows.map(r => {
            let d = String(r.날짜 || '').trim().replace(/\./g, '-');
            return d.includes('-') ? d : null;
        }).filter(Boolean).sort();
        if (dates.length) return dates[0];
    }
    return null;
}

function getCohortStartDateFromMaster(masterData) {
    if (!masterData) return null;
    if (masterData.cohortStartDate) return masterData.cohortStartDate;
    return parseCohortStartDate(masterData.period, null);
}

async function fetchMasterDataSnapshot() {
    const snap = await classDbRef('masterData').once('value');
    return snap.val() || {};
}

async function isSameCohortTraining(newStartDate, existingMaster = null) {
    if (!newStartDate) return false;
    const master = existingMaster || await fetchMasterDataSnapshot();
    const existingStart = getCohortStartDateFromMaster(master);
    return !!(existingStart && existingStart === newStartDate);
}

function extendPeriodEndDate(existingPeriod, timetableRows) {
    const dates = timetableRows.map(r => String(r.날짜 || '').trim().replace(/\./g, '-')).filter(d => d.includes('-')).sort();
    if (!dates.length) return existingPeriod || '';
    const newEnd = dates[dates.length - 1];
    if (!existingPeriod || !String(existingPeriod).includes('~')) {
        return `${dates[0]} ~ ${newEnd}`;
    }
    const start = String(existingPeriod).split('~')[0].trim().replace(/\./g, '-');
    const oldEnd = String(existingPeriod).split('~')[1].trim().replace(/\./g, '-');
    const useEnd = newEnd > oldEnd ? newEnd : oldEnd;
    return `${start} ~ ${useEnd}`;
}

function mergeEvalDates(oldEvalDates, newEntry) {
    const merged = Array.isArray(oldEvalDates) ? oldEvalDates.map(e => ({ date: e.date, period: e.period })) : [];
    if (newEntry && !merged.some(e => e.date === newEntry.date && e.period === newEntry.period)) {
        merged.push({ date: newEntry.date, period: newEntry.period });
    }
    return merged;
}

async function applyTimetableSummary(cleanJson) {
    const newStart = parseCohortStartDate(null, cleanJson);
    const sameCohort = await isSameCohortTraining(newStart);
    if (sameCohort) {
        const master = await fetchMasterDataSnapshot();
        const nameEl = document.getElementById('trainingName');
        const periodEl = document.getElementById('trainingPeriod');
        const daysEl = document.getElementById('totalDays');
        const teacherEl = document.getElementById('teacherName');
        if (nameEl && master.name) nameEl.value = master.name;
        if (periodEl) periodEl.value = extendPeriodEndDate(master.period, cleanJson);
        if (daysEl && master.days) daysEl.value = master.days;
        if (teacherEl && master.teacher) teacherEl.value = master.teacher;
        return;
    }
    autoCalculateSummary(cleanJson);
}

async function assertCohortChangeAllowed(newStartDate) {
    if (!newStartDate) return true;
    const existingMaster = await fetchMasterDataSnapshot();
    const existingStart = getCohortStartDateFromMaster(existingMaster);
    if (!existingStart || existingStart === newStartDate) return true;
    return appConfirm(
        `⚠️ 훈련 시작일이 변경됩니다.\n\n기존: ${existingStart}\n새 파일: ${newStartDate}\n\n새 기수로 저장됩니다.\n출석·보강 등 기록은 유지되지만, 교과목 설정이 새 시간표 기준으로 바뀝니다.\n\n계속하시겠습니까?`
    );
}

function initializePage() { loadData(); checkTimetableStatus(); checkRDStatus(); loadDailyAttendanceAlerts(); updateStudentLinkStatus(); updateTrainingProgressPanel(); }

function getVal(row, keys) {
    for (let k in row) {
        let cleanK = String(k).replace(/[\s·ㆍ\n\r,]/g, '');
        if (keys.includes(cleanK)) return row[k];
    }
    return "";
}

function fixDate(val) {
    if (!val) return "";
    
    // 1. 이미 표준 날짜 형식(YYYY-MM-DD)인 경우 그대로 반환
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
    
    // 2. 엑셀 숫자 코드(46089 등) 처리 (기존 순정 로직 보존)
    let s = String(val).trim();
    if (!isNaN(s) && s.length < 10 && s !== "") {
        let d = new Date((parseInt(s) - 25569) * 86400 * 1000);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        return localDate.toISOString().split('T')[0];
    }

    // 3. [보정 장치] "3/8 (일)" 또는 "3/8" 같은 텍스트 날짜 처리
    // 현재 연도(2026년 등)를 자동으로 붙여서 날짜객체로 강제 변환합니다.
    if (typeof val === 'string' && val.includes('/')) {
        let cleanText = val.split('(')[0].trim(); // "(일)" 부분 제거
        let currentYear = new Date().getFullYear(); // 시스템 현재 연도 (혹은 2026 고정 가능)
        let parts = cleanText.split('/');
        let month = parts[0].padStart(2, '0');
        let day = parts[1].padStart(2, '0');
        
        // "2026-03-08" 형식으로 조립
        let assembledDate = `${currentYear}-${month}-${day}`;
        // 조립된 날짜가 유효한지 확인 후 반환
        if (!isNaN(new Date(assembledDate).getTime())) return assembledDate;
    }

    return s;
}

function setSavedTimetableFileName(name) {
    const el = document.getElementById('savedFileName');
    if (!el) return;
    const text = name || '-';
    el.textContent = text;
    el.title = name ? name : '';
}

// 📍 [신규 검문소] 업로드 전 기존 데이터 확인 로직
async function confirmBeforeOpen() {
    const statusBox = document.getElementById('fileStatusBox');
    const savedName = document.getElementById('savedFileName').innerText.trim();
    const isAlreadySaved = statusBox.style.display === "block" && savedName && savedName !== "-";

    if (isAlreadySaved) {
        const confirmCode = await appPrompt("⚠️ 이미 등록된 시간표가 존재합니다.\n기존 데이터를 교체하시려면 [ 0000 ] 을 작성하세요.");

        if (confirmCode === "0000") return true;
        if (confirmCode !== null) {
            await appAlert("❌ 인증 번호가 틀렸습니다. 작업을 취소합니다.");
        }
        return false;
    }
    return true;
}

async function openTimetableFilePicker() {
    if (!await confirmBeforeOpen()) return;
    const input = document.getElementById('timetableFile');
    input.value = '';
    input.click();
}

function processTimetable(input) {
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    // 📍 [정밀 수리] 비동기(async) 모터로 교체하여 DB 데이터를 기다리도록 설계
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd'});
        const sheetName = workbook.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
        
        let rawProcessed = json.map(row => {
            let d = fixDate(getVal(row, ['날짜', '일별']));
            let pRaw = String(getVal(row, ['교시']));
            if (pRaw.includes("점심") || !d) return null;
            let pNum = parseInt(pRaw.replace(/[^0-9]/g, '')) || 0;
            return { _box: row, _date: d, _period: pNum };
        }).filter(b => b !== null);

        rawProcessed.sort((a, b) => {
            const dateA = new Date(a._date).getTime();
            const dateB = new Date(b._date).getTime();
            if (dateA !== dateB) return dateA - dateB; 
            return a._period - b._period; 
        });

        const cleanJson = rawProcessed.map(box => {
            const o = box._box;
            
            // 📍 (평가시험) 감지 및 분리
            let rawUnit = getVal(o, ['능력단위명']) || "";
            let isEval = false;
            if (rawUnit.includes("(평가시험)")) {
                isEval = true;
                rawUnit = rawUnit.replace(/\(평가시험\)/g, "").trim(); 
            }

            return {
                "일수": getVal(o, ['일수']),
                "날짜": box._date,
                "요일": getVal(o, ['요일']),
                "교시": box._period,
                "시간": getVal(o, ['훈련시간', '교육시간']),
                "교과목": getVal(o, ['교과목명', '교과목']),
                "능력단위": rawUnit, 
                "세부교과": getVal(o, ['세부교과', '이론/실기', '이론/실기/세부']), 
                "교사": getVal(o, ['훈련교사', '훈련교·강사']),
                "장소": getVal(o, ['훈련장소', '훈련시설명']),
                "isEval": isEval 
            };
        });

        await applyTimetableSummary(cleanJson);
        // [CORE] index1·일일출석부·능력단위시간표 공통: 교과목+능력단위 동시 존재 = 수업행 (휴일 제외)
        const studyRows = cleanJson.filter(r => String(r.교과목 || "").trim() !== "" && String(r.능력단위 || "").trim() !== "");
        
        // 📍 [RD 보존 배선 연결] 파이어베이스에서 기존 교과목 설정(RD 옵션)을 펌프로 퍼옵니다.
        let existingCourses = [];
        let existingMaster = {};
        try {
            existingMaster = await fetchMasterDataSnapshot();
            existingCourses = existingMaster.courses || [];
        } catch (err) { console.warn("기존 교과 데이터 로드 실패", err); }

        const sameCohort = await isSameCohortTraining(parseCohortStartDate(null, cleanJson), existingMaster);

        // 📍 렌더링 엔진으로 isEval, date, period 정보 추가 전달
        const renderData = studyRows.map(r => ({ 
            subject: r.교과목, 
            unit: r.능력단위, 
            detail: r.세부교과,
            isEval: r.isEval,
            date: r.날짜,
            period: r.교시
        }));
        
        const requiredCodeSet = await fetchNcsRequiredCodeSet();
        renderCourseTable(renderData, existingCourses, sameCohort, {
            autoUnitType: true,
            requiredCodeSet
        });

        tempJsonData = cleanJson; tempFileName = file.name;
        document.getElementById('fileStatusBox').style.display = "block";
        setSavedTimetableFileName(file.name);
        document.getElementById('downloadBtn').style.display = "none";
        updateTrainingProgressPanel({
            timetable: cleanJson,
            totalDaysText: document.getElementById('totalDays')?.value || '',
            periodText: document.getElementById('trainingPeriod')?.value || ''
        });
    };
    reader.readAsArrayBuffer(file);
}

function renderCourseTable(data, existingCourses = [], sameCohort = false, options = {}) {
    const map = {};
    const ncsCodePattern = /[0-9]{2,}/; 
    const autoUnitType = !!(options.autoUnitType && options.requiredCodeSet && options.requiredCodeSet.size);

    data.forEach(r => {
        let subName = r.subject || '미분류';
        let unitName = r.unit || '미분류';
        let k = subName + "|" + unitName;
        
        if(!map[k]) {
            // 📍 [RD 보존 엔진 가동] 새로 화면을 그리기 전에, DB에 저장되어 있던 동일한 능력단위의 정보를 찾아냅니다.
            let oldData = existingCourses.find(c => c.unit === unitName) || {};
            
            let autoType = oldData.type || (ncsCodePattern.test(unitName) ? "NCS교과" : "");
            let unitType = oldData.unitType || "";
            if (autoUnitType && autoType === 'NCS교과') {
                const resolved = NcsRequiredUtils.resolveAutoUnitType(
                    unitName,
                    oldData.rdCode || "",
                    autoType,
                    options.requiredCodeSet
                );
                if (resolved) unitType = resolved;
            }

            map[k] = { 
                sub: subName, 
                unit: unitName, 
                type: autoType, 
                unitType: unitType,
                evalMethod: oldData.evalMethod || "", // 💡 평가방법 보존
                rdCode: oldData.rdCode || "",         // 💡 RD코드 보존
                det: {}, 
                total: 0, 
                evalDates: Array.isArray(oldData.evalDates) ? oldData.evalDates.map(e => ({ date: e.date, period: e.period })) : []
            };
        }
        let detName = r.detail || '미지정';
        map[k].det[detName] = (map[k].det[detName] || 0) + 1;
        map[k].total++;
        
        // 📍 (평가시험)인 경우 해당 일자와 교시를 배열에 누적
        if (r.isEval) {
            map[k].evalDates = mergeEvalDates(map[k].evalDates, { date: r.date, period: r.period });
        }
    });

    let tableRows = Object.values(map).map(v => ({ 
        subject: v.sub, 
        unit: v.unit, 
        unitType: v.unitType || "", 
        evalMethod: v.evalMethod || "", 
        details: Object.entries(v.det).map(([n, h]) => ({ name: n, hour: h })), 
        totalHours: v.total,
        type: v.type || "",
        rdCode: v.rdCode || "",
        evalDates: v.evalDates
    }));

    if (sameCohort) {
        const renderedUnits = new Set(tableRows.map(row => row.unit));
        existingCourses.forEach(old => {
            if (old?.unit && !renderedUnits.has(old.unit)) {
                tableRows.push({
                    subject: old.subject || '미분류',
                    unit: old.unit,
                    unitType: old.unitType || "",
                    evalMethod: old.evalMethod || "",
                    details: Array.isArray(old.details) ? old.details : [],
                    totalHours: Array.isArray(old.details) ? old.details.reduce((s, d) => s + Number(d.hour || 0), 0) : 0,
                    type: old.type || "",
                    rdCode: old.rdCode || "",
                    evalDates: Array.isArray(old.evalDates) ? old.evalDates : []
                });
            }
        });
    }

    renderTable(tableRows);
}

function autoCalculateSummary(data) {
    const dates = data.map(r => r.날짜).filter(d => d && d.includes('-')).sort();
    if(dates.length > 0) document.getElementById('trainingPeriod').value = dates[0] + " ~ " + dates[dates.length-1];
    const maxDay = Math.max(...data.map(r => parseInt(r.일수) || 0));
    if(maxDay > 0) document.getElementById('totalDays').value = maxDay + "일";
    const ts = {}; data.forEach(r => { if(r.교사) ts[r.교사] = (ts[r.교사] || 0) + 1; });
    let top = "-", mc = 0; for(let t in ts) if(ts[t] > mc) { top = t; mc = ts[t]; }
    document.getElementById('teacherName').value = top;
    updateTrainingProgressPanel({
        timetable: data,
        totalDaysText: document.getElementById('totalDays')?.value || '',
        periodText: document.getElementById('trainingPeriod')?.value || ''
    });
}

function checkTimetableStatus() {
    classDbRef('timetableStorage').once('value', snap => {
        const info = snap.val();
        if(info && info.data) {
            document.getElementById('fileStatusBox').style.display = "block";
            setSavedTimetableFileName(info.fileName);
            document.getElementById('downloadBtn').style.display = "block";
            // 📍 [수리 완료] 페이지 로드 시 엑셀 원본으로 덮어쓰기(autoCalculateSummary) 하던 배선을 절단하여 수동 수정본을 보호합니다.
        }
    });
}

function getTodayDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const ATTENDANCE_ALERT_CUTOFF_MINUTES = 17 * 60 + 31;

function isPastAttendanceAlertCutoff(now = new Date()) {
    return (now.getHours() * 60 + now.getMinutes()) >= ATTENDANCE_ALERT_CUTOFF_MINUTES;
}

function shouldIncludeDateForMissingAttendanceAlert(dateKey, todayKey, now = new Date()) {
    if (!dateKey) return false;
    if (dateKey < todayKey) return true;
    if (dateKey > todayKey) return false;
    return isPastAttendanceAlertCutoff(now);
}

function parseTrainingDaysCount(text) {
    const m = String(text || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
}

function parseTrainingPeriodRange(periodText) {
    const parts = String(periodText || '').split('~').map(s => s.trim());
    if (parts.length < 2) return { start: parts[0] || '', end: '' };
    return { start: parts[0], end: parts[1] };
}

function buildMaxDayPerDateFromTimetable(rawTimetable) {
    const map = {};
    (rawTimetable || []).forEach(row => {
        const date = fixDate(row.날짜);
        const dayNum = parseInt(String(row.일수 || '').trim(), 10);
        if (!date || !dayNum || dayNum <= 0) return;
        if (!map[date] || dayNum > map[date]) map[date] = dayNum;
    });
    return map;
}

function findDateForTrainingDayNumber(dateDayMap, targetDay) {
    if (!targetDay || !dateDayMap) return '';
    const entries = Object.entries(dateDayMap).sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < entries.length; i++) {
        if (entries[i][1] >= targetDay) return entries[i][0];
    }
    return entries.length ? entries[entries.length - 1][0] : '';
}

function attachTrainingMilestones(metrics, dateDayMap, totalDays) {
    if (!metrics || totalDays <= 0) {
        return {
            ...metrics,
            milestone70Day: 0,
            milestone80Day: 0,
            milestone70Date: '',
            milestone80Date: ''
        };
    }
    const milestone70Day = Math.ceil(totalDays * 0.7);
    const milestone80Day = Math.ceil(totalDays * 0.8);
    return {
        ...metrics,
        milestone70Day,
        milestone80Day,
        milestone70Date: findDateForTrainingDayNumber(dateDayMap, milestone70Day),
        milestone80Date: findDateForTrainingDayNumber(dateDayMap, milestone80Day)
    };
}

function trainingProgressMarkerLineCoords(percent, innerR, outerR, cx = 50, cy = 50) {
    const rad = (percent * 3.6) * Math.PI / 180;
    return {
        x1: cx + innerR * Math.sin(rad),
        y1: cy - innerR * Math.cos(rad),
        x2: cx + outerR * Math.sin(rad),
        y2: cy - outerR * Math.cos(rad)
    };
}

function trainingProgressMarkerLabelCoords(percent, labelR, cx = 50, cy = 50) {
    const rad = (percent * 3.6) * Math.PI / 180;
    return {
        x: cx + labelR * Math.sin(rad),
        y: cy - labelR * Math.cos(rad)
    };
}

const TRAINING_PROGRESS_MARKER_OUTER_R = 49;
const TRAINING_PROGRESS_MARKER_LABEL_R = 61;

function renderTrainingProgressMarkers(metrics) {
    const svg = document.getElementById('trainingProgressMarkers');
    const line70 = document.getElementById('trainingProgressMarker70');
    const line80 = document.getElementById('trainingProgressMarker80');
    const label70 = document.getElementById('trainingProgressLabel70');
    const label80 = document.getElementById('trainingProgressLabel80');
    if (!svg || !line70 || !line80 || !label70 || !label80) return;

    const show = metrics.status !== 'empty' && metrics.totalDays > 0;
    svg.style.display = show ? '' : 'none';
    if (!show) return;

    const c70 = trainingProgressMarkerLineCoords(70, 38, TRAINING_PROGRESS_MARKER_OUTER_R);
    const c80 = trainingProgressMarkerLineCoords(80, 38, TRAINING_PROGRESS_MARKER_OUTER_R);
    const t70 = trainingProgressMarkerLabelCoords(70, TRAINING_PROGRESS_MARKER_LABEL_R);
    const t80 = trainingProgressMarkerLabelCoords(80, TRAINING_PROGRESS_MARKER_LABEL_R);
    line70.setAttribute('x1', c70.x1);
    line70.setAttribute('y1', c70.y1);
    line70.setAttribute('x2', c70.x2);
    line70.setAttribute('y2', c70.y2);
    line80.setAttribute('x1', c80.x1);
    line80.setAttribute('y1', c80.y1);
    line80.setAttribute('x2', c80.x2);
    line80.setAttribute('y2', c80.y2);
    label70.setAttribute('x', t70.x);
    label70.setAttribute('y', t70.y);
    label80.setAttribute('x', t80.x);
    label80.setAttribute('y', t80.y);

    const tip70 = metrics.milestone70Date
        ? `70% 도달: ${metrics.milestone70Day}일차 (${metrics.milestone70Date})`
        : `70% 도달: ${metrics.milestone70Day}일차`;
    const tip80 = metrics.milestone80Date
        ? `80% 도달: ${metrics.milestone80Day}일차 (${metrics.milestone80Date})`
        : `80% 도달: ${metrics.milestone80Day}일차`;
    line70.querySelector('title')?.remove();
    line80.querySelector('title')?.remove();
    const title70 = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title70.textContent = tip70;
    line70.appendChild(title70);
    const title80 = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title80.textContent = tip80;
    line80.appendChild(title80);
}

function computeTrainingProgressMetrics(rawTimetable, totalDaysText, todayKey, periodText) {
    const dateDayMap = buildMaxDayPerDateFromTimetable(rawTimetable);
    const dates = Object.keys(dateDayMap).sort();

    let totalDays = parseTrainingDaysCount(totalDaysText);
    if (totalDays <= 0 && dates.length > 0) {
        totalDays = Math.max(...Object.values(dateDayMap));
    }

    let currentDay = 0;
    dates.forEach(date => {
        if (date <= todayKey) currentDay = Math.max(currentDay, dateDayMap[date]);
    });

    const period = parseTrainingPeriodRange(periodText);
    const startDate = period.start || dates[0] || '';
    const endDate = period.end || dates[dates.length - 1] || '';

    if (!dates.length && totalDays <= 0) {
        return attachTrainingMilestones(
            { status: 'empty', percent: 0, currentDay: 0, totalDays: 0, startDate, endDate, label: '' },
            dateDayMap,
            0
        );
    }

    if (startDate && todayKey < startDate) {
        const diff = Math.ceil((new Date(startDate + 'T00:00:00') - new Date(todayKey + 'T00:00:00')) / 86400000);
        return attachTrainingMilestones({
            status: 'before',
            percent: 0,
            currentDay: 0,
            totalDays,
            startDate,
            endDate,
            label: `훈련 시작 전 (D-${diff})`
        }, dateDayMap, totalDays);
    }

    let percent = 0;
    if (totalDays > 0) {
        percent = Math.min(100, Math.round((currentDay / totalDays) * 1000) / 10);
    }

    if (totalDays > 0 && currentDay >= totalDays) {
        return attachTrainingMilestones({
            status: 'complete',
            percent: 100,
            currentDay: totalDays,
            totalDays,
            startDate,
            endDate,
            label: `${totalDays}일 / ${totalDays}일 · 훈련 완료`
        }, dateDayMap, totalDays);
    }

    const dayLabel = totalDays > 0 ? `${currentDay}일 / ${totalDays}일` : `${currentDay}일`;
    return attachTrainingMilestones(
        { status: 'ongoing', percent, currentDay, totalDays, startDate, endDate, label: dayLabel },
        dateDayMap,
        totalDays
    );
}

function renderTrainingProgressPanel(metrics) {
    const percentEl = document.getElementById('trainingProgressPercent');
    const ringEl = document.getElementById('trainingProgressRing');
    const metaEl = document.getElementById('trainingProgressMeta');
    const panel = document.getElementById('trainingProgressPanel');
    if (!percentEl || !ringEl || !metaEl) return;

    if (metrics.status === 'empty') {
        percentEl.textContent = '-';
        ringEl.style.setProperty('--progress', '0%');
        metaEl.textContent = '시간표 등록 후 진행률이 표시됩니다.';
        if (panel) {
            panel.classList.remove('is-complete', 'is-before');
        }
        renderTrainingProgressMarkers(metrics);
        return;
    }

    const percentText = Number.isInteger(metrics.percent) ? String(metrics.percent) : metrics.percent.toFixed(1);
    percentEl.textContent = percentText + '%';
    ringEl.style.setProperty('--progress', metrics.percent + '%');

    const periodPart = metrics.startDate && metrics.endDate
        ? `${metrics.startDate} ~ ${metrics.endDate}`
        : (metrics.startDate || '');
    const metaParts = [];
    if (metrics.label) metaParts.push(metrics.label);
    if (periodPart) metaParts.push(periodPart);
    metaEl.textContent = metaParts.join(' · ');

    if (panel) {
        panel.classList.toggle('is-complete', metrics.status === 'complete');
        panel.classList.toggle('is-before', metrics.status === 'before');
    }
    renderTrainingProgressMarkers(metrics);
}

async function updateTrainingProgressPanel(prefetched = {}) {
    try {
        let timetable = prefetched.timetable;
        let totalDaysText = prefetched.totalDaysText;
        let periodText = prefetched.periodText;

        if (!timetable) {
            const snap = await classDbRef('fullTimetable').once('value');
            const val = snap.val() || [];
            timetable = Array.isArray(val) ? val : Object.values(val);
        }
        if (!totalDaysText) {
            totalDaysText = document.getElementById('totalDays')?.value || '';
        }
        if (!periodText) {
            periodText = document.getElementById('trainingPeriod')?.value || '';
        }
        if (!totalDaysText || !periodText) {
            const masterSnap = await classDbRef('masterData').once('value');
            const master = masterSnap.val() || {};
            if (!totalDaysText) totalDaysText = master.days || '';
            if (!periodText) periodText = master.period || '';
        }
        if ((!timetable || timetable.length === 0) && tempJsonData) {
            timetable = tempJsonData;
        }

        const metrics = computeTrainingProgressMetrics(
            timetable,
            totalDaysText,
            getTodayDateKey(),
            periodText
        );
        renderTrainingProgressPanel(metrics);
    } catch (error) {
        console.warn('훈련 진행률 갱신 실패', error);
    }
}

function cleanAlertCompareText(value) {
    return String(value || "").replace(/\s+/g, "");
}

function isRealTrainingRowForAlert(row, subjectList, unitList) {
    const date = fixDate(row.날짜);
    const dayNumber = String(row.일수 || "").trim();
    const periodText = String(row.교시 || "").trim();
    const subjectName = String(row.교과목 || "").trim();

    if (!date || !dayNumber || dayNumber === "-" || periodText.includes("점심")) return false;

    const cleanSubject = cleanAlertCompareText(subjectName);
    if (!cleanSubject) return false;

    if (subjectList.length === 0 && unitList.length === 0) return false;

    return subjectList.some(name => name && (name.includes(cleanSubject) || cleanSubject.includes(name))) ||
           unitList.some(name => name && (name.includes(cleanSubject) || cleanSubject.includes(name)));
}

function escapeAlertHTML(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function makeEvalAlertDbKey(subject, unitName) {
    return `${subject}_${unitName || "종합"}`.replace(/[\.\#\$\/\[\]]/g, '');
}

function normalizeEvaluationDates(raw) {
    if (!raw || typeof raw !== 'object') return { subject: {}, ncs: {} };
    const subject = raw.subject || {};
    const ncs = raw.ncs || {};
    if (Object.keys(subject).length || Object.keys(ncs).length) {
        return { subject, ncs };
    }
    const legacy = {};
    Object.keys(raw).forEach(key => {
        if (/^\d{4}-\d{2}-\d{2}/.test(key)) legacy[key] = raw[key];
    });
    return { subject: {}, ncs: legacy };
}

function putEvalAlertCalendarMatch(matches, entry) {
    if (!entry.dbKey || !entry.date) return;
    if (!matches[entry.dbKey] || entry.date < matches[entry.dbKey].date) {
        matches[entry.dbKey] = entry;
    }
}

function resolveEvalAlertDisplayTitle(item, evalPlans) {
    const plan = (evalPlans && evalPlans[item.dbKey]) || {};
    const unit = String(plan.unitName || item.title || '').replace(/\[.*?\]/g, '').trim();
    const subject = String(plan.subject || '').trim();
    if (unit && subject && unit !== subject) return `${subject} · ${unit}`;
    return unit || subject || item.title || item.dbKey || '평가';
}

function getEvalDateMatchesFromCalendar(evaluationDates, courses, viewMode) {
    const matches = {};
    const clean = cleanAlertCompareText;
    const modeKeys = (viewMode === 'subject' || viewMode === 'ncs')
        ? [viewMode]
        : ['subject', 'ncs'];

    modeKeys.forEach(modeKey => {
        const datesObj = evaluationDates[modeKey] || {};
        Object.keys(datesObj).forEach(dateKey => {
            const subjectsText = datesObj[dateKey]?.subjects || "";
            if (!subjectsText) return;

            subjectsText.split(',').map(s => s.trim()).filter(Boolean).forEach(targetName => {
                if (modeKey === "subject") {
                    const dbKey = makeEvalAlertDbKey(targetName, "");
                    putEvalAlertCalendarMatch(matches, {
                        dbKey,
                        date: dateKey,
                        title: targetName,
                        source: "평가일"
                    });
                    return;
                }

                const cleanTarget = clean(targetName);
                const matchedCourse = courses.find(c => {
                    const unitText = String(c.unit || "").replace(/\[.*?\]/g, '').trim();
                    return clean(unitText) === cleanTarget || clean(c.subject) === cleanTarget;
                });

                if (matchedCourse) {
                    const unitText = String(matchedCourse.unit || "").replace(/\[.*?\]/g, '').trim();
                    const dbKey = makeEvalAlertDbKey(matchedCourse.subject, unitText);
                    putEvalAlertCalendarMatch(matches, {
                        dbKey,
                        date: dateKey,
                        title: unitText || matchedCourse.subject,
                        source: "평가일"
                    });
                }
            });
        });
    });

    return matches;
}

function buildEvalAlertMap(courses, evalPlans, evaluationDates, viewMode) {
    const alertMap = getEvalDateMatchesFromCalendar(evaluationDates, courses, viewMode);

    Object.keys(evalPlans || {}).forEach(dbKey => {
        const plan = evalPlans[dbKey] || {};
        const date = fixDate(plan.dateMain);
        if (!date) return;

        alertMap[dbKey] = {
            dbKey,
            date,
            title: plan.unitName || plan.subject || dbKey,
            source: "평가지"
        };
    });

    return alertMap;
}

function partitionEvalAlerts(courses, evalPlans, evalCompletions, evaluationDates, todayKey, viewMode) {
    const pending = Object.values(buildEvalAlertMap(courses, evalPlans, evaluationDates, viewMode))
        .filter(item => item.date && !(evalCompletions[item.dbKey] && evalCompletions[item.dbKey].completed));

    const nearestUpcoming = pending
        .filter(item => item.date > todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;

    const overdue = pending
        .filter(item => item.date <= todayKey)
        .sort((a, b) => b.date.localeCompare(a.date));

    return { nearestUpcoming, overdue };
}

function getEvalPanelHeaderEval(nearestUpcoming, overdueEvaluations, todayKey) {
    if (nearestUpcoming) return nearestUpcoming;
    return overdueEvaluations.find(item => item.date === todayKey) || null;
}

function formatEvalTimeSlotFromPeriods(periods) {
    if (!periods.length) return "";
    const hasAm = periods.some(p => p >= 1 && p <= 4);
    const hasPm = periods.some(p => p >= 5 && p <= 8);
    if (hasAm && hasPm) return "오전/오후";
    if (hasPm) return "오후";
    if (hasAm) return "오전";
    return "";
}

function parseEvalPeriodNumbers(periodValue) {
    const periodStr = String(periodValue || "").trim();
    if (!periodStr || periodStr === "-") return [];

    const nums = [];
    periodStr.split(",").forEach(part => {
        const chunk = part.trim();
        if (!chunk) return;
        if (chunk.includes("~") || chunk.includes("-")) {
            const bounds = chunk.split(/[~-]/).map(s => parseInt(String(s).replace(/[^0-9]/g, ""), 10));
            const start = bounds[0];
            const end = bounds[1];
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.min(start, end); i <= Math.max(start, end); i++) nums.push(i);
            }
        } else {
            const n = parseInt(chunk.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(n) && n > 0) nums.push(n);
        }
    });

    return [...new Set(nums)].sort((a, b) => a - b);
}

function evalDetailMatchesAlertItem(detailSub, evalItem, plan) {
    const detailClean = cleanAlertCompareText(detailSub);
    const titleClean = cleanAlertCompareText(evalItem.title);
    const subjectClean = cleanAlertCompareText(plan.subject || "");
    const unitClean = cleanAlertCompareText(String(plan.unitName || "").replace(/\[.*?\]/g, ""));

    if (titleClean && (titleClean === detailClean || titleClean.includes(detailClean) || detailClean.includes(titleClean))) {
        return true;
    }
    if (subjectClean && (subjectClean === detailClean || subjectClean.includes(detailClean) || detailClean.includes(subjectClean))) {
        return true;
    }
    if (unitClean && (unitClean === detailClean || unitClean.includes(detailClean) || detailClean.includes(unitClean))) {
        return true;
    }
    return false;
}

function resolveEvalTimeSlotForAlertItem(evalItem, evalPlans, evaluationDates, courses, rawTimetable) {
    const plan = evalPlans[evalItem.dbKey] || {};
    let periodNums = [];

    ["subject", "ncs"].forEach(modeKey => {
        const dayData = evaluationDates?.[modeKey]?.[evalItem.date];
        if (!dayData?.details) return;
        dayData.details.forEach(detail => {
            if (!evalDetailMatchesAlertItem(detail.sub, evalItem, plan)) return;
            periodNums.push(...parseEvalPeriodNumbers(detail.period));
        });
    });

    if (!periodNums.length) {
        courses.forEach(course => {
            const unitText = String(course.unit || "").replace(/\[.*?\]/g, "").trim();
            const dbKey = makeEvalAlertDbKey(course.subject, unitText);
            if (dbKey !== evalItem.dbKey) return;
            (course.evalDates || []).forEach(ed => {
                if (fixDate(ed.date) !== evalItem.date) return;
                const p = parseInt(ed.period, 10);
                if (!isNaN(p) && p > 0) periodNums.push(p);
            });
        });
    }

    if (!periodNums.length && rawTimetable?.length) {
        const titleClean = cleanAlertCompareText(evalItem.title);
        const subjectClean = cleanAlertCompareText(plan.subject || "");
        const unitClean = cleanAlertCompareText(String(plan.unitName || "").replace(/\[.*?\]/g, ""));

        rawTimetable.forEach(row => {
            if (fixDate(row.날짜) !== evalItem.date) return;
            const isEvalRow = row.isEval || String(row.능력단위 || "").includes("(평가시험)");
            if (!isEvalRow) return;

            const unitName = String(row.능력단위 || "").replace(/\(평가시험\)/g, "").trim();
            const subjectName = String(row.교과목 || "").trim();
            const rowUnitClean = cleanAlertCompareText(unitName);
            const rowSubClean = cleanAlertCompareText(subjectName);
            const matches = (titleClean && (rowUnitClean === titleClean || rowSubClean === titleClean || rowUnitClean.includes(titleClean) || titleClean.includes(rowUnitClean)))
                || (unitClean && rowUnitClean === unitClean)
                || (subjectClean && rowSubClean === subjectClean);
            if (!matches) return;

            periodNums.push(getTodayPeriodNumber(row));
        });
    }

    periodNums = [...new Set(periodNums.filter(p => p > 0))].sort((a, b) => a - b);
    return formatEvalTimeSlotFromPeriods(periodNums);
}

function enrichNearestEvalAlertItem(evalItem, evalPlans, evaluationDates, courses, rawTimetable, todayKey) {
    if (!evalItem) return null;
    return {
        ...evalItem,
        subjectLabel: resolveEvalAlertDisplayTitle(evalItem, evalPlans),
        timeSlot: resolveEvalTimeSlotForAlertItem(evalItem, evalPlans, evaluationDates, courses, rawTimetable),
        isToday: evalItem.date === todayKey
    };
}

function buildNearestUpcomingEvalDate(courses, evalPlans, evalCompletions, evaluationDates, todayKey, viewMode) {
    return partitionEvalAlerts(courses, evalPlans, evalCompletions, evaluationDates, todayKey, viewMode).nearestUpcoming;
}

function cleanTodaySubjectName(raw) {
    return String(raw || "")
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/^[a-zA-Z0-9_\-]{5,}\s*/, "")
        .replace(/\s+/g, "")
        .trim();
}

function formatUnitDisplayName(unitName) {
    const stripped = String(unitName || "").replace(/\[.*?\]/g, "").trim();
    return stripped || String(unitName || "").trim();
}

function getTodayPeriodNumber(row) {
    return parseInt(String(row.교시 || "").replace(/[^0-9]/g, ""), 10) || 0;
}

function getTodayRowPlace(row) {
    return String(row.장소 || row.훈련장소 || row.훈련시설명 || "").trim();
}

function summarizeHalfDayLines(rows, periodLabel) {
    if (!rows.length) return [];

    const seen = new Map();
    rows.forEach(row => {
        const openKey = String(row.능력단위 || "").trim();
        const name = cleanTodaySubjectName(openKey || row.교과목 || "");
        if (!name || seen.has(name)) return;
        seen.set(name, {
            place: getTodayRowPlace(row),
            openKey: openKey || String(row.교과목 || "").trim()
        });
    });

    return [...seen.entries()].map(([subject, info]) => ({
        period: periodLabel,
        subject,
        place: info.place,
        openKey: info.openKey
    }));
}

function buildTodayLessonSummary(rawTimetable, todayKey, subjectList, unitList) {
    const rows = rawTimetable
        .filter(row => isRealTrainingRowForAlert(row, subjectList, unitList) && fixDate(row.날짜) === todayKey)
        .sort((a, b) => getTodayPeriodNumber(a) - getTodayPeriodNumber(b));

    if (!rows.length) {
        return { hasClass: false, text: "오늘 등록된 수업이 없습니다." };
    }

    const lines = [
        ...summarizeHalfDayLines(rows.filter(r => {
            const p = getTodayPeriodNumber(r);
            return p >= 1 && p <= 4;
        }), "오전"),
        ...summarizeHalfDayLines(rows.filter(r => {
            const p = getTodayPeriodNumber(r);
            return p >= 5 && p <= 8;
        }), "오후")
    ];

    if (!lines.length) {
        return { hasClass: false, text: "오늘 등록된 수업이 없습니다." };
    }

    return { hasClass: true, lines };
}

function setAlertCountBadge(el, count) {
    if (!el) return;
    const n = Number(count) || 0;
    if (n > 0) {
        el.textContent = String(n);
        el.style.display = '';
        el.classList.remove('is-zero');
    } else {
        el.textContent = '';
        el.style.display = 'none';
        el.classList.add('is-zero');
    }
}

function renderTodayLessonSummary(summaryEl, badgeEl, todayKey, summary) {
    if (badgeEl) badgeEl.innerText = todayKey.slice(5).replace("-", "/");
    if (!summaryEl) return;

    if (!summary.hasClass) {
        summaryEl.innerHTML = `<div class="alert-section-empty-line" style="color:#7f8c8d; background:#f8f9fa; border-color:#e5e7eb;">${escapeAlertHTML(summary.text)}</div>`;
        return;
    }

    summaryEl.innerHTML = summary.lines.map(line => {
        const subjectPart = `${line.period} ${line.subject}`;
        const placePart = line.place ? `[${line.place}]` : "";
        const openKey = line.openKey || line.subject;
        return `<div class="alert-section-empty-line today-log-summary-line is-clickable" role="button" tabindex="0" title="능력단위 출석부 보기" data-open-subject="${escapeAlertHTML(openKey)}" data-open-date="${escapeAlertHTML(todayKey)}"><span class="today-log-period-subject">${escapeAlertHTML(subjectPart)}</span>${placePart ? `<span class="today-log-place">${escapeAlertHTML(placePart)}</span>` : ""}</div>`;
    }).join("");
}

async function openTodaySubjectUnitAttendance(openKey, openDate) {
    if (!openKey || !openDate) return;
    if (typeof UnitAttendanceModal === 'undefined') {
        await appAlert('출석부 모듈을 불러오지 못했습니다.');
        return;
    }

    try {
        const [timetableSnap, attendanceSnap, dropoutSnap, earlySnap] = await Promise.all([
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('earlyCompletions').once('value')
        ]);

        const timetableVal = timetableSnap.val() || [];
        const rawTimetable = Array.isArray(timetableVal) ? timetableVal : Object.values(timetableVal);
        const fullAttendanceData = attendanceSnap.val() || {};
        const dropoutData = dropoutSnap.val() || {};
        const earlyCompletionData = earlySnap.val() || {};
        const studentNames = collectStudentNamesFromAttendance(fullAttendanceData);

        await UnitAttendanceModal.open({
            rawTimetable,
            fullAttendanceData,
            studentNames,
            dropoutData,
            earlyCompletionData
        }, openKey, 'ncs', openDate);
    } catch (error) {
        console.error('오늘 과목 출석부 열기 오류:', error);
        await appAlert('출석부를 불러오지 못했습니다.');
    }
}

function handleTodayLogSummaryClick(e) {
    const line = e.target.closest('.today-log-summary-line[data-open-subject]');
    if (!line) return;
    openTodaySubjectUnitAttendance(line.getAttribute('data-open-subject'), line.getAttribute('data-open-date'));
}

function handleTodayLogSummaryKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const line = e.target.closest('.today-log-summary-line[data-open-subject]');
    if (!line) return;
    e.preventDefault();
    openTodaySubjectUnitAttendance(line.getAttribute('data-open-subject'), line.getAttribute('data-open-date'));
}

function buildTrainingLogLeaveChecker(dropoutData, earlyCompletionData) {
    function getStudentLeaveDate(name) {
        if (dropoutData[name]) return dropoutData[name];
        if (earlyCompletionData[name]) return earlyCompletionData[name];
        return null;
    }
    return function isDateOnOrAfterStudentLeave(name, date) {
        const leaveDate = getStudentLeaveDate(name);
        return !!(leaveDate && date >= leaveDate);
    };
}

function collectStudentNamesFromAttendance(fullAttendanceData) {
    const studentNames = [];
    Object.values(fullAttendanceData || {}).forEach(dayData => {
        Object.keys(dayData || {}).forEach(name => {
            if (name !== '_metadata' && !studentNames.includes(name)) studentNames.push(name);
        });
    });
    studentNames.sort();
    return studentNames.length ? studentNames : ['훈련생'];
}

async function openTodayTrainingLogOnIndex() {
    const btn = document.getElementById('btnOpenTodayTrainingLog');
    if (btn?.disabled) return;

    try {
        const [timetableSnap, attendanceSnap, evalSnap, userConfigSnap, dropoutSnap, earlySnap] = await Promise.all([
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('evaluationDates').once('value'),
            classDbRef('userConfig/defaultView').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('earlyCompletions').once('value')
        ]);

        const rawTimetable = timetableSnap.val() || [];
        const fullAttendanceData = attendanceSnap.val() || {};
        const rawEval = evalSnap.val() || {};
        const evaluationDates = { subject: rawEval.subject || {}, ncs: rawEval.ncs || {} };
        const dropoutData = dropoutSnap.val() || {};
        const earlyCompletionData = earlySnap.val() || {};
        const dbViewMode = userConfigSnap.val();
        const calendarSubMode = (dbViewMode === 'subject' || dbViewMode === 'ncs')
            ? dbViewMode
            : (localStorage.getItem(classStorageKey('defaultViewMode')) || 'ncs');
        const studentNames = collectStudentNamesFromAttendance(fullAttendanceData);
        const maps = TrainingLogAPI.buildCalendarMaps(rawTimetable, calendarSubMode);
        const todayKey = getTodayDateKey();

        await TrainingLogAPI.open({
            rawTimetable,
            fullAttendanceData,
            studentNames,
            evaluationDates,
            calendarSubMode,
            globalFirstDateMap: maps.globalFirstDateMap,
            globalSortedBusinessDays: maps.globalSortedBusinessDays,
            isDateOnOrAfterStudentLeave: buildTrainingLogLeaveChecker(dropoutData, earlyCompletionData),
            appAlert
        }, todayKey);
    } catch (error) {
        console.error('오늘 훈련일지 열기 오류:', error);
        await appAlert('오늘 훈련일지를 불러오지 못했습니다.');
    }
}

function getDaysUntilDate(todayKey, targetDate) {
    const today = new Date(`${todayKey}T00:00:00`);
    const target = new Date(`${targetDate}T00:00:00`);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function formatEvalDday(todayKey, targetDate) {
    const days = getDaysUntilDate(todayKey, targetDate);
    if (days === 0) return "D-DAY";
    if (days > 0) return `D-${days}`;
    return `D+${Math.abs(days)}`;
}

function updateEvalNextDateLabel(labelEl, ddayEl, nearestEval, todayKey, evalPlans) {
    if (!nearestEval) {
        if (labelEl) labelEl.textContent = "";
        if (ddayEl) ddayEl.textContent = "";
        return;
    }
    const shortDate = nearestEval.date.slice(5).replace("-", "/");
    const ddayText = formatEvalDday(todayKey, nearestEval.date);
    const title = resolveEvalAlertDisplayTitle(nearestEval, evalPlans || {});
    if (labelEl) {
        labelEl.textContent = `다음 ${shortDate}`;
        labelEl.title = `${nearestEval.date} ${title}`;
    }
    if (ddayEl) {
        ddayEl.textContent = ddayText;
        ddayEl.title = `평가일 ${nearestEval.date} · ${title} · ${ddayText}`;
    }
}

function buildOverdueEvaluationAlerts(courses, evalPlans, evalCompletions, evaluationDates, todayKey, viewMode) {
    return partitionEvalAlerts(courses, evalPlans, evalCompletions, evaluationDates, todayKey, viewMode).overdue;
}

function countEvalAlertItems(overdueEvaluations, nearestUpcomingEval) {
    return overdueEvaluations.length + (nearestUpcomingEval ? 1 : 0);
}

function renderAttendanceAlertList(listEl, missingDates) {
    if (missingDates.length === 0) {
        listEl.innerHTML = `<div class="alert-section-empty-line">✅ 미등록 출석부 없음</div>`;
        return;
    }

    const visibleDates = missingDates.slice(0, 4);
    listEl.innerHTML = visibleDates.map(item => {
        const subjectText = Array.from(item.subjects).slice(0, 2).join(', ') || '수업 정보 확인 필요';
        const extraCount = item.subjects.size > 2 ? ` 외 ${item.subjects.size - 2}건` : '';
        return `
            <div class="attendance-missing-item">
                <div class="attendance-missing-date">
                    <span>${escapeAlertHTML(item.date)} ${item.weekday ? `(${escapeAlertHTML(item.weekday)})` : ''}</span>
                    <span class="attendance-missing-day">${escapeAlertHTML(item.dayNumber)}회차</span>
                </div>
                <div class="attendance-missing-subject">${escapeAlertHTML(subjectText)}${escapeAlertHTML(extraCount)}</div>
            </div>
        `;
    }).join('') + (missingDates.length > 4 ? `<div class="alert-section-empty-line" style="color:#d35400; background:#fffaf4; border-color:#ffd8b5;">외 ${missingDates.length - 4}일 더 있음</div>` : '');
}

function renderEvaluationAlertList(listEl, overdueEvaluations, nearestUpcomingEval, evalPlans, todayKey) {
    let html = "";

    if (nearestUpcomingEval) {
        const subjectLabel = nearestUpcomingEval.subjectLabel || resolveEvalAlertDisplayTitle(nearestUpcomingEval, evalPlans);
        const slotLabel = nearestUpcomingEval.timeSlot || "";
        html += `<div class="eval-alert-block eval-alert-block--next">`;
        html += `<div class="eval-alert-section-label">다음 평가</div>`;
        html += `<div class="alert-section-empty-line eval-nearest-summary-line">
            <div class="eval-nearest-top-row">
                <span class="eval-nearest-date">${escapeAlertHTML(nearestUpcomingEval.date)}</span>
                ${slotLabel ? `<span class="eval-nearest-slot">${escapeAlertHTML(slotLabel)}</span>` : ""}
            </div>
            <span class="eval-nearest-subject">${escapeAlertHTML(subjectLabel)}</span>
        </div>`;
        html += `</div>`;
    }

    const overdueBlockClass = nearestUpcomingEval ? " eval-alert-block--split" : "";
    html += `<div class="eval-alert-block eval-alert-block--overdue${overdueBlockClass}">`;
    html += `<div class="eval-alert-section-label eval-alert-section-label--overdue">미완료 (오늘·지난 평가)</div>`;

    if (overdueEvaluations.length === 0) {
        html += `<div class="alert-section-empty-line">✅ 미완료 평가 없음</div>`;
        html += `</div>`;
        listEl.innerHTML = html;
        return;
    }

    const visibleEvals = overdueEvaluations.slice(0, 4);
    html += visibleEvals.map(item => {
        const title = resolveEvalAlertDisplayTitle(item, evalPlans);
        const isToday = item.date === todayKey;
        const itemClass = isToday ? " eval-overdue-item--today" : "";
        const badge = isToday ? "D-DAY" : "미완료";
        return `
        <div class="attendance-missing-item eval-overdue-item${itemClass}">
            <div class="attendance-missing-date eval-overdue-date">
                <span>${escapeAlertHTML(item.date)}</span>
                <span class="attendance-missing-day">${badge}</span>
            </div>
            <div class="attendance-missing-subject">${escapeAlertHTML(title)}</div>
        </div>
    `;
    }).join('') + (overdueEvaluations.length > 4 ? `<div class="alert-section-empty-line eval-overdue-more">외 ${overdueEvaluations.length - 4}건 더 있음</div>` : '');
    html += `</div>`;
    listEl.innerHTML = html;
}

function calculateAlertParticipation(date, inTime, outTime, targetSub, leaveTime, returnTime, rawTimetable, mode) {
    if (!inTime || !outTime || inTime.startsWith("00")) return { am: 0, pm: 0 };

    const scheds = rawTimetable.filter(r => {
        const rowVal = (mode === 'subject') ? String(r.교과목 || "") : String(r.능력단위 || "");
        return fixDate(r.날짜) === date && rowVal.replace(/\s+/g, "") === String(targetSub).replace(/\s+/g, "");
    });

    let am = 0, pm = 0;
    const toMin = (t) => {
        if (!t || !String(t).includes(':')) return 0;
        const p = t.split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1]);
    };
    const sIn = toMin(inTime), sOut = toMin(outTime), lIn = toMin(leaveTime), rIn = toMin(returnTime);
    const lunchS = 13 * 60, lunchE = 13 * 60 + 30;

    scheds.forEach(s => {
        let timeStr = String(s.시간 || s.교육시간 || "").replace(/\s/g, "");
        let parts = timeStr.split(/[~-]/);
        if (parts.length >= 2) {
            let start = toMin(parts[0]), end = toMin(parts[1]) + 10;
            let actualStart = Math.max(sIn, start), actualEnd = Math.min(sOut, end);
            let dur = Math.max(0, actualEnd - actualStart);
            const overlapLunch = Math.max(0, Math.min(actualEnd, lunchE) - Math.max(actualStart, lunchS));
            dur -= overlapLunch;
            if (lIn > 0 && rIn > 0) {
                const overlapOut = Math.max(0, Math.min(rIn, actualEnd) - Math.max(lIn, actualStart));
                const outLunch = Math.max(0, Math.min(rIn, lunchE, actualEnd) - Math.max(lIn, lunchS, actualStart));
                dur -= (overlapOut - outLunch);
            }
            const p = String(s.교시).trim();
            if (['1', '2', '3', '4'].includes(p)) am += dur;
            else if (['5', '6', '7', '8'].includes(p)) pm += dur;
        }
    });
    return { am: Math.round(am), pm: Math.round(pm) };
}

function hasMakeupDetailsContent(makeupDetails, studentName, escapedItem) {
    const history = makeupDetails[studentName]?.[escapedItem];
    return !!(history && typeof history === 'object' && Object.keys(history).length > 0);
}

function hasMakeupWaiver(makeupWaivers, studentName, escapedItem) {
    const waiver = makeupWaivers[studentName]?.[escapedItem];
    return !!(waiver && (waiver.waived === true || waiver === true));
}

function getStudentLeaveDate(dropouts, earlyCompletions, name) {
    if (dropouts && dropouts[name]) return dropouts[name];
    if (earlyCompletions && earlyCompletions[name]) return earlyCompletions[name];
    return null;
}

function isStudentLeaveOnOrBefore(dropouts, earlyCompletions, name, cutoffDate) {
    const leaveDate = getStudentLeaveDate(dropouts, earlyCompletions, name);
    return !!(leaveDate && leaveDate <= cutoffDate);
}

function isDateOnOrAfterStudentLeave(dropouts, earlyCompletions, name, date) {
    const leaveDate = getStudentLeaveDate(dropouts, earlyCompletions, name);
    return !!(leaveDate && date >= leaveDate);
}

function buildMissingMakeupAlerts({ rawTimetable, masterSubjectList, ncsList, dailyAttendance, manualAttendance, makeupDetails, makeupWaivers, evaluationDates, dropouts, earlyCompletions, studentNames, viewMode }) {
    const alerts = [];
    const currentMode = viewMode === 'ncs' ? 'ncs' : 'subject';
    const targetBaseList = currentMode === 'subject' ? masterSubjectList : ncsList;

    targetBaseList.forEach(item => {
        const subData = rawTimetable.filter(r => {
            const targetVal = currentMode === 'subject' ? String(r.교과목 || "") : String(r.능력단위 || "");
            return targetVal.trim() === item;
        });
        const subDates = [...new Set(subData.map(r => fixDate(r.날짜)))].filter(Boolean).sort();
        if (!subDates.length) return;

        const escapedItem = item.replace(/[\.\#\$\/\[\]]/g, "_");
        let masterTotalMin = 0;
        const dateSchedules = {};
        subDates.forEach(date => {
            dateSchedules[date] = calculateAlertParticipation(date, "09:00", "17:30", item, "", "", rawTimetable, currentMode);
            masterTotalMin += (dateSchedules[date].am + dateSchedules[date].pm);
        });
        if (masterTotalMin <= 0) return;

        let targetCutoffDate = subDates[subDates.length - 1];
        const evalDatesObj = (evaluationDates && evaluationDates[currentMode]) || {};
        for (const [eDate, eData] of Object.entries(evalDatesObj)) {
            const eSubs = eData.subjects || "";
            const cleanItem = currentMode === 'ncs' ? item.replace(/\[.*?\]/g, '').trim() : item;
            if (eSubs.includes(cleanItem) || eSubs.includes(item)) {
                targetCutoffDate = eDate;
                break;
            }
        }

        const displayTitle = currentMode === 'ncs' ? item.replace(/\[.*?\]/g, '').trim() : item;

        for (const name of studentNames) {
            const isSubjectDropout = isStudentLeaveOnOrBefore(dropouts, earlyCompletions, name, targetCutoffDate);
            if (isSubjectDropout) continue;
            if (hasMakeupWaiver(makeupWaivers, name, escapedItem)) continue;

            let studentMakeupMin = 0;
            if (manualAttendance[name] && manualAttendance[name][`makeup_${escapedItem}`] > 0) {
                studentMakeupMin = parseInt(manualAttendance[name][`makeup_${escapedItem}`]) || 0;
            }

            let projectedMin = 0;
            subDates.forEach(date => {
                const isDropout = isDateOnOrAfterStudentLeave(dropouts, earlyCompletions, name, date);
                if (isDropout) return;

                const isFuture = !dailyAttendance[date];
                if (isFuture) {
                    projectedMin += (dateSchedules[date].am + dateSchedules[date].pm);
                } else {
                    const att = (dailyAttendance[date] && dailyAttendance[date][name]) ? dailyAttendance[date][name] : null;
                    let calc = { am: 0, pm: 0 };
                    if (att && att.inTime && att.outTime) {
                        calc = calculateAlertParticipation(date, att.inTime, att.outTime, item, att.leaveTime || "", att.returnTime || "", rawTimetable, currentMode);
                    }
                    if (manualAttendance[name] && manualAttendance[name][date]) {
                        if (manualAttendance[name][date].am !== undefined) calc.am = manualAttendance[name][date].am;
                        if (manualAttendance[name][date].pm !== undefined) calc.pm = manualAttendance[name][date].pm;
                    }
                    projectedMin += (calc.am + calc.pm);
                }
            });

            const percent = ((projectedMin + studentMakeupMin) / masterTotalMin) * 100;
            if (percent >= 75) continue;
            if (hasMakeupDetailsContent(makeupDetails, name, escapedItem)) continue;

            alerts.push({
                subjectName: displayTitle,
                studentName: name,
                percent: Math.round(percent * 10) / 10
            });
        }
    });

    return alerts.sort((a, b) => a.subjectName.localeCompare(b.subjectName) || a.studentName.localeCompare(b.studentName));
}

function renderMakeupAlertList(listEl, missingMakeups) {
    if (missingMakeups.length === 0) {
        listEl.innerHTML = `<div class="alert-section-empty-line">✅ 미등록 보강수업 없음</div>`;
        return;
    }

    const visibleItems = missingMakeups.slice(0, 4);
    listEl.innerHTML = visibleItems.map(item => `
        <div class="attendance-missing-item" style="border-color:#a9dfbf; background:#f4fbf7;">
            <div class="attendance-missing-date" style="color:#27ae60;">
                <span>${escapeAlertHTML(item.studentName)}</span>
                <span class="attendance-missing-day">${escapeAlertHTML(item.percent)}%</span>
            </div>
            <div class="attendance-missing-subject">${escapeAlertHTML(item.subjectName)}</div>
        </div>
    `).join('') + (missingMakeups.length > 4 ? `<div class="alert-section-empty-line" style="color:#27ae60; background:#f4fbf7; border-color:#a9dfbf;">외 ${missingMakeups.length - 4}건 더 있음</div>` : '');
}

function getValidTrainingDaysForCounselAlert(rawTimetable, subjectList, unitList) {
    const dayCheck = new Set();
    const validTrainingDays = [];
    rawTimetable.forEach(row => {
        if (!isRealTrainingRowForAlert(row, subjectList, unitList)) return;
        const d = fixDate(row.날짜);
        if (d && !dayCheck.has(d)) {
            validTrainingDays.push(d);
            dayCheck.add(d);
        }
    });
    return validTrainingDays.sort();
}

function buildUnitMonthsForCounselAlert(validTrainingDays) {
    const unitMonths = [];
    if (!validTrainingDays.length) return unitMonths;

    const start = new Date(validTrainingDays[0]);
    const end = new Date(validTrainingDays[validTrainingDays.length - 1]);
    let tempStart = new Date(start);
    while (tempStart <= end) {
        const uStart = new Date(tempStart);
        const uEnd = new Date(tempStart);
        uEnd.setMonth(uEnd.getMonth() + 1);
        uEnd.setDate(uEnd.getDate() - 1);
        unitMonths.push({
            label: `${unitMonths.length + 1}회차`,
            start: uStart.toISOString().split('T')[0],
            end: uEnd.toISOString().split('T')[0]
        });
        tempStart.setMonth(tempStart.getMonth() + 1);
    }
    return unitMonths;
}

function getCurrentUnitIndexForCounselAlert(unitMonths, todayKey) {
    if (!unitMonths.length) return -1;
    for (let i = 0; i < unitMonths.length; i++) {
        const u = unitMonths[i];
        if (todayKey >= u.start && todayKey <= u.end) return i;
    }
    if (todayKey < unitMonths[0].start) return 0;
    return unitMonths.length - 1;
}

function getCounselLeaveUnitIndex(unitMonths, leaveDate) {
    if (!leaveDate || !unitMonths.length) return -1;
    for (let i = 0; i < unitMonths.length; i++) {
        const u = unitMonths[i];
        if (leaveDate >= u.start && leaveDate <= u.end) return i;
    }
    if (leaveDate < unitMonths[0].start) return 0;
    return unitMonths.length;
}

function getCounselStudentLeaveDate(dropouts, earlyCompletions, name) {
    if (dropouts && dropouts[name]) return fixDate(dropouts[name]);
    if (earlyCompletions && earlyCompletions[name]) return fixDate(earlyCompletions[name]);
    return null;
}

function isStudentActiveForCounselUnit(name, unitIndex, dropouts, earlyCompletions, unitMonths) {
    const leaveDate = getCounselStudentLeaveDate(dropouts, earlyCompletions, name);
    if (!leaveDate) return true;
    const leaveUnitIdx = getCounselLeaveUnitIndex(unitMonths, leaveDate);
    if (leaveUnitIdx < 0) return true;
    return unitIndex < leaveUnitIdx;
}

function hasCounselingLogForAlert(logs, name) {
    const logData = logs[name];
    if (!logData) return false;
    if (logData.date && typeof logData.date === 'string') return true;
    return Object.keys(logData).length > 0;
}

function buildMissingCounselingAlerts({
    rawTimetable,
    subjectList,
    unitList,
    counselingLogs,
    dropouts,
    earlyCompletions,
    studentNames,
    todayKey
}) {
    const validTrainingDays = getValidTrainingDaysForCounselAlert(rawTimetable, subjectList, unitList);
    const unitMonths = buildUnitMonthsForCounselAlert(validTrainingDays);
    if (!unitMonths.length) {
        return { unitLabel: '', periodText: '', unitEndDate: '', missing: [], count: 0 };
    }

    const unitIndex = getCurrentUnitIndexForCounselAlert(unitMonths, todayKey);
    const unit = unitMonths[unitIndex];
    const logs = (counselingLogs && counselingLogs[unitIndex]) || {};
    const missing = [];

    studentNames.forEach(name => {
        if (!isStudentActiveForCounselUnit(name, unitIndex, dropouts, earlyCompletions, unitMonths)) return;
        if (!hasCounselingLogForAlert(logs, name)) {
            missing.push({ studentName: name });
        }
    });

    missing.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'));

    return {
        unitLabel: unit.label,
        periodText: `${unit.start.slice(5).replace('-', '/')} ~ ${unit.end.slice(5).replace('-', '/')}`,
        unitEndDate: unit.end,
        missing,
        count: missing.length
    };
}

function formatConsultUnitDday(todayKey, unitEndDate) {
    if (!unitEndDate) return '';
    return formatEvalDday(todayKey, unitEndDate);
}

function updateConsultUnitLabel(labelEl, ddayEl, counselAlert, todayKey) {
    if (!counselAlert.unitLabel) {
        if (labelEl) {
            labelEl.textContent = '';
            labelEl.title = '';
        }
        if (ddayEl) {
            ddayEl.textContent = '';
            ddayEl.title = '';
        }
        return;
    }
    if (labelEl) {
        labelEl.textContent = counselAlert.unitLabel;
        labelEl.title = counselAlert.periodText || counselAlert.unitLabel;
    }
    if (ddayEl) {
        const ddayText = formatConsultUnitDday(todayKey, counselAlert.unitEndDate);
        ddayEl.textContent = ddayText;
        ddayEl.title = counselAlert.unitEndDate
            ? `단위개월 종료 ${counselAlert.unitEndDate} · ${ddayText}`
            : '';
    }
}

function renderCounselingAlertList(listEl, counselAlert) {
    if (!counselAlert.missing.length) {
        listEl.innerHTML = `<div class="alert-section-empty-line">✅ 이번 단위 상담일지 모두 등록</div>`;
        return;
    }

    const visibleItems = counselAlert.missing.slice(0, 4);
    listEl.innerHTML = visibleItems.map(item => `
        <div class="alert-section-empty-line consult-alert-item-line">
            <span class="consult-alert-student">${escapeAlertHTML(item.studentName)}</span>
            <span class="consult-alert-badge">미등록</span>
        </div>
    `).join('') + (counselAlert.missing.length > 4 ? `<div class="alert-section-empty-line" style="color:#d35400; background:#fff7ed; border-color:#f5cba7;">외 ${counselAlert.missing.length - 4}명 더 있음</div>` : '');
}

async function loadDailyAttendanceAlerts() {
    const countEl = document.getElementById('attendanceAlertCount');
    const summaryEl = document.getElementById('attendanceAlertSummary');
    const attendanceListEl = document.getElementById('attendanceMissingList');
    const evalListEl = document.getElementById('evalMissingList');
    const makeupListEl = document.getElementById('makeupMissingList');
    const consultListEl = document.getElementById('consultMissingList');
    const attendanceSectionCountEl = document.getElementById('attendanceSectionCount');
    const evalSectionCountEl = document.getElementById('evalSectionCount');
    const makeupSectionCountEl = document.getElementById('makeupSectionCount');
    const consultSectionCountEl = document.getElementById('consultSectionCount');
    const consultUnitLabelEl = document.getElementById('consultUnitLabel');
    const consultDdayLabelEl = document.getElementById('consultDdayLabel');
    const directAuthListEl = document.getElementById('directAuthList');
    const directAuthSectionCountEl = document.getElementById('directAuthSectionCount');
    const directAuthUnitLabelEl = document.getElementById('directAuthUnitLabel');
    const directAuthDdayLabelEl = document.getElementById('directAuthDdayLabel');
    const actionBtn = document.getElementById('btnOpenDailyAttendanceAlert');
    const evalActionBtn = document.getElementById('btnOpenEvalAlert');
    const makeupActionBtn = document.getElementById('btnOpenMakeupAlert');
    const consultActionBtn = document.getElementById('btnOpenConsultAlert');
    const directAuthActionBtn = document.getElementById('btnOpenDirectAuthAlert');
    const todayLogBtn = document.getElementById('btnOpenTodayTrainingLog');
    const todayLogSummaryEl = document.getElementById('todayLogSummary');
    const todayLogBadgeEl = document.getElementById('todayLogDateBadge');
    const evalNextDateLabelEl = document.getElementById('evalNextDateLabel');
    const evalDdayLabelEl = document.getElementById('evalDdayLabel');
    if (!countEl || !summaryEl || !attendanceListEl || !evalListEl || !makeupListEl) return;

    try {
        const [masterSnap, timetableSnap, attendanceSnap, evalPlanSnap, evalCompleteSnap, evalDateSnap, manualSnap, makeupDetailsSnap, makeupWaiverSnap, dropoutSnap, earlySnap, userConfigSnap, counselingSnap] = await Promise.all([
            classDbRef('masterData').once('value'),
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('evalPlans/본평가').once('value'),
            classDbRef('evalCompletions').once('value'),
            classDbRef('evaluationDates').once('value'),
            classDbRef('manualAttendance').once('value'),
            classDbRef('makeupDetails').once('value'),
            classDbRef('makeupWaivers').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('earlyCompletions').once('value'),
            classDbRef('userConfig/defaultView').once('value'),
            classDbRef('counselingLogs').once('value')
        ]);

        const masterData = masterSnap.val() || {};
        const timetableVal = timetableSnap.val() || [];
        const rawTimetable = Array.isArray(timetableVal) ? timetableVal : Object.values(timetableVal);
        const dailyAttendance = attendanceSnap.val() || {};
        const evalPlans = evalPlanSnap.val() || {};
        const evalCompletions = evalCompleteSnap.val() || {};
        const evaluationDates = normalizeEvaluationDates(evalDateSnap.val() || {});
        const manualAttendance = manualSnap.val() || {};
        const makeupDetails = makeupDetailsSnap.val() || {};
        const makeupWaivers = makeupWaiverSnap.val() || {};
        const dropouts = dropoutSnap.val() || {};
        const earlyCompletions = earlySnap.val() || {};
        const counselingLogs = counselingSnap.val() || {};
        const courses = masterData.courses || [];
        const subjectList = [...new Set(courses.map(c => cleanAlertCompareText(c.subject)).filter(Boolean))];
        const unitList = [...new Set(courses.map(c => cleanAlertCompareText(c.unit)).filter(Boolean))];
        const masterSubjectList = [...new Set(courses.map(c => c.subject).filter(Boolean))];
        const ncsList = [...new Set(courses.filter(c => c.unit).map(c => c.unit))];
        const dbViewMode = userConfigSnap.val();
        const viewMode = (dbViewMode === 'subject' || dbViewMode === 'ncs')
            ? dbViewMode
            : (localStorage.getItem(classStorageKey('defaultViewMode')) || 'subject');

        let studentNames = [];
        Object.values(dailyAttendance).forEach(dayData => {
            Object.keys(dayData || {}).forEach(name => {
                if (name !== "_metadata" && !studentNames.includes(name)) studentNames.push(name);
            });
        });
        studentNames.sort();
        if (!studentNames.length) studentNames = ["훈련생"];

        const todayKey = getTodayDateKey();
        const dayMap = {};

        rawTimetable.forEach(row => {
            if (!isRealTrainingRowForAlert(row, subjectList, unitList)) return;

            const dateKey = fixDate(row.날짜);
            if (!shouldIncludeDateForMissingAttendanceAlert(dateKey, todayKey)) return;

            if (!dayMap[dateKey]) {
                dayMap[dateKey] = {
                    date: dateKey,
                    dayNumber: String(row.일수 || "").trim(),
                    weekday: String(row.요일 || "").trim(),
                    subjects: new Set()
                };
            }

            const displayName = String(row.능력단위 || row.교과목 || "").trim();
            if (displayName) dayMap[dateKey].subjects.add(displayName);
        });

        const missingDates = Object.keys(dayMap)
            .filter(dateKey => !dailyAttendance[dateKey])
            .sort()
            .map(dateKey => dayMap[dateKey]);
        const { nearestUpcoming: nearestUpcomingRaw, overdue: overdueEvaluations } = partitionEvalAlerts(
            courses,
            evalPlans,
            evalCompletions,
            evaluationDates,
            todayKey,
            viewMode
        );
        const nearestUpcomingEval = enrichNearestEvalAlertItem(
            nearestUpcomingRaw,
            evalPlans,
            evaluationDates,
            courses,
            rawTimetable,
            todayKey
        );
        const evalHeaderTarget = getEvalPanelHeaderEval(nearestUpcomingEval, overdueEvaluations, todayKey);
        const evalAlertCount = countEvalAlertItems(overdueEvaluations, nearestUpcomingEval);
        const todayLessonSummary = buildTodayLessonSummary(rawTimetable, todayKey, subjectList, unitList);
        const missingMakeups = buildMissingMakeupAlerts({
            rawTimetable,
            masterSubjectList,
            ncsList,
            dailyAttendance,
            manualAttendance,
            makeupDetails,
            makeupWaivers,
            evaluationDates,
            dropouts,
            earlyCompletions,
            studentNames,
            viewMode
        });
        const missingCounseling = buildMissingCounselingAlerts({
            rawTimetable,
            subjectList,
            unitList,
            counselingLogs,
            dropouts,
            earlyCompletions,
            studentNames,
            todayKey
        });
        const directAuthData = (typeof DirectAuthAPI !== 'undefined')
            ? DirectAuthAPI.buildDirectAuthList({
                dailyAttendance,
                rawTimetable,
                subjectList,
                unitList,
                todayKey
            })
            : { unitLabel: '', periodText: '', records: [], count: 0 };
        const totalAlertCount = missingDates.length + evalAlertCount + missingMakeups.length + missingCounseling.count;

        setAlertCountBadge(countEl, totalAlertCount);

        if (actionBtn) {
            actionBtn.setAttribute('data-target-url', classNavHref('일일출석부.html', 'findEmpty=1'));
        }
        if (evalActionBtn) {
            evalActionBtn.setAttribute('data-target-url', classNavHref('../평가지/평가지.html'));
        }
        if (makeupActionBtn) {
            makeupActionBtn.setAttribute('data-target-url', classNavHref('보강수업.html'));
        }
        if (consultActionBtn) {
            consultActionBtn.setAttribute('data-target-url', classNavHref('상담일지.html'));
        }
        if (directAuthActionBtn) {
            directAuthActionBtn.setAttribute('data-target-url', classNavHref('직권신청.html'));
        }
        if (todayLogBtn) {
            todayLogBtn.disabled = !todayLessonSummary.hasClass;
        }
        renderTodayLessonSummary(todayLogSummaryEl, todayLogBadgeEl, todayKey, todayLessonSummary);
        updateEvalNextDateLabel(evalNextDateLabelEl, evalDdayLabelEl, evalHeaderTarget, todayKey, evalPlans);
        updateConsultUnitLabel(consultUnitLabelEl, consultDdayLabelEl, missingCounseling, todayKey);
        if (typeof DirectAuthAPI !== 'undefined') {
            DirectAuthAPI.renderAlertPanel(directAuthListEl, directAuthSectionCountEl, directAuthUnitLabelEl, directAuthData, directAuthDdayLabelEl, todayKey);
        }

        setAlertCountBadge(attendanceSectionCountEl, missingDates.length);
        setAlertCountBadge(evalSectionCountEl, evalAlertCount);
        setAlertCountBadge(makeupSectionCountEl, missingMakeups.length);
        setAlertCountBadge(consultSectionCountEl, missingCounseling.count);

        if (totalAlertCount === 0) {
            summaryEl.style.display = '';
            summaryEl.innerText = "출석부, 평가완료, 보강수업, 상담일지 상태가 모두 정상입니다.";
            renderAttendanceAlertList(attendanceListEl, []);
            renderEvaluationAlertList(evalListEl, [], nearestUpcomingEval, evalPlans, todayKey);
            renderMakeupAlertList(makeupListEl, []);
            if (consultListEl) renderCounselingAlertList(consultListEl, missingCounseling);
            return;
        }

        summaryEl.style.display = '';
        const summaryParts = [];
        if (missingDates.length) summaryParts.push(`출석부 ${missingDates.length}건`);
        if (evalAlertCount) summaryParts.push(`평가완료 ${evalAlertCount}건`);
        if (missingMakeups.length) summaryParts.push(`보강수업 ${missingMakeups.length}건`);
        if (missingCounseling.count) summaryParts.push(`상담일지 ${missingCounseling.count}명`);
        summaryEl.innerText = `${summaryParts.join(', ')} 확인이 필요합니다.`;
        renderAttendanceAlertList(attendanceListEl, missingDates);
        renderEvaluationAlertList(evalListEl, overdueEvaluations, nearestUpcomingEval, evalPlans, todayKey);
        renderMakeupAlertList(makeupListEl, missingMakeups);
        if (consultListEl) renderCounselingAlertList(consultListEl, missingCounseling);
    } catch (error) {
        console.error("일일출석부 알림 확인 오류:", error);
        countEl.innerText = "!";
        countEl.style.display = '';
        countEl.classList.remove('is-zero');
        summaryEl.style.display = '';
        summaryEl.innerText = "알림 상태를 확인하지 못했습니다.";
        attendanceListEl.innerHTML = `<div class="alert-section-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">서버 연결 확인 필요</div>`;
        evalListEl.innerHTML = `<div class="alert-section-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">서버 연결 확인 필요</div>`;
        if (makeupListEl) {
            makeupListEl.innerHTML = `<div class="alert-section-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">서버 연결 확인 필요</div>`;
        }
        if (consultListEl) {
            consultListEl.innerHTML = `<div class="alert-section-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">서버 연결 확인 필요</div>`;
        }
        if (directAuthListEl) {
            directAuthListEl.innerHTML = `<div class="alert-section-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">서버 연결 확인 필요</div>`;
        }
    }
}

async function confirmTimetableSave() {
    if(!tempJsonData) return;
    
    try {
        const period = document.getElementById('trainingPeriod')?.value || '';
        const newStart = parseCohortStartDate(period, tempJsonData);
        if (!(await assertCohortChangeAllowed(newStart))) return;

        // 1. 시간표 원본 데이터 저장
        await classDbRef('timetableStorage').set({ fileName: tempFileName, data: tempJsonData });
        await classDbRef('fullTimetable').set(tempJsonData);
        
        // 💡 [2단계 핵심] 현재 화면의 '교과목 상세 현황'을 서버로 자동 전송 (통합 저장)
        const success = await saveAllData(); 
        
        if(success !== false) { // saveAllData가 비정상 종료되지 않았다면
            await handleStudentAccessAfterTimetableSave(tempJsonData);
            await appAlert("✅ 시간표와 교과목 상세 현황이 서버에 통합 저장되었습니다!\n이제 '평가계획서'에서 나머지 작업을 진행하실 수 있습니다.");
            checkTimetableStatus();
            updateTrainingProgressPanel({
                timetable: tempJsonData,
                totalDaysText: document.getElementById('totalDays')?.value || '',
                periodText: document.getElementById('trainingPeriod')?.value || ''
            });
        }
    } catch (error) {
        console.error("통합 저장 중 오류:", error);
        await appAlert("❌ 저장 중 오류가 발생했습니다. 네트워크 상태를 확인해주세요.");
    }
}

function renderTable(list) {
    const tbody = document.getElementById('courseTableBody'); 
    tbody.innerHTML = '';
    
    const typeOrder = { "": 0, "소양교과": 1, "NCS교과": 2, "비NCS교과": 3 };
    let renderedSections = new Set();

    const sortedList = [...list].sort((a, b) => {
        const orderA = typeOrder[a.type || ""] ?? 99;
        const orderB = typeOrder[b.type || ""] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        if (a.subject !== b.subject) return (a.subject || "").localeCompare(b.subject || "", 'ko');
        return formatUnitDisplayName(a.unit).localeCompare(formatUnitDisplayName(b.unit), 'ko');
    });

    let gH = 0; const grp = {};
    sortedList.forEach(item => {
        if(!grp[item.subject]) grp[item.subject] = { units: [], total: 0, type: item.type || "" };
        grp[item.subject].units.push(item);
        item.details.forEach(d => { 
            grp[item.subject].total += Number(d.hour); 
            gH += Number(d.hour); 
        });
    });

    const subs = [...new Set(sortedList.map(item => item.subject))];

    const sumTr = document.createElement('tr'); 
    sumTr.className = 'summary-row';
    sumTr.innerHTML = `
    <td style="text-align:center;">📊 교과목: ${subs.length}종</td>
    <td style="text-align:center;">능력단위: ${list.length}개</td>
    <td style="text-align:center;">RD코드</td>
    <td style="text-align:center;">- 전체 교육과정 현황 요약 -</td>
        <td style="text-align:center;">총 ${gH}h</td>
        <td style="text-align:center;">총 ${gH}h</td>
    `;
    tbody.appendChild(sumTr);

    subs.forEach(s => {
        const us = grp[s].units.sort((a, b) =>
            formatUnitDisplayName(a.unit).localeCompare(formatUnitDisplayName(b.unit), 'ko')
        );
        us.forEach((u, i) => {
            const tr = document.createElement('tr'); 
            if(i === 0) tr.className = 'top-border-thick';

            const rowGroupId = s.replace(/\s+/g, '_');
            tr.setAttribute('data-group', rowGroupId);
            const currentType = grp[s].type || "";
            const showUnitType = currentType === 'NCS교과';
            
            tr.innerHTML = `
                ${i === 0 ? `
                <td rowspan="${us.length}" class="subject-cell">
                    <div style="font-weight:bold; color:#2c3e50; font-size:14px;">${s}</div>
                    <div style="font-size:11px; color:#3498db; margin-top:4px;">[${currentType || "미설정"}]</div>
                    <div style="font-size: 11px; color: #7f8c8d; margin-top: 5px;">(총 ${grp[s].total}h)</div>
                    <input type="hidden" class="c-subject-input" value="${s}">
                    <input type="hidden" class="c-subject-type" value="${currentType}">
                </td>` : ''}
                <td>
                    <div style="font-weight:600; color:#333;">${formatUnitDisplayName(u.unit)}</div>
                    ${u.evalMethod ? `<div style="font-size:10px; color:${u.evalMethod.includes('체크리스트') ? '#8e44ad' : (u.evalMethod.includes('기타') ? '#3498db' : (u.evalMethod === '-' ? '#7f8c8d' : '#e67e22'))}; margin-top:3px; font-weight:bold;">${u.evalMethod}</div>` : ''} 
                    <div style="font-size: 11px; color: #27ae60; margin-top: 5px;">(${u.totalHours}h)</div>
                    <input type="hidden" class="c-unit-input" value="${u.unit}">
                                        <input type="hidden" class="c-eval-dates-input" value='${JSON.stringify(u.evalDates || [])}'>
                </td>
                <td style="text-align:center; vertical-align:middle; width:12%;">
                    <div style="font-size:12px; font-weight:bold; color:#2980b9;">${u.rdCode || "-"}</div>
                    <div class="unit-type-container" style="display:${showUnitType ? 'flex' : 'none'};">
                        <button type="button" class="type-toggle-btn dynamic-unit-type ${u.unitType === '필수능력단위' ? 'active-req' : ''}" data-typeval="필수능력단위">필수</button>
                        <button type="button" class="type-toggle-btn dynamic-unit-type ${u.unitType === '선택능력단위' ? 'active-opt' : ''}" data-typeval="선택능력단위">선택</button>
                        <input type="hidden" class="c-unit-type-val" value="${u.unitType || ''}">
                    </div>
                    <input type="hidden" class="c-rdcode-input" value="${u.rdCode || ""}">
                </td>
                <td style="width:30%;">
                    <div class="sub-item-container">
                        ${u.details.map(d => `<div class="sub-item-row text-left">${d.name} <input type="hidden" class="sub-detail-input" value="${d.name}"></div>`).join('')}
                    </div>
                </td>
                <td>
                    <div class="sub-item-container">
                        ${u.details.map(d => `<div class="sub-item-row">${d.hour}h <input type="hidden" class="sub-hour-input" value="${d.hour}"></div>`).join('')}
                    </div>
                </td>
                ${i === 0 ? `<td rowspan="${us.length}" class="subject-total-cell" style="font-size:15px; font-weight:800;">${grp[s].total}h</td>` : ''}
            `;
            tbody.appendChild(tr);
        });
    });
}

async function saveAllDataWithAlert() { await saveAllData(); await appAlert("✅ 서버 저장 완료!"); }
async function saveAllData() {
    try {
        const snap = await classDbRef('masterData').once('value');
        const existingMaster = snap.val() || {};
        const existingCourses = existingMaster.courses || [];

        const rows = document.querySelectorAll('#courseTableBody tr:not(.summary-row)');
        const list = [];
        const ncsCodePattern = /[0-9]{2,}/; 
        let lastSubjectName = "";
        let lastSubjectType = "";

        rows.forEach(r => {
            const u = r.querySelector('.c-unit-input'); 
            if(u) {
                const sInput = r.querySelector('.c-subject-input');
                if (sInput) lastSubjectName = sInput.value;
                let s = lastSubjectName;
                if (!s) {
                    let p = r.previousElementSibling;
                    while (p) {
                        if (p.querySelector('.c-subject-input')) {
                            s = p.querySelector('.c-subject-input').value;
                            lastSubjectName = s;
                            break;
                        }
                        p = p.previousElementSibling;
                    }
                }

                const ds = []; 
                r.querySelectorAll('.sub-detail-input').forEach((inpt, idx) => { 
                    ds.push({ name: inpt.value, hour: r.querySelectorAll('.sub-hour-input')[idx].value }); 
                });

                const typeInput = r.querySelector('.c-subject-type');
                if (typeInput) lastSubjectType = typeInput.value;
                const oldData = existingCourses.find(c => c.unit === u.value) || {};

                let type = lastSubjectType || oldData.type || "";
                if (!type && ncsCodePattern.test(u.value)) type = "NCS교과";

                const unitTypeVal = r.querySelector('.c-unit-type-val');
                let unitType = unitTypeVal ? unitTypeVal.value : (oldData.unitType || "");
                if (type !== 'NCS교과') unitType = oldData.unitType || "";
                let rdCodeInput = r.querySelector('.c-rdcode-input');
                let rdCode = rdCodeInput ? rdCodeInput.value : (oldData.rdCode || "");

                // 📍 숨겨둔 평가일정(evalDates) 파싱
                let evalDatesInput = r.querySelector('.c-eval-dates-input');
                let evalDates = evalDatesInput ? JSON.parse(evalDatesInput.value) : (oldData.evalDates || []);

                list.push({ 
                    subject: s, 
                    type: type, 
                    unit: u.value, 
                    unitType: unitType, 
                    details: ds,
                    evalMethod: oldData.evalMethod || "",
                    rdCode: rdCode,
                    evalDates: evalDates // 📍 DB에 평가일정 병합 확정
                });
            }
        });

        const periodVal = document.getElementById('trainingPeriod').value || existingMaster.period || "";
        const cohortStart = parseCohortStartDate(periodVal, tempJsonData) || getCohortStartDateFromMaster(existingMaster) || "";
        const sameCohort = await isSameCohortTraining(cohortStart, existingMaster);
        if (sameCohort) {
            const existingUnits = new Set(list.map(c => c.unit));
            existingCourses.forEach(old => {
                if (old?.unit && !existingUnits.has(old.unit)) list.push(old);
            });
        }

        return classDbRef('masterData').set({ 
            name: document.getElementById('trainingName').value || existingMaster.name || "", 
            period: periodVal, 
            days: document.getElementById('totalDays').value || existingMaster.days || "", 
            teacher: document.getElementById('teacherName').value || existingMaster.teacher || "", 
            cohortStartDate: cohortStart,
            cohortId: existingMaster.cohortId || window.currentCohort || "",
            label: existingMaster.label || window.currentCohortLabel || "",
            courses: list 
        });
    } catch (error) {
        console.error("저장 중 오류 발생:", error);
    }
}

function loadData() {
    classDbRef('masterData').once('value', snap => {
        const d = snap.val() || {};
        document.getElementById('trainingName').value = d.name || "";
        document.getElementById('trainingPeriod').value = d.period || "";
        document.getElementById('totalDays').value = d.days || "";
        document.getElementById('teacherName').value = d.teacher || "";
        if(d.courses) renderCourseTableFromDB(d.courses);
        updateTrainingProgressPanel({
            totalDaysText: d.days || '',
            periodText: d.period || ''
        });
    });
}
function renderCourseTableFromDB(courses) {
    const list = courses.map(c => {
        let total = 0; c.details.forEach(d => total += Number(d.hour));
        return { 
            subject: c.subject, 
            type: c.type || "", 
            unit: c.unit, 
            unitType: c.unitType || "", 
            evalMethod: c.evalMethod || "", 
            details: c.details, 
            totalHours: total,
            rdCode: c.rdCode || "",
            evalDates: c.evalDates || [] // 📍 서버에 보존된 평가일정을 화면으로 복원
        };
    });
    renderTable(list);
}
async function deleteTimetable() { 
    if(await appConfirm("전체 삭제하시겠습니까?")) { 
        await classDbRef('timetableStorage').remove(); 
        await classDbRef('fullTimetable').remove(); 
        await classDbRef('masterData').remove(); 
        await classDbRef('rdStorage').remove(); // 추가됨
        location.reload(); 
    } 
}

async function downloadSavedTimetable() {
    classDbRef('timetableStorage').once('value', async snap => {
        const info = snap.val();
        if(info && info.data) {
            try {
                const exportHeaders = ["일수", "일별", "요일", "교시", "훈련시간", "교과목명", "능력단위명", "이론/실기/세부", "훈련교사", "훈련시설명"];
                const finalExportData = [];
                
                // 날짜별 그룹화
                const groupedByDate = {};
                info.data.forEach(row => {
                    let d = row["날짜"];
                    if(!groupedByDate[d]) groupedByDate[d] = [];
                    groupedByDate[d].push(row);
                });

                let merges = []; 
                let currentRowIndex = 1; 

                Object.keys(groupedByDate).sort().forEach(date => {
                    // 📍 껍데기 행(교시 없음) 차단 필터
                    let dailyRows = groupedByDate[date].filter(r => parseInt(r["교시"]) > 0);
                    dailyRows.sort((a, b) => parseInt(a["교시"]) - parseInt(b["교시"]));
                    
                    if (dailyRows.length === 0) return;

                    // 📍 휴일 감지 센서
                    let isHoliday = false;
                    let holidayName = "";
                    let hasUnit = dailyRows.some(r => (r["능력단위"] || "").trim() !== "");
                    if (!hasUnit) {
                        let subjectRow = dailyRows.find(r => (r["교과목"] || "").trim() !== "");
                        if (subjectRow) {
                            isHoliday = true;
                            holidayName = subjectRow["교과목"];
                        }
                    }

                    // 📍 4, 5교시 사이 점심교시 삽입
                    let displayRows = [];
                    let lunchInserted = false;
                    dailyRows.forEach(row => {
                        if (!lunchInserted && parseInt(row["교시"]) >= 5) {
                            displayRows.push({ isLunch: true, "일수": row["일수"], "날짜": row["날짜"], "요일": row["요일"] });
                            lunchInserted = true;
                        }
                        displayRows.push(row);
                    });

                    if (!lunchInserted) {
                        displayRows.push({ isLunch: true, "일수": dailyRows[0]["일수"], "날짜": date, "요일": dailyRows[0]["요일"] });
                    }

                    let startMergeRow = currentRowIndex;

                    displayRows.forEach((row) => {
                        let pStr = row.isLunch ? "점심" : row["교시"];
                        let tStr = row.isLunch ? "" : (row["시간"] || "");
                        
                        let unitStr = row["능력단위"] || "";
                        if (row["isEval"]) unitStr += "(평가시험)";

                        finalExportData.push({
                            "일수": row["일수"] || "",
                            "일별": row["날짜"] || "",
                            "요일": row["요일"] || "",
                            "교시": pStr,
                            "훈련시간": tStr,
                            "교과목명": isHoliday ? holidayName : (row.isLunch ? "" : (row["교과목"] || "")),
                            "능력단위명": isHoliday ? "" : (row.isLunch ? "" : unitStr),
                            "이론/실기/세부": isHoliday ? "" : (row.isLunch ? "" : (row["세부교과"] || "")),
                            "훈련교사": isHoliday ? "" : (row.isLunch ? "" : (row["교사"] || "")),
                            "훈련시설명": isHoliday ? "" : (row.isLunch ? "" : (row["장소"] || ""))
                        });
                        currentRowIndex++;
                    });

                    if (isHoliday) {
                        merges.push({ s: { r: startMergeRow, c: 5 }, e: { r: currentRowIndex - 1, c: 9 } });
                    }
                });

                const ws = XLSX.utils.json_to_sheet(finalExportData, { header: exportHeaders });
                ws['!merges'] = merges;
                ws['!cols'] = [ {wch: 6}, {wch: 12}, {wch: 6}, {wch: 6}, {wch: 12}, {wch: 25}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 15} ];
                
                // 📍 라이브러리 충돌을 방지하는 공식 틀 고정 문법 복원
                ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }];

                // 📍 에러의 주범이었던 테두리 색상 코드 규격화 (안전성)
                const defaultBorder = { style: "thin", color: { rgb: "000000" } }; 
                const borderStyle = { top: defaultBorder, bottom: defaultBorder, left: defaultBorder, right: defaultBorder };

                const range = XLSX.utils.decode_range(ws['!ref']);
                for (let R = range.s.r; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }; 
                        
                        let cell = ws[cellAddress];
                        let cellStyle = {
                            font: { name: '맑은 고딕', sz: 10 },
                            // 📍 wrapText(줄바꿈) 해제, shrinkToFit(셀에 맞춤) 엔진 가동
                            alignment: { vertical: "center", horizontal: "center", wrapText: false, shrinkToFit: true }, 
                            border: borderStyle
                        };

                        if (R === 0) {
                            cellStyle.fill = { fgColor: { rgb: "F2F2F2" } };
                            cellStyle.font.bold = true;
                        } else {
                            let isHolidayCell = merges.some(m => R >= m.s.r && R <= m.e.r && C >= m.s.c && C <= m.e.c);
                            if (isHolidayCell) {
                                cellStyle.font = { name: '맑은 고딕', sz: 24, bold: true, color: { rgb: "FF0000" } };
                            } 
                            else if (C === 6 && cell.v && String(cell.v).includes("(평가시험)")) {
                                cellStyle.fill = { fgColor: { rgb: "FFFF00" } };
                                cellStyle.font = { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: "FF0000" } };
                            }
                        }
                        cell.s = cellStyle;
                    }
                }

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "시간표");
                
                // 📍 경고창 없이 정상적으로 열리는 순정 .xlsx 확장자로 출력 (확장자 중복 꼬임 방지 엔진 탑재)
                let outName = info.fileName || `시간표_${currentClass}.xlsx`;
                outName = outName.replace(/\.xls$/, '.xlsx'); 
                XLSX.writeFile(wb, outName);
            
            } catch (error) {
                console.error("엑셀 다운로드 엔진 에러:", error);
                await appAlert("다운로드 중 에러가 발생했습니다. 브라우저 콘솔창(F12)을 확인해주세요.");
            }
        } else { await appAlert("서버에 저장된 시간표가 없습니다."); }
    });
}


// [기능 추가] 교과목 상세 현황 전용 엑셀 다운로드 기능
async function downloadCourseTableExcel() {
    // 📍 스타일을 지원하는 라이브러리가 필요하므로, 없으면 즉석에서 불러옵니다.
    if (typeof XLSX.utils.aoa_to_sheet !== 'function') {
        await appAlert("라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    classDbRef('masterData').once('value', async snap => {
        const d = snap.val();
        if(!d || !d.courses) return await appAlert("다운로드할 데이터가 없습니다.");

        const courses = d.courses;
        const hasEmptyType = courses.some(c => !c.type || c.type.trim() === "");
        if (hasEmptyType) { await appAlert("교과목의 교과를 선택 후 저장해 주세요."); return; }

        const hasEmptyUnitType = courses.some(c => !c.unitType || c.unitType.trim() === "");
        if (hasEmptyUnitType) { if (!await appConfirm("필수/선택 교과 없이 다운 하시겠습니까?")) return; }

        const wb = XLSX.utils.book_new();
        const exportData = [];
        const merges = [];

        const sections = { "소양교과": [], "NCS교과": [], "비NCS교과": [] };
        courses.forEach(c => { if (sections[c.type]) sections[c.type].push(c); });

        // 📍 공통 스타일 설정 (10pt, 가운데 정렬, 셀에 맞춤)
        const commonStyle = {
            font: { sz: 10, name: '맑은 고딕' },
            alignment: { vertical: "center", horizontal: "center", shrinkToFit: true, wrapText: true }
        };

        Object.keys(sections).forEach(typeName => {
            const sectionCourses = sections[typeName];
            if (sectionCourses.length === 0) return;

            let sectionTotal = 0;
            sectionCourses.forEach(c => { c.details.forEach(det => sectionTotal += Number(det.hour)); });

            let sRow = exportData.length;
            exportData.push([`${typeName} (${sectionTotal}시간)`, "", "", "", "", "", "", "", ""]);
            merges.push({ s: { r: sRow, c: 0 }, e: { r: sRow, c: 8 } });

            const subjectGroups = {};
            sectionCourses.forEach(c => {
                if (!subjectGroups[c.subject]) subjectGroups[c.subject] = { units: [], totalH: 0 };
                subjectGroups[c.subject].units.push(c);
                c.details.forEach(det => subjectGroups[c.subject].totalH += Number(det.hour));
            });

            if (typeName === "소양교과") {
                exportData.push(["교과목", "능력단위", "교수학습방법", "상세교수학습방법", "담당교사", "", "", "", ""]);
                Object.keys(subjectGroups).forEach(subName => {
                    const group = subjectGroups[subName];
                    const subStartRow = exportData.length;
                    group.units.forEach((u, uIdx) => {
                        let unitTotal = 0; u.details.forEach(det => unitTotal += Number(det.hour));
                        exportData.push([uIdx === 0 ? subName : "", `${u.unit} (${unitTotal}시간)`, "", "", d.teacher || "", "", "", "", ""]);
                    });
                    if (group.units.length > 1) merges.push({ s: { r: subStartRow, c: 0 }, e: { r: exportData.length - 1, c: 0 } });
                });
            } 
            else if (typeName === "NCS교과") {
                exportData.push(["교과목", "교과구분", "코드", "능력단위", "능력단위요소", "시간", "교수", "상세교수", "담당"]);
                exportData.push(["(시간)", "(필/선/자)", "", "(시간)", "요소명", "시간", "학습방법", "학습방법", "교사"]);
                
                Object.keys(subjectGroups).forEach(subName => {
                    const group = subjectGroups[subName];
                    const subStartRow = exportData.length;
                    group.units.forEach((u, uIdx) => {
                        const unitStartRow = exportData.length;
                        const uTypeDisplay = (u.unitType && u.unitType.trim() !== "") ? u.unitType : "미기입";
                        let unitTotal = 0; u.details.forEach(det => unitTotal += Number(det.hour));
                        let unitCode = "", unitNameOnly = u.unit;
                        const codeMatch = u.unit.match(/\[(.*?)\]/);
                        if (codeMatch) { unitCode = codeMatch[0]; unitNameOnly = u.unit.replace(codeMatch[0], "").trim(); }

                        u.details.forEach((det, dIdx) => {
                            exportData.push([
                                (uIdx === 0 && dIdx === 0) ? `${subName} (${group.totalH}시간)` : "",
                                dIdx === 0 ? uTypeDisplay : "",
                                dIdx === 0 ? unitCode : "",
                                dIdx === 0 ? `${unitNameOnly} (${unitTotal}시간)` : "",
                                det.name, det.hour, "", "", d.teacher || ""
                            ]);
                        });
                        if (u.details.length > 1) {
                            for(let col=1; col<=3; col++) merges.push({ s: { r: unitStartRow, c: col }, e: { r: exportData.length - 1, c: col } });
                        }
                    });
                    const totalRows = group.units.reduce((acc, curr) => acc + curr.details.length, 0);
                    if (totalRows > 1) merges.push({ s: { r: subStartRow, c: 0 }, e: { r: subStartRow + totalRows - 1, c: 0 } });
                });
            }
            else if (typeName === "비NCS교과") {
                exportData.push(["교과목", "교과구분", "단원", "교수", "상세교수", "담당", "", "", ""]);
                Object.keys(subjectGroups).forEach(subName => {
                    const group = subjectGroups[subName];
                    const subStartRow = exportData.length;
                    group.units.forEach((u, uIdx) => {
                        const uTypeDisplay = (u.unitType && u.unitType.trim() !== "") ? u.unitType : "미기입";
                        u.details.forEach((det, dIdx) => {
                            exportData.push([(uIdx === 0 && dIdx === 0) ? `${subName} (${group.totalH}시간)` : "", dIdx === 0 ? uTypeDisplay : "", det.name, "", "", d.teacher || "", "", "", ""]);
                        });
                    });
                    const totalRows = group.units.reduce((acc, curr) => acc + curr.details.length, 0);
                    if (totalRows > 1) merges.push({ s: { r: subStartRow, c: 0 }, e: { r: subStartRow + totalRows - 1, c: 0 } });
                });
            }
            exportData.push([]); 
        });

        const ws = XLSX.utils.aoa_to_sheet(exportData);
        ws['!merges'] = merges;

        // 📍 모든 셀에 스타일 강제 주입 루프
        for (let i in ws) {
            if (i[0] === '!') continue;
            ws[i].s = commonStyle;
        }

        ws['!cols'] = [{wch: 35}, {wch: 15}, {wch: 20}, {wch: 35}, {wch: 45}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}];
        XLSX.utils.book_append_sheet(wb, ws, "교과목편성내용");
        
        // 📍 스타일 유지를 위해 writeFile 대신 직접 처리하는 방식 권장 (라이브러리 특성)
        XLSX.writeFile(wb, `교과목편성내용_${currentClass}.xlsx`);
    });
}

async function clearAndDefault() { if(await appConfirm("초기화하시겠습니까?")) renderTable([]); }
function addCourseRow() {
    const tbody = document.getElementById('courseTableBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="subject-cell"><input class="editable-input c-subject-input" placeholder="교과목"></td><td><input class="editable-input c-unit-input" placeholder="능력단위"><input type="hidden" class="c-eval-dates-input" value="[]"></td><td><input class="editable-input c-rdcode-input" placeholder="RD코드"></td><td><div class="sub-item-container"><div class="sub-item-row"><input class="editable-input sub-detail-input text-left" placeholder="세부내용"></div></div></td><td><div class="sub-item-container"><div class="sub-item-row"><input class="editable-input sub-hour-input" placeholder="0"></div></div></td><td class="subject-total-cell"><input class="editable-input c-subtotal-input" value="0"></td><td><button class="btn btn-red" onclick="this.parentElement.parentElement.remove()">삭제</button></td>`;
    tbody.appendChild(tr);
}

async function saveOverviewOnly() {
    try {
        const tName = document.getElementById('trainingName').value;
        const tPeriod = document.getElementById('trainingPeriod').value;
        const tDays = document.getElementById('totalDays').value;
        const tTeacher = document.getElementById('teacherName').value;

        if(!tName) return await appAlert("훈련명을 입력해주세요.");

        const snap = await classDbRef('masterData').once('value');
        const existingData = snap.val() || {};
        const cohortStart = parseCohortStartDate(tPeriod, null) || getCohortStartDateFromMaster(existingData) || "";
        const unitTypeMap = collectUnitTypesFromCourseTable();
        const mergedCourses = mergeCourseUnitTypes(existingData.courses, unitTypeMap);

        const updatePayload = {
            name: tName,
            period: tPeriod,
            days: tDays,
            teacher: tTeacher,
            ...(cohortStart ? { cohortStartDate: cohortStart } : {})
        };
        if (mergedCourses.length) updatePayload.courses = mergedCourses;

        await classDbRef('masterData').update(updatePayload);

        await appAlert("✅ 훈련 과정 개요와 NCS 필수/선택 설정이 저장되었습니다.");
    } catch (error) {
        console.error("개요 저장 오류:", error);
        await appAlert("❌ 저장 중 오류가 발생했습니다.");
    }
}

// [보안 추가] 내부평가지 진입 하이패스 (불필요한 모달 로직 폐기)
function checkEvalPassword() {
    console.log("🔓 내부평가지 보안 해제: 즉시 입장합니다.");
    location.href = classNavHref('../평가지/평가지.html');
}

// 📍 훈련생 배포용 링크(기수별 접근 키) — 기존 Firebase 경로와 분리된 studentAccess 전용
function createStudentAccessKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 20; i++) key += chars[Math.floor(Math.random() * chars.length)];
    return key;
}

function buildStudentViewerUrl(accessKey) {
    const url = new URL('능력단위학생용.html', window.location.href);
    url.searchParams.set('class', window.currentClass || currentClass);
    if (window.currentCohort) url.searchParams.set('cohort', window.currentCohort);
    if (accessKey) url.searchParams.set('key', accessKey);
    return url.toString();
}

async function getStudentAccessConfig() {
    const snap = await classDbRef('studentAccess').once('value');
    return snap.val() || null;
}

async function saveStudentAccessConfig(data) {
    await classDbRef('studentAccess').set(data);
}

async function resolveCohortContext() {
    let period = document.getElementById('trainingPeriod')?.value || '';
    let timetableRows = tempJsonData;
    const master = await fetchMasterDataSnapshot();

    if (!period) period = master.period || '';
    if (!timetableRows?.length) {
        const timetableSnap = await classDbRef('fullTimetable').once('value');
        const val = timetableSnap.val() || [];
        timetableRows = Array.isArray(val) ? val : Object.values(val);
    }

    return {
        period,
        startDate: getCohortStartDateFromMaster(master) || parseCohortStartDate(period, timetableRows)
    };
}

async function ensureStudentAccessConfig(options = {}) {
    const { forceNew = false, cohortStartDate = null, rdSignature = null, periodLabel = null } = options;
    const existing = await getStudentAccessConfig();
    const ctx = await resolveCohortContext();
    const period = periodLabel || ctx.period || existing?.periodLabel || '';
    const startDate = cohortStartDate || ctx.startDate || existing?.cohortStartDate || null;

    if (!forceNew && existing?.currentKey) {
        const updates = { ...existing };
        if (startDate && !updates.cohortStartDate) updates.cohortStartDate = startDate;
        if (period) updates.periodLabel = period;
        if (rdSignature) updates.rdSignature = rdSignature;
        await saveStudentAccessConfig(updates);
        return updates;
    }

    const config = {
        currentKey: createStudentAccessKey(),
        cohortStartDate: startDate || existing?.cohortStartDate || '',
        rdSignature: rdSignature || existing?.rdSignature || '',
        periodLabel: period,
        issuedAt: new Date().toISOString()
    };
    await saveStudentAccessConfig(config);
    return config;
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

async function copyStudentViewerLink(forceReissue = false) {
    try {
        let config = await getStudentAccessConfig();
        if (forceReissue) {
            if (!await appConfirm('새 링크를 발급하면 기존 훈련생 링크는 사용할 수 없습니다. 계속하시겠습니까?')) return;
            config = await ensureStudentAccessConfig({ forceNew: true });
            await copyTextToClipboard(buildStudentViewerUrl(config.currentKey));
            await appAlert('✅ 새 링크가 발급·복사되었습니다.\n훈련생에게 다시 배포해 주세요.');
        } else if (!config?.currentKey) {
            config = await ensureStudentAccessConfig({});
            await copyTextToClipboard(buildStudentViewerUrl(config.currentKey));
            await appAlert('✅ 훈련생 배포용 링크가 발급·복사되었습니다.\n훈련생에게 배포해 주세요.');
        } else {
            await copyTextToClipboard(buildStudentViewerUrl(config.currentKey));
            await appAlert('✅ 훈련생 배포 링크가 복사되었습니다.');
        }
        updateStudentLinkStatus();
    } catch (error) {
        console.error('학생용 링크 복사 실패:', error);
        await appAlert('❌ 링크 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
    }
}

async function openStudentViewerPreview() {
    let config = await getStudentAccessConfig();
    if (!config?.currentKey) {
        if (!await appConfirm('배포 링크가 아직 없습니다. 지금 발급하고 미리보기를 여시겠습니까?')) return;
        config = await ensureStudentAccessConfig({});
        updateStudentLinkStatus();
    }
    window.open(buildStudentViewerUrl(config.currentKey), '_blank');
}

function updateStudentLinkStatus() {
    const el = document.getElementById('studentLinkStatus');
    if (!el) return;
    getStudentAccessConfig().then(config => {
        if (!config?.currentKey) {
            el.textContent = '배포 링크 미발급';
            el.style.color = '#e67e22';
            return;
        }
        const start = config.cohortStartDate || '시작일 미등록';
        el.textContent = `링크 발급됨 (시작 ${start})`;
        el.style.color = '#27ae60';
    }).catch(() => {
        el.textContent = '';
    });
}

async function handleStudentAccessAfterTimetableSave(timetableRows) {
    const config = await getStudentAccessConfig();
    if (!config?.currentKey) return;

    const master = await fetchMasterDataSnapshot();
    const period = document.getElementById('trainingPeriod')?.value || master.period || config.periodLabel || '';
    const newStart = getCohortStartDateFromMaster(master) || parseCohortStartDate(period, timetableRows);
    if (!newStart) {
        if (period) await saveStudentAccessConfig({ ...config, periodLabel: period });
        return;
    }
    if (!config.cohortStartDate) {
        await saveStudentAccessConfig({ ...config, cohortStartDate: newStart, periodLabel: period || config.periodLabel || '' });
        return;
    }
    if (newStart !== config.cohortStartDate) {
        await ensureStudentAccessConfig({ forceNew: true, cohortStartDate: newStart, periodLabel: period });
        await appAlert(`⚠️ 훈련 시작일이 변경되어 (${config.cohortStartDate} → ${newStart}) 학생용 링크가 새로 발급되었습니다.\n「훈련생 배포 링크 복사」로 새 링크를 배포해 주세요.`);
        updateStudentLinkStatus();
        return;
    }

    await saveStudentAccessConfig({ ...config, periodLabel: period });
}

async function handleStudentAccessAfterRDUpload(fileName) {
    const config = await getStudentAccessConfig();
    if (!config?.currentKey) return;

    if (config.rdSignature && fileName && config.rdSignature !== fileName) {
        const ok = await appConfirm(
            `RD 파일이 변경되었습니다.\n\n이전: ${config.rdSignature}\n새 파일: ${fileName}\n\n새 기수일 수 있습니다. 학생용 링크를 새로 발급하시겠습니까?\n(취소하면 기존 링크는 유지됩니다)`
        );
        if (ok) {
            await ensureStudentAccessConfig({ forceNew: true, rdSignature: fileName });
            await appAlert('새 학생용 링크가 발급되었습니다.\n「훈련생 배포 링크 복사」로 배포해 주세요.');
        } else {
            await saveStudentAccessConfig({ ...config, rdSignature: fileName });
        }
    } else {
        await saveStudentAccessConfig({ ...config, rdSignature: fileName || config.rdSignature || '' });
    }
    updateStudentLinkStatus();
}

initializePage();




// 📍 [정밀 수리] 시간표 순정 보존 + RD 엑셀 H열/AH열/AF열 릴레이 타겟팅 병합(Merge) 엔진
async function processRDExcelMerge(input) {
    const file = input.files[0]; 
    if(!file) return;

    if(!await appConfirm("RD 엑셀을 정밀 분석하여 '교과구분' 및 '평가방법'을 시간표에 자동 세팅하시겠습니까?\n(NCS 필수/선택은 공용 훈련기준의 필수과목 목록과 코드 매칭으로 적용됩니다.)")) {
        input.value = ""; return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1, defval: ""});

           // 📍 선생님이 확인해주신 정확한 열 좌표 (A열=0 기준)
            const B = 1, C = 2, H = 7, L = 11, AF = 31, AH = 33, AP = 41;
            
            let currentSection = null; let currentSubject = "";
            let currentEvalSubject = ""; // 📍 H열 병합 셀 대응 메모리
            let ncsMap = {};  // 📍 NCS 속성 및 코드 전용 창고
            let evalMap = {}; // 📍 평가방법 전용 창고

            // 1. RD 엑셀 정밀 스캔 가동
            for (let i = 0; i < rows.length; i++) {
                let row = rows[i] || [];
                let valB = String(row[B] || "").trim();
                let valC = String(row[C] || "").trim();
                let valH = String(row[H] || "").trim();
                let valL = String(row[L] || "").trim();

                if (valB.includes("■ 훈련시설")) break; // 킬 스위치 가동

                // 구역 전환 센서
                if (valC === "NCS 소양교과" || valC.includes("소양")) { currentSection = "소양교과"; currentSubject = ""; continue; }
                if (valC === "NCS 전공교과" || valC.includes("전공")) { currentSection = "NCS교과"; currentSubject = ""; continue; }
                if (valC === "비 NCS 교과 (이론)" || valC.includes("비NCS") || valC.includes("비 NCS")) { currentSection = "비NCS교과"; currentSubject = ""; continue; }
                if (valB.includes("교수학습방법과 평가방법") || valB.includes("평가방법")) { currentSection = "평가방법"; currentSubject = ""; currentEvalSubject = ""; continue; }

                if (valB === "교과목" || valB === "교과구분" || valB === "구분" || valB.includes("능력단위")) continue;
                if (valB !== "") currentSubject = valB; 
                if (!currentSection) continue;

                // [1-1] 교과구분 데이터 맵핑 (ncsMap으로 분리 저장)
                if (currentSection !== "평가방법") {
                    let unitName = (currentSection === "소양교과" || currentSection === "비NCS교과") ? currentSubject : valL;
                    if (!unitName && (currentSection === "소양교과" || currentSection === "비NCS교과")) unitName = valB;

                    if(unitName) {
                        let codeMatch = unitName.match(/\[(.*?)\]/) || unitName.match(/[a-zA-Z0-9_]{5,}/);
                        let extractedCode = codeMatch ? (codeMatch[0].includes('[') ? codeMatch[0] : `[${codeMatch[0]}]`) : "";

                        // 📍 영문, 숫자 보존 필터
                        let cleanKey = unitName.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');

                        if(cleanKey) { 
                            if(!ncsMap[cleanKey]) {
                                ncsMap[cleanKey] = { type: currentSection, rdCode: extractedCode };
                            } else {
                                ncsMap[cleanKey].type = currentSection;
                                if(extractedCode) ncsMap[cleanKey].rdCode = extractedCode;
                            }

                        }
                    }
                } 
                // [1-2] 평가방법 핀포인트 맵핑 (evalMap으로 분리 저장)
                else if (currentSection === "평가방법") {
                    if (valH !== "") currentEvalSubject = valH; // 📍 H열이 비어있으면 윗줄 이름 강제 이식 (병합 셀 파훼)
                    let evalUnitName = currentEvalSubject;
                    
                    if (evalUnitName) {
                        // 📍 영문, 숫자 보존 필터
                        let cleanKey = evalUnitName.replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');
                        
                        // 📍 핵심 패치: 1순위 AH열 스캔 -> 비어있으면 2순위 AF열 릴레이 스캔
                        let targetEval = String(row[AH] || "").trim();
                        if (targetEval === "") {
                            targetEval = String(row[AF] || "").trim();
                        }
                        let evalText = (targetEval + String(row[AP] || "")).replace(/\s/g, '');
                        
                        let detectedMethod = "";
                        if(evalText.includes("작업장")) detectedMethod = "작업장평가";
                        else if(evalText.includes("체크리스트")) detectedMethod = "평가자체크리스트";
                        else if(evalText.includes("선다형")) detectedMethod = "기타(선다형)";
                        else if(evalText.includes("포트폴리오")) detectedMethod = "포트폴리오";
                        else if(evalText.includes("서술형")) detectedMethod = "서술형평가";

                        if(detectedMethod && cleanKey) {
                            evalMap[cleanKey] = detectedMethod; // 📍 평가방법 전용 창고에 안전하게 보관
                        }
                    }
                }
            }

            // 2. 파이어베이스 시간표 순정 데이터 로드
            const snap = await classDbRef('masterData').once('value');
            const masterData = snap.val() || {};
            const courses = masterData.courses || [];

            if(courses.length === 0) {
                await appAlert("❌ 서버에 등록된 시간표 데이터가 없습니다.");
                input.value = ""; return;
            }

            // 3. 시간표 데이터에 RD 옵션 병합(Merge) -> 하이브리드 독립 주입 엔진
            let applyCount = 0;
            courses.forEach(c => {
                // 📍 영문, 숫자 보존 필터 적용
                let cleanUnit = (c.unit || "").replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');
                let cleanSub = (c.subject || "").replace(/\[.*?\]|\(.*?\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');
                
                let isModified = false;

                // 📍 3-1. NCS 속성 및 코드 매칭 (독립 회로)
                let matchedNcs = ncsMap[cleanUnit] || ncsMap[cleanSub];
                if(!matchedNcs) {
                    const possibleKey = Object.keys(ncsMap).find(k => k.length > 1 && (k.includes(cleanUnit) || cleanUnit.includes(k)));
                    if(possibleKey) matchedNcs = ncsMap[possibleKey];
                }
                if(matchedNcs) {
                    if(matchedNcs.type) c.type = matchedNcs.type;
                    if(matchedNcs.rdCode) c.rdCode = matchedNcs.rdCode;
                    isModified = true;
                }

                // 📍 3-2. 평가방법 매칭 및 교과별 기본값 주입 (독립 회로)
                let matchedEval = evalMap[cleanUnit] || evalMap[cleanSub];
                if(!matchedEval) {
                    const possibleKey = Object.keys(evalMap).find(k => k.length > 1 && (k.includes(cleanUnit) || cleanUnit.includes(k)));
                    if(possibleKey) matchedEval = evalMap[possibleKey];
                }

                if(matchedEval) {
                    c.evalMethod = matchedEval;
                    isModified = true;
                } else {
                    // RD 엑셀에 평가방법이 비어있을 경우 교과구분(type)에 따른 기본값 핀포인트 타겟팅
                    if (c.type === "재량교과") {
                        c.evalMethod = "-";
                        isModified = true;
                    } else if (c.type === "소양교과" || c.type === "비NCS교과") {
                        c.evalMethod = "기타(선다형)";
                        isModified = true;
                    }
                }

                if (isModified) applyCount++;
            });

            const requiredCodeSet = await fetchNcsRequiredCodeSet();
            if (requiredCodeSet.size) {
                NcsRequiredUtils.applyAutoUnitTypeToCourseList(courses, requiredCodeSet);
            }

            // 4. 조립 완료된 데이터를 DB에 플래싱
            masterData.courses = courses;
            masterData.cohortStartDate = getCohortStartDateFromMaster(masterData)
                || getCohortStartDateFromMaster(await fetchMasterDataSnapshot())
                || parseCohortStartDate(masterData.period, null)
                || '';
            await classDbRef('masterData').set(masterData);

            // 📍 [신규 배선 1] RD 엑셀 적용 기록을 서버에 메모리 저장
            await classDbRef('rdStorage').set({ fileName: file.name });
            await handleStudentAccessAfterRDUpload(file.name);

            await appAlert(`✅ 타겟팅 자동 세팅 완료!\n총 ${applyCount}개의 시간표 교과목에 평가방법 및 옵션이 완벽히 주입되었습니다.`);
            
            initializePage(); 
            input.value = ""; 

        } catch(e) {
            console.error("RD 병합 중 오류:", e);
            await appAlert("❌ 엑셀 분석 중 오류가 발생했습니다. 콘솔을 확인해 주십시오.");
            input.value = "";
        }
    };
    reader.readAsArrayBuffer(file);
}

// 📍 [신규 배선 2] 서버에서 RD 적용 기록을 읽어와 계기판에 표시
function checkRDStatus() {
    classDbRef('rdStorage').once('value', snap => {
        const info = snap.val();
        const box = document.getElementById('rdStatusBox');
        const nameSpan = document.getElementById('rdFileName');
        if(info && info.fileName && box) {
            box.style.display = "block";
            nameSpan.innerText = info.fileName;
        } else if(box) {
            box.style.display = "none";
        }
    });
}

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 12개 배선 숨기기 (이벤트 리스너 매립)

// 1. 파일 업로드 센서 — 확인 번호 입력 후에만 파일 선택창 오픈
document.getElementById('btnPickTimetable').addEventListener('click', openTimetableFilePicker);
document.getElementById('timetableFile').addEventListener('change', function() { processTimetable(this); });
document.getElementById('rdExcelFile').addEventListener('change', function() { processRDExcelMerge(this); });

// 2. 서버 저장, 삭제, 다운로드 버튼
document.getElementById('btnConfirmTimetableSave').addEventListener('click', confirmTimetableSave);
document.getElementById('btnDeleteTimetable').addEventListener('click', deleteTimetable);
document.getElementById('downloadBtn').addEventListener('click', downloadSavedTimetable);

// 3. 페이지 이동(네비게이션) 버튼
const btnCopyStudentLink = document.getElementById('btnCopyStudentLink');
const btnReissueStudentLink = document.getElementById('btnReissueStudentLink');
const btnNavStudentViewer = document.getElementById('btnNavStudentViewer');
if (btnCopyStudentLink) btnCopyStudentLink.addEventListener('click', () => copyStudentViewerLink(false));
if (btnReissueStudentLink) btnReissueStudentLink.addEventListener('click', () => copyStudentViewerLink(true));
if (btnNavStudentViewer) btnNavStudentViewer.addEventListener('click', () => openStudentViewerPreview());

// 4. 개요 저장 버튼
document.getElementById('btnSaveOverview').addEventListener('click', saveOverviewOnly);

const courseTableBody = document.getElementById('courseTableBody');
if (courseTableBody) {
    courseTableBody.addEventListener('click', function(e) {
        const typeBtn = e.target.closest('.dynamic-unit-type');
        if (typeBtn) setUnitType(typeBtn, typeBtn.getAttribute('data-typeval'));
    });
}
document.getElementById('btnOpenDailyAttendanceAlert').addEventListener('click', function() {
    location.href = this.getAttribute('data-target-url') || classNavHref('일일출석부.html', 'findEmpty=1');
});
document.getElementById('btnOpenEvalAlert').addEventListener('click', function() {
    location.href = this.getAttribute('data-target-url') || (classNavHref('../평가지/평가지.html'));
});
document.getElementById('btnOpenMakeupAlert').addEventListener('click', function() {
    location.href = this.getAttribute('data-target-url') || (classNavHref('보강수업.html'));
});
document.getElementById('btnOpenConsultAlert')?.addEventListener('click', function() {
    location.href = this.getAttribute('data-target-url') || classNavHref('상담일지.html');
});
document.getElementById('btnOpenDirectAuthAlert')?.addEventListener('click', function() {
    location.href = this.getAttribute('data-target-url') || classNavHref('직권신청.html');
});
document.getElementById('btnOpenTodayTrainingLog')?.addEventListener('click', openTodayTrainingLogOnIndex);
const todayLogSummaryPanel = document.getElementById('todayLogSummary');
if (todayLogSummaryPanel) {
    todayLogSummaryPanel.addEventListener('click', handleTodayLogSummaryClick);
    todayLogSummaryPanel.addEventListener('keydown', handleTodayLogSummaryKeydown);
}
document.getElementById('trainingProgressPanel')?.addEventListener('click', function() {
    location.href = classNavHref('단위개월출석부.html');
});
document.getElementById('btnNavPreEval')?.addEventListener('click', async function() {
    const targetUrl = classNavHref('../평가지/사전능력평가.html');
    if (await appConfirm('아직 수정중인 기능입니다.', { confirmText: '이동하기', cancelText: '취소' })) {
        location.href = targetUrl;
    }
});

/** index1 모바일: 고정 하네스 높이만큼 본문 여백 동기화 (겹침 방지) */
function syncIndex1MobileHarnessOffset() {
    const harness = document.getElementById('globalMainHarness');
    if (!harness || window.innerWidth > 768) {
        document.body.style.removeProperty('--index1-mobile-harness-h');
        return;
    }
    const h = Math.ceil(harness.getBoundingClientRect().height);
    document.body.style.setProperty('--index1-mobile-harness-h', h + 'px');
}
window.addEventListener('resize', syncIndex1MobileHarnessOffset);
window.addEventListener('load', syncIndex1MobileHarnessOffset);
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncIndex1MobileHarnessOffset);
}
requestAnimationFrame(syncIndex1MobileHarnessOffset);
setTimeout(syncIndex1MobileHarnessOffset, 300);