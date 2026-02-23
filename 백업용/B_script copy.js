/* [1. 초기 설정 및 반 이름 확인] */
const currentClass = sessionStorage.getItem('selectedClass');
if (!currentClass) { alert("반 선택 정보가 없습니다. 초기 화면으로 이동합니다."); location.href = 'select_class.html'; }

// --- 파이어베이스 연결 부품 추가 ---
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
// --------------------------------

let examQuestions = []; // 실제 화면에 뿌려질 문제 배열

/* [2. 페이지 로드 시 실행] */
window.onload = function() {
    const banner = document.getElementById('displayTitle');
    const groupName = localStorage.getItem(`${currentClass}_groupName`) || currentClass;
    if (banner) banner.innerText = `${groupName} 자동차 CBT 시험`;
    loadQuestionsFromAdmin();
};

/* [3. 관리자(A) 데이터 연동 핵심 로직] */
async function loadQuestionsFromAdmin() {
    // [경로 수정] A페이지의 DB_Save와 일치하도록 CONFIG/ 를 붙여줍니다.
    const dbPath = `CONFIG/${currentClass}/fullConfig`;
    
    try {
        const snapshot = await database.ref(dbPath).once('value');
        const config = snapshot.val();

        if (!config) { 
            alert("저장된 문제가 없습니다. 관리자 페이지에서 '설정 저장하기'를 먼저 눌러주세요."); 
            return; 
        }

        examQuestions = [];

        // NCS와 비NCS 섹션을 모두 합쳐서 순회
        const allMainSubjects = [...(config.ncs || []), ...(config.nonNcs || [])];
        
        allMainSubjects.forEach(main => {
            if (!main.subSubjects) return;
            main.subSubjects.forEach(sub => {
                if (sub.isActive === true) { 
                    sub.questions.forEach(q => {
                        if (q.text && q.text.trim() !== "") {
                            // C페이지 매칭을 위해 displayTitle에 능력단위명을 담아줍니다.
                            examQuestions.push({ 
                                ...q, 
                                mainTitle: main.title, 
                                subTitle: sub.name,
                                purpose: sub.purpose, // 결과표 출력용
                                ncsCode: sub.ncsCode  // 결과표 출력용
                            });
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
async function submitExam() {
    const userName = document.getElementById('userName').value.trim();
    if (!userName) { alert("성명을 입력해야 제출할 수 있습니다."); return; }
    if (!confirm("시험을 종료하시겠습니까?")) return;

    let scoreCount = 0;
    let userAnswers = [];
    examQuestions.forEach((q, idx) => {
        const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
        const ansVal = selected ? selected.value : "0";
        userAnswers.push(ansVal);
        if (ansVal == q.answer) scoreCount++;
    });

    const score = Math.round((scoreCount / examQuestions.length) * 100);
    
    // C페이지에서 어떤 과목인지 알 수 있게 현재 활성화된 과목명을 displayTitle로 저장합니다.
    const activeSubName = examQuestions.length > 0 ? examQuestions[0].subTitle : "미분류 과목";

    const resultData = { 
        name: userName, 
        score: score, 
        date: new Date().toLocaleString(),
        className: currentClass,
        displayTitle: activeSubName, // C페이지 매칭용 핵심 열쇠
        userAnswers: userAnswers,
        purpose: examQuestions[0].purpose || "",
        groupName: localStorage.getItem(`${currentClass}_groupName`) || "",
        groupPeriod: localStorage.getItem(`${currentClass}_groupPeriod`) || "",
        teacherName: localStorage.getItem(`${currentClass}_teacherName`) || ""
    };

    try {
        const resultPath = `RESULTS/${currentClass}`;
        await database.ref(resultPath).push(resultData);
        
        sessionStorage.setItem('lastScore', score);
        sessionStorage.setItem('lastUserName', userName);

        alert(`${userName} 학생 제출 완료! 점수: ${score}점`);
        location.href = 'C_Result.html';
    } catch (e) {
        console.error("제출 오류:", e);
        alert("결과 저장 중 오류가 발생했습니다. 네트워크를 확인해주세요.");
    }
}