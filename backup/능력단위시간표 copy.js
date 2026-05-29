
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

const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged((user) => {
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
            .catch(err => {
                console.error("❌ 인증 실패", err);
                // [보안 강화 이식] 실패 시 읽기 허용 대신 메인으로 퇴거
                alert("인증 정보가 올바르지 않습니다. 메인 화면으로 이동합니다.");
                location.href = "../index.html"; 
            });
    } else {
        // [보안 강화 이식] 인증 정보가 아예 없는 경우 즉시 퇴거 조치
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        alert("로그인이 필요한 서비스입니다.");
        location.href = "../index.html"; 
    }
});

const urlParams = new URLSearchParams(window.location.search);
let currentClass = urlParams.get('class') || "테스트";
document.getElementById('dispClass').innerText = currentClass;

// 📍 [신규] 훈련 정보를 담아둘 전역 보관함
let courseName = "-", coursePeriod = "-";
let rawTimetable = [], masterSubjectList = [], ncsList = [], studentNames = [], fullAttendanceData = {}, currentMode = 'subject', calYear, calMonth, weeklySubMode = 'subject';
let evaluationDates = {};
// 📍 [개조] 스마트 알림 엔진용 글로벌 센서 장착
let globalFirstDateMap = {};
let globalLastDateMap = {};
let globalSortedBusinessDays = [];
let defaultViewMode = localStorage.getItem('defaultViewMode_' + currentClass) || 'subject';

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

async function initialize() {
    const cacheKey = `cache_${currentClass}_attendance`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        fullAttendanceData = JSON.parse(cachedData);
    }

    try {
        const [masterSnap, timetableSnap, attendanceSnap, evalSnap, userConfigSnap] = await Promise.all([
            database.ref(`${currentClass}/masterData`).once('value'),
            database.ref(`${currentClass}/fullTimetable`).once('value'),
            database.ref(`${currentClass}/dailyAttendance`).once('value'),
            database.ref(`${currentClass}/evaluationDates`).once('value'),
            database.ref(`${currentClass}/userConfig/defaultView`).once('value')
        ]);

        // 📍 [수리] 시간표 데이터를 배열로 안전하게 고정 (중복 할당 제거)
        let timetableVal = timetableSnap.val() || [];
        rawTimetable = Array.isArray(timetableVal) ? timetableVal : Object.values(timetableVal);

        const d = masterSnap.val() || {};
        fullAttendanceData = attendanceSnap.val() || {};
        
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
        
        if(d.courses) {
            masterSubjectList = [...new Set(d.courses.map(c => c.subject))];
            ncsList = [...new Set(d.courses.filter(c => c.unit).map(c => c.unit))];
        }

        const dbViewMode = userConfigSnap.val();
        if (dbViewMode === 'subject' || dbViewMode === 'ncs') {
            defaultViewMode = dbViewMode;
            localStorage.setItem('defaultViewMode_' + currentClass, dbViewMode);
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
            changeMode('main'); 
        }
    } catch (e) { console.error("데이터 로드 실패:", e); }
}

function updateActionSelect() {
    const sel = document.getElementById('actionSubjectSelect');
    sel.innerHTML = `<option value="">${currentMode === 'subject' ? '교과목' : '능력단위'}을 선택하세요</option>`;
    const targetList = currentMode === 'subject' ? masterSubjectList : ncsList;
    targetList.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; opt.innerText = item;
        sel.appendChild(opt);
    });
}

async function executeAction(type) {
    const subName = document.getElementById('actionSubjectSelect').value;
    if(!subName) return alert("대상을 먼저 상단에서 선택해주세요.");
    
    await loadDetailInto(subName, 'pHead', 'pBody');
    document.getElementById('targetSubName').innerText = subName;

    // 📍 [수리 핵심] 인쇄 구역의 헤더 정보 실시간 동기화
    document.getElementById('pInfoCourse').innerText = courseName;
    document.getElementById('pInfoPeriod').innerText = coursePeriod;

    let fileName = (currentMode === 'subject') ? 
        `${subName} 능력단위 출석부` : 
        `(${rawTimetable.find(r => String(r.능력단위 || "").trim() === subName.trim())?.교과목 || "미분류"})${subName} 출석부`;
    document.title = fileName;

    // 2. 데이터가 테이블에 그려질 시간을 800ms 정도 확보한 후 실행
    setTimeout(() => {
        if(type === 'print') {
            window.print();
            document.title = "종합 능력단위 출석 관리 시스템";
        }
        else if(type === 'excel') {
            // 위 HTML에서 만든 ID를 정확히 호출합니다.
            const table = document.getElementById('actionTargetTable');
            
            if(!table || table.querySelectorAll('tr').length < 2) {
                return alert("데이터를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
            }

            const wb = XLSX.utils.book_new();
            const rows = [];
            const merges = [];

            const titleLabel = currentMode === 'subject' ? "📘 교과목 출석부" : "📜 능력단위 출석부";
            rows.push([titleLabel, subName]);
            rows.push(["훈련과정", document.getElementById('infoCourse').innerText]);
            rows.push(["훈련기간", document.getElementById('infoPeriod').innerText]);
            rows.push([]); 

            for(let i=0; i<3; i++) {
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
                        rowData[currentColIdx] = "";
                        currentColIdx++;
                    }

                    // 수동 입력 값(input)이 있으면 가져오고, 없으면 텍스트를 가져옴
                    const input = td.querySelector('input');
                    const text = input ? (input.value || "0") : td.innerText.trim();
                    const colspan = parseInt(td.getAttribute('colspan') || "1");
                    const rowspan = parseInt(td.getAttribute('rowspan') || "1");

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
                            rowData[currentColIdx] = "";
                        }
                    }
                    currentColIdx++;
                });
                rows.push(rowData);
            });

            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!merges'] = merges; 
            const wscols = [{wch: 12}]; 
            for(let i=1; i<50; i++) wscols.push({wch: 6});
            ws['!cols'] = wscols;

            XLSX.utils.book_append_sheet(wb, ws, "출석부");
            XLSX.writeFile(wb, `${fileName}.xlsx`);
        }
    }, 800); 
}

async function renderSubjectList(sortType) {
    const area = document.getElementById('subjectDashboardArea');
    const dashboardTitle = document.getElementById('dashboardTitle'); 
    if(!rawTimetable.length) return;

    // 📍 [신규] 정렬 버튼 활성화 표시 처리
    document.querySelectorAll('.sort-control .ctrl-btn').forEach(btn => btn.classList.remove('active'));
    if (sortType === 'date') document.getElementById('btn_sort_date').classList.add('active');
    else if (sortType === 'name') document.getElementById('btn_sort_name').classList.add('active');

    const targetBaseList = currentMode === 'subject' ? masterSubjectList : ncsList;
    
    let totalAllMin = 0;

    // 2. 보강 데이터를 확인하기 위해 수동 출석 데이터를 가져옵니다.
    const manualSnap = await database.ref(`${currentClass}/manualAttendance`).once('value');
    const manualData = manualSnap.val() || {};

    let summary = targetBaseList.map(item => {
        const subData = rawTimetable.filter(r => {
            const targetVal = currentMode === 'subject' ? String(r.교과목 || "") : String(r.능력단위 || "");
            return targetVal.trim() === item;
        });
        
        // [로직] 등록 완료 체크
        const subDates = [...new Set(subData.map(r => getFixDate(r.날짜)))];
        const isCompleted = subDates.length > 0 && subDates.every(date => fullAttendanceData[date]);
        const completeBadge = isCompleted ? `<span style="color:#27ae60; margin-left:8px; font-size:12px;">(완료)</span>` : "";

        // [로직] 보강 데이터 체크 (해당 과목 키값으로 0분보다 큰 데이터가 있는지 확인)
       let hasMakeup = false;
        const escapedItem = item.replace(/[\.\#\$\/\[\]]/g, "_"); // 📍 특수문자를 _로 치환
Object.values(manualData).forEach(user => {
        if (user[`makeup_${escapedItem}`] > 0) hasMakeup = true; // 📍 치환된 키값으로 조회
    });
    const makeupBadge = hasMakeup ? `<span style="color:#e67e22; margin-left:8px; font-size:12px;">(보강)</span>` : "";
        let displayTitle = item;
        if (currentMode === 'ncs' && subData.length > 0) {
            const parentSubject = subData[0].교과목 || "미분류";
            displayTitle = `(${parentSubject}) ${item}`;
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
    else summary.sort((a,b) => a.start.localeCompare(b.start));
    
    let html = "";
    summary.forEach((item, idx) => {
        const statusIcon = item.isCompleted ? '✅' : (currentMode === 'subject' ? '📘' : '📜');
        
        html += `<div class="subject-dashboard-item">
    <div class="subject-summary-bar" onclick="toggleDetail('detailBox_${idx}', '${item.name}')">
        <div class="summary-name">${statusIcon} ${item.displayTitle}${item.completeBadge}${item.makeupBadge}</div>
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
                    </div>
                    <button class="btn-excel" onclick="saveManualAttendance()" style="background-color: #e67e22 !important; font-size: 12px; padding: 8px 15px;">💾 현재 수정사항 이 과목에 저장</button>
                </div>
                <div class="scroll-box"><table class="attendance-table" id="table_${idx}"><thead id="head_${idx}"></thead><tbody id="body_${idx}"></tbody></table></div>
            </div>
        </div>`;
    });
    area.innerHTML = html;
}

function toggleDetail(boxId, subName) {
    const box = document.getElementById(boxId);
    const bar = box.previousElementSibling
    if(box.style.display === "block") {
        box.style.display = "none";
        setTimeout(() => {
            bar.style.backgroundColor = ""; 
        }, 500);
        // 📍 [수리] 창을 닫을 때 저장해둔 위치로 복귀
        window.scrollTo({ top: lastScrollPos, behavior: 'smooth' });
    } else {
        // 모든 창을 닫기 전에 현재 스크롤 위치를 저장 (최초 열 때만 저장)
        if (!document.querySelector('.detail-view[style*="display: block"]')) {
            lastScrollPos = window.pageYOffset;
        }

        document.querySelectorAll('.detail-view').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.subject-summary-bar').forEach(b => b.style.backgroundColor = "");
        
        // 📍 [수리] 창을 열 때 해당 목록에 오렌지색 전등(Highlight) 투사
        bar.style.backgroundColor = "#fff3e0"; 

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
    
    const manualSnap = await database.ref(`${currentClass}/manualAttendance`).once('value');
    const manualData = manualSnap.val() || {};
    
    const studentResults = {}, masterSchedule = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    studentNames.forEach(name => studentResults[name] = { dates: {}, totalMin: 0, makeupMin: 0 });

    dates.forEach(date => {
        dateWithDay[date] = date + " (" + weekDays[new Date(date).getDay()] + ")";
        masterSchedule[date] = calculateParticipation(date, "09:00", "17:30", selectedSub, "", "");
        
        studentNames.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            let calc = { am: 0, pm: 0, isFuture: !att }; 

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
            const legendArea = parentBox.querySelector('div[style*="justify-content: flex-end"]');
            if (legendArea) {
                const btnHtml = mode === 'real' 
                    ? `<button class="ctrl-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'sim')" style="background:#8e44ad; font-size:11px; padding:5px 10px; margin-right:10px;">🔮 남은일수 출결률 보기</button>`
                    : `<button class="ctrl-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'real')" style="background:#34495e; font-size:11px; padding:5px 10px; margin-right:10px;">⏪ 실제 출결만 보기</button>`;
                const existingBtn = legendArea.querySelector('.ctrl-btn:not([onclick*="saveManualAttendance"])');
                if(existingBtn) existingBtn.remove();
                legendArea.insertAdjacentHTML('afterbegin', btnHtml);
            }
        }
    }

    // [수정 포인트 1] 테이블 헤더 구성 (요일 부분만 하이라이트)
    let h1 = `<tr><th rowspan="2" class="sticky-no">No</th><th rowspan="2" class="sticky-col">훈련생명</th>`;
    let h2 = `<tr>`;
    dates.forEach(d => { 
        // 클릭한 날짜인지 확인
        const isTarget = (d === window.lastSelectedDate);
        // 하이라이트 스타일: 클릭한 날짜면 주황색 테두리와 배경색 적용
        const headStyle = isTarget ? `background:#fff3e0; border:2px solid #e67e22 !important; color:#e67e22;` : `background:#f8f9fa;`;
        const subStyle = isTarget ? `background:#fffef0; font-weight:bold;` : ``;

        h1 += `<th colspan="2" style="${headStyle}">${dateWithDay[d]}</th>`; 
        h2 += `<th style="${subStyle}">오전</th><th style="${subStyle}">오후</th>`; 
    });
    h1 += `<th rowspan="2" style="background:#e3f2fd; width:55px;">보강(분)</th>`;
    h1 += `<th colspan="2">누계</th><th rowspan="2" style="width:70px;">출석률</th></tr>`; 
    h2 += `<th>분</th><th>시간</th></tr>`;
    thead.innerHTML = h1 + h2;

    let masterTotal = 0;
    dates.forEach(d => masterTotal += (masterSchedule[d].am + masterSchedule[d].pm));

    // 📍 [수리] 편성 시간 행에도 순번 칸 대응 (빈 칸)
    let masterRowHtml = `<tr style="background:#f1f8e9; font-weight:bold; color:#2e7d32;">
        <td class="sticky-no">-</td>
        <td class="sticky-col">[편성 시간]</td>`;
    dates.forEach(d => {
        masterRowHtml += `<td>${masterSchedule[d].am}</td><td>${masterSchedule[d].pm}</td>`;
    });
    masterRowHtml += `<td style="background:#e8f5e9;">-</td>
        <td>${masterTotal}</td>
        <td>${(masterTotal/60).toFixed(1)}h</td>
        <td style="color:#2e7d32;">100%</td>
    </tr>`;

    // [수정 포인트 2] 학생 데이터 생성 (출석 칸 스타일 제거, 순정 유지)
    let studentHtml = studentNames.map((name, idx) => { // (name)에서 (name, idx)로 변경
        let rowTotalMin = 0;
        let dateCells = "";
        
        dates.forEach(d => {
            const res = results[name].dates[d];
            const attInfo = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : {};
            let amV = res.am;
            let pmV = res.pm;
            let cellClass = "";

            if (mode === 'sim' && res.isFuture) {
                amV = masterSchedule[d].am; pmV = masterSchedule[d].pm;
                cellClass = "status-special"; 
            } else {
                const st = attInfo.status || "";
                const inT = attInfo.inTime || "00:00:00";
                
                // [수정 부위] '미편입'인 경우에도 '결석(status-absent)' 색상을 적용하여 빨간색으로 표시합니다.
                if (st.includes("지각") || st.includes("조퇴") || (parseInt(inT.replace(/:/g, '')) > 90000 && parseInt(inT.replace(/:/g, '')) < 130000)) {
                    cellClass = "status-late";
                } else if (st.includes("외출")) {
                    cellClass = "status-out";
                } else if (st.includes("결석") || st === "미편입") { // 이 부분에 '미편입'을 추가했습니다.
                    cellClass = "status-absent";
                } else if (st.includes("휴가") || st.includes("공가") || st.includes("기타")) {
                    cellClass = "status-special";
                }
            }

            rowTotalMin += (amV + pmV);
            // style 속성을 비워두어 기존 cellClass의 배경색만 나오게 합니다.
            dateCells += `<td class="${cellClass}">${amV}</td><td class="${cellClass}">${pmV}</td>`;
        });

        const makeupMin = results[name].makeupMin;
        const finalTotalMin = rowTotalMin + makeupMin;
        const percent = ((finalTotalMin / masterTotal) * 100).toFixed(1);
        const statusStyle = percent < 75 ? "color:red;" : "color:green;";

        const makeupDisplay = (headId.startsWith('pHead')) ? makeupMin : 
    `<input type="number" 
        class="edit-input makeup-input makeup-${name}" 
        data-name="${name}" 
        data-sub="${selectedSub}" 
        data-type="makeup" 
        value="${makeupMin}" 
        oninput="this.classList.add('manual-modified'); calculateRowPercent('${name}', ${masterTotal}, this)" 
        style="width:100%;">`;

        return `<tr>
            <td class="sticky-no">${idx + 1}</td>
            <td class="sticky-col">${name}</td>
            ${dateCells}
            <td style="background:#fff3e0; width:55px;">${makeupDisplay}</td>
            <td id="totalMin_${name}" style="font-weight:bold;">${finalTotalMin}</td>
            <td id="totalHour_${name}" style="color:#27ae60; font-weight:bold;">${(finalTotalMin/60).toFixed(1)}h</td>
            <td id="percent_${name}" style="font-weight:bold; ${statusStyle}">${percent}%</td>
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
function calculateParticipation(date, inTime, outTime, targetSub, leaveTime, returnTime, modeOverride) {
    if (!inTime || !outTime || inTime.startsWith("00")) return {am:0, pm:0};
    
    // 주차별 상세 클릭 시엔 전달받은 모드를, 그 외엔 현재 전역 모드를 사용
    const activeMode = modeOverride || currentMode;
    const scheds = rawTimetable.filter(r => {
        const rowVal = (activeMode === 'subject') ? String(r.교과목 || "") : String(r.능력단위 || "");
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
                const outLunch = Math.max(0, Math.min(rIn, lunchE) - Math.max(lIn, lunchS));
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
        await database.ref(`${currentClass}/userConfig`).update({ defaultView: mode });
        
        // 2. 브라우저 메모리(Local) 즉각 저장
        localStorage.setItem('defaultViewMode_' + currentClass, mode);
        
        defaultViewMode = mode;
        
        // 📍 [추가] 라디오 버튼 체크 상태를 물리적으로 고정 (UI 동기화)
        const radio = document.querySelector(`input[name="defaultView"][value="${mode}"]`);
        if(radio) radio.checked = true;

        switchTo(mode);
        alert(`✅ 기본 설정이 [${mode === 'subject' ? '교과목별' : '능력단위별'}]로 고정되었습니다.`);
    } catch(e) { 
        alert("저장 실패: " + e.message); 
    }
}

// 2. 메인 탭 제어 함수
function changeMode(mode) {
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

let calendarSubMode = 'subject'; // 달력 전용 분류 모드 변수 추가

function renderCalendar() {
    const viewArea = document.getElementById('viewArea');
    if (rawTimetable.length === 0) { viewArea.innerHTML = "<p style='text-align:center; padding:50px;'>데이터 로드 중...</p>"; return; }
    
    // 📍 [개조] 시작/종료일 및 훈련일 전체 스캔 (스마트 멘트 엔진용)
    globalFirstDateMap = {};
    globalLastDateMap = {};
    const allBusinessDays = new Set();

    rawTimetable.forEach(r => {
        const sub = (calendarSubMode === 'subject' ? r.교과목 : r.능력단위) ? 
                    String(calendarSubMode === 'subject' ? r.교과목 : r.능력단위).trim() : "";
        const checkSub = String(r.교과목 || "").trim();
        const period = String(r.교시).trim();

        if (period !== "점심" && isActualSubject(checkSub)) {
            const d = getFixDate(r.날짜);
            allBusinessDays.add(d);
            if (sub !== "") {
                if (!globalFirstDateMap[sub] || d < globalFirstDateMap[sub]) { globalFirstDateMap[sub] = d; }
                if (!globalLastDateMap[sub] || d > globalLastDateMap[sub]) { globalLastDateMap[sub] = d; }
            }
        }
    });
    globalSortedBusinessDays = Array.from(allBusinessDays).sort();
    const lastDateMap = globalLastDateMap; // 기존 UI 호환성 유지

    let calHtml = `
        <div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px; display:flex; align-items:center; gap:15px; justify-content: center; flex-wrap:wrap;">
            <span style="font-weight:bold; color:#1b5e20;">🔎 달력 표시 기준:</span>
            <button onclick="calendarSubMode='subject'; renderCalendar();" class="tab-btn ${calendarSubMode === 'subject' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">교과목별</button>
            <button onclick="calendarSubMode='ncs'; renderCalendar();" class="tab-btn ${calendarSubMode === 'ncs' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">능력단위별</button>
            
            <button onclick="autoRegisterEvaluationDates()" style="background:#e67e22; color:white; border:none; border-radius:4px; padding:6px 15px; font-weight:bold; cursor:pointer; margin-left:10px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">⚡ 종료일 자동 등록</button>
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
    const nowKst = new Date();
    const offset = nowKst.getTimezoneOffset() * 60000;
    const todayStr = new Date(nowKst - offset).toISOString().split('T')[0];
    const isToday = (targetDate === todayStr);

    // 2. [센서] 평가일 감지 (모드별 분리 센서 적용)
    const isEvalDay = evaluationDates[calendarSubMode] && evaluationDates[calendarSubMode][targetDate];
    
    // 3. [스타일 병합] 오늘이면 진한 초록 테두리, 평가일이면 노란 배경
    let dayStyle = "";
    if (isToday) dayStyle += `border: 3px solid #27ae60 !important; box-shadow: 0 0 8px rgba(39, 174, 96, 0.4); z-index: 10; `;
    if (isEvalDay) dayStyle += `background-color: #fffde7 !important; border: 2px solid #f1c40f !important; `;
    
    const evalBadge = isEvalDay ? `<span style="font-size:10px; color:#e67e22; font-weight:bold; margin-left:5px;">📢 평가일</span>` : "";
    const classNames = `calendar-day ${dayType === 0 ? 'sun' : dayType === 6 ? 'sat' : ''}`;
        let weekBadge = ""; if(dayType === 0) { currentDate.setHours(0,0,0,0); if(currentDate >= startSunday && currentDate <= endSunday) { const weekNum = Math.floor((currentDate - startSunday) / (1000 * 60 * 60 * 24 * 7)) + 1; weekBadge = `<div style="font-size:10px; color:#27ae60; background:#e8f5e9; padding:2px 4px; border-radius:3px; display:inline-block; margin-left:5px;">(${weekNum}주차)</div>`; } }
        
        const amData = {}; 
        const pmData = {}; 
        const holidays = new Set();
        let hasClassToday = false;

        rawTimetable.forEach(r => { 
            if(getFixDate(r.날짜) === targetDate) { 
                const sub = (calendarSubMode === 'subject' ? r.교과목 : r.능력단위) ? String(calendarSubMode === 'subject' ? r.교과목 : r.능력단위).trim() : "";
                const checkSub = String(r.교과목 || "").trim();
                const period = String(r.교시).trim();
                
                if(period !== "점심") { 
                    if(isActualSubject(checkSub)) {
                        if(sub !== "") {
                            hasClassToday = true;
                            if(['1','2','3','4'].includes(period)) amData[sub] = (amData[sub] || 0) + 1;
                            else if(['5','6','7','8'].includes(period)) pmData[sub] = (pmData[sub] || 0) + 1;
                        } 
                    } else {
                        if(checkSub !== "") holidays.add(checkSub);
                    } 
                } 
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

        // 📍 [개조] 특별 멘트 사전 탐지 센서 작동 및 동적 아이콘(⭐/📜) 스위치 적용
        let hasSpecialMsg = false;
        if (hasClassToday) {
            const todaySubs = new Set([...Object.keys(amData), ...Object.keys(pmData)]);
            // 조건 1 & 2: 신규 시작이거나 당일 종료인 과목이 있는지 탐지
            todaySubs.forEach(sub => {
                if (globalFirstDateMap[sub] === targetDate || globalLastDateMap[sub] === targetDate) {
                    hasSpecialMsg = true;
                }
            });
            // 조건 3: 다음 훈련일에 종료되는 과목이 있는지 탐지
            const currentIdx = globalSortedBusinessDays.indexOf(targetDate);
            if (currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
                const nextBDate = globalSortedBusinessDays[currentIdx + 1];
                for (const sub in globalLastDateMap) {
                    if (globalLastDateMap[sub] === nextBDate) {
                        hasSpecialMsg = true;
                        break; // 하나라도 발견되면 즉시 센서 탐색 종료
                    }
                }
            }
        }
        
        // 탐지 결과에 따라 아이콘 출력
        const btnIcon = hasSpecialMsg ? "⭐" : "📜";
        const scrollBtn = hasClassToday ? `<button onclick="openSmartMemo('${targetDate}', event)" style="background:none; border:none; cursor:pointer; font-size:16px; padding:0; margin:0; line-height:1; transition:transform 0.1s;" title="스마트 지능형 멘트 생성" onmousedown="this.style.transform='scale(0.8)'" onmouseup="this.style.transform='scale(1)'">${btnIcon}</button>` : "";

        calHtml += `<div class="${classNames}" style="${dayStyle} display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                <div class="day-num" style="cursor:pointer; margin-bottom: 0;" onclick="toggleEvaluationDate('${targetDate}')">
                    ${d}${weekBadge}${attBadge}${evalBadge}
                </div>
                <div>${scrollBtn}</div>
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
}

function renderWeekly() {
    const viewArea = document.getElementById('viewArea'); 
    if (rawTimetable.length === 0) return;
    
    const weeklyData = {}; 
    const allDatesArr = rawTimetable.map(r => getFixDate(r.날짜)).filter(d => d !== "날짜미상").sort();
    const firstDate = new Date(allDatesArr[0]); 
    const startSunday = new Date(firstDate); 
    startSunday.setDate(firstDate.getDate() - firstDate.getDay()); 
    startSunday.setHours(0,0,0,0);

    let totalAllWeeksTime = 0;
    const allUniqueSubjects = new Set();

    // 데이터 집계 로직
    rawTimetable.forEach(row => {
        const sub = (weeklySubMode === 'subject' ? row.교과목 : row.능력단위) ? String(weeklySubMode === 'subject' ? row.교과목 : row.능력단위).trim() : "";
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
        }
    });

    const sortedWeeks = Object.keys(weeklyData).sort((a, b) => parseInt(a) - parseInt(b));
    
    // 📍 [수리] 상단 필터 버튼 및 안내 문구
    let html = `
        <div style="background:#fff; padding:15px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px; display:flex; align-items:center; gap:15px; justify-content: center;">
            <span style="font-weight:bold; color:#1b5e20;">🔎 주차별 분류 기준:</span>
            <button onclick="weeklySubMode='subject'; renderWeekly();" class="tab-btn ${weeklySubMode === 'subject' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">교과목별</button>
            <button onclick="weeklySubMode='ncs'; renderWeekly();" class="tab-btn ${weeklySubMode === 'ncs' ? 'active' : ''}" style="border-radius:4px; padding:6px 15px;">능력단위별</button>
        </div>
        <div style="margin-bottom:15px; font-weight:bold; color:#2c3e50; text-align:center;">💡 과목명을 클릭하면 상세 출석부가 열립니다. (ESC: 닫기 / Tab: 다음 과목)</div>`;

    // 📍 [수리 핵심] 헤더 복구 및 weekly-view-table 클래스 부여
    html += `<table class="attendance-table weekly-view-table" style="table-layout: fixed; width: 100%; border-collapse: collapse;">
                <colgroup><col style="width: 15%;"><col style="width: 70%;"><col style="width: 15%;"></colgroup>
                <thead>
                    <tr style="background:#2c3e50; color:white;">
                        <th>주차 (총 ${sortedWeeks.length}주)</th>
                        <th>진행 ${weeklySubMode === 'subject' ? '교과목' : '능력단위'} (총 ${allUniqueSubjects.size}개)</th>
                        <th>합계 (총 ${totalAllWeeksTime}h)</th>
                    </tr>
                </thead>
                <tbody>`;

    sortedWeeks.forEach(w => { 
        const d = weeklyData[w]; 
        const dateList = Array.from(d.dates).join(','); 
        const subTexts = Object.entries(d.subjectMap).sort((a, b) => a[0].localeCompare(b[0], 'ko')).map(([n, h]) => 
            `<span class="weekly-subject-link" onclick="showWeeklySubjectDetail('${n}', '${dateList}', '${w}', this)">
                <span class="sub-name">${n}</span><span class="sub-hour">(${h}h)</span>
            </span>`).join(''); 

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

    if (!hasChange) return alert("수정된 데이터가 없습니다.");
    if (!confirm("변경사항을 서버에 저장하시겠습니까?")) return;

    try {
        for (const stdName in manualUpdate) {
            await database.ref(`${currentClass}/manualAttendance/${stdName}`).update(manualUpdate[stdName]);
        }
        alert("✅ 모든 데이터가 안전하게 저장되었습니다.");
        location.reload(); 
    } catch (e) {
        alert("❌ 저장 실패: " + e.message);
    }
}
// 주차별 특정 과목 클릭 시 상세 내역 출력 함수
let currentWeeklyOpenSub = null; // 현재 어떤 과목이 열려있는지 추적하는 센서

async function showWeeklySubjectDetail(subName, dateListStr, weekNum, element) {
    const targetDates = dateListStr.split(',').sort();
    
    // 1. 모든 과목명에서 강조색 제거 및 현재 요소에만 강조색 부여
    document.querySelectorAll('.weekly-subject-link').forEach(el => el.classList.remove('active-sub'));
    if(element) {
        element.classList.add('active-sub');
        // 현재 열린 과목 엘리먼트를 추적하기 위해 전역 변수나 속성에 저장 (Tab 기능을 위함)
        window.currentWeeklyOpenSub = element;
    }

    const detailRow = document.getElementById(`weeklyDetailRow_${weekNum}`);
    const detailArea = document.getElementById(`weeklyDetailArea_${weekNum}`);
    
    detailRow.style.display = 'table-row';
    detailArea.innerHTML = `<div style="padding:15px; text-align:center;">⌛ [${subName}] 데이터를 분석 중입니다...</div>`;

    const manualSnap = await database.ref(`${currentClass}/manualAttendance`).once('value');
    const manualData = manualSnap.val() || {};
    const studentResults = {}, dateWithDay = {}, weekDays = ['일','월','화','수','목','금','토'];
    
    let maxWeekMin = 0;
    const weekSchedule = {};
    studentNames.forEach(name => studentResults[name] = { dates: {}, totalMin: 0 });

    const actualSubjectDates = targetDates.filter(date => {
        return rawTimetable.some(r => {
            const rowVal = (weeklySubMode === 'subject' ? r.교과목 : r.능력단위) || "";
            return getFixDate(r.날짜) === date && rowVal.replace(/\s+/g, "") === subName.replace(/\s+/g, "");
        });
    });

    // 📍 [신규 부품 1] 해당 과목의 전체 수업일 중 '가장 마지막 날짜' 추적
    const allSubDates = rawTimetable.filter(r => {
        const rowVal = (weeklySubMode === 'subject' ? r.교과목 : r.능력단위) || "";
        return rowVal.replace(/\s+/g, "") === subName.replace(/\s+/g, "");
    }).map(r => getFixDate(r.날짜)).sort();
    const absoluteLastDate = allSubDates[allSubDates.length - 1];

    // 📍 [신규 부품 2] 현재 렌더링 중인 주차에 '마지막 날짜'가 포함되어 있는지 판별 (마지막 주차 센서)
    const isLastWeek = actualSubjectDates.includes(absoluteLastDate);
    const escapedSub = subName.replace(/[\.\#\$\/\[\]]/g, "_"); // 보강 데이터 조회용 치환

    actualSubjectDates.forEach(date => {
        dateWithDay[date] = date + " (" + weekDays[new Date(date).getDay()] + ")";
        const daySched = calculateParticipation(date, "09:00", "17:30", subName, "", "", weeklySubMode);
        const dayTotal = daySched.am + daySched.pm;
        weekSchedule[date] = dayTotal;
        maxWeekMin += dayTotal;

        studentNames.forEach(name => {
            const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
            let calc = { am: 0, pm: 0 };
            if (att && att.inTime && att.outTime) {
                calc = calculateParticipation(date, att.inTime, att.outTime, subName, att.leaveTime || "", att.returnTime || "", weeklySubMode);
            }
            if (manualData[name] && manualData[name][date]) {
                if (manualData[name][date].am !== undefined) calc.am = manualData[name][date].am;
                if (manualData[name][date].pm !== undefined) calc.pm = manualData[name][date].pm;
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
                        <th rowspan="2" style="width:100px;">훈련생명</th>
                        <th rowspan="2" style="background:#e8f5e9; width:120px; color:#2c3e50;">주간 합계</th>`;
    actualSubjectDates.forEach(d => html += `<th colspan="2">${dateWithDay[d]}<br><small>(${weekSchedule[d]}분)</small></th>`);
    html += `<th rowspan="2" style="background:#e8f5e9; width:80px;">상태</th></tr>
                    <tr style="background:#f8f9fa;">`;
    actualSubjectDates.forEach(() => html += `<th>오전</th><th>오후</th>`);
    html += `</tr></thead><tbody>`;

    studentNames.forEach(name => {
        const tMin = studentResults[name].totalMin;
        const rowStyle = (tMin < maxWeekMin) ? `background-color: #fff9c4;` : ``;
        const statusText = (tMin < maxWeekMin) ? `<span style="color:#d35400; font-weight:bold;">부족</span>` : `<span style="color:#27ae60;">이수</span>`;

        // 📍 [신규 부품 3] 마지막 주차이면서 학생의 보강 시간이 존재하면 주황색 괄호 텍스트 생성
        let makeupMin = 0;
        if (manualData[name] && manualData[name][`makeup_${escapedSub}`]) {
            makeupMin = parseInt(manualData[name][`makeup_${escapedSub}`]) || 0;
        }
        const makeupText = (isLastWeek && makeupMin > 0) ? `<br><span style="color:#e67e22; font-size:10.5px; font-weight:bold;">(보강 ${formatMin(makeupMin)})</span>` : "";

        html += `<tr class="${tMin < maxWeekMin ? 'row-insufficient' : ''}">
            <td class="weekly-std-name">${name}</td>
            <td class="weekly-std-total">${formatMin(tMin)}${makeupText}</td>`; // 📍 합계 텍스트 바로 뒤에 용접
        actualSubjectDates.forEach(d => {
            const res = studentResults[name].dates[d] || { am: 0, pm: 0 };
            html += `<td>${res.am}</td><td>${res.pm}</td>`;
        });
        html += `<td>${statusText}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    
    detailArea.innerHTML = html;
    detailRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 보강 시간 입력 시 실시간으로 출석률을 계산하는 함수
function calculateRowPercent(name, masterTotal, inputEl) {
    // [안전장치 1] 분모가 0이거나 데이터가 없으면 엔진 가동 중단
    if (!masterTotal || masterTotal <= 0) {
        console.warn(`⚠️ [${name}] 과목의 편성 시간이 0분으로 감지되어 실시간 계산을 중지합니다.`);
        return; 
    }

    // [수리 포인트] 전역에서 찾는 대신, 전달받은 inputEl(this)을 기준으로 행을 찾습니다.
    if (!inputEl) return;
    const row = inputEl.closest('tr');
    const makeupValue = parseInt(inputEl.value) || 0;

    const cells = row.querySelectorAll('td');
    let rowSum = 0;

    // [안전장치 2] 표의 구조 정밀 추적 (순번0, 이름1 이후부터 보강-4 전까지)
    for (let i = 2; i < cells.length - 4; i++) {
        const val = parseInt(cells[i].innerText) || 0;
        rowSum += val;
    }

    const finalSum = rowSum + makeupValue;
    const percent = ((finalSum / masterTotal) * 100).toFixed(1);
    
    // [핵심 수리] 전역 ID(getElementById)를 쓰지 않고, 현재 행(row) 안에서만 엘리먼트를 찾습니다.
    // CSS 선택자 [id^="..."]는 "해당 텍스트로 시작하는 ID"를 찾는다는 뜻입니다.
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

async function toggleEvaluationDate(date) {
    // [개조] 현재 달력의 모드(calendarSubMode)를 기준으로 평가일 여부 판별
    const isExists = evaluationDates[calendarSubMode] && evaluationDates[calendarSubMode][date];
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    if (!isExists) {
        if (confirm(`📅 [${date} / ${modeName} 모드]\n평가 일정을 등록하시겠습니까?\n달력 배경이 노란색으로 강조됩니다.`)) {
            try {
                // [개조] DB 배선 분리: /evaluationDates/모드/날짜
                await database.ref(`${currentClass}/evaluationDates/${calendarSubMode}/${date}`).set({
                    timestamp: new Date().getTime(),
                    type: '평가'
                });
                // 메모리 데이터 2채널 즉시 갱신
                if(!evaluationDates[calendarSubMode]) evaluationDates[calendarSubMode] = {};
                evaluationDates[calendarSubMode][date] = { type: '평가' }; 
                renderCalendar(); 
            } catch (e) { alert("저장 실패: " + e.message); }
        }
    } else {
        if (confirm(`🗑️ [${date} / ${modeName} 모드]\n이미 등록된 평가 일정입니다.\n삭제하시겠습니까?`)) {
            try {
                // [개조] DB 배선 분리: /evaluationDates/모드/날짜
                await database.ref(`${currentClass}/evaluationDates/${calendarSubMode}/${date}`).remove();
                delete evaluationDates[calendarSubMode][date]; 
                renderCalendar(); 
            } catch (e) { alert("삭제 실패: " + e.message); }
        }
    }
}

// [추가] 수동 데이터 전체 초기화 함수
async function resetAllManualData() {
    // 1단계: 단순 확인 (브레이크 확인)
    const firstCheck = confirm("❗ 정말 모든 수동 입력 기록(보강 시간, 수동 출결 수정, 평가일 등)을 삭제하시겠습니까?\n이 작업은 절대 복구할 수 없습니다.");
    
    if (!firstCheck) return;

    // 📍 [개조] 반 정보를 포함한 보안 구절 생성
    const passPhrase = `${currentClass}반 삭제합니다`; // 예: "테스트반 삭제합니다"
    
    // 2단계: 보안 구절 입력 (이중 안전 핀)
    const secondCheck = prompt(`⚠️ 위험한 작업입니다.\n보안 확인을 위해 아래 문구를 정확히 입력해주세요.\n\n[ ${passPhrase} ]`);

    if (secondCheck === passPhrase) {
        try {
            // 삭제 대상 리스트 (데이터 초기화 엔진 가동)
            const updates = {};
            updates[`${currentClass}/manualAttendance`] = null; // 보강 및 수동 수정 데이터 삭제
            updates[`${currentClass}/evaluationDates`] = null;   // 평가일 일정 삭제

            await database.ref().update(updates);
            
            alert("✅ 모든 수동 입력 데이터가 안전하게 초기화되었습니다.");
            location.reload(); // 화면 새로고침하여 데이터 증발 확인
        } catch (e) {
            alert("❌ 초기화 중 오류가 발생했습니다: " + e.message);
        }
    } else {
        // 문구가 조금이라도 틀리면 즉시 보호 모드 가동
        alert(`❌ 입력 문구가 일치하지 않습니다.\n데이터가 안전하게 보호되었습니다.`);
    }
}

// [신규 기능] 전체 과목 일괄 인쇄
async function executeAllPrint() {
    const targetList = currentMode === 'subject' ? masterSubjectList : ncsList;
    if (!targetList.length) return alert("인쇄할 대상이 없습니다.");
    
    if (!confirm(`총 ${targetList.length}개의 과목을 한 번에 인쇄하시겠습니까?\n데이터 양에 따라 시간이 소요될 수 있습니다.`)) return;

    const printArea = document.getElementById('printOnlyArea');
    printArea.innerHTML = ""; // 기존 내용 초기화
    printArea.style.display = "block"; // 데이터 로드 중 보이지 않게 처리하려면 스타일 조정 필요

    // 로딩 표시용 알림 (간이)
    const loadingDiv = document.createElement('div');
    loadingDiv.innerText = "데이터 집계 중... 잠시만 기다려주세요.";
    loadingDiv.style.textAlign = "center";
    loadingDiv.style.padding = "20px";
    document.body.appendChild(loadingDiv);

    try {
        for (let i = 0; i < targetList.length; i++) {
            const subName = targetList[i];
            const pageDiv = document.createElement('div');
            pageDiv.className = "print-page-break"; // 페이지 넘김 설정
            
            // 인쇄용 양식 생성 (기존 printOnlyArea 내부 구조 복제)
            pageDiv.innerHTML = `
                <div id="printSubjectTitle" style="display:block !important; text-align:center; font-size:20px; font-weight:bold; margin-bottom:8px; border-bottom:2px solid #000;">
                    출석부: ${subName}
                </div>
                <table class="excel-info-table" style="margin-bottom:10px !important; border:1.5px solid #000 !important;">
                    <tr>
            <td class="info-label">훈련과정 :</td>
            <td class="info-value">${courseName}</td>  <td class="info-label">훈련기간 :</td>
            <td class="info-value">${coursePeriod}</td> </tr>
    </table>
                <div class="scroll-box">
                    <table class="attendance-table" style="width:100% !important; border:1.5px solid black !important; border-collapse:collapse !important;">
                        <thead id="pHead_${i}"></thead>
                        <tbody id="pBody_${i}"></tbody>
                    </table>
                </div>
                <div style="margin-top:10px;"></div>
            `;
            printArea.appendChild(pageDiv);

            // 중요: 검증된 loadDetailInto 함수를 호출하여 데이터를 주입
            // 각 반복마다 고유한 ID(pHead_0, pHead_1...)를 넘겨 정확한 위치에 그리게 합니다.
            await loadDetailInto(subName, `pHead_${i}`, `pBody_${i}`, 'real');
        }

        // 모든 데이터 로드 완료 후 인쇄창 띄우기
        setTimeout(() => {
            loadingDiv.remove();
            window.print();
        }, 1000);
        
    } catch (e) {
        console.error(e);
        alert("데이터 로드 중 오류가 발생했습니다.");
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
        // display가 flex거나 block인 경우 모두 감지하여 닫습니다.
        if (calModal && (calModal.style.display === 'flex' || calModal.style.display === 'block')) {
            calModal.style.display = 'none';
            console.log("📅 달력 모달이 안전하게 닫혔습니다.");
        }

        // 3. [주차별 행] 📋 주차별 상세 행(weeklyDetailRow) 일괄 닫기
        document.querySelectorAll('[id^="weeklyDetailRow_"]').forEach(row => {
            if (row.style.display === 'table-row') {
                row.style.display = 'none';
            }
        });

        // 4. [강조색 해제] 💡 활성화된 과목명 강조(Active) 램프 끄기
        document.querySelectorAll('.weekly-subject-link').forEach(el => {
            el.classList.remove('active-sub');
        });
    }

    // 📍 [신규] Tab 키 순차 변속 엔진 (주차별 보기에서만 작동)
    if (e.key === 'Tab') {
        const openWeeklyRow = document.querySelector('[id^="weeklyDetailRow_"][style*="display: table-row"]');
        if (openWeeklyRow) {
            e.preventDefault(); // 기본 포커스 이동 차단
            const allLinks = Array.from(document.querySelectorAll('.weekly-subject-link'));
            const currentIndex = allLinks.indexOf(window.currentWeeklyOpenSub);
            const nextIndex = (currentIndex + 1) % allLinks.length;
            
            // 다음 과목 강제 클릭
            allLinks[nextIndex].click();
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


// 📍 [수리] 표 열(Column) 하이라이트 트래킹 회로 보강
document.addEventListener('mouseover', function (e) {
    const cell = e.target.closest('.attendance-table td, .attendance-table th');
    if (!cell) return;

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

// 📍 [신규 기능 3] 스마트 지능형 멘트 생성 엔진 (클립보드 복사 탑재)
function openSmartMemo(date, event) {
    event.stopPropagation(); // 달력 일자 클릭(평가일 토글) 이벤트 간섭 완벽 차단
    
    const dayIdx = new Date(date).getDay();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayName = dayNames[dayIdx];

    // [순서 변경] 주말 수업 여부를 먼저 판별하기 위해, 당일 진행 과목 스캔 엔진을 상단으로 전진 배치합니다.
    // 1. 당일 진행 과목 스캔
    const todaySubjects = new Set();
    rawTimetable.forEach(r => {
        if(getFixDate(r.날짜) === date) {
            const sub = (calendarSubMode === 'subject' ? r.교과목 : r.능력단위) ? String(calendarSubMode === 'subject' ? r.교과목 : r.능력단위).trim() : "";
            const checkSub = String(r.교과목 || "").trim();
            if(String(r.교시).trim() !== "점심" && sub !== "" && isActualSubject(checkSub)) {
                todaySubjects.add(sub);
            }
        }
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

    // 3. 특별 감지: 신규 시작 및 당일 종료
    let specialMsg = "";
    todaySubjects.forEach(sub => {
        // 📍 [개조] 스마트 멘트 출력용 불순물(숫자, 영어, 기호) 제거 필터 장착 (순수 한글과 공백만 통과)
        const displaySub = sub.replace(/[^가-힣\s]/g, '').replace(/\s+/g, ' ').trim();

        if(globalFirstDateMap[sub] === date) {
            specialMsg += `\n 오늘부터 배우게 된 '${displaySub}' 과목에 대한 내부평가 제반사항을 안내하오니 숙지해 주시기 바랍니다.`;
        }
        if(globalLastDateMap[sub] === date) {
            specialMsg += `\n 오늘 '${displaySub}' 과목의 내부평가 수행하느라 수고하셨습니다.`;
        }
    });

    // 4. 특별 감지: 종료 예보 (휴일 제외 다음 훈련일 기준)
    const currentIdx = globalSortedBusinessDays.indexOf(date);
    if(currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
        const nextBDate = globalSortedBusinessDays[currentIdx + 1];
        for(const sub in globalLastDateMap) {
            if(globalLastDateMap[sub] === nextBDate) {
                // 📍 [개조] 스마트 멘트 출력용 불순물 제거 필터 장착
                const displaySub = sub.replace(/[^가-힣\s]/g, '').replace(/\s+/g, ' ').trim();

                specialMsg += `\n 다음 훈련일(${nextBDate})에 '${displaySub}' 과목의 내부평가가 있으니 꼭 출석해 주세요.`;
            }
        }
    }

    // 5. 최종 조합
    const finalMemo = `${baseMsg}${specialMsg}`;
    
    // 6. 클립보드 복사 (물리적 강제 복사 모터 장착)
    // 브라우저 권한에 구애받지 않고 확실하게 복사되도록 임시 텍스트 박스를 활용합니다.
    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = finalMemo;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    tempTextArea.setSelectionRange(0, 99999); // 모바일 기기 호환성 유지

    try {
        document.execCommand("copy");
        alert(`📋 [클립보드 자동 복사 완료]\n\n원하시는 곳(카카오톡, 단체문자 등)에 붙여넣기(Ctrl+V) 하세요.\n\n------------------------\n${finalMemo}`);
    } catch (err) {
        alert(`📋 (자동 복사 실패. 아래 문구를 드래그해서 직접 복사해주세요)\n\n${finalMemo}`);
    } finally {
        document.body.removeChild(tempTextArea); // 작업 완료 후 임시 부품 철거
    }
}

// 📍 [신규 기능 4] 평가일 자동 일괄 등록 (종료일 기준)
async function autoRegisterEvaluationDates() {
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    // 센서가 감지한 현재 모드의 모든 종료일 추출
    const endDates = Object.values(globalLastDateMap);
    if(endDates.length === 0) return alert("등록할 종료일 데이터가 존재하지 않습니다.");

    // 중복되는 날짜 제거 (같은 날 여러 과목이 끝날 경우 방어)
    const uniqueEndDates = [...new Set(endDates)];

    // 선생님께서 요청하신 정확한 멘트 출력
    if (!confirm(`[${modeName} 모드]\n훈련 종료일 기준으로 평가일을 등록합니다. 추가 확인하세요.`)) return;

    try {
        const updates = {};
        if (!evaluationDates[calendarSubMode]) evaluationDates[calendarSubMode] = {};

        // 파이어베이스 DB로 한 번에 보낼 배선 준비
        uniqueEndDates.forEach(date => {
            updates[`${currentClass}/evaluationDates/${calendarSubMode}/${date}`] = {
                timestamp: new Date().getTime(),
                type: '평가'
            };
            // 로컬 메모리 동시 업데이트 (새로고침 방지)
            evaluationDates[calendarSubMode][date] = { type: '평가' };
        });

        // DB에 일괄 주입 (엑셀 업로드처럼 한번에 처리하여 속도 확보)
        await database.ref().update(updates);
        
        alert(`✅ 총 ${uniqueEndDates.length}일의 평가 일정이 자동 등록되었습니다.`);
        renderCalendar(); // 계기판(달력) 즉시 리로드
    } catch (error) {
        alert("❌ 자동 등록 중 오류가 발생했습니다: " + error.message);
    }
}

// 📍 [신규 기능 5] 현재 모드의 평가일 전체 초기화 (삭제)
async function clearEvaluationDates() {
    const modeName = calendarSubMode === 'subject' ? '교과목' : '능력단위';
    
    // 비어있는지 먼저 확인
    if(!evaluationDates[calendarSubMode] || Object.keys(evaluationDates[calendarSubMode]).length === 0) {
        return alert(`현재 [${modeName}] 모드에 등록된 평가일이 없습니다.`);
    }

    if (!confirm(`⚠️ [${modeName} 모드]\n달력에 등록된 모든 평가일을 삭제하시겠습니까?\n(이 작업은 현재 선택된 모드에만 적용됩니다.)`)) return;

    try {
        // 파이어베이스 해당 구역 폭파
        await database.ref(`${currentClass}/evaluationDates/${calendarSubMode}`).remove();
        
        // 메모리 초기화
        evaluationDates[calendarSubMode] = {};
        
        alert("✅ 전체 삭제가 완료되었습니다.");
        renderCalendar(); 
    } catch (error) {
        alert("❌ 삭제 중 오류가 발생했습니다: " + error.message);
    }
}

// 📍 [신규 기능 6] 우측 평가일 목록 배너 실시간 동기화 엔진
function updateEvalBanner() {
    const banner = document.getElementById('evalDateBanner');
    if (!banner) return;

    // 모바일(768px 이하) 환경에서는 JS 엔진 가동 중지 (성능 최적화)
    if (window.innerWidth <= 768) {
        banner.style.display = 'none';
        return;
    }

    const evalDatesObj = evaluationDates[calendarSubMode] || {};
    const dates = Object.keys(evalDatesObj).sort(); // 날짜 오름차순 정렬

    let html = `<h4 style="margin: 0 0 10px 0; color: #d35400; border-bottom: 2px solid #f1c40f; padding-bottom: 5px; font-size: 14px; text-align: center; font-weight: bold;">📢 평가일 목록</h4>`;
    html += `<div style="font-size:11px; color:#666; margin-bottom:10px; text-align:center;">(${calendarSubMode === 'subject' ? '교과목' : '능력단위'} 기준)</div>`;

    if (dates.length === 0) {
        html += `<div style="text-align:center; padding:15px 10px; color:#999; font-size:12px; background:#f9f9f9; border-radius:4px;">등록된 평가일이<br>없습니다.</div>`;
    } else {
        dates.forEach(d => {
            const dateObj = new Date(d);
            const weekNames = ['일','월','화','수','목','금','토'];
            const shortDate = `${String(dateObj.getMonth()+1).padStart(2,'0')}.${String(dateObj.getDate()).padStart(2,'0')}(${weekNames[dateObj.getDay()]})`;

            html += `
                <div style="font-size: 12px; padding: 6px 4px; border-bottom: 1px dashed #ddd; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: bold; color: #2c3e50;">${shortDate}</span>
                    <button onclick="toggleEvaluationDate('${d}')" style="background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px; padding: 3px 6px;">삭제</button>
                </div>
            `;
        });
    }

    banner.innerHTML = html;
    banner.style.display = 'block'; // 전원 ON
}