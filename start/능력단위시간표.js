
/**
 * =============================================================================
 * [CORE — AI·개발자 필독] start/능력단위시간표.js
 * =============================================================================
 * 출석·달력·주차·교과목별/능력단위별 대시보드의 핵심 화면입니다.
 * 집/회사/노트북 등 여러 PC에서 Cursor AI로 지속 수정 중 — 임의 대규모 변경 금지.
 *
 * ⚠️ 휴일 판별( index1·일일출석부와 동일 규칙 — 반드시 유지 ):
 *    - isStudyTimetableRow: 교과목 + 능력단위명 둘 다 있을 때만 수업 행
 *    - getHolidayLabelFromRow: 교과목만 있고 능력단위 없음 → 휴일 (달력 holiday-tag)
 *    - hydrateStudySubjectListsFromTimetable: 목록 보강 시 휴일명 제외
 *
 * ⚠️ 연관 핵심: start/index1.js, start/일일출석부.js
 * ⚠️ 기본 보기: DEFAULT_VIEW_MODE = 'ncs' (저장·DB 없을 때). ⚙️ 기본 보기로 교과목별 고정 가능.
 * ⚠️ copy 파일명 백업은 사용자 요청 없이 수정하지 말 것 (.cursor/rules 참고)
 *
 * =============================================================================
 */

// [개조] 브라우저 메모리에 저장된 해당 반의 DB 설정(연료)을 가져옵니다.
// 1. 브라우저 메모리에서 현재 반의 설정(연료)을 가져옵니다.
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};

// 2. 확보된 설정값으로 엔진(앱)을 시작합니다.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// 3. 엔진이 켜진 후 주유기(DB/Auth)를 연결합니다. (순서가 매우 중요합니다)
const database = firebase.database();
const auth = firebase.auth();
initClassContext();
const urlParams = new URLSearchParams(window.location.search);

const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // ✅ 이미 로그인 된 상태
        console.log("🔒 보안 인증 확인됨: " + firebaseConfig.projectId);
        // 기존 함수명인 initialize()를 유지하여 시동을 보장합니다.
        initialize(); 
    } else if (adminPw) {
        // 🔑 자동 로그인 시도
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw)
            .then(() => {
                console.log("🔒 보안 인증 성공!");
                initialize(); 
            })
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                // [보안 강화 이식] 실패 시 읽기 허용 대신 메인으로 퇴거
                await appAlert("인증 정보가 올바르지 않습니다. 메인 화면으로 이동합니다.");
                location.href = "../index.html"; 
            });
    } else {
        // [보안 강화 이식] 인증 정보가 아예 없는 경우 즉시 퇴거 조치
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        await appAlert("로그인이 필요한 서비스입니다.");
        location.href = "../index.html"; 
    }
});

let currentClass = window.currentClass;
document.getElementById('dispClass').innerText = formatClassHudText();

// 📍 [신규] 훈련 정보를 담아둘 전역 보관함
let courseName = "-", coursePeriod = "-";
/** 저장·DB 설정 없을 때 기본 보기: 능력단위별 (교과목별로 고정하려면 ⚙️ 기본 보기에서 선택) */
const DEFAULT_VIEW_MODE = 'ncs';
let rawTimetable = [], masterSubjectList = [], ncsList = [], studentNames = [], fullAttendanceData = {}, currentMode = DEFAULT_VIEW_MODE, currentSubjectSort = 'date', calYear, calMonth, weeklySubMode = DEFAULT_VIEW_MODE;
let evaluationDates = {};
let dropoutData = {};
let earlyCompletionData = {};
// 📍 [신규 센서] 배너 펼침 상태 기록 (기본값: 펼침)
let isEvalBannerExpanded = false; // 📍 평가일 배너 기본: 접힘
// 📍 [개조] 스마트 알림 엔진용 글로벌 센서 장착
let globalFirstDateMap = {};
let globalLastDateMap = {};
let globalSortedBusinessDays = [];
let defaultViewMode = localStorage.getItem(classStorageKey('defaultViewMode')) || DEFAULT_VIEW_MODE;
let activeViewMode = 'calendar';

function syncViewModeToUrl(mode) {
    const allowedModes = ['main', 'calendar', 'weekly'];
    if (!allowedModes.includes(mode)) return;
    activeViewMode = mode;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', mode);
        history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
}

function reloadWithCurrentView() {
    const mode = activeViewMode || urlParams.get('mode') || 'calendar';
    window.location.href = classNavHref('능력단위시간표.html', 'mode=' + encodeURIComponent(mode));
}

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

function getStudentLeaveDate(name) {
    if (dropoutData[name]) return dropoutData[name];
    if (earlyCompletionData[name]) return earlyCompletionData[name];
    return null;
}

function isStudentLeaveOnOrBefore(name, cutoffDate) {
    const leaveDate = getStudentLeaveDate(name);
    return !!(leaveDate && leaveDate <= cutoffDate);
}

function isDateOnOrAfterStudentLeave(name, date) {
    const leaveDate = getStudentLeaveDate(name);
    return !!(leaveDate && date >= leaveDate);
}

function hasMakeupWaiver(waivers, studentName, escapedSub) {
    const waiver = waivers?.[studentName]?.[escapedSub];
    return !!(waiver && (waiver.waived === true || waiver === true));
}

function goToMakeupNeedList(evt) {
    if (evt) evt.stopPropagation();
    location.href = classNavHref('보강수업.html', 'sort=subjectName');
}

function goToMakeupReportView(evt) {
    if (evt) evt.stopPropagation();
    location.href = classNavHref('보강수업.html', 'sort=reportMode');
}

function buildSubjectMakeupBadgeHtml(item, subDates, manualData, waiverData, mode) {
    if (!subDates.length) return "";

    const escapedItem = item.replace(/[\.\#\$\/\[\]]/g, "_");
    let masterTotalMin = 0;
    const dateSchedules = {};

    subDates.forEach(date => {
        dateSchedules[date] = calculateParticipation(date, "09:00", "17:30", item, "", "", mode);
        masterTotalMin += (dateSchedules[date].am + dateSchedules[date].pm);
    });
    if (masterTotalMin <= 0) return "";

    let targetCutoffDate = subDates[subDates.length - 1];
    const evalDatesObj = evaluationDates[mode] || {};
    for (const [eDate, eData] of Object.entries(evalDatesObj)) {
        const eSubs = eData.subjects || "";
        const cleanItem = mode === 'ncs' ? item.replace(/\[.*?\]/g, '').trim() : item;
        if (eSubs.includes(cleanItem) || eSubs.includes(item)) {
            targetCutoffDate = eDate;
            break;
        }
    }

    let hasWaived = false;
    let hasMakeupComplete = false;
    let hasNeedMakeup = false;

    for (const name of studentNames) {
        if (isStudentLeaveOnOrBefore(name, targetCutoffDate)) continue;

        if (hasMakeupWaiver(waiverData, name, escapedItem)) {
            hasWaived = true;
            continue;
        }

        const studentMakeupMin = (manualData[name] && manualData[name][`makeup_${escapedItem}`] > 0)
            ? parseInt(manualData[name][`makeup_${escapedItem}`], 10) || 0
            : 0;
        if (studentMakeupMin > 0) hasMakeupComplete = true;

        let projectedMin = 0;
        subDates.forEach(date => {
            if (isDateOnOrAfterStudentLeave(name, date)) return;

            const isFuture = !fullAttendanceData[date];
            if (isFuture) {
                projectedMin += (dateSchedules[date].am + dateSchedules[date].pm);
            } else {
                const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
                let calc = { am: 0, pm: 0 };
                if (att && att.inTime && att.outTime) {
                    calc = calculateParticipation(date, att.inTime, att.outTime, item, att.leaveTime || "", att.returnTime || "", mode);
                }
                if (manualData[name] && manualData[name][date]) {
                    if (manualData[name][date].am !== undefined) calc.am = manualData[name][date].am;
                    if (manualData[name][date].pm !== undefined) calc.pm = manualData[name][date].pm;
                }
                projectedMin += (calc.am + calc.pm);
            }
        });

        const percent = ((projectedMin + studentMakeupMin) / masterTotalMin) * 100;
        if (percent < 75) hasNeedMakeup = true;
    }

    let html = "";
    if (hasNeedMakeup) {
        html += `<button type="button" class="subject-need-makeup-badge makeup-nav-btn" onclick="goToMakeupNeedList(event)">(보강 필요)</button>`;
    }
    if (hasMakeupComplete) {
        html += `<button type="button" class="subject-makeup-badge makeup-nav-btn" onclick="goToMakeupReportView(event)">(보강 완료)</button>`;
    }
    if (hasWaived) html += `<span class="subject-waive-makeup-badge">(보강포기)</span>`;
    return html;
}

function normalizeSubjectKey(str) {
    return String(str || '').replace(/\s+/g, '').replace(/\[.*?\]/g, '').trim();
}

function rowMatchesSubjectItem(row, item, mode) {
    if (!isStudyTimetableRow(row)) return false;
    const targetVal = (mode === 'subject' ? String(row.교과목 || '') : String(row.능력단위 || '')).trim();
    const itemVal = String(item || '').trim();
    if (!targetVal || !itemVal) return false;
    if (targetVal === itemVal) return true;
    const a = normalizeSubjectKey(targetVal);
    const b = normalizeSubjectKey(itemVal);
    return a === b || a.includes(b) || b.includes(a);
}

function syncSubjectListsFromData(masterData) {
    const courses = normalizeCoursesList(masterData?.courses);
    if (courses.length) {
        masterSubjectList = [...new Set(courses.map(c => c.subject).filter(Boolean))];
        ncsList = [...new Set(courses.filter(c => c.unit).map(c => c.unit))];
    }
    ({ masterSubjectList, ncsList } = hydrateStudySubjectListsFromTimetable(rawTimetable, masterSubjectList, ncsList));
}

function ensureSubjectListsReady() {
    ({ masterSubjectList, ncsList } = hydrateStudySubjectListsFromTimetable(rawTimetable, masterSubjectList, ncsList));
}

/** index1·일일출석부와 동일: 교과목·능력단위명이 모두 있을 때만 수업 행 */
function isStudyTimetableRow(row) {
    if (!row || String(row.교시 || "").trim() === "점심") return false;
    const subjectName = String(row.교과목 || "").trim();
    const unitName = String(row.능력단위 || "").trim();
    return subjectName !== "" && unitName !== "";
}

/** 휴일명(교과목만)은 제외하고 수업 행에서만 교과목·능력단위 목록 보강 */
function hydrateStudySubjectListsFromTimetable(rawTimetable, masterSubjectList, ncsList) {
    const subjects = new Set(Array.isArray(masterSubjectList) ? masterSubjectList : []);
    const units = new Set(Array.isArray(ncsList) ? ncsList : []);
    (rawTimetable || []).forEach(r => {
        if (!isStudyTimetableRow(r)) return;
        const sub = String(r.교과목 || '').trim();
        const unit = String(r.능력단위 || '').trim();
        if (sub) subjects.add(sub);
        if (unit) units.add(unit);
    });
    return { masterSubjectList: Array.from(subjects), ncsList: Array.from(units) };
}

/** 교과목만 있고 능력단위가 없으면 휴일명 (index1 다운로드 휴일 감지와 동일) */
function getHolidayLabelFromRow(row) {
    if (!row || String(row.교시 || "").trim() === "점심") return "";
    const subjectName = String(row.교과목 || "").trim();
    const unitName = String(row.능력단위 || "").trim();
    return subjectName !== "" && unitName === "" ? subjectName : "";
}

function getTimetableDisplayName(row, mode) {
    if (!isStudyTimetableRow(row)) return "";
    const val = mode === 'subject' ? row.교과목 : row.능력단위;
    return String(val || "").trim();
}

const WEEKLY_SUBJECT_KEY_SEP = '\x1f';

function stripNcsCodeBracket(text) {
    return String(text || '').replace(/\[.*?\]/g, '').trim();
}

function getWeeklySubjectKeyFromRow(row) {
    if (!isStudyTimetableRow(row)) return "";
    const subject = String(row.교과목 || '').trim();
    const unitRaw = String(row.능력단위 || '').trim();
    return `${subject}${WEEKLY_SUBJECT_KEY_SEP}${unitRaw}`;
}

function parseWeeklySubjectKey(key) {
    const s = String(key || '');
    const i = s.indexOf(WEEKLY_SUBJECT_KEY_SEP);
    if (i < 0) return { subject: s.trim(), unitRaw: '' };
    return { subject: s.slice(0, i), unitRaw: s.slice(i + 1) };
}

function getWeeklySubjectLabelFromKey(key) {
    const { subject, unitRaw } = parseWeeklySubjectKey(key);
    const unitDisplay = stripNcsCodeBracket(unitRaw);
    if (!unitDisplay) return subject;
    if (!subject) return unitDisplay;
    return `${subject} + ${unitDisplay}`;
}

/** 주차별 목록: 교과목 + 능력단위(능력단위만 굵게) */
function getWeeklySubjectNameHtml(key) {
    const { subject, unitRaw } = parseWeeklySubjectKey(key);
    const unitDisplay = stripNcsCodeBracket(unitRaw);
    if (!unitDisplay) return `<span class="sub-name">${subject}</span>`;
    if (!subject) return `<span class="sub-ncs">${unitDisplay}</span>`;
    return `<span class="sub-name">${subject}</span><span class="sub-sep"> + </span><span class="sub-ncs">${unitDisplay}</span>`;
}

function rowMatchesWeeklySubjectKey(row, weeklyKey) {
    if (!isStudyTimetableRow(row)) return false;
    const p = parseWeeklySubjectKey(weeklyKey);
    return String(row.교과목 || '').trim() === p.subject
        && String(row.능력단위 || '').trim() === p.unitRaw;
}

function compareWeeklySubjectKeys(aKey, bKey) {
    const pa = parseWeeklySubjectKey(aKey);
    const pb = parseWeeklySubjectKey(bKey);
    const subCmp = pa.subject.localeCompare(pb.subject, 'ko');
    if (subCmp !== 0) return subCmp;
    return stripNcsCodeBracket(pa.unitRaw).localeCompare(stripNcsCodeBracket(pb.unitRaw), 'ko');
}

/** 주차별: 해당 주·해당 과목 수업일의 출석 정보가 모두 들어왔는지 (메인 (완료)와 동일 기준) */
function isWeeklySubjectAttendanceComplete(weeklyKey, weekEntry) {
    const dateSet = weekEntry?.subjectDatesMap?.[weeklyKey];
    if (!dateSet || dateSet.size === 0) return false;
    return Array.from(dateSet).every(date => fullAttendanceData[date]);
}

/** 주차 열 기간: 기본 월~금, 일·토 수업이 있는 주만 해당 요일까지 표시 */
function buildWeeklyPeriodLabel(weekNum, startSunday, hasSundayClass, hasSaturdayClass) {
    const weekSun = new Date(startSunday);
    weekSun.setDate(startSunday.getDate() + (weekNum - 1) * 7);
    weekSun.setHours(0, 0, 0, 0);

    const displayStart = new Date(weekSun);
    if (!hasSundayClass) displayStart.setDate(weekSun.getDate() + 1);

    const displayEnd = new Date(weekSun);
    displayEnd.setDate(weekSun.getDate() + (hasSaturdayClass ? 6 : 5));

    const fmt = (dt) => `${dt.getMonth() + 1}.${dt.getDate()}`;
    return `${fmt(displayStart)}~${fmt(displayEnd)}`;
}

function applyInitialTabFromUrl() {
    const startMode = urlParams.get('mode');
    const allowedModes = ['main', 'calendar', 'weekly'];
    const initialMode = allowedModes.includes(startMode) ? startMode : 'calendar';
    activeViewMode = initialMode;
    document.querySelectorAll('.tab-menu .tab-btn').forEach(btn => btn.classList.remove('active'));
    const tabMap = { main: 'tab_main', calendar: 'tab_calendar', weekly: 'tab_weekly' };
    const tabEl = document.getElementById(tabMap[initialMode]);
    if (tabEl) tabEl.classList.add('active');
    const subMenu = document.getElementById('mainSubMenu');
    const fRow = document.getElementById('subjectFilterRow');
    const topAction = document.getElementById('topActionArea');
    if (initialMode === 'main') {
        if (subMenu) subMenu.style.display = 'flex';
        if (fRow) fRow.style.display = 'table-row';
        if (topAction) topAction.style.display = 'block';
    } else {
        if (subMenu) subMenu.style.display = 'none';
        if (fRow) fRow.style.display = 'none';
        if (topAction) topAction.style.display = 'none';
    }
    return initialMode;
}

async function initialize() {
    try {
        applyInitialTabFromUrl();
    } catch (e) {
        console.warn('탭 초기화 경고:', e);
    }

    const cacheKey = classStorageKey('cache_attendance');
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        fullAttendanceData = JSON.parse(cachedData);
    }

    try {
        const [masterSnap, timetableSnap, attendanceSnap, evalSnap, userConfigSnap, dropoutSnap, earlySnap] = await Promise.all([
            classDbRef('masterData').once('value'),
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('evaluationDates').once('value'),
            classDbRef('userConfig/defaultView').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('earlyCompletions').once('value')
        ]);

        // 📍 [수리] 시간표 데이터를 배열로 안전하게 고정 (중복 할당 제거)
        rawTimetable = normalizeTimetableRows(timetableSnap.val());

        const d = masterSnap.val() || {};
        fullAttendanceData = attendanceSnap.val() || {};
        dropoutData = dropoutSnap.val() || {};
        earlyCompletionData = earlySnap.val() || {};
        
        // [개조] 평가일 데이터 2채널(모드별) 독립 보관함 초기화 (기존 데이터 충돌 방어)
        const rawEval = evalSnap.val() || {};
        evaluationDates = {
            subject: rawEval.subject || {},
            ncs: rawEval.ncs || {}
        };
        
        courseName = d.name || "-";
coursePeriod = d.period || "-";
        if(document.getElementById('infoCourse')) document.getElementById('infoCourse').innerText = courseName;
if(document.getElementById('infoPeriod')) document.getElementById('infoPeriod').innerText = coursePeriod;

        syncSubjectListsFromData(d);

        const dbViewMode = userConfigSnap.val();
        if (dbViewMode === 'subject' || dbViewMode === 'ncs') {
            defaultViewMode = dbViewMode;
            localStorage.setItem(classStorageKey('defaultViewMode'), dbViewMode);
        }

        localStorage.setItem(cacheKey, JSON.stringify(fullAttendanceData));

        let allStudents = new Set();
        Object.values(fullAttendanceData).forEach(dayData => {
            Object.keys(dayData).forEach(name => {
                if (name !== "_metadata") allStudents.add(name);
            });
        });
        studentNames = Array.from(allStudents).sort();
        if (!studentNames.length) studentNames = ["훈련생"];

        // 📍 [수리] 시동 로직 및 날짜 센서 통합
        if(rawTimetable.length > 0) {
            if(calYear === undefined) {
                const allDates = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== "날짜미상").sort();
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
                        calYear = parseInt(p[0]); 
                        calMonth = parseInt(p[1]) - 1;
                    }
                }
            }
            const radio = document.querySelector(`input[name="defaultView"][value="${defaultViewMode}"]`);
        if(radio) radio.checked = true;
        
        const initialMode = applyInitialTabFromUrl();
        changeMode(initialMode);
    } else {
        const viewArea = document.getElementById('viewArea');
        if (viewArea) {
            viewArea.innerHTML = "<p style='text-align:center;padding:50px;color:#666;'>등록된 시간표가 없습니다.<br>메인(index1)에서 시간표를 업로드하고 「💾 서버 확정 저장」을 눌러 주세요.</p>";
        }
    }
    if (typeof loadCohortLabelFromDb === 'function') loadCohortLabelFromDb();
    else if (typeof refreshClassHud === 'function') refreshClassHud();
} catch (e) {
    console.error("데이터 로드 실패:", e);
    const errMsg = `<p style='text-align:center;padding:30px;color:#c0392b;'>데이터 로드 중 오류가 발생했습니다.<br><span style="font-size:12px;">${e.message || e}</span><br>F12 콘솔을 확인해 주세요.</p>`;
    const viewArea = document.getElementById('viewArea');
    const dashArea = document.getElementById('subjectDashboardArea');
    if (viewArea) viewArea.innerHTML = errMsg;
    if (dashArea) dashArea.innerHTML = errMsg;
}
}

function getSubjectLastDate(itemName) {
    const subData = rawTimetable.filter(r => rowMatchesSubjectItem(r, itemName, currentMode));
    const dates = [...new Set(subData.map(r => getFixDate(r.날짜)))].sort();
    return dates[dates.length - 1] || '미상';
}

function getSubjectSortDateKey(dateStr) {
    return dateStr === '미상' ? '9999-99-99' : dateStr;
}

function escapeSubForJsAttr(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getSubjectPrintFileName(subName) {
    if (currentMode === 'subject') {
        return `${subName} 능력단위 출석부`;
    }
    const courseSubject = rawTimetable.find(r => String(r.능력단위 || '').trim() === subName.trim())?.교과목 || '미분류';
    return `[${courseSubject}]_${subName} 출석부`;
}

async function prepareSubjectPrintArea(subName, mode = 'real') {
    await loadDetailInto(subName, 'pHead', 'pBody', mode);
    document.getElementById('targetSubName').innerText = subName;
    syncPrintAttendanceLegend();
    document.getElementById('pInfoCourse').innerText = courseName;
    document.getElementById('pInfoPeriod').innerText = coursePeriod;
    return getSubjectPrintFileName(subName);
}

async function printSubjectByName(subName, mode = 'real') {
    const fileName = await prepareSubjectPrintArea(subName, mode);
    document.title = fileName;
    return new Promise((resolve) => {
        setTimeout(async () => {
            const table = document.getElementById('actionTargetTable');
            if (!table || table.querySelectorAll('tr').length < 2) {
                await appAlert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
                resolve();
                return;
            }
            window.print();
            document.title = '종합 능력단위 출석 관리 시스템';
            resolve();
        }, 800);
    });
}

async function printCurrentDetailSubject(subName) {
    const openBox = document.querySelector('.detail-view[style*="display: block"]');
    const mode = openBox?.dataset.detailMode || 'real';
    await printSubjectByName(subName, mode);
}

window.printCurrentDetailSubject = printCurrentDetailSubject;

function sortSubjectNamesByDisplayOrder(list, sortType) {
    const sorted = [...list];
    if (sortType === 'name') {
        sorted.sort((a, b) => a.localeCompare(b));
    } else {
        sorted.sort((a, b) => {
            const dateCmp = getSubjectSortDateKey(getSubjectLastDate(a)).localeCompare(getSubjectSortDateKey(getSubjectLastDate(b)));
            return dateCmp || a.localeCompare(b);
        });
    }
    return sorted;
}

function formatSubjectOrderNo(num) {
    return String(num).padStart(2, '0');
}

function getExcelAttendanceLegendText() {
    return "■ 지각/조퇴   ■ 외출   ■ 결석   ■ 공가/휴가/기타   ■ 중도탈락";
}

function getAttendanceLegendHtml() {
    const chip = (bg, border, label) =>
        `<span style="display:inline-flex;align-items:center;white-space:nowrap;"><i style="width:12px;height:12px;background:${bg};border:1px solid ${border};display:inline-block;margin-right:4px;flex-shrink:0;"></i>${label}</span>`;
    return `<span style="display:inline-flex;gap:8px 12px;font-size:10px;font-weight:bold;align-items:center;flex-wrap:wrap;justify-content:flex-end;">`
        + chip('#fff176', '#f1c40f', '지각/조퇴')
        + chip('#e8f5e9', '#27ae60', '외출')
        + chip('#ffebee', '#e74c3c', '결석')
        + chip('#e3f2fd', '#3498db', '공가/휴가/기타')
        + chip('#e0e0e0', '#bdc3c7', '중도탈락')
        + `</span>`;
}

function syncPrintAttendanceLegend() {
    const legendEl = document.getElementById('printAttendanceLegend');
    if (legendEl) legendEl.innerHTML = getAttendanceLegendHtml();
}

function updateActionSelect() {
    const sel = document.getElementById('actionSubjectSelect');
    sel.innerHTML = `<option value="">${currentMode === 'subject' ? '교과목' : '능력단위'}을 선택하세요</option>`;
   
    const targetList = sortSubjectNamesByDisplayOrder(
        currentMode === 'subject' ? masterSubjectList : ncsList,
        currentSubjectSort
    );

    targetList.forEach((item, idx) => {
        const opt = document.createElement('option');
        opt.value = item; // 📍 실제 DB 연결용 키값은 순정 유지 (인쇄/엑셀 엔진 에러 방지)
       
        // 📍 [배선 추가] 메인 화면의 '(완료)' 감지 센서를 드롭박스에도 동일하게 이식합니다.
        const subData = rawTimetable.filter(r => rowMatchesSubjectItem(r, item, currentMode));
        const subDates = [...new Set(subData.map(r => getFixDate(r.날짜)))];
        const isCompleted = subDates.length > 0 && subDates.every(date => fullAttendanceData[date]);

        // 📍 [수리] 능력단위 모드일 때만 [NCS코드]를 정규식으로 제거 후 표시
        let displayText = item;
        if (currentMode === 'ncs') {
            displayText = item.replace(/\[.*?\]/g, '').trim();
        }
       
        // 📍 완료된 과목이면 운전석 계기판(드롭박스) 이름 뒤에만 (완료) 태그 부착
        if (isCompleted) {
            displayText += " (완료)";
        }
       
        opt.innerText = `${formatSubjectOrderNo(idx + 1)}. ${displayText}`;
        sel.appendChild(opt);
    });
}

async function executeAction(type) {
    const subName = document.getElementById('actionSubjectSelect').value;
    if (!subName) return await appAlert('대상을 먼저 상단에서 선택해주세요.');

    if (type === 'print') {
        await printSubjectByName(subName, 'real');
        return;
    }

    const fileName = await prepareSubjectPrintArea(subName, 'real');
    document.title = fileName;

    setTimeout(async () => {
        if (type === 'excel') {
            const table = document.getElementById('actionTargetTable');

            if (!table || table.querySelectorAll('tr').length < 2) {
                return await appAlert('데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
            }

            const wb = XLSX.utils.book_new();
            const rows = [];
            const merges = [];

            const titleLabel = currentMode === 'subject' ? '📘 교과목 출석부' : '📜 능력단위 출석부';
            const titleRow = new Array(10).fill('');
            titleRow[0] = titleLabel;
            titleRow[1] = subName;
            titleRow[5] = getExcelAttendanceLegendText();
            rows.push(titleRow);
            rows.push(['훈련과정', document.getElementById('infoCourse').innerText]);
            rows.push(['훈련기간', document.getElementById('infoPeriod').innerText]);
            rows.push([]);

            merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: 4 } });
            merges.push({ s: { r: 0, c: 5 }, e: { r: 0, c: 9 } });
            for (let i = 1; i < 3; i++) {
                merges.push({ s: { r: i, c: 1 }, e: { r: i, c: 9 } });
            }

            const startDataRow = rows.length;
            const trs = table.querySelectorAll('tr');
            const skipMap = {};

            trs.forEach((tr, rIdx) => {
                const rowData = [];
                const tds = tr.querySelectorAll('th, td');
                const currentRowIdx = startDataRow + rIdx;
                let currentColIdx = 0;

                tds.forEach((td) => {
                    while (skipMap[`${currentRowIdx}-${currentColIdx}`]) {
                        rowData[currentColIdx] = '';
                        currentColIdx++;
                    }

                    const input = td.querySelector('input');
                    const text = input ? (input.value || '0') : td.innerText.trim();
                    const colspan = parseInt(td.getAttribute('colspan') || '1');
                    const rowspan = parseInt(td.getAttribute('rowspan') || '1');

                    rowData[currentColIdx] = text;

                    if (colspan > 1 || rowspan > 1) {
                        merges.push({
                            s: { r: currentRowIdx, c: currentColIdx },
                            e: { r: currentRowIdx + rowspan - 1, c: currentColIdx + colspan - 1 }
                        });
                        if (rowspan > 1) {
                            for (let i = 1; i < rowspan; i++) {
                                for (let j = 0; j < colspan; j++) {
                                    skipMap[`${currentRowIdx + i}-${currentColIdx + j}`] = true;
                                }
                            }
                        }
                        for (let i = 1; i < colspan; i++) {
                            currentColIdx++;
                            rowData[currentColIdx] = '';
                        }
                    }
                    currentColIdx++;
                });
                rows.push(rowData);
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!merges'] = merges;
            const wscols = [{ wch: 12 }];
            for (let i = 1; i < 50; i++) wscols.push({ wch: 6 });
            ws['!cols'] = wscols;

            XLSX.utils.book_append_sheet(wb, ws, '출석부');
            XLSX.writeFile(wb, `${fileName}.xlsx`);
            document.title = '종합 능력단위 출석 관리 시스템';
        }
    }, 800);
}

async function renderSubjectList(sortType) {
    const area = document.getElementById('subjectDashboardArea');
    const dashboardTitle = document.getElementById('dashboardTitle'); 
    if(!rawTimetable.length) {
        if (area) area.innerHTML = "<p style='text-align:center;padding:20px;color:#888;'>시간표 데이터가 없습니다.</p>";
        return;
    }

    ensureSubjectListsReady();

    currentSubjectSort = sortType;

    // 📍 [신규] 정렬 버튼 활성화 표시 처리
    document.querySelectorAll('.sort-control .ctrl-btn').forEach(btn => btn.classList.remove('active'));
    if (sortType === 'date') document.getElementById('btn_sort_date').classList.add('active');
    else if (sortType === 'name') document.getElementById('btn_sort_name').classList.add('active');

    const targetBaseList = currentMode === 'subject' ? masterSubjectList : ncsList;
    if (!targetBaseList.length) {
        if (area) {
            area.innerHTML = "<p style='text-align:center;padding:20px;color:#888;'>시간표에서 교과목/능력단위를 찾지 못했습니다.<br>index1에서 「💾 서버 확정 저장」을 다시 실행해 주세요.</p>";
        }
        return;
    }
    
    let totalAllMin = 0;

    // 2. 보강·포기 데이터 확인
    const [manualSnap, waiverSnap] = await Promise.all([
        classDbRef('manualAttendance').once('value'),
        classDbRef('makeupWaivers').once('value')
    ]);
    const manualData = manualSnap.val() || {};
    const waiverData = waiverSnap.val() || {};

    let summary = targetBaseList.map(item => {
        const subData = rawTimetable.filter(r => rowMatchesSubjectItem(r, item, currentMode));
        
        // [로직] 등록 완료 체크
        const subDates = [...new Set(subData.map(r => getFixDate(r.날짜)))];
        const isCompleted = subDates.length > 0 && subDates.every(date => fullAttendanceData[date]);
        const completeBadge = isCompleted ? `<span class="subject-complete-badge">(완료)</span>` : "";
        const sortedSubDates = [...subDates].sort();
        const makeupBadge = buildSubjectMakeupBadgeHtml(item, sortedSubDates, manualData, waiverData, currentMode);

        let displayTitle = item;
        if (currentMode === 'ncs') {
            displayTitle = item.replace(/\[.*?\]/g, '').trim();
        }
        
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
            makeupBadge: makeupBadge,
            isCompleted: isCompleted, 
            start: dates[0] || "미상", 
            end: dates[dates.length-1] || "미상", 
            min: min, 
            hour: (min/60).toFixed(1) 
        };
    });

    // 상단 통계 수치 업데이트
    const totalAllHour = (totalAllMin / 60).toFixed(1);
    const totalCount = summary.length;
    const countLabel = currentMode === 'subject' ? "과목" : "단위";
    const titleText = currentMode === 'subject' ? "📘 교과목 상세 목록" : "📜 능력단위 상세 목록";
    
    dashboardTitle.innerHTML = `${titleText} <span style="margin-left:15px; font-size:13px; color:#666; font-weight:normal;">(총 <b style="color:#3498db;">${totalCount}개</b> ${countLabel} / 총합: <b style="color:#e67e22;">${totalAllMin.toLocaleString()}분</b> / <b style="color:#27ae60;">${totalAllHour}h</b>)</span>`;

    if(sortType === 'name') summary.sort((a,b) => a.name.localeCompare(b.name));
    else summary.sort((a,b) => {
        const dateCmp = getSubjectSortDateKey(a.end).localeCompare(getSubjectSortDateKey(b.end));
        return dateCmp || a.name.localeCompare(b.name);
    });
    
    let html = "";
    summary.forEach((item, idx) => {
        const statusIcon = item.isCompleted ? '✅' : (currentMode === 'subject' ? '📘' : '📜');
        const orderNo = formatSubjectOrderNo(idx + 1);
        
        const completedClass = item.isCompleted ? ' subject-completed' : ' subject-pending';
        
        html += `<div class="subject-dashboard-item${completedClass}">
    <div class="subject-summary-bar${completedClass}" onclick="toggleDetail('detailBox_${idx}', '${item.name}')">
        <div class="summary-name"><span class="subject-order-no">${orderNo}</span>${statusIcon} ${item.displayTitle}${item.completeBadge}${item.makeupBadge}</div>
        <div class="summary-period">📅 ${item.start} ~ ${item.end}</div>
                <div class="summary-total">⏱️ ${item.min}분</div>
                <div class="summary-total">📊 ${item.hour}h</div>
            </div>
            <div id="detailBox_${idx}" class="detail-view">
                <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                    <div style="display: flex; gap: 15px; margin-right: 20px; font-size: 11px; font-weight: bold; align-items: center;">
                        <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#fff176; border:1px solid #f1c40f; display:inline-block; margin-right:4px;"></i>지각/조퇴</span>
                        <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e8f5e9; border:1px solid #27ae60; display:inline-block; margin-right:4px;"></i>외출</span>
                        <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#ffebee; border:1px solid #e74c3c; display:inline-block; margin-right:4px;"></i>결석</span>
                        <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e3f2fd; border:1px solid #3498db; display:inline-block; margin-right:4px;"></i>공가/휴가/기타</span>
                        <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e0e0e0; border:1px solid #bdc3c7; display:inline-block; margin-right:4px; margin-left:4px;"></i>중도탈락</span>
                    </div>
                    <button class="btn-excel" onclick="saveManualAttendance()" style="background-color: #e67e22 !important; font-size: 12px; padding: 8px 15px;">💾 현재 수정사항 이 과목에 저장</button>
                </div>
                <div class="scroll-box"><table class="attendance-table" id="table_${idx}"><thead id="head_${idx}"></thead><tbody id="body_${idx}"></tbody></table></div>
            </div>
        </div>`;
    });
    area.innerHTML = html;
    updateActionSelect();
}

function toggleDetail(boxId, subName) {
    const box = document.getElementById(boxId);
    const bar = box.previousElementSibling
    if(box.style.display === "block") {
        box.style.display = "none";
        bar.classList.remove('summary-bar-active');
        bar.style.backgroundColor = "";
        // 📍 [수리] 창을 닫을 때 저장해둔 위치로 복귀
        window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
    } else {
        // 모든 창을 닫기 전에 현재 스크롤 위치를 저장 (최초 열 때만 저장)
        if (!document.querySelector('.detail-view[style*="display: block"]')) {
            lastScrollPos = window.pageYOffset;
        }

        document.querySelectorAll('.detail-view').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.subject-summary-bar').forEach(b => {
            b.classList.remove('summary-bar-active');
            b.style.backgroundColor = "";
        });
        
        // 📍 [수리] 창을 열 때 해당 목록에 강조 (CSS summary-bar-active)
        bar.classList.add('summary-bar-active');

        box.style.display = "block";
        loadDetailInto(subName, 'head_' + boxId.split('_')[1], 'body_' + boxId.split('_')[1]);

        setTimeout(() => {
            const item = box.parentElement;
            const offset = 80;
            const targetPos = item.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top: targetPos, behavior: 'smooth' });
        }, 150);
    }
}

async function loadDetailInto(selectedSub, headId, bodyId, mode = 'real') {
    // 공백을 싹 제거하고 비교하도록 엔진을 튜닝합니다.
    const cleanSelected = String(selectedSub).replace(/\s+/g, "");
    
    const dates = [...new Set(rawTimetable.filter(r => {
        const rowVal = (currentMode === 'subject' ? (r.교과목 || "") : (r.능력단위 || ""));
        return String(rowVal).replace(/\s+/g, "") === cleanSelected;
    }).map(r => getFixDate(r.날짜)))].sort();
    
    const manualSnap = await classDbRef('manualAttendance').once('value');
    const manualData = manualSnap.val() || {};
    
    const studentResults = {}, masterSchedule = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    studentNames.forEach(name => studentResults[name] = { dates: {}, totalMin: 0, makeupMin: 0 });

    dates.forEach(date => {
        // 📍 [엔진 개조 1] 26.03.18 (수) 강제 2줄 고정 (글자 쪼개짐 및 3줄 밀림 현상 완벽 방어 프레임 장착)
        const shortDateStr = date.substring(2).replace(/-/g, '.'); 
        dateWithDay[date] = `<span style="display:inline-block; white-space:nowrap; font-size:10.5px; letter-spacing:-0.5px; line-height:1.2;">${shortDateStr}</span><br><span style="display:inline-block; white-space:nowrap; font-size:10px; line-height:1.2;">(${weekDays[new Date(date).getDay()]})</span>`;
        
        masterSchedule[date] = calculateParticipation(date, "09:00", "17:30", selectedSub, "", "");
        
        studentNames.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            // 📍 [정밀 수리] 학생 개인이 아닌 '해당 일자 자체의 출석 등록 여부'로 미래 시뮬레이션 발동 조건 변경
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
    // 여기서 headId와 bodyId가 인쇄용 아이디(pHead, pBody)인지 확인하고 출력합니다.
    renderFinalTable(dates, studentResults, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode);
}

function renderFinalTable(dates, results, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode) {
    const thead = document.getElementById(headId), tbody = document.getElementById(bodyId);
    if (!thead || !tbody) return;

    // [기존 버튼 생성 로직 유지]
    if (headId !== 'pHead') { 
        const parentBox = thead.closest('.detail-view');
        if (parentBox) {
            parentBox.dataset.detailSubject = selectedSub;
            parentBox.dataset.detailMode = mode;
            const legendArea = parentBox.querySelector('div[style*="justify-content: flex-end"]');
            if (legendArea) {
                const safeSub = escapeSubForJsAttr(selectedSub);
                const btnHtml = mode === 'real' 
                    ? `<button type="button" class="ctrl-btn detail-sim-btn" onclick="event.stopPropagation(); loadDetailInto('${safeSub}', '${headId}', '${bodyId}', 'sim'); return false;" style="background:#8e44ad; font-size:11px; padding:5px 10px; margin-right:10px;">🔮 남은일수 출결률 보기</button>`
                    : `<button type="button" class="ctrl-btn detail-sim-btn" onclick="event.stopPropagation(); loadDetailInto('${safeSub}', '${headId}', '${bodyId}', 'real'); return false;" style="background:#34495e; font-size:11px; padding:5px 10px; margin-right:10px;">⏪ 실제 출결만 보기</button>`;
                const existingSimBtn = legendArea.querySelector('.detail-sim-btn');
                if (existingSimBtn) existingSimBtn.remove();
                legendArea.insertAdjacentHTML('afterbegin', btnHtml);

                const saveBtn = legendArea.querySelector('.btn-excel[onclick*="saveManualAttendance"]');
                let printBtn = legendArea.querySelector('.detail-print-btn');
                const printHtml = `<button type="button" class="ctrl-btn detail-print-btn" onclick="event.stopPropagation(); printCurrentDetailSubject('${safeSub}'); return false;" style="background:#34495e; font-size:11px; padding:5px 10px; margin-right:8px; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">📄 PDF 인쇄</button>`;
                if (printBtn) {
                    printBtn.outerHTML = printHtml;
                } else if (saveBtn) {
                    saveBtn.insertAdjacentHTML('beforebegin', printHtml);
                } else {
                    legendArea.insertAdjacentHTML('beforeend', printHtml);
                }
            }
        } else if (headId === 'modalHead') {
            // 📍 [수리] 달력(요일) 보기의 팝업 모달창 액션 구역에도 시뮬레이션 버튼 병렬 연결
            const actionArea = document.getElementById('modalActionArea');
            if (actionArea) {
                const btnHtml = mode === 'real' 
                    ? `<button class="ctrl-btn sim-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'sim')" style="background:#8e44ad; font-size:11px; padding:7px 12px; margin-right:10px; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">🔮 남은일수 출결률 보기</button>`
                    : `<button class="ctrl-btn sim-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'real')" style="background:#34495e; font-size:11px; padding:7px 12px; margin-right:10px; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⏪ 실제 출결만 보기</button>`;
                const existingBtn = actionArea.querySelector('.sim-btn');
                if (existingBtn) existingBtn.remove();
                
                // 기존 '수정사항 저장' 버튼 바로 왼쪽에 예쁘게 이식합니다.
                const saveBtn = actionArea.querySelector('.btn-excel');
                if (saveBtn) {
                    saveBtn.insertAdjacentHTML('beforebegin', btnHtml);
                }
            }
        }
    }

    // [수정 포인트 1] 테이블 헤더 구성 (요일 부분만 하이라이트)
    // 📍 [엔진 개조] 순번 제외 불필요한 좌우 여백 극한 압축 및 훈련일자 공간 팽창 튜닝
    let h1 = `<tr>
        <th rowspan="2" class="sticky-no" style="width: 30px;">No</th>
        <th rowspan="2" class="sticky-col" style="width: 46px !important; min-width: 46px !important; max-width: 46px !important; font-size: 11px; padding: 2px !important;">훈련생명</th>`;
    let h2 = `<tr>`;
    
    dates.forEach(d => { 
        // 클릭한 날짜인지 확인
        const isTarget = (d === window.lastSelectedDate);
        const headStyle = isTarget ? `background:#fff3e0; border:2px solid #e67e22 !important; color:#e67e22;` : `background:#f8f9fa;`;
        const subStyle = isTarget ? `background:#fffef0; font-weight:bold;` : ``;

        h1 += `<th colspan="2" style="${headStyle}">${dateWithDay[d]}</th>`; 
        h2 += `<th style="${subStyle}">오전</th><th style="${subStyle}">오후</th>`; 
    });
    
    // 📍 보강(분) 두 줄 처리 및 너비 축소 (35px)
    h1 += `<th rowspan="2" style="background:#e3f2fd; width: 35px !important; min-width: 35px !important; max-width: 35px !important; font-size: 10.5px; line-height: 1.2; padding: 2px !important;">보강<br>(분)</th>`;
    // 📍 누계 1줄 확보 및 출석률 너비 최소화 (40px)
    h1 += `<th colspan="2" style="font-size: 11px;">누계</th>
           <th rowspan="2" style="width: 40px !important; min-width: 40px !important; max-width: 40px !important; font-size: 11px; letter-spacing: -0.5px; padding: 2px !important;">출석률</th></tr>`; 
    h2 += `<th style="width: 35px; font-size: 11px;">분</th><th style="width: 45px; font-size: 11px;">시간</th></tr>`;
    thead.innerHTML = h1 + h2;

    let masterTotal = 0;
    dates.forEach(d => masterTotal += (masterSchedule[d].am + masterSchedule[d].pm));

    // 📍 편성 시간 텍스트 압축(9px), 자간 축소, 46px 캡슐 안에 가둬서 한 줄 고정
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

    // [수정 포인트 2] 학생 데이터 생성
    let studentHtml = studentNames.map((name, idx) => { 
        let rowTotalMin = 0;
        let dateCells = "";
        
        dates.forEach(d => {
            const res = results[name].dates[d];
            const attInfo = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : {};
            let amV = res.am;
            let pmV = res.pm;
            let cellClass = "";
            const isDropout = isDateOnOrAfterStudentLeave(name, d); // 중도탈락/조기수료 센서

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

            // 📍 [시뮬레이션 개조] 남은 일자(미래 일자)인 경우, 저장되지 않는 '스텔스 인풋창'으로 렌더링합니다.
            // .edit-input 클래스가 없으므로 저장 버튼을 눌러도 DB에 절대 기록되지 않습니다.
            if (!isDropout && res.isFuture) {
                // 📍 [디자인 수리] 점선, 배경, 여백을 모두 날려 순정 표 레이아웃을 100% 보존합니다.
                const simStyle = "width:100%; height:100%; box-sizing:border-box; border:none; background:transparent; color:#8e44ad; font-weight:bold; text-align:center; font-size:11px; padding:0; margin:0; outline:none;";
                dispAm = `<input type="number" class="sim-input" value="${amV}" oninput="calculateRowPercent('${name}', ${masterTotal}, this)" style="${simStyle}" title="시뮬레이션 입력 (저장되지 않음)">`;
                dispPm = `<input type="number" class="sim-input" value="${pmV}" oninput="calculateRowPercent('${name}', ${masterTotal}, this)" style="${simStyle}" title="시뮬레이션 입력 (저장되지 않음)">`;
            }

            dateCells += `<td class="attendance-time-cell ${cellClass}">${dispAm}</td><td class="attendance-time-cell ${cellClass}">${dispPm}</td>`;
        });

        const makeupMin = results[name].makeupMin;
        const finalTotalMin = rowTotalMin + makeupMin;
        const percent = ((finalTotalMin / masterTotal) * 100).toFixed(1);
        
        const subjectLastDate = dates[dates.length - 1]; 
        const isSubjectDropout = isStudentLeaveOnOrBefore(name, subjectLastDate);

        const dropClass = isSubjectDropout ? "status-dropout" : "";
        const statusStyle = isSubjectDropout ? "" : (percent < 75 ? "color:red;" : "color:green;");
        const makeupBg = isSubjectDropout ? "" : "background:#fff3e0;";
        const totalHourStyle = isSubjectDropout ? "" : "color:#27ae60;";
        
        // 📍 보강 입력기 여백(padding) 최소화
        const inputStyle = `width:100%; box-sizing:border-box; padding:2px; text-align:center; font-size:11px; ${isSubjectDropout ? 'background:transparent; color:inherit; border:none; pointer-events:none;' : 'border:1px solid #ccc; border-radius:3px;'}`;

        const makeupDisplay = (headId.startsWith('pHead')) ? makeupMin : 
    `<input type="number" 
        class="edit-input makeup-input makeup-${name}" 
        data-name="${name}" 
        data-sub="${selectedSub}" 
        data-type="makeup" 
        value="${makeupMin}" 
        oninput="this.classList.add('manual-modified'); calculateRowPercent('${name}', ${masterTotal}, this)" 
        style="${inputStyle}" ${isSubjectDropout ? 'readonly tabindex="-1"' : ''}>`;

        // 📍 학생명 너비 완전 고정(46px) 및 누계 칸 1줄 강제 방어선(nowrap) 구축
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
}


// 시뮬레이션 버튼 클릭 시 다시 그리기 위한 헬퍼
function renderSimulation(sub, hId, bId, mode) {
    loadDetailInto(sub, hId, bId).then(() => {
        // 기존 draw 함수를 찾기 위해 다시 호출하거나 로직 분리 필요
        // 간단하게 위해 loadDetailInto 내부에 mode 파라미터를 추가하는 것이 깔끔함
    });
}

function updateStudentTotal(name, inputEl) {
    if (inputEl) { if (inputEl.value === "") inputEl.classList.remove('manual-modified'); else inputEl.classList.add('manual-modified'); }
    const amInputs = document.querySelectorAll(`.am-input-${name}`), pmInputs = document.querySelectorAll(`.pm-input-${name}`);
    let sum = 0;
    amInputs.forEach(input => sum += (parseInt(input.value) || 0));
    pmInputs.forEach(input => sum += (parseInt(input.value) || 0));
    document.getElementById(`totalMin_${name}`).innerText = sum;
    document.getElementById(`totalHour_${name}`).innerText = (sum / 60).toFixed(1) + "h";
}

// [수리 핵심] 엔진 로직: 입/퇴실/외출/복귀 시간을 모두 고려하여 분(Minute)을 산출합니다.
function getParticipationSchedulesForDate(date, targetSub, modeOverride, weeklyKey) {
    if (weeklyKey) {
        return rawTimetable.filter(r => getFixDate(r.날짜) === date && rowMatchesWeeklySubjectKey(r, weeklyKey));
    }
    const activeMode = modeOverride || currentMode;
    return rawTimetable.filter(r => {
        const rowVal = (activeMode === 'subject') ? String(r.교과목 || "") : String(r.능력단위 || "");
        return getFixDate(r.날짜) === date && rowVal.replace(/\s+/g, "") === String(targetSub).replace(/\s+/g, "");
    });
}

function calculateParticipation(date, inTime, outTime, targetSub, leaveTime, returnTime, modeOverride, weeklyKey) {
    if (!inTime || !outTime || inTime.startsWith("00")) return {am:0, pm:0};
    
    const scheds = getParticipationSchedulesForDate(date, targetSub, modeOverride, weeklyKey);

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
                // 📍 [핵심 수리] 점심시간 중복 차감을 '현재 연산 중인 교시(actualEnd, actualStart)' 안에서만 국한하도록 정밀 3중 필터 적용
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

// 1. 설정 저장 함수
async function saveDefaultView(mode) {
    try {
        // 1. 서버(DB) 영구 저장
        await classDbRef('userConfig').update({ defaultView: mode });
        
        // 2. 브라우저 메모리(Local) 즉각 저장
        localStorage.setItem(classStorageKey('defaultViewMode'), mode);
        
        defaultViewMode = mode;
        
        // 📍 [추가] 라디오 버튼 체크 상태를 물리적으로 고정 (UI 동기화)
        const radio = document.querySelector(`input[name="defaultView"][value="${mode}"]`);
        if(radio) radio.checked = true;

        switchTo(mode);
        await appAlert(`✅ 기본 설정이 [${mode === 'subject' ? '교과목별' : '능력단위별'}]로 고정되었습니다.`);
    } catch(e) { 
        await appAlert("저장 실패: " + e.message); 
    }
}

// 2. 메인 탭 제어 함수
function changeMode(mode) {
    syncViewModeToUrl(mode);
    document.querySelectorAll('.tab-menu .tab-btn').forEach(btn => btn.classList.remove('active'));
    const vArea = document.getElementById('viewArea');
    const fRow = document.getElementById('subjectFilterRow');
    const topAction = document.getElementById('topActionArea');
    const subMenu = document.getElementById('mainSubMenu');
    vArea.innerHTML = ""; 

    // 📍 [신규 배선] 다른 탭으로 이동 시 배너 전원 즉시 차단
    const evalBanner = document.getElementById('evalDateBanner');
    if (evalBanner) evalBanner.style.display = 'none';

    if (mode === 'main') {
        document.getElementById('tab_main').classList.add('active');
        subMenu.style.display = 'flex'; // 메인 탭일 때만 서브 메뉴(선택 방식) 노출
        switchTo(defaultViewMode); // 저장된 기본 방식(교과목 or 능력단위)으로 즉시 실행
    } else {
        subMenu.style.display = 'none';
        fRow.style.display = 'none';
        topAction.style.display = 'none';
        if (mode === 'calendar') {
            document.getElementById('tab_calendar').classList.add('active');
            calendarSubMode = defaultViewMode;
            ensureCalendarMonthForToday();
            pendingCalendarScrollToToday = true;
            renderCalendar();
        } else if (mode === 'weekly') {
            document.getElementById('tab_weekly').classList.add('active');
            weeklySubMode = defaultViewMode; 
            renderWeekly();
        }
    }
}

// 3. 내부 스위치 함수 (기존 로직 연결)
function switchTo(mode) {
    currentMode = mode;
    const btnSub = document.getElementById('btn_sub_subject');
    const btnNcs = document.getElementById('btn_sub_ncs');

    // 클래스를 통해 달력/주차별 버튼과 디자인을 완전히 일치시킴
    btnSub.classList.toggle('active', mode === 'subject');
    btnNcs.classList.toggle('active', mode === 'ncs');

    document.getElementById('subjectFilterRow').style.display = 'table-row';
    document.getElementById('topActionArea').style.display = 'block';
    updateActionSelect();
    renderSubjectList('date');
}
function moveMonth(offset) { calMonth += offset; if(calMonth > 11) { calYear++; calMonth = 0; } if(calMonth < 0) { calYear--; calMonth = 11; } renderCalendar(); }

let calendarSubMode = DEFAULT_VIEW_MODE; // 달력 전용 분류 모드 (초기값 = 기본 보기)
let pendingCalendarScrollToToday = false;

function getTodayDateStrKst() {
    const nowKst = new Date();
    const offset = nowKst.getTimezoneOffset() * 60000;
    return new Date(nowKst - offset).toISOString().split('T')[0];
}

function ensureCalendarMonthForToday() {
    if (!rawTimetable.length) return;
    const allDates = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== '날짜미상').sort();
    if (!allDates.length) return;
    const todayStr = getTodayDateStrKst();
    if (todayStr >= allDates[0] && todayStr <= allDates[allDates.length - 1]) {
        const parts = todayStr.split('-');
        calYear = parseInt(parts[0], 10);
        calMonth = parseInt(parts[1], 10) - 1;
    }
}

function scrollCalendarToTodayCell() {
    const todayEl = document.getElementById('calTodayCell');
    if (!todayEl) return;

    const bodyPadTop = parseFloat(getComputedStyle(document.body).paddingTop) || 80;
    const margin = 14;
    const availableH = window.innerHeight - bodyPadTop - margin;
    const cellH = todayEl.getBoundingClientRect().height;
    const block = cellH > availableH ? 'start' : 'center';

    requestAnimationFrame(() => {
        todayEl.scrollIntoView({ behavior: 'smooth', block, inline: 'nearest' });
    });
}

function renderCalendar() {
    const viewArea = document.getElementById('viewArea');
    if (rawTimetable.length === 0) { viewArea.innerHTML = "<p style='text-align:center; padding:50px;'>데이터 로드 중...</p>"; return; }
    
    // 📍 [개조] 시작/종료일 및 훈련일 전체 스캔 (스마트 멘트 엔진용)
    globalFirstDateMap = {};
    globalLastDateMap = {};
    const allBusinessDays = new Set();
    const tempSubDates = {}; // 📍 [추가] 과목별 모든 수업일 임시 보관소

    rawTimetable.forEach(r => {
        if (!isStudyTimetableRow(r)) return;
        const sub = getTimetableDisplayName(r, calendarSubMode);
        if (!sub) return;

        const d = getFixDate(r.날짜);
        allBusinessDays.add(d);
        if (!tempSubDates[sub]) tempSubDates[sub] = new Set();
        tempSubDates[sub].add(d);
        if (!globalLastDateMap[sub] || d > globalLastDateMap[sub]) { globalLastDateMap[sub] = d; }
    });
    globalSortedBusinessDays = Array.from(allBusinessDays).sort();
    
    // 📍 [핵심 수리] 11일차(확정자 보고 기간 이후) 기준 유효 첫 수업일 산출 모터 가동
    const targetStartDay = globalSortedBusinessDays.length >= 11 ? globalSortedBusinessDays[10] : "0000-00-00";
    for (const sub in tempSubDates) {
        const sortedDates = Array.from(tempSubDates[sub]).sort();
        // 11일차(인덱스 10) 이후에 진행된 첫 수업일을 찾습니다.
        const effectiveDates = sortedDates.filter(d => d >= targetStartDay);
        // 11일차 이후 수업이 있으면 그 날을 첫 날로, 없으면(짧은 과정) 절대적인 첫 날을 지정합니다.
        globalFirstDateMap[sub] = effectiveDates.length > 0 ? effectiveDates[0] : sortedDates[0];
    }

    const lastDateMap = globalLastDateMap; // 기존 UI 호환성 유지

    let calHtml = `
        <div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px; display:flex; align-items:center; gap:15px; justify-content: center; flex-wrap:wrap;">
            <span style="font-weight:bold; color:#1b5e20;">🔎 달력 표시 기준:</span>
            <button onclick="calendarSubMode='subject'; renderCalendar();" class="tab-btn ${calendarSubMode === 'subject' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">교과목별</button>
            <button onclick="calendarSubMode='ncs'; renderCalendar();" class="tab-btn ${calendarSubMode === 'ncs' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">능력단위별</button>
            
            <button onclick="autoRegisterEvalFromTimetable()" style="background:#8e44ad; color:white; border:none; border-radius:4px; padding:6px 15px; font-weight:bold; cursor:pointer; margin-left:10px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">📅 시간표 평가일 등록</button>
            <button onclick="autoRegisterEvaluationDates()" style="background:#e67e22; color:white; border:none; border-radius:4px; padding:6px 15px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">⚡ 종료일 자동 등록</button>
            <button onclick="clearEvaluationDates()" style="background:#c0392b; color:white; border:none; border-radius:4px; padding:6px 15px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.1);">🗑️ 전체 삭제</button>
            
            <div style="width:100%; text-align:center; margin-top:5px; font-size:12px; color:#666;">💡 <b style="color:#f39c12;">날짜 숫자</b>를 클릭하면 수동으로 평가 일정을 켜고 끌 수 있습니다.</div>
        </div>
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
    
    // 1. [센서] 오늘 날짜 감지 (KST 기준)
    const todayStr = getTodayDateStrKst();
    const isToday = (targetDate === todayStr);

    // 2. [센서] 평가일 감지 (모드별 분리 센서 적용)
    const isEvalDay = evaluationDates[calendarSubMode] && evaluationDates[calendarSubMode][targetDate];
    
    // 3. [스타일] 평가일=노란 배경 / 오늘=테두리·링 효과만 (배경색 변경 없음)
        let dayStyle = "";
        if (isEvalDay) {
            dayStyle = `background-color: #fffde7 !important; border: 2px solid #f1c40f !important;`;
        }
    
    const evalBadge = isEvalDay ? `<span style="font-size:10px; color:#e67e22; font-weight:bold; margin-left:5px;">📢 평가일</span>` : "";
    const classNames = `calendar-day ${dayType === 0 ? 'sun' : dayType === 6 ? 'sat' : ''}${isToday ? ' calendar-day-today' : ''}${isEvalDay ? ' calendar-day-eval' : ''}`;
        let weekBadge = ""; if(dayType === 0) { currentDate.setHours(0,0,0,0); if(currentDate >= startSunday && currentDate <= endSunday) { const weekNum = Math.floor((currentDate - startSunday) / (1000 * 60 * 60 * 24 * 7)) + 1; weekBadge = `<div style="font-size:10px; color:#27ae60; background:#e8f5e9; padding:2px 4px; border-radius:3px; display:inline-block; margin-left:5px;">(${weekNum}주차)</div>`; } }
        
        const amData = {}; 
        const pmData = {}; 
        const holidays = new Set();
        let hasClassToday = false;

        rawTimetable.forEach(r => { 
            if(getFixDate(r.날짜) !== targetDate) return;
            const period = String(r.교시).trim();
            if(period === "점심") return;

            if(isStudyTimetableRow(r)) {
                const sub = getTimetableDisplayName(r, calendarSubMode);
                if(!sub) return;
                hasClassToday = true;
                if(['1','2','3','4'].includes(period)) amData[sub] = (amData[sub] || 0) + 1;
                else if(['5','6','7','8'].includes(period)) pmData[sub] = (pmData[sub] || 0) + 1;
            } else {
                const holidayLabel = getHolidayLabelFromRow(r);
                if(holidayLabel) holidays.add(holidayLabel);
            }
        });

        const attBadge = fullAttendanceData[targetDate] ? `<span style="font-size:10px; color:#27ae60; background:#e8f5e9; padding:2px 5px; border-radius:10px; border:1px solid #27ae60; margin-left:5px; vertical-align:middle;">✔️ 완료</span>` : "";
        
        let dayContent = "";
        const amKeys = Object.keys(amData);
        const pmKeys = Object.keys(pmData);
        
        // 오전과 오후 과목이 완전히 동일한지 감지
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
            // 전일 동일 과목
            amKeys.forEach(s => dayContent += createTag(s, amData[s] + pmData[s], "[전일] "));
        } else {
            // 오전/오후 분할 과목
            amKeys.forEach(s => dayContent += createTag(s, amData[s], "[오전] "));
            pmKeys.forEach(s => dayContent += createTag(s, pmData[s], "[오후] "));
        }
        
        dayContent += Array.from(holidays).map(h => `<span class="holiday-tag">${h}</span>`).join('');

        // 📍 [개조] 특별 멘트 사전 탐지 센서 작동 및 동적 아이콘(⭐/📜) 스위치 적용 (DB 평가일 동기화 완료)
        let hasSpecialMsg = false;
        if (hasClassToday) {
            const evalDatesObj = evaluationDates[calendarSubMode] || {};
            const todaySubs = new Set([...Object.keys(amData), ...Object.keys(pmData)]);
            
            // 조건 1: 신규 시작 과목 탐지 (기존 유지)
            todaySubs.forEach(sub => {
                if (globalFirstDateMap[sub] === targetDate) {
                    hasSpecialMsg = true;
                }
            });
            
            // 조건 2: 당일 평가일 탐지 (DB 스캔)
            if (evalDatesObj[targetDate]) {
                hasSpecialMsg = true;
            }
            
            // 조건 3: 다음 훈련일 평가 예보 탐지 (DB 스캔)
            const currentIdx = globalSortedBusinessDays.indexOf(targetDate);
            if (currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
                const nextBDate = globalSortedBusinessDays[currentIdx + 1];
                if (evalDatesObj[nextBDate]) {
                    hasSpecialMsg = true;
                }
            }
        }
        
        // 탐지 결과에 따라 아이콘 출력
        const btnIcon = hasSpecialMsg ? "⭐" : "📜";
        // 📍 [신규 부품] 훈련일지 팝업 버튼(📝) 장착
        // 📍 [정밀 수리] 브라우저 포커스 테두리(outline:none) 제거 및 크기 복원 자동화(onmouseleave, onblur) 배선 추가
        const logBtn = hasClassToday ? `<button onclick="openTrainingLog('${targetDate}', event)" style="background:none; border:none; outline:none; cursor:pointer; font-size:16px; padding:0; margin-right:5px; line-height:1; transition:transform 0.1s;" title="일일 훈련일지 보기" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" onblur="this.style.transform='scale(1)'">📝</button>` : "";
        const scrollBtn = hasClassToday ? `<button onclick="openSmartMemo('${targetDate}', event)" style="background:none; border:none; outline:none; cursor:pointer; font-size:16px; padding:0; margin:0; line-height:1; transition:transform 0.1s;" title="스마트 지능형 멘트 생성" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" onblur="this.style.transform='scale(1)'">${btnIcon}</button>` : "";

        const todayIdAttr = isToday ? ' id="calTodayCell"' : '';

        calHtml += `<div class="${classNames}"${todayIdAttr} style="${dayStyle} display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <div class="day-num" style="cursor:pointer; margin-bottom: 0;" onclick="toggleEvaluationDate('${targetDate}')">
                    ${d}${weekBadge}${attBadge}${evalBadge}
                </div>
                <div>${logBtn}${scrollBtn}</div>
            </div>
            <div style="flex: 1; display:flex; flex-direction:column; justify-content:flex-end;">
                ${dayContent}
            </div>
        </div>`;
}
    const nextCells = (firstDay + lastDate) % 7 === 0 ? 0 : 7 - ((firstDay + lastDate) % 7);
    for(let i = 1; i <= nextCells; i++) { calHtml += `<div class="calendar-day" style="opacity: 0.4; background: #f9f9f9;"><div class="day-num">${i}</div></div>`; }
    calHtml += `</div>`; viewArea.innerHTML = calHtml;
    
    // 📍 [신규 배선] 달력이 다 그려진 직후 배너 동기화 엔진 가동
    updateEvalBanner();

    if (pendingCalendarScrollToToday) {
        pendingCalendarScrollToToday = false;
        setTimeout(scrollCalendarToTodayCell, 120);
    }
}

async function renderWeekly() { 
    const viewArea = document.getElementById('viewArea'); 
    if (rawTimetable.length === 0) return;
    
    // [보강 감지 센서용] 수동 출석 데이터 미리 확보
    const manualSnap = await classDbRef('manualAttendance').once('value');
    const manualData = manualSnap.val() || {};

    const weeklyData = {}; 
    const allDatesArr = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== "날짜미상").sort();
    const firstDate = new Date(allDatesArr[0]); 
    const startSunday = new Date(firstDate); 
    startSunday.setDate(firstDate.getDate() - firstDate.getDay()); 
    startSunday.setHours(0,0,0,0);

    let totalAllWeeksTime = 0;
    const allUniqueSubjects = new Set();
    const globalSubLastDateMap = {};
    const subjectTotalHours = {}; // 📍 [추가] 과목별 총 편성 시간 집계용 메모리

    // 데이터 집계 로직
    rawTimetable.forEach(row => {
        if(!isStudyTimetableRow(row)) return;
        const sub = getWeeklySubjectKeyFromRow(row);
        if(!sub) return;

        const currentDate = new Date(getFixDate(row.날짜)); 
        currentDate.setHours(0,0,0,0);
        const week = Math.floor(Math.floor((currentDate - startSunday) / (1000 * 60 * 60 * 24)) / 7) + 1;
        if(!weeklyData[week]) { 
            weeklyData[week] = { totalHours: 0, subjectMap: {}, subjectDatesMap: {}, hasSundayClass: false, hasSaturdayClass: false, period: '', dates: new Set() }; 
        }
        const dow = currentDate.getDay();
        if (dow === 0) weeklyData[week].hasSundayClass = true;
        if (dow === 6) weeklyData[week].hasSaturdayClass = true;
        weeklyData[week].totalHours++; 
        weeklyData[week].subjectMap[sub] = (weeklyData[week].subjectMap[sub] || 0) + 1;
        if (!weeklyData[week].subjectDatesMap[sub]) weeklyData[week].subjectDatesMap[sub] = new Set();
        weeklyData[week].subjectDatesMap[sub].add(getFixDate(row.날짜));
        weeklyData[week].dates.add(getFixDate(row.날짜));
        totalAllWeeksTime++;
        allUniqueSubjects.add(sub);
        
        subjectTotalHours[sub] = (subjectTotalHours[sub] || 0) + 1;

        const d = getFixDate(row.날짜);
        if (!globalSubLastDateMap[sub] || d > globalSubLastDateMap[sub]) {
            globalSubLastDateMap[sub] = d;
        }
    });

    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => parseInt(a) - parseInt(b));
    sortedWeeks.forEach(w => {
        const entry = weeklyData[w];
        entry.period = buildWeeklyPeriodLabel(parseInt(w, 10), startSunday, entry.hasSundayClass, entry.hasSaturdayClass);
    });
    let cumulativeTracker = {}; // 📍 [추가] 주차별 이전 누계 추적 엔진 가동 준비
    
    let html = `
        <div style="margin-bottom:15px; font-weight:bold; color:#2c3e50; text-align:center;">💡 과목명을 클릭하면 상세 출석부가 열립니다. (ESC: 닫기 / Tab: 다음 과목)</div>`;

    html += `<table class="attendance-table weekly-view-table" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                <colgroup><col style="width: 15%;"><col style="width: 70%;"><col style="width: 15%;"></colgroup>
                <thead>
                    <tr style="background:#2c3e50; color:white;">
                        <th>주차 (총 ${sortedWeeks.length}주)</th>
                        <th>
                            진행 과목 · 교과목+능력단위 (총 ${allUniqueSubjects.size}개)<br>
                            <span style="font-size:11px; font-weight:normal; color:#bdc3c7; letter-spacing:-0.5px;">'총 N H / 누적 N H / 주간 N H'</span>
                        </th>
                        <th>합계 (총 ${totalAllWeeksTime}h)</th>
                    </tr>
                </thead>
                <tbody>`;

    sortedWeeks.forEach(w => { 
        const d = weeklyData[w]; 
        const dateList = Array.from(d.dates).join(','); 
        const subTexts = Object.entries(d.subjectMap).sort((a, b) => compareWeeklySubjectKeys(a[0], b[0])).map(([n, h]) => {
            const displayNameHtml = getWeeklySubjectNameHtml(n);
            const safeKey = escapeSubForJsAttr(n);
            
            // 선생님께서 상세 창에 부여하신 그 조건 그대로 작동합니다
            const isLastWeekForSub = d.dates.has(globalSubLastDateMap[n]);
            
            const lastBadge = isLastWeekForSub
                ? `<span class="weekly-last-badge" title="이 과목의 마지막 수업이 있는 주차">🏁 마지막</span>`
                : "";

            let makeupBadge = "";
            if (isLastWeekForSub) {
                let hasMakeup = false;
                const escapedSub = parseWeeklySubjectKey(n).unitRaw.replace(/[\.\#\$\/\[\]]/g, "_");
                Object.values(manualData).forEach(user => {
                    if (user[`makeup_${escapedSub}`] > 0) hasMakeup = true;
                });
                if (hasMakeup) {
                    makeupBadge = `<span class="weekly-makeup-complete-badge" title="마지막 수업 주차 · 보강 시간 입력됨">✓ 보강완료</span>`;
                }
            }

            // 📍 [신규 시간 연산 엔진] (해당 주 시간) / (이전 누계) / (과목 총 시간) 계산 및 출력
            const prevCumulative = cumulativeTracker[n] || 0; // 이전 주차까지의 누계 시간 추출
            const totalH = subjectTotalHours[n] || 0; // 과목의 총 편성 시간
            cumulativeTracker[n] = prevCumulative + h; // 이번 주 시간을 누계에 가산하여 다음 주차로 이관

            const isAttComplete = isWeeklySubjectAttendanceComplete(n, d);
            const attCompleteBadge = isAttComplete
                ? `<span class="weekly-att-complete-badge" title="이번 주 해당 과목 수업일 출석 정보 입력 완료">✅ 출석완료</span>`
                : "";
            const linkExtraClass = isAttComplete ? " weekly-subject-att-complete" : "";

            // 📍 [표시 순서] 총시간 → 누적편성 → 주간편성 (동일 박스, 색상 구분)
            return `<span class="weekly-subject-link${linkExtraClass}" onclick="showWeeklySubjectDetail('${safeKey}', '${dateList}', '${w}', this)">
                <span class="sub-name-block">${displayNameHtml}</span>
                <span class="weekly-subj-hours">
                    <span class="weekly-hour-total" title="전체 편성 시간">총 ${totalH} H</span>
                    <span class="weekly-hour-sep">/</span>
                    <span class="weekly-hour-cumul" title="이전 주차까지 누적 편성">누적 ${prevCumulative} H</span>
                    <span class="weekly-hour-sep">/</span>
                    <span class="weekly-hour-week" title="이번 주차 편성"><span class="weekly-hour-week-label">주간</span><span class="weekly-hour-week-num">${h}</span><span class="weekly-hour-week-unit">H</span></span>
                </span>
                ${attCompleteBadge}${lastBadge}${makeupBadge}
            </span>`;
        }).join(''); 

        // 📍 [튜닝] 전체 주차 숨김/복구를 위한 ID와 Class 식별자 장착
        // 📍 [디자인 튜닝] 주차 표시와 합계 시간의 글자 크기를 강제 확장(!important)하여 시인성 극대화
        html += `<tr id="weeklyHeaderRow_${w}" class="weekly-header-row" style="border-bottom: 1px solid #ddd;">
                    <td style="background:#f8f9fa;">
                        <strong style="font-size: 25px !important; color: #2c3e50;">${w}주</strong><br>
                        <small style="font-size: 20px !important; color: #666; letter-spacing: -0.5px;">${d.period}</small>
                    </td>
                    <td style="text-align:left; padding:12px 15px;">${subTexts}</td>
                    <td style="color:#e67e22; font-weight:bold; font-size: 25px !important;">${d.totalHours}h</td>
                 </tr>
                 <tr id="weeklyDetailRow_${w}" style="display:none;">
                    <td colspan="3" id="weeklyDetailArea_${w}" class="weekly-detail-area"></td>
                 </tr>`;
    });
    html += `</tbody></table>`;
    viewArea.innerHTML = html;
}

async function saveManualAttendance() {
    const allInputs = document.querySelectorAll('.edit-input'), manualUpdate = {}; 
    let hasChange = false;
    
    // 파이어베이스 금지 문자 제거용 함수 (내부 헬퍼)
    const escapeFirebaseKey = (key) => {
        if (!key) return "unknown";
        return key.replace(/[\.\#\$\/\[\]]/g, "_"); // . # $ / [ ] 문자를 _로 치환
    };

    allInputs.forEach(input => {
        if (input.classList.contains('manual-modified')) {
            const name = input.getAttribute('data-name');
            const sub = input.getAttribute('data-sub'); 
            const escapedSub = escapeFirebaseKey(sub); // 📍 과목명 특수문자 치환

            if (!manualUpdate[name]) manualUpdate[name] = {};

            if (input.classList.contains('makeup-input')) {
                manualUpdate[name][`makeup_${escapedSub}`] = parseInt(input.value) || 0;
                hasChange = true;
            } 
            else {
                const date = input.getAttribute('data-date');
                const type = input.getAttribute('data-type');
                if (date && type) {
                    if (!manualUpdate[name][date]) manualUpdate[name][date] = {};
                    manualUpdate[name][date][type] = parseInt(input.value);
                    manualUpdate[name][date][type + "_manual"] = true;
                    hasChange = true;
                }
            }
        }
    });

    if (!hasChange) return await appAlert("수정된 데이터가 없습니다.");
    if (!await appConfirm("변경사항을 서버에 저장하시겠습니까?")) return;

    try {
        for (const stdName in manualUpdate) {
            await classDbRef(`manualAttendance/${stdName}`).update(manualUpdate[stdName]);
        }
        await appAlert("✅ 모든 데이터가 안전하게 저장되었습니다.");
        reloadWithCurrentView();
    } catch (e) {
        await appAlert("❌ 저장 실패: " + e.message);
    }
}
// 주차별 특정 과목 클릭 시 상세 내역 출력 함수
let currentWeeklyOpenSub = null; // 현재 어떤 과목이 열려있는지 추적하는 센서
let weeklyDetailSwitchMode = null; // Tab/방향키 연속 이동 시 'sequential'
const WEEKLY_DETAIL_ANIM_MS = 340;

function getOpenWeeklyDetailRow() {
    return document.querySelector('[id^="weeklyDetailRow_"][style*="display: table-row"], [id^="weeklyDetailRow_"][style*="display:table-row"]');
}

function restoreWeeklyViewportAnchor(anchorTop, detailRow, fallbackScrollY) {
    requestAnimationFrame(() => {
        if (detailRow && anchorTop !== null) {
            const delta = detailRow.getBoundingClientRect().top - anchorTop;
            if (Math.abs(delta) > 1) {
                window.scrollBy({ top: delta, behavior: 'instant' });
            }
        } else if (fallbackScrollY !== null) {
            window.scrollTo({ top: fallbackScrollY, behavior: 'instant' });
        }
    });
}

function closeWeeklyDetailRowEl(detailRow, animate = true) {
    if (!detailRow || detailRow.style.display === 'none') return Promise.resolve();
    const detailArea = detailRow.querySelector('[id^="weeklyDetailArea_"]');
    if (!detailArea) {
        detailRow.style.display = 'none';
        return Promise.resolve();
    }
    if (!animate) {
        detailArea.classList.remove('weekly-detail-open', 'weekly-detail-closing');
        detailRow.style.display = 'none';
        detailArea.innerHTML = '';
        return Promise.resolve();
    }
    detailArea.classList.remove('weekly-detail-open');
    detailArea.classList.add('weekly-detail-closing');
    return new Promise(resolve => {
        setTimeout(() => {
            detailRow.style.display = 'none';
            detailArea.classList.remove('weekly-detail-closing');
            detailArea.innerHTML = '';
            resolve();
        }, WEEKLY_DETAIL_ANIM_MS);
    });
}

function openWeeklyDetailRowEl(detailRow, instant = false) {
    const detailArea = detailRow.querySelector('[id^="weeklyDetailArea_"]');
    detailRow.style.display = 'table-row';
    detailArea.classList.remove('weekly-detail-closing');
    if (instant) {
        detailArea.classList.add('weekly-detail-open');
        return;
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => detailArea.classList.add('weekly-detail-open'));
    });
}

function closeOtherWeeklyDetailRows(keepWeekNum, animate = true) {
    const jobs = [];
    document.querySelectorAll('[id^="weeklyDetailRow_"]').forEach(row => {
        const weekNum = row.id.replace('weeklyDetailRow_', '');
        if (keepWeekNum !== null && weekNum === String(keepWeekNum)) return;
        if (row.style.display !== 'none') jobs.push(closeWeeklyDetailRowEl(row, animate));
    });
    return Promise.all(jobs);
}

function alignWeeklyHeaderToCenter(weekNum) {
    const header = document.getElementById(`weeklyHeaderRow_${weekNum}`);
    if (!header) return;
    const rect = header.getBoundingClientRect();
    const delta = (rect.top + rect.height / 2) - (window.innerHeight / 2);
    if (Math.abs(delta) > 48) {
        window.scrollBy({ top: delta, behavior: 'smooth' });
    }
}

function revealWeeklyDetailIfNeeded(weekNum) {
    const header = document.getElementById(`weeklyHeaderRow_${weekNum}`);
    const detailRow = document.getElementById(`weeklyDetailRow_${weekNum}`);
    if (!header || !detailRow || detailRow.style.display === 'none') return;
    const detailRect = detailRow.getBoundingClientRect();
    if (detailRect.bottom > window.innerHeight - 24) {
        window.scrollBy({ top: detailRect.bottom - window.innerHeight + 48, behavior: 'smooth' });
    } else if (header.getBoundingClientRect().top < 72) {
        window.scrollBy({ top: header.getBoundingClientRect().top - 96, behavior: 'smooth' });
    }
}

async function showWeeklySubjectDetail(subKey, dateListStr, weekNum, element) {
    const subName = getWeeklySubjectLabelFromKey(subKey);
    const { unitRaw } = parseWeeklySubjectKey(subKey);
    const targetDates = dateListStr.split(',').sort();
    const isSequentialNav = weeklyDetailSwitchMode === 'sequential';
    if (isSequentialNav) weeklyDetailSwitchMode = null;

    const openRowBefore = getOpenWeeklyDetailRow();
    const preserveViewport = isSequentialNav && !!openRowBefore;
    const viewportAnchorTop = preserveViewport && openRowBefore
        ? openRowBefore.getBoundingClientRect().top
        : null;
    const savedScrollY = preserveViewport ? window.scrollY : null;
    const preservedPanelHeight = preserveViewport && openRowBefore
        ? (openRowBefore.querySelector('[id^="weeklyDetailArea_"]')?.offsetHeight || 0)
        : 0;
    
    // 📍 [신규 센서] 이미 열려있는(활성화된) 과목을 한 번 더 클릭하면 창을 닫고 연산 완전 종료
    if (element && element.classList.contains('active-sub')) {
        closeWeeklyDetail();
        return;
    }

    // 1. 모든 과목명에서 강조색 제거 및 현재 요소에만 강조색 부여
    document.querySelectorAll('.weekly-subject-link').forEach(el => el.classList.remove('active-sub'));
    if(element) {
        element.classList.add('active-sub');
        window.currentWeeklyOpenSub = element;
    }

    await closeOtherWeeklyDetailRows(weekNum, !preserveViewport);

    const detailRow = document.getElementById(`weeklyDetailRow_${weekNum}`);
    const detailArea = document.getElementById(`weeklyDetailArea_${weekNum}`);
    const isSameRowOpen = detailRow.style.display === 'table-row';

    if (!isSameRowOpen) {
        openWeeklyDetailRowEl(detailRow, preserveViewport);
    } else {
        detailArea.classList.add('weekly-detail-open');
    }

    if (preserveViewport && preservedPanelHeight > 0) {
        detailArea.style.minHeight = preservedPanelHeight + 'px';
    }

    // Tab/방향키 이동: 같은 주차는 기존 출석부 유지 / 다른 주차는 높이만 맞춰 로딩
    if (!(preserveViewport && isSameRowOpen)) {
        detailArea.innerHTML = `<div style="padding:15px; text-align:center;">⌛ [${subName}] 데이터를 분석 중입니다...</div>`;
    }

    if (preserveViewport && !isSameRowOpen) {
        restoreWeeklyViewportAnchor(viewportAnchorTop, detailRow, savedScrollY);
    }

    const manualSnap = await classDbRef('manualAttendance').once('value');
    const manualData = manualSnap.val() || {};
    const studentResults = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    
    let maxWeekMin = 0;
    const weekSchedule = {};
    studentNames.forEach(name => studentResults[name] = { dates: {}, totalMin: 0 });

    const actualSubjectDates = targetDates.filter(date => {
        return rawTimetable.some(r => getFixDate(r.날짜) === date && rowMatchesWeeklySubjectKey(r, subKey));
    });

    // 📍 [신규 부품 1] 해당 과목의 전체 수업일 중 '가장 마지막 날짜' 추적
    const allSubDates = rawTimetable.filter(r => rowMatchesWeeklySubjectKey(r, subKey))
        .map(r => getFixDate(r.날짜)).sort();
    const absoluteLastDate = allSubDates[allSubDates.length - 1];

    // 📍 [신규 부품 2] 현재 렌더링 중인 주차에 '마지막 날짜'가 포함되어 있는지 판별 (마지막 주차 센서)
    const isLastWeek = actualSubjectDates.includes(absoluteLastDate);
    const escapedSub = unitRaw.replace(/[\.\#\$\/\[\]]/g, "_"); // 보강 데이터 조회용(능력단위 키)

    actualSubjectDates.forEach(date => {
        // 📍 [엔진 개조 2] 주차별 보기에서도 날짜 공간 완벽 압축 및 강제 줄바꿈 방지
        const shortDateStr = date.substring(2).replace(/-/g, '.'); 
        dateWithDay[date] = `<span style="display:inline-block; white-space:nowrap; font-size:10.5px; letter-spacing:-0.5px; line-height:1.2;">${shortDateStr}</span><br><span style="display:inline-block; white-space:nowrap; font-size:10px; line-height:1.2;">(${weekDays[new Date(date).getDay()]})</span>`;
        
        const daySched = calculateParticipation(date, "09:00", "17:30", "", "", "", null, subKey);
        const dayTotal = daySched.am + daySched.pm;
        weekSchedule[date] = dayTotal;
        maxWeekMin += dayTotal;

        studentNames.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            let calc = { am: 0, pm: 0 };
            if (att && att.inTime && att.outTime) {
                calc = calculateParticipation(date, att.inTime, att.outTime, "", "", "", null, subKey);
            }
            if (manualData[name] && manualData[name][date]) {
                if (manualData[name][date].am !== undefined) calc.am = manualData[name][date].am;
                if (manualData[name][date].pm !== undefined) calc.pm = manualData[name][date].pm;
            }
            // 📍 [추가] 중도탈락자는 주차 누적 합계에서 완전히 제외
            if (isDateOnOrAfterStudentLeave(name, date)) {
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

        // 📍 [엔진 개조 1] 테이블 머리글에 No(순번) 컬럼 추가
        let html = `<div style="background:#fff; padding:15px; border:1px solid #3498db; border-radius:4px; box-shadow: inset 0 0 10px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div style="font-weight:bold; color:#2980b9; font-size:16px;">🔍 ${weekNum}주차 상세: ${subName} <span style="margin-left:15px; color:#e67e22; font-size:13px;">(주간 편성: ${formatMin(maxWeekMin)})</span></div>
                <button onclick="closeWeeklyDetail()" style="padding:3px 8px; cursor:pointer; background:#95a5a6; color:white; border:none; border-radius:3px; font-size:12px;">창 닫기 ✖</button>
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

        // 해당 주차에 진행되는 과목의 '첫 번째 수업일' 감지 센서
        const firstDateOfWeekSub = actualSubjectDates.length > 0 ? actualSubjectDates[0] : "9999-99-99";
        
        // 📍 [신규 부품] 화면에 표시되는 실제 학생 수 카운터 (탈락자 건너뛰기용)
        let visibleIdx = 1;

        studentNames.forEach(name => {
            // 주차별 명단 완전 탈거 필터 가동
            if (isStudentLeaveOnOrBefore(name, firstDateOfWeekSub)) {
                return; // 여기서 튕겨나가면 아래의 visibleIdx 번호는 올라가지 않습니다.
            }

            const tMin = studentResults[name].totalMin;
            
            // 과목 전체 종료일 기준 탈락 여부 연동
            const isSubjectDropout = isStudentLeaveOnOrBefore(name, absoluteLastDate);
            
            // 순정 클래스(status-dropout) 적용
            const dropClass = isSubjectDropout ? "status-dropout" : "";
            const statusText = isSubjectDropout ? `<span style="font-weight:bold;">탈락</span>` : ((tMin < maxWeekMin) ? `<span style="color:#d35400; font-weight:bold;">부족</span>` : `<span style="color:#27ae60;">이수</span>`);

            // 보강 텍스트 센서
            let makeupMin = 0;
            if (manualData[name] && manualData[name][`makeup_${escapedSub}`]) {
                makeupMin = parseInt(manualData[name][`makeup_${escapedSub}`]) || 0;
            }
            const makeupColor = isSubjectDropout ? "inherit" : "#e67e22";
            const makeupText = (isLastWeek && makeupMin > 0) ? `<br><span onclick="copyMakeupDetails('${name}', '${escapedSub}', this, event)" style="color:${makeupColor}; font-size:10.5px; font-weight:bold; cursor:pointer; text-decoration:underline;" title="클릭 시 보강 내역 텍스트 복사">(보강 ${formatMin(makeupMin)})</span>` : "";

            // 📍 [엔진 개조 2] 표의 첫 번째 열에 순번(visibleIdx) 조립 및 번호 증가(++)
            html += `<tr class="${!isSubjectDropout && tMin < maxWeekMin ? 'row-insufficient' : ''}">
                <td class="sticky-no ${dropClass}">${visibleIdx++}</td>
                <td class="weekly-std-name sticky-col ${dropClass}">${name}</td>
                <td class="weekly-std-total ${dropClass}">${formatMin(tMin)}${makeupText}</td>`; 
            
            actualSubjectDates.forEach(d => {
            const res = studentResults[name].dates[d] || { am: 0, pm: 0 };
            const isDropout = isDateOnOrAfterStudentLeave(name, d); // 📍 주차별 탈락/조기수료 감지
            
            const dispAm = isDropout ? "-" : res.am;
            const dispPm = isDropout ? "-" : res.pm;
            const dClass = isDropout ? "status-dropout" : "";
            
            html += `<td class="${dClass}">${dispAm}</td><td class="${dClass}">${dispPm}</td>`;
        });
        
        // 📍 상태 칸에도 dropClass를 부여하여 색상 통일
        html += `<td class="${dropClass}">${statusText}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    
    detailArea.innerHTML = html;
    detailArea.classList.add('weekly-detail-open');
    detailArea.style.minHeight = '';

    if (preserveViewport) {
        restoreWeeklyViewportAnchor(viewportAnchorTop, detailRow, savedScrollY);
    } else {
        setTimeout(() => revealWeeklyDetailIfNeeded(weekNum), WEEKLY_DETAIL_ANIM_MS);
    }
}

// 📍 [신규 모터] 주차별 상세 창 닫기
async function closeWeeklyDetail() {
    const openRow = document.querySelector('[id^="weeklyDetailRow_"][style*="display: table-row"], [id^="weeklyDetailRow_"][style*="display:table-row"]');
    let targetWeekNum = null;
    if (openRow) {
        targetWeekNum = openRow.id.replace('weeklyDetailRow_', '');
    }

    document.querySelectorAll('.weekly-subject-link').forEach(el => el.classList.remove('active-sub'));

    if (openRow) {
        await closeWeeklyDetailRowEl(openRow, true);
    }

    if (targetWeekNum) {
        setTimeout(() => alignWeeklyHeaderToCenter(targetWeekNum), 40);
    }
}

// 보강 시간 및 남은 일자 시뮬레이션 입력 시 실시간으로 출석률을 계산하는 통합 엔진
function calculateRowPercent(name, masterTotal, inputEl) {
    // [안전장치 1] 분모가 0이거나 데이터가 없으면 엔진 가동 중단
    if (!masterTotal || masterTotal <= 0) {
        console.warn(`⚠️ [${name}] 과목의 편성 시간이 0분으로 감지되어 실시간 계산을 중지합니다.`);
        return; 
    }

    if (!inputEl) return;
    const row = inputEl.closest('tr');

    // 📍 [수리 핵심] 어떤 input을 건드리든, 해당 행 전체의 '보강값'을 찾아옵니다.
    const makeupInput = row.querySelector('.makeup-input');
    const makeupValue = makeupInput ? (parseInt(makeupInput.value) || 0) : 0;

    const cells = row.querySelectorAll('td');
    let rowSum = 0;

    // [안전장치 2] 순번(0), 이름(1)을 제외하고, 뒷부분 지표 칸(length - 4) 전까지 순회
    for (let i = 2; i < cells.length - 4; i++) {
        const cell = cells[i];
        const simInput = cell.querySelector('.sim-input');
        
        // 📍 스텔스 인풋창(시뮬레이터)이 있으면 그 안의 값을, 없으면 일반 텍스트를 더합니다.
        if (simInput) {
            rowSum += (parseInt(simInput.value) || 0);
        } else {
            rowSum += (parseInt(cell.innerText) || 0);
        }
    }

    const finalSum = rowSum + makeupValue;
    const percent = ((finalSum / masterTotal) * 100).toFixed(1);
    
    // 전역 ID가 아닌 현재 행(row) 내부에서만 타겟을 잡아냅니다.
    const totalMinEl = row.querySelector(`[id^="totalMin_"]`);
    const totalHourEl = row.querySelector(`[id^="totalHour_"]`);
    const percentEl = row.querySelector(`[id^="percent_"]`);

    if (totalMinEl) totalMinEl.innerText = finalSum;
    if (totalHourEl) totalHourEl.innerText = (finalSum / 60).toFixed(1) + "h";
    if (percentEl) {
        percentEl.innerText = percent + "%";
        percentEl.style.color = percent < 75 ? "red" : "green";
    }
}
// [새로운 로직] 달력에서 과목 클릭 시 팝업창 띄우기
async function openSubjectFromCalendar(subName, mode, selectedDate) {
    const modal = document.getElementById('calendarModal');
    const modalTitle = document.getElementById('modalTitle');
    const actionArea = document.getElementById('modalActionArea');
    
    currentMode = mode; 
    // 전역 변수나 속성으로 클릭된 날짜를 임시 저장하여 renderFinalTable에서 참조하게 합니다.
    window.lastSelectedDate = selectedDate; 

    modal.style.display = 'flex';
    modalTitle.innerText = `📋 [전체 이력] ${subName}`;
    document.getElementById('modalHead').innerHTML = "<tr><td colspan='5'>과목 전체 데이터를 집계 중입니다...</td></tr>";
    document.getElementById('modalBody').innerHTML = "";

    actionArea.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-right:auto;">
            <div style="display: flex; gap: 15px; font-size: 11px; font-weight: bold; align-items: center; flex-wrap: wrap;">
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#fff176; border:1px solid #f1c40f; display:inline-block; margin-right:4px;"></i>지각/조퇴</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e8f5e9; border:1px solid #27ae60; display:inline-block; margin-right:4px;"></i>외출</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#ffebee; border:1px solid #e74c3c; display:inline-block; margin-right:4px;"></i>결석/미편입</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e3f2fd; border:1px solid #3498db; display:inline-block; margin-right:4px;"></i>공가/휴가/기타</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e0e0e0; border:1px solid #bdc3c7; display:inline-block; margin-right:4px; margin-left:4px;"></i>중도탈락</span>
            </div>
            <div style="font-size: 11px; font-weight: bold; color:#e67e22;">
                ● 강조된 열: 클릭한 날짜(${selectedDate})
            </div>
        </div>
        <button class="btn-excel" onclick="saveManualAttendance()" style="background-color: #e67e22 !important;">💾 수정사항 저장</button>
    `;

    loadDetailInto(subName, 'modalHead', 'modalBody', 'real');
}

// 모달 바깥쪽 클릭 시 닫기
function closeCalendarModal(e) {
    if(e.target.id === 'calendarModal') {
        document.getElementById('calendarModal').style.display = 'none';
    }
}

// 📍 [신규 부품] 터치식 과목 선택 스마트 패드 (Promise 기반 팝업 엔진)
async function openSubjectSelectPad(date, subList) {
    return new Promise(async (resolve) => {
        // 화면 암전(Overlay) 생성
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:5000; display:flex; justify-content:center; align-items:center;";
        
        // 스마트 패드 본체
        const box = document.createElement('div');
        box.style.cssText = "background:#fff; padding:20px; border-radius:12px; border:2px solid #27ae60; width:300px; max-width:90%; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,0.3);";
        
        let html = `<h3 style="margin:0 0 15px 0; color:#27ae60; border-bottom:2px solid #27ae60; padding-bottom:10px; font-size:16px;">📅 평가 과목 선택</h3>`;
        html += `<p style="font-size:12px; color:#666; margin-bottom:15px; font-weight:bold;">[${date}]<br>평가를 진행할 과목을 터치하세요.</p>`;
        
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-bottom:15px;";
        
        // 1. 해당 일자에 과목이 2개 이상일 경우 (버튼 생성)
        if (subList.length > 0) {
            subList.forEach(sub => {
                const btn = document.createElement('button');
                btn.innerText = sub;
                btn.style.cssText = "padding:12px; background:#f1f8e9; border:1px solid #27ae60; border-radius:6px; color:#2e7d32; font-weight:bold; cursor:pointer; font-size:13px; transition:all 0.2s;";
                btn.onmouseover = () => btn.style.background = '#c8e6c9';
                btn.onmouseout = () => btn.style.background = '#f1f8e9';
                btn.onclick = () => { document.body.removeChild(overlay); resolve(sub); };
                btnContainer.appendChild(btn);
            });
        } 
        // 2. 해당 일자에 배정된 과목이 없는 경우 (전체 목록 드롭다운)
        else {
            html += `<p style="font-size:11px; color:#e74c3c; margin-bottom:10px;">⚠️ 당일 배정된 과목이 없습니다. 전체 목록에서 선택하세요.</p>`;
            const select = document.createElement('select');
            select.style.cssText = "width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:13px; margin-bottom:8px;";
            const allSubs = calendarSubMode === 'subject' ? masterSubjectList : ncsList;
            select.innerHTML = `<option value="">-- 과목 선택 --</option>` + allSubs.map(s => `<option value="${s}">${s}</option>`).join('');
            btnContainer.appendChild(select);
            
            const confirmBtn = document.createElement('button');
            confirmBtn.innerText = "확인";
            confirmBtn.style.cssText = "padding:12px; background:#27ae60; border:none; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; font-size:13px;";
            confirmBtn.onclick = async () => {
                if(select.value) { document.body.removeChild(overlay); resolve(select.value); }
                else { await appAlert("과목을 선택해주세요."); }
            };
            btnContainer.appendChild(confirmBtn);
        }
        
        // 취소 버튼
        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = "취소 ✖";
        cancelBtn.style.cssText = "width:100%; padding:10px; background:#95a5a6; border:none; border-radius:6px; color:#fff; font-weight:bold; cursor:pointer; font-size:12px;";
        cancelBtn.onclick = () => { document.body.removeChild(overlay); resolve(null); }; // null 반환 시 엔진 중지
        
        box.innerHTML = html;
        box.appendChild(btnContainer);
        box.appendChild(cancelBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
}

// 📍 [스마트 개조] 수동 평가일 제어 (타이핑 제거 및 터치 패드 연동)
async function toggleEvaluationDate(date) {
    const isExists = evaluationDates[calendarSubMode] && evaluationDates[calendarSubMode][date];
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    // 1. 이미 등록된 날짜를 클릭한 경우 (삭제 로직)
    if (isExists) {
        const currentSubs = evaluationDates[calendarSubMode][date].subjects || "지정되지 않음";
        if (await appConfirm(`🗑️ [${date} / ${modeName} 모드]\n등록된 평가일 [ ${currentSubs} ] 을(를) 삭제하시겠습니까?`)) {
            try {
                await classDbRef(`evaluationDates/${calendarSubMode}/${date}`).remove();
                delete evaluationDates[calendarSubMode][date]; 
                renderCalendar(); 
            } catch (e) { await appAlert("삭제 실패: " + e.message); }
        }
    } 
    // 2. 빈 날짜를 클릭한 경우 (신규 등록 및 스캔 로직)
    else {
        const todaySubs = new Set();
        rawTimetable.forEach(r => {
            if (getFixDate(r.날짜) === date && isStudyTimetableRow(r)) {
                const sub = getTimetableDisplayName(r, calendarSubMode);
                if (sub) todaySubs.add(sub);
            }
        });

        const subList = Array.from(todaySubs);
        let targetSub = "";

        // 📍 과목이 1개일 때는 빠른 확인, 2개 이상이거나 0개일 때는 스마트 패드 가동
        if (subList.length === 1) {
            if (await appConfirm(`📅 [${date}]\n해당 일자의 진행 과목인 [ ${subList[0]} ] 평가일로 지정하시겠습니까?`)) {
                targetSub = subList[0];
            } else {
                return;
            }
        } else {
            // 🚀 새로 만든 터치식 스마트 패드 호출 대기
            targetSub = await openSubjectSelectPad(date, subList);
            if (!targetSub) return; // 취소 누르면 즉시 엔진 정지
        }

        targetSub = targetSub.trim();

        try {
            const updates = {};
            if (!evaluationDates[calendarSubMode]) evaluationDates[calendarSubMode] = {};

            // 수동 지시 최우선: 기존 날짜에 이 과목이 있다면 핀셋 제거
            for (const existingDate in evaluationDates[calendarSubMode]) {
                if (existingDate !== date) {
                    let existingSubs = evaluationDates[calendarSubMode][existingDate].subjects || "";
                    if (existingSubs.includes(targetSub)) {
                        let newSubsArray = existingSubs.split(',').map(s => s.trim()).filter(s => s !== targetSub);
                        
                        if (newSubsArray.length === 0) {
                            updates[classDbPath(`evaluationDates/${calendarSubMode}/${existingDate}`)] = null;
                            delete evaluationDates[calendarSubMode][existingDate];
                        } else {
                            const newSubsStr = newSubsArray.join(', ');
                            updates[classDbPath(`evaluationDates/${calendarSubMode}/${existingDate}/subjects`)] = newSubsStr;
                            evaluationDates[calendarSubMode][existingDate].subjects = newSubsStr;
                        }
                    }
                }
            }

            // 선택된 날짜에 데이터 덮어쓰기
            let newSubjectsForDate = targetSub;
            updates[classDbPath(`evaluationDates/${calendarSubMode}/${date}`)] = {
                timestamp: new Date().getTime(),
                subjects: newSubjectsForDate
            };
            evaluationDates[calendarSubMode][date] = { subjects: newSubjectsForDate };

            await database.ref().update(updates);
            renderCalendar(); 
        } catch (e) { await appAlert("저장 실패: " + e.message); }
    }
}

// [추가] 수동 데이터 전체 초기화 함수
async function resetAllManualData() {
    // 1단계: 단순 확인 (브레이크 확인)
    const firstCheck = await appConfirm("❗ 정말 모든 수동 입력 기록(보강 시간, 수동 출결 수정, 평가일 등)을 삭제하시겠습니까?\n이 작업은 절대 복구할 수 없습니다.");
    
    if (!firstCheck) return;

    // 📍 [개조] 반 정보를 포함한 보안 구절 생성
    const passPhrase = `${currentClass}반 삭제합니다`; // 예: "테스트반 삭제합니다"
    
    // 2단계: 보안 구절 입력 (이중 안전 핀)
    const secondCheck = await appPrompt(`⚠️ 위험한 작업입니다.\n보안 확인을 위해 아래 문구를 정확히 입력해주세요.\n\n[ ${passPhrase} ]`);

    if (secondCheck === passPhrase) {
        try {
            // 삭제 대상 리스트 (데이터 초기화 엔진 가동)
            const updates = {};
            updates[classDbPath('manualAttendance')] = null; // 보강 및 수동 수정 데이터 삭제
            updates[classDbPath('evaluationDates')] = null;   // 평가일 일정 삭제

            await database.ref().update(updates);
            
            await appAlert("✅ 모든 수동 입력 데이터가 안전하게 초기화되었습니다.");
            reloadWithCurrentView();
        } catch (e) {
            await appAlert("❌ 초기화 중 오류가 발생했습니다: " + e.message);
        }
    } else {
        // 문구가 조금이라도 틀리면 즉시 보호 모드 가동
        await appAlert(`❌ 입력 문구가 일치하지 않습니다.\n데이터가 안전하게 보호되었습니다.`);
    }
}

// [신규 개조] 전체 과목 일괄 인쇄 (네이티브 벡터 프린트 엔진 V8 탑재 - 맹점 수리 완료)
async function executeAllPrint() {
    const targetList = currentMode === 'subject' ? masterSubjectList : ncsList;
    if (!targetList.length) return await appAlert("인쇄할 대상이 없습니다.");
    
    if (!await appConfirm(`총 ${targetList.length}개의 과목을 한 번에 인쇄하시겠습니까?\n데이터 양에 따라 시간이 소요될 수 있습니다.`)) return;

    // 1. 프린트 전용 무대 생성
    const printContainer = document.createElement('div');
    printContainer.id = 'native-print-container';
    
    // 💡 [잔상 완벽 제거] absolute로 위로만 올리면 브라우저 너비 계산 충돌로 잔상이 생길 수 있습니다.
    // fixed를 사용하여 뷰포트에서 완전히 격리하고, 투명도(opacity)와 크기를 0으로 차단합니다.
    printContainer.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 1px; height: 1px; overflow: hidden; z-index: -100; opacity: 0;';
    document.body.appendChild(printContainer);

    // 로딩 표시
    const loadingDiv = document.createElement('div');
    loadingDiv.innerHTML = `<div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-size:24px; font-weight:bold;">
        <div style="margin-bottom:20px;">🖨️ 출석부 통합 생성 중입니다...</div>
        <div style="font-size:14px; color:#f1c40f;">(창을 닫지 마시고 잠시만 기다려주세요)</div>
    </div>`;
    document.body.appendChild(loadingDiv);

    try {
        for (let i = 0; i < targetList.length; i++) {
            const subName = targetList[i];
            const pageDiv = document.createElement('div');
            pageDiv.className = "a4-print-page"; // A4 규격 클래스
            
            // 인쇄용 양식 생성
            pageDiv.innerHTML = `
                <div class="print-subject-title-row" style="display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:20px; font-weight:bold; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:4px;">
                    <span style="text-align:left; flex:0 1 auto;">출석부: ${subName}</span>
                    <span style="flex:1 1 auto; text-align:right;">${getAttendanceLegendHtml()}</span>
                </div>
                <table style="width:100%; margin-bottom:10px; border-collapse:collapse; border:1.5px solid #000; font-size:13px; text-align:center;">
                    <tr>
                        <td style="background:#f8f9fa; font-weight:bold; padding:8px; border:1px solid #000; width:15%;">훈련과정 :</td>
                        <td style="padding:8px; border:1px solid #000; text-align:left;">${courseName}</td>
                        <td style="background:#f8f9fa; font-weight:bold; padding:8px; border:1px solid #000; width:15%;">훈련기간 :</td>
                        <td style="padding:8px; border:1px solid #000; width:25%;">${coursePeriod}</td>
                    </tr>
                </table>
                <table class="attendance-table" style="width:100%; border-collapse:collapse; border:1.5px solid #000; font-size:12px; text-align:center;">
                    <thead id="pHead_${i}"></thead>
                    <tbody id="pBody_${i}"></tbody>
                </table>
            `;
            printContainer.appendChild(pageDiv);

            // 데이터를 채워넣습니다 (이제 DOM에 있으므로 정상적으로 데이터가 주입됩니다!)
            await loadDetailInto(subName, `pHead_${i}`, `pBody_${i}`, 'real');
            
            // 💡 [초정밀 보정] 입력창(input) 값을 텍스트(span)로 변환하여 출력물 틀어짐 방지
            pageDiv.querySelectorAll('input').forEach(inputEl => {
                let span = document.createElement('span');
                span.innerText = inputEl.value;
                span.style.cssText = inputEl.style.cssText;
                span.style.display = 'inline-block';
                inputEl.parentNode.replaceChild(span, inputEl);
            });
            // 불필요한 버튼/UI 요소 제거
            pageDiv.querySelectorAll('.no-print').forEach(e => e.style.display = 'none');
        }

        // 2. 네이티브 벡터 렌더링용 강제 CSS 주입 (엑셀 화질 구현)
        const style = document.createElement('style');
        style.id = 'native-print-style';
        style.innerHTML = `
            @media print {
                body > *:not(#native-print-container) { display: none !important; }
                
                /* 💡 [치명적 맹점 수리] 스텔스 모드 강제 해제! 인쇄될 때는 투명도와 크기를 100% 정상으로 복원합니다. */
                #native-print-container { 
                    display: block !important; 
                    position: static !important; 
                    width: auto !important;
                    height: auto !important;
                    opacity: 1 !important;
                    overflow: visible !important;
                    background: white; 
                }
                
                * {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                
                @page { size: A4 landscape; margin: 0; } /* 출석부는 가로 방향(landscape) 최적화 */
                
                .a4-print-page { 
                    width: 297mm !important; 
                    min-height: 210mm !important; 
                    margin: 0 auto !important; 
                    padding: 15mm !important; 
                    box-shadow: none !important; 
                    page-break-after: always !important; 
                    box-sizing: border-box;
                }
                
                /* 테두리 강제 코팅 */
                table { border-collapse: collapse !important; border: 1px solid #000 !important; }
                th, td { 
                    border: 1px solid #000 !important; 
                    border-width: 1px !important;
                    border-color: #000 !important;
                    background-clip: padding-box !important;
                }
            }
        `;
        document.head.appendChild(style);

        // 3. 브라우저 네이티브 인쇄 다이얼로그 호출
        setTimeout(() => {
            window.print();
            
            // 4. 무대 철거 및 원상 복구
            document.body.removeChild(printContainer);
            document.head.removeChild(style);
            loadingDiv.remove();
        }, 500);
        
    } catch (e) {
        console.error(e);
        await appAlert("데이터 로드 중 오류가 발생했습니다.");
        loadingDiv.remove();
    }
}

document.addEventListener('click', function(e) {
    const detailView = e.target.closest('.detail-view');
    if (detailView && detailView.style.display !== 'none') {
        const rect = detailView.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        if (clickX > rect.width - 50 && clickY < 50) {
            detailView.style.display = 'none';
            // 📍 [수리] X 버튼으로 닫을 때도 원래 위치로 복귀
            window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
        }
    }
});


// 📍 [신규 부품] 상세 창을 열기 전 스크롤 위치를 기억하는 메모리 센서
let lastScrollPos = 0;

// 📍 [신규/통합] ESC 키 입력 시 모든 상세 창/모달 닫기 엔진
window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        console.log("🛑 ESC 브레이크 가동: 모든 상세 창을 닫습니다.");

        // 📍 [신규 부품] 훈련일지 팝업 모달 감지 및 즉시 철거 회로 장착
        const logOverlay = document.getElementById('trainingLogOverlay');
        if (logOverlay) {
            logOverlay.remove();
            console.log("📝 훈련일지 모달이 안전하게 닫혔습니다.");
        }

        // 1. [대시보드] 메인 화면의 상세 창(.detail-view) 감지 및 닫기
        const openBox = document.querySelector('.detail-view[style*="display: block"]');
        if (openBox) {
            const bar = openBox.previousElementSibling;
            openBox.style.display = 'none';
            // 0.5초 잔상 효과 후 바(Bar) 색상 복구
            setTimeout(() => { if(bar) bar.style.backgroundColor = ""; }, 500);
            window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
        }

        // 2. [달력 모달] 📅 달력 상세 모달(#calendarModal) 닫기
        const calModal = document.getElementById('calendarModal');
        if (calModal && (calModal.style.display === 'flex' || calModal.style.display === 'block')) {
            calModal.style.display = 'none';
            console.log("📅 달력 모달이 안전하게 닫혔습니다.");
        }

        // 3. [주차별 행] 📋 주차별 상세 창 닫기
        const openWeeklyRow = document.querySelector('[id^="weeklyDetailRow_"][style*="display: table-row"], [id^="weeklyDetailRow_"][style*="display:table-row"]');
        if (openWeeklyRow) {
            closeWeeklyDetail();
        }
    }

    // 📍 [개조] Tab 및 위/아래 방향키 양방향 순차 변속 엔진 (주차별 보기에서만 작동)
    if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const openWeeklyRow = getOpenWeeklyDetailRow();
        if (openWeeklyRow) {
            e.preventDefault(); // 방향키에 의한 화면 스크롤 및 기본 포커스 이동 완벽 차단
            const allLinks = Array.from(document.querySelectorAll('.weekly-subject-link'));
            const currentIndex = allLinks.indexOf(window.currentWeeklyOpenSub);
            
            let targetIndex = currentIndex;
            if (e.key === 'Tab' || e.key === 'ArrowDown') {
                targetIndex = (currentIndex + 1) % allLinks.length; // 다음 과목
            } else if (e.key === 'ArrowUp') {
                targetIndex = (currentIndex - 1 + allLinks.length) % allLinks.length; // 이전 과목
            }
            
            weeklyDetailSwitchMode = 'sequential';
            allLinks[targetIndex].click();
        }
    }
});

// 📍 X 버튼 클릭으로 닫을 때
document.addEventListener('click', function(e) {
    const detailView = e.target.closest('.detail-view');
    if (detailView && detailView.style.display !== 'none') {
        const rect = detailView.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        if (clickX > rect.width - 50 && clickY < 50) {
            const bar = detailView.previousElementSibling;
            detailView.style.display = 'none';
            // 0.5초 뒤에 색상 복구
            setTimeout(() => { bar.style.backgroundColor = ""; }, 500);
            window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
        }
    }
});


// 📍 [수리] 표 열(Column) 하이라이트 — 출석 시간 셀에만 가이드라인 적용
function isAttendanceTimeHoverCell(cell) {
    return cell && cell.tagName === 'TD' && cell.classList.contains('attendance-time-cell');
}

document.addEventListener('mouseover', function (e) {
    const cell = e.target.closest('.attendance-table td, .attendance-table th');
    if (!cell || !isAttendanceTimeHoverCell(cell)) return;

    const table = cell.closest('.attendance-table');
    
    // 📍 [차단 회로] 주차별 보기 표(weekly-view-table)라면 여기서 엔진 정지
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
            
            if (!hasStatus && isAttendanceTimeHoverCell(targetCell)) {
                targetCell.classList.add('hover-col');
            }
        }
    });
});

document.addEventListener('mouseout', function (e) {
    const cell = e.target.closest('.attendance-table td, .attendance-table th');
    if (!cell) return;

    const table = cell.closest('.attendance-table');
    if (!table || table.classList.contains('weekly-view-table')) return;
    table.querySelectorAll('.hover-col').forEach(c => c.classList.remove('hover-col'));
});

// 📍 [신규 기능 3] 스마트 지능형 멘트 생성 엔진 (통합 연동 모터 장착)
// 📍 [수리] openTrainingLog에서 내부 호출 시 알림/복사를 건너뛰는 returnOnly 파라미터 추가
async function openSmartMemo(date, event, returnOnly = false) {
    if (event) event.stopPropagation(); // 달력 일자 클릭(평가일 토글) 이벤트 간섭 완벽 차단
    
    const dayIdx = new Date(date).getDay();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[dayIdx];

    // [순서 변경] 주말 수업 여부를 먼저 판별하기 위해, 당일 진행 과목 스캔 엔진을 상단으로 전진 배치합니다.
    // 1. 당일 진행 과목 스캔
    const todaySubjects = new Set();
    rawTimetable.forEach(r => {
        if(getFixDate(r.날짜) !== date) return;
        if(!isStudyTimetableRow(r)) return;
        const sub = getTimetableDisplayName(r, calendarSubMode);
        if(sub) todaySubjects.add(sub);
    });
    
    // 2. 기본 멘트 세팅 (선생님 작성 멘트 순정 유지)
    let baseMsg = "";
    if(dayIdx === 1) baseMsg = "출결진행에 변동 발생시 학교로 꼭 연락바라며, 수업시간에는 집중하여 열공합시다.";
    else if(dayIdx === 2) baseMsg = "작업 전 작업순서를 반드시 숙지한 후 안전에 유의해서 작업에 임합시다.";
    else if(dayIdx === 3) baseMsg = "개인건강 및 작업안전 관리에 만전을 기합시다.";
    else if(dayIdx === 4) baseMsg = "수업시간에는 수업에 집중합시다.";
    else if(dayIdx === 5) baseMsg = "개인건강관리와 작업안전관리에 만전을 기해 주시고, 건강한 모습으로 만납시다.";
    else {
        // [개조] 주말/휴일 센서: 스캔한 과목이 하나라도 존재하면 주말 수업 멘트 출력
        if(todaySubjects.size > 0) {
            baseMsg = "주말에도 수업하는라 수고하셨습니다.";
        } else {
            baseMsg = "주말/휴일입니다.";
        }
    }

    // 3. 특별 감지: 신규 시작 및 당일 평가일 (DB 기반)
    let specialMsg = "";
    const evalDatesObj = evaluationDates[calendarSubMode] || {};

    // 📍 [신규 부품] 불순물(NCS 코드, 기호 등) 제거 및 순수 텍스트 추출 필터
    const cleanText = (str) => {
        return String(str).split(',').map(s => {
            return s.replace(/\[.*?\]|\(.*?\)/g, '') // 1. [코드] 또는 (코드) 덩어리 제거
                    .replace(/^[a-zA-Z0-9_\-]{5,}\s*/, '') // 2. 5자 이상의 연속된 영문/숫자/기호 코드 제거 (예: 01020101_v2)
                    .replace(/^[\s\-_]+/, '') // 3. 혹시 남은 앞부분 찌꺼기 기호 및 공백 세척
                    .trim();
        }).join(', ');
    };

    todaySubjects.forEach(sub => {
        // 📍 [수리] 정제 필터를 통과한 깨끗한 텍스트만 멘트에 주입
        const displaySub = cleanText(sub);
        if(globalFirstDateMap[sub] === date) {
            // 📍 [정밀 수리] 멘트 앞의 불필요한 공백 제거 (\n 오늘 -> \n오늘)
            specialMsg += `\n오늘부터 배우게 된 '${displaySub}' 과목에 대한 내부평가 제반사항을 안내하오니 숙지해 주시기 바랍니다.`;
        }
    });

    // 📍 당일 평가일 감지 (DB 데이터 정제 주입)
    if (evalDatesObj[date]) {
        const rawSubs = evalDatesObj[date].subjects || "지정되지 않은"; 
        const displaySubs = cleanText(rawSubs);
        // 📍 [정밀 수리] 공백 제거
        specialMsg += `\n오늘 '${displaySubs}' 과목의 내부평가 수행하느라 수고하셨습니다.`;
    }

    // 4. 특별 감지: 평가일 예보 (휴일 제외 다음 훈련일 기준, DB 기반)
    const currentIdx = globalSortedBusinessDays.indexOf(date);
    if(currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
        const nextBDate = globalSortedBusinessDays[currentIdx + 1];
        
        // 📍 다음 날짜 평가 예보 (DB 데이터 정제 주입)
        if (evalDatesObj[nextBDate]) {
            const rawNextSubs = evalDatesObj[nextBDate].subjects || "지정되지 않은";
            const nextSubs = cleanText(rawNextSubs);
            // 📍 [정밀 수리] 공백 제거
            specialMsg += `\n다음 훈련일(${nextBDate})에 '${nextSubs}' 과목의 내부평가가 있으니 꼭 출석해 주세요.`;
        }
    }

    // 5. 최종 조합
    let finalMemo = "";
    if (specialMsg.trim() !== "") {
        // 📍 [정밀 수리] 특별 멘트가 발생한 경우, 요일별 기본 멘트(baseMsg)의 전원을 차단하고 특별 멘트만 출력합니다.
        finalMemo = specialMsg.replace(/^\n/, ''); // 앞에 붙은 줄바꿈 찌꺼기 제거
    } else {
        finalMemo = baseMsg;
    }
    
    // 📍 [수리] 내부 호출(returnOnly)일 경우 텍스트만 반환하고 엔진 중단
    if (returnOnly) {
        return finalMemo;
    }

    // 6. 클립보드 복사 (물리적 강제 복사 모터 장착)
    // 브라우저 권한에 구애받지 않고 확실하게 복사되도록 임시 텍스트 박스를 활용합니다.
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = finalMemo;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999); // 모바일 기기 호환성 유지

    try {
        document.execCommand("copy");
        await appAlert(`📋 [클립보드 자동 복사 완료]\n\n원하시는 곳(카카오톡, 단체문자 등)에 붙여넣기(Ctrl+V) 하세요.\n\n------------------------\n${finalMemo}`);
    } catch (err) {
        await appAlert(`📋 (자동 복사 실패. 아래 문구를 드래그해서 직접 복사해주세요)\n\n${finalMemo}`);
    } finally {
        document.body.removeChild(tempTextArea); // 작업 완료 후 임시 부품 철거
    }
}

// 📍 [신규 기능 4 개조] 평가일 자동 일괄 등록 (과목명 데이터 포함)
async function autoRegisterEvaluationDates() {
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    // 센서가 감지한 종료일과 과목을 매핑 (같은 날짜에 여러 과목 대응)
    const endDatesMap = {}; 
    for (const [sub, date] of Object.entries(globalLastDateMap)) {
        if (!endDatesMap[date]) endDatesMap[date] = [];
        endDatesMap[date].push(sub);
    }

    const uniqueEndDates = Object.keys(endDatesMap);
    if(uniqueEndDates.length === 0) return await appAlert("등록할 종료일 데이터가 존재하지 않습니다.");

    if (!await appConfirm(`[${modeName} 모드]\n훈련 종료일 기준으로 각 과목의 평가일을 자동 등록합니다. (기존 데이터 덮어쓰기)`)) return;

    try {
        const updates = {};
        if (!evaluationDates[calendarSubMode]) evaluationDates[calendarSubMode] = {};

        uniqueEndDates.forEach(date => {
            const subsJoined = endDatesMap[date].join(', '); // 예: "엔진정비, 섀시정비"
            updates[classDbPath(`evaluationDates/${calendarSubMode}/${date}`)] = {
                timestamp: new Date().getTime(),
                subjects: subsJoined
            };
            // 로컬 메모리 동시 업데이트
            evaluationDates[calendarSubMode][date] = { subjects: subsJoined };
        });

        await database.ref().update(updates);
        await appAlert(`✅ 총 ${uniqueEndDates.length}일의 평가 일정(과목 정보 포함)이 자동 등록되었습니다.`);
        renderCalendar(); 
    } catch (error) {
        await appAlert("❌ 자동 등록 중 오류가 발생했습니다: " + error.message);
    }
}

// 📍 [신규 기능 5] 현재 모드의 평가일 전체 초기화 (삭제)
async function clearEvaluationDates() {
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    // 비어있는지 먼저 확인
    if(!evaluationDates[calendarSubMode] || Object.keys(evaluationDates[calendarSubMode]).length === 0) {
        return await appAlert(`현재 [${modeName}] 모드에 등록된 평가일이 없습니다.`);
    }

    if (!await appConfirm(`⚠️ [${modeName} 모드]\n달력에 등록된 모든 평가일을 삭제하시겠습니까?\n(이 작업은 현재 선택된 모드에만 적용됩니다.)`)) return;

    try {
        // 파이어베이스 해당 구역 폭파
        await classDbRef(`evaluationDates/${calendarSubMode}`).remove();
        
        // 메모리 초기화
        evaluationDates[calendarSubMode] = {};
        
        await appAlert("✅ 전체 삭제가 완료되었습니다.");
        renderCalendar(); 
    } catch (error) {
        await appAlert("❌ 삭제 중 오류가 발생했습니다: " + error.message);
    }
}

// 📍 [신규 기능 6 개조] 우측 평가일 목록 배너 실시간 동기화 엔진 (삭제 버튼 제거, 카운터 유지)
// 📍 [접이식 엔진] 배너 상태 전환 함수
function toggleEvalBanner() {
    isEvalBannerExpanded = !isEvalBannerExpanded;
    updateEvalBanner();
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

    // 📍 접힘/펼침 상태에 따른 아이콘 및 높이 처리
    const btnLabel = isEvalBannerExpanded ? "접기" : "펴기";
    const bannerHeight = isEvalBannerExpanded ? "60vh" : "auto";
    const bannerWidth = isEvalBannerExpanded ? "200px" : "120px";

    banner.style.maxHeight = bannerHeight;
    banner.style.width = bannerWidth;

    let html = `
        <button class="eval-toggle-btn" onclick="toggleEvalBanner()">${btnLabel}</button>
        <h4 style="margin: 0 0 10px 0; color: #d35400; border-bottom: 2px solid #f1c40f; padding-bottom: 5px; font-size: 13px; text-align: center; font-weight: bold;">
            📢 평가일 ${isEvalBannerExpanded ? '목록' : ''} 
        </h4>`;

    // 펼쳐진 상태에서만 세부 내용 출력
    if (isEvalBannerExpanded) {
        html += `<div style="font-size:11px; color:#666; margin-bottom:10px; text-align:center;">(${calendarSubMode === 'subject' ? '교과목' : '능력단위'} 기준)</div>`;

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
    } else {
        // 접힌 상태에서는 카운트만 심플하게 표시
        html += `<div style="text-align:center; font-size:12px; color:#e67e22; font-weight:bold; padding:5px 0;">총 ${dates.length}건</div>`;
    }

    banner.innerHTML = html;
    banner.style.display = 'block'; 
}

// 📍 [개조 엔진] 훈련일지 팝업 모터 (상단 통계 요약 패널 추가)
async function openTrainingLog(date, event) {
    if (event) event.stopPropagation(); // 달력 클릭 간섭 완벽 차단

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
            // 📍 [연동] 중도탈락자(해당 날짜 기준)는 훈련 내용 비고란 결석/조퇴 연산에서 제외
            if (isDateOnOrAfterStudentLeave(name, date)) return;
            
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
    let dropoutCount = 0; // 📍 당일 기준 누적 탈락자 수
    
    studentNames.forEach(name => {
        // 📍 [연동] 중도탈락자 분류 로직
        if (isDateOnOrAfterStudentLeave(name, date)) {
            dropoutCount++;
            return; // 중도탈락자는 결석/지각 등 다른 상태 판별에서 완전 제외
        }

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

    // 📍 [통계 연산 엔진 가동]
    const totalStudents = studentNames.length; // 총 인원
    const currentEnrolled = totalStudents - dropoutCount; // 재적 = 총인원 - 당일 탈락자
    const absentCount = absentList.length; // 순수 결석자 수
    const presentCount = currentEnrolled - absentCount; // 출석 = 재적 - 순수 결석
    
    const outingCount = otherMap["외출"] ? otherMap["외출"].length : 0; // 외출 인원수

    // 📍 [통계 요약 테이블 HTML 조립]
    const statHtml = `
        <div style="margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; border: 2px solid #95a5a6; font-size: 13px; text-align: center; background: #fff;">
                <tr style="border-bottom: 1px solid #ccc;">
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">재적</td>
                    <td style="color: #2980b9; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${currentEnrolled}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">출석</td>
                    <td style="color: #27ae60; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${presentCount}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">결석</td>
                    <td style="color: #c0392b; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${absentCount}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">휴가</td>
                    <td style="color: #f39c12; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${vacationList.length}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">지각</td>
                    <td style="color: #8e44ad; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${lateList.length}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">조퇴</td>
                    <td style="color: #d35400; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${earlyLeaveList.length}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">외출</td>
                    <td style="color: #34495e; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${outingCount}명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">조수</td>
                    <td style="color: #7f8c8d; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">0명</td>
                    
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">탈락</td>
                    <td style="color: #7f8c8d; font-weight: bold; padding: 10px 5px; width: 6%;">${dropoutCount}명</td>
                </tr>
            </table>
        </div>
    `;

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

    const memoText = await openSmartMemo(date, null, true);
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
        
        ${statHtml}

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

// 📍 [클립보드 복사 전용 모터] 잔상 버그 완벽 수리형
async function copyLogText(text, element) {
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = text;
    // 📍 복사 시 화면이 위로 튀는 현상 원천 차단
    tempTextArea.style.position = "fixed";
    tempTextArea.style.top = "-9999px";
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999);
    
    try {
        document.execCommand("copy");
        
        // 💡 시각적 피드백 (초록색 번쩍임)
        element.style.backgroundColor = "#c8e6c9"; // 클릭 시 더 진하고 확실한 초록색으로 변경
        element.style.fontWeight = "bold";
        element.style.color = "#27ae60";
        
        setTimeout(() => {
            // 📍 [핵심 수리] 이전 색상을 기억하는 로직을 폐기하고, 
            // 0.4초 뒤에 무조건 투명(transparent)으로 강제 초기화하여 잔상 버그를 원천 차단합니다.
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

// 📍 [신규 엔진] 보강 상세 내역 팝업 모터 (보강수업 DB 연동)
async function openMakeupDetailModal(studentName, escapedSub, subName) {
    // 1. Firebase에서 해당 학생/과목의 보강 상세 데이터 실시간 호출
    const snap = await classDbRef(`makeupDetails/${studentName}/${escapedSub}`).once('value');
    const data = snap.val() || {};
    const records = Object.values(data);

    if (records.length === 0) {
        await appAlert("상세 보강 기록이 존재하지 않습니다.");
        return;
    }

    // 2. 날짜순으로 정렬
    records.sort((a, b) => a.date.localeCompare(b.date));

    let totalM = 0;
    let tbodyHtml = "";

    records.forEach(r => {
        // 날짜 8자리를 보기 편하게 포맷팅 (예: 2026.03.11)
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

    // 3. 팝업 UI 조립 및 화면 출력
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

    // 어두운 바깥 배경 클릭 시 창 닫힘 센서
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// 📍 [신규 엔진] 보강 내역 규격화 및 다이렉트 복사 모터
async function copyMakeupDetails(studentName, escapedSub, element, event) {
    if (event) event.stopPropagation(); // 달력이나 부모 요소의 클릭 간섭 완벽 차단

    // 1. 클릭 시 시각적 반응 (로딩)
    const originalText = element.innerHTML;
    element.innerHTML = "⏳ 복사 중...";
    element.style.color = "#27ae60";
    element.style.textDecoration = "none";

    try {
        // 2. 파이어베이스에서 해당 학생의 과목 보강 기록 호출
        const snap = await classDbRef(`makeupDetails/${studentName}/${escapedSub}`).once('value');
        const data = snap.val() || {};
        const records = Object.values(data);

        if (records.length === 0) {
            await appAlert("상세 보강 기록이 존재하지 않습니다.");
            element.innerHTML = originalText;
            element.style.color = "#e67e22";
            return;
        }

        // 3. 날짜순(오름차순) 정렬
        records.sort((a, b) => a.date.localeCompare(b.date));

        // 4. 텍스트 조립 엔진 (선생님 요구 규격 100% 반영)
        const weekDays = ['일','월','화','수','목','금','토'];
        const textLines = records.map(r => {
            // YYYYMMDD -> 2025.10.23(목) 변환
            const yyyy = r.date.substring(0,4);
            const mm = r.date.substring(4,6);
            const dd = r.date.substring(6,8);
            const dateObj = new Date(`${yyyy}-${mm}-${dd}`);
            const dayStr = weekDays[dateObj.getDay()];
            
            // 분(Min) -> 시간(H) 변환 (소수점은 필요시 .1 형태로, 정수는 깔끔하게)
            const hours = r.min / 60;
            const formattedHours = Number.isInteger(hours) ? hours : hours.toFixed(1);

            // 조립: 2025.10.23(목) 18:00~20:00 (2H) 보강실시
            return `${yyyy}.${mm}.${dd}(${dayStr}) ${r.time} (${formattedHours}H) 보강실시`;
        });

        // 다중 보강일 경우 엔터(\n)로 묶기
        const finalText = textLines.join('\n');

        // 5. 클립보드 물리적 강제 복사 모터 (화면 튕김 방지 장착)
        const tempTextArea = document.createElement("textarea");
        tempTextArea.value = finalText;
        tempTextArea.style.position = "fixed";
        tempTextArea.style.top = "-9999px"; // 보이지 않는 곳으로 은닉
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        tempTextArea.setSelectionRange(0, 99999);
        
        document.execCommand("copy");
        document.body.removeChild(tempTextArea);

        // 6. 정상 복사 확인 안내
        element.innerHTML = "✅ 복사완료";
        await appAlert(`📋 [보강 내역 복사 완료]\n원하시는 곳에 붙여넣기(Ctrl+V) 하세요.\n\n${finalText}`);

        // 1.5초 뒤 원래 상태로 복구
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

// 📍 [신규 엔진] index1에서 넘어온 evalDates(시간표 평가일) 자동 추출 및 DB 병합
async function autoRegisterEvalFromTimetable() {
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    try {
        // 1. masterData.courses 정보 확보 (evalDates 탑재 여부 확인)
        const snap = await classDbRef('masterData/courses').once('value');
        const courses = snap.val() || [];
        
        const updates = {};
        const tempDatesMap = {};
        let foundEvalCount = 0;

        // 2. 시간표(fullTimetable) 원본 데이터를 순회하며 장소(place) 정보를 추출하기 위한 맵 생성
        courses.forEach(c => {
            const targetName = calendarSubMode === 'subject' ? c.subject : c.unit;
            if (!targetName || !c.evalDates || c.evalDates.length === 0) return;

            c.evalDates.forEach(ed => {
                foundEvalCount++;
                const dateStr = ed.date;
                const periodStr = ed.period;
                
                let placeStr = "장소 미지정";
                const matchedRow = rawTimetable.find(r => 
                    getFixDate(r.날짜) === dateStr && 
                    parseInt(String(r.교시).replace(/[^0-9]/g, '')) === periodStr &&
                    (calendarSubMode === 'subject' ? String(r.교과목).trim() === targetName.trim() : String(r.능력단위).replace(/\(평가시험\)/g, "").trim() === targetName.trim())
                );
                
                if (matchedRow) {
                    placeStr = matchedRow.장소 || matchedRow.훈련장소 || matchedRow.훈련시설명 || "장소 미지정";
                }

                if (!tempDatesMap[dateStr]) {
                    tempDatesMap[dateStr] = { subjects: new Set(), details: [] };
                }
                
                tempDatesMap[dateStr].subjects.add(targetName);
                tempDatesMap[dateStr].details.push({
                    sub: targetName,
                    period: periodStr,
                    place: placeStr
                });
            });
        });

        // 3. 검증
        if (foundEvalCount === 0) {
            return await appAlert("평가일 정보가 없습니다. 종료일 자동 등록으로 평가일 등록하세요.");
        }

        if (!await appConfirm(`[${modeName} 모드]\n시간표 엑셀에 마킹된 (평가시험) 정보를 바탕으로 평가일을 자동 등록합니다.\n(기존 데이터 덮어쓰기)`)) return;

        if (!evaluationDates[calendarSubMode]) evaluationDates[calendarSubMode] = {};

        Object.keys(tempDatesMap).forEach(date => {
            const subsJoined = Array.from(tempDatesMap[date].subjects).join(', ');
            const rawDetails = tempDatesMap[date].details;

            const grouped = {};
            rawDetails.forEach(d => {
                const key = d.sub + "||" + d.place;
                if (!grouped[key]) {
                    grouped[key] = { sub: d.sub, place: d.place, periods: [] };
                }
                const pNum = parseInt(d.period);
                if (!isNaN(pNum)) grouped[key].periods.push(pNum);
            });

            let mergedDetails = Object.values(grouped).map(g => {
                const uniquePeriods = [...new Set(g.periods)].sort((a, b) => a - b);
                
                let ranges = [];
                if (uniquePeriods.length > 0) {
                    let start = uniquePeriods[0];
                    let prev = uniquePeriods[0];
                    
                    for (let i = 1; i < uniquePeriods.length; i++) {
                        if (uniquePeriods[i] === prev + 1) {
                            prev = uniquePeriods[i];
                        } else {
                            ranges.push(start === prev ? String(start) : `${start}~${prev}`);
                            start = uniquePeriods[i];
                            prev = uniquePeriods[i];
                        }
                    }
                    ranges.push(start === prev ? String(start) : `${start}~${prev}`);
                }
                
                const periodStr = ranges.length > 0 ? ranges.join(', ') : "-";
                const sortKey = uniquePeriods.length > 0 ? uniquePeriods[0] : 999;

                return {
                    sub: g.sub,
                    period: periodStr,
                    place: g.place,
                    _sortKey: sortKey
                };
            });

            // 📍 [핵심] 시작 교시 기준으로 오름차순 정렬 (예: 1~2교시가 5~6교시보다 위로 오도록 보장)
            mergedDetails.sort((a, b) => a._sortKey - b._sortKey);
            mergedDetails = mergedDetails.map(d => ({ sub: d.sub, period: d.period, place: d.place }));

            const newData = {
                timestamp: new Date().getTime(),
                subjects: subsJoined,
                details: mergedDetails 
            };

            updates[classDbPath(`evaluationDates/${calendarSubMode}/${date}`)] = newData;
            evaluationDates[calendarSubMode][date] = newData;
        });

        await database.ref().update(updates);
        await appAlert(`✅ 총 ${Object.keys(tempDatesMap).length}일의 시간표 기반 평가일(교시, 장소 포함)이 자동 등록되었습니다.`);
        renderCalendar(); 
        
    } catch (error) {
        await appAlert("❌ 시간표 평가일 등록 중 오류가 발생했습니다: " + error.message);
    }
}

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 리스너 매립)

function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. 상단 네비게이션 및 제어 버튼
    bindClick('btn_nav_main', (e) => { e.preventDefault(); location.href = classNavHref('index1.html'); });
    bindClick('btn_nav_month', (e) => { e.preventDefault(); location.href = classNavHref('단위개월출석부.html'); });
    bindClick('btn_nav_daily', (e) => { e.preventDefault(); location.href = classNavHref('일일출석부.html'); });
    bindClick('btn_reset_all', resetAllManualData);

    // 2. 기본 보기 고정 (라디오 버튼) - change 이벤트로 감지
    const radioSubject = document.getElementById('radio_view_subject');
    const radioNcs = document.getElementById('radio_view_ncs');
    if (radioSubject) radioSubject.addEventListener('change', () => saveDefaultView('subject'));
    if (radioNcs) radioNcs.addEventListener('change', () => saveDefaultView('ncs'));

    // 3. 메인 탭 메뉴
    bindClick('tab_main', () => changeMode('main'));
    bindClick('tab_calendar', () => changeMode('calendar'));
    bindClick('tab_weekly', () => changeMode('weekly'));
    bindClick('tab_makeup', () => { location.href = classNavHref('보강수업.html'); });

    // 4. 보기 방식 서브 메뉴
    bindClick('btn_sub_subject', () => switchTo('subject'));
    bindClick('btn_sub_ncs', () => switchTo('ncs'));

    // 5. 인쇄/엑셀 제어부
    bindClick('btn_print_selected', () => executeAction('print'));
    bindClick('btn_print_all', executeAllPrint);
    bindClick('btn_excel_selected', () => executeAction('excel'));

    // 6. 목록 정렬 컨트롤
    bindClick('btn_sort_date', () => renderSubjectList('date'));
    bindClick('btn_sort_name', () => renderSubjectList('name'));

    // 7. 모달 제어 (바깥 배경 및 X 버튼 클릭)
    const calendarModal = document.getElementById('calendarModal');
    const calendarModalContent = document.getElementById('calendarModalContent');
    if (calendarModal) calendarModal.addEventListener('click', closeCalendarModal);
    bindClick('btn_modal_close', () => { if (calendarModal) calendarModal.style.display = 'none'; });
    if (calendarModalContent) calendarModalContent.addEventListener('click', (e) => e.stopPropagation());
});