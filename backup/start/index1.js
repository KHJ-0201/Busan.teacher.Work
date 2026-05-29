
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

// 2. 인증 및 데이터 로드 (시동 후 연료 공급)
const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log("🔒 보안 인증 확인됨: " + firebaseConfig.projectId);
        initializePage(); 
    } else if (adminPw) {
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw)
            .then(() => {
                console.log("🔒 보안 인증 성공!");
                initializePage();
            })
            .catch(err => {
                console.error("❌ 인증 실패", err);
                // 인증 실패 시 메인으로 튕겨냄
                alert("인증 정보가 올바르지 않습니다. 메인 화면으로 이동합니다.");
                location.href = "../index.html"; 
            });
    } else {
        // 📍 [보안 강화] 인증 정보가 아예 없는 경우 즉시 퇴거 조치
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        alert("로그인이 필요한 서비스입니다.");
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
function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        window.scrollTo({ top: el.offsetTop - 100, behavior: 'smooth' });
    } else {
        alert("해당 분류의 데이터가 없습니다.");
    }
}
function handleSubjectTypeChange(selectElement, groupId) {
    const isNCS = selectElement.value === 'NCS교과';
    // data-group 속성을 가진 행들을 찾아서 능력단위 분류 박스를 토글함
    const rows = document.querySelectorAll(`tr[data-group="${groupId}"]`);
    rows.forEach(row => {
        const unitTypeSelect = row.querySelector('.c-unit-type');
        if(unitTypeSelect) {
            unitTypeSelect.style.display = isNCS ? 'block' : 'none';
        }
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

const urlParams = new URLSearchParams(window.location.search);
let currentClass = urlParams.get('class') || "테스트";
document.getElementById('currentClassDisplay').innerText = currentClass;

let tempJsonData = null; let tempFileName = "";

function initializePage() { loadData(); checkTimetableStatus(); }

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

// 📍 [신규 검문소] 업로드 전 기존 데이터 확인 로직
function confirmBeforeOpen(event) {
    const statusBox = document.getElementById('fileStatusBox');
    const savedName = document.getElementById('savedFileName').innerText.trim();
    const isAlreadySaved = (statusBox.style.display === "block") || (savedName !== "");

    if (isAlreadySaved) {
        // 이미 데이터가 있다면 암호를 먼저 물어봄
        const confirmCode = prompt("⚠️ 이미 등록된 시간표가 존재합니다.\n기존 데이터를 교체하시려면 [ 0000 ] 을 작성하세요.");

        if (confirmCode === "0000") {
            // 암호가 맞으면 파일 선택창이 열리도록 허용
            return true;
        } else {
            // 암호가 틀리면 클릭 이벤트 자체를 취소 (파일 창 안 열림)
            alert("❌ 인증 번호가 틀렸습니다. 작업을 취소합니다.");
            event.preventDefault();
            return false;
        }
    }
    // 데이터가 없는 순정 상태면 바로 통과
    return true;
}

function processTimetable(input) {
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
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
    // 1. 날짜를 타임스탬프(숫자)로 변환하여 물리적 시간 순서로 대조
    const dateA = new Date(a._date).getTime();
    const dateB = new Date(b._date).getTime();
    
    if (dateA !== dateB) return dateA - dateB; // 날짜가 다르면 시간 순서대로
    return a._period - b._period; // 날짜가 같으면 교시 순서대로
});

        const cleanJson = rawProcessed.map(box => {
            const o = box._box;
            return {
                "일수": getVal(o, ['일수']),
                "날짜": box._date,
                "요일": getVal(o, ['요일']),
                "교시": box._period,
                "시간": getVal(o, ['훈련시간', '교육시간']),
                "교과목": getVal(o, ['교과목명', '교과목']),
                "능력단위": getVal(o, ['능력단위명']),
                "세부교과": getVal(o, ['세부교과']),
                "교사": getVal(o, ['훈련교사', '훈련교·강사']),
                "장소": getVal(o, ['훈련장소', '훈련시설명'])
            };
        });

        autoCalculateSummary(cleanJson);
        const studyRows = cleanJson.filter(r => String(r.교과목 || "").trim() !== "" && String(r.능력단위 || "").trim() !== "");
        const renderData = studyRows.map(r => ({ subject: r.교과목, unit: r.능력단위, detail: r.세부교과 }));
        renderCourseTable(renderData);

        tempJsonData = cleanJson; tempFileName = file.name;
        document.getElementById('fileStatusBox').style.display = "block";
        document.getElementById('savedFileName').innerText = file.name;
        document.getElementById('downloadBtn').style.display = "none";
    };
    reader.readAsArrayBuffer(file);
}

function renderCourseTable(data) {
    const map = {};
    const ncsCodePattern = /[0-9]{2,}/; // 숫자가 2개 이상 연속되면 코드로 인식

    data.forEach(r => {
        let subName = r.subject || '미분류';
        let unitName = r.unit || '미분류';
        let k = subName + "|" + unitName;
        if(!map[k]) {
            // [추가] 코드가 있으면 NCS교과, 없으면 빈값(미선택)
            let autoType = ncsCodePattern.test(unitName) ? "NCS교과" : "";
            map[k] = { sub: subName, unit: unitName, unitType: "", det: {}, total: 0, type: autoType };
        }
        let detName = r.detail || '미지정';
        map[k].det[detName] = (map[k].det[detName] || 0) + 1;
        map[k].total++;
    });

    // 렌더링 시 type 정보를 포함하여 전달
    renderTable(Object.values(map).map(v => ({ 
    subject: v.sub, 
    unit: v.unit, 
    unitType: v.unitType || "", 
    details: Object.entries(v.det).map(([n, h]) => ({ name: n, hour: h })), 
    totalHours: v.total,
    type: v.type || "" // [필수 확인] map을 만들 때 넣은 autoType이 여기 v.type으로 들어갑니다.
})));
}

function autoCalculateSummary(data) {
    const dates = data.map(r => r.날짜).filter(d => d && d.includes('-')).sort();
    if(dates.length > 0) document.getElementById('trainingPeriod').value = dates[0] + " ~ " + dates[dates.length-1];
    const maxDay = Math.max(...data.map(r => parseInt(r.일수) || 0));
    if(maxDay > 0) document.getElementById('totalDays').value = maxDay + "일";
    const ts = {}; data.forEach(r => { if(r.교사) ts[r.교사] = (ts[r.교사] || 0) + 1; });
    let top = "-", mc = 0; for(let t in ts) if(ts[t] > mc) { top = t; mc = ts[t]; }
    document.getElementById('teacherName').value = top;
}

function checkTimetableStatus() {
    database.ref(`${currentClass}/timetableStorage`).once('value', snap => {
        const info = snap.val();
        if(info && info.data) {
            document.getElementById('fileStatusBox').style.display = "block";
            document.getElementById('savedFileName').innerText = info.fileName;
            document.getElementById('downloadBtn').style.display = "block";
            autoCalculateSummary(info.data);
        }
    });
}

async function confirmTimetableSave() {
    if(!tempJsonData) return;
    
    try {
        // 1. 시간표 원본 데이터 저장
        await database.ref(`${currentClass}/timetableStorage`).set({ fileName: tempFileName, data: tempJsonData });
        await database.ref(`${currentClass}/fullTimetable`).set(tempJsonData);
        
        // 💡 [2단계 핵심] 현재 화면의 '교과목 상세 현황'을 서버로 자동 전송 (통합 저장)
        const success = await saveAllData(); 
        
        if(success !== false) { // saveAllData가 비정상 종료되지 않았다면
            alert("✅ 시간표와 교과목 상세 현황이 서버에 통합 저장되었습니다!\n이제 '평가계획서'에서 나머지 작업을 진행하실 수 있습니다.");
            checkTimetableStatus();
        }
    } catch (error) {
        console.error("통합 저장 중 오류:", error);
        alert("❌ 저장 중 오류가 발생했습니다. 네트워크 상태를 확인해주세요.");
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
        if (a.subject !== b.subject) return (a.subject || "").localeCompare(b.subject || "");
        return (a.unit || "").localeCompare(b.unit || "");
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

    // 💡 [복구 완료] 합계 행(Summary-Row)을 다시 추가합니다. (관리 칸 없이 5열 구성)
    const sumTr = document.createElement('tr'); 
    sumTr.className = 'summary-row';
    sumTr.innerHTML = `
        <td style="text-align:center;">📊 교과목: ${subs.length}종</td>
        <td style="text-align:center;">능력단위: ${list.length}개</td>
        <td style="text-align:center;">- 전체 교육과정 현황 요약 -</td>
        <td style="text-align:center;">총 ${gH}h</td>
        <td style="text-align:center;">총 ${gH}h</td>
    `;
    tbody.appendChild(sumTr);

    subs.forEach(s => {
        const us = grp[s].units;
        us.forEach((u, i) => {
            const tr = document.createElement('tr'); 
            if(i === 0) tr.className = 'top-border-thick';

            const rowGroupId = s.replace(/\s+/g, '_');
            tr.setAttribute('data-group', rowGroupId);
            const currentType = grp[s].type || ""; 
            
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
                    <div style="font-weight:600; color:#333;">${u.unit}</div>
                    ${u.unitType ? `<div style="font-size:10px; color:#e67e22; margin-top:3px;">${u.unitType}</div>` : ''}
                    <div style="font-size: 11px; color: #27ae60; margin-top: 5px;">(${u.totalHours}h)</div>
                    <input type="hidden" class="c-unit-input" value="${u.unit}">
                </td>
                <td>
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

async function saveAllDataWithAlert() { await saveAllData(); alert("✅ 서버 저장 완료!"); }
async function saveAllData() {
    try {
        // 💡 [추가] 기존 데이터를 먼저 불러와서 평가계획서에서 작업한 내용(평가방법 등)을 확보합니다.
        const snap = await database.ref(`${currentClass}/masterData`).once('value');
        const existingMaster = snap.val() || {};
        const existingCourses = existingMaster.courses || [];

        const rows = document.querySelectorAll('#courseTableBody tr:not(.summary-row)');
        const list = [];
        const ncsCodePattern = /[0-9]{2,}/; 

        rows.forEach(r => {
            const u = r.querySelector('.c-unit-input'); 
            if(u) {
                // 1. 교과목 이름 찾기 (순정 로직 유지)
                let s = r.querySelector('.c-subject-input')?.value;
                if(!s) { 
                    let p = r.previousElementSibling; 
                    while(p) { 
                        if(p.querySelector('.c-subject-input')) { s = p.querySelector('.c-subject-input').value; break; } 
                        p = p.previousElementSibling; 
                    } 
                }

                // 2. 세부내용 및 시간 추출 (순정 로직 유지)
                const ds = []; 
                r.querySelectorAll('.sub-detail-input').forEach((inpt, idx) => { 
                    ds.push({ name: inpt.value, hour: r.querySelectorAll('.sub-hour-input')[idx].value }); 
                });

                // 3. 분류 값 결정 로직 (기능 강화)
                const typeSelect = r.querySelector('.c-subject-type');
                const unitTypeSelect = r.querySelector('.c-unit-type');
                
                // 💡 기존 데이터(oldData)를 찾습니다.
                const oldData = existingCourses.find(c => c.unit === u.value) || {};

                // 화면 선택값 우선 -> 없으면 기존 데이터 값 -> 그것도 없으면 NCS 자동판별
                let type = typeSelect ? typeSelect.value : (oldData.type || "");
                if (!type && ncsCodePattern.test(u.value)) {
                    type = "NCS교과";
                }

                let unitType = unitTypeSelect ? unitTypeSelect.value : (oldData.unitType || "");

                // 4. 리스트에 담기 (평가계획서 데이터 보존 배선 연결)
                list.push({ 
                    subject: s, 
                    type: type, 
                    unit: u.value, 
                    unitType: unitType, 
                    details: ds,
                    // 📍 [핵심] index에는 없지만 평가계획서에는 있는 '평가방법' 등을 그대로 보존합니다.
                    evalMethod: oldData.evalMethod || "작업장평가" 
                });
            }
        });

        // 5. 서버 최종 전송
        return database.ref(`${currentClass}/masterData`).set({ 
            name: document.getElementById('trainingName').value || existingMaster.name || "", 
            period: document.getElementById('trainingPeriod').value || existingMaster.period || "", 
            days: document.getElementById('totalDays').value || existingMaster.days || "", 
            teacher: document.getElementById('teacherName').value || existingMaster.teacher || "", 
            courses: list 
        });
    } catch (error) {
        console.error("저장 중 오류 발생:", error);
    }
}

function loadData() {
    database.ref(`${currentClass}/masterData`).once('value', snap => {
        const d = snap.val() || {};
        document.getElementById('trainingName').value = d.name || "";
        document.getElementById('trainingPeriod').value = d.period || "";
        document.getElementById('totalDays').value = d.days || "";
        document.getElementById('teacherName').value = d.teacher || "";
        if(d.courses) renderCourseTableFromDB(d.courses);
    });
}
function renderCourseTableFromDB(courses) {
    const list = courses.map(c => {
        let total = 0; c.details.forEach(d => total += Number(d.hour));
        // DB에 있는 type과 unitType을 그대로 유지해서 화면에 보냅니다.
        return { 
            subject: c.subject, 
            type: c.type || "", 
            unit: c.unit, 
            unitType: c.unitType || "", 
            details: c.details, 
            totalHours: total 
        };
    });
    renderTable(list);
}
async function deleteTimetable() { if(confirm("전체 삭제하시겠습니까?")) { await database.ref(`${currentClass}/timetableStorage`).remove(); await database.ref(`${currentClass}/fullTimetable`).remove(); await database.ref(`${currentClass}/masterData`).remove(); location.reload(); } }

function downloadSavedTimetable() {
    database.ref(`${currentClass}/timetableStorage`).once('value', snap => {
        const info = snap.val();
        if(info && info.data) {
            const headerOrder = ["일수", "날짜", "요일", "교시", "시간", "교과목", "능력단위", "세부교과", "교사", "장소"];
            const sortedData = info.data.map(row => {
                const newRow = {};
                headerOrder.forEach(key => { newRow[key] = row[key] || ""; });
                return newRow;
            });
            const ws = XLSX.utils.json_to_sheet(sortedData, { header: headerOrder });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "시간표");
            XLSX.writeFile(wb, info.fileName || `시간표_${currentClass}.xlsx`);
        } else { alert("서버에 저장된 시간표가 없습니다."); }
    });
}

// [기능 추가] 교과목 상세 현황 전용 엑셀 다운로드 기능
async function downloadCourseTableExcel() {
    // 📍 스타일을 지원하는 라이브러리가 필요하므로, 없으면 즉석에서 불러옵니다.
    if (typeof XLSX.utils.aoa_to_sheet !== 'function') {
        alert("라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    database.ref(`${currentClass}/masterData`).once('value', async snap => {
        const d = snap.val();
        if(!d || !d.courses) return alert("다운로드할 데이터가 없습니다.");

        const courses = d.courses;
        const hasEmptyType = courses.some(c => !c.type || c.type.trim() === "");
        if (hasEmptyType) { alert("교과목의 교과를 선택 후 저장해 주세요."); return; }

        const hasEmptyUnitType = courses.some(c => !c.unitType || c.unitType.trim() === "");
        if (hasEmptyUnitType) { if (!confirm("필수/선택 교과 없이 다운 하시겠습니까?")) return; }

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

function clearAndDefault() { if(confirm("초기화하시겠습니까?")) renderTable([]); }
function addCourseRow() {
    const tbody = document.getElementById('courseTableBody');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="subject-cell"><input class="editable-input c-subject-input" placeholder="교과목"></td><td><input class="editable-input c-unit-input" placeholder="능력단위"></td><td><div class="sub-item-container"><div class="sub-item-row"><input class="editable-input sub-detail-input text-left" placeholder="세부내용"></div></div></td><td><div class="sub-item-container"><div class="sub-item-row"><input class="editable-input sub-hour-input" placeholder="0"></div></div></td><td class="subject-total-cell"><input class="editable-input c-subtotal-input" value="0"></td><td><button class="btn btn-red" onclick="this.parentElement.parentElement.remove()">삭제</button></td>`;
    tbody.appendChild(tr);
}

async function saveOverviewOnly() {
    try {
        const tName = document.getElementById('trainingName').value;
        const tPeriod = document.getElementById('trainingPeriod').value;
        const tDays = document.getElementById('totalDays').value;
        const tTeacher = document.getElementById('teacherName').value;

        if(!tName) return alert("훈련명을 입력해주세요.");

        // 기존 masterData를 가져와서 개요 부분만 덮어씁니다.
        const snap = await database.ref(`${currentClass}/masterData`).once('value');
        const existingData = snap.val() || {};

        await database.ref(`${currentClass}/masterData`).update({
            name: tName,
            period: tPeriod,
            days: tDays,
            teacher: tTeacher
        });

        alert("✅ 훈련 과정 개요가 저장되었습니다.");
    } catch (error) {
        console.error("개요 저장 오류:", error);
        alert("❌ 저장 중 오류가 발생했습니다.");
    }
}
initializePage();
