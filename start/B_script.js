/* [1. 초기 설정 및 반 이름 확인] */
const currentClass = sessionStorage.getItem('selectedClass');
if (!currentClass) { alert("반 선택 정보가 없습니다. 초기 화면으로 이동합니다."); location.href = 'select_class.html'; }

let examQuestions = []; // 실제 화면에 뿌려질 문제 배열

/* [2. 페이지 로드 시 실행] */
window.onload = function() {
    const banner = document.getElementById('displayTitle');
    const groupName = localStorage.getItem(`${currentClass}_groupName`) || currentClass;
    if (banner) banner.innerText = `${groupName} 자동차 CBT 시험`;
    loadQuestionsFromAdmin();
};

/* [3. 관리자(A) 데이터 연동 핵심 로직] */
function loadQuestionsFromAdmin() {
    // A페이지에서 saveAllData()로 저장한 키값과 정확히 일치해야 함
    const rawData = localStorage.getItem(`${currentClass}_fullConfig`);
    if (!rawData) { alert("저장된 문제가 없습니다. 관리자 페이지에서 '설정 저장하기'를 먼저 눌러주세요."); return; }

    try {
        const config = JSON.parse(rawData);
        examQuestions = [];

        // NCS와 비NCS 섹션을 모두 합쳐서 순회
        const allMainSubjects = [...(config.ncs || []), ...(config.nonNcs || [])];
        
        allMainSubjects.forEach(main => {
            if (!main.subSubjects) return;
            main.subSubjects.forEach(sub => {
                // [중요] 관리자 페이지에서 '활성화' 체크박스를 켠 소과목만 가져옴
                if (sub.isActive === true) { 
                    sub.questions.forEach(q => {
                        // 문제 텍스트가 비어있지 않은 것만 추가
                        if (q.text && q.text.trim() !== "") {
                            examQuestions.push({ ...q, mainTitle: main.title, subTitle: sub.name });
                        }
                    });
                }
            });
        });

        renderExamPage(); // 화면에 그리기
    } catch (e) {
        console.error("데이터 로드 오류:", e);
        alert("데이터를 읽어오는 중 오류가 발생했습니다.");
    }
}

/* [4. 문제 화면 출력] */
function renderExamPage() {
    const container = document.getElementById('questionContainer');
    if (!container) return;
    
    if (examQuestions.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px;">
            <p>📋 현재 활성화된(체크된) 문제가 없습니다.</p>
            <p style="font-size:14px; color:#666;">관리자 페이지에서 소과목의 <b>'활성화'</b> 체크박스를 켜고 <b>'설정 저장하기'</b>를 눌러주세요.</p>
        </div>`;
        return;
    }

    container.innerHTML = examQuestions.map((q, idx) => `
        <div class="q-card" style="margin-bottom:40px; border-bottom:1px solid #ddd; padding-bottom:30px;">
            <div class="q-title" style="font-size:18px; font-weight:bold; margin-bottom:15px;">
                ${idx + 1}. ${q.text} <span style="font-size:12px; color:#3498db; margin-left:10px;">[${q.mainTitle}]</span>
            </div>
            ${q.img ? `<div class="q-img" style="margin-bottom:15px;"><img src="${q.img}" style="max-width:100%; max-height:300px; border:1px solid #ccc; border-radius:5px;"></div>` : ''}
            <div class="q-options">
                ${q.options.map((opt, oIdx) => `
                    <label style="display:block; margin:10px 0; padding:12px; background:#f8f9fa; border:1px solid #eee; border-radius:8px; cursor:pointer;">
                        <input type="radio" name="q_${idx}" value="${oIdx + 1}"> ${oIdx + 1}) ${opt}
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

/* [5. 시험 제출] */
function submitExam() {
    const userName = document.getElementById('userName').value.trim();
    if (!userName) { alert("성명을 입력해야 제출할 수 있습니다."); return; }
    if (!confirm("시험을 종료하시겠습니까?")) return;

    let scoreCount = 0;
    examQuestions.forEach((q, idx) => {
        const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
        if (selected && selected.value == q.answer) scoreCount++;
    });

    const score = Math.round((scoreCount / examQuestions.length) * 100);
    const resultData = { name: userName, score: score, date: new Date().toLocaleString() };

    // 결과 저장
    const history = JSON.parse(localStorage.getItem(`${currentClass}_exam_results`)) || [];
    history.push(resultData);
    localStorage.setItem(`${currentClass}_exam_results`, JSON.stringify(history));

    alert(`${userName} 학생 제출 완료! 점수: ${score}점`);
    location.href = 'C_Result.html';
}