
// [로직 보존: 절대 수정 금지]
// 수정 후 >> [계승 및 멀티 DB 대응]
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const urlParams = new URLSearchParams(window.location.search);
let currentClass = urlParams.get('class') || "테스트";

let rawTimetable = [], fullAttendanceData = {}, masterSubjectList = [], ncsList = [], unitMonths = [], studentNames = [], validTrainingDays = [];

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

function isActualSubject(subName) {
    if (!subName) return false;
    const clean = String(subName).replace(/\s+/g, "");
    return masterSubjectList.some(m => m.replace(/\s+/g, "").includes(clean)) || 
           ncsList.some(n => n.replace(/\s+/g, "").includes(clean));
}

// [연비 원칙: once 전환 및 캐시 탑재]
async function initialize() {
    // 1. [캐시 로드] 로컬 데이터를 먼저 꺼내 즉각 반응성 확보
    const cacheKey = `cache_${currentClass}_attendance`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        fullAttendanceData = JSON.parse(cachedData);
        console.log("⚡ [연비모드] 로컬 데이터를 즉시 불러왔습니다.");
    }

    try {
        // 2. [통합 로드] 세 가지 핵심 데이터를 한 번에 가져와 통신 효율 극대화
        const [masterSnap, timeSnap, attendanceSnap] = await Promise.all([
            database.ref(`${currentClass}/masterData`).once('value'),
            database.ref(`${currentClass}/fullTimetable`).once('value'),
            database.ref(`${currentClass}/dailyAttendance`).once('value')
        ]);

        const master = masterSnap.val() || {};
        if(master.courses) {
            masterSubjectList = [...new Set(master.courses.map(c => c.subject))];
            ncsList = [...new Set(master.courses.filter(c => c.unit).map(c => c.unit))];
        }

        rawTimetable = timeSnap.val() || [];
        fullAttendanceData = attendanceSnap.val() || {};

        // 3. [창고 업데이트] 최신 데이터를 캐시에 저장하여 다음 로드 가속
        localStorage.setItem(cacheKey, JSON.stringify(fullAttendanceData));

        // 4. [엔진 가동] 분석 로직 실행
        if(rawTimetable.length > 0) {
            processBaseData();
            renderTabs();
            changePeriod(window.currentPeriodTarget || 'total');
            setTimeout(syncScrollWidth, 300); 
        }
    } catch (e) {
        console.error("정밀 분석 로드 실패:", e);
        alert("데이터를 불러오는 데 실패했습니다.");
    }
}

function syncScrollWidth() {
    const table = document.getElementById('mainTable');
    const topContent = document.getElementById('topScrollContent');
    const tableWrapper = document.getElementById('tableWrapper');
    const topWrapper = document.getElementById('topScrollWrapper');
    if(table && topContent) {
        topContent.style.width = table.offsetWidth + 'px';
        topWrapper.onscroll = () => { tableWrapper.scrollLeft = topWrapper.scrollLeft; };
        tableWrapper.onscroll = () => { topWrapper.scrollLeft = tableWrapper.scrollLeft; };
    }
}

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
        // 📍 [거름망 강화] 학생 성명이 아닌 시스템 키값들은 통과시키지 않습니다.
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
        unitMonths.push({ label: `${unitMonths.length + 1}회 단위`, start: sStr, end: eStr, days: validTrainingDays.filter(d => d >= sStr && d <= eStr) });
        tempStart.setMonth(tempStart.getMonth() + 1);
    }
}

function renderTabs() {
    const menu = document.getElementById('tabMenu');
    const existingBtns = menu.querySelectorAll('.tab-btn:not([onclick*="total"])');
    existingBtns.forEach(b => b.remove());
    unitMonths.forEach((u, idx) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn'; btn.innerText = u.label; btn.onclick = () => changePeriod(idx);
        menu.appendChild(btn);
    });
}

function changePeriod(target) {
    window.currentPeriodTarget = target;
    const btns = document.querySelectorAll('.tab-btn');
    const table = document.getElementById('mainTable');
    if(target === 'total') table.className = 'mode-total';
    else table.className = 'mode-unit';

    btns.forEach((btn, idx) => {
        if(target === 'total' && idx === 0) btn.classList.add('active');
        else if(target === idx - 1) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    let targetDays = [], range = "";
    if(target === 'total') {
        targetDays = validTrainingDays;
        range = targetDays.length > 0 ? `${targetDays[0]} ~ ${targetDays[targetDays.length-1]}` : "-";
    } else {
        const u = unitMonths[target]; targetDays = u.days; range = `${u.start} ~ ${u.end}`;
    }

    const totalCount = targetDays.length;
    const minPassDays = Math.ceil(totalCount * 0.8);
    document.getElementById('infoRange').innerText = range;
    document.getElementById('infoTotalDays').innerText = totalCount + "일";
    document.getElementById('infoMinDays').innerText = minPassDays + "일";
    document.getElementById('infoAllowAbsent').innerText = (totalCount - minPassDays) + "일";

    renderDetailTable(targetDays, target === 'total');
    setTimeout(syncScrollWidth, 150);
}

// [헤더 재배치 수정 영역]
function renderDetailTable(targetDays, isTotalMode) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('attendanceTableBody');
    const todayStr = new Date().toISOString().split('T')[0];

    // 월별 병합 계산 (2층용)
    let monthHeaders = "";
    if (targetDays.length > 0) {
        let currentMonth = "";
        let spanCount = 0;
        targetDays.forEach((d, idx) => {
            const m = d.split('-')[1] + "월";
            if (idx === 0) { currentMonth = m; spanCount = 1; }
            else if (currentMonth === m) { spanCount++; }
            else {
                monthHeaders += `<th colspan="${spanCount}" class="month-header">${currentMonth}</th>`;
                currentMonth = m; spanCount = 1;
            }
            if (idx === targetDays.length - 1) {
                monthHeaders += `<th colspan="${spanCount}" class="month-header">${currentMonth}</th>`;
            }
        });
    }

    // 일 표시 (3층용)
    let dateHeaders = targetDays.map(d => `<th class="col-day day-header">${parseInt(d.split('-')[2])}</th>`).join('');

    let headHtml = `
        <tr class="tr-top">
            <th colspan="9" class="sticky-col" style="left:0;">실시간 출석 분석 데이터</th>
            <th colspan="${targetDays.length}">일자별 출결 현황</th>
        </tr>
        <tr class="tr-month">
            <th colspan="9" class="sticky-col" style="left:0; border-bottom:1px solid #ddd;">(분석 기준: 단위 개월)</th>
            ${monthHeaders}
        </tr>
        <tr class="tr-label-day">
            <th class="sticky-col col-name">성명</th>
            <th class="sticky-col col-r1">전체(%)</th>
            <th class="sticky-col col-r2">편입(%)</th>
            <th class="sticky-col col-s1">출석</th>
            <th class="sticky-col col-s2">수업</th>
            <th class="sticky-col col-s3">결석</th>
            <th class="sticky-col col-p1">지</th>
            <th class="sticky-col col-p2">조</th>
            <th class="sticky-col col-p3">외</th>
            ${dateHeaders}
        </tr>
    `;
    thead.innerHTML = headHtml;

    // [데이터 로직: 절대 보존]
    const rows = studentNames.map(name => {
        let enrollDate = "";
        for (let d of validTrainingDays) {
            const dayData = fullAttendanceData[d] ? fullAttendanceData[d][name] : null;
            if (dayData && dayData.status && dayData.status !== "미편입" && dayData.status !== "" && dayData.status !== "-") {
                enrollDate = d; break;
            }
        }
        let pureAbsent = 0, lCount = 0, eCount = 0, oCount = 0, personalTrainingDaysCount = 0, dayGridHtml = "";

        targetDays.forEach(d => {
            const att = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : null;
            if (enrollDate && d < enrollDate) { dayGridHtml += `<td class="col-day bg-none"></td>`; return; }
            personalTrainingDaysCount++;
            if(!att) {
                if(d <= todayStr) { pureAbsent++; dayGridHtml += `<td class="col-day bg-absent">×</td>`; }
                else { dayGridHtml += `<td class="col-day"></td>`; }
            } else {
                const st = att.status || "";
                if(st.includes("결석") || st === "미편입") { pureAbsent++; dayGridHtml += `<td class="col-day bg-absent">×</td>`; }
                else if(st.includes("출석") || st === "정상" || st === "") { dayGridHtml += `<td class="col-day bg-attend">${isTotalMode ? '' : '○'}</td>`; }
                else {
                    let cls = "bg-attend", sym = "";
                    if(st.includes("지각")) { lCount++; cls = "bg-late"; sym = "지"; }
                    else if(st.includes("조퇴")) { eCount++; cls = "bg-early"; sym = "조"; }
                    else if(st.includes("외출")) { oCount++; cls = "bg-out"; sym = "외"; }
                    else { cls = "bg-attend"; sym = "◎"; }
                    dayGridHtml += `<td class="col-day ${cls}">${isTotalMode ? '' : sym}</td>`;
                }
            }
        });

        const totalPenalty = lCount + eCount + oCount;
        const penaltyAbs = Math.floor(totalPenalty / 3);
        const finalAbsent = pureAbsent + penaltyAbs;
        const courseRate = targetDays.length > 0 ? ((targetDays.length - finalAbsent) / targetDays.length * 100).toFixed(1) : "0.0";
        const personalRate = personalTrainingDaysCount > 0 ? ((personalTrainingDaysCount - finalAbsent) / personalTrainingDaysCount * 100).toFixed(1) : "0.0";
        function getRateClass(r) { const v = parseFloat(r); return v < 80 ? "status-danger" : (v <= 85 ? "status-warning" : "status-safe"); }

        return `
            <tr>
                <td class="sticky-col col-name"><strong>${name}</strong><span class="enroll-date">${enrollDate || '미기록'}</span></td>
                <td class="sticky-col col-r1 ${getRateClass(courseRate)}">${courseRate}%</td>
                <td class="sticky-col col-r2 ${getRateClass(personalRate)}">${personalRate}%</td>
                <td class="sticky-col col-s1 summary-val">${personalTrainingDaysCount - finalAbsent}</td>
                <td class="sticky-col col-s2 summary-val">${personalTrainingDaysCount}</td>
                <td class="sticky-col col-s3" style="background:#fffcfc !important; color:#ef4444; font-weight:bold;">${finalAbsent}</td>
                <td class="sticky-col col-p1 summary-val">${lCount}</td>
                <td class="sticky-col col-p2 summary-val">${eCount}</td>
                <td class="sticky-col col-p3 summary-val">${oCount}</td>
                ${dayGridHtml}
            </tr>
        `;
    });
    tbody.innerHTML = rows.join('');
}
initialize();

