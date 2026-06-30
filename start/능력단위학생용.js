// 1. 각 반별 Firebase DB 주소 맵핑 (다중 접속 허용)
const masterConfig = {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
    authDomain: "busan-teacher-workall.firebaseapp.com",
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};

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

// 2. URL에서 전달받은 반 이름으로 동적 변속 엔진 가동
const urlParams = new URLSearchParams(window.location.search);
let currentClass = urlParams.get('class') || "701반"; // URL에 반 정보가 없으면 701반으로 임시 연결
document.getElementById('dispClass').innerText = formatClassHudText();

const config = firebaseConfigs[currentClass] || firebaseConfigs["701반"];
if (!firebase.apps.length) {
    firebase.initializeApp(config);
}
const database = firebase.database();
initClassContext();
currentClass = window.currentClass;

// 3. 📍 훈련 정보를 담아둘 전역 보관함 (학생용 전용: 모든 뷰어 모드를 'ncs'로 물리적 고정)
let courseName = "-", coursePeriod = "-";
let rawTimetable = [], masterSubjectList = [], ncsList = [], studentNames = [], fullAttendanceData = {};
let currentMode = 'ncs', calYear, calMonth, weeklySubMode = 'ncs', calendarSubMode = 'ncs';
let evaluationDates = {};
let dropoutData = {}; 
let earlyCompletionData = {};
let validTrainingDays = [];
let unitMonths = [];
let globalFirstDateMap = {};
let globalLastDateMap = {};
let globalSortedBusinessDays = [];
let defaultViewMode = 'ncs'; // 로컬스토리지 무시하고 무조건 ncs 모드로 고정
let selectedStudentName = null;
let isStudentPickerExpanded = false;
let cachedManualData = null;

function getStudentCacheRevisionKey() {
    return classStorageKey('studentCache_revision');
}

function getStudentCacheBundleKey() {
    return classStorageKey('studentCache_bundle');
}

function getCachedManualData() {
    return cachedManualData || {};
}

function buildStudentBundleFromGlobals() {
    return {
        fullAttendanceData,
        rawTimetable,
        dropoutData,
        earlyCompletionData,
        evaluationDates,
        courseName,
        coursePeriod,
        masterSubjectList,
        ncsList,
        manualAttendance: getCachedManualData()
    };
}

function applyStudentBundle(bundle) {
    if (!bundle || typeof bundle !== 'object' || !bundle.fullAttendanceData) return false;
    try {
        fullAttendanceData = bundle.fullAttendanceData || {};
        rawTimetable = Array.isArray(bundle.rawTimetable) ? bundle.rawTimetable : (bundle.rawTimetable ? Object.values(bundle.rawTimetable) : []);
        dropoutData = bundle.dropoutData || {};
        earlyCompletionData = bundle.earlyCompletionData || {};
        evaluationDates = bundle.evaluationDates || { subject: {}, ncs: {} };
        courseName = bundle.courseName || '-';
        coursePeriod = bundle.coursePeriod || '-';
        masterSubjectList = Array.isArray(bundle.masterSubjectList) ? bundle.masterSubjectList : [];
        ncsList = Array.isArray(bundle.ncsList) ? bundle.ncsList : [];
        cachedManualData = bundle.manualAttendance || {};
        rebuildNcsSubjectNumberMap();
        return true;
    } catch (e) {
        console.warn('학생 캐시 복원 실패:', e);
        return false;
    }
}

function saveStudentBundleToLocal(revision) {
    localStorage.setItem(getStudentCacheRevisionKey(), String(revision));
    localStorage.setItem(getStudentCacheBundleKey(), JSON.stringify(buildStudentBundleFromGlobals()));
}

function isStudentLocalCacheValid(remoteRevision, localRevision, bundledRaw) {
    if (!bundledRaw || localRevision == null) return false;
    if (remoteRevision != null) return String(localRevision) === String(remoteRevision);
    return String(localRevision) === '0';
}

async function fetchAllStudentDataFromFirebase() {
    const [masterSnap, timetableSnap, attendanceSnap, evalSnap, dropoutSnap, earlySnap, manualSnap] = await Promise.all([
        classDbRef('masterData').once('value'),
        classDbRef('fullTimetable').once('value'),
        classDbRef('dailyAttendance').once('value'),
        classDbRef('evaluationDates').once('value'),
        classDbRef('dropouts').once('value'),
        classDbRef('earlyCompletions').once('value'),
        classDbRef('manualAttendance').once('value')
    ]);

    const timetableVal = timetableSnap.val() || [];
    rawTimetable = Array.isArray(timetableVal) ? timetableVal : Object.values(timetableVal);

    const d = masterSnap.val() || {};
    fullAttendanceData = attendanceSnap.val() || {};
    dropoutData = dropoutSnap.val() || {};
    earlyCompletionData = earlySnap.val() || {};
    cachedManualData = manualSnap.val() || {};

    const rawEval = evalSnap.val() || {};
    evaluationDates = {
        subject: rawEval.subject || {},
        ncs: rawEval.ncs || {}
    };

    courseName = d.name || '-';
    coursePeriod = d.period || '-';
    if (d.courses) {
        masterSubjectList = [...new Set(d.courses.map(c => c.subject))];
        ncsList = [...new Set(d.courses.filter(c => c.unit).map(c => c.unit))];
        rebuildNcsSubjectNumberMap();
    } else {
        masterSubjectList = [];
        ncsList = [];
    }
}

async function finishStudentViewerBootstrap() {
    if (document.getElementById('infoCourse')) document.getElementById('infoCourse').innerText = courseName;
    if (document.getElementById('infoPeriod')) document.getElementById('infoPeriod').innerText = coursePeriod;

    const allStudents = new Set();
    Object.values(fullAttendanceData).forEach(dayData => {
        Object.keys(dayData).forEach(name => {
            if (name !== '_metadata') allStudents.add(name);
        });
    });
    studentNames = Array.from(allStudents).sort();
    if (!studentNames.length) studentNames = ['훈련생'];
    processUnitMonthBaseData();
    loadSelectedStudentFromStorage();
    renderStudentPicker();

    if (rawTimetable.length > 0) {
        await renderSubjectList();
        if (calYear === undefined) {
            const allDates = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== '날짜미상').sort();
            if (allDates.length > 0) {
                const firstDate = allDates[0];
                const lastDateInTable = allDates[allDates.length - 1];
                const nowKst = new Date();
                const offset = nowKst.getTimezoneOffset() * 60000;
                const todayStr = new Date(nowKst - offset).toISOString().split('T')[0];

                if (todayStr >= firstDate && todayStr <= lastDateInTable) {
                    calYear = nowKst.getFullYear();
                    calMonth = nowKst.getMonth();
                } else {
                    const p = firstDate.split('-');
                    calYear = parseInt(p[0], 10);
                    calMonth = parseInt(p[1], 10) - 1;
                }
            }
        }
        changeMode('calendar');
    }
}

function getStudentStorageKey() {
    return classStorageKey('studentView_selectedStudent');
}

function loadSelectedStudentFromStorage() {
    const saved = localStorage.getItem(getStudentStorageKey());
    if (saved && studentNames.includes(saved) && !isStudentPickerDisabled(saved)) {
        selectedStudentName = saved;
        isStudentPickerExpanded = false;
    } else {
        if (saved) localStorage.removeItem(getStudentStorageKey());
        selectedStudentName = null;
        isStudentPickerExpanded = true;
    }
}

function isStudentPickerDisabled(name) {
    return !!(dropoutData[name] || earlyCompletionData[name]);
}

function getStudentPickerStatusLabel(name) {
    if (dropoutData[name]) return '중도탈락';
    if (earlyCompletionData[name]) return '조기수료';
    return '';
}

function saveSelectedStudentToStorage(name) {
    localStorage.setItem(getStudentStorageKey(), name);
}

function getDisplayStudentNames() {
    return selectedStudentName ? [selectedStudentName] : [];
}

function getStudentListColumnCount(count) {
    if (count <= 0) return 1;
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const avail = Math.max(window.innerWidth - 32, 280);
        const minColWidth = 94;
        const maxColsByWidth = Math.max(2, Math.floor(avail / minColWidth));
        let desired = count;
        if (count > 4) desired = 4;
        if (count > 12) desired = 5;
        if (count > 20) desired = 6;
        return Math.min(desired, maxColsByWidth, count);
    }
    if (count <= 6) return count;
    if (count <= 18) return 6;
    if (count <= 30) return 8;
    return 10;
}

function getStudentListMinColWidth() {
    return window.innerWidth <= 768 ? 94 : 108;
}

function renderStudentPicker() {
    const listEl = document.getElementById('studentPickerList');
    const nameEl = document.getElementById('studentPickerSelectedName');
    const toggleBtn = document.getElementById('btnToggleStudentList');
    const barEl = document.getElementById('studentPickerBar');
    if (!listEl || !nameEl || !toggleBtn) return;

    nameEl.textContent = selectedStudentName || '미선택';
    nameEl.classList.toggle('is-empty', !selectedStudentName);
    toggleBtn.textContent = isStudentPickerExpanded ? '명단 닫기' : '명단 열기';
    listEl.classList.toggle('collapsed', !isStudentPickerExpanded);
    if (barEl) {
        barEl.classList.toggle('has-selection', !!selectedStudentName);
        barEl.classList.toggle('is-expanded', isStudentPickerExpanded);
    }

    const colCount = getStudentListColumnCount(studentNames.length);
    const minCol = getStudentListMinColWidth();
    listEl.style.gridTemplateColumns = `repeat(${colCount}, minmax(${minCol}px, 1fr))`;

    listEl.innerHTML = studentNames.map((name, idx) => {
        const active = name === selectedStudentName ? ' active' : '';
        const disabled = isStudentPickerDisabled(name);
        const disabledCls = disabled ? ' student-picker-btn-disabled' : '';
        const disabledAttr = disabled ? ' disabled aria-disabled="true"' : '';
        const statusLabel = getStudentPickerStatusLabel(name);
        const titleAttr = disabled ? ` title="${statusLabel}"` : '';
        return `<button type="button" class="student-picker-btn${active}${disabledCls}"${disabledAttr}${titleAttr} data-student-name="${encodeURIComponent(name)}"><span class="student-picker-num">${idx + 1}</span><span class="student-picker-name-text">${name}</span></button>`;
    }).join('');
    renderStudentUnitMonthRates();
}

function processUnitMonthBaseData() {
    validTrainingDays = [];
    const dayCheck = new Set();
    rawTimetable.forEach(row => {
        const d = getFixDate(row.날짜);
        if (d && d !== "날짜미상" && isActualSubject(row.교과목) && !dayCheck.has(d)) {
            validTrainingDays.push(d);
            dayCheck.add(d);
        }
    });
    validTrainingDays.sort();

    unitMonths = [];
    if (validTrainingDays.length === 0) return;

    const start = new Date(validTrainingDays[0]);
    const end = new Date(validTrainingDays[validTrainingDays.length - 1]);
    let tempStart = new Date(start);
    while (tempStart <= end) {
        const uStart = new Date(tempStart);
        const uEnd = new Date(tempStart);
        uEnd.setMonth(uEnd.getMonth() + 1);
        uEnd.setDate(uEnd.getDate() - 1);
        const sStr = uStart.toISOString().split('T')[0];
        const eStr = uEnd.toISOString().split('T')[0];
        const days = validTrainingDays.filter(d => d >= sStr && d <= eStr);
        if (days.length > 0) {
            unitMonths.push({
                label: `${unitMonths.length + 1}회`,
                fullLabel: `${unitMonths.length + 1}회 단위`,
                start: sStr,
                end: eStr,
                days
            });
        }
        tempStart.setMonth(tempStart.getMonth() + 1);
    }
}

function getCurrentUnitMonth() {
    const todayStr = getTodayStrKst();
    return unitMonths.find(u => todayStr >= u.start && todayStr <= u.end) || null;
}

function formatUnitMonthRange(u) {
    const fmt = (s) => s.substring(5).replace('-', '.');
    return `${fmt(u.start)} ~ ${fmt(u.end)}`;
}

function calculateStudentUnitMonthRates(studentName, targetDays) {
    let enrollDate = "";
    for (const d of validTrainingDays) {
        const dayData = fullAttendanceData[d]?.[studentName];
        if (dayData?.status && dayData.status !== "미편입" && dayData.status !== "" && dayData.status !== "-") {
            enrollDate = d;
            break;
        }
    }

    let pureAbsent = 0, lCount = 0, eCount = 0, oCount = 0, gonggaCount = 0, vacationCount = 0;
    let personalTrainingDaysCount = 0, preEnrollAbsentCount = 0, actualPresentCount = 0;
    const todayStr = getTodayStrKst();

    targetDays.forEach(d => {
        const att = fullAttendanceData[d]?.[studentName] || null;

        if (dropoutData[studentName] && d >= dropoutData[studentName]) {
            pureAbsent++;
            personalTrainingDaysCount++;
            return;
        }
        if (enrollDate && d < enrollDate) {
            preEnrollAbsentCount++;
            return;
        }

        personalTrainingDaysCount++;
            if (!att) {
                const countAbsent = typeof shouldCountMissingAttAsAbsent === 'function'
                    ? shouldCountMissingAttAsAbsent(d, todayStr)
                    : d <= todayStr;
                if (countAbsent) pureAbsent++;
            } else {
            const st = att.status || "";
            if (st.includes("결석") || st === "미편입") {
                pureAbsent++;
            } else {
                actualPresentCount++;
                if (st.includes("공가")) {
                    gonggaCount++;
                } else if (st.includes("휴가")) {
                    vacationCount++;
                } else if (st.includes("지각")) lCount++;
                else if (st.includes("조퇴")) eCount++;
                else if (st.includes("외출")) oCount++;
            }
        }
    });

    const penaltyAbs = Math.floor((lCount + eCount + oCount) / 3);
    const finalAbsent = pureAbsent + penaltyAbs;
    const totalCourseAbsent = finalAbsent + preEnrollAbsentCount;
    const pureAttendedDays = personalTrainingDaysCount - finalAbsent;
    const attendCount = actualPresentCount > penaltyAbs ? actualPresentCount - penaltyAbs : 0;

    const courseRate = targetDays.length > 0
        ? parseFloat(((targetDays.length - totalCourseAbsent) / targetDays.length * 100).toFixed(1))
        : 0;
    const personalRate = personalTrainingDaysCount > 0
        ? parseFloat((pureAttendedDays / personalTrainingDaysCount * 100).toFixed(1))
        : 0;

    return {
        courseRate,
        personalRate,
        attendCount,
        absentCount: finalAbsent,
        gonggaCount,
        vacationCount,
        lCount,
        eCount,
        oCount,
        isDropped: !!dropoutData[studentName]
    };
}

function getUnitMonthRateClass(rate) {
    if (rate < 80) return 'rate-danger';
    if (rate <= 85) return 'rate-warning';
    return 'rate-safe';
}

function renderStudentUnitMonthRates() {
    const el = document.getElementById('studentUnitMonthRates');
    const unitTitleEl = document.getElementById('studentPickerUnitTitle');
    if (!el) return;

    const currentUnit = getCurrentUnitMonth();
    if (!selectedStudentName || !currentUnit) {
        el.style.display = 'none';
        el.innerHTML = '';
        if (unitTitleEl) unitTitleEl.innerHTML = '';
        return;
    }

    const stats = calculateStudentUnitMonthRates(selectedStudentName, currentUnit.days);
    const rateCls = stats.isDropped ? 'rate-dropout' : getUnitMonthRateClass(stats.personalRate);
    const rangeText = formatUnitMonthRange(currentUnit);

    if (unitTitleEl) {
        const rangeCompact = rangeText.replace(/\s*~\s*/g, '~');
        unitTitleEl.innerHTML = `<span class="unit-title-text">${currentUnit.fullLabel}(${rangeCompact})</span>`;
    }

    const statItem = (label, value, extraCls = '', title = '') =>
        `<span class="unit-stat-inline ${extraCls}"${title ? ` title="${title}"` : ''}><span class="stat-lbl">${label}</span><span class="stat-val">${value}</span></span>`;

    el.style.display = 'block';
    el.innerHTML = `
        <div class="unit-rate-compact-grid">
            <div class="unit-rate-compact-row unit-rate-row-top">
                ${statItem('출석률', `${stats.personalRate}%`, `stat-rate ${rateCls}`)}
                ${statItem('출석', `${stats.attendCount}일`)}
                ${statItem('휴가', `${stats.vacationCount}일`, stats.vacationCount > 0 ? 'stat-vacation' : '')}
                ${statItem('공가', `${stats.gonggaCount}일`, stats.gonggaCount > 0 ? 'stat-leave' : '')}
            </div>
            <div class="unit-rate-compact-row unit-rate-row-bottom">
                ${statItem('결석', `${stats.absentCount}일`, stats.absentCount > 0 ? 'stat-absent' : '')}
                ${statItem('지각', `${stats.lCount}회`, stats.lCount > 0 ? 'stat-warn' : '')}
                ${statItem('조퇴', `${stats.eCount}회`, stats.eCount > 0 ? 'stat-warn' : '')}
                ${statItem('외출', `${stats.oCount}회`, stats.oCount > 0 ? 'stat-out' : '')}
            </div>
        </div>
    `;
}

function toggleStudentPicker() {
    isStudentPickerExpanded = !isStudentPickerExpanded;
    renderStudentPicker();
}

function selectStudent(name) {
    if (isStudentPickerDisabled(name)) return;
    selectedStudentName = name;
    saveSelectedStudentToStorage(name);
    isStudentPickerExpanded = false;
    renderStudentPicker();
    refreshCurrentView();
}

function refreshCurrentView() {
    const activeTab = document.querySelector('.tab-menu .tab-btn.active');
    if (!activeTab) return;
    if (activeTab.id === 'tab_main') changeMode('main');
    else if (activeTab.id === 'tab_calendar') changeMode('calendar');
    else if (activeTab.id === 'tab_weekly') changeMode('weekly');
    else if (activeTab.id === 'tab_resume') changeMode('resume');
}

async function requireSelectedStudent() {
    if (selectedStudentName) return true;
    await appAlert('상단에서 본인 이름을 먼저 선택해주세요.');
    isStudentPickerExpanded = true;
    renderStudentPicker();
    document.getElementById('studentPickerBar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
}

function getAttBadgeInfo(status, compact = false) {
    const st = String(status || '').trim();
    const label = (full, short) => (compact ? short : full);

    if (st.includes('탈락')) return { text: label('탈락', '탈'), cls: 'att-absent', title: st };
    if (st.includes('미실시') || st.includes('미등록') || st === '미') {
        return { text: label('미실시', '미'), cls: 'att-pending', title: st || '미실시' };
    }
    if (!st || st.includes('출석')) return { text: label('출석', '출'), cls: 'att-ok', title: st || '출석' };
    if (st.includes('지각')) return { text: label('지각', '지'), cls: 'att-late', title: st };
    if (st.includes('조퇴')) return { text: label('조퇴', '조'), cls: 'att-early', title: st };
    if (st.includes('외출')) return { text: label('외출', '외'), cls: 'att-out', title: st };
    if (st.includes('결석') || st === '미편입') return { text: label('결석', '결'), cls: 'att-absent', title: st };
    if (st.includes('공가')) return { text: label('공가', '공'), cls: 'att-special', title: st };
    if (st.includes('휴가') || st.includes('기타')) return { text: label('휴가', '휴'), cls: 'att-special', title: st };
    return { text: compact ? (st.charAt(0) || '출') : (st || '출석'), cls: 'att-other', title: st };
}

function buildPersonalAttBadge(status, compact = false) {
    const info = getAttBadgeInfo(status, compact);
    return `<span class="personal-att-badge ${info.cls}" title="${info.title}">${info.text}</span>`;
}

let lastScrollPos = 0;
let suppressDetailOutsideCloseUntil = 0;

function isSubjectDashboardHidden() {
    const table = document.querySelector('.excel-info-table');
    if (!table) return false;
    return window.getComputedStyle(table).display === 'none';
}

function getDetailViewSummaryBar(box) {
    if (!box) return null;
    if (box.dataset.portalBarId) {
        return document.getElementById(box.dataset.portalBarId);
    }
    const prev = box.previousElementSibling;
    return prev?.classList?.contains('subject-summary-bar') ? prev : null;
}

function getDetailViewItem(box) {
    if (!box) return null;
    if (box.dataset.portalItemId) {
        return document.getElementById(box.dataset.portalItemId);
    }
    return box.closest('.subject-dashboard-item');
}

function cleanupPortaledDetailViews() {
    document.querySelectorAll('.detail-view[data-portaled="1"]').forEach(el => el.remove());
    document.querySelectorAll('.detail-view-placeholder').forEach(el => el.remove());
    if (!document.querySelector('.detail-view[style*="display: block"]')) {
        document.body.classList.remove('detail-panel-open');
    }
}

function resolveDetailBoxElement(boxId, preferredBox) {
    if (preferredBox instanceof HTMLElement && preferredBox.id === boxId) return preferredBox;
    if (!boxId) return null;
    const escaped = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(boxId)
        : boxId.replace(/[^\w-]/g, '\\$&');
    const matches = document.querySelectorAll(`#${escaped}`);
    if (matches.length === 0) return document.getElementById(boxId);
    if (matches.length === 1) return matches[0];
    const portaled = Array.from(matches).find(el => el.dataset.portaled === '1' && el.classList.contains('detail-view'));
    return portaled || matches[matches.length - 1];
}

function setDetailScrollHint(box, mode) {
    const scrollBox = box?.querySelector('.scroll-box');
    if (!scrollBox) return;
    let hint = scrollBox.querySelector('.mobile-att-status-hint');
    if (mode === 'clear') {
        hint?.remove();
        return;
    }
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'mobile-att-status-hint mobile-att-empty';
        scrollBox.insertBefore(hint, scrollBox.firstChild);
    }
    hint.classList.toggle('mobile-att-loading', mode === 'loading');
    hint.style.whiteSpace = 'pre-line';
    hint.textContent = mode === 'loading'
        ? '출석부를 불러오는 중…'
        : '출석부를 표시하지 못했습니다.\n아래 확인을 눌러 닫은 뒤 다시 열어 보거나,\n화면을 새로고침해 주세요.';
}

function isMobileDetailRendered(headId, box) {
    const scrollBox = box?.querySelector('.scroll-box') || document.getElementById(headId)?.closest('.scroll-box');
    const vert = scrollBox?.querySelector('.mobile-att-vertical');
    return !!(vert && vert.querySelector('.mobile-att-summary'));
}

function ensureDetailViewPortaled(box) {
    if (!box || box.dataset.portaled === '1') return;
    const shouldPortal = window.innerWidth <= 768 || isSubjectDashboardHidden();
    if (!shouldPortal || !box.parentNode) return;

    const bar = getDetailViewSummaryBar(box);
    const item = getDetailViewItem(box);
    if (bar && !bar.id) {
        bar.id = `portalBar_${box.id}`;
        box.dataset.portalBarId = bar.id;
    } else if (bar) {
        box.dataset.portalBarId = bar.id;
    }
    if (item && !item.id) {
        item.id = `portalItem_${box.id}`;
        box.dataset.portalItemId = item.id;
    } else if (item) {
        box.dataset.portalItemId = item.id;
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'detail-view-placeholder';
    placeholder.dataset.for = box.id;
    box.parentNode.insertBefore(placeholder, box);
    document.body.appendChild(box);
    box.dataset.portaled = '1';
}

async function showSubjectDetail(boxId, subName, options = {}) {
    const box = resolveDetailBoxElement(boxId, options.boxElement);
    if (!box) return false;
    if (!(await requireSelectedStudent())) return false;

    if (options.targetDate) window.lastSelectedDate = options.targetDate;

    if (options.returnToDaySheet && options.daySheetSnapshot) {
        pendingDaySheetReturn = cloneDaySheetSnapshot(options.daySheetSnapshot);
    } else if (!options.preserveDaySheetReturn) {
        pendingDaySheetReturn = null;
    }

    if (!document.querySelector('.detail-view[style*="display: block"]')) {
        lastScrollPos = window.pageYOffset;
    }

    document.querySelectorAll('.detail-view').forEach(el => {
        if (el !== box) el.style.display = 'none';
    });
    document.querySelectorAll('.subject-dashboard-item').forEach(el => el.classList.remove('detail-open'));
    document.querySelectorAll('.subject-summary-bar').forEach(b => {
        b.classList.remove('summary-bar-active');
        b.style.backgroundColor = '';
    });

    ensureDetailViewPortaled(box);

    const bar = getDetailViewSummaryBar(box);
    const item = getDetailViewItem(box);
    if (bar) bar.classList.add('summary-bar-active');
    if (item) item.classList.add('detail-open');
    document.body.classList.add('detail-panel-open');

    box.style.display = 'block';
    const idx = boxId.split('_')[1];
    const headId = `head_${idx}`;
    const bodyId = `body_${idx}`;

    if (window.innerWidth <= 768) setDetailScrollHint(box, 'loading');
    try {
        await loadDetailInto(subName, headId, bodyId);
        if (window.innerWidth <= 768 && !isMobileDetailRendered(headId, box)) {
            setDetailScrollHint(box, 'fallback');
        } else {
            setDetailScrollHint(box, 'clear');
        }
    } catch (e) {
        console.error('출석부 로드 실패:', e);
        if (window.innerWidth <= 768) setDetailScrollHint(box, 'fallback');
    }

    suppressDetailOutsideCloseUntil = Date.now() + 450;

    if (window.innerWidth > 768 && item) {
        setTimeout(() => {
            const offset = 80;
            const targetPos = item.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: targetPos, behavior: 'smooth' });
        }, 150);
    }

    return true;
}

window.showSubjectDetail = showSubjectDetail;

function closeDetailView(boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const bar = getDetailViewSummaryBar(box);
    const item = getDetailViewItem(box);
    const returnSheet = pendingDaySheetReturn ? cloneDaySheetSnapshot(pendingDaySheetReturn) : null;
    box.style.display = 'none';
    if (item) item.classList.remove('detail-open');
    if (bar) {
        bar.classList.remove('summary-bar-active');
        bar.style.backgroundColor = '';
    }
    if (!document.querySelector('.detail-view[style*="display: block"]')) {
        document.body.classList.remove('detail-panel-open');
    }

    if (returnSheet) {
        pendingDaySheetReturn = null;
        requestAnimationFrame(() => {
            openDaySubjectsSheet(returnSheet);
        });
        return;
    }

    window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
}

window.closeDetailView = closeDetailView;

function showStudentAccessDenied(access) {
    const container = document.querySelector('.excel-container');
    if (!container) return;
    const periodHint = access?.periodLabel
        ? `<p style="margin-top:18px; font-size:13px; color:#888;">현재 등록된 훈련: ${access.periodLabel}</p>`
        : '';
    container.innerHTML = `
        <div style="text-align:center; padding:70px 24px;">
            <div style="font-size:48px; margin-bottom:16px;">🔒</div>
            <h2 style="color:#c0392b; margin:0 0 14px; font-size:22px;">접속할 수 없는 링크입니다</h2>
            <p style="line-height:1.9; color:#555; font-size:15px; margin:0;">
                이 링크는 만료되었거나 올바르지 않습니다.<br>
                담임선생님께 <strong>새 훈련생 배포 링크</strong>를 요청해 주세요.
            </p>
            ${periodHint}
        </div>`;
}

async function validateStudentAccess() {
    const urlKey = urlParams.get('key');
    try {
        const snap = await classDbRef('studentAccess').once('value');
        const access = snap.val();
        if (!access?.currentKey) return true;
        if (urlKey && urlKey === access.currentKey) return true;
        showStudentAccessDenied(access);
        return false;
    } catch (e) {
        console.error('학생용 접근 검증 실패:', e);
        return true;
    }
}

async function bootStudentViewer() {
    const allowed = await validateStudentAccess();
    if (allowed) await initialize();
}

// 4. 학생용 열람 모드 시동 (접근 키 검증 후 데이터 로드)
console.log("🔓 학생용 열람 모드: 접근 키 검증 후 가동");
bootStudentViewer(); 

function getFixDate(rawDate) {
    if (!rawDate) return "날짜미상";
    let s = String(rawDate).trim();
    s = s.replace(/\./g, '-');
    if (s.includes('/')) {
        let p = s.split('/');
        if (p.length === 3) {
            let year = p[2].length === 2 ? "20" + p[2] : p[2];
            let month = p[0].padStart(2, '0');
            let day = p[1].padStart(2, '0');
            s = `${year}-${month}-${day}`;
        }
    }
    return s.substring(0, 10);
}

function isActualSubject(subName) {
    if (!subName || subName === "") return false;
    const cleanSubName = String(subName).replace(/\s+/g, "");
    return masterSubjectList.some(m => m.replace(/\s+/g, "").includes(cleanSubName)) || 
           ncsList.some(n => n.replace(/\s+/g, "").includes(cleanSubName));
}

function isSubjectAttendanceCompleted(subName) {
    const subData = rawTimetable.filter(r => String(r.능력단위 || "").trim() === subName);
    const subDates = [...new Set(subData.map(r => getFixDate(r.날짜)))].filter(d => d && d !== "날짜미상");
    return subDates.length > 0 && subDates.every(date => fullAttendanceData[date]);
}

function formatDisplaySubjectName(name) {
    return String(name || "").replace(/\[.*?\]/g, "").trim();
}

let ncsSubjectNumberMap = null;

function rebuildNcsSubjectNumberMap() {
    const sorted = [...ncsList].sort((a, b) =>
        formatDisplaySubjectName(a).localeCompare(formatDisplaySubjectName(b), 'ko')
    );
    ncsSubjectNumberMap = {};
    sorted.forEach((name, idx) => {
        ncsSubjectNumberMap[String(name).trim()] = idx + 1;
    });
}

function getNcsSubjectListNumber(subName) {
    if (!ncsList.length) return null;
    if (!ncsSubjectNumberMap) rebuildNcsSubjectNumberMap();
    const key = String(subName || '').trim();
    if (ncsSubjectNumberMap[key]) return ncsSubjectNumberMap[key];
    const title = formatDisplaySubjectName(key);
    const matched = Object.keys(ncsSubjectNumberMap).find(k => formatDisplaySubjectName(k) === title);
    return matched ? ncsSubjectNumberMap[matched] : null;
}

function formatNcsSubjectWithNumber(subName) {
    const num = getNcsSubjectListNumber(subName);
    const title = formatDisplaySubjectName(subName);
    return num ? `[${num}] ${title}` : title;
}

function getStudentSubjectStats(studentName, subName, manualData) {
    const cleanSelected = String(subName).replace(/\s+/g, "");
    const dates = [...new Set(rawTimetable.filter(r => {
        const rowVal = String(r.능력단위 || "");
        return String(rowVal).replace(/\s+/g, "") === cleanSelected;
    }).map(r => getFixDate(r.날짜)))].sort();

    if (!dates.length || !studentName) return { percent: null, actualPercent: null, makeupMin: 0 };

    const escapedSub = subName.replace(/[\.\#\$\/\[\]]/g, "_");
    let makeupMin = 0;
    if (manualData[studentName]?.[`makeup_${escapedSub}`]) {
        makeupMin = parseInt(manualData[studentName][`makeup_${escapedSub}`]) || 0;
    }

    let masterTotal = 0;
    let rowTotalMin = 0;
    let actualRowTotalMin = 0;

    dates.forEach(date => {
        const sched = calculateParticipation(date, "09:00", "17:30", subName, "", "");
        masterTotal += sched.am + sched.pm;

        const isDropout = dropoutData[studentName] && (date >= dropoutData[studentName]);
        if (isDropout) return;

        const att = fullAttendanceData[date]?.[studentName] || null;
        let calc = { am: 0, pm: 0, isFuture: !fullAttendanceData[date] };

        if (att?.inTime && att?.outTime) {
            calc = calculateParticipation(date, att.inTime, att.outTime, subName, att.leaveTime || "", att.returnTime || "");
            calc.isFuture = false;
        }
        if (manualData[studentName]?.[date]) {
            if (manualData[studentName][date].am !== undefined) calc.am = manualData[studentName][date].am;
            if (manualData[studentName][date].pm !== undefined) calc.pm = manualData[studentName][date].pm;
            calc.isFuture = false;
        }

        rowTotalMin += (calc.isFuture ? sched.am + sched.pm : calc.am + calc.pm);
        actualRowTotalMin += calc.am + calc.pm;
    });

    const finalTotalMin = rowTotalMin + makeupMin;
    const actualFinalMin = actualRowTotalMin + makeupMin;
    const percent = masterTotal > 0 ? parseFloat(((finalTotalMin / masterTotal) * 100).toFixed(1)) : 0;
    const actualPercent = masterTotal > 0 ? parseFloat(((actualFinalMin / masterTotal) * 100).toFixed(1)) : 0;
    return { percent, actualPercent, makeupMin };
}

function computeSubjectRemainingAttendanceInfo(studentName, subName, manualData) {
    const cleanSelected = String(subName).replace(/\s+/g, "");
    const dates = [...new Set(rawTimetable.filter(r => {
        const rowVal = String(r.능력단위 || "");
        return String(rowVal).replace(/\s+/g, "") === cleanSelected;
    }).map(r => getFixDate(r.날짜)))].sort();

    if (!dates.length || !studentName) return null;

    const escapedSub = subName.replace(/[\.\#\$\/\[\]]/g, "_");
    let makeupMin = 0;
    if (manualData[studentName]?.[`makeup_${escapedSub}`]) {
        makeupMin = parseInt(manualData[studentName][`makeup_${escapedSub}`], 10) || 0;
    }

    let masterTotal = 0;
    let completedMin = 0;
    let remainingScheduleMin = 0;

    dates.forEach(date => {
        const sched = calculateParticipation(date, "09:00", "17:30", subName, "", "");
        const dayMin = sched.am + sched.pm;
        masterTotal += dayMin;

        if (dropoutData[studentName] && date >= dropoutData[studentName]) return;

        let isFuture = !fullAttendanceData[date];
        const att = fullAttendanceData[date]?.[studentName] || null;
        let am = 0;
        let pm = 0;

        if (att?.inTime && att?.outTime) {
            const calc = calculateParticipation(date, att.inTime, att.outTime, subName, att.leaveTime || "", att.returnTime || "");
            am = calc.am;
            pm = calc.pm;
            isFuture = false;
        }
        if (manualData[studentName]?.[date]) {
            if (manualData[studentName][date].am !== undefined) am = manualData[studentName][date].am;
            if (manualData[studentName][date].pm !== undefined) pm = manualData[studentName][date].pm;
            isFuture = false;
        }

        if (isFuture) remainingScheduleMin += dayMin;
        else completedMin += am + pm;
    });

    completedMin += makeupMin;
    const passMin = masterTotal * 0.75;
    const projectedTotalMin = completedMin + remainingScheduleMin;
    const surplusMin = Math.max(0, Math.round(projectedTotalMin - passMin));
    const completedPercent = masterTotal > 0
        ? parseFloat(((completedMin / masterTotal) * 100).toFixed(1))
        : 0;

    return {
        completedMin: Math.round(completedMin),
        completedPercent,
        remainingScheduleMin: Math.round(remainingScheduleMin),
        surplusMin,
        masterTotal: Math.round(masterTotal),
        passMin: Math.round(passMin)
    };
}

function buildRemainAttInfoBodyHtml(info, isCompleted) {
    const surplusHtml = isCompleted ? '' : `
        <div class="remain-att-stat is-surplus">
            <span class="remain-att-stat-label">여유 출석 시간</span>
            <strong class="remain-att-stat-value">${info.surplusMin.toLocaleString()}분</strong>
        </div>`;
    const noteTail = isCompleted
        ? '※ 이 과목의 수업 일정이 모두 종료되었습니다.'
        : '※ 여유 출석 시간은 남은 훈련일을 모두 출석했을 때 75%를 넘기는 분입니다.';

    return `
        <div class="remain-att-stat is-primary">
            <span class="remain-att-stat-label">현재 완료 시간</span>
            <strong class="remain-att-stat-value remain-att-stat-value-split">
                <span class="remain-att-stat-pct">${info.completedPercent}%</span>
                <span>${info.completedMin.toLocaleString()}분</span>
            </strong>
        </div>
        <div class="remain-att-stat">
            <span class="remain-att-stat-label">남은 출석 시간</span>
            <strong class="remain-att-stat-value">${info.remainingScheduleMin.toLocaleString()}분</strong>
        </div>
        ${surplusHtml}
        <div class="remain-att-note">
            ※ 이수 기준 출석률 75% (필요 ${info.passMin.toLocaleString()}분 / 총 ${info.masterTotal.toLocaleString()}분)<br>
            ${noteTail}
        </div>
    `;
}

function openRemainAttInfoModal(subName, info) {
    const sheet = document.getElementById('remainAttInfoSheet');
    const titleEl = document.getElementById('remainAttTitle');
    const studentEl = document.getElementById('remainAttStudent');
    const bodyEl = document.getElementById('remainAttBody');
    if (!sheet || !titleEl || !bodyEl) return;

    titleEl.textContent = formatDisplaySubjectName(subName);
    if (studentEl) {
        studentEl.textContent = selectedStudentName ? `👤 ${selectedStudentName}` : '';
    }
    bodyEl.innerHTML = buildRemainAttInfoBodyHtml(info, isSubjectAttendanceCompleted(subName));

    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('remain-att-open');
}

function closeRemainAttInfoModal() {
    const sheet = document.getElementById('remainAttInfoSheet');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('remain-att-open');
}

window.showRemainingAttendanceInfo = async function(subName) {
    if (!(await requireSelectedStudent())) return;

    const info = computeSubjectRemainingAttendanceInfo(selectedStudentName, subName, getCachedManualData());
    if (!info) {
        await appAlert('해당 과목 정보를 불러올 수 없습니다.');
        return;
    }

    openRemainAttInfoModal(subName, info);
};

function getProjectedSubjectPercentFromResults(name, dates, results, masterSchedule, makeupMin) {
    let masterTotal = 0;
    let projectedMin = 0;
    dates.forEach(date => {
        const dayMin = masterSchedule[date].am + masterSchedule[date].pm;
        masterTotal += dayMin;
        if (dropoutData[name] && date >= dropoutData[name]) return;
        const res = results[name].dates[date];
        projectedMin += res.isFuture ? dayMin : ((Number(res.am) || 0) + (Number(res.pm) || 0));
    });
    const projectedFinalMin = projectedMin + (makeupMin || 0);
    const projectedPercent = masterTotal > 0
        ? parseFloat(((projectedFinalMin / masterTotal) * 100).toFixed(1))
        : 0;
    return { projectedPercent, projectedFinalMin, projectedMin, masterTotal };
}

function getSubjectCompletionStatus(projectedPercent, isDropout, isCompleted) {
    if (isDropout) return { text: '탈락', cls: 'mobile-att-completion-dropout', title: '중도탈락' };
    if (isCompleted) {
        if (projectedPercent >= 75) {
            return { text: '이수완료', cls: 'mobile-att-completion-done', title: '과목 수업 일정이 모두 종료됨' };
        }
        return { text: '보강필요', cls: 'mobile-att-completion-need', title: '과목 수업 종료 · 출석률 75% 미달' };
    }
    if (projectedPercent >= 75) {
        return { text: '이수가능', cls: 'mobile-att-completion-pass', title: '미참여 일수 전부 참석 가정' };
    }
    return { text: '보강필요', cls: 'mobile-att-completion-need', title: '미참여 일수 전부 참석 가정' };
}

function getCalendarDaySubjectData(targetDate) {
    const amData = {};
    const pmData = {};
    const holidays = new Set();
    rawTimetable.forEach(r => {
        if (getFixDate(r.날짜) !== targetDate) return;
        const sub = r.능력단위 ? String(r.능력단위).trim() : "";
        const checkSub = String(r.교과목 || "").trim();
        const period = String(r.교시).trim();
        if (period === "점심") return;
        if (isActualSubject(checkSub)) {
            if (sub !== "") {
                if (['1', '2', '3', '4'].includes(period)) amData[sub] = (amData[sub] || 0) + 1;
                else if (['5', '6', '7', '8'].includes(period)) pmData[sub] = (pmData[sub] || 0) + 1;
            }
        } else if (checkSub !== "") {
            holidays.add(checkSub);
        }
    });
    return { amData, pmData, holidays };
}

function formatDaySheetDateLabel(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const weeks = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${weeks[d.getDay()]})`;
}

function buildDaySubjectAttendanceBarHtml(targetDate) {
    const att = fullAttendanceData[targetDate]?.[selectedStudentName];
    if (!att) {
        return { html: '<span class="day-subjects-att-text muted">출결 미등록</span>', isEmpty: true };
    }
    const info = getAttBadgeInfo(att.status || '출석');
    const timeText = `${att.status || '-'} · ${att.inTime || '-'}~${att.outTime || '-'}`;
    return {
        html: `<span class="day-subjects-att-badge personal-att-badge ${info.cls}" title="${info.title}">${info.text}</span><span class="day-subjects-att-text">${timeText}</span>`,
        isEmpty: false
    };
}

let daySheetTargetDate = '';
let daySheetSnapshot = null;
let pendingDaySheetReturn = null;

function cloneDaySheetSnapshot(source) {
    if (!source) return null;
    return {
        targetDate: source.targetDate || '',
        amData: { ...(source.amData || {}) },
        pmData: { ...(source.pmData || {}) },
        holidays: source.holidays instanceof Set ? new Set(source.holidays) : new Set(source.holidays || [])
    };
}

function normalizeSubjectKey(name) {
    return String(name || '').replace(/\s+/g, '');
}

function findSubjectDetailMeta(subName) {
    const targetKey = normalizeSubjectKey(subName);
    let matchedBar = null;
    document.querySelectorAll('.subject-summary-bar[data-sub-name]').forEach(bar => {
        const key = normalizeSubjectKey(decodeURIComponent(bar.dataset.subName || ''));
        if (key === targetKey) matchedBar = bar;
    });
    if (!matchedBar) return null;

    const item = matchedBar.closest('.subject-dashboard-item');
    let box = item?.querySelector('.detail-view[id^="detailBox_"]');
    if (!box) {
        const placeholder = item?.querySelector('.detail-view-placeholder[data-for^="detailBox_"]');
        if (placeholder?.dataset.for) {
            box = document.getElementById(placeholder.dataset.for);
        }
    }
    if (!box) return null;
    return {
        boxId: box.id,
        subName: decodeURIComponent(matchedBar.dataset.subName || subName),
        boxElement: box
    };
}

async function ensureSubjectDashboardReady() {
    const area = document.getElementById('subjectDashboardArea');
    if (!area?.querySelector('.subject-dashboard-item')) {
        await renderSubjectList();
    }
}

async function openSubjectDetailFromDaySheet(subName, ev) {
    if (ev?.currentTarget instanceof HTMLElement) {
        ev.currentTarget.blur();
    }
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    if (!(await requireSelectedStudent())) return;

    await ensureSubjectDashboardReady();
    const meta = findSubjectDetailMeta(subName);
    if (!meta) {
        await appAlert('해당 과목 출석부를 찾을 수 없습니다.');
        return;
    }

    const targetDate = daySheetTargetDate;
    closeDaySubjectsSheet();

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const sheetSnap = daySheetSnapshot || (() => {
        const dayData = getCalendarDaySubjectData(targetDate);
        return {
            targetDate,
            amData: dayData.amData,
            pmData: dayData.pmData,
            holidays: dayData.holidays
        };
    })();

    await showSubjectDetail(meta.boxId, meta.subName, {
        targetDate,
        returnToDaySheet: true,
        daySheetSnapshot: sheetSnap,
        boxElement: meta.boxElement
    });
}

window.openSubjectDetailFromDaySheet = openSubjectDetailFromDaySheet;

function bindDaySubjectLineClicks(container) {
    if (!container) return;
    container.querySelectorAll('.day-subject-line-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const subName = decodeURIComponent(btn.dataset.subName || '');
            await openSubjectDetailFromDaySheet(subName, e);
        });
    });
}

function escapeSubForJsAttr(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const DAY_SUBJECT_TAP_ICON_SVG = `<svg class="day-subject-tap-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/></svg>`;

function buildDaySubjectLineHtml(subName, slotLabel, hours) {
    const num = getNcsSubjectListNumber(subName);
    const title = formatDisplaySubjectName(subName);
    const numText = num ? String(num) : '-';
    const safeName = encodeURIComponent(subName);
    return `<button type="button" class="day-subject-line day-subject-line-btn" data-sub-name="${safeName}" aria-label="${title}, 눌러 출석부 보기">
        <span class="day-subject-num">${numText}</span>
        <span class="day-subject-name"><span class="day-subject-title">${title}</span></span>
        <span class="day-subject-tap-icon" aria-hidden="true">${DAY_SUBJECT_TAP_ICON_SVG}</span>
        <span class="day-subject-slot">${slotLabel}</span>
        <span class="day-subject-hours">${hours}시간</span>
    </button>`;
}

function buildDaySubjectsLinesHtml(amData, pmData) {
    const amKeys = Object.keys(amData);
    const pmKeys = Object.keys(pmData);
    const amOnly = [];
    const both = [];
    const pmOnly = [];
    const processed = new Set();

    amKeys.forEach(sub => {
        if (!pmKeys.includes(sub)) return;
        processed.add(sub);
        both.push({
            subName: sub,
            slotLabel: '오전/오후',
            hours: amData[sub] + pmData[sub],
            order: getNcsSubjectListNumber(sub) || 9999
        });
    });

    amKeys.forEach(sub => {
        if (processed.has(sub)) return;
        amOnly.push({
            subName: sub,
            slotLabel: '오전',
            hours: amData[sub],
            order: getNcsSubjectListNumber(sub) || 9999
        });
    });

    pmKeys.forEach(sub => {
        if (processed.has(sub)) return;
        pmOnly.push({
            subName: sub,
            slotLabel: '오후',
            hours: pmData[sub],
            order: getNcsSubjectListNumber(sub) || 9999
        });
    });

    const sortRows = (a, b) => a.order - b.order || formatDisplaySubjectName(a.subName).localeCompare(formatDisplaySubjectName(b.subName), 'ko');
    amOnly.sort(sortRows);
    both.sort(sortRows);
    pmOnly.sort(sortRows);

    const rows = [...amOnly, ...both, ...pmOnly];
    return rows.map(row => buildDaySubjectLineHtml(row.subName, row.slotLabel, row.hours)).join('');
}

function buildDaySubjectsBodyHtml(amData, pmData, holidays) {
    const am = amData || {};
    const pm = pmData || {};
    const holidaySet = holidays || new Set();
    let html = buildDaySubjectsLinesHtml(am, pm);

    if (holidaySet.size > 0) {
        html += Array.from(holidaySet).map(h =>
            `<div class="day-subject-line day-subject-line-etc"><span class="day-subject-num">·</span><span class="day-subject-name">${h}</span><span class="day-subject-slot">기타</span><span class="day-subject-hours"></span></div>`
        ).join('');
    }

    if (!html) {
        html = '<div class="day-subjects-empty"><div class="day-subjects-empty-icon">📭</div>해당 일자에<br>진행된 수업이 없습니다.</div>';
    } else {
        html = `<div class="day-subject-lines">${html}</div>`;
    }
    return html;
}

function openDaySubjectsSheet(options = {}) {
    const sheet = document.getElementById('daySubjectsSheet');
    const body = document.getElementById('daySubjectsBody');
    const dateEl = document.getElementById('daySubjectsDate');
    const studentEl = document.getElementById('daySubjectsStudent');
    const attBar = document.getElementById('daySubjectsAttBar');
    if (!sheet || !body || !dateEl || !attBar) return;

    const targetDate = options.targetDate || '';
    daySheetTargetDate = targetDate;
    daySheetSnapshot = cloneDaySheetSnapshot({
        targetDate,
        amData: options.amData || {},
        pmData: options.pmData || {},
        holidays: options.holidays || new Set()
    });
    dateEl.textContent = formatDaySheetDateLabel(targetDate);
    if (studentEl) studentEl.textContent = selectedStudentName ? `👤 ${selectedStudentName}` : '';

    const attView = buildDaySubjectAttendanceBarHtml(targetDate);
    attBar.innerHTML = attView.html;
    attBar.classList.toggle('is-empty', attView.isEmpty);

    let html = buildDaySubjectsBodyHtml(options.amData, options.pmData, options.holidays);

    body.innerHTML = html;
    bindDaySubjectLineClicks(body);
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('day-subjects-open');
}

function closeDaySubjectsSheet() {
    const sheet = document.getElementById('daySubjectsSheet');
    if (!sheet) return;
    const focused = document.activeElement;
    if (focused && sheet.contains(focused) && typeof focused.blur === 'function') {
        focused.blur();
    }
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('day-subjects-open');
}

async function showMobileCalendarDaySubjects(targetDate, ev) {
    if (ev) {
        ev.stopPropagation();
        ev.preventDefault();
    }
    if (!(await requireSelectedStudent())) return;

    const { amData, pmData, holidays } = getCalendarDaySubjectData(targetDate);
    openDaySubjectsSheet({ targetDate, amData, pmData, holidays });
}

window.showMobileCalendarDaySubjects = showMobileCalendarDaySubjects;

async function initialize() {
    try {
        const revSnap = await classDbRef('studentDataRevision').once('value');
        const remoteRevision = revSnap.val();
        const localRevision = localStorage.getItem(getStudentCacheRevisionKey());
        const bundledRaw = localStorage.getItem(getStudentCacheBundleKey());

        if (isStudentLocalCacheValid(remoteRevision, localRevision, bundledRaw)) {
            if (applyStudentBundle(JSON.parse(bundledRaw))) {
                await finishStudentViewerBootstrap();
                return;
            }
        }

        await fetchAllStudentDataFromFirebase();
        const saveRevision = remoteRevision != null ? remoteRevision : '0';
        saveStudentBundleToLocal(saveRevision);
        await finishStudentViewerBootstrap();
    } catch (e) {
        console.error('데이터 로드 실패:', e);
    }
}

// 📍 메인 탭 제어 함수 (무조건 ncs 모드로만 화면을 그립니다)
function changeMode(mode) {
    document.querySelectorAll('.tab-menu .tab-btn').forEach(btn => btn.classList.remove('active'));
    const vArea = document.getElementById('viewArea');
    const fRow = document.getElementById('subjectFilterRow'); // 📍 메인 화면 전체 구역 스위치
    const infoTable = document.querySelector('.excel-info-table');
    vArea.innerHTML = ""; 

    const evalBanner = document.getElementById('evalDateBanner');
    if (evalBanner) evalBanner.style.display = 'none';

    if (mode === 'main') {
        document.getElementById('tab_main').classList.add('active');
        currentMode = 'ncs'; 
        fRow.style.display = 'table-row'; // 📍 메인 탭일 때 화면 켜기
        if (infoTable) infoTable.style.display = '';
        renderSubjectList();
    } else {
        fRow.style.display = 'none'; // 📍 다른 탭으로 갈 때 메인 화면 강제 전원 차단
        if (infoTable) infoTable.style.display = 'none';
        if (mode === 'calendar') {
            document.getElementById('tab_calendar').classList.add('active');
            calendarSubMode = 'ncs'; 
            renderCalendar();
        } else if (mode === 'weekly') {
            document.getElementById('tab_weekly').classList.add('active');
            weeklySubMode = 'ncs'; 
            renderWeekly();
        } else if (mode === 'resume') {
            const tabResume = document.getElementById('tab_resume');
            if (tabResume) tabResume.classList.add('active');
            if (typeof renderStudentResumeView === 'function') renderStudentResumeView();
        }
    }
}

function moveMonth(offset) { calMonth += offset; if(calMonth > 11) { calYear++; calMonth = 0; } if(calMonth < 0) { calYear--; calMonth = 11; } renderCalendar(); }

function getCalendarSwipeParts() {
    const viewArea = document.getElementById('viewArea');
    if (!viewArea) return [];
    return Array.from(viewArea.querySelectorAll('.calendar-ctrl, .calendar-grid'));
}

function moveMonthAnimated(offset) {
    if (window.innerWidth > 768) {
        moveMonth(offset);
        return;
    }
    const parts = getCalendarSwipeParts();
    if (!parts.length) {
        moveMonth(offset);
        return;
    }
    const outX = offset > 0 ? -36 : 36;
    parts.forEach(el => {
        el.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
        el.style.transform = `translateX(${outX}px)`;
        el.style.opacity = '0';
    });
    setTimeout(() => {
        moveMonth(offset);
        const newParts = getCalendarSwipeParts();
        const inX = offset > 0 ? 36 : -36;
        newParts.forEach(el => {
            el.style.transition = 'none';
            el.style.transform = `translateX(${inX}px)`;
            el.style.opacity = '0';
        });
        requestAnimationFrame(() => {
            newParts.forEach(el => {
                el.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
                el.style.transform = 'translateX(0)';
                el.style.opacity = '1';
            });
            setTimeout(() => {
                newParts.forEach(el => {
                    el.style.transition = '';
                    el.style.transform = '';
                    el.style.opacity = '';
                });
            }, 240);
        });
    }, 170);
}

let calendarTouchStartX = 0;
let calendarTouchStartY = 0;
let calendarTouchActive = false;

function initCalendarSwipe() {
    const viewArea = document.getElementById('viewArea');
    if (!viewArea || viewArea.dataset.calendarSwipeBound === '1') return;
    viewArea.dataset.calendarSwipeBound = '1';

    viewArea.addEventListener('touchstart', (e) => {
        if (!viewArea.querySelector('.calendar-grid') || window.innerWidth > 768) return;
        calendarTouchActive = true;
        calendarTouchStartX = e.touches[0].screenX;
        calendarTouchStartY = e.touches[0].screenY;
    }, { passive: true });

    viewArea.addEventListener('touchend', (e) => {
        if (!calendarTouchActive || !viewArea.querySelector('.calendar-grid') || window.innerWidth > 768) return;
        calendarTouchActive = false;
        const deltaX = e.changedTouches[0].screenX - calendarTouchStartX;
        const deltaY = e.changedTouches[0].screenY - calendarTouchStartY;
        if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
        moveMonthAnimated(deltaX < 0 ? 1 : -1);
    }, { passive: true });

    viewArea.addEventListener('touchcancel', () => { calendarTouchActive = false; }, { passive: true });
}

async function renderCalendar() {
    const viewArea = document.getElementById('viewArea');
    if (rawTimetable.length === 0) { viewArea.innerHTML = "<p style='text-align:center; padding:50px;'>데이터 로드 중...</p>"; return; }
    
    globalFirstDateMap = {};
    globalLastDateMap = {};
    const allBusinessDays = new Set();
    const tempSubDates = {}; 

    rawTimetable.forEach(r => {
        const sub = r.능력단위 ? String(r.능력단위).trim() : "";
        const checkSub = String(r.교과목 || "").trim();
        const period = String(r.교시).trim();

        if (period !== "점심" && isActualSubject(checkSub)) {
            const d = getFixDate(r.날짜);
            allBusinessDays.add(d);
            if (sub !== "") {
                if (!tempSubDates[sub]) tempSubDates[sub] = new Set();
                tempSubDates[sub].add(d);
                if (!globalLastDateMap[sub] || d > globalLastDateMap[sub]) { globalLastDateMap[sub] = d; }
            }
        }
    });
    globalSortedBusinessDays = Array.from(allBusinessDays).sort();
    
    const targetStartDay = globalSortedBusinessDays.length >= 11 ? globalSortedBusinessDays[10] : "0000-00-00";
    for (const sub in tempSubDates) {
        const sortedDates = Array.from(tempSubDates[sub]).sort();
        const effectiveDates = sortedDates.filter(d => d >= targetStartDay);
        globalFirstDateMap[sub] = effectiveDates.length > 0 ? effectiveDates[0] : sortedDates[0];
    }

    const lastDateMap = globalLastDateMap;

    // 📍 달력 상단 관리자용 컨트롤 패널 완전 삭제
    let calHtml = `
        <div class="calendar-ctrl">
            <button class="ctrl-btn" onclick="moveMonth(-1)">◀ 이전 달</button>
            <div style='font-size:20px;'><strong>${calYear}년 ${calMonth + 1}월</strong></div>
            <button class="ctrl-btn" onclick="moveMonth(1)">다음 달 ▶</button>
        </div>
        <div class="calendar-grid">`;

    const days = ["일", "월", "화", "수", "목", "금", "토"];
    days.forEach(d => calHtml += `<div style="text-align:center; font-weight:bold; background:#eee; padding:5px;">${d}</div>`);
    
    const firstDay = new Date(calYear, calMonth, 1).getDay(), lastDate = new Date(calYear, calMonth + 1, 0).getDate(), prevLastDate = new Date(calYear, calMonth, 0).getDate();
    const firstDateData = new Date(getFixDate(rawTimetable[0].날짜)), lastDateData = new Date(getFixDate(rawTimetable[rawTimetable.length - 1].날짜));
    const startSunday = new Date(firstDateData); startSunday.setDate(firstDateData.getDate() - firstDateData.getDay()); startSunday.setHours(0,0,0,0);
    const endSunday = new Date(lastDateData); endSunday.setDate(lastDateData.getDate() - lastDateData.getDay()); endSunday.setHours(0,0,0,0);
    
    for(let i = firstDay - 1; i >= 0; i--) { calHtml += `<div class="calendar-day" style="opacity: 0.4; background: #f9f9f9;"><div class="day-num">${prevLastDate - i}</div></div>`; }
    
    for(let d=1; d<=lastDate; d++) {
    const currentDate = new Date(calYear, calMonth, d);
    const targetDate = `${calYear}-${String(calMonth+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayType = currentDate.getDay();
    
    const nowKst = new Date();
    const offset = nowKst.getTimezoneOffset() * 60000;
    const todayStr = new Date(nowKst - offset).toISOString().split('T')[0];
    const isToday = (targetDate === todayStr);

    const isEvalDay = evaluationDates[calendarSubMode] && evaluationDates[calendarSubMode][targetDate];
    
    let dayStyle = "";
    if (isToday) dayStyle += `border: 3px solid #27ae60 !important; box-shadow: 0 0 8px rgba(39, 174, 96, 0.4); z-index: 10; `;
    if (isEvalDay) dayStyle += `background-color: #fffde7 !important; border: 2px solid #f1c40f !important; `;
    
    const evalBadge = isEvalDay ? `<span class="eval-day-badge" title="평가일">평가</span>` : "";
    const classNames = `calendar-day ${dayType === 0 ? 'sun' : dayType === 6 ? 'sat' : ''}`;
        let weekBadge = ""; if(dayType === 0) { currentDate.setHours(0,0,0,0); if(currentDate >= startSunday && currentDate <= endSunday) { const weekNum = Math.floor((currentDate - startSunday) / (1000 * 60 * 60 * 24 * 7)) + 1; weekBadge = `<div style="font-size:10px; color:#27ae60; background:#e8f5e9; padding:2px 4px; border-radius:3px; display:inline-block; margin-left:5px;">(${weekNum}주차)</div>`; } }
        
        const { amData, pmData, holidays } = getCalendarDaySubjectData(targetDate);
        const hasClassToday = Object.keys(amData).length > 0 || Object.keys(pmData).length > 0;

        let attBadge = "";
        if (selectedStudentName && fullAttendanceData[targetDate]?.[selectedStudentName]) {
            const st = fullAttendanceData[targetDate][selectedStudentName].status || '출석';
            attBadge = buildPersonalAttBadge(st, true);
        }
        
        let dayContent = "";
        const amKeys = Object.keys(amData);
        const pmKeys = Object.keys(pmData);
        
        const isSame = (amKeys.length > 0 && amKeys.length === pmKeys.length && amKeys.every(k => pmKeys.includes(k)));

        const createTag = (s, h, timeLabel) => {
            const isLastDay = (lastDateMap[s] === targetDate);
            const lastStatus = isLastDay ? ` <span style="color:#c0392b; font-weight:bold;">[종료]</span>` : "";
            return `<span class="subject-tag" style="cursor:pointer; font-weight:bold; border:1px solid #3498db; margin-top:3px;" 
                      onclick="openSubjectFromCalendar('${s}', '${calendarSubMode}', '${targetDate}')">
                      🔍 ${timeLabel}${s} <span style="color:#e74c3c;">${h}h</span>${lastStatus}
                    </span>`;
        };

        if (isSame) {
            amKeys.forEach(s => dayContent += createTag(s, amData[s] + pmData[s], "[전일] "));
        } else {
            amKeys.forEach(s => dayContent += createTag(s, amData[s], "[오전] "));
            pmKeys.forEach(s => dayContent += createTag(s, pmData[s], "[오후] "));
        }
        
        // 📍 [수리] 휴일 태그를 dayContent(모바일 숨김 영역)에서 분리하여 독자 생존시킴
        let holidayHtml = Array.from(holidays).map(h => `<span class="holiday-tag">${h}</span>`).join('');

        let hasSubject = hasClassToday;
        let mobileBtnHtml = hasSubject ? `<button type="button" class="mobile-only-btn" onclick="showMobileCalendarDaySubjects('${targetDate}', event)">과목보기</button>` : "";
        let hasSpecialMsg = false;
        if (hasClassToday) {
            const evalDatesObj = evaluationDates[calendarSubMode] || {};
            const todaySubs = new Set([...Object.keys(amData), ...Object.keys(pmData)]);
            
            todaySubs.forEach(sub => {
                if (globalFirstDateMap[sub] === targetDate) {
                    hasSpecialMsg = true;
                }
            });
            if (evalDatesObj[targetDate]) {
                hasSpecialMsg = true;
            }
            const currentIdx = globalSortedBusinessDays.indexOf(targetDate);
            if (currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
                const nextBDate = globalSortedBusinessDays[currentIdx + 1];
                if (evalDatesObj[nextBDate]) {
                    hasSpecialMsg = true;
                }
            }
        }
        
const btnIcon = hasSpecialMsg ? "⭐" : "📜";
        const logBtn = ""; // 📍 PC 화면 훈련일지 버튼 물리적 철거 완료
        const scrollBtn = hasClassToday ? `<button onclick="openSmartMemo('${targetDate}', event)" style="background:none; border:none; outline:none; cursor:pointer; font-size:16px; padding:0; margin:0; line-height:1; transition:transform 0.1s;" title="스마트 지능형 멘트 생성" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" onblur="this.style.transform='scale(1)'">${btnIcon}</button>` : "";

        // 📍 학생용이므로 평가일 수동 등록 함수(onclick) 완전 철거
        calHtml += `<div class="${classNames}" style="${dayStyle} display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                <div class="calendar-day-header" style="cursor:pointer;" onclick="toggleEvaluationDate('${targetDate}')">
                    <div class="day-header-left">
                        <span class="day-num-core">${d}</span>
                        ${attBadge}${weekBadge}
                    </div>
                    ${evalBadge}
                </div>
                <div class="mobile-hide-icons">${logBtn}${scrollBtn}</div>
            </div>
            <div style="flex: 1; display:flex; flex-direction:column; justify-content:flex-end;">
                <div class="desktop-only-tags">${dayContent}</div>
                ${holidayHtml}                 ${mobileBtnHtml}
            </div>
        </div>`;
}
    const nextCells = (firstDay + lastDate) % 7 === 0 ? 0 : 7 - ((firstDay + lastDate) % 7);
    for(let i = 1; i <= nextCells; i++) { calHtml += `<div class="calendar-day" style="opacity: 0.4; background: #f9f9f9;"><div class="day-num">${i}</div></div>`; }
    calHtml += `</div>`; viewArea.innerHTML = calHtml;
    
    updateEvalBanner();
    initCalendarSwipe();
}

async function renderWeekly() { 
    const viewArea = document.getElementById('viewArea'); 
    if (rawTimetable.length === 0) return;
    
    const manualData = getCachedManualData();

    const weeklyData = {}; 
    const allDatesArr = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== "날짜미상").sort();
    const firstDate = new Date(allDatesArr[0]); 
    const startSunday = new Date(firstDate); 
    startSunday.setDate(firstDate.getDate() - firstDate.getDay()); 
    startSunday.setHours(0,0,0,0);

    let totalAllWeeksTime = 0;
    const allUniqueSubjects = new Set();
    const globalSubLastDateMap = {};

    rawTimetable.forEach(row => {
        const sub = row.능력단위 ? String(row.능력단위).trim() : "";
        if(String(row.교시).trim() !== "점심" && sub !== "" && isActualSubject(sub)) {
            const currentDate = new Date(getFixDate(row.날짜)); 
            currentDate.setHours(0,0,0,0);
            const week = Math.floor(Math.floor((currentDate - startSunday) / (1000 * 60 * 60 * 24)) / 7) + 1;
            if(!weeklyData[week]) { 
                const wStart = new Date(startSunday); wStart.setDate(startSunday.getDate() + (week - 1) * 7); 
                const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 6); 
                weeklyData[week] = { totalHours: 0, subjectMap: {}, period: `${wStart.getMonth()+1}.${wStart.getDate()}~${wEnd.getMonth()+1}.${wEnd.getDate()}`, dates: new Set() }; 
            }
            weeklyData[week].totalHours++; 
            weeklyData[week].subjectMap[sub] = (weeklyData[week].subjectMap[sub] || 0) + 1;
            weeklyData[week].dates.add(getFixDate(row.날짜));
            totalAllWeeksTime++;
            allUniqueSubjects.add(sub);

            const d = getFixDate(row.날짜);
            if (!globalSubLastDateMap[sub] || d > globalSubLastDateMap[sub]) {
                globalSubLastDateMap[sub] = d;
            }
        }
    });

    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 📍 주차별 상단 관리자용 컨트롤 패널 완전 삭제
    let html = `
        <div style="margin-bottom:15px; font-weight:bold; color:#2c3e50; text-align:center;">💡 과목명을 클릭하면 상세 출석부가 열립니다. (ESC: 닫기 / Tab: 다음 과목)</div>`;

    html += `<table class="attendance-table weekly-view-table" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                <colgroup><col style="width: 15%;"><col style="width: 70%;"><col style="width: 15%;"></colgroup>
                <thead>
                    <tr style="background:#2c3e50; color:white;">
                        <th>주차 (총 ${sortedWeeks.length}주)</th>
                        <th>진행 능력단위 (총 ${allUniqueSubjects.size}개)</th>
                        <th>합계 (총 ${totalAllWeeksTime}h)</th>
                    </tr>
                </thead>
                <tbody>`;

    sortedWeeks.forEach(w => { 
        const d = weeklyData[w]; 
        const dateList = Array.from(d.dates).join(','); 
        const subTexts = Object.entries(d.subjectMap).sort((a, b) => a[0].localeCompare(b[0], 'ko')).map(([n, h]) => {
            
            const isLastWeekForSub = d.dates.has(globalSubLastDateMap[n]);
            const lastBadge = isLastWeekForSub ? `<b style="color:#ff1744; text-shadow:0 0 4px rgba(255,255,255,0.7); font-size:11.5px; margin-left:3px;">(마지막)</b>` : "";
            
            let makeupBadge = "";
            if (isLastWeekForSub) {
                let hasMakeup = false;
                const escapedSub = n.replace(/[\.\#\$\/\[\]]/g, "_");
                Object.values(manualData).forEach(user => {
                    if (user[`makeup_${escapedSub}`] > 0) hasMakeup = true;
                });
                if (hasMakeup) {
                    makeupBadge = `<b style="color:#ffd600; text-shadow: 1px 1px 1px #000; font-size:11.5px; margin-left:3px;">(보강)</b>`;
                }
            }

            const completedClass = isSubjectAttendanceCompleted(n) ? ' weekly-subject-completed' : '';

            return `<span class="weekly-subject-link${completedClass}" onclick="showWeeklySubjectDetail('${n}', '${dateList}', '${w}', this)">
                <span class="sub-name">${n}</span><span class="sub-hour">(${h}h)</span>${lastBadge}${makeupBadge}
            </span>`;
        }).join(''); 

        html += `<tr style="border-bottom: 1px solid #ddd;">
                    <td style="background:#f8f9fa;"><strong>${w}주</strong><br><small>${d.period}</small></td>
                    <td style="text-align:left; padding:12px 15px;">${subTexts}</td>
                    <td style="color:#e67e22; font-weight:bold;">${d.totalHours}h</td>
                 </tr>
                 <tr id="weeklyDetailRow_${w}" style="display:none;">
                    <td colspan="3" id="weeklyDetailArea_${w}" style="padding:15px; background-color:#f1f4f7; border: 1px solid #3498db;"></td>
                 </tr>`;
    });
    html += `</tbody></table>`;
    viewArea.innerHTML = html;
}

async function renderSubjectList() {
    cleanupPortaledDetailViews();
    const area = document.getElementById('subjectDashboardArea');
    const dashboardTitle = document.getElementById('dashboardTitle'); 
    if(!rawTimetable.length) return;

    const targetBaseList = ncsList; // ncs 기어 고정
    
    let totalAllMin = 0;

    const manualData = getCachedManualData();

    let summary = targetBaseList.map(item => {
        const subData = rawTimetable.filter(r => String(r.능력단위 || "").trim() === item);
        
        const subDates = [...new Set(subData.map(r => getFixDate(r.날짜)))].filter(d => d && d !== "날짜미상");
        const isCompleted = isSubjectAttendanceCompleted(item);
        const completeBadge = isCompleted ? `<span class="subject-complete-badge">(완료)</span>` : "";

        let studentRateBadge = "";
        let makeupBadge = "";
        if (selectedStudentName) {
            const stats = getStudentSubjectStats(selectedStudentName, item, manualData);
            if (stats.percent !== null) {
                const projClass = stats.percent < 75 ? ' subject-rate-low' : ' subject-rate-ok';
                const actClass = stats.actualPercent < 75 ? ' subject-rate-low' : ' subject-rate-ok';
                studentRateBadge = `<span class="subject-rate-badge subject-rate-proj${projClass}" title="남은 일수 전부 출석 가정">${stats.percent}%</span><span class="subject-rate-badge subject-rate-actual${actClass}" title="현재까지 실제 출석률">실 ${stats.actualPercent}%</span>`;
            }
            if (stats.makeupMin > 0) {
                makeupBadge = `<span class="subject-makeup-badge">(보강)</span>`;
            }
        }
       
        // 📍 [수리] 교과목명 괄호 씌우기 로직 폐기 및 [NCS코드] 정규식 은폐 -> 순수 능력단위명만 추출
        let displayTitle = item.replace(/\[.*?\]/g, '').trim();
       
        const dates = subData.map(r => getFixDate(r.날짜)).sort();
        let min = 0;
        subData.forEach(r => { 
            if(String(r.교시).trim() !== "점심") {
                min += 60; 
                totalAllMin += 60; 
            }
        });
        
        return { 
            name: item, 
            displayTitle: displayTitle, 
            completeBadge: completeBadge, 
            studentRateBadge: studentRateBadge,
            makeupBadge: makeupBadge,
            isCompleted: isCompleted, 
            start: dates[0] || "미상", 
            end: dates[dates.length-1] || "미상", 
            min: min, 
            hour: (min/60).toFixed(1) 
        };
    });

    const totalAllHour = (totalAllMin / 60).toFixed(1);
    const totalCount = summary.length;
    const titleText = "📜 능력단위 상세 목록";
    
    dashboardTitle.innerHTML = `${titleText} <span style="margin-left:15px; font-size:13px; color:#666; font-weight:normal;">(총 <b style="color:#3498db;">${totalCount}개</b> 단위 / 총합: <b style="color:#e67e22;">${totalAllMin.toLocaleString()}분</b> / <b style="color:#27ae60;">${totalAllHour}h</b>)</span>`;

    summary.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, 'ko'));
    rebuildNcsSubjectNumberMap();
    
    let html = "";
    summary.forEach((item, idx) => {
        const statusIcon = item.isCompleted ? '✅' : '📜';
        const completedClass = item.isCompleted ? ' subject-completed' : ' subject-pending';
        const listNum = getNcsSubjectListNumber(item.name) || (idx + 1);
        
        html += `<div class="subject-dashboard-item${completedClass}">
    <div class="subject-summary-bar${completedClass}" data-sub-name="${encodeURIComponent(item.name)}" onclick="toggleDetail('detailBox_${idx}', '${item.name.replace(/'/g, "\\'")}')">
        <div class="summary-name">
            <span class="summary-name-text"><span class="subject-list-num">${listNum}</span> ${statusIcon} ${item.displayTitle}</span>
            <span class="summary-badges">${item.studentRateBadge}${item.completeBadge}${item.makeupBadge}</span>
        </div>
        <div class="summary-period">📅 ${item.start} ~ ${item.end}</div>
                <div class="summary-total">⏱️ ${item.min}분</div>
                <div class="summary-total">📊 ${item.hour}h</div>
            </div>
            <div id="detailBox_${idx}" class="detail-view">
                <div class="detail-view-inner">
                    <div class="detail-view-header">
                        <h3 class="detail-view-title">${item.displayTitle} 출결</h3>
                        <button type="button" class="detail-view-close" onclick="event.stopPropagation(); closeDetailView('detailBox_${idx}')" aria-label="닫기">✕</button>
                    </div>
                    <div class="detail-view-legend">
                        <span><i style="background:#fff176;border:1px solid #f1c40f;"></i>지각/조퇴</span>
                        <span><i style="background:#f3e5f5;border:1px solid #9c27b0;"></i>외출</span>
                        <span><i style="background:#ffebee;border:1px solid #e74c3c;"></i>결석</span>
                        <span><i style="background:#e3f2fd;border:1px solid #3498db;"></i>공가/휴가</span>
                        <span><i style="background:#e0e0e0;border:1px solid #bdc3c7;"></i>탈락</span>
                    </div>
                    <div class="scroll-box"><table class="attendance-table" id="table_${idx}"><thead id="head_${idx}"></thead><tbody id="body_${idx}"></tbody></table></div>
                    <div class="detail-view-footer">
                        <button type="button" class="detail-view-confirm" onclick="event.stopPropagation(); closeDetailView('detailBox_${idx}')">확인</button>
                    </div>
                </div>
            </div>
        </div>`;
    });
    area.innerHTML = html;
}

async function toggleDetail(boxId, subName) {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (box.style.display === 'block') {
        closeDetailView(boxId);
    } else {
        await showSubjectDetail(boxId, subName);
    }
}

async function loadDetailInto(selectedSub, headId, bodyId, mode = 'real') {
    suppressDetailOutsideCloseUntil = Date.now() + 500;
    const cleanSelected = String(selectedSub).replace(/\s+/g, "");
    
    const dates = [...new Set(rawTimetable.filter(r => {
        const rowVal = String(r.능력단위 || ""); // ncs 고정
        return String(rowVal).replace(/\s+/g, "") === cleanSelected;
    }).map(r => getFixDate(r.날짜)))].sort();
    
    const manualData = getCachedManualData();
    
    const namesToShow = getDisplayStudentNames();
    if (namesToShow.length === 0) {
        const thead = document.getElementById(headId), tbody = document.getElementById(bodyId);
        if (tbody) tbody.innerHTML = `<tr><td colspan="20" style="padding:30px; text-align:center; color:#e67e22; font-weight:bold;">상단에서 본인 이름을 먼저 선택해주세요.</td></tr>`;
        return;
    }

    const studentResults = {}, masterSchedule = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    namesToShow.forEach(name => studentResults[name] = { dates: {}, totalMin: 0, makeupMin: 0 });

    dates.forEach(date => {
        const shortDateStr = date.substring(2).replace(/-/g, '.'); 
        dateWithDay[date] = `<span style="display:inline-block; white-space:nowrap; font-size:10.5px; letter-spacing:-0.5px; line-height:1.2;">${shortDateStr}</span><br><span style="display:inline-block; white-space:nowrap; font-size:10px; line-height:1.2;">(${weekDays[new Date(date).getDay()]})</span>`;
        
        masterSchedule[date] = calculateParticipation(date, "09:00", "17:30", selectedSub, "", "");
        
        namesToShow.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            let calc = { am: 0, pm: 0, isFuture: !fullAttendanceData[date] }; 

            if (att && att.inTime && att.outTime) {
                calc = calculateParticipation(date, att.inTime, att.outTime, selectedSub, att.leaveTime || "", att.returnTime || "");
                calc.isFuture = false;
            }
            if (manualData[name] && manualData[name][date]) {
                if (manualData[name][date].am !== undefined) { calc.am = manualData[name][date].am; calc.am_manual = true; }
                if (manualData[name][date].pm !== undefined) { calc.pm = manualData[name][date].pm; calc.pm_manual = true; }
                calc.isFuture = false;
            }
            const escapedSubForLoad = selectedSub.replace(/[\.\#\$\/\[\]]/g, "_");
            if (manualData[name] && manualData[name][`makeup_${escapedSubForLoad}`]) {
                studentResults[name].makeupMin = parseInt(manualData[name][`makeup_${escapedSubForLoad}`]) || 0;
            }
            studentResults[name].dates[date] = calc; 
        });
    });
    renderFinalTable(dates, studentResults, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode, namesToShow);
}

function ensureMobileAttVerticalContainer(headId) {
    const thead = document.getElementById(headId);
    const scrollBox = thead?.closest('.scroll-box');
    if (!scrollBox) return null;
    let el = scrollBox.querySelector('.mobile-att-vertical');
    if (!el) {
        el = document.createElement('div');
        el.className = 'mobile-att-vertical';
        scrollBox.insertBefore(el, scrollBox.firstChild);
    }
    return el;
}

function getMobileAttDayCellState(name, date, res, masterSchedule, mode) {
    const attInfo = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : {};
    let amV = res.am;
    let pmV = res.pm;
    let cellClass = '';
    const isDropout = dropoutData[name] && (date >= dropoutData[name]);

    if (isDropout) {
        amV = 0;
        pmV = 0;
        cellClass = 'status-dropout';
    } else if (mode === 'sim' && res.isFuture) {
        amV = masterSchedule[date].am;
        pmV = masterSchedule[date].pm;
        cellClass = 'status-special';
    } else {
        const st = attInfo.status || '';
        const inT = attInfo.inTime || '00:00:00';
        if (st.includes('지각') || st.includes('조퇴') || (parseInt(inT.replace(/:/g, '')) > 90000 && parseInt(inT.replace(/:/g, '')) < 130000)) {
            cellClass = 'status-late';
        } else if (st.includes('외출')) {
            cellClass = 'status-out';
        } else if (st.includes('결석') || st === '미편입') {
            cellClass = 'status-absent';
        } else if (st.includes('휴가') || st.includes('공가') || st.includes('기타')) {
            cellClass = 'status-special';
        }
    }

    return {
        schedMin: masterSchedule[date].am + masterSchedule[date].pm,
        amV: isDropout ? '-' : amV,
        pmV: isDropout ? '-' : pmV,
        partMin: isDropout ? '-' : ((Number(amV) || 0) + (Number(pmV) || 0)),
        cellClass,
        statusText: isDropout ? '중도탈락' : (attInfo.status || (res.isFuture ? '미등록' : '출석')),
        attBadge: buildPersonalAttBadge(isDropout ? '탈락' : (attInfo.status || (res.isFuture ? '미등록' : '출석')))
    };
}

function renderMobileDetailVertical(dates, results, masterSchedule, headId, mode, displayNames, selectedSub) {
    const container = ensureMobileAttVerticalContainer(headId);
    const parentBox = document.getElementById(headId)?.closest('.detail-view');
    if (!container) return;

    if (!parentBox || window.innerWidth > 768) {
        container.innerHTML = '';
        return;
    }

    const name = displayNames[0];
    if (!name) {
        container.innerHTML = '<div class="mobile-att-empty">상단에서 본인 이름을 먼저 선택해주세요.</div>';
        return;
    }

    let masterTotal = 0;
    dates.forEach(d => { masterTotal += (masterSchedule[d].am + masterSchedule[d].pm); });

    let rowTotalMin = 0;
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    let rowsHtml = '';

    dates.forEach(date => {
        const res = results[name].dates[date];
        const dayState = getMobileAttDayCellState(name, date, res, masterSchedule, mode);
        if (dayState.partMin !== '-') rowTotalMin += Number(dayState.partMin) || 0;

        const dObj = new Date(`${date}T12:00:00`);
        const weekIdx = dObj.getDay();
        const weekLabel = weekDays[weekIdx];
        const weekClass = weekIdx === 0 ? ' is-sun' : (weekIdx === 6 ? ' is-sat' : '');
        const dateNum = date.substring(2).replace(/-/g, '.');
        const isTarget = date === window.lastSelectedDate;
        const subjectLastDay = globalLastDateMap[selectedSub] || dates[dates.length - 1];
        const isLastDay = date === subjectLastDay;
        const lastBadge = isLastDay ? '<span class="mobile-att-last-badge">마지막</span>' : '';
        const partShort = dayState.partMin !== '-' && dayState.schedMin > 0 && dayState.partMin < dayState.schedMin;

        rowsHtml += `<tr class="mobile-att-row ${dayState.cellClass}${isTarget ? ' is-target' : ''}${isLastDay ? ' is-last-day' : ''}">
            <td class="mobile-att-date-cell mobile-att-row-head${weekClass}${isTarget ? ' is-target' : ''}">
                <div class="mobile-att-date-line">
                    <span class="mobile-att-date-num">${dateNum}</span>${lastBadge}
                </div>
                <span class="mobile-att-date-week">${weekLabel}</span>
            </td>
            <td class="mobile-att-status">${dayState.attBadge}</td>
            <td class="mobile-att-part${dayState.partMin === '-' ? ' is-muted' : ''}${partShort ? ' is-short' : ''}">${dayState.partMin}</td>
            <td class="mobile-att-sched">${dayState.schedMin}</td>
        </tr>`;
    });

    const makeupMin = results[name].makeupMin || 0;
    const finalTotalMin = rowTotalMin + makeupMin;
    const percent = masterTotal > 0 ? ((finalTotalMin / masterTotal) * 100).toFixed(1) : '0.0';
    const subjectLastDate = dates[dates.length - 1];
    const isSubjectDropout = dropoutData[name] && (dropoutData[name] <= subjectLastDate);
    const rateClass = isSubjectDropout ? '' : (parseFloat(percent) < 75 ? ' rate-low' : ' rate-safe');

    const modeNote = mode === 'sim'
        ? '<div class="mobile-att-mode-note">🔮 남은 일수 전부 출석 가정 모드</div>'
        : '';

    const masterHour = (masterTotal / 60).toFixed(1);
    const { projectedPercent } = getProjectedSubjectPercentFromResults(
        name, dates, results, masterSchedule, makeupMin
    );
    const isCompleted = isSubjectAttendanceCompleted(selectedSub);
    const completion = getSubjectCompletionStatus(projectedPercent, isSubjectDropout, isCompleted);
    const makeupBlock = makeupMin > 0
        ? `<span class="mobile-att-part-sub">+보강 ${makeupMin}</span>`
        : '';
    const totalRowHtml = `<tr class="mobile-att-total-row">
            <td class="mobile-att-date-cell mobile-att-row-head">
                <span class="mobile-att-date-num">합계</span>
                <span class="mobile-att-date-week mobile-att-total-proj-mini">${isCompleted ? '종료' : '예상'} ${projectedPercent}%</span>
            </td>
            <td class="mobile-att-status">
                <span class="mobile-att-completion-badge ${completion.cls}" title="${completion.title}">${completion.text}</span>
            </td>
            <td class="mobile-att-part mobile-att-total-part">
                <strong>${rowTotalMin}</strong>${makeupBlock}
            </td>
            <td class="mobile-att-sched mobile-att-total-sched">${masterTotal}</td>
        </tr>`;

    container.innerHTML = `<div class="mobile-att-sticky-block">${modeNote}
        <div class="mobile-att-summary">
            <div class="mobile-att-summary-item mobile-att-summary-rate${rateClass}"><span>출석률</span><strong>${percent}%</strong></div>
            <div class="mobile-att-summary-item mobile-att-summary-total"><span>총시간</span><strong>${masterHour}h</strong></div>
            <div class="mobile-att-summary-item"><span>누계(분)</span><strong>${finalTotalMin}</strong></div>
            <div class="mobile-att-summary-item"><span>보강(분)</span><strong>${makeupMin}</strong></div>
        </div>
    </div>
    <div class="mobile-att-scroll-list">
        <table class="mobile-att-table">
            <thead>
                <tr>
                    <th class="mobile-att-date-head">날짜</th>
                    <th class="mobile-att-status-head">출결</th>
                    <th class="mobile-att-part-head"><span class="mobile-att-th-main">참여</span><span class="mobile-att-th-unit">(분)</span></th>
                    <th class="mobile-att-sched-head">수업<span class="mobile-att-th-unit">(분)</span></th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>${totalRowHtml}</tfoot>
        </table>
    </div>`;
}

function renderFinalTable(dates, results, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode, namesToShow) {
    const displayNames = namesToShow || getDisplayStudentNames();
    const thead = document.getElementById(headId), tbody = document.getElementById(bodyId);
    if (!thead || !tbody) {
        if (window.innerWidth <= 768 && headId.startsWith('head_')) {
            const box = resolveDetailBoxElement(`detailBox_${headId.split('_')[1]}`);
            if (box?.style.display === 'block') setDetailScrollHint(box, 'fallback');
        }
        return;
    }

    if (headId !== 'pHead') { 
        const parentBox = thead.closest('.detail-view');
        if (parentBox) {
            const legendArea = parentBox.querySelector('.detail-view-legend');
            if (legendArea) {
                const safeSub = escapeSubForJsAttr(selectedSub);
                const btnHtml = `<button type="button" class="ctrl-btn detail-sim-btn detail-remain-info-btn" onclick="event.stopPropagation(); showRemainingAttendanceInfo('${safeSub}'); return false;">📋 남은 출석 정보</button>`;
                const existingBtn = legendArea.querySelector('.detail-remain-info-btn');
                if (existingBtn) existingBtn.remove();
                legendArea.insertAdjacentHTML('beforeend', btnHtml);
            }
        } else if (headId === 'modalHead') {
            const actionArea = document.getElementById('modalActionArea');
            if (actionArea) {
                const safeSub = escapeSubForJsAttr(selectedSub);
                const btnHtml = `<button class="ctrl-btn detail-remain-info-btn" onclick="showRemainingAttendanceInfo('${safeSub}')" style="background:#2980b9; font-size:11px; padding:7px 12px; margin-right:10px; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">📋 남은 출석 정보</button>`;
                const existingBtn = actionArea.querySelector('.detail-remain-info-btn');
                if (existingBtn) existingBtn.remove();
                actionArea.insertAdjacentHTML('afterbegin', btnHtml);
            }
        }
    }

    let h1 = `<tr>
        <th rowspan="2" class="sticky-no" style="width: 30px;">No</th>
        <th rowspan="2" class="sticky-col" style="width: 46px !important; min-width: 46px !important; max-width: 46px !important; font-size: 11px; padding: 2px !important;">훈련생명</th>`;
    let h2 = `<tr>`;
    
    dates.forEach(d => { 
        const isTarget = (d === window.lastSelectedDate);
        const headStyle = isTarget ? `background:#fff3e0; border:2px solid #e67e22 !important; color:#e67e22;` : `background:#f8f9fa;`;
        const subStyle = isTarget ? `background:#fffef0; font-weight:bold;` : ``;

        h1 += `<th colspan="2" style="${headStyle}">${dateWithDay[d]}</th>`; 
        h2 += `<th style="${subStyle}">오전</th><th style="${subStyle}">오후</th>`; 
    });
    
    h1 += `<th rowspan="2" style="background:#e3f2fd; width: 35px !important; min-width: 35px !important; max-width: 35px !important; font-size: 10.5px; line-height: 1.2; padding: 2px !important;">보강<br>(분)</th>`;
    h1 += `<th colspan="2" style="font-size: 11px;">누계</th>
           <th rowspan="2" style="width: 40px !important; min-width: 40px !important; max-width: 40px !important; font-size: 11px; letter-spacing: -0.5px; padding: 2px !important;">출석률</th></tr>`; 
    h2 += `<th style="width: 35px; font-size: 11px;">분</th><th style="width: 45px; font-size: 11px;">시간</th></tr>`;
    thead.innerHTML = h1 + h2;

    let masterTotal = 0;
    dates.forEach(d => masterTotal += (masterSchedule[d].am + masterSchedule[d].pm));

    let masterRowHtml = `<tr style="background:#f1f8e9; font-weight:bold; color:#2e7d32;">
        <td class="sticky-no">-</td>
        <td class="sticky-col" style="padding: 0 !important; width: 46px !important; min-width: 46px !important; max-width: 46px !important; overflow: hidden;">
            <div style="width: 100%; max-width: 46px; overflow: hidden; margin: 0 auto;">
                <span style="font-size: 9px; letter-spacing: -1.5px; white-space: nowrap;">[편성시간]</span>
            </div>
        </td>`;
    dates.forEach(d => {
        masterRowHtml += `<td>${masterSchedule[d].am}</td><td>${masterSchedule[d].pm}</td>`;
    });
    masterRowHtml += `<td style="background:#e8f5e9;">-</td>
        <td style="white-space: nowrap;">${masterTotal}</td>
        <td style="white-space: nowrap;">${(masterTotal/60).toFixed(1)}h</td>
        <td style="color:#2e7d32; font-size: 11px;">100%</td>
    </tr>`;

    let studentHtml = displayNames.map((name, idx) => { 
        let rowTotalMin = 0;
        let dateCells = "";
        
        dates.forEach(d => {
            const res = results[name].dates[d];
            const attInfo = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : {};
            let amV = res.am;
            let pmV = res.pm;
            let cellClass = "";
            const isDropout = dropoutData[name] && (d >= dropoutData[name]);

            if (isDropout) {
                amV = 0; pmV = 0; 
                cellClass = "status-dropout";
            } else if (mode === 'sim' && res.isFuture) {
                amV = masterSchedule[d].am; pmV = masterSchedule[d].pm;
                cellClass = "status-special"; 
            } else {
                const st = attInfo.status || "";
                const inT = attInfo.inTime || "00:00:00";
               
                if (st.includes("지각") || st.includes("조퇴") || (parseInt(inT.replace(/:/g, '')) > 90000 && parseInt(inT.replace(/:/g, '')) < 130000)) {
                    cellClass = "status-late";
                } else if (st.includes("외출")) {
                    cellClass = "status-out";
                } else if (st.includes("결석") || st === "미편입") { 
                    cellClass = "status-absent";
                } else if (st.includes("휴가") || st.includes("공가") || st.includes("기타")) {
                    cellClass = "status-special";
                }
            }

            rowTotalMin += (amV + pmV);
            let dispAm = isDropout ? "-" : amV; 
            let dispPm = isDropout ? "-" : pmV; 

            dateCells += `<td class="${cellClass}">${dispAm}</td><td class="${cellClass}">${dispPm}</td>`;
        });

        const makeupMin = results[name].makeupMin;
        const finalTotalMin = rowTotalMin + makeupMin;
        const percent = ((finalTotalMin / masterTotal) * 100).toFixed(1);
        
        const subjectLastDate = dates[dates.length - 1]; 
        const isSubjectDropout = dropoutData[name] && (dropoutData[name] <= subjectLastDate);

        const dropClass = isSubjectDropout ? "status-dropout" : "";
        const statusStyle = isSubjectDropout ? "" : (percent < 75 ? "color:red;" : "color:green;");
        const makeupBg = isSubjectDropout ? "" : "background:#fff3e0;";
        const totalHourStyle = isSubjectDropout ? "" : "color:#27ae60;";
        
        // 📍 학생용이므로 입력창(input)을 완전히 삭제하고 단순 텍스트로 표시
        const makeupDisplay = makeupMin;

        return `<tr>
            <td class="sticky-no">${idx + 1}</td>
            <td class="sticky-col ${dropClass}" style="width: 46px !important; min-width: 46px !important; max-width: 46px !important; padding: 2px !important; overflow: hidden;">
                <div style="width: 100%; max-width: 46px; overflow: hidden; margin: 0 auto; white-space: nowrap; font-size: 11px; text-overflow: ellipsis;">${name}</div>
            </td>
            ${dateCells}
            <td class="${dropClass}" style="${makeupBg} padding:2px !important; width: 35px !important; min-width: 35px !important; max-width: 35px !important;">${makeupDisplay}</td>
            <td id="totalMin_${name}" class="${dropClass}" style="font-weight:bold; white-space:nowrap;">${finalTotalMin}</td>
            <td id="totalHour_${name}" class="${dropClass}" style="${totalHourStyle} font-weight:bold; white-space:nowrap;">${(finalTotalMin/60).toFixed(1)}h</td>
            <td id="percent_${name}" class="${dropClass}" style="font-weight:bold; font-size:11px; ${statusStyle} padding: 2px !important; width: 40px !important; min-width: 40px !important; max-width: 40px !important;">${percent}%</td>
        </tr>`;
    }).join('');

    tbody.innerHTML = masterRowHtml + studentHtml;
    renderMobileDetailVertical(dates, results, masterSchedule, headId, mode, displayNames, selectedSub);
}

function calculateParticipation(date, inTime, outTime, targetSub, leaveTime, returnTime, modeOverride) {
    if (!inTime || !outTime || inTime.startsWith("00")) return {am:0, pm:0};
    
    const scheds = rawTimetable.filter(r => {
        const rowVal = String(r.능력단위 || ""); // ncs 고정
        return getFixDate(r.날짜) === date && rowVal.replace(/\s+/g, "") === String(targetSub).replace(/\s+/g, "");
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
            if (['1','2','3','4'].includes(p)) am += dur;
            else if (['5','6','7','8'].includes(p)) pm += dur;
        }
    });
    return {am: Math.round(am), pm: Math.round(pm)};
}

async function showWeeklySubjectDetail(subName, dateListStr, weekNum, element) {
    if (!(await requireSelectedStudent())) return;

    const targetDates = dateListStr.split(',').sort();
    const namesToShow = getDisplayStudentNames();
    
    document.querySelectorAll('.weekly-subject-link').forEach(el => el.classList.remove('active-sub'));
    if(element) {
        element.classList.add('active-sub');
        window.currentWeeklyOpenSub = element;
    }

    const detailRow = document.getElementById(`weeklyDetailRow_${weekNum}`);
    const detailArea = document.getElementById(`weeklyDetailArea_${weekNum}`);
    
    detailRow.style.display = 'table-row';
    detailArea.innerHTML = `<div style="padding:15px; text-align:center;">⌛ [${subName}] 데이터를 분석 중입니다...</div>`;

    const manualData = getCachedManualData();
    const studentResults = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    
    let maxWeekMin = 0;
    const weekSchedule = {};
    namesToShow.forEach(name => studentResults[name] = { dates: {}, totalMin: 0 });

    const actualSubjectDates = targetDates.filter(date => {
        return rawTimetable.some(r => {
            const rowVal = String(r.능력단위 || ""); // ncs 고정
            return getFixDate(r.날짜) === date && rowVal.replace(/\s+/g, "") === subName.replace(/\s+/g, "");
        });
    });

    const allSubDates = rawTimetable.filter(r => {
        const rowVal = String(r.능력단위 || ""); // ncs 고정
        return rowVal.replace(/\s+/g, "") === subName.replace(/\s+/g, "");
    }).map(r => getFixDate(r.날짜)).sort();
    const absoluteLastDate = allSubDates[allSubDates.length - 1];

    const isLastWeek = actualSubjectDates.includes(absoluteLastDate);
    const escapedSub = subName.replace(/[\.\#\$\/\[\]]/g, "_"); 

    actualSubjectDates.forEach(date => {
        const shortDateStr = date.substring(2).replace(/-/g, '.'); 
        dateWithDay[date] = `<span style="display:inline-block; white-space:nowrap; font-size:10.5px; letter-spacing:-0.5px; line-height:1.2;">${shortDateStr}</span><br><span style="display:inline-block; white-space:nowrap; font-size:10px; line-height:1.2;">(${weekDays[new Date(date).getDay()]})</span>`;
        
        const daySched = calculateParticipation(date, "09:00", "17:30", subName, "", "");
        const dayTotal = daySched.am + daySched.pm;
        weekSchedule[date] = dayTotal;
        maxWeekMin += dayTotal;

        namesToShow.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            let calc = { am: 0, pm: 0 };
            if (att && att.inTime && att.outTime) {
                calc = calculateParticipation(date, att.inTime, att.outTime, subName, att.leaveTime || "", att.returnTime || "");
            }
            if (manualData[name] && manualData[name][date]) {
                if (manualData[name][date].am !== undefined) calc.am = manualData[name][date].am;
                if (manualData[name][date].pm !== undefined) calc.pm = manualData[name][date].pm;
            }
            if (dropoutData[name] && (date >= dropoutData[name])) {
                calc.am = 0; 
                calc.pm = 0;
            }
            studentResults[name].dates[date] = calc;
            studentResults[name].totalMin += (calc.am + calc.pm);
        });
    });

    const formatMin = (m) => {
            if (m === 0) return "0분";
            const h = Math.floor(m / 60); const min = m % 60;
            return h > 0 ? `${h}시간 ${min}분` : `${min}분`;
        };

        let html = `<div style="background:#fff; padding:15px; border:1px solid #3498db; border-radius:4px; box-shadow: inset 0 0 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="font-weight:bold; color:#2980b9; font-size:16px;">🔍 ${weekNum}주차 상세: ${subName} <span style="margin-left:15px; color:#e67e22; font-size:13px;">(주간 편성: ${formatMin(maxWeekMin)})</span></div>
                <button onclick="document.getElementById('weeklyDetailRow_${weekNum}').style.display='none'" style="padding:3px 8px; cursor:pointer; background:#95a5a6; color:white; border:none; border-radius:3px; font-size:12px;">창 닫기 ✖</button>
            </div>
            <div class="scroll-box" style="max-height: 850px !important;"> 
                <table class="attendance-table" style="background:white;">
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th rowspan="2" class="sticky-no" style="width:40px;">No</th>
                            <th rowspan="2" class="sticky-col" style="width:100px;">훈련생명</th>
                            <th rowspan="2" style="background:#e8f5e9; width:120px; color:#2c3e50;">주간 합계</th>`;
        actualSubjectDates.forEach(d => html += `<th colspan="2">${dateWithDay[d]}<br><small>(${weekSchedule[d]}분)</small></th>`);
        html += `<th rowspan="2" style="background:#e8f5e9; width:80px;">상태</th></tr>
                        <tr style="background:#f8f9fa;">`;
        actualSubjectDates.forEach(() => html += `<th>오전</th><th>오후</th>`);
        html += `</tr></thead><tbody>`;

        const firstDateOfWeekSub = actualSubjectDates.length > 0 ? actualSubjectDates[0] : "9999-99-99";
        let visibleIdx = 1;

        namesToShow.forEach(name => {
            if (dropoutData[name] && dropoutData[name] <= firstDateOfWeekSub) {
                return; 
            }

            const tMin = studentResults[name].totalMin;
            const isSubjectDropout = dropoutData[name] && (dropoutData[name] <= absoluteLastDate);
            const dropClass = isSubjectDropout ? "status-dropout" : "";
            const statusText = isSubjectDropout ? `<span style="font-weight:bold;">탈락</span>` : ((tMin < maxWeekMin) ? `<span style="color:#d35400; font-weight:bold;">부족</span>` : `<span style="color:#27ae60;">이수</span>`);

            let makeupMin = 0;
            if (manualData[name] && manualData[name][`makeup_${escapedSub}`]) {
                makeupMin = parseInt(manualData[name][`makeup_${escapedSub}`]) || 0;
            }
            const makeupColor = isSubjectDropout ? "inherit" : "#e67e22";
            const makeupText = (isLastWeek && makeupMin > 0) ? `<br><span onclick="copyMakeupDetails('${name}', '${escapedSub}', this, event)" style="color:${makeupColor}; font-size:10.5px; font-weight:bold; cursor:pointer; text-decoration:underline;" title="클릭 시 보강 내역 텍스트 복사">(보강 ${formatMin(makeupMin)})</span>` : "";

            html += `<tr class="${!isSubjectDropout && tMin < maxWeekMin ? 'row-insufficient' : ''}">
                <td class="sticky-no ${dropClass}">${visibleIdx++}</td>
                <td class="weekly-std-name sticky-col ${dropClass}">${name}</td>
                <td class="weekly-std-total ${dropClass}">${formatMin(tMin)}${makeupText}</td>`; 
            
            actualSubjectDates.forEach(d => {
            const res = studentResults[name].dates[d] || { am: 0, pm: 0 };
            const isDropout = dropoutData[name] && (d >= dropoutData[name]); 
            
            const dispAm = isDropout ? "-" : res.am;
            const dispPm = isDropout ? "-" : res.pm;
            const dClass = isDropout ? "status-dropout" : "";
            
            html += `<td class="${dClass}">${dispAm}</td><td class="${dClass}">${dispPm}</td>`;
        });
        
        html += `<td class="${dropClass}">${statusText}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    
    detailArea.innerHTML = html;
    detailRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 📍 달력에서 과목 클릭 시 팝업창 띄우기 (학생용)
async function openSubjectFromCalendar(subName, mode, selectedDate) {
    if (!(await requireSelectedStudent())) return;

    // 📍 [신규 회로] 기기가 모바일(768px 이하)일 경우 무거운 팝업 대신 단순 확인 알림창 출력 후 엔진 즉시 정지
    if (window.innerWidth <= 768) {
        const { amData, pmData } = getCalendarDaySubjectData(selectedDate);
        const filteredAm = amData[subName.trim()] ? { [subName.trim()]: amData[subName.trim()] } : {};
        const filteredPm = pmData[subName.trim()] ? { [subName.trim()]: pmData[subName.trim()] } : {};
        openDaySubjectsSheet({ targetDate: selectedDate, amData: filteredAm, pmData: filteredPm });
        return; // 여기서 로직 종료
    }

    const modal = document.getElementById('calendarModal');
    const modalTitle = document.getElementById('modalTitle');
    const actionArea = document.getElementById('modalActionArea');
    
    currentMode = mode; 
    window.lastSelectedDate = selectedDate; 

    modal.style.display = 'flex';
    modalTitle.innerText = `📋 [${selectedStudentName}] ${formatDisplaySubjectName(subName)}`;
    document.getElementById('modalHead').innerHTML = "<tr><td colspan='5'>과목 전체 데이터를 집계 중입니다...</td></tr>";
    document.getElementById('modalBody').innerHTML = "";

    actionArea.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-right:auto;">
            <div style="display: flex; gap: 15px; font-size: 11px; font-weight: bold; align-items: center; flex-wrap: wrap;">
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#fff176; border:1px solid #f1c40f; display:inline-block; margin-right:4px;"></i>지각/조퇴</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#f3e5f5; border:1px solid #9c27b0; display:inline-block; margin-right:4px;"></i>외출</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#ffebee; border:1px solid #e74c3c; display:inline-block; margin-right:4px;"></i>결석/미편입</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e3f2fd; border:1px solid #3498db; display:inline-block; margin-right:4px;"></i>공가/휴가/기타</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e0e0e0; border:1px solid #bdc3c7; display:inline-block; margin-right:4px; margin-left:4px;"></i>중도탈락</span>
            </div>
            <div style="font-size: 11px; font-weight: bold; color:#e67e22;">
                ● 강조된 열: 클릭한 날짜(${selectedDate})
            </div>
        </div>
        `;

    loadDetailInto(subName, 'modalHead', 'modalBody', 'real');
}

function closeCalendarModal(e) {
    if(e.target.id === 'calendarModal') {
        document.getElementById('calendarModal').style.display = 'none';
    }
}

function updateEvalBanner() {
    const banner = document.getElementById('evalDateBanner');
    if (!banner) return;

    if (window.innerWidth <= 768) {
        banner.style.display = 'none';
        return;
    }

    const evalDatesObj = evaluationDates[calendarSubMode] || {};
    const dates = Object.keys(evalDatesObj).sort(); 

    let html = `<h4 style="margin: 0 0 10px 0; color: #d35400; border-bottom: 2px solid #f1c40f; padding-bottom: 5px; font-size: 14px; text-align: center; font-weight: bold;">
        📢 평가일 목록 <span style="font-size:11px; color:#e67e22; font-weight:normal; margin-left:3px;">(총 ${dates.length}개)</span>
    </h4>`;
    html += `<div style="font-size:11px; color:#666; margin-bottom:10px; text-align:center;">(능력단위 기준)</div>`;

    if (dates.length === 0) {
        html += `<div style="text-align:center; padding:15px 10px; color:#999; font-size:12px; background:#f9f9f9; border-radius:4px;">등록된 평가일이<br>없습니다.</div>`;
    } else {
        dates.forEach(d => {
            const dateObj = new Date(d);
            const weekNames = ['일','월','화','수','목','금','토'];
            const shortDate = `${String(dateObj.getMonth()+1).padStart(2,'0')}.${String(dateObj.getDate()).padStart(2,'0')}(${weekNames[dateObj.getDay()]})`;
            
            const evalData = evalDatesObj[d];
            const savedSubjects = evalData.subjects || '과목 미지정';

            html += `
                <div style="font-size: 12px; padding: 8px 4px; border-bottom: 1px dashed #ddd; display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #2c3e50;">${shortDate}</span>
                    </div>`;

            if (evalData.details && evalData.details.length > 0) {
                evalData.details.forEach(det => {
                    html += `<div style="font-size: 11px; line-height: 1.3; margin-top: 2px; padding-left: 5px; border-left: 2px solid #3498db; background: #f4f9fd; padding: 4px;">
                        <div style="color: #2980b9; font-weight: bold; margin-bottom: 2px;">📘 ${det.sub}</div>
                        <div style="color: #555;"><span style="color:#e67e22; font-weight:bold;">${det.period}교시</span> / 🏠 ${det.place}</div>
                    </div>`;
                });
            } else {
                html += `<div style="font-size: 11px; color: #16a085; font-weight: bold; line-height: 1.3; word-break: break-all;">
                        📘 ${savedSubjects}
                    </div>`;
            }

            html += `</div>`;
        });
    }

    banner.innerHTML = html;
    banner.style.display = 'block'; 
}

async function openTrainingLog(date, event) {
    event.stopPropagation(); 

    const dayData = rawTimetable.filter(r => {
        if (getFixDate(r.날짜) !== date) return false;
        const periodStr = String(r.교시).trim();
        const periodNum = parseInt(periodStr.replace(/[^0-9]/g, "")) || 0;
        return periodStr !== "점심" && periodNum > 0;
    });
    
    if (dayData.length === 0) return await appAlert("해당 일자에 진행된 수업 데이터가 없습니다.");

    dayData.sort((a, b) => {
        const pA = parseInt(String(a.교시).replace(/[^0-9]/g, "")) || 0;
        const pB = parseInt(String(b.교시).replace(/[^0-9]/g, "")) || 0;
        return pA - pB;
    });

    const toMin = (t) => {
        if (!t || !String(t).includes(':')) return 0;
        const p = t.split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1]);
    };

    const fmtTime = (t) => {
        if (!t || t === "-" || t.length < 5) return "";
        return t.substring(0, 5).replace(":", "");
    };

    const dayAtt = fullAttendanceData[date] || {};

    let prevSubject = "";
    let prevTeacher = "";
    let prevNcs = "";
    let tbodyHtml = "";

    dayData.forEach((r) => {
        const periodStr = String(r.교시).replace(/[^0-9]/g, ""); 
        const subject = String(r.교과목 || "-").trim();
        const teacher = String(r.강사명 || r.교사 || r.담당교사 || "김회준").trim(); 
        
        let ncs = String(r.능력단위 || subject).trim(); 
        if (r.isEval) ncs += "(평가시험)";

        const timeStr = String(r.시간 || r.교육시간 || "").replace(/\s/g, "");
        let classStart = 0, classEnd = 0, expectedDur = 0;
        
        if (timeStr.includes("~") || timeStr.includes("-")) {
            const parts = timeStr.split(/[~-]/);
            classStart = toMin(parts[0]);
            classEnd = toMin(parts[1]);
            expectedDur = Math.max(0, classEnd - classStart);
        } else {
            const fallback = { 
                1: {s: "09:00", e: "09:50"}, 2: {s: "10:00", e: "10:50"}, 3: {s: "11:00", e: "11:50"}, 4: {s: "12:00", e: "12:50"}, 
                5: {s: "14:00", e: "14:50"}, 6: {s: "15:00", e: "15:50"}, 7: {s: "16:00", e: "16:50"}, 8: {s: "17:00", e: "17:50"} 
            };
            const pNum = parseInt(periodStr);
            if (fallback[pNum]) {
                classStart = toMin(fallback[pNum].s);
                classEnd = toMin(fallback[pNum].e);
                expectedDur = classEnd - classStart;
            }
        }

        let missingStudents = [];
        
        studentNames.forEach(name => {
            const att = dayAtt[name];
            if (!att || att.status === "미편입") return;
            
            const st = att.status ? String(att.status).trim() : "";
            
            let sIn = toMin(att.inTime), sOut = toMin(att.outTime);
            let lIn = toMin(att.leaveTime), rIn = toMin(att.returnTime);
            
            let effectiveIn = sIn;
            if (effectiveIn > 0 && effectiveIn <= classStart + 10) effectiveIn = classStart; 
            
            let effectiveOut = sOut;
            if (effectiveOut > 0 && effectiveOut >= classEnd - 10) effectiveOut = classEnd;

            if (expectedDur > 0) {
                let pStart = Math.max(effectiveIn, classStart);
                let pEnd = Math.min(effectiveOut, classEnd);
                let dur = Math.max(0, pEnd - pStart);
                
                if (lIn > 0 && rIn > 0) {
                    let oStart = Math.max(lIn, classStart);
                    let oEnd = Math.min(rIn, classEnd);
                    dur -= Math.max(0, oEnd - oStart);
                }
                
                if (dur < expectedDur || st.includes("휴가") || st.includes("공가")) {
                    missingStudents.push(name);
                }
            }
        });

        const dispRemark = missingStudents.join(', ');

        const dispSubject = (subject === prevSubject) ? "//" : subject;
        const dispTeacher = (teacher === prevTeacher) ? "//" : teacher;
        
        let dispNcs = ncs;
        if (ncs === prevNcs && !r.isEval) {
            dispNcs = "//";
        }

        const safeSubject = encodeURIComponent(subject).replace(/'/g, "%27");
        const safeTeacher = encodeURIComponent(teacher).replace(/'/g, "%27");
        const safeNcs = encodeURIComponent(ncs).replace(/'/g, "%27");
        const safeRemark = encodeURIComponent(dispRemark).replace(/'/g, "%27");

        const cellHover = `transition: background 0.2s; cursor: pointer;`;
        const onHover = `onmouseover="this.style.background='#e8f5e9'" onmouseout="this.style.background='transparent'"`;

        tbodyHtml += `
            <tr style="border-bottom: 1px solid #ddd; background:#fff;">
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; font-weight:bold; color:#2c3e50;">${periodStr}</td>
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeSubject}'), this)" title="클릭 시 복사">${dispSubject}</td>
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeTeacher}'), this)" title="클릭 시 복사">${dispTeacher}</td>
                <td style="padding:10px; text-align:center; border-right:1px solid #ddd; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeNcs}'), this)" title="클릭 시 복사">${dispNcs}</td>
                <td style="padding:10px; text-align:center; font-size:11.5px; color:#c0392b; font-weight:bold; line-height:1.4; word-break:keep-all; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeRemark}'), this)" title="클릭 시 복사">${dispRemark}</td>
            </tr>
        `;

        prevSubject = subject;
        prevTeacher = teacher;
        prevNcs = ncs;
    });

    let lateList = [], absentList = [], earlyLeaveList = [], vacationList = [];
    let otherMap = {}; 
    
    studentNames.forEach(name => {
        const att = dayAtt[name];
        
        if (!att || !att.status) return;

        const st = att.status.trim();
        const inT = fmtTime(att.inTime);
        const outT = fmtTime(att.outTime);
        const lIn = fmtTime(att.leaveTime);
        const rIn = fmtTime(att.returnTime);
        
        if (st !== "출석" && st !== "미편입" && st !== "") {
            if (st.includes("결석")) absentList.push(name);
            else if (st.includes("휴가")) vacationList.push(name);
            else {
                if (st.includes("지각")) lateList.push(`${name}(${inT})`);
                if (st.includes("조퇴")) earlyLeaveList.push(`${name}(${outT})`);
                if (st.includes("외출")) {
                    if (!otherMap["외출"]) otherMap["외출"] = [];
                    otherMap["외출"].push(`${name}(${lIn}~${rIn})`);
                }
                
                if (st.includes("공가") || (!st.includes("지각") && !st.includes("결석") && !st.includes("조퇴") && !st.includes("휴가") && !st.includes("외출"))) {
                    let reason = att.note ? String(att.note).trim() : st;
                    
                    if (!reason.includes("(회수)")) {
                        reason = reason.replace(/\s*\(신청\)/g, '').replace(/\s*\(승인\)/g, '').trim();
                    }
                    
                    if (!otherMap[reason]) otherMap[reason] = [];
                    otherMap[reason].push(name);
                }
            }
        }
    });

    const formatArr = (arr) => arr.length > 0 ? arr.join(', ') : "";
    const rawLate = formatArr(lateList);
    const rawAbsent = formatArr(absentList);
    const rawEarly = formatArr(earlyLeaveList);
    const rawVacation = formatArr(vacationList);
    
    let otherResultArr = [];
    for (let key in otherMap) {
        otherResultArr.push(`${key}:${otherMap[key].join(', ')}`);
    }
    
    const rawOtherHtml = otherResultArr.length > 0 ? otherResultArr.join('<br>') : "";
    const rawOtherText = otherResultArr.length > 0 ? otherResultArr.join('\n') : "";

    const safeLate = encodeURIComponent(rawLate).replace(/'/g, "%27");
    const safeAbsent = encodeURIComponent(rawAbsent).replace(/'/g, "%27");
    const safeEarly = encodeURIComponent(rawEarly).replace(/'/g, "%27");
    const safeVacation = encodeURIComponent(rawVacation).replace(/'/g, "%27");
    const safeOther = encodeURIComponent(rawOtherText).replace(/'/g, "%27");

    const memoText = openSmartMemo(date, null, true);
    const safeMemoText = encodeURIComponent(memoText).replace(/'/g, "%27");

    const createRow = (title, safeData, rawData, isLast) => `
        <div style="display: flex; ${isLast ? '' : 'border-bottom: 1px solid #ddd;'}">
            <div style="width: 80px; background: #fdf2e9; color: #d35400; font-weight: bold; display: flex; align-items: center; justify-content: center; border-right: 1px solid #ddd; padding: 8px; flex-shrink: 0;">
                ${title}
            </div>
            <div onclick="copyLogText(decodeURIComponent('${safeData}'), this)" title="클릭 시 우측 명단만 복사" 
                 style="flex-grow: 1; font-size: 13px; color: #333; cursor: pointer; padding: 8px 12px; transition: background 0.2s; display: flex; align-items: center; min-height: 20px;" 
                 onmouseover="this.style.background='#e8f5e9'" onmouseout="this.style.background='transparent'">
                ${rawData}
            </div>
        </div>
    `;

    const overlay = document.createElement('div');
    overlay.id = "trainingLogOverlay"; 
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:6000; display:flex; justify-content:center; align-items:center;";

    const box = document.createElement('div');
    box.style.cssText = "background:#fff; padding:20px; border-radius:10px; border:2px solid #2980b9; width:1100px; max-width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.3);";
    
    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #2980b9; padding-bottom:10px; margin-bottom:15px;">
            <h3 style="margin:0; color:#2980b9;">📝 ${date} 훈련일지</h3>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:none; border:none; font-size:20px; font-weight:bold; cursor:pointer; color:#7f8c8d;">✖</button>
        </div>
        <div style="font-size:12px; color:#e67e22; font-weight:bold; margin-bottom:10px; text-align:right;">💡 화면에 '//'로 표시되어도, 클릭하면 실제 원본 내용이 복사됩니다.</div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; border: 2px solid #2c3e50;">
            <thead style="background:#f8f9fa;">
                <tr>
                    <th style="padding:10px; border:1px solid #ddd; width:7%;">교시</th>
                    <th style="padding:10px; border:1px solid #ddd; width:20%;">훈련과목</th>
                    <th style="padding:10px; border:1px solid #ddd; width:11%;">담당교사</th>
                    <th style="padding:10px; border:1px solid #ddd; width:37%;">훈련내용</th>
                    <th style="padding:10px; border:1px solid #ddd; width:25%;">비고</th>
                </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
        </table>
    `;

    html += `
        <div style="margin-top:20px; border:2px solid #ddd; border-radius:6px; padding:15px; background:#f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid #f1c40f; padding-bottom:5px; margin-bottom:10px;">
                <span style="color:#d35400; font-weight:bold; font-size:14px;">📢 지시 전달사항</span>
                <span style="font-size:11px; color:#3498db; font-weight:bold;">(클릭 시 복사)</span>
            </div>
            <div onclick="copyLogText(decodeURIComponent('${safeMemoText}'), this)" title="클릭 시 복사" 
                 style="font-size:13px; color:#555; line-height:1.6; white-space: pre-wrap; word-break: break-all; text-align:left; cursor:pointer; padding:8px; border-radius:4px; transition:background 0.2s;" 
                 onmouseover="this.style.background='#e3f2fd'" onmouseout="this.style.background='transparent'">${memoText.trim()}</div>
        </div>
    `;

    html += `
        <div style="margin-top:15px; border:2px solid #ddd; border-radius:6px; padding:15px; background:#f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid #27ae60; padding-bottom:5px; margin-bottom:10px;">
                <span style="color:#2c3e50; font-weight:bold; font-size:14px;">📊 일일 특이사항</span>
                <span style="font-size:11px; color:#3498db; font-weight:bold;">(우측 명단을 클릭 시 해당 텍스트만 복사됩니다)</span>
            </div>
            <div style="display: flex; flex-direction: column; border: 1px solid #ddd; border-radius: 4px; background: #fff; overflow: hidden;">
                ${createRow("지각자", safeLate, rawLate, false)}
                ${createRow("결석자", safeAbsent, rawAbsent, false)}
                ${createRow("조퇴자", safeEarly, rawEarly, false)}
                ${createRow("휴가자", safeVacation, rawVacation, false)}
                ${createRow("기타사항", safeOther, rawOtherHtml, true)}
            </div>
        </div>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if(e.target === overlay) overlay.remove();
    });
}

async function copyLogText(text, element) {
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = text;
    tempTextArea.style.position = "fixed";
    tempTextArea.style.top = "-9999px";
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999);
    
    try {
        document.execCommand("copy");
        
        element.style.backgroundColor = "#c8e6c9"; 
        element.style.fontWeight = "bold";
        element.style.color = "#27ae60";
        
        setTimeout(() => {
            element.style.backgroundColor = "transparent";
            element.style.fontWeight = "normal";
            element.style.color = "";
        }, 400);

    } catch (err) {
        await appAlert("복사 실패: 브라우저 환경을 확인해주세요.");
    } finally {
        document.body.removeChild(tempTextArea);
    }
}

async function openSmartMemo(date, event, returnOnly = false) {
    if (event) event.stopPropagation(); 
    
    const dayIdx = new Date(date).getDay();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[dayIdx];

    const todaySubjects = new Set();
    rawTimetable.forEach(r => {
        if(getFixDate(r.날짜) === date) {
            const sub = r.능력단위 ? String(r.능력단위).trim() : "";
            const checkSub = String(r.교과목 || "").trim();
            if(String(r.교시).trim() !== "점심" && sub !== "" && isActualSubject(checkSub)) {
                todaySubjects.add(sub);
            }
        }
    });
    
    let baseMsg = "";
    if(dayIdx === 1) baseMsg = "출결진행에 변동 발생시 학교로 꼭 연락바라며, 수업시간에는 집중하여 열공합시다.";
    else if(dayIdx === 2) baseMsg = "작업 전 작업순서를 반드시 숙지한 후 안전에 유의해서 작업에 임합시다.";
    else if(dayIdx === 3) baseMsg = "개인건강 및 작업안전 관리에 만전을 기합시다.";
    else if(dayIdx === 4) baseMsg = "수업시간에는 수업에 집중합시다.";
    else if(dayIdx === 5) baseMsg = "개인건강관리와 작업안전관리에 만전을 기해 주시고, 건강한 모습으로 만납시다.";
    else {
        if(todaySubjects.size > 0) {
            baseMsg = "주말에도 수업하는라 수고하셨습니다.";
        } else {
            baseMsg = "주말/휴일입니다.";
        }
    }

    let specialMsg = "";
    const evalDatesObj = evaluationDates[calendarSubMode] || {};

    const cleanText = (str) => {
        return String(str).split(',').map(s => {
            return s.replace(/\[.*?\]|\(.*?\)/g, '') 
                    .replace(/^[a-zA-Z0-9_\-]{5,}\s*/, '') 
                    .replace(/^[\s\-_]+/, '') 
                    .trim();
        }).join(', ');
    };

    todaySubjects.forEach(sub => {
        const displaySub = cleanText(sub);
        if(globalFirstDateMap[sub] === date) {
            specialMsg += `\n오늘부터 배우게 된 '${displaySub}' 과목에 대한 내부평가 제반사항을 안내하오니 숙지해 주시기 바랍니다.`;
        }
    });

    if (evalDatesObj[date]) {
        const rawSubs = evalDatesObj[date].subjects || "지정되지 않은"; 
        const displaySubs = cleanText(rawSubs);
        specialMsg += `\n오늘 '${displaySubs}' 과목의 내부평가 수행하느라 수고하셨습니다.`;
    }

    const currentIdx = globalSortedBusinessDays.indexOf(date);
    if(currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
        const nextBDate = globalSortedBusinessDays[currentIdx + 1];
        if (evalDatesObj[nextBDate]) {
            const rawNextSubs = evalDatesObj[nextBDate].subjects || "지정되지 않은";
            const nextSubs = cleanText(rawNextSubs);
            specialMsg += `\n다음 훈련일(${nextBDate})에 '${nextSubs}' 과목의 내부평가가 있으니 꼭 출석해 주세요.`;
        }
    }

    let finalMemo = "";
    if (specialMsg.trim() !== "") {
        finalMemo = specialMsg.replace(/^\n/, ''); 
    } else {
        finalMemo = baseMsg;
    }
    
    if (returnOnly) {
        return finalMemo;
    }

    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = finalMemo;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999); 

    try {
        document.execCommand("copy");
        await appAlert(`📋 [클립보드 자동 복사 완료]\n\n원하시는 곳(카카오톡, 단체문자 등)에 붙여넣기(Ctrl+V) 하세요.\n\n------------------------\n${finalMemo}`);
    } catch (err) {
        await appAlert(`📋 (자동 복사 실패. 아래 문구를 드래그해서 직접 복사해주세요)\n\n${finalMemo}`);
    } finally {
        document.body.removeChild(tempTextArea); 
    }
}

async function openMakeupDetailModal(studentName, escapedSub, subName) {
    const snap = await classDbRef(`makeupDetails/${studentName}/${escapedSub}`).once('value');
    const data = snap.val() || {};
    const records = Object.values(data);

    if (records.length === 0) {
        await appAlert("상세 보강 기록이 존재하지 않습니다.");
        return;
    }

    records.sort((a, b) => a.date.localeCompare(b.date));

    let totalM = 0;
    let tbodyHtml = "";

    records.forEach(r => {
        const dateStr = r.date.length === 8 ? `${r.date.substring(0,4)}.${r.date.substring(4,6)}.${r.date.substring(6,8)}` : r.date;
        const h = Math.floor(r.min / 60);
        const m = r.min % 60;
        const timeText = h > 0 ? `${h}h ${m}m` : `${m}m`;
        totalM += r.min;

        tbodyHtml += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:10px; border-right:1px solid #ddd;">${dateStr}</td>
                <td style="padding:10px; border-right:1px solid #ddd; font-weight:bold;">${r.time}</td>
                <td style="padding:10px; font-weight:bold; color:#27ae60;">${r.min}분 <br><span style="font-size:11px; color:#7f8c8d;">(${timeText})</span></td>
            </tr>`;
    });

    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:7000; display:flex; justify-content:center; align-items:center;";
    
    const box = document.createElement('div');
    box.style.cssText = "background:#fff; padding:20px; border-radius:8px; width:450px; max-width:90%; border:2px solid #e67e22; box-shadow:0 10px 30px rgba(0,0,0,0.3);";

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e67e22; padding-bottom:10px; margin-bottom:15px;">
            <h3 style="margin:0; color:#d35400;">🛠️ 보강 상세 내역</h3>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:none; border:none; font-size:18px; font-weight:bold; cursor:pointer; color:#7f8c8d;">✖</button>
        </div>
        <div style="margin-bottom: 15px; font-weight: bold; color: #2c3e50; font-size:14px; background:#f9f9f9; padding:10px; border-radius:4px; border:1px solid #eee;">
            🧑‍🔧 훈련생: <span style="color:#2980b9;">${studentName}</span><br>
            📘 과목명: <span style="color:#2980b9;">${subName}</span>
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:center; border: 1px solid #ddd;">
            <thead style="background:#fdf2e9; color:#d35400;">
                <tr>
                    <th style="padding:8px; border:1px solid #ddd;">보강 날짜</th>
                    <th style="padding:8px; border:1px solid #ddd;">진행 시간</th>
                    <th style="padding:8px; border:1px solid #ddd;">보강(분)</th>
                </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
        </table>
        <div style="text-align:right; margin-top:15px; font-weight:bold; color:#c0392b; font-size:15px;">
            총 누적 보강: ${totalM}분
        </div>
    `;

    box.innerHTML = html;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

async function copyMakeupDetails(studentName, escapedSub, element, event) {
    if (event) event.stopPropagation(); 

    const originalText = element.innerHTML;
    element.innerHTML = "⏳ 복사 중...";
    element.style.color = "#27ae60";
    element.style.textDecoration = "none";

    try {
        const snap = await classDbRef(`makeupDetails/${studentName}/${escapedSub}`).once('value');
        const data = snap.val() || {};
        const records = Object.values(data);

        if (records.length === 0) {
            await appAlert("상세 보강 기록이 존재하지 않습니다.");
            element.innerHTML = originalText;
            element.style.color = "#e67e22";
            return;
        }

        records.sort((a, b) => a.date.localeCompare(b.date));

        const weekDays = ['일','월','화','수','목','금','토'];
        const textLines = records.map(r => {
            const yyyy = r.date.substring(0,4);
            const mm = r.date.substring(4,6);
            const dd = r.date.substring(6,8);
            const dateObj = new Date(`${yyyy}-${mm}-${dd}`);
            const dayStr = weekDays[dateObj.getDay()];
            
            const hours = r.min / 60;
            const formattedHours = Number.isInteger(hours) ? hours : hours.toFixed(1);

            return `${yyyy}.${mm}.${dd}(${dayStr}) ${r.time} (${formattedHours}H) 보강실시`;
        });

        const finalText = textLines.join('\n');

        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = finalText;
        tempTextArea.style.position = "fixed";
        tempTextArea.style.top = "-9999px"; 
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        tempTextArea.setSelectionRange(0, 99999);
        
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);

        element.innerHTML = "✅ 복사완료";
        await appAlert(`📋 [보강 내역 복사 완료]\n원하시는 곳에 붙여넣기(Ctrl+V) 하세요.\n\n${finalText}`);

        setTimeout(() => {
            element.innerHTML = originalText;
            element.style.color = "#e67e22";
            element.style.textDecoration = "underline";
        }, 1500);

    } catch (e) {
        await appAlert("❌ 복사 중 오류가 발생했습니다: " + e.message);
        element.innerHTML = originalText;
        element.style.color = "#e67e22";
        element.style.textDecoration = "underline";
    }
}

// 📍 이벤트 리스너 배선 연결 (학생용 전용으로 간소화)
document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('tab_main')) document.getElementById('tab_main').addEventListener('click', () => changeMode('main'));
    if(document.getElementById('tab_calendar')) document.getElementById('tab_calendar').addEventListener('click', () => changeMode('calendar'));
    if(document.getElementById('tab_weekly')) document.getElementById('tab_weekly').addEventListener('click', () => changeMode('weekly'));
    if(document.getElementById('tab_resume')) document.getElementById('tab_resume').addEventListener('click', () => changeMode('resume'));


    if(document.getElementById('calendarModal')) document.getElementById('calendarModal').addEventListener('click', closeCalendarModal);
    if(document.getElementById('btn_modal_close')) document.getElementById('btn_modal_close').addEventListener('click', () => document.getElementById('calendarModal').style.display = 'none');
    if(document.getElementById('calendarModalContent')) document.getElementById('calendarModalContent').addEventListener('click', (e) => e.stopPropagation());

    const toggleBtn = document.getElementById('btnToggleStudentList');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleStudentPicker);
    const pickerList = document.getElementById('studentPickerList');
    if (pickerList) {
        pickerList.addEventListener('click', (e) => {
            const btn = e.target.closest('.student-picker-btn');
            if (!btn || !btn.dataset.studentName || btn.disabled || btn.classList.contains('student-picker-btn-disabled')) return;
            selectStudent(decodeURIComponent(btn.dataset.studentName));
        });
    }
    initCalendarSwipe();

    const daySubjectsBackdrop = document.getElementById('daySubjectsBackdrop');
    const btnDaySubjectsClose = document.getElementById('btnDaySubjectsClose');
    const btnDaySubjectsConfirm = document.getElementById('btnDaySubjectsConfirm');
    const daySubjectsPanel = document.querySelector('#daySubjectsSheet .day-subjects-panel');
    if (daySubjectsBackdrop) daySubjectsBackdrop.addEventListener('click', closeDaySubjectsSheet);
    if (btnDaySubjectsClose) btnDaySubjectsClose.addEventListener('click', closeDaySubjectsSheet);
    if (btnDaySubjectsConfirm) btnDaySubjectsConfirm.addEventListener('click', closeDaySubjectsSheet);
    if (daySubjectsPanel) daySubjectsPanel.addEventListener('click', (e) => e.stopPropagation());

    const remainAttBackdrop = document.getElementById('remainAttBackdrop');
    const btnRemainAttConfirm = document.getElementById('btnRemainAttConfirm');
    const remainAttPanel = document.querySelector('#remainAttInfoSheet .remain-att-panel');
    if (remainAttBackdrop) remainAttBackdrop.addEventListener('click', closeRemainAttInfoModal);
    if (btnRemainAttConfirm) btnRemainAttConfirm.addEventListener('click', closeRemainAttInfoModal);
    if (remainAttPanel) remainAttPanel.addEventListener('click', (e) => e.stopPropagation());
});

window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const logOverlay = document.getElementById('trainingLogOverlay');
        if (logOverlay) {
            logOverlay.remove();
        }

        const openBox = document.querySelector('.detail-view[style*="display: block"]');
        if (openBox) {
            closeDetailView(openBox.id);
        }

        const calModal = document.getElementById('calendarModal');
        if (calModal && (calModal.style.display === 'flex' || calModal.style.display === 'block')) {
            calModal.style.display = 'none';
        }

        const daySubjectsSheet = document.getElementById('daySubjectsSheet');
        if (daySubjectsSheet && daySubjectsSheet.classList.contains('is-open')) {
            closeDaySubjectsSheet();
        }

        const remainAttSheet = document.getElementById('remainAttInfoSheet');
        if (remainAttSheet && remainAttSheet.classList.contains('is-open')) {
            closeRemainAttInfoModal();
        }

        document.querySelectorAll('[id^="weeklyDetailRow_"]').forEach(row => {
            if (row.style.display === 'table-row') {
                row.style.display = 'none';
            }
        });

        document.querySelectorAll('.weekly-subject-link').forEach(el => {
            el.classList.remove('active-sub');
        });
    }

    if (e.key === 'Tab') {
        const openWeeklyRow = document.querySelector('[id^="weeklyDetailRow_"][style*="display: table-row"]');
        if (openWeeklyRow) {
            e.preventDefault(); 
            const allLinks = Array.from(document.querySelectorAll('.weekly-subject-link'));
            const currentIndex = allLinks.indexOf(window.currentWeeklyOpenSub);
            const nextIndex = (currentIndex + 1) % allLinks.length;
            
            allLinks[nextIndex].click();
        }
    }
});

document.addEventListener('click', function(e) {
    if (Date.now() < suppressDetailOutsideCloseUntil) return;
    if (e.target.classList.contains('detail-view-close')) return;
    if (e.target.classList.contains('detail-view-confirm')) return;
    if (e.target.closest('.detail-sim-btn, .detail-remain-info-btn')) return;
    const openBox = document.querySelector('.detail-view[style*="display: block"]');
    if (!openBox) return;
    if (e.target.closest('.detail-view-inner')) return;
    if (e.target.closest('.subject-summary-bar')) return;
    if (e.target.closest('.day-subject-line-btn')) return;
    closeDetailView(openBox.id);
});

document.addEventListener('mouseover', function (e) {
    const cell = e.target.closest('.attendance-table td, .attendance-table th');
    if (!cell) return;

    const table = cell.closest('.attendance-table');
    
    if (table.classList.contains('weekly-view-table')) return;

    const index = cell.cellIndex;
    table.querySelectorAll('tr').forEach(tr => {
        const targetCell = tr.cells[index];
        if (targetCell) {
            const hasStatus = targetCell.classList.contains('status-late') || 
                              targetCell.classList.contains('status-absent') || 
                              targetCell.classList.contains('status-out') || 
                              targetCell.classList.contains('status-special') ||
                              targetCell.classList.contains('row-insufficient');
            
            if (!hasStatus) {
                targetCell.classList.add('hover-col');
            }
        }
    });
});

document.addEventListener('mouseout', function (e) {
    const cell = e.target.closest('.attendance-table td, .attendance-table th');
    if (!cell) return;

    const table = cell.closest('.attendance-table');
    table.querySelectorAll('.hover-col').forEach(c => c.classList.remove('hover-col'));
});