
    // 📍 [계승 및 멀티 DB 대응] LocalStorage에서 반별 설정을 가져옵니다.
    const storedMaster = localStorage.getItem('masterConfig');
    const firebaseConfig = storedMaster ? JSON.parse(storedMaster) : {
    apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU", 
    databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-workall"
};
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const auth = firebase.auth();

    // 📍 현재 반 정보 가져오기 (데이터 로드용 변수 유지)
    const urlParams = new URLSearchParams(window.location.search);
    let currentClass = urlParams.get('class') || "테스트";


    // 📍 전역 함수: 표 구조 클립보드 복사
    window.copyTableToClipboard = async (tableId) => {
        const table = document.getElementById(tableId);
        if (!table) return await appAlert("복사할 표를 찾을 수 없습니다.");
        const range = document.createRange();
        range.selectNode(table);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        try {
            document.execCommand('copy');
            await appAlert("📋 표 구조가 복사되었습니다!\n\n[한글/엑셀 붙여넣기 지침]\n1. 붙여넣기(Ctrl+V) 후 '원본 형식 유지' 선택\n2. '덮어쓰기' 또는 '내용만 덮어쓰기' 선택\n\n※ 테두리 없이 내용만 깔끔하게 입력됩니다.");
        } catch (err) { await appAlert("❌ 복사 실패"); }
        window.getSelection().removeAllRanges();
    };

    // 📍 퀵 네비게이터 접기/펴기
    function toggleNav() {
        const nav = document.getElementById('quickNav');
        const btn = document.querySelector('.nav-toggle-btn');
        nav.classList.toggle('collapsed');
        btn.innerText = nav.classList.contains('collapsed') ? '◀' : '▶';
    }

    // 📍 [보안 강화] 인증 확인 후 시동을 거는 통합 로직
const adminPw = localStorage.getItem('adminPw');

// 📍 전역 변수 추가 (현재 선택된 버전과 탭을 기억하는 메모리 칩)
let currentTargetVersionId = null;
let currentPartName = 'electronics'; 

// 📍 [신규 함수] 파이어베이스에서 버전 목록을 불러와 버튼으로 생성
function loadVersions() {
    database.ref('ncsVersions').once('value', snap => {
        const versions = snap.val() || {};
        const versionListDiv = document.getElementById('versionList');
        versionListDiv.innerHTML = '';
        
        // 생성된 시간(timestamp) 순서대로 정렬
        const keys = Object.keys(versions).sort((a, b) => versions[a].timestamp - versions[b].timestamp);
        
        if (keys.length === 0) {
            versionListDiv.innerHTML = '<span style="color:#e74c3c; font-weight:bold;">❌ 등록된 훈련기준 버전이 없습니다. 관제탑에서 엑셀을 업로드해주세요.</span>';
            return;
        }

        // 각 버전별로 버튼 생성
        keys.forEach((vId, index) => {
            const vData = versions[vId];
            const btn = document.createElement('button');
            btn.className = 'version-btn';
            btn.innerText = vData.name || `버전 ${index + 1}`;
            btn.onclick = () => selectVersion(vId, btn);
            versionListDiv.appendChild(btn);
        });

        // 초기 로딩 시 가장 첫 번째(또는 최근) 버전 자동 클릭
        const firstVersionBtn = versionListDiv.querySelector('.version-btn');
        if (firstVersionBtn) {
            selectVersion(keys[0], firstVersionBtn);
        }
    });
}

// 📍 [신규 함수] 특정 버전 버튼을 클릭했을 때 작동하는 기어
function selectVersion(vId, btn) {
    // 1. 버튼 색상 변경 (기어 활성화)
    document.querySelectorAll('.version-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // 2. 현재 버전 ID 갱신
    currentTargetVersionId = vId;
    
    // 3. 현재 선택되어 있는 하단 탭(전기/엔진 등)의 데이터를 새로운 버전으로 다시 불러오기
    const activeTabBtn = document.querySelector('.tab-btn.active');
    loadPart(currentPartName, activeTabBtn);
}

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // ✅ [상황 1] 인증 성공: 첫 화면에서 파트를 부르는 대신 "버전 목록"을 먼저 부름
        console.log("🔒 보안 인증 확인됨: " + user.email);
        loadVersions(); // 📍 수정됨
    } else if (adminPw) {
        // 🔑 [상황 2] 자동 로그인 시도
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw)
            .catch(async (err) => {
                console.error("❌ 인증 실패", err);
                await appAlert("인증 정보가 만료되었습니다.");
                location.href = '../index.html';
            });
    } else {
        // ⚠️ [상황 3] 인증 없음: 퇴거
        await appAlert("보안 인증이 필요한 페이지입니다.");
        location.href = '../index.html';
    }
});

// ❌ [삭제] 기존의 window.onload 즉시 실행 로직을 제거했습니다.
// window.onload = async function() { loadPart('electronics', ...); };

    function loadPart(partName, btn) {
        currentPartName = partName; // 📍 현재 누른 탭 기억

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const display = document.getElementById('mainDisplay');
        
        // 📍 방어 로직: 버전을 먼저 선택하지 않았다면 차단
        if (!currentTargetVersionId) {
            display.innerHTML = '<div class="no-data">👆 상단에서 훈련기준 버전을 먼저 선택해 주세요.</div>';
            return;
        }

        display.innerHTML = '<div class="no-data">🔄 데이터를 전송받는 중...</div>';

        // 📍 [배관 정밀 교체 완료] 선택된 버전(currentTargetVersionId) 경로로 데이터 호출
        database.ref(`ncsVersions/${currentTargetVersionId}/data/${partName}`).once('value', snap => {
            const result = snap.val();
            if (!result) {
                display.innerHTML = `<div class="no-data">❌ [${partName}] 파트에 등록된 훈련기준이 없습니다.</div>`;
                return;
            }

            const actualData = result.data || result;
            display.innerHTML = '';
            const dataArray = Array.isArray(actualData) ? actualData : Object.values(actualData);

            window.toggleMode = (subIdx, isSplit) => {
                const card = document.getElementById(`card_${subIdx}`);
                const sub = dataArray[subIdx];
                if (card && sub) card.innerHTML = createCardInner(sub, subIdx, isSplit);
            };

            function createCardInner(sub, subIdx, isSplit) {
                let elementsHTML = '';
                const elements = Array.isArray(sub.elements) ? sub.elements : Object.values(sub.elements || {});
                let finalK = "", finalS = "", finalT = "";
                const displayStyle = "border: 1px dashed #ff7675; padding: 8px; background: #fff5f5;";
                const copyTableStyle = "width:100%; border-collapse:collapse; border:0; margin:0; padding:0;";

                // 1. 세부 훈련내용(수행준거) 조립
                elements.forEach((el, idx) => {
                    if(!el) return;
                    if (el.k) finalK = el.k; if (el.s) finalS = el.s; if (el.t) finalT = el.t;
                    const contents = Array.isArray(el.contents) ? el.contents : [el.contents];
                    let contentsHTML = isSplit ? `
                        <div style="text-align: right; margin-bottom: 5px;">
                            <button class="dynamic-copy-table" data-target="ct_${subIdx}_${idx}" style="padding:3px 8px; font-size:11px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">👆 한글 표로 복사</button>
                        </div>
                        <div style="${displayStyle}">
                            <table id="ct_${subIdx}_${idx}" style="${copyTableStyle}">
                                ${contents.map(c => `<tr><td style="border:0; padding:4px;">${c}</td></tr>`).join('')}
                            </table>
                        </div>` : `<div style="white-space: pre-line; line-height: 1.6; padding:10px;">${contents.join('<br>')}</div>`;

                    elementsHTML += `<tr><td class="element-title">${idx + 1}. ${el.name || '단원명 미기입'}</td><td style="padding: 10px; vertical-align: top;">${contentsHTML}</td></tr>`;
                });

                // 2. K.S.A 포맷팅 함수
                const formatKSA = (text, split, ksaType) => {
                    if (!text) return "-";
                    const lines = text.split('•').map(s => s.trim()).filter(s => s !== "");
                    if (split) {
                        return `<div style="text-align: right; margin-bottom: 5px;"><button class="dynamic-copy-table" data-target="ksa_${subIdx}_${ksaType}" style="padding:2px 6px; font-size:10px; background:#e74c3c; color:white; border:none; border-radius:3px; cursor:pointer;">표 복사</button></div>
                        <div style="${displayStyle}"><table id="ksa_${subIdx}_${ksaType}" style="${copyTableStyle}">${lines.map(line => `<tr><td style="border:0; padding:4px;">• ${line}</td></tr>`).join('')}</table></div>`;
                    }
                    return `<div style="white-space: pre-line; line-height: 1.6; padding:5px;">${lines.map(line => `• ${line}`).join('<br>')}</div>`;
                };

                // 3. 📍 장비 목록 HTML 생성 (반환 전에 미리 조립)
                let equipmentHTML = '';
                if (sub.equipments && sub.equipments.length > 0) {
                    equipmentHTML = `
                        <div style="margin-top:20px; border:1px solid #3498db; border-radius:8px; overflow:hidden;">
                            <div style="background:#e8f4fd; padding:8px 15px; font-weight:bold; color:#21618c; font-size:13px; border-bottom:1px solid #3498db; display: flex; justify-content: space-between; align-items: center;">
    <span>🛠️ 주요 훈련 장비 및 도구 (총 ${sub.equipments.length}종)</span>
    <span style="font-size:10px; color:#555; font-weight:normal; background:rgba(255,255,255,0.5); padding:2px 6px; border-radius:4px; border:1px solid #bcd4e6;">
        ${sub.subjectName || '-'} [${sub.code || '-'}]
    </span>
</div>
                            <table class="std-table" style="background:#fff;">
                                <thead>
                                    <tr style="background:#f1f4f7;">
                                        <th style="width:40%;">장비명</th>
                                        <th style="width:15%;">단위</th>
                                        <th style="width:25%;">활용구분</th>
                                        <th style="width:20%;">활용인원</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${sub.equipments.map(eq => `
                                        <tr>
                                            <td style="font-weight:bold; color:#2c3e50;">${eq.name || '-'}</td>
                                            <td style="text-align:center;">${eq.unit || '-'}</td>
                                            <td style="text-align:center;">${eq.type || '-'}</td>
                                            <td style="text-align:center;">${eq.capacity || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>`;
                } else {
                    equipmentHTML = `
                        <div style="margin-top:20px; padding:15px; background:#f9f9f9; border:1px dashed #ccc; border-radius:8px; text-align:center; font-size:12px; color:#999;">
                            ℹ️ 등록된 훈련 장비 정보가 없습니다.
                        </div>`;
                }

                // 4. 최종 화면 출력 (모든 재료를 합쳐서 반환)
               return `
        <div class="subject-header">
            <div>
                <span style="font-size:16px; font-weight:bold;">${sub.subjectName || '교과목명 없음'}</span>
                <span style="font-size:14px; color:#f1c40f; margin-left:10px;">[${sub.code || '-'}]</span>
            </div>
            <button class="dynamic-toggle-mode" data-subidx="${subIdx}" data-split="${!isSplit}" style="padding:4px 8px; font-size:11px; cursor:pointer; background:#fff; color:#d63031; border:1px solid #d63031; border-radius:4px;">
                ${isSplit ? '📄 통합' : '✂️ 분리'}
            </button>
        </div>
        <div class="subject-body"> <div class="subject-info"><b>🎯 훈련목표:</b> ${sub.goal || '-'}</div>
            <table class="std-table"><thead><tr><th style="width:220px;">능력단위 요소</th><th>세부 훈련내용</th></tr></thead><tbody>${elementsHTML}</tbody></table>
            <div style="padding:15px; background:#fff; border:1px solid #dee2e6; border-top:none;">
                <div style="font-weight:bold; margin-bottom:10px;">💡 주요 핵심 역량 (K.S.A)</div>
                <div class="kst-box">
                    <div class="kst-item k-bg"><b>지식:</b><br>${formatKSA(finalK, isSplit, 'k')}</div>
                    <div class="kst-item s-bg"><b>기술:</b><br>${formatKSA(finalS, isSplit, 's')}</div>
                    <div class="kst-item t-bg"><b>태도:</b><br>${formatKSA(finalT, isSplit, 't')}</div>
                </div>
                ${equipmentHTML}
            </div>
        </div>`;
}

            // 카드 및 퀵 네비게이터 생성
            const navList = document.getElementById('navList');
            navList.innerHTML = `<li onclick="window.scrollTo({top:0, behavior:'smooth'})"><strong>🔝 최상단으로 이동</strong></li>`;
            
            dataArray.forEach((sub, subIdx) => {
    const card = document.createElement('div');
    card.className = 'subject-card'; // 초기엔 active 없음 (접힌 상태)
    card.id = `card_${subIdx}`;
    
    // 카드 전체 구조를 감싸는 틀 생성
    card.innerHTML = createCardInner(sub, subIdx, false);
    display.appendChild(card);

    // 📍 [핵심] 헤더 클릭 시 접기/펴기 이벤트 추가
    const header = card.querySelector('.subject-header');
    header.onclick = (e) => {
        // 분리 모드 버튼 클릭 시에는 접히지 않도록 방어
        if (e.target.tagName === 'BUTTON') return;
        card.classList.toggle('active');
    };

    // 퀵 네비게이터 리스트 생성 (기존과 동일)
    const li = document.createElement('li');
    li.innerText = sub.subjectName || '교과목명 없음';
    li.onclick = () => {
        const targetCard = document.getElementById(`card_${subIdx}`);
        targetCard.classList.add('active'); // 이동 시 자동으로 펼쳐주기
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    navList.appendChild(li);
});

            // 🚀 [자동 개방] 탭 클릭 시 무조건 열기
            const nav = document.getElementById('quickNav');
            const toggleBtn = document.querySelector('.nav-toggle-btn');
            
            if (nav) {
                if (nav.classList.contains('collapsed')) {
                    // 이미 닫혀있다면 아무것도 하지 않음 (닫힘 유지)
                    if (toggleBtn) toggleBtn.innerText = '◀';
                } else {
                    // 열려있다면 열린 상태 유지 (화살표 방향만 확인)
                    if (toggleBtn) toggleBtn.innerText = '▶';
                }
            }
        }); // database.ref().once('value') 끝나는 지점
    }

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 (이벤트 위임 기술 적용)

document.addEventListener('DOMContentLoaded', () => {
    // 1. 고정 네비게이션 버튼
    document.getElementById('btn_toggle_nav').addEventListener('click', toggleNav);

    // 2. 상단 전기/엔진/섀시/전기차 탭 버튼 (이벤트 위임)
    document.getElementById('partTabContainer').addEventListener('click', function(e) {
        const tabBtn = e.target.closest('.dynamic-load-part');
        if (tabBtn) {
            loadPart(tabBtn.getAttribute('data-part'), tabBtn);
        }
    });

    // 3. 📍 동적으로 생성되는 과목 목록 퀵 네비게이터 클릭 감지 (이벤트 위임)
    // - 기존 li.onclick 속성을 살려두었으나, JS 난독화를 위해 중앙 통제소로 끌어오면 더 안전합니다.
    // - (참고: li 생성 시 onclick을 지우고 처리해도 되지만, 현재 상태에서도 난독화기(Obfuscator)가 익명함수 `() => {...}`는 안전하게 꼬아주므로 작동에 문제없습니다.)

    // 4. 📍 메인 디스플레이 영역(동적 생성 표, 아코디언, 복사버튼 등) 통제소
    document.getElementById('mainDisplay').addEventListener('click', function(e) {
        // ① 통합/분리 토글 버튼
        const modeBtn = e.target.closest('.dynamic-toggle-mode');
        // ② 한글 표로 복사 버튼
        const copyBtn = e.target.closest('.dynamic-copy-table');

        if (modeBtn) {
            // 버튼 클릭 시 아코디언(header.onclick)이 동시에 작동하는 것을 방지
            e.stopPropagation();
            const subIdx = modeBtn.getAttribute('data-subidx');
            const isSplit = modeBtn.getAttribute('data-split') === 'true'; // 문자열 'true'를 boolean으로 변환
            if (window.toggleMode) window.toggleMode(subIdx, isSplit);
        } else if (copyBtn) {
            e.stopPropagation();
            if (window.copyTableToClipboard) window.copyTableToClipboard(copyBtn.getAttribute('data-target'));
        }
    });
});