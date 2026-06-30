
   
        let currentDbKey = "";
        const storedConfig = localStorage.getItem('firebaseConfig');
        const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
            apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
            databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "busan-teacher-work"
        };
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        const database = firebase.database();
        initClassContext();

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

        let currentClass = window.currentClass;
        document.getElementById('backLink').href = classNavHref('../start/index1.html');
        const defaultViewMode = localStorage.getItem(classStorageKey('defaultViewMode')) || 'subject';

        let globalCoursesData = [];
        let globalStandards = []; 
        let globalNcsMasterDB = {}; 
        let globalAttendanceData = {}; 
        let globalFullTimetable = []; // 💡 [수동 렌더링용 배선] 
        let globalUploadedKeys = [];  // 💡 [수동 렌더링용 배선]
        let globalTeacherSeal = "";    // 💡 [신규 배선] 담당교사 직인 보관용
        let globalVerifierSeal = "";   // 💡 [신규 배선] 검증자 직인 보관용
        let globalEvaluationDates = {}; // 💡 [신규 배선] 달력 평가일 통합 데이터 보관용
        let globalEvalPlansData = {};  // 💡 [맹점 차단 배선] 이미 저장된 진짜 코드를 기억할 메모리
        let globalEvalCompletionsData = {}; // 📍 평가완료 수동 체크 상태 보관용
        // 📍 [신규 배선] 중도탈락, 조기수료, 영구삭제자 통합 메모리
        let globalDropoutData = {};
        let globalEarlyCompletionData = {};
        let globalDeletedLogs = {};

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
                    await appAlert("인증 실패"); location.href = '../index.html';
                }
            } else { 
                await appAlert("보안 인증이 필요합니다."); location.href = '../index.html'; 
            }
        });

        let allVersionsData = {};

        async function fetchMasterData() {
            try {
                // 수정 후 코드 (캐시 배선 완전 절단 및 DB 직결)
                let masterData = {}; let fullTimetable = [];

                const snap = await classDbRef('masterData').once('value');
                masterData = snap.val() || {};

                const ttSnap = await classDbRef('fullTimetable').once('value');
                fullTimetable = ttSnap.val() || [];
                globalFullTimetable = fullTimetable; // 💡 렌더링용 탱크에 시간표 복사

                // 💡 [데이터 펌프 가동] 각 반의 일일출석부 DB에서 데이터를 끌어와 탱크에 적재
                const attSnap = await classDbRef('dailyAttendance').once('value');
                globalAttendanceData = attSnap.val() || {};

                // 💡 [신규 펌프 가동] 달력에서 지정한 평가일 DB 끌어오기
                const evalDatesSnap = await classDbRef('evaluationDates').once('value');
                globalEvaluationDates = evalDatesSnap.val() || {};

                // 💡 [맹점 차단 코어] 우리 반 DB에 이미 확정 저장된 진짜 코드 데이터를 퍼올려 적재합니다.
                const plansSnap = await classDbRef('evalPlans/본평가').once('value');
                globalEvalPlansData = plansSnap.val() || {};

                const completeSnap = await classDbRef('evalCompletions').once('value');
                globalEvalCompletionsData = completeSnap.val() || {};

                // 📍 [신규 펌프 가동] 중도탈락, 조기수료, 영구삭제 데이터를 퍼올려 적재
                const [dropSnap, earlySnap, delSnap] = await Promise.all([
                    classDbRef('dropouts').once('value'),
                    classDbRef('earlyCompletions').once('value'),
                    classDbRef('deletedLogs').once('value')
                ]);
                globalDropoutData = dropSnap.val() || {};
                globalEarlyCompletionData = earlySnap.val() || {};
                globalDeletedLogs = delSnap.val() || {};

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
                // 💡 [통합 배선 유지] 마스터 DB에서 워터마크 및 공용 직인 데이터 한 번에 끌어오기
                try {
                    // 🎯 난수 암호 폐기, 영구 고정 경로(evalFirstBg)로 교체 완료!
                    const watermarkSnap = await masterDatabase.ref('commonImages/docImages/evalFirstBg').once('value');
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

                const savedVersionPref = localStorage.getItem(classStorageKey('selectedVersion')) || "legacy";
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
                    // 💡 [치명적 오류 해결] 쪼개기 쉬운 에러 덩어리인 Key(이름) 대신, DB 안의 순수 'unitCode' 데이터만 싹 다 뽑아옵니다.
                    const uploadedCodes = Object.values(commonData).map(d => d.unitCode ? String(d.unitCode) : ""); 
                    globalUploadedKeys = uploadedCodes; // 💡 렌더링 탱크에 순수 코드들 직결

                    // 💡 [신규 배선] 브라우저(로컬) 설정이 날아갔을 경우 파이어베이스 DB에서 2차 스캔 (이중 보험)
                    let finalViewMode = defaultViewMode;
                    if (!localStorage.getItem(classStorageKey('defaultViewMode'))) {
                        if (masterData.viewMode) finalViewMode = masterData.viewMode;
                        else if (masterData.defaultViewMode) finalViewMode = masterData.defaultViewMode;
                    }

                    renderListBasedOnMode(courses, finalViewMode, fullTimetable, uploadedCodes); // 💡 uploadedKeys를 uploadedCodes로 교체
                    
                    // 💡 [초기 화면 강제 전환 엔진] 딜레이 타임 낭비 없이 엔진 즉시 다이렉트 가동
                    if (typeof window.showAverageScores === 'function') {
                        window.showAverageScores();
                    }

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
            localStorage.setItem(classStorageKey('selectedVersion'), vId); 
            
            const badge = document.getElementById('viewModeBadge');
            const oldText = badge.innerText;
            badge.innerText = "기준 교체 중...";
            
            await loadStandardsForVersion(vId); 
            
            badge.innerText = oldText;
            
            const activeBtn = document.querySelector('.unit-btn.active');
            if (activeBtn) activeBtn.click();
        }

        async function resetEvalData() {
            if (!currentDbKey) return await appAlert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.");

            const subject = document.getElementById('S1_1').value;
            const unitName = document.getElementById('S1_2').value;
            const displayName = unitName ? unitName : subject;

            // 선생님의 지침에 따른 폭파 승인 문구
            const expectedText = "삭제합니다";
            const userInput = await appPrompt(`❗ [최종 경고] 우리 반의 [${displayName}] 과목에 대한 모든 데이터(설정, 문제, 모범답안, 근거사진, 학생 점수)를 완전히 삭제합니다.\n\n진행하시려면 "${expectedText}"라고 정확히 입력해 주세요.`);

            if (userInput === expectedText) {
                try {
                    const modes = ['본평가', '추가평가', '재평가'];
                    const deletePromises = [];
                    
                    // 1. 모든 평가 모드의 '계획/설정' 및 '사진' DB 삭제
                    modes.forEach(mode => {
                        deletePromises.push(classDbRef(`evalPlans/${mode}/${currentDbKey}`).remove());
                        deletePromises.push(classDbRef(`evalPhotos/${mode}/${currentDbKey}`).remove());
                    });
                    
                    // 2. 통합 점수(본평가 경로) DB 삭제
                    deletePromises.push(classDbRef(`evalScores/본평가/${currentDbKey}`).remove());

                    // 3. 서버 데이터 소각 대기
                    await Promise.all(deletePromises);
                    
                    // 4. [중요] 좀비 데이터 방지를 위한 브라우저 RAM(메모리) 완전 포맷
                    window.studentScoresData = {};
                    window.downloadedCustomItems = null;
                    window.activeFeedbacks = {};
                    window.lastEditedCells = {};
                    window.tableUndoStacks = {};
                    
                    // 💡 [신규 배선] 초기화 즉시 메모리에서 삭제하고 좌측 리스트 UI 동기화
                    delete globalEvalPlansData[currentDbKey];
                    let prevActiveSubject = document.querySelector('.unit-btn.active b')?.innerText.replace('UP', '').trim();
                    let currentModeStr = document.getElementById('viewModeBadge').innerText.includes("교과목") ? 'subject' : 'ncs';
                    renderListBasedOnMode(globalCoursesData, currentModeStr, globalFullTimetable, globalUploadedKeys);
                    
                    let activeBtn = null;
                    document.querySelectorAll('.unit-btn').forEach(btn => {
                        let bText = btn.querySelector('b')?.innerText.replace('UP', '').trim();
                        if (bText === prevActiveSubject) {
                            btn.classList.add('active');
                            activeBtn = btn;
                        }
                    });

                    await appAlert(`✅ [${displayName}] 과목의 모든 데이터가 소멸되었습니다. 순정 상태로 돌아갑니다.`);
                    
                    // 5. 화면 강제 리프레시 (순정 상태 렌더링)
                    if (activeBtn) {
                        window.isGlobalModeSwitching = true; // 화면 튕김 방지 플래그
                        activeBtn.click(); // 현재 과목 다시 클릭하여 순정 로드
                        setTimeout(() => {
                            window.isGlobalModeSwitching = false;
                            document.getElementById('btnPage0').click(); // 설정 페이지로 이동
                        }, 300);
                    }

                } catch(e) {
                    await appAlert("❌ 초기화 실패: " + e.message);
                }
            } else if (userInput !== null) {
                await appAlert("❌ 문구가 일치하지 않아 초기화가 취소되었습니다.");
            }
        }

        // 💡 [신규 모터] 수동 뷰 모드 전환 다이렉트 엔진
        window.manualSwitchViewMode = function(mode) {
            renderListBasedOnMode(globalCoursesData, mode, globalFullTimetable, globalUploadedKeys);
            const page7 = document.getElementById('page7');
            if (page7 && page7.classList.contains('active') && typeof window.showAverageScores === 'function') {
                window.showAverageScores();
            }
        };

        // 💡 [신규 엔진] 달력 평가일 초정밀 스캔 레이더 (괄호 보존, 오매칭 완벽 차단)
        function getEvalDateFromCalendar(subName, unitName) {
            // 🚨 [핵심 필터] 대괄호([NCS교과] 등)와 띄어쓰기만 제거하고, (2수준) 같은 소괄호와 가운뎃점(ㆍ)은 절대 보존!
            const extractCoreText = (str) => {
                if (!str) return "";
                return String(str)
                    .replace(/\[.*?\]/g, '') // [NCS교과], [비NCS] 등 대괄호만 제거
                    .replace(/\s+/g, '');    // 띄어쓰기 완전 제거 (가운뎃점이나 소괄호는 그대로 살아남음)
            };

            let coreSub = extractCoreText(subName);
            let coreUnit = extractCoreText(unitName);
            let foundDate = "";

            for (let modeKey in globalEvaluationDates) {
                let datesObj = globalEvaluationDates[modeKey];
                if (typeof datesObj === 'object' && datesObj !== null) {
                    for (let dateKey in datesObj) {
                        let itemData = datesObj[dateKey];
                        if (itemData && itemData.subjects) {
                            let subsArray = itemData.subjects.split(',');
                            for (let s of subsArray) {
                                let coreS = extractCoreText(s);
                                
                                // 빈 텍스트(찌꺼기)는 즉시 스킵
                                if (!coreS || coreS === "") continue;

                                // 🚨 100% 일치할 때만 매칭 (수준 괄호까지 완벽히 같아야 함)
                                if ((coreSub && coreSub === coreS) || (coreUnit && coreUnit === coreS)) {
                                    if (!foundDate || dateKey > foundDate) {
                                        foundDate = dateKey;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            return foundDate;
        }

        function getEvalCompleteInfo(dbKey) {
            return (globalEvalCompletionsData && globalEvalCompletionsData[dbKey]) || null;
        }

        function updateEvalCompleteButton() {
            const btn = document.getElementById('btn_toggle_eval_complete');
            if (!btn) return;

            if (!currentDbKey) {
                btn.innerText = "✅ 평가완료";
                btn.style.backgroundColor = "#7f8c8d";
                btn.disabled = true;
                return;
            }

            const completeInfo = getEvalCompleteInfo(currentDbKey);
            btn.disabled = false;
            if (completeInfo && completeInfo.completed) {
                btn.innerText = "↩ 완료취소";
                btn.style.backgroundColor = "#c0392b";
            } else {
                btn.innerText = "✅ 평가완료";
                btn.style.backgroundColor = "#7f8c8d";
            }
        }

        async function toggleEvalComplete() {
            if (!currentDbKey) return await appAlert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주세요.");

            const subject = document.getElementById('S1_1').value || "";
            const unitName = document.getElementById('S1_2').value || "";
            const displayName = unitName || subject;
            const currentInfo = getEvalCompleteInfo(currentDbKey);
            const isCompleted = currentInfo && currentInfo.completed;

            if (isCompleted) {
                if (!await appConfirm(`[${displayName}]\n평가완료 표시를 취소하시겠습니까?`)) return;
                await classDbRef(`evalCompletions/${currentDbKey}`).remove();
                delete globalEvalCompletionsData[currentDbKey];
            } else {
                if (!await appConfirm(`[${displayName}]\n이 과목을 평가완료로 표시하시겠습니까?`)) return;
                const completeData = {
                    completed: true,
                    subject: subject,
                    unitName: unitName,
                    dateMain: document.getElementById('S3_1').value || "",
                    completedAt: new Date().toLocaleString('ko-KR')
                };
                await classDbRef(`evalCompletions/${currentDbKey}`).set(completeData);
                globalEvalCompletionsData[currentDbKey] = completeData;
            }

            updateEvalCompleteButton();
            let prevActiveSubject = document.querySelector('.unit-btn.active b')?.innerText.replace('UP', '').replace('완료', '').trim();
            let currentModeStr = document.getElementById('viewModeBadge').innerText.includes("교과목") ? 'subject' : 'ncs';
            renderListBasedOnMode(globalCoursesData, currentModeStr, globalFullTimetable, globalUploadedKeys);
            document.querySelectorAll('.unit-btn').forEach(btn => {
                let bText = btn.querySelector('b')?.innerText.replace('UP', '').replace('완료', '').trim();
                if (bText === prevActiveSubject) btn.classList.add('active');
            });
        }

        function renderListBasedOnMode(courses, mode, fullTimetable = [], uploadedKeys = []) {
            const container = document.getElementById('unitListContainer');
            const badge = document.getElementById('viewModeBadge');
            container.innerHTML = ""; 

            // 💡 [신규 배선] 교과 종류에 따라 직관적인 색상을 뱉어내는 센서
            const getTypeColor = (typeStr) => {
                if (!typeStr) return '#bdc3c7';
                if (typeStr.includes('비NCS')) return '#e74c3c'; // 강렬한 빨간색
                if (typeStr.includes('소양')) return '#9b59b6'; // 보라색
                if (typeStr.includes('NCS')) return '#3498db'; // 파란색
                return '#bdc3c7'; // 기타 회색
            };

            // 💡 [버튼 UI 동기화] 선택된 모드에 따라 버튼 색상을 시각적으로 고정
            const btnSub = document.getElementById('btnModeSubject');
            const btnNcs = document.getElementById('btnModeNcs');
            if (btnSub && btnNcs) {
                if (mode === 'subject') {
                    btnSub.style.background = '#27ae60'; btnSub.style.borderColor = '#2ecc71';
                    btnNcs.style.background = '#34495e'; btnNcs.style.borderColor = '#2c3e50';
                } else {
                    btnNcs.style.background = '#e67e22'; btnNcs.style.borderColor = '#d35400';
                    btnSub.style.background = '#34495e'; btnSub.style.borderColor = '#2c3e50';
                }
            }

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
                    group.evalDate = getEvalDateFromCalendar(group.subject, ""); // 💡 레이더 스캔
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
                   
                    let dbKey = (group.subject + "_종합").replace(/[\.\#\$\/\[\]]/g, '');
                    let isUploaded = false;
                    courses.forEach(c => {
                        if (c.subject === group.subject) {
                            let uName = String(c.unit || "");
                            
                            // 📍 1순위: DB에 저장된 순정 RD코드 
                            let uCode = c.rdCode || ""; 
                            
                            // 📍 2순위: RD코드가 없다면 구형 데이터 호환용 텍스트 추출
                            if (!uCode) {
                                uCode = uName.match(/[0-9]{8,}_[0-9]+v[0-9]+/i) ? uName.match(/[0-9]{8,}_[0-9]+v[0-9]+/i)[0] : (uName.match(/\[(.*?)\]/) ? uName.match(/\[(.*?)\]/)[1] : "");
                            }
                            
                            // 기호, 영어 무시하고 숫자만 추출 (매칭용)
                            let targetCode = uCode.replace(/[^0-9]/g, '');

                            // 💡 [단선 복구 1] 텍스트에 코드가 없어 추출 실패 시, 마스터 DB에서 과목명으로 2차 강제 역추적
                            if (!targetCode || targetCode === "") {
                                const textFilter = /[\s·ㆍ\.\_]/g;
                                const cleanName = (uName || group.subject).replace(textFilter, '');
                                const altKey = Object.keys(globalNcsMasterDB).find(k => {
                                    let sName = globalNcsMasterDB[k].subjectName;
                                    return sName && sName.replace(textFilter, '') === cleanName;
                                });
                                if (altKey && globalNcsMasterDB[altKey].code) {
                                    targetCode = globalNcsMasterDB[altKey].code.replace(/[^0-9]/g, '');
                                }
                            }

                            // 💡 [맹점 완벽 차단] 내 반 DB에 이미 '저장된' 진짜 코드가 있다면 최우선 1순위로 덮어쓰기
                            let dbKey = (group.subject + "_종합").replace(/[\.\#\$\/\[\]]/g, '');
                            if (globalEvalPlansData[dbKey] && globalEvalPlansData[dbKey].unitCode && !globalEvalPlansData[dbKey].unitCode.includes("없음")) {
                                targetCode = globalEvalPlansData[dbKey].unitCode.replace(/[^0-9]/g, '');
                            }

                            if (targetCode && targetCode !== "") {
                                // 💡 구형 쪼개기(split) 폐기! DB의 순수 코드들 중에서 오직 숫자만 비교하여 100% 매칭!
                                if (uploadedKeys.some(dbCode => String(dbCode).replace(/[^0-9]/g, '') === targetCode)) {
                                    isUploaded = true;
                                }
                            }
                        }
                    });
                    
                    // 💡 [신규 엔진] 저장 여부와 공통 업로드 여부를 분리하여 표시 (NCS: 초록색, 비NCS: 노란색)
                    let hasLocalSave = !!globalEvalPlansData[dbKey];
                    let isNonNcsType = group.type.includes("비NCS") || group.type.includes("소양");
                    let nameColor = "white";
                    if (hasLocalSave) {
                        nameColor = isNonNcsType ? "#f1c40f" : "#2ecc71"; // 노란색(비NCS) / 초록색(NCS)
                    }
                    let upBadgeHtml = isUploaded ? `<span style="background:#e74c3c; color:white; font-size:9px; padding:1px 4px; border-radius:3px; margin-left:5px; vertical-align:middle; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.2);">UP</span>` : "";
                    const completeInfo = getEvalCompleteInfo(dbKey);
                    const isCompleted = completeInfo && completeInfo.completed;
                    if (isCompleted) btn.classList.add('eval-completed');
                    const completeBadgeHtml = isCompleted ? `<span class="eval-complete-badge">완료</span>` : "";

                    const tColor = getTypeColor(group.type);
                    
                    // 💡 [UI 동기화] 달력 평가일이 없으면 종료일로 텍스트 자동 대체 및 색상 변경
                    let hasCalendarDate = !!group.evalDate;
                    let displayDate = hasCalendarDate ? shortDate(group.evalDate) : shortDate(group.endDate);
                    let dateColor = hasCalendarDate ? "#f1c40f" : "#bdc3c7";
                    let datePrefix = hasCalendarDate ? "평가: " : "종료일 대체: ";

                    btn.innerHTML = `
                        <span class="unit-subject-label" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <span style="color:${tColor}; font-weight:bold;">[${group.type}]</span> 
                            <div style="text-align:right; font-size:10px; line-height:1.2;">
                                <div style="color:#bdc3c7;">종료: ${shortDate(group.endDate)}</div>
                                <div style="color:${dateColor}; font-weight:bold;">${datePrefix}${displayDate}</div>
                            </div>
                        </span>
                        <b style="color:${nameColor}; display:flex; align-items:center; margin-top:2px;">${group.subject}${upBadgeHtml}${completeBadgeHtml}</b>
                    `;
                    btn.onclick = function() { selectUnit(this, group.subject, "", "", group.evalMethod, group.totalHours, 'subject', group.endDate, group.evalDate); };
                    container.appendChild(btn);
                });

            } else {
                badge.innerText = "능력단위별 모드"; badge.style.backgroundColor = "#e67e22"; 
                let renderArray = courses.map(c => {
                    let unitNameOnly = String(c.unit || "");
                    
                    // 📍 1순위: RD코드 다이렉트 직결 (최고 우선순위)
                    let unitCode = c.rdCode || ""; 

                    const codePatternMatch = unitNameOnly.match(/[0-9]{8,}_[0-9]+v[0-9]+/i);
                    const bracketMatch = unitNameOnly.match(/\[(.*?)\]/); 

                    // 📍 2순위: RD코드가 비어있을 경우에만 구형 텍스트 파싱
                    if (!unitCode) {
                        if (codePatternMatch) unitCode = codePatternMatch[0]; 
                        else if (bracketMatch) unitCode = bracketMatch[1];
                    }

                    // 📍 이름 정제 (화면 출력을 위해 텍스트 속 코드나 괄호는 무조건 제거)
                    if (codePatternMatch) unitNameOnly = unitNameOnly.replace(codePatternMatch[0], "").trim();
                    else if (bracketMatch) unitNameOnly = unitNameOnly.replace(bracketMatch[0], "").trim();
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

                    let eDate = getEvalDateFromCalendar(c.subject, unitNameOnly); // 💡 레이더 스캔
                    return { subject: c.subject, unitCode: unitCode, unitNameOnly: unitNameOnly, determinedEval: determinedEval, totalHours: totalHours, courseType: courseType, endDate: maxDate, evalDate: eDate };
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
                    
                    // 💡 [선생님 지시 적용] 기호, 영어 무시하고 숫자만 추출
                    let targetCode = (item.unitCode || "").replace(/[^0-9]/g, '');

                    // 💡 [단선 복구 2] 텍스트에 코드가 없어 추출 실패 시, 마스터 DB에서 과목명으로 2차 강제 역추적
                    if (!targetCode || targetCode === "") {
                        const textFilter = /[\s·ㆍ\.\_]/g;
                        const cleanName = (item.unitNameOnly || item.subject).replace(textFilter, '');
                        const altKey = Object.keys(globalNcsMasterDB).find(k => {
                            let sName = globalNcsMasterDB[k].subjectName;
                            return sName && sName.replace(textFilter, '') === cleanName;
                        });
                        if (altKey && globalNcsMasterDB[altKey].code) {
                            targetCode = globalNcsMasterDB[altKey].code.replace(/[^0-9]/g, '');
                        }
                    }

                    // 💡 [맹점 완벽 차단] 내 반 DB에 이미 '저장된' 진짜 코드가 있다면 최우선 1순위로 덮어쓰기
                    let nameForDb = item.unitNameOnly || "종합";
                    let dbKey = (item.subject + "_" + nameForDb).replace(/[\.\#\$\/\[\]]/g, '');
                    if (globalEvalPlansData[dbKey] && globalEvalPlansData[dbKey].unitCode && !globalEvalPlansData[dbKey].unitCode.includes("없음")) {
                        targetCode = globalEvalPlansData[dbKey].unitCode.replace(/[^0-9]/g, '');
                    }

                    let isUploaded = false;
                    if (targetCode && targetCode !== "") {
                        // 💡 문자 쪼개기 폐기. DB의 순수 코드들 중에서 오직 숫자만 비교하여 100% 매칭!
                        isUploaded = uploadedKeys.some(dbCode => dbCode.replace(/[^0-9]/g, '') === targetCode);
                    }
                    
                    // 💡 [신규 엔진] 저장 여부와 공통 업로드 여부를 분리하여 표시
                    let hasLocalSave = !!globalEvalPlansData[dbKey];
                    let isNonNcsType = item.courseType.includes("비NCS") || item.courseType.includes("소양");
                    let nameColor = "white";
                    if (hasLocalSave) {
                        nameColor = isNonNcsType ? "#f1c40f" : "#2ecc71"; // 노란색(비NCS) / 초록색(NCS)
                    }
                    let upBadgeHtml = isUploaded ? `<span style="background:#e74c3c; color:white; font-size:9px; padding:1px 4px; border-radius:3px; margin-left:5px; vertical-align:middle; font-weight:bold; box-shadow:0 1px 2px rgba(0,0,0,0.2);">UP</span>` : "";
                    const completeInfo = getEvalCompleteInfo(dbKey);
                    const isCompleted = completeInfo && completeInfo.completed;
                    if (isCompleted) btn.classList.add('eval-completed');
                    const completeBadgeHtml = isCompleted ? `<span class="eval-complete-badge">완료</span>` : "";

                    const tColor = getTypeColor(item.courseType);
                    
                    // 💡 [UI 동기화] 달력 평가일이 없으면 종료일로 텍스트 자동 대체 및 색상 변경
                    let hasCalendarDate = !!item.evalDate;
                    let displayDate = hasCalendarDate ? shortDate(item.evalDate) : shortDate(item.endDate);
                    let dateColor = hasCalendarDate ? "#f1c40f" : "#bdc3c7";
                    let datePrefix = hasCalendarDate ? "평가: " : "종료일 대체: ";

                    btn.innerHTML = `
                        <span class="unit-subject-label" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <span><span style="color:${tColor}; font-weight:bold;">[${item.courseType}]</span> ${item.subject}</span> 
                            <div style="text-align:right; font-size:10px; line-height:1.2;">
                                <div style="color:#bdc3c7;">종료: ${shortDate(item.endDate)}</div>
                                <div style="color:${dateColor}; font-weight:bold;">${datePrefix}${displayDate}</div>
                            </div>
                        </span>
                        <b style="color:${nameColor}; display:flex; align-items:center; margin-top:2px;">${item.unitNameOnly || '단위명 없음'}${upBadgeHtml}${completeBadgeHtml}</b>
                    `;
                    btn.onclick = function() { selectUnit(this, item.subject, item.unitCode, item.unitNameOnly, item.determinedEval, item.totalHours, 'ncs', item.endDate, item.evalDate); };
                    container.appendChild(btn);
                });
            }
        }


        // 💡 [신규 배선] 비NCS/소양 교과 문제 통합 입력 모드 제어 엔진 (기본값 TRUE로 전환 완료)
        window.isIntegratedInputMode = true; 
        window.toggleNonNcsInputMode = async function() {
            window.isIntegratedInputMode = !window.isIntegratedInputMode;
            let btn = document.getElementById('btnToggleInputMode');
            if (btn) {
                // 직관성을 위해 꺼졌을 때는 '개별 입력 모드'로 텍스트 출력
                btn.innerText = window.isIntegratedInputMode ? "🔀 통합 입력 모드 ON" : "🔀 개별 입력 모드 ON";
                btn.style.background = window.isIntegratedInputMode ? "#e67e22" : "#8e44ad";
            }
            if(await appConfirm("💡 문제 입력 방식을 전환하면 화면이 새로고침됩니다.\n(저장하지 않은 내용은 초기화됩니다.)\n진행하시겠습니까?")) {
                let activeBtn = document.querySelector('.unit-btn.active');
                if (activeBtn) activeBtn.click();
            } else {
                window.isIntegratedInputMode = !window.isIntegratedInputMode; // 롤백
                if (btn) {
                    btn.innerText = window.isIntegratedInputMode ? "🔀 통합 입력 모드 ON" : "🔀 개별 입력 모드 ON";
                    btn.style.background = window.isIntegratedInputMode ? "#e67e22" : "#8e44ad";
                }
            }
        };

        // 💡 [비NCS] 평가지 출력용 문제별 글자 크기(%) 조절
        const NON_NCS_DEFAULT_PRINT_SIZE = 100;
        const NON_NCS_PRINT_SIZE_MIN = 60;
        const NON_NCS_PRINT_SIZE_MAX = 130;
        const NON_NCS_PRINT_SIZE_STEP = 5;

        function clampNonNcsPrintSize(v) {
            v = Number(v) || NON_NCS_DEFAULT_PRINT_SIZE;
            return Math.max(NON_NCS_PRINT_SIZE_MIN, Math.min(NON_NCS_PRINT_SIZE_MAX, v));
        }

        function scaleNonNcsFont(basePx, printSize) {
            const scale = clampNonNcsPrintSize(printSize) / 100;
            return (basePx * scale).toFixed(1);
        }

        function getNonNcsPrintSizeCacheKey() {
            if (!currentDbKey) return '';
            return String(currentEvalMode || '본평가') + '::' + String(currentDbKey);
        }

        function getNonNcsPaperQCacheBucket(cacheKey) {
            const key = cacheKey || getNonNcsPrintSizeCacheKey();
            if (!key) return {};
            if (!window.nonNcsPaperQCacheByKey) window.nonNcsPaperQCacheByKey = {};
            if (!window.nonNcsPaperQCacheByKey[key]) window.nonNcsPaperQCacheByKey[key] = {};
            return window.nonNcsPaperQCacheByKey[key];
        }

        function maybePersistNonNcsPaperPrintSizesFromDom() {
            if (!currentDbKey) return;
            const page2El = document.getElementById('page2');
            if (!page2El) return;
            const domKey = page2El.getAttribute('data-non-ncs-paper-key');
            if (!domKey) return;
            const bucket = getNonNcsPaperQCacheBucket(domKey);
            page2El.querySelectorAll('.non-ncs-paper-q').forEach(el => {
                const g = el.getAttribute('data-global-q');
                const inp = el.querySelector('.non-ncs-print-size');
                if (!g || !inp) return;
                const ps = clampNonNcsPrintSize(inp.value);
                if (bucket[g]) bucket[g].printSize = ps;
                else bucket[g] = { printSize: ps };
            });
        }

        function getUnsavedNonNcsPrintSizesForCurrent() {
            const bucket = getNonNcsPaperQCacheBucket();
            const sizes = {};
            Object.keys(bucket).forEach(g => {
                if (bucket[g] && bucket[g].printSize != null) {
                    sizes[g] = clampNonNcsPrintSize(bucket[g].printSize);
                }
            });
            return sizes;
        }

        function getNonNcsPrintSizeFromPaper(globalQNum) {
            const inp = document.querySelector(`#page2 .non-ncs-paper-q[data-global-q="${globalQNum}"] .non-ncs-print-size`);
            if (inp) return clampNonNcsPrintSize(inp.value);
            const bucket = getNonNcsPaperQCacheBucket();
            if (bucket[globalQNum]) {
                return clampNonNcsPrintSize(bucket[globalQNum].printSize);
            }
            return NON_NCS_DEFAULT_PRINT_SIZE;
        }

        function mergeNonNcsPaperPrintSizes(qArr, startGlobalNum = 1) {
            if (!Array.isArray(qArr)) return qArr;
            qArr.forEach((q, i) => {
                const gNum = startGlobalNum + i;
                q.printSize = getNonNcsPrintSizeFromPaper(gNum);
            });
            return qArr;
        }

        function flattenSavedPrintSizes(savedItems) {
            const sizes = {};
            if (!Array.isArray(savedItems)) return sizes;
            let g = 1;
            savedItems.forEach(item => {
                if (!item) return;
                try {
                    const arr = JSON.parse(item.question);
                    if (Array.isArray(arr)) {
                        arr.forEach(q => {
                            if (q && q.printSize) sizes[g] = clampNonNcsPrintSize(q.printSize);
                            g++;
                        });
                    }
                } catch (e) {}
            });
            return sizes;
        }

        function preservePrintSizesInEvalItems(newItems, oldItems) {
            const oldSizes = flattenSavedPrintSizes(oldItems);
            if (!Object.keys(oldSizes).length) return;
            let g = 1;
            newItems.forEach(item => {
                if (!item || !item.question) return;
                try {
                    const arr = JSON.parse(item.question);
                    if (!Array.isArray(arr)) return;
                    arr.forEach(q => {
                        if (oldSizes[g]) q.printSize = oldSizes[g];
                        g++;
                    });
                    item.question = JSON.stringify(arr);
                } catch (e) {}
            });
        }

        window.saveNonNcsPaperPrintSizes = async function() {
            const subject = document.getElementById('S1_1').value;
            const unitName = document.getElementById('S1_2').value;
            if (!subject) return await appAlert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.");
            if (!window.isCurrentNonNCS) return await appAlert("⚠️ 비NCS 과목에서만 글자 크기를 저장할 수 있습니다.");
            if (!currentDbKey) return await appAlert("⚠️ 저장할 평가 대상이 없습니다.");

            const displayName = unitName || subject;
            const paperCount = document.querySelectorAll('.non-ncs-paper-q').length;
            if (paperCount === 0) return await appAlert("⚠️ 2-1. 평가지에 표시된 문제가 없습니다.");

            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const existingData = snap.val();
                if (!existingData || !existingData.items || !existingData.items.length) {
                    return await appAlert("⚠️ 먼저 0.설정에서 평가 항목을 저장한 뒤, 글자 크기를 저장할 수 있습니다.");
                }

                const items = JSON.parse(JSON.stringify(existingData.items));
                let nonNcsGlobalQ = 1;
                items.forEach(item => {
                    if (!item || !item.question) return;
                    try {
                        const arr = JSON.parse(item.question);
                        if (Array.isArray(arr) && arr.length > 0) {
                            mergeNonNcsPaperPrintSizes(arr, nonNcsGlobalQ);
                            nonNcsGlobalQ += arr.length;
                            item.question = JSON.stringify(arr);
                        }
                    } catch (e) {}
                });

                if (!await appConfirm(`[${currentEvalMode}] '${displayName}'\n평가지 글자 크기를 Firebase에 저장하시겠습니까?`)) return;

                await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).update({ items });
                if (globalEvalPlansData[currentDbKey]) globalEvalPlansData[currentDbKey].items = items;

                await appAlert("✅ 평가지 글자 크기가 Firebase에 저장되었습니다!");
            } catch (e) {
                await appAlert("❌ 저장 실패: " + e.message);
            }
        };

        function nonNcsEvidenceAnsDisplay(ans) {
            return String(ans || '').trim();
        }

        function resetNonNcsEvidenceAnswerView() {
            window.nonNcsEvidenceAnsVisible = false;
            document.querySelectorAll('.non-ncs-evidence-ans-overlay').forEach(el => el.remove());
            const btn = document.getElementById('btn_non_ncs_evidence_ans');
            if (btn) {
                btn.textContent = '🔍 정답보기';
                btn.style.background = '#e74c3c';
            }
        }

        window.toggleNonNcsEvidenceAnswerView = function() {
            if (!window.isCurrentNonNCS) return;
            window.nonNcsEvidenceAnsVisible = !window.nonNcsEvidenceAnsVisible;
            const show = window.nonNcsEvidenceAnsVisible;
            const btn = document.getElementById('btn_non_ncs_evidence_ans');
            if (btn) {
                btn.textContent = show ? '📄 빈 답안지 보기' : '🔍 정답보기';
                btn.style.background = show ? '#7f8c8d' : '#e74c3c';
            }
            document.querySelectorAll('.non-ncs-evidence-ans-cell').forEach(cell => {
                const existing = cell.querySelector('.non-ncs-evidence-ans-overlay');
                if (existing) existing.remove();
                if (!show) return;
                const display = nonNcsEvidenceAnsDisplay(cell.getAttribute('data-ans'));
                if (!display) return;
                const span = document.createElement('span');
                span.className = 'non-ncs-evidence-ans-overlay no-print';
                span.style.cssText = 'color:#e74c3c;font-size:38px;font-weight:900;line-height:1;display:block;text-align:center;padding-top:8px;';
                span.textContent = display;
                cell.appendChild(span);
            });
        };

        function nonNcsEvidenceHeaderToolbarHtml() {
            return `<div class="no-print" style="width:100%;margin-bottom:14px;padding:10px 14px;background:#fdf2f2;border:2px solid #e74c3c;border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-sizing:border-box;">
                <button type="button" id="btn_non_ncs_evidence_ans" class="btn-save-settings" onclick="toggleNonNcsEvidenceAnswerView()" style="background:#e74c3c;font-size:14px;padding:8px 16px;font-weight:bold;">🔍 정답보기</button>
                <span style="font-size:12px;color:#7f8c8d;">화면에서만 정답을 확인합니다. 인쇄·PDF에는 빈 답안지만 출력됩니다.</span>
            </div>`;
        }

        function shouldMutePdfEvidenceBtn() {
            if (typeof window.isManualEvalItemCourse === 'boolean') {
                return window.isManualEvalItemCourse;
            }
            return !!window.isCurrentNonNCS;
        }

        function updatePdfEvidenceBtnMutedStyle() {
            const btn = document.getElementById('btn_pdf_evidence');
            if (!btn) return;
            btn.classList.toggle('pdf-printer-btn-muted', shouldMutePdfEvidenceBtn());
        }

        function getEvidencePageNavLabel() {
            return shouldMutePdfEvidenceBtn() ? '3. 근거자료' : '3. 근거사진';
        }

        function updateEvidencePageNavLabel() {
            const label = getEvidencePageNavLabel();
            const btn = document.getElementById('btnPage6');
            if (btn) btn.textContent = label;

            const collapsedBtn = document.querySelector('.collapsed-doc-nav button[data-target-page="page6"]');
            if (!collapsedBtn) return;
            collapsedBtn.title = label;
            const fullLabel = collapsedBtn.querySelector('.collapsed-full-label');
            if (!fullLabel) return;
            const suffix = label.replace(/^3\.\s*/, '');
            fullLabel.innerHTML = '<span>3.</span>' + [...suffix].map(ch => `<span>${ch}</span>`).join('');
        }

        function collectNonNcsQItemData(qItem) {
            return {
                score: qItem.querySelector('.non-ncs-score').value,
                diff: qItem.querySelector('.non-ncs-diff').value,
                q: qItem.querySelector('.non-ncs-q').value,
                img: qItem.querySelector('.non-ncs-img') ? qItem.querySelector('.non-ncs-img').value : "",
                o1: qItem.querySelector('.non-ncs-o1').value,
                o2: qItem.querySelector('.non-ncs-o2').value,
                o3: qItem.querySelector('.non-ncs-o3').value,
                o4: qItem.querySelector('.non-ncs-o4').value,
                ans: qItem.querySelector('.non-ncs-ans').value,
                exp: qItem.querySelector('.non-ncs-exp').value
            };
        }

        function nonNcsPrintSizeControlsHtml(printSize, globalQNum) {
            const ps = clampNonNcsPrintSize(printSize);
            const refreshAttr = globalQNum ? ` oninput="refreshNonNcsPaperQuestion(${globalQNum})"` : '';
            return `<span class="non-ncs-print-size-wrap no-print" style="display:inline-flex; align-items:center; gap:2px; flex-shrink:0; margin-left:4px;" title="평가지 글자 크기(%)">
                <button type="button" onclick="adjustNonNcsPrintSize(this,-${NON_NCS_PRINT_SIZE_STEP})" style="background:#7f8c8d;color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;">A-</button>
                <input type="number" class="eval-input non-ncs-print-size" value="${ps}" min="${NON_NCS_PRINT_SIZE_MIN}" max="${NON_NCS_PRINT_SIZE_MAX}" step="${NON_NCS_PRINT_SIZE_STEP}" style="width:38px;font-size:10px;padding:2px;text-align:center;" title="글자 크기(%)"${refreshAttr}>
                <button type="button" onclick="adjustNonNcsPrintSize(this,${NON_NCS_PRINT_SIZE_STEP})" style="background:#34495e;color:white;border:none;padding:2px 5px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;">A+</button>
            </span>`;
        }

        window.adjustNonNcsPrintSize = function(btn, delta) {
            const wrap = btn.closest('.non-ncs-print-size-wrap');
            if (!wrap) return;
            const input = wrap.querySelector('.non-ncs-print-size');
            input.value = clampNonNcsPrintSize(Number(input.value) + delta);
            const paperQ = wrap.closest('.non-ncs-paper-q');
            if (paperQ) {
                refreshNonNcsPaperQuestion(Number(paperQ.getAttribute('data-global-q')));
            }
        };

        function renderNonNcsPaperQBodyInner(qObj, globalQNum) {
            const ps = qObj.printSize || NON_NCS_DEFAULT_PRINT_SIZE;
            const imgMaxH = Math.round(85 * clampNonNcsPrintSize(ps) / 100);
            const imgHtml = qObj.img ? `<div style="text-align:center; margin: ${scaleNonNcsFont(6, ps)}px 0;"><img src="${qObj.img}" style="max-height:${imgMaxH}px; max-width:100%; object-fit:contain; border:1px solid #bdc3c7; border-radius:4px; padding:2px;"></div>` : '';
            const isIntegrated = (!qObj.o1 && !qObj.o2 && !qObj.o3 && !qObj.o4);

            if (isIntegrated) {
                return `${imgHtml}<div class="non-ncs-paper-q-text" style="color: #111; font-size: ${scaleNonNcsFont(11.5, ps)}px; line-height: 1.6; word-break: keep-all; white-space: pre-wrap;">${qObj.q || ''}</div>`;
            }

            const qText = qObj.q ? qObj.q : '___________________________________';
            const o1Text = qObj.o1 ? qObj.o1 : '__________________';
            const o2Text = qObj.o2 ? qObj.o2 : '__________________';
            const o3Text = qObj.o3 ? qObj.o3 : '__________________';
            const o4Text = qObj.o4 ? qObj.o4 : '__________________';
            const optSize = scaleNonNcsFont(11, ps);

            return `${imgHtml}
                <div class="non-ncs-paper-q-text" style="color: #111; font-size: ${scaleNonNcsFont(11.5, ps)}px; line-height: 1.5; word-break: keep-all; margin-bottom: ${scaleNonNcsFont(3, ps)}px;">${qText}</div>
                <div class="non-ncs-paper-q-options" style="padding-left: 10px; display:flex; flex-direction:column; gap:${scaleNonNcsFont(2, ps)}px; color:#333; font-size: ${optSize}px;">
                    <span>① ${o1Text}</span>
                    <span>② ${o2Text}</span>
                    <span>③ ${o3Text}</span>
                    <span>④ ${o4Text}</span>
                </div>`;
        }

        window.refreshNonNcsPaperQuestion = function(globalQNum) {
            const wrap = document.querySelector(`.non-ncs-paper-q[data-global-q="${globalQNum}"]`);
            if (!wrap) return;
            const input = wrap.querySelector('.non-ncs-print-size');
            if (!input) return;
            const ps = clampNonNcsPrintSize(input.value);
            input.value = ps;

            const cached = getNonNcsPaperQCacheBucket()[globalQNum];
            if (!cached) return;
            cached.printSize = ps;

            const body = wrap.querySelector('.non-ncs-paper-q-body');
            if (body) body.innerHTML = renderNonNcsPaperQBodyInner(cached, globalQNum);

            const head = wrap.querySelector('.non-ncs-paper-q-head');
            if (head) {
                head.style.fontSize = scaleNonNcsFont(12, ps) + 'px';
                head.style.marginBottom = scaleNonNcsFont(4, ps) + 'px';
                const scoreSpan = head.querySelector('.non-ncs-paper-score');
                if (scoreSpan) scoreSpan.style.fontSize = scaleNonNcsFont(10, ps) + 'px';
            }

            const isIntegrated = (!cached.o1 && !cached.o2 && !cached.o3 && !cached.o4);
            wrap.style.marginBottom = scaleNonNcsFont(isIntegrated ? 14 : 12, ps) + 'px';
        };

        window.adjustAllNonNcsPaperPrintSize = function(delta) {
            document.querySelectorAll('.non-ncs-paper-q').forEach(el => {
                const g = Number(el.getAttribute('data-global-q'));
                const input = el.querySelector('.non-ncs-print-size');
                if (!input || !g) return;
                input.value = clampNonNcsPrintSize(Number(input.value) + delta);
                refreshNonNcsPaperQuestion(g);
            });
        };

        function renderNonNcsEvalPaperQuestionHtml(qObj, globalQNum) {
            const ps = qObj.printSize || NON_NCS_DEFAULT_PRINT_SIZE;
            const bucket = getNonNcsPaperQCacheBucket();
            bucket[globalQNum] = Object.assign({}, qObj, { printSize: ps });

            const isIntegrated = (!qObj.o1 && !qObj.o2 && !qObj.o3 && !qObj.o4);
            const mb = scaleNonNcsFont(isIntegrated ? 14 : 12, ps);
            let chapterHtml = "";
            if (qObj.chapter) {
                chapterHtml = `<div style="font-size: ${scaleNonNcsFont(13, ps)}px; font-weight: bold; color: #2980b9; margin-top: ${scaleNonNcsFont(6, ps)}px; margin-bottom: ${scaleNonNcsFont(6, ps)}px; border-bottom: 2px solid #2980b9; padding-bottom: 2px; break-after: avoid; page-break-after: avoid;">▶ ${qObj.chapter}</div>`;
            }

            return `
                <div class="non-ncs-paper-q" data-global-q="${globalQNum}" style="margin-bottom: ${mb}px; break-inside: avoid; page-break-inside: avoid;">
                    ${chapterHtml}
                    <div class="non-ncs-paper-q-head" style="font-weight: bold; margin-bottom: ${scaleNonNcsFont(4, ps)}px; color: #111; font-size: ${scaleNonNcsFont(12, ps)}px; line-height: 1.4; display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                        <span>${globalQNum}.</span>
                        <span class="non-ncs-paper-score" style="font-size:${scaleNonNcsFont(10, ps)}px; color:#e74c3c; font-weight:normal;">[${qObj.score||0}점]</span>
                        ${nonNcsPrintSizeControlsHtml(ps, globalQNum)}
                    </div>
                    <div class="non-ncs-paper-q-body">
                        ${renderNonNcsPaperQBodyInner(qObj, globalQNum)}
                    </div>
                </div>
            `;
        }

        // [신규] 요소 한 줄의 템플릿을 생성하는 부품 함수 (비NCS 객관식 폼 완벽 대응)
function generateEvalRowHtml(name, type, score, diff, question, coreTask, isNonNCS = false) {
    const isTrainee = type === '훈련생작성';
    
    if (isNonNCS && window.isIntegratedInputMode) {
        // 💡 [통합 입력 모드 바둑판 UI] tr을 블록 형태로 축소하고, flex 레이아웃에 맞춰 가로로 3~4개씩 나란히 배치되도록 렌더링
        return `
            <tr class="eval-main-row" style="display:flex; width:calc(33.33% - 6px); flex-grow:1; min-width:200px; border:1px solid #3498db; border-radius:4px; box-sizing:border-box; background:#ebf5fb; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                <td class="item-name" style="position:relative; padding: 6px 10px; width:100%; border:none; display:flex; align-items:center; box-sizing:border-box;">
                    <span style="font-size:11px; font-weight:bold; color:#2980b9; margin-right:5px;">🔹</span>
                    <input type="text" class="eval-input item-name-input" style="flex:1; background:transparent; border:none; font-weight:bold; font-size: 13px; color: #2c3e50; outline:none; min-width:0; padding:0;" value="${name}" placeholder="평가항목명 입력">
                    <button class="no-print" type="button" onclick="removeEvalRow(this)" style="background:#e74c3c; color:white; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-weight:bold; font-size:10px; margin-left:5px; flex-shrink:0; box-shadow:0 1px 2px rgba(0,0,0,0.1);">✖ 삭제</button>
                </td>
            </tr>
        `;
    }

    let qHtml = '';
    if (isNonNCS) {
        let qArr = [];
        try { qArr = JSON.parse(question); } catch(e) { 
            qArr = [{ score: "", diff: "중", q: "", o1: "", o2: "", o3: "", o4: "", ans: "1", exp: "" }]; 
        }
        if (!Array.isArray(qArr) || qArr.length === 0 || typeof qArr[0] === 'string') {
            qArr = [{ score: "", diff: "중", q: "", o1: "", o2: "", o3: "", o4: "", ans: "1", exp: "" }];
        }

        // 📍 [기존 개별 입력 모드 UI]
        qHtml = `<div class="non-ncs-q-container" style="padding: 10px; background: #fdfefe; border: 2px solid #3498db; border-radius: 6px;">
            <div style="font-weight:bold; color:#2980b9; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>📝 객관식 문제 등록 (개별 입력 모드) <span class="q-count-display" style="color:#e74c3c; font-size:12px;">(총 ${qArr.length}문제)</span></span>
                <div style="display:flex; gap:4px;">
                    <button type="button" onclick="autoDistributeNonNcs()" style="background:#f39c12; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">🎲 100점 자동분배</button>
                    <button type="button" onclick="addNonNcsQuestion(this)" style="background:#27ae60; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">➕ 문제 추가</button>
                </div>
            </div>
            <div style="overflow-x:hidden; padding-bottom:5px;">
                <div class="q-list" style="display:flex; flex-direction:column; gap: 4px; width: 100%; box-sizing: border-box;">`;
        
        qArr.forEach((qObj, i) => {
            qHtml += `
                <div class="q-item" style="display:flex; align-items:center; gap:4px; background:#f8f9fa; padding:4px; border:1px solid #bdc3c7; border-radius:4px;">
                    <span class="q-num" style="font-size:11px; font-weight:bold; color:#2c3e50; white-space:nowrap; width:40px; text-align:center;">문제 ${i+1}</span>
                    <input type="number" class="eval-input non-ncs-score" placeholder="배점" style="width:40px; font-size:11px; padding:4px; text-align:center; color:#c0392b; font-weight:bold;" value="${qObj.score || ''}" oninput="syncNonNcsItemScore(this)">
                    <select class="eval-input non-ncs-diff" style="width:45px; font-size:11px; padding:2px; font-weight:bold;">
                        <option value="상" ${qObj.diff==='상'?'selected':''}>상</option>
                        <option value="중" ${qObj.diff==='중' || !qObj.diff ?'selected':''}>중</option>
                        <option value="하" ${qObj.diff==='하'?'selected':''}>하</option>
                    </select>
                    <input type="text" class="eval-input non-ncs-q" placeholder="문제 내용" style="flex:2; font-size:11px; padding:4px;" value="${qObj.q ? qObj.q.replace(/"/g, '&quot;') : ''}">
                    <input type="hidden" class="non-ncs-img" value="${qObj.img || ''}">
                    <button type="button" onclick="this.nextElementSibling.click()" style="background:${qObj.img ? '#2ecc71' : '#95a5a6'}; color:white; border:none; padding:4px 6px; border-radius:3px; cursor:pointer; font-size:10px; flex-shrink:0;" title="이미지 첨부">📷</button>
                    <input type="file" style="display:none" accept="image/*" onchange="processNonNcsImage(this)">
                    <button type="button" onclick="removeNonNcsImage(this)" style="display:${qObj.img ? 'inline-block' : 'none'}; background:#e74c3c; color:white; border:none; padding:4px 6px; border-radius:3px; cursor:pointer; font-size:10px; flex-shrink:0;" title="이미지 삭제">✖</button>
                    <input type="text" class="eval-input non-ncs-o1" placeholder="① 보기" style="flex:1; font-size:11px; padding:4px;" value="${qObj.o1 ? qObj.o1.replace(/"/g, '&quot;') : ''}">
                    <input type="text" class="eval-input non-ncs-o2" placeholder="② 보기" style="flex:1; font-size:11px; padding:4px;" value="${qObj.o2 ? qObj.o2.replace(/"/g, '&quot;') : ''}">
                    <input type="text" class="eval-input non-ncs-o3" placeholder="③ 보기" style="flex:1; font-size:11px; padding:4px;" value="${qObj.o3 ? qObj.o3.replace(/"/g, '&quot;') : ''}">
                    <input type="text" class="eval-input non-ncs-o4" placeholder="④ 보기" style="flex:1; font-size:11px; padding:4px;" value="${qObj.o4 ? qObj.o4.replace(/"/g, '&quot;') : ''}">
                    <select class="eval-input non-ncs-ans" style="width:40px; font-weight:bold; color:#2980b9; font-size:11px; padding:2px;">
                        <option value="1" ${qObj.ans==='1'?'selected':''}>①</option>
                        <option value="2" ${qObj.ans==='2'?'selected':''}>②</option>
                        <option value="3" ${qObj.ans==='3'?'selected':''}>③</option>
                        <option value="4" ${qObj.ans==='4'?'selected':''}>④</option>
                    </select>
                    <input type="text" class="eval-input non-ncs-exp" placeholder="해설" style="flex:1; font-size:11px; padding:4px;" value="${qObj.exp ? qObj.exp.replace(/"/g, '&quot;') : ''}">
                    <button type="button" onclick="removeNonNcsQuestion(this)" style="background:#e74c3c; color:white; border:none; padding:4px 6px; border-radius:3px; font-weight:bold; cursor:pointer; font-size:10px;">➖</button>
                </div>`;
        });
        
        qHtml += `</div></div></div>`;
    } else {
        qHtml = `<textarea class="eval-question-input" placeholder="○ 여기에 출제할 문제(상세 지시사항)를 입력하세요.">${question || ''}</textarea>`;
    }

    return `
        <tr class="eval-main-row">
            <td class="item-name" style="position:relative;">
                <input type="text" class="eval-input item-name-input" style="text-align:left; padding-left:10px; background:transparent; border:none; font-weight:bold; width: 85%;" value="${name}">
                <div class="no-print" style="position:absolute; right:5px; top:50%; transform:translateY(-50%); display:flex; gap:2px;">
                    <button type="button" onclick="duplicateEvalRow(this)" style="background:#3498db; color:white; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-size:10px;">➕</button>
                    <button type="button" onclick="removeEvalRow(this)" style="background:#e74c3c; color:white; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-size:10px;">➖</button>
                </div>
            </td>
            ${isNonNCS ? '' : `
            <td>
                <div class="toggle-group type-selector" data-value="${type || '평가자 체크'}">
                    <button type="button" class="toggle-btn ${!isTrainee ? 'active' : ''}" onclick="changeEvalType(this, '평가자 체크')">교사</button>
                    <button type="button" class="toggle-btn ${isTrainee ? 'active' : ''}" onclick="changeEvalType(this, '훈련생작성')">훈련생</button>
                </div>
            </td>`}
            <td>
                <input type="number" class="eval-input" placeholder="배점" value="${score || ''}" ${isNonNCS ? 'readonly style="background:#fdf2e9; font-weight:bold; color:#d35400;" title="자동 계산됩니다."' : ''}>
            </td>
            ${isNonNCS ? '' : `
            <td><select class="eval-input">
                    <option value="상" ${diff==='상' ? 'selected' : ''}>상</option>
                    <option value="중" ${diff==='중' || !diff ? 'selected' : ''}>중</option>
                    <option value="하" ${diff==='하' ? 'selected' : ''}>하</option>
                </select></td>`}
        </tr>
        <tr class="eval-question-row">
            <td colspan="${isNonNCS ? 2 : 3}">${qHtml}</td>
            ${isNonNCS ? '' : `
            <td colspan="1" style="vertical-align: top; padding-bottom: 12px;">
                <textarea class="eval-core-task-input" placeholder="근거사진용&#13;&#10;핵심작업명">${coreTask || ''}</textarea>
            </td>`}
        </tr>`;
}

window.addNonNcsQuestion = function(btn) {
    const container = btn.closest('.non-ncs-q-container');
    const list = container.querySelector('.q-list');
    const newIndex = list.querySelectorAll('.q-item').length + 1;
    const newItem = document.createElement('div');
    newItem.className = 'q-item';
    
    if (window.isIntegratedInputMode) {
        newItem.style.cssText = 'display:flex; flex-direction:column; gap:6px; background:#fff; padding:8px; border:1px solid #f39c12; border-radius:4px;';
        newItem.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <span class="q-num" style="font-size:12px; font-weight:bold; color:#d35400; width:45px; text-align:center;">문제 ${newIndex}</span>
                <input type="number" class="eval-input non-ncs-score" placeholder="배점" style="width:45px; font-size:11px; padding:4px; text-align:center; color:#c0392b; font-weight:bold;" oninput="syncNonNcsItemScore(this)">
                <select class="eval-input non-ncs-diff" style="width:50px; font-size:11px; padding:4px; font-weight:bold;">
                    <option value="상">상</option><option value="중" selected>중</option><option value="하">하</option>
                </select>
                <input type="hidden" class="non-ncs-img" value="">
                <button type="button" onclick="this.nextElementSibling.click()" style="background:#95a5a6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px; font-weight:bold;" title="이미지 첨부">📷 이미지 첨부</button>
                <input type="file" style="display:none" accept="image/*" onchange="processNonNcsImage(this)">
                <button type="button" onclick="removeNonNcsImage(this)" style="display:none; background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-size:11px; font-weight:bold;" title="이미지 삭제">✖ 삭제</button>
                <button type="button" onclick="removeNonNcsQuestion(this)" style="margin-left:auto; background:#c0392b; color:white; border:none; padding:4px 8px; border-radius:3px; font-weight:bold; cursor:pointer; font-size:11px;">➖ 문제 삭제</button>
            </div>
            <textarea class="eval-input non-ncs-q" placeholder="문제 내용과 보기를 한 번에 복사해서 붙여넣으세요." style="width:100%; height:90px; font-size:12px; padding:8px; resize:vertical; font-family:inherit; line-height:1.5;"></textarea>
            <div style="display:flex; gap:6px; align-items:center;">
                <span style="font-size:11px; font-weight:bold; color:#e67e22;">정답/해설</span>
                <input type="text" class="eval-input non-ncs-ans" placeholder="정답 (예: 1)" style="width:80px; font-size:11px; padding:4px; border:1px dashed #e67e22;">
                <input type="text" class="eval-input non-ncs-exp" placeholder="해설을 입력하세요 (추후 상세화 예정)" style="flex:1; font-size:11px; padding:4px; border:1px dashed #e67e22;">
                <input type="hidden" class="non-ncs-o1" value="">
                <input type="hidden" class="non-ncs-o2" value="">
                <input type="hidden" class="non-ncs-o3" value="">
                <input type="hidden" class="non-ncs-o4" value="">
            </div>
        `;
    } else {
        newItem.style.cssText = 'display:flex; align-items:center; gap:4px; background:#f8f9fa; padding:4px; border:1px solid #bdc3c7; border-radius:4px;';
        newItem.innerHTML = `
            <span class="q-num" style="font-size:11px; font-weight:bold; color:#2c3e50; white-space:nowrap; width:40px; text-align:center;">문제 ${newIndex}</span>
            <input type="number" class="eval-input non-ncs-score" placeholder="배점" style="width:40px; font-size:11px; padding:4px; text-align:center; color:#c0392b; font-weight:bold;" oninput="syncNonNcsItemScore(this)">
            <select class="eval-input non-ncs-diff" style="width:45px; font-size:11px; padding:2px; font-weight:bold;">
                <option value="상">상</option><option value="중" selected>중</option><option value="하">하</option>
            </select>
            <input type="text" class="eval-input non-ncs-q" placeholder="문제 내용" style="flex:2; font-size:11px; padding:4px;">
            <input type="hidden" class="non-ncs-img" value="">
            <button type="button" onclick="this.nextElementSibling.click()" style="background:#95a5a6; color:white; border:none; padding:4px 6px; border-radius:3px; cursor:pointer; font-size:10px; flex-shrink:0;" title="이미지 첨부">📷</button>
            <input type="file" style="display:none" accept="image/*" onchange="processNonNcsImage(this)">
            <button type="button" onclick="removeNonNcsImage(this)" style="display:none; background:#e74c3c; color:white; border:none; padding:4px 6px; border-radius:3px; cursor:pointer; font-size:10px; flex-shrink:0;" title="이미지 삭제">✖</button>
            <input type="text" class="eval-input non-ncs-o1" placeholder="① 보기" style="flex:1; font-size:11px; padding:4px;">
            <input type="text" class="eval-input non-ncs-o2" placeholder="② 보기" style="flex:1; font-size:11px; padding:4px;">
            <input type="text" class="eval-input non-ncs-o3" placeholder="③ 보기" style="flex:1; font-size:11px; padding:4px;">
            <input type="text" class="eval-input non-ncs-o4" placeholder="④ 보기" style="flex:1; font-size:11px; padding:4px;">
            <select class="eval-input non-ncs-ans" style="width:40px; font-weight:bold; color:#2980b9; font-size:11px; padding:2px;">
                <option value="1">①</option><option value="2">②</option><option value="3">③</option><option value="4">④</option>
            </select>
            <input type="text" class="eval-input non-ncs-exp" placeholder="해설" style="flex:1; font-size:11px; padding:4px;">
            <button type="button" onclick="removeNonNcsQuestion(this)" style="background:#e74c3c; color:white; border:none; padding:4px 6px; border-radius:3px; font-weight:bold; cursor:pointer; font-size:10px;">➖</button>
        `;
    }
    list.appendChild(newItem);
    reindexNonNcsQuestions(container);
};

window.removeNonNcsQuestion = function(btn) {
            const container = btn.closest('.non-ncs-q-container');
            btn.closest('.q-item').remove();
            reindexNonNcsQuestions(container);
            // 문제 삭제 후 해당 평가 항목의 총점 다시 계산
            if (window.isIntegratedInputMode) {
                if (typeof window.syncGlobalNonNcsScore === 'function') window.syncGlobalNonNcsScore();
            } else {
                const qListInput = container.querySelector('.non-ncs-score');
                if (qListInput) syncNonNcsItemScore(qListInput);
            }
        };

        // 💡 [신규 배선] 통합 입력 모드 전용 문제 추가 모터
        window.addGlobalNonNcsQuestion = function() {
            const list = document.getElementById('global_q_list');
            if (!list) return;
            const newIndex = list.querySelectorAll('.q-item').length + 1;
            const newItem = document.createElement('div');
            newItem.className = 'q-item';
            newItem.style.cssText = 'display:flex; flex-direction:column; gap:8px; background:#fff; padding:12px; border:1px solid #f39c12; border-radius:6px; box-shadow:inset 0 0 5px rgba(0,0,0,0.02);';
            newItem.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="q-num" style="font-size:14px; font-weight:900; color:#d35400; width:50px; text-align:center;">문제 ${newIndex}</span>
                    <input type="number" class="eval-input non-ncs-score" placeholder="배점" style="width:50px; font-size:12px; padding:6px; text-align:center; color:#c0392b; font-weight:bold;" oninput="syncGlobalNonNcsScore()">
                    <select class="eval-input non-ncs-diff" style="width:60px; font-size:12px; padding:6px; font-weight:bold;">
                        <option value="상">상</option><option value="중" selected>중</option><option value="하">하</option>
                    </select>
                    
                    <input type="hidden" class="non-ncs-img" value="">
                    <button type="button" onclick="this.nextElementSibling.click()" style="background:#95a5a6; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; margin-left:10px;" title="이미지 첨부">📷 사진 영역 (클릭)</button>
                    <input type="file" style="display:none" accept="image/*" onchange="processNonNcsImage(this)">
                    <button type="button" onclick="removeNonNcsImage(this)" style="display:none; background:#e74c3c; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;" title="이미지 삭제">✖ 사진 삭제</button>
                    
                    <button type="button" onclick="removeNonNcsQuestion(this)" style="margin-left:auto; background:#c0392b; color:white; border:none; padding:6px 10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:11px;">➖ 이 문제 지우기</button>
                </div>
                
                <textarea class="eval-input non-ncs-q" placeholder="문제 내용과 보기를 한 번에 복사해서 붙여넣으세요." style="width:100%; height:100px; font-size:13px; padding:10px; resize:vertical; font-family:inherit; line-height:1.6; border: 1px solid #ccc; transition:0.2s;" oninput="if(typeof window.checkGlobalQValidation==='function') window.checkGlobalQValidation(this.closest('.q-item'))"></textarea>
                
                <div style="display:flex; gap:6px; align-items:center; background:#fdf2e9; padding:8px; border-radius:4px; border:1px dashed #e67e22; position:relative;">
                    <span style="font-size:12px; font-weight:bold; color:#e67e22; width:70px;">(예약)<br>정답/해설</span>
                    <div class="ans-btn-group" style="display:flex; gap:4px;">
                        <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid #bdc3c7; background:#fff; color:#333; transition:0.2s;" onclick="setGlobalAns(this, '1')">①</button>
                        <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid #bdc3c7; background:#fff; color:#333; transition:0.2s;" onclick="setGlobalAns(this, '2')">②</button>
                        <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid #bdc3c7; background:#fff; color:#333; transition:0.2s;" onclick="setGlobalAns(this, '3')">③</button>
                        <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid #bdc3c7; background:#fff; color:#333; transition:0.2s;" onclick="setGlobalAns(this, '4')">④</button>
                        <input type="hidden" class="eval-input non-ncs-ans" value="">
                    </div>
                    <input type="text" class="eval-input non-ncs-exp" placeholder="해설을 입력하세요 (추후 상세화 예정)" style="flex:1; font-size:12px; padding:6px; border:1px solid #ccc; border-radius:4px;" oninput="if(typeof window.checkGlobalQValidation==='function') window.checkGlobalQValidation(this.closest('.q-item'))">
                    <input type="hidden" class="non-ncs-o1" value=""><input type="hidden" class="non-ncs-o2" value=""><input type="hidden" class="non-ncs-o3" value=""><input type="hidden" class="non-ncs-o4" value="">
                    <div class="q-warning" style="display:none; position:absolute; right:10px; top:-25px; color:#e74c3c; font-size:11px; font-weight:bold; background:#fff; padding:2px 6px; border:1px solid #e74c3c; border-radius:3px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">⚠️ 정답과 해설을 입력해주세요</div>
                </div>
            `;
            list.appendChild(newItem);
            reindexNonNcsQuestions(list.parentElement.parentElement);
        };

        window.syncGlobalNonNcsScore = function() {
            if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
        };

        window.autoDistributeGlobalNonNcs = async function() {
            const list = document.getElementById('global_q_list');
            if (!list) return;
            const qItems = list.querySelectorAll('.q-item');
            const N = qItems.length;
            if (N === 0) return await appAlert("⚠️ 먼저 문제를 추가해주세요.");

            let hard = Math.round(N * 0.2);
            let easy = Math.round(N * 0.2);
            let med = N - hard - easy;
            if (N === 1) { hard = 0; med = 1; easy = 0; }
            else if (N === 2) { hard = 1; med = 1; easy = 0; }

            let diffs = [];
            for(let i=0; i<hard; i++) diffs.push('상');
            for(let i=0; i<med; i++) diffs.push('중');
            for(let i=0; i<easy; i++) diffs.push('하');
            for (let i = diffs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [diffs[i], diffs[j]] = [diffs[j], diffs[i]];
            }

            let scores = new Array(N).fill(0);
            let baseAvg = Math.floor(100 / N);
            let gap = N > 20 ? 1 : (N > 10 ? 2 : 3); 

            for(let i=0; i<N; i++) {
                if(diffs[i] === '상') scores[i] = baseAvg + gap;
                else if(diffs[i] === '중') scores[i] = baseAvg;
                else if(diffs[i] === '하') scores[i] = Math.max(1, baseAvg - gap);
            }
            
            let sum = scores.reduce((a,b)=>a+b, 0);
            while (sum < 100) {
                let added = false;
                for(let i=0; i<N && sum < 100; i++) { if(diffs[i] === '상') { scores[i]++; sum++; added=true; } }
                for(let i=0; i<N && sum < 100; i++) { if(diffs[i] === '중') { scores[i]++; sum++; added=true; } }
                if(!added) { scores[0]++; sum++; }
            }
            while (sum > 100) {
                let subtracted = false;
                for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '하' && scores[i] > 1) { scores[i]--; sum--; subtracted=true; } }
                for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '중' && scores[i] > 2) { scores[i]--; sum--; subtracted=true; } }
                for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '상' && scores[i] > 3) { scores[i]--; sum--; subtracted=true; } }
                if(!subtracted) break; 
            }

            qItems.forEach((item, idx) => {
                item.querySelector('.non-ncs-diff').value = diffs[idx];
                item.querySelector('.non-ncs-score').value = scores[idx];
            });

            syncGlobalNonNcsScore();
            await appAlert("✅ 글로벌 100점에 맞춰 배점 및 난이도가 자동 분배되었습니다!");
        };


        // 💡 [신규 엔진] 통합 입력 모드 전용 정답 버튼 클릭 및 경고 센서
        window.setGlobalAns = function(btn, val) {
            let group = btn.closest('.ans-btn-group');
            group.querySelectorAll('.ans-btn').forEach(b => {
                b.style.background = '#fff'; b.style.color = '#333'; b.style.borderColor = '#bdc3c7';
            });
            btn.style.background = '#e67e22'; btn.style.color = 'white'; btn.style.borderColor = '#d35400';
            group.querySelector('.non-ncs-ans').value = val;
            
            if(typeof window.checkGlobalQValidation === 'function') window.checkGlobalQValidation(btn.closest('.q-item'));
            if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
        };

        window.checkGlobalQValidation = function(qItem) {
            if (!qItem) return;
            let qText = qItem.querySelector('.non-ncs-q').value.trim();
            let ansVal = qItem.querySelector('.non-ncs-ans').value.trim();
            let expText = qItem.querySelector('.non-ncs-exp').value.trim();
            let warningBox = qItem.querySelector('.q-warning');
            
            if (qText !== "" && (ansVal === "" || expText === "")) {
                if (warningBox) warningBox.style.display = 'block';
                qItem.style.borderColor = '#e74c3c';
                qItem.style.boxShadow = '0 0 8px rgba(231,76,60,0.3)';
            } else {
                if (warningBox) warningBox.style.display = 'none';
                qItem.style.borderColor = '#f39c12';
                qItem.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.02)';
            }
        };

        window.reindexNonNcsQuestions = function(container) {
    const items = container.querySelectorAll('.q-item');
    items.forEach((item, idx) => {
        item.querySelector('.q-num').innerText = `문제 ${idx + 1}`;
    });
    const countDisplay = container.querySelector('.q-count-display');
    if(countDisplay) countDisplay.innerText = `(총 ${items.length}문제)`;
    if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
};


window.processNonNcsImage = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                const max_size = 800; // 용량 폭파 방지 자동 축소 리미터
                if (width > height) { if (width > max_size) { height *= max_size / width; width = max_size; } }
                else { if (height > max_size) { width *= max_size / height; height = max_size; } }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', 0.8);
               
                const container = input.closest('.q-item');
                container.querySelector('.non-ncs-img').value = base64;
                input.previousElementSibling.style.background = '#2ecc71'; // 카메라 아이콘 초록색 점등
                input.nextElementSibling.style.display = 'inline-block'; // 삭제 버튼 표출
               
                const event = new Event('input', { bubbles: true });
                input.dispatchEvent(event);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.removeNonNcsImage = function(btn) {
    const container = btn.closest('.q-item');
    container.querySelector('.non-ncs-img').value = '';
    btn.previousElementSibling.previousElementSibling.style.background = '#95a5a6'; // 카메라 아이콘 회색 복원
    btn.style.display = 'none';
    const event = new Event('input', { bubbles: true });
    btn.dispatchEvent(event);
};


// 💡 [수동 점수 합산 엔진] 문제 하나의 배점을 수정하면 해당 평가항목의 총점이 자동 변경됨
window.syncNonNcsItemScore = function(inputEl) {
    const tr = inputEl.closest('.eval-question-row');
    if (!tr) return;
    const mainTr = tr.previousElementSibling;
    let total = 0;
    tr.querySelectorAll('.non-ncs-score').forEach(inp => total += Number(inp.value) || 0);
    const itemScoreInput = mainTr.querySelector('input[type="number"]');
    if(itemScoreInput) itemScoreInput.value = total;
    if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
};

// 💡 [자동 100점 분배 엔진] 상(20%), 중(60%), 하(20%) 비율 준수 및 정수 기반 분배
window.autoDistributeNonNcs = async function() {
    const qItems = document.querySelectorAll('.q-item');
    const N = qItems.length;
    if (N === 0) return await appAlert("⚠️ 먼저 문제를 추가해주세요.");

    // 1. 난이도 비율에 따른 개수 계산 (반올림)
    let hard = Math.round(N * 0.2);
    let easy = Math.round(N * 0.2);
    let med = N - hard - easy;

    // 만약 문제가 1문제거나 2문제라서 20%가 0개가 된다면 보정
    if (N === 1) { hard = 0; med = 1; easy = 0; }
    else if (N === 2) { hard = 1; med = 1; easy = 0; }

    let diffs = [];
    for(let i=0; i<hard; i++) diffs.push('상');
    for(let i=0; i<med; i++) diffs.push('중');
    for(let i=0; i<easy; i++) diffs.push('하');

    // 난이도 배열 랜덤 셔플
    for (let i = diffs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [diffs[i], diffs[j]] = [diffs[j], diffs[i]];
    }

    // 2. 100점 기준 차등 배점 (상 > 중 > 하)
    let scores = new Array(N).fill(0);
    let baseAvg = Math.floor(100 / N);
    
    // 점수 차이를 극대화하기 위한 가중치 (문제가 많을수록 편차를 줄임)
    let gap = N > 20 ? 1 : (N > 10 ? 2 : 3); 

    for(let i=0; i<N; i++) {
        if(diffs[i] === '상') scores[i] = baseAvg + gap;
        else if(diffs[i] === '중') scores[i] = baseAvg;
        else if(diffs[i] === '하') scores[i] = Math.max(1, baseAvg - gap);
    }
    
    // 3. 100점이 안되거나 넘치는 잉여/초과 점수 보정 (정수 맞추기)
    let sum = scores.reduce((a,b)=>a+b, 0);
    
    // 모자란 점수는 '상', '중' 순서대로 +1점씩 채워넣음
    while (sum < 100) {
        let added = false;
        for(let i=0; i<N && sum < 100; i++) { if(diffs[i] === '상') { scores[i]++; sum++; added=true; } }
        for(let i=0; i<N && sum < 100; i++) { if(diffs[i] === '중') { scores[i]++; sum++; added=true; } }
        if(!added) { scores[0]++; sum++; } // 무한루프 방지
    }
    
    // 넘치는 점수는 '하', '중' 순서대로 -1점씩 깎음 (단, 1점 미만으로 안 떨어지게 방어)
    while (sum > 100) {
        let subtracted = false;
        for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '하' && scores[i] > 1) { scores[i]--; sum--; subtracted=true; } }
        for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '중' && scores[i] > 2) { scores[i]--; sum--; subtracted=true; } }
        for(let i=0; i<N && sum > 100; i++) { if(diffs[i] === '상' && scores[i] > 3) { scores[i]--; sum--; subtracted=true; } }
        if(!subtracted) break; // 무한루프 방지
    }

    // 4. 화면 DOM에 값 주입
    qItems.forEach((item, idx) => {
        item.querySelector('.non-ncs-diff').value = diffs[idx];
        item.querySelector('.non-ncs-score').value = scores[idx];
    });

    // 5. 각 평가 항목(Row)별 총합 점수를 재연산하여 부모 배점 칸에 동기화
    const mainRows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
    mainRows.forEach(tr => {
        const qRow = tr.nextElementSibling;
        if (qRow && qRow.classList.contains('eval-question-row')) {
            let total = 0;
            qRow.querySelectorAll('.non-ncs-score').forEach(inp => total += Number(inp.value) || 0);
            const itemScoreInput = tr.querySelector('input[type="number"]');
            if (itemScoreInput) itemScoreInput.value = total;
        }
    });

    if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
    await appAlert("✅ 총 100점에 맞춰 배점(상>중>하 편차 적용) 및 난이도가 정수로 자동 분배되었습니다!");
};

// 💡 [신규 배선] 통합 입력 모드에서 헤더의 '➕ 평가항목 추가' 버튼을 눌렀을 때 발동하는 엔진
window.addNewIntegratedEvalRow = function() {
    const tbody = document.getElementById('evalItemTbody');
    if (!tbody) return;
    
    // 빈 데이터로 새 항목 생성 (isNonNCS = true 부여)
    const newHtml = generateEvalRowHtml("", "기타(선다형)", 0, "중", "[]", "", true);
    tbody.insertAdjacentHTML('beforeend', newHtml);
    
    // 추가 직후 S5 평가계획관리(평가의 구성) 텍스트 즉시 갱신
    if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
};

// [신규] 항목 복제 실행 함수
window.duplicateEvalRow = function(btn) {
    const currentRow = btn.closest('tr');
    const questionRow = currentRow.nextElementSibling;
    
    // 현재 칸의 데이터 추출
    const name = currentRow.querySelector('.item-name-input').value;
    
    // 💡 [단선 복구] 비NCS 모드일 때 화면에 숨겨진 부품을 찾으려다 엔진이 멈추는 증상 완벽 차단
    const typeGroup = currentRow.querySelector('.type-selector');
    const type = typeGroup ? typeGroup.getAttribute('data-value') : '기타(선다형)';
    
    const scoreInput = currentRow.querySelector('input[type="number"]');
    const score = scoreInput ? scoreInput.value : 0;
    
    const diffSelect = currentRow.querySelector('select');
    const diff = diffSelect ? diffSelect.value : '중';
    
    const coreTaskInput = questionRow.querySelector('.eval-core-task-input');
    const coreTask = coreTaskInput ? coreTaskInput.value : "";

    let questionText = "";
    const qInput = questionRow.querySelector('.eval-question-input');
    if (qInput) {
        questionText = qInput.value;
    } else {
        const nonNcsInputs = questionRow.querySelectorAll('.non-ncs-q-input');
        if (nonNcsInputs.length > 0) {
            let qArr = [];
            nonNcsInputs.forEach(inp => qArr.push(inp.value));
            questionText = JSON.stringify(qArr);
        }
    }

    const newHtml = generateEvalRowHtml(name, type, score, diff, questionText, coreTask, window.isCurrentNonNCS);
    questionRow.insertAdjacentHTML('afterend', newHtml);
    
    // 📍 [신규 배선] 복제 직후 S5 즉시 갱신
    if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
};

// [신규] 항목 삭제 실행 함수
window.removeEvalRow = async function(btn) {
    const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
    if (rows.length <= 1) return await appAlert("⚠️ 최소 1개의 평가 항목은 유지해야 합니다.");
    if (await appConfirm("이 항목을 삭제하시겠습니까?")) {
        const currentRow = btn.closest('tr');
        const questionRow = currentRow.nextElementSibling;
        currentRow.remove();
        questionRow.remove();
        
        // 📍 [신규 배선] 삭제 직후 S5 즉시 갱신
        if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
    }
};

        // 💡 파라미터에 calendarEvalDate 추가
        async function selectUnit(clickedBtn, subject, code, name, evalMethod, hours, mode, endDate, calendarEvalDate) {
            if (window.isCurrentNonNCS) maybePersistNonNcsPaperPrintSizesFromDom();

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
            window.studentScoresDataSourceKey = "";
            const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
            let savedData = snap.val();

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
            // 💡 [통합 매핑 엔진 100% 이식] (Zero-Error)
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
                }
                // 🚨 [2순위] 대형사고 방지를 위해 10자리 강제 호환 로직 전면 폐기 완료!
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

            // 💡 [신규 지능형 모터] 평가 시간(교시 x 60분 연산) 및 평가 장소 실시간 추출기
            let autoEvalTime = "";
            let autoEvalPlace = "";

            if (calendarEvalDate && globalEvaluationDates[mode] && globalEvaluationDates[mode][calendarEvalDate]) {
                const evalData = globalEvaluationDates[mode][calendarEvalDate];
                if (evalData.details && Array.isArray(evalData.details)) {
                    const extractCore = (str) => String(str || "").replace(/\[.*?\]|\(.*?\)/g, '').replace(/\s+/g, '');
                    const coreSub = extractCore(subject);
                    const coreUnit = extractCore(name);
                    
                    const matchedDetail = evalData.details.find(d => {
                        const coreD = extractCore(d.sub);
                        return (coreSub && coreSub === coreD) || (coreUnit && coreUnit === coreD);
                    });

                    if (matchedDetail) {
                        autoEvalPlace = matchedDetail.place || ""; // 장소 획득
                        
                        // 💡 교시 데이터를 분(Minute)으로 변환 (예: "1~4" -> 4교시 -> 240분)
                        let pStr = String(matchedDetail.period || "");
                        let pCount = 0;
                        if (pStr && pStr !== "-") {
                            if (pStr.includes("~") || pStr.includes("-")) {
                                let parts = pStr.split(/[~-]/);
                                let s = parseInt(parts[0]), e = parseInt(parts[1]);
                                if (!isNaN(s) && !isNaN(e)) pCount = (e - s) + 1;
                            } else if (pStr.includes(",")) {
                                pCount = pStr.split(",").length;
                            } else {
                                let pNum = parseInt(pStr);
                                if (!isNaN(pNum)) pCount = 1;
                            }
                        }
                        if (pCount > 0) autoEvalTime = pCount * 60; // 1교시 당 60분 연산
                    }
                }
            }

            // DOM 요소에 값 강제 주입
            document.getElementById('S2_1').value = evalMethod || "작업장평가";
            document.getElementById('S2_2').value = hours;
            // 💡 DB에 저장된 시간/장소가 있으면 그걸 쓰고, 없으면 방금 계산한 자동 값을 밀어넣습니다. (수동 수정 가능)
            document.getElementById('S2_3').value = savedData && savedData.evalTestTime ? savedData.evalTestTime : autoEvalTime;
            document.getElementById('S2_4').value = savedData && savedData.evalPlace ? savedData.evalPlace : autoEvalPlace;

            // 💡 [버전 표시 레이더 장착] 1. 대상 교과 영역에 매칭된 실제 훈련기준 버전 출력
            let targetHeader = document.querySelector('#S_Group1 h3');
            let oldBadge = document.getElementById('matchLevelBadge');
            if (oldBadge) oldBadge.remove(); 

            let badgeColor = "#e74c3c"; 
            let badgeText = "❌ DB 없음 (비NCS 등)"; 

            if (stdData && stdData.code) {
                badgeColor = "#3498db"; 
                
                // 💡 [선생님 지시 적용] 모든 기호, 영어 무시하고 오직 숫자만 추출
                let targetCodeToFind = stdData.code.replace(/[^0-9]/g, '');
                let matchCount = 0;
                
                // 💡 [치명적 원인 해결] 덮어쓰기된 딕셔너리가 아닌, 원본 'allVersionsData'를 무식하게 처음부터 끝까지 뒤집니다.
                Object.keys(allVersionsData).forEach(vId => {
                    const partsData = allVersionsData[vId].data;
                    let foundInThisVersion = false;
                    if(partsData) {
                        Object.keys(partsData).forEach(partName => {
                            const subjects = partsData[partName].data;
                            if(subjects && Array.isArray(subjects)) {
                                subjects.forEach(sub => {
                                    if(sub.code && sub.code.replace(/[^0-9]/g, '') === targetCodeToFind) {
                                        foundInThisVersion = true;
                                    }
                                });
                            }
                        });
                    }
                    if (foundInThisVersion) matchCount++;
                });

                // 만약 똑같은 숫자의 코드가 2개 이상의 버전에 존재하면 "공통", 1개만 있으면 해당 버전의 이름 출력
                let vName = matchCount > 1 ? "공통" : (stdData._versionName || "알 수 없는 버전");
                badgeText = `✅ 연결됨 (${vName})`; 
            }
           
            if (targetHeader) {
                targetHeader.innerHTML += `<span id="matchLevelBadge" style="margin-left:auto; background:${badgeColor}; color:white; font-size:11px; padding:4px 10px; border-radius:4px; box-shadow:0 2px 4px rgba(0,0,0,0.2); font-weight:bold; letter-spacing:-0.5px;">${badgeText}</span>`;
            }
            // =========================================================================

            const evalTbody = document.getElementById('evalItemTbody');
            evalTbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px;'>⏳ 데이터를 불러오는 중입니다...</td></tr>";

            // 💡 [기존 로직] 마지막 수업일 포맷팅
            let fmtDate = "";
            if(endDate){ let dStr=String(endDate).replace(/[\.\/]/g,'-').replace(/\s/g,'').replace(/-$/,''); let p=dStr.split('-'); if(p.length===3) fmtDate=`${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`; }
            
            // 💡 [3중 우선순위 적용 엔진] 버튼에 이미 스캔된 달력 평가일(calendarEvalDate)을 최우선 직결 주입!
            let finalMainDate = calendarEvalDate ? calendarEvalDate : (savedData && savedData.dateMain ? savedData.dateMain : fmtDate);

            document.getElementById('S3_1').value = finalMainDate; 
            document.getElementById('S3_2').value = savedData ? (savedData.dateAdd || "") : ""; 
            document.getElementById('S3_3').value = savedData ? (savedData.dateRe || "") : "";
            updateEvalCompleteButton();

            // 💡 [단선 복구] currentCourseType 변수를 먼저 선언하여 ReferenceError(무한 로딩)를 완벽히 차단합니다.
            let currentCourseType = "NCS 전공교과";
            const typeSpan = clickedBtn.querySelector('.unit-subject-label span');
            if (typeSpan) currentCourseType = typeSpan.innerText.replace(/[\[\]]/g, '');

            // 💡 [신규 지능형 모터] 교과 타입 판독기
            window.isCurrentNonNCS = currentCourseType.includes("비NCS") || currentCourseType.includes("소양");
            updatePdfEvidenceBtnMutedStyle();
            updateEvidencePageNavLabel();

            // 비NCS/소양교과는 추가평가·재평가에서도 본평가의 평가항목 틀을 공유한다.
            // 단, 통합 객관식 문제 내용은 복사하지 않고 빈 배열로 시작한다.
            if (window.isCurrentNonNCS && currentEvalMode !== '본평가' && (!savedData || !savedData.items || savedData.items.length === 0)) {
                try {
                    const mainPlanSnap = await classDbRef(`evalPlans/본평가/${currentDbKey}`).once('value');
                    const mainPlanData = mainPlanSnap.val();
                    if (mainPlanData && mainPlanData.items && mainPlanData.items.length > 0) {
                        savedData = {
                            ...(savedData || {}),
                            subject: savedData?.subject || mainPlanData.subject,
                            unitCode: savedData?.unitCode || mainPlanData.unitCode,
                            unitName: savedData?.unitName || mainPlanData.unitName,
                            evalMethod: savedData?.evalMethod || mainPlanData.evalMethod,
                            totalHours: savedData?.totalHours || mainPlanData.totalHours,
                            evalTestTime: savedData?.evalTestTime || mainPlanData.evalTestTime,
                            evalPlace: savedData?.evalPlace || mainPlanData.evalPlace,
                            ncsVersion: savedData?.ncsVersion || mainPlanData.ncsVersion,
                            items: mainPlanData.items.map(item => ({
                                name: item.name || "",
                                type: item.type || "기타(선다형)",
                                score: item.score || 0,
                                diff: item.diff || "중",
                                question: "[]",
                                coreTask: item.coreTask || ""
                            }))
                        };
                    }
                } catch(e) {
                    console.warn("본평가 평가항목 틀 불러오기 실패:", e);
                }
            }

            // 💡 [신규 배선] 비NCS/소양 교과일 때만 문제 입력 방식 전환 스위치 표출 및 상태 동기화
            const toggleBtn = document.getElementById('btnToggleInputMode');
            if (toggleBtn) {
                toggleBtn.style.display = window.isCurrentNonNCS ? "block" : "none";
                toggleBtn.innerText = window.isIntegratedInputMode ? "🔀 통합 입력 모드 ON" : "🔀 개별 입력 모드 ON";
                toggleBtn.style.background = window.isIntegratedInputMode ? "#e67e22" : "#8e44ad";
            }

            // 💡 [공간 절약 엔진] 비NCS 모드 시 불필요한 열을 폭파시켜 공간을 100% 활용합니다.
            const theadRow = document.querySelector('.eval-item-table thead tr');
            // 💡 [치명적 버그 수정] const evalTbody 중복 선언(재선언)으로 인한 로딩 화면 무한 정지 현상 완벽 해결
            // 함수 상단에 이미 evalTbody가 선언되어 있으므로 const를 다시 붙이지 않습니다.
            
            if (window.isCurrentNonNCS) {
                if (window.isIntegratedInputMode) {
                    theadRow.innerHTML = `
                        <th style="width: 100%; padding: 8px 12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span>평가항목 (과목/단원명만 기입) <span style="font-size:11px; color:#e67e22; font-weight:normal; margin-left:10px;">※ 항목이 바둑판 배열로 압축되어 정렬됩니다.</span></span>
                                <button type="button" class="no-print" onclick="addNewIntegratedEvalRow()" style="background:#27ae60; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:11.5px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">➕ 평가항목 추가</button>
                            </div>
                        </th>`;
                    // 💡 [바둑판 정렬 엔진] tbody를 flex 컨테이너로 변환하여 가로로 나열
                    evalTbody.style.display = 'flex';
                    evalTbody.style.flexWrap = 'wrap';
                    evalTbody.style.gap = '8px';
                    evalTbody.style.padding = '10px';
                    evalTbody.style.background = '#fdfefe';
                } else {
                    theadRow.innerHTML = `
                        <th style="width: 80%;">평가항목 (객관식 문제 묶음) <span style="font-size:11px; color:#e67e22; font-weight:normal;">[➕ 복제 가능]</span></th>
                        <th style="width: 20%;">배점 (총점 100점)</th>
                    `;
                    // 💡 NCS/개별모드 전환 시 순정 상태 복구
                    evalTbody.style.cssText = '';
                }
            } else {
                theadRow.innerHTML = `
                    <th style="width: 40%;">평가항목 (능력단위요소) <span style="font-size:11px; color:#e67e22; font-weight:normal;">[➕ 복제 가능]</span></th>
                    <th style="width: 20%;">평가 방식</th> 
                    <th style="width: 20%;">배점 (총점 80점 기준)</th> 
                    <th style="width: 20%;">출제난이도</th>
                `;
                // 💡 NCS/개별모드 전환 시 순정 상태 복구
                evalTbody.style.cssText = '';
            }

            // 💡 [신규 엔진] 통합 입력 모드일 경우 하단에 글로벌 문제 컨테이너를 생성 및 관리합니다.
            let globalBox = document.getElementById('globalIntegratedQuestionBox');
            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                if (!globalBox) {
                    globalBox = document.createElement('div');
                    globalBox.id = 'globalIntegratedQuestionBox';
                    globalBox.style.marginTop = '15px';
                    // S4 세팅 그룹 가장 하단에 추가 (안전한 노드 탐색)
                    let tableParent = document.querySelector('.eval-item-table').parentElement;
                    if(tableParent && tableParent.parentElement) tableParent.parentElement.appendChild(globalBox);
                }
                
                // DB에서 통합 문제 데이터를 가져옵니다 (기존 데이터 호환성을 위해 1번 평가항목의 question 데이터를 통합 배열로 활용)
                let globalQArr = [];
                if (savedData && savedData.items && savedData.items[0]) {
                    try { globalQArr = JSON.parse(savedData.items[0].question); } catch(e) {}
                }
                if (!Array.isArray(globalQArr) || globalQArr.length === 0) {
                    globalQArr = [{ score: "", diff: "중", q: "", img: "", o1: "", o2: "", o3: "", o4: "", ans: "1", exp: "" }];
                }

                let globalQHtml = `
                    <div class="non-ncs-q-container" style="padding: 15px; background: #fffcf8; border: 2px solid #e67e22; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                        <div style="font-weight:bold; color:#d35400; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size: 16px;">✨ 통합 객관식 문제 리스트 <span class="q-count-display" style="color:#e74c3c; font-size:13px;">(총 ${globalQArr.length}문제)</span></span>
                            <div style="display:flex; gap:6px;">
                                <button type="button" onclick="autoDistributeGlobalNonNcs()" style="background:#f39c12; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">🎲 100점 자동분배</button>
                                <button type="button" onclick="addGlobalNonNcsQuestion()" style="background:#27ae60; color:white; border:none; padding:6px 12px; border-radius:4px; font-size:12px; cursor:pointer; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">➕ 새 문제 추가</button>
                            </div>
                        </div>
                        <div style="overflow-x:hidden; padding-bottom:5px;">
                            <!-- 💡 [수리 완료] 세로 1열(flex)에서 가로 2열(grid) 바둑판 배치로 엔진 교체 -->
                            <div id="global_q_list" class="q-list" style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 12px; width: 100%; box-sizing: border-box;">
                `;

                globalQArr.forEach((qObj, i) => {
                    globalQHtml += `
                        <div class="q-item" style="display:flex; flex-direction:column; gap:8px; background:#fff; padding:12px; border:1px solid #f39c12; border-radius:6px; box-shadow:inset 0 0 5px rgba(0,0,0,0.02);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="q-num" style="font-size:14px; font-weight:900; color:#d35400; width:50px; text-align:center;">문제 ${i+1}</span>
                                <input type="number" class="eval-input non-ncs-score" placeholder="배점" style="width:50px; font-size:12px; padding:6px; text-align:center; color:#c0392b; font-weight:bold;" value="${qObj.score || ''}" oninput="syncGlobalNonNcsScore()">
                                <select class="eval-input non-ncs-diff" style="width:60px; font-size:12px; padding:6px; font-weight:bold;">
                                    <option value="상" ${qObj.diff==='상'?'selected':''}>상</option>
                                    <option value="중" ${qObj.diff==='중' || !qObj.diff ?'selected':''}>중</option>
                                    <option value="하" ${qObj.diff==='하'?'selected':''}>하</option>
                                </select>
                                
                                <input type="hidden" class="non-ncs-img" value="${qObj.img || ''}">
                                <button type="button" onclick="this.nextElementSibling.click()" style="background:${qObj.img ? '#2ecc71' : '#95a5a6'}; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold; margin-left:10px;" title="이미지 첨부">📷 사진 영역 (클릭)</button>
                                <input type="file" style="display:none" accept="image/*" onchange="processNonNcsImage(this)">
                                <button type="button" onclick="removeNonNcsImage(this)" style="display:${qObj.img ? 'inline-block' : 'none'}; background:#e74c3c; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;" title="이미지 삭제">✖ 사진 삭제</button>
                                
                                <button type="button" onclick="removeNonNcsQuestion(this)" style="margin-left:auto; background:#c0392b; color:white; border:none; padding:6px 10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:11px;">➖ 이 문제 지우기</button>
                            </div>
                            
                            <textarea class="eval-input non-ncs-q" placeholder="문제 내용과 보기를 한 번에 복사해서 붙여넣으세요.&#13;&#10;예)&#13;&#10;30℃를 절대온도로 환산하면?&#13;&#10;① 203°K      ② 303°K&#13;&#10;③ 403°K      ④ 503°K" style="width:100%; height:100px; font-size:13px; padding:10px; resize:vertical; font-family:inherit; line-height:1.6; border: 1px solid #ccc; transition:0.2s;" oninput="if(typeof window.checkGlobalQValidation==='function') window.checkGlobalQValidation(this.closest('.q-item'))">${qObj.q ? qObj.q.replace(/"/g, '&quot;') : ''}</textarea>
                            
                            <div style="display:flex; gap:6px; align-items:center; background:#fdf2e9; padding:8px; border-radius:4px; border:1px dashed #e67e22; position:relative;">
                                <span style="font-size:12px; font-weight:bold; color:#e67e22; width:70px;">(예약)<br>정답/해설</span>
                                <div class="ans-btn-group" style="display:flex; gap:4px;">
                                    <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid ${qObj.ans==='1'?'#d35400':'#bdc3c7'}; background:${qObj.ans==='1'?'#e67e22':'#fff'}; color:${qObj.ans==='1'?'white':'#333'}; transition:0.2s;" onclick="setGlobalAns(this, '1')">①</button>
                                    <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid ${qObj.ans==='2'?'#d35400':'#bdc3c7'}; background:${qObj.ans==='2'?'#e67e22':'#fff'}; color:${qObj.ans==='2'?'white':'#333'}; transition:0.2s;" onclick="setGlobalAns(this, '2')">②</button>
                                    <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid ${qObj.ans==='3'?'#d35400':'#bdc3c7'}; background:${qObj.ans==='3'?'#e67e22':'#fff'}; color:${qObj.ans==='3'?'white':'#333'}; transition:0.2s;" onclick="setGlobalAns(this, '3')">③</button>
                                    <button type="button" class="ans-btn" style="width:26px; height:26px; font-size:12px; padding:0; border-radius:4px; cursor:pointer; font-weight:bold; border:1px solid ${qObj.ans==='4'?'#d35400':'#bdc3c7'}; background:${qObj.ans==='4'?'#e67e22':'#fff'}; color:${qObj.ans==='4'?'white':'#333'}; transition:0.2s;" onclick="setGlobalAns(this, '4')">④</button>
                                    <input type="hidden" class="eval-input non-ncs-ans" value="${qObj.ans || ''}">
                                </div>
                                <input type="text" class="eval-input non-ncs-exp" placeholder="해설을 입력하세요 (추후 상세화 예정)" style="flex:1; font-size:12px; padding:6px; border:1px solid #ccc; border-radius:4px;" value="${qObj.exp ? qObj.exp.replace(/"/g, '&quot;') : ''}" oninput="if(typeof window.checkGlobalQValidation==='function') window.checkGlobalQValidation(this.closest('.q-item'))">
                                <input type="hidden" class="non-ncs-o1" value=""><input type="hidden" class="non-ncs-o2" value=""><input type="hidden" class="non-ncs-o3" value=""><input type="hidden" class="non-ncs-o4" value="">
                                <div class="q-warning" style="display:${(qObj.q && (!qObj.ans || !qObj.exp)) ? 'block' : 'none'}; position:absolute; right:10px; top:-25px; color:#e74c3c; font-size:11px; font-weight:bold; background:#fff; padding:2px 6px; border:1px solid #e74c3c; border-radius:3px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">⚠️ 정답과 해설을 입력해주세요</div>
                            </div>
                        </div>`;
                });
                globalQHtml += `</div></div></div>`;
                globalBox.innerHTML = globalQHtml;
                globalBox.style.display = 'block';
            } else if (globalBox) {
                globalBox.style.display = 'none';
            }

            // ==========================================================
            // 💡 [렌더링 코어 교체] 비NCS 여부를 함수에 전달하여 UI 자동 변환
            if (savedData && savedData.items) {
                let html = "";
                savedData.items.forEach(item => {
                    html += generateEvalRowHtml(item.name, item.type, item.score, item.diff, item.question, item.coreTask, window.isCurrentNonNCS);
                });
                evalTbody.innerHTML = html;
            } 
            else if (stdData && stdData.elements && stdData.elements.length > 0) {
                let html = "";
                stdData.elements.forEach((el, index) => {
                    if(!el) return;
                    html += generateEvalRowHtml(`${index + 1}. ${el.name}`, '평가자 체크', '', '중', '', '', window.isCurrentNonNCS);
                });
                evalTbody.innerHTML = html;
            }
            else {
                evalTbody.innerHTML = "";
                // 💡 비NCS일 경우, 1개의 폼만 세팅하되 점수는 빈칸(자동계산 대기)으로 둡니다.
                let defaultQ = window.isCurrentNonNCS ? JSON.stringify([{ score: "", diff: "중", q: "", o1: "", o2: "", o3: "", o4: "", ans: "1", exp: "" }]) : "";
                let initScore = window.isCurrentNonNCS ? "" : 80;
                let initType = window.isCurrentNonNCS ? '기타(선다형)' : '평가자 체크';
                evalTbody.innerHTML += generateEvalRowHtml(`${subject} 종합평가`, initType, initScore, '중', defaultQ, '', window.isCurrentNonNCS);
            }
            // ==========================================================

            // (위로 이동됨) let currentCourseType = "NCS 전공교과"; 
            // (위로 이동됨) const typeSpan = clickedBtn.querySelector('.unit-subject-label span');
            // (위로 이동됨) if (typeSpan) currentCourseType = typeSpan.innerText.replace(/[\[\]]/g, '');
            

            // 💡 1번 표지에도 순정 데이터(officialCategory, officialSubjectName, officialCode) 주입
            renderCoverPage(stdData, officialCategory, officialSubjectName, officialCode, hours, currentCourseType);
            
            // 📍 [신규 배선] S5 장비 목록 및 텍스트 패널에 데이터 쏴주기
            if(typeof window.updateS5Panel === 'function') window.updateS5Panel(stdData);
        }

        function updateCollapsedDocNavActive(pageId) {
            document.querySelectorAll('.collapsed-doc-nav button').forEach(btn => {
                btn.classList.toggle('collapsed-active', btn.getAttribute('data-target-page') === pageId);
            });
        }

        async function showPage(pageId, btnElement) {
            // 💡 [신규 차단기] 탭(화면)을 이동할 때 열려있던 커스텀 에디터 툴바를 강제로 닫고 비활성화
            if (window.CustomMatrixEngine) window.CustomMatrixEngine.closeEditor();

            const pages = document.querySelectorAll('.page-frame, .page1-container, .eval-paper-container'); 
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
           
            const btns = document.querySelectorAll('.nav-btn');
            btns.forEach(btn => btn.classList.remove('active'));
            if (btnElement) btnElement.classList.add('active');

            // 💡 [신규 배선] 다른 탭 클릭 시 평균점수 화면 버튼 활성화 강제 해제
            const avgBtn = document.getElementById('btn_show_average');
            if (avgBtn) avgBtn.classList.remove('active');
            updateCollapsedDocNavActive(pageId);

            const globalBar = document.getElementById('globalModeBar');
            if (globalBar) {
                // page7(전 과목 평균) 진입 시에도 글로벌 바 숨김
                if (pageId === 'page0' || pageId === 'page4' || pageId === 'page5' || pageId === 'page7') {
                    globalBar.style.display = 'none';
                } else {
                    globalBar.style.display = 'block';
                }
            }

            if (pageId === 'page1' || pageId === 'page6') {
                await buildEvaluationDocs();
            } else if (pageId === 'page2') {
                buildEvaluationPaper();
            } else if (pageId === 'page3') {
                buildAnswerDocs();
            } else if (pageId === 'page4') {
                buildFinalResultDocs(); 
            } else if (pageId === 'page5') {
                buildPersonalEvalDocs(); 
            }
            if (typeof window.scheduleEvalMobileDocFit === 'function') {
                var fitDelay = (pageId === 'page1' || pageId === 'page6') ? 320 : 80;
                window.scheduleEvalMobileDocFit(fitDelay);
            }
        }

        // 📍 [보안 추가] HTML에서 뜯어온 시크릿 도어 로직 (안전한 JS 내부로 이식 완료)
let secretClickCount = 0;
let secretClickTimer;

function triggerSecretDoor() {
    secretClickCount++;
    clearTimeout(secretClickTimer);
    secretClickTimer = setTimeout(() => { secretClickCount = 0; }, 2000); 

    if (secretClickCount >= 5) {
        secretClickCount = 0; 
        console.log("🔓 엔지니어 모드: 인증 절차를 건너뛰고 계측 화면으로 점프합니다.");
        location.href = '../차체/계측.html';
    }
}
// --------------------------------------------------------------------

        let currentEvalMode = '본평가'; 
        window.switchEvalType = function(type) { // btnElement 파라미터 폐기 (이벤트 위임으로 대체)
            if (window.isCurrentNonNCS) maybePersistNonNcsPaperPrintSizesFromDom();
            currentEvalMode = type;
            
            // 💡 모든 전환 버튼(0.설정 및 글로벌 바) 상태 동기화
            const tabs = document.querySelectorAll('.dynamic-switch-eval'); // 클래스 타겟팅 정밀화
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
                        if (activePageBtn) activePageBtn.click(); // 여기서 가상의 클릭 이벤트 발생
                    }, 400); // DB 파싱 후 화면 갱신 대기
                }
            }
        }

        async function executeSave() {
            const subject = document.getElementById('S1_1').value;
            const unitName = document.getElementById('S1_2').value;
            if (!subject) return await appAlert("⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.");

            const displayName = unitName ? unitName : subject;
            const dbKey = currentDbKey; // 기존 저장 경로 엇갈림 방지 (다이렉트 연결)

            const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
            let totalScore = 0;
            const evalItems = [];

            if (rows.length === 0) return await appAlert("⚠️ 저장할 요소 데이터가 없습니다.");

            let nonNcsGlobalQ = 1;

            // 💡 [신규 엔진] 통합 입력 모드일 경우 글로벌 문제들을 전부 모아서 1번 항목(index 0)의 question에 압축 포장합니다.
            let globalQuestionText = "";
            let globalTotalScore = 0;
            let existingData = {};
            try {
                const preSnap = await classDbRef(`evalPlans/${currentEvalMode}/${dbKey}`).once('value');
                existingData = preSnap.val() || {};
            } catch (e) { console.warn("DB 사전 로드 에러:", e); }

            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                let globalItems = document.querySelectorAll('#global_q_list .q-item');
                let qArr = [];
                globalItems.forEach(qItem => {
                    let s = Number(qItem.querySelector('.non-ncs-score').value) || 0;
                    globalTotalScore += s;
                    const qData = collectNonNcsQItemData(qItem);
                    qData.score = s;
                    qArr.push(qData);
                });
                globalQuestionText = JSON.stringify(qArr);
            }

            rows.forEach((tr, index) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                
                // 💡 [비NCS/소양 전용] 타입 고정
                const type = typeGroup ? typeGroup.getAttribute('data-value') : (window.isCurrentNonNCS ? "기타(선다형)" : "평가자 체크"); 
                
                let score = 0;
                let diff = "중";
                let questionText = ""; 
                let coreTaskText = "";
                
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    // 💡 [통합 모드 연산] 첫 번째 항목에만 모든 문제 데이터를 캡슐화시켜서 탑재 (나머지 항목은 껍데기만 유지하여 DB 파괴 방지)
                    if (index === 0) {
                        score = globalTotalScore;
                        questionText = globalQuestionText;
                    } else {
                        score = 0;
                        questionText = "[]";
                    }
                    totalScore = globalTotalScore; // 최종 100점 검증용
                } else {
                    // 💡 [기존 개별 모드]
                    const inputs = tr.querySelectorAll('input[type="number"]');
                    score = inputs[0] ? Number(inputs[0].value) : 0;
                    
                    const selects = tr.querySelectorAll('select');
                    diff = selects[0] ? selects[0].value : "중";

                    const targetQRow = tr.nextElementSibling;
                    if (targetQRow && targetQRow.classList.contains('eval-question-row')) {
                        const qInput = targetQRow.querySelector('.eval-question-input'); 
                        if (qInput) {
                            questionText = qInput.value;
                        } else {
                            const nonNcsItems = targetQRow.querySelectorAll('.q-item');
                            let qArr = [];
                            if (nonNcsItems.length > 0) {
                                nonNcsItems.forEach(qItem => {
                                    qArr.push(collectNonNcsQItemData(qItem));
                                });
                                nonNcsGlobalQ += qArr.length;
                            }
                            questionText = JSON.stringify(qArr); 
                        }
                        const cInput = targetQRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                    }
                    totalScore += score;
                }
                
                evalItems.push({ name, type, score, diff, question: questionText, coreTask: coreTaskText }); 
            });

            if (window.isCurrentNonNCS && existingData.items) {
                preservePrintSizesInEvalItems(evalItems, existingData.items);
            }

            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${dbKey}`).once('value');
                existingData = snap.val() || existingData;

                // 💡 [신규 배선] 기존에 4번 탭에서 저장해둔 커스텀 평가기준 증발 완벽 방어
                if (existingData.customCriteria) {
                    saveData.customCriteria = existingData.customCriteria;
                }

                evalItems.forEach((item, i) => {
                    if (window.downloadedCustomItems && window.downloadedCustomItems[i]) {
                        if (window.downloadedCustomItems[i].customHtml) item.customHtml = window.downloadedCustomItems[i].customHtml;
                        if (window.downloadedCustomItems[i].ansHtml) item.ansHtml = window.downloadedCustomItems[i].ansHtml;
                    } else if (existingData && existingData.items) {
                        let match = null;
                        if (existingData.items[i] && existingData.items[i].type === item.type && existingData.items[i].name === item.name) {
                            match = existingData.items[i];
                        } else {
                            let found = Object.values(existingData.items).find(old => old && old.type === item.type && old.name === item.name);
                            if (found) match = found;
                            else if (existingData.items[i] && existingData.items[i].type === item.type) match = existingData.items[i];
                        }

                        if (match) {
                            if (match.customHtml) item.customHtml = match.customHtml;
                            if (match.ansHtml) item.ansHtml = match.ansHtml;
                        }
                    }
                });
                window.downloadedCustomItems = null; 
            } catch(e) { console.warn("DB 병합 중 에러 발생", e); }

            // 💡 [비NCS/소양 전용] 배점 경고 알림 분리 적용
            if (window.isCurrentNonNCS) {
                if (totalScore !== 100) {
                    await appAlert(`⚠️ [안내] 현재 비NCS/소양교과의 배점 총합이 100점이 아닙니다. (현재: ${totalScore}점)\n입력된 내용으로 저장을 진행합니다.`);
                }
            } else {
                if (totalScore !== 80) {
                    await appAlert(`⚠️ [안내] 현재 NCS교과의 배점 총합이 80점이 아닙니다. (현재: ${totalScore}점)\n입력된 내용으로 저장을 진행합니다.`);
                }
            }

            const indVersion = document.getElementById('individualNcsSelect').value;

            const saveData = {
                subject: subject, unitCode: document.getElementById('S1_Code').value, unitName: unitName,
                evalMethod: document.getElementById('S2_1').value, 
                totalHours: document.getElementById('S2_2').value,
                evalTestTime: document.getElementById('S2_3').value, 
                evalPlace: document.getElementById('S2_4').value,
                dateMain: document.getElementById('S3_1').value, dateAdd: document.getElementById('S3_2').value, dateRe: document.getElementById('S3_3').value,
                ncsVersion: indVersion,
                items: evalItems
            };

            if(!await appConfirm(`[${currentEvalMode}] '${displayName}'\n해당 설정 내용으로 저장(업데이트) 하시겠습니까?`)) return;

            try {
                await classDbRef(`evalPlans/${currentEvalMode}/${dbKey}`).set(saveData);
                
                // 💡 [신규 배선] 저장 즉시 메모리에 반영하고 좌측 리스트 UI 실시간 동기화
                globalEvalPlansData[dbKey] = saveData;
                let prevActiveSubject = document.querySelector('.unit-btn.active b')?.innerText.replace('UP', '').trim();
                let currentModeStr = document.getElementById('viewModeBadge').innerText.includes("교과목") ? 'subject' : 'ncs';
                renderListBasedOnMode(globalCoursesData, currentModeStr, globalFullTimetable, globalUploadedKeys);
                document.querySelectorAll('.unit-btn').forEach(btn => {
                    let bText = btn.querySelector('b')?.innerText.replace('UP', '').trim();
                    if (bText === prevActiveSubject) btn.classList.add('active');
                });

                await appAlert(`✅ [${currentEvalMode}] '${displayName}' 저장이 완료되었습니다!`);
                
                if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
            } catch(e) { await appAlert("❌ 저장 실패: " + e.message); }
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
                
                // 💡 [비NCS/소양 전용 회로] 테이블 헤더 텍스트 독립 변환 및 4열 은폐
                let th1 = document.getElementById('cover_th_1'); // 💡 1열 헤더 추적기 장착
                let th2 = document.getElementById('cover_th_2');
                let th3 = document.getElementById('cover_th_3');
                let th4 = document.getElementById('cover_th_4');

                if (window.isCurrentNonNCS) {
                    if (th1) th1.innerHTML = "교과목명"; // 💡 비NCS: 능력단위명 삭제
                    if (th2) th2.innerText = "훈련시간";
                    if (th3) { th3.innerText = "하위능력별"; th3.style.width = "50%"; } // 너비 자동 보정
                    if (th4) th4.style.display = "none"; // 4열 헤더 완전 소각
                } else {
                    if (th1) th1.innerHTML = "교과목명<br>(능력단위명)"; // 💡 NCS: 원상 복구
                    if (th2) th2.innerText = "능력단위코드";
                    if (th3) { th3.innerText = "능력단위요소명"; th3.style.width = "35%"; }
                    if (th4) { th4.style.display = ""; th4.innerText = "훈련시간"; }
                }

                let elements = [];
                if (!window.isCurrentNonNCS && stdData && stdData.elements && stdData.elements.length > 0) {
                    // 1순위: NCS 공식 DB 데이터가 있으면 가져옴 (NCS 한정)
                    elements = stdData.elements.filter(el => el !== null && el !== undefined);
                } else {
                    // 💡 [비NCS/소양 전용] DB에 상관없이 설정 화면의 평가항목을 무조건 긁어옴
                    document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach(tr => {
                        let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                        name = name.replace(/^\d+\.\s*/, '').trim(); 
                        if (name) elements.push({ name: name }); 
                    });
                }

                const rowspan = elements.length > 0 ? elements.length : 1;
                let html = "";
                
                const isSubjectMode = document.getElementById('viewModeBadge').innerText.includes("교과목");
                const cleanSubject = isSubjectMode ? subject : subject.replace(/\([0-9]+수준\)/g, '').trim();

                if (elements.length > 0) {
                    // 💡 [비NCS/소양 전용] 항목 개수에 따른 지능형 자동 압축 엔진 (1페이지 오버플로우 방지)
                    let dynamicStyle = "";
                    if (window.isCurrentNonNCS) {
                        let N = elements.length;
                        if (N > 15) {
                            dynamicStyle = `style="font-size: 10px !important; padding: 3px 4px !important; line-height: 1.1 !important;"`;
                        } else if (N > 10) {
                            dynamicStyle = `style="font-size: 11px !important; padding: 5px 6px !important; line-height: 1.2 !important;"`;
                        } else if (N > 5) {
                            dynamicStyle = `style="font-size: 12px !important; padding: 7px 6px !important; line-height: 1.3 !important;"`;
                        }
                    }

                    elements.forEach((el, index) => {
                        html += `<tr>`;
                        
                        if (window.isCurrentNonNCS) {
                            // 💡 [비NCS/소양 렌더링] 자동 압축 스타일 적용 및 능력단위명 데이터 은폐
                            if (index === 0) html += `<td rowspan="${rowspan}" ${dynamicStyle}><b>${cleanSubject}</b></td>`; 
                            if (index === 0) html += `<td rowspan="${rowspan}" ${dynamicStyle}>${hours}</td>`; // 2열 (훈련시간)
                            html += `<td ${dynamicStyle}>${el.name || "이름 없음"}</td>`; // 3열 (하위능력별)
                        } else {
                            // 💡 [NCS 순정 렌더링] 기존 엔진 4열 구조 및 순정 스타일 100% 보존
                            if (index === 0) html += `<td rowspan="${rowspan}"><b>${cleanSubject}</b><br><br>${unitName || cleanSubject}</td>`;
                            let elementCode = unitCode ? `${unitCode}.${index + 1}` : "-";
                            html += `<td>${elementCode}</td><td>${el.name || "이름 없음"}</td>`;
                            if (index === 0) html += `<td rowspan="${rowspan}">${hours}</td>`;
                        }
                        html += `</tr>`;
                    });
                } else {
                    if (window.isCurrentNonNCS) {
                        html = `<tr><td><b>${cleanSubject}</b></td><td>${hours}</td><td>(하위능력 없음)</td></tr>`;
                    } else {
                        html = `<tr><td><b>${cleanSubject}</b><br><br>${unitName || cleanSubject}</td><td>${unitCode || "-"}</td><td>(능력단위요소 없음)</td><td>${hours}</td></tr>`;
                    }
                }
                tbody.innerHTML = html;
                if (document.getElementById('page1') && document.getElementById('page1').classList.contains('active')
                    && typeof window.scheduleEvalMobileDocFit === 'function') {
                    window.scheduleEvalMobileDocFit(120);
                }
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
            const teacher = document.getElementById('S0_Teacher').value || ""; // 💡 추가: 3.근거자료 상단 표에 들어갈 담당교사명 추출

            if (!subject) {
                document.getElementById('exam_header_container').innerHTML = "<p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p>";
                document.getElementById('photo_header_container').innerHTML = "";
                document.getElementById('photo_grid_container').innerHTML = "";
                return;
            }

            // 💡 [비NCS/소양 전용 회로] 1번 평가서류의 2,3,4번째 페이지 화면 은폐
            const p1Pages = document.querySelectorAll('#page1 .a4-page');
            if (p1Pages.length >= 4) {
                if (window.isCurrentNonNCS) {
                    p1Pages[1].style.display = 'none'; // 요구사항 제거
                    p1Pages[2].style.display = 'none'; // 유의사항 제거
                    p1Pages[3].style.display = 'none'; // 빈 근거사진 제거
                } else {
                    p1Pages[1].style.display = ''; // NCS: 순정 복구
                    p1Pages[2].style.display = '';
                    p1Pages[3].style.display = '';
                }
            }

            if (!currentDbKey) {
                currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');
            }

            // 💡 [통합 입력 모드 DOM 추출기 장착]
            let globalQuestionText = "[]";
            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                let globalItems = document.querySelectorAll('#global_q_list .q-item');
                let qArr = [];
                globalItems.forEach(qItem => {
                    qArr.push(collectNonNcsQItemData(qItem));
                });
                globalQuestionText = JSON.stringify(qArr);
            }

            const items = [];
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach((tr, index) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                
                // 💡 [단선 복구] NCS 모드에서 undefined 에러를 일으킨 score 추출 변수 재장착!
                // 💡 [수리 완료] 통합 입력 모드에서는 UI에 점수칸이 없으므로 글로벌 점수를 합산하여 주입
                let score = 0;
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (index === 0) {
                        document.querySelectorAll('#global_q_list .non-ncs-score').forEach(inp => score += Number(inp.value) || 0);
                        if (score === 0 && typeof savedItems !== 'undefined' && savedItems[index]) score = savedItems[index].score || 0;
                    }
                } else {
                    score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                }

                let questionText = ""; let coreTaskText = "";
                
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (index === 0) questionText = globalQuestionText;
                    else questionText = "[]";
                } else {
                    const targetQRow = tr.nextElementSibling; // 변수명 충돌 방지용 범용 이름
                    if (targetQRow && targetQRow.classList.contains('eval-question-row')) {
                    const qInput = targetQRow.querySelector('.eval-question-input'); 
                    if (qInput) {
                        questionText = qInput.value;
                    } else {
                        const nonNcsItems = targetQRow.querySelectorAll('.q-item');
                        if (nonNcsItems.length > 0) {
                            let qArr = [];
                            nonNcsItems.forEach(qItem => {
                                qArr.push(collectNonNcsQItemData(qItem));
                            });
                            questionText = JSON.stringify(qArr);
                        }
                    }
                    const cInput = targetQRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                }
            } // 💡 [추가된 괄호] else 구문을 완벽하게 닫아줍니다.
            // 💡 추출한 score 변수를 포함하여 데이터 압축
            items.push({ name, score, question: questionText, coreTask: coreTaskText });
        });

            let photoData = {};
            if (currentDbKey) {
                const snap = await classDbRef(`evalPhotos/${currentEvalMode}/${currentDbKey}`).once('value');
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
                let displayQ = item.question || '문제가 입력되지 않았습니다.';
                
                if (window.isCurrentNonNCS) {
                    // 💡 [비NCS 격리 모드] 배점 표기 및 객관식 폼 전용 렌더링
                    try {
                        let arr = JSON.parse(item.question);
                        if (Array.isArray(arr)) {
                            displayQ = arr.map((qObj, i) => `
                                <div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed #e1e4e8; page-break-inside: avoid;">
                                    <div style="font-weight:bold; margin-bottom: 6px; color: #2c3e50;">
                                        ${i+1}번. ${qObj.q || '문제 없음'} 
                                        <span style="font-size:11px; color:#e74c3c;">(${qObj.score||0}점 / 난이도 ${qObj.diff||'중'})</span>
                                    </div>
                                    <div style="margin-left: 15px; font-size: 13.5px; color: #333; display: flex; flex-direction: column; gap: 4px;">
                                        <span>① ${qObj.o1 || ''}</span>
                                        <span>② ${qObj.o2 || ''}</span>
                                        <span>③ ${qObj.o3 || ''}</span>
                                        <span>④ ${qObj.o4 || ''}</span>
                                    </div>
                                </div>
                            `).join('');
                        }
                    } catch(e) {}
                    
                    questionsHtml += `
                        <div style="margin-bottom: 25px; page-break-inside: avoid;">
                            <div style="font-weight: bold; font-size: 15px; margin-bottom: 8px;">[제${index+1} 평가항목] ${item.name} <span style="font-size:12px; color:#c0392b;">(항목 총 배점: ${item.score}점)</span></div>
                            <div style="font-size: 14.5px; line-height: 1.6; word-break: keep-all; display: flex;">
                                <div style="width: 100%;">${displayQ}</div>
                            </div>
                        </div>`;
                } else {
                    // 💡 [NCS 순정 모드 복구] 기존의 여백, 기호(○), 줄바꿈(<br>) 엔진을 100% 완벽히 복원합니다. (배점 표시 삭제)
                    questionsHtml += `
                        <div style="margin-bottom: 25px;">
                            <div style="font-weight: bold; font-size: 15px; margin-bottom: 8px;">[제${index+1} 평가항목] ${item.name}</div>
                            <div style="font-size: 14.5px; line-height: 1.6; word-break: keep-all; display: flex;">
                                <span style="margin-right: 6px;">○</span>
                                <div style="width: 100%;">${displayQ.replace(/\n/g, '<br>')}</div>
                            </div>
                        </div>`;
                }
            });
            document.getElementById('exam_questions_container').innerHTML = questionsHtml || "<p>평가 항목이 없습니다.</p>";

            // 💡 [비NCS 격리 차단기] 비NCS 모드일 때만 기존 사진 업로드를 삭제하고 답안지 폼 렌더링
            if (window.isCurrentNonNCS) {
                let page6 = document.getElementById('page6');
                
                // 💡 [안전 스캔] innerText 대신 textContent를 사용하여 화면이 가려져 있을 때도 에러 없이 강제 탐지
            let photoTitle = Array.from(page6.querySelectorAll('div')).find(d => d.textContent && d.textContent.trim() === '■ 내부 평가 근거 사진');
            if (photoTitle) photoTitle.style.display = 'none'; // 기존 타이틀 숨김

                // 💡 [에러 원인 차단] 함수 상단에 변수를 선언할 필요 없이, 이 안에서 다이렉트로 교사 이름을 즉시 추출하여 튕김 방지
                let currentTeacher = document.getElementById('S0_Teacher') ? document.getElementById('S0_Teacher').value : "김회준";

                // 💡 [치명적 버그 수리 완료] 날짜 변환기(dotDate)가 이 함수 구역에 없어 엔진이 멈추는 현상 완벽 방어!
                const dotDate = (d) => d ? d.replace(/-/g, '.') : "";
                
                // 💡 [신규 배선] 평가항목 이름 추출 및 지능형 행 분할(rs) 값 연산 추가
                let itemNamesList = items.map(item => item.name).join(', ');
                let finalUnitDisplay = itemNamesList || unitDisplay;
                let rs = dateRows.length === 3 ? 2 : 3;

                // 💡 [선언 및 초기화] 여기서 nonNcsHtml 변수를 선언해야 에러가 나지 않습니다.
                let nonNcsHtml = `
                    <table class="ep-table" style="margin-bottom: 35px; border: 2px solid #000; width: 100%; table-layout: fixed; text-align: center; border-collapse: collapse;">
                        <colgroup>
                            <col style="width: 12%;">
                            <col style="width: 12%;">
                            <col style="width: 15%;"> <!-- 💡 [수정] 본평가/재평가 날짜 적히는 열 (가로길이 15%로 통일) -->
                            <col style="width: 12%;">
                            <col style="width: 15%;"> <!-- 💡 [수정] 훈련생명 적히는 열 (가로길이 15%로 통일) -->
                            <col style="width: 12%;">
                            <col style="width: 22%;"> <!-- 💡 [수정] 우측 끝 서명 열 (합계 100% 맞춤) -->
                        </colgroup>
                        <tr>
                            <th colspan="7" style="font-size: 22px; font-weight: 900; padding: 12px 0 !important; letter-spacing: 2px; background-color: #e0ffff; border-bottom: 2px solid #000;">
                                ${evalModePrefix}내부평가 근거자료 <span style="color: #7f8c8d; font-size: 18px; font-weight: bold; letter-spacing: 0;">(답안지)</span>
                            </th>
                        </tr>
                        <tr style="height: 30px;">
                            <th style="background-color: #e0ffff;">교 과 목</th>
                            <td colspan="4" style="font-weight: bold;">${subject}</td>
                            <th style="background-color: #e0ffff;">평가방법</th>
                            <td style="font-weight: bold;">${evalMethod}</td>
                        </tr>
                        <tr style="height: 30px;">
                            <th style="background-color: #e0ffff;">평가항목</th>
                            <td colspan="4" style="font-weight: bold; line-height: 1.4; padding: 4px;">${finalUnitDisplay}</td>
                            <th style="background-color: #e0ffff;">평가시간</th>
                            <td style="font-weight: bold;">${evalTestTime} 분</td>
                        </tr>
                        <!-- 💡 핵심: 좌/우측 분할선의 십자(┼) 수평 중심을 완벽히 일치시키기 위해 6개 행 높이를 24px로 넉넉하게 락(Lock) 고정 (도장 이미지에 의한 찌그러짐 원천 차단) -->
                        <tr style="height: 24px;">
                            <th rowspan="6" style="background-color: #e0ffff;">평 가 일</th>
                            <th rowspan="${rs}" style="background-color: #fff;">${dateRows[0].label}</th>
                            <td rowspan="${rs}">${dateRows[0].value}</td>
                            <th rowspan="3" style="background-color: #e0ffff;">총 점</th>
                            <td rowspan="3" style="font-weight: bold;">100점</td>
                            <th rowspan="2" style="background-color: #e0ffff;">최종점수</th>
                            <td rowspan="2"></td>
                        </tr>
                        <tr style="height: 24px;"></tr>
                        <tr style="height: 24px;">
                            ${rs === 2 ? `<th rowspan="2" style="background-color: #fff;">${dateRows[1].label}</th><td rowspan="2">${dateRows[1].value}</td>` : ''}
                            <th rowspan="2" style="background-color: #e0ffff;">담당교사</th>
                            <td rowspan="2"><b>${currentTeacher}</b> <span style="position:relative; display:inline-block; margin-left:5px; color:${globalTeacherSeal ? 'rgba(231,76,60,0.6)' : '#e74c3c'}; font-size:12px; font-weight:bold;">(인)${globalTeacherSeal ? `<img src="${globalTeacherSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:32px; height:32px; object-fit:contain; opacity:0.95; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td>
                        </tr>
                        <tr style="height: 24px;">
                            ${rs === 3 ? `<th rowspan="3" style="background-color: #fff;">${dateRows[1].label}</th><td rowspan="3">${dateRows[1].value}</td>` : ''}
                            <th rowspan="3" style="background-color: #e0ffff;">훈련생명</th>
                            <td rowspan="3"></td>
                        </tr>
                        <tr style="height: 24px;">
                            ${rs === 2 ? `<th rowspan="2" style="background-color: #fff;">${dateRows[2].label}</th><td rowspan="2">${dateRows[2].value}</td>` : ''}
                            <th rowspan="2" style="background-color: #e0ffff;">검증자</th>
                            <td rowspan="2"><b>하정현</b> <span style="position:relative; display:inline-block; margin-left:5px; color:${globalVerifierSeal ? 'rgba(231,76,60,0.6)' : '#e74c3c'}; font-size:12px; font-weight:bold;">(인)${globalVerifierSeal ? `<img src="${globalVerifierSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:32px; height:32px; object-fit:contain; opacity:0.95; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td>
                        </tr>
                        <tr style="height: 24px;"></tr>
                    </table>
                    
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; display:flex; align-items:center;">
                        <span style="margin-right:6px;">■</span> 답안지 &nbsp;&nbsp;<span style="color:red; font-size: 13px;">☞ 작성 후 담당교사에게 반드시 제출하시오.</span>
                    </div>
                    
                    <table class="ep-table" style="width: 100%; border: 2px solid #000; border-collapse: collapse; text-align: center; table-layout: fixed;">
                `;

                // 💡 [신규 배선] 0.설정에서 입력된 객관식 문제들의 배점 데이터를 순서대로 스캔하여 적재
                let allQ_eval = [];
                items.forEach(item => {
                    try {
                        let arr = JSON.parse(item.question);
                        if (Array.isArray(arr) && arr.length > 0) {
                            allQ_eval = allQ_eval.concat(arr);
                        } else {
                            allQ_eval.push({ score: item.score || 0 });
                        }
                    } catch(e) {
                        allQ_eval.push({ score: item.score || 0 });
                    }
                });

                // 💡 20문제 OMR 칸 생성 (한 줄에 5개씩 4세트)
                for (let row = 0; row < 4; row++) {
                    nonNcsHtml += `<tr style="height: 46px;">`; // 💡 [수정] 점수가 추가되어 두 줄이 되므로 높이 확장
                    for (let col = 1; col <= 5; col++) {
                        let qIdx = row * 5 + col - 1;
                        
                        // 💡 문항 번호와 매칭하여 배점 출력 (문제가 없는 번호는 표가 찌그러지지 않도록 투명 뼈대 삽입)
                        let qScoreText = (allQ_eval[qIdx] && allQ_eval[qIdx].score !== undefined) 
                            ? `<br><span style="font-size:11.5px; color:#c0392b; font-weight:normal; letter-spacing:-0.5px;">(${allQ_eval[qIdx].score}점)</span>` 
                            : `<br><span style="font-size:11.5px; color:transparent; font-weight:normal;">(0점)</span>`;
                            
                        nonNcsHtml += `<th style="background-color: #f2f2f2; font-size: 14px; border: 1px solid #000; line-height: 1.3; padding: 4px 0;">[ &nbsp;${qIdx + 1}&nbsp; ]${qScoreText}</th>`;
                    }
                    nonNcsHtml += `</tr><tr>`;
                    for (let col = 1; col <= 5; col++) {
                        let qIdx = row * 5 + col - 1;
                        let qAns = (allQ_eval[qIdx] && allQ_eval[qIdx].ans) ? String(allQ_eval[qIdx].ans).trim() : '';
                        nonNcsHtml += `<td class="non-ncs-evidence-ans-cell" data-q-idx="${qIdx}" data-ans="${qAns}" style="height: 65px; border: 1px solid #000; vertical-align: middle;"></td>`;
                    }
                    nonNcsHtml += `</tr>`;
                }
                nonNcsHtml += `</table>`;

                document.getElementById('photo_header_container').innerHTML = nonNcsEvidenceHeaderToolbarHtml();
                document.getElementById('photo_grid_container').innerHTML = nonNcsHtml;
                resetNonNcsEvidenceAnswerView();

                // 빈 양식 컨테이너(1페이지용)도 비워줌
                const headerBlank = document.getElementById('photo_header_container_blank');
                if (headerBlank) headerBlank.innerHTML = "";
                const gridBlank = document.getElementById('photo_grid_container_blank');
                if (gridBlank) gridBlank.innerHTML = "";

            } else {
                // 💡 [NCS 순정 로직 100% 보존]
            let page6 = document.getElementById('page6');
            let photoTitle = Array.from(page6.querySelectorAll('div')).find(d => d.textContent && d.textContent.trim() === '■ 내부 평가 근거 사진');
            if (photoTitle) photoTitle.style.display = 'block';

                document.getElementById('photo_header_container').innerHTML = makeHeaderHtml(false);
                let photoGridHtml = `<table class="photo-grid-table">`;
                let photoGridHtml_blank = `<table class="photo-grid-table">`; // 💡 추가: 빈 양식 뼈대
                
                // [기존 코드 위치: buildEvaluationDocs 함수 내부의 사진 그리드 생성 for문]
                for(let i=0; i<items.length; i+=2) {
                    let item1 = items[i].coreTask || items[i].name;
                    let item2 = items[i+1] ? (items[i+1].coreTask || items[i+1].name) : null;
                    
                    let img1 = photoData[`img_${i}`] ? photoData[`img_${i}`].imageData : '';
                    let img2 = photoData[`img_${i+1}`] ? photoData[`img_${i+1}`].imageData : '';

                    let uploadBtn1 = `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${i}').click()">사진 등록</button><input type="file" id="file_eval_${i}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${i}, this)">`;
                    let uploadBtn2 = item2 ? `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${i+1}').click()">사진 등록</button><input type="file" id="file_eval_${i+1}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${i+1}, this)">` : '';

                    let action1 = img1 ? `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${i})">삭제</button>` : uploadBtn1;
                    let action2 = img2 ? `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${i+1})">삭제</button>` : uploadBtn2;

                    // 💡 [여백] 홀수 항목일 때 오른쪽 빈 칸 (짝수 맞춤용)
                    let emptySlotClass = !item2 ? ' photo-empty-slot' : '';
                    let emptySlotStyle = !item2 ? "background-color: #e6e6e6 !important;" : "";
                    let emptyHeader = !item2 ? `<span style="color:transparent; user-select:none;">빈칸</span>` : item2;
                    let emptyContent = !item2 ? `<div style="color:transparent; user-select:none; width:100%; height:100%; display:flex; justify-content:center; align-items:center;">여백</div>` : '';

                    let boxHeight = items.length > 4 ? "170px" : "250px";
                    let imgMaxHeight = items.length > 4 ? "140px" : "220px";

                    // 💡 기능 포함 버전 (page6 용)
                    photoGridHtml += `
                        <tr>
                            <td class="photo-header">${item1}</td>
                            <td class="photo-header${emptySlotClass}">${emptyHeader}</td>
                        </tr>
                        <tr>
                            <td class="photo-box" style="vertical-align: middle; padding:10px; height:${boxHeight};">
                                <img id="preview_eval_${i}" src="${img1}" style="max-width:100%; max-height:${imgMaxHeight}; object-fit:contain; ${img1 ? '' : 'display:none;'}">
                                <div id="btn_wrap_${i}">${action1}</div>
                            </td>
                            <td class="photo-box${emptySlotClass}" style="vertical-align: middle; padding:10px; height:${boxHeight}; ${emptySlotStyle}">
                                ${item2 ? `<img id="preview_eval_${i+1}" src="${img2}" style="max-width:100%; max-height:${imgMaxHeight}; object-fit:contain; ${img2 ? '' : 'display:none;'}">` : emptyContent}
                                ${item2 ? `<div id="btn_wrap_${i+1}">${action2}</div>` : ''}
                            </td>
                        </tr>
                    `;

                    // 💡 기능 제외 빈 양식 버전 (page1 용)
                    photoGridHtml_blank += `
                        <tr>
                            <td class="photo-header">${item1}</td>
                            <td class="photo-header${emptySlotClass}">${emptyHeader}</td>
                        </tr>
                        <tr>
                            <td class="photo-box" style="vertical-align: middle; padding:10px; height:${boxHeight};"></td>
                            <td class="photo-box${emptySlotClass}" style="vertical-align: middle; padding:10px; height:${boxHeight}; ${emptySlotStyle}">${emptyContent}</td>
                        </tr>
                    `;
                }
                photoGridHtml += `</table>`;
                photoGridHtml_blank += `</table>`;

                document.getElementById('photo_grid_container').innerHTML = photoGridHtml || "<p>평가 항목이 없습니다.</p>";
                
                // 💡 빈 양식 컨테이너에도 주입
                const headerBlank = document.getElementById('photo_header_container_blank');
                if (headerBlank) headerBlank.innerHTML = makeHeaderHtml(false);
                const gridBlank = document.getElementById('photo_grid_container_blank');
                if (gridBlank) gridBlank.innerHTML = photoGridHtml_blank || "<p>평가 항목이 없습니다.</p>";
            }
            if (typeof window.scheduleEvalMobileDocFit === 'function') window.scheduleEvalMobileDocFit(200);
        }

        async function processEvalImage(input, callback) {
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
                    if (typeof heic2any === 'undefined') return await appAlert("HEIC 변환 엔진이 로드되지 않았습니다. 인터넷 연결을 확인해주세요.");
                    heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 })
                        .then(convertedBlob => runOriginalEngine(convertedBlob))
                        .catch(async (error) => { await appAlert("HEIC 변환 오류: " + error.message); });
                } else {
                    runOriginalEngine(file);
                }
            }
        }

        async function uploadEvalPhoto(index, input) {
            if (!input.files || !input.files[0]) return;
            if (!currentDbKey) return await appAlert("❌ 좌측에서 평가 대상을 먼저 선택해 주세요.");

            const btnWrap = document.getElementById(`btn_wrap_${index}`);
            const originalHtml = btnWrap.innerHTML;
            btnWrap.innerHTML = `<span class="no-print" style="color:#2980b9; font-size:12px; font-weight:bold;">업로드 중 ⏳</span>`;

            processEvalImage(input, async (base64Data) => {
                try {
                    await classDbRef(`evalPhotos/${currentEvalMode}/${currentDbKey}/img_${index}`).set({
                        imageData: base64Data, timestamp: new Date().getTime()
                    });
                    const imgEl = document.getElementById(`preview_eval_${index}`);
                    imgEl.src = base64Data; imgEl.style.display = 'inline-block';
                    
                    btnWrap.innerHTML = `<button class="no-print" style="margin-top:5px; font-size:11px; color:#e74c3c; cursor:pointer; border:1px solid #e74c3c; background:white; border-radius:4px; padding:2px 8px;" onclick="deleteEvalPhoto(${index})">삭제</button>`;
                } catch (e) {
                    await appAlert("❌ 업로드 실패: " + e.message);
                    btnWrap.innerHTML = originalHtml;
                }
            });
        }

        async function deleteEvalPhoto(index) {
            if(!await appConfirm("해당 사진을 삭제하시겠습니까?")) return;
            try {
                await classDbRef(`evalPhotos/${currentEvalMode}/${currentDbKey}/img_${index}`).remove();
                
                const imgEl = document.getElementById(`preview_eval_${index}`);
                imgEl.src = ""; imgEl.style.display = 'none';
                
                document.getElementById(`btn_wrap_${index}`).innerHTML = `<button class="btn-save-settings no-print" style="margin-top:5px; background:#3498db; width:80px;" onclick="document.getElementById('file_eval_${index}').click()">사진 등록</button><input type="file" id="file_eval_${index}" style="display:none" accept="image/*,.heic" onchange="uploadEvalPhoto(${index}, this)">`;
            } catch(e) {
                await appAlert("❌ 삭제 실패: " + e.message);
            }
        }

        let pendingUploadData = null;

        function normalizeCommonEvalItems(items) {
            if (!items) return [];
            if (Array.isArray(items)) return items.filter(Boolean);
            if (typeof items === 'object') {
                return Object.keys(items)
                    .sort((a, b) => Number(a) - Number(b))
                    .map(k => items[k])
                    .filter(Boolean);
            }
            return [];
        }

        function buildCommonEvalStorageKey(targetSubject, unitCode, isNonNCS) {
            let finalUnitCode = String(unitCode || '').trim();
            if (isNonNCS && !finalUnitCode.startsWith('비NCS_소양_')) {
                finalUnitCode = '비NCS_소양_' + targetSubject;
            }
            return {
                key: (targetSubject + '_' + finalUnitCode).replace(/[\s\.\#\$\/\[\]]/g, ''),
                finalUnitCode
            };
        }

        function getEffectiveUnitCodeForCommonEval(unitCode, dbKey) {
            if (dbKey && globalEvalPlansData[dbKey] && globalEvalPlansData[dbKey].unitCode) {
                const saved = String(globalEvalPlansData[dbKey].unitCode).trim();
                if (saved && !saved.includes('없음')) return saved;
            }
            return String(unitCode || '').trim();
        }

        function findCommonEvalEntry(allData, targetSubject, unitCode, isNonNCS, dbKey) {
            const effectiveCode = getEffectiveUnitCodeForCommonEval(unitCode, dbKey);
            const codesToTry = [];
            if (effectiveCode && !effectiveCode.includes('없음')) codesToTry.push(effectiveCode);
            const rawCode = String(unitCode || '').trim();
            if (rawCode && rawCode !== effectiveCode && !rawCode.includes('없음')) codesToTry.push(rawCode);

            for (const code of codesToTry) {
                const { key, finalUnitCode } = buildCommonEvalStorageKey(targetSubject, code, isNonNCS);
                if (allData[key]) {
                    const items = normalizeCommonEvalItems(allData[key].items);
                    if (items.length) return { key, data: { ...allData[key], items }, matchCode: finalUnitCode };
                }
            }

            if (isNonNCS) {
                for (const code of codesToTry) {
                    const { finalUnitCode } = buildCommonEvalStorageKey(targetSubject, code, true);
                    const foundKey = Object.keys(allData).find(k => allData[k] && allData[k].unitCode === finalUnitCode);
                    if (foundKey) {
                        const items = normalizeCommonEvalItems(allData[foundKey].items);
                        if (items.length) return { key: foundKey, data: { ...allData[foundKey], items }, matchCode: finalUnitCode };
                    }
                }
                return null;
            }

            for (const code of codesToTry) {
                const digits = String(code).replace(/[^0-9]/g, '');
                if (!digits) continue;
                const foundKey = Object.keys(allData).find(k => {
                    const entry = allData[k];
                    if (!entry || !entry.unitCode) return false;
                    return String(entry.unitCode).replace(/[^0-9]/g, '') === digits;
                });
                if (foundKey) {
                    const items = normalizeCommonEvalItems(allData[foundKey].items);
                    if (items.length) return { key: foundKey, data: { ...allData[foundKey], items }, matchCode: code };
                }
            }
            return null;
        }

        async function openPwModal(subject, unitCode) {
            const pwModal = document.getElementById('pwModal');
            const pwInput = document.getElementById('commonPwInput');
            
            document.getElementById('pwSubjectInfo').innerHTML = `[${subject}]<br><span style="font-size:11px; color:#555;">${unitCode}</span>`;
            pwInput.value = "";
            pwModal.style.display = 'flex';
            pwInput.focus();

            pwInput.oninput = async function() {
                if (this.value.length === 6) { 
                    if (this.value === adminPw) { 
                        document.getElementById('pwModal').style.display = 'none';
                        executeUploadCommonEval(); 
                    } else {
                        await appAlert("❌ 비밀번호가 틀렸습니다.");
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

            if (!window.isCurrentNonNCS && (!targetSubject || !unitCode || unitCode.includes("없음"))) {
                return await appAlert("⚠️ 과목이 선택되지 않았거나 화면에 올바른 단위코드가 표시되지 않았습니다.\n(NCS교과는 단위코드가 있어야만 공유할 수 있습니다.)");
            }
            if (window.isCurrentNonNCS && !targetSubject) {
                return await appAlert("⚠️ 공용으로 업로드할 비NCS/소양 과목을 먼저 선택해 주세요.");
            }

            // 💡 [비NCS/소양 전용] 코드가 없으므로, 과목명 기반의 특수 식별 코드를 강제 발급하여 업로드 그룹을 분리합니다.
            let finalUnitCode = unitCode;
            if (window.isCurrentNonNCS) {
                finalUnitCode = "비NCS_소양_" + targetSubject;
            }

            const rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
            if (rows.length === 0) return await appAlert("⚠️ 올릴 평가 항목 데이터가 없습니다.");

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
                const targetQRow = tr.nextElementSibling; // 변수명 충돌 방지용 범용 이름
                if (targetQRow && targetQRow.classList.contains('eval-question-row')) {
                    const qInput = targetQRow.querySelector('.eval-question-input'); 
                    if (qInput) {
                        questionText = qInput.value;
                    } else {
                        const nonNcsItems = targetQRow.querySelectorAll('.q-item');
                        if (nonNcsItems.length > 0) {
                            let qArr = [];
                            nonNcsItems.forEach(qItem => {
                                qArr.push(collectNonNcsQItemData(qItem));
                            });
                            questionText = JSON.stringify(qArr);
                        }
                    }
                    const cInput = targetQRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                }
                evalItems.push({ name, type, score, diff, question: questionText, coreTask: coreTaskText });
            });

            const dbKey = currentDbKey; // 공용 업로드 시에도 경로 엇갈림 방지
            // 💡 [비NCS 전용] 발급된 가상 코드를 함께 태워서 올립니다.
            pendingUploadData = { targetSubject, unitCode: finalUnitCode, evalItems, dbKey };
            openPwModal(targetSubject, finalUnitCode);
        }

        async function executeUploadCommonEval() {
            if (!pendingUploadData) return;
            const { targetSubject, unitCode, evalItems, dbKey } = pendingUploadData;
            
            if (!await appConfirm(`☁️ [${targetSubject}] (코드: ${unitCode})\n\n해당 과목의 평가지를 마스터 공용 데이터베이스에 업로드하시겠습니까?\n(기존에 동일한 과목/코드로 올라간 데이터가 있다면 최신 내용으로 덮어씌워집니다.)`)) {
                pendingUploadData = null; 
                return;
            }

            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${dbKey}`).once('value');
                const existingData = snap.val() || {};
                evalItems.forEach((item, i) => {
                    if (existingData && existingData.items) {
                        let match = null;
                        if (existingData.items[i] && existingData.items[i].type === item.type && existingData.items[i].name === item.name) {
                            match = existingData.items[i];
                        } else {
                            let found = Object.values(existingData.items).find(old => old && old.type === item.type && old.name === item.name);
                            if (found) match = found;
                            else if (existingData.items[i] && existingData.items[i].type === item.type) match = existingData.items[i];
                        }

                        if (match) {
                            if (match.customHtml) item.customHtml = match.customHtml;
                            if (match.ansHtml) item.ansHtml = match.ansHtml;
                        }
                    }
                });
            } catch(e) { console.warn("커스텀 HTML 탑재 실패", e); }

            const { key: commonKey } = buildCommonEvalStorageKey(targetSubject, unitCode, window.isCurrentNonNCS);

            try {
                await masterDatabase.ref(`commonEvaluations/${commonKey}`).set({
                    subject: targetSubject, unitCode: unitCode, items: evalItems, timestamp: new Date().getTime()
                });
                await appAlert(`✅ [${targetSubject}] 과목 (${unitCode})\n평가지가 마스터 공용 데이터베이스에 성공적으로 등록되었습니다!`);
                
                fetchMasterData(); 
            } catch(e) {
                await appAlert("❌ 등록 실패: " + e.message);
            } finally {
                pendingUploadData = null; 
            }
        }

        async function downloadCommonEval() {
            const rawSubject = document.getElementById('S1_1').value.trim();
            const unitName = document.getElementById('S1_2').value.trim();
            const unitCode = document.getElementById('S1_Code').value.trim();
            const targetSubject = (unitName && unitName !== "") ? unitName : rawSubject;
            const effectiveUnitCode = getEffectiveUnitCodeForCommonEval(unitCode, currentDbKey);

            if (!window.isCurrentNonNCS && (!targetSubject || !effectiveUnitCode || effectiveUnitCode.includes("없음"))) {
                return await appAlert("⚠️ 좌측에서 과목을 먼저 선택해 주세요. (NCS 단위코드가 화면에 떠 있어야 가능)");
            }
            if (window.isCurrentNonNCS && !targetSubject) {
                return await appAlert("⚠️ 좌측에서 내려받을 비NCS/소양 과목을 먼저 선택해 주세요.");
            }

            const snap = await masterDatabase.ref(`commonEvaluations`).once('value');
            const allData = snap.val() || {};

            // 💡 [렌더링 코어 함수화] 내려받은 데이터를 화면에 쏴주는 엔진 (NCS/비NCS 자동 대응)
            const applyDownloadedData = async (dataToApply, subjectName) => {
                const normalizedItems = normalizeCommonEvalItems(dataToApply.items);
                window.downloadedCustomItems = normalizedItems;

                if (!await appConfirm(`📥 [${subjectName}]\n\n선택하신 공용 평가지를 화면으로 불러오시겠습니까?\n현재 화면의 내용이 공용 데이터로 덮어씌워집니다.\n(가져온 후 반드시 [💾 저장]을 눌러야 내 반에 적용됩니다.)`)) return;

                let html = "";
                normalizedItems.forEach(item => {
                    // 💡 [치명적 버그 수리] 기존 하드코딩 렌더링 폐기하고, 완벽 호환되는 부품 함수(generateEvalRowHtml) 가동
                    html += generateEvalRowHtml(item.name, item.type, item.score, item.diff, item.question, item.coreTask, window.isCurrentNonNCS);
                });
                document.getElementById('evalItemTbody').innerHTML = html;
                
                await appAlert("✅ 마스터 공용 평가지를 화면에 성공적으로 불러왔습니다.\n수정할 부분이 있다면 수정 후 상단의 [💾 저장] 버튼을 눌러 확정해 주세요.");
                if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
            };

            // =======================================================
            // 💡 [비NCS/소양 전용 구역] 목록 스캐너 및 모달 렌더링
            // =======================================================
            if (window.isCurrentNonNCS) {
                // 클라우드에서 '비NCS_소양_' 태그가 붙은 모든 과목을 긁어모음
                let nonNcsList = [];
                Object.keys(allData).forEach(k => {
                    if (allData[k] && allData[k].unitCode && allData[k].unitCode.startsWith("비NCS_소양_")) {
                        nonNcsList.push({ key: k, data: allData[k] });
                    }
                });

                if (nonNcsList.length === 0) {
                    return await appAlert("⚠️ 마스터 공용 데이터베이스에 등록된 비NCS/소양 교과 평가지가 없습니다.");
                }

                // 교사가 직접 보고 고를 수 있는 팝업(모달창) 생성
                let modal = document.createElement('div');
                modal.id = 'tempNonNcsModal';
                modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; display:flex; justify-content:center; align-items:center;';

                let listHtml = nonNcsList.map((item, idx) => `
                    <button style="display:block; width:100%; text-align:left; padding:15px; margin-bottom:8px; border:1px solid #bdc3c7; border-radius:6px; background:#f8f9fa; cursor:pointer; font-size:15px; font-weight:bold; color:#2c3e50; transition:0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.05);" onmouseover="this.style.background='#e3f2fd'; this.style.borderColor='#3498db';" onmouseout="this.style.background='#f8f9fa'; this.style.borderColor='#bdc3c7';" onclick="applyNonNcsCommonEval(${idx})">
                        ☁️ [공용] ${item.data.subject} 
                        <span style="display:block; font-size:11px; color:#7f8c8d; font-weight:normal; margin-top:6px;">저장된 항목 수: ${normalizeCommonEvalItems(item.data.items).length}개 | 등록일: ${new Date(item.data.timestamp).toLocaleString()}</span>
                    </button>
                `).join('');

                modal.innerHTML = `
                    <div style="background:white; padding:25px; border-radius:8px; max-width:500px; width:90%; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <h3 style="margin-top:0; color:#2980b9; border-bottom:2px solid #3498db; padding-bottom:10px; font-size:18px;">☁️ 공용 클라우드 [비NCS/소양] 목록</h3>
                        <div style="font-size:13px; color:#e74c3c; margin-bottom:15px; font-weight:bold; line-height:1.5; background:#fdf2e9; padding:10px; border-radius:4px;">
                            ※ 우리 반의 과목명과 달라도 같은 계열이면 클릭하여 내려받을 수 있습니다.<br>
                            ※ 불러오기 후, 선생님의 반에 맞게 제목이나 내용을 자유롭게 수정하세요.
                        </div>
                        <div style="overflow-y:auto; flex:1; padding-right:5px; margin-bottom:10px;">
                            ${listHtml}
                        </div>
                        <div style="text-align:right; border-top:1px solid #ecf0f1; padding-top:15px;">
                            <button style="background:#95a5a6; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:14px;" onclick="document.getElementById('tempNonNcsModal').remove()">취소 및 닫기</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                // 선택된 데이터를 처리하는 임시 함수를 window에 마운트
                window.tempNonNcsList = nonNcsList;
                window.applyNonNcsCommonEval = function(idx) {
                    let selected = window.tempNonNcsList[idx];
                    document.getElementById('tempNonNcsModal').remove();
                    applyDownloadedData(selected.data, selected.data.subject);
                };
                return; // 모달을 띄웠으므로 함수 실행 종료 (선택 대기)
            }

            // =======================================================
            // 💡 [NCS교과] 업로드와 동일한 commonKey 우선 → 저장된 코드 → 숫자 매칭
            // =======================================================
            const found = findCommonEvalEntry(allData, targetSubject, unitCode, false, currentDbKey);
            if (!found) {
                const displayCode = effectiveUnitCode || unitCode;
                return await appAlert(`⚠️ 마스터 공용 데이터베이스에 해당 훈련기준 코드(${displayCode})와 일치하는 평가지가 없습니다.`);
            }

            applyDownloadedData(found.data, found.data.subject || targetSubject);
        }

        async function deleteCommonEval() {
            const rawSubject = document.getElementById('S1_1').value.trim();
            const unitName = document.getElementById('S1_2').value.trim();
            const unitCode = document.getElementById('S1_Code').value.trim();
            const targetSubject = (unitName && unitName !== "") ? unitName : rawSubject;

            if (!window.isCurrentNonNCS && (!targetSubject || !unitCode || unitCode.includes("없음"))) {
                return await appAlert("⚠️ 좌측에서 삭제할 공용 평가 대상 과목을 먼저 선택해 주세요.");
            }
            if (window.isCurrentNonNCS && !targetSubject) {
                return await appAlert("⚠️ 좌측에서 삭제할 비NCS/소양 과목을 먼저 선택해 주세요.");
            }

            // 💡 [비NCS/소양 전용] 가상 코드 발급
            let finalUnitCode = unitCode;
            if (window.isCurrentNonNCS) {
                finalUnitCode = "비NCS_소양_" + targetSubject;
            }

            const expectedText = "전체반 삭제합니다";
            const userInput = await appPrompt(`❗ [공용 클라우드 삭제 경고]\n마스터 데이터베이스에서 [${targetSubject}] 과목(${finalUnitCode})의 공용 평가지를 영구 삭제합니다.\n삭제 후에는 다른 모든 반에서도 더 이상 이 평가지를 불러올 수 없게 됩니다.\n\n동의하신다면 "${expectedText}"라고 정확히 입력해 주세요.`);

            if (userInput === expectedText) {
                const { key: commonKey } = buildCommonEvalStorageKey(targetSubject, finalUnitCode, window.isCurrentNonNCS);
                try {
                    await masterDatabase.ref(`commonEvaluations/${commonKey}`).remove();
                    await appAlert(`✅ [${targetSubject}] 과목이 마스터 공용 데이터베이스에서 완벽하게 소각되었습니다.`);
                    fetchMasterData(); // 좌측 리스트의 연두색 텍스트(공용 업로드 완료 표시)를 원래대로 되돌리기 위해 화면 갱신
                } catch(e) {
                    await appAlert("❌ 삭제 실패: " + e.message);
                }
            } else if (userInput !== null) {
                await appAlert("❌ 문구가 일치하지 않아 삭제 작업이 취소되었습니다.");
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
                return await appAlert("⚠️ 좌측에서 평가 대상 과목을 먼저 선택해주세요.");
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
                
                // 📍 [신규 배선] S5 장비 목록 및 텍스트 패널 갱신
                if(typeof window.updateS5Panel === 'function') window.updateS5Panel(stdData);
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

        // 💡 [지능형 동적 스캐너] 표의 구조(줄수)와 상관없이 ①~⑩ 기호가 달린 텍스트를 추적 추출
        window.extractTraineeHeaders = function(html) {
            let defaults = ["① 이상 부위", "② 내용 및 상태", "③ 판 정", "④ 정비 및 조치사항"];
            if (!html) return defaults;
            let temp = document.createElement('div');
            temp.innerHTML = html;
            let cells = temp.querySelectorAll('th, td');
            let foundHeaders = [];
            
            // 💡 정규식: ① 부터 ⑩ 까지의 특수문자를 포함하고 있는지 탐지
            const markerRegex = /[①②③④⑤⑥⑦⑧⑨⑩]/;
            
            cells.forEach(c => {
                let text = c.innerText.trim();
                if (markerRegex.test(text)) {
                    foundHeaders.push(text);
                }
            });
            
            // 💡 찾은 항목이 1개라도 있으면 동적 추출 배열 반환, 아예 없으면 기본 4개 배열 반환
            return foundHeaders.length > 0 ? foundHeaders : defaults;
        };

       // 💡 [신규 엔진] 교사 평가표 높이 자동 압축기 (Total Height 방어)
        window.syncTeacherTableHeight = function(tId) {
            let table = document.getElementById(tId);
            if(!table) return;
            let isCompact = table.querySelector('.compact-td') !== null;
            let targetTotalHeight = isCompact ? 110 : 175; // 과부하 모드면 110px, 일반 모드면 175px 고정
            
            let tbody = table.querySelector('tbody') || table;
            let rows = Array.from(tbody.querySelectorAll('tr')).slice(1); // 첫 번째 헤더 줄 제외
            let N = rows.length;
            if(N === 0) return;
            
            let h = Math.floor(targetTotalHeight / N);
            if (h < 18) h = 18; // 최소 텍스트 방어선
            
            rows.forEach(tr => {
                tr.style.setProperty('height', h + 'px', 'important');
                Array.from(tr.querySelectorAll('td')).forEach(td => {
                    td.style.setProperty('height', h + 'px', 'important');
                });
            });
        };

        window.addTeacherRow = function(tId) {
            let table = document.getElementById(tId);
            if(!table) return;
            let tbody = table.querySelector('tbody') || table;
            let rowCount = tbody.querySelectorAll('tr').length - 1; 
            let tr = document.createElement('tr');
            
            let isCompact = table.querySelector('.compact-td') !== null;
            let cName = isCompact ? 'compact-td' : '';
            
            tr.innerHTML = `<td class="${cName}" style="position:relative;" contenteditable="true" onblur="markChanged('${tId}')">새 평가 항목 <button class="no-print btn-custom" style="position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:2px 4px; font-size:10px; background:#e74c3c; border:none; color:white;" onclick="deleteTeacherRow(this, '${tId}')">삭제</button></td><td class="${cName}"></td><td class="${cName}"></td><td class="${cName}"></td><td class="${cName}"></td><td class="${cName}"></td>`;
            
            let firstRow = tbody.querySelectorAll('tr')[1];
            if (firstRow) {
                let scoreTd = firstRow.querySelector('td:last-child');
                if (scoreTd) scoreTd.rowSpan = rowCount + 1;
            }
            tbody.appendChild(tr);
            markChanged(tId);
            updateTeacherTableHeaders(tId); 
            syncTeacherTableHeight(tId); // 💡 항목 추가 시 높이 자동 압축!
        };

        window.deleteTeacherRow = async function(btn, tId) {
            let tr = btn.closest('tr');
            let table = document.getElementById(tId);
            let isFirstRow = (table.querySelectorAll('tr')[1] === tr);
            
            if (isFirstRow) {
                let nextRow = tr.nextElementSibling;
                let scoreTd = tr.querySelector('td:last-child');
                if (nextRow && scoreTd) { nextRow.appendChild(scoreTd); } 
                else if (!nextRow) { return await appAlert("⚠️ 최소 1개의 항목은 유지해야 합니다."); }
            }
            tr.remove();
            
            let firstRow = table.querySelectorAll('tr')[1];
            if (firstRow) {
                let scoreTd = firstRow.querySelector('td:last-child');
                if (scoreTd) scoreTd.rowSpan = table.querySelectorAll('tr').length - 1;
            }
            markChanged(tId);
            updateTeacherTableHeaders(tId); 
            syncTeacherTableHeight(tId); // 💡 항목 삭제 시 높이 자동 분배!
        };

        // 💡 [신규 모터] 항목 증감 시 매우우수~매우미흡 점수를 자동 재계산하여 헤더에 각인
        window.updateTeacherTableHeaders = function(tId) {
            let table = document.getElementById(tId);
            if (!table) return;
            let scoreMatch = table.innerHTML.match(/득 점<br><span[^>]*>\(([0-9\.]+)점\)/);
            let totalScore = scoreMatch ? parseFloat(scoreMatch[1]) : 20;

            let rowCount = table.querySelectorAll('tr').length - 1;
            if (rowCount <= 0) return;
            let rS = totalScore / rowCount;
            let v1 = Number.isInteger(rS)?rS:Number(rS.toFixed(1));
            let v2 = Math.round(rS*0.8);
            let v3 = Math.round(rS*0.6);
            let v4 = Math.round(rS*0.4);
            let v5 = Math.round(rS*0.2);

            let ths = table.querySelectorAll('tr')[0].querySelectorAll('th');
            if(ths.length >= 6) {
                ths[1].innerHTML = `매우우수<br>(${v1}점)`;
                ths[2].innerHTML = `우수<br>(${v2}점)`;
                ths[3].innerHTML = `보통<br>(${v3}점)`;
                ths[4].innerHTML = `미흡<br>(${v4}점)`;
                ths[5].innerHTML = `매우미흡<br>(${v5}점)`;
            }
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
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
            } catch (e) { console.error("DB 로드 에러:", e); }

            // 💡 [통합 입력 모드 DOM 추출기 장착]
            let globalQuestionText = "[]";
            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                let globalItems = document.querySelectorAll('#global_q_list .q-item');
                let qArr = [];
                globalItems.forEach(qItem => {
                    qArr.push(collectNonNcsQItemData(qItem));
                });
                globalQuestionText = JSON.stringify(qArr);
            }

            const items = [];
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach((tr, index) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : (window.isCurrentNonNCS ? "기타(선다형)" : "평가자 체크");
                
                // 💡 [수리 완료] OMR 감점 시 0점 표기 버그 해결을 위한 통합 점수 추출기 장착
                let score = 0;
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (index === 0) {
                        document.querySelectorAll('#global_q_list .non-ncs-score').forEach(inp => score += Number(inp.value) || 0);
                        if (score === 0 && typeof savedItems !== 'undefined' && savedItems[index]) score = savedItems[index].score || 0;
                    }
                } else {
                    score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                }

                let questionText = ""; let coreTaskText = "";
                
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    // 💡 통합 모드에서는 1번 항목(index 0)에만 모든 문제 캡슐 탑재
                    if (index === 0) questionText = globalQuestionText;
                    else questionText = "[]";
                } else {
                    const qRow = tr.nextElementSibling;
                    if (qRow && qRow.classList.contains('eval-question-row')) {
                        const qInput = qRow.querySelector('.eval-question-input'); 
                        if (qInput) {
                            questionText = qInput.value;
                        } else {
                            const nonNcsItems = qRow.querySelectorAll('.q-item');
                            let qArr = [];
                            if (nonNcsItems.length > 0) {
                                nonNcsItems.forEach(qItem => {
                                    qArr.push(collectNonNcsQItemData(qItem));
                                });
                                questionText = JSON.stringify(qArr);
                            }
                        }
                        const cInput = qRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                    }
                }
                items.push({ name, type, score, question: questionText, coreTask: coreTaskText });
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
    // 💡 [비NCS 격리 차단기] 비NCS 모드일 때만 적용
    if (window.isCurrentNonNCS) {
        if (pageType === '뒷면') return ''; // 💡 뒷면은 이미지처럼 상단 표를 완전히 삭제합니다.
        
        // 💡 0.설정에 입력된 총 문항 수 자동 계산 엔진
        let totalQCount = 0;
        items.forEach(item => {
            try {
                let arr = JSON.parse(item.question);
                if(Array.isArray(arr) && arr.length > 0) {
                    totalQCount += arr.length;
                } else {
                    // 💡 [수리 완료] 통합입력 모드에서는 텅 빈 껍데기 배열([])을 유령 문항(1문제)으로 카운트하지 않도록 완벽 차단
                    if (!window.isIntegratedInputMode) totalQCount += 1;
                }
            } catch(e) { 
                if (!window.isIntegratedInputMode) totalQCount += 1; 
            }
        });

        // 💡 [초정밀 압축 튜닝] 전역 CSS(.ep-table td의 35px 강제 높이)를 완전히 무력화시키는 특수 클래스 삽입
        let nonNcsDateRowsHtml = `
            <tr>
                <th rowspan="${dateRows.length}" style="background-color: #e0ffff;">평 가 일</th>
                <th style="background-color: #fff;">${dateRows[0].label}</th>
                <td>${dateRows[0].value}</td>
                <th rowspan="${dateRows.length}" style="background-color: #e0ffff;">문 항 수</th>
                <td rowspan="${dateRows.length}" style="font-weight: bold; font-size: 14px;">${totalQCount}</td>
                <th rowspan="${dateRows.length}" style="background-color: #e0ffff;">훈련생명</th>
                <td rowspan="${dateRows.length}"></td>
            </tr>`;
        for (let i = 1; i < dateRows.length; i++) {
            nonNcsDateRowsHtml += `
            <tr>
                <th style="background-color: #fff;">${dateRows[i].label}</th>
                <td>${dateRows[i].value}</td>
            </tr>`;
        }

        return `
        <style>
            .non-ncs-top-table th, .non-ncs-top-table td {
                height: 22px !important; 
                padding: 4px !important;
            }
            /* 💡 [비NCS/소양 전용] 교과목 행 높이 고정 */
            .non-ncs-top-table tr.subject-row th, .non-ncs-top-table tr.subject-row td {
                height: 44px !important;
            }
        </style>
        <table class="ep-table non-ncs-top-table" style="margin-bottom: 12px; border: 2px solid #000; width: 100%; table-layout: fixed;">
            <colgroup>
                <col style="width: 12%;">
                <col style="width: 12%;">
                <col style="width: 16%;">
                <col style="width: 12%;">
                <col style="width: 13%;">
                <col style="width: 12%;">
                <col style="width: 23%;">
            </colgroup>
            <tr>
                <th colspan="7" style="font-size: 20px; font-weight: 900; padding: 8px 0 !important; letter-spacing: 2px; background-color: #e0ffff; border-bottom: 2px solid #000; height: auto !important;">
                    ${evalModePrefix}내부 평가 시험문제<span style="color: #7f8c8d; font-size: 16px; font-weight: bold; letter-spacing: 0;">(훈련생용)</span>
                </th>
            </tr>
            <tr class="subject-row">
                <th style="background-color: #e0ffff;">교 과 목</th>
                <td colspan="2" style="font-weight: bold;">${subject}</td>
                <th style="background-color: #e0ffff;">평가방법</th>
                <td style="font-weight: bold;">${evalMethod}</td>
                <th style="background-color: #e0ffff;">평가시간</th>
                <td style="font-weight: bold;">${evalTestTime} 분</td>
            </tr>
            ${nonNcsDateRowsHtml}
        </table>`;
    }

    // 💡 기존 NCS 순정 로직 보존
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
                    <tr style="height: 18px;">${rs===2 ? `<th rowspan="2">${dateRows[1].label}</th><td rowspan="2">${dateRows[1].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="2">담당교사</th><td rowspan="2" style="text-align:center; vertical-align:middle;">${teacher} <span style="position:relative; display:inline-block; margin-left:5px;">(인)${globalTeacherSeal ? `<img src="${globalTeacherSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:24px; height:24px; object-fit:contain; opacity:0.85; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td></tr>
                    <tr style="height: 18px;">${rs===3 ? `<th rowspan="3">${dateRows[1].label}</th><td rowspan="3">${dateRows[1].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="3">훈련생명</th><td rowspan="3"></td></tr>
                    <tr style="height: 18px;">${rs===2 ? `<th rowspan="2">${dateRows[2].label}</th><td rowspan="2">${dateRows[2].value}</td>` : ''}<th class="ep-cyan-bg" rowspan="2">검증자</th><td rowspan="2" style="text-align:center; vertical-align:middle;">하정현 <span style="position:relative; display:inline-block; margin-left:5px;">(인)${globalVerifierSeal ? `<img src="${globalVerifierSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:24px; height:24px; object-fit:contain; opacity:0.85; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td></tr>
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
                <div class="a4-page"><div class="no-print page-indicator">[2.평가지] - 앞면</div>${makeTopTable('앞면')}
                ${window.isCurrentNonNCS ? '' : '<div class="ep-section-title">1. 지식 · 기술 평가</div>'}
            `;
            let backHtml = `<div class="a4-page"><div class="no-print page-indicator">[2.평가지] - 뒷면</div>${makeTopTable('뒷면')}`;

            let itemIndex = 1;

            // 💡 [신규 배선] 우측 통합 배너에서 사용할 아이템 메타데이터 보관
            window.currentEvalPaperItems = [];

            if (window.isCurrentNonNCS) {
                // 💡 [비NCS/소양 전용 회로] 단원명(평가항목)을 제목으로 하고, 다단 2열 내림 배치를 복구 (보기는 1열 세로 정렬 유지)
                let allQuestionsExtracted = [];
                items.forEach((item, idx) => {
                    try {
                        let arr = JSON.parse(item.question);
                        if (Array.isArray(arr) && arr.length > 0) {
                            arr.forEach((qObj, i) => {
                                // 💡 [통합 모드 렌더링 차단] 통합 입력 모드일 경우 평가항목(chapter) 출력을 완전히 소각합니다.
                                let chapterText = window.isIntegratedInputMode ? null : (i === 0 ? `[제 ${idx+1} 평가항목] ${item.name}` : null);
                                allQuestionsExtracted.push({ ...qObj, chapter: chapterText });
                            });
                        } else {
                            // 💡 통합 입력 모드에서 빈 배열(items[1..N])일 경우 껍데기 출력을 차단
                            if (!window.isIntegratedInputMode) {
                                allQuestionsExtracted.push({ score: item.score, q: "", o1: "", o2: "", o3: "", o4: "", chapter: `[제 ${idx+1} 평가항목] ${item.name}` });
                            }
                        }
                    } catch(e) {
                        if (!window.isIntegratedInputMode) {
                            allQuestionsExtracted.push({ score: item.score, q: item.question, o1: "", o2: "", o3: "", o4: "", chapter: `[제 ${idx+1} 평가항목] ${item.name}` });
                        }
                    }
                });

                maybePersistNonNcsPaperPrintSizesFromDom();
                const unsavedSizes = getUnsavedNonNcsPrintSizesForCurrent();
                const savedSizes = flattenSavedPrintSizes(savedItems);
                allQuestionsExtracted.forEach((q, i) => {
                    const g = i + 1;
                    if (unsavedSizes[g]) q.printSize = unsavedSizes[g];
                    else if (savedSizes[g]) q.printSize = savedSizes[g];
                    else if (q.printSize) q.printSize = clampNonNcsPrintSize(q.printSize);
                    else q.printSize = NON_NCS_DEFAULT_PRINT_SIZE;
                });

                // 💡 [다단 렌더링 모터 복구] 한 장에 10문제가 깔끔하게 수납되도록 여백 및 폰트 크기 초정밀 압축 코팅 적용
                const render2ColQuestions = (qList, startNum) => {
                    let col1 = "", col2 = "";
                    let half = Math.ceil(qList.length / 2);
                    if (half < 5 && qList.length <= 10) half = 5;

                    qList.forEach((qObj, i) => {
                        let globalQNum = startNum + i;
                        let qHtml = renderNonNcsEvalPaperQuestionHtml(qObj, globalQNum);
                        if (i < half) col1 += qHtml;
                        else col2 += qHtml;
                    });
                    
                    // 💡 [압축] 표 외부 컨테이너의 상하좌우 패딩 축소
                    return `
                        <div style="border: 2px solid #000; padding: 10px; background: white; margin-bottom: 10px; flex: 1; display: flex; flex-direction: column;">
                            <div style="display: flex; gap: 10px; flex: 1;">
                                <div style="flex: 1; border-right: 1px dashed #ccc; padding-right: 10px;">
                                    ${col1}
                                </div>
                                <div style="flex: 1; padding-left: 5px;">
                                    ${col2}
                                </div>
                            </div>
                        </div>
                    `;
                };

                // 💡 전체 문제를 10문제 단위로 쪼개기 (앞면 1~10, 뒷면 11~20)
                let frontQ = allQuestionsExtracted.slice(0, 10);
                let backQ = allQuestionsExtracted.slice(10, 20);

                frontHtml += render2ColQuestions(frontQ, 1);
                
                if (backQ.length > 0) {
                    // 💡 비NCS 모드에서는 "1. 지식·기술 평가 (계속)" 텍스트가 필요 없으므로 출력하지 않습니다.
                    backHtml += render2ColQuestions(backQ, frontQ.length + 1);
                } else {
                    backHtml += render2ColQuestions([], frontQ.length + 1);
                }

                // 💡 [신규 배선] 이미지와 동일하게 뒷장 마지막 부분에 붉은색 안내 문구 삽입
                backHtml += `
                    <div style="margin-top: auto; padding-top: 20px; text-align: center; font-weight: bold; font-size: 16px; line-height: 1.6;">
                        ※ 내부 평가 시험문제지는 평가종료 후 본인이 가져갈 수 있으며,<br>
                        <span style="color: red;">내부평가 근거자료(답안지)는 반드시 담당교사에게 제출하세요.</span>
                    </div>
                `;
            }
             else {
                // 💡 [NCS 순정 렌더링] 기존 엔진 100% 보존
                items.forEach((item, idx) => {
                    let tableHtml = "";
                    let tId = `custom_table_${idx}`; 

                    let customHtml = "";
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) {
                        customHtml = window.downloadedCustomItems[idx].customHtml;
                    } else if (savedItems[idx] && savedItems[idx].customHtml && savedItems[idx].type === item.type) {
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
                                    <th rowspan="2" class="editable-cell" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(${item.score}점)</span></th>
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
                                </td><td class="editable-cell"></td><td class="editable-cell"></td>
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
                            <div class="no-print" style="display:flex; gap:4px; margin-bottom:${gapSize}; align-items:center; background:#edf7ff; padding:6px; border-radius:6px; border:1px solid #9dccf3;">
                                <span style="font-size:11px; color:#2980b9; font-weight:bold; margin-right:2px;">훈련생 표:</span>
                                <button class="btn-custom" style="padding:4px 8px; font-size:11px; background:#1abc9c; border:1px solid #16a085; color:white; font-weight:bold;" onclick="enableTraineeTableV2(${idx}, '${tId}', ${item.score}, '${(item.name || '').replace(/'/g, "\\'")}')">🧩 표 편집 V2</button>
                                <button class="btn-custom" onclick="saveCustomTable(${idx}, '${tId}')" id="save_${tId}" style="padding:4px 10px; font-size:11px; background:#bdc3c7; border-color:#bdc3c7; cursor:default; margin-left:4px;" disabled>💾 변경사항 저장</button>
                                <button class="btn-custom" onclick="resetCustomTable(${idx})" style="padding:4px 6px; font-size:11px; background:#e74c3c; border:1px solid #c0392b; ${hasCustom ? '' : 'display:none;'}">🔄 순정</button>
                            </div>
                        `;
                    } else {
                        let rowNames = extractTeacherRows(customHtml);
                        let N = rowNames.length;
                        let rS = item.score / N;
                        let v1 = formatScore(rS); 
                        let v2 = Math.round(rS * 0.8);
                        let v3 = Math.round(rS * 0.6);
                        let v4 = Math.round(rS * 0.4);
                        let v5 = Math.round(rS * 0.2);

                        if (customHtml) {
                            customHtml = customHtml.replace(/매우우수<br>\([0-9\.]+점\)/g, `매우우수<br>(${v1}점)`);
                            customHtml = customHtml.replace(/우수<br>\([0-9\.]+점\)/g, `우수<br>(${v2}점)`);
                            customHtml = customHtml.replace(/보통<br>\([0-9\.]+점\)/g, `보통<br>(${v3}점)`);
                            customHtml = customHtml.replace(/미흡<br>\([0-9\.]+점\)/g, `미흡<br>(${v4}점)`);
                            customHtml = customHtml.replace(/매우미흡<br>\([0-9\.]+점\)/g, `매우미흡<br>(${v5}점)`);
                        }

                        let targetTotalHeight = isOverload ? 110 : 175;
                        let rowH = Math.max(18, Math.floor(targetTotalHeight / N));

                        let rowsHtml = "";
                        rowNames.forEach((rName, rIdx) => {
                            rowsHtml += `<tr style="height:${rowH}px !important;">
                                <td class="${tClass}" style="position:relative; height:${rowH}px !important;" contenteditable="true" onblur="markChanged('teacher_table_${idx}')">${rName} <button class="no-print btn-custom" style="position:absolute; right:4px; top:50%; transform:translateY(-50%); padding:2px 4px; font-size:10px; background:#e74c3c; border:none; color:white;" onclick="deleteTeacherRow(this, 'teacher_table_${idx}')">삭제</button></td>
                                <td class="${tClass}" style="height:${rowH}px !important;"></td>
                                <td class="${tClass}" style="height:${rowH}px !important;"></td>
                                <td class="${tClass}" style="height:${rowH}px !important;"></td>
                                <td class="${tClass}" style="height:${rowH}px !important;"></td>
                                <td class="${tClass}" style="height:${rowH}px !important;"></td>
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
            }

            frontHtml += `<div class="cover-bottom"><div class="cover-page-num">- 5 -</div></div></div>`;
            backHtml += `<div class="cover-bottom"><div class="cover-page-num">- 6 -</div></div></div>`;

            // 💡 [신규 배선] 우측 편집 배너 (PC 전용, 모바일 숨김) 및 제목/나누기 기능 추가
            let rightBannerHtml = `
                <style>
                    @media screen and (max-width: 850px) {
                        .eval-right-panel, .eval-left-spacer { display: none !important; }
                    }
                </style>
                <div class="eval-right-panel no-print" style="width: 280px; flex-shrink: 0; background: white; padding: 15px; border-radius: 8px; border: 2px solid #2ecc71; box-shadow: 0 5px 15px rgba(0,0,0,0.1); position: sticky; top: 20px; height: max-content;">
                    <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:15px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="width:100%;">🛠️ 훈련생 표 편집기<br><span id="current_editing_item_name" style="font-size:11px; color:#7f8c8d; font-weight:bold; display:block; margin-top:4px; word-break:keep-all;">(좌측 표의 칸을 먼저 클릭하세요)</span></div>
                    </h3>
                    
                    <div style="background:#f8f9fa; border:1px solid #bdc3c7; padding:10px; border-radius:6px; margin-bottom:15px;">
                        <div style="font-size:12px; font-weight:bold; color:#2c3e50; margin-bottom:8px;">표 구조 변경 (현재 표 유지)</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            <button class="btn-custom" style="padding:6px; font-size:11px; border:1px solid #bdc3c7; background:#fff; color:#333;" onclick="execGlobalCustom('addRow')">➕ 행 추가</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; border:1px solid #bdc3c7; background:#fff; color:#e74c3c;" onclick="execGlobalCustom('delRow')">➖ 행 삭제</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; border:1px solid #bdc3c7; background:#fff; color:#333;" onclick="execGlobalCustom('addCol')">➕ 열 추가</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; border:1px solid #bdc3c7; background:#fff; color:#e74c3c;" onclick="execGlobalCustom('delCol')">➖ 열 삭제</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#8e44ad; color:white; border:none;" onclick="execGlobalCustom('merge')">🔗 셀 병합</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#9b59b6; color:white; border:none;" onclick="execGlobalCustom('unmerge')">➗ 셀 나누기</button>
                        </div>
                        
                        <div style="font-size:12px; font-weight:bold; color:#2c3e50; margin-top:10px; margin-bottom:8px;">텍스트 및 디자인 제어</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; margin-bottom:6px;">
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#34495e; color:white; border:none;" onclick="execGlobalCustom('bold')">𝐁 굵게</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#34495e; color:white; border:none;" onclick="execGlobalCustom('sizeUp')">A▲ 크기</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#34495e; color:white; border:none;" onclick="execGlobalCustom('sizeDown')">A▼ 크기</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#2980b9; color:white; border:none;" onclick="execGlobalCustom('alignLeft')">⏪ 좌측</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#3498db; color:white; border:none;" onclick="execGlobalCustom('alignCenter')">⏸️ 중앙</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#2980b9; color:white; border:none;" onclick="execGlobalCustom('alignRight')">⏩ 우측</button>
                        </div>
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#16a085; color:white; border:none;" onclick="execGlobalCustom('color')">🎨 헤더색 토글</button>
                            <button class="btn-custom" style="padding:6px; font-size:11px; background:#2c3e50; color:white; border:none;" onclick="execGlobalCustom('addCheckbox')">☑️ OMR 체크박스</button>
                        </div>

                        <div style="display:flex; gap:4px; margin-top:6px;">
                            <select id="custom_title_drop" style="flex:1; font-size:11px; padding:4px; border:1px solid #bdc3c7; border-radius:4px; outline:none; cursor:pointer;">
                                <optgroup label="자동 데이터">
                                    <option value="핵심작업명">핵심작업명 (자동이름)</option>
                                    <option value="득점">득 점 (자동배점)</option>
                                    <option value="양호불량">□ 양호 / □ 불량</option>
                                </optgroup>
                                <optgroup label="기본 항목">
                                    <option value="항 목">항 목</option>
                                    <option value="항 목 1">항 목 1</option>
                                    <option value="항 목 2">항 목 2</option>
                                </optgroup>
                                <optgroup label="작업 순서">
                                    <option value="① 이상 부위">① 이상 부위</option>
                                    <option value="② 내용 및 상태">② 내용 및 상태</option>
                                    <option value="③ 판 정">③ 판 정</option>
                                    <option value="④ 정비 및 조치사항">④ 정비 및 조치사항</option>
                                    <option value="⑤ 측 정 값">⑤ 측 정 값</option>
                                    <option value="⑥ 규 정 값">⑥ 규 정 값</option>
                                    <option value="⑦ 점 검 결 과">⑦ 점 검 결 과</option>
                                    <option value="⑧ 조 치 할 사 항">⑧ 조 치 할 사 항</option>
                                </optgroup>
                                <optgroup label="별도 순서">
                                    <option value="① 측정값">① 측정값</option>
                                    <option value="② 규정값">② 규정값</option>
                                    <option value="② 판 정">② 판 정</option>
                                    <option value="③ 정비 및 조치사항">③ 정비 및 조치사항</option>
                                </optgroup>
                            </select>
                            <button class="btn-custom" style="padding:6px 10px; font-size:11px; background:#27ae60; color:white; border:none; white-space:nowrap; cursor:pointer;" onclick="execGlobalCustom('addTitle')">📝 제목 쏘기</button>
                        </div>

                        <button class="btn-custom" style="width: 100%; margin-top:6px; padding:8px 6px; font-size:11px; background:#f39c12; color:white; border:none;" onclick="execGlobalCustom('edit')">📜 선택한 셀 텍스트 수정</button>
                    </div>

                    <div style="background:#fffde7; border:1px solid #f1c40f; padding:10px; border-radius:6px; margin-bottom:15px;">
                        <div style="font-size:12px; font-weight:bold; color:#d35400; margin-bottom:8px;">고급 분할 (엑셀형)</div>
                        <button class="btn-custom" style="width:100%; padding:10px; font-size:12px; background:#e67e22; border-color:#d35400; font-weight:bold;" onclick="execGlobalCustom('fullCustom')">✨ 엑셀형 표 나누기</button>
                        <div style="font-size:10.5px; color:#d35400; margin-top:5px; line-height:1.3; word-break:keep-all;">※ 기존 표를 완전히 지우고 빈 엑셀 형태로 조각냅니다.</div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <button class="btn-custom" style="padding:8px; font-size:12px; background:#7f8c8d; border-color:#7f8c8d;" onclick="execGlobalCustom('undo')">↩️ 직전 상태로 (Undo)</button>
                        <button class="btn-custom" style="padding:8px; font-size:12px; background:#e74c3c; border-color:#c0392b;" onclick="execGlobalCustom('reset')">🔄 최초 순정 복원</button>
                        <button class="btn-custom" style="padding:10px; font-size:13px; background:#27ae60; border-color:#2ecc71; font-weight:bold; margin-top:10px;" onclick="execGlobalCustom('save')">💾 현재 표 안전하게 저장</button>
                    </div>
                </div>
            `;

            // 💡 [레이아웃 교정] 우측 배너가 생겨서 중앙이 틀어지는 것을 방지하기 위해, 좌측에 보이지 않는 공간(Spacer)을 배치하여 완벽히 균형을 맞춥니다.
            let nonNcsPaperToolbar = '';
            if (window.isCurrentNonNCS) {
                nonNcsPaperToolbar = `
                    <div class="no-print" style="width:100%; margin-bottom:12px; padding:10px 14px; background:#ebf5fb; border:2px solid #3498db; border-radius:8px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; box-sizing:border-box;">
                        <span style="font-size:12px; font-weight:bold; color:#2980b9;">📝 평가지 글자 크기</span>
                        <button type="button" onclick="adjustAllNonNcsPaperPrintSize(-${NON_NCS_PRINT_SIZE_STEP})" style="background:#7f8c8d;color:white;border:none;padding:7px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">A- 전체 줄이기</button>
                        <button type="button" onclick="adjustAllNonNcsPaperPrintSize(${NON_NCS_PRINT_SIZE_STEP})" style="background:#34495e;color:white;border:none;padding:7px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">A+ 전체 키우기</button>
                        <button type="button" onclick="saveNonNcsPaperPrintSizes()" style="background:#27ae60;color:white;border:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.15); margin-left:auto;">💾 글자 크기 저장</button>
                        <span style="font-size:11px; color:#7f8c8d; width:100%;">조절 후 [💾 글자 크기 저장]을 눌러야 Firebase에 반영됩니다.</span>
                    </div>
                `;
            }

            let finalLayoutHtml = `
                <div style="display:flex; justify-content:center; align-items:flex-start; gap:20px; width:100%;">
                    <div class="eval-left-spacer no-print" style="width: 280px; flex-shrink: 0; visibility: hidden;"></div>
                    <div style="display:flex; flex-direction:column; gap:30px; align-items:center; flex:1; max-width: 210mm;">
                        ${nonNcsPaperToolbar}
                        ${frontHtml}
                        ${backHtml}
                    </div>
                    ${rightBannerHtml}
                </div>
            `;
            
            document.getElementById('page2').innerHTML = finalLayoutHtml;
            if (window.isCurrentNonNCS) {
                document.getElementById('page2').setAttribute('data-non-ncs-paper-key', getNonNcsPrintSizeCacheKey());
            } else {
                document.getElementById('page2').removeAttribute('data-non-ncs-paper-key');
            }
            if (typeof window.scheduleEvalMobileDocFit === 'function') window.scheduleEvalMobileDocFit(200);
        }

        window.resetCustomTable = async function(idx) {
            if (!currentDbKey) return;
            if (!await appConfirm("⚠️ 이 표를 처음 '순정 상태'로 되돌리시겠습니까?\n(지금까지 쪼개고 수정한 커스텀 내역이 모두 영구 삭제됩니다.)")) return;
            
            try {
                await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}/customHtml`).remove();
                await appAlert("✅ 표가 최초 순정 상태로 복원되었습니다.");
                buildEvaluationPaper(); 
            } catch(e) {
                await appAlert("❌ 복원 실패: " + e.message);
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

        

        window.saveTableState = function(tId) {
            if (!window.tableUndoStacks[tId]) window.tableUndoStacks[tId] = [];
            let wrapper = document.getElementById(`wrapper_${tId}`);
            if (wrapper) {
                window.tableUndoStacks[tId].push(wrapper.innerHTML);
            }
            // 💡 [에러 원인 차단] 예전에 삭제된 버튼을 찾으려다 엔진이 즉사하는 현상 완벽 방어!
            let oldUndoBtn = document.getElementById(`undo_${tId}`);
            if (oldUndoBtn) oldUndoBtn.disabled = false;
        };

        window.undoTable = function(tId) {
            if (!window.tableUndoStacks[tId] || window.tableUndoStacks[tId].length === 0) return;
            let lastHtml = window.tableUndoStacks[tId].pop();
            document.getElementById(`wrapper_${tId}`).innerHTML = lastHtml;
            
            if (window.tableUndoStacks[tId].length === 0) {
                let uBtn = document.getElementById(`undo_${tId}`);
                if(uBtn) uBtn.disabled = true;
            }
            let eBtn = document.getElementById(`edit_${tId}`);
            if(eBtn) eBtn.style.display = 'none';
            markChanged(tId); 
        };

        // 💡 [초정밀 코어] 표의 시각적 형태를 수학적 2차원 배열(Matrix)로 스캔하는 엔진
        const getTableMatrix = (table) => {
            let grid = [];
            Array.from(table.rows).forEach((tr, r) => {
                if(!grid[r]) grid[r] = [];
                let c = 0;
                Array.from(tr.cells).forEach(td => {
                    while(grid[r][c]) c++; // 이미 위나 좌측에서 병합되어 침범한 칸이 있으면 건너뜀
                    let rs = parseInt(td.getAttribute('rowspan')) || 1;
                    let cs = parseInt(td.getAttribute('colspan')) || 1;
                    for(let y=0; y<rs; y++){
                        for(let x=0; x<cs; x++){
                            if(!grid[r+y]) grid[r+y] = [];
                            grid[r+y][c+x] = { td: td, isTopLeft: (y===0 && x===0) }; // 셀의 원점 기록
                        }
                    }
                });
            });
            return grid;
        };

        // 💡 [엔진 1] 엑셀 방식의 지능형 행(Row) 추가 (연속 추가 가능)
        window.addRowInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 기준이 될 셀을 먼저 클릭하여 노란색으로 활성화해주세요.");
            
            saveTableState(tId);
            let targetTable = activeCells[0].hasAttribute('data-inner') ? activeCells[0].closest('table') : table;
            let grid = getTableMatrix(targetTable);
            
            let maxR = -1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && activeCells[0] === grid[r][c].td && r > maxR) maxR = r;
                }
            }
            let insertR = maxR + 1; 
            
            let newTr = targetTable.insertRow(insertR);
            let cols = grid[0].length;
            
            for(let c=0; c<cols; c++){
                if(insertR > 0 && insertR < grid.length && grid[insertR-1][c].td === grid[insertR][c].td) {
                    let spanCell = grid[insertR-1][c].td;
                    if(grid[insertR-1][c].isTopLeft || c===0 || grid[insertR-1][c-1].td !== spanCell) {
                        spanCell.setAttribute('rowspan', parseInt(spanCell.getAttribute('rowspan')||1) + 1);
                    }
                    let cs = parseInt(spanCell.getAttribute('colspan')||1);
                    c += cs - 1; 
                } else {
                    let td = document.createElement('td');
                    td.className = 'editable-cell';
                    if(activeCells[0].hasAttribute('data-inner')) td.setAttribute('data-inner', 'true');
                    td.style.cssText = 'border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; height:35px; font-size:12px;';
                    newTr.appendChild(td);
                }
            }
            // 💡 [연속 작업 락] 소등하지 않고 그대로 유지합니다.
            markChanged(tId);
        };

        // 💡 [지능형 업그레이드] 헤더를 자동 확장하는 열 추가 엔진 (연속 추가 가능)
        window.addColInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 기준이 될 셀을 먼저 클릭하여 노란색으로 활성화해주세요.");

            saveTableState(tId);
            let targetTable = activeCells[0].hasAttribute('data-inner') ? activeCells[0].closest('table') : table;
            let grid = getTableMatrix(targetTable);
            
            let maxC = -1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && activeCells[0] === grid[r][c].td && c > maxC) maxC = c;
                }
            }
            let insertC = maxC + 1; 
            
            for(let r=0; r<grid.length; r++){
                if(insertC > 0 && insertC < grid[r].length && grid[r][insertC-1].td === grid[r][insertC].td) {
                    let spanCell = grid[r][insertC-1].td;
                    if(grid[r][insertC-1].isTopLeft || r===0 || grid[r-1][insertC-1].td !== spanCell) {
                        spanCell.setAttribute('colspan', parseInt(spanCell.getAttribute('colspan')||1) + 1);
                    }
                    let rs = parseInt(spanCell.getAttribute('rowspan')||1);
                    r += rs - 1; 
                } else if (insertC > 0 && r === 0 && parseInt(grid[r][insertC-1].td.getAttribute('rowspan')||1) === 1) {
                    let spanCell = grid[r][insertC-1].td;
                    spanCell.setAttribute('colspan', parseInt(spanCell.getAttribute('colspan')||1) + 1);
                } else {
                    let tr = targetTable.rows[r];
                    let physicalIdx = 0;
                    for(let c=0; c<insertC; c++){
                        if(grid[r][c] && grid[r][c].isTopLeft) physicalIdx++;
                    }
                    let td = tr.insertCell(physicalIdx);
                    td.className = 'editable-cell';
                    if(activeCells[0].hasAttribute('data-inner')) td.setAttribute('data-inner', 'true');
                    td.style.cssText = 'border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; height:35px; font-size:12px;';
                    
                    if(r===0) { 
                        td.style.backgroundColor = '#f2f2f2'; td.style.fontWeight = 'bold'; 
                    }
                }
            }
            // 💡 [연속 작업 락] 소등하지 않고 그대로 유지합니다.
            markChanged(tId);
        };

        // 💡 [엔진 3] 엑셀 방식의 2D 사각형 영역 병합(Merge)
        window.mergeCellInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = Array.from(table.querySelectorAll('.active-custom-cell'));
            if (activeCells.length < 2) return await appAlert("⚠️ 병합할 셀을 2개 이상 선택해주세요.");
            
            saveTableState(tId);
            let targetTable = activeCells[0].hasAttribute('data-inner') ? activeCells[0].closest('table') : table;
            let grid = getTableMatrix(targetTable);
            
            let minR=Infinity, maxR=-1, minC=Infinity, maxC=-1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && activeCells.includes(grid[r][c].td)){
                        if(r < minR) minR = r; if(r > maxR) maxR = r;
                        if(c < minC) minC = c; if(c > maxC) maxC = c;
                    }
                }
            }
            
            let topLeftCell = grid[minR][minC].td;
            let rSpan = maxR - minR + 1;
            let cSpan = maxC - minC + 1;
            
            topLeftCell.setAttribute('rowspan', rSpan);
            topLeftCell.setAttribute('colspan', cSpan);
            
            let mergedText = [];
            for(let r=minR; r<=maxR; r++){
                for(let c=minC; c<=maxC; c++){
                    let cellData = grid[r][c];
                    if(cellData && cellData.isTopLeft) {
                        let td = cellData.td;
                        let txt = td.innerHTML.trim();
                        if (td !== topLeftCell) {
                            if(txt && txt !== '&nbsp;' && txt !== '<br>') mergedText.push(txt);
                            td.remove();
                        } else {
                            if(txt && txt !== '&nbsp;' && txt !== '<br>') mergedText.push(txt);
                        }
                    }
                }
            }
            topLeftCell.innerHTML = mergedText.join('<br>');
            
            Array.from(targetTable.rows).forEach(tr => {
                if (tr.cells.length === 0) tr.remove();
            });
            
            // 💡 [연속 작업 락] 병합 후 하나로 합쳐진 거대한 셀에 활성화 락을 걸어 유지합니다.
            activeCells.forEach(c => c.classList.remove('active-custom-cell'));
            topLeftCell.classList.add('active-custom-cell');
            markChanged(tId);
        };

        window.editCellText = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length !== 1) return await appAlert("⚠️ 텍스트를 수정할 칸(셀)을 딱 1개만 선택해주세요.");
            
            saveTableState(tId); 
            
            let cell = activeCells[0];
            cell.contentEditable = "true";
            cell.focus();
            
            cell.oninput = function() { markChanged(tId); };
            
            cell.onblur = function() {
                cell.contentEditable = "false";
                cell.classList.remove('active-custom-cell');
                let eBtn = document.getElementById(`edit_${tId}`);
                if(eBtn) eBtn.style.display = 'none';
                cell.onblur = null; cell.oninput = null; 
            };
        };

        window.enableFullCustom = async function(tId, score, itemName) {
            let idx = tId.replace('custom_table_', '');
            let existingJson = null;

            if (!currentDbKey) return await appAlert("⚠️ 데이터베이스 키 오류");

            try {
                let snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}/customJson`).once('value');
                existingJson = snap.val();
            } catch(e) {}

            if (window.CustomMatrixEngine) {
                // 💡 [에러 원인 차단] 삭제된 텍스트 수정 버튼을 제어하려다 발생하는 멈춤 현상 방어
                let editBtn = document.getElementById(`edit_${tId}`);
                if (editBtn) editBtn.style.display = 'none';
                
                if (existingJson) {
                    saveTableState(tId);
                    window.CustomMatrixEngine.loadJsonData(tId, existingJson); 
                } else {
                    if(!await appConfirm("⚠️ [완전커스텀 모드 전환]\n기존 표가 삭제되고, 4줄 x 20칸의 엑셀형 표가 새로 생성됩니다.\n계속하시겠습니까?")) return;
                    saveTableState(tId);
                    window.CustomMatrixEngine.initEngine(tId, score, (itemName || "").replace(/`/g, ''));
                }
                
                document.getElementById(`wrapper_${tId}`).setAttribute('data-engine', 'json');
                window.CustomMatrixEngine.enterEditMode(tId);
            } else {
                await appAlert("🚨 평가지항목.js 엔진 모듈을 찾을 수 없습니다.");
            }
        };

        window.saveCustomTable = async function(idx, tId) {
            if (!currentDbKey) return await appAlert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");
            
            if(window.CustomMatrixEngine) window.CustomMatrixEngine.closeEditor();

            const wrapper = document.getElementById(`wrapper_${tId}`);
            
            // 💡 [저장 전 멸균 작업] 문서에 주황색이 찍히지 않도록 활성화 찌꺼기 완벽 소각!
            wrapper.querySelectorAll('.active-custom-cell').forEach(c => {
                c.classList.remove('active-custom-cell');
                c.contentEditable = "false";
            });
            wrapper.querySelectorAll('.v2-active-cell, .v2-range-cell').forEach(c => {
                c.classList.remove('v2-active-cell', 'v2-range-cell');
            });
            wrapper.querySelectorAll('[data-v2-editable="true"]').forEach(c => {
                c.removeAttribute('data-v2-editable');
                c.contentEditable = "false";
            });

            const isJsonEngine = wrapper.hasAttribute('data-engine') && wrapper.getAttribute('data-engine') === 'json';

            try {
                if (isJsonEngine && window.CustomMatrixEngine) {
                    const jsonData = window.CustomMatrixEngine.getJsonData(tId);
                    const html = wrapper.innerHTML; 
                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}`).update({ customJson: jsonData, customHtml: html });
                } else {
                    const html = wrapper.innerHTML;
                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}`).update({ customHtml: html });
                }
                
                await appAlert("✅ 커스텀 표 양식이 안전하게 저장되었습니다!\n(공용 클라우드 올리기 시 자동으로 포함됩니다.)");
                buildEvaluationPaper(); 
            } catch(e) { 
                await appAlert("❌ 저장 실패: " + e.message); 
            }
        };

        window.TraineeTableV2 = {
            activeTableId: null,
            selectedCells: [],
            undoStacks: {},

            ensureStyle() {
                if (document.getElementById('trainee-v2-style')) return;
                const style = document.createElement('style');
                style.id = 'trainee-v2-style';
                style.innerHTML = `
                    .v2-active-cell { outline: 3px solid #1abc9c !important; outline-offset: -3px; background-color: #e8fff8 !important; }
                    .v2-range-cell { outline: 2px solid #16a085 !important; outline-offset: -2px; background-color: #f0fffb !important; }
                    .trainee-v2-mode td, .trainee-v2-mode th { cursor: cell !important; }
                    #trainee-v2-toolbar button { border:none; border-radius:4px; padding:6px 8px; font-size:11px; font-weight:bold; cursor:pointer; }
                `;
                document.head.appendChild(style);
            },

            async activate(tId) {
                this.ensureStyle();
                const table = document.getElementById(tId);
                const wrapper = document.getElementById(`wrapper_${tId}`);
                if (!table || !wrapper) return await appAlert("표를 찾을 수 없습니다.");

                this.activeTableId = tId;
                if (!this.undoStacks[tId]) this.undoStacks[tId] = [];
                wrapper.setAttribute('data-engine', 'html-v2');
                table.classList.add('trainee-v2-mode');

                table.querySelectorAll('td, th').forEach(cell => {
                    cell.setAttribute('data-v2-editable', 'true');
                    cell.contentEditable = "true";
                    cell.addEventListener('input', () => markChanged(tId));
                });

                this.selectedCells = [];
                this.showToolbar();
                await appAlert("✅ 표 편집 V2가 켜졌습니다.\n셀을 바로 클릭해 입력하고, 여러 셀은 드래그 또는 Shift/Ctrl 클릭으로 선택하세요.");
            },

            showToolbar() {
                let toolbar = document.getElementById('trainee-v2-toolbar');
                if (!toolbar) {
                    toolbar = document.createElement('div');
                    toolbar.id = 'trainee-v2-toolbar';
                    toolbar.className = 'no-print';
                    toolbar.style.cssText = 'position:fixed; top:115px; right:330px; z-index:99998; width:210px; background:#ffffff; border:2px solid #1abc9c; border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,0.22); padding:10px; display:none; flex-direction:column; gap:6px;';
                    toolbar.innerHTML = `
                        <div style="font-weight:900; color:#16a085; font-size:13px; padding-bottom:6px; border-bottom:1px solid #d5f5e3;">🧩 표 편집 V2</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                            <button style="background:#27ae60; color:white;" onclick="TraineeTableV2.addRow()">+행</button>
                            <button style="background:#e74c3c; color:white;" onclick="TraineeTableV2.deleteRow()">-행</button>
                            <button style="background:#27ae60; color:white;" onclick="TraineeTableV2.addCol()">+열</button>
                            <button style="background:#e74c3c; color:white;" onclick="TraineeTableV2.deleteCol()">-열</button>
                            <button style="background:#3498db; color:white;" onclick="TraineeTableV2.mergeCells()">병합</button>
                            <button style="background:#9b59b6; color:white;" onclick="TraineeTableV2.unmergeCell()">나누기</button>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px;">
                            <button style="background:#34495e; color:white;" onclick="TraineeTableV2.applyStyle('bold')">굵게</button>
                            <button style="background:#2980b9; color:white;" onclick="TraineeTableV2.applyStyle('left')">좌</button>
                            <button style="background:#2980b9; color:white;" onclick="TraineeTableV2.applyStyle('center')">중</button>
                            <button style="background:#2980b9; color:white;" onclick="TraineeTableV2.applyStyle('right')">우</button>
                            <button style="background:#16a085; color:white;" onclick="TraineeTableV2.applyStyle('header')">헤더색</button>
                            <button style="background:#2c3e50; color:white;" onclick="TraineeTableV2.insertCheckbox()">☑</button>
                        </div>
                        <button style="background:#f39c12; color:white;" onclick="TraineeTableV2.undo()">↩ 이전</button>
                        <button style="background:#ecf0f1; color:#c0392b;" onclick="TraineeTableV2.close()">닫기</button>
                        <div style="font-size:10.5px; color:#7f8c8d; line-height:1.35;">팁: 셀에서 바로 입력, 드래그로 범위 선택, Ctrl/Shift 클릭으로 추가 선택</div>
                    `;
                    document.body.appendChild(toolbar);
                }
                toolbar.style.display = 'flex';
            },

            close() {
                const table = document.getElementById(this.activeTableId);
                if (table) {
                    table.classList.remove('trainee-v2-mode');
                    table.querySelectorAll('.v2-active-cell, .v2-range-cell').forEach(c => c.classList.remove('v2-active-cell', 'v2-range-cell'));
                }
                const toolbar = document.getElementById('trainee-v2-toolbar');
                if (toolbar) toolbar.style.display = 'none';
                this.selectedCells = [];
                this.activeTableId = null;
            },

            getTable() {
                return this.activeTableId ? document.getElementById(this.activeTableId) : null;
            },

            saveState() {
                const table = this.getTable();
                if (!table) return;
                if (!this.undoStacks[this.activeTableId]) this.undoStacks[this.activeTableId] = [];
                this.undoStacks[this.activeTableId].push(table.outerHTML);
                if (this.undoStacks[this.activeTableId].length > 30) this.undoStacks[this.activeTableId].shift();
            },

            undo() {
                const stack = this.undoStacks[this.activeTableId] || [];
                if (stack.length === 0) return;
                const table = this.getTable();
                const wrapper = document.getElementById(`wrapper_${this.activeTableId}`);
                const html = stack.pop();
                if (table && wrapper) {
                    table.outerHTML = html;
                    this.activate(this.activeTableId);
                    markChanged(this.activeTableId);
                }
            },

            matrix(table) {
                const grid = [];
                Array.from(table.rows).forEach((tr, r) => {
                    if (!grid[r]) grid[r] = [];
                    let c = 0;
                    Array.from(tr.cells).forEach(cell => {
                        while (grid[r][c]) c++;
                        const rs = parseInt(cell.getAttribute('rowspan')) || 1;
                        const cs = parseInt(cell.getAttribute('colspan')) || 1;
                        for (let rr = 0; rr < rs; rr++) {
                            for (let cc = 0; cc < cs; cc++) {
                                if (!grid[r + rr]) grid[r + rr] = [];
                                grid[r + rr][c + cc] = { cell, top: rr === 0 && cc === 0 };
                            }
                        }
                        c += cs;
                    });
                });
                return grid;
            },

            cellPos(cell) {
                const grid = this.matrix(this.getTable());
                for (let r = 0; r < grid.length; r++) {
                    for (let c = 0; c < grid[r].length; c++) {
                        if (grid[r][c] && grid[r][c].cell === cell && grid[r][c].top) return { r, c };
                    }
                }
                return null;
            },

            select(cell, append = false, range = false) {
                const table = this.getTable();
                if (!table || !cell) return;
                if (!append && !range) this.clearSelection();

                if (range && this.selectedCells.length > 0) {
                    const start = this.cellPos(this.selectedCells[0]);
                    const end = this.cellPos(cell);
                    const grid = this.matrix(table);
                    if (start && end) {
                        const r1 = Math.min(start.r, end.r), r2 = Math.max(start.r, end.r);
                        const c1 = Math.min(start.c, end.c), c2 = Math.max(start.c, end.c);
                        this.clearSelection();
                        for (let r = r1; r <= r2; r++) {
                            for (let c = c1; c <= c2; c++) {
                                const target = grid[r] && grid[r][c] ? grid[r][c].cell : null;
                                if (target && !this.selectedCells.includes(target)) this.selectedCells.push(target);
                            }
                        }
                    }
                } else if (!this.selectedCells.includes(cell)) {
                    this.selectedCells.push(cell);
                }

                this.paintSelection();
            },

            clearSelection() {
                const table = this.getTable();
                if (table) table.querySelectorAll('.v2-active-cell, .v2-range-cell').forEach(c => c.classList.remove('v2-active-cell', 'v2-range-cell'));
                this.selectedCells = [];
            },

            paintSelection() {
                const table = this.getTable();
                if (!table) return;
                table.querySelectorAll('.v2-active-cell, .v2-range-cell').forEach(c => c.classList.remove('v2-active-cell', 'v2-range-cell'));
                this.selectedCells.forEach((cell, idx) => cell.classList.add(idx === 0 ? 'v2-active-cell' : 'v2-range-cell'));
            },

            activeCell() {
                return this.selectedCells[0] || null;
            },

            async addRow() {
                const table = this.getTable(), active = this.activeCell();
                if (!table || !active) return await appAlert("기준 셀을 선택하세요.");
                this.saveState();
                const pos = this.cellPos(active);
                const cols = Math.max(...this.matrix(table).map(row => row.length));
                const tr = table.insertRow(pos.r + 1);
                for (let i = 0; i < cols; i++) {
                    const td = tr.insertCell();
                    td.className = 'editable-cell';
                    td.style.cssText = 'border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; height:35px; font-size:12px;';
                    td.contentEditable = "true";
                    td.setAttribute('data-v2-editable', 'true');
                }
                markChanged(this.activeTableId);
            },

            deleteRow() {
                const table = this.getTable(), active = this.activeCell();
                if (!table || !active || table.rows.length <= 1) return;
                this.saveState();
                const pos = this.cellPos(active);
                table.deleteRow(pos.r);
                this.clearSelection();
                markChanged(this.activeTableId);
            },

            async addCol() {
                const table = this.getTable(), active = this.activeCell();
                if (!table || !active) return await appAlert("기준 셀을 선택하세요.");
                this.saveState();
                const pos = this.cellPos(active);
                Array.from(table.rows).forEach(tr => {
                    const td = tr.insertCell(Math.min(pos.c + 1, tr.cells.length));
                    td.className = 'editable-cell';
                    td.style.cssText = 'border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; height:35px; font-size:12px;';
                    td.contentEditable = "true";
                    td.setAttribute('data-v2-editable', 'true');
                });
                markChanged(this.activeTableId);
            },

            deleteCol() {
                const table = this.getTable(), active = this.activeCell();
                if (!table || !active) return;
                this.saveState();
                const pos = this.cellPos(active);
                Array.from(table.rows).forEach(tr => {
                    if (tr.cells.length > 1 && tr.cells[pos.c]) tr.deleteCell(pos.c);
                });
                this.clearSelection();
                markChanged(this.activeTableId);
            },

            async mergeCells() {
                if (this.selectedCells.length < 2) return await appAlert("병합할 셀을 2개 이상 선택하세요.");
                const table = this.getTable();
                const grid = this.matrix(table);
                const positions = this.selectedCells.map(c => this.cellPos(c)).filter(Boolean);
                const minR = Math.min(...positions.map(p => p.r));
                const maxR = Math.max(...positions.map(p => p.r));
                const minC = Math.min(...positions.map(p => p.c));
                const maxC = Math.max(...positions.map(p => p.c));
                const base = grid[minR][minC].cell;
                this.saveState();
                const texts = [];
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        const cell = grid[r] && grid[r][c] ? grid[r][c].cell : null;
                        if (cell && cell !== base && this.selectedCells.includes(cell)) {
                            if (cell.innerHTML.trim()) texts.push(cell.innerHTML.trim());
                            cell.remove();
                        }
                    }
                }
                base.setAttribute('rowspan', maxR - minR + 1);
                base.setAttribute('colspan', maxC - minC + 1);
                if (texts.length) base.innerHTML = [base.innerHTML.trim(), ...texts].filter(Boolean).join('<br>');
                this.clearSelection();
                this.select(base);
                markChanged(this.activeTableId);
            },

            unmergeCell() {
                const table = this.getTable(), active = this.activeCell();
                if (!table || !active) return;
                const rs = parseInt(active.getAttribute('rowspan')) || 1;
                const cs = parseInt(active.getAttribute('colspan')) || 1;
                if (rs === 1 && cs === 1) return;
                this.saveState();
                const pos = this.cellPos(active);
                active.removeAttribute('rowspan');
                active.removeAttribute('colspan');
                for (let r = pos.r; r < pos.r + rs; r++) {
                    const tr = table.rows[r];
                    if (!tr) continue;
                    for (let c = 0; c < cs - (r === pos.r ? 1 : 0); c++) {
                        const td = tr.insertCell(Math.min(pos.c + (r === pos.r ? 1 : 0) + c, tr.cells.length));
                        td.className = 'editable-cell';
                        td.style.cssText = 'border:1px solid #000; padding:4px; text-align:center; vertical-align:middle; height:35px; font-size:12px;';
                        td.contentEditable = "true";
                        td.setAttribute('data-v2-editable', 'true');
                    }
                }
                markChanged(this.activeTableId);
            },

            applyStyle(type) {
                if (this.selectedCells.length === 0) return;
                this.saveState();
                this.selectedCells.forEach(cell => {
                    if (type === 'bold') cell.style.fontWeight = cell.style.fontWeight === 'bold' ? 'normal' : 'bold';
                    if (type === 'left') cell.style.textAlign = 'left';
                    if (type === 'center') cell.style.textAlign = 'center';
                    if (type === 'right') cell.style.textAlign = 'right';
                    if (type === 'header') {
                        const isHeader = cell.style.backgroundColor === 'rgb(242, 242, 242)' || cell.style.backgroundColor === '#f2f2f2';
                        cell.style.backgroundColor = isHeader ? 'transparent' : '#f2f2f2';
                        cell.style.fontWeight = isHeader ? 'normal' : 'bold';
                    }
                });
                markChanged(this.activeTableId);
            },

            insertCheckbox() {
                const active = this.activeCell();
                if (!active) return;
                this.saveState();
                active.innerHTML += `${active.innerHTML.trim() ? ' ' : ''}<span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span>`;
                markChanged(this.activeTableId);
            }
        };

        document.addEventListener('click', function(e) {
            const engine = window.TraineeTableV2;
            if (!engine || !engine.activeTableId) return;
            const cell = e.target.closest(`#${engine.activeTableId} td, #${engine.activeTableId} th`);
            if (!cell) return;
            engine.select(cell, e.ctrlKey, e.shiftKey);
        }, true);

        document.addEventListener('mouseover', function(e) {
            const engine = window.TraineeTableV2;
            if (!engine || !engine.activeTableId || e.buttons !== 1) return;
            const cell = e.target.closest(`#${engine.activeTableId} td, #${engine.activeTableId} th`);
            if (cell) engine.select(cell, true, false);
        });

        window.enableTraineeTableV2 = function(idx, tId) {
            window.TraineeTableV2.activate(tId);
            markChanged(tId);
        };

        // 💡 [신규 추가 부품] 셀 색상 토글 엔진
        window.toggleCellColor = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 색상을 입히거나 뺄 셀을 먼저 클릭하여 노란색으로 활성화해주세요.");
            
            saveTableState(tId);
            let changed = false;
            
            activeCells.forEach(cell => {
                // 현재 배경색이 회색(#f2f2f2)이면 투명하게, 아니면 회색으로 토글
                let currentBg = cell.style.backgroundColor;
                if (currentBg === 'rgb(242, 242, 242)' || currentBg === '#f2f2f2') {
                    cell.style.backgroundColor = 'transparent';
                    cell.style.fontWeight = 'normal';
                } else {
                    cell.style.backgroundColor = '#f2f2f2'; // 기존 헤더와 동일한 순정 회색
                    cell.style.fontWeight = 'bold';
                }
                changed = true;
            });
            
            if(changed) markChanged(tId);
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
            const teacher = document.getElementById('S0_Teacher').value || ""; // 💡 상단 표에 들어갈 담당교사 데이터 추출

            if (!subject) {
                document.getElementById('page3').innerHTML = "<div class='a4-page'><p style='padding:20px; color:red;'>⚠️ 좌측에서 평가 대상을 먼저 선택해 주십시오.</p></div>";
                return;
            }

            if (!currentDbKey) currentDbKey = (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            let savedItems = [];
            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
            } catch (e) {}

            const formatScore = (num) => Number.isInteger(num) ? num : num.toFixed(1);
            let answerPageNum = 1;

            // 💡 [통합 입력 모드 DOM 추출기 장착]
            let globalQuestionText = "[]";
            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                let globalItems = document.querySelectorAll('#global_q_list .q-item');
                let qArr = [];
                globalItems.forEach(qItem => {
                    qArr.push(collectNonNcsQItemData(qItem));
                });
                globalQuestionText = JSON.stringify(qArr);
            }

            const items = []; // ※ buildFinalResultDocs에서는 이 줄이 없고 바로 아래 줄부터 시작합니다.
            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach((tr, index) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : "평가자 체크"; 
                
                // 💡 [수리 완료] OMR 감점 시 0점 표기 버그 해결을 위한 통합 점수 추출기 장착
                let score = 0;
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (index === 0) {
                        document.querySelectorAll('#global_q_list .non-ncs-score').forEach(inp => score += Number(inp.value) || 0);
                        if (score === 0 && typeof savedItems !== 'undefined' && savedItems[index]) score = savedItems[index].score || 0;
                    }
                } else {
                    score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                }
                
                let questionText = ""; let coreTaskText = name;
                
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (index === 0) questionText = globalQuestionText;
                    else questionText = "[]";
                } else {
                    // 💡 [단선 복구] DB에 저장된 문제 배열 데이터 우선 확보 로직 (buildFinalResultDocs용)
                    if (typeof savedItems !== 'undefined' && savedItems[index]) {
                        questionText = savedItems[index].question || "";
                    }
                    const qRow = tr.nextElementSibling;
                    if (qRow && qRow.classList.contains('eval-question-row')) {
                    const qInput = qRow.querySelector('.eval-question-input'); 
                    if (qInput) {
                        questionText = qInput.value;
                    } else {
                        const nonNcsItems = qRow.querySelectorAll('.q-item');
                        let qArr = [];
                        if (nonNcsItems.length > 0) {
                            nonNcsItems.forEach(qItem => {
                                qArr.push(collectNonNcsQItemData(qItem));
                            });
                            questionText = JSON.stringify(qArr);
                        }
                    }
                    const cInput = qRow.querySelector('.eval-core-task-input'); if(cInput) coreTaskText = cInput.value;
                }
            } // 💡 [추가된 괄호] else 구문을 완벽하게 닫아줍니다.
            items.push({ name, type, score, question: questionText, coreTask: coreTaskText });
        });

            const topControlsHtml = `
                <div style="width: 210mm; margin: 0 auto 10px auto; display: flex; justify-content: flex-end;" class="no-print">
                    <button class="btn-save-settings" onclick="saveModelAnswers()" style="background:#c0392b; font-size:14px; padding:8px 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">💾 모범답안 일괄 저장</button>
                </div>
            `;

            let unitDisplay = (unitCode && !unitCode.includes("없음")) ? `${unitCode} ${unitName || subject}` : (unitName || subject);
            const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";

            // 💡 [비NCS 격리] 비NCS/소양 모드일 때만 이미지 레이아웃으로 변경 (능력단위 제외, 평가방법/담당교사 우측 배치)
            let topTableHtml = "";
            if (window.isCurrentNonNCS) {
                topTableHtml = `
                    <table class="ans-table" style="margin-bottom: 25px; border: 2px solid #000; table-layout: auto;">
                        <tr><th colspan="4" class="ans-cyan-bg" style="font-size: 20px; padding: 12px !important; border-bottom: 2px solid #000;">${evalModePrefix}내부평가 근거자료 모범답안 및 채점기준</th></tr>
                        <tr><th class="ans-cyan-bg" style="width:15%">훈련과정</th><td style="width:35%">${courseName}</td><th class="ans-cyan-bg" style="width:15%">훈련기간</th><td style="width:35%">${period}</td></tr>
                        <tr><th class="ans-cyan-bg">교 과 목</th><td>${subject}</td><th class="ans-cyan-bg">평가방법</th><td style="line-height:1.4;">${evalMethod}</td></tr>
                        <tr><th class="ans-cyan-bg">총 점</th><td>100점</td><th class="ans-cyan-bg">담당교사</th><td>${teacher}</td></tr>
                    </table>
                `;
            } else {
                // NCS 순정 레이아웃 보존
                topTableHtml = `
                    <table class="ans-table" style="margin-bottom: 25px; border: 2px solid #000; table-layout: auto;">
                        <tr><th colspan="4" class="ans-cyan-bg" style="font-size: 20px; padding: 12px !important; border-bottom: 2px solid #000;">${evalModePrefix}내부평가 근거자료 모범답안 및 채점기준</th></tr>
                        <tr><th class="ans-cyan-bg" style="width:15%">훈련과정</th><td style="width:35%">${courseName}</td><th class="ans-cyan-bg" style="width:15%">훈련기간</th><td style="width:35%">${period}</td></tr>
                        <tr><th class="ans-cyan-bg">교 과 목</th><td>${subject}</td><th class="ans-cyan-bg">능력단위</th><td style="line-height:1.4;">${unitDisplay}</td></tr>
                        <tr><th class="ans-cyan-bg">평가방법</th><td>${evalMethod}</td><th class="ans-cyan-bg">총 점</th><td>100점</td></tr>
                    </table>
                    <div class="ep-section-title" style="font-size: 16px; margin-bottom: 15px;">1. 지식·기술 평가</div>
                `;
            }

            let fullHtml = topControlsHtml + `<div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div>${topTableHtml}<div style="flex:1;">`;
            let pageWeight = 0;

            if (window.isCurrentNonNCS) {
                // 💡 [비NCS/소양 전용 회로] 모든 평가항목의 객관식 문제를 1개로 취합하여 10문제 단위로 페이지 분할 및 통계표 생성 (제시된 이미지 규격 100% 매핑)
                let allQ = [];
                let totalScore = 0;
                items.forEach(item => {
                    totalScore += item.score;
                    try {
                        let arr = JSON.parse(item.question);
                        // 💡 선생님께서 0.설정에서 만든 배열 데이터를 100% 그대로 끌고옵니다. 임의 데이터 주입 폐기.
                        if (Array.isArray(arr)) {
                            allQ = allQ.concat(arr);
                        }
                    } catch(e){}
                });

                // 만약 0.설정에서 '+문제추가' 버튼을 단 한 번도 누르지 않아 완전히 비어있을 때만 튕김 방지용 1줄 방어
                if (allQ.length === 0) {
                    allQ.push({ score: totalScore || 100, diff: "중", q: "문제를 추가해주세요.", o1: "", o2: "", o3: "", o4: "", ans: "1", exp: "" });
                }
                
                let hard=0, med=0, easy=0;
                allQ.forEach(q => {
                    if(q.diff==='상') hard++;
                    else if(q.diff==='하') easy++;
                    else med++;
                });
                let totalQ = allQ.length || 1;
                let hp = Math.round((hard/totalQ)*100);
                let mp = Math.round((med/totalQ)*100);
                let ep = Math.round((easy/totalQ)*100);
                
                let allSameScore = allQ.every(q => Number(q.score) === Number(allQ[0]?.score));
                let scorePerQText = (allSameScore && allQ.length > 0) ? `${allQ[0].score}점` : "문항별 상이";

                // 💡 [강제 10문제 청크 폐기] 대신, NCS처럼 pageWeight(무게)를 측정하여 자연스럽게 페이지를 넘기는 지능형 회로 탑재
                const tableHeaderHtml = `
                    <table class="ans-table" style="border: 2px solid #000; width: 100%; margin-bottom: 25px;">
                        <colgroup>
                            <col style="width: 10%;">
                            <col style="width: 10%;">
                            <col style="width: 70%;">
                            <col style="width: 10%;">
                        </colgroup>
                        <tr><th colspan="4" class="ans-cyan-bg" style="font-size: 16px; padding: 10px !important; border-bottom: 2px solid #000;">정답 및 해설</th></tr>
                        <tr>
                            <th style="background-color: #f2f2f2;">문 제</th>
                            <th style="background-color: #f2f2f2;">정 답</th>
                            <th style="background-color: #f2f2f2;">해 설</th>
                            <th style="background-color: #f2f2f2;">난이도</th>
                        </tr>`;

                fullHtml += `<div style="font-size: 15px; font-weight: bold; margin-bottom: 8px; display:flex; align-items:center;"><span style="margin-right:6px;">■</span> 모범답안</div>`;
                fullHtml += tableHeaderHtml;
                
                const firstAnswerPageLimit = 2.30; // 💡 PDF 인쇄 여백의 약 90%까지 첫 장 사용
                const nextAnswerPageLimit = 2.65; // 💡 2페이지부터는 상단 정보표가 없어 더 넓게 사용
                const statsTableWeight = 0.48; // 💡 마지막 채점기준 통계표가 차지할 공간
                let currentAnswerPageLimit = firstAnswerPageLimit;
                let pWeight = 0.50; // 💡 1페이지 상단 표(topTableHtml)가 미리 차지하고 있는 공간 무게(Weight)

                allQ.forEach((qObj, i) => {
                    let expLen = (qObj.exp || '').length;
                    let rowWeight = 0.085 + (Math.ceil(expLen / 75) * 0.028); // 💡 페이지 하단 90% 선까지 활용하도록 행 무게 현실화
                    
                    let needSpace = rowWeight;
                    if (i === allQ.length - 1) needSpace += statsTableWeight; // 💡 마지막 문제 하단 채점기준 통계표 공간 예약

                    // 💡 [PDF 안전 페이지 제어] 인쇄 여백을 넘기기 전에 문제 행 단위로 다음 장으로 넘김
                    if (pWeight + needSpace > currentAnswerPageLimit) {
                        fullHtml += `</table></div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div>`;
                        
                        // 💡 [선생님 지시 적용] 2페이지부터는 topTableHtml(상단 뼈대)를 없애고, 오직 문제 표 헤더만 이어서 출력!
                        fullHtml += `<div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div><div style="flex:1;">`;
                        fullHtml += tableHeaderHtml;
                        pWeight = 0.18; // 새 페이지는 문제 표 헤더 무게만 할당
                        currentAnswerPageLimit = nextAnswerPageLimit;
                    }

                    let globalIdx = i + 1;
                    let ansSymbol = (!qObj.q || qObj.q.trim() === "") ? '-' : (qObj.ans === '1' ? '①' : (qObj.ans === '2' ? '②' : (qObj.ans === '3' ? '③' : '④')));
                    
                    // 💡 [비NCS/소양 전용 특수 방어막] 해설 텍스트에 부등호(<, >) 등 기호가 들어갈 경우 HTML 태그로 오인되어 4번째(난이도) 셀을 통째로 삼켜버리는 현상 완벽 차단!
                    let safeExp = (qObj.exp || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    let diffText = qObj.diff || '중';

                    // 💡 [시각적 압축] 표 내부의 패딩과 폰트 크기를 줄여 20문제가 타이트하게 안착되도록 방어
                    fullHtml += `<tr>`;
                    fullHtml += `<td style="text-align:center; font-weight:bold; vertical-align:middle; padding:5px; font-size:13px;">[ ${globalIdx} ]</td>`;
                    fullHtml += `<td style="text-align:center; font-weight:bold; font-size:13px; color:#c0392b; vertical-align:middle; padding:5px;">${ansSymbol}</td>`;
                    fullHtml += `<td style="text-align:left; padding:5px 10px; vertical-align:middle; line-height:1.4; word-break:keep-all; font-size:12px;">${safeExp}</td>`;
                    fullHtml += `<td style="text-align:center; font-weight:bold; vertical-align:middle; padding:5px; font-size:13px;">${diffText}</td>`;
                    fullHtml += `</tr>`;
                    
                    pWeight += rowWeight; // 현재 줄을 출력했으니 용지 무게 누적
                });
                
                if (pWeight + statsTableWeight > currentAnswerPageLimit) {
                    fullHtml += `</table></div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div>`;
                    fullHtml += `<div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div><div style="flex:1;">`;
                } else {
                    fullHtml += `</table>`;
                }

                // 루프 종료 후 마지막에 채점기준(통계표) 부착
                // 💡 [통계표 압축] 하단 테이블 역시 쓸데없는 여백을 날려버려 페이지 이탈 차단
                fullHtml += `
                    <div style="height: 10px;"></div>
                    <table class="ans-table" style="border: 2px solid #000; width: 100%; margin-bottom: 15px; font-size: 13px;">
                        <colgroup>
                            <col style="width: 30%;">
                            <col style="width: 20%;">
                            <col style="width: 30%;">
                            <col style="width: 20%;">
                        </colgroup>
                        <tr><th colspan="4" class="ans-cyan-bg" style="font-size: 15px; padding: 8px !important; border-bottom: 2px solid #000;">채점기준</th></tr>
                        <tr><th class="ans-cyan-bg" style="padding: 6px !important;">총 문항 수</th><td colspan="3" style="padding: 6px !important;">${allQ.length}문제</td></tr>
                        <tr><th class="ans-cyan-bg" style="padding: 6px !important;">총 점</th><td colspan="3" style="padding: 6px !important;">${totalScore}점</td></tr>
                        <tr><th class="ans-cyan-bg" style="padding: 6px !important;">문항별 배점</th><td colspan="3" style="padding: 6px !important;">${scorePerQText}</td></tr>
                        <tr>
                            <th rowspan="3" class="ans-cyan-bg" style="vertical-align:middle; padding: 6px !important;">난이도 분포</th>
                            <td style="text-align:center; padding: 6px !important;">상</td>
                            <td style="text-align:center; padding: 6px !important;">${hard}문제</td>
                            <td style="text-align:center; padding: 6px !important;">${hp}%</td>
                        </tr>
                        <tr><td style="text-align:center; padding: 6px !important;">중</td><td style="text-align:center; padding: 6px !important;">${med}문제</td><td style="text-align:center; padding: 6px !important;">${mp}%</td></tr>
                        <tr><td style="text-align:center; padding: 6px !important;">하</td><td style="text-align:center; padding: 6px !important;">${easy}문제</td><td style="text-align:center; padding: 6px !important;">${ep}%</td></tr>
                    </table>
                `;
            } else {
                items.forEach((item, idx) => {
                    // --- 이하 기존 로직 계속 ---
                    let suffix = item.type === '훈련생작성' ? '(기록표)' : '';
                let itemHtml = `<div style="font-weight: bold; font-size: 13px; margin-bottom: 4px;">[제${idx+1} 평가항목] ${item.name}${suffix}</div>`; // 여백 살짝 조정
                
                if (item.type === '훈련생작성') {
                    let ansTableHtml = "";
                    if (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].ansHtml) {
                        ansTableHtml = window.downloadedCustomItems[idx].ansHtml;
                    } else if (savedItems[idx] && savedItems[idx].ansHtml && savedItems[idx].type === item.type) {
                        // 💡 [버그 수정] 평가 방식 일치 시에만 적용
                        ansTableHtml = savedItems[idx].ansHtml;
                    }
                    
                    // 💡 [수리 완료] base 변수 선언을 밖으로 빼서 참조 오류(ReferenceError)로 인한 화면 다운 증상 해결!
                    let base = (window.downloadedCustomItems && window.downloadedCustomItems[idx] && window.downloadedCustomItems[idx].customHtml) ? window.downloadedCustomItems[idx].customHtml : (savedItems[idx] && savedItems[idx].customHtml && savedItems[idx].type === item.type) ? savedItems[idx].customHtml : "";
                    
                    if (!base) {
                            base = `
                                <table class="ep-table trainee-table-target" style="margin-bottom: 0; table-layout: fixed; width: 100%; word-break: break-all; border: 2px solid #000;">
                                    <tr>
                                        <th rowspan="2" class="editable-cell" style="width:15%">항 목</th>
                                        <th colspan="2" class="editable-cell" style="width:40%">항 목 1</th>
                                        <th colspan="2" class="editable-cell" style="width:35%">항 목 2</th>
                                        <th rowspan="2" class="editable-cell" style="width:10%; line-height:1.4;">득 점<br><span style="font-weight:normal;">(${item.score}점)</span></th>
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
                                        <td class="editable-cell" style="line-height:1.6; text-align:center !important;"><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">양호</span><br><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span> <span style="color:black;">불량</span></td><td class="editable-cell"></td><td class="editable-cell"></td>
                                    </tr>
                                </table>
                            `;
                        }
                    
                    if (!ansTableHtml) {
                        ansTableHtml = base;
                    }
                    
                    // 💡 [멸균 및 강제 정렬 엔진]
                    ansTableHtml = ansTableHtml.replace(/(<td[^>]*>)\s+/gi, '$1');
                    ansTableHtml = ansTableHtml.replace(/(<br>)\s+/gi, '$1');
                    ansTableHtml = ansTableHtml.replace(/\s+<\/td>/gi, '</td>');
                    ansTableHtml = ansTableHtml.replace(/text-align:\s*left;?/g, 'text-align: center;');
                    
                    // 💡 [신규 모터 1] 실시간 득점 연동 (0.설정값 강제 주입 및 editable-cell 유지)
                    // 1) 상단 제목줄의 (XX점) 실시간 교체
                    ansTableHtml = ansTableHtml.replace(/<span style="font-weight:normal;">\([0-9\.]+점\)<\/span>/g, `<span style="font-weight:normal;">(${item.score}점)</span>`);
                    
                    // 2) 비어있는 원본 득점칸 채우기
                    ansTableHtml = ansTableHtml.replace(/<td( class="editable-cell")?>\s*<\/td>\s*<\/tr>/i, `<td class="editable-cell" style="color:#c0392b; font-weight:bold; font-size:14px; text-align:center; vertical-align:middle;">${item.score}</td></tr>`);
                    
                    // 3) 이미 저장된 빨간색 득점칸 업데이트
                    ansTableHtml = ansTableHtml.replace(/<td[^>]*color:\s*#c0392b[^>]*>[0-9\.]+<\/td>\s*<\/tr>/gi, `<td class="editable-cell" style="color:#c0392b; font-weight:bold; font-size:14px; text-align:center; vertical-align:middle;">${item.score}</td></tr>`);
                    
                    // 💡 [지능형 정수 분배 엔진] '판정' 항목을 추적하여 소수점을 없애고 점수 몰아주기
                    let tHeaders = window.extractTraineeHeaders(base);
                    let numH = tHeaders.length;
                    let sArray = new Array(numH).fill(0);
                    
                    // 텍스트 내에 띄어쓰기 무시하고 '판정' 글자가 있는지 추적
                    let panjungIdx = tHeaders.findIndex(h => h.replace(/\s/g, '').includes('판정'));

                    if (panjungIdx !== -1) {
                        let baseScore = Math.ceil(item.score / numH); // 나머지는 정수로 올림
                        // 락(Lock): 만약 올림 점수 때문에 판정 점수가 0점 이하로 떨어지면, 내림으로 방어
                        if (item.score - (baseScore * (numH - 1)) <= 0) baseScore = Math.floor(item.score / numH);
                        
                        let sum = 0;
                        for (let i = 0; i < numH; i++) {
                            if (i !== panjungIdx) { sArray[i] = baseScore; sum += baseScore; }
                        }
                        sArray[panjungIdx] = item.score - sum; // 판정 항목에 남은 점수 흡수
                    } else {
                        let sSum = 0;
                        for (let i = 0; i < numH - 1; i++) {
                            let sPart = Math.round((item.score / numH) * 10) / 10;
                            sArray[i] = sPart;
                            sSum += sPart;
                        }
                        sArray[numH - 1] = Math.round((item.score - sSum) * 10) / 10;
                    }

                    // 💡 채점기준표 HTML 동적 조립 (추출된 개수만큼 줄 생성)
                    let rubricRowsHtml = "";
                    tHeaders.forEach((hName, hIdx) => {
                        let sVal = sArray[hIdx];
                        if (hIdx === 0) {
                            rubricRowsHtml += `<tr><td style="text-align: left; padding-left: 15px;">${hName}</td><td>${sVal}점</td><td rowspan="${numH}" class="ans-rubric-text" style="vertical-align:middle; padding: 10px 15px !important;"><ul><li>단위가 없거나 틀린 경우</li><li>의미가 달라질 수 있는 단위 접두어의 대소문자가 틀린 경우</li><li>기재사항에서 평가자의 정정 날인 없이 정정된 개소</li><li>첫 번째 항목이 틀린 경우</li></ul></td></tr>`;
                        } else {
                            rubricRowsHtml += `<tr><td style="text-align: left; padding-left: 15px;">${hName}</td><td>${sVal}점</td></tr>`;
                        }
                    });

                    let sideButtonsHtml = `
                        <div class="no-print" style="position: absolute; left: 100%; top: 0; margin-left: 15px; display: flex; flex-direction: column; gap: 8px; width: 70px;">
                            <button class="btn-custom" style="background:#e74c3c; border:1px solid #c0392b; font-size:11px; padding:6px 0;" onclick="resetAnsTable(${idx})">🔄 초기화</button>
                            <button class="btn-custom" style="background:#27ae60; border:1px solid #2ecc71; font-size:11px; padding:6px 0;" onclick="saveSingleAnsTable(${idx})">💾 저장</button>
                            <button class="btn-custom" style="background:#f39c12; border:1px solid #d68910; font-size:11px; padding:6px 0;" onclick="undoAnsCell(${idx})">↩️ 셀 이전</button>
                        </div>
                    `;
                    
                    // 💡 [신규 모터 3] 일체형 모범답안 헤더
                    itemHtml += `
                        <div style="position: relative;">
                            <div style="width: 100%; border: 1px solid #000; border-bottom: none; background-color: #e0ffff; color: #111; text-align: center; font-weight: bold; padding: 8px 0; font-size: 15px; box-sizing: border-box; margin-bottom: 0;">모 범 답 안</div>
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
                            ${rubricRowsHtml}
                        </table>
                    `;
                } else {
                    let customHtml = (window.downloadedCustomItems && window.downloadedCustomItems[idx]?.customHtml) ? window.downloadedCustomItems[idx].customHtml : ((savedItems[idx]?.type === item.type && savedItems[idx]?.customHtml) ? savedItems[idx].customHtml : "");
                    let rowNames = extractTeacherRows(customHtml);
                    let N = rowNames.length;
                    let rS = item.score / N;
                    let v1 = formatScore(rS); 
                    let v2 = Math.round(rS * 0.8);
                    let v3 = Math.round(rS * 0.6);
                    let v4 = Math.round(rS * 0.4);
                    let v5 = Math.round(rS * 0.2);
                    
                    // 💡 [엔진 장착] 저장된 HTML을 불러올 때도 현재 계산된 배점으로 헤더 강제 업데이트 (싱크 완벽 보장)
                    if (customHtml) {
                        customHtml = customHtml.replace(/매우우수<br>\([0-9\.]+점\)/g, `매우우수<br>(${v1}점)`);
                        customHtml = customHtml.replace(/우수<br>\([0-9\.]+점\)/g, `우수<br>(${v2}점)`);
                        customHtml = customHtml.replace(/보통<br>\([0-9\.]+점\)/g, `보통<br>(${v3}점)`);
                        customHtml = customHtml.replace(/미흡<br>\([0-9\.]+점\)/g, `미흡<br>(${v4}점)`);
                        customHtml = customHtml.replace(/매우미흡<br>\([0-9\.]+점\)/g, `매우미흡<br>(${v5}점)`);
                    }

                    // 💡 [치명적 버그 수정] isOverload 변수가 선언되지 않아 3번 탭 전체가 셧다운되던 현상 완벽 해결
                    let isOverload = items.length >= 5;
                    
                    // 💡 [신규 탑재] 채점기준 자동 공간 압축기 (초기 렌더링 시 적용)
                    let targetTotalHeight = isOverload ? 110 : 175;
                    let rowH = Math.max(18, Math.floor(targetTotalHeight / N));

                    let rowsHtml = "";
                    rowNames.forEach((rName, r) => {
                        let rubricCells = "";
                        if (r < 5) {
                            let options = teacherRubrics[r];
                            for(let c=0; c<5; c++) {
                                rubricCells += `<td class="ans-rubric-text" style="height:${rowH}px !important;"><ul class="fb-pool"><li class="fb-item">${options[c].replace(/\|/g, '</li><li class="fb-item">')}</li></ul></td>`;
                            }
                        } else {
                            // 추가된 6번째 이상의 항목은 기본 텍스트 삽입
                            for(let c=0; c<5; c++) {
                                let desc = c===0 ? "매우 우수함" : (c===1 ? "우수함" : (c===2 ? "보통임" : (c===3 ? "미흡함" : "매우 미흡함")));
                                rubricCells += `<td class="ans-rubric-text" style="height:${rowH}px !important;"><ul class="fb-pool"><li class="fb-item">해당 평가 항목 수행능력이 ${desc}</li></ul></td>`;
                            }
                        }
                        rowsHtml += `<tr style="height:${rowH}px !important;"><td style="font-weight:bold; height:${rowH}px !important;">${rName}</td>${rubricCells}</tr>`;
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

                // 💡 [지능형 브레이크 시스템] 항목의 행(Row) 개수에 비례하여 무게(Weight)를 정밀 산출
                let rowCount = (item.type === '훈련생작성') ? 5 : (item.rowNames ? item.rowNames.length : 5);
                let weight = (item.type === '훈련생작성') ? 1.5 : (rowCount * 0.2 + 0.3);

                if (pageWeight > 0 && pageWeight + weight > 2.3) {
                    fullHtml += `</div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div><div class="a4-page" style="display:flex; flex-direction:column;"><div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지</div><div style="flex:1;">`;
                    pageWeight = 0;
                }
                fullHtml += itemHtml;
                pageWeight += weight;
                });
            } // 💡 비NCS else 구문 닫기 (격리 완료)

            fullHtml += `</div><div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div></div>`;

            // 💡 [비NCS 격리 차단기] 비NCS/소양 모드에서는 태도/시간 평가 페이지를 통째로 삭제(스킵)합니다.
            if (!window.isCurrentNonNCS) {
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
            }

            fullHtml += `
                <div class="a4-page" style="display:flex; flex-direction:column;">
                    <div class="no-print page-indicator">[3.채점기준] - ${answerPageNum}페이지 (결과반영기준)</div>
                    <div style="flex:1;">
            `;

            // 💡 [비NCS/소양 전용 회로] 이미지와 100% 동일한 3단계(상/중/하) 결과반영기준 표 생성
            if (window.isCurrentNonNCS) {
                fullHtml += `
                        <table class="ans-table" style="margin-top: 10px; border: 2px solid #000; margin-bottom: 30px;">
                            <colgroup>
                                <col style="width: 12%;">
                                <col style="width: 88%;">
                            </colgroup>
                            <tr><th colspan="2" class="ans-cyan-bg" style="font-size: 18px; padding: 12px !important; border-bottom: 2px solid #000;">내부평가 결과반영기준</th></tr>
                            <tr>
                                <th style="background-color: #ffffff;">평가결과<br>반영기준</th>
                                <td style="text-align: left; padding: 15px 20px !important; line-height: 1.7; font-size: 13px; color: #111;">
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 총점은 100점으로 한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 확정된 평가일에 공가자·결시자·재평가 대상 훈련생은 담임 교사가 해당 평가 일자를 재조정하여 공지한 후 재평가를 실행한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 평가 결과에 따른 재평가 : 최종점수가 60점 미만의 경우 보충수업 후 재평가를 실행한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 결시자·성적부진 재평가 대상자의 재평가 점수는 100점 만점 기준으로 하되, 해당 능력 단위 최종점수에 반영할 때는 재평가 점수의 90%를 반영한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 공가자의 재평가 점수는 100점 만점 기준으로 하며, 해당 능력 단위 최종점수를 반영할 때는 재평가 점수의 100%를 반영한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 재평가 1회를 실시하며, 재평가 문제 유형은 1차 평가 유형과 달리하여 실시하되 작업장평가인 경우는 예외로 한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 보충수업 희망 훈련생은 최종점수가 60점 이상이라도 보충수업에 참여할 수 있다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 내부 평가 결과를 훈련과정 교과목 및 평가도구 개발에 활용할 수 있다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px; margin-bottom: 6px;">■ 최종점수에 따라 60점 이상은 능력 단위 이수 여부를 합격(pass), 60점 미만은 불합격(fail)으로 처리한다.</div>
                                    <div style="padding-left: 14px; text-indent: -14px;">■ 최종점수에 따라 성취 수준을 3단계(상, 중, 하)로 구분하고 구분 영역은 다음과 같다.</div>
                                </td>
                            </tr>
                        </table>

                        <table class="ans-table" style="border: 2px solid #000;">
                            <colgroup>
                                <col style="width: 12%;">
                                <col style="width: 72%;">
                                <col style="width: 16%;">
                            </colgroup>
                            <tr>
                                <th class="ans-cyan-bg" style="padding: 12px !important; font-size: 14px;">성취수준</th>
                                <th class="ans-cyan-bg" style="padding: 12px !important; font-size: 14px;">수 행 정 도</th>
                                <th class="ans-cyan-bg" style="padding: 12px !important; font-size: 14px;">최종점수</th>
                            </tr>
                            <tr>
                                <th style="padding: 18px !important; font-size: 15px;">상</th>
                                <td style="text-align:left; padding: 18px 20px !important; line-height: 1.6; font-size: 13px;">해당 분야의 이론 및 지식을 자유롭게 활용하고, 일반적인 숙련으로 다양한 과업을 수행하고, 타인에게 해당 분야의 지식 및 노하우를 전달할 수 있다.</td>
                                <th style="padding: 18px !important; font-size: 15px;">80점 이상</th>
                            </tr>
                            <tr>
                                <th style="padding: 18px !important; font-size: 15px;">중</th>
                                <td style="text-align:left; padding: 18px 20px !important; line-height: 1.6; font-size: 13px;">일반적인 권한 내에서 해당 분야의 이론 및 지식을 제한적으로 사용하여 복잡하고 다양한 과업을 수행할 수 있다.</td>
                                <th style="padding: 18px !important; font-size: 15px;">60점~79점</th>
                            </tr>
                            <tr>
                                <th style="padding: 18px !important; font-size: 15px;">하</th>
                                <td style="text-align:left; padding: 18px 20px !important; line-height: 1.6; font-size: 13px;">기초적인 일반지식을 사용하여 단순하고 반복적인 과업을 수행할 수 있다.</td>
                                <th style="padding: 18px !important; font-size: 15px;">59점 이하</th>
                            </tr>
                            <tr>
                                <th colspan="3" style="padding: 12px !important; border-top: 2px solid #000; font-weight: bold; font-size: 14px;">평가자는 학습자의 달성 정도를 성취 수준에 표시한다.</th>
                            </tr>
                        </table>
                `;
            } else {
                // 💡 [기존 NCS 순정 로직 보존]
                fullHtml += `
                        <table class="ans-table" style="margin-top: 10px; border: 1px solid #000; margin-bottom: 15px;">
                            <colgroup>
                                <col style="width: 14%;">
                                <col style="width: 86%;">
                            </colgroup>
                            <tr><th colspan="2" class="ans-cyan-bg" style="font-size: 18px; padding: 10px !important; border-bottom: 1px solid #000;">내부평가 결과반영기준</th></tr>
                            <tr>
                                <th>평가결과<br>반영기준</th>
                                <td class="ans-rubric-text" style="padding: 8px 15px !important; line-height: 1.4; font-size: 12px;">
                                    <ul style="list-style-type: square; padding-left: 15px; margin: 0;">
                                        <li style="margin-bottom: 3px;">총점은 100점으로 한다.</li>
                                        <li style="margin-bottom: 3px;">산업현장에서 요구하는 수행기준/수준에 따라 출제난이도를 상, 중, 하로 정한다.</li>
                                        <li style="margin-bottom: 3px;">확정된 평가일에 공가자·결시자·재평가 대상 훈련생은 담임 교사가 해당 평가 일자를 재조정하여 공지한 후 재평가를 실행한다.</li>
                                        <li style="margin-bottom: 3px;">평가 결과에 따른 재평가 : 최종점수가 60점 미만의 경우 보충수업 후 재평가를 실행한다.</li>
                                        <li style="margin-bottom: 3px;">결시자·성적부진 재평가 대상자의 재평가 점수는 100점 만점 기준으로 하되,<br>해당 능력 단위 최종점수에 반영할 때는 재평가 점수의 90%를 반영한다.</li>
                                        <li style="margin-bottom: 3px;">공가자의 재평가 점수는 100점 만점 기준으로 하며,<br>해당 능력 단위 최종점수를 반영할 때는 재평가 점수의 100%를 반영한다.</li>
                                        <li style="margin-bottom: 3px;">재평가 1회를 실시하며, 재평가 문제 유형은 1차 평가 유형과 달리하여 실시하되<br>작업장평가인 경우는 예외로 한다.</li>
                                        <li style="margin-bottom: 3px;">보충수업 희망 훈련생은 최종점수가 60점 이상이라도 보충수업에 참여할 수 있다.</li>
                                        <li style="margin-bottom: 3px;">평가 방법은 승인된 평가 방법으로 시행하며, NCS 해당 능력 단위 및<br>능력 단위요소와 수행 준거를 분석하여 본 기관에 맞는 평가도구를 선정한다.</li>
                                        <li style="margin-bottom: 3px;">내부 평가 결과를 훈련과정 교과목(능력 단위) 및 평가도구 개발에 활용할 수 있다.</li>
                                        <li style="margin-bottom: 3px;">최종점수에 따라 60점 이상은 능력 단위 이수 여부를 합격(pass), 60점 미만은 불합격(fail)으로 처리한다.</li>
                                        <li style="margin-bottom: 0;">최종점수에 따라 성취 수준을 5단계로 구분하고 구분 영역은 다음과 같다.</li>
                                    </ul>
                                </td>
                            </tr>
                        </table>
                        <table class="ans-table" style="border: 1px solid #000;">
                            <colgroup>
                                <col style="width: 14%;">
                                <col style="width: 72%;">
                                <col style="width: 14%;">
                            </colgroup>
                            <tr><th class="ans-cyan-bg" style="padding: 8px !important;">성취수준</th><th class="ans-cyan-bg" style="padding: 8px !important;">수 행 정 도</th><th class="ans-cyan-bg" style="padding: 8px !important;">최종점수</th></tr>
                            <tr><th style="font-weight:normal; padding: 6px !important;">5단계</th><td style="text-align:left; padding:8px 12px; line-height:1.4;">해당 지식과 기술을 확실하게 습득하여 직무수행에 필요한 기술적 사고력과 문제 해결력을 토대로 주도적으로 완벽한 작업을 수행할 수 있다.</td><th style="font-weight:normal; padding: 6px !important;">90점 이상</th></tr>
                            <tr><th style="font-weight:normal; padding: 6px !important;">4단계</th><td style="text-align:left; padding:8px 12px; line-height:1.4;">해당 지식과 기술을 습득하여 직무수행에 필요한 기술적 사고력과 문제 해결력을 토대로 작업을 수행할 수 있다.</td><th style="font-weight:normal; padding: 6px !important;">80점~89점</th></tr>
                            <tr><th style="font-weight:normal; padding: 6px !important;">3단계</th><td style="text-align:left; padding:8px 12px; line-height:1.4;">해당 지식과 기술을 대부분 습득하여 직무수행에 필요한 지식과 기술을 가지고 대부분 작업을 수행할 수 있다.</td><th style="font-weight:normal; padding: 6px !important;">70점~79점</th></tr>
                            <tr><th style="font-weight:normal; padding: 6px !important;">2단계</th><td style="text-align:left; padding:8px 12px; line-height:1.4;">해당 지식과 기술을 부분적으로 습득하여 직무수행에 필요한 지식과 기술을 가지고 타인과 공동으로 작업을 수행할 수 있다.</td><th style="font-weight:normal; padding: 6px !important;">60점~69점</th></tr>
                            <tr><th style="font-weight:normal; padding: 6px !important;">1단계</th><td style="text-align:left; padding:8px 12px; line-height:1.4;">해당 지식과 기술을 습득하는데 부족함이 있어 타인의 도움을 받아야만 작업을 수행할 수 있다.</td><th style="font-weight:normal; padding: 6px !important;">59점 이하</th></tr>
                            <tr><th colspan="3" style="padding:8px; border-top: 1px solid #000; font-weight:bold;">평가자는 학습자의 달성 정도를 성취 수준에 표시한다.</th></tr>
                        </table>
                `;
            }

            fullHtml += `
                    </div>
                    <div class="cover-bottom"><div class="cover-page-num">- ${answerPageNum++} -</div></div>
                </div>
            `;

            document.getElementById('page3').innerHTML = fullHtml;
            if (typeof window.scheduleEvalMobileDocFit === 'function') window.scheduleEvalMobileDocFit(200);
        }

        async function saveModelAnswers() {
            if (!currentDbKey) return await appAlert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");

            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
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

                if (!hasChanges) return await appAlert("⚠️ 저장할 내용이 없습니다.");

                savedData.items = savedItems;
                await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).set(savedData);
                
                await appAlert("✅ 3.채점기준(모범답안) 및 커스텀 폼이 DB에 완벽히 융합 저장되었습니다!\n(공용 클라우드 올리기 시 100% 동기화됩니다.)");
            } catch (e) {
                await appAlert("❌ 모범답안 융합 저장 실패: " + e.message);
            }
        }

        // 📍 3. 채점기준(모범답안) 탭 전용: 셀 클릭 시 빨간색 텍스트 수정(에디터) 모드 발동
        window.lastEditedCells = {};

        window.resetAnsTable = async function(idx) {
            if (!await appConfirm("이 표의 모범답안 작성 내용을 모두 삭제하고, 2.평가지의 원본 형태로 초기화하시겠습니까?")) return;
            try {
                if (currentDbKey) {
                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}/ansHtml`).remove();
                    await appAlert("✅ 초기화되었습니다.");
                    buildAnswerDocs();
                }
            } catch(e) { await appAlert("❌ 초기화 실패: " + e.message); }
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

                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}/items/${idx}`).update(updates);
                    await appAlert("✅ 해당 표의 모범답안 및 커스텀 폼이 안전하게 융합 저장되었습니다.");
                }
            } catch(e) { await appAlert("❌ 저장 실패: " + e.message); }
        };

        window.undoAnsCell = async function(idx) {
            let cell = window.lastEditedCells[idx];
            if (cell) {
                cell.innerHTML = "";
            } else {
                await appAlert("⚠️ 방금 수정한 셀의 기록이 없습니다.\n(셀을 한 번 클릭했다가 빠져나와야 인식됩니다.)");
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
            window.isManualCriteriaSize = false; // 💡 [신규 배선] 화면 새로고침 시 수동 조절 모드 해제

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

            // 💡 진입 시 해당 반의 전체 학생 최종점수를 DB에서 미리 메모리에 적재
            try {
                const snap = await classDbRef(`evalScores/본평가/${currentDbKey}`).once('value');
                window.studentScoresData = snap.val() || {};
                window.studentScoresDataSourceKey = currentDbKey;
            } catch(e) {
                window.studentScoresData = {};
                window.studentScoresDataSourceKey = currentDbKey;
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

            // 💡 [신규 배선] NCS와 비NCS/소양교과의 기본 멘트를 완벽하게 분리 출력
            let criteriaHtml = "";
            if (window.isCurrentNonNCS) {
                // 💡 [비NCS/소양교과] 선생님이 지정하신 단일 멘트 출력 (교과목명 자동 매핑)
                criteriaHtml = `
                    <div style="margin-bottom: 3px;">1. ${subject} 학습을 통해 관련 지식을 이해하고 기술을 습득하여 업무를 수행할 수 있다.</div>
                `;
            } else {
                // 💡 [NCS교과] 기존 3줄 멘트 100% 보존
                criteriaHtml = `
                    <div style="margin-bottom: 3px;">1. ${catText}에서 ${subText}에 대한 측정을 하여 점검 및 진단할 수 있다.</div>
                    <div style="margin-bottom: 3px;">2. ${catText}에서 ${subText}에 대한 수리·교환·검사할 수 있다.</div>
                    <div style="margin-bottom: 3px;">3. 작업공정별 장비 및 공구 선택과 안전작업절차를 수행할 수 있다.</div>
                `;
            }

            let savedItems = [];
            let savedCriteriaSize = "font-size: 13px;";
            let savedCriteriaLineHeight = "line-height: 1.4;";
            try {
                const snap = await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).once('value');
                const savedData = snap.val();
                if (savedData && savedData.items) savedItems = savedData.items;
                
                if (savedData && savedData.customCriteria) {
                    criteriaHtml = savedData.customCriteria;
                    if (savedData.customCriteriaSize) {
                        savedCriteriaSize = `font-size: ${savedData.customCriteriaSize};`;
                        window.isManualCriteriaSize = true; // 💡 저장된 수동 사이즈가 있으면 자동 핏(Auto-Fit) 엔진 영구 정지
                    }
                    if (savedData.customCriteriaLineHeight) savedCriteriaLineHeight = `line-height: ${savedData.customCriteriaLineHeight};`;
                }
            } catch (e) { console.warn("DB 로드 에러:", e); }

            window.currentEvalItems = [];
            window.activeFeedbacks = {}; 

            // 💡 [통합 입력 모드 DOM 추출기 엔진 이식]
            let globalQuestionText = "[]";
            if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                let globalItems = document.querySelectorAll('#global_q_list .q-item');
                let qArr = [];
                globalItems.forEach(qItem => {
                    qArr.push(collectNonNcsQItemData(qItem));
                });
                globalQuestionText = JSON.stringify(qArr);
            }

            document.querySelectorAll('#evalItemTbody tr.eval-main-row').forEach((tr, idx) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                const typeGroup = tr.querySelector('.toggle-group.type-selector');
                const type = typeGroup ? typeGroup.getAttribute('data-value') : (window.isCurrentNonNCS ? "기타(선다형)" : "평가자 체크"); 
                
                // 💡 [수리 완료] OMR 감점 시 0점 표기 버그 해결을 위한 통합 점수 추출기 장착
                let score = 0;
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (idx === 0) {
                        document.querySelectorAll('#global_q_list .non-ncs-score').forEach(inp => score += Number(inp.value) || 0);
                        if (score === 0 && typeof savedItems !== 'undefined' && savedItems[idx]) score = savedItems[idx].score || 0;
                    }
                } else {
                    score = Number(tr.querySelectorAll('input[type="number"]')[0]?.value || 0);
                }

                const diff = tr.querySelectorAll('select')[0]?.value || "";
                
                let coreTaskText = name;
                let questionText = ""; 
                
                // 💡 [신규 배선] 통합 모드일 땐 글로벌 데이터를 최우선 장착, 아닐 땐 기존 데이터 백업본 로드
                if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
                    if (idx === 0) questionText = globalQuestionText;
                    else questionText = "[]";
                } else {
                    questionText = savedItems[idx]?.question || ""; 
                    const qRow = tr.nextElementSibling;
                    if (qRow && qRow.classList.contains('eval-question-row')) {
                        coreTaskText = qRow.querySelector('.eval-core-task-input')?.value || name;
                        
                        if (window.isCurrentNonNCS) {
                            const nonNcsItems = qRow.querySelectorAll('.q-item');
                            if (nonNcsItems.length > 0) {
                                let qArr = [];
                                nonNcsItems.forEach(qItem => {
                                    qArr.push(collectNonNcsQItemData(qItem));
                                });
                                questionText = JSON.stringify(qArr);
                            }
                        }
                    }
                }
                
                let customHtml = savedItems[idx]?.customHtml || "";
                let rowNames = type === '훈련생작성' ? [] : extractTeacherRows(customHtml);
                let tHeaders = type === '훈련생작성' ? window.extractTraineeHeaders(customHtml) : [];
                
                window.currentEvalItems.push({ idx: idx, name, score, type, coreTask: coreTaskText, question: questionText, diff, category: 'item', rowNames: rowNames, tHeaders: tHeaders });
            });

            if (!window.isCurrentNonNCS) {
                const attitudeNames = ["작업안전", "작업방법", "작업태도", "정리정돈"];
                attitudeNames.forEach((aName, aIdx) => {
                    window.currentEvalItems.push({ idx: 'A'+aIdx, name: aName, score: 5, type: '평가자 체크', coreTask: aName, diff: '하', category: 'attitude' });
                });
            }

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
                <div class="no-print teacher-score-dashboard" style="width: 280px; flex-shrink: 0; background: white; padding: 15px; border-radius: 8px; border: 2px solid #3498db; box-shadow: 0 5px 15px rgba(0,0,0,0.1); position: sticky; top: 20px; height: max-content;">
                    ${smallModeSwitchHtml}
                    <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:15px; line-height:1.4; display:flex; justify-content:space-between; align-items:center;">
                        <div>📊 교사용 채점 대시보드<br><span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(※ 우측 평가지 자동 연동)</span></div>
                        <div style="display:flex; gap:4px;">
                            <button id="btn_jongwook_mode" style="background:#34495e; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" onclick="toggleJongWookMode()">👨‍🏫 종욱쌤 모드 OFF</button>
                            <button style="background:#e74c3c; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" onclick="resetAllScores()">🔄 초기화</button>
                        </div>
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
            const evalModePrefix = currentEvalMode !== '본평가' ? `(${currentEvalMode}) ` : "";
            
            let scoreRowsHtml = "";
            let itemElements = window.currentEvalItems.filter(i => i.category === 'item');
            
            let activeBtn = document.querySelector('.unit-btn.active');
            let currentCourseType = "비NCS 전공교과";
            if (activeBtn) {
                let typeSpan = activeBtn.querySelector('.unit-subject-label span');
                if (typeSpan) currentCourseType = typeSpan.innerText.replace(/[\[\]]/g, '');
            }

            // 💡 [학생 명단 추출 및 학생 네비게이션 렌더링 복원] (절대 지워지면 안 되는 순정 로직 복구)
            let studentSet = new Set();
            if (globalAttendanceData && typeof globalAttendanceData === 'object') {
                Object.values(globalAttendanceData).forEach(dayData => {
                    if (dayData && typeof dayData === 'object') {
                        Object.keys(dayData).forEach(key => {
                            if (key !== '_metadata' && !globalDeletedLogs[key]) {
                                studentSet.add(key);
                            }
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
                let stuScore = "-점";
                let isSpecialStatus = false;
                
                if (targetDate && globalDropoutData[stu] && targetDate >= globalDropoutData[stu]) {
                    stuScore = "중도탈락";
                    isSpecialStatus = true;
                } else if (targetDate && globalEarlyCompletionData[stu] && targetDate >= globalEarlyCompletionData[stu]) {
                    stuScore = "조기수료";
                    isSpecialStatus = true;
                } else {
                    stuScore = (stuScoreObj.totalScore !== undefined && stuScoreObj.totalScore !== "-") ? stuScoreObj.totalScore + "점" : "-점";
                }
                
                let scoreColor = isSpecialStatus ? "#8e44ad" : "#e74c3c";
                let modeBadge = "";
                if (!isSpecialStatus) {
                    if (stuScoreObj.savedMode === '추가평가') {
                        scoreColor = "#8e44ad"; 
                        modeBadge = `<span style="font-size:9px; color:#8e44ad; margin-left:2px;">(추가)</span>`;
                    } else if (stuScoreObj.savedMode === '재평가') {
                        scoreColor = "#d35400"; 
                        modeBadge = `<span style="font-size:9px; color:#d35400; margin-left:2px;">(재)</span>`;
                    } else if (stuScoreObj.savedMode === '본평가') {
                        scoreColor = "#2980b9"; 
                        modeBadge = `<span style="font-size:9px; color:#2980b9; margin-left:2px;">(본)</span>`;
                    }
                }

                return `
                    <div class="page4-student-item" style="display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: max-content; flex-shrink: 0;">
                        <button class="student-select-btn" style="padding: 6px 15px; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; white-space: nowrap; transition: 0.2s; border: 1px solid #ccc; ${activeStyle}" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" onclick="selectStudent('${stu}', this)">${stu}</button>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 11px; font-weight: bold; color: ${statusColor}; letter-spacing: -0.5px;">${attStatus}</span>
                            <span style="font-size: 10px; color: #ccc;">|</span>
                            <span id="stu_score_badge_${stu}" style="font-size: 11px; font-weight: bold; color: ${scoreColor}; letter-spacing: -0.5px;">${stuScore}${modeBadge}</span>
                        </div>
                    </div>
                `;
            }).join('');

            let defaultMin = 97, defaultMax = 100, defaultMax100 = 3;
            if (window.studentScoresData && window.studentScoresData._gradingSettings) {
                defaultMin = window.studentScoresData._gradingSettings.min || 97;
                defaultMax = window.studentScoresData._gradingSettings.max || 100;
                defaultMax100 = window.studentScoresData._gradingSettings.max100 || 3;
            }

            let saveBtnHtml = currentEvalMode === '본평가' 
                ? `<button class="btn-save-settings" style="background:#e74c3c; border-color:#c0392b; padding: 6px 10px; font-size: 11px; margin-right: 4px;" onclick="deleteAllFinalResults()">🗑️ 전체 초기화</button><button class="btn-save-settings" style="background:#2980b9; border-color:#2980b9; padding: 6px 10px; font-size: 11px;" onclick="saveAllFinalResults()">💾 본평가 전체저장</button>`
                : `<button class="btn-save-settings" style="background:#e67e22; border-color:#d35400; padding: 6px 10px; font-size: 11px;" onclick="saveIndividualFinalResult()">💾 ${currentEvalMode} 개별저장</button>`;

            let studentTopBarHtml = `
                <div class="no-print page4-student-top-bar" style="position: sticky; top: 10px; z-index: 105; width: 100%; margin-bottom: 15px; background: white; padding: 10px 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid #2ecc71; flex-shrink: 0; display: flex; align-items: center; box-sizing: border-box; justify-content: space-between;">
                    <div class="page4-student-list-row" style="display: flex; align-items: center; flex: 1; min-width: 0; overflow: hidden;">
                        <div class="page4-student-list-label" style="font-weight: bold; color: #27ae60; font-size: 13px; margin-right: 15px; white-space: nowrap; line-height: 1.3; flex-shrink: 0;">
                            <span class="page4-student-list-title">👥 훈련생 명단</span>
                            <span class="page4-student-list-date">(평가일: ${targetDate || '미정'})</span>
                        </div>
                        <div class="page4-student-scroll" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; flex: 1; min-width: 0;">
                            ${studentButtonsHtml}
                        </div>
                    </div>
                    <div class="page4-student-controls" style="margin-left: 15px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; background: #f8f9fa; padding: 5px 10px; border-radius: 6px; border: 1px solid #e1e4e8;">
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

            // 💡 [렌더링 코어 교체] 비NCS/소양 전용 회로 작동
            let html = `
            <div style="display: flex; flex-direction: column; width: 100%; align-items: center;">
                ${studentTopBarHtml}
                <div class="page4-main-row" style="display: flex; justify-content: center; align-items: flex-start; gap: 20px; width: 100%;">
                    ${controlPanelHtml}
                    <div class="a4-page" style="color: #000; margin: 0; flex-shrink: 0;">
                    <div class="no-print page-indicator">[4.최종결과표]</div>
            `;

            // 💡 [비NCS/소양 전용 회로] 이미지와 100% 동일한 하단 통합 테이블 생성
            if (window.isCurrentNonNCS) {
                // 💡 [수정] 교과 종류 불문하고 무조건 '지식평가'로 강제 고정
                let evalAreaName = '지식평가';
                
                // 💡 [수정] 능력단위 칸에 출력될 '평가항목' 리스트 추출 
                let itemNamesList = itemElements.map(item => item.name).join(', ');
                let displayUnitName = itemNamesList || (unitName || subject);

                // 💡 [신규 엔진] 표 전체 고정 높이 할당 및 항목 수에 따른 N등분 분할
                let targetTotalHeight = 390; // 💡 PDF 인쇄 여백 안에 안정적으로 들어오도록 비NCS/소양 하단 점수표 높이 압축
                let rowH = Math.max(22, Math.floor(targetTotalHeight / itemElements.length)); // 항목 개수만큼 나누기 (최소 높이 22px 방어)
                let finalInfoRowH = 28; // 💡 최종점수 행 기준 높이
                let finalDateRowH = finalInfoRowH / 2; // 💡 훈련생명/담당교사/검증자 2행 합계가 최종점수 행과 같도록 압축
                let finalSealSize = 20; // 💡 압축된 담당교사/검증자 칸 안에서 도장이 삐져나오지 않는 크기

                itemElements.forEach((item, i) => {
                    let hiddenScoreId = `<span id="print_score_${item.idx}" style="display:none;"></span>`;
                    if (i === 0) {
                        scoreRowsHtml += `
                        <tr style="height: ${rowH}px;">
                            <th rowspan="${itemElements.length}" class="cyan-th">${evalAreaName}</th>
                            <td class="white-td" style="text-align: left; padding-left: 15px;">${item.name}${hiddenScoreId}</td>
                            <td rowspan="${itemElements.length}" class="white-td">100</td>
                        <td rowspan="${itemElements.length}" class="white-td" style="color:#c0392b; font-weight:bold; font-size:14px;">
                            <div id="bottom_total_score_display"></div>
                        </td>
                        <td rowspan="${itemElements.length}" class="white-td">상/중/하</td>
                        </tr>`;
                    } else {
                        scoreRowsHtml += `
                        <tr style="height: ${rowH}px;">
                            <td class="white-td" style="text-align: left; padding-left: 15px;">${item.name}${hiddenScoreId}</td>
                        </tr>`;
                    }
                });

                html += `
                    <div class="result-title">${evalModePrefix}내부평가 최종결과표</div>
                
                <table class="result-table" style="table-layout: fixed;">
                    <colgroup>
                        <col style="width: 12%;"> <!-- 1. 좌측 헤더 -->
                        <col style="width: 10%;"> <!-- 2. 평가일 텍스트 -->
                        <col style="width: 12%;"> <!-- 3. 평가일 데이터 (합산 22%) -->
                        <col style="width: 12%;"> <!-- 4. 💡 중앙 헤더 (총점/이수여부) -> 12%로 확장하여 좌/우 헤더와 대칭 완성 -->
                        <col style="width: 10%;"> <!-- 5. 합격/불합격 텍스트 (합산 22%) -->
                        <col style="width: 12%;">  <!-- 6. 체크박스 공간 넉넉히 확보 -->
                        <col style="width: 12%;"> <!-- 7. 우측 헤더 -->
                        <col style="width: 16%;"> <!-- 8. 💡 우측 데이터 열 축소 (26% -> 20%) -->
                    </colgroup>
                    
                    <tr>
                        <th class="cyan-th">훈련과정</th>
                        <td colspan="5" class="white-td" style="font-weight: bold; letter-spacing: -0.5px;">${courseName}</td>
                        <th class="cyan-th">훈련기간</th>
                        <td class="white-td">${period}</td>
                    </tr>
                    <tr>
                        <th class="cyan-th">교 과 목</th>
                        <td colspan="5" class="white-td">${subject}</td>
                        <th class="cyan-th">평가방법</th>
                        <td class="white-td">${evalMethod}</td>
                    </tr>
                    <tr>
                        <th class="cyan-th">능력단위</th>
                        <td colspan="5" class="white-td" style="line-height: 1.4;">${displayUnitName}</td>
                        <th class="cyan-th">성취수준</th>
                        <td class="white-td" style="text-align:center; padding-right:10px;">
                            <span id="final_achievement_level" style="font-weight: bold; color: #c0392b; font-size: 15px;"></span>
                            <span style="float:right;">단계</span>
                        </td>
                    </tr>
                    <tr style="height: ${finalInfoRowH}px;">
                        <th class="cyan-th">평가시간</th>
                        <td colspan="2" class="white-td">${evalTestTime} 분</td>
                        <th class="cyan-th">총 점</th>
                        <td colspan="2" class="white-td">100점</td>
                        <th class="cyan-th">최종점수</th>
                        <td class="white-td" style="padding:0;">
                            <input type="text" id="final_total_score_input" style="width:100%; border:none; text-align:center; font-weight:bold; font-size:15px; color:#c0392b; background:transparent; outline:none; margin:0;" placeholder="자동/입력" onchange="reverseCalculateScore(this.value)">
                        </td>
                    </tr>
                    
                    <tr style="height: ${finalDateRowH}px;">
                        <th rowspan="6" class="cyan-th">평 가 일</th>
                        <th rowspan="${rs}" class="white-td">${dateRows[0].label}</th>
                        <td rowspan="${rs}" class="white-td">${dateRows[0].value}</td>
                        <th rowspan="6" class="cyan-th">이수<br>여부</th>
                        <td rowspan="3" class="white-td" style="font-weight: bold; color: #000; text-align:center;">합격<br>(pass)</td>
                        <td rowspan="3" class="white-td" id="pass_check_mark" style="text-align:center;"></td>
                        <th rowspan="2" class="cyan-th">훈련생명</th>
                        <td rowspan="2" class="white-td" id="final_student_name_cell"></td>
                    </tr>
                    <tr style="height: ${finalDateRowH}px;"></tr>
                    <tr style="height: ${finalDateRowH}px;">
                        ${rs === 2 ? `<th rowspan="2" class="white-td">${dateRows[1].label}</th><td rowspan="2" class="white-td">${dateRows[1].value}</td>` : ''}
                        <th rowspan="2" class="cyan-th">담당교사</th>
                        <td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">
                            <b>${teacher}</b> <span style="position:relative; display:inline-block; margin-left:4px; color:${globalTeacherSeal ? 'rgba(231,76,60,0.6)' : '#e74c3c'}; font-size:11px; font-weight:bold; line-height:1;">(인)${globalTeacherSeal ? `<img src="${globalTeacherSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:${finalSealSize}px; height:${finalSealSize}px; object-fit:contain; opacity:0.95; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span>
                        </td>
                    </tr>
                    <tr style="height: ${finalDateRowH}px;">
                        ${rs === 3 ? `<th rowspan="3" class="white-td">${dateRows[1].label}</th><td rowspan="3" class="white-td">${dateRows[1].value}</td>` : ''}
                        <td rowspan="3" class="white-td" style="font-weight: bold; color: #000; text-align:center;">불합격<br>(fail)</td>
                        <td rowspan="3" class="white-td" id="fail_check_mark" style="text-align:center;"></td>
                    </tr>
                    <tr style="height: ${finalDateRowH}px;">
                        ${rs === 2 ? `<th rowspan="2" class="white-td">${dateRows[2].label}</th><td rowspan="2" class="white-td">${dateRows[2].value}</td>` : ''}
                        <th rowspan="2" class="cyan-th">검증자</th>
                        <td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">
                            <b>하정현</b> <span style="position:relative; display:inline-block; margin-left:4px; color:${globalVerifierSeal ? 'rgba(231,76,60,0.6)' : '#e74c3c'}; font-size:11px; font-weight:bold; line-height:1;">(인)${globalVerifierSeal ? `<img src="${globalVerifierSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:${finalSealSize}px; height:${finalSealSize}px; object-fit:contain; opacity:0.95; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span>
                        </td>
                    </tr>
                    <tr style="height: ${finalDateRowH}px;"></tr>
                </table>

                <style>
                    /* 💡 [신규 배선] 내부에 복사/붙여넣기 된 모든 텍스트의 고정 크기를 강제로 무력화하고 부모 박스의 명령에 100% 복종시킴 */
                    #custom_criteria_input * {
                        font-size: inherit !important;
                        line-height: inherit !important;
                    }
                </style>
                <div class="result-sub-title" style="font-size: 15px; font-weight: bold; margin-bottom: 5px; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display:flex; align-items:center;">
                        <span style="font-size: 12px; margin-right: 6px;">■</span> 평가기준
                        <span class="no-print" style="font-size: 11px; color: #e74c3c; font-weight: normal; margin-left: 8px;">(※ 클릭하여 텍스트 수정)</span>
                    </div>
                    <div class="no-print" style="display:flex; gap:4px; align-items:center;">
                        <button onclick="changeCriteriaTextSize('up')" style="background:#34495e; color:white; border:none; padding:4px 6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" title="글자 크게">A▲</button>
                        <button onclick="changeCriteriaTextSize('down')" style="background:#34495e; color:white; border:none; padding:4px 6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" title="글자 작게">A▼</button>
                        <button onclick="saveCustomCriteria()" style="background:#27ae60; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:0.2s;" onmouseover="this.style.background='#219150'" onmouseout="this.style.background='#27ae60'">💾 저장</button>
                    </div>
                </div>
                
                <div contenteditable="true" id="custom_criteria_input" 
                     onmouseover="this.style.backgroundColor='#fffde7'" onmouseout="this.style.backgroundColor='transparent'" 
                     onfocus="this.style.backgroundColor='#fff'; this.style.boxShadow='inset 0 0 0 2px #f39c12';" onblur="this.style.boxShadow='none';" 
                     oninput="if(typeof window.autoFitCriteriaText === 'function') window.autoFitCriteriaText(this)"
                     style="padding: 5px 10px 5px 20px; margin-bottom: 10px; text-align: left; ${savedCriteriaSize} ${savedCriteriaLineHeight} outline: none; cursor: text; border-radius: 4px; transition: 0.2s; min-height: 40px; max-height: 160px; overflow: hidden; box-sizing: border-box;">
                    ${criteriaHtml}
                </div>

                <div class="result-sub-title" style="font-size: 15px; font-weight: bold; margin-bottom: 10px; text-align: left; display: flex; align-items: center;">
                    <span style="font-size: 12px; margin-right: 6px;">■</span> 평가내용 및 배점
                </div>
                <table class="score-table" style="table-layout: fixed; width: 100%; border-collapse: collapse; border: 2px solid #000; text-align: center; font-size: 13px; margin-bottom:0;">
                    <colgroup>
                        <col style="width: 5%;"> <col style="width: 15%;"> <col style="width: 40%;"> <col style="width: 10%;"> <col style="width: 15%;"> <col style="width: 15%;"> 
                    </colgroup>
                    <tr>
                        <th rowspan="${itemElements.length + 1}" class="white-td" style="writing-mode: vertical-lr; text-orientation: upright; letter-spacing: 15px; font-weight: bold; padding: 10px 0;">평가내용</th>
                        <th class="cyan-th">평가영역</th><th class="cyan-th">평가항목</th><th class="cyan-th">배점</th><th class="cyan-th">득점</th><th class="cyan-th">출제난이도</th>
                    </tr>
                    ${scoreRowsHtml}
                </table>
            </div>
            `;
            } else {
                // 💡 [NCS 순정 로직 보존]
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
                        <th class="cyan-th" style="height: 85px;">평가<br>피드백</th>
                        <td colspan="4" class="white-td" style="padding: 0; vertical-align: middle;">
                            <div style="padding: 2px 15px; height: 85px; box-sizing: border-box; display: flex; align-items: center; width: 100%;">
                                <div id="feedback_zone" style="height: 81px; width: 100%; overflow: hidden; display: flex; flex-direction: column; justify-content: center; text-align: left;">
                                    <div id="feedback_inner_text" contenteditable="true" oninput="if(typeof window.autoFitFeedbackText === 'function') window.autoFitFeedbackText()" style="color:#7f8c8d; font-size: 13px; margin: 0; width: 100%; outline: none; cursor: text;">※ 상단의 컨트롤 패널에서 점수를 기입하거나 [✔ OMR 체크] 버튼을 누르면 피드백이 자동 생성됩니다. (클릭하여 직접 수정 가능)</div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;

                html += `
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
                        <th colspan="2" class="cyan-th">성취수준</th><td colspan="3" class="white-td" style="text-align: center; padding-right:10px;"><span id="final_achievement_level" style="font-weight: bold; color: #c0392b; font-size: 15px;"></span><span style="float:right;">단계</span></td>
                    </tr>
                    <tr>
                        <th colspan="3" class="cyan-th">평가시간</th><td colspan="2" class="white-td">${evalTestTime} 분</td>
                        <th class="cyan-th">총 점</th><td colspan="3" class="white-td">100점</td>
                        <th class="cyan-th">최종점수</th><td colspan="2" class="white-td" style="padding:0;"><input type="text" id="final_total_score_input" style="width:100%; border:none; text-align:center; font-weight:bold; font-size:15px; color:#c0392b; background:transparent; outline:none; margin:0;" placeholder="자동/입력" onchange="reverseCalculateScore(this.value)"></td>
                    </tr>
                    
                    <tr>
                        <th rowspan="6" colspan="3" class="cyan-th">평 가 일</th><td rowspan="${rs}" class="white-td" style="font-weight: bold;">${dateRows[0].label}</td><td rowspan="${rs}" class="white-td">${dateRows[0].value}</td>
                    <th rowspan="6" class="cyan-th">이수<br>여부</th><td rowspan="3" class="white-td" style="font-weight: bold; color: #000;">합격<br>(pass)</td><td rowspan="3" colspan="2" class="white-td" id="pass_check_mark" style="text-align:center;"></td> 
                    <th rowspan="2" class="cyan-th">훈련생명</th><td rowspan="2" colspan="2" class="white-td" id="final_student_name_cell"></td>
                </tr>
                <tr></tr>
                <tr>
                    ${rs===2 ? `<td rowspan="2" class="white-td" style="font-weight: bold;">${dateRows[1].label}</td><td rowspan="2" class="white-td">${dateRows[1].value}</td>` : ''}<th rowspan="2" class="cyan-th">담당교사</th><td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">${teacher}</td>
                    <td rowspan="2" class="white-td" style="text-align: center; vertical-align: middle;"><span style="position:relative; display:inline-block; margin-left:5px;">(인)${globalTeacherSeal ? `<img src="${globalTeacherSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:24px; height:24px; object-fit:contain; opacity:0.85; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td>
                </tr>
                    <tr>
                        ${rs===3 ? `<td rowspan="3" class="white-td" style="font-weight: bold;">${dateRows[1].label}</td><td rowspan="3" class="white-td">${dateRows[1].value}</td>` : ''}<td rowspan="3" class="white-td" style="font-weight: bold; color: #000;">불합격<br>(fail)</td><td rowspan="3" colspan="2" class="white-td" id="fail_check_mark" style="text-align:center;"></td>
                    </tr>
                    <tr>
                        ${rs===2 ? `<td rowspan="2" class="white-td" style="font-weight: bold;">${dateRows[2].label}</td><td rowspan="2" class="white-td">${dateRows[2].value}</td>` : ''}<th rowspan="2" class="cyan-th">검증자</th><td rowspan="2" class="white-td" style="font-weight: bold; text-align: center;">하정현</td>
                        <td rowspan="2" class="white-td" style="text-align: center; vertical-align: middle;"><span style="position:relative; display:inline-block; margin-left:5px;">(인)${globalVerifierSeal ? `<img src="${globalVerifierSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:24px; height:24px; object-fit:contain; opacity:0.85; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span></td>
                    </tr>
                    <tr></tr>
                </table>

                <style>
                    /* 💡 [신규 배선] 내부에 복사/붙여넣기 된 모든 텍스트의 고정 크기를 강제로 무력화하고 부모 박스의 명령에 100% 복종시킴 */
                    #custom_criteria_input * {
                        font-size: inherit !important;
                        line-height: inherit !important;
                    }
                </style>
                <div class="result-sub-title" style="font-size: 15px; font-weight: bold; margin-bottom: 5px; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display:flex; align-items:center;">
                        <span style="font-size: 12px; margin-right: 6px;">■</span> 평가기준
                        <span class="no-print" style="font-size: 11px; color: #e74c3c; font-weight: normal; margin-left: 8px;">(※ 클릭하여 텍스트 수정)</span>
                    </div>
                    <div class="no-print" style="display:flex; gap:4px; align-items:center;">
                        <button onclick="changeCriteriaTextSize('up')" style="background:#34495e; color:white; border:none; padding:4px 6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" title="글자 크게">A▲</button>
                        <button onclick="changeCriteriaTextSize('down')" style="background:#34495e; color:white; border:none; padding:4px 6px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;" title="글자 작게">A▼</button>
                        <button onclick="saveCustomCriteria()" style="background:#27ae60; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:0.2s;" onmouseover="this.style.background='#219150'" onmouseout="this.style.background='#27ae60'">💾 저장</button>
                    </div>
                </div>
                
                <div contenteditable="true" id="custom_criteria_input" 
                     onmouseover="this.style.backgroundColor='#fffde7'" onmouseout="this.style.backgroundColor='transparent'" 
                     onfocus="this.style.backgroundColor='#fff'; this.style.boxShadow='inset 0 0 0 2px #f39c12';" onblur="this.style.boxShadow='none';" 
                     oninput="if(typeof window.autoFitCriteriaText === 'function') window.autoFitCriteriaText(this)"
                     style="padding: 5px 10px 5px 20px; margin-bottom: 10px; text-align: left; ${savedCriteriaSize} ${savedCriteriaLineHeight} outline: none; cursor: text; border-radius: 4px; transition: 0.2s; min-height: 40px; max-height: 160px; overflow: hidden; box-sizing: border-box;">
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
            `;
            }

            // 💡 [신규 엔진] 비NCS/소양 교과 전용 20문항 OMR 감점 추적기
            window.clearNonNcsOMRVisuals = function() {
                document.querySelectorAll('.non-ncs-omr-cell').forEach(cell => {
                    cell.setAttribute('data-wrong', 'false');
                    cell.innerHTML = '';
                    cell.style.backgroundColor = '#fff';
                });
            };

            window.toggleNonNcsOMR = function(qIdx) {
                let cell = document.getElementById(`non_ncs_omr_cell_${qIdx}`);
                if (!cell) return;

                let isWrong = cell.getAttribute('data-wrong') === 'true';
                if (isWrong) {
                    cell.setAttribute('data-wrong', 'false');
                    cell.innerHTML = '';
                    cell.style.backgroundColor = '#fff';
                } else {
                    cell.setAttribute('data-wrong', 'true');
                    cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:18px;">/</span>';
                    cell.style.backgroundColor = '#fdebd0';
                }
                
                // 1. 오답 문항 점수 차감
                let wrongCells = document.querySelectorAll('.non-ncs-omr-cell[data-wrong="true"]');
                let itemScores = {};
                window.currentEvalItems.forEach(item => { itemScores[item.idx] = parseFloat(item.score); });

                wrongCells.forEach(c => {
                    let parentIdx = c.getAttribute('data-parent');
                    let qScore = parseFloat(c.getAttribute('data-score') || 0);
                    if (itemScores[parentIdx] !== undefined) itemScores[parentIdx] -= qScore;
                });

                // 2. 최종 점수 및 피드백 갱신
                window.currentEvalItems.forEach(item => {
                    if (item.category !== 'item') return;
                    let finalItemScore = Math.max(0, itemScores[item.idx]);
                    let inputEl = document.getElementById(`score_input_${item.idx}`);
                    let printTd = document.getElementById(`print_score_${item.idx}`);
                    
                    if (inputEl) inputEl.value = Math.round(finalItemScore * 10) / 10;
                    if (printTd) printTd.innerText = Math.round(finalItemScore * 10) / 10;

                    let myWrongNums = [];
                    wrongCells.forEach(c => {
                        if (c.getAttribute('data-parent') == item.idx) myWrongNums.push(c.getAttribute('data-qnum'));
                    });

                    if (myWrongNums.length > 0) {
                        window.activeFeedbacks[item.idx] = `[${item.name}] 영역에서 ${myWrongNums.join(', ')}번 문항 오답.`;
                    } else {
                        delete window.activeFeedbacks[item.idx];
                    }
                });

                // 전체 합산 렌더링 호출 (상/중/하 자동계산 포함)
                if (typeof window.renderFeedbackZone === 'function') window.renderFeedbackZone();
            };

            html += `
            ${(function() {
                let rightPanelHtml = `
                <style>
                    @media screen and (max-width: 850px) { .eval-right-panel, .eval-left-spacer { display: none !important; } }
                    .non-ncs-omr-cell { cursor:pointer; transition:0.2s; text-align:center; vertical-align:middle; height:35px; border:1px solid #bdc3c7; }
                    .non-ncs-omr-cell:hover { background:#ffeaa7 !important; }
                </style>
                <div class="no-print eval-right-panel" style="width: 280px; flex-shrink: 0; background: white; padding: 15px; border-radius: 8px; border: 2px solid #95a5a6; box-shadow: 0 5px 15px rgba(0,0,0,0.1); position: sticky; top: 20px; height: max-content; max-height: 90vh; overflow-y: auto;">
                `;

                if (window.isCurrentNonNCS) {
                    // 💡 [비NCS/소양 전용] 20문제 OMR 통합 테이블 렌더링
                    let allQ_eval = [];
                    window.currentEvalItems.filter(i => i.category === 'item').forEach(item => {
                        try {
                            let arr = JSON.parse(item.question);
                            if (Array.isArray(arr) && arr.length > 0) {
                                arr.forEach(q => allQ_eval.push({ ...q, parentIdx: item.idx }));
                            } else {
                                // 💡 통합 모드에서 내용이 없는 빈 평가항목들이 유령 문항(0점)을 생성하여 OMR 배열을 오염시키는 것을 완벽 차단
                                if (!window.isIntegratedInputMode) {
                                    allQ_eval.push({ score: item.score || 0, parentIdx: item.idx });
                                }
                            }
                        } catch(e) { 
                            if (!window.isIntegratedInputMode) {
                                allQ_eval.push({ score: item.score || 0, parentIdx: item.idx }); 
                            }
                        }
                    });

                    let omrGridHtml = `<table style="width:100%; border-collapse:collapse; text-align:center; font-size:11px; margin-top:10px; table-layout:fixed;">`;
                    for (let row = 0; row < 4; row++) {
                        omrGridHtml += `<tr style="background:#e3f2fd; color:#2c3e50;">`;
                        for (let col = 1; col <= 5; col++) {
                            let qIdx = row * 5 + col - 1;
                            let q = allQ_eval[qIdx];
                            let qScoreText = (q && q.score !== undefined) ? `<br><span style="color:#c0392b; font-size:9px; font-weight:normal;">(${q.score}점)</span>` : `<br><span style="color:transparent; font-size:9px; font-weight:normal;">(0점)</span>`;
                            omrGridHtml += `<th style="border:1px solid #bdc3c7; padding:4px;">${qIdx + 1}번${qScoreText}</th>`;
                        }
                        omrGridHtml += `</tr><tr>`;
                        for (let col = 1; col <= 5; col++) {
                            let qIdx = row * 5 + col - 1;
                            let q = allQ_eval[qIdx];
                            if (q) {
                                omrGridHtml += `<td id="non_ncs_omr_cell_${qIdx}" class="non-ncs-omr-cell" data-qnum="${qIdx + 1}" data-score="${q.score}" data-parent="${q.parentIdx}" data-wrong="false" onclick="toggleNonNcsOMR('${qIdx}')" style="background:#fff;"></td>`;
                            } else {
                                omrGridHtml += `<td style="border:1px solid #bdc3c7; background:#f2f2f2;"></td>`;
                            }
                        }
                        omrGridHtml += `</tr>`;
                    }
                    omrGridHtml += `</table>`;

                    rightPanelHtml += `
                        <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:14px; line-height:1.4; display:flex; justify-content:space-between; align-items:center;">
                            <div>📝 OMR 답안지 채점기<br><span style="font-size:11px; color:#e74c3c; font-weight:normal;">(틀린 번호를 클릭하면 감점됩니다)</span></div>
                        </h3>
                        <div style="background:#f8f9fa; border:1px solid #bdc3c7; border-radius:4px; padding:6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <div style="font-size:12px; font-weight:bold; color:#2980b9; text-align:center; margin-bottom:5px;">근거자료(답안지) 20문항 대조표</div>
                            ${omrGridHtml}
                            <div style="text-align:right; margin-top:8px;">
                                <button class="btn-custom" style="background:#e74c3c; border-color:#c0392b; font-size:11px; padding:4px 8px;" onclick="clearNonNcsOMRVisuals(); window.currentEvalItems.forEach(i => processAutoScore(i.idx, true));">🔄 OMR 초기화</button>
                            </div>
                        </div>
                    `;

                } else {
                    // 💡 [NCS교과 순정 보존] 기존 NCS 실시간 감점 추적기 렌더링
                    rightPanelHtml += `
                        <h3 style="margin-top:0; color:#2c3e50; border-bottom:1px solid #ecf0f1; padding-bottom:10px; font-size:14px; line-height:1.4; display:flex; justify-content:space-between; align-items:center;">
                            <div>📋 실시간 감점 추적기<br><span style="font-size:11px; color:#7f8c8d; font-weight:normal;">(평가자 체크 전용)</span></div>
                        </h3>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                    `;
                    
                    window.currentEvalItems.filter(i => i.type !== '훈련생작성' && i.category === 'item').forEach(item => {
                        let rowsHtml = "";
                        let N = item.rowNames.length;
                        item.rowNames.forEach((rName, rIdx) => {
                            let shortName = rName.substring(0, 4);
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
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>우수</th><th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">우수</th>
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">보통</th><th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">미흡</th>
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>미흡</th>
                                    </tr>
                                    ${rowsHtml}
                                </table>
                            </div>
                        `;
                    });

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
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>우수</th><th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">우수</th>
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">보통</th><th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">미흡</th>
                                        <th style="border:1px solid #bdc3c7; padding:3px; width:15.6%;">매우<br>미흡</th>
                                    </tr>
                                    ${attRowsHtml}
                                </table>
                            </div>
                        `;
                    }
                    rightPanelHtml += `</div>`;
                }

                rightPanelHtml += `</div>`;
                return rightPanelHtml;
            })()}
            </div> </div> </div>
            <div id="omrModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; justify-content:center; align-items:center;">
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
            if (typeof window.scheduleEvalMobileDocFit === 'function') window.scheduleEvalMobileDocFit(200);

            // 💡 [신규 방어막] 화면 렌더링 직후, DB에서 불러온 텍스트가 많으면 즉시 글자 크기를 압축하여 하단 표 밀림 방어
            setTimeout(() => {
                let criteriaEl = document.getElementById('custom_criteria_input');
                if (criteriaEl && typeof window.autoFitCriteriaText === 'function') {
                    window.autoFitCriteriaText(criteriaEl);
                }
            }, 50);

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

        const teacherJongWookRubrics = [
            ["전체 작업공정에 정확한 장비와 공구 사용을 하라고 지시함"],
            ["장비와 공구 사용 능력이 능숙 할 수 있도록 노력하라고 지시함"],
            ["분해 순서가 정확할 수 있도록 반복연습을 권고함", "분해 결과가 양호할 수 있도록 반복연습을 권고함", "부품을 정리 정돈할 것을 권고함"],
            ["조립 순서가 정확할 수 있도록 반복연습을 권고함", "부품 방향과 조립결과가 양호할 수 있도록 반복연습을 권고함", "부품 손상이 전혀 없을 수 있도록 신중하게 작업할 것을 권고함"],
            ["작업 후 한번더 마무리 확인을 할 것을 권유함"]
        ];

        const attitudeJongWookRubrics = [
            ["작업 복장을 올바르게 입을 것을 권고함", "작업장 안전수칙을 준수할 것을 권고함"],
            ["장비와 공구 선택, 분해순서, 조립순서, 조립 후 검사항목을 숙지할 것을 권고하였으며, 절차대로 평가에 임할 것을 요구함"],
            ["작업별 안전수칙을 정확히 준수하며 작업에 임할 것을 요구함", "평가자의 지시를 정확히 이해하고 작업에 임할 수 있게 하라고 지시함"],
            ["작업 후 사용한 장비·공구 및 작업공간 정리 정돈을 하라고 권유함"]
        ];

        window.isJongWookMode = false;
        window.toggleJongWookMode = function() {
            window.isJongWookMode = !window.isJongWookMode;
            const btn = document.getElementById('btn_jongwook_mode');
            if (btn) {
                if (window.isJongWookMode) {
                    btn.style.background = '#8e44ad';
                    btn.innerText = '👨‍🏫 종욱쌤 모드 ON';
                } else {
                    btn.style.background = '#34495e';
                    btn.innerText = '👨‍🏫 종욱쌤 모드 OFF';
                }
            }
            window.currentEvalItems.forEach(item => {
                const inputEl = document.getElementById(`score_input_${item.idx}`);
                if (inputEl && inputEl.value !== "") {
                    processAutoScore(item.idx, true);
                }
            });
        };

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
                let numH = item.tHeaders.length;
                let sArray = new Array(numH).fill(0);
                let panjungIdx = item.tHeaders.findIndex(h => h.replace(/\s/g, '').includes('판정'));

                if (panjungIdx !== -1) {
                    let baseScore = Math.ceil(item.score / numH);
                    if (item.score - (baseScore * (numH - 1)) <= 0) baseScore = Math.floor(item.score / numH);
                    let sum = 0;
                    for (let i = 0; i < numH; i++) {
                        if (i !== panjungIdx) { sArray[i] = baseScore; sum += baseScore; }
                    }
                    sArray[panjungIdx] = item.score - sum;
                } else {
                    let sSum = 0;
                    for (let i = 0; i < numH - 1; i++) {
                        let sPart = Math.round((item.score / numH) * 10) / 10;
                        sArray[i] = sPart;
                        sSum += sPart;
                    }
                    sArray[numH - 1] = Math.round((item.score - sSum) * 10) / 10;
                }
                
                let cleanH = (txt) => txt.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d]+[\.\s]*/, '').trim();
                let p = item.tHeaders.map((h, i) => ({ n: cleanH(h), s: sArray[i] }));
                
                let maxCombos = Math.pow(2, numH); // 💡 스캔된 항목 수량에 따른 확률 계산기(2^N)
                for(let i=0; i<maxCombos; i++){
                    let sum = 0; let wrong = [];
                    for(let j=0; j<numH; j++){ 
                        if ((i>>j)&1) sum += p[j].s; 
                        else wrong.push(p[j].n); 
                    }
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

                let options = window.isJongWookMode ? attitudeJongWookRubrics[parseInt(String(itemKey).replace('A',''))] : attitudeRubrics[parseInt(String(itemKey).replace('A',''))][levelIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                
                // 💡 1순위: 평가방식이 훈련생(훈련생작성)인 항목만 정밀 추적
                let realItems = window.currentEvalItems.filter(i => i.category === 'item' && i.type === '훈련생작성');
                // 💡 2순위 방어막: 평가지에 훈련생 작성 항목이 아예 없는 경우, 전체 항목으로 전환하여 에러 방지
                if (realItems.length === 0) {
                    realItems = window.currentEvalItems.filter(i => i.category === 'item');
                }
                
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (levelIdx > 0) window.activeFeedbacks[itemKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[itemKey];
            } else {
                let N = item.rowNames.length;
                let rS = item.score / N;
                let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                
                // 💡 [신규 탑재] 글자를 읽어 기존 항목 여부를 100% 정밀 판독하는 스캐너
                const getOrigIdx = (name) => {
                    if (!name) return -1;
                    if (name.includes("선택")) return 0;
                    if (name.includes("숙련도")) return 1;
                    if (name.includes("분해")) return 2;
                    if (name.includes("조립")) return 3;
                    if (name.includes("마무리")) return 4;
                    return -1; // 💡 5개 단어가 없으면 신규 커스텀 항목(-1)으로 확정
                };

                let combos = [];
                function findCombos(row, currentSum, currentPath) {
                    if (row === N) {
                        if (Math.round(currentSum*10)/10 === val) combos.push([...currentPath]);
                        return;
                    }
                    let origIdx = getOrigIdx(item.rowNames[row]);
                    if (origIdx === -1) {
                        currentPath.push(0); // 💡 신규 항목은 무조건 만점(0번 인덱스) 강제 투입
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
                
                let validSumsSet = new Set();
                function findValidSums(row, currentSum) {
                    if (row === N) { validSumsSet.add(Math.round(currentSum * 10) / 10); return; }
                    let origIdx = getOrigIdx(item.rowNames[row]);
                    if (origIdx === -1) { findValidSums(row + 1, currentSum + v[0]); } 
                    else { for (let i = 0; i < 5; i++) findValidSums(row + 1, currentSum + v[i]); }
                }
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
                
                // 💡 [초정밀 락] 학생을 다시 불러왔을 때 랜덤이 아닌, 기존에 저장된 틀린 항목 배열을 100% 그대로 강제 투입
                let selected;
                let currentStu = document.getElementById('final_student_name_cell')?.innerText;
                let savedData = window.studentScoresData[currentStu];
                let canUseSaved = false;

                if (isAutoLoad && savedData && savedData.miniOmrState && savedData.miniOmrState[itemKey] && savedData.miniOmrState[itemKey].length === N) {
                    let savedCombo = savedData.miniOmrState[itemKey].map(val => val === -1 ? 0 : val);
                    let savedSum = 0;
                    savedCombo.forEach(colIdx => { savedSum += v[colIdx]; });
                    
                    // 💡 현재 점수(val)와 저장된 체크 배열의 점수 합산이 일치할 때만 복원 (점수 변경 시 새 랜덤 배열 가동)
                    if (Math.round(savedSum * 10) / 10 === val) {
                        selected = savedCombo;
                        canUseSaved = true;
                    }
                }

                if (!canUseSaved) {
                    selected = bestCombos[Math.floor(Math.random() * bestCombos.length)];
                }

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
                    let origIdx = getOrigIdx(item.rowNames[rowIdx]);
                    if(levelIdx > 0 && origIdx !== -1) { // 💡 기존 항목일 때만 피드백 추출
                        let options = window.isJongWookMode ? teacherJongWookRubrics[origIdx] : teacherRubrics[origIdx][levelIdx].split('|');
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

        window.rejectScore = async function(inputEl, printTd, key, arr) {
            await appAlert(`⚠️ 허용되지 않는 점수입니다.\n▶ 가능한 점수: ${arr.join(', ')}`);
            inputEl.value = ""; printTd.innerText = ""; delete window.activeFeedbacks[key]; renderFeedbackZone();
        }

        let currentOMRKey = "";
        window.openOMR = function(itemKey) {
            currentOMRKey = itemKey;
            const item = window.currentEvalItems.find(i => i.idx == itemKey);
            document.getElementById('omrTitle').innerText = `[${item.name}] OMR 평가자 체크`;
            
            let html = `<style>.omr-td { cursor:pointer; padding:10px; border:1px solid #bdc3c7; transition:0.2s; } .omr-td:hover { background:#ecf0f1; } .omr-selected { background:#ffeaa7 !important; border:2px solid #e67e22 !important; font-weight:bold; color:#d35400; }</style><table style="width:100%; border-collapse:collapse; text-align:center; font-size:12px;">`;
            
            if (item.type === '훈련생작성') {
                let numH = item.tHeaders.length;
                let sArray = new Array(numH).fill(0);
                let panjungIdx = item.tHeaders.findIndex(h => h.replace(/\s/g, '').includes('판정'));

                if (panjungIdx !== -1) {
                    let baseScore = Math.ceil(item.score / numH);
                    if (item.score - (baseScore * (numH - 1)) <= 0) baseScore = Math.floor(item.score / numH);
                    let sum = 0;
                    for (let i = 0; i < numH; i++) {
                        if (i !== panjungIdx) { sArray[i] = baseScore; sum += baseScore; }
                    }
                    sArray[panjungIdx] = item.score - sum;
                } else {
                    let sSum = 0;
                    for (let i = 0; i < numH - 1; i++) {
                        let sPart = Math.round((item.score / numH) * 10) / 10;
                        sArray[i] = sPart;
                        sSum += sPart;
                    }
                    sArray[numH - 1] = Math.round((item.score - sSum) * 10) / 10;
                }
                
                let cleanH = (txt) => txt.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d]+[\.\s]*/, '').trim();
                let p = item.tHeaders.map((h, i) => ({ n: cleanH(h), s: sArray[i] }));

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
                
                const getOrigIdx = (name) => {
                    if (!name) return -1;
                    if (name.includes("선택")) return 0;
                    if (name.includes("숙련도")) return 1;
                    if (name.includes("분해")) return 2;
                    if (name.includes("조립")) return 3;
                    if (name.includes("마무리")) return 4;
                    return -1;
                };

                let rowNames = item.category === 'attitude' ? [item.name] : item.rowNames;
                rowNames.forEach((rName, r) => {
                    html += `<tr data-row="${r}"><th>${rName}</th>`;
                    let origIdx = getOrigIdx(rName);
                    for(let c=0; c<5; c++) {
                        let cellText = "";
                        if (item.category === 'attitude') {
                            cellText = attitudeRubrics[parseInt(itemKey.replace('A',''))][c].replace(/\|/g, '<br><span style="color:#999; font-size:10px;">or</span><br>');
                        } else if (origIdx !== -1) { 
                            cellText = teacherRubrics[origIdx][c].replace(/\|/g, '<br><span style="color:#999; font-size:10px;">or</span><br>'); 
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
            
            let finalScore = Math.round(total * 10) / 10;
            document.getElementById('omrCurrentScore').innerText = finalScore;
            
            // 💡 [배선 추가] OMR 모달창에서 클릭할 때도 백그라운드의 미니 추적기 점수가 같이 움직이도록 동기화
            if (currentOMRKey) {
                let miniDisplay = document.getElementById(`mini_score_display_${currentOMRKey}`);
                if (miniDisplay) miniDisplay.innerText = finalScore;
            }
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
                let options = window.isJongWookMode ? attitudeJongWookRubrics[parseInt(String(itemKey).replace('A',''))] : attitudeRubrics[parseInt(String(itemKey).replace('A',''))][colIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                
                // 💡 1순위: 평가방식이 훈련생(훈련생작성)인 항목만 정밀 추적
                let realItems = window.currentEvalItems.filter(i => i.category === 'item' && i.type === '훈련생작성');
                // 💡 2순위 방어막: 평가지에 훈련생 작성 항목이 아예 없는 경우, 전체 항목으로 전환하여 에러 방지
                if (realItems.length === 0) {
                    realItems = window.currentEvalItems.filter(i => i.category === 'item');
                }
                
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (colIdx > 0) window.activeFeedbacks[itemKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[itemKey];

                renderFeedbackZone(); // 4. 전체 합산 렌더링
                
            } else {
                const getOrigIdx = (name) => {
                    if (!name) return -1;
                    if (name.includes("선택")) return 0;
                    if (name.includes("숙련도")) return 1;
                    if (name.includes("분해")) return 2;
                    if (name.includes("조립")) return 3;
                    if (name.includes("마무리")) return 4;
                    return -1;
                };

                let clickedOrigIdx = getOrigIdx(item.rowNames[rowIdx]);
                if (clickedOrigIdx === -1) colIdx = 0; // 💡 신규 커스텀 항목 클릭 시 무조건 만점(0열)으로 락 가동

                // 1. 클릭한 항목 줄 UI 색칠
                for(let c=0; c<5; c++) {
                    let cell = document.getElementById(`mini_cell_${itemKey}_${rowIdx}_${c}`);
                    if(cell) {
                        if(c === colIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        else { cell.innerHTML = ''; cell.style.backgroundColor = '#fff'; }
                    }
                }

                // 2. 표 전체의 점수 연산 준비
                let N = item.rowNames.length;
                let rS = item.score / N;
                let v = [Number.isInteger(rS)?rS:Number(rS.toFixed(1)), Math.round(rS*0.8), Math.round(rS*0.6), Math.round(rS*0.4), Math.round(rS*0.2)];
                
                let total = 0;
                let texts = [];
                
                // 3. N줄의 체크 상태를 스캔하여 합산
                for(let r=0; r<N; r++) {
                    let selectedCol = -1;
                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${itemKey}_${r}_${c}`);
                        if(cell && cell.innerHTML.includes('✔')) { selectedCol = c; break; }
                    }
                    
                    let rOrigIdx = getOrigIdx(item.rowNames[r]);

                    // 💡 신규 항목이거나 선택 안 된 줄은 무조건 만점(0) 강제 투입
                    if (selectedCol === -1 || rOrigIdx === -1) { 
                        selectedCol = 0; 
                        let cell = document.getElementById(`mini_cell_${itemKey}_${r}_0`);
                        if(cell) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                        for(let c=1; c<5; c++) {
                            let clearCell = document.getElementById(`mini_cell_${itemKey}_${r}_${c}`);
                            if(clearCell) { clearCell.innerHTML = ''; clearCell.style.backgroundColor = '#fff'; }
                        }
                    }
                    total += v[selectedCol];
                    
                    if (selectedCol > 0 && rOrigIdx !== -1) { // 💡 기존 항목일 때만 피드백 생성
                        let options = window.isJongWookMode ? teacherJongWookRubrics[rOrigIdx] : teacherRubrics[rOrigIdx][selectedCol].split('|');
                        texts.push(options[Math.floor(Math.random() * options.length)]);
                    }
                }

                // 4. 점수 쏘기 및 피드백 생성
                total = Math.round(total * 10) / 10;
                document.getElementById(`score_input_${itemKey}`).value = total;
                document.getElementById(`print_score_${itemKey}`).innerText = total;

                // 💡 [단선 복구] 미니 추적기 상단의 개별 점수판(빨간색 텍스트)에도 동시 갱신 타격
                let miniDisplay = document.getElementById(`mini_score_display_${itemKey}`);
                if (miniDisplay) miniDisplay.innerText = total;

                if(texts.length > 0) window.activeFeedbacks[itemKey] = `${item.coreTask} 수행 시 ${texts.join(', ')}.`;
                else delete window.activeFeedbacks[itemKey];

                renderFeedbackZone();
            }
        };

        window.applyOMR = async function() {
            const item = window.currentEvalItems.find(i => i.idx == currentOMRKey);
            const selected = document.querySelectorAll('#omrTableContainer .omr-selected');
            // 💡 [동기화] 스캔된 항목 수량만큼 OMR 체크 검증
            let expectedRows = item.type === '훈련생작성' ? item.tHeaders.length : (item.category === 'attitude' ? 1 : item.rowNames.length);
            if (selected.length !== expectedRows) return await appAlert("⚠️ 모든 항목에 체크를 완료해 주십시오.");

            let total = parseFloat(document.getElementById('omrCurrentScore').innerText);
            
            document.getElementById(`score_input_${currentOMRKey}`).value = total;
            document.getElementById(`print_score_${currentOMRKey}`).innerText = total;
            let miniDisplay = document.getElementById(`mini_score_display_${currentOMRKey}`);
            if(miniDisplay) miniDisplay.innerText = total;

            let texts = [];
            if (item.type === '훈련생작성') {
                let cleanH = (txt) => txt.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d]+[\.\s]*/, '').trim();
                let pNames = item.tHeaders.map(h => cleanH(h)); // 동적 맵핑
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

                let options = window.isJongWookMode ? attitudeJongWookRubrics[parseInt(currentOMRKey.replace('A',''))] : attitudeRubrics[parseInt(currentOMRKey.replace('A',''))][levelIdx].split('|');
                let selectedText = options[Math.floor(Math.random() * options.length)];
                
                // 💡 1순위: 평가방식이 훈련생(훈련생작성)인 항목만 정밀 추적
                let realItems = window.currentEvalItems.filter(i => i.category === 'item' && i.type === '훈련생작성');
                // 💡 2순위 방어막: 평가지에 훈련생 작성 항목이 아예 없는 경우, 전체 항목으로 전환하여 에러 방지
                if (realItems.length === 0) {
                    realItems = window.currentEvalItems.filter(i => i.category === 'item');
                }
                
                let randomCoreTask = realItems.length > 0 ? realItems[Math.floor(Math.random() * realItems.length)].coreTask : "작업";
                
                if (levelIdx > 0) window.activeFeedbacks[currentOMRKey] = `${randomCoreTask} 수행 시 ${selectedText}.`;
                else delete window.activeFeedbacks[currentOMRKey];
            } else {
                const getOrigIdx = (name) => {
                    if (!name) return -1;
                    if (name.includes("선택")) return 0;
                    if (name.includes("숙련도")) return 1;
                    if (name.includes("분해")) return 2;
                    if (name.includes("조립")) return 3;
                    if (name.includes("마무리")) return 4;
                    return -1;
                };

                selected.forEach((td, r) => {
                    let levelIdx = parseInt(td.getAttribute('data-level'));
                    let origIdx = getOrigIdx(item.rowNames[r]);
                    
                    if (origIdx === -1) levelIdx = 0; // 💡 신규 커스텀 항목은 OMR에서도 무조건 만점 락

                    for(let c=0; c<5; c++) {
                        let cell = document.getElementById(`mini_cell_${currentOMRKey}_${r}_${c}`);
                        if(cell) {
                            if(c === levelIdx) { cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:11px;">✔</span>'; cell.style.backgroundColor = '#ffeaa7'; }
                            else { cell.innerHTML = ''; cell.style.backgroundColor = 'transparent'; }
                        }
                    }

                    if(levelIdx > 0 && origIdx !== -1) { // 💡 기존 항목일 때만 피드백
                        let options = window.isJongWookMode ? teacherJongWookRubrics[origIdx] : teacherRubrics[origIdx][levelIdx].split('|');
                        texts.push(options[Math.floor(Math.random() * options.length)]);
                    }
                });
                if (texts.length > 0) window.activeFeedbacks[currentOMRKey] = `${item.coreTask} 수행 시 ${texts.join(', ')}.`;
                else delete window.activeFeedbacks[currentOMRKey];
            }
            
            document.getElementById('omrModal').style.display = 'none';
            renderFeedbackZone();
        };



        window.renderFeedbackZone = async function(forceCustomHtml = null) {
            let zone = document.getElementById('feedback_zone');
            let totalScore = 0;
            let attTotalScore = 0;
            let allFilled = true;
            window.currentEvalItems.forEach(item => {
                let inputVal = parseFloat(document.getElementById(`score_input_${item.idx}`).value);
                if (isNaN(inputVal)) allFilled = false;
                else {
                    totalScore += inputVal;
                    if (item.category === 'attitude') attTotalScore += inputVal;
                }
            });

            let attMiniDisplay = document.getElementById('mini_score_display_attitude');
            if (attMiniDisplay) attMiniDisplay.innerText = Math.round(attTotalScore * 10) / 10;

            let displayScore = Math.round(totalScore * 10) / 10;

            let currentStu = document.getElementById('final_student_name_cell')?.innerText;
            let dateMain = document.getElementById('S3_1').value || "";
            let dateAdd = document.getElementById('S3_2').value || "";
            let dateRe = document.getElementById('S3_3').value || "";
            let targetDateRaw = currentEvalMode === '본평가' ? dateMain : (currentEvalMode === '추가평가' ? dateAdd : dateRe);
            let tDate = targetDateRaw ? targetDateRaw.trim() : "";
            
            let specialStatusText = "";
            if (tDate && currentStu && globalDropoutData[currentStu] && tDate >= globalDropoutData[currentStu]) {
                specialStatusText = "중도탈락";
            } else if (tDate && currentStu && globalEarlyCompletionData[currentStu] && tDate >= globalEarlyCompletionData[currentStu]) {
                specialStatusText = "조기수료";
            }
            
            let finalInput = document.getElementById('final_total_score_input');
            if (finalInput) {
                if (specialStatusText) {
                    finalInput.value = specialStatusText;
                    finalInput.readOnly = true;
                } else {
                    finalInput.value = allFilled ? displayScore : "";
                    finalInput.readOnly = false;
                }
            }

            let bottomTotalDisplay = document.getElementById('bottom_total_score_display');
            if (bottomTotalDisplay) {
                if (specialStatusText) {
                    bottomTotalDisplay.innerText = specialStatusText;
                } else {
                    bottomTotalDisplay.innerText = allFilled ? displayScore : "";
                }
            }

            let badge = document.getElementById(`stu_score_badge_${currentStu}`);
            if (badge) {
                if (specialStatusText) {
                    badge.innerHTML = specialStatusText;
                } else {
                    let currentMode = (window.studentScoresData[currentStu] && window.studentScoresData[currentStu].savedMode) ? window.studentScoresData[currentStu].savedMode : currentEvalMode;
                    let modeHtml = "";
                    if (currentMode === '본평가') modeHtml = `<span style="font-size:9px; color:#2980b9; margin-left:2px;">(본)</span>`;
                    else if (currentMode === '추가평가') modeHtml = `<span style="font-size:9px; color:#8e44ad; margin-left:2px;">(추가)</span>`;
                    else if (currentMode === '재평가') modeHtml = `<span style="font-size:9px; color:#d35400; margin-left:2px;">(재)</span>`;
                    badge.innerHTML = allFilled ? displayScore + "점" + modeHtml : "-점";
                }
            }

            let achievementLevel = "";
            if (allFilled) {
                if (window.isCurrentNonNCS) {
                    if (displayScore >= 80) achievementLevel = "상";
                    else if (displayScore >= 60) achievementLevel = "중";
                    else achievementLevel = "하";
                } else {
                    if (displayScore >= 90) achievementLevel = 5;
                    else if (displayScore >= 80) achievementLevel = 4;
                    else if (displayScore >= 70) achievementLevel = 3;
                    else if (displayScore >= 60) achievementLevel = 2;
                    else achievementLevel = 1;
                }
            }
            // 💡 [단선 복구] 첫 번째 표와 두 번째 표 모두에 '상/중/하' 데이터가 동시 타격되도록 다중 스캔 적용
            document.querySelectorAll('#final_achievement_level').forEach(el => el.innerText = achievementLevel);

            let passMark = document.getElementById('pass_check_mark');
            let failMark = document.getElementById('fail_check_mark');
            if (passMark && failMark) {
                if (allFilled) {
                    let checkIcon = '<span style="color:#e74c3c; font-weight:bold; font-size:18px;">✔</span>';
                    if (displayScore >= 60) { passMark.innerHTML = checkIcon; failMark.innerHTML = ""; } 
                    else { passMark.innerHTML = ""; failMark.innerHTML = checkIcon; }
                } else { passMark.innerHTML = ""; failMark.innerHTML = ""; }
            }

            let unitNameStr = document.getElementById('S1_2').value || document.getElementById('S1_1').value;

            let editTag = `contenteditable="true" oninput="if(typeof window.autoFitFeedbackText === 'function') window.autoFitFeedbackText()" style="color: #c0392b; line-height: 1.6; margin: 0; width: 100%; outline: none; cursor: text;"`;
            let emptyEditTag = `contenteditable="true" oninput="if(typeof window.autoFitFeedbackText === 'function') window.autoFitFeedbackText()" style="color: #7f8c8d; font-size: 13px; line-height: 1.6; margin: 0; width: 100%; outline: none; cursor: text;"`;

            // 💡 [에러 원천 차단] zone(피드백 영역)이 HTML 상에 존재할 때만 innerHTML 주입하여 시스템 다운 방어
            if (zone) {
                if (forceCustomHtml !== null) {
                    zone.innerHTML = `<div id="feedback_inner_text" ${editTag}>${forceCustomHtml}</div>`;
                } else {
                    if (allFilled && displayScore === 100) {
                        if (window.isJongWookMode) {
                            zone.innerHTML = `<div id="feedback_inner_text" ${editTag}>${unitNameStr} 작업을 전체적으로 우수하게 진행 하였으며, 과목이 끝났지만 평가내용을 지속적으로 숙지할 것을 독려함.</div>`;
                        } else {
                            let levelStr = window.isCurrentNonNCS ? achievementLevel : achievementLevel + "단계";
                            zone.innerHTML = `<div id="feedback_inner_text" ${editTag}>총점 100점으로 ${unitNameStr} 수행 시 모든작업을 우수하게 진행하여 성취수준 ${levelStr}를 취득함.</div>`;
                        }
                    } else {
                        let rawFeedbacks = Object.values(window.activeFeedbacks).filter(txt => txt && txt.trim() !== "");
                        if (rawFeedbacks.length === 0) {
                            zone.innerHTML = `<div id="feedback_inner_text" ${emptyEditTag}>※ 상단의 컨트롤 패널에서 점수를 기입하거나 [✔ OMR 체크] 버튼을 누르면 피드백이 자동 생성됩니다.<br>(클릭하여 바로 수정 가능)</div>`;
                        } else {
                            let grouped = {};
                            rawFeedbacks.forEach(txt => {
                                let parts = txt.split(' 수행 시 ');
                                if (parts.length === 2) {
                                    let prefix = parts[0];
                                    let content = parts[1].replace(/\.$/, '').trim();
                                    if (!grouped[prefix]) grouped[prefix] = [];
                                    grouped[prefix].push(content);
                                } else {
                                    if (!grouped['기타']) grouped['기타'] = [];
                                    grouped['기타'].push(txt);
                                }
                            });

                            let finalFeedbacks = [];
                            if (allFilled && !window.isJongWookMode) {
                                let levelStr = window.isCurrentNonNCS ? achievementLevel : achievementLevel + "단계";
                                finalFeedbacks.push(`${unitNameStr} 평가 시 총점 ${displayScore}점으로 ${levelStr} 성취수준을 취득함.`);
                            }

                            for (let prefix in grouped) {
                                if (prefix === '기타') finalFeedbacks.push(...grouped[prefix]);
                                else {
                                    let mergedContent = grouped[prefix].join(' 및 ');
                                    finalFeedbacks.push(`${prefix} 수행 시 ${mergedContent}.`);
                                }
                            }
                            zone.innerHTML = `<div id="feedback_inner_text" ${editTag}>` + finalFeedbacks.join(' ') + `</div>`;
                        }
                    }
                }
            }

            // 💡 [신규 모터] 수동 글자 크기 조절 엔진 (선생님 개입 시 가동)
        window.changeCriteriaTextSize = function(direction) {
            let el = document.getElementById('custom_criteria_input');
            if (!el) return;
            
            window.isManualCriteriaSize = true; // 수동 개입 확인 (자동 엔진 차단)
            
            let currentSize = parseFloat(el.style.fontSize) || parseFloat(window.getComputedStyle(el).fontSize) || 13;
            if (direction === 'up') currentSize += 0.5;
            else if (direction === 'down') currentSize -= 0.5;
            
            if (currentSize > 20) currentSize = 20;
            if (currentSize < 6) currentSize = 6; // 최소 6px까지 초정밀 압축 허용
            
            el.style.fontSize = currentSize + 'px';
            
            // 💡 크기에 맞춰 줄 간격 지능형 연동
            if (currentSize <= 9) el.style.lineHeight = '1.25';
            else if (currentSize <= 11) el.style.lineHeight = '1.35';
            else el.style.lineHeight = '1.4';
        };

        // 💡 [기존 모터] 평가기준 전용 초정밀 자동 크기 조절 엔진
        window.autoFitCriteriaText = function(el) {
            if (!el) return;
            if (window.isManualCriteriaSize) return; // 💡 선생님이 수동으로 크기를 조절했다면 자동 엔진은 작동을 정지함
            
            // 1. 초기화 (순정 상태로 되돌리고 측정 시작)
            let currentSize = 13.0;
            let currentLineHeight = 1.5;
            
            el.style.fontSize = currentSize + 'px';
            el.style.lineHeight = currentLineHeight;
            
            // 2. 박스 내부의 실제 높이(scrollHeight)가 160px을 넘어가면 압축 시작 (최소 7px까지 초정밀 압축)
            while (el.scrollHeight > 160 && currentSize > 7) {
                currentSize -= 0.5;
                el.style.fontSize = currentSize + 'px';
                
                // 💡 글자 크기가 작아짐에 따라 줄 간격도 계단식으로 더 타이트하게 압축
                if (currentSize <= 12) currentLineHeight = 1.4;
                if (currentSize <= 11) currentLineHeight = 1.35;
                if (currentSize <= 10) currentLineHeight = 1.3;
                if (currentSize <= 9) currentLineHeight = 1.25;
                if (currentSize <= 8) currentLineHeight = 1.2;
                
                el.style.lineHeight = currentLineHeight;
            }
        };

        // 💡 [신규 배선] 평가기준 텍스트 전용 다이렉트 저장 엔진
        window.saveCustomCriteria = async function() {
            let criteriaEl = document.getElementById('custom_criteria_input');
            if (!criteriaEl) return;
           
            let customHtml = criteriaEl.innerHTML;
            let customSize = criteriaEl.style.fontSize;
            let customLineHeight = criteriaEl.style.lineHeight;
            if (!currentDbKey) return await appAlert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");

            try {
                // 해당 과목의 평가계획 DB에 커스텀 텍스트 및 스타일 값을 핀포인트로 쏴서 덮어씌움
                await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).update({ 
                    customCriteria: customHtml,
                    customCriteriaSize: customSize,
                    customCriteriaLineHeight: customLineHeight
                });
               
                // 시각적 피드백 (초록색 불빛 점등 후 복구)
                let originalBg = criteriaEl.style.backgroundColor;
                criteriaEl.style.backgroundColor = "#d5f5e3";
                setTimeout(() => {
                    criteriaEl.style.backgroundColor = originalBg;
                }, 800);
               
                await appAlert("✅ 평가기준 텍스트가 안전하게 저장되었습니다!\n(이후 다른 학생 결과표를 눌러도 이 내용이 모두 동일하게 적용됩니다.)");
            } catch(e) {
                await appAlert("❌ 저장 실패: " + e.message);
            }
        };


            window.autoFitFeedbackText = function() {
                let innerText = document.getElementById('feedback_inner_text');
                if (!zone || !innerText) return;

                let currentSize = 13;
                let currentLineHeight = 1.6;
                innerText.style.fontSize = currentSize + 'px';
                innerText.style.lineHeight = currentLineHeight;
                
                let page4 = document.getElementById('page4');
                let isHidden = false;
                
                if (page4 && (page4.style.display === 'none' || window.getComputedStyle(page4).display === 'none')) {
                    isHidden = true;
                    page4.style.setProperty('display', 'block', 'important');
                    page4.style.setProperty('visibility', 'hidden', 'important');
                    page4.style.setProperty('position', 'absolute', 'important');
                    page4.style.setProperty('z-index', '-9999', 'important');
                }

                let targetHeight = zone.clientHeight;
                if (targetHeight === 0) targetHeight = 81; 

                while (innerText.scrollHeight > targetHeight && currentSize > 8) {
                    currentSize -= 0.5;
                    innerText.style.fontSize = currentSize + 'px';
                    if (currentSize <= 11.5) {
                        currentLineHeight = 1.35;
                        innerText.style.lineHeight = currentLineHeight;
                    }
                }

                if (isHidden) {
                    page4.style.removeProperty('display');
                    page4.style.removeProperty('visibility');
                    page4.style.removeProperty('position');
                    page4.style.removeProperty('z-index');
                }
            };
            
            if (zone) window.autoFitFeedbackText();
        };

        // 💡 [신규 탑재] 대시보드 전체 초기화 회로
        window.resetAllScores = async function() {
            if(!await appConfirm("채점 대시보드의 모든 점수를 초기화하시겠습니까?\n(※ '훈련생작성' 항목은 기본 만점으로 돌아가며, 시간평가는 0점으로 고정됩니다.)")) return;
            
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
        window.reverseCalculateScore = async function(targetVal) {
            if (targetVal === "중도탈락" || targetVal === "조기수료") return; // 📍 특수 상태면 역산 엔진 패스
            let target = parseFloat(targetVal);
            if(isNaN(target) || target < 0 || target > 100) return await appAlert("⚠️ 0~100 사이의 올바른 점수를 입력하세요.");

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
                return await appAlert(`⚠️ 선택하신 점수(${target}점)를 구성할 수 있는 수학적 배점 조합이 존재하지 않습니다.\n(※ 훈련생 만점을 기본으로 한 상태에서 채점 규칙상 도달할 수 없는 점수입니다.)`);
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

        // 💡 [신규 엔진] OMR 빗금을 감지하여 점수를 100% 역산하는 전용 모터
        window.recalcNonNcsScoresFromOMR = function() {
            let wrongCells = document.querySelectorAll('.non-ncs-omr-cell[data-wrong="true"]');
            let itemScores = {};
            window.currentEvalItems.forEach(item => { itemScores[item.idx] = parseFloat(item.score); });

            wrongCells.forEach(c => {
                let parentIdx = c.getAttribute('data-parent');
                let qScore = parseFloat(c.getAttribute('data-score') || 0);
                if (itemScores[parentIdx] !== undefined) itemScores[parentIdx] -= qScore;
            });

            window.currentEvalItems.forEach(item => {
                if (item.category !== 'item') return;
                let finalItemScore = Math.max(0, itemScores[item.idx]);
                let inputEl = document.getElementById(`score_input_${item.idx}`);
                let printTd = document.getElementById(`print_score_${item.idx}`);
                
                if (inputEl) inputEl.value = Math.round(finalItemScore * 10) / 10;
                if (printTd) printTd.innerText = Math.round(finalItemScore * 10) / 10;

                let myWrongNums = [];
                wrongCells.forEach(c => {
                    if (c.getAttribute('data-parent') == item.idx) myWrongNums.push(c.getAttribute('data-qnum'));
                });

                if (myWrongNums.length > 0) {
                    window.activeFeedbacks[item.idx] = `[${item.name}] 영역에서 ${myWrongNums.join(', ')}번 문항 오답.`;
                } else {
                    delete window.activeFeedbacks[item.idx];
                }
            });

            if (typeof window.renderFeedbackZone === 'function') window.renderFeedbackZone();
        };

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
            let finalTotal;
            if (finalInput === "중도탈락" || finalInput === "조기수료") {
                finalTotal = finalInput;
            } else {
                finalTotal = finalInput !== "" ? parseFloat(finalInput) : (allFilled ? total : null);
            }

            let existingMode = window.studentScoresData[currentStu] ? window.studentScoresData[currentStu].savedMode : null;
            
            let feedbackInner = document.getElementById('feedback_inner_text');
            let feedbackHtml = feedbackInner ? feedbackInner.innerHTML : null;

            if (feedbackHtml && feedbackHtml.includes("상단의 컨트롤 패널에서")) {
                feedbackHtml = null;
            }

            // 💡 [신규 배선] 비NCS 모드일 경우 OMR에 체크된 빗금(/) 기록 스캔 및 캡슐화
            let omrState = [];
            let miniOmrState = {}; // 💡 [신규 배선] NCS 모드용 미니 추적기 고정 상태 저장
            if (window.isCurrentNonNCS) {
                document.querySelectorAll('.non-ncs-omr-cell').forEach(c => {
                    if (c.getAttribute('data-wrong') === 'true') {
                        let qIdx = c.id.replace('non_ncs_omr_cell_', '');
                        omrState.push(parseInt(qIdx));
                    }
                });
            } else {
                window.currentEvalItems.forEach(item => {
                    if (item.type !== '훈련생작성' && item.category === 'item') {
                        miniOmrState[item.idx] = [];
                        let N = item.rowNames.length;
                        for(let r=0; r<N; r++) {
                            let selectedCol = -1;
                            for(let c=0; c<5; c++) {
                                let cell = document.getElementById(`mini_cell_${item.idx}_${r}_${c}`);
                                if(cell && cell.innerHTML.includes('✔')) { selectedCol = c; break; }
                            }
                            miniOmrState[item.idx].push(selectedCol);
                        }
                    }
                });
            }

            window.studentScoresData[currentStu] = {
                items: items,
                totalScore: (finalTotal === "중도탈락" || finalTotal === "조기수료") ? finalTotal : (finalTotal !== null ? Math.round(finalTotal * 10) / 10 : "-"),
                customFeedbackHtml: feedbackHtml,
                omrState: omrState, // 💡 비NCS OMR 빗금 저장
                miniOmrState: miniOmrState // 💡 NCS 감점 추적기 락(Lock) 저장
            };
            
            if (existingMode) window.studentScoresData[currentStu].savedMode = existingMode;
        };

        window.loadStudentState = function(stu) {
            // 💡 [신규 배선] 다른 학생 클릭 시 OMR 표의 이전 빗금 잔상 100% 소각
            if (window.isCurrentNonNCS && typeof window.clearNonNcsOMRVisuals === 'function') {
                window.clearNonNcsOMRVisuals();
            }

            const data = window.studentScoresData[stu];
            if (data && data.items && Object.keys(data.items).length > 0) {
                window.currentEvalItems.forEach(item => {
                    document.getElementById(`score_input_${item.idx}`).value = data.items[item.idx] !== undefined ? data.items[item.idx] : "";
                    if (!window.isCurrentNonNCS) {
                        processAutoScore(item.idx, true); 
                    }
                });
                
                if (data.customFeedbackHtml) {
                    renderFeedbackZone(data.customFeedbackHtml);
                } else if (window.isCurrentNonNCS) {
                    if (typeof window.renderFeedbackZone === 'function') window.renderFeedbackZone();
                }
            } else {
                // 💡 [잔상 소각] 데이터가 없는 학생일 경우 입력칸과 텍스트를 강제로 완벽히 비워냄 (100점 복사 방어)
                window.currentEvalItems.forEach(item => {
                    let defaultVal = (item.type === '훈련생작성') ? item.score : "";
                    document.getElementById(`score_input_${item.idx}`).value = defaultVal;
                    if (document.getElementById(`print_score_${item.idx}`)) document.getElementById(`print_score_${item.idx}`).innerText = "";
                    if (!window.isCurrentNonNCS) {
                        processAutoScore(item.idx, true); 
                    }
                });
                window.activeFeedbacks = {};
                let finalInput = document.getElementById('final_total_score_input');
                if (finalInput) finalInput.value = ""; // 총점 입력칸 소각
                let bottomDisplay = document.getElementById('bottom_total_score_display');
                if (bottomDisplay) bottomDisplay.innerText = "";
                
                if (window.isCurrentNonNCS) {
                    if (typeof window.renderFeedbackZone === 'function') window.renderFeedbackZone();
                }
            }

            // 💡 [신규 배선] 비NCS 모드일 경우, 캡슐에 저장된 OMR 빗금 데이터가 있다면 시각적으로 100% 복원
            if (window.isCurrentNonNCS && data && Array.isArray(data.omrState)) {
                data.omrState.forEach(qIdx => {
                    let cell = document.getElementById(`non_ncs_omr_cell_${qIdx}`);
                    if (cell) {
                        cell.setAttribute('data-wrong', 'true');
                        cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:18px;">/</span>';
                        cell.style.backgroundColor = '#fdebd0';
                    }
                });
                // 복원된 빗금을 바탕으로 점수/피드백 재계산 (화면 동기화)
                if (typeof window.recalcNonNcsScoresFromOMR === 'function') window.recalcNonNcsScoresFromOMR();
            } else if (window.isCurrentNonNCS) {
                if (typeof window.renderFeedbackZone === 'function') window.renderFeedbackZone();
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

            // 💡 [신규 배선] 화면에서 편집한 평가기준 텍스트 및 스타일 사이즈 추출
            let criteriaInputEl = document.getElementById('custom_criteria_input');
            let customCriteriaHtml = criteriaInputEl ? criteriaInputEl.innerHTML : null;
            let customCriteriaSize = criteriaInputEl ? criteriaInputEl.style.fontSize : null;
            let customCriteriaLineHeight = criteriaInputEl ? criteriaInputEl.style.lineHeight : null;

            if (!await appConfirm(`[본평가] 전체 학생의 최종 점수를 통합 DB에 저장하시겠습니까?\n(※ 본평가 모드에서만 전체 저장이 가능합니다.)`)) return;

            try {
                // 무조건 '본평가' 경로에 덮어씌워 통합을 완성합니다.
                await classDbRef(`evalScores/본평가/${currentDbKey}`).set(window.studentScoresData);
                window.studentScoresDataSourceKey = currentDbKey;

                // 💡 [신규 배선] 평가기준 내용과 폰트 스타일을 evalPlans DB에 연동하여 일괄 적용
                if (customCriteriaHtml) {
                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).update({ 
                        customCriteria: customCriteriaHtml,
                        customCriteriaSize: customCriteriaSize,
                        customCriteriaLineHeight: customCriteriaLineHeight
                    });
                }

                await appAlert("✅ 전체 학생 평가 결과 및 평가기준이 통합 저장되었습니다!");
                buildFinalResultDocs(); // 레이더(색상) 동기화를 위해 화면 새로고침
            } catch(e) {
                await appAlert("❌ 저장 실패: " + e.message);
            }
        };

        // 📍 [신규 모터] 추가/재평가용 개별 저장 엔진
        window.saveIndividualFinalResult = async function() {
            saveCurrentStudentState();
           
            const currentStu = document.getElementById('final_student_name_cell')?.innerText;
            if (!currentStu || currentStu === "훈련생명" || currentStu === "") return await appAlert("⚠️ 저장할 훈련생을 선택해주세요.");

            if (window.studentScoresData[currentStu].totalScore === "-") {
                return await appAlert("⚠️ 해당 학생의 점수가 입력되지 않았습니다.");
            }

            // 선택된 학생에게만 현재 모드(추가평가/재평가) 낙인을 찍습니다.
            window.studentScoresData[currentStu].savedMode = currentEvalMode; 

            // 💡 [신규 배선] 화면에서 편집한 평가기준 텍스트 및 스타일 사이즈 추출
            let criteriaInputEl = document.getElementById('custom_criteria_input');
            let customCriteriaHtml = criteriaInputEl ? criteriaInputEl.innerHTML : null;
            let customCriteriaSize = criteriaInputEl ? criteriaInputEl.style.fontSize : null;
            let customCriteriaLineHeight = criteriaInputEl ? criteriaInputEl.style.lineHeight : null;

            if (!await appConfirm(`[${currentEvalMode}] '${currentStu}' 훈련생의 점수만 통합 DB에 업데이트하시겠습니까?\n(해당 학생의 최종 점수가 갱신됩니다.)`)) return;

            try {
                // 해당 학생의 데이터만 핀포인트로 업데이트하여 병목과 다른 학생 데이터 훼손을 방지합니다.
                await classDbRef(`evalScores/본평가/${currentDbKey}/${currentStu}`).set(window.studentScoresData[currentStu]);
                window.studentScoresDataSourceKey = currentDbKey;

                // 💡 [신규 배선] 개별 저장 시에도 평가기준과 스타일을 갱신 적용
                if (customCriteriaHtml) {
                    await classDbRef(`evalPlans/${currentEvalMode}/${currentDbKey}`).update({ 
                        customCriteria: customCriteriaHtml,
                        customCriteriaSize: customCriteriaSize,
                        customCriteriaLineHeight: customCriteriaLineHeight
                    });
                }

                await appAlert(`✅ '${currentStu}' 훈련생의 [${currentEvalMode}] 점수 및 평가기준이 최종 갱신되었습니다!`);
                buildFinalResultDocs(); // 화면 새로고침
            } catch(e) {
                await appAlert("❌ 개별 저장 실패: " + e.message);
            }
        };

        // 💡 [신규 탑재] 전체 학생 점수 전용 소각 엔진
        window.deleteAllFinalResults = async function() {
            if (!currentDbKey) return await appAlert("⚠️ 데이터베이스 키를 찾을 수 없습니다.");

            const expectedText = "초기화합니다";
            const userInput = await appPrompt(`❗ [경고] 현재 과목의 전체 훈련생 평가 점수를 DB에서 완전히 삭제(초기화)합니다.\n(※ 설정이나 모범답안은 유지되며 오직 학생들의 점수만 지워집니다.)\n\n진행하시려면 "${expectedText}"라고 정확히 입력해 주세요.`);

            if (userInput === expectedText) {
                try {
                    // 1. 파이어베이스 DB에서 해당 과목의 점수 데이터만 정밀 타격하여 삭제
                    await classDbRef(`evalScores/본평가/${currentDbKey}`).remove();
                    
                    // 2. 브라우저 메모리(RAM)에 남아있는 좀비 데이터 완전 포맷
                    window.studentScoresData = {};
                    
                    await appAlert("✅ 전체 학생의 평가 점수가 성공적으로 초기화되었습니다.");
                    
                    // 3. 화면 UI 강제 리프레시 (순정 상태 렌더링)
                    buildFinalResultDocs();
                } catch(e) {
                    await appAlert("❌ 초기화 실패: " + e.message);
                }
            } else if (userInput !== null) {
                await appAlert("❌ 문구가 일치하지 않아 초기화가 취소되었습니다.");
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
        window.reverseCalculateScore = async function(targetVal) {
            if (targetVal === "중도탈락" || targetVal === "조기수료") return;
            let target = parseFloat(targetVal);
            if(isNaN(target) || target < 0 || target > 100) return await appAlert("⚠️ 0~100 사이의 올바른 점수를 입력하세요.");

            let result = window.isCurrentNonNCS ? getAutoScoreOMR(target) : window.getAutoScoreBreakdown(target);
            if (!result) {
                document.getElementById('final_total_score_input').value = ""; 
                return await appAlert(`⚠️ 선택하신 점수(${target}점)를 구성할 수 있는 배점 조합이 존재하지 않습니다.`);
            }

            if (window.isCurrentNonNCS) {
                // 비NCS 역산 렌더링
                window.clearNonNcsOMRVisuals();
                result.lossCombo.forEach(q => {
                    let cell = document.getElementById(`non_ncs_omr_cell_${q.globalIdx}`);
                    if (cell) {
                        cell.setAttribute('data-wrong', 'true');
                        cell.innerHTML = '<span style="color:#e74c3c; font-weight:bold; font-size:18px;">/</span>';
                        cell.style.backgroundColor = '#fdebd0';
                    }
                });
                window.recalcNonNcsScoresFromOMR();
            } else {
                // NCS 역산 렌더링
                let resultVals = result;
                let teacherItems = window.currentEvalItems.filter(i => i.type !== '훈련생작성');
                window.currentEvalItems.forEach(item => {
                    let inputEl = document.getElementById(`score_input_${item.idx}`);
                    if(item.type === '훈련생작성') {
                        inputEl.value = item.score;
                    } else {
                        let matchIdx = teacherItems.findIndex(ti => ti.idx === item.idx);
                        inputEl.value = resultVals[matchIdx];
                    }
                    processAutoScore(item.idx, true);
                });
            }
        };

        // 💡 [비NCS 전용 역산 모터] 객관식 배점을 기반으로 틀린 문제 조합을 똑똑하게 찾아냅니다.
        window.getAutoScoreOMR = function(target) {
            let qScores = []; 
            let totalItemScore = 0;
            let globalCounter = 0;
            window.currentEvalItems.filter(i => i.category === 'item').forEach(item => {
                totalItemScore += parseFloat(item.score);
                try {
                    let arr = JSON.parse(item.question);
                    if(Array.isArray(arr) && arr.length > 0) {
                        arr.forEach((q, idx) => {
                            qScores.push({ parentIdx: item.idx, qNum: idx, score: parseFloat(q.score), globalIdx: globalCounter++ });
                        });
                    } else {
                        if (!window.isIntegratedInputMode) qScores.push({ parentIdx: item.idx, qNum: 0, score: parseFloat(item.score), globalIdx: globalCounter++ });
                    }
                } catch(e) {
                    if (!window.isIntegratedInputMode) qScores.push({ parentIdx: item.idx, qNum: 0, score: parseFloat(item.score), globalIdx: globalCounter++ });
                }
            });
            
            let neededLoss = Math.round((totalItemScore - target) * 10) / 10;
            if (neededLoss < 0 || neededLoss === 0) return { lossCombo: [], finalScore: totalItemScore };

            let bestCombo = null;
            function dfs(idx, currentLoss, currentCombo) {
                if (Math.round(currentLoss * 10) / 10 === neededLoss) {
                    bestCombo = [...currentCombo];
                    return true;
                }
                if (idx >= qScores.length || currentLoss > neededLoss) return false;
                if(dfs(idx + 1, currentLoss + qScores[idx].score, [...currentCombo, qScores[idx]])) return true;
                if(dfs(idx + 1, currentLoss, currentCombo)) return true;
                return false;
            }
            
            if (dfs(0, 0, [])) return { lossCombo: bestCombo, finalScore: target };
            return null; // 정확한 감점 조합이 없으면 튕겨내어 다른 무작위 점수를 찾게 함
        };

        window.executeAutoGradeAll = async function() {
            let minScore = parseFloat(document.getElementById('auto_score_min').value);
            let maxScore = parseFloat(document.getElementById('auto_score_max').value);
            let max100 = parseInt(document.getElementById('auto_score_max100').value);

            if(isNaN(minScore) || isNaN(maxScore) || minScore > maxScore || minScore < 0 || maxScore > 100) {
                return await appAlert("⚠️ 점수 범위가 올바르지 않습니다.");
            }

            let dateMain = document.getElementById('S3_1').value || "";
            let dateAdd = document.getElementById('S3_2').value || "";
            let dateRe = document.getElementById('S3_3').value || "";
            let targetDateRaw = currentEvalMode === '본평가' ? dateMain : (currentEvalMode === '추가평가' ? dateAdd : dateRe);
            let targetDate = targetDateRaw ? targetDateRaw.trim() : "";

            let studentBtns = document.querySelectorAll('.student-select-btn');
            if (studentBtns.length === 0) return await appAlert("⚠️ 평가할 훈련생 명단이 없습니다.");
            
            let targetStudents = [];
            let skippedCount = 0;

            Array.from(studentBtns).forEach(btn => {
                let stu = btn.innerText;
                let attStatus = "-";
                if (targetDate && globalDropoutData[stu] && targetDate >= globalDropoutData[stu]) {
                    attStatus = "중도탈락";
                } else if (targetDate && globalEarlyCompletionData[stu] && targetDate >= globalEarlyCompletionData[stu]) {
                    attStatus = "조기수료";
                } else if (targetDate && globalAttendanceData && globalAttendanceData[targetDate] && globalAttendanceData[targetDate][stu]) {
                    let sInfo = globalAttendanceData[targetDate][stu].status || "";
                    if (sInfo.includes("결석") || sInfo === "미편입") { attStatus = "결석"; }
                    else if (sInfo.includes("지각")) { attStatus = "지각"; }
                    else if (sInfo.includes("조퇴")) { attStatus = "조퇴"; }
                    else if (sInfo.includes("외출") || ["공가", "휴가", "경조사", "출석인정"].some(k => sInfo.includes(k))) { attStatus = sInfo; }
                    else { attStatus = "출석"; }
                }

                if (attStatus === "출석" || attStatus === "-") {
                    targetStudents.push(stu);
                } else {
                    skippedCount++;
                }
            });

            if (targetStudents.length === 0) return await appAlert(`⚠️ 자동 채점 대상이 없습니다.\n(지각, 조퇴, 결석, 중도탈락, 조기수료 등은 채점에서 제외됨)`);

            let msg = `[대상 확인 완료]\n전체 훈련생 중 채점 대상인 ${targetStudents.length}명에게만 ${minScore}~${maxScore}점 사이의 무작위 점수를 부여하시겠습니까?\n(※ 100점은 최대 ${max100}명 지정)`;
            if (!await appConfirm(msg)) return;

            // 💡 [분기] 비NCS면 OMR 빗금 감점기, NCS면 상중하 쪼개기(DP) 구동
            let getValidRandomScore = (min, max) => {
                let attempts = 0;
                while(attempts < 50) {
                    let rand = Math.floor(Math.random() * (max - min + 1)) + min;
                    let result = window.isCurrentNonNCS ? getAutoScoreOMR(rand) : window.getAutoScoreBreakdown(rand);
                    if (result !== null) return { rand: rand, breakdown: result };
                    attempts++;
                }
                for(let score = max; score >= min; score--) {
                    let result = window.isCurrentNonNCS ? getAutoScoreOMR(score) : window.getAutoScoreBreakdown(score);
                    if (result !== null) return { rand: score, breakdown: result };
                }
                return null; 
            };

            let targetScores = [];
            let count100 = 0;
            for(let i=0; i<targetStudents.length; i++) {
                let sObj = getValidRandomScore(minScore, maxScore);
                targetScores.push(sObj);
            }

            for(let i=0; i<targetScores.length; i++) {
                if (targetScores[i] && targetScores[i].rand === 100) {
                    count100++;
                    if (count100 > max100) {
                        let newMax = 99 < minScore ? minScore : 99; 
                        targetScores[i] = getValidRandomScore(minScore, newMax);
                    }
                }
            }

            let teacherItems = window.currentEvalItems.filter(i => i.type !== '훈련생작성');

            targetStudents.forEach((stu, index) => {
                let sObj = targetScores[index];
                if (!sObj) return;

                let target = sObj.rand;
                let breakdown = sObj.breakdown;
                let itemsObj = {};
                let customFeedbackHtml = null;
                let omrState = [];

                if (window.isCurrentNonNCS) {
                    // 💡 비NCS OMR 캡슐화
                    target = breakdown.finalScore;
                    window.currentEvalItems.forEach(item => { itemsObj[item.idx] = parseFloat(item.score); });
                    breakdown.lossCombo.forEach(q => {
                        itemsObj[q.parentIdx] -= q.score;
                        omrState.push(q.globalIdx);
                    });
                    
                    let myWrongNums = breakdown.lossCombo.map(q => q.globalIdx + 1);
                    if(myWrongNums.length > 0) {
                        customFeedbackHtml = `<div id="feedback_inner_text" contenteditable="true" style="color: #c0392b; font-size: 13px; line-height: 1.6; margin: 0; width: 100%; outline: none; cursor: text;">객관식 문항 중 ${myWrongNums.join(', ')}번 문항 오답으로 총점 ${target}점 취득함.</div>`;
                    } else {
                        let unitNameStr = document.getElementById('S1_2').value || document.getElementById('S1_1').value;
                        customFeedbackHtml = `<div id="feedback_inner_text" contenteditable="true" style="color: #c0392b; font-size: 13px; line-height: 1.6; margin: 0; width: 100%; outline: none; cursor: text;">총점 100점으로 ${unitNameStr} 수행 시 모든 작업을 우수하게 진행하여 성취수준 상 단계를 취득함.</div>`;
                    }
                } else {
                    // NCS는 화면 렌더링 시 기존 로직(renderFeedbackZone)으로 자동 파생됨
                    window.currentEvalItems.forEach(item => {
                        if(item.type === '훈련생작성') {
                            itemsObj[item.idx] = item.score;
                        } else {
                            let matchIdx = teacherItems.findIndex(ti => ti.idx === item.idx);
                            itemsObj[item.idx] = breakdown[matchIdx];
                        }
                    });
                }

                let existingMode = window.studentScoresData[stu] ? window.studentScoresData[stu].savedMode : null;
                window.studentScoresData[stu] = {
                    items: itemsObj,
                    totalScore: target,
                    omrState: omrState
                };
                if (customFeedbackHtml) window.studentScoresData[stu].customFeedbackHtml = customFeedbackHtml;
                if (existingMode) window.studentScoresData[stu].savedMode = existingMode;

                let badge = document.getElementById(`stu_score_badge_${stu}`);
                if(badge) {
                    let modeHtml = "";
                    let displayMode = existingMode || currentEvalMode;
                    if (displayMode === '본평가') modeHtml = `<span style="font-size:9px; color:#2980b9; margin-left:2px;">(본)</span>`;
                    else if (displayMode === '추가평가') modeHtml = `<span style="font-size:9px; color:#8e44ad; margin-left:2px;">(추가)</span>`;
                    else if (displayMode === '재평가') modeHtml = `<span style="font-size:9px; color:#d35400; margin-left:2px;">(재)</span>`;
                    badge.innerHTML = target + "점" + modeHtml;
                }
            });

            window.studentScoresData._gradingSettings = { min: minScore, max: maxScore, max100: max100 };

            let currentStu = document.getElementById('final_student_name_cell')?.innerText;
            if (currentStu && targetStudents.includes(currentStu)) {
                window.loadStudentState(currentStu);
            }

            await appAlert(`✅ 정상 출석한 ${targetStudents.length}명의 자동 채점이 완료되었습니다.\n(지각/조퇴/결석 등 ${skippedCount}명 보존)\n💡 완료 후 우측의 [전체 저장] 버튼을 눌러야 최종 확정됩니다!`);
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

            const personalDbKey = currentDbKey || (subject + "_" + (unitName || "종합")).replace(/[\.\#\$\/\[\]]/g, '');

            // 1. [점수 데이터 로드] DB 백업본 + 메모리(저장 안 한 채점 점수) 융합 배선
            let scoreData = {};
            try {
                // 기존: evalScores/${currentEvalMode}
                // 💡 [수정] 통합 저장소(본평가)에서 무조건 퍼올립니다.
                const snap = await classDbRef(`evalScores/본평가/${personalDbKey}`).once('value');
                scoreData = snap.val() || {};
            } catch(e) { console.warn("점수 로드 에러", e); }

            // 💡 같은 과목의 4번 탭에서 채점만 돌리고 저장을 안 했을 때만 메모리 점수를 병합합니다.
            if (window.studentScoresDataSourceKey === personalDbKey && window.studentScoresData && Object.keys(window.studentScoresData).length > 0) {
                for (let stu in window.studentScoresData) {
                    if (stu !== "_gradingSettings") {
                        scoreData[stu] = window.studentScoresData[stu];
                    }
                }
            }

            // 2. [필수/선택 여부 탐지] 정밀 추적 알고리즘 가동
            let unitTypeDisplay = "필수"; // 기본값
            
            // 💡 [배선 수리 완료] window. 를 떼어내어 은닉된 let 변수(globalCoursesData)에 다이렉트로 접속합니다.
            if (globalCoursesData && globalCoursesData.length > 0) {
                let cleanSubject = subject.replace(/\s+/g, '');
                let cleanCode = (document.getElementById('S1_Code').value || "").replace(/[^0-9a-zA-Z]/g, '');
                let cleanUnitName = (unitName || "").replace(/\s+/g, '');
                
                let matchedCourse = null;
                // 1차 타격: NCS 코드로 탐색
                if (cleanCode) {
                    matchedCourse = globalCoursesData.find(c => c.unit && c.unit.replace(/[^0-9a-zA-Z]/g, '').includes(cleanCode));
                }
                // 2차 타격: 띄어쓰기 모두 제거한 순수 텍스트로 탐색
                if (!matchedCourse) {
                    matchedCourse = globalCoursesData.find(c => {
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

            if (window.isCurrentNonNCS) {
                unitTypeDisplay = "선택";
            }

            // 3. [평가일 렌더링 로직]
            const dotDate = (d) => d ? d.replace(/-/g, '.') : "";
            let internalDateRaw = dateMain;
            let revalDateRaw = dateRe;
            
            let internalDateStr = internalDateRaw ? dotDate(internalDateRaw) : "-";
            let revalDateStr = revalDateRaw ? dotDate(revalDateRaw) : "-";
            let personalDateRows = [{ label: "내부평가일", value: internalDateStr }];
            if (dateRe && dateRe.trim() !== "") {
                personalDateRows.push({ label: "재평가일", value: revalDateStr });
                if (dateAdd && dateAdd.trim() !== "") {
                    personalDateRows.push({ label: "추가평가일", value: dotDate(dateAdd) });
                }
            } else if (dateAdd && dateAdd.trim() !== "") {
                personalDateRows.push({ label: "추가평가일", value: dotDate(dateAdd) });
            } else {
                personalDateRows.push({ label: "재평가일", value: "-" });
            }
            let personalDateRowsHtml = personalDateRows.map((row, idx) => `
                    <tr style="height: 24px;">
                        <th colspan="2" style="border: 1px solid #000; padding: 4px;">${row.label}</th>
                        <td colspan="2" style="border: 1px solid #000; padding: 4px;">${row.value}</td>
                        ${idx === 0 ? `<th colspan="3" rowspan="${personalDateRows.length}" style="border: 1px solid #000; padding: 4px;">평가회차</th>
                        <td colspan="1" rowspan="${personalDateRows.length}" style="border: 1px solid #000; padding: 4px;">1회</td>` : ''}
                    </tr>`).join('');

            // 4. [학생 명단 & 생년월일 수집] 출석부 데이터 스캔
            let studentSet = new Set();
            let birthDateMap = {};
            
            if (globalAttendanceData && typeof globalAttendanceData === 'object') { 
                Object.values(globalAttendanceData).forEach(dayData => {
                    if (dayData && typeof dayData === 'object') { 
                        Object.keys(dayData).forEach(key => {
                            // 📍 영구 삭제자는 아예 24인 표 리스트에서 소각
                            if (key !== '_metadata' && !globalDeletedLogs[key]) {
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

            // 📍 [최종 결과표 기준] 현재 모드와 무관하게 저장된 최종점수를 우선 표시합니다.
            let checkDate = [dateMain, dateAdd, dateRe]
                .filter(d => d && d.trim() !== "")
                .sort()
                .pop() || "";

            let getStudentFinalScoreDisplay = (stu) => {
                if (!stu) return "";
                let savedScore = scoreData[stu] && scoreData[stu].totalScore !== undefined ? String(scoreData[stu].totalScore).trim() : "";
                if (savedScore !== "" && savedScore !== "-") return scoreData[stu].totalScore;
                if (checkDate && globalDropoutData[stu] && checkDate >= globalDropoutData[stu]) return "중도탈락";
                if (checkDate && globalEarlyCompletionData[stu] && checkDate >= globalEarlyCompletionData[stu]) return "조기수료";
                return "-";
            };

            // 5. [테이블 뼈대 생성] 최대 24명 기준 (12줄 루프)
            let tbodyHtml = "";
            for (let i = 0; i < 12; i++) {
                let leftIdx = i;
                let rightIdx = i + 12;
                
                let leftStu = studentList[leftIdx];
                let leftName = leftStu || "";
                let leftBirth = leftStu ? (birthDateMap[leftStu] || "") : "";
                // 💡 [점수 표기 수리 완료] 헬퍼 함수를 통해 특수 상태면 텍스트 출력, 아니면 점수나 '-' 출력
                let leftScore = getStudentFinalScoreDisplay(leftStu);
               
                let rightStu = studentList[rightIdx];
                let rightName = rightStu || "";
                let rightBirth = rightStu ? (birthDateMap[rightStu] || "") : "";
                // 💡 [점수 표기 수리 완료] 헬퍼 함수를 통해 특수 상태면 텍스트 출력, 아니면 점수나 '-' 출력
                let rightScore = getStudentFinalScoreDisplay(rightStu);

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
                    
                    ${personalDateRowsHtml}

                    <tr>
                        <th style="border: 1px solid #000; padding: 6px;">연번</th>
                        <th style="border: 1px solid #000; padding: 6px;">교육훈련생<br>이름</th>
                        <th style="border: 1px solid #000; padding: 6px;">생년월일</th>
                        <th style="border: 1px solid #000; padding: 6px;">평가<br>점수</th>
                        <th style="border: 1px solid #000; padding: 6px;">연번</th>
                        <th style="border: 1px solid #000; padding: 6px;">교육훈련생<br>이름</th>
                        <th style="border: 1px solid #000; padding: 6px;">생년월일</th>
                        <th style="border: 1px solid #000; padding: 6px;">평가<br>점수</th>
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
                    <span style="position: relative; display: inline-block; margin-left: 5px;">(서명)${globalTeacherSeal ? `<img src="${globalTeacherSeal}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:24px; height:24px; object-fit:contain; opacity:0.85; pointer-events:none; mix-blend-mode:multiply; z-index:1;">` : ''}</span>
                </div>
            `;
            
            document.getElementById('page5').innerHTML = fullHtml;
            if (typeof window.scheduleEvalMobileDocFit === 'function') window.scheduleEvalMobileDocFit(200);
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

        // 💡 [공통 유틸] 지능형 파일명 생성기 (뷰 모드 및 문서 타입 연동)
        function getPdfFileName(docType) {
            // 1. 날짜 포맷팅 (YYYY-MM-DD -> YY.MM.DD)
            let rawDate = currentEvalMode === '본평가' ? document.getElementById('S3_1').value : (currentEvalMode === '추가평가' ? document.getElementById('S3_2').value : document.getElementById('S3_3').value);
            let formattedDate = "미정";
            if (rawDate && rawDate.length >= 10) {
                formattedDate = rawDate.substring(2).replace(/-/g, '.'); // 2026-05-06 -> 26.05.06
            }

            // 2. 네이밍 추출 (뷰 모드에 따라 교과목명 또는 능력단위명 자동 선택)
            let modeBadgeText = document.getElementById('viewModeBadge').innerText;
            let displayName = "이름없음";
            if (modeBadgeText.includes("능력단위별")) {
                displayName = document.getElementById('S1_2').value || document.getElementById('S1_1').value;
            } else {
                displayName = document.getElementById('S1_1').value;
            }

            // 3. 문서 타입별 최종 파일명 조립
            if (docType === 'eval_doc') {
                let prefixCode = currentEvalMode === '본평가' ? '1-1' : (currentEvalMode === '추가평가' ? '1-2' : '1-3');
                return `[${formattedDate}]_[${prefixCode}]_[${displayName}]_(${currentEvalMode}).pdf`;
            } else if (docType === 'result') {
                return `[${formattedDate}]_[2]_[${displayName}]_최종결과표.pdf`;
            } else if (docType === 'evidence') {
                return `[${formattedDate}]_[3]_[${displayName}]_근거사진.pdf`;
            } else if (docType === 'personal') {
                return `[${formattedDate}]_[4]_[${displayName}]_개인내부평가표.pdf`;
            } else if (docType === 'all') {
                return `[${formattedDate}]_[5]_[${displayName}]_근거자료.pdf`;
            }
            return `[${formattedDate}]_[${displayName}].pdf`;
        }

        function sanitizeBlankFinalResultPage(blankResultPage) {
            blankResultPage.setAttribute('data-blank-final-result-page', 'true');

            let nameCell = blankResultPage.querySelector('#final_student_name_cell');
            if (nameCell) nameCell.textContent = "";

            blankResultPage.querySelectorAll('#final_total_score_input').forEach(input => {
                input.value = "";
                input.setAttribute('value', '');
                input.setAttribute('placeholder', '');
            });

            blankResultPage.querySelectorAll('#final_achievement_level').forEach(el => el.textContent = "");
            blankResultPage.querySelectorAll('#pass_check_mark, #fail_check_mark').forEach(el => el.innerHTML = "");
            blankResultPage.querySelectorAll('#feedback_zone, #feedback_inner_text').forEach(el => el.innerHTML = "");
            blankResultPage.querySelectorAll('[id^="print_score_"]').forEach(el => el.textContent = "");

            blankResultPage.querySelectorAll('th').forEach(th => {
                if (th.textContent.replace(/\s/g, '').includes('성취수준')) {
                    let achievementCell = th.nextElementSibling;
                    while (achievementCell && achievementCell.tagName !== 'TD') {
                        achievementCell = achievementCell.nextElementSibling;
                    }
                    if (achievementCell && achievementCell.tagName === 'TD') {
                        achievementCell.innerHTML = `<span id="final_achievement_level" style="font-weight: bold; color: #c0392b; font-size: 15px;"></span><span style="float:right;">단계</span>`;
                    }
                }
            });

            blankResultPage.querySelectorAll('td').forEach(td => {
                const compactText = td.textContent.replace(/\s/g, '');
                if (td.querySelector('#final_achievement_level') || /^[1-5]?단계$/.test(compactText)) {
                    td.innerHTML = `<span id="final_achievement_level" style="font-weight: bold; color: #c0392b; font-size: 15px;"></span><span style="float:right;">단계</span>`;
                }
            });

            blankResultPage.innerHTML = blankResultPage.innerHTML
                .replace(/(<span[^>]*id=["']final_achievement_level["'][^>]*>)\s*[1-5]\s*(<\/span>\s*<span[^>]*>\s*단계\s*<\/span>)/g, '$1$2')
                .replace(/>\s*[1-5]\s*단계\s*</g, '>단계<');
        }

        function sanitizeAllBlankFinalResultPages(rootEl) {
            rootEl.querySelectorAll('[data-blank-final-result-page="true"]').forEach(page => {
                sanitizeBlankFinalResultPage(page);

                page.querySelectorAll('#final_achievement_level').forEach(el => {
                    el.textContent = "";
                    el.style.display = 'none';
                });

                page.querySelectorAll('td').forEach(td => {
                    const compactText = td.textContent.replace(/\s/g, '');
                    if (td.querySelector('#final_achievement_level') || /^[1-5]?단계$/.test(compactText)) {
                        td.innerHTML = `<span id="final_achievement_level" style="display:none; font-weight: bold; color: #c0392b; font-size: 15px;"></span><span style="float:right;">단계</span>`;
                    }
                });
            });
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

                // 평가원장에 들어가는 최종결과표 빈 양식은 인쇄 직전에도 다시 비워
                // 현재 화면에 저장된 성취수준(예: 5단계)이 복제되어 찍히는 것을 막는다.
                if (clone.getAttribute('data-blank-final-result-page') === 'true') {
                    sanitizeBlankFinalResultPage(clone);
                }
                
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
            sanitizeAllBlankFinalResultPages(printContainer);

            // 3. 네이티브 벡터 렌더링을 위한 전용 CSS 강제 주입
            const style = document.createElement('style');
            style.id = 'native-print-style';
            
            // 💡 [비NCS/소양 전용] 드래그 불가 버그는 overflow: visible 로 타파하고, 구조 붕괴를 막기 위해 position과 height는 순정으로 강력하게 락(Lock)을 겁니다.
            let pageHeightRule = window.isCurrentNonNCS ? 'height: 297mm !important; overflow: visible !important;' : 'height: 297mm !important; overflow: hidden !important;';

            style.innerHTML = `
                @media print {
                    body > *:not(#native-print-container) { display: none !important; }
                    
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }
                    
                    /* 💡 출력 컨테이너를 브라우저 좌표 (0,0)에 강제 못질 고정 (absolute 원상 복구) */
                    #native-print-container { 
                        display: block !important; 
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white; 
                    }
                    
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        box-sizing: border-box !important;
                    }
                    
                    @page { size: A4 portrait; margin: 0; }
                    
                    .a4-page { 
                        width: 210mm !important; 
                        ${pageHeightRule}
                        margin: 0 !important; 
                        padding: 20mm !important; 
                        box-shadow: none !important; 
                        page-break-after: always !important; 
                        page-break-inside: avoid !important;
                    }
                    
                    table { border-collapse: collapse !important; border: 1px solid #000 !important; }
                    th, td { 
                        border: 1px solid #000 !important; 
                        border-width: 1px !important;
                        border-color: #000 !important;
                    }
                    .photo-grid-table td.photo-empty-slot {
                        position: relative !important;
                        overflow: visible !important;
                    }
                    .photo-grid-table td.photo-empty-slot::after {
                        content: '' !important;
                        position: absolute !important;
                        top: 0 !important;
                        right: -1px !important;
                        bottom: 0 !important;
                        width: 1px !important;
                        background-color: #000 !important;
                        pointer-events: none !important;
                        z-index: 2 !important;
                    }
                    [data-blank-final-result-page="true"] #final_achievement_level {
                        display: none !important;
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

        // 🚀 버튼(1): [평가 원장] 다운 (선생님이 지정하신 순서대로 결합 및 페이지 자동 넘버링)
        async function downloadPDF_1() {
            if (!document.getElementById('S1_1').value) return await appAlert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            try {
                await buildEvaluationDocs(); 
                await buildEvaluationPaper(); 
                await buildAnswerDocs(); 
                await buildFinalResultDocs();

                let targetElements = [];
                
                // 💡 [순서 1~4] 평가서류 탭(page1)의 4장 (원본 UI 훼손 방지를 위해 모두 복제(cloneNode)하여 추출)
                let pages1 = document.querySelectorAll('#page1 .a4-page');
                if (pages1.length > 0) targetElements.push(pages1[0].cloneNode(true)); // ① 표지
                
                // 💡 [비NCS/소양 전용 회로] PDF 출력 시에도 요구사항/유의사항/빈양식 제외
                if (!window.isCurrentNonNCS) {
                    if (pages1.length > 1) targetElements.push(pages1[1].cloneNode(true)); // ② 지식·기술평가 요구사항
                    if (pages1.length > 2) targetElements.push(pages1[2].cloneNode(true)); // ③ 유의사항
                    if (pages1.length > 3) targetElements.push(pages1[3].cloneNode(true)); // ④ 근거사진 (빈 양식)
                }
                
                // 💡 (참고: 버튼이 포함된 pages6[0] 원본 근거사진은 지시대로 결합 목록에서 완전 배제함)

                // 💡 [순서 5] 최종결과표 (빈 양식)
                let p4orig = document.querySelector('#page4 .a4-page');
                if (p4orig) {
                    let blankResultPage = p4orig.cloneNode(true);
                    sanitizeBlankFinalResultPage(blankResultPage);
                    targetElements.push(blankResultPage);
                }

                // 💡 [순서 6] 평가지 / 시험문제 (앞면·뒷면)
                document.querySelectorAll('#page2 .a4-page').forEach(p => targetElements.push(p.cloneNode(true)));

                // 💡 [비NCS] 순서 7: 근거자료(근거사진) — 표지·최종결과표·시험문제 다음, 채점기준 앞
                if (window.isCurrentNonNCS) {
                    let page6 = document.querySelector('#page6 .a4-page');
                    if (page6) {
                        let page6Clone = page6.cloneNode(true);
                        page6Clone.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
                        targetElements.push(page6Clone);
                    }
                }
                
                // 💡 [순서 8] 모범답안 및 채점기준
                document.querySelectorAll('#page3 .a4-page').forEach(p => targetElements.push(p.cloneNode(true)));

                // 💡 [신규 모터] 병합된 문서 하단에 "페이지 번호"를 처음부터 끝까지 순차적으로 일괄 각인
                targetElements.forEach((el, idx) => {
                    let pageNumDiv = el.querySelector('.cover-page-num');
                    if (pageNumDiv) {
                        pageNumDiv.innerText = `- ${idx + 1} -`;
                    } else {
                        let bottomDiv = el.querySelector('.cover-bottom');
                        if (!bottomDiv) {
                            bottomDiv = document.createElement('div');
                            bottomDiv.className = 'cover-bottom';
                            el.appendChild(bottomDiv);
                        }
                        bottomDiv.innerHTML = `<div class="cover-page-num">- ${idx + 1} -</div>`;
                    }
                });

                let filename = getPdfFileName('eval_doc'); // 💡 신규 생성 엔진 결합
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                await appAlert("PDF 생성 중 오류 발생: " + e.message);
                showPdfLoader(false);
            }
        }

        // 🚀 버튼(2): [최종결과표 전체 pdf다운]
        async function downloadPDF_2() {
            if (!document.getElementById('S1_1').value) return await appAlert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            try {
                await buildFinalResultDocs();
                let studentBtns = document.querySelectorAll('.student-select-btn');
                if (studentBtns.length === 0) {
                    showPdfLoader(false);
                    return await appAlert("출력할 훈련생 명단이 없습니다.");
                }

                let targetElements = [];
                for (let btn of studentBtns) {
                    let stuName = btn.innerText;

                    let badge = document.getElementById(`stu_score_badge_${stuName}`);
                    if (badge && (badge.innerText.includes("중도탈락") || badge.innerText.includes("조기수료"))) {
                        continue;
                    }

                    let nameCell = document.getElementById('final_student_name_cell');
                    if (nameCell) nameCell.innerText = stuName;
                    window.loadStudentState(stuName);
                    
                    let page = document.querySelector('#page4 .a4-page');
                    if (page) {
                        // 💡 [단선 복구] cloneNode 전 입력 폼 값 속성 강제 동기화 (최종 점수 증발 방지)
                        page.querySelectorAll('input').forEach(inp => inp.setAttribute('value', inp.value));
                        page.querySelectorAll('textarea').forEach(ta => ta.innerHTML = ta.value);

                        let clone = page.cloneNode(true);
                        clone.querySelectorAll('.no-print').forEach(el => el.style.display = 'none');
                        targetElements.push(clone);
                    }
                }

                if(studentBtns.length > 0) {
                    let nameCell = document.getElementById('final_student_name_cell');
                    if (nameCell) nameCell.innerText = studentBtns[0].innerText;
                    window.loadStudentState(studentBtns[0].innerText);
                }

                let filename = getPdfFileName('result'); 
                await generateMergedPDF(targetElements.filter(e => e), filename);
            } catch (e) {
                await appAlert("PDF 생성 중 오류 발생: " + e.message);
                showPdfLoader(false);
            }
        }


        // 🚀 버튼(신규): [근거사진 pdf다운]
        async function downloadPDF_evidence() {
            if (!document.getElementById('S1_1').value) return await appAlert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            try {
                await buildEvaluationDocs(); // 💡 page6 생성을 위해 렌더링 가동
                let page6 = document.querySelector('#page6 .a4-page');
                let targetElements = [];
                if(page6) targetElements.push(page6);
                
                let filename = getPdfFileName('evidence'); // 💡 신규 생성 엔진 결합
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                await appAlert("PDF 생성 중 오류 발생: " + e.message);
                showPdfLoader(false);
            }
        }


        // 🚀 버튼(3): [개인내부평가표 pdf다운]
        async function downloadPDF_3() {
            if (!document.getElementById('S1_1').value) return await appAlert("평가 대상을 먼저 선택하세요.");
            showPdfLoader(true);
            
            try {
                await buildPersonalEvalDocs();
                let page5 = document.querySelector('#page5 .a4-page');
                let targetElements = [];
                if(page5) targetElements.push(page5);
               
                let filename = getPdfFileName('personal'); // 💡 신규 생성 엔진 결합
                await generateMergedPDF(targetElements, filename);
            } catch (e) {
                await appAlert("PDF 생성 중 오류 발생: " + e.message);
                showPdfLoader(false);
            }
        }

        // 🚀 버튼(4): [전체서류 pdf다운]
        async function downloadPDF_4_All() {
            if (!document.getElementById('S1_1').value) return await appAlert("평가 대상을 먼저 선택하세요.");
            await appAlert("전체 서류가 [하나의 완벽한 벡터 PDF 파일]로 통합 출력됩니다.\n\n✅ 화면에 인쇄 창이 뜨면, 대상을 'PDF로 저장'으로 맞추고 저장해 주십시오!");
            showPdfLoader(true);
            
            try {
                await buildEvaluationDocs(); 
                await buildEvaluationPaper(); 
                await buildAnswerDocs(); 
                await buildFinalResultDocs();

                let allElements = [];
                
                let p1_0 = document.querySelectorAll('#page1 .a4-page')[0];
                if(p1_0) allElements.push(p1_0);
                
                let p4orig = document.querySelector('#page4 .a4-page');
                if (p4orig) {
                    let blankResultPage = p4orig.cloneNode(true);
                    sanitizeBlankFinalResultPage(blankResultPage);
                    blankResultPage.querySelectorAll('div').forEach(div => {
                        if (div.style.mixBlendMode === 'multiply' && div.style.backgroundImage) {
                            div.style.width = '24px'; div.style.height = '24px';
                        }
                    });
                    allElements.push(blankResultPage);
                }

                // 💡 분리된 [3.근거자료] 페이지를 기존 순서에 맞게 추출 결합
                let pages6 = document.querySelectorAll('#page6 .a4-page');
                if (pages6.length > 0) allElements.push(pages6[0]);

                let pages1 = document.querySelectorAll('#page1 .a4-page');
                // 💡 [비NCS/소양 전용 회로] 전체 통합 PDF 출력 시에도 요구사항/유의사항/빈양식 제외
                if (!window.isCurrentNonNCS) {
                    if(pages1.length > 3) allElements.push(pages1[3]); // 💡 복원: 평가원장의 빈 양식 추가
                    if(pages1.length > 1) allElements.push(pages1[1]);
                    if(pages1.length > 2) allElements.push(pages1[2]);
                }
               
                let pages2 = document.querySelectorAll('#page2 .a4-page');
                if(pages2.length > 0) allElements.push(pages2[0]);
                if(pages2.length > 1) allElements.push(pages2[1]);
                document.querySelectorAll('#page3 .a4-page').forEach(p => allElements.push(p));

                let studentBtns = document.querySelectorAll('.student-select-btn');
                for (let btn of studentBtns) {
                    let stuName = btn.innerText;
                    let nameCell = document.getElementById('final_student_name_cell');
                    if(nameCell) nameCell.innerText = stuName;
                    window.loadStudentState(stuName);
                    
                    let page = document.querySelector('#page4 .a4-page');
                    if (page) {
                        // 💡 [단선 복구] cloneNode 전 입력 폼 값 속성 강제 동기화 (최종 점수 증발 방지)
                        page.querySelectorAll('input').forEach(inp => inp.setAttribute('value', inp.value));
                        page.querySelectorAll('textarea').forEach(ta => ta.innerHTML = ta.value);
                        
                        allElements.push(page.cloneNode(true));
                    }
                }
                if(studentBtns.length > 0) {
                    // UI 원상 복구
                    document.getElementById('final_student_name_cell').innerText = studentBtns[0].innerText;
                    window.loadStudentState(studentBtns[0].innerText);
                }

                await buildPersonalEvalDocs(); 
                let p5 = document.querySelector('#page5 .a4-page');
                if(p5) allElements.push(p5);

                let filename = getPdfFileName('all'); // 💡 신규 생성 엔진 결합
               
                // 모든 페이지를 하나의 인쇄 대기열에 올리고 네이티브 엔진 가동
                
                await generateMergedPDF(allElements.filter(e => e), filename); // null 필터링
            } catch (e) {
                await appAlert("PDF 생성 중 오류 발생: " + e.message);
                showPdfLoader(false);
            }
        }


    // 💡 [모바일] refreshClassHud(common-class-db.js)가 학급·기수명 및 마퀴를 처리
document.addEventListener('DOMContentLoaded', () => {
    if (typeof refreshClassHud === 'function') refreshClassHud();
});

document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggleBtn = document.getElementById('btnSidebarToggle');
    if (!sidebarToggleBtn) return;

    const applySidebarState = (isCollapsed) => {
        document.body.classList.toggle('sidebar-collapsed', isCollapsed);
        sidebarToggleBtn.innerText = isCollapsed ? '목차 펼치기 ▶' : '◀ 목차 접기';
        sidebarToggleBtn.title = isCollapsed ? '과목 목록 펼치기' : '과목 목록 접기';
    };

    // 페이지에 새로 들어올 때는 항상 열린 상태로 시작하고,
    // 같은 페이지 안에서 이동할 때만 현재 접힘 상태를 유지한다.
    applySidebarState(false);

    sidebarToggleBtn.addEventListener('click', () => {
        const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
        applySidebarState(nextCollapsed);
        if (typeof window.scheduleAverageMobileFit === 'function') {
            window.scheduleAverageMobileFit(220);
        }
    });
});

// 💡 [모바일 전용 모터] '이전' 버튼 클릭 시 모바일 메뉴로 안전하게 귀환
window.goToMobileMenu = function() {
    if (typeof currentClass !== 'undefined') {
        window.location.href = classNavHref('../start/모바일매뉴.html');
    } else {
        window.history.back(); // 비상시 브라우저 뒤로가기
    }
};

// =========================================================================
// 📍 [신규 모터] S5 평가계획관리 전용 자동 스캐너 및 클립보드 복사 엔진
// =========================================================================

// 1. 과목 선택 시 장비 목록 및 텍스트 전체 갱신
window.updateS5Panel = function(stdData) {
    // [장비 목록 렌더링]
    let equipHtml = "";
    let equipments = stdData && stdData.equipments ? stdData.equipments : [];
    
    if (equipments.length > 0) {
        equipHtml = `<table style="width:100%; border-collapse:collapse; font-size:11px; text-align:center;">
            <tr style="background:#ecf0f1;">
                <th style="border:1px solid #bdc3c7; padding:4px;">장비명</th>
                <th style="border:1px solid #bdc3c7; padding:4px; width:20%;">단위</th>
                <th style="border:1px solid #bdc3c7; padding:4px; width:25%;">활용구분</th>
            </tr>`;
        equipments.forEach(eq => {
            equipHtml += `<tr>
                <td style="border:1px solid #bdc3c7; padding:4px; text-align:left;">${eq.name||'-'}</td>
                <td style="border:1px solid #bdc3c7; padding:4px;">${eq.unit||'-'}</td>
                <td style="border:1px solid #bdc3c7; padding:4px;">${eq.type||'-'}</td>
            </tr>`;
        });
        equipHtml += `</table>`;
    } else {
        equipHtml = `<div style="text-align:center; color:#e74c3c; padding:15px; font-weight:bold;">등록된 장비가 없습니다.</div>`;
    }
    
    const equipBox = document.getElementById('s5_equip_list');
    if (equipBox) equipBox.innerHTML = equipHtml;

    // [평가의 구성 렌더링 호출]
    if (typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
};

// 2. [평가의 구성] 텍스트 실시간 추적 및 합성
window.updateS5EvalConfigText = function() {
    let text = "※ 지급된 재료 및 장비를 사용하여 아래 작업을 완성하시오.\n\n";
    let rows = document.querySelectorAll('#evalItemTbody tr.eval-main-row');
    
    if (rows.length === 0) {
        text += "평가 항목이 없습니다.";
    } else {
        if (window.isCurrentNonNCS && window.isIntegratedInputMode) {
            // 💡 [통합 입력 모드] 평가항목 목록만 나열 후 하단에 총합 표기
            rows.forEach((tr, idx) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();
                text += `[제 ${idx+1} 평가항목] ${name}\n`;
            });
            
            let totalQCount = document.querySelectorAll('#global_q_list .q-item').length;
            let totalScore = 0;
            document.querySelectorAll('#global_q_list .non-ncs-score').forEach(inp => totalScore += Number(inp.value) || 0);
            
            text += `\n총 ${totalQCount}문제 총 ${totalScore}점\n`;
        } else {
            rows.forEach((tr, idx) => {
                let name = tr.querySelector('.item-name input') ? tr.querySelector('.item-name input').value : tr.querySelector('.item-name').innerText;
                name = name.replace(/^\d+\.\s*/, '').trim();

                let score = tr.querySelector('input[type="number"]')?.value || 0;
                let qRow = tr.nextElementSibling;
                
                if (window.isCurrentNonNCS) {
                    // 💡 [개별 입력 모드] 기존 유지
                    let qCount = qRow ? qRow.querySelectorAll('.q-item').length : 0;
                    text += `[제 ${idx+1} 평가항목] ${name} ${qCount}문제 총 ${score}점\n`;
                } else {
                    // 💡 [NCS 모드] 기존 방식 유지
                    let qText = "○문제가 입력되지 않았습니다.";
                    if (qRow && qRow.classList.contains('eval-question-row')) {
                        let ta = qRow.querySelector('.eval-question-input');
                        if (ta && ta.value.trim() !== "") {
                            qText = ta.value.trim();
                            if (!qText.startsWith('○')) qText = '○' + qText;
                        }
                    }
                    text += `[제${idx+1} 평가항목] ${name}\n${qText}\n\n`;
                }
            });
        }
    }
    
    let evalConfigBox = document.getElementById('s5_eval_config');
    if(evalConfigBox) {
        evalConfigBox.innerText = text.trim();
        evalConfigBox.dataset.copyText = text.trim(); 
    }
};

// 3. 클릭 시 클립보드 복사 실행
window.copyS5Text = async function(elementId, typeName) {
    if (elementId === 's5_eval_config') window.updateS5EvalConfigText(); // 최신화 보장

    let el = document.getElementById(elementId);
    if (!el) return;
    let textToCopy = el.dataset.copyText || el.innerText;
    
    // 브라우저 클립보드 API 가동
    navigator.clipboard.writeText(textToCopy).then(() => {
        let originalBg = el.style.backgroundColor;
        let oldText = el.innerText;
        
        el.style.backgroundColor = "#d5f5e3";
        el.style.color = "#27ae60";
        el.style.fontWeight = "bold";
        el.innerText = `✅ [${typeName}] 복사 완료!\n(붙여넣기 하세요)`;
        
        setTimeout(() => {
            el.style.backgroundColor = originalBg;
            el.style.color = "";
            el.style.fontWeight = "normal";
            el.innerText = oldText;
        }, 1200);
    }).catch(async (err) => {
        await appAlert("❌ 클립보드 복사 권한이 필요합니다.");
    });
};

// 4. S4 표 내부의 모든 물리적 변화(타이핑, 마우스클릭, 붙여넣기) 3중 실시간 감지 센서
const syncS5Panel = function(e) {
    if (e.target.closest('#evalItemTbody')) {
        if(typeof window.updateS5EvalConfigText === 'function') window.updateS5EvalConfigText();
    }
};

document.addEventListener('input', syncS5Panel);
document.addEventListener('change', syncS5Panel);
document.addEventListener('keyup', syncS5Panel);
// =========================================================================

// =========================================================================
// 📱 A4 서류 모바일 실기기 맞춤 (Go Live/DevTools와 실제 폰 Safari·Chrome 동일 동작)
// =========================================================================
window.applyEvalMobileDocFit = function applyEvalMobileDocFit(retryCount) {
    retryCount = retryCount || 0;
    const MOBILE_MAX = 850;
    const MOBILE_PAGE_GAP = 6;
    const isMobile = window.innerWidth <= MOBILE_MAX;
    const activeOwner = document.querySelector('.page-frame.active, .page1-container.active, .eval-paper-container.active');
    const pages = (isMobile && activeOwner)
        ? activeOwner.querySelectorAll('.a4-page')
        : document.querySelectorAll('.a4-page');
    var needsRetry = false;

    pages.forEach(function (page) {
        if (page.closest('#page7')) return;

        var fit = page.parentElement;
        if (!fit || !fit.classList.contains('a4-page-fit')) {
            fit = document.createElement('div');
            fit.className = 'a4-page-fit';
            page.parentNode.insertBefore(fit, page);
            fit.appendChild(page);
        }

        page.style.zoom = '';
        page.style.removeProperty('--eval-mobile-scale');

        if (!isMobile) {
            page.style.transform = '';
            page.style.webkitTransform = '';
            page.style.zoom = '';
            page.style.marginBottom = '';
            page.style.overflow = '';
            fit.style.height = '';
            fit.style.minHeight = '';
            fit.style.overflowY = '';
            fit.style.overflowX = '';
            fit.style.marginBottom = '';
            return;
        }

        if (window.getComputedStyle(page).display === 'none') {
            page.style.zoom = '';
            page.style.transform = '';
            page.style.webkitTransform = '';
            fit.style.height = '';
            fit.style.marginBottom = '0';
            return;
        }

        page.style.transform = 'none';
        page.style.webkitTransform = 'none';
        page.style.zoom = '1';
        var fullW = Math.max(page.offsetWidth, page.scrollWidth);
        var fullH = Math.max(page.offsetHeight, page.scrollHeight);
        if (fullW <= 0 || fullH <= 0) {
            needsRetry = true;
            return;
        }

        var container = document.querySelector('.main-content');
        var avail = container && container.clientWidth > 0
            ? container.clientWidth - 8
            : ((window.visualViewport && window.visualViewport.width) || window.innerWidth) - 8;
        var scale = Math.min(1, avail / fullW);
        var isCoverSheet = !!page.querySelector('#watermark_logo');

        page.style.zoom = scale;
        page.style.transform = 'none';
        page.style.webkitTransform = 'none';
        page.style.transformOrigin = 'top left';
        page.style.textAlign = 'left';
        page.style.marginBottom = '0';
        page.style.overflow = isCoverSheet ? 'hidden' : '';
        void page.offsetHeight;

        var visualH;
        if (isCoverSheet) {
            visualH = fullH * scale;
        } else {
            visualH = page.getBoundingClientRect().height;
            if (visualH <= 1) {
                page.style.zoom = '';
                page.style.transform = 'scale(' + scale + ')';
                page.style.webkitTransform = 'scale(' + scale + ')';
                void page.offsetHeight;
                visualH = page.getBoundingClientRect().height;
            }
            if (visualH <= 1) visualH = fullH * scale;
        }

        fit.style.width = '100%';
        fit.style.overflowX = 'auto';
        fit.style.overflowY = 'hidden';
        fit.style.height = Math.ceil(visualH) + 'px';
        fit.style.marginBottom = MOBILE_PAGE_GAP + 'px';
    });

    if (isMobile && activeOwner) {
        var fitWrappers = activeOwner.querySelectorAll('.a4-page-fit');
        if (fitWrappers.length) {
            fitWrappers[fitWrappers.length - 1].style.marginBottom = '0';
        }
    }

    if (needsRetry && retryCount < 10) {
        setTimeout(function () { window.applyEvalMobileDocFit(retryCount + 1); }, 150);
    }

    if (isMobile && document.getElementById('page7') && document.getElementById('page7').classList.contains('active')) {
        if (typeof window.scheduleAverageMobileFit === 'function') window.scheduleAverageMobileFit(0);
    }
};

window.scheduleEvalMobileDocFit = function scheduleEvalMobileDocFit(delayMs) {
    clearTimeout(window._evalMobileFitTimer);
    window._evalMobileFitTimer = setTimeout(function () {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                window.applyEvalMobileDocFit(0);
            });
        });
    }, typeof delayMs === 'number' ? delayMs : 80);
};

(function initEvalMobileDocFitWatchers() {
    function onLayoutChange() {
        window.scheduleEvalMobileDocFit();
    }
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('orientationchange', onLayoutChange);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onLayoutChange);
    }
    document.addEventListener('DOMContentLoaded', onLayoutChange);
    var main = document.querySelector('.main-content');
    if (main && typeof MutationObserver !== 'undefined') {
        new MutationObserver(onLayoutChange).observe(main, { childList: true, subtree: true });
    }
})();

// =========================================================================
// 📱 전 과목 평균(page7) 모바일 — 화면 크기 유지 + 표 스크롤
// =========================================================================
window.resetAverageMobileFit = function resetAverageMobileFit() {
    var table = document.getElementById('averageScoreTable');
    var wrap = document.getElementById('averageTableScaleWrap');
    var shell = document.querySelector('#page7 .average-panel-shell');
    var viewport = document.getElementById('averageTableScroll');
    if (shell) shell.style.height = '';
    if (viewport) {
        viewport.style.height = '';
        viewport.style.maxHeight = '';
        viewport.style.flex = '';
        viewport.style.overflow = '';
        viewport.style.overflowX = '';
        viewport.style.overflowY = '';
    }
    if (wrap) {
        wrap.style.height = '';
        wrap.style.width = '';
        wrap.style.overflow = '';
    }
    if (!table) return;
    table.style.transform = '';
    table.style.webkitTransform = '';
    table.style.fontSize = '';
    table.querySelectorAll('tr').forEach(function (tr) {
        tr.style.height = '';
        tr.style.maxHeight = '';
        tr.querySelectorAll('td, th').forEach(function (cell) {
            cell.style.padding = '';
            cell.style.fontSize = '';
            cell.style.lineHeight = '';
            cell.style.maxHeight = '';
            cell.style.minHeight = '';
            cell.style.overflow = '';
            cell.style.height = '';
        });
    });
    table.querySelectorAll('.average-mobile-subj-label').forEach(function (el) {
        el.style.minHeight = '';
        el.style.maxHeight = '';
        el.style.height = '';
        el.style.overflow = '';
        el.style.display = '';
        el.style.alignItems = '';
        el.style.justifyContent = '';
    });
    table.querySelectorAll('.average-mobile-subj-avg').forEach(function (el) {
        el.style.position = '';
        el.style.bottom = '';
        el.style.left = '';
        el.style.right = '';
        el.style.marginTop = '';
    });
};

window.applyAverageMobileFit = function applyAverageMobileFit(retryCount) {
    retryCount = retryCount || 0;
    var MOBILE_MAX = 850;
    if (window.innerWidth > MOBILE_MAX) {
        window.resetAverageMobileFit();
        return;
    }

    var page7 = document.getElementById('page7');
    if (!page7 || !page7.classList.contains('active')) return;

    var shell = page7.querySelector('.average-panel-shell');
    var viewport = document.getElementById('averageTableScroll');
    var wrap = document.getElementById('averageTableScaleWrap');
    var table = document.getElementById('averageScoreTable');
    if (!shell || !viewport || !wrap || !table) return;

    shell.style.height = '';
    shell.style.minHeight = '';
    shell.style.overflow = '';

    table.style.transform = 'none';
    table.style.webkitTransform = 'none';
    wrap.style.height = '';
    wrap.style.width = '';
    wrap.style.overflow = '';
    table.querySelectorAll('tbody tr').forEach(function (tr) {
        tr.style.height = '';
        tr.style.maxHeight = '';
        tr.querySelectorAll('td').forEach(function (td) {
            td.style.padding = '';
            td.style.fontSize = '';
            td.style.lineHeight = '';
        });
    });
    table.querySelectorAll('thead th').forEach(function (th) {
        th.style.padding = '';
        th.style.fontSize = '';
        th.style.lineHeight = '';
        th.style.maxHeight = '';
        th.style.minHeight = '';
        th.style.overflow = '';
        th.style.height = '';
    });
    table.querySelectorAll('.average-mobile-subj-label').forEach(function (el) {
        el.style.minHeight = '';
        el.style.maxHeight = '';
        el.style.height = '';
        el.style.overflow = '';
        el.style.display = '';
        el.style.alignItems = '';
        el.style.justifyContent = '';
    });
    table.querySelectorAll('.average-mobile-subj-avg').forEach(function (el) {
        el.style.position = '';
        el.style.bottom = '';
        el.style.left = '';
        el.style.right = '';
        el.style.marginTop = '';
    });

    var sidebar = document.querySelector('.sidebar');
    var harness = document.getElementById('globalMainHarness');
    var header = shell.querySelector('.average-panel-header');
    var usedH = (sidebar ? sidebar.offsetHeight : 0)
        + (harness ? harness.offsetHeight : 0)
        + (header ? header.offsetHeight : 0)
        + 12;
    var maxH = Math.max(160, window.innerHeight - usedH);

    viewport.style.flex = 'none';
    viewport.style.minHeight = '0';
    viewport.style.height = '';
    viewport.style.maxHeight = maxH + 'px';
    viewport.style.overflowX = 'auto';
    viewport.style.overflowY = 'auto';
    viewport.style.webkitOverflowScrolling = 'touch';
    viewport.style.touchAction = 'pan-x pan-y';

    if (viewport.clientHeight <= 0 && retryCount < 8) {
        setTimeout(function () { window.applyAverageMobileFit(retryCount + 1); }, 120);
        return;
    }

    var topSpacer = document.getElementById('averageTopScrollSpacer');
    if (topSpacer) topSpacer.style.width = table.scrollWidth + 'px';

    if (typeof window.syncMobileAverageHeaderRow === 'function') {
        window.syncMobileAverageHeaderRow();
    }
};

// 📱 모바일 전용: (1) 표시 과목명만 10px·열 너비로 최대 줄높이 산정 (2) 평균 박스는 모든 열 맨 아래 고정
window.syncMobileAverageHeaderRow = function syncMobileAverageHeaderRow(retryCount) {
    retryCount = retryCount || 0;
    var MOBILE_MAX = 850;
    if (window.innerWidth > MOBILE_MAX) return;

    var table = document.getElementById('averageScoreTable');
    if (!table) return;

    var subjectThs = table.querySelectorAll('thead tr:first-child th.average-mobile-subj-th');
    if (!subjectThs.length) return;

    var colWidth = Math.max(40, subjectThs[0].clientWidth - 4);
    if (colWidth < 40 && retryCount < 8) {
        setTimeout(function () { window.syncMobileAverageHeaderRow(retryCount + 1); }, 90);
        return;
    }

    var probe = document.getElementById('averageMobileLabelProbe');
    if (!probe) {
        probe = document.createElement('div');
        probe.id = 'averageMobileLabelProbe';
        probe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(probe);
    }
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box;' +
        'font-size:10px;line-height:1.15;padding:0 1px;text-align:center;word-break:keep-all;overflow-wrap:anywhere;' +
        'white-space:normal;overflow:hidden;width:' + colWidth + 'px;';

    var maxLabelH = 0;
    subjectThs.forEach(function (th) {
        var label = th.querySelector('.average-mobile-subj-label');
        if (!label) return;
        probe.textContent = label.textContent.trim();
        maxLabelH = Math.max(maxLabelH, Math.ceil(probe.scrollHeight), Math.ceil(probe.offsetHeight));
    });

    var avgSample = table.querySelector('thead .average-mobile-subj-avg');
    var avgLineH = avgSample ? Math.max(11, Math.ceil(avgSample.offsetHeight)) : 12;
    var padTop = 2;
    var padBottom = 2;
    var rowMin = padTop + maxLabelH + padBottom + avgLineH + 2;

    table.querySelectorAll('thead tr:first-child th').forEach(function (th) {
        th.style.minHeight = rowMin + 'px';
        th.style.height = 'auto';
        th.style.maxHeight = 'none';
        th.style.overflow = 'hidden';
        th.style.paddingBottom = (avgLineH + padBottom) + 'px';
        th.style.paddingTop = padTop + 'px';
    });

    subjectThs.forEach(function (th) {
        var innerW = Math.max(40, th.clientWidth - 4);
        var label = th.querySelector('.average-mobile-subj-label');
        if (label) {
            label.style.height = maxLabelH + 'px';
            label.style.minHeight = maxLabelH + 'px';
            label.style.maxHeight = maxLabelH + 'px';
            label.style.maxWidth = innerW + 'px';
            label.style.overflow = 'hidden';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.justifyContent = 'center';
            label.style.boxSizing = 'border-box';
        }
        var avg = th.querySelector('.average-mobile-subj-avg');
        if (avg) {
            avg.style.position = 'absolute';
            avg.style.bottom = padBottom + 'px';
            avg.style.left = '2px';
            avg.style.right = '2px';
            avg.style.maxWidth = innerW + 'px';
            avg.style.marginTop = '0';
        }
    });
};

window.scheduleAverageMobileFit = function scheduleAverageMobileFit(delayMs) {
    clearTimeout(window._averageMobileFitTimer);
    window._averageMobileFitTimer = setTimeout(function () {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                window.applyAverageMobileFit(0);
            });
        });
    }, typeof delayMs === 'number' ? delayMs : 80);
};

(function initAverageMobileFitWatchers() {
    function onLayoutChange() {
        if (document.getElementById('page7') && document.getElementById('page7').classList.contains('active')) {
            window.scheduleAverageMobileFit(100);
        }
    }
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('orientationchange', onLayoutChange);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onLayoutChange);
    }
})();

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 모든 배선 숨기기 및 이벤트 위임

document.addEventListener('DOMContentLoaded', () => {
    // 1. 시크릿 도어 연결
    document.getElementById('btn_secret_door').addEventListener('click', triggerSecretDoor);

    // 2. 모바일 및 메인 네비게이션
    document.getElementById('btn_mobile_back')?.addEventListener('click', goToMobileMenu);

    // 3. 0~5번 탭 메뉴 네비게이션 (이벤트 위임)
    document.getElementById('docMenuArea').addEventListener('click', function(e) {
        const pageBtn = e.target.closest('.dynamic-show-page');
        if (pageBtn) {
            showPage(pageBtn.getAttribute('data-page'), pageBtn);
        }
    });

    // 4. 모드 전환 버튼 뭉치 (이벤트 위임 - 0.설정 및 글로벌 모드 바 공통)
    document.addEventListener('click', function(e) {
        const switchBtn = e.target.closest('.dynamic-switch-eval');
        if (switchBtn) {
            switchEvalType(switchBtn.getAttribute('data-type'));
        }
    });

    // 5. ⚙️ 평가 기본 설정 패널 내 버튼들
    document.getElementById('btn_execute_save').addEventListener('click', executeSave);
    document.getElementById('btn_toggle_eval_complete').addEventListener('click', toggleEvalComplete);
    document.getElementById('btn_upload_common').addEventListener('click', uploadCommonEval);
    document.getElementById('btn_download_common').addEventListener('click', downloadCommonEval);
    document.getElementById('btn_reset_eval').addEventListener('click', resetEvalData);
    document.getElementById('btn_delete_common').addEventListener('click', deleteCommonEval);

    // 6. 🖨️ 통합 PDF 프린터 버튼들
    document.getElementById('btn_pdf_1').addEventListener('click', downloadPDF_1);
    document.getElementById('btn_pdf_2').addEventListener('click', downloadPDF_2);
    document.getElementById('btn_pdf_evidence').addEventListener('click', downloadPDF_evidence); // 💡 신규 배선
    document.getElementById('btn_pdf_3').addEventListener('click', downloadPDF_3);
    document.getElementById('btn_go_attendance').addEventListener('click', () => {
        window.location.href = classNavHref('../start/능력단위시간표.html', 'mode=main');
    });
    document.getElementById('btn_pdf_all').addEventListener('click', downloadPDF_4_All);

    // 7. 좌측 셀렉트 박스 (change 이벤트)
    document.getElementById('ncsVersionSelect').addEventListener('change', changeNcsVersion);
    document.getElementById('individualNcsSelect').addEventListener('change', changeIndividualNcs);
    document.getElementById('btnModeSubject').addEventListener('click', () => manualSwitchViewMode('subject'));
    document.getElementById('btnModeNcs').addEventListener('click', () => manualSwitchViewMode('ncs'));

    // 8. 취소 및 닫기 버튼들 (pwModal)
    document.getElementById('btn_pw_cancel')?.addEventListener('click', closePwModal);
});

// =========================================================================
        // 📍 [신규 모터] 전 과목 평균 점수판 및 엑셀 다운로드 엔진
        // =========================================================================
        window.showAverageScores = async function() {
            // 1. 화면 초기화 및 기존 UI 닫기
            if (window.CustomMatrixEngine) window.CustomMatrixEngine.closeEditor();
            document.querySelectorAll('.page-frame, .page1-container, .eval-paper-container').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-btn, .unit-btn').forEach(b => b.classList.remove('active'));
            
            document.getElementById('btn_show_average').classList.add('active');
            updateCollapsedDocNavActive('page7');
            
            let page7 = document.getElementById('page7');
            if(!page7) return;
            page7.classList.add('active');

            const globalBar = document.getElementById('globalModeBar');
            if (globalBar) globalBar.style.display = 'none';

            page7.innerHTML = `<div class="average-panel-shell"><div style="text-align:center; font-size:18px; font-weight:bold; color:#2980b9; padding:50px;">⏳ 전체 평가 데이터를 융합하여 분석 중입니다...</div></div>`;

            try {
                // 2. 통합 점수 DB 및 계획(날짜/과목명) DB 긁어오기 (본평가만 집중 추적)
                const [scoresSnap, plansSnap] = await Promise.all([
                    classDbRef('evalScores/본평가').once('value'),
                    classDbRef('evalPlans/본평가').once('value')
                ]);

                const scoresData = scoresSnap.val() || {};
                const plansData = plansSnap.val() || {};

                // 💡 [신규 배선] 기준점을 점수 DB가 아닌 전체 교육과정(globalCoursesData)으로 변경
                if (!globalCoursesData || globalCoursesData.length === 0) {
                    page7.innerHTML = `<div class="average-panel-shell"><div style="text-align:center; color:#e74c3c; font-weight:bold; padding:50px;">⚠️ 등록된 전체 교과목 데이터가 없습니다.</div></div>`;
                    return;
                }

                // 3. 컬럼(과목) 메타데이터 생성 (전체 과목 기준) 및 평가일 순 정렬
                const isSubjectAvgMode = (document.getElementById('viewModeBadge')?.innerText || '').includes('교과목');
                let subjectDetailsMap = {};
                
                globalCoursesData.forEach(c => {
                    let subject = c.subject;
                    let unitNameOnly = String(c.unit || "");
                    const codePatternMatch = unitNameOnly.match(/[0-9]{8,}_[0-9]+v[0-9]+/i);
                    const bracketMatch = unitNameOnly.match(/\[(.*?)\]/); 
                    if (codePatternMatch) unitNameOnly = unitNameOnly.replace(codePatternMatch[0], "").trim();
                    else if (bracketMatch) unitNameOnly = unitNameOnly.replace(bracketMatch[0], "").trim();
                    unitNameOnly = unitNameOnly.replace(/^[\[\]\s]+/, "").trim();

                    let dbKey = (subject + "_" + (unitNameOnly || "종합")).replace(/[\.\#\$\/\[\]]/g, '');
                    
                    // 💡 [신규 배선] 3가지 평가일자 동시 추출 및 포맷팅
                    let dateMain = plansData[dbKey] ? (plansData[dbKey].dateMain || "") : "";
                    let dateAdd = plansData[dbKey] ? (plansData[dbKey].dateAdd || "") : "";
                    let dateRe = plansData[dbKey] ? (plansData[dbKey].dateRe || "") : "";

                    // 본평가일자가 비어있다면 기존의 지능형 역추적 가동
                    if (!dateMain) {
                        let eDate = getEvalDateFromCalendar(subject, unitNameOnly);
                        if (eDate) dateMain = eDate;
                        else {
                            let endDate = "";
                            globalFullTimetable.forEach(row => {
                                let rowUnit = String(row['능력단위'] || "").trim();
                                const bMatch = rowUnit.match(/\[(.*?)\]/);
                                if (bMatch) rowUnit = rowUnit.replace(bMatch[0], "").trim();
                                if (row['교과목'] && row['교과목'].trim() === subject && rowUnit === unitNameOnly && row['날짜']) {
                                    if (row['날짜'] > endDate) endDate = row['날짜'];
                                }
                            });
                            if (endDate) dateMain = endDate;
                        }
                    }

                    const formatYMD = (d) => {
                        if (!d || d === "9999-99-99") return "-";
                        let cleanDate = d.replace(/[\.\/]/g, '-').replace(/\s/g, '');
                        let parts = cleanDate.split('-');
                        if (parts.length >= 3) {
                            let yy = parts[0].length === 4 ? parts[0].substring(2) : parts[0];
                            return `${yy}.${parts[1].padStart(2, '0')}.${parts[2].padStart(2, '0')}`;
                        }
                        return d;
                    };

                    let headerLabel = isSubjectAvgMode
                        ? subject
                        : ((unitNameOnly && unitNameOnly !== "종합") ? unitNameOnly : subject);

                    subjectDetailsMap[dbKey] = { 
                        dbKey, 
                        date: dateMain || "9999-99-99", 
                        fmtMain: formatYMD(dateMain),
                        fmtAdd: formatYMD(dateAdd),
                        fmtRe: formatYMD(dateRe),
                        name: headerLabel,
                        mobileLabel: headerLabel
                    };
                });

                let subjectDetails = Object.values(subjectDetailsMap);
                subjectDetails.sort((a, b) => a.date.localeCompare(b.date));

                // 4. 학생 목록 세팅 (출석부 기준 + 영구삭제자 제외)
                let allStudents = new Set();
                if (globalAttendanceData) {
                    Object.values(globalAttendanceData).forEach(day => {
                        Object.keys(day).forEach(stu => {
                            if (stu !== '_metadata' && !globalDeletedLogs[stu]) allStudents.add(stu);
                        });
                    });
                }
                
                let studentsObj = {};
                allStudents.forEach(stu => {
                    studentsObj[stu] = { total: 0, count: 0, scores: {} };
                });

                // 5. 💡 [신규 배선] 평가 모드(본/추가/재) 정보 100% 매핑 및 연산
                subjectDetails.forEach(sub => {
                    let dbKey = sub.dbKey;
                    let subScores = scoresData[dbKey] || {};
                    let targetDate = sub.date !== "9999-99-99" ? sub.date : "";
                    
                    Object.keys(studentsObj).forEach(stu => {
                        let sVal = "-";
                        let sMode = "본평가";
                        
                        // 미래/과거 불문하고 해당 과목의 평가일자 기준 중도탈락/조기수료 자동 판독
                        if (targetDate && globalDropoutData[stu] && targetDate >= globalDropoutData[stu]) {
                            sVal = "중도탈락";
                        } else if (targetDate && globalEarlyCompletionData[stu] && targetDate >= globalEarlyCompletionData[stu]) {
                            sVal = "조기수료";
                        } else if (subScores[stu] && subScores[stu].totalScore !== undefined && subScores[stu].totalScore !== "-") {
                            sVal = subScores[stu].totalScore;
                            sMode = subScores[stu].savedMode || "본평가";
                        }
                        
                        studentsObj[stu].scores[dbKey] = { val: sVal, mode: sMode };
                        
                        if (typeof sVal === 'number' || (typeof sVal === 'string' && !isNaN(parseFloat(sVal)))) {
                            studentsObj[stu].total += parseFloat(sVal);
                            studentsObj[stu].count++;
                        }
                    });
                });

                // 💡 [신규 엔진] 각 과목별 평균 및 전체 평균점수의 평균 사전 스캔
                let classSubjectSums = {};
                let classSubjectCounts = {};
                let classTotalSum = 0;
                let classTotalCount = 0;

                Object.keys(studentsObj).forEach(stu => {
                    let data = studentsObj[stu];
                    let avg = data.count > 0 ? (data.total / data.count) : 0;
                    
                    let isDropout = globalDropoutData[stu] ? true : false;
                    let isEarly = globalEarlyCompletionData[stu] ? true : false;
                    
                    // 특수 상태(탈락/수료)가 아니고, 점수가 있는 훈련생만 평균 계산에 반영
                    if (!isDropout && !isEarly && data.count > 0) {
                        classTotalSum += avg;
                        classTotalCount++;
                    }

                    subjectDetails.forEach(sub => {
                        let scoreObj = data.scores[sub.dbKey];
                        if (scoreObj && typeof scoreObj.val !== 'undefined') {
                            let sVal = scoreObj.val;
                            if (sVal !== "중도탈락" && sVal !== "조기수료" && sVal !== "-" && sVal !== "") {
                                let numVal = parseFloat(sVal);
                                if (!isNaN(numVal)) {
                                    if (!classSubjectSums[sub.dbKey]) {
                                        classSubjectSums[sub.dbKey] = 0;
                                        classSubjectCounts[sub.dbKey] = 0;
                                    }
                                    classSubjectSums[sub.dbKey] += numVal;
                                    classSubjectCounts[sub.dbKey]++;
                                }
                            }
                        }
                    });
                });

                let classTotalAvg = classTotalCount > 0 ? (classTotalSum / classTotalCount).toFixed(2) : "-";

                // 6. 테이블 HTML 렌더링 (엑셀 포맷 완벽 모방)
                
                // 💡 [수동 조절 패널] 평가 과목 열의 가로 길이를 여기서 직접 변경하세요! (예: "150px", "180px" 등)
                let colWidth = "105px";
                let isMobileAvgView = window.innerWidth <= 850;
                if (isMobileAvgView) colWidth = "72px";

               // 💡 [엑셀 틀 고정 엔진] 좌측 3열의 가로축(X) 좌표를 box-sizing 기반으로 완벽 계산하여 영구 고정합니다. (z-index 3층 최상단 배치)
                let theadHtml = `
                <tr>
                    <th style="box-sizing:border-box; border:1px solid #bdc3c7; background:#34495e; color:white; padding:${isMobileAvgView ? '2px' : '10px'}; position:sticky; top:0; left:0; z-index:3; width:${isMobileAvgView ? '28px' : '40px'}; min-width:${isMobileAvgView ? '28px' : '40px'}; max-width:${isMobileAvgView ? '28px' : '40px'}; vertical-align:middle; text-align:center;">${isMobileAvgView ? 'No' : '연번'}</th>
                    <th style="box-sizing:border-box; border:1px solid #bdc3c7; background:#34495e; color:white; padding:${isMobileAvgView ? '2px' : '10px'}; position:sticky; top:0; left:${isMobileAvgView ? '28px' : '40px'}; z-index:3; width:${isMobileAvgView ? '52px' : '80px'}; min-width:${isMobileAvgView ? '52px' : '80px'}; max-width:${isMobileAvgView ? '52px' : '80px'}; vertical-align:middle; text-align:center;">성함</th>
                    <th${isMobileAvgView ? '' : ' class="average-sticky-col"'} style="box-sizing:border-box; border:1px solid #bdc3c7; background:#f39c12; color:white; position:sticky; top:0; left:${isMobileAvgView ? '80px' : '120px'}; z-index:3; width:${isMobileAvgView ? '44px' : '70px'}; min-width:${isMobileAvgView ? '44px' : '70px'}; max-width:${isMobileAvgView ? '44px' : '70px'}; text-align:center; border-right:2px solid #2c3e50;${isMobileAvgView ? ' padding:2px 2px 12px 2px; vertical-align:top;' : ''}">
                        <div style="line-height:1.1;">전체<br>평균</div>
                        ${isMobileAvgView
                            ? `<div style="position:absolute; bottom:1px; left:1px; right:1px; font-size:7px; color:#fff; font-weight:900; background:#c0392b; border-radius:3px; text-shadow:0 1px 2px rgba(0,0,0,0.3); text-align:center; padding:0 1px; box-sizing:border-box;">${classTotalAvg}</div>`
                            : `<div class="average-total-avg-badge">${classTotalAvg}</div>`}
                    </th>`;
                
                subjectDetails.forEach((sub, subIndex) => {
                    let subAvg = "-";
                    if (classSubjectCounts[sub.dbKey] > 0) {
                        subAvg = (classSubjectSums[sub.dbKey] / classSubjectCounts[sub.dbKey]).toFixed(2);
                    }
                    
                    // 💡 [안전 락] 과목 헤더는 세로로 스크롤할 때 좌측 고정 열 밑으로 숨도록 z-index를 2층으로 튜닝합니다.
                    if (isMobileAvgView) {
                        let mobileText = String(sub.mobileLabel || sub.name || '').replace(/<[^>]+>/g, '').trim();
                        theadHtml += `<th class="average-mobile-subj-th" style="box-sizing:border-box; border:1px solid #bdc3c7; background:#ecf0f1; color:#2c3e50; padding:2px 2px 14px 2px; position:sticky; top:0; width:${colWidth}; min-width:${colWidth}; max-width:${colWidth}; z-index:2; vertical-align:top; white-space:normal; overflow:hidden; overflow-wrap:break-word; word-wrap:break-word; text-align:center;">
                            <div class="average-mobile-subj-label">${subIndex + 1}. ${mobileText}</div>
                            <div class="average-mobile-subj-avg">${subAvg}</div>
                        </th>`;
                    } else {
                    theadHtml += `<th class="average-col-header" style="box-sizing:border-box; border:1px solid #bdc3c7; background:#ecf0f1; color:#2c3e50; position:sticky; top:0; width:${colWidth}; min-width:${colWidth}; max-width:${colWidth}; z-index:2; font-size:10px; white-space:normal; overflow-wrap:break-word;">
                        <div class="average-th-index" title="평가과목 순번">${subIndex + 1}</div>
                        <div class="average-th-dates">
                            <div style="color:#2980b9;"><span>본평가</span> <b>${sub.fmtMain}</b></div>
                            <div style="color:#8e44ad;"><span>추가</span> <b>${sub.fmtAdd}</b></div>
                            <div style="color:#d35400;"><span>재평가</span> <b>${sub.fmtRe}</b></div>
                        </div>
                        <div class="average-subj-header-label">${sub.name}</div>
                        <div class="average-subj-avg">${subAvg}</div>
                    </th>`;
                    }
                });
                theadHtml += `</tr>`;

                let tbodyHtml = "";
                let sortedStudents = Object.keys(studentsObj).sort();
                
                sortedStudents.forEach((stu, idx) => {
                    let data = studentsObj[stu];
                    let avg = data.count > 0 ? (data.total / data.count) : 0;
                    let avgStr = data.count > 0 ? (Math.round(avg * 100) / 100).toFixed(2) : "-"; 

                    let isDropout = globalDropoutData[stu] ? true : false;
                    let isEarly = globalEarlyCompletionData[stu] ? true : false;
                    let rowBg = (isDropout || isEarly) ? "#f9ebea" : "white";
                    let avgBg = (isDropout || isEarly) ? '#f9ebea' : '#fff9e6';
                    
                    let nameDisplay = stu;
                    if(isDropout) nameDisplay += ` <span style="font-size:10px; color:#e74c3c;">(탈락)</span>`;
                    if(isEarly) nameDisplay += ` <span style="font-size:10px; color:#8e44ad;">(수료)</span>`;

                    // 💡 [엑셀 틀 고정 엔진] 내용부(Tbody)의 좌측 3열 역시 가로축(X)에 영구 락을 걸고 배경색을 강제 주입하여 뒤쪽 셀이 비치지 않게 방어합니다. (z-index 1층 배치)
                    const stickyLeft1 = isMobileAvgView ? '0' : '0';
                    const stickyLeft2 = isMobileAvgView ? '28px' : '40px';
                    const stickyLeft3 = isMobileAvgView ? '80px' : '120px';
                    const colW1 = isMobileAvgView ? '28px' : '40px';
                    const colW2 = isMobileAvgView ? '52px' : '80px';
                    const colW3 = isMobileAvgView ? '44px' : '70px';
                    tbodyHtml += `<tr class="average-student-row" style="background:${rowBg}; text-align:center; transition:0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='none'">
                        <td style="box-sizing:border-box; border:1px solid #bdc3c7; font-weight:bold; color:#7f8c8d; position:sticky; left:${stickyLeft1}; z-index:1; width:${colW1}; min-width:${colW1}; max-width:${colW1}; background:${rowBg};">${idx + 1}</td>
                        <td style="box-sizing:border-box; border:1px solid #bdc3c7; font-weight:bold; color:#2c3e50; position:sticky; left:${stickyLeft2}; z-index:1; width:${colW2}; min-width:${colW2}; max-width:${colW2}; background:${rowBg};">${nameDisplay}</td>
                        <td style="box-sizing:border-box; border:1px solid #bdc3c7; font-weight:900; color:#c0392b; font-size:${isMobileAvgView ? 'inherit' : '14px'}; position:sticky; left:${stickyLeft3}; z-index:1; width:${colW3}; min-width:${colW3}; max-width:${colW3}; background:${avgBg}; border-right:2px solid #2c3e50;">${avgStr}</td>`;
                    
                    subjectDetails.forEach(sub => {
                        let scoreObj = data.scores[sub.dbKey] || { val: "-", mode: "본평가" };
                        let displayVal = scoreObj.val;
                        let mode = scoreObj.mode;
                        
                        let cellStyle = "border:1px solid #bdc3c7; font-weight:bold; ";
                        
                        // 💡 [신규 배선] 평가 모드에 따른 개별 뱃지 및 배경색 제어
                        if (displayVal === "중도탈락" || displayVal === "조기수료") {
                            displayVal = `<span style="color:#7f8c8d; font-size:10px; font-weight:normal;">${displayVal}</span>`;
                            cellStyle += "color:#333;";
                        } else if (displayVal !== "" && displayVal !== "-") {
                            if (mode === '추가평가') {
                                cellStyle += "color:#8e44ad; background:#f5eef8;"; // 보라색 배경 및 텍스트
                                displayVal += `<span style="font-size:10px; margin-left:2px;">(추가)</span>`;
                            } else if (mode === '재평가') {
                                cellStyle += "color:#d35400; background:#fdebd0;"; // 주황색 배경 및 텍스트
                                displayVal += `<span style="font-size:10px; margin-left:2px;">(재)</span>`;
                            } else {
                                cellStyle += "color:#2980b9;"; // 본평가는 순정 파란색
                            }
                        } else {
                            cellStyle += "color:#333;";
                        }
                        
                        tbodyHtml += `<td style="${cellStyle}">${displayVal}</td>`;
                    });
                    tbodyHtml += `</tr>`;
                });

                let excelBtnHtml = `<button type="button" class="average-excel-btn" onclick="exportAverageToExcel()" style="background:#27ae60; color:white; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2); transition:0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">📥 엑셀(Excel) 다운로드</button>`;

                page7.innerHTML = `
                    <div class="average-panel-shell">
                        <div class="average-panel-header">
                            <div>
                                <h2 style="margin:0; color:#2c3e50; font-size:24px; font-weight:900;">📊 전 과목 훈련생 평균 점수 현황</h2>
                                <div class="average-subtitle" style="font-size:12px; color:#7f8c8d; margin-top:5px;">※ 모든 평가지(본평가 기준)의 최종 점수를 취합하여 평균을 산출합니다.</div>
                            </div>
                            ${excelBtnHtml}
                        </div>
                        
                        <div id="averageTopScroll" style="overflow-x:auto; overflow-y:hidden; height:18px; flex-shrink:0; margin-bottom:6px; border:1px solid #bdc3c7; border-radius:4px; background:#f8f9fa;">
                            <div id="averageTopScrollSpacer" style="height:1px;"></div>
                        </div>

                        <div id="averageTableScroll" class="average-table-viewport">
                            <div id="averageTableScaleWrap" class="average-table-scale-wrap">
                                <table id="averageScoreTable" style="width:100%; border-collapse:collapse; font-size:13px; white-space:nowrap;">
                                    <thead>${theadHtml}</thead>
                                    <tbody>${tbodyHtml}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;

                setTimeout(() => {
                    const topScroll = document.getElementById('averageTopScroll');
                    const topSpacer = document.getElementById('averageTopScrollSpacer');
                    const tableScroll = document.getElementById('averageTableScroll');
                    const table = document.getElementById('averageScoreTable');
                    if (!topScroll || !topSpacer || !tableScroll || !table) return;

                    const syncSpacerWidth = () => {
                        const wrap = document.getElementById('averageTableScaleWrap');
                        const w = wrap ? wrap.scrollWidth : table.scrollWidth;
                        topSpacer.style.width = `${w}px`;
                    };

                    let isSyncingScroll = false;
                    const syncScrollLeft = (source, target) => {
                        if (isSyncingScroll) return;
                        isSyncingScroll = true;
                        target.scrollLeft = source.scrollLeft;
                        isSyncingScroll = false;
                    };

                    syncSpacerWidth();
                    topScroll.scrollLeft = tableScroll.scrollLeft;
                    topScroll.addEventListener('scroll', () => syncScrollLeft(topScroll, tableScroll));
                    tableScroll.addEventListener('scroll', () => syncScrollLeft(tableScroll, topScroll));
                    window.addEventListener('resize', syncSpacerWidth);
                    if (typeof window.scheduleAverageMobileFit === 'function') {
                        window.scheduleAverageMobileFit(150);
                    }
                    if (isMobileAvgView && typeof window.syncMobileAverageHeaderRow === 'function') {
                        window.syncMobileAverageHeaderRow();
                    }
                }, 0);
            } catch (e) {
                page7.innerHTML = `<div class="average-panel-shell"><div style="text-align:center; color:red; font-weight:bold; padding:50px;">❌ 오류 발생: ${e.message}</div></div>`;
            }
        };

        window.exportAverageToExcel = function() {
            let table = document.getElementById("averageScoreTable");
            if (!table) return;
            
            // 엑셀 출력용 클론 테이블 생성 및 UI 파편 제거
            let cloneTable = table.cloneNode(true);
            cloneTable.querySelectorAll('span').forEach(span => {
                if (span.innerText === "(탈락)" || span.innerText === "(수료)") span.outerHTML = ` ${span.innerText}`;
                else span.outerHTML = span.innerText;
            });
            cloneTable.querySelectorAll('div').forEach(div => div.outerHTML = div.innerText + " ");

            let html = cloneTable.outerHTML;
            let url = 'data:application/vnd.ms-excel;charset=utf-8,\uFEFF' + encodeURIComponent(
                `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head><meta charset="utf-8"></head><body>${html}</body></html>`
            );
            let a = document.createElement("a");
            a.href = url;
            a.download = `[${currentClass}] 평가_평균_점수.xls`;
            a.click();
        };

        window.currentActiveTableId = null;
        window.currentActiveItemIndex = null;

        document.addEventListener('click', function(e) {
            // 3번 탭 영역이거나, 편집용 버튼/배너를 누를 때는 무시
            if (document.getElementById('page3').classList.contains('active')) return;
            if (e.target.closest('.eval-right-panel') || e.target.closest('button')) return;

            let clickedCell = e.target.closest('.editable-cell');
            let clickedTable = e.target.closest('.trainee-table-target');

            // 💡 1. 다른 표를 클릭하거나 표 밖(바탕화면)을 클릭하면 모든 주황색 활성화(찌꺼기) 전면 해제
            if (!clickedTable || clickedTable.id !== window.currentActiveTableId) {
                document.querySelectorAll('.active-custom-cell').forEach(c => {
                    c.classList.remove('active-custom-cell');
                    if (c.contentEditable === "true") c.contentEditable = "false";
                });
                
                // 표 밖으로 완전히 이탈 시 배너 타겟 리셋
                if (!clickedTable) {
                    window.currentActiveTableId = null;
                    window.currentActiveItemIndex = null;
                    let titleEl = document.getElementById('current_editing_item_name');
                    if (titleEl) {
                        titleEl.innerHTML = `(좌측 표의 칸을 먼저 클릭하세요)`;
                        titleEl.style.color = '#7f8c8d';
                    }
                }
            }

            if (!clickedCell) return;
            if (clickedCell.isContentEditable) return;
            if (!clickedTable) return;

            // 💡 2. 클릭한 칸 주황색 토글 (켜기/끄기)
            clickedCell.classList.toggle('active-custom-cell');

            // 💡 3. 현재 타겟팅된 표 지정 및 배너 제목 점등
            let tId = clickedTable.id;
            window.currentActiveTableId = tId;
            let match = tId.match(/custom_table_(\d+)/);
            if (match) {
                window.currentActiveItemIndex = parseInt(match[1]);
                if (window.currentEvalPaperItems) {
                    let itemData = window.currentEvalPaperItems.find(i => i.idx === window.currentActiveItemIndex);
                    let titleEl = document.getElementById('current_editing_item_name');
                    if (titleEl && itemData) {
                        titleEl.innerHTML = `▶ 현재 편집 중: [제${window.currentActiveItemIndex + 1}항목] ${itemData.name}`;
                        titleEl.style.color = '#27ae60';
                    }
                }
            }
        });

        // 💡 [신규 엔진] 병합된 셀을 다시 낱개로 쪼개는 엔진
        window.unmergeCellInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length !== 1) return await appAlert("⚠️ 나누기(병합 해제)할 셀을 1개만 선택해주세요.");
            let cell = activeCells[0];
            let rs = parseInt(cell.getAttribute('rowspan') || 1);
            let cs = parseInt(cell.getAttribute('colspan') || 1);
            if (rs === 1 && cs === 1) return await appAlert("⚠️ 이미 최소 단위의 셀입니다. 병합된 셀이 아닙니다.");

            saveTableState(tId);
            let targetTable = cell.closest('table');
            let grid = getTableMatrix(targetTable);
            
            let targetR = -1, targetC = -1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && grid[r][c].td === cell && grid[r][c].isTopLeft) {
                        targetR = r; targetC = c; break;
                    }
                }
                if(targetR !== -1) break;
            }

            cell.removeAttribute('rowspan');
            cell.removeAttribute('colspan');

            for(let y=0; y<rs; y++){
                let insertR = targetR + y;
                let tr = targetTable.rows[insertR];
                let physicalIdxBase = 0;
                
                for(let c=0; c<targetC; c++){
                    if(grid[insertR][c] && grid[insertR][c].isTopLeft) physicalIdxBase++;
                }
                
                for(let x=0; x<cs; x++){
                    if(y===0 && x===0) continue; 
                    
                    let newTd = tr.insertCell(physicalIdxBase + (y===0 ? x : x));
                    newTd.className = 'editable-cell';
                    if(cell.hasAttribute('data-inner')) newTd.setAttribute('data-inner', 'true');
                    newTd.style.cssText = cell.style.cssText;
                    newTd.style.backgroundColor = 'transparent';
                    newTd.innerHTML = '';
                }
            }
            // 💡 [연속 작업 락] 쪼개진 원본 셀의 불빛을 소등하지 않고 유지합니다.
            markChanged(tId);
        };

        // 💡 [기존 융합 부품] 드롭박스 기반 규격 제목 선택 및 자동 주입 엔진
        window.addTitleInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 제목을 삽입할 셀(칸)을 하나 이상 클릭해주세요.");
            
            let dropEl = document.getElementById('custom_title_drop');
            if (!dropEl) return;
            let val = dropEl.value;

            // 💡 [지능형 데이터 추출] 현재 표의 인덱스를 찾아 자동 이름 및 점수를 역산
            let itemName = "작업";
            let score = 0;
            let idxMatch = tId.match(/custom_table_(\d+)/);
            if (idxMatch && window.currentEvalPaperItems) {
                let itemIndex = parseInt(idxMatch[1]);
                let itemData = window.currentEvalPaperItems.find(i => i.idx === itemIndex);
                if (itemData) {
                    itemName = (itemData.coreTask || itemData.name).replace(/`/g, '');
                    score = itemData.score;
                }
            }

            let titleText = val;
            let setHeaderStyle = true;

            // 선택된 값에 따른 특수 텍스트/기능 변환
            if (val === "핵심작업명") {
                titleText = itemName;
            } else if (val === "득점") {
                titleText = `득 점<br><span style="font-weight:normal;">(${score}점)</span>`;
            } else if (val === "양호불량") {
                titleText = `<span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span> <span style="font-weight:normal; color:black;">양호</span><br><span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;" contenteditable="false">□</span> <span style="font-weight:normal; color:black;">불량</span>`;
                setHeaderStyle = false; // 양호/불량 칸은 회색 헤더 배경을 칠하지 않음
            }

            saveTableState(tId);
            
            // 💡 선택된 모든 셀에 텍스트를 주입하고 옵션에 따라 스타일 강제 코팅
            activeCells.forEach(cell => {
                cell.innerHTML = titleText;
                if (setHeaderStyle) {
                    cell.style.fontWeight = 'bold';
                    cell.style.backgroundColor = '#f2f2f2';
                } else {
                    cell.style.fontWeight = 'normal';
                    cell.style.backgroundColor = 'transparent';
                }
                cell.style.textAlign = 'center';
                
                // 삽입 완료 후 주황색 불빛 자동 소등
                cell.classList.remove('active-custom-cell');
            });
            
            markChanged(tId);
        };

        // 💡 [신규 엔진] 3번 탭(채점기준) OMR 연동형 클릭 체크박스(□) 주입 엔진
        window.addCheckboxInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 체크박스를 삽입할 셀(칸)을 하나 이상 클릭해주세요.");
            
            saveTableState(tId);
            
            // 3번 탭에서 클릭하면 '☑'로 변환되는 특수 클래스(custom-chk)가 코팅된 부품
            let chkHtml = `<span class="custom-chk" style="cursor:pointer; font-weight:bold; color:black;">□</span>`;
            
            activeCells.forEach(cell => {
                // 기존 내용이 비어있으면 덮어쓰고, 텍스트가 있으면 그 옆에 한 칸 띄우고 추가
                if (cell.innerHTML.trim() === "" || cell.innerHTML === "<br>") {
                    cell.innerHTML = chkHtml;
                } else {
                    cell.innerHTML += "&nbsp;" + chkHtml;
                }
                cell.classList.remove('active-custom-cell');
            });
            
            markChanged(tId);
        };

        // 💡 [지능형 업그레이드] 표 구조 파괴를 완벽 방어하는 행 삭제 엔진
        window.deleteRowInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 삭제할 행(줄)에 있는 셀을 하나 클릭해주세요.");
            saveTableState(tId);
            
            let targetTable = activeCells[0].closest('table');
            let grid = getTableMatrix(targetTable);
            
            let targetR = -1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && grid[r][c].td === activeCells[0]) { targetR = r; break; }
                }
                if(targetR !== -1) break;
            }
            if (targetTable.rows.length <= 1) return await appAlert("⚠️ 표의 마지막 행은 삭제할 수 없습니다.");

            // 병합(rowspan)된 셀이 잘리지 않도록 안전 이사 및 크기 축소 처리
            for(let c=0; c<grid[targetR].length; c++){
                let cellData = grid[targetR][c];
                if (!cellData) continue;
                let td = cellData.td;
                let rs = parseInt(td.getAttribute('rowspan') || 1);
                
                if (rs > 1) {
                    if (cellData.isTopLeft && targetTable.rows[targetR + 1]) {
                        // 셀이 짤려나가는 첫 줄에 있다면 물리적으로 다음 줄로 이사시킴
                        let nextRow = targetTable.rows[targetR + 1];
                        let physicalIdx = 0;
                        for(let i=0; i<c; i++){ if(grid[targetR + 1][i] && grid[targetR + 1][i].isTopLeft) physicalIdx++; }
                        nextRow.insertBefore(td, nextRow.cells[physicalIdx] || null);
                    }
                    td.setAttribute('rowspan', rs - 1);
                    let cs = parseInt(td.getAttribute('colspan') || 1);
                    c += cs - 1; // 병합된 가로 너비만큼 건너뛰기
                }
            }
            
            targetTable.rows[targetR].remove();
            activeCells.forEach(c => c.classList.remove('active-custom-cell'));
            markChanged(tId);
        };

        // 💡 [지능형 업그레이드] 표 구조 파괴를 완벽 방어하는 열 삭제 엔진
        window.deleteColInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 삭제할 열(칸)에 있는 셀을 하나 클릭해주세요.");
            saveTableState(tId);
            
            let targetTable = activeCells[0].closest('table');
            let grid = getTableMatrix(targetTable);
            
            let targetC = -1;
            for(let r=0; r<grid.length; r++){
                for(let c=0; c<grid[r].length; c++){
                    if(grid[r][c] && grid[r][c].td === activeCells[0]) { targetC = c; break; }
                }
                if(targetC !== -1) break;
            }
            if(grid[0].length <= 1) return await appAlert("⚠️ 표의 마지막 열은 삭제할 수 없습니다.");

            // 병합(colspan)된 셀이 잘리지 않도록 크기 축소 처리
            for(let r=0; r<grid.length; r++){
                let cellData = grid[r][targetC];
                if (!cellData) continue;
                let td = cellData.td;
                let cs = parseInt(td.getAttribute('colspan') || 1);
                
                if (cs > 1) {
                    if (cellData.isTopLeft || (grid[r][targetC-1] && grid[r][targetC-1].td !== td)) {
                         td.setAttribute('colspan', cs - 1);
                    }
                } else if (cellData.isTopLeft) {
                    td.remove();
                }
                let rs = parseInt(td.getAttribute('rowspan') || 1);
                r += rs - 1; // 세로로 병합된 만큼 건너뛰기
            }
            activeCells.forEach(c => c.classList.remove('active-custom-cell'));
            markChanged(tId);
        };

        // 💡 [신규 탑재] 텍스트 디자인 제어 엔진 (정렬, 굵기, 크기 조절)
        window.alignTextInside = async function(tId, alignType) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 정렬할 셀을 선택해주세요.");
            saveTableState(tId);
            activeCells.forEach(c => {
                c.style.textAlign = alignType;
                c.style.paddingLeft = alignType === 'left' ? '10px' : (alignType === 'right' ? '0' : '4px');
                c.style.paddingRight = alignType === 'right' ? '10px' : '4px';
            });
            markChanged(tId);
        };

        window.toggleBoldInside = async function(tId) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 글자를 굵게 할 셀을 선택해주세요.");
            saveTableState(tId);
            activeCells.forEach(c => {
                c.style.fontWeight = (c.style.fontWeight === 'bold' || c.style.fontWeight === '700' || c.style.fontWeight === '900') ? 'normal' : 'bold';
            });
            markChanged(tId);
        };

        window.changeTextSizeInside = async function(tId, direction) {
            let table = document.getElementById(tId);
            let activeCells = table.querySelectorAll('.active-custom-cell');
            if (activeCells.length === 0) return await appAlert("⚠️ 글자 크기를 조절할 셀을 선택해주세요.");
            saveTableState(tId);
            activeCells.forEach(c => {
                let currentSize = parseInt(window.getComputedStyle(c).fontSize) || 12;
                let newSize = direction === 'up' ? currentSize + 1 : currentSize - 1;
                if (newSize < 8) newSize = 8;
                if (newSize > 30) newSize = 30;
                c.style.fontSize = newSize + 'px';
            });
            markChanged(tId);
        };

        window.execGlobalCustom = async function(action) {
            let tId = window.currentActiveTableId;
            let idx = window.currentActiveItemIndex;
            
            if (!tId) return await appAlert("⚠️ 평가지 좌측 화면에서 편집할 표의 칸(셀)을 먼저 클릭해주세요. (노란색으로 활성화됩니다)");
            
            switch(action) {
                case 'addRow': window.addRowInside(tId); break;
                case 'delRow': window.deleteRowInside(tId); break;
                case 'addCol': window.addColInside(tId); break;
                case 'delCol': window.deleteColInside(tId); break;
                case 'merge': window.mergeCellInside(tId); break;
                case 'unmerge': window.unmergeCellInside(tId); break;
                case 'alignLeft': window.alignTextInside(tId, 'left'); break;
                case 'alignCenter': window.alignTextInside(tId, 'center'); break;
                case 'alignRight': window.alignTextInside(tId, 'right'); break;
                case 'bold': window.toggleBoldInside(tId); break;
                case 'sizeUp': window.changeTextSizeInside(tId, 'up'); break;
                case 'sizeDown': window.changeTextSizeInside(tId, 'down'); break;
                case 'addTitle': window.addTitleInside(tId); break;
                case 'addCheckbox': window.addCheckboxInside(tId); break;
                case 'color': window.toggleCellColor(tId); break;
                case 'edit': window.editCellText(tId); break;
                case 'undo': window.undoTable(tId); break;
                case 'save': window.saveCustomTable(idx, tId); break;
                case 'reset': window.resetCustomTable(idx); break;
                case 'fullCustom':
                    if (window.currentEvalPaperItems) {
                        let item = window.currentEvalPaperItems.find(i => i.idx === idx);
                        let score = item ? item.score : 80;
                        let name = item ? (item.coreTask || item.name).replace(/`/g, '') : "작업";
                        window.enableFullCustom(tId, score, name);
                    }
                    break;
            }
        };