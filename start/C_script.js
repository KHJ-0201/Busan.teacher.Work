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
    
    // 1. 클라우드에서 문제 구성 정보 로드 (경로 수정)
    const configSnapshot = await database.ref(`${currentClass}/fullConfig`).once('value');
    const config = configSnapshot.val() || { ncs: [], nonNcs: [] };
    
    let subjects = [];
    [...(config.ncs || []), ...(config.nonNcs || [])].forEach(main => {
        if(main.subSubjects) {
            main.subSubjects.forEach(sub => {
                if (sub.date) {
                    const subId = (sub.name + sub.date).replace(/\s+/g, '');
                    subjects.push({ id: subId, name: sub.name, date: sub.date, mainTitle: main.title });
                }
            });
        }
    });

    // 2. 클라우드에서 학생 응시 결과 로드 (경로 수정)
    const resultsSnapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
    const allResultsRaw = resultsSnapshot.val() || {};
    
    let studentMap = {}; 

    // [정밀 정비 완료] 중복을 제거하고 공백에 강한 매칭 로직 하나로 통합합니다.
    Object.values(allResultsRaw).forEach(res => {
        // 1. 학생 이름이 처음 나오면 장부에 이름을 먼저 등록합니다.
        if (!studentMap[res.name]) {
            studentMap[res.name] = { name: res.name, scores: {} };
        }
        
        // 2. B페이지에서 저장한 과목명(displayTitle)과 C페이지가 만든 목록(subjects)을 대조합니다.
        // 이때 .replace(/\s+/g, '')를 써서 띄어쓰기 오차를 완전히 무시합니다.
        const matchedSub = subjects.find(s => 
            s.name.replace(/\s+/g, '') === (res.displayTitle || "").replace(/\s+/g, '')
        );
        
        // 3. 일치하는 과목을 찾았다면, 그 학생의 점수 칸에 해당 점수를 꽂아넣습니다.
        if (matchedSub) {
            studentMap[res.name].scores[matchedSub.id] = res.score;
        }
    });

    const students = Object.values(studentMap).sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    let html = `<table class="summary-table">
        <thead>
            <tr>
                <th rowspan="4" class="sticky-1">번호</th>
                <th rowspan="4" class="sticky-2">성명</th>
                <th rowspan="4" class="sticky-3">평균</th>
                ${subjects.map(sub => `<th class="head-yellow unit-col">${sub.mainTitle}</th>`).join('')}
            </tr>
            <tr class="sub-header">
                ${subjects.map(sub => `<th class="head-green unit-col" onclick="showSubjectStudentList('${sub.id}', '${sub.name}')">${sub.name}</th>`).join('')}
            </tr>
            <tr class="sub-header">${subjects.map(sub => `<th class="unit-col">${sub.date}</th>`).join('')}</tr>
            <tr class="sub-header">${subjects.map(sub => `<th class="unit-col"><button onclick="showSubjectExplain('${sub.id}', '${sub.name}')" style="cursor:pointer; padding:2px 5px; font-size:10px; background:#34495e; color:white; border:none; border-radius:3px;">🔍 해설보기</button></th>`).join('')}</tr>
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
    const snapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
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
    // 1. 학생의 응시 결과 로드
    const snapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
    const allData = snapshot.val() || {};
    const data = Object.values(allData).find(r => 
        r.name === userName && 
        (r.displayTitle || "").replace(/\s+/g, '') === subName.replace(/\s+/g, '')
    );
    
    // 2. 관리자가 설정한 문제 구성 정보 로드 (변수 선언 확인)
    const configSnapshot = await database.ref(`${currentClass}/fullConfig`).once('value');
    const configData = configSnapshot.val(); // 'config' 대신 'configData'로 명확히 정의
    
    let questions = [];
    if(configData) {
        [...(configData.ncs || []), ...(configData.nonNcs || [])].forEach(m => {
            if(m.subSubjects) {
                m.subSubjects.forEach(s => { 
                    const currentId = (s.name + (s.date || "")).replace(/\s+/g, '');
                    if (currentId === subId) questions = s.questions; 
                });
            }
        });
    }

    if (!data) { alert("해당 학생의 상세 데이터를 찾을 수 없습니다."); return; }

    const headerHtml = `
        <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:15px; background:#f9f9f9; padding:10px; border-bottom:1px solid #ddd;">
            <button onclick="showSubjectStudentList('${subId}', '${subName}')" style="padding:8px 15px; cursor:pointer;">← 명단으로 돌아가기</button>
            <button onclick="waitImagesAndPrint()" style="background:#27ae60; color:white; border:none; padding:8px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">🖨️ 이 결과표 인쇄</button>
        </div>
    `;

    document.getElementById('printSelectorArea').style.display = "none";
    document.getElementById('printArea').innerHTML = headerHtml + generateBTypeHtml(data, questions);
}

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

async function deleteSingleResult(firebaseKey) {
    if (!confirm(`학생의 기록을 삭제하시겠습니까?`)) return;
    await database.ref(`${currentClass}_RESULTS/${firebaseKey}`).remove();
    alert("삭제되었습니다.");
    closeModal();
    renderIntegratedTable();
}

async function deleteAllResults(subId, subName) {
    if (!confirm("이 과목의 모든 학생 데이터를 삭제하시겠습니까?")) return;
    const snapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
    const allData = snapshot.val() || {};
    const updates = {};
    Object.entries(allData).forEach(([key, val]) => {
        if (val.displayTitle === subName) updates[key] = null;
    });
    await database.ref(`${currentClass}_RESULTS`).update(updates);
    alert("전체 데이터가 삭제되었습니다.");
    closeModal();
    renderIntegratedTable();
}

async function printSingleReport(subId, userName, subName) {
    const snapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
    const data = Object.values(snapshot.val() || {}).find(r => r.name === userName && r.displayTitle === subName);
    const configSnapshot = await database.ref(`${currentClass}/fullConfig`).once('value');
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

async function printBatchReports(subId, subName) {
    const selectedNames = Array.from(document.querySelectorAll('.student-chk:checked')).map(cb => cb.value);
    if (selectedNames.length === 0) { alert("인쇄할 학생을 선택하세요."); return; }
    const snapshot = await database.ref(`${currentClass}_RESULTS`).once('value');
    const allResults = Object.values(snapshot.val() || {}).filter(r => r.displayTitle === subName);
    const configSnapshot = await database.ref(`${currentClass}/fullConfig`).once('value');
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

function generateBTypeHtml(data, questions) {
    const labelStyle = "background-color:#e3f2fd !important; font-weight:bold; border:1px solid #000; padding:6px; text-align:center; font-size:12px;";
    const contentStyle = "background-color:#ffffff !important; border:1px solid #000; padding:6px; text-align:center; font-size:12px;";
    const redStyle = "background-color:#ffffff !important; border:1px solid #000; padding:6px; text-align:center; font-weight:bold; font-size:16px; color:#e74c3c;";

    return `
        <div class="result-page-container" style="width:190mm; margin:0 auto; font-family:'Malgun Gothic'; background:#fff; overflow:visible;">
            <div style="text-align:center; font-size:24px; font-weight:bold; margin-bottom:8px; border-bottom:3px double #000; padding-bottom:5px;">${data.displayTitle || ''} 사전평가 결과표</div>
            
            <table style="width:100%; border-collapse:collapse; border:2px solid #000; table-layout:fixed;">
                <colgroup><col style="width:15%;"><col style="width:45%;"><col style="width:13.33%;"><col style="width:26.67%;"></colgroup>
                <tr><td style="${labelStyle}">훈련과정</td><td style="border:1px solid #000; padding:6px; text-align:left; font-size:12px;">${data.groupName || ''}</td><td style="${labelStyle}">훈련기간</td><td style="${contentStyle}">${data.groupPeriod || ''}</td></tr>
                <tr>
                    <td style="${labelStyle}">훈련생명</td>
                    <td style="border:1px solid #000; padding:6px; font-weight:bold; text-align:left; font-size:12px;">
                        <div style="display:flex; align-items:center;">
                            <span style="display:inline-block; width:100px; text-align:left;">${data.name || ''}</span>
                            <div style="width:60px; height:30px; position:relative; margin-left:10px;">
                                ${data.signData ? `<img src="${data.signData}" style="width:100%; height:100%; object-fit:contain;">` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="${labelStyle}">시행일자</td>
                    <td style="${contentStyle}">${data.examDate || data.date || ''}</td>
                </tr>
            </table>

            <table style="width:100%; border-collapse:collapse; border:2px solid #000; margin-top:-1px; table-layout:fixed;">
                <colgroup><col style="width:60%;"><col style="width:13.33%;"><col style="width:13.33%;"><col style="width:13.34%;"></colgroup>
                <tr><td style="${labelStyle}">사전평가 목적</td><td style="${labelStyle}">취득점수</td><td style="${labelStyle}">사전수준</td><td style="${labelStyle}">담당교사</td></tr>
                <tr><td style="border:1px solid #000; padding:6px; height:45px; vertical-align:top; text-align:left; font-size:11px;">${data.purpose || ''}</td><td style="${redStyle}">${data.score}점</td><td style="${redStyle}">${data.level || ''}</td><td style="${contentStyle}">${data.teacherName || ''}</td></tr>
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
    <td style="border:1px solid #000; padding:4px; text-align:center; font-size:11px; position:relative; vertical-align:middle; overflow:visible;">
    <div style="position:relative; z-index:1; color:#333; font-weight:bold; font-size:13px;">${idx+1}</div>

    ${isCorrect ? 
        `<svg style="position:absolute; top:50%; left:50%; transform:translate(-40%, -40%) rotate(-5deg); 
                     width:60px; height:60px; z-index:2; pointer-events:none;" viewBox="-50 -50 300 300">
            <path 
                d="M 100,140 C -80,100 1,0 90,0 C 180,4 120,100 80,144"
                fill="none"
                stroke="rgba(255, 30, 30, 0.75)"
                stroke-width="15"
                stroke-linecap="round"
                stroke-linejoin="round" />
         </svg>` :
        // 틀렸을 때: 선생님이 만족하셨던 기존의 과감한 빗금 유지
        `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) rotate(12deg); 
                     font-size:55px; color:rgba(255, 30, 30, 0.75); 
                     font-family:'Brush Script MT', 'Cursive', 'serif'; 
                     font-weight:100; z-index:2; pointer-events:none; line-height:1;
                     display:flex; align-items:center; justify-content:center;">/</div>`
    }
</td>
    </div>
</td>
        <td style="border:1px solid #000; padding:8px; text-align:left; vertical-align:top;">
            <div style="font-weight:bold; font-size:12px; line-height:1.2; margin-bottom:8px;">${q.text}</div>
            
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:15px;">
                
                <div style="flex: 1; font-size:11px; color:#333; line-height:1.4;">
                    ${q.options.map((opt, oIdx) => `<div style="margin-bottom:3px;">${oIdx+1}) ${opt}</div>`).join('')}
                </div>

                ${q.img ? `
                <div style="flex: 0 0 120px; text-align:right;">
                    <img src="${q.img}" style="width:120px; height:auto; border:1px solid #ddd; border-radius:4px; display:block; margin-left:auto;">
                </div>` : ''}
                
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

// [신규 기능] 능력단위별 전체 문제 및 해설 보기
async function showSubjectExplain(subId, subName) {
    const configSnapshot = await database.ref(`${currentClass}/fullConfig`).once('value');
    const configData = configSnapshot.val();
    
    let questions = [];
    if(configData) {
        [...(configData.ncs || []), ...(configData.nonNcs || [])].forEach(m => {
            if(m.subSubjects) {
                m.subSubjects.forEach(s => { 
                    const currentId = (s.name + (s.date || "")).replace(/\s+/g, '');
                    if (currentId === subId) questions = s.questions; 
                });
            }
        });
    }

    if (questions.length === 0) { alert("해당 과목의 문제 데이터를 찾을 수 없습니다."); return; }

    const modal = document.getElementById('individualModal');
    const printArea = document.getElementById('printArea');
    document.getElementById('printSelectorArea').style.display = "none";

    let explainHtml = `
        <div style="padding:20px; font-family:'Malgun Gothic';">
            <h2 style="text-align:center; border-bottom:2px solid #34495e; padding-bottom:10px;">📝 ${subName} 전체 해설지</h2>
            <div style="margin-top:20px;">
                ${questions.map((q, idx) => `
                    <div style="margin-bottom:30px; border:1px solid #ddd; padding:15px; border-radius:8px; background:#fff;">
                        <div style="font-weight:bold; font-size:16px; margin-bottom:10px;">Q${idx+1}. ${q.text}</div>
                        ${q.img ? `<div style="margin-bottom:10px;"><img src="${q.img}" style="max-width:200px; border:1px solid #eee;"></div>` : ''}
                        <div style="margin-left:10px; margin-bottom:10px; color:#555;">
                            ${q.options.map((opt, oIdx) => `<div style="margin-bottom:3px;">${oIdx+1}) ${opt}</div>`).join('')}
                        </div>
                        <div style="background:#f8f9fa; padding:10px; border-left:4px solid #27ae60;">
                            <div style="font-weight:bold; color:#27ae60;">[정답] : ${q.answer}번</div>
                            <div style="margin-top:5px; font-size:14px; color:#333;"><b>[해설]</b> : ${q.explain || '등록된 해설이 없습니다.'}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    printArea.innerHTML = explainHtml;
    modal.style.display = "block";
}