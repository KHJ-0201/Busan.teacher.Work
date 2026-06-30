
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
initClassContext();
let currentClass = window.currentClass;

let rawTimetable = [], fullAttendanceData = {}, masterSubjectList = [], ncsList = [], unitMonths = [], studentNames = [], validTrainingDays = [];
let evalDatesSet = new Set(); // 📍 신규 부품: 평가일자 전용 메모리

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

// 📍 [신규 부품] 전역 변수 선언부에 탈락 데이터 저장소 추가 (기존 전역 변수 아래쪽에 위치)
let dropoutData = {};

// [연비 원칙: once 전환 및 캐시 탑재]
async function initialize() {
    const cacheKey = classStorageKey('cache_attendance');
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        fullAttendanceData = JSON.parse(cachedData);
        console.log("⚡ [연비모드] 로컬 데이터를 즉시 불러왔습니다.");
    }

    try {
        const [masterSnap, timeSnap, attendanceSnap, dropoutSnap] = await Promise.all([
            classDbRef('masterData').once('value'),
            classDbRef('fullTimetable').once('value'),
            classDbRef('dailyAttendance').once('value'),
            classDbRef('dropouts').once('value')
        ]);

        const master = masterSnap.val() || {};
        evalDatesSet.clear(); // 센서 초기화
        
        if(master.courses) {
            masterSubjectList = [...new Set(master.courses.map(c => c.subject))];
            ncsList = [...new Set(master.courses.filter(c => c.unit).map(c => c.unit))];
            
            // 📍 [핵심 배선] 모든 교과목을 뒤져서 평가일자를 한 곳으로 수집
            master.courses.forEach(c => {
                if(c.evalDates && Array.isArray(c.evalDates)) {
                    c.evalDates.forEach(ed => evalDatesSet.add(ed.date));
                }
            });
        }

        rawTimetable = timeSnap.val() || [];
        fullAttendanceData = attendanceSnap.val() || {};
        dropoutData = dropoutSnap.val() || {};

        // 3. [창고 업데이트] 최신 데이터를 캐시에 저장하여 다음 로드 가속
        localStorage.setItem(cacheKey, JSON.stringify(fullAttendanceData));

        // 4. [엔진 가동] 분석 로직 실행
        if(rawTimetable.length > 0) {
            processBaseData();
            renderTabs();
            changePeriod(window.currentPeriodTarget || 'total');
            // 상단 스크롤바 모듈 제거로 인한 동기화 함수 호출 삭제
        }
    } catch (e) {
        console.error("정밀 분석 로드 실패:", e);
        await appAlert("데이터를 불러오는 데 실패했습니다.");
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
    // 📍 [정밀 수리] onclick 배선 대신 새롭게 부착된 ID(btn_tab_total)로 전체 누적 버튼을 인식하도록 센서 교체
    const existingBtns = menu.querySelectorAll('.tab-btn:not(#btn_tab_total)');
    existingBtns.forEach(b => b.remove());
    // 기존 도달 버튼 초기화
    menu.querySelectorAll('.milestone-wrap').forEach(b => b.remove());

    unitMonths.forEach((u, idx) => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn'; btn.innerText = u.label; btn.onclick = () => changePeriod(idx);
        menu.appendChild(btn);
    });

    // 📍 [버그 수리] 자바스크립트가 인덱스 0(1회 단위)을 false로 오인하는 현상 완벽 차단
    if (window.currentPeriodTarget === 'total' || typeof window.currentPeriodTarget === 'undefined') {
        const div = document.createElement('div');
        div.className = 'milestone-wrap';
        
        const btn70 = document.createElement('button');
        btn70.className = 'tab-btn btn-m70';
        btn70.id = 'btnM70';
        btn70.innerText = '🎯 70% 도달';
        btn70.onclick = () => toggleMilestone('70');
        
        const btn80 = document.createElement('button');
        btn80.className = 'tab-btn btn-m80';
        btn80.id = 'btnM80';
        btn80.innerText = '🎯 80% 도달';
        btn80.onclick = () => toggleMilestone('80');

        div.appendChild(btn70);
        div.appendChild(btn80);
        menu.appendChild(div);
    }
}

function changePeriod(target) {
    window.currentPeriodTarget = target;
    
    // 📍 도달 시점 하이라이트 상태 리셋
    const table = document.getElementById('mainTable');
    table.classList.remove('show-m70', 'show-m80');
    
    if(target === 'total') table.className = 'mode-total';
    else table.className = 'mode-unit';

    renderTabs(); // 도달 버튼 생성 여부 갱신

    const btns = document.querySelectorAll('#tabMenu > .tab-btn'); // 탭 버튼만 타겟팅
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
}

// [헤더 재배치 수정 영역]
function renderDetailTable(targetDays, isTotalMode) {
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('attendanceTableBody');
    const todayStr = typeof getTodayStrKst === 'function' ? getTodayStrKst() : new Date().toISOString().split('T')[0];

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

// 📍 [신규 배선] 업로드된 출석 데이터 중 가장 마지막(최근) 날짜 추출
    let lastRecordedDate = "";
    const uploadedDates = Object.keys(fullAttendanceData).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (uploadedDates.length > 0) {
        lastRecordedDate = uploadedDates[uploadedDates.length - 1];
    }

    // 일 표시 (3층용) - 📍 평가일자, 호버 센서 및 수직 경계선 부착
    const weekDays = ['일', '월', '화', '수', '목', '금', '토']; // 📍 신규 부품: 요일 인식 배열
    let dateHeaders = targetDays.map(d => {
        let isEval = evalDatesSet.has(d);
        let evalCls = isEval ? "eval-day-header" : "";
        let boundaryCls = (d === lastRecordedDate) ? "last-record-col" : ""; // 마지막 입력일에 클래스 부여
        let dayName = weekDays[new Date(d).getDay()]; // 📍 신규 배선: 날짜에서 요일 추출
        return `<th class="col-day day-header date-col-${d} ${evalCls} ${boundaryCls}" onmouseover="highlightCol('${d}')" onmouseout="clearColHighlight('${d}')"><span style="display:block;">${dayName}</span>${parseInt(d.split('-')[2])}</th>`;
    }).join('');

    // 헤더의 colspan 길이를 모드에 따라 동적 조절 (전체 누적이면 10칸, 아니면 9칸)
    let stickyColspan = isTotalMode ? 11 : 10;
    let currentRateTh = isTotalMode ? `<th class="sticky-col col-r3">현재(%)</th>` : "";

    let headHtml = `
        <tr class="tr-top">
            <th colspan="${stickyColspan}" class="sticky-col" style="left:0;">실시간 출석 분석 데이터</th>
            <th colspan="${targetDays.length}">일자별 출결 현황</th>
        </tr>
        <tr class="tr-month">
            <th colspan="${stickyColspan}" class="sticky-col" style="left:0; border-bottom:1px solid #ddd;">(분석 기준: 단위 개월)</th>
            ${monthHeaders}
        </tr>
        <tr class="tr-label-day">
            <th class="sticky-col col-num">번호</th>
            <th class="sticky-col col-name">성명</th>
            <th class="sticky-col col-r1">전체(%)</th>
            <th class="sticky-col col-r2">편입(%)</th>
            ${currentRateTh}
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
    const rows = studentNames.map((name, index) => {
        let enrollDate = "";
        for (let d of validTrainingDays) {
            const dayData = fullAttendanceData[d] ? fullAttendanceData[d][name] : null;
            if (dayData && dayData.status && dayData.status !== "미편입" && dayData.status !== "" && dayData.status !== "-") {
                enrollDate = d; break;
            }
        }
        
        let pureAbsent = 0, lCount = 0, eCount = 0, oCount = 0, personalTrainingDaysCount = 0, preEnrollAbsentCount = 0, actualPresentCount = 0, dayGridHtml = "";
        
        // 📍 [재설계] 70%, 80% 도달 목표일(Target Days) 계산
        const target70 = Math.ceil(validTrainingDays.length * 0.7);
        const target80 = Math.ceil(validTrainingDays.length * 0.8);
        let hit70 = false, hit80 = false;

        // 📍 [사전 연산] 해당 학생의 '현재까지의 총 누적 패널티 결석 일수'를 먼저 계산합니다.
        // 미래는 모두 출석한다고 가정하므로, 패널티는 오늘(마지막 입력일)까지만 누적됩니다.
        let tempPureAbsent = 0, tempL = 0, tempE = 0, tempO = 0;
        targetDays.forEach(d => {
            const att = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : null;
            if(att) {
                const st = att.status || "";
                if(st.includes("결석") || st === "미편입") tempPureAbsent++;
                else {
                    if(st.includes("지각")) tempL++;
                    else if(st.includes("조퇴")) tempE++;
                    else if(st.includes("외출")) tempO++;
                }
            }
        });
        const currentPenaltyAbs = Math.floor((tempL + tempE + tempO) / 3);
        const totalCurrentAbsent = tempPureAbsent + currentPenaltyAbs; // 편입 전 미편입 일수(preEnroll)는 이따 루프 돌면서 합산

        // 📍 [미래 예측 시뮬레이터] 
        // 전체 훈련일수 배열(validTrainingDays)의 인덱스를 기반으로
        // "오늘까지의 총 결석일수" + "오늘까지의 미편입 일수"를 미래의 날짜(Index)에 더해 도달 시점을 뒤로 밀어냅니다.
        
        // 📍 [미래 예측 시뮬레이터 및 학생 번호 장착]
        targetDays.forEach(d => {
            const att = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : null;
            
            let colCls = `date-col-${d}`;
            let boundaryCls = (d === lastRecordedDate) ? "last-record-col" : "";
            let finalCls = `${colCls} ${boundaryCls}`;

            let currentDayIndex = validTrainingDays.indexOf(d) + 1;
            let delayedTarget70 = target70 + preEnrollAbsentCount + totalCurrentAbsent;
            let delayedTarget80 = target80 + preEnrollAbsentCount + totalCurrentAbsent;

            let milestoneCls = ""; 
            let m70Html = "", m80Html = "";

            if (isTotalMode) {
                if (!hit70 && currentDayIndex === delayedTarget70) { hit70 = true; milestoneCls = " milestone-70"; m70Html = `<span class="m70-sym">${index + 1}</span>`; }
                if (!hit80 && currentDayIndex === delayedTarget80) { hit80 = true; milestoneCls += " milestone-80"; m80Html = `<span class="m80-sym">${index + 1}</span>`; }
            }

            // 📍 [통합 조립 부품] td 태그 생성을 일원화하여 학생 번호 스팬(span)을 안전하게 감쌈
            const buildTd = (cls, sym, isDrop) => {
                let inner = `<span class="default-sym">${sym}</span>${m70Html}${m80Html}`;
                let extraStyle = isDrop ? `style="color:#a1a1aa; font-weight:bold; background-color:#f4f4f5 !important;"` : ``;
                return `<td class="col-day ${cls} ${finalCls}${milestoneCls}" ${extraStyle}>${inner}</td>`;
            };

            if (dropoutData[name] && d >= dropoutData[name]) {
                pureAbsent++; personalTrainingDaysCount++; 
                dayGridHtml += buildTd("bg-none", "X", true); return; 
            }

            if (enrollDate && d < enrollDate) { 
                preEnrollAbsentCount++; 
                dayGridHtml += buildTd("bg-none", "", false); return; 
            }
            
            personalTrainingDaysCount++;
            if(!att) {
                if (typeof shouldCountMissingAttAsAbsent === 'function' ? shouldCountMissingAttAsAbsent(d, todayStr) : d <= todayStr) {
                    pureAbsent++;
                    dayGridHtml += buildTd("bg-absent", "×", false);
                } else {
                    dayGridHtml += buildTd("", "", false);
                }
            } else {
                const st = att.status || "";
                if(st.includes("결석") || st === "미편입") { 
                    pureAbsent++; dayGridHtml += buildTd("bg-absent", "×", false); 
                }
                else if(st.includes("출석") || st === "정상" || st === "") { 
                    actualPresentCount++; dayGridHtml += buildTd("bg-attend", isTotalMode ? '' : '○', false); 
                }
                else {
                    actualPresentCount++; 
                    let cls = "bg-attend", sym = "";
                    if(st.includes("지각")) { lCount++; cls = "bg-late"; sym = "지"; }
                    else if(st.includes("조퇴")) { eCount++; cls = "bg-early"; sym = "조"; }
                    else if(st.includes("외출")) { oCount++; cls = "bg-out"; sym = "외"; }
                    else if(st.includes("공가")) { cls = "bg-attend"; sym = "공"; } 
                    else if(st.includes("휴가")) { cls = "bg-attend"; sym = "휴"; } 
                    else { cls = "bg-attend"; sym = "◎"; } 
                    dayGridHtml += buildTd(cls, sym, false);
                }
            }
        });

        const totalPenalty = lCount + eCount + oCount;
        const penaltyAbs = Math.floor(totalPenalty / 3);
        const finalAbsent = pureAbsent + penaltyAbs;
        const totalCourseAbsent = finalAbsent + preEnrollAbsentCount; 
        const pureAttendedDays = personalTrainingDaysCount - finalAbsent; 

        const courseRate = targetDays.length > 0 ? ((targetDays.length - totalCourseAbsent) / targetDays.length * 100).toFixed(1) : "0.0";
        const personalRate = personalTrainingDaysCount > 0 ? (pureAttendedDays / personalTrainingDaysCount * 100).toFixed(1) : "0.0";
        
        const currentValidAttendance = actualPresentCount > penaltyAbs ? actualPresentCount - penaltyAbs : 0;
        const currentProgressRate = validTrainingDays.length > 0 ? (currentValidAttendance / validTrainingDays.length * 100).toFixed(1) : "0.0";
        
        // 📍 [신규 모듈] 중도탈락자 전용 회색 도색 변수 (셀렉터 우선순위 강제 적용)
        const isDropped = dropoutData[name] ? true : false;
        const dropStyle = isDropped ? "background-color:#f4f4f5 !important; color:#a1a1aa !important;" : "";
        const dropAbsStyle = isDropped ? "background-color:#f4f4f5 !important; color:#a1a1aa !important;" : "background:#fffcfc !important; color:#ef4444;";

        function getRateClass(r) { 
            if (isDropped) return ""; // 💡 탈락자는 상태 경고 색상(빨강/노랑) 렌더링 강제 해제
            const v = parseFloat(r); return v < 80 ? "status-danger" : (v <= 85 ? "status-warning" : "status-safe"); 
        }

        let currentRateTd = isTotalMode ? `<td class="sticky-col col-r3 ${getRateClass(currentProgressRate)}" style="${dropStyle}">${currentProgressRate}%</td>` : "";

        return `
            <tr>
                <td class="sticky-col col-num" style="${isDropped ? dropStyle : 'color:#64748b;'} font-weight:bold;">${index + 1}</td>
                <td class="sticky-col col-name" style="${dropStyle}"><strong>${name}</strong><span class="enroll-date">${enrollDate || '미기록'}</span></td>
                <td class="sticky-col col-r1 ${getRateClass(courseRate)}" style="${dropStyle}">${courseRate}%</td>
                <td class="sticky-col col-r2 ${getRateClass(personalRate)}" style="${dropStyle}">${personalRate}%</td>
                ${currentRateTd}
                <td class="sticky-col col-s1 summary-val" style="${dropStyle}">${currentValidAttendance}</td>
                <td class="sticky-col col-s2 summary-val" style="${dropStyle}">${personalTrainingDaysCount}</td>
                <td class="sticky-col col-s3" style="${dropAbsStyle} font-weight:bold;">${finalAbsent}</td>
                <td class="sticky-col col-p1 summary-val" style="${dropStyle}">${lCount}</td>
                <td class="sticky-col col-p2 summary-val" style="${dropStyle}">${eCount}</td>
                <td class="sticky-col col-p3 summary-val" style="${dropStyle}">${oCount}</td>
                ${dayGridHtml}
            </tr>
        `;
    });
    tbody.innerHTML = rows.join('');
}

// 📍 [신규 모듈] 수직 열(Column) 호버 중앙 통제소
window.highlightCol = function(dateStr) {
    document.querySelectorAll(`.date-col-${dateStr}`).forEach(el => el.classList.add('hover-col'));
};
window.clearColHighlight = function(dateStr) {
    document.querySelectorAll(`.date-col-${dateStr}`).forEach(el => el.classList.remove('hover-col'));
};

// 📍 [신규 부품] 가로 스크롤 출발 전 원래 위치 백업용 메모리
let savedScrollPosition = 0;

// 📍 [스크롤 모터 전면 재설계] X축(가로) 이동 및 복귀 엔진 장착
window.toggleMilestone = function(target) {
    const table = document.getElementById('mainTable');
    const btn = document.getElementById(`btnM${target}`);
    const cls = `show-m${target}`;
    const wrapper = document.getElementById('tableWrapper');
    
    if (table.classList.contains(cls)) {
        table.classList.remove(cls);
        btn.classList.remove('active');
        
        if (!table.classList.contains('show-m70') && !table.classList.contains('show-m80')) {
            wrapper.scrollTo({ left: savedScrollPosition, behavior: 'smooth' });
        }
    } else {
        if (!table.classList.contains('show-m70') && !table.classList.contains('show-m80')) {
            savedScrollPosition = wrapper.scrollLeft;
        }

        table.classList.add(cls);
        btn.classList.add('active');
        
        // 📍 [스크롤 확정 이동] 99999 픽셀로 지정하여 중간 멈춤 현상 없이 무조건 맨 끝으로 직행
        setTimeout(() => {
            if (wrapper) {
                wrapper.scrollTo({ left: 99999, behavior: 'smooth' });
            }
        }, 100); 
    }
};
initialize();

// 📍 [스크롤 모터 전면 재설계] X축(가로) 이동 및 복귀 엔진 장착
window.toggleMilestone = function(target) {
    const table = document.getElementById('mainTable');
    const btn = document.getElementById(`btnM${target}`);
    const cls = `show-m${target}`;
    const wrapper = document.getElementById('tableWrapper');
    
    if (table.classList.contains(cls)) {
        table.classList.remove(cls);
        btn.classList.remove('active');
        
        if (!table.classList.contains('show-m70') && !table.classList.contains('show-m80')) {
            wrapper.scrollTo({ left: savedScrollPosition, behavior: 'smooth' });
        }
    } else {
        if (!table.classList.contains('show-m70') && !table.classList.contains('show-m80')) {
            savedScrollPosition = wrapper.scrollLeft;
        }

        table.classList.add(cls);
        btn.classList.add('active');
        
        // 📍 [스크롤 확정 이동] 99999 픽셀로 지정하여 중간 멈춤 현상 없이 무조건 맨 끝으로 직행
        setTimeout(() => {
            if (wrapper) {
                wrapper.scrollTo({ left: 99999, behavior: 'smooth' });
            }
        }, 100); 
    }
};
initialize();

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 리스너 매립)
document.addEventListener('DOMContentLoaded', () => {
    // 상단 네비게이션 버튼
    document.getElementById('btn_nav_daily').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('일일출석부.html'); });
    document.getElementById('btn_nav_consult').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('상담일지.html'); });
    document.getElementById('btn_nav_unit').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('능력단위시간표.html'); });
    document.getElementById('btn_nav_main').addEventListener('click', (e) => { e.preventDefault(); location.href = classNavHref('index1.html'); });

    // 고정 탭(전체 누적) 버튼
    document.getElementById('btn_tab_total').addEventListener('click', () => changePeriod('total'));
});
