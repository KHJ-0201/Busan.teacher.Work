const currentClass = sessionStorage.getItem('selectedClass');

// --- 파이어베이스 연결 부품 ---
const firebaseConfig = {
  apiKey: "AIzaSyDs15RTlqQSz4u1Gr6NLQ2Kx25Raey2TtA",
  authDomain: "khj-teacher-work.firebaseapp.com",
  databaseURL: "https://khj-teacher-work-default-rtdb.firebaseio.com",
  projectId: "khj-teacher-work",
  storageBucket: "khj-teacher-work.firebasestorage.app",
  messagingSenderId: "384706353235",
  appId: "1:384706353235:web:9ab057e382bad1010b0ea6"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

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
async function renderIntegratedTable() {
    const area = document.getElementById('resultTableArea');
    
    // [수정] 클라우드(Firebase)에서 문제 구성 정보를 가져옵니다.
    const configSnapshot = await database.ref(`CONFIG/${currentClass}/fullConfig`).once('value');
    const config = configSnapshot.val() || { ncs: [], nonNcs: [] };
    
    let subjects = [];
    [...config.ncs, ...config.nonNcs].forEach(main => {
        main.subSubjects.forEach(sub => {
            if (sub.date) {
                const subId = (sub.name + sub.date).replace(/\s+/g, '');
                subjects.push({ id: subId, name: sub.name, date: sub.date, mainTitle: main.title });
            }
        });
    });

    // [수정] 클라우드(Firebase)에서 모든 학생의 응시 결과를 가져옵니다.
    const resultsSnapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const allResultsRaw = resultsSnapshot.val() || {};
    
    let studentMap = {}; 
    
    Object.values(allResultsRaw).forEach(res => {
        if (!studentMap[res.name]) studentMap[res.name] = { name: res.name, scores: {} };
        const matchedSub = subjects.find(s => res.displayTitle === s.name);
        if (matchedSub) {
            studentMap[res.name].scores[matchedSub.id] = res.score;
        }
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
                ${subjects.map(sub => `<th class="head-green unit-col" onclick="showSubjectStudentList('${sub.id}', '${sub.name}')">${sub.name}</th>`).join('')}
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
async function showSubjectStudentList(subId, subName) {
    const snapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const allData = snapshot.val() || {};
    const results = Object.entries(allData)
        .map(([key, val]) => ({...val, firebaseKey: key}))
        .filter(res => res.displayTitle === subName);

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
                <button onclick="printBatchReports('${subId}', '${subName}')" style="background:#e74c3c; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:5px;">🖨️ 일괄 인쇄</button>
                <button onclick="deleteAllResults('${subId}', '${subName}')" style="background:#666; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;">⚠️ 이 과목 전체 삭제</button>
            </div>
        </div>
    `;
    
    let listHtml = `
        <div style="padding:15px;">
            <h2 style="text-align:center; margin-top:0;">📋 ${subName} 응시 명단</h2>
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
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;"><input type="checkbox" class="student-chk" value="${res.name}" checked></td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${idx + 1}</td>
                            <td onclick="showIndividualReport('${subId}', '${res.name}', '${subName}')" style="border:1px solid #ddd; padding:8px; cursor:pointer; color:#3498db; font-weight:bold; text-decoration:underline;">${res.name}</td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">${res.score}점</td>
                            <td style="border:1px solid #ddd; padding:8px; text-align:center;">
                                <button onclick="printSingleReport('${subId}', '${res.name}', '${subName}')" style="cursor:pointer; padding:3px 8px;">인쇄</button>
                                <button onclick="deleteSingleResult('${res.firebaseKey}')" style="cursor:pointer; padding:3px 8px; color:red; margin-left:5px;">삭제</button>
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
async function showIndividualReport(subId, userName, subName) {
    const snapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const allData = snapshot.val() || {};
    const data = Object.values(allData).find(r => r.name === userName && r.displayTitle === subName);
    
    const configSnapshot = await database.ref(`CONFIG/${currentClass}/fullConfig`).once('value');
    const config = configSnapshot.val();
    
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            const sId = (s.name + s.date).replace(/\s+/g, '');
            if (sId === subId) questions = s.questions; 
        });
    });

    if (!data) return;

    const headerHtml = `
        <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:15px; background:#f9f9f9; padding:10px; border-bottom:1px solid #ddd;">
            <button onclick="showSubjectStudentList('${subId}', '${subName}')" style="padding:8px 15px; cursor:pointer;">← 명단으로 돌아가기</button>
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
        if (img.complete) { loadedCount++; } 
        else { img.onload = img.onerror = () => { loadedCount++; if (loadedCount === images.length) setTimeout(() => window.print(), 300); }; }
    });
    if (loadedCount === images.length) setTimeout(() => window.print(), 300);
}

/* [기능] 개별 데이터 삭제 */
async function deleteSingleResult(firebaseKey) {
    if (!confirm(`학생의 기록을 삭제하시겠습니까?`)) return;
    await database.ref(`RESULTS/${currentClass}/${firebaseKey}`).remove();
    alert("삭제되었습니다.");
    closeModal();
    renderIntegratedTable();
}

/* [기능] 해당 과목 전체 삭제 */
async function deleteAllResults(subId, subName) {
    if (!confirm("이 과목의 모든 학생 데이터를 삭제하시겠습니까?")) return;
    const snapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const allData = snapshot.val() || {};
    const updates = {};
    Object.entries(allData).forEach(([key, val]) => {
        if (val.displayTitle === subName) updates[key] = null;
    });
    await database.ref(`RESULTS/${currentClass}`).update(updates);
    alert("전체 데이터가 삭제되었습니다.");
    closeModal();
    renderIntegratedTable();
}

/* [인쇄] 단독 인쇄 */
async function printSingleReport(subId, userName, subName) {
    const snapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const data = Object.values(snapshot.val() || {}).find(r => r.name === userName && r.displayTitle === subName);
    const configSnapshot = await database.ref(`CONFIG/${currentClass}/fullConfig`).once('value');
    const config = configSnapshot.val();
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            if ((s.name + s.date).replace(/\s+/g, '') === subId) questions = s.questions; 
        });
    });
    document.getElementById('printSelectorArea').style.display = "none";
    document.getElementById('printArea').innerHTML = generateBTypeHtml(data, questions);
    waitImagesAndPrint();
}

/* [인쇄] 일괄 인쇄 */
async function printBatchReports(subId, subName) {
    const selectedNames = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedNames.length === 0) { alert("인쇄할 학생을 선택하세요."); return; }
    const snapshot = await database.ref(`RESULTS/${currentClass}`).once('value');
    const allResults = Object.values(snapshot.val() || {}).filter(r => r.displayTitle === subName);
    const configSnapshot = await database.ref(`CONFIG/${currentClass}/fullConfig`).once('value');
    const config = configSnapshot.val();
    let questions = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(m => {
        m.subSubjects.forEach(s => { 
            if ((s.name + s.date).replace(/\s+/g, '') === subId) questions = s.questions; 
        });
    });
    let combinedHtml = "";
    selectedNames.forEach(name => {
        const data = allResults.find(r => r.name === name);
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
            <div style="text-align:center; font-size:18px; font-weight:bold; margin-bottom:8px; border-bottom:3px double #000; padding-bottom:5px;">${data.displayTitle || ''} 사전평가 결과표</div>
            
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; table-layout:fixed;">
                <colgroup><col style="width:15%;"><col style="width:45%;"><col style="width:13.33%;"><col style="width:26.67%;"></colgroup>
                <tr><td style="${labelStyle}">훈련과정</td><td style="border:1px solid #000; padding:6px; text-align:left; font-size:12px;">${data.groupName || ''}</td><td style="${labelStyle}">훈련기간</td><td style="${contentStyle}">${data.groupPeriod || ''}</td></tr>
                <tr>
                    <td style="${labelStyle}">훈련생명</td>
                    <td style="border:1px solid #000; padding:6px; font-weight:bold; text-align:left; font-size:12px;">
                        <div style="display:flex; align-items:center;">
                            <span style="display:inline-block; width:100px; text-align:left;">${data.name || ''}</span>
                        </div>
                    </td>
                    <td style="${labelStyle}">시행일자</td>
                    <td style="${contentStyle}">${data.examDate || data.date || ''}</td>
                </tr>
            </table>

            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-top:-1px; table-layout:fixed;">
                <colgroup><col style="width:60%;"><col style="width:13.33%;"><col style="width:13.33%;"><col style="width:13.34%;"></colgroup>
                <tr><td style="${labelStyle}">사전평가 목적</td><td style="${labelStyle}">취득점수</td><td style="${labelStyle}">사전수준</td><td style="${labelStyle}">담당교사</td></tr>
                <tr><td style="border:1px solid #000; padding:6px; height:45px; vertical-align:top; text-align:left; font-size:11px;">${data.purpose || ''}</td><td style="${redStyle}">${data.score}점</td><td style="${redStyle}">${data.score >= 60 ? '이수전략' : '보충학습'}</td><td style="${contentStyle}">${data.teacherName || ''}</td></tr>
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
                        const sAns = data.userAnswers ? data.userAnswers[idx] : "0";
                        const isCorrect = sAns == q.answer;
                        return `
                        <tr class="q-row-print">
                            <td style="border:1px solid #000; padding:4px; text-align:center; font-size:11px;">
                                ${idx+1}<br><span style="color:${isCorrect?'blue':'red'}; font-weight:bold;">(${isCorrect?'O':'X'})</span>
                            </td>
                            <td style="border:1px solid #000; padding:8px; text-align:left;">
                                <div style="font-weight:bold; font-size:12px; line-height:1.2; margin-bottom:5px;">${q.text}</div>
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