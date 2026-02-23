const currentClass = sessionStorage.getItem('selectedClass');

window.onload = function() {
    if (!currentClass) {
        alert("반 선택 정보가 없습니다.");
        location.href = 'select_class.html';
        return;
    }
    document.getElementById('currentClassBanner').innerText = `접속 반: ${currentClass}`;
    renderIntegratedTable();
};

/* [1단계] 메인 통합 일람표 */
function renderIntegratedTable() {
    const area = document.getElementById('resultTableArea');
    const config = JSON.parse(localStorage.getItem(`${currentClass}_fullConfig`) || '{"ncs":[], "nonNcs":[]}');
    
    let subjects = [];
    [...config.ncs, ...config.nonNcs].forEach(main => {
        main.subSubjects.forEach(sub => {
            if (sub.date) {
                // [배선 완성] B페이지 저장 방식과 동일하게 모든 공백을 제거하여 ID를 생성합니다.
                const subId = (sub.name + sub.date).replace(/\s+/g, '');
                subjects.push({ id: subId, name: sub.name, date: sub.date, mainTitle: main.title });
            }
        });
    });

    let studentMap = {}; 
    subjects.forEach(sub => {
        // [배선 완성] B페이지에서 저장한 키 형식(`${currentClass}_results_${sub.id}`)으로 데이터를 호출합니다.
        const results = JSON.parse(localStorage.getItem(`${currentClass}_results_${sub.id}`) || '[]');
        results.forEach(res => {
            if (!studentMap[res.userName]) studentMap[res.userName] = { name: res.userName, scores: {} };
            studentMap[res.userName].scores[sub.id] = res.score;
        });
    });

    const students = Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    let html = `<table class="summary-table">
        <thead>
            <tr>
                <th rowspan="3" class="sticky-1">번호</th>
                <th rowspan="3" class="sticky-2">성명</th>
                <th rowspan="3" class="sticky-3">평균</th>
                ${subjects.map(sub => `<th class="head-yellow unit-col">${sub.mainTitle}</th>`).join('')}
            </tr>
            <tr class="sub-header">
                ${subjects.map(sub => `<th class="head-green unit-col" onclick="showSubjectStudentList('${sub.id}')">${sub.name}</th>`).join('')}
            </tr>
            <tr class="sub-header">${subjects.map(sub => `<th class="unit-col">${sub.date}</th>`).join('')}</tr>
        </thead>
        <tbody>`;

    if(students.length === 0) {
        html += `<tr><td colspan="${3 + subjects.length}" style="padding:20px;">아직 응시한 학생 데이터가 없습니다.</td></tr>`;
    } else {
        students.forEach((st, idx) => {
            let total = 0, count = 0;
            let scoreCells = subjects.map(sub => {
                const s = st.scores[sub.id];
                if(s !== undefined) { total += s; count++; return `<td>${s}</td>`; }
                return `<td>-</td>`;
            }).join('');
            const avg = count > 0 ? (total / count).toFixed(1) : '-';
            html += `<tr>
                <td class="sticky-1">${idx + 1}</td>
                <td class="sticky-2" onclick="alert('${st.name} 학생의 개별 성적은 상단 과목명을 클릭하여 확인할 수 있습니다.')">${st.name}</td>
                <td class="sticky-3">${avg}</td>
                ${scoreCells}
            </tr>`;
        });
    }
    area.innerHTML = html + `</tbody></table>`;
}

/* [2단계] 능력단위 클릭 시 - 학생 명단 */
function showSubjectStudentList(subId) {
    const results = JSON.parse(localStorage.getItem(`${currentClass}_results_${subId}`) || '[]');
    const modal = document.getElementById('individualModal');
    const printArea = document.getElementById('printArea');
    const selectorArea = document.getElementById('printSelectorArea');

    if (results.length === 0) { alert("이 능력단위의 응시 기록이 없습니다."); return; }

    selectorArea.style.display = "block";
    selectorArea.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#eee; padding:10px; border-radius:5px;">
            <label style="font-weight:bold; cursor:pointer;">
                <input type="checkbox" id="selectAllStudents" onclick="toggleAllStudents(this)" checked> 일괄 인쇄 대상 선택
            </label>
            <div>
                <button onclick="printBatchReports('${subId}')" style="background:#e74c3c; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:5px;">🖨️ 일괄 인쇄</button>
                <button onclick="deleteAllResults('${subId}')" style="background:#666; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">⚠️ 이 과목 전체 삭제</button>
            </div>
        </div>
    `;
    
    let listHtml = `
        <div style="padding:15px;">
            <h2 style="text-align:center; margin-top:0;">📋 ${results[0].displayTitle} 응시 명단</h2>
            <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                <thead>
                    <tr style="background:#f2f2f2;">
                        <th style="border:1px solid #ddd; padding:8px; width:40px;">선택</th>
                        <th style="border:1px solid #ddd; padding:8px; width:50px;">번호</th>
                        <th style="border:1px solid #ddd; padding:8px;">성명 (클릭 시 개별 결과표)</th>
                        <th style="border:1px solid #ddd; padding:8px; width:70px;">점수</th>
                        <th style="border:1px solid #ddd; padding:8px; width:160px;">관리</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map((res, idx) => `
                        <tr>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;"><input type="checkbox" class="student-chk" value="${res.userName}" checked></td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${idx + 1}</td>
                            <td onclick="showIndividualReport('${subId}', '${res.userName}')" style="border:1px solid #ddd; padding:8px; cursor:pointer; color:#3498db; font-weight:bold; text-decoration:underline;">${res.userName}</td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${res.score}점</td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">
                                <button onclick="printSingleReport('${subId}', '${res.userName}')" style="cursor:pointer; padding:3px 8px;">인쇄</button>
                                <button onclick="deleteSingleResult('${subId}', '${res.userName}')" style="cursor:pointer; padding:3px 8px; color:red; margin-left:5px;">삭제</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    printArea.innerHTML = listHtml;
    modal.style.display = "block";
}

/* [3단계] 개별 결과표 화면 */
function showIndividualReport(subId, userName) {
    const results = JSON.parse(localStorage.getItem(`${currentClass}_results_${subId}`) || '[]');
    const data = results.find(r => r.userName === userName);
    const config = JSON.parse(localStorage.getItem(`${currentClass}_fullConfig`));
    
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            // [배선 완성] 과목을 찾을 때도 공백이 제거된 subId와 매칭되도록 합니다.
            const sId = (s.name + s.date).replace(/\s+/g, '');
            if (sId === subId) questions = s.questions; 
        });
    });

    if (!data) return;

    const headerHtml = `
        <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:15px; background:#f9f9f9; padding:10px; border-bottom:1px solid #ddd;">
            <button onclick="showSubjectStudentList('${subId}')" style="padding:8px 15px; cursor:pointer;">← 명단으로 돌아가기</button>
            <button onclick="waitImagesAndPrint()" style="background:#27ae60; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ 이 결과표 인쇄</button>
        </div>
    `;

    document.getElementById('printSelectorArea').style.display = "none";
    document.getElementById('printArea').innerHTML = headerHtml + generateBTypeHtml(data, questions);
}

/* [그림 로드 대기 및 인쇄 실행] */
function waitImagesAndPrint() {
    const images = document.querySelectorAll('#printArea img');
    if (images.length === 0) { window.print(); return; }

    let loadedCount = 0;
    images.forEach(img => {
        if (img.complete) {
            loadedCount++;
        } else {
            img.onload = img.onerror = () => {
                loadedCount++;
                if (loadedCount === images.length) {
                    setTimeout(() => window.print(), 300); 
                }
            };
        }
    });
    if (loadedCount === images.length) {
        setTimeout(() => window.print(), 300);
    }
}

/* [기능] 개별 데이터 삭제 */
function deleteSingleResult(subId, userName) {
    if (!confirm(`${userName} 학생의 기록을 삭제하시겠습니까?`)) return;
    let results = JSON.parse(localStorage.getItem(`${currentClass}_results_${subId}`) || '[]');
    results = results.filter(r => r.userName !== userName);
    localStorage.setItem(`${currentClass}_results_${subId}`, JSON.stringify(results));
    alert("삭제되었습니다.");
    showSubjectStudentList(subId);
    renderIntegratedTable();
}

/* [기능] 해당 과목 전체 삭제 */
function deleteAllResults(subId) {
    if (!confirm("이 과목의 모든 학생 데이터를 삭제하시겠습니까?")) return;
    localStorage.removeItem(`${currentClass}_results_${subId}`);
    alert("전체 데이터가 삭제되었습니다.");
    closeModal();
    renderIntegratedTable();
}

/* [인쇄] 단독 인쇄 */
function printSingleReport(subId, userName) {
    const results = JSON.parse(localStorage.getItem(`${currentClass}_results_${subId}`) || '[]');
    const data = results.find(r => r.userName === userName);
    const config = JSON.parse(localStorage.getItem(`${currentClass}_fullConfig`));
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            const sId = (s.name + s.date).replace(/\s+/g, '');
            if (sId === subId) questions = s.questions; 
        });
    });

    document.getElementById('printSelectorArea').style.display = "none";
    document.getElementById('printArea').innerHTML = generateBTypeHtml(data, questions);
    waitImagesAndPrint();
}

/* [인쇄] 일괄 인쇄 */
function printBatchReports(subId) {
    const selectedNames = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedNames.length === 0) { alert("인쇄할 학생을 선택하세요."); return; }

    const results = JSON.parse(localStorage.getItem(`${currentClass}_results_${subId}`) || '[]');
    const config = JSON.parse(localStorage.getItem(`${currentClass}_fullConfig`));
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            const sId = (s.name + s.date).replace(/\s+/g, '');
            if (sId === subId) questions = s.questions; 
        });
    });

    let combinedHtml = "";
    selectedNames.forEach(name => {
        const data = results.find(r => r.userName === name);
        if (data) combinedHtml += `<div style="page-break-after:always;">${generateBTypeHtml(data, questions)}</div>`;
    });

    document.getElementById('printSelectorArea').style.display = "none";
    document.getElementById('printArea').innerHTML = combinedHtml;
    waitImagesAndPrint();
}

/* [공용] B화면 결과표 양식 생성 함수 (원본 그대로 유지) */
function generateBTypeHtml(data, questions) {
    const labelStyle = "background-color:#e3f2fd !important; font-weight:bold; border:1px solid #000; padding:6px; text-align:center; font-size:12px;";
    const contentStyle = "background-color:#ffffff !important; border:1px solid #000; padding:6px; text-align:center; font-size:12px;";
    const redStyle = "background-color:#ffffff !important; border:1px solid #000; padding:6px; text-align:center; font-weight:bold; font-size:16px; color:#e74c3c;";

    return `
        <div class="result-page-container" style="width:190mm; margin:0 auto; font-family:'Malgun Gothic'; background:#fff; overflow:visible;">
            <div style="text-align:center; font-size:18px; font-weight:bold; margin-bottom:8px; border-bottom:3px double #000; padding-bottom:5px;">${data.displayTitle}</div>
            
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; table-layout:fixed;">
                <colgroup><col style="width:15%;"><col style="width:45%;"><col style="width:13.33%;"><col style="width:26.67%;"></colgroup>
                <tr><td style="${labelStyle}">훈련과정</td><td style="border:1px solid #000; padding:6px; text-align:left; font-size:12px;">${data.groupName}</td><td style="${labelStyle}">훈련기간</td><td style="${contentStyle}">${data.groupPeriod}</td></tr>
                <tr>
                    <td style="${labelStyle}">훈련생명</td>
                    <td style="border:1px solid #000; padding:6px; font-weight:bold; text-align:left; font-size:12px;">
                        <div style="display:flex; align-items:center;">
                            <span style="display:inline-block; width:100px; text-align:left;">${data.userName}</span>
                            <div class="c-sign-box" style="position:relative; width:80px; height:35px; margin-left:10px; display:flex; align-items:center; justify-content:center;">
                                <span style="color:rgba(0,0,0,0.15); font-size:14px; font-weight:bold; border:1px solid rgba(0,0,0,0.1); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">인</span>
                                ${data.signData ? `<img src="${data.signData}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; z-index:2;">` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="${labelStyle}">시행일자</td>
                    <td style="${contentStyle}">${data.examDate}</td>
                </tr>
            </table>

            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-top:-1px; table-layout:fixed;">
                <colgroup><col style="width:60%;"><col style="width:13.33%;"><col style="width:13.33%;"><col style="width:13.34%;"></colgroup>
                <tr><td style="${labelStyle}">사전평가 목적</td><td style="${labelStyle}">취득점수</td><td style="${labelStyle}">사전수준</td><td style="${labelStyle}">담당교사</td></tr>
                <tr><td style="border:1px solid #000; padding:6px; height:45px; vertical-align:top; text-align:left; font-size:11px;">${data.purpose}</td><td style="${redStyle}">${data.score}점</td><td style="${redStyle}">${data.level}</td><td style="${contentStyle}">${data.teacherName}</td></tr>
            </table>

            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-top:10px; table-layout:fixed;">
                <thead>
                    <tr style="background:#e3f2fd !important;">
                        <th style="border:1px solid #000; padding:6px; width:45px; font-size:11px;">번호</th>
                        <th style="border:1px solid #000; padding:6px; font-size:11px;">문제</th>
                        <th style="border:1px solid #000; padding:6px; width:40px; font-size:11px;">답안</th>
                        <th style="border:1px solid #000; padding:6px; width:40px; font-size:11px;">채점</th>
                    </tr>
                </thead>
                <tbody>
                    ${questions.map((q, idx) => {
                        const sAns = data.details && data.details[idx] ? data.details[idx].studentVal : "0";
                        const isCorrect = sAns == q.answer;
                        return `
                        <tr class="q-row-print">
                            <td style="border:1px solid #000; padding:4px; text-align:center; font-size:11px;">
                                ${idx+1}<br><span style="color:${isCorrect?'blue':'red'}; font-weight:bold;">(${isCorrect?'O':'X'})</span>
                            </td>
                            <td style="border:1px solid #000; padding:8px; text-align:left;">
                                <div style="display:flex; gap:10px; align-items:flex-start;">
                                    ${q.img ? `<div style="width:100px; flex-shrink:0;"><img src="${q.img}" class="print-img-box" style="width:100%;"></div>` : ''}
                                    <div style="flex:1;">
                                        <div style="font-weight:bold; font-size:12px; line-height:1.2; margin-bottom:5px;">${q.text}</div>
                                        <div style="font-size:11px;">
                                            ${q.options.map((opt, oIdx) => `<div style="margin-bottom:2px;">${sAns == (oIdx+1) ? '✔' : '&nbsp;&nbsp;'} ${oIdx+1}. ${opt}</div>`).join('')}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td style="border:1px solid #000; text-align:center; font-size:12px;">${sAns}</td>
                            <td style="border:1px solid #000; text-align:center; font-weight:bold; color:red; font-size:12px;">${q.answer}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function toggleAllStudents(source) { document.querySelectorAll('.student-chk').forEach(cb => cb.checked = source.checked); }
function closeModal() { document.getElementById('individualModal').style.display = "none"; }