
   
        let currentDbKey = "";
        const storedConfig = localStorage.getItem('firebaseConfig');
        const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
            apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
            databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "busan-teacher-work"
        };
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const database = firebase.database();

        const masterConfig = {
            apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
            databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "busan-teacher-workall"
        };
        const masterApp = !firebase.apps.find(app => app.name === "masterApp") 
            ? firebase.initializeApp(masterConfig, "masterApp") 
            : firebase.app("masterApp");
        const masterDatabase = masterApp.database();
        const auth = firebase.auth();

        const urlParams = new URLSearchParams(window.location.search);
        const currentClass = urlParams.get('class') || "테스트";
        document.getElementById('backLink').href = '../start/index1.html?class=' + currentClass;
        const defaultViewMode = localStorage.getItem('defaultViewMode_' + currentClass) || 'subject';

        let globalCoursesData = [];
        let globalStandards = []; 
        let globalNcsMasterDB = {}; // 💡 [통합 엔진 배선] 10자리 통합 엔진용 마스터 사전
        let globalAttendanceData = {}; // 💡 [신규 배선] 일일출석부 데이터 보관용 (데이터 탱크)
        let globalTeacherSeal = "";    // 💡 [신규 배선] 담당교사 직인 보관용
        let globalVerifierSeal = "";   // 💡 [신규 배선] 검증자 직인 보관용

        const adminPw = localStorage.getItem('adminPw');
        const masterAuth = masterApp.auth(); 

        auth.onAuthStateChanged(async (user) => {
            if (user) { 
                if (!masterAuth.currentUser && adminPw) {
                    try { 
                        await masterAuth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw); 
                    } catch(e) { 
                        console.warn("마스터 인증 지연:", e); 
                    }
                }
                fetchMasterData(); 
            } 
            else if (adminPw) {
                try {
                    await auth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw);
                    await masterAuth.signInWithEmailAndPassword('ghlwns0201@naver.com', adminPw);
                    fetchMasterData();
                } catch (err) {
                    alert("인증 실패"); location.href = '../index.html';
                }
            } else { 
                alert("보안 인증이 필요합니다."); location.href = '../index.html'; 
            }
        });

        let allVersionsData = {};

        async function fetchMasterData() {
            try {
                const cacheKey = `dev_cache_master_${currentClass}`;
                const ttCacheKey = `dev_cache_tt_${currentClass}`;

                const cachedData = sessionStorage.getItem(cacheKey);
                const cachedTt = sessionStorage.getItem(ttCacheKey);

                let masterData = {}; let fullTimetable = [];

                if (cachedData) masterData = JSON.parse(cachedData);
                else {
                    const snap = await database.ref(`${currentClass}/masterData`).once('value');
                    masterData = snap.val() || {};
                    sessionStorage.setItem(cacheKey, JSON.stringify(masterData));
                }

                if (cachedTt) fullTimetable = JSON.parse(cachedTt);
                else {
                    const ttSnap = await database.ref(`${currentClass}/fullTimetable`).once('value');
                    fullTimetable = ttSnap.val() || [];
                    sessionStorage.setItem(ttCacheKey, JSON.stringify(fullTimetable));
                }

                // 💡 [데이터 펌프 가동] 각 반의 일일출석부 DB에서 데이터를 끌어와 탱크에 적재
                const attSnap = await database.ref(`${currentClass}/dailyAttendance`).once('value');
                globalAttendanceData = attSnap.val() || {};

                // 💡 [단선 복구] 훈련기준 버전 정보 통신 펌프 재가동
                const vSnap = await masterDatabase.ref('ncsVersions').once('value');
                allVersionsData = vSnap.val() || {};

                // 💡 [통합 엔진 가동] 모든 버전을 하나의 거대한 사전(Dictionary)으로 융합
                globalNcsMasterDB = {}; 
                Object.keys(allVersionsData).forEach(vId => {
                    const partsData = allVersionsData[vId].data; 
                    const vName = allVersionsData[vId].name; // 💡 등록된 실제 버전 이름 추출
                    if(partsData) {
                        Object.keys(partsData).forEach(partName => {
                            const subjects = partsData[partName].data; 
                            if(subjects && Array.isArray(subjects)) {
                                subjects.forEach(sub => {
                                    if(sub.code) {
                                        sub._versionName = vName; // 💡 메모리에 버전 이름표 찰칵 부착!
                                        globalNcsMasterDB[sub.code] = sub; 
                                    }
                                });
                            }
                        });
                    }
                });
                
                // 구형 버전(legacy) 호환 데이터도 긁어와서 병합
                const legacySnap = await masterDatabase.ref('commonStandards').once('value');
                const legacyData = legacySnap.val() || {};
                ['electronics', 'engine', 'chassis', 'ev'].forEach(part => {
                    if (legacyData[part]) {
                        const arr = Array.isArray(legacyData[part].data) ? legacyData[part].data : Object.values(legacyData[part].data || legacyData[part]);
                        arr.forEach(sub => {
                            if(sub.code && !globalNcsMasterDB[sub.code]) {
                                sub._versionName = "[기존 공통] 훈련기준"; // 💡 구형 이름표 부착
                                globalNcsMasterDB[sub.code] = sub;
                            }
                        });
                    }
                });
                
                // 💡 [안전 장치] 기존 코드들이 에러 없이 읽을 수 있게 배열(Array) 형태로 변환하여 덮어쓰기
                globalStandards = Object.values(globalNcsMasterDB);

                // 💡 [통합 배선 유지] 마스터 DB에서 워터마크 및 공용 직인 데이터 한 번에 끌어오기
                try {
                    const watermarkSnap = await masterDatabase.ref('commonImages/etcImages/-OngbNHNk5vcKd5T4kIV').once('value');
                    if (watermarkSnap.val() && watermarkSnap.val().imageData) {
                        document.getElementById('watermark_logo').style.backgroundImage = `url('${watermarkSnap.val().imageData}')`;
                    }

                    const tSealSnap = await masterDatabase.ref(`commonImages/teacherSeals/${currentClass}`).once('value');
                    if (tSealSnap.val() && tSealSnap.val().imageData) globalTeacherSeal = tSealSnap.val().imageData;
                    
                    const vSealSnap = await masterDatabase.ref(`commonImages/commonSeals/vicePrincipal`).once('value');
                    if (vSealSnap.val() && vSealSnap.val().imageData) globalVerifierSeal = vSealSnap.val().imageData;
                } catch(e) { console.warn("이미지/직인 로드 에러:", e); }

                const vSelect = document.getElementById('ncsVersionSelect');
                let optionsHtml = `<option value="legacy">[기존 공통] 훈련기준</option>`;
                
                const keys = Object.keys(allVersionsData).sort((a, b) => allVersionsData[a].timestamp - allVersionsData[b].timestamp);
                keys.forEach((vId, idx) => {
                    optionsHtml += `<option value="${vId}">${idx + 1}.과평 버전: ${allVersionsData[vId].name}</option>`;
                });
                vSelect.innerHTML = optionsHtml;

                let indOptionsHtml = `<option value="">대표 버전 따름</option><option value="legacy">[기존 공통] 훈련기준</option>`;
                keys.forEach((vId, idx) => {
                    indOptionsHtml += `<option value="${vId}">${idx + 1}.과평 버전: ${allVersionsData[vId].name}</option>`;
                });
                document.getElementById('individualNcsSelect').innerHTML = indOptionsHtml;

                const savedVersionPref = localStorage.getItem(`selectedVersion_${currentClass}`) || "legacy";
                if (vSelect.querySelector(`option[value="${savedVersionPref}"]`)) {
                    vSelect.value = savedVersionPref;
                }
                
                await loadStandardsForVersion(vSelect.value);

                document.getElementById('S0_CourseName').value = masterData.name || "데이터 없음";
                document.getElementById('S0_Period').value = masterData.period || "데이터 없음";
                document.getElementById('S0_Teacher').value = masterData.teacher || "데이터 없음";

                const courses = masterData.courses || [];
                if (courses.length > 0) {
                    globalCoursesData = courses;
                    
                    const commonSnap = await masterDatabase.ref('commonEvaluations').once('value');
                    const commonData = commonSnap.val() || {};
                    const uploadedKeys = Object.keys(commonData); 

                    // 💡 [신규 배선] 브라우저(로컬) 설정이 날아갔을 경우 파이어베이스 DB에서 2차 스캔 (이중 보험)
                    let finalViewMode = defaultViewMode;
                    if (!localStorage.getItem('defaultViewMode_' + currentClass)) {
                        if (masterData.viewMode) finalViewMode = masterData.viewMode;
                        else if (masterData.defaultViewMode) finalViewMode = masterData.defaultViewMode;
                    }

                    renderListBasedOnMode(courses, finalViewMode, fullTimetable, uploadedKeys);
                } else {
                    document.getElementById('unitListContainer').innerHTML = "<p style='color:red;'>등록된 교과목 데이터가 없습니다.</p>"; 
                }
            } catch (e) {
                console.error("데이터 로드 실패:", e);
                document.getElementById('unitListContainer').innerHTML = "<p style='color:red;'>데이터 통신 에러 발생</p>";
            }
        }

        async function loadStandardsForVersion(versionId) {
            // 💡 [통합 엔진 적용] 기존의 수동 단일버전 로드 기능은 폐기합니다.
            // 이미 fetchMasterData()에서 전수 스캔하여 globalStandards에 완벽하게 적재되었으므로 무시합니다.
            return;
        }

        async function changeNcsVersion() {
            const vId = document.getElementById('ncsVersionSelect').value;
            localStorage.setItem(`selectedVersion_${currentClass}`, vId); 
            
            const badge = document.getElementById('viewModeBadge');
            const oldText = badge.innerText;
            badge.innerText = "기준 교체 중...";
            
            await loadStandardsForVersion(vId); 
            
            badge.innerText = oldText;
            
            const activeBtn = document.querySelector('.unit-btn.active');
            if (activeBtn) activeBtn.click();
        }

        async function resetEvalData() {
            if (!currentDbKey) return alert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.");

            const subject = document.getElementById('S1_1').value;
            const unitName = document.getElementById('S1_2').value;
            const displayName = unitName ? unitName : subject;

            // 선생님의 지침에 따른 폭파 승인 문구
            const expectedText = "삭제합니다";
            const userInput = prompt(`❗ [최종 경고] 우리 반의 [${displayName}] 과목에 대한 모든 데이터(설정, 문제, 모범답안, 근거사진, 학생 점수)를 완전히 삭제합니다.\n\n진행하시려면 "${expectedText}"라고 정확히 입력해 주세요.`);

            if (userInput === expectedText) {
                try {
                    const modes = ['본평가', '추가평가', '재평가'];
                    const deletePromises = [];
                    
                    // 1. 모든 평가 모드의 '계획/설정' 및 '사진' DB 삭제
                    modes.forEach(mode => {
                        deletePromises.push(database.ref(`${currentClass}/evalPlans/${mode}/${currentDbKey}`).remove());
                        deletePromises.push(database.ref(`${currentClass}/evalPhotos/${mode}/${currentDbKey}`).remove());
                    });
                    
                    // 2. 통합 점수(본평가 경로) DB 삭제
                    deletePromises.push(database.ref(`${currentClass}/evalScores/본평가/${currentDbKey}`).remove());

                    // 3. 서버 데이터 소각 대기
                    await Promise.all(deletePromises);
                    
                    // 4. [중요] 좀비 데이터 방지를 위한 브라우저 RAM(메모리) 완전 포맷
                    window.studentScoresData = {};
                    window.downloadedCustomItems = null;
                    window.activeFeedbacks = {};
                    window.lastEditedCells = {};
                    window.tableUndoStacks = {};
                    
                    alert(`✅ [${displayName}] 과목의 모든 데이터가 소멸되었습니다. 순정 상태로 돌아갑니다.`);
                    
                    // 5. 화면 강제 리프레시 (순정 상태 렌더링)
                    const activeBtn = document.querySelector('.unit-btn.active');
                    if (activeBtn) {
                        window.isGlobalModeSwitching = true; // 화면 튕김 방지 플래그
                        activeBtn.click(); // 현재 과목 다시 클릭하여 순정 로드
                        setTimeout(() => {
                            window.isGlobalModeSwitching = false;
                            document.getElementById('btnPage0').click(); // 설정 페이지로 이동
                        }, 300);
                    }

                } catch(e) {
                    alert("❌ 초기화 실패: " + e.message);
                }
            } else if (userInput !== null) {
                alert("❌ 문구가 일치하지 않아 초기화가 취소되었습니다.");
            }
        }

        function renderListBasedOnMode(courses, mode, fullTimetable = [], uploadedKeys = []) {
            const container = document.getElementById('unitListContainer');
            const badge = document.getElementById('viewModeBadge');
            container.innerHTML = ""; 

            const shortDate = (d) => {
                if(!d) return "미정";
                let s = String(d).replace(/[\.\/]/g,'-').replace(/\s/g,'');
                let p = s.split('-'); return p.length >= 2 ? `${p[1]}-${p[2]}` : s;
            };

            if (mode === 'subject') {
                badge.innerText = "교과목별 모드"; badge.style.backgroundColor = "#27ae60"; 
                const subjectGroups = {};
                courses.forEach(c => {
                    const courseType = c.type || "미분류";
                    let determinedEval = c.evalMethod || c.eval || "작업장평가";
                    if (courseType.includes("비NCS") || courseType.includes("소양")) { determinedEval = "기타(선다형)"; }

                    if (!subjectGroups[c.subject]) {
                        subjectGroups[c.subject] = { subject: c.subject, type: courseType, evalMethod: determinedEval, totalHours: 0, endDate: "" };
                    }
                    if (c.details) { c.details.forEach(d => subjectGroups[c.subject].totalHours += Number(d.hour || 0)); }
                });

                let groupArray = Object.values(subjectGroups);
                groupArray.forEach(group => {
                    let maxDate = "";
                    fullTimetable.forEach(row => {
                        if (row['교과목'] && row['교과목'].trim() === group.subject && row['날짜']) {
                            if (row['날짜'] > maxDate) maxDate = row['날짜'];
                        }
                    });
                    group.endDate = maxDate;
                });

                groupArray.sort((a, b) => {
                    if (!a.endDate && !b.endDate) return 0;
                    if (!a.endDate) return 1; 
                    if (!b.endDate) return -1;
                    return a.endDate.localeCompare(b.endDate);
                });

                groupArray.forEach(group => {
                    const btn = document.createElement('button');
                    btn.className = 'unit-btn';
                    
                    const cleanSubject = group.subject.replace(/[\s\.\#\$\/\[\]]/g, '');
                    const isUploaded = uploadedKeys.some(k => k.includes(cleanSubject));
                    const textColor = isUploaded ? "#2ecc71" : "white";

                    btn.innerHTML = `<span class="unit-subject-label" style="display:flex; justify-content:space-between;"><span>[${group.type}]</span> <span style="color:#f1c40f;">종료: ${shortDate(group.endDate)}</span></span><b style="color:${textColor};">${group.subject}</b>`;
                    btn.onclick = function() { selectUnit(this, group.subject, "", "", group.evalMethod, group.totalHours, 'subject', group.endDate); };
                    container.appendChild(btn);
                });

            } else {
                badge.innerText = "능력단위별 모드"; badge.style.backgroundColor = "#e67e22"; 
                let renderArray = courses.map(c => {
                    let unitCode = ""; let unitNameOnly = String(c.unit || "");
                    const codePatternMatch = unitNameOnly.match(/[0-9]{8,}_[0-9]+v[0-9]+/i);
                    const bracketMatch = unitNameOnly.match(/\[(.*?)\]/); 

                    if (codePatternMatch) { unitCode = codePatternMatch[0]; unitNameOnly = unitNameOnly.replace(codePatternMatch[0], "").trim(); } 
                    else if (bracketMatch) { unitCode = bracketMatch[1]; unitNameOnly = unitNameOnly.replace(bracketMatch[0], "").trim(); }
                    unitNameOnly = unitNameOnly.replace(/^[\[\]\s]+/, "").trim();

                    let totalHours = 0;
                    if (c.details) { c.details.forEach(d => totalHours += Number(d.hour || 0)); }

                    let maxDate = "";
                    fullTimetable.forEach(row => {
                        let rowUnit = String(row['능력단위'] || "").trim();
                        const bMatch = rowUnit.match(/\[(.*?)\]/);
                        if (bMatch) rowUnit = rowUnit.replace(bMatch[0], "").trim();

                        if (row['교과목'] && row['교과목'].trim() === c.subject && rowUnit === unitNameOnly && row['날짜']) {
                            if (row['날짜'] > maxDate) maxDate = row['날짜'];
                        }
                    });

                    const courseType = c.type || "미분류";
                    let determinedEval = c.evalMethod || c.eval || "작업장평가";
                    if (courseType.includes("비NCS") || courseType.includes("소양")) { determinedEval = "기타(선다형)"; }

                    return { subject: c.subject, unitCode: unitCode, unitNameOnly: unitNameOnly, determinedEval: determinedEval, totalHours: totalHours, courseType: courseType, endDate: maxDate };
                });

                renderArray.sort((a, b) => {
                    if (!a.endDate && !b.endDate) return 0;
                    if (!a.endDate) return 1;
                    if (!b.endDate) return -1;
                    return a.endDate.localeCompare(b.endDate);
                });

                renderArray.forEach(item => {
                    const btn = document.createElement('button');
                    btn.className = 'unit-btn';

                    const targetSubject = (item.unitNameOnly && item.unitNameOnly !== "") ? item.unitNameOnly : item.subject;
                    const cleanName = targetSubject.replace(/[\s\.\#\$\/\[\]]/g, '');
                    const cleanCode = item.unitCode.replace(/[\s\.\#\$\/\[\]]/g, '');
                    
                    const isUploaded = uploadedKeys.some(k => k.includes(cleanName) && k.includes(cleanCode));
                    const textColor = isUploaded ? "#2ecc71" : "white";

                    btn.innerHTML = `<span class="unit-subject-label" style="display:flex; justify-content:space-between;"><span>[${item.courseType}] ${item.subject}</span> <span style="color:#f1c40f;">종료: ${shortDate(item.endDate)}</span></span><b style="color:${textColor};">${item.unitNameOnly || '단위명 없음'}</b>`;
                    btn.onclick = function() { selectUnit(this, item.subject, item.unitCode, item.unitNameOnly, item.determinedEval, item.totalHours, 'ncs', item.endDate); };
                    container.appendChild(btn);
                });
            }
        }

        async function selectUnit(clickedBtn, subject, code, name, evalMethod, hours, mode, endDate) {
            document.getElementById('individualNcsSelect').value = "";
            document.getElementById('individualNcsSelect').style.backgroundColor = "";
            
            const allBtns = document.querySelectorAll('.unit-btn');
            allBtns.forEach(b => b.classList.remove('active'));
            clickedBtn.classList.add('active');

            const docBtns = document.querySelectorAll('.nav-btn');
            docBtns.forEach(b => b.classList.add('ready'));

            // 💡 [신규] 글로벌 모드 전환 중에는 0.설정 탭으로 강제 이동하지 않음
            if (!window.isGlobalModeSwitching) {
                showPage('page0', document.getElementById('btnPage0'));
            }

            currentDbKey = (subject + "_" + (name || "종합")).replace(/[\.\#\$\/\[\]]/g, '');
            const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
            const savedData = snap.val();

            const indSelect = document.getElementById('individualNcsSelect');
            const mainVersion = document.getElementById('ncsVersionSelect').value;
            
            if (savedData && savedData.ncsVersion) {
                indSelect.value = savedData.ncsVersion;
                if (savedData.ncsVersion !== mainVersion) {
                    indSelect.style.backgroundColor = "#ffeaa7";
                    indSelect.style.borderColor = "#e67e22";
                    indSelect.style.color = "#d35400";
                } else {
                    indSelect.style.backgroundColor = "";
                    indSelect.style.borderColor = "#ccc";
                    indSelect.style.color = "";
                }
            } else {
                indSelect.value = "";
                indSelect.style.backgroundColor = "";
                indSelect.style.borderColor = "#ccc";
                indSelect.style.color = "";
            }

            // =========================================================================
            // 💡 [통합 매핑 엔진 100% 이식] 10자리 고유품번 추적 알고리즘 (Zero-Error)
            // =========================================================================
            let stdData = null;
            let matchLevel = "3차(이름강제)"; 

            // 1. 넘어온 코드의 순수 문자열 추출 (특수문자 제거)
            let fullCode = code || ""; 
            fullCode = fullCode.replace(/[^a-zA-Z0-9_v]/gi, ''); 

            if (fullCode) {
                if (globalNcsMasterDB[fullCode]) {
                    // [1순위] 완벽 일치 (버전까지 100% 동일)
                    stdData = globalNcsMasterDB[fullCode];
                    matchLevel = "1차(정밀 100%)";
                } else {
                    // [2순위] 10자리 고유품번 강제 호환 매칭 (버전 무시)
                    const prefix10 = fullCode.substring(0, 10);
                    if (prefix10.length === 10) {
                        const altCode = Object.keys(globalNcsMasterDB).find(k => k.startsWith(prefix10));
                        if (altCode) {
                            stdData = globalNcsMasterDB[altCode];
                            matchLevel = "2차(10자리 호환)";
                        }
                    }
                }
            }

            // [3순위] 코드가 아예 없는 구형 데이터이거나 오류일 경우 과목명으로 강제 매칭
            if (!stdData) {
                const textFilter = /[\s·ㆍ\.\_]/g;
                const cleanName = (name || subject).replace(textFilter, '');
                const altKey = Object.keys(globalNcsMasterDB).find(k => {
                    let sName = globalNcsMasterDB[k].subjectName;
                    return sName && sName.replace(textFilter, '') === cleanName;
                });
                if (altKey) stdData = globalNcsMasterDB[altKey];
            }

            // 💡 [3차 비상 세팅] 찾은 stdData(순정 NCS DB)를 최우선 적용, 없으면 시간표 텍스트
            let officialCategory = stdData && stdData.categoryName ? stdData.categoryName : subject;
            let officialCode = stdData && stdData.code ? stdData.code : (code || "코드 없음 (DB 미등록)");
            let officialSubjectName = stdData && stdData.subjectName ? stdData.subjectName : (name || subject);

            if (savedData && savedData.unitCode) { 
                officialCode = savedData.unitCode; 
            }

            // DOM 요소에 값 강제 주입
            document.getElementById('S1_1').value = officialCategory;
            document.getElementById('S1_Code').value = officialCode;  
            document.getElementById('S1_2').value = officialSubjectName; 

            document.getElementById('rowUnitCode').style.display = 'flex'; 
            document.getElementById('rowUnitName').style.display = 'flex';

            document.getElementById('S2_1').value = evalMethod || "작업장평가";
            document.getElementById('S2_2').value = hours;
            document.getElementById('S2_3').value = savedData ? (savedData.evalTestTime || "") : "";

            // 💡 [버전 표시 레이더 장착] 1. 대상 교과 영역에 매칭된 실제 훈련기준 버전 출력
            let targetHeader = document.querySelector('#S_Group1 h3');
            let oldBadge = document.getElementById('matchLevelBadge');
            if (oldBadge) oldBadge.remove(); 

            let badgeColor = "#e74c3c"; // 기본 에러 색상 (빨강)
            let badgeText = "❌ DB 없음 (비NCS 등)"; 

            // stdData(순정 DB)가 정상적으로 연결되었을 경우 버전 추출
            if (stdData && stdData.code) {
                badgeColor = "#3498db"; // 정상 연결 색상 (파랑)
                
                // 💡 [수정 완료] 코드 뒷자리가 아닌, select_class에 등록된 실제 훈련기준 명칭을 출력
                let vName = stdData._versionName || "알 수 없는 버전";
                badgeText = `✅ 연결됨 (${vName})`; 
            }
            
            if (targetHeader) {
                targetHeader.innerHTML += `<span id="matchLevelBadge" style="margin-left:auto; background:${badgeColor}; color:white; font-size:11px; padding:4px 10px; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); font-weight:bold; letter-spacing:-0.5px;">${badgeText}</span>`;
            }
            // =========================================================================

            const evalTbody = document.getElementById('evalItemTbody');
            evalTbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px;'>⏳ 데이터를 불러오는 중입니다...</td></tr>";

            let fmtDate = "";
            if(endDate){ let dStr=String(endDate).replace(/[\.\/]/g,'-').replace(/\s/g,'').replace(/-$/,''); let p=dStr.split('-'); if(p.length===3) fmtDate=`${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`; }
            
            document.getElementById('S3_1').value = savedData ? (savedData.dateMain || "") : fmtDate; 
            document.getElementById('S3_2').value = savedData ? (savedData.dateAdd || "") : ""; 
            document.getElementById('S3_3').value = savedData ? (savedData.dateRe || "") : "";

            if (savedData && savedData.items) {
                let html = "";
                savedData.items.forEach(item => {
                    html += `<tr class="eval-main-row">
                                <td class="item-name">${item.name}</td>
                                <td>
                                    <div class="toggle-group type-selector" data-value="${item.type || '평가자 체크'}">
                                        <button type="button" class="toggle-btn ${(!item.type || item.type==='평가자 체크') ? 'active' : ''}" onclick="changeEvalType(this, '평가자 체크')">교사</button>
                                        <button type="button" class="toggle-btn ${item.type==='훈련생작성' ? 'active' : ''}" onclick="changeEvalType(this, '훈련생작성')">훈련생</button>
                                    </div>
                                </td>
                                <td><input type="number" class="eval-input" placeholder="배점" value="${item.score}"></td>
                                <td><select class="eval-input">
                                        <option value="상" ${item.diff==='상' ? 'selected' : ''}>상</option>
                                        <option value="중" ${item.diff==='중' ? 'selected' : ''}>중</option>
                                        <option value="하" ${item.diff==='하' ? 'selected' : ''}>하</option>
                                    </select></td>
                            </tr>
                            <tr class="eval-question-row">
                                <td colspan="3">
                                    <textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요.">${item.question || ''}</textarea>
                                </td>
                                <td colspan="1" style="vertical-align: top; padding-bottom: 12px;">
                                    <textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명">${item.coreTask || ''}</textarea>
                                </td>
                            </tr>`;
                });
                evalTbody.innerHTML = html;
            } 
            else if (stdData && stdData.elements && stdData.elements.length > 0) {
                let html = "";
                stdData.elements.forEach((el, index) => {
                    if(!el) return;
                    html += `<tr class="eval-main-row">
                        <td class="item-name">${index + 1}. ${el.name}</td>
                        <td>
                            <div class="toggle-group type-selector" data-value="평가자 체크">
                                <button type="button" class="toggle-btn active" onclick="changeEvalType(this, '평가자 체크')">교사</button>
                                <button type="button" class="toggle-btn" onclick="changeEvalType(this, '훈련생작성')">훈련생</button>
                            </div>
                        </td>
                        <td><input type="number" class="eval-input" placeholder="배점 (예: 20)"></td>
                        <td><select class="eval-input"><option value="상">상</option><option value="중" selected>중</option><option value="하">하</option></select></td>
                    </tr>
                    <tr class="eval-question-row">
                        <td colspan="3"><textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요."></textarea></td>
                        <td colspan="1" style="vertical-align: top; padding-bottom: 12px;"><textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명"></textarea></td>
                    </tr>`;
                });
                evalTbody.innerHTML = html;
            } 
            else {
                evalTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#e74c3c; padding: 20px; font-weight:bold;">⚠️ '${subject}'에 해당하는 훈련기준(코드/요소)을 DB에서 찾을 수 없습니다.</td></tr>
                <tr class="eval-main-row">
                    <td class="item-name"><input type="text" class="eval-input" style="width:90%; background:transparent; border:none; font-weight:bold; color:#333;" value="${subject} 종합평가"></td>
                    <td><div class="toggle-group type-selector" data-value="평가자 체크"><button type="button" class="toggle-btn active" onclick="changeEvalType(this, '평가자 체크')">교사</button><button type="button" class="toggle-btn" onclick="changeEvalType(this, '훈련생작성')">훈련생</button></div></td>
                    <td><input type="number" class="eval-input" placeholder="배점" value="80"></td>
                    <td><select class="eval-input"><option value="상">상</option><option value="중" selected>중</option><option value="하">하</option></select></td>
                </tr>
                <tr class="eval-question-row">
                    <td colspan="3"><textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요."></textarea></td>
                    <td colspan="1" style="vertical-align: top; padding-bottom: 12px;"><textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명"></textarea></td>
                </tr>`;
            }

            let currentCourseType = "NCS 전공교과";
            const typeSpan = clickedBtn.querySelector('.unit-subject-label span');
            if (typeSpan) currentCourseType = typeSpan.innerText.replace(/[\[\]]/g, '');
           

            // 💡 1번 표지에도 순정 데이터(officialCategory, officialSubjectName, officialCode) 주입
            renderCoverPage(stdData, officialCategory, officialSubjectName, officialCode, hours, currentCourseType);
        }

        function showPage(pageId, btnElement) {
            const pages = document.querySelectorAll('.page-frame, .page1-container, .eval-paper-container'); 
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
           
            const btns = document.querySelectorAll('.nav-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            btnElement.classList.add('active');

            const globalBar = document.getElementById('globalModeBar');
            if (globalBar) {
                if (pageId === 'page0' || pageId === 'page4' || pageId === 'page5') {
                    globalBar.style.display = 'none';
                } else {
                    globalBar.style.display = 'block';
                }
            }

            if(pageId === 'page1') {
                buildEvaluationDocs();
            } else if (pageId === 'page2') {
                buildEvaluationPaper();
            } else if (pageId === 'page3') {
                buildAnswerDocs();
            } else if (pageId === 'page4') {
                buildFinalResultDocs(); 
            } else if (pageId === 'page5') {
                buildPersonalEvalDocs(); // 📍 [신규 모터 가동] 5. 개인내부평가표 렌더링
            }
        }

        let currentEvalMode = '본평가'; 
        window.switchEvalType = function(type, btnElement) {
            currentEvalMode = type;
            
            // 💡 모든 전환 버튼(0.설정 및 글로벌 바) 상태 동기화
            const tabs = document.querySelectorAll('.tab-btn');
            tabs.forEach(tab => tab.classList.remove('active'));
            tabs.forEach(tab => {
                if (tab.innerText.includes(type)) tab.classList.add('active');
            });
           
            document.getElementById('S3_1').classList.remove('highlight-date');
            document.getElementById('S3_2').classList.remove('highlight-date');
            document.getElementById('S3_3').classList.remove('highlight-date');
           
            if (type === '본평가') document.getElementById('S3_1').classList.add('highlight-date');
            else if (type === '추가평가') document.getElementById('S3_2').classList.add('highlight-date');
            else if (type === '재평가') document.getElementById('S3_3').classList.add('highlight-date');

            const activeUnitBtn = document.querySelector('.unit-btn.active');
            const activePageBtn = document.querySelector('.nav-btn.active');

            if(activeUnitBtn) {
                // 💡 0.설정 탭이 아닌 곳에서 모드를 바꿨다면 튕김 방지 플래그 온
                if (activePageBtn && activePageBtn.id !== 'btnPage0') {
                    window.isGlobalModeSwitching = true;
                }
                
                activeUnitBtn.click();
                
                // 💡 데이터 갱신 후 현재 화면 재가동
                if (window.isGlobalModeSwitching) {
                    setTimeout(() => {
                        window.isGlobalModeSwitching = false;
                        if (activePageBtn) activePageBtn.click();
                    }, 400); // DB 파싱 후 화면 갱신 대기
                }
            }
        }

        async function executeSave() {
            const subject = document.getElementById('S1_1').value;
            const unitName = document.getElementById('S1_2').value;
            if (!subject) return alert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.");

            const displayName = unitName ? unitName : subject;
        const dbKey = currentDbKey; // 기존 저장 경로 엇갈림 방지 (다이렉트 연결)

        const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
            let totalScore = 0;
            const evalItems = [];

            if (rows.length === 0) return alert("⚠️ 저장할 요소 데이터가 없습니다.");

            rows.forEach(tr => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                
                const inputs = tr.querySelectorAll('input[type="number"]');
                const score = inputs[0] ? Number(inputs[0].value) : 0;
                
                const selects = tr.querySelectorAll('select');
                const diff = selects[0] ? selects[0].value : "";

                let questionText = ""; let coreTaskText = "";
                const questionRow = tr.nextElementSibling;
                if (questionRow && questionRow.classList.contains('eval-question-row')) {
                    const qInput = questionRow.querySelector('.eval-question-input'); if (qInput) questionText = qInput.value;
                    const cInput = questionRow.querySelector('.eval-core-task-input'); if (cInput) coreTaskText = cInput.value;
                }
                totalScore += score;
                evalItems.push({ name, type, score, diff, question: questionText, coreTask: coreTaskText }); 
            });

            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${dbKey}`).once('value');
                const existingData = snap.val() || {};
                evalItems.forEach((item, i) => {
                    if (window.downloadedCustomItems && window.downloadedCustomItems[i]) {
                        if (window.downloadedCustomItems[i].customHtml) item.customHtml = window.downloadedCustomItems[i].customHtml;
                        if (window.downloadedCustomItems[i].ansHtml) item.ansHtml = window.downloadedCustomItems[i].ansHtml;
                    } else if (existingData && existingData.items && existingData.items[i]) {
                        if (existingData.items[i].customHtml) item.customHtml = existingData.items[i].customHtml;
                        if (existingData.items[i].ansHtml) item.ansHtml = existingData.items[i].ansHtml;
                    }
                });
                window.downloadedCustomItems = null; 
            } catch(e) { console.warn("DB 병합 중 에러 발생", e); }

            if (totalScore !== 80) {
                alert(`⚠️ [안내] 현재 배점 총합이 80점이 아닙니다. (현재: ${totalScore}점)\n입력된 내용으로 저장을 진행합니다.`);
            }

            const indVersion = document.getElementById('individualNcsSelect').value;

            const saveData = {
                subject: subject, unitCode: document.getElementById('S1_Code').value, unitName: unitName,
                evalMethod: document.getElementById('S2_1').value, 
                totalHours: document.getElementById('S2_2').value,
                evalTestTime: document.getElementById('S2_3').value, 
                dateMain: document.getElementById('S3_1').value, dateAdd: document.getElementById('S3_2').value, dateRe: document.getElementById('S3_3').value,
                ncsVersion: indVersion,
                items: evalItems
            };

            if(!confirm(`[${currentEvalMode}] '${displayName}'\n해당 설정 내용으로 저장(업데이트) 하시겠습니까?`)) return;

            try {
                await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${dbKey}`).set(saveData);
                alert(`✅ [${currentEvalMode}] '${displayName}' 저장이 완료되었습니다!`);
            } catch(e) { alert("❌ 저장 실패: " + e.message); }
        }

        function renderCoverPage(stdData, subject, unitName, unitCode, hours, courseType) {
            try {
                const coverTitleEl = document.querySelector('.cover-title');
                if (currentEvalMode === '재평가') {
                    coverTitleEl.innerHTML = `능력단위별 내부평가서<br><span style="font-size: 24px; letter-spacing: 2px;">(재평가)</span>`;
                } else if (currentEvalMode === '추가평가') {
                    coverTitleEl.innerHTML = `능력단위별 내부평가서<br><span style="font-size: 24px; letter-spacing: 2px;">(추가평가)</span>`;
                } else {
                    coverTitleEl.innerHTML = `능력단위별 내부평가서`;
                }
                document.getElementById('cover_courseName').innerText = document.getElementById('S0_CourseName').value;
                document.getElementById('cover_period').innerText = "(" + document.getElementById('S0_Period').value + ")";
                document.getElementById('cover_teacher').innerText = document.getElementById('S0_Teacher').value;
                
                let typeStr = courseType || "NCS 전공교과";
                if (typeStr.includes('NCS') && !typeStr.includes('비')) typeStr = "NCS 전공교과";
                else if (typeStr.includes('소양')) typeStr = "소양교과";
                else typeStr = "비NCS 전공교과";
                document.getElementById('cover_courseType').innerText = typeStr;

                const tbody = document.getElementById('cover_tbody');
                
                let elements = [];
                if (stdData && stdData.elements && stdData.elements.length > 0) {
                    // 1순위: NCS 공식 DB 데이터가 있으면 가져옴
                    elements = stdData.elements.filter(el => el !== null && el !== undefined);
                } else {
                    // 💡 2순위 (비상 엔진): DB에 없다면, 현재 화면(4. 평가 항목)에 이미 로드된 요소를 직접 긁어옴
                    document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach(tr => {
                        let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                        name = name.replace(/^\d+\.\s*/, '').trim(); // 앞의 번호(예: 1. ) 제거
                        if (name) elements.push({ name: name }); // 표지에 출력할 수 있도록 배열에 규격화하여 삽입
                    });
                }

                const rowspan = elements.length > 0 ? elements.length : 1;
                let html = "";
                
                const isSubjectMode = document.getElementById('viewModeBadge').innerText.includes("교과목");
                const cleanSubject = isSubjectMode ? subject : subject.replace(/\([0-9]+수준\)/g, '').trim();

                if (elements.length > 0) {
                    elements.forEach((el, index) => {
                        let elementCode = unitCode ? `${unitCode}.${index + 1}` : "-";
                        html += `<tr>`;
                        if (index === 0) html += `<td rowspan="${rowspan}"><b>${cleanSubject}</b><br><br>${unitName || cleanSubject}</td>`;
                        html += `<td>${elementCode}</td><td>${el.name || "이름 없음"}</td>`;
                        if (index === 0) html += `<td rowspan="${rowspan}">${hours}</td>`;
                        html += `</tr>`;
                    });
                } else {
                    html = `<tr><td><b>${cleanSubject}</b><br><br>${unitName || cleanSubject}</td><td>${unitCode || "-"}</td><td>(능력단위요소 없음)</td><td>${hours}</td></tr>`;
                }
                tbody.innerHTML = html;
            } catch (error) { console.error("표지 렌더링 중 오류 발생:", error); }
        }

        function changeEvalType(btn, value) {
            const group = btn.closest('.toggle-group');
            group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            group.setAttribute('data-value', value);
        }

        async function buildEvaluationDocs() {
            const subject = document.getElementById('S1_1').value || "";
            const unitCode = document.getElementById('S1_Code').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const evalMethod = document.getElementById('S2_1').value || "";
            const evalTestTime = document.getElementById('S2_3').value || ""; 
            const dateMain = document.getElementById('S3_1').value || "";
            const dateAdd = document.getElementById('S3_2').value || "";
            const dateRe = document.getElementById('S3_3').value || "";

            if (!subject) {
                document.getElementById('exam_header_container').innerHTML = "<p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p>";
                document.getElementById('photo_header_container').innerHTML = "";
                document.getElementById('photo_grid_container').innerHTML = "";
                return;
            }

            if (!currentDbKey) {
                currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');
            }

            const items = [];
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach(tr => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                let questionText = ""; let coreTaskText = "";
                const qRow = tr.nextElementSibling;
                if (qRow && qRow.classList.contains('eval-question-row')) {
                    const qInput = qRow.querySelector('.eval-question-input'); if(qInput) questionText = qInput.value;
                    const cInput = qRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                }
                items.push({ name, question: questionText, coreTask: coreTaskText });
            });

            let photoData = {};
            if (currentDbKey) {
                const snap = await database.ref(`${currentClass}/evalPhotos/${currentEvalMode}/${currentDbKey}`).once('value');
                photoData = snap.val() || {};
            }

            const dotDate = (d) => d ? d.replace(/-/g, '.') : "";

            let dateRows = [];
            dateRows.push({ label: '본평가', value: dotDate(dateMain) || '-' });
            if (currentEvalMode === '본평가') {
                dateRows.push({ label: '재평가', value: '-' });
            } else if (currentEvalMode === '추가평가') {
                let extraDates = [];
                // 💡 추가평가 모드: 추가평가 항목을 무조건 기본 장착
                extraDates.push({ label: '추가평가', value: dateAdd ? dotDate(dateAdd) : '-', raw: dateAdd || "9999-99-99" });
                if (dateRe && dateRe.trim() !== "") extraDates.push({ label: '재평가', value: dotDate(dateRe), raw: dateRe });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            } else if (currentEvalMode === '재평가') {
                let extraDates = [];
                if (dateAdd && dateAdd.trim() !== "") extraDates.push({ label: '추가평가', value: dotDate(dateAdd), raw: dateAdd });
                // 💡 재평가 모드: 재평가 항목을 무조건 기본 장착
                extraDates.push({ label: '재평가', value: dateRe ? dotDate(dateRe) : '-', raw: dateRe || "9999-99-99" });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            }
            const rowspan = dateRows.length;
            const baseHeight = rowspan === 3 ? "24px" : "26px"; 
            const totalHeight = rowspan === 3 ? "72px" : "52px"; 
            let unitDisplay = (unitCode && !unitCode.includes("없음")) ? `${unitCode} ${unitName || subject}` : (unitName || subject);

            let dateRowsHtml = `
                <tr style="height: ${baseHeight};">
                    <td class="doc-cyan-bg" rowspan="${rowspan}">평가방법</td><td rowspan="${rowspan}">${evalMethod}</td>
                    <td class="doc-cyan-bg" rowspan="${rowspan}">평가시간</td><td rowspan="${rowspan}">${evalTestTime} 분</td>
                    <td class="doc-cyan-bg" style="width:12%">${dateRows[0].label}</td><td style="width:15%">${dateRows[0].value}</td>
                </tr>`;
            for(let i = 1; i < dateRows.length; i++) { dateRowsHtml += `<tr style="height: ${baseHeight};"><td class="doc-cyan-bg">${dateRows[i].label}</td><td>${dateRows[i].value}</td></tr>`; }

            // 💡 [정밀 엔진] 현재 평가 모드를 감지하여 타이틀 앞에 장착하는 변수 추가
            const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";

            const makeHeaderHtml = (isTrainee) => `
                <table class="doc-cyan-table">
                    <tr><td colspan="6" class="doc-cyan-bg" style="font-size: 22px; padding: 12px; letter-spacing: 2px;">
                        ${isTrainee ? `${evalModePrefix}내부 평가 시험문제 <span style="color:#bdc3c7; font-size:22px;">(훈련생용)</span>` : `${evalModePrefix}내부 평가 근거 사진`}
                    </td></tr>
                    <tr style="height: ${totalHeight};">
                        <td class="doc-cyan-bg" style="width:12%">교 과 목</td><td style="width:21%">${subject}</td>
                        <td class="doc-cyan-bg" style="width:12%">능력단위</td><td colspan="3">${unitDisplay}</td>
                    </tr>
                    ${dateRowsHtml}
                </table>
            `;

            document.getElementById('exam_header_container').innerHTML = makeHeaderHtml(true);
            let questionsHtml = "";
            items.forEach((item, index) => {
                questionsHtml += `<div style="margin-bottom: 25px;"><div style="font-weight: bold; font-size: 15px; margin-bottom: 8px;">[제${index+1} 평가항목] ${item.name}</div><div style="font-size: 14.5px; line-height: 1.6; word-break: keep-all; display: flex;"><span style="margin-right: 6px;">○</span><span style="white-space: pre-wrap;">${item.question || '문제가 입력되지 않았습니다.'}</span></div></div>`;
            });
            document.getElementById('exam_questions_container').innerHTML = questionsHtml || "<p>평가 항목이 없습니다.</p>";

            document.getElementById('photo_header_container').innerHTML = makeHeaderHtml(false);
            let photoGridHtml = `<table class="photo-grid-table">`;
            for(let i=0; i<items.length; i+=2) {
                let item1 = items[i].coreTask || items[i].name;
                let item2 = items[i+1] ? (items[i+1].coreTask || items[i+1].name) : null;
                
                let img1 = photoData[`img_${i}`] ? photoData[`img_${i}`].imageData : '';
                let img2 = photoData[`img_${i+1}`] ? photoData[`img_${i+1}`].imageData : '';

                let uploadBtn1 = `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${i}').click()">사진 등록</button><input type="file" id="file_eval_${i}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${i}, this)">`;
                let uploadBtn2 = item2 ? `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${i+1}').click()">사진 등록</button><input type="file" id="file_eval_${i+1}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${i+1}, this)">` : '';

                let action1 = img1 ? `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${i})">삭제</button>` : uploadBtn1;
                let action2 = img2 ? `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${i+1})">삭제</button>` : uploadBtn2;

                // 💡 [핵심 부품 교체] item2가 없을 경우(짝이 안 맞는 완전한 빈 칸)에만 연한 회색 배경(#f0f0f0) 적용
                let emptySlotStyle = !item2 ? "background-color: #f0f0f0 !important;" : "";

                photoGridHtml += `
                    <tr><td class="photo-header">${item1}</td><td class="photo-header">${item2 ? item2 : ''}</td></tr>
                    <tr>
                        <td class="photo-box" style="vertical-align: middle; padding:10px;">
                            <img id="preview_eval_${i}" src="${img1}" style="max-width:100%; max-height:220px; object-fit:contain; ${img1 ? '' : 'display:none;'}">
                            <div id="btn_wrap_${i}">${action1}</div>
                        </td>
                        <td class="photo-box" style="vertical-align: middle; padding:10px; ${emptySlotStyle}">
                            ${item2 ? `<img id="preview_eval_${i+1}" src="${img2}" style="max-width:100%; max-height:220px; object-fit:contain; ${img2 ? '' : 'display:none;'}">` : ''}
                            ${item2 ? `<div id="btn_wrap_${i+1}">${action2}</div>` : ''}
                        </td>
                    </tr>
                `;
            }
            photoGridHtml += `</table>`;
            document.getElementById('photo_grid_container').innerHTML = photoGridHtml || "<p>평가 항목이 없습니다.</p>";
        }

        function processEvalImage(input, callback) {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

                const runOriginalEngine = (targetFile) => {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const img = new Image();
                        img.onload = function () {
                            const canvas = document.createElement('canvas');
                            let width = img.width, height = img.height;
                            const max_size = 1200; 
                            if (width > height) { if (width > max_size) { height *= max_size / width; width = max_size; } } 
                            else { if (height > max_size) { width *= max_size / height; height = max_size; } }
                            canvas.width = width; canvas.height = height;
                            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                            callback(canvas.toDataURL('image/jpeg', 0.8)); 
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(targetFile);
                };

                if (isHeic) {
                    if (typeof heic2any === 'undefined') return alert("HEIC 변환 엔진이 로드되지 않았습니다. 인터넷 연결을 확인해주세요.");
                    heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 })
                        .then(convertedBlob => runOriginalEngine(convertedBlob))
                        .catch(error => alert("HEIC 변환 오류: " + error.message));
                } else {
                    runOriginalEngine(file);
                }
            }
        }

        async function uploadEvalPhoto(index, input) {
            if (!input.files || !input.files[0]) return;
            if (!currentDbKey) return alert("❌ 좌측에서 평가 대상을 먼저 선택해 주세요.");

            const btnWrap = document.getElementById(`btn_wrap_${index}`);
            const originalHtml = btnWrap.innerHTML;
            btnWrap.innerHTML = `<span class="no-print" style="color:#2980b9; font-size:12px; font-weight:bold;">업로드 중 ⏳</span>`;

            processEvalImage(input, async (base64Data) => {
                try {
                    await database.ref(`${currentClass}/evalPhotos/${currentEvalMode}/${currentDbKey}/img_${index}`).set({
                        imageData: base64Data, timestamp: new Date().getTime()
                    });
                    const imgEl = document.getElementById(`preview_eval_${index}`);
                    imgEl.src = base64Data; imgEl.style.display = 'inline-block';
                    
                    btnWrap.innerHTML = `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${index})">삭제</button>`;
                } catch (e) {
                    alert("❌ 업로드 실패: " + e.message);
                    btnWrap.innerHTML = originalHtml;
                }
            });
        }

        async function deleteEvalPhoto(index) {
            if(!confirm("해당 사진을 삭제하시겠습니까?")) return;
            try {
                await database.ref(`${currentClass}/evalPhotos/${currentEvalMode}/${currentDbKey}/img_${index}`).remove();
                
                const imgEl = document.getElementById(`preview_eval_${index}`);
                imgEl.src = ""; imgEl.style.display = 'none';
                
                document.getElementById(`btn_wrap_${index}`).innerHTML = `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${index}').click()">사진 등록</button><input type="file" id="file_eval_${index}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${index}, this)">`;
            } catch(e) {
                alert("❌ 삭제 실패: " + e.message);
            }
        }

        let pendingUploadData = null; 

        function openPwModal(subject, unitCode) {
            const pwModal = document.getElementById('pwModal');
            const pwInput = document.getElementById('commonPwInput');
            
            document.getElementById('pwSubjectInfo').innerHTML = `[${subject}]<br><span style="font-size:11px; color:#555;">${unitCode}</span>`;
            pwInput.value = "";
            pwModal.style.display = 'flex';
            pwInput.focus();

            pwInput.oninput = function() {
                if (this.value.length === 6) { 
                    if (this.value === adminPw) { 
                        document.getElementById('pwModal').style.display = 'none';
                        executeUploadCommonEval(); 
                    } else {
                        alert("❌ 비밀번호가 틀렸습니다.");
                        this.value = "";
                        this.focus();
                    }
                }
            };
        }

        function closePwModal() {
            document.getElementById('pwModal').style.display = 'none';
            pendingUploadData = null;
        }

        async function uploadCommonEval() {
            const rawSubject = document.getElementById('S1_1').value.trim();
            const unitName = document.getElementById('S1_2').value.trim();
            const unitCode = document.getElementById('S1_Code').value.trim();
            const targetSubject = (unitName && unitName !== "") ? unitName : rawSubject;

            if (!targetSubject || !unitCode || unitCode.includes("없음")) {
                return alert("⚠️ 과목이 선택되지 않았거나 화면에 올바른 단위코드가 표시되지 않았습니다.\n(공용 클라우드는 NCS 코드가 있어야만 공유할 수 있습니다.)");
            }

            const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
            if (rows.length === 0) return alert("⚠️ 올릴 평가 항목 데이터가 없습니다.");

            const evalItems = [];
            rows.forEach(tr => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                const inputs = tr.querySelectorAll('input[type="number"]');
                const score = inputs[0] ? Number(inputs[0].value) : 0;
                const selects = tr.querySelectorAll('select');
                const diff = selects[0] ? selects[0].value : "";
                
                let questionText = ""; let coreTaskText = "";
                const qRow = tr.nextElementSibling;
                if (qRow && qRow.classList.contains('eval-question-row')) {
                    const qInput = qRow.querySelector('.eval-question-input'); if(qInput) questionText = qInput.value;
                    const cInput = qRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                }
                evalItems.push({ name, type, score, diff, question: questionText, coreTask: coreTaskText });
            });

            const dbKey = currentDbKey; // 공용 업로드 시에도 경로 엇갈림 방지
            pendingUploadData = { targetSubject, unitCode, evalItems, dbKey };
            openPwModal(targetSubject, unitCode);
        }

        async function executeUploadCommonEval() {
            if (!pendingUploadData) return;
            const { targetSubject, unitCode, evalItems, dbKey } = pendingUploadData;
            
            if (!confirm(`☁️ [${targetSubject}] (코드: ${unitCode})\n\n해당 과목의 평가지를 마스터 공용 데이터베이스에 업로드하시겠습니까?\n(기존에 동일한 과목/코드로 올라간 데이터가 있다면 최신 내용으로 덮어씌워집니다.)`)) {
                pendingUploadData = null; 
                return;
            }

            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${dbKey}`).once('value');
                const existingData = snap.val() || {};
                evalItems.forEach((item, i) => {
                    if (existingData && existingData.items && existingData.items[i]) {
                        if (existingData.items[i].customHtml) item.customHtml = existingData.items[i].customHtml;
                        if (existingData.items[i].ansHtml) item.ansHtml = existingData.items[i].ansHtml;
                    }
                });
            } catch(e) { console.warn("커스텀 HTML 탑재 실패", e); }

            const commonKey = (targetSubject + "_" + unitCode).replace(/[\s\.\#\$\/\[\]]/g, '');
            
            try {
                await masterDatabase.ref(`commonEvaluations/${commonKey}`).set({
                    subject: targetSubject, unitCode: unitCode, items: evalItems, timestamp: new Date().getTime()
                });
                alert(`✅ [${targetSubject}] 과목 (${unitCode})\n평가지가 마스터 공용 데이터베이스에 성공적으로 등록되었습니다!`);
                
                fetchMasterData(); 
            } catch(e) {
                alert("❌ 등록 실패: " + e.message);
            } finally {
                pendingUploadData = null; 
            }
        }

        async function downloadCommonEval() {
            const rawSubject = document.getElementById('S1_1').value.trim();
            const unitName = document.getElementById('S1_2').value.trim();
            const unitCode = document.getElementById('S1_Code').value.trim();
            const targetSubject = (unitName && unitName !== "") ? unitName : rawSubject;

            if (!targetSubject || !unitCode || unitCode.includes("없음")) {
                return alert("⚠️ 좌측에서 과목을 먼저 선택해 주세요. (단위코드가 화면에 떠 있어야 가능)");
            }

            const commonKey = (targetSubject + "_" + unitCode).replace(/[\s\.\#\$\/\[\]]/g, '');
            
            const snap = await masterDatabase.ref(`commonEvaluations/${commonKey}`).once('value');
            const data = snap.val();

            if (!data || !data.items) {
                return alert(`⚠️ 마스터 공용 데이터베이스에 [${targetSubject}] 과목 (${unitCode}) 의 평가지가 아직 없습니다.\n※ 과목명과 코드가 둘 다 완벽히 일치해야 불러올 수 있습니다.`);
            }

            window.downloadedCustomItems = data.items;

            if (!confirm(`📥 [${targetSubject}] (코드: ${unitCode})\n\n마스터 공용 평가지를 화면으로 불러오시겠습니까?\n현재 화면의 내용이 공용 데이터로 덮어씌워집니다.\n(가져온 후 반드시 [💾 저장]을 눌러야 내 반에 적용됩니다.)`)) return;

            let html = "";
            data.items.forEach(item => {
                html += `<tr class="eval-main-row">
                    <td class="item-name">${item.name}</td>
                    <td>
                        <div class="toggle-group type-selector" data-value="${item.type || '평가자 체크'}">
                            <button type="button" class="toggle-btn ${(!item.type || item.type==='평가자 체크') ? 'active' : ''}" onclick="changeEvalType(this, '평가자 체크')">교사</button>
                            <button type="button" class="toggle-btn ${item.type==='훈련생작성' ? 'active' : ''}" onclick="changeEvalType(this, '훈련생작성')">훈련생</button>
                        </div>
                    </td>
                    <td><input type="number" class="eval-input" placeholder="배점" value="${item.score || ''}"></td>
                    <td><select class="eval-input">
                            <option value="상" ${item.diff==='상' ? 'selected' : ''}>상</option>
                            <option value="중" ${item.diff==='중' ? 'selected' : ''}>중</option>
                            <option value="하" ${item.diff==='하' ? 'selected' : ''}>하</option>
                        </select></td>
                </tr>
                <tr class="eval-question-row">
                    <td colspan="3"><textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요.">${item.question || ''}</textarea></td>
                    <td colspan="1" style="vertical-align: top; padding-bottom: 12px;"><textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명">${item.coreTask || ''}</textarea></td>
                </tr>`;
            });
            document.getElementById('evalItemTbody').innerHTML = html;
            alert("✅ 마스터 공용 평가지를 화면에 성공적으로 불러왔습니다.\n수정할 부분이 있다면 수정 후 상단의 [💾 저장] 버튼을 눌러 확정해 주세요.");
        }

        async function deleteCommonEval() {
            const rawSubject = document.getElementById('S1_1').value.trim();
            const unitName = document.getElementById('S1_2').value.trim();
            const unitCode = document.getElementById('S1_Code').value.trim();
            const targetSubject = (unitName && unitName !== "") ? unitName : rawSubject;

            if (!targetSubject || !unitCode || unitCode.includes("없음")) {
                return alert("⚠️ 좌측에서 삭제할 공용 평가 대상 과목을 먼저 선택해 주세요.");
            }

            const expectedText = "전체반 삭제합니다";
            const userInput = prompt(`❗ [공용 클라우드 삭제 경고]\n마스터 데이터베이스에서 [${targetSubject}] 과목(${unitCode})의 공용 평가지를 영구 삭제합니다.\n삭제 후에는 다른 모든 반에서도 더 이상 이 평가지를 불러올 수 없게 됩니다.\n\n동의하신다면 "${expectedText}"라고 정확히 입력해 주세요.`);

            if (userInput === expectedText) {
                const commonKey = (targetSubject + "_" + unitCode).replace(/[\s\.\#\$\/\[\]]/g, '');
                try {
                    await masterDatabase.ref(`commonEvaluations/${commonKey}`).remove();
                    alert(`✅ [${targetSubject}] 과목이 마스터 공용 데이터베이스에서 완벽하게 소각되었습니다.`);
                    fetchMasterData(); // 좌측 리스트의 연두색 텍스트(공용 업로드 완료 표시)를 원래대로 되돌리기 위해 화면 갱신
                } catch(e) {
                    alert("❌ 삭제 실패: " + e.message);
                }
            } else if (userInput !== null) {
                alert("❌ 문구가 일치하지 않아 삭제 작업이 취소되었습니다.");
            }
        }

        async function changeIndividualNcs() {
            const indSelect = document.getElementById('individualNcsSelect');
            const indVersion = indSelect.value;
            const mainVersion = document.getElementById('ncsVersionSelect').value;
            
            if (indVersion !== "" && indVersion !== mainVersion) {
                indSelect.style.backgroundColor = "#ffeaa7"; 
                indSelect.style.borderColor = "#e67e22";
                indSelect.style.color = "#d35400";
            } else {
                indSelect.style.backgroundColor = ""; 
                indSelect.style.borderColor = "#ccc";
                indSelect.style.color = "";
            }

            const subject = document.getElementById('S1_1').value;
            const unitCode = document.getElementById('S1_Code').value;
            const unitName = document.getElementById('S1_2').value;
            
            if (!subject) {
                indSelect.value = ""; indSelect.style.backgroundColor = "";
                return alert("⚠️ 좌측에서 평가 대상 과목을 먼저 선택해주세요.");
            }

            if (indVersion === "") {
                const activeBtn = document.querySelector('.unit-btn.active');
                if (activeBtn) activeBtn.click();
                return;
            }

            const evalTbody = document.getElementById('evalItemTbody');
            evalTbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px; font-weight:bold;'>⏳ 관제탑에서 선택한 개별 버전의 훈련기준을 불러오는 중입니다...</td></tr>";

            let targetPath = indVersion === 'legacy' ? 'commonStandards' : `ncsVersions/${indVersion}/data`;
            let tempStandards = [];
            try {
                const parts = ['electronics', 'engine', 'chassis', 'ev'];
                const stdPromises = parts.map(p => masterDatabase.ref(`${targetPath}/${p}`).once('value'));
                const stdSnaps = await Promise.all(stdPromises);
                stdSnaps.forEach(snap => {
                    const result = snap.val();
                    if(result) {
                        const dataArray = Array.isArray(result.data) ? result.data : Object.values(result.data || result);
                        tempStandards.push(...dataArray);
                    }
                });

                let stdData = null;
                const cleanCode = unitCode.replace(/\s+/g, '');
                if (cleanCode && cleanCode !== "코드없음(DB미등록)") {
                    stdData = tempStandards.find(s => s.code && s.code.replace(/\s+/g, '') === cleanCode);
                }
                if (!stdData) {
                    const textFilter = /[\s·ㆍ\.\_]/g; 
                    const cleanName = (unitName || subject).replace(textFilter, '');
                    stdData = tempStandards.find(s => s.subjectName && s.subjectName.replace(textFilter, '') === cleanName);
                }

                if (stdData && stdData.code) { 
                    document.getElementById('S1_Code').value = stdData.code; 
                } else {
                    document.getElementById('S1_Code').value = "코드 없음 (DB 미등록)";
                }

                if (stdData && stdData.elements && stdData.elements.length > 0) {
                    let html = "";
                    stdData.elements.forEach((el, index) => {
                        if(!el) return;
                        html += `<tr class="eval-main-row">
                                <td class="item-name">${index + 1}. ${el.name}</td>
                                <td>
                                    <div class="toggle-group type-selector" data-value="평가자 체크">
                                        <button type="button" class="toggle-btn active" onclick="changeEvalType(this, '평가자 체크')">교사</button>
                                        <button type="button" class="toggle-btn" onclick="changeEvalType(this, '훈련생작성')">훈련생</button>
                                    </div>
                                </td>
                                <td><input type="number" class="eval-input" placeholder="배점 (예: 20)"></td>
                                <td><select class="eval-input"><option value="상">상</option><option value="중" selected>중</option><option value="하">하</option></select></td>
                            </tr>
                            <tr class="eval-question-row">
                                <td colspan="3"><textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요."></textarea></td>
                                <td colspan="1" style="vertical-align: top; padding-bottom: 12px;"><textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명"></textarea></td>
                            </tr>`;
                    });
                    evalTbody.innerHTML = html;
                } else {
                    evalTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#e74c3c; padding: 20px; font-weight:bold;">⚠️ 해당 개별 버전(${indVersion})에는 이 과목의 훈련기준(코드/요소)이 등록되어 있지 않습니다.</td></tr>`;
                }
                let activeBtn = document.querySelector('.unit-btn.active');
                let courseType = "NCS 전공교과";
                if (activeBtn) {
                    let typeSpan = activeBtn.querySelector('.unit-subject-label span');
                    if (typeSpan) courseType = typeSpan.innerText.replace(/[\[\]]/g, '');
                }
                let currentHours = document.getElementById('S2_2').value || 0;
                renderCoverPage(stdData, subject, unitName, document.getElementById('S1_Code').value, currentHours, courseType);
                // 👆👆 -------------------------------- 👆👆

            } catch(e) {
                evalTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#e74c3c; padding: 20px; font-weight:bold;">❌ 개별 훈련기준 로드 실패: ${e.message}</td></tr>`;
            }
        }

        
        // ---------------------------------------------------------
        // 📍 [신규 모터 4] 2. 평가지 (지능형 공간 분배 및 렌더링 엔진)
        // ---------------------------------------------------------
        window.tableUndoStacks = {}; 

        // 💡 [신규 추가 부품] 교사 평가항목 이름 추출 및 동적 행 제어 헬퍼
        window.extractTeacherRows = function(html) {
            if (!html) return ["장비·공구 선택 능력", "장비·공구 사용 숙련도", "작업순서에 맞는 분해 능력", "작업순서에 맞는 조립 능력", "마무리 확인 능력"];
            let temp = document.createElement('div');
            temp.innerHTML = html;
            let rows = temp.querySelectorAll('tr');
            let names = [];
            for (let i = 1; i < rows.length; i++) {
                let td = rows[i].querySelector('td');
                if (td) {
                    let clone = td.cloneNode(true);
                    let btn = clone.querySelector('button');
                    if (btn) btn.remove();
                    let text = clone.innerText.trim();
                    if (text) names.push(text);
                }
            }
            if (names.length === 0) return ["장비·공구 선택 능력", "장비·공구 사용 숙련도", "작업순서에 맞는 분해 능력", "작업순서에 맞는 조립 능력", "마무리 확인 능력"];
            return names;
        };

        window.addTeacherRow = function(tId) {
            let table = document.getElementById(tId);
            if(!table) return;
            let tbody = table.querySelector('tbody') || table;
            let rowCount = tbody.querySelectorAll('tr').length - 1; 
            let tr = document.createElement('tr');
            let tClass = table.querySelector('td') ? table.querySelector('td').className : '';
            tr.innerHTML = `<td class="${tClass}" style="position:relative;" contenteditable="true" onblur="markChanged('${tId}')">새 평가 항목 <button class="no-print btn-custom" style="position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:2px 4px; font-size:10px; background:#e74c3c; border:none; color:white;" onclick="deleteTeacherRow(this, '${tId}')">삭제</button></td><td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td>`;
            
            let firstRow = tbody.querySelectorAll('tr')[1];
            if (firstRow) {
                let scoreTd = firstRow.querySelector('td:last-child');
                if (scoreTd) scoreTd.rowSpan = rowCount + 1;
            }
            tbody.appendChild(tr);
            markChanged(tId);
        };

        window.deleteTeacherRow = function(btn, tId) {
            let tr = btn.closest('tr');
            let table = document.getElementById(tId);
            let isFirstRow = (table.querySelectorAll('tr')[1] === tr);
            
            if (isFirstRow) {
                let nextRow = tr.nextElementSibling;
                let scoreTd = tr.querySelector('td:last-child');
                if (nextRow && scoreTd) { nextRow.appendChild(scoreTd); } 
                else if (!nextRow) { return alert("⚠️ 최소 1개의 항목은 유지해야 합니다."); }
            }
            tr.remove();
            
            let firstRow = table.querySelectorAll('tr')[1];
            if (firstRow) {
                let scoreTd = firstRow.querySelector('td:last-child');
                if (scoreTd) scoreTd.rowSpan = table.querySelectorAll('tr').length - 1;
            }
            markChanged(tId);
        };

        async function buildEvaluationPaper() {
            const subject = document.getElementById('S1_1').value || "";
            const unitCode = document.getElementById('S1_Code').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const evalMethod = document.getElementById('S2_1').value || "";
            const evalTestTime = document.getElementById('S2_3').value || ""; 
            const dateMain = document.getElementById('S3_1').value || "";
            const dateAdd = document.getElementById('S3_2').value || ""; 
            const dateRe = document.getElementById('S3_3').value || "";
            const teacher = document.getElementById('S0_Teacher').value || "";
            const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";

            if (!subject) {
                document.getElementById('page2').innerHTML = "<div class='a4-page'><p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p></div>";
                return;
            }

            if (!currentDbKey) currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            let savedItems = [];
            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
            } catch (e) { console.error("DB 로드 에러:", e); }

            const items = [];
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach(tr => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                const score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                
                let coreTaskText = "";
                const qRow = tr.nextElementSibling;
                if (qRow && qRow.classList.contains('eval-question-row')) {
                    coreTaskText = qRow.querySelector('.eval-core-task-input')?.value || "";
                }
                items.push({ name, type, score, coreTask: coreTaskText });
            });

            const formatScore = (num) => {
                const rounded = Math.round(num * 10) / 10;
                return Number.isInteger(rounded) ? rounded : rounded.toFixed(1);
            };
            const dotDate = (d) => d ? d.replace(/-/g, '.') : "";

            let dateRows = [];
            dateRows.push({ label: '본평가', value: dotDate(dateMain) || '-' });
            if (currentEvalMode === '본평가') {
                dateRows.push({ label: '재평가', value: '-' });
            } else if (currentEvalMode === '추가평가') {
                let extraDates = [];
                extraDates.push({ label: '추가평가', value: dateAdd ? dotDate(dateAdd) : '-', raw: dateAdd || "9999-99-99" });
                if (dateRe && dateRe.trim() !== "") extraDates.push({ label: '재평가', value: dotDate(dateRe), raw: dateRe });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            } else if (currentEvalMode === '재평가') {
                let extraDates = [];
                if (dateAdd && dateAdd.trim() !== "") extraDates.push({ label: '추가평가', value: dotDate(dateAdd), raw: dateAdd });
                extraDates.push({ label: '재평가', value: dateRe ? dotDate(dateRe) : '-', raw: dateRe || "9999-99-99" });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            }
            let rs = dateRows.length === 3 ? 2 : 3; // 💡 3줄이면 2칸 병합, 2줄이면 3칸 병합하여 6줄 유지

            let unitDisplay = (unitCode && !unitCode.includes("없음")) ? `${unitCode} ${unitName || subject}` : (unitName || subject);

const makeTopTable = (pageType) => {
    if (pageType === '뒷면') {
        return `<table class="ep-top-table" style="margin-bottom: 20px;"><tr><th class="ep-cyan-bg" style="font-size: 24px; font-weight: 900; padding: 12px 0; letter-spacing: 2px;">${evalModePrefix}내부평가 근거자료 <span style="color: #7f8c8d; font-size: 20px;">(${pageType})</span></th></tr></table>`;
    }
    return `
    <table class="ep-top-table" style="margin-bottom: 30px;">
        <tr><th colspan="7" class="ep-cyan-bg" style="font-size: 24px; font-weight: 900; padding: 12px 0; letter-spacing: 2px;">${evalModePrefix}내부평가 근거자료 <span style="color: #7f8c8d; font-size: 20px;">(${pageType})</span></th></tr>
        <tr style="height: 30px;"><th class="ep-cyan-bg" style="width:12%">교 과 목</th><td colspan="4">${subject}</td><th class="ep-cyan-bg" style="width:12%">평가방법</th><td style="width:15%">${evalMethod}</td></tr>
        <tr style="height: 30px;"><th class="ep-cyan-bg">능력단위</th><td colspan="4" style="line-height:1.4; padding:4px;">${unitDisplay}</td><th class="ep-cyan-bg">평가시간</th><td>${evalTestTime} 분</td></tr>
                    <tr style="height: 18px;"><th class="ep-cyan-bg" rowspan="6">평 가 일</th><th rowspan="${rs}" style="width:12%">${dateRows[0].label}</th><td rowspan="${rs}" style="width:15%">${dateRows[0].value}</td><th class="ep-cyan-bg" rowspan="3" style="width:12%">총 점</th><td rowspan="3" style="width:12%">100점</td><th class="ep-cyan-bg" rowspan="2" style="width:12%">최종점수</th><td rowspan="2" style="width:25%"></td></tr>
                    <tr style="height: 18px;"></tr>
                    <tr style="height: 18px;">${rs===2 ? `<th rowspan="2">${dateRows[1].label}</th><td rowspan="2">${dateRows[1].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="2">담당교사</th><td rowspan="2" style="position:relative;">${teacher} <span style="position:relative; display:inline-block;">(인)${globalTeacherSeal ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:35px; height:35px; background-image:url('${globalTeacherSeal}'); background-size:contain; background-repeat:no-repeat; background-position:center; opacity:0.85; pointer-events:none;"></div>` : ''}</span></td></tr>
                    <tr style="height: 18px;">${rs===3 ? `<th rowspan="3">${dateRows[1].label}</th><td rowspan="3">${dateRows[1].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="3">훈련생명</th><td rowspan="3"></td></tr>
                    <tr style="height: 18px;">${rs===2 ? `<th rowspan="2">${dateRows[2].label}</th><td rowspan="2">${dateRows[2].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="2">검증자</th><td rowspan="2" style="position:relative;">하정현 <span style="position:relative; display:inline-block;">(인)${globalVerifierSeal ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:35px; height:35px; background-image:url('${globalVerifierSeal}'); background-size:contain; background-repeat:no-repeat; background-position:center; opacity:0.85; pointer-events:none;"></div>` : ''}</span></td></tr>
                    <tr style="height: 18px;"></tr>
                </table>`;
            };

            let frontLimit = 2; 
            if (items.length === 3 || items.length === 4) frontLimit = 2; 
            else if (items.length === 5) frontLimit = 3; 
            else if (items.length >= 6) frontLimit = 4; 

            const isOverload = items.length >= 5; 
            const tClass = isOverload ? 'compact-td' : ''; 
            const gapSize = isOverload ? '10px' : '20px'; 
            const traineeHeight = isOverload ? '40px' : '65px'; 

            let frontHtml = `
                <style>
                    .compact-td { height: 22px !important; padding: 4px !important; }
                    .editable-cell { box-sizing: border-box; cursor: pointer; transition: 0.2s; padding: 6px; }
                    .editable-cell:hover { background-color: #fffde7; }
                </style>
                <div class="a4-page"><div class="no-print page-indicator">[2.평가지] - 앞면</div>${makeTopTable('앞면')}<div class="ep-section-title">1. 지식 · 기술 평가</div>
            `;
            let backHtml = `<div class="a4-page"><div class="no-print page-indicator">[2.평가지] - 뒷면</div>${makeTopTable('뒷면')}`;

            let itemIndex = 1;

            items.forEach((item, idx) => {
                let tableHtml = "";
                let tId = `custom_table_${idx}`; 

                let customHtml = "";
                if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) {
                    customHtml = window.downloadedCustomItems[idx].customHtml;
                } else if (savedItems[idx] && savedItems[idx].customHtml) {
                    customHtml = savedItems[idx].customHtml;
                }

                if (item.type === '훈련생작성') {
                    window.tableUndoStacks[tId] = []; 
                    
                    let defaultTable = `
                        <table id="${tId}" class="ep-table trainee-table-target" style="margin-bottom: 5px; table-layout: fixed; width: 100%; word-break: break-all;">
                            <tr>
                                <th rowspan="2" class="editable-cell" style="width:15%">항 목</th>
                                <th colspan="2" class="editable-cell" style="width:40%">항 목 1</th>
                                <th colspan="2" class="editable-cell" style="width:35%">항 목 2</th>
                                <th rowspan="2" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(${item.score}점)</span></th>
                            </tr>
                            <tr>
                                <th class="editable-cell">① 이상 부위</th>
                                <th class="editable-cell">② 내용 및 상태</th>
                                <th class="editable-cell">③ 판 정</th>
                                <th class="editable-cell">④ 정비 및 조치사항</th>
                            </tr>
                            <tr style="height: ${traineeHeight};">
    <td class="editable-cell">${item.coreTask || item.name}</td>
    <td class="editable-cell"></td><td class="editable-cell"></td>
    <td class="editable-cell" style="line-height:1.6; text-align:center;">
                                    <span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">양호</span><br><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">불량</span>
                                </td><td class="editable-cell"></td><td></td>
</tr>
                        </table>
                    `;

                    let tableContent = customHtml ? customHtml.replace(/<span style="font-weight:normal;">\([0-9\.]+점\)<\/span>/g, `<span style="font-weight:normal;">(${item.score}점)</span>`) : defaultTable;
                    let hasCustom = !!customHtml; 

                    tableHtml = `
                        <div class="ep-item-header" style="justify-content: flex-start; gap: 8px;">
                            <span>[제${itemIndex} 평가항목] ${item.name}(기록표)</span> 
                            <span class="ep-item-subtitle" style="color:#2980b9;">➥ 훈련생이 작성합니다.</span>
                        </div>
                        <div id="wrapper_${tId}">${tableContent}</div>
                        <div class="no-print" style="display:flex; gap:4px; margin-bottom:${gapSize}; align-items:center; background:#ecf0f1; padding:6px; border-radius:6px; border:1px solid #bdc3c7;">
                            <span style="font-size:11px; color:#7f8c8d; font-weight:bold; margin-right:2px;">커스텀:</span>
                            <button class="btn-custom" style="padding:4px 6px; font-size:11px;" onclick="undoTable('${tId}')" id="undo_${tId}" disabled>↩️ 이전</button>
                            <button class="btn-custom" style="padding:4px 6px; font-size:11px;" onclick="addRowInside('${tId}')">➕ 행(상하)</button>
                            <button class="btn-custom" style="padding:4px 6px; font-size:11px;" onclick="addColInside('${tId}')">➕ 열(좌우)</button>
                            <button class="btn-custom" style="padding:4px 6px; font-size:11px; background:#8e44ad;" onclick="mergeCellInside('${tId}')">➖ 병합</button>
                            
                            <button class="btn-custom" onclick="saveCustomTable(${idx}, '${tId}')" id="save_${tId}" style="padding:4px 10px; font-size:11px; background:#27ae60; border-color:#2ecc71; cursor:pointer; margin-left:4px;">💾 저장</button>
                            
                            <button class="btn-custom" onclick="resetCustomTable(${idx})" style="padding:4px 6px; font-size:11px; background:#e74c3c; border:1px solid #c0392b; ${hasCustom ? '' : 'display:none;'}">🔄 순정</button>
                            <button class="btn-custom" onclick="editCellText('${tId}')" id="edit_${tId}" style="display:none; padding:4px 6px; font-size:11px; background:#f39c12; color:white; margin-left:auto;">📜 텍스트 수정</button>
                        </div>
                    `;
                } else {
                    let customHtml = "";
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) {
                        customHtml = window.downloadedCustomItems[idx].customHtml;
                    } else if (savedItems[idx] && savedItems[idx].customHtml) {
                        customHtml = savedItems[idx].customHtml;
                    }
                    
                    let rowNames = extractTeacherRows(customHtml);
                    let N = rowNames.length;
                    let rS = item.score / N;
                    let v1 = formatScore(rS); 
                    let v2 = Math.round(rS * 0.8);
                    let v3 = Math.round(rS * 0.6);
                    let v4 = Math.round(rS * 0.4);
                    let v5 = Math.round(rS * 0.2);

                    let rowsHtml = "";
                    rowNames.forEach((rName, rIdx) => {
                        rowsHtml += `<tr>
                            <td class="${tClass}" style="position:relative;" contenteditable="true" onblur="markChanged('teacher_table_${idx}')">${rName} <button class="no-print btn-custom" style="position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:2px 4px; font-size:10px; background:#e74c3c; border:none; color:white;" onclick="deleteTeacherRow(this, 'teacher_table_${idx}')">삭제</button></td>
                            <td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td><td class="${tClass}"></td>
                            ${rIdx === 0 ? `<td class="${tClass}" rowspan="${N}"></td>` : ''}
                        </tr>`;
                    });

                    tableHtml = `
                        <div class="ep-item-header" style="justify-content: flex-start; gap: 8px;">
                            <span>[제${itemIndex} 평가항목] ${item.name}</span> 
                            <span class="ep-item-subtitle teacher" style="color:#c0392b;">➥ 평가자가 해당 항목에 "V"합니다.</span>
                        </div>
                        <div id="wrapper_teacher_table_${idx}">
                            <table class="ep-table" id="teacher_table_${idx}">
                                <tr>
                                    <th class="${tClass}" style="width:30%">항 목</th>
                                    <th class="${tClass}" style="width:12%">매우우수<br>(${v1}점)</th><th class="${tClass}" style="width:12%">우수<br>(${v2}점)</th>
                                    <th class="${tClass}" style="width:12%">보통<br>(${v3}점)</th><th class="${tClass}" style="width:12%">미흡<br>(${v4}점)</th>
                                    <th class="${tClass}" style="width:12%">매우미흡<br>(${v5}점)</th>
                                    <th class="${tClass}" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(${item.score}점)</span></th>
                                </tr>
                                ${rowsHtml}
                            </table>
                        </div>
                        <div class="no-print" style="display:flex; gap:4px; margin-bottom:${gapSize}; align-items:center; background:#ecf0f1; padding:6px; border-radius:6px; border:1px solid #bdc3c7;">
                            <span style="font-size:11px; color:#7f8c8d; font-weight:bold; margin-right:2px;">항목 제어:</span>
                            <button class="btn-custom" style="padding:4px 6px; font-size:11px;" onclick="addTeacherRow('teacher_table_${idx}')">➕ 항목 추가</button>
                            <button class="btn-custom" onclick="saveCustomTable(${idx}, 'teacher_table_${idx}')" id="save_teacher_table_${idx}" style="padding:4px 10px; font-size:11px; background:#bdc3c7; border-color:#bdc3c7; cursor:default; margin-left:4px;" disabled>💾 변경사항 저장</button>
                            <button class="btn-custom" onclick="resetCustomTable(${idx})" style="padding:4px 6px; font-size:11px; background:#e74c3c; border:1px solid #c0392b; ${customHtml ? '' : 'display:none;'}">🔄 순정</button>
                        </div>
                    `;
                }

                if (idx < frontLimit) frontHtml += tableHtml;
                else backHtml += tableHtml;
                
                itemIndex++;
            });

            backHtml += `
                <div class="ep-section-title">2. 태도 평가</div>
                <div class="ep-item-header" style="justify-content: flex-start; gap: 8px;"><span>[제${itemIndex++} 평가항목] 태도 평가</span><span class="ep-item-subtitle teacher" style="color:#c0392b;">➥ 평가자가 해당 항목에 "V"합니다.</span></div>
                <table class="ep-table">
                    <tr><th class="compact-td" style="width:30%">항 목</th><th class="compact-td" style="width:12%">매우우수<br>(5점)</th><th class="compact-td" style="width:12%">우수<br>(4점)</th><th class="compact-td" style="width:12%">보통<br>(3점)</th><th class="compact-td" style="width:12%">미흡<br>(2점)</th><th class="compact-td" style="width:12%">매우미흡<br>(1점)</th><th class="compact-td" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(20점)</span></th></tr>
                    <tr><td class="compact-td">작업안전</td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td" rowspan="4"></td></tr>
                    <tr><td class="compact-td">작업방법</td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td></tr>
                    <tr><td class="compact-td">작업태도</td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td></tr>
                    <tr><td class="compact-td">정리정돈</td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td><td class="compact-td"></td></tr>
                </table>
                <div class="ep-section-title" style="margin-top:20px;">3. 시간 평가</div>
                <div class="ep-item-header" style="justify-content: flex-start; gap: 8px;"><span>[제${itemIndex++} 평가항목] 시간 평가</span><span class="ep-item-subtitle teacher" style="color:#c0392b;">➥ 평가자가 해당 항목에 "V"합니다.</span></div>
                <table class="ep-table" style="margin-bottom:0; table-layout: fixed; width: 100%;">
                    <tr>
                        <th class="compact-td" style="width:20%">항 목</th>
                        <th class="compact-td" style="width:20%">정상</th>
                        <th class="compact-td" style="width:20%">5분 초과<br>(-5점)</th>
                        <th class="compact-td" style="width:20%">6분 이상 10분 이내 초과<br>(-10점)</th>
                        <th class="compact-td" style="width:20%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(0점)</span></th>
                    </tr>
                    <tr>
                        <td class="compact-td" style="font-weight:bold;">작업시간</td>
                        <td class="compact-td"></td>
                        <td class="compact-td"></td>
                        <td class="compact-td"></td>
                        <td class="compact-td"></td>
                    </tr>
                </table>
            `;

            frontHtml += `<div class="cover-bottom"><div class="cover-page-num">- 5 -</div></div></div>`;
            backHtml += `<div class="cover-bottom"><div class="cover-page-num">- 6 -</div></div></div>`;

            document.getElementById('page2').innerHTML = frontHtml + backHtml;
        }

        window.saveCustomTable = async function(idx, tId) {
            if (!currentDbKey) return alert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");
            const html = document.getElementById(`wrapper_${tId}`).innerHTML;
            try {
                await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}`).update({ customHtml: html });
                alert("✅ 커스텀 표 양식이 안전하게 저장되었습니다!\n(공용 클라우드 올리기 시 자동으로 포함됩니다.)");
                buildEvaluationPaper(); 
            } catch(e) { alert("❌ 저장 실패: " + e.message); }
        };

        window.resetCustomTable = async function(idx) {
            if (!currentDbKey) return;
            if (!confirm("⚠️ 이 표를 처음 '순정 상태'로 되돌리시겠습니까?\n(지금까지 쪼개고 수정한 커스텀 내역이 모두 영구 삭제됩니다.)")) return;
            
            try {
                await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}/customHtml`).remove();
                alert("✅ 표가 최초 순정 상태로 복원되었습니다.");
                buildEvaluationPaper(); 
            } catch(e) {
                alert("❌ 복원 실패: " + e.message);
            }
        };

        // ---------------------------------------------------------
        // 📍 [신규 모터 5] 다중 셀 내부 분할(Split)/병합(Merge) 및 텍스트 수정 제어
        // ---------------------------------------------------------
        
        window.markChanged = function(tId) {
            let saveBtn = document.getElementById(`save_${tId}`);
            if(saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.background = '#27ae60';
                saveBtn.style.borderColor = '#2ecc71';
                saveBtn.style.cursor = 'pointer';
            }
        };

        document.addEventListener('click', function(e) {
    // 💡 3번 탭(채점기준) 화면이 열려있을 때는 표 분할/병합용 노란색 활성화 기능을 원천 차단
    if (document.getElementById('page3').classList.contains('active')) return;

    let cell = e.target.closest('.editable-cell');
    if (!cell) return;
    if (cell.isContentEditable) return; 
    
    let table = cell.closest('.trainee-table-target');
    if (!table) return;
            
            cell.classList.toggle('active-custom-cell');
            
            let tId = table.id;
            let activeCount = table.querySelectorAll('.active-custom-cell').length;
            let editBtn = document.getElementById(`edit_${tId}`);
            if (editBtn) {
                editBtn.style.display = (activeCount === 1) ? 'block' : 'none';
            }
        });

        window.saveTableState = function(tId) {
            if (!window.tableUndoStacks[tId]) window.tableUndoStacks[tId] = [];
            let currentHtml = document.getElementById(`wrapper_${tId}`).innerHTML;
            window.tableUndoStacks[tId].push(currentHtml);
            document.getElementById(`undo_${tId}`).disabled = false;
        };

        window.undoTable = function(tId) {
            if (!window.tableUndoStacks[tId] || window.tableUndoStacks[tId].length === 0) return;
            let lastHtml = window.tableUndoStacks[tId].pop();
            document.getElementById(`wrapper_${tId}`).innerHTML = lastHtml;
            
            if (window.tableUndoStacks[tId].length === 0) {
                document.getElementById(`undo_${tId}`).disabled = true;
            }
            document.getElementById(`edit_${tId}`).style.display = 'none';
            markChanged(tId); 
        };

        window.addRowInside = function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return alert("⚠️ 기준이 될 셀을 먼저 클릭하여 노란색으로 활성화해주세요.");
            
            saveTableState(tId);
            
            activeCells.forEach(cell => {
                let content = cell.innerHTML;
                cell.innerHTML = "";
                cell.classList.remove('editable-cell', 'active-custom-cell');
                cell.style.padding = "0"; 
                
                let container = document.createElement('div');
                container.style.display = 'flex';
                container.style.flexDirection = 'column'; 
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.minHeight = '35px';
                
                let cell1 = document.createElement('div');
                cell1.className = 'editable-cell active-custom-cell'; 
                cell1.style.flex = '1'; 
                cell1.style.borderBottom = '1px solid #000';
                cell1.style.display = 'flex';
                cell1.style.alignItems = 'center';
                cell1.style.justifyContent = 'center';
                cell1.style.fontSize = content.trim() ? "0.85em" : "inherit"; 
                cell1.innerHTML = content;
                
                let cell2 = document.createElement('div');
                cell2.className = 'editable-cell';
                cell2.style.flex = '1'; 
                cell2.style.display = 'flex';
                cell2.style.alignItems = 'center';
                cell2.style.justifyContent = 'center';
                
                container.appendChild(cell1);
                container.appendChild(cell2);
                cell.appendChild(container);
            });
            document.getElementById(`edit_${tId}`).style.display = (activeCells.length === 1) ? 'block' : 'none';
            markChanged(tId); 
        };

        window.addColInside = function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return alert("⚠️ 기준이 될 셀을 먼저 클릭하여 노란색으로 활성화해주세요.");
            
            saveTableState(tId);
            
            activeCells.forEach(cell => {
                let content = cell.innerHTML;
                cell.innerHTML = "";
                cell.classList.remove('editable-cell', 'active-custom-cell');
                cell.style.padding = "0"; 
                
                let container = document.createElement('div');
                container.style.display = 'flex';
                container.style.flexDirection = 'row'; 
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.minHeight = '35px';
                
                let cell1 = document.createElement('div');
                cell1.className = 'editable-cell active-custom-cell';
                cell1.style.flex = '1'; 
                cell1.style.borderRight = '1px solid #000';
                cell1.style.display = 'flex';
                cell1.style.alignItems = 'center';
                cell1.style.justifyContent = 'center';
                cell1.style.fontSize = content.trim() ? "0.85em" : "inherit"; 
                cell1.innerHTML = content;
                
                let cell2 = document.createElement('div');
                cell2.className = 'editable-cell';
                cell2.style.flex = '1'; 
                cell2.style.display = 'flex';
                cell2.style.alignItems = 'center';
                cell2.style.justifyContent = 'center';
                
                container.appendChild(cell1);
                container.appendChild(cell2);
                cell.appendChild(container);
            });
            document.getElementById(`edit_${tId}`).style.display = (activeCells.length === 1) ? 'block' : 'none';
            markChanged(tId); 
        };

        window.mergeCellInside = function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return alert("⚠️ 지울(병합할) 셀을 먼저 클릭해주세요.");
            
            let changed = false;
            saveTableState(tId);
            
            activeCells.forEach(cell => {
                if (cell.tagName.toUpperCase() === 'DIV') { 
                    let parent = cell.parentElement;
                    if (parent && parent.children.length > 1) {
                        cell.remove();
                        changed = true;
                    }
                } else {
                    alert("⚠️ 표 전체의 뼈대(원본 칸)는 파괴를 방지하기 위해 합칠 수 없습니다.\n[➕행/열] 버튼으로 쪼개진 칸들만 병합이 가능합니다.");
                }
            });
            
            if(changed) markChanged(tId);
        };

        window.editCellText = function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length !== 1) return;
            
            saveTableState(tId); 
            
            let cell = activeCells[0];
            cell.contentEditable = "true";
            cell.focus();
            
            cell.oninput = function() {
                markChanged(tId);
            };
            
            cell.onblur = function() {
                cell.contentEditable = "false";
                cell.classList.remove('active-custom-cell');
                document.getElementById(`edit_${tId}`).style.display = 'none';
                cell.onblur = null; 
                cell.oninput = null; 
            };
        };

        // ---------------------------------------------------------
        // 📍 [신규 모터 6] 3. 채점기준 및 모범답안 렌더링 엔진 (V5.1 특수공백 제거 및 표 찌그러짐 복구)
        // ---------------------------------------------------------
        async function buildAnswerDocs() {
            const subject = document.getElementById('S1_1').value || "";
            const unitCode = document.getElementById('S1_Code').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const courseName = document.getElementById('S0_CourseName').value || "";
            const period = document.getElementById('S0_Period').value || "";
            const evalMethod = document.getElementById('S2_1').value || "";

            if (!subject) {
                document.getElementById('page3').innerHTML = "<div class='a4-page'><p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p></div>";
                return;
            }

            if (!currentDbKey) currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            let savedItems = [];
            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
            } catch (e) {}

            const formatScore = (num) => Number.isInteger(num) ? num : num.toFixed(1);
            let answerPageNum = 1;

            const items = [];
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach(tr => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                const score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                
                let coreTaskText = "";
                const qRow = tr.nextElementSibling;
                if (qRow && qRow.classList.contains('eval-question-row')) {
                    coreTaskText = qRow.querySelector('.eval-core-task-input')?.value || "";
                }
                items.push({ name, type, score, coreTask: coreTaskText });
            });

            const topControlsHtml = `
                <div style="width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: flex-end;" class="no-print">
                    <button class="btn-save-settings" onclick="saveModelAnswers()" style="background:#c0392b; font-size:14px; padding:8px 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">💾 모범답안 일괄 저장</button>
                </div>
            `;

            let unitDisplay = (unitCode && !unitCode.includes("없음")) ? `${unitCode} ${unitName || subject}` : (unitName || subject);
const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";

const topTableHtml = `
    <table class="ans-table" style="margin-bottom: 25px; border: 2px solid #000; table-layout: auto;">
        <tr><th colspan="4" class="ans-cyan-bg" style="font-size: 20px; padding: 12px !important; border-bottom: 2px solid #000;">${evalModePrefix}내부평가 근거자료 모범답안 및 채점기준</th></tr>
        <tr><th class="ans-cyan-bg" style="width:15%">훈련과정</th><td style="width:35%">${courseName}</td><th class="ans-cyan-bg" style="width:15%">훈련기간</th><td style="width:35%">${period}</td></tr>
        <tr><th class="ans-cyan-bg">교 과 목</th><td>${subject}</td><th class="ans-cyan-bg">능력단위</th><td style="line-height:1.4;">${unitDisplay}</td></tr>
        <tr><th class="ans-cyan-bg">평가방법</th><td>${evalMethod}</td><th class="ans-cyan-bg">총 점</th><td>100점</td></tr>
    </table>
    <div class="ep-section-title" style="font-size: 16px; margin-bottom: 15px;">1. 지식·기술 평가</div>
`;

            let fullHtml = topControlsHtml + `<div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div>${topTableHtml}<div style="flex:1;">`;
            let pageWeight = 0;

            items.forEach((item, idx) => {
                // 💡 [교정 1] '(기록표)' 조건부 출력 로직 확정
               let suffix = item.type === '훈련생작성' ? '(기록표)' : '';
                let itemHtml = `<div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">[제${idx+1} 평가항목] ${item.name}${suffix}</div>`; // 여백 살짝 조정
                
                if (item.type === '훈련생작성') {
                    let ansTableHtml = "";
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].ansHtml) {
                        ansTableHtml = window.downloadedCustomItems[idx].ansHtml;
                    } else if (savedItems[idx] && savedItems[idx].ansHtml) {
                        ansTableHtml = savedItems[idx].ansHtml;
                    }
                    
                    if (!ansTableHtml) {
                        let base = (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) ? window.downloadedCustomItems[idx].customHtml : (savedItems[idx] && savedItems[idx].customHtml) ? savedItems[idx].customHtml : "";
                        
                        if (!base) {
                            base = `
                                <table class="ep-table trainee-table-target" style="margin-bottom: 0; table-layout: fixed; width: 100%; word-break: break-all; border: 2px solid #000;">
                                    <tr>
                                        <th rowspan="2" class="editable-cell" style="width:15%">항 목</th>
                                        <th colspan="2" class="editable-cell" style="width:40%">항 목 1</th>
                                        <th colspan="2" class="editable-cell" style="width:35%">항 목 2</th>
                                        <th rowspan="2" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(${item.score}점)</span></th>
                                    </tr>
                                    <tr>
                                        <th class="editable-cell">① 이상 부위</th>
                                        <th class="editable-cell">② 내용 및 상태</th>
                                        <th class="editable-cell">③ 판 정</th>
                                        <th class="editable-cell">④ 정비 및 조치사항</th>
                                    </tr>
                                    <tr style="height: 65px;">
                                        <td class="editable-cell">${item.coreTask || item.name}</td>
                                        <td class="editable-cell"></td><td class="editable-cell"></td>
                                        <td class="editable-cell" style="line-height:1.6; text-align:center !important;"><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">양호</span><br><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">불량</span></td><td class="editable-cell"></td><td></td>
                                    </tr>
                                </table>
                            `;
                        }
                        ansTableHtml = base;
                    }
                    
                    // 💡 [멸균 및 강제 정렬 엔진]
                    ansTableHtml = ansTableHtml.replace(/(<td[^>]*>)\s+/gi, '$1');
                    ansTableHtml = ansTableHtml.replace(/(<br>)\s+/gi, '$1');
                    ansTableHtml = ansTableHtml.replace(/\s+<\/td>/gi, '</td>');
                    ansTableHtml = ansTableHtml.replace(/text-align:\s*left;?/g, 'text-align: center;');
                    
                    // 💡 [신규 모터 1] 실시간 득점 연동 (0.설정값 강제 주입)
                    // 1) 상단 제목줄의 (XX점) 실시간 교체
                    ansTableHtml = ansTableHtml.replace(/<span style="font-weight:normal;">\([0-9\.]+점\)<\/span>/g, `<span style="font-weight:normal;">(${item.score}점)</span>`);
                    
                    // 2) 비어있는 원본 득점칸 채우기
                    ansTableHtml = ansTableHtml.replace(/<td( class="editable-cell")?>\s*<\/td>\s*<\/tr>/i, `<td style="color:#c0392b; font-weight:bold; font-size:14px; text-align:center; vertical-align:middle;">${item.score}</td></tr>`);
                    
                    // 3) 이미 저장된 빨간색 득점칸 업데이트 (다운로드 파일 덮어쓰기 방어)
                    ansTableHtml = ansTableHtml.replace(/<td[^>]*color:\s*#c0392b[^>]*>[0-9\.]+<\/td>\s*<\/tr>/gi, `<td style="color:#c0392b; font-weight:bold; font-size:14px; text-align:center; vertical-align:middle;">${item.score}</td></tr>`);
                    
                    // 💡 [신규 모터 2] 점수 오차 보정 엔진 (소수점 제거 및 '판정' 항목 잔여 점수 흡수)
                    let s1 = Math.round(item.score * 0.3); // ① 이상 부위
                    let s2 = Math.round(item.score * 0.3); // ② 내용 및 상태
                    let s4 = Math.round(item.score * 0.2); // ④ 정비 및 조치사항
                    let s3 = item.score - (s1 + s2 + s4);  // ③ 판 정 (나머지 오차 전부 흡수)
                    
                    let sideButtonsHtml = `
                        <div class="no-print" style="position: absolute; left: 100%; top: 0; margin-left: 15px; display: flex; flex-direction: column; gap: 8px; width: 70px;">
                            <button class="btn-custom" style="background:#e74c3c; border:1px solid #c0392b; font-size:11px; padding:6px 0;" onclick="resetAnsTable(${idx})">🔄 초기화</button>
                            <button class="btn-custom" style="background:#27ae60; border:1px solid #2ecc71; font-size:11px; padding:6px 0;" onclick="saveSingleAnsTable(${idx})">💾 저장</button>
                            <button class="btn-custom" style="background:#f39c12; border:1px solid #d68910; font-size:11px; padding:6px 0;" onclick="undoAnsCell(${idx})">↩️ 셀 이전</button>
                        </div>
                    `;
                    
                    // 💡 [신규 모터 3] 일체형 모범답안 헤더 (기존 표 위에 하단 테두리 제거 후 밀착)
                    itemHtml += `
                        <div style="position: relative;">
                            <div style="width: 100%; border: 2px solid #000; border-bottom: none; background-color: #e0ffff; color: #111; text-align: center; font-weight: bold; padding: 8px 0; font-size: 15px; box-sizing: border-box; margin-bottom: 0;">모 범 답 안</div>
                            <div id="ans_wrapper_${idx}" class="ans-custom-wrapper" style="margin-bottom: 15px; margin-top: 0;">${ansTableHtml}</div>
                            ${sideButtonsHtml}
                        </div>
                        
                        <table class="ans-table" style="border: 2px solid #000; margin-bottom: 30px;">
                            <tr><th colspan="3" class="ans-cyan-bg" style="font-size: 16px; padding: 10px !important; border-bottom: 2px solid #000;">채 점 기 준</th></tr>
                            <tr>
                                <th class="ans-cyan-bg" style="width:30%">채점항목</th>
                                <th class="ans-cyan-bg" style="width:20%">배 점</th>
                                <th class="ans-cyan-bg" style="width:50%">해당 항목 '0'점 처리기준</th>
                            </tr>
                            <tr><td style="text-align: left; padding-left: 15px;">① 이상 부위</td><td>${s1}점</td><td rowspan="4" class="ans-rubric-text" style="vertical-align:middle; padding: 10px 15px !important;"><ul><li>단위가 없거나 틀린 경우</li><li>의미가 달라질 수 있는 단위 접두어의 대소문자가 틀린 경우</li><li>기재사항에서 평가자의 정정 날인 없이 정정된 개소</li><li>①번 문항이 틀린 경우</li></ul></td></tr>
                            <tr><td style="text-align: left; padding-left: 15px;">② 내용 및 상태</td><td>${s2}점</td></tr>
                            <tr><td style="text-align: left; padding-left: 15px;">③ 판 정</td><td>${s3}점</td></tr>
                            <tr><td style="text-align: left; padding-left: 15px;">④ 정비 및 조치사항</td><td>${s4}점</td></tr>
                        </table>
                    `;
                } else {
                    let customHtml = (window.downloadedCustomItems && window.downloadedCustomItems[idx]?.customHtml) ? window.downloadedCustomItems[idx].customHtml : (savedItems[idx]?.customHtml || "");
                    let rowNames = extractTeacherRows(customHtml);
                    let N = rowNames.length;
                    let rS = item.score / N;
                    let v1 = formatScore(rS); 
                    let v2 = Math.round(rS * 0.8);
                    let v3 = Math.round(rS * 0.6);
                    let v4 = Math.round(rS * 0.4);
                    let v5 = Math.round(rS * 0.2);
                    
                    let rowsHtml = "";
                    rowNames.forEach((rName, r) => {
                        let rubricCells = "";
                        if (r < 5) {
                            let options = teacherRubrics[r];
                            for(let c=0; c<5; c++) {
                                rubricCells += `<td class="ans-rubric-text"><ul class="fb-pool"><li class="fb-item">${options[c].replace(/\|/g, '</li><li class="fb-item">')}</li></ul></td>`;
                            }
                        } else {
                            // 💡 추가된 6번째 이상의 항목은 기본 텍스트 삽입 (이후 랜덤 채점 시 이 항목들은 만점으로 고정되어 피드백 출력 안 됨)
                            for(let c=0; c<5; c++) {
                                let desc = c===0 ? "매우 우수함" : (c===1 ? "우수함" : (c===2 ? "보통임" : (c===3 ? "미흡함" : "매우 미흡함")));
                                rubricCells += `<td class="ans-rubric-text"><ul class="fb-pool"><li class="fb-item">해당 평가 항목 수행능력이 ${desc}</li></ul></td>`;
                            }
                        }
                        rowsHtml += `<tr><td style="font-weight:bold;">${rName}</td>${rubricCells}</tr>`;
                    });

                    itemHtml += `
                        <table class="ans-table" style="border: 2px solid #000; margin-bottom: 30px;">
                            <tr><th colspan="6" class="ans-cyan-bg" style="border-bottom: 2px solid #000; padding: 10px !important; font-size: 16px;">채 점 기 준</th></tr>
                            <tr>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">평가항목<br>(${item.score}점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">매우우수<br>(${v1}점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">우수<br>(${v2}점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">보통<br>(${v3}점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">미흡<br>(${v4}점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">매우미흡<br>(${v5}점)</th>
                            </tr>
                            ${rowsHtml}
                        </table>
                    `;
                }

                let weight = (item.type === '훈련생작성') ? 2 : 1;
                if (pageWeight > 0 && pageWeight + weight > 2) {
                    fullHtml += `</div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div><div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div><div style="flex:1;">`;
                    pageWeight = 0;
                }
                fullHtml += itemHtml;
                pageWeight += weight;
            });

            fullHtml += `</div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div>`;

            fullHtml += `
                <div class="a4-page" style="display:flex; flex-direction:column;">
                    <div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지 (태도/시간)</div>
                    <div style="flex:1;">
                        <div class="ep-section-title" style="font-size: 17px;">2. 태도 평가</div>
                        <table class="ans-table" style="border: 2px solid #000;">
                            <tr><th colspan="6" class="ans-cyan-bg" style="border-bottom: 2px solid #000; font-size: 16px; padding: 10px !important;">채 점 기 준</th></tr>
                            <tr>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">평가항목<br>(20점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">매우우수<br>(5점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">우수<br>(4점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">보통<br>(3점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">미흡<br>(2점)</th>
                                <th style="width:16%; background-color:#f2f2f2; font-weight:bold;">매우미흡<br>(1점)</th>
                            </tr>
                            <tr><td style="font-weight:bold;">작업안전</td><td class="ans-rubric-text"><ul><li>작업 복장이 전체 올바름</li><li>작업장 안전수칙을 준수함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 복장이 일부 불량함</li><li>작업장 안전수칙을 준수함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 복장이 일부 불량함</li><li>작업장 안전수칙 일부 미준수함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 복장이 불량함</li><li>작업장 안전수칙을 미준수함</li></ul></td><td class="ans-rubric-text"><ul><li>작업복장이 매우 불량함</li><li>작업장 안전수칙을 미준수함</li></ul></td></tr>
                            <tr><td style="font-weight:bold;">작업방법</td><td class="ans-rubric-text"><ul><li>장비와 공구 선택, 분해순서, 조립순서, 조립 후 검사항목을 숙지하고 절차대로 평가에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>분해순서, 조립순서, 조립 후 검사항목을 숙지하고 절차대로 평가에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>분해순서, 조립순서를 숙지하고 절차대로 평가에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>분해순서, 조립순서를 대충 숙지하고 절차대로 평가에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>장비와 공구 선택, 분해순서, 조립순서, 조립 후 검사항목에 대한 숙지가 전혀 안 됨</li></ul></td></tr>
                            <tr><td style="font-weight:bold;">작업태도</td><td class="ans-rubric-text"><ul><li>작업별 안전수칙을 정확히 준수하며 작업에 임함</li><li>평가자의 지시를 정확히 이해하고 작업에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>작업별 안전수칙 일부를 무시하고 작업에 임함</li><li>평가자의 지시를 정확히 이해하고 작업에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>작업별 안전수칙 일부 미준수하고 작업에 임함</li><li>평가자의 지시를 일부 이해하고 작업에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>작업별 안전수칙 무시하고 작업에 임함</li><li>평가자의 지시를 일부 이해하고 작업에 임함</li></ul></td><td class="ans-rubric-text"><ul><li>작업별 안전수칙 무시하고 작업에 임함</li><li>평가자의 지시를 무시하고 작업에 임함</li></ul></td></tr>
                            <tr><td style="font-weight:bold;">정리정돈</td><td class="ans-rubric-text"><ul><li>작업 후 사용한 장비·공구 및 작업공간 정리 정돈을 매우 잘함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 후 사용한 장비·공구 및 작업공간 정리 정돈을 잘함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 보통임</li></ul></td><td class="ans-rubric-text"><ul><li>작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 미흡함</li></ul></td><td class="ans-rubric-text"><ul><li>작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 매우 미흡함</li></ul></td></tr>
                        </table>
                        <div class="ep-section-title" style="font-size: 17px; margin-top:40px;">3. 시간 평가</div>
                        <table class="ans-table" style="border: 2px solid #000; table-layout: fixed; width: 100%;">
                            <tr>
                                <th class="ans-cyan-bg" style="width:20%;">평가항목</th>
                                <th class="ans-cyan-bg" style="width:20%;">정 상</th>
                                <th class="ans-cyan-bg" style="width:20%;">5분 초과</th>
                                <th class="ans-cyan-bg" style="width:20%;">6분 이상 10분 이내 초과</th>
                                <th class="ans-cyan-bg" style="width:20%;">득 점</th>
                            </tr>
                            <tr>
                                <td style="font-weight:bold;">작업시간</td>
                                <td>감점 없음</td>
                                <td>-5점</td>
                                <td>-10점</td>
                                <td></td>
                            </tr>
                        </table>
                    </div>
                    <div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div>
                </div>
            `;

            fullHtml += `
                <div class="a4-page" style="display:flex; flex-direction:column;">
                    <div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지 (결과반영기준)</div>
                    <div style="flex:1;">
                        <table class="ans-table" style="margin-top: 20px; border: 2px solid #000; margin-bottom: 30px;">
                            <colgroup>
                                <col style="width: 14%;">
                                <col style="width: 86%;">
                            </colgroup>
                            <tr><th colspan="2" class="ans-cyan-bg" style="font-size: 22px; padding: 15px !important; border-bottom: 2px solid #000;">내부평가 결과반영기준</th></tr>
                            <tr>
                                <th>평가결과<br>반영기준</th>
                                <td class="ans-rubric-text" style="padding: 15px 25px !important; line-height: 1.6; font-size: 12.5px;">
                                    <ul style="list-style-type: square; padding-left: 15px; margin: 0;">
                                        <li style="margin-bottom: 6px;">총점은 100점으로 한다.</li>
                                        <li style="margin-bottom: 6px;">산업현장에서 요구하는 수행기준/수준에 따라 출제난이도를 상, 중, 하로 정한다.</li>
                                        <li style="margin-bottom: 6px;">확정된 평가일에 공가자·결시자·재평가 대상 훈련생은 담임 교사가 해당 평가 일자를 재조정하여 공지한 후 재평가를 실행한다.</li>
                                        <li style="margin-bottom: 6px;">평가 결과에 따른 재평가 : 최종점수가 60점 미만의 경우 보충수업 후 재평가를 실행한다.</li>
                                        <li style="margin-bottom: 6px;">결시자·성적부진 재평가 대상자의 재평가 점수는 100점 만점 기준으로 하되,<br>해당 능력 단위 최종점수에 반영할 때는 재평가 점수의 90%를 반영한다.</li>
                                        <li style="margin-bottom: 6px;">공가자의 재평가 점수는 100점 만점 기준으로 하며,<br>해당 능력 단위 최종점수를 반영할 때는 재평가 점수의 100%를 반영한다.</li>
                                        <li style="margin-bottom: 6px;">재평가 1회를 실시하며, 재평가 문제 유형은 1차 평가 유형과 달리하여 실시하되<br>작업장평가인 경우는 예외로 한다.</li>
                                        <li style="margin-bottom: 6px;">보충수업 희망 훈련생은 최종점수가 60점 이상이라도 보충수업에 참여할 수 있다.</li>
                                        <li style="margin-bottom: 6px;">평가 방법은 승인된 평가 방법으로 시행하며, NCS 해당 능력 단위 및<br>능력 단위요소와 수행 준거를 분석하여 본 기관에 맞는 평가도구를 선정한다.</li>
                                        <li style="margin-bottom: 6px;">내부 평가 결과를 훈련과정 교과목(능력 단위) 및 평가도구 개발에 활용할 수 있다.</li>
                                        <li style="margin-bottom: 6px;">최종점수에 따라 60점 이상은 능력 단위 이수 여부를 합격(pass), 60점 미만은 불합격(fail)으로 처리한다.</li>
                                        <li style="margin-bottom: 0;">최종점수에 따라 성취 수준을 5단계로 구분하고 구분 영역은 다음과 같다.</li>
                                    </ul>
                                </td>
                            </tr>
                        </table>
                        <table class="ans-table" style="border: 2px solid #000;">
                            <colgroup>
                                <col style="width: 14%;">
                                <col style="width: 72%;">
                                <col style="width: 14%;">
                            </colgroup>
                            <tr><th class="ans-cyan-bg">성취수준</th><th class="ans-cyan-bg">수 행 정 도</th><th class="ans-cyan-bg">최종점수</th></tr>
                            <tr><th style="font-weight:normal;">5단계</th><td style="text-align:left; padding:12px 18px; line-height:1.5;">해당 지식과 기술을 확실하게 습득하여 직무수행에 필요한 기술적 사고력과 문제 해결력을 토대로 주도적으로 완벽한 작업을 수행할 수 있다.</td><th style="font-weight:normal;">90점 이상</th></tr>
                            <tr><th style="font-weight:normal;">4단계</th><td style="text-align:left; padding:12px 18px; line-height:1.5;">해당 지식과 기술을 습득하여 직무수행에 필요한 기술적 사고력과 문제 해결력을 토대로 작업을 수행할 수 있다.</td><th style="font-weight:normal;">80점~89점</th></tr>
                            <tr><th style="font-weight:normal;">3단계</th><td style="text-align:left; padding:12px 18px; line-height:1.5;">해당 지식과 기술을 대부분 습득하여 직무수행에 필요한 지식과 기술을 가지고 대부분 작업을 수행할 수 있다.</td><th style="font-weight:normal;">70점~79점</th></tr>
                            <tr><th style="font-weight:normal;">2단계</th><td style="text-align:left; padding:12px 18px; line-height:1.5;">해당 지식과 기술을 부분적으로 습득하여 직무수행에 필요한 지식과 기술을 가지고 타인과 공동으로 작업을 수행할 수 있다.</td><th style="font-weight:normal;">60점~69점</th></tr>
                            <tr><th style="font-weight:normal;">1단계</th><td style="text-align:left; padding:12px 18px; line-height:1.5;">해당 지식과 기술을 습득하는데 부족함이 있어 타인의 도움을 받아야만 작업을 수행할 수 있다.</td><th style="font-weight:normal;">59점 이하</th></tr>
                            <tr><th colspan="3" style="padding:12px; border-top: 2px solid #000; font-weight:bold;">평가자는 학습자의 달성 정도를 성취 수준에 표시한다.</th></tr>
                        </table>
                    </div>
                    <div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div>
                </div>
            `;

            document.getElementById('page3').innerHTML = fullHtml;
        }

        async function saveModelAnswers() {
            if (!currentDbKey) return alert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");

            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                let savedData = snap.val() || {};
                let savedItems = savedData.items || [];

                let hasChanges = false;
                const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
                
                rows.forEach((tr, idx) => {
                    if (!savedItems[idx]) savedItems[idx] = {}; 
                    
                    // 💡 [신경망 융합] 메모리에 남은 다운로드 폼(customHtml) 유실 방지
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) {
                        savedItems[idx].customHtml = window.downloadedCustomItems[idx].customHtml;
                        hasChanges = true;
                    }

                    // 💡 [신경망 융합] 화면에 타이핑한 모범답안(ansHtml) 스캔 및 보존
                    const wrapper = document.getElementById(`ans_wrapper_${idx}`);
                    if (wrapper) {
                        savedItems[idx].ansHtml = wrapper.innerHTML; 
                        hasChanges = true;
                    }
                });

                if (!hasChanges) return alert("⚠️ 저장할 내용이 없습니다.");

                savedData.items = savedItems;
                await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).set(savedData);
                
                alert("✅ 3.채점기준(모범답안) 및 커스텀 폼이 DB에 완벽히 융합 저장되었습니다!\n(공용 클라우드 올리기 시 100% 동기화됩니다.)");
            } catch (e) {
                alert("❌ 모범답안 융합 저장 실패: " + e.message);
            }
        }

        // 📍 3. 채점기준(모범답안) 탭 전용: 셀 클릭 시 빨간색 텍스트 수정(에디터) 모드 발동
        window.lastEditedCells = {};

        window.resetAnsTable = async function(idx) {
            if (!confirm("이 표의 모범답안 작성 내용을 모두 삭제하고, 2.평가지의 원본 형태로 초기화하시겠습니까?")) return;
            try {
                if (currentDbKey) {
                    await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}/ansHtml`).remove();
                    alert("✅ 초기화되었습니다.");
                    buildAnswerDocs();
                }
            } catch(e) { alert("❌ 초기화 실패: " + e.message); }
        };

        window.saveSingleAnsTable = async function(idx) {
            let wrapper = document.getElementById(`ans_wrapper_${idx}`);
            if (!wrapper) return;
            try {
                if (currentDbKey) {
                    let updates = { ansHtml: wrapper.innerHTML };
                    
                    // 💡 [신경망 융합] 단일 저장 시에도 커스텀 폼(customHtml) 유실 방지
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) {
                        updates.customHtml = window.downloadedCustomItems[idx].customHtml;
                    }

                    await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}`).update(updates);
                    alert("✅ 해당 표의 모범답안 및 커스텀 폼이 안전하게 융합 저장되었습니다.");
                }
            } catch(e) { alert("❌ 저장 실패: " + e.message); }
        };

        window.undoAnsCell = function(idx) {
            let cell = window.lastEditedCells[idx];
            if (cell) {
                cell.innerHTML = "";
            } else {
                alert("⚠️ 방금 수정한 셀의 기록이 없습니다.\n(셀을 한 번 클릭했다가 빠져나와야 인식됩니다.)");
            }
        };

        // 📍 3. 채점기준(모범답안) 탭 전용: 셀 클릭 시 빨간색 텍스트 수정(에디터) 모드 발동
        document.addEventListener('click', function(e) {
            if (document.getElementById('page3').classList.contains('active')) {
                let cell = e.target.closest('.ans-custom-wrapper .editable-cell');
                // 💡 [수정] 순정 td 뿐만 아니라 커스텀 튜닝된 div 셀도 에디터 모드 허용
                if (cell && (cell.tagName.toLowerCase() === 'td' || cell.tagName.toLowerCase() === 'div')) {
                    if (e.target.classList.contains('custom-chk')) {
                        if (e.target.innerText === '□') {
                            e.target.innerText = '☑';
                            e.target.style.color = '#c0392b';
                        } else {
                            e.target.innerText = '□';
                            e.target.style.color = 'black';
                        }
                        return;
                    }

                    cell.contentEditable = "true";
                    cell.style.color = "#c0392b"; 
                    cell.style.fontWeight = "bold";
                    cell.focus();

                    cell.onblur = function() {
                        cell.contentEditable = "false";
                        // 💡 방금 작업한 셀이 어떤 항목(몇 번째 표) 소속인지 기억
                        let wrapper = cell.closest('.ans-custom-wrapper');
                        if (wrapper) {
                            let idxMatch = wrapper.id.match(/ans_wrapper_(\d+)/);
                            if (idxMatch) window.lastEditedCells[idxMatch[1]] = cell;
                        }
                    };
                }
            }
        });

    
// 💡 [신규 추가] 텍스트 붙여넣기 시 외부 서식(글꼴, 크기) 제거 및 순수 텍스트만 입력
document.addEventListener('paste', function(e) {
    let cell = e.target.closest('.editable-cell');
    if (cell && cell.isContentEditable) {
        e.preventDefault();
        let text = (e.originalEvent || e).clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }
});

// 💡 [신규 추가] 맨 앞 커서에서 백스페이스 입력 시 셀 세로 길이(행 높이) 수동 축소 엔진
document.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace') {
        let cell = e.target.closest('.editable-cell');
        
        // 현재 선택된 곳이 텍스트 편집이 가능한 셀인지 확인
        if (cell && cell.isContentEditable) {
            let sel = window.getSelection();
            if (sel.rangeCount > 0) {
                let range = sel.getRangeAt(0);
                
                // 커서 기준 앞쪽에 텍스트나 내용이 존재하는지 물리적 확인
                let preCaretRange = range.cloneRange();
                preCaretRange.selectNodeContents(cell);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                let textBefore = preCaretRange.toString();
                
                // 지울 글자가 없는 '절대 0' 위치(맨 앞 커서)일 때만 발동
                if (textBefore.length === 0) {
                    let tr = cell.closest('tr');
                    if (tr) {
                        
                        // 현재 행의 높이를 파악 후 10px씩 물리적 축소
                        let currentHeight = tr.getBoundingClientRect().height;
                        let inlineHeight = tr.style.height ? parseInt(tr.style.height) : currentHeight;
                        let newHeight = inlineHeight - 10;
                        
                        // 표가 완전히 찌그러지지 않도록 최소 높이 25px 방어선 구축
                        if (newHeight < 25) newHeight = 25; 
                        tr.style.height = newHeight + 'px';
                        
                        // 2번 탭(평가지)에서 작동했을 경우, 해당 표의 개별 [💾 저장] 버튼을 활성화
                        if (document.getElementById('page2').classList.contains('active')) {
                            let table = cell.closest('table');
                            if (table && table.id && typeof markChanged === 'function') {
                                markChanged(table.id);
                            }
                        }
                    }
                }
            }
        }
    }
});

// ---------------------------------------------------------
        // 📍 [신규 모터 7] 4. 최종결과표 렌더링 엔진 (템플릿 모드)
        // ---------------------------------------------------------
        async function buildFinalResultDocs() {
            const subject = document.getElementById('S1_1').value || "";
            const unitCode = document.getElementById('S1_Code').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const courseName = document.getElementById('S0_CourseName').value || "";
            const period = document.getElementById('S0_Period').value || "";
            const evalMethod = document.getElementById('S2_1').value || "";
            const evalTestTime = document.getElementById('S2_3').value || "";
            const dateMain = document.getElementById('S3_1').value || "";
            const dateAdd = document.getElementById('S3_2').value || "";
            const dateRe = document.getElementById('S3_3').value || "";
            const teacher = document.getElementById('S0_Teacher').value || "";

            if (!subject) {
                document.getElementById('page4').innerHTML = "<div class='a4-page'><p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상 과목을 먼저 선택해 주십시오.</p></div>";
                return;
            }

            document.getElementById('page4').innerHTML = "<div class='a4-page'><p style='padding:20px; color:#2980b9; font-weight:bold;'>⏳ 학생들의 평가 데이터(점수)를 불러오는 중입니다...</p></div>";

            if (!currentDbKey) currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            // 💡 [신규 배선] 진입 시 해당 반의 전체 학생 최종점수를 DB에서 미리 메모리에 적재
            try {
                const snap = await database.ref(`${currentClass}/evalScores/본평가/${currentDbKey}`).once('value');
                window.studentScoresData = snap.val() || {};
            } catch(e) {
                window.studentScoresData = {};
                console.warn("평가 결과 불러오기 에러:", e);
            }

            let stdData = null;
            const cleanCode = unitCode.replace(/\s+/g, '');
            if (cleanCode && cleanCode !== "코드없음(DB미등록)") {
                stdData = globalStandards.find(s => s.code && s.code.replace(/\s+/g, '') === cleanCode);
            }
            if (!stdData) {
                const textFilter = /[\s·ㆍ\.\_]/g; 
                const cleanName = (unitName || subject).replace(textFilter, '');
                stdData = globalStandards.find(s => s.subjectName && s.subjectName.replace(textFilter, '') === cleanName);
            }

            let courseCategory = stdData && stdData.categoryName ? stdData.categoryName : "해당교과목";
            let catText = courseCategory.replace(/정비$/, '').trim();
            let subText = (unitName || subject).replace(/정비$/, '').trim();

            let criteriaHtml = `
                <div style="margin-bottom: 3px;">1. ${catText}에서 ${subText}에 대한 측정을 하여 점검 및 진단할 수 있다.</div>
                <div style="margin-bottom: 3px;">2. ${catText}에서 ${subText}에 대한 수리·교환·검사할 수 있다.</div>
                <div style="margin-bottom: 3px;">3. 작업공정별 장비 및 공구 선택과 안전작업절차를 수행할 수 있다.</div>
            `;

            // 💡 [단선 복구] savedItems 배열이 선언되지 않아 발생한 무한 로딩 쇼크 해결
            let savedItems = [];
            try {
                const snap = await database.ref(`${currentClass}/evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
            } catch (e) { console.warn("DB 로드 에러:", e); }

            window.currentEvalItems = [];
            window.activeFeedbacks = {}; 

            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach((tr, idx) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                const score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                const diff = tr.querySelectorAll('select')[0]?.value || "";
                
                let coreTaskText = name;
                const qRow = tr.nextElementSibling;
                if (qRow && qRow.classList.contains('eval-question-row')) {
                    coreTaskText = qRow.querySelector('.eval-core-task-input')?.value || name;
                }
                // 💡 [수정] customHtml에서 N개의 행 이름을 추출하여 배열에 동봉
                let customHtml = savedItems[idx]?.customHtml || "";
                let rowNames = type === '훈련생작성' ? [] : extractTeacherRows(customHtml);
                window.currentEvalItems.push({ idx: idx, name, score, type, coreTask: coreTaskText, diff, category: 'item', rowNames: rowNames });
            });

            const attitudeNames = ["작업안전", "작업방법", "작업태도", "정리정돈"];
            attitudeNames.forEach((aName, aIdx) => {
                window.currentEvalItems.push({ idx: 'A'+aIdx, name: aName, score: 5, type: '평가자 체크', coreTask: aName, diff: '하', category: 'attitude' });
            });

            let calcTraineeSum = 0;
            let calcTeacherValids = [];
            window.currentEvalItems.forEach(item => {
                if (item.type === '훈련생작성') {
                    calcTraineeSum += item.score;
                } else {
                    let validSumsSet = new Set();
                    if (item.category === 'attitude') {
                        validSumsSet = new Set([1, 2, 3, 4, 5]);
                    } else {
                        let N = item.rowNames.length;
                        let rS = item.score / N;
                        let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                        
                        // 💡 [수정] 5중 루프 대신 재귀함수로 N개 항목 계산 (5번 인덱스부터는 무조건 만점(v[0]) 강제 부여)
                        function findItemSums(row, currentSum) {
                            if (row === N) {
                                validSumsSet.add(Math.round(currentSum * 10) / 10);
                                return;
                            }
                            if (row >= 5) {
                                findItemSums(row + 1, currentSum + v[0]); 
                            } else {
                                for (let i = 0; i < 5; i++) findItemSums(row + 1, currentSum + v[i]);
                            }
                        }
                        findItemSums(0, 0);
                    }
                    calcTeacherValids.push(Array.from(validSumsSet).sort((a,b)=>a-b));
                }
            });
            let possibleSums = new Set([calcTraineeSum]);
            calcTeacherValids.forEach(valids => {
                let nextSums = new Set();
                possibleSums.forEach(curr => { valids.forEach(v => nextSums.add(Math.round((curr + v)*10)/10)); });
                possibleSums = nextSums;
            });
            let top6Scores = Array.from(possibleSums).sort((a,b) => b - a).slice(0, 6);
            
            let top6Html = top6Scores.map(s => `<button style="flex:1; padding:4px 0; background:#f1c40f; border:1px solid #f39c12; color:#2c3e50; font-weight:bold; font-size:11px; border-radius:3px; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1); transition:0.2s;" onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'" onclick="document.getElementById('final_total_score_input').value='${s}'; reverseCalculateScore('${s}');">${s}</button>`).join('');

            let smallModeSwitchHtml = `
                <div style="display: flex; gap: 4px; margin-bottom: 12px; background: #f8f9fa; padding: 4px; border-radius: 6px; border: 1px solid #e1e4e8;">
                    <button style="flex:1; padding:6px 0; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid ${currentEvalMode === '본평가' ? '#2980b9' : '#bdc3c7'}; background:${currentEvalMode === '본평가' ? '#3498db' : '#ecf0f1'}; color:${currentEvalMode === '본평가' ? 'white' : '#7f8c8d'}; cursor:pointer;" onclick="switchEvalType('본평가')">📌본평가</button>
                    <button style="flex:1; padding:6px 0; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid ${currentEvalMode === '추가평가' ? '#2980b9' : '#bdc3c7'}; background:${currentEvalMode === '추가평가' ? '#3498db' : '#ecf0f1'}; color:${currentEvalMode === '추가평가' ? 'white' : '#7f8c8d'}; cursor:pointer;" onclick="switchEvalType('추가평가')">➕추가</button>
                    <button style="flex:1; padding:6px 0; font-size:11px; font-weight:bold; border-radius:4px; border:1px solid ${currentEvalMode === '재평가' ? '#2980b9' : '#bdc3c7'}; background:${currentEvalMode === '재평가' ? '#3498db' : '#ecf0f1'}; color:${currentEvalMode === '재평가' ? 'white' : '#7f8c8d'}; cursor:pointer;" onclick="switchEvalType('재평가')">🔄재평가</button>
                </div>
            `;

            let controlPanelHtml = `
                <div class="no-print" style="width: 280px; flex-shrink: 0; background: white; padding: 15px; border-radius: 8px; border: 2px solid #3498db; box-shadow: 0 5px 15px rgba(0,0,0,0.1); position: sticky; top: 20px; height: max-content;">
                    ${smallModeSwitchHtml}
                    <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:15px; line-height:1.4; display:flex; justify-content:space-between; align-items:center;">
                        <div>📊 교사용 채점 대시보드<br><span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(※ 우측 평가지 자동 연동)</span></div>
                        <button style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" onclick="resetAllScores()">🔄 초기화</button>
                    </h3>
                    <div style="background:#fffde7; border:1px solid #f1c40f; padding:6px 8px; border-radius:4px; margin-bottom:8px;">
                        <div style="font-size:10.5px; font-weight:bold; color:#d35400; margin-bottom:4px; letter-spacing:-0.5px;">💡 추천 점수 자동 분배</div>
                        <div style="display:flex; gap:3px;">${top6Html}</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px;">
            `;
            
            window.currentEvalItems.forEach(item => {
                let defaultVal = (item.type === '훈련생작성') ? item.score : "";
                controlPanelHtml += `
                    <div style="background:#f8f9fa; border:1px solid #bdc3c7; padding:5px 8px; border-radius:4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <div style="font-size:11.5px; font-weight:bold; margin-bottom:4px; color:#333; word-break: keep-all; line-height:1.2;">${item.name} <span style="color:#e74c3c;">(${item.score}점)</span></div>
                        <div style="display:flex; gap:4px;">
                            <input type="number" id="score_input_${item.idx}" placeholder="점수" value="${defaultVal}" style="flex:1; padding:4px 6px; border:1px solid #ccc; border-radius:3px; font-size:12px; font-weight:bold;" onchange="processAutoScore('${item.idx}')">
                            <button style="background:#27ae60; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px; font-weight:bold; transition:0.2s;" onmouseover="this.style.background='#219150'" onmouseout="this.style.background='#27ae60'" onclick="openOMR('${item.idx}')">✔ OMR</button>
                        </div>
                    </div>
                `;
            });
            controlPanelHtml += `</div></div>`;

            const dotDate = (d) => d ? d.replace(/-/g, '.') : "";

            let dateRows = [];
            dateRows.push({ label: '본평가', value: dotDate(dateMain) || '-' });
            if (currentEvalMode === '본평가') {
                dateRows.push({ label: '재평가', value: '-' });
            } else if (currentEvalMode === '추가평가') {
                let extraDates = [];
                extraDates.push({ label: '추가평가', value: dateAdd ? dotDate(dateAdd) : '-', raw: dateAdd || "9999-99-99" });
                if (dateRe && dateRe.trim() !== "") extraDates.push({ label: '재평가', value: dotDate(dateRe), raw: dateRe });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            } else if (currentEvalMode === '재평가') {
                let extraDates = [];
                if (dateAdd && dateAdd.trim() !== "") extraDates.push({ label: '추가평가', value: dotDate(dateAdd), raw: dateAdd });
                extraDates.push({ label: '재평가', value: dateRe ? dotDate(dateRe) : '-', raw: dateRe || "9999-99-99" });
                extraDates.sort((a, b) => a.raw.localeCompare(b.raw));
                extraDates.forEach(d => dateRows.push({ label: d.label, value: d.value }));
            }
            let rs = dateRows.length === 3 ? 2 : 3;

            let unitDisplay = (unitCode && !unitCode.includes("없음")) ? `${unitCode}<br>${unitName || subject}` : (unitName || subject);
            const stampStyle = `position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:32px; height:32px; background-size:contain; background-repeat:no-repeat; background-position:center; pointer-events:none;`;

            const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";

            let scoreRowsHtml = "";
            let itemElements = window.currentEvalItems.filter(i => i.category === 'item');
            let rowSpanTotal = itemElements.length + 8;

            itemElements.forEach((item, i) => {
                if (i === 0) {
                    scoreRowsHtml += `
                    <tr>
                        <th rowspan="${itemElements.length}" class="cyan-th">지식·기술<br>평가<br>(80점)</th>
                        <td class="white-td" style="text-align: left; padding-left: 15px;">${item.name}</td>
                        <td class="white-td">${item.score}</td>
                        <td class="white-td" id="print_score_${item.idx}" style="color:#c0392b; font-weight:bold; font-size:14px;"></td>
                        <td class="white-td">${item.diff}</td>
                    </tr>`;
                } else {
                    scoreRowsHtml += `
                    <tr>
                        <td class="white-td" style="text-align: left; padding-left: 15px;">${item.name}</td>
                        <td class="white-td">${item.score}</td>
                        <td class="white-td" id="print_score_${item.idx}" style="color:#c0392b; font-weight:bold; font-size:14px;"></td>
                        <td class="white-td">${item.diff}</td>
                    </tr>`;
                }
            });

            scoreRowsHtml += `
                <tr>
                    <th rowspan="4" class="cyan-th">태도평가<br>(20점)</th>
                    <td class="white-td" style="text-align: left; padding-left: 15px;">작업안전</td><td class="white-td">5</td><td class="white-td" id="print_score_A0" style="color:#c0392b; font-weight:bold; font-size:14px;"></td><td class="white-td">하</td>
                </tr>
                <tr><td class="white-td" style="text-align: left; padding-left: 15px;">작업방법</td><td class="white-td">5</td><td class="white-td" id="print_score_A1" style="color:#c0392b; font-weight:bold; font-size:14px;"></td><td class="white-td">하</td></tr>
                <tr><td class="white-td" style="text-align: left; padding-left: 15px;">작업태도</td><td class="white-td">5</td><td class="white-td" id="print_score_A2" style="color:#c0392b; font-weight:bold; font-size:14px;"></td><td class="white-td">하</td></tr>
                <tr><td class="white-td" style="text-align: left; padding-left: 15px;">정리정돈</td><td class="white-td">5</td><td class="white-td" id="print_score_A3" style="color:#c0392b; font-weight:bold; font-size:14px;"></td><td class="white-td">하</td></tr>
                <tr>
                    <th rowspan="2" class="cyan-th">시간평가<br>(감점)</th>
                    <td class="white-td" style="text-align: left; padding-left: 15px;">5분 초과</td><td class="white-td">-5</td><td class="white-td" id="print_score_time_penalty" style="color:#c0392b; font-weight:bold; font-size:14px;">0</td><td class="white-td"></td>
                </tr>
                <tr>
                    <td class="white-td" style="text-align: left; padding-left: 15px;">6분 이상 10분 이내 초과</td><td class="white-td">-10</td><td class="white-td"></td><td class="white-td"></td>
                </tr>
                <tr>
                    <th class="cyan-th" style="height: 60px;">평가<br>피드백</th>
                    <td colspan="4" class="white-td" id="feedback_zone" style="text-align: left; vertical-align: top; padding: 15px; font-size: 13px; line-height: 1.6; color: #2c3e50;">
                        <span style="color:#7f8c8d;">※ 상단의 컨트롤 패널에서 점수를 기입하거나 [✔ OMR 체크] 버튼을 누르면 피드백이 자동 생성됩니다.</span>
                    </td>
                </tr>
            `;

            
            let studentSet = new Set();
            if (globalAttendanceData && typeof globalAttendanceData === 'object') { 
                Object.values(globalAttendanceData).forEach(dayData => {
                    if (dayData && typeof dayData === 'object') { 
                        Object.keys(dayData).forEach(key => {
                            if (key !== '_metadata') studentSet.add(key);
                        });
                    }
                });
            }
            let studentList = Array.from(studentSet).sort();
            if (studentList.length === 0) studentList = ["훈련생"]; 

            let targetDateRaw = currentEvalMode === '본평가' ? dateMain : (currentEvalMode === '추가평가' ? dateAdd : dateRe);
            let targetDate = targetDateRaw ? targetDateRaw.trim() : "";

            let studentButtonsHtml = studentList.map((stu, index) => {
                let activeStyle = index === 0 ? "background:#2ecc71; color:white; border-color:#27ae60; box-shadow:inset 0 -3px 0 rgba(0,0,0,0.2);" : "background:#ecf0f1; color:#7f8c8d; border-color:#bdc3c7;";
                
                let attStatus = "-";
                let statusColor = "#7f8c8d";
                // (출결 상태 산출 로직은 기존 유지...)
                if (targetDate && globalAttendanceData && globalAttendanceData[targetDate] && globalAttendanceData[targetDate][stu]) {
                    let sInfo = globalAttendanceData[targetDate][stu].status || "";
                    if (sInfo.includes("결석") || sInfo === "미편입") { attStatus = "결석"; statusColor = "#e74c3c"; }
                    else if (sInfo.includes("지각")) { attStatus = "지각"; statusColor = "#f39c12"; }
                    else if (sInfo.includes("조퇴")) { attStatus = "조퇴"; statusColor = "#f39c12"; }
                    else if (sInfo.includes("외출") || ["공가", "휴가", "경조사", "출석인정"].some(k => sInfo.includes(k))) { attStatus = sInfo; statusColor = "#2980b9"; }
                    else { attStatus = "출석"; statusColor = "#27ae60"; }
                }

                // 📍 점수 및 모드 뱃지 장착
                let stuScoreObj = window.studentScoresData[stu] || {};
                let stuScore = (stuScoreObj.totalScore !== undefined && stuScoreObj.totalScore !== "-") ? stuScoreObj.totalScore + "점" : "-점";
                
                let scoreColor = "#e74c3c"; // 기본: 빨간색
                let modeBadge = "";
                if (stuScoreObj.savedMode === '추가평가') {
                    scoreColor = "#8e44ad"; // 보라색
                    modeBadge = `<span style="font-size:9px; color:#8e44ad; margin-left:2px;">(추가)</span>`;
                } else if (stuScoreObj.savedMode === '재평가') {
                    scoreColor = "#d35400"; // 주황색
                    modeBadge = `<span style="font-size:9px; color:#d35400; margin-left:2px;">(재)</span>`;
                } else if (stuScoreObj.savedMode === '본평가') {
                    scoreColor = "#2980b9"; // 파란색
                    modeBadge = `<span style="font-size:9px; color:#2980b9; margin-left:2px;">(본)</span>`;
                }

                return `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: max-content;">
                        <button class="student-select-btn" style="padding: 6px 15px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; white-space: nowrap; transition: 0.2s; border: 1px solid #ccc; ${activeStyle}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="selectStudent('${stu}', this)">${stu}</button>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 11px; font-weight: bold; color: ${statusColor}; letter-spacing: -0.5px;">${attStatus}</span>
                            <span style="font-size: 10px; color: #ccc;">|</span>
                            <span id="stu_score_badge_${stu}" style="font-size: 11px; font-weight: bold; color: ${scoreColor}; letter-spacing: -0.5px;">${stuScore}${modeBadge}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // 💡 [추가] 저장된 채점 설정이 있다면 불러오기 (기본값: 97~100점, 100점 3명)
            let defaultMin = 97, defaultMax = 100, defaultMax100 = 3;
            if (window.studentScoresData && window.studentScoresData._gradingSettings) {
                defaultMin = window.studentScoresData._gradingSettings.min || 97;
                defaultMax = window.studentScoresData._gradingSettings.max || 100;
                defaultMax100 = window.studentScoresData._gradingSettings.max100 || 3;
            }

            // 💡 [UI 교체] 전체 채점 컨트롤러 및 축소된 저장 버튼 장착
            let saveBtnHtml = currentEvalMode === '본평가' 
                ? `<button class="btn-save-settings" style="background:#2980b9; border-color:#2980b9; padding: 6px 10px; font-size: 11px;" onclick="saveAllFinalResults()">💾 본평가 전체저장</button>`
                : `<button class="btn-save-settings" style="background:#e67e22; border-color:#d35400; padding: 6px 10px; font-size: 11px;" onclick="saveIndividualFinalResult()">💾 ${currentEvalMode} 개별저장</button>`;

            let studentTopBarHtml = `
                <div class="no-print" style="width: 100%; margin-bottom: 15px; background: white; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid #2ecc71; flex-shrink: 0; display: flex; align-items: center; box-sizing: border-box; justify-content: space-between;">
                    <div style="display: flex; align-items: center; flex: 1; overflow: hidden;">
                        <div style="font-weight: bold; color: #27ae60; font-size: 13px; margin-right: 15px; white-space: nowrap; line-height: 1.4;">
                            👥 훈련생 명단<br>
                            <span style="font-size: 11px; color: #7f8c8d; font-weight: normal;">(평가일: ${targetDate || '미정'})</span>
                        </div>
                        <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; flex: 1;">
                            ${studentButtonsHtml}
                        </div>
                    </div>
                    <div style="margin-left: 15px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; background: #f8f9fa; padding: 5px 10px; border-radius: 6px; border: 1px solid #e1e4e8;">
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="font-size: 11px; font-weight: bold; color: #555;">점수범위:</span>
                                <input type="number" id="auto_score_min" value="${defaultMin}" style="width: 35px; padding: 2px; font-size: 11px; text-align: center; border: 1px solid #ccc; border-radius: 3px;">
                                <span style="font-size: 11px;">~</span>
                                <input type="number" id="auto_score_max" value="${defaultMax}" style="width: 35px; padding: 2px; font-size: 11px; text-align: center; border: 1px solid #ccc; border-radius: 3px;">
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <span style="font-size: 11px; font-weight: bold; color: #555;">100점 최대:</span>
                                <input type="number" id="auto_score_max100" value="${defaultMax100}" style="width: 35px; padding: 2px; font-size: 11px; text-align: center; border: 1px solid #ccc; border-radius: 3px;">
                                <span style="font-size: 11px;">명</span>
                            </div>
                        </div>
                        <button class="btn-save-settings" style="background:#8e44ad; border-color:#8e44ad; padding: 6px 10px; font-size: 11px;" onclick="executeAutoGradeAll()">🎲 전체 채점</button>
                        <div style="width: 1px; height: 30px; background: #bdc3c7; margin: 0 4px;"></div>
                        ${saveBtnHtml}
                    </div>
                </div>
            `;

            let html = `
            <div style="display: flex; flex-direction: column; width: 100%; align-items: center;">
                ${studentTopBarHtml}
                <div style="display: flex; justify-content: center; align-items: flex-start; gap: 20px; width: 100%;">
                    ${controlPanelHtml} <div class="a4-page" style="color: #000; margin: 0; flex-shrink: 0;">
                    <div class="no-print page-indicator">[4.최종결과표]</div>
                    <div class="result-title">${evalModePrefix}능력단위별 내부평가 최종결과표</div>
                
                <table class="result-table" style="table-layout: fixed;">
                    <colgroup>
                        <col style="width: 5%;"><col style="width: 5%;"><col style="width: 5%;">
                        <col style="width: 10%;"><col style="width: 12%;"><col style="width: 10%;">
                        <col style="width: 10%;"><col style="width: 10%;"><col style="width: 3%;">
                        <col style="width: 13%;"><col style="width: 10%;"><col style="width: 7%;">
                    </colgroup>
                    
                    <tr>
                        <th colspan="3" class="cyan-th">훈련과정</th><td colspan="4" class="white-td" style="font-weight: bold; letter-spacing: -0.5px;">${courseName}</td>
                        <th colspan="2" class="cyan-th">훈련기간</th><td colspan="3" class="white-td">${period}</td>
                    </tr>
                    <tr>
                        <th colspan="3" class="cyan-th">교 과 목</th><td colspan="4" class="white-td">${subject}</td>
                        <th colspan="2" class="cyan-th">평가방법</th><td colspan="3" class="white-td">${evalMethod}</td>
                    </tr>
                    <tr>
                        <th colspan="3" class="cyan-th">능력단위</th><td colspan="4" class="white-td" style="line-height: 1.4;">${unitDisplay}</td>
                        <th colspan="2" class="cyan-th">성취수준</th><td colspan="2" class="white-td" id="final_achievement_level" style="border-right: none; font-weight: bold; color: #c0392b; font-size: 15px;"></td><td class="white-td" style="text-align: center; border-left: none;">단계</td>
                    </tr>
                    <tr>
                        <th colspan="3" class="cyan-th">평가시간</th><td class="white-td" style="border-right: none; text-align: right; padding-right: 5px;">${evalTestTime}</td><td class="white-td" style="border-left: none; text-align: left; padding-left: 5px;">분</td>
                        <th class="cyan-th">총 점</th><td colspan="3" class="white-td">100점</td>
                        <th class="cyan-th">최종점수</th><td colspan="2" class="white-td" style="padding:0;"><input type="number" id="final_total_score_input" style="width:100%; border:none; text-align:center; font-weight:bold; font-size:15px; color:#c0392b; background:transparent; outline:none; margin:0;" placeholder="자동/입력" onchange="reverseCalculateScore(this.value)"></td>
                    </tr>
                    
                    <tr>
                        <th rowspan="6" colspan="3" class="cyan-th">평 가 일</th><td rowspan="${rs}" class="white-td" style="font-weight: bold;">${dateRows[0].label}</td><td rowspan="${rs}" class="white-td">${dateRows[0].value}</td>
                        <th rowspan="6" class="cyan-th">이수<br>여부</th><td rowspan="3" class="white-td" style="font-weight: bold; color: #000;">합격<br>(pass)</td><td rowspan="3" colspan="2" class="white-td" id="pass_check_mark" style="text-align:center;"></td> 
                        <th rowspan="2" class="cyan-th">훈련생명</th><td rowspan="2" colspan="2" class="white-td" id="final_student_name_cell"></td>
                    </tr>
                    <tr></tr>
                    <tr>
                        ${rs===2 ? `<td rowspan="2" class="white-td" style="font-weight: bold;">${dateRows[1].label}</td><td rowspan="2" class="white-td">${dateRows[1].value}</td>` : ''}<th rowspan="2" class="cyan-th">담당교사</th><td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">김회준</td>
                        <td rowspan="2" class="white-td" style="text-align: center; position: relative; overflow: hidden;">(인) ${globalTeacherSeal ? `<div style="${stampStyle} opacity: 0.6; background-image:url('${globalTeacherSeal}');"></div>` : ''}</td>
                    </tr>
                    <tr>
                        ${rs===3 ? `<td rowspan="3" class="white-td" style="font-weight: bold;">${dateRows[1].label}</td><td rowspan="3" class="white-td">${dateRows[1].value}</td>` : ''}<td rowspan="3" class="white-td" style="font-weight: bold; color: #000;">불합격<br>(fail)</td><td rowspan="3" colspan="2" class="white-td" id="fail_check_mark" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        ${rs===2 ? `<td rowspan="2" class="white-td" style="font-weight: bold;">${dateRows[2].label}</td><td rowspan="2" class="white-td">${dateRows[2].value}</td>` : ''}<th rowspan="2" class="cyan-th">검증자</th><td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">하정현</td>
                        <td rowspan="2" class="white-td" style="text-align: center; position: relative; overflow: hidden;">(인) ${globalVerifierSeal ? `<div style="${stampStyle} opacity: 0.85; background-image:url('${globalVerifierSeal}');"></div>` : ''}</td>
                    </tr>
                    <tr></tr>
                </table>

                <div class="result-sub-title" style="font-size: 15px; font-weight: bold; margin-bottom: 5px; text-align: left; display: flex; align-items: center;">
                    <span style="font-size: 12px; margin-right: 6px;">■</span> 평가기준
                    <span class="no-print" style="font-size: 11px; color: #e74c3c; font-weight: normal; margin-left: 10px;">(※ 클릭하여 자유롭게 텍스트 수정 가능)</span>
                </div>
                
                <div contenteditable="true" 
                     onmouseover="this.style.backgroundColor='#fffde7'" onmouseout="this.style.backgroundColor='transparent'" 
                     onfocus="this.style.backgroundColor='#fff'; this.style.boxShadow='inset 0 0 0 2px #f39c12';" onblur="this.style.boxShadow='none';" 
                     style="padding-left: 20px; margin-bottom: 10px; text-align: left; font-size: 13px; line-height: 1.4; outline: none; cursor: text; border-radius: 4px; transition: 0.2s;">
                    ${criteriaHtml}
                </div>

                <div class="result-sub-title" style="font-size: 15px; font-weight: bold; margin-bottom: 10px; text-align: left; display: flex; align-items: center;">
                    <span style="font-size: 12px; margin-right: 6px;">■</span> 평가내용 및 배점
                </div>
                <table class="score-table" style="table-layout: fixed; width: 100%; border-collapse: collapse; border: 2px solid #000; text-align: center; font-size: 13px;">
                    <colgroup>
                        <col style="width: 5%;"> <col style="width: 13%;"> <col style="width: 42%;"> <col style="width: 10%;"> <col style="width: 15%;"> <col style="width: 15%;"> 
                    </colgroup>
                    <tr>
                        <th rowspan="${rowSpanTotal + 1}" class="white-td" style="writing-mode: vertical-lr; text-orientation: upright; letter-spacing: 15px; font-weight: bold; padding: 10px 0;">평가내용</th><th class="cyan-th">평가영역</th><th class="cyan-th">평가항목</th><th class="cyan-th">배점</th><th class="cyan-th">득점</th><th class="cyan-th">출제난이도</th>
                    </tr>
                    ${scoreRowsHtml}
                </table>
            </div>
            
            ${(function() {
                let rightPanelHtml = `
                <div class="no-print" style="width: 280px; flex-shrink: 0; background: white; padding: 15px; border-radius: 8px; border: 2px solid #95a5a6; box-shadow: 0 5px 15px rgba(0,0,0,0.1); position: sticky; top: 20px; height: max-content; max-height: 90vh; overflow-y: auto;">
                    <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:14px; line-height:1.4; display:flex; justify-content:space-between; align-items:center;">
                        <div>📋 실시간 감점 추적기<br><span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(평가자 체크 전용)</span></div>
                    </h3>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                `;
                
                // 1. 지식·기술 평가 항목 렌더링 (핵심작업 명칭 추가)
                window.currentEvalItems.filter(i => i.type !== '훈련생작성' && i.category === 'item').forEach(item => {
                    let rowsHtml = "";
                    let N = item.rowNames.length;
                    item.rowNames.forEach((rName, rIdx) => {
                        let shortName = rName.substring(0, 4); // 미니 표 공간을 위해 이름 축소
                        rowsHtml += `<tr><td style="border:1px solid #bdc3c7; padding:3px; font-weight:bold; background:#f8f9fa;" title="${rName}">${shortName}</td>
                            <td id="mini_cell_${item.idx}_${rIdx}_0" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', ${rIdx}, 0)"></td>
                            <td id="mini_cell_${item.idx}_${rIdx}_1" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', ${rIdx}, 1)"></td>
                            <td id="mini_cell_${item.idx}_${rIdx}_2" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', ${rIdx}, 2)"></td>
                            <td id="mini_cell_${item.idx}_${rIdx}_3" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', ${rIdx}, 3)"></td>
                            <td id="mini_cell_${item.idx}_${rIdx}_4" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', ${rIdx}, 4)"></td>
                        </tr>`;
                    });
                    
                    rightPanelHtml += `
                        <div style="background:#f8f9fa; border:1px solid #bdc3c7; border-radius:4px; padding:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="font-size:12px; font-weight:bold; color:#2c3e50; margin-bottom:2px; line-height:1.3; word-break:keep-all;">${item.name} <span style="color:#e74c3c;">(<span id="mini_score_display_${item.idx}">0</span>점)</span></div>
                            <div style="font-size:11px; font-weight:bold; color:#2980b9; margin-bottom:5px; line-height:1.2; word-break:keep-all;">▶ 핵심작업: ${item.coreTask}</div>
                            <table style="width:100%; border-collapse:collapse; text-align:center; font-size:10px;">
                                <tr style="background:#e3f2fd; color:#2c3e50;">
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:22%;">항목</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>우수</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">우수</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">보통</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">미흡</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>미흡</th>
                                </tr>
                                ${rowsHtml}
                            </table>
                        </div>
                    `;
                });

                // 2. 태도평가 항목 통합 렌더링
                let attItems = window.currentEvalItems.filter(i => i.category === 'attitude');
                if(attItems.length > 0) {
                    let attRowsHtml = "";
                    attItems.forEach((item) => {
                        let shortName = item.name.replace('작업', '').substring(0, 2);
                        attRowsHtml += `<tr><td style="border:1px solid #bdc3c7; padding:3px; font-weight:bold; background:#fdf2e9;">${shortName}</td>
                            <td id="mini_cell_${item.idx}_0_0" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', 0, 0)"></td>
                            <td id="mini_cell_${item.idx}_0_1" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', 0, 1)"></td>
                            <td id="mini_cell_${item.idx}_0_2" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', 0, 2)"></td>
                            <td id="mini_cell_${item.idx}_0_3" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', 0, 3)"></td>
                            <td id="mini_cell_${item.idx}_0_4" style="border:1px solid #bdc3c7; padding:3px; background:#fff; cursor:pointer; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'" onclick="clickMiniOMR('${item.idx}', 0, 4)"></td>
                        </tr>`;
                    });
                    
                    rightPanelHtml += `
                        <div style="background:#fdf2e9; border:1px solid #e67e22; border-radius:4px; padding:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="font-size:12px; font-weight:bold; color:#d35400; margin-bottom:5px; line-height:1.2;">태도평가 <span style="color:#e74c3c;">(<span id="mini_score_display_attitude">0</span>점)</span></div>
                            <table style="width:100%; border-collapse:collapse; text-align:center; font-size:10px;">
                                <tr style="background:#fae5d3; color:#d35400;">
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:22%;">항목</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>우수</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">우수</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">보통</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">미흡</th>
                                    <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>미흡</th>
                                </tr>
                                ${attRowsHtml}
                            </table>
                        </div>
                    `;
                }

                rightPanelHtml += `</div></div>`;
                return rightPanelHtml;
            })()}
            </div> </div> </div> <div id="omrModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; justify-content:center; align-items:center;">
                <div style="background:white; padding:20px; border-radius:8px; max-width:800px; width:95%; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    <h3 id="omrTitle" style="margin-top:0; color:#2c3e50; border-bottom:2px solid #3498db; padding-bottom:10px;">OMR 평가자 체크</h3>
                    <div id="omrTableContainer" style="margin-bottom:15px; max-height:400px; overflow-y:auto;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:16px; font-weight:bold; color:#c0392b;">실시간 득점: <span id="omrCurrentScore">0</span>점</div>
                        <div>
                            <button style="background:#95a5a6; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;" onclick="document.getElementById('omrModal').style.display='none'">취소</button>
                            <button style="background:#27ae60; color:white; border:none; padding:8px 20px; border-radius:4px; cursor:pointer; font-weight:bold; margin-left:10px;" onclick="applyOMR()">💾 점수 및 피드백 적용</button>
                        </div>
                    </div>
                </div>
            </div>
            `;

            document.getElementById('page4').innerHTML = html;

            // 💡 [데이터 주입] 화면 렌더링 후 첫 학생 정보 셋업 (저장된 정보 연동)
            if (studentList.length > 0) {
                setTimeout(() => {
                    const nameCell = document.getElementById('final_student_name_cell');
                    if (nameCell) nameCell.innerText = studentList[0];
                    loadStudentState(studentList[0]);
                }, 50);
            } else {
                setTimeout(() => {
                    window.currentEvalItems.forEach(item => {
                        if (item.type === '훈련생작성') processAutoScore(item.idx);
                    });
                }, 50);
            }
        }

        // 💡 [코어 엔진] 학생 명단 클릭 시 훈련생명 기입 및 시각적 스위치 제어
        window.selectStudent = function(studentName, btnElement) {
            saveCurrentStudentState(); // 💡 다른 학생으로 넘어가기 전 현재 작성중인 점수 메모리에 백업

            // 1. 훈련생명 칸에 데이터 주입
            const nameCell = document.getElementById('final_student_name_cell');
            if (nameCell) nameCell.innerText = studentName;

            // 2. 모든 버튼의 녹색(Active) 전력을 차단하고 회색(Inactive)으로 초기화
            const allBtns = document.querySelectorAll('.student-select-btn');
            allBtns.forEach(btn => {
                btn.style.background = "#ecf0f1";
                btn.style.color = "#7f8c8d";
                btn.style.borderColor = "#bdc3c7";
                btn.style.boxShadow = "none";
            });

            // 3. 클릭된 버튼에만 녹색(Active) 전력 인가
            btnElement.style.background = "#2ecc71";
            btnElement.style.color = "white";
            btnElement.style.borderColor = "#27ae60";
            btnElement.style.boxShadow = "inset 0 -3px 0 rgba(0,0,0,0.2)";
            
            // 💡 선택한 학생의 점수를 메모리에서 불러와 화면에 전송
            loadStudentState(studentName);
        };

        // =====================================================================
        // 💡 [코어 엔진] 역산 피드백 알고리즘 (Track A) & OMR 연동 (Track B)
        // =====================================================================
        
        const teacherRubrics = [
            ["전체 작업공정에 정확한 장비와 공구 사용", "일부 작업공정에 정확한 장비와 공구 사용", "작업공정에 유사 장비와 공구를 사용", "일부 작업공정에 부정확한 장비와 공구 사용", "전체 작업공정에 부정확한 장비와 공구 사용"],
            ["장비와 공구 사용 능력이 탁월함", "장비와 공구 사용 능력이 능숙함", "장비와 공구 사용 능력이 평범함", "장비와 공구 사용 능력이 미숙함", "장비와 공구 사용 능력이 매우 미숙함"],
            ["분해 순서가 매우 정확함|부품을 정리 정돈함|분해 결과가 매우 양호함", "분해 순서가 일부 틀림|부품을 정리 정돈함|분해 결과가 양호함", "분해 순서가 전체적으로 틀림|부품을 정리 정돈함|분해 결과가 보통임", "분해 순서가 전체적으로 틀림|부품을 정리 정돈 안 함|분해 결과가 불량함", "분해 순서가 전체적으로 틀림|부품을 정리 정돈 안 함|분해 결과가 매우 불량함"],
            ["조립 순서가 매우 정확함|부품 방향과 조립결과가 매우 양호함|부품 손상이 전혀 없음", "조립 순서가 일부 틀림|부품 방향과 조립결과가 양호함|부품 손상이 전혀 없음", "조립 순서가 전체적으로 틀림|부품 방향과 조립결과가 보통임|부품 손상이 전혀 없음", "조립 순서가 전체적으로 틀림|부품 방향과 조립결과가 불량함|부품 손상이 일부 있음", "조립 순서가 전체적으로 틀림|부품 방향과 조립결과가 매우 불량함|부품 손상이 발생 됨"],
            ["마무리 확인능력이 탁월함", "마무리 확인능력이 능숙함", "마무리 확인능력이 평범함", "마무리 확인능력이 미숙함", "마무리 확인 안함"]
        ];

        const attitudeRubrics = [
            ["작업 복장이 전체 올바름|작업장 안전수칙을 준수함", "작업 복장이 일부 불량함|작업장 안전수칙을 준수함", "작업 복장이 일부 불량함|작업장 안전수칙 일부 미준수함", "작업 복장이 불량함|작업장 안전수칙을 미준수함", "작업복장이 매우 불량함|작업장 안전수칙을 미준수함"],
            ["장비와 공구 선택, 분해순서, 조립순서, 조립 후 검사항목을 숙지하고 절차대로 평가에 임함", "분해순서, 조립순서, 조립 후 검사항목을 숙지하고 절차대로 평가에 임함", "분해순서, 조립순서를 숙지하고 절차대로 평가에 임함", "분해순서, 조립순서를 대충 숙지하고 절차대로 평가에 임함", "장비와 공구 선택, 분해순서, 조립순서, 조립 후 검사항목에 대한 숙지가 전혀 안 됨"],
            ["작업별 안전수칙을 정확히 준수하며 작업에 임함|평가자의 지시를 정확히 이해하고 작업에 임함", "작업별 안전수칙 일부를 무시하고 작업에 임함|평가자의 지시를 정확히 이해하고 작업에 임함", "작업별 안전수칙 일부 미준수하고 작업에 임함|평가자의 지시를 일부 이해하고 작업에 임함", "작업별 안전수칙 무시하고 작업에 임함|평가자의 지시를 일부 이해하고 작업에 임함", "작업별 안전수칙 무시하고 작업에 임함|평가자의 지시를 무시하고 작업에 임함"],
            ["작업 후 사용한 장비·공구 및 작업공간 정리 정돈을 매우 잘함", "작업 후 사용한 장비·공구 및 작업공간 정리 정돈을 잘함", "작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 보통임", "작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 미흡함", "작업 후 사용한 장비·공구 및 작업공간 정리 정돈이 매우 미흡함"]
        ];

        window.processAutoScore = function(itemKey, isAutoLoad = false) {
            const inputEl = document.getElementById(`score_input_${itemKey}`);
            const printTd = document.getElementById(`print_score_${itemKey}`);
            const item = window.currentEvalItems.find(i => i.idx == itemKey);
            
            const rawVal = parseFloat(inputEl.value);
            
            const clearMiniTable = () => {
                for(let r=0; r<5; r++) {
                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${itemKey}_${r}_${c}`);
                        if(cell) { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                    }
                }
            };

            if (isNaN(rawVal)) { 
                printTd.innerText = "";
                delete window.activeFeedbacks[itemKey]; 
                clearMiniTable();
                renderFeedbackZone(); 
                return; 
            }
            
            const val = Math.round(rawVal * 10) / 10;
            let validSums = []; let comboMap = {}; 
            let isTrainee = item.type === '훈련생작성';

            if (isTrainee) {
                let s1 = Math.round(item.score * 0.3); let s2 = Math.round(item.score * 0.3);
                let s4 = Math.round(item.score * 0.2); let s3 = item.score - (s1 + s2 + s4);
                let p = [{n:"이상 부위", s:s1}, {n:"내용 및 상태", s:s2}, {n:"판정", s:s3}, {n:"정비 및 조치사항", s:s4}];
                
                for(let i=0; i<16; i++){
                    let sum = 0; let wrong = [];
                    for(let j=0; j<4; j++){ if ((i>>j)&1) sum+=p[j].s; else wrong.push(p[j].n); }
                    sum = Math.round(sum*10)/10;
                    if(!comboMap[sum]) { comboMap[sum] = []; validSums.push(sum); }
                    comboMap[sum].push(wrong);
                }
                validSums.sort((a,b)=>a-b);
                
                if (!validSums.includes(val)) { 
                    clearMiniTable(); 
                    if (isAutoLoad) {
                        printTd.innerText = val;
                        delete window.activeFeedbacks[itemKey];
                        renderFeedbackZone();
                        return;
                    }
                    return rejectScore(inputEl, printTd, itemKey, validSums); 
                }

                let combos = comboMap[val];
                let selectedWrong = combos[Math.floor(Math.random() * combos.length)];
                if (selectedWrong.length > 0) {
                    window.activeFeedbacks[itemKey] = `${item.coreTask} 수행 시 ${selectedWrong.join(', ')} 틀림.`;
                } else {
                    delete window.activeFeedbacks[itemKey];
                }
            } else if (item.category === 'attitude') {
                validSums = [1, 2, 3, 4, 5];
                if (!validSums.includes(val)) { 
                    clearMiniTable(); 
                    if (isAutoLoad) {
                        printTd.innerText = val;
                        delete window.activeFeedbacks[itemKey];
                        renderFeedbackZone();
                        return;
                    }
                    return rejectScore(inputEl, printTd, itemKey, validSums); 
                }
                
                let levelIdx = 5 - val;
                for(let c=0; c<5; c++) {
                    let cell = document.getElementById(`mini_cell_${itemKey}_0_${c}`);
                    if(cell) {
                        if(c === levelIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        else { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                    }
                }

                let options = attitudeRubrics[parseInt(String(itemKey).replace('A',''))][levelIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                let realItems = window.currentEvalItems.filter(i => i.category === 'item');
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (levelIdx > 0) window.activeFeedbacks[itemKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[itemKey];
            } else {
                let N = item.rowNames.length;
                let rS = item.score / N;
                let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                
                let combos = [];
                function findCombos(row, currentSum, currentPath) {
                    if (row === N) {
                        if (Math.round(currentSum*10)/10 === val) combos.push([...currentPath]);
                        return;
                    }
                    if (row >= 5) {
                        currentPath.push(0); // 💡 6번째 항목부터는 무조건 만점(0번 인덱스) 강제 투입
                        findCombos(row + 1, currentSum + v[0], currentPath);
                        currentPath.pop();
                    } else {
                        for(let i=0; i<5; i++) {
                            currentPath.push(i);
                            findCombos(row + 1, currentSum + v[i], currentPath);
                            currentPath.pop();
                        }
                    }
                }
                findCombos(0, 0, []);
                
                // validSums 생성을 위한 로직 추가 (경고창 표시용)
                let validSumsSet = new Set();
                function findValidSums(row, currentSum) {
                    if (row === N) { validSumsSet.add(Math.round(currentSum * 10) / 10); return; }
                    if (row >= 5) { findValidSums(row + 1, currentSum + v[0]); } 
                    else { for (let i = 0; i < 5; i++) findValidSums(row + 1, currentSum + v[i]); }
                }
                findValidSums(0, 0);
                validSums = Array.from(validSumsSet).sort((a,b)=>a-b);

                if (combos.length === 0) { 
                    clearMiniTable(); 
                    if (isAutoLoad) { 
                        printTd.innerText = val; 
                        let miniDisplay = document.getElementById(`mini_score_display_${itemKey}`);
                        if(miniDisplay) miniDisplay.innerText = val;
                        delete window.activeFeedbacks[itemKey]; 
                        renderFeedbackZone(); 
                        return; 
                    }
                    return rejectScore(inputEl, printTd, itemKey, validSums); 
                }

                combos.sort((a,b) => a.filter(x=>x===0).length - b.filter(x=>x===0).length); 
                let bestCombos = combos.filter(c => c.filter(x=>x===0).length === combos[0].filter(x=>x===0).length);
                let selected = bestCombos[Math.floor(Math.random() * bestCombos.length)];

                selected.forEach((levelIdx, rowIdx) => {
                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${itemKey}_${rowIdx}_${c}`);
                        if(cell) {
                            if(c === levelIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                            else { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                        }
                    }
                });

                let texts = [];
                selected.forEach((levelIdx, rowIdx) => {
                    if(levelIdx > 0 && rowIdx < 5) { // 💡 5번째까지만 피드백 생성
                        let options = teacherRubrics[rowIdx][levelIdx].split('|');
                        texts.push(options[Math.floor(Math.random() * options.length)]);
                    }
                });

                if(texts.length > 0) window.activeFeedbacks[itemKey] = `${item.coreTask} 수행 시 ${texts.join(', ')}.`;
                else delete window.activeFeedbacks[itemKey];
            }
            
            printTd.innerText = val;
            let miniDisplay = document.getElementById(`mini_score_display_${itemKey}`);
            if(miniDisplay) miniDisplay.innerText = val; // 💡 우측 패널 채점점수 실시간 업데이트
            renderFeedbackZone();
        };

        window.rejectScore = function(inputEl, printTd, key, arr) {
            alert(`⚠️ 허용되지 않는 점수입니다.\n▶ 가능한 점수: ${arr.join(', ')}`);
            inputEl.value = ""; printTd.innerText = ""; delete window.activeFeedbacks[key]; renderFeedbackZone();
        }

        let currentOMRKey = "";
        window.openOMR = function(itemKey) {
            currentOMRKey = itemKey;
            const item = window.currentEvalItems.find(i => i.idx == itemKey);
            document.getElementById('omrTitle').innerText = `[${item.name}] OMR 평가자 체크`;
            
            let html = `<style>.omr-td { cursor:pointer; padding:10px; border:1px solid #bdc3c7; transition:0.2s; } .omr-td:hover { background:#ecf0f1; } .omr-selected { background:#ffeaa7 !important; border:2px solid #e67e22 !important; font-weight:bold; color:#d35400; }</style><table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px;">`;
            
            if (item.type === '훈련생작성') {
                let s1 = Math.round(item.score * 0.3); let s2 = Math.round(item.score * 0.3);
                let s4 = Math.round(item.score * 0.2); let s3 = item.score - (s1 + s2 + s4);
                let p = [{n:"이상 부위", s:s1}, {n:"내용 및 상태", s:s2}, {n:"판정", s:s3}, {n:"정비 및 조치사항", s:s4}];
                html += `<tr><th style="background:#e0ffff; padding:8px;">항목</th><th style="background:#e0ffff;">정답 (만점)</th><th style="background:#e0ffff;">오답 (0점)</th></tr>`;
                p.forEach((part, r) => {
                    html += `<tr data-row="${r}"><th>${part.n}</th><td class="omr-td" data-val="${part.s}" data-level="0" onclick="selectOMR(this)">정답 (${part.s}점)</td><td class="omr-td" data-val="0" data-level="1" onclick="selectOMR(this)">오답 (0점)</td></tr>`;
                });
            } else {
                let N = item.rowNames ? item.rowNames.length : 5;
                if (item.category === 'attitude') N = 1;
                let rS = item.score / N;
                let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                let cols = ["매우우수","우수","보통","미흡","매우미흡"];
                html += `<tr><th style="background:#e0ffff; padding:8px;">평가영역</th>`;
                cols.forEach((c,i) => html += `<th style="background:#e0ffff;">${c}(${v[i]}점)</th>`); html += `</tr>`;
                
                let rowNames = item.category === 'attitude' ? [item.name] : item.rowNames;
                rowNames.forEach((rName, r) => {
                    html += `<tr data-row="${r}"><th>${rName}</th>`;
                    for(let c=0; c<5; c++) {
                        let cellText = "";
                        if (item.category === 'attitude') {
                            cellText = attitudeRubrics[parseInt(itemKey.replace('A',''))][c].replace(/\|/g, '<br><span style="color:#999; font-size:10px;">or</span><br>');
                        } else if (r < 5) { 
                            cellText = teacherRubrics[r][c].replace(/\|/g, '<br><span style="color:#999; font-size:10px;">or</span><br>'); 
                        } else { 
                            cellText = c===0 ? "매우 우수함" : (c===1 ? "우수함" : (c===2 ? "보통임" : (c===3 ? "미흡함" : "매우 미흡함"))); 
                        }
                        html += `<td class="omr-td" data-val="${v[c]}" data-level="${c}" onclick="selectOMR(this)">${cellText}</td>`;
                    }
                    html += `</tr>`;
                });
            }
            html += `</table>`;
            document.getElementById('omrTableContainer').innerHTML = html;
            document.getElementById('omrCurrentScore').innerText = "0";
            document.getElementById('omrModal').style.display = 'flex';
        };

        window.selectOMR = function(td) {
            let tr = td.closest('tr');
            tr.querySelectorAll('.omr-td').forEach(c => c.classList.remove('omr-selected'));
            td.classList.add('omr-selected');
            let total = 0;
            document.querySelectorAll('#omrTableContainer .omr-selected').forEach(c => total += parseFloat(c.getAttribute('data-val')));
            document.getElementById('omrCurrentScore').innerText = Math.round(total * 10) / 10;
        };

        window.applyOMR = function() {
            const item = window.currentEvalItems.find(i => i.idx == currentOMRKey);
            const selected = document.querySelectorAll('#omrTableContainer .omr-selected');
            let expectedRows = item.type === '훈련생작성' ? 4 : (item.category === 'attitude' ? 1 : item.rowNames.length);
            if (selected.length !== expectedRows) return alert("⚠️ 모든 항목에 체크를 완료해 주십시오.");

            let total = parseFloat(document.getElementById('omrCurrentScore').innerText);
            
            // 💡 컨트롤 패널과 A4 용지에 점수 동시 적용
            document.getElementById(`score_input_${currentOMRKey}`).value = total;
            document.getElementById(`print_score_${currentOMRKey}`).innerText = total;

            let texts = [];
            if (item.type === '훈련생작성') {
                let pNames = ["이상 부위", "내용 및 상태", "판정", "정비 및 조치사항"];
                selected.forEach((td, i) => { if(td.getAttribute('data-level') === "1") texts.push(pNames[i]); });
                if (texts.length > 0) window.activeFeedbacks[currentOMRKey] = `${item.coreTask} 수행 시 ${texts.join(', ')} 틀림.`;
                else delete window.activeFeedbacks[currentOMRKey];
            } else if (item.category === 'attitude') {
                let td = selected[0];
                let levelIdx = parseInt(td.getAttribute('data-level'));
                
                // 💡 [미니 표 업데이트] 태도 평가 OMR 체크 시
                for(let c=0; c<5; c++) {
                    let cell = document.getElementById(`mini_cell_${currentOMRKey}_0_${c}`);
                    if(cell) {
                        if(c === levelIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        else { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                    }
                }

                let options = attitudeRubrics[parseInt(currentOMRKey.replace('A',''))][levelIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                
                let realItems = window.currentEvalItems.filter(i => i.category === 'item');
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (levelIdx > 0) window.activeFeedbacks[currentOMRKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[currentOMRKey];
            } else {
                selected.forEach((td, r) => {
                    let levelIdx = parseInt(td.getAttribute('data-level'));
                    
                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${currentOMRKey}_${r}_${c}`);
                        if(cell) {
                            if(c === levelIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                            else { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                        }
                    }

                    if(levelIdx > 0 && r < 5) { // 💡 추가된 항목 피드백 방지
                        let options = teacherRubrics[r][levelIdx].split('|');
                        texts.push(options[Math.floor(Math.random() * options.length)]);
                    }
                });
                if (texts.length > 0) window.activeFeedbacks[currentOMRKey] = `${item.coreTask} 수행 시 ${texts.join(', ')}.`;
                else delete window.activeFeedbacks[currentOMRKey];
            }
            
            document.getElementById('omrModal').style.display = 'none';
            renderFeedbackZone();
        };

// 💡 [신규 모터 8] 미니 추적기 다이렉트 클릭 역산 엔진 (표를 클릭하면 점수가 됨)
        window.clickMiniOMR = function(itemKey, rowIdx, colIdx) {
            const item = window.currentEvalItems.find(i => i.idx == itemKey);
            if (!item) return;

            if (item.category === 'attitude') {
                let val = 5 - colIdx; // 0열=5점, 1열=4점...
                
                // 1. 클릭한 줄 UI 색칠
                for(let c=0; c<5; c++) {
                    let cell = document.getElementById(`mini_cell_${itemKey}_0_${c}`);
                    if(cell) {
                        if(c === colIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        else { cell.innerHTML = ''; cell.style.backgroundColor = '#fff'; }
                    }
                }
                
                // 2. 점수판/A4 용지 실시간 점수 쏘기
                document.getElementById(`score_input_${itemKey}`).value = val;
                document.getElementById(`print_score_${itemKey}`).innerText = val;

                // 3. 해당 칸의 정밀 피드백 텍스트 뽑아오기
                let options = attitudeRubrics[parseInt(String(itemKey).replace('A',''))][colIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                let realItems = window.currentEvalItems.filter(i => i.category === 'item');
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (colIdx > 0) window.activeFeedbacks[itemKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[itemKey];

                renderFeedbackZone(); // 4. 전체 합산 렌더링
                
            } else {
                // 1. 클릭한 항목 줄 UI 색칠
                for(let c=0; c<5; c++) {
                    let cell = document.getElementById(`mini_cell_${itemKey}_${rowIdx}_${c}`);
                    if(cell) {
                        if(c === colIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        else { cell.innerHTML = ''; cell.style.backgroundColor = '#fff'; }
                    }
                }

                // 2. 표 전체의 점수 연산 준비
                let rS = item.score / 5;
                let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                
                let total = 0;
                let texts = [];
                
                // 3. N줄의 체크 상태를 스캔하여 합산 (체크 안 된 줄이 있으면 자동으로 만점(0열) 채움)
                let N = item.rowNames.length;
                for(let r=0; r<N; r++) {
                    let selectedCol = -1;
                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${itemKey}_${r}_${c}`);
                        if(cell && cell.innerHTML.includes('✔')) { selectedCol = c; break; }
                    }
                    // 💡 6번째 항목부터는 클릭을 방지했더라도 스캔 시 무조건 만점 배정
                    if (selectedCol === -1 || r >= 5) { 
                        selectedCol = 0; 
                        let cell = document.getElementById(`mini_cell_${itemKey}_${r}_0`);
                        if(cell) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        for(let c=1; c<5; c++) {
                            let clearCell = document.getElementById(`mini_cell_${itemKey}_${r}_${c}`);
                            if(clearCell) { clearCell.innerHTML = ''; clearCell.style.backgroundColor = '#fff'; }
                        }
                    }
                    total += v[selectedCol];
                    
                    if (selectedCol > 0 && r < 5) { // 💡 추가 항목 피드백 추출 방어
                        let options = teacherRubrics[r][selectedCol].split('|');
                        texts.push(options[Math.floor(Math.random() * options.length)]);
                    }
                }

                // 4. 점수 쏘기 및 피드백 생성
                total = Math.round(total * 10) / 10;
                document.getElementById(`score_input_${itemKey}`).value = total;
                document.getElementById(`print_score_${itemKey}`).innerText = total;

                if(texts.length > 0) window.activeFeedbacks[itemKey] = `${item.coreTask} 수행 시 ${texts.join(', ')}.`;
                else delete window.activeFeedbacks[itemKey];

                renderFeedbackZone();
            }
        };



        window.renderFeedbackZone = function() {
            let zone = document.getElementById('feedback_zone');
            
            // 💡 전체 총합 계산 회로
            let totalScore = 0;
            let attTotalScore = 0; // 💡 태도평가 실시간 점수 합산 엔진
            let allFilled = true;
            window.currentEvalItems.forEach(item => {
                let inputVal = parseFloat(document.getElementById(`score_input_${item.idx}`).value);
                if (isNaN(inputVal)) allFilled = false;
                else {
                    totalScore += inputVal;
                    if (item.category === 'attitude') attTotalScore += inputVal; // 태도평가 점수만 따로 누적
                }
            });

            // 💡 우측 패널의 태도평가 실시간 점수(0~20점) 출력
            let attMiniDisplay = document.getElementById('mini_score_display_attitude');
            if (attMiniDisplay) attMiniDisplay.innerText = Math.round(attTotalScore * 10) / 10;

            let displayScore = Math.round(totalScore * 10) / 10;
            
            // 💡 상단 최종점수 입력칸 실시간 동기화
            let finalInput = document.getElementById('final_total_score_input');
            if (finalInput) {
                finalInput.value = allFilled ? displayScore : "";
            }

            // 💡 [신규 추가] 훈련생 명단 버튼 아래의 뱃지(점수) 실시간 동기화
            let currentStu = document.getElementById('final_student_name_cell')?.innerText;
            let badge = document.getElementById(`stu_score_badge_${currentStu}`);
            if (badge) {
                badge.innerText = allFilled ? displayScore + "점" : "-점";
            }

            // 💡 [신규 탑재] 성취수준 자동 계산 및 상단 표 기입 센서
            let achievementLevel = "";
            if (allFilled) {
                if (displayScore >= 90) achievementLevel = 5;
                else if (displayScore >= 80) achievementLevel = 4;
                else if (displayScore >= 70) achievementLevel = 3;
                else if (displayScore >= 60) achievementLevel = 2;
                else achievementLevel = 1;
            }
            let levelTd = document.getElementById('final_achievement_level');
            if (levelTd) {
                levelTd.innerText = achievementLevel;
            }

            // 💡 [신규 탑재] 합격/불합격 여부 자동 체크 센서
            let passMark = document.getElementById('pass_check_mark');
            let failMark = document.getElementById('fail_check_mark');
            if (passMark && failMark) {
                if (allFilled) {
                    let checkIcon = '<span style="color:#e74c3c; font-weight:bold; font-size:18px;">✔</span>';
                    if (displayScore >= 60) {
                        passMark.innerHTML = checkIcon;
                        failMark.innerHTML = "";
                    } else {
                        passMark.innerHTML = "";
                        failMark.innerHTML = checkIcon;
                    }
                } else {
                    passMark.innerHTML = "";
                    failMark.innerHTML = "";
                }
            }

            let unitNameStr = document.getElementById('S1_2').value || document.getElementById('S1_1').value;

            // 💡 총점 100점 달성 시 특수 피드백 단독 출력 (기존 유지)
            if (allFilled && displayScore === 100) {
                zone.innerHTML = `<div style="color: #c0392b; line-height: 1.6; margin: 0;">총점 100점으로 ${unitNameStr} 수행 시 모든작업을 우수하게 진행하여 성취수준 5단계를 취득함.</div>`;
                return;
            }

            let rawFeedbacks = Object.values(window.activeFeedbacks).filter(txt => txt && txt.trim() !== "");
            if (rawFeedbacks.length === 0) {
                zone.innerHTML = `<span style="color:#7f8c8d;">※ 상단의 컨트롤 패널에서 점수를 기입하거나 [✔ OMR 체크] 버튼을 누르면 피드백이 자동 생성됩니다.</span>`;
                return;
            }

            // 💡 중복 핵심작업 명칭 자동 병합(Grouping) 모터
            let grouped = {};
            rawFeedbacks.forEach(txt => {
                let parts = txt.split(' 수행 시 ');
                if (parts.length === 2) {
                    let prefix = parts[0];
                    let content = parts[1].replace(/\.$/, '').trim(); // 끝에 있는 마침표를 잠시 절단
                    if (!grouped[prefix]) grouped[prefix] = [];
                    grouped[prefix].push(content);
                } else {
                    if (!grouped['기타']) grouped['기타'] = [];
                    grouped['기타'].push(txt);
                }
            });

            let finalFeedbacks = [];
            
            // 💡 [신규 탑재] 100점 미만일 경우 첫 줄에 고정 평가 맨트 주입
            if (allFilled) {
                finalFeedbacks.push(`${unitNameStr} 평가 시 총점 ${displayScore}점으로 ${achievementLevel}단계 성취수준을 취득함.`);
            }

            for (let prefix in grouped) {
                if (prefix === '기타') {
                    finalFeedbacks.push(...grouped[prefix]);
                } else {
                    let mergedContent = grouped[prefix].join(' 및 '); // " 및 " 으로 용접
                    finalFeedbacks.push(`${prefix} 수행 시 ${mergedContent}.`); // 마지막에 마침표 다시 부착
                }
            }

            // 💡 [스타일 일괄 적용] 각각의 div 마진을 없애고 통째로 묶은 뒤 <br>로 연결. 폰트/색상 동일하게 유지
            zone.innerHTML = `<div style="color: #c0392b; line-height: 1.6; margin: 0;">` + finalFeedbacks.join('<br>') + `</div>`;
        };

        // 💡 [신규 탑재] 대시보드 전체 초기화 회로
        window.resetAllScores = function() {
            if(!confirm("채점 대시보드의 모든 점수를 초기화하시겠습니까?\n(※ '훈련생작성' 항목은 기본 만점으로 돌아가며, 시간평가는 0점으로 고정됩니다.)")) return;
            
            window.currentEvalItems.forEach(item => {
                let inputEl = document.getElementById(`score_input_${item.idx}`);
                if (item.type === '훈련생작성') {
                    inputEl.value = item.score;
                } else {
                    inputEl.value = "";
                }
                processAutoScore(item.idx, true); // 💡 초기화 로드 중임을 알림
            });
        };


        // 💡 [신규 탑재] 역산 추론 알고리즘 (DP 동적 계획법 기반 자동 분배 엔진)
        window.reverseCalculateScore = function(targetVal) {
            let target = parseFloat(targetVal);
            if(isNaN(target) || target < 0 || target > 100) return alert("⚠️ 0~100 사이의 올바른 점수를 입력하세요.");

            let traineeSum = 0;
            let teacherItems = [];
            
            // 1. 각 평가 항목별 가능한 점수 체계 스캔
            window.currentEvalItems.forEach(item => {
                if(item.type === '훈련생작성') {
                    traineeSum += item.score; // 훈련생은 항상 만점 고정
                } else {
                    let validSums = [];
                    if (item.category === 'attitude') {
                        validSums = [1, 2, 3, 4, 5];
                    } else {
                        let rS = item.score / 5;
                        let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                        let cMap = {};
                        for(let a=0;a<5;a++)for(let b=0;b<5;b++)for(let c=0;c<5;c++)for(let d=0;d<5;d++)for(let e=0;e<5;e++){
                            let s = Math.round((v[a]+v[b]+v[c]+v[d]+v[e])*10)/10;
                            if(!cMap[s]) { cMap[s] = true; validSums.push(s); }
                        }
                        validSums.sort((a,b)=>a-b);
                    }
                    let intValids = validSums.map(x => Math.round(x*10));
                    // 💡 [추가] 편차 계산을 위해 해당 항목의 최고점(만점) 수치도 함께 기억
                    teacherItems.push({ idx: item.idx, intValids: intValids, maxIntVal: Math.max(...intValids) });
                }
            });

            let intRemainder = Math.round((target - traineeSum)*10);

            // 2. DP 배열을 통한 모든 경로(경우의 수) 탐색 (단일 저장이 아닌 배열 누적 저장으로 변경)
            let dp = Array(teacherItems.length + 1).fill(null).map(() => ({}));
            dp[0][0] = [{ valid: true }]; // 0단계 초기화

            for (let i = 0; i < teacherItems.length; i++) {
                let currentValids = teacherItems[i].intValids;
                
                for (let prevSumStr in dp[i]) {
                    let prevSum = parseInt(prevSumStr);
                    for (let v of currentValids) {
                        let newSum = prevSum + v;
                        if (!dp[i+1][newSum]) {
                            dp[i+1][newSum] = []; // 경로를 담을 빈 상자 준비
                        }
                        // 💡 기존의 덮어쓰기 로직 폐기! 도달 가능한 모든 발자취를 전부 누적 저장
                        dp[i+1][newSum].push({ prevSum: prevSum, val: v });
                    }
                }
            }

            // 3. 수학적으로 도달 불가능한 점수일 경우 경고
            if (!dp[teacherItems.length][intRemainder] || dp[teacherItems.length][intRemainder].length === 0) {
                document.getElementById('final_total_score_input').value = ""; 
                return alert(`⚠️ 선택하신 점수(${target}점)를 구성할 수 있는 수학적 배점 조합이 존재하지 않습니다.\n(※ 훈련생 만점을 기본으로 한 상태에서 채점 규칙상 도달할 수 없는 점수입니다.)`);
            }

            // 4. 백트래킹으로 모든 경우의 수 추출 후 '편차 최소화(상식적 조합)' 필터링
            let allValidCombos = [];
            function findPaths(itemIdx, currentSum, currentPath) {
                if (itemIdx === 0) {
                    if (currentSum === 0) allValidCombos.push([...currentPath].reverse());
                    return;
                }
                let possiblePaths = dp[itemIdx][currentSum];
                if (!possiblePaths) return;
                for (let step of possiblePaths) {
                    currentPath.push(step.val);
                    findPaths(itemIdx - 1, step.prevSum, currentPath);
                    currentPath.pop();
                }
            }
            findPaths(teacherItems.length, intRemainder, []);

            // 💡 [핵심 1] 컴퓨터의 탐색 순서(위쪽 항목 편향)를 박살내기 위해 전체 배열을 100% 무작위 셔플
            for (let i = allValidCombos.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allValidCombos[i], allValidCombos[j]] = [allValidCombos[j], allValidCombos[i]];
            }

            // 💡 [핵심 2] %가 아닌 '등급 하락 수준(0~4단계)'을 기준으로 비상식성(페널티) 측정
            let scoredCombos = allValidCombos.map(combo => {
                // 각 항목이 만점(0)에서 몇 단계 떨어졌는지 계산 (매우우수=0, 우수=1 ... 매우미흡=4)
                let levels = combo.map((val, idx) => Math.round(5 - ((val / teacherItems[idx].maxIntVal) * 5)));
                // 한 곳에 몰빵된 4단계 하락(16점 페널티)을 피하고, 골고루 퍼진 1단계 하락(1점 페널티 여러 개)을 선호하게 제곱합 계산
                let penalty = levels.reduce((sum, lvl) => sum + Math.pow(lvl, 2), 0);
                return { combo: combo, penalty: penalty };
            });

            // 💡 [핵심 3] 페널티가 적은(가장 상식적이고 골고루 분포된) 순서대로 정렬
            scoredCombos.sort((a, b) => a.penalty - b.penalty);

            // 💡 [핵심 4] 선생님 지시대로 완벽히 상식적인 최상위 10개만 추출하여 1/10 확률로 적용!
            let top10 = scoredCombos.slice(0, 10);
            let finalChoice = top10[Math.floor(Math.random() * top10.length)];
            let resultVals = finalChoice.combo.map(v => v / 10);

            // 5. 대시보드 점수 일괄 폭격 및 피드백 생성트리거 가동
            window.currentEvalItems.forEach(item => {
                let inputEl = document.getElementById(`score_input_${item.idx}`);
                if(item.type === '훈련생작성') {
                    inputEl.value = item.score;
                } else {
                    let matchIdx = teacherItems.findIndex(ti => ti.idx === item.idx);
                    inputEl.value = resultVals[matchIdx];
                }
                processAutoScore(item.idx);
            });
        };

        // 💡 [신규 모터 9] 학생별 점수 임시 보관 및 전체 저장 엔진
        window.studentScoresData = {};

        window.saveCurrentStudentState = function() {
            const currentStu = document.getElementById('final_student_name_cell')?.innerText;
            if (!currentStu || currentStu === "훈련생명" || currentStu === "") return;

            let items = {};
            let allFilled = true;
            let total = 0;
            window.currentEvalItems.forEach(item => {
                let val = document.getElementById(`score_input_${item.idx}`).value;
                items[item.idx] = val;
                if (val === "") allFilled = false;
                else total += parseFloat(val);
            });
            
            let finalInput = document.getElementById('final_total_score_input').value;
            let finalTotal = finalInput !== "" ? parseFloat(finalInput) : (allFilled ? total : null);

            window.studentScoresData[currentStu] = {
                items: items,
                totalScore: finalTotal !== null ? Math.round(finalTotal * 10) / 10 : "-"
            };
        };

        window.loadStudentState = function(stu) {
            const data = window.studentScoresData[stu];
            if (data && data.items) {
                window.currentEvalItems.forEach(item => {
                    document.getElementById(`score_input_${item.idx}`).value = data.items[item.idx] !== undefined ? data.items[item.idx] : "";
                    processAutoScore(item.idx, true); // 💡 자동 로드 중임을 알림
                });
            } else {
                window.currentEvalItems.forEach(item => {
                    let defaultVal = (item.type === '훈련생작성') ? item.score : "";
                    document.getElementById(`score_input_${item.idx}`).value = defaultVal;
                    processAutoScore(item.idx, true); // 💡 자동 로드 중임을 알림
                });
            }
        };

        window.saveAllFinalResults = async function() {
            saveCurrentStudentState(); 

            // 💡 본평가 시, 점수가 있는 모든 학생에게 '본평가' 낙인을 찍어줍니다.
            for (let stu in window.studentScoresData) {
                if (stu !== "_gradingSettings" && window.studentScoresData[stu].totalScore !== "-") {
                    window.studentScoresData[stu].savedMode = '본평가';
                }
            }

            let minScore = parseFloat(document.getElementById('auto_score_min')?.value || 97);
            let maxScore = parseFloat(document.getElementById('auto_score_max')?.value || 100);
            let max100 = parseInt(document.getElementById('auto_score_max100')?.value || 3);
            window.studentScoresData._gradingSettings = { min: minScore, max: maxScore, max100: max100 };

            if (!confirm(`[본평가] 전체 학생의 최종 점수를 통합 DB에 저장하시겠습니까?\n(※ 본평가 모드에서만 전체 저장이 가능합니다.)`)) return;

            try {
                // 무조건 '본평가' 경로에 덮어씌워 통합을 완성합니다.
                await database.ref(`${currentClass}/evalScores/본평가/${currentDbKey}`).set(window.studentScoresData);
                alert("✅ 전체 학생 평가 결과가 본평가 기준으로 통합 저장되었습니다!");
                buildFinalResultDocs(); // 레이더(색상) 동기화를 위해 화면 새로고침
            } catch(e) {
                alert("❌ 저장 실패: " + e.message);
            }
        };

        // 📍 [신규 모터] 추가/재평가용 개별 저장 엔진
        window.saveIndividualFinalResult = async function() {
            saveCurrentStudentState();
            
            const currentStu = document.getElementById('final_student_name_cell')?.innerText;
            if (!currentStu || currentStu === "훈련생명" || currentStu === "") return alert("⚠️ 저장할 훈련생을 선택해주세요.");

            if (window.studentScoresData[currentStu].totalScore === "-") {
                return alert("⚠️ 해당 학생의 점수가 입력되지 않았습니다.");
            }

            // 선택된 학생에게만 현재 모드(추가평가/재평가) 낙인을 찍습니다.
            window.studentScoresData[currentStu].savedMode = currentEvalMode; 

            if (!confirm(`[${currentEvalMode}] '${currentStu}' 훈련생의 점수만 통합 DB에 업데이트하시겠습니까?\n(해당 학생의 최종 점수가 갱신됩니다.)`)) return;

            try {
                // 해당 학생의 데이터만 핀포인트로 업데이트하여 병목과 다른 학생 데이터 훼손을 방지합니다.
                await database.ref(`${currentClass}/evalScores/본평가/${currentDbKey}/${currentStu}`).set(window.studentScoresData[currentStu]);
                alert(`✅ '${currentStu}' 훈련생의 [${currentEvalMode}] 점수가 최종 점수로 갱신되었습니다!`);
                buildFinalResultDocs(); // 화면 새로고침
            } catch(e) {
                alert("❌ 개별 저장 실패: " + e.message);
            }
        };

        // 💡 [신규 모터] 백그라운드 DP 역산 엔진 (화면에 없는 학생도 채점 가능)
        window.getAutoScoreBreakdown = function(target) {
            let traineeSum = 0;
            let teacherItems = [];
            
            window.currentEvalItems.forEach(item => {
                if(item.type === '훈련생작성') {
                    traineeSum += item.score; 
                } else {
                    let validSums = [];
                    if (item.category === 'attitude') {
                        validSums = [1, 2, 3, 4, 5];
                    } else {
                        let N = item.rowNames.length;
                        let rS = item.score / N;
                        let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                        let validSumsSet = new Set();
                        function findItemSums(row, currentSum) {
                            if (row === N) { validSumsSet.add(Math.round(currentSum * 10) / 10); return; }
                            if (row >= 5) { findItemSums(row + 1, currentSum + v[0]); }
                            else { for (let i = 0; i < 5; i++) findItemSums(row + 1, currentSum + v[i]); }
                        }
                        findItemSums(0, 0);
                        validSums = Array.from(validSumsSet).sort((a,b)=>a-b);
                    }
                    let intValids = validSums.map(x => Math.round(x*10));
                    teacherItems.push({ idx: item.idx, intValids: intValids, maxIntVal: Math.max(...intValids) });
                }
            });

            let intRemainder = Math.round((target - traineeSum)*10);
            let dp = Array(teacherItems.length + 1).fill(null).map(() => ({}));
            dp[0][0] = [{ valid: true }]; 

            for (let i = 0; i < teacherItems.length; i++) {
                let currentValids = teacherItems[i].intValids;
                for (let prevSumStr in dp[i]) {
                    let prevSum = parseInt(prevSumStr);
                    for (let v of currentValids) {
                        let newSum = prevSum + v;
                        if (!dp[i+1][newSum]) dp[i+1][newSum] = [];
                        dp[i+1][newSum].push({ prevSum: prevSum, val: v });
                    }
                }
            }

            if (!dp[teacherItems.length][intRemainder] || dp[teacherItems.length][intRemainder].length === 0) {
                return null; // 채점 규정상 도달할 수 없는 수학적 오류 점수
            }

            let allValidCombos = [];
            function findPaths(itemIdx, currentSum, currentPath) {
                if (itemIdx === 0) {
                    if (currentSum === 0) allValidCombos.push([...currentPath].reverse());
                    return;
                }
                let possiblePaths = dp[itemIdx][currentSum];
                if (!possiblePaths) return;
                for (let step of possiblePaths) {
                    currentPath.push(step.val);
                    findPaths(itemIdx - 1, step.prevSum, currentPath);
                    currentPath.pop();
                }
            }
            findPaths(teacherItems.length, intRemainder, []);

            for (let i = allValidCombos.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allValidCombos[i], allValidCombos[j]] = [allValidCombos[j], allValidCombos[i]];
            }

            let scoredCombos = allValidCombos.map(combo => {
                let levels = combo.map((val, idx) => Math.round(5 - ((val / teacherItems[idx].maxIntVal) * 5)));
                let penalty = levels.reduce((sum, lvl) => sum + Math.pow(lvl, 2), 0);
                return { combo: combo, penalty: penalty };
            });

            scoredCombos.sort((a, b) => a.penalty - b.penalty);
            let top10 = scoredCombos.slice(0, 10);
            let finalChoice = top10[Math.floor(Math.random() * top10.length)];
            return finalChoice.combo.map(v => v / 10);
        };

        // 💡 [기존 역산 모터 개조] 신규 분리된 엔진을 호출하도록 간소화
        window.reverseCalculateScore = function(targetVal) {
            let target = parseFloat(targetVal);
            if(isNaN(target) || target < 0 || target > 100) return alert("⚠️ 0~100 사이의 올바른 점수를 입력하세요.");

            let resultVals = window.getAutoScoreBreakdown(target);
            if (!resultVals) {
                document.getElementById('final_total_score_input').value = ""; 
                return alert(`⚠️ 선택하신 점수(${target}점)를 구성할 수 있는 수학적 배점 조합이 존재하지 않습니다.\n(※ 훈련생 만점을 기본으로 한 상태에서 채점 규칙상 도달할 수 없는 점수입니다.)`);
            }

            let teacherItems = window.currentEvalItems.filter(i => i.type !== '훈련생작성');
            window.currentEvalItems.forEach(item => {
                let inputEl = document.getElementById(`score_input_${item.idx}`);
                if(item.type === '훈련생작성') {
                    inputEl.value = item.score;
                } else {
                    let matchIdx = teacherItems.findIndex(ti => ti.idx === item.idx);
                    inputEl.value = resultVals[matchIdx];
                }
                processAutoScore(item.idx, true); // 💡 자동 계산 로드 중임을 알림
            });
        };

        // 💡 [신규] 전체 학생 일괄 채점 실행기
        window.executeAutoGradeAll = function() {
            let minScore = parseFloat(document.getElementById('auto_score_min').value);
            let maxScore = parseFloat(document.getElementById('auto_score_max').value);
            let max100 = parseInt(document.getElementById('auto_score_max100').value);

            if(isNaN(minScore) || isNaN(maxScore) || minScore > maxScore || minScore < 0 || maxScore > 100) {
                return alert("⚠️ 점수 범위가 올바르지 않습니다.");
            }

            // 💡 평가 일자 추출 (본/추가/재평가 모드에 따라 S3 탭의 날짜를 가져옴)
            let dateMain = document.getElementById('S3_1').value || "";
            let dateAdd = document.getElementById('S3_2').value || "";
            let dateRe = document.getElementById('S3_3').value || "";
            let targetDateRaw = currentEvalMode === '본평가' ? dateMain : (currentEvalMode === '추가평가' ? dateAdd : dateRe);
            let targetDate = targetDateRaw ? targetDateRaw.trim() : "";

            let studentBtns = document.querySelectorAll('.student-select-btn');
            if (studentBtns.length === 0) return alert("⚠️ 평가할 훈련생 명단이 없습니다.");
            
            let targetStudents = [];
            let skippedCount = 0;

            // 💡 [신규 배선] 출결 데이터베이스를 스캔하여 순수 '출석' 상태만 분류
            Array.from(studentBtns).forEach(btn => {
                let stu = btn.innerText;
                let attStatus = "-";
                
                if (targetDate && globalAttendanceData && globalAttendanceData[targetDate] && globalAttendanceData[targetDate][stu]) {
                    let sInfo = globalAttendanceData[targetDate][stu].status || "";
                    if (sInfo.includes("결석") || sInfo === "미편입") { attStatus = "결석"; }
                    else if (sInfo.includes("지각")) { attStatus = "지각"; }
                    else if (sInfo.includes("조퇴")) { attStatus = "조퇴"; }
                    else if (sInfo.includes("외출") || ["공가", "휴가", "경조사", "출석인정"].some(k => sInfo.includes(k))) { attStatus = sInfo; }
                    else { attStatus = "출석"; }
                }

                if (attStatus === "출석") {
                    targetStudents.push(stu);
                } else {
                    skippedCount++;
                }
            });

            if (targetStudents.length === 0) {
                return alert(`⚠️ 현재 선택된 평가일(${targetDate})에 온전한 '출석' 상태인 훈련생이 없습니다.\n(지각, 조퇴, 결석, 공가 등은 자동 채점에서 제외됩니다.)`);
            }

            let msg = `[출석 확인 완료]\n전체 훈련생 중 '출석' 상태인 ${targetStudents.length}명에게만 ${minScore}~${maxScore}점 사이의 무작위 점수를 부여하시겠습니까?\n(※ 100점은 최대 ${max100}명까지만 배정되며, 제외된 ${skippedCount}명은 기존 데이터가 유지됩니다.)`;
            if (!confirm(msg)) return;

            let getValidRandomScore = (min, max) => {
                let attempts = 0;
                while(attempts < 50) {
                    let rand = Math.floor(Math.random() * (max - min + 1)) + min;
                    let result = window.getAutoScoreBreakdown(rand);
                    if (result) return { rand: rand, breakdown: result };
                    attempts++;
                }
                for(let score = max; score >= min; score--) {
                    let result = window.getAutoScoreBreakdown(score);
                    if (result) return { rand: score, breakdown: result };
                }
                return null; 
            };

            let targetScores = [];
            let count100 = 0;
            
            // 대상 학생 점수 추출
            for(let i=0; i<targetStudents.length; i++) {
                let sObj = getValidRandomScore(minScore, maxScore);
                targetScores.push(sObj);
            }

            // 100점 초과 인원 조정
            for(let i=0; i<targetScores.length; i++) {
                if (targetScores[i] && targetScores[i].rand === 100) {
                    count100++;
                    if (count100 > max100) {
                        let newMax = 99;
                        if (newMax < minScore) newMax = minScore; 
                        targetScores[i] = getValidRandomScore(minScore, newMax);
                    }
                }
            }

            let teacherItems = window.currentEvalItems.filter(i => i.type !== '훈련생작성');

            // 💡 분류된 대상 학생(targetStudents)에게만 점수 장착
            targetStudents.forEach((stu, index) => {
                let sObj = targetScores[index];
                if (!sObj) return;

                let target = sObj.rand;
                let breakdown = sObj.breakdown;

                let itemsObj = {};
                window.currentEvalItems.forEach(item => {
                    if(item.type === '훈련생작성') {
                        itemsObj[item.idx] = item.score;
                    } else {
                        let matchIdx = teacherItems.findIndex(ti => ti.idx === item.idx);
                        itemsObj[item.idx] = breakdown[matchIdx];
                    }
                });
                
                // 메모리에 해당 학생 점수 덮어쓰기
                window.studentScoresData[stu] = {
                    items: itemsObj,
                    totalScore: target
                };

                let badge = document.getElementById(`stu_score_badge_${stu}`);
                if(badge) badge.innerText = target + "점";
            });

            // 설정값 메모리 보존
            window.studentScoresData._gradingSettings = { min: minScore, max: maxScore, max100: max100 };

            let currentStu = document.getElementById('final_student_name_cell')?.innerText;
            // 현재 화면에 띄워진 학생이 채점 대상에 포함되었다면 화면 즉시 갱신
            if (currentStu && targetStudents.includes(currentStu)) {
                window.loadStudentState(currentStu);
            }

            alert(`✅ 정상 출석한 ${targetStudents.length}명의 자동 채점이 완료되었습니다.\n(지각/조퇴/결석 등 ${skippedCount}명 보존)\n💡 완료 후 우측의 [전체 저장] 버튼을 눌러야 최종 확정됩니다!`);
        };

        // ---------------------------------------------------------
        // 📍 [신규 모터] 5. 개인내부평가표 렌더링 엔진
        // ---------------------------------------------------------
        async function buildPersonalEvalDocs() {
            const subject = document.getElementById('S1_1').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const courseName = document.getElementById('S0_CourseName').value || "";
            const period = document.getElementById('S0_Period').value || "";
            const teacher = document.getElementById('S0_Teacher').value || "김회준";
            
            const dateMain = document.getElementById('S3_1').value || "";
            const dateAdd = document.getElementById('S3_2').value || "";
            const dateRe = document.getElementById('S3_3').value || "";

            if (!subject) {
                document.getElementById('page5').innerHTML = "<div class='a4-page'><p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p></div>";
                return;
            }

            document.getElementById('page5').innerHTML = "<div class='a4-page'><p style='padding:20px; color:#2980b9; font-weight:bold;'>⏳ 평가표 데이터를 불러오고 융합하는 중입니다...</p></div>";

            let currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            // 1. [점수 데이터 로드] DB 백업본 + 메모리(저장 안 한 채점 점수) 융합 배선
            let scoreData = {};
            try {
                // 기존: evalScores/${currentEvalMode}
                // 💡 [수정] 통합 저장소(본평가)에서 무조건 퍼올립니다.
                const snap = await database.ref(`${currentClass}/evalScores/본평가/${currentDbKey}`).once('value');
                scoreData = snap.val() || {};
            } catch(e) { console.warn("점수 로드 에러", e); }

            // 💡 만약 4번 탭에서 채점만 돌리고 저장을 안 했어도, 메모리에서 끌어와 강제로 덮어씌움
            if (window.studentScoresData && Object.keys(window.studentScoresData).length > 0) {
                for (let stu in window.studentScoresData) {
                    if (stu !== "_gradingSettings") {
                        scoreData[stu] = window.studentScoresData[stu];
                    }
                }
            }

            // 2. [필수/선택 여부 탐지] 정밀 추적 알고리즘 가동
            let unitTypeDisplay = "필수"; // 기본값
            if (window.globalCoursesData && window.globalCoursesData.length > 0) {
                let cleanSubject = subject.replace(/\s+/g, '');
                let cleanCode = (document.getElementById('S1_Code').value || "").replace(/[^0-9a-zA-Z]/g, '');
                let cleanUnitName = (unitName || "").replace(/\s+/g, '');
                
                let matchedCourse = null;
                // 1차 타격: NCS 코드로 탐색
                if (cleanCode) {
                    matchedCourse = window.globalCoursesData.find(c => c.unit && c.unit.replace(/[^0-9a-zA-Z]/g, '').includes(cleanCode));
                }
                // 2차 타격: 띄어쓰기 모두 제거한 순수 텍스트로 탐색
                if (!matchedCourse) {
                    matchedCourse = window.globalCoursesData.find(c => {
                        let cSub = (c.subject || "").replace(/\s+/g, '');
                        let cUnit = (c.unit || "").replace(/\s+/g, '');
                        return cSub === cleanSubject && cUnit.includes(cleanUnitName);
                    });
                }
                
                // 찾은 데이터의 글자를 정제 ("필수능력단위" -> "필수")
                if (matchedCourse && matchedCourse.unitType && matchedCourse.unitType.trim() !== "") {
                    unitTypeDisplay = matchedCourse.unitType;
                    if(unitTypeDisplay.includes("필수")) unitTypeDisplay = "필수";
                    else if(unitTypeDisplay.includes("선택")) unitTypeDisplay = "선택";
                }
            }

            // 3. [평가일 렌더링 로직]
            const dotDate = (d) => d ? d.replace(/-/g, '.') : "";
            let internalDateRaw = (currentEvalMode === '추가평가') ? dateAdd : dateMain;
            let revalDateRaw = (currentEvalMode === '재평가') ? dateRe : "";
            
            let internalDateStr = internalDateRaw ? dotDate(internalDateRaw) : "-";
            let revalDateStr = revalDateRaw ? dotDate(revalDateRaw) : "-";

            // 4. [학생 명단 & 생년월일 수집] 출석부 데이터 스캔
            let studentSet = new Set();
            let birthDateMap = {};
            
            if (globalAttendanceData && typeof globalAttendanceData === 'object') { 
                Object.values(globalAttendanceData).forEach(dayData => {
                    if (dayData && typeof dayData === 'object') { 
                        Object.keys(dayData).forEach(key => {
                            if (key !== '_metadata') {
                                studentSet.add(key);
                                if (dayData[key].birthDate) {
                                    birthDateMap[key] = dayData[key].birthDate;
                                }
                            }
                        });
                    }
                });
            }
            let studentList = Array.from(studentSet).sort();

            // 5. [테이블 뼈대 생성] 최대 24명 기준 (12줄 루프)
            let tbodyHtml = "";
            for (let i = 0; i < 12; i++) {
                let leftIdx = i;
                let rightIdx = i + 12;
                
                let leftStu = studentList[leftIdx];
                let leftName = leftStu || "";
                let leftBirth = leftStu ? (birthDateMap[leftStu] || "") : "";
                // 💡 빨간색 제거 및 점수 추출
                let leftScore = leftStu && scoreData[leftStu] && scoreData[leftStu].totalScore !== undefined && scoreData[leftStu].totalScore !== "-" ? scoreData[leftStu].totalScore : "";
                
                let rightStu = studentList[rightIdx];
                let rightName = rightStu || "";
                let rightBirth = rightStu ? (birthDateMap[rightStu] || "") : "";
                // 💡 빨간색 제거 및 점수 추출
                let rightScore = rightStu && scoreData[rightStu] && scoreData[rightStu].totalScore !== undefined && scoreData[rightStu].totalScore !== "-" ? scoreData[rightStu].totalScore : "";

                tbodyHtml += `
                <tr style="height: 32px;">
                    <td style="border: 1px solid #000;">${leftName ? leftIdx + 1 : ""}</td>
                    <td style="border: 1px solid #000;">${leftName}</td>
                    <td style="border: 1px solid #000;">${leftBirth}</td>
                    <td style="border: 1px solid #000;">${leftScore}</td>
                    
                    <td style="border: 1px solid #000;">${rightName ? rightIdx + 1 : ""}</td>
                    <td style="border: 1px solid #000;">${rightName}</td>
                    <td style="border: 1px solid #000;">${rightBirth}</td>
                    <td style="border: 1px solid #000;">${rightScore}</td>
                </tr>`;
            }

            // 6. [최종 HTML 조립 및 주입]
            let fullHtml = `
            <div class="a4-page" style="display:flex; flex-direction:column; font-family:'Malgun Gothic', sans-serif;">
                <div class="no-print page-indicator">[5.개인내부평가표]</div>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; text-align: center; font-size: 13px;">
                    <colgroup>
                        <col style="width: 8%;"><col style="width: 15%;"><col style="width: 17%;"><col style="width: 10%;">
                        <col style="width: 8%;"><col style="width: 15%;"><col style="width: 17%;"><col style="width: 10%;">
                    </colgroup>
                   
                    <tr>
                        <th colspan="8" style="border: 1px solid #000; padding: 15px; background-color: #e8f5e9; text-align: center;">
                            <div id="personal_eval_subtitle" style="font-size: 24px; font-weight: normal; margin-bottom: 8px;">( ${unitName || subject} )</div>
                            <div style="font-size: 24px; font-weight: normal; letter-spacing: 2px;">관련 능력단위별 개인 내부평가표</div>
                        </th>
                    </tr>
                    
                    <tr>
                        <th colspan="2" style="border: 1px solid #000; padding: 8px;">교육·훈련 기관</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 8px;">부산자동차직업학교</td>
                        <th colspan="2" style="border: 1px solid #000; padding: 8px;">교육·훈련 기간</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 8px;">${period}</td>
                    </tr>
                    
                    <tr>
                        <th colspan="2" style="border: 1px solid #000; padding: 8px;">교육·훈련 과정명</th>
                        <td colspan="6" style="border: 1px solid #000; padding: 8px; text-align: left; padding-left: 15px;">${courseName}</td>
                    </tr>
                    
                    <tr>
                        <th colspan="2" style="border: 1px solid #000; padding: 8px;">교과목</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 8px;">${subject}</td>
                        <th colspan="3" rowspan="2" style="border: 1px solid #000; padding: 8px;">능력단위 구분</th>
                        <td colspan="1" rowspan="2" style="border: 1px solid #000; padding: 8px;">${unitTypeDisplay}</td>
                    </tr>
                    
                    <tr>
                        <th colspan="2" style="border: 1px solid #000; padding: 8px;">능력단위명</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 8px;">${unitName || subject}</td>
                    </tr>
                    
                    <tr style="height: 24px;">
                        <th colspan="2" style="border: 1px solid #000; padding: 4px;">내부평가일</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 4px;">${internalDateStr}</td>
                        <th colspan="3" rowspan="2" style="border: 1px solid #000; padding: 4px;">평가회차</th>
                        <td colspan="1" rowspan="2" style="border: 1px solid #000; padding: 4px;">1회</td>
                    </tr>
                    
                    <tr style="height: 24px;">
                        <th colspan="2" style="border: 1px solid #000; padding: 4px;">재평가일</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 4px;">${revalDateStr}</td>
                    </tr>

                    <tr>
                        <th rowspan="2" style="border: 1px solid #000; padding: 6px;">연번</th>
                        <th style="border: 1px solid #000; border-bottom: none; padding: 6px; padding-bottom: 2px;">교육훈련생</th>
                        <th rowspan="2" style="border: 1px solid #000; padding: 6px;">생년월일</th>
                        <th style="border: 1px solid #000; border-bottom: none; padding: 6px; padding-bottom: 2px;">평가</th>
                        <th rowspan="2" style="border: 1px solid #000; padding: 6px;">연번</th>
                        <th style="border: 1px solid #000; border-bottom: none; padding: 6px; padding-bottom: 2px;">교육훈련생</th>
                        <th rowspan="2" style="border: 1px solid #000; padding: 6px;">생년월일</th>
                        <th style="border: 1px solid #000; border-bottom: none; padding: 6px; padding-bottom: 2px;">평가</th>
                    </tr>
                    <tr>
                        <th style="border: 1px solid #000; border-top: none; padding: 6px; padding-top: 2px;">이름</th>
                        <th style="border: 1px solid #000; border-top: none; padding: 6px; padding-top: 2px;">점수</th>
                        <th style="border: 1px solid #000; border-top: none; padding: 6px; padding-top: 2px;">이름</th>
                        <th style="border: 1px solid #000; border-top: none; padding: 6px; padding-top: 2px;">점수</th>
                    </tr>

                    <tbody id="personal_eval_student_list">
                        ${tbodyHtml}
                    </tbody>
                </table>

                <div style="margin-top: auto; margin-bottom: 20px; text-align: left; font-size: 14px; font-weight: bold; padding-left: 10px;">
                    <span style="margin-right: 20px;">평가자 :</span>
                    <span style="margin-right: 30px;">(소속) 부산자동차직업학교</span>
                    <span style="margin-right: 30px;">(직위) 훈련교사</span>
                    <span style="margin-right: 50px;">(성명) ${teacher}</span>
                    <span style="position: relative; display: inline-block;">(서명)${globalTeacherSeal ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:36px; height:36px; background-image:url('${globalTeacherSeal}'); background-size:contain; background-repeat:no-repeat; background-position:center; opacity:0.6; pointer-events:none;"></div>` : ''}</span>
                </div>
            `;
            
            document.getElementById('page5').innerHTML = fullHtml;
        }

// =========================================================================
        // 🖨️ [신규 모터 탑재] 통합 PDF 프린터 스캐너 코어 엔진
        // =========================================================================
        
        // 💡 [공통 유틸] 로딩 화면 제어
        function showPdfLoader(show) {
            let loader = document.getElementById('pdfLoaderOverlay');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'pdfLoaderOverlay';
                loader.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; justify-content:center; align-items:center; flex-direction:column; color:white; font-size:24px; font-weight:bold;';
                loader.innerHTML = `<div style="margin-bottom:20px;">🖨️ PDF 스캔 및 생성 중입니다...</div><div style="font-size:14px; color:#f1c40f;">(문서가 많을 경우 시간이 소요될 수 있습니다. 창을 닫지 마세요)</div>`;
                document.body.appendChild(loader);
            }
            loader.style.display = show ? 'flex' : 'none';
        }

        // 💡 [공통 유틸] 파일명 생성기
        function getPdfBaseName() {
            let date = currentEvalMode === '본평가' ? document.getElementById('S3_1').value : (currentEvalMode === '추가평가' ? document.getElementById('S3_2').value : document.getElementById('S3_3').value);
            date = date ? date.replace(/-/g, '') : "미정"; // 20260315 형태
            let subject = document.getElementById('S1_1').value || "과목명없음";
            return `[${date}]+[${subject}]`;
        }

        // 💡 [코어 엔진] 프리미엄 네이티브 벡터 PDF 엔진 (화면 캡처 ❌ -> 100% 벡터 문서 렌더링 ⭕)
        async function generateMergedPDF(elementsToPrint, filename) {
            showPdfLoader(false); // 그림 캡처 방식이 아니므로 로딩 창이 필요 없습니다.

            // 1. 파일명 설정을 위해 문서 타이틀 임시 변경
            const originalTitle = document.title;
            document.title = filename.replace('.pdf', '');

            // 2. 프린트 전용 무대 생성
            const printContainer = document.createElement('div');
            printContainer.id = 'native-print-container';
            
            elementsToPrint.forEach(el => {
                let clone = el.cloneNode(true);
                
                // 프린트 시 불필요한 UI 버튼류 완전 제거
                clone.querySelectorAll('.no-print').forEach(e => e.style.display = 'none');
                
                // 💡 [초정밀 보정] 입력창(input/textarea)의 값을 시각적인 일반 텍스트로 변환하여 출력 틀어짐 방지
                clone.querySelectorAll('input').forEach(inputEl => {
                    let span = document.createElement('span');
                    span.innerText = inputEl.value;
                    span.style.cssText = inputEl.style.cssText;
                    span.style.display = 'inline-block';
                    span.style.width = '100%';
                    inputEl.parentNode.replaceChild(span, inputEl);
                });
                clone.querySelectorAll('textarea').forEach(taEl => {
                    let span = document.createElement('span');
                    span.innerHTML = taEl.value.replace(/\n/g, '<br>');
                    span.style.cssText = taEl.style.cssText;
                    span.style.display = 'inline-block';
                    span.style.width = '100%';
                    taEl.parentNode.replaceChild(span, taEl);
                });

                // 워터마크(배경) 절대 위치 보호
                let watermark = clone.querySelector('#watermark_logo');
                if (watermark) watermark.style.position = 'absolute';

                printContainer.appendChild(clone);
            });

            document.body.appendChild(printContainer);

            // 3. 네이티브 벡터 렌더링을 위한 전용 CSS 강제 주입
            const style = document.createElement('style');
            style.id = 'native-print-style';
            style.innerHTML = `
                @media print {
                    body > *:not(#native-print-container) { display: none !important; } /* 기존 화면 모두 숨김 */
                    #native-print-container { display: block !important; background: white; }
                    
                    /* 💡 표지 및 표의 배경색(청록색 등)을 100% 완벽하게 출력하도록 브라우저 제어 */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    
                    /* A4 규격 및 여백 제어 */
                    @page { size: A4 portrait; margin: 0; }
                    
                    .a4-page { 
                        width: 210mm !important; 
                        min-height: 297mm !important; 
                        margin: 0 auto !important; 
                        padding: 20mm !important; 
                        box-shadow: none !important; 
                        page-break-after: always !important; 
                    }
                    
                    /* 💡 핵심: 엑셀과 100% 동일한 1px 초정밀 검은색 실선 테두리 강제 코팅 */
                    table { border-collapse: collapse !important; border: 1px solid #000 !important; }
                    th, td { 
                        border: 1px solid #000 !important; 
                        border-width: 1px !important;
                        border-color: #000 !important;
                    }
                }
            `;
            document.head.appendChild(style);

            // 4. 브라우저 네이티브 인쇄 다이얼로그 호출 (벡터 PDF 생성기)
            setTimeout(() => {
                window.print(); // 여기서 사용자가 [PDF로 저장]을 선택하게 됩니다.
                
                // 인쇄 다이얼로그 종료 후 화면 원상 복구
                document.body.removeChild(printContainer);
                document.head.removeChild(style);
                document.title = originalTitle;
            }, 300);
        }

        // 🚀 버튼(1): [평가 전체 pdf다운] (선생님이 지정하신 순서대로 결합)
        async function downloadPDF_1() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            // 현재 데이터가 반영되도록 백그라운드에서 모든 문서를 최신화
            await buildEvaluationDocs(); 
            await buildEvaluationPaper(); 
            await buildAnswerDocs(); 
            await buildFinalResultDocs();

            let targetElements = [];
            
            // 1. [1.평가서류] - ① 표지 (page1 의 첫번째 a4-page)
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[0]);
            
            // 2. [4.최종결과표] 빈 양식 (가상 생성)
            let blankResultPage = document.querySelector('#page4 .a4-page').cloneNode(true);
            blankResultPage.querySelector('#final_student_name_cell').innerText = ""; // 학생이름 초기화
            blankResultPage.querySelector('#final_total_score_input').value = ""; // 점수 초기화
            blankResultPage.querySelector('#final_total_score_input').setAttribute('placeholder', ''); // 💡 [자동/입력] 은닉
            let penaltyTd = blankResultPage.querySelector('#print_score_time_penalty');
            if(penaltyTd) penaltyTd.innerText = ""; // 💡 0점 은닉
            let feedbackZone = blankResultPage.querySelector('#feedback_zone');
            if(feedbackZone) feedbackZone.innerHTML = ""; // 💡 피드백 안내멘트 제거
            blankResultPage.querySelector('#final_achievement_level').innerText = ""; // 단계 초기화
            blankResultPage.querySelector('#pass_check_mark').innerHTML = ""; // 합격마크 지우기
            blankResultPage.querySelector('#fail_check_mark').innerHTML = ""; // 불합격마크 지우기
            blankResultPage.querySelectorAll('td[id^="print_score_"]').forEach(td => td.innerText = ""); // 세부점수 지우기
            targetElements.push(blankResultPage);

            // 3. [1.평가서류] - ④ 근거사진 (page1 의 네번째 a4-page, index 3)
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[3]);
            // 4. [1.평가서류] - ② 지식·기술평가 요구사항 (page1, index 1)
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[1]);
            // 5. [1.평가서류] - ③ 유의사항 (page1, index 2)
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[2]);
            // 6. [2.평가지] - 앞면 (page2, index 0)
            targetElements.push(document.querySelectorAll('#page2 .a4-page')[0]);
            // 7. [2.평가지] - 뒷면 (page2, index 1)
            targetElements.push(document.querySelectorAll('#page2 .a4-page')[1]);
            
            // 8. [3.채점기준] - 1페이지부터 마지막까지
            let rubricPages = document.querySelectorAll('#page3 .a4-page');
            rubricPages.forEach(p => targetElements.push(p));

            let filename = `${getPdfBaseName()} + (${currentEvalMode}).pdf`;
            
            try {
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                alert("PDF 생성 중 오류 발생: " + e.message);
            } finally {
                showPdfLoader(false);
            }
        }

        // 🚀 버튼(2): [최종결과표 전체 pdf다운] (모든 학생 이름순 루프)
        async function downloadPDF_2() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            await buildFinalResultDocs(); // 최신화
            
            // 학생 버튼에서 이름 추출 (가나다순은 버튼 생성 시 이미 정렬되어 있음)
            let studentBtns = document.querySelectorAll('.student-select-btn');
            if (studentBtns.length === 0) {
                showPdfLoader(false);
                return alert("출력할 훈련생 명단이 없습니다.");
            }

            let targetElements = [];
            const page4Template = document.querySelector('#page4 .a4-page');

            // 원본 화면이 바뀌지 않도록 복사본 무대를 사용
            for (let btn of studentBtns) {
                let stuName = btn.innerText;
                // 💡 화면에 학생 데이터를 강제 로드하여 피드백 알고리즘 물리적 가동
                document.getElementById('final_student_name_cell').innerText = stuName;
                window.loadStudentState(stuName);
                
                // 💡 피드백이 완벽히 렌더링된 화면 자체를 스캔하여 캡처
                let clone = document.querySelector('#page4 .a4-page').cloneNode(true);
                
                // 인쇄 시 불필요한 컨트롤 패널(no-print) 숨김 처리
                clone.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
                
                targetElements.push(clone);
            }

            // 💡 출력 작업 완료 후 원래 상태(첫 번째 학생)로 복구
            if(studentBtns.length > 0) {
                document.getElementById('final_student_name_cell').innerText = studentBtns[0].innerText;
                window.loadStudentState(studentBtns[0].innerText);
            }

            let filename = `${getPdfBaseName()}+최종결과표.pdf`;
            
            try {
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                alert("PDF 생성 중 오류 발생: " + e.message);
            } finally {
                showPdfLoader(false);
            }
        }

        // 🚀 버튼(3): [개인내부평가표 pdf다운] (단일 장)
        async function downloadPDF_3() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            await buildPersonalEvalDocs(); // 최신화
            
            let targetElements = [document.querySelector('#page5 .a4-page')];
            let filename = `${getPdfBaseName()}+개인내부평가표.pdf`;
            
            try {
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                alert("PDF 생성 중 오류 발생: " + e.message);
            } finally {
                showPdfLoader(false);
            }
        }

        // 🚀 버튼(4): [전체서류 pdf다운] (모든 서류를 하나의 완벽한 PDF 파일로 통합)
        async function downloadPDF_4_All() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            
            alert("전체 서류가 [하나의 완벽한 벡터 PDF 파일]로 통합 출력됩니다.\n\n✅ 화면에 인쇄 창이 뜨면, 대상을 'PDF로 저장'으로 맞추고 저장해 주십시오!");
            
            showPdfLoader(true);
            await buildEvaluationDocs(); 
            await buildEvaluationPaper(); 
            await buildAnswerDocs(); 
            await buildFinalResultDocs();

            let allElements = [];
            
            // 1. [평가 전체 서류]
            allElements.push(document.querySelectorAll('#page1 .a4-page')[0]); // 표지
            
            let blankResultPage = document.querySelector('#page4 .a4-page').cloneNode(true);
            blankResultPage.querySelector('#final_student_name_cell').innerText = ""; 
            let fInput = blankResultPage.querySelector('#final_total_score_input');
            if(fInput) { fInput.value = ""; fInput.setAttribute('placeholder', ''); }
            let pTd = blankResultPage.querySelector('#print_score_time_penalty');
            if(pTd) pTd.innerText = "";
            let fz = blankResultPage.querySelector('#feedback_zone');
            if(fz) fz.innerHTML = "";
            let lvl = blankResultPage.querySelector('#final_achievement_level');
            if(lvl) lvl.innerText = "";
            let pMark = blankResultPage.querySelector('#pass_check_mark');
            if(pMark) pMark.innerHTML = "";
            let fMark = blankResultPage.querySelector('#fail_check_mark');
            if(fMark) fMark.innerHTML = "";
            blankResultPage.querySelectorAll('td[id^="print_score_"]').forEach(td => td.innerText = "");
            allElements.push(blankResultPage); // 빈 결과표

            allElements.push(document.querySelectorAll('#page1 .a4-page')[3]); // 근거사진
            allElements.push(document.querySelectorAll('#page1 .a4-page')[1]); // 요구사항
            allElements.push(document.querySelectorAll('#page1 .a4-page')[2]); // 유의사항
            allElements.push(document.querySelectorAll('#page2 .a4-page')[0]); // 평가지 앞면
            allElements.push(document.querySelectorAll('#page2 .a4-page')[1]); // 평가지 뒷면
            document.querySelectorAll('#page3 .a4-page').forEach(p => allElements.push(p)); // 채점기준 전체

            // 2. [최종결과표 학생별 전체]
            let studentBtns = document.querySelectorAll('.student-select-btn');
            for (let btn of studentBtns) {
                let stuName = btn.innerText;
                document.getElementById('final_student_name_cell').innerText = stuName;
                window.loadStudentState(stuName);
                
                let clone = document.querySelector('#page4 .a4-page').cloneNode(true);
                allElements.push(clone);
            }
            if(studentBtns.length > 0) {
                // UI 원상 복구
                document.getElementById('final_student_name_cell').innerText = studentBtns[0].innerText;
                window.loadStudentState(studentBtns[0].innerText);
            }

            // 3. [개인내부평가표]
            await buildPersonalEvalDocs(); 
            allElements.push(document.querySelector('#page5 .a4-page'));

            let filename = `${getPdfBaseName()}_통합전체서류.pdf`;
            
            // 모든 페이지를 하나의 인쇄 대기열에 올리고 네이티브 엔진 가동
            await generateMergedPDF(allElements, filename);
        }


        // =========================================================================
        // 📝 [신규 모터 탑재] 통합 Word(HWP) 출력 코어 엔진
        // =========================================================================
        
        function exportHTMLToWord(htmlContent, filename) {
            const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
                 "xmlns:w='urn:schemas-microsoft-com:office:word' " +
                 "xmlns='http://www.w3.org/TR/REC-html40'>" +
                 "<head><meta charset='utf-8'><title>Export HTML to Word</title>" +
                 "<style> " +
                 "body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: black; } " +
                 "table { border-collapse: collapse; width: 100%; border: 1px solid black; } " +
                 "th, td { border: 1px solid black; padding: 5px; text-align: center; font-size: 13px;} " +
                 ".no-print { display: none !important; } " +
                 ".doc-cyan-bg, .ep-cyan-bg, .ans-cyan-bg { background-color: #e0ffff; font-weight: bold; } " +
                 "</style></head><body>";
            const footer = "</body></html>";
            const sourceHTML = header + htmlContent + footer;
            
            const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename + '.doc';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        async function generateMergedWord(elementsToPrint, filename) {
            let combinedHtml = "";
            for (let i = 0; i < elementsToPrint.length; i++) {
                let clone = elementsToPrint[i].cloneNode(true);
                
                // 프린트 시 불필요한 UI(컨트롤 패널, 버튼 등) 제거
                clone.querySelectorAll('.no-print').forEach(el => el.remove()); 
                
                // 편집을 위해 입력칸(input, textarea)을 일반 텍스트로 변환
                clone.querySelectorAll('input').forEach(el => {
                    let span = document.createElement('span');
                    span.innerText = el.value;
                    el.parentNode.replaceChild(span, el);
                });
                clone.querySelectorAll('textarea').forEach(el => {
                    let span = document.createElement('span');
                    span.innerHTML = el.value.replace(/\n/g, '<br>');
                    el.parentNode.replaceChild(span, el);
                });

                combinedHtml += clone.innerHTML;
                
                // 다음 페이지가 있으면 한글/워드 용 강제 페이지 넘김 태그 삽입
                if (i < elementsToPrint.length - 1) {
                    combinedHtml += "<br clear=all style='page-break-before:always'>";
                }
            }
            exportHTMLToWord(combinedHtml, filename);
        }

        // 🚀 버튼(W-1): [평가 전체 Word 다운]
        async function downloadWord_1() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            await buildEvaluationDocs(); 
            await buildEvaluationPaper(); 
            await buildAnswerDocs(); 
            await buildFinalResultDocs();

            let targetElements = [];
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[0]);
            
            let blankResultPage = document.querySelector('#page4 .a4-page').cloneNode(true);
            blankResultPage.querySelector('#final_student_name_cell').innerText = ""; 
            let finalInput = blankResultPage.querySelector('#final_total_score_input');
            if(finalInput) { finalInput.value = ""; finalInput.setAttribute('placeholder', ''); }
            let penaltyTd = blankResultPage.querySelector('#print_score_time_penalty');
            if(penaltyTd) penaltyTd.innerText = ""; 
            let feedbackZone = blankResultPage.querySelector('#feedback_zone');
            if(feedbackZone) feedbackZone.innerHTML = ""; 
            let lvl = blankResultPage.querySelector('#final_achievement_level');
            if(lvl) lvl.innerText = "";
            let passM = blankResultPage.querySelector('#pass_check_mark');
            if(passM) passM.innerHTML = "";
            let failM = blankResultPage.querySelector('#fail_check_mark');
            if(failM) failM.innerHTML = "";
            blankResultPage.querySelectorAll('td[id^="print_score_"]').forEach(td => td.innerText = ""); 
            targetElements.push(blankResultPage);

            targetElements.push(document.querySelectorAll('#page1 .a4-page')[3]);
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[1]);
            targetElements.push(document.querySelectorAll('#page1 .a4-page')[2]);
            targetElements.push(document.querySelectorAll('#page2 .a4-page')[0]);
            targetElements.push(document.querySelectorAll('#page2 .a4-page')[1]);
            
            let rubricPages = document.querySelectorAll('#page3 .a4-page');
            rubricPages.forEach(p => targetElements.push(p));

            let filename = `${getPdfBaseName()}_평가전체(${currentEvalMode})`;
            try { await generateMergedWord(targetElements, filename); } 
            catch (e) { alert("Word 생성 중 오류 발생: " + e.message); } 
            finally { showPdfLoader(false); }
        }

        // 🚀 버튼(W-2): [최종결과표 전체 Word 다운]
        async function downloadWord_2() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            await buildFinalResultDocs(); 
            
            let studentBtns = document.querySelectorAll('.student-select-btn');
            if (studentBtns.length === 0) { showPdfLoader(false); return alert("출력할 훈련생 명단이 없습니다."); }

            let targetElements = [];
            for (let btn of studentBtns) {
                let stuName = btn.innerText;
                document.getElementById('final_student_name_cell').innerText = stuName;
                window.loadStudentState(stuName);
                
                let clone = document.querySelector('#page4 .a4-page').cloneNode(true);
                targetElements.push(clone);
            }

            if(studentBtns.length > 0) {
                document.getElementById('final_student_name_cell').innerText = studentBtns[0].innerText;
                window.loadStudentState(studentBtns[0].innerText);
            }

            let filename = `${getPdfBaseName()}_최종결과표`;
            try { await generateMergedWord(targetElements, filename); } 
            catch (e) { alert("Word 생성 중 오류 발생: " + e.message); } 
            finally { showPdfLoader(false); }
        }

        // 🚀 버튼(W-3): [개인내부평가표 Word 다운]
        async function downloadWord_3() {
            if (!document.getElementById('S1_1').value) return alert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            await buildPersonalEvalDocs(); 
            
            let targetElements = [document.querySelector('#page5 .a4-page')];
            let filename = `${getPdfBaseName()}_개인내부평가표`;
            
            try { await generateMergedWord(targetElements, filename); } 
            catch (e) { alert("Word 생성 중 오류 발생: " + e.message); } 
            finally { showPdfLoader(false); }
        }