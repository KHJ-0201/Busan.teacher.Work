
// 수정 후 >> [계승 및 멀티 DB 대응]
// 2. 전역 변수들을 미리 선언합니다.
let masterTeacher = "-";

// 3. 파이어베이스 및 보안 설정을 초기화합니다.
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
initClassContext();
let currentClass = window.currentClass;

// 4. 뒤로가기 링크 및 학급 표시를 세팅합니다.
document.getElementById('currentClassDisplay').innerText = formatClassHudText();
document.getElementById('backLink').href = classNavHref('index1.html');

// 5. 보안 인증 확인 후 데이터를 불러옵니다.
const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // ✅ [인증 성공] 관리자 전용 버튼 표시 및 시동
        console.log("🔒 보안 인증 확인됨: " + user.email);
        
        // 관리자 전용 버튼이 있다면 표시하는 배선 (필요시 추가)
        const reportBtn = document.getElementById('btnReportMode');
        if(reportBtn) reportBtn.style.display = 'inline-block';

        await initializePage(); 
    } else if (adminPw) {
        // 🔑 [자동 로그인 시도]
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw)
            .then(() => {
                console.log("🔒 자동 로그인 성공");
                // 성공 시 initializePage()는 위쪽(user 존재 시)에서 자동으로 실행됨
            })
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                await appAlert("인증 정보가 만료되었습니다. 다시 로그인해주세요.");
                location.href = '../index.html';
            });
    } else {
        // ⚠️ [인증 없음] 즉시 퇴거
        await appAlert("보안 인증이 필요한 페이지입니다.");
        location.href = '../index.html';
    }
});

// [연비/멀티DB 대응] 데이터 로드 로직
async function initializePage() {
    try {
        const snap = await classDbRef('masterData').once('value');
        const d = snap.val() || {};
        masterTeacher = d.teacher || "-";
        if (d.courses) {
            renderCourseTableFromDB(d.courses);
        } else {
            document.getElementById('courseTableBody').innerHTML = 
                '<tr><td colspan="6" style="padding:50px; color:#666;">등록된 교과목 데이터가 없습니다.</td></tr>';
        }
    } catch (e) {
        console.error("데이터 로드 실패:", e);
    }
}

function updateSelectColor(select) {
    if (!select) return;
    const val = select.value;
    let bgColor = "#ffffff";
    let textColor = "#333333";
    let borderColor = "#ccc";

    // 📍 [교과목 분류 및 단위 유형 색상]
    if (val === "NCS교과") bgColor = "#e3f2fd";
    else if (val === "비NCS교과") bgColor = "#f3e5f5";
    else if (val === "소양교과") bgColor = "#f5f5f5";
    else if (val === "재량교과") bgColor = "#fff0f6"; // 재량교과 분홍빛 추가
    else if (val === "필수능력단위") bgColor = "#fff1f0"; // bgColor로 수정 완료
    else if (val === "선택능력단위") bgColor = "#fff7e6"; // bgColor로 수정 완료

    // 📍 [평가방법별 전용 색상 주입]
    else if (val === "작업장평가") {
        bgColor = "#e6fffa";   // 연한 민트색
        textColor = "#087f5b";  // 진한 초록색
        borderColor = "#087f5b";
    }
    else if (val === "평가자체크리스트") {
        bgColor = "#fff9db";   // 연한 노란색
        textColor = "#e67e22";  // 주황색
        borderColor = "#e67e22";
    }

    select.style.backgroundColor = bgColor;
    select.style.color = textColor;
    select.style.borderColor = borderColor;
}

function handleSubjectTypeChange(selectElement, groupId) {
    const isNCS = selectElement.value === 'NCS교과';
    const rows = document.querySelectorAll(`tr[data-group="${groupId}"]`);
    rows.forEach(row => {
        // 📍 엔진 체크: 버튼 뭉치와 평가방법 드롭박스를 row 안에서 정확히 찾아냅니다.
        const unitTypeContainer = row.querySelector('.unit-type-container');
        const evalMethodSelect = row.querySelector('.c-eval-method');
        
        // 📍 배선 연결: NCS교과일 때만 보이고, 아닐 때는 숨깁니다.
        if(unitTypeContainer) unitTypeContainer.style.display = isNCS ? 'flex' : 'none';
        if(evalMethodSelect) evalMethodSelect.style.display = isNCS ? 'block' : 'none';
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
            evalMethod: c.evalMethod || "작업장평가", // 평가방법 데이터 추가
            details: c.details, 
            totalHours: total 
        };
    });
    renderTable(list);
}

// 📍 [함수 수정] 화면에 평가방법 드롭박스 렌더링
function renderTable(list) {
    const tbody = document.getElementById('courseTableBody'); 
    tbody.innerHTML = '';
    const typeOrder = { "": 0, "소양교과": 1, "NCS교과": 2, "비NCS교과": 3 };

    // 1. 데이터를 타입별로 정렬
    const sortedList = [...list].sort((a, b) => {
        const orderA = typeOrder[a.type || ""] ?? 99;
        const orderB = typeOrder[b.type || ""] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        if (a.subject !== b.subject) return (a.subject || "").localeCompare(b.subject || "");
        return (a.unit || "").localeCompare(b.unit || "");
    });

    // 2. 그룹화 작업 (여기서 각 과목의 최종 type을 확정합니다)
    let gH = 0; const grp = {};
    sortedList.forEach(item => {
        if(!grp[item.subject]) grp[item.subject] = { units: [], total: 0, type: item.type || "" };
        grp[item.subject].units.push(item);
        item.details.forEach(d => { grp[item.subject].total += Number(d.hour); gH += Number(d.hour); });
    });

    const subs = [...new Set(sortedList.map(item => item.subject))];
    const sumTr = document.createElement('tr'); sumTr.className = 'summary-row';
    sumTr.innerHTML = `<td>교과목: ${subs.length}종</td><td>능력단위: ${list.length}개</td><td>- 과정 요약 현황 -</td><td>전체: ${gH}h</td><td>전체: ${gH}h</td><td>요약</td>`;
    tbody.appendChild(sumTr);

    // 3. 실제 행 생성
    subs.forEach(s => {
        const us = grp[s].units;
        const currentType = grp[s].type; // 📍 이 과목의 현재 분류 (NCS교과 등)

        us.forEach((u, i) => {
            const tr = document.createElement('tr'); 
            if(i === 0) tr.className = 'top-border-thick';
            const rowGroupId = s.replace(/\s+/g, '_');
            tr.setAttribute('data-group', rowGroupId);
            
            // 📍 핵심 수리: display 속성을 결정할 때 currentType 변수를 직접 사용하여 오류를 차단함
            const displayStyle = (currentType === 'NCS교과') ? 'block' : 'none';

            tr.innerHTML = `
                ${i === 0 ? `
                <td rowspan="${us.length}" class="subject-cell">
                    <input class="editable-input c-subject-input" value="${s}" style="font-weight:bold;">
                    <select class="editable-input c-subject-type dynamic-subject-type" data-groupid="${rowGroupId}" style="font-size:10px; color:#333; margin-top:5px; border:1px solid #ccc; border-radius:3px; padding:2px; width:90%;">
                        <option value="">-- 선택 --</option>
                        <option value="소양교과" ${currentType === '소양교과' ? 'selected' : ''}>소양교과</option>
                        <option value="NCS교과" ${currentType === 'NCS교과' ? 'selected' : ''}>NCS교과</option>
                        <option value="비NCS교과" ${currentType === '비NCS교과' ? 'selected' : ''}>비NCS교과</option>
                    </select>
                    <div style="font-size: 11px; color: #3498db; margin-top: 5px;">(${grp[s].total}시간)</div>
                </td>` : ''}
                
                <td>
                    <textarea class="editable-input c-unit-input" rows="2" style="resize:none; width:100%; border:none; background:transparent; text-align:center; font-family:inherit; font-size:12px; vertical-align:middle; display:block; padding:5px; box-sizing:border-box;">${u.unit}</textarea>
                    <div class="unit-type-container" style="display:${displayStyle};">
                        <button type="button" class="type-toggle-btn dynamic-unit-type ${u.unitType === '필수능력단위' ? 'active-req' : ''}" data-typeval="필수능력단위">필수</button>
                        <button type="button" class="type-toggle-btn dynamic-unit-type ${u.unitType === '선택능력단위' ? 'active-opt' : ''}" data-typeval="선택능력단위">선택</button>
                        <input type="hidden" class="c-unit-type-val" value="${u.unitType || ''}">
                    </div>
                    <select class="editable-input c-eval-method dynamic-eval-method" 
        style="display:${displayStyle}; font-size:10px; margin-top:3px; border:1px solid #ccc; border-radius:3px; width:90%; margin-left:auto; margin-right:auto; transition: all 0.2s;">
    <option value="작업장평가" ${u.evalMethod === '작업장평가' ? 'selected' : ''}>작업장평가</option>
    <option value="평가자체크리스트" ${u.evalMethod === '평가자체크리스트' ? 'selected' : ''}>평가자체크리스트</option>
</select>
                    <div style="font-size: 11px; color: #27ae60; margin-top: 5px;">(${u.totalHours}시간)</div>
                </td>

                <td style="height: 1px;">
                    <div class="sub-item-container" style="height: 100%; display: flex; flex-direction: column;">
                        ${u.details.map(d => `
                            <div class="sub-item-row" style="flex: 1; display: flex;">
                                <textarea class="editable-input sub-detail-input" style="resize:none; width:100%; height: 100%; border:none; background:transparent; text-align:left; font-family:inherit; font-size:12px; padding:8px 10px; box-sizing:border-box; display:block;">${d.name}</textarea>
                            </div>
                        `).join('')}
                    </div>
                </td>

                <td style="height: 1px;">
                    <div class="sub-item-container" style="height: 100%; display: flex; flex-direction: column;">
                        ${u.details.map(d => `
                            <div class="sub-item-row" style="flex: 1; display: flex;">
                                <input class="editable-input sub-hour-input" value="${d.hour}" style="width:100%; height: 100%; border:none; background:transparent; text-align:center; font-family:inherit; font-size:12px; box-sizing:border-box; display:block;">
                            </div>
                        `).join('')}
                    </div>
                </td>

                ${i === 0 ? `<td rowspan="${us.length}" class="subject-total-cell"><input class="editable-input c-subtotal-input" value="${grp[s].total}"></td>` : ''}
                <td><button class="btn btn-red dynamic-delete-row">삭제</button></td>
            `;
            tbody.appendChild(tr);
        });
    });

setTimeout(() => {
        document.querySelectorAll('.c-subject-type, .c-eval-method').forEach(sel => {
            updateSelectColor(sel);
        });
    }, 50);
}

async function downloadCourseTableExcel() {
    classDbRef('masterData').once('value', async snap => {
        const d = snap.val();
        if(!d || !d.courses) return await appAlert("데이터가 없습니다.");
        
        const courses = d.courses;
        
        // 📍 1단계: 교과목 분류(소양/NCS/비NCS) 확인
        const isTypeMissing = courses.some(c => !c.type || c.type === "");
        if (isTypeMissing) {
            return await appAlert("교과목 분류를 해주세요.");
        }

        // 📍 2단계: 필수/선택 정보 확인 (NCS교과인 경우만 해당)
        const isUnitTypeMissing = courses.some(c => c.type === "NCS교과" && (!c.unitType || c.unitType === ""));
        if (isUnitTypeMissing) {
            if (!await appConfirm("필수/선택 정보 없이 다운하시겠습니까?")) {
                return; // 취소 시 중단
            }
        }
        const wb = XLSX.utils.book_new();
        const exportData = [];
        const merges = [];
        const commonStyle = { font: { sz: 10, name: '맑은 고딕' }, alignment: { vertical: "center", horizontal: "center", shrinkToFit: true, wrapText: true } };

        const sections = { "소양교과": [], "NCS교과": [], "비NCS교과": [] };
        d.courses.forEach(c => { if (sections[c.type]) sections[c.type].push(c); });

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
                        exportData.push([uIdx === 0 ? subName : "", `${u.unit} (${unitTotal}시간)`, "강의법", "-", masterTeacher || "", "", "", "", ""]);
                    });
                    if (group.units.length > 1) merges.push({ s: { r: subStartRow, c: 0 }, e: { r: exportData.length - 1, c: 0 } });
                });
            } else if (typeName === "NCS교과") {
                exportData.push(["교과목", "교과구분", "코드", "능력단위", "능력단위요소", "시간", "교수", "상세교수", "담당"]);
                exportData.push(["(시간)", "(필/선/자)", "", "(시간)", "요소명", "시간", "학습방법", "학습방법", "교사"]);
                Object.keys(subjectGroups).forEach(subName => {
                    const group = subjectGroups[subName];
                    const subStartRow = exportData.length;
                    group.units.forEach((u, uIdx) => {
                        const unitStartRow = exportData.length;
                        let unitTotal = 0; u.details.forEach(det => unitTotal += Number(det.hour));
                        let unitCode = "", unitNameOnly = u.unit;
                        const codeMatch = u.unit.match(/\[(.*?)\]/);
                        if (codeMatch) { unitCode = codeMatch[0]; unitNameOnly = u.unit.replace(codeMatch[0], "").trim(); }

                        u.details.forEach((det, dIdx) => {
                            const teachMethod = (dIdx === 0) ? "혼합형" : "";
                            const teachDetail = (dIdx === 0) ? "강의법+\n학생실습" : "";
                            exportData.push([
                                (uIdx === 0 && dIdx === 0) ? `${subName} (${group.totalH}시간)` : "",
                                dIdx === 0 ? (u.unitType || "미기입") : "",
                                dIdx === 0 ? unitCode : "",
                                dIdx === 0 ? `${unitNameOnly} (${unitTotal}시간)` : "",
                                det.name, det.hour, teachMethod, teachDetail, masterTeacher || ""
                            ]);
                        });
                        if (u.details.length > 1) {
                            for(let col=1; col<=3; col++) merges.push({ s: { r: unitStartRow, c: col }, e: { r: exportData.length - 1, c: col } });
                            merges.push({ s: { r: unitStartRow, c: 6 }, e: { r: exportData.length - 1, c: 6 } });
                            merges.push({ s: { r: unitStartRow, c: 7 }, e: { r: exportData.length - 1, c: 7 } });
                        }
                    });
                    const totalRows = group.units.reduce((acc, curr) => acc + curr.details.length, 0);
                    if (totalRows > 1) merges.push({ s: { r: subStartRow, c: 0 }, e: { r: subStartRow + totalRows - 1, c: 0 } });
                });
            } else if (typeName === "비NCS교과") {
                exportData.push(["교과목", "교과구분", "단원", "교수", "상세교수", "담당", "", "", ""]);
                Object.keys(subjectGroups).forEach(subName => {
                    const group = subjectGroups[subName];
                    const subStartRow = exportData.length;
                    group.units.forEach((u, uIdx) => {
                        u.details.forEach((det, dIdx) => {
                            exportData.push([
                                (uIdx === 0 && dIdx === 0) ? `${subName} (${group.totalH}시간)` : "", 
                                dIdx === 0 ? (u.unitType || "미기입") : "", det.name, "강의법", "학생실습", masterTeacher || "", "", "", ""
                            ]);
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
        for (let i in ws) { if (i[0] !== '!') ws[i].s = commonStyle; }
        ws['!cols'] = [{wch: 35}, {wch: 15}, {wch: 20}, {wch: 35}, {wch: 45}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}];
        XLSX.utils.book_append_sheet(wb, ws, "교과목편성내용");
        XLSX.writeFile(wb, `교과목편성내용_${currentClass}.xlsx`);
    });
}


function setUnitType(btn, typeValue) {
    const container = btn.parentElement;
    const buttons = container.querySelectorAll('.type-toggle-btn');
    const hiddenInput = container.querySelector('.c-unit-type-val');
    
    // 📍 신규 로직: 필수를 선택하면 같은 과목 내 다른 능력단위들을 자동으로 '선택'으로 세팅할 준비를 합니다.
    if (hiddenInput.value === typeValue) {
        hiddenInput.value = ""; 
        buttons.forEach(b => b.classList.remove('active-req', 'active-opt'));
    } else {
        hiddenInput.value = typeValue; 
        buttons.forEach(b => b.classList.remove('active-req', 'active-opt'));
        if (typeValue === '필수능력단위') {
            btn.classList.add('active-req');
            // 💡 여기서 즉시 나머지를 바꾸지 않고, 저장 시점에 일괄 처리하는 것이 데이터 무결성에 안전합니다.
        } else {
            btn.classList.add('active-opt');
        }
    }
}
// 📍 [신규 추가] 평가방법 및 내용 엑셀 다운로드 엔진
async function downloadEvalMethodExcel() {
    if (!await appConfirm("평가일정은 각 능력단위의 마지막 일입니다. 한번 더 일정 확인 하세요. 다운로드 하시겠습니까?")) {
        return;
    }
    const masterSnap = await classDbRef('masterData').once('value');
    const timetableSnap = await classDbRef('fullTimetable').once('value');
    const d = masterSnap.val();
    const fullTimetable = timetableSnap.val();

    if(!d || !d.courses || !fullTimetable) return await appAlert("데이터가 부족합니다.");

    // 능력단위별 마지막 수업일(평가시기) 추출
    const unitEndMap = {};
    fullTimetable.forEach(r => {
        if(r.능력단위 && r.날짜) {
            if(!unitEndMap[r.능력단위] || r.날짜 > unitEndMap[r.능력단위]) unitEndMap[r.능력단위] = r.날짜;
        }
    });

    const wb = XLSX.utils.book_new();
    const exportData = [];
    const merges = [];
    const commonStyle = { font: { sz: 10, name: '맑은 고딕' }, alignment: { vertical: "center", horizontal: "center", wrapText: true, shrinkToFit: true } };

    const sections = { "소양교과": [], "NCS교과": [], "비NCS교과": [] };
    d.courses.forEach(c => { if (sections[c.type]) sections[c.type].push(c); });

    // 📍 업데이트된 통합 헤더 (훈련시간 추가: 10개 열)
    const unifiedHeader = ["교과목", "교과구분", "코드", "능력단위", "교수학습방법", "상세교수학습방법", "훈련시간", "평가방법", "평가시기", "담당교사"];

    Object.keys(sections).forEach(typeName => {
        const sectionCourses = sections[typeName];
        if (sectionCourses.length === 0) return;

        // 섹션 타이틀
        let sRow = exportData.length;
        exportData.push([typeName, "", "", "", "", "", "", "", "", ""]);
        merges.push({ s: { r: sRow, c: 0 }, e: { r: sRow, c: 9 } }); // 9번 열까지 병합

        exportData.push(unifiedHeader);

        sectionCourses.forEach(c => {
            const evalDate = unitEndMap[c.unit] || "";
            const unitCode = (c.unit.match(/\[(.*?)\]/) || ["", ""])[0];
            const unitNameOnly = c.unit.replace(/\[(.*?)\]/, "").trim();
            
            // 📍 훈련시간 계산 (다른 엑셀 기능의 로직을 그대로 이식)
            let unitTotalHour = 0;
            if (c.details) {
                c.details.forEach(det => { unitTotalHour += Number(det.hour || 0); });
            }

            if (typeName === "소양교과") {
                exportData.push([
                    c.subject, "소양교과", "", c.unit, 
                    "강의법", "-", `${unitTotalHour}h`, "기타(선다형)", evalDate, masterTeacher
                ]);
            } 
            else if (typeName === "NCS교과") {
                exportData.push([
                    c.subject, c.unitType || "미기입", unitCode, unitNameOnly,
                    "혼합형", "강의법+\n학생실습", `${unitTotalHour}h`, c.evalMethod || "작업장평가", evalDate, masterTeacher
                ]);
            }
            else if (typeName === "비NCS교과") {
                exportData.push([
                    c.subject, c.unitType || "비NCS", "", c.unit, 
                    "강의법", "이론 및 사례학습", `${unitTotalHour}h`, "기타(선다형)", evalDate, masterTeacher
                ]);
            }
        });
        exportData.push([]); 
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!merges'] = merges;
    for (let i in ws) { if (i[0] !== '!') ws[i].s = commonStyle; }
    
    // 📍 열 너비 재배치 (10개 열에 맞춰 최적화)
    ws['!cols'] = [
        {wch: 25}, {wch: 12}, {wch: 18}, {wch: 30}, {wch: 12}, 
        {wch: 20}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 12}
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "평가방법및내용");
    XLSX.writeFile(wb, `평가방법및내용_${currentClass}.xlsx`);
}

async function downloadPreEvaluationPlan() {
    // 📍 안내 문구 추가
    await appAlert("최초 수업일 2주 전 기준입니다.");
    const masterSnap = await classDbRef('masterData').once('value');
    const timetableSnap = await classDbRef('fullTimetable').once('value');
    
    const d = masterSnap.val();
    const fullTimetable = timetableSnap.val();

    if(!d || !d.courses || !fullTimetable) return await appAlert("데이터가 부족합니다. 시간표와 교과 데이터를 확인해주세요.");

    const allDates = fullTimetable.map(r => r.날짜).filter(date => date).sort();
    const courseStartDate = new Date(allDates[0]);

    const unitStartMap = {};
    fullTimetable.forEach(r => {
        if(r.능력단위 && r.날짜) {
            if(!unitStartMap[r.능력단위] || r.날짜 < unitStartMap[r.능력단위]) {
                unitStartMap[r.능력단위] = r.날짜;
            }
        }
    });

    const wb = XLSX.utils.book_new();
    const exportData = [
        ["교과목별 사전평가 계획", "", "", "", "", ""],
        ["교과구분", "교과목", "능력단위", "평가방법", "1차 평가일", "2차 평가일"]
    ];
    const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

    const sectionsMapping = { "소양교과": "소양교과", "NCS교과": "NCS 전공교과", "비NCS교과": "비NCS 교과(이론)" };
    
    // 📍 1단계: 데이터를 교과구분 -> 교과목 순으로 그룹화 (병합을 위해)
    const groupedData = {};
    d.courses.forEach(c => {
        const typeTitle = sectionsMapping[c.type] || c.type;
        if (!groupedData[typeTitle]) groupedData[typeTitle] = {};
        if (!groupedData[typeTitle][c.subject]) groupedData[typeTitle][c.subject] = [];
        groupedData[typeTitle][c.subject].push(c);
    });

    // 📍 2단계: 그룹화된 데이터를 순회하며 exportData 구성 및 병합 좌표 계산
    Object.keys(groupedData).forEach(typeTitle => {
        const typeStartRow = exportData.length;
        const subjects = groupedData[typeTitle];
        
        Object.keys(subjects).forEach(subName => {
            const subStartRow = exportData.length;
            const units = subjects[subName];
            
            units.forEach(u => {
                const unitNameOnly = u.unit.replace(/\[(.*?)\]/, "").trim();
                let evalDateStr = "";
                const unitStartDateStr = unitStartMap[u.unit];
                if (unitStartDateStr) {
                    let evalDate = new Date(unitStartDateStr);
                    evalDate.setDate(evalDate.getDate() - 14);
                    if (evalDate < courseStartDate) evalDate = courseStartDate;
                    evalDateStr = evalDate.toISOString().split('T')[0];
                }

                exportData.push([typeTitle, subName, unitNameOnly, "기타(선다형)", evalDateStr, "해당없음"]);
            });

            // 교과목 병합 (B열)
            if (units.length > 1) {
                merges.push({ s: { r: subStartRow, c: 1 }, e: { r: exportData.length - 1, c: 1 } });
            }
        });

        // 교과구분 병합 (A열)
        const typeRowsCount = exportData.length - typeStartRow;
        if (typeRowsCount > 1) {
            merges.push({ s: { r: typeStartRow, c: 0 }, e: { r: exportData.length - 1, c: 0 } });
        }
    });

    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!merges'] = merges;

    // 📍 3단계: 스타일 및 열 너비 정밀 세팅
    const commonStyle = {
        font: { sz: 10, name: '맑은 고딕' },
        alignment: { vertical: "center", horizontal: "center", shrinkToFit: true, wrapText: true }
    };

    for (let i in ws) {
        if (i[0] !== '!') ws[i].s = commonStyle;
    }

    // 제목줄(1행)은 조금 더 크게
    if(ws['A1']) ws['A1'].s = { font: { sz: 14, bold: true }, alignment: commonStyle.alignment };

    ws['!cols'] = [{wch: 20}, {wch: 30}, {wch: 35}, {wch: 15}, {wch: 15}, {wch: 15}];

    XLSX.utils.book_append_sheet(wb, ws, "사전평가계획");
    XLSX.writeFile(wb, `사전평가계획_${currentClass}.xlsx`);
}

async function saveAllDataWithAlert() {
    try {
        const rows = document.querySelectorAll('#courseTableBody tr:not(.summary-row)');
        let hasNCS = false;
        let missingUnitType = false;
        
        // 💡 [핵심 배선 1] 위쪽 행의 교과구분을 기억할 변수
        let lastSubjectType = ""; 

        // 1단계 검사: 병합된 셀을 고려하여 모든 행의 타입을 정확히 판별합니다.
        rows.forEach(r => {
            const typeSelect = r.querySelector('.c-subject-type');
            // 드롭박스가 존재하는 첫 번째 줄이면 기억 장치 갱신
            if (typeSelect) lastSubjectType = typeSelect.value;

            const unitTypeVal = r.querySelector('.c-unit-type-val');
            
            if (lastSubjectType === 'NCS교과') {
                hasNCS = true;
                if (!unitTypeVal || unitTypeVal.value === "") missingUnitType = true;
            }
        });

        // 2단계 실행: 안내창 확인 후 일괄 적용
        if (hasNCS && missingUnitType) {
            if (await appConfirm("필수능력단위 외 나머지는 '선택능력단위'로 일괄 지정하여 저장하시겠습니까?")) {
                lastSubjectType = ""; // 변수 초기화 후 다시 순회
                rows.forEach(r => {
                    const typeSelect = r.querySelector('.c-subject-type');
                    if (typeSelect) lastSubjectType = typeSelect.value;

                    const unitTypeVal = r.querySelector('.c-unit-type-val');
                    const optBtn = r.querySelector('.type-toggle-btn:nth-child(2)');

                    // 기억해둔 타입이 NCS교과인데 필수/선택이 비어있다면 선택으로 강제 주입
                    if (lastSubjectType === 'NCS교과' && unitTypeVal && unitTypeVal.value === "") {
                        unitTypeVal.value = "선택능력단위";
                        if(optBtn) optBtn.classList.add('active-opt');
                    }
                });
            } else {
                return; // 취소 시 중단
            }
        }

        await saveAllData(); 
        await appAlert("✅ 모든 변경사항이 서버에 안전하게 저장되었습니다.");
        initializePage(); // 최신 엔진으로 화면 갱신 
    } catch (error) {
        console.error("저장 중 오류 발생:", error);
        await appAlert("❌ 저장 중 오류가 발생했습니다.");
    }
}

// 📍 [정밀 수리] 실제 데이터를 수집하여 파이어베이스로 쏘는 메인 펌프
async function saveAllData() {
    // 💡 [핵심 배선 1] 덮어쓰기 전, 기존 DB에 있는 안전한 원본 데이터를 먼저 퍼옵니다.
    let existingCourses = [];
    try {
        const snap = await classDbRef('masterData/courses').once('value');
        existingCourses = snap.val() || [];
    } catch(e) { console.warn("기존 데이터 로드 실패", e); }

    const rows = document.querySelectorAll('#courseTableBody tr:not(.summary-row)');
    const list = [];
    const ncsCodePattern = /[0-9]{2,}/; 

    // 💡 [핵심 배선 2] 과목명과 교과구분을 기억하는 메모리 장치 가동
    let lastSubjectName = "";
    let lastSubjectType = "";

    rows.forEach(r => {
        const u = r.querySelector('.c-unit-input'); 
        if(u) {
            // 1. 교과목 이름 수집 (병합 셀 기억)
            const sInput = r.querySelector('.c-subject-input');
            if(sInput) lastSubjectName = sInput.value;
            let s = lastSubjectName;

            // 2. 교과구분 수집 (병합 셀 기억)
            const typeSelect = r.querySelector('.c-subject-type');
            if(typeSelect) lastSubjectType = typeSelect.value;
            let type = lastSubjectType;

            // 수동 선택 안했어도 패턴이 NCS면 자동 보정
            if (!type && ncsCodePattern.test(u.value)) type = "NCS교과";

            // 3. 세부내용 및 시간 추출
            const ds = []; 
            r.querySelectorAll('.sub-detail-input').forEach((inpt, idx) => { 
                const hourInpt = r.querySelectorAll('.sub-hour-input')[idx];
                ds.push({ name: inpt.value, hour: hourInpt ? hourInpt.value : "0" }); 
            });

            // 4. 필수/선택 및 평가방법 수집
            const unitTypeVal = r.querySelector('.c-unit-type-val');
            let unitType = unitTypeVal ? unitTypeVal.value : "";

            const evalMethodSelect = r.querySelector('.c-eval-method');
            let evalMethod = evalMethodSelect ? evalMethodSelect.value : "작업장평가";

            // 💡 [핵심 배선 3] 기존 데이터에서 RD코드와 평가일정을 찾아 안전하게 옮겨 담습니다.
            const oldData = existingCourses.find(c => c.unit === u.value) || {};
            let rdCode = oldData.rdCode || "";
            let evalDates = oldData.evalDates || [];

            // 5. 리스트에 담기
            list.push({ 
                subject: s, 
                type: type, 
                unit: u.value, 
                unitType: unitType, 
                evalMethod: evalMethod,
                details: ds,
                rdCode: rdCode,       // 📍 순정 데이터 보존
                evalDates: evalDates  // 📍 순정 데이터 보존
            });
        }
    });

    // 서버 전송 (교사님 시스템의 courses 경로에 저장)
    return classDbRef('masterData/courses').set(list);
}


initializePage();

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 위임 기술 적용)

document.addEventListener('DOMContentLoaded', () => {
    // 1. 고정 다운로드 및 저장 버튼 연결
    document.getElementById('btn_download_pre_eval').addEventListener('click', downloadPreEvaluationPlan);
    document.getElementById('btn_download_course_table').addEventListener('click', downloadCourseTableExcel);
    document.getElementById('btn_download_eval_method').addEventListener('click', downloadEvalMethodExcel);
    document.getElementById('btn_save_all_data').addEventListener('click', saveAllDataWithAlert);

    // 2. 📍 동적 생성 부품 제어 (이벤트 위임 기술)
    const courseTableBody = document.getElementById('courseTableBody');

    // 2-1. 클릭(Click) 감지 센서: 필수/선택 토글 버튼 및 행 삭제 버튼
    courseTableBody.addEventListener('click', function(e) {
        const typeBtn = e.target.closest('.dynamic-unit-type');
        const delBtn = e.target.closest('.dynamic-delete-row');

        if (typeBtn) {
            setUnitType(typeBtn, typeBtn.getAttribute('data-typeval'));
        } else if (delBtn) {
            // 버튼의 부모(td)의 부모(tr)를 찾아 삭제
            delBtn.parentElement.parentElement.remove();
        }
    });

    // 2-2. 변경(Change) 감지 센서: 셀렉트 박스(교과구분, 평가방법) 값 변경
    courseTableBody.addEventListener('change', function(e) {
        const subTypeSel = e.target.closest('.dynamic-subject-type');
        const evalMethodSel = e.target.closest('.dynamic-eval-method');

        if (subTypeSel) {
            handleSubjectTypeChange(subTypeSel, subTypeSel.getAttribute('data-groupid'));
            updateSelectColor(subTypeSel);
        } else if (evalMethodSel) {
            updateSelectColor(evalMethodSel);
        }
    });
});