
// [개조] 브라우저에 저장된 해당 반의 DB 설정을 가져옵니다.
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: "AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E",
    databaseURL: "https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "busan-teacher-work"
};

// 2. [엔진 시동] 파이어베이스 초기화
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth(); // 📍 보안 인증 객체 생성

// 3. [보안 검문소] 관리자 인증 후 데이터 로드
const adminPw = localStorage.getItem('adminPw');

auth.onAuthStateChanged((user) => {
    // 1. 브라우저 저장소에서 비밀번호를 가져옵니다.
    const savedPw = localStorage.getItem('adminPw');
    const reportBtn = document.getElementById('btnReportMode');

    if (user) {
        // ✅ [상황 1] 이미 로그인된 상태
        isAdmin = true;
        console.log("🔒 보안 인증 확인됨: " + firebaseConfig.projectId);
        
        // 관리자 전용 버튼 표시
        if(reportBtn) reportBtn.style.display = 'inline-block';
        
        // 정비소 시스템 가동
        initialize(); 
    } else if (savedPw) {
        // 🔑 [상황 2] 자동 로그인 시도 (비밀번호 저장됨)
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .then(() => {
                isAdmin = true;
                console.log("🔒 보안 인증 성공! 관리자 권한을 획득했습니다.");
                
                if(reportBtn) reportBtn.style.display = 'inline-block';
                
                initialize(); 
            })
            .catch(err => {
                console.error("❌ 인증 실패", err);
                // 기존의 '그냥 시동' 로직을 폐기하고 보안을 위해 퇴거 조치합니다.
                alert("인증 정보가 만료되었습니다. 다시 로그인해주세요.");
                location.href = "../index.html"; 
            });
    } else {
        // ⚠️ [상황 3] 인증 정보가 전혀 없음
        console.log("⚠️ 무단 접근 감지: 메인 화면으로 리다이렉트");
        alert("보안 인증이 필요한 페이지입니다.");
        location.href = "../index.html"; 
    }
});

const urlParams = new URLSearchParams(window.location.search);
let currentClass = urlParams.get('class') || "테스트";
document.getElementById('dispClass').innerText = currentClass;

let rawTimetable = [];
let uploadedDates = {};
let selectedTargetDate = "";
window.masterSubjectList = [];
window.ncsList = [];
let defaultViewMode = localStorage.getItem('defaultViewMode_' + currentClass) || 'subject';

function formatExcelTime(val) {
    if (!val || val === "-" || val === "") return "00:00:00";
    if (typeof val === 'number') {
        let totalSeconds = Math.round(val * 86400);
        let h = Math.floor(totalSeconds / 3600);
        let m = Math.floor((totalSeconds % 3600) / 60);
        let s = totalSeconds % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return String(val).trim();
}
// 1. [날짜 정밀 교정] 어떤 형식이 들어와도 YYYY-MM-DD로 변환합니다.
function getFixDate(rawDate) {
    if (!rawDate) return "";
    let s = String(rawDate).trim();
    
    // 2025.08.13 -> 2025-08-13 (마침표 제거)
    s = s.replace(/\./g, '-');
    
    // 08/13/25 (엑셀 날짜 형식) 처리
    if (s.includes('/')) {
        let parts = s.split('/');
        if (parts.length === 3) {
            // 연도가 2글자(25)면 20을 붙여 4글자(2025)로 만듬
            let year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
            let month = parts[0].padStart(2, '0');
            let day = parts[1].padStart(2, '0');
            s = `${year}-${month}-${day}`;
        }
    }
    
    // 최종적으로 10글자(YYYY-MM-DD)만 남깁니다.
    return s.substring(0, 10);
}

// 2. [초기화 로직] 실시간 수신기를 안정화합니다.
function initialize() {
    // 과정 정보 로드
    database.ref(`${currentClass}/masterData`).once('value', snap => {
        const d = snap.val() || {};
        document.getElementById('courseInfo').innerText = `${d.name || ""} (${d.period || ""})`;
    });

    // 📍 [연비 모드] 실시간 감시(on)를 1회 호출(once)로 교체하여 데이터 절약
    database.ref(`${currentClass}/dailyAttendance`).once('value', snap => {
        uploadedDates = snap.val() || {};
        renderDateList();
    });

    // 전체 시간표 로드 (표준화된 날짜로 목록 생성)
    database.ref(`${currentClass}/fullTimetable`).once('value', snap => {
        rawTimetable = snap.val() || [];
        renderDateList();
    });
}

// [추가] 능력단위시간표.html에서 사용하는 실제 과목 판별 로직 이식
function isActualSubject(subName) {
    if (!subName || subName === "") return false;
    // 마스터 데이터에 등록된 교과목이나 능력단위 명칭이 포함되어 있는지 확인
    const cleanSubName = String(subName).replace(/\s+/g, "");
    return masterSubjectList.some(m => m.replace(/\s+/g, "").includes(cleanSubName)) || 
           ncsList.some(n => n.replace(/\s+/g, "").includes(cleanSubName));
}

// [수정] 목록 출력 로직 - 능력단위시간표의 필터링 방식을 적용
function renderDateList() {
    const tbody = document.getElementById('dateListBody');
    if (rawTimetable.length === 0) return;

    // 📍 [수정] select 대신 전역 변수 defaultViewMode 사용
    const displayMode = defaultViewMode;

    const dayMap = {};
    rawTimetable.forEach(row => {
        const d = getFixDate(row.날짜);
        if(!d) return;

        // 1. 회차(일수) 정보 세척
        let dayNumRaw = row.일수;
// 📍 [수리] 1/1, 1/2 형식이 들어올 경우 앞의 숫자만 추출하거나 
// 형식을 유지하되 중복 계산되지 않도록 처리
let dayNumStr = dayNumRaw ? String(dayNumRaw).trim() : "";

// 만약 '1/1' 형태라면, 통계 계산을 위해 순수 숫자만 뽑아낸 변수를 별도로 관리해야 함
let pureDayNum = dayNumStr.includes('/') ? dayNumStr.split('/')[0] : dayNumStr;
        
        // 2. 과목명, 능력단위, 장소, 교시 데이터 추출 배선 연결
        const subjectName = row.교과목 ? String(row.교과목).trim() : "";
        const unitName = row.능력단위 ? String(row.능력단위).trim() : "";
        const locationName = row.장소 ? String(row.장소).trim() : "미지정";
        const periodNum = parseInt(row.교시) || 0;
        
        // [핵심 필터]
        if (dayNumStr === "" || dayNumStr === "-" || !isActualSubject(subjectName) || row.교시 === "점심") {
            return; 
        }

        if(!dayMap[d]) {
            dayMap[d] = { 
                date: d, 
                dayNum: dayNumStr, 
                weekday: row.요일 || "", 
                amList: new Set(), // 오전 임시 저장소
                pmList: new Set()  // 오후 임시 저장소
            };
        }
        
        // 선택된 스위치에 따라 이름 결정
        const targetName = (displayMode === 'ncs' && unitName !== "") ? unitName : subjectName;
        
        // 📍 [장소 도색 작업] 장소 텍스트에만 시각적 강조 색상(주황색) 코팅 적용
        const displayString = `${targetName}-<span style="color:#e67e22; font-weight:bold;">${locationName}</span>`;

        // 교시 번호에 따라 오전/오후 구동축으로 배분
        if (periodNum > 0 && periodNum <= 4) {
            dayMap[d].amList.add(displayString);
        } else if (periodNum >= 5) {
            dayMap[d].pmList.add(displayString);
        }
    });

    const sortedDates = Object.keys(dayMap).sort();
    
    const totalDays = sortedDates.length;
    let doneCount = 0;

    sortedDates.forEach(dKey => {
        if (uploadedDates[dKey]) doneCount++; 
    });

    const noneCount = totalDays - doneCount; 

    document.getElementById('totalWorkDays').innerText = totalDays;
    document.getElementById('doneWorkDays').innerText = doneCount;
    document.getElementById('noneWorkDays').innerText = noneCount;

    if (sortedDates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:50px; color:#999;">표시할 실제 훈련일이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = sortedDates.map(dKey => {
        const info = dayMap[dKey];
        const isDone = uploadedDates[dKey] ? true : false;
        
        // 오전/오후 텍스트 생성 (줄바꿈 <br> 부품 적용)
        let timeStrings = [];
        if (info.amList.size > 0) timeStrings.push(`(오전)${Array.from(info.amList).join(', ')}`);
        if (info.pmList.size > 0) timeStrings.push(`(오후)${Array.from(info.pmList).join(', ')}`);
        const finalSubjectText = timeStrings.join('<br>'); 
        
        const meta = uploadedDates[dKey] ? uploadedDates[dKey]._metadata : null;
        const fileName = meta ? meta.fileName : "";
        const uploadTime = meta ? meta.uploadTime : "";

        return `
            <tr>
                <td onclick="showDayDetail('${dKey}', '${info.dayNum}')" style="cursor:pointer; text-decoration:underline; color:#2980b9; font-weight:bold;">${info.dayNum}회차</td>
                <td><strong>${info.date}</strong><br><span style="font-size:11px; color:#555;">(${info.weekday})</span></td>
                <td style="text-align:left; font-size:12px; line-height:1.5;">${finalSubjectText}</td>
                <td><span class="status-badge ${isDone ? 'status-done' : 'status-none'}">${isDone ? '✔ 완료' : '미등록'}</span></td>
                <td style="padding: 5px 2px;">
                    <button class="btn btn-upload" style="padding: 4px 8px; font-size: 11px; min-width: 65px;" onclick="triggerUpload('${info.date}')">
                        ${isDone ? '재업로드' : '파일찾기'}
                    </button>
                    ${isDone && fileName ? `
                        <div style="font-size: 8px; color: #888; margin-top: 3px; line-height: 1.1; word-break: break-all; max-width: 80px; margin-left: auto; margin-right: auto;">
                            📄 ${fileName}<br>
                            ⏰ ${uploadTime}
                        </div>
                    ` : ''}
                </td>
            </tr>`;
    }).join('');
}

// initialize 함수 내부에 masterSubjectList와 ncsList를 뽑아내는 로직도 추가되어야 합니다.
async function initialize() {
    // 1. [수리] masterData를 가져오도록 배선 추가 (masterSnap 누락 해결)
    const [masterSnap, attSnap, timetableSnap, userConfigSnap] = await Promise.all([
        database.ref(`${currentClass}/masterData`).once('value'), // 📍 누락되었던 핵심 부품 추가
        database.ref(`${currentClass}/dailyAttendance`).once('value'),
        database.ref(`${currentClass}/fullTimetable`).once('value'),
        database.ref(`${currentClass}/userConfig/defaultView`).once('value')
    ]);

    // 2. 과정 정보 및 과목 리스트 추출
    const d = masterSnap.val() || {};
    const infoEl = document.getElementById('courseInfo');
    if(infoEl) infoEl.innerText = `${d.name || ""} (${d.period || ""})`;
    
    if(d.courses) {
        window.masterSubjectList = [...new Set(d.courses.map(c => c.subject))];
        window.ncsList = [...new Set(d.courses.filter(c => c.unit).map(c => c.unit))];
    }

    // 3. 출석 및 시간표 데이터 동기화
    uploadedDates = attSnap.val() || {};
    rawTimetable = timetableSnap.val() || [];
    
    // 4. [수리] 설정값 동기화 (보관함 이름 통일 및 규격 검증)
    const dbViewMode = userConfigSnap.val();
    if (dbViewMode === 'subject' || dbViewMode === 'ncs') { // 📍 'ncs'로 명칭 통일
        defaultViewMode = dbViewMode;
        localStorage.setItem('defaultViewMode_' + currentClass, dbViewMode);
    }

    // 5. UI 갱신 (라디오 버튼)
    const radio = document.querySelector(`input[name="defaultView"][value="${defaultViewMode}"]`);
    if(radio) radio.checked = true;

    renderDateList();
}

// 📍 [신규] 보기 설정 저장 및 갱신 함수 (참고 파일에서 이식)
async function saveDefaultView(mode) {
    try {
        await database.ref(`${currentClass}/userConfig`).update({ defaultView: mode });
        // 📍 보관함 키값에 반 이름을 붙여 능력단위시간표와 통일합니다.
        localStorage.setItem('defaultViewMode_' + currentClass, mode); 
        
        defaultViewMode = mode;
        renderDateList(); 
        alert(`✅ 기본 설정이 [${mode === 'subject' ? '교과목별' : '능력단위별'}]로 고정되었습니다.`);
    } catch(e) { 
        alert("저장 실패: " + e.message); 
    }
}

function triggerUpload(date) {
    selectedTargetDate = date;
    document.getElementById('hiddenFileInput').click();
}

// [데이터 삭제 기능]
function clearAllAttendance() {
    // 📍 [이중 안전장치 장착] 정확한 문구를 입력해야만 작동하도록 개조
    const expectedText = `${currentClass} 삭제합니다`;
    const userInput = prompt(`❗ 경고: [ ${currentClass} ] 학급의 모든 출석 데이터가 삭제됩니다.\n\n안전을 위해 아래 입력창에 띄어쓰기까지 정확히 입력해 주세요.\n\n입력할 문구: ${expectedText}`);

    if (userInput === expectedText) {
        database.ref(`${currentClass}/dailyAttendance`).remove()
            .then(() => alert(`✅ [ ${currentClass} ] 학급의 모든 데이터가 초기화되었습니다. 엑셀을 다시 업로드해 주세요.`))
            .catch(err => alert("삭제 실패: " + err));
    } else if (userInput !== null) {
        // 취소 버튼을 누른 게 아니라, 글자를 틀리게 적었을 경우의 계기판 알림
        alert("❌ 입력한 문구가 일치하지 않아 초기화가 안전하게 취소되었습니다.");
    }
}

// [수리 핵심] 엑셀 데이터 추출 로직 (외출/복귀 배선 연결)
function handleFileSelect(input) {
    const file = input.files[0];
    if(!file || !selectedTargetDate) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});

        if(rows.length < 3) {
            alert("파일 양식이 올바르지 않습니다.");
            return;
        }

        const dailyUpdate = {};
        
        // 📍 [부품 추가] 파일 정보 및 업로드 시간 기록
        dailyUpdate["_metadata"] = {
            fileName: file.name,
            uploadTime: new Date().toLocaleString('ko-KR', { 
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' 
            })
        };
        
        for(let i = 2; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 2) continue;

            const studentNum = row[0] ? String(row[0]).trim() : "-"; 
            const name = row[1] ? String(row[1]).trim() : ""; 
            if(!name || name === "성명") continue;

            // [Section Name] 가승인 인정 및 시각적 강조 로직 추가
            let statusG = row[6] ? String(row[6]).trim() : "";  // G열: 출결상태
            let statusL = row[11] ? String(row[11]).trim() : ""; // L열: 처리상태
            let statusM = row[12] ? String(row[12]).trim() : ""; // M열: 출결상태 창
            let status = statusG;

            // 전일 출석 인정 키워드 (외출 제외)
            const specialKeywords = ["공가", "휴가", "경조사", "훈련수당", "기타", "출석인정"];
            const isM_Special = specialKeywords.some(k => statusM.includes(k));

            // 📍 [우회 회로 가동 조건] 신청 또는 승인 시 M열 상태 우선 적용
            if (isM_Special && (statusL === "신청" || statusL === "승인")) {
                status = (statusL === "신청") ? `${statusM}(신청)` : statusM;
            } else if (status === "" || status === "-") {
                status = "미편입";
            }

            // 📍 [사유 칸 시각적 강조 배선] 신청, 회수, 반려 시 (상태) 문구 추가
            let finalNote = row[13] ? String(row[13]).trim() : ""; // N열: 사유
            const highlightStatus = ["신청", "회수", "반려"];
            if (highlightStatus.includes(statusL)) {
                // 중복 추가 방지 로직 포함
                if (!finalNote.includes(`(${statusL})`)) {
                    finalNote = finalNote ? `${finalNote} (${statusL})` : `(${statusL})`;
                }
            }

            let inTime = formatExcelTime(row[7]);  
            let outTime = formatExcelTime(row[8]); 
            let leaveTime = formatExcelTime(row[9]);
            let returnTime = formatExcelTime(row[10]);

            // 특수 출결(공가 등) 시 09:00~17:30 강제 주입
            const isSpecial = specialKeywords.some(keyword => status.includes(keyword));

            if (isSpecial) {
                inTime = "09:00:00"; outTime = "17:30:00";
                leaveTime = ""; returnTime = "";
            } else if (status === "미편입" || status === "-" || status.includes("결석") || inTime === "-" || inTime === "") {
                inTime = "00:00:00"; outTime = "00:00:00";
                leaveTime = ""; returnTime = "";
                if(status === "-") status = "결석";
            }

            // [표준 규격 송신]
            dailyUpdate[name] = {
                studentNum, 
                inTime, outTime, leaveTime, returnTime, 
                status, 
                note: finalNote // 📍 강조 문구가 포함된 사유 저장
            };
        }

        if(confirm(`[${selectedTargetDate}] 데이터를 저장하시겠습니까?`)) {
            database.ref(`${currentClass}/dailyAttendance/${selectedTargetDate}`).set(dailyUpdate)
                .then(() => {
                    alert(`✅ [${selectedTargetDate}] 저장 완료!`);
                    input.value = "";
                    initialize(); 
                })
                .catch(err => alert("저장 실패: " + err));
        }
    };
    reader.readAsArrayBuffer(file);
}
// [기능 추가] 미등록 데이터 중 가장 첫 번째(오름차순) 위치로 이동
function scrollToFirstEmpty() {
    // 1. 모든 행을 가져옵니다.
    const rows = document.querySelectorAll('#dateListBody tr');
    let targetRow = null;

    // 2. 위에서부터 순차적으로 '미등록' 뱃지가 있는 행을 찾습니다.
    for (let row of rows) {
        if (row.querySelector('.status-none')) {
            targetRow = row;
            break;
        }
    }

    if (targetRow) {
        // 3. 해당 행으로 부드럽게 스크롤 이동
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 4. 시각적 강조 효과 (잠깐 반짝임)
        targetRow.style.backgroundColor = "#fff9c4";
        setTimeout(() => { targetRow.style.backgroundColor = ""; }, 2000);
    } else {
        alert("🎉 모든 회차의 출석부가 등록되어 있습니다!");
    }
}

// 팝업 열기 함수
function showDayDetail(date, dayNum) {
    const dayData = uploadedDates[date];
    if (!dayData) { alert("데이터가 없습니다."); return; }

    const tbody = document.getElementById('detailTableBody');
    tbody.innerHTML = "";

    // 1. [6교시 인식 로직] 실제 과목이 등록된 행만 필터링 (NaN 데이터 무시)
    const daySchedule = rawTimetable.filter(row => {
        const rowDate = getFixDate(row.날짜);
        const subjectName = row.교과목 ? String(row.교과목).trim() : "";
        return rowDate === date && isActualSubject(subjectName);
    });

    let maxSchedEnd = 1050; // 기본 17:30
    let lastPeriod = 8;

    if (daySchedule.length > 0) {
        const periods = daySchedule.map(s => {
    let pVal = s.교시;
    // 📍 [수리] "1교시" 등 텍스트가 섞인 경우 숫자만 추출하는 필터 장착
    if (typeof pVal === 'string') pVal = pVal.replace(/[^0-9]/g, "");
    return parseInt(pVal) || 0;
}).filter(p => p > 0);

        if (periods.length > 0) {
            lastPeriod = Math.max(...periods);
        }

        // 교시별 종료 시간 배선
        if (lastPeriod <= 6) maxSchedEnd = 930;       // 15:30
        else if (lastPeriod === 7) maxSchedEnd = 990;  // 16:30
        else maxSchedEnd = 1050;                       // 17:30
    }

    document.getElementById('modalTitle').innerText = `📅 ${dayNum}회차 (${date}) 상세 [${lastPeriod}교시 기준]`;

    // 그날의 기준 수업 시간 (예: 6교시 360분, 8교시 450분)
    const standardTotalMin = (maxSchedEnd - 540) - 30;
    const sortedNames = Object.keys(dayData).filter(key => key !== "_metadata").sort();
    
    sortedNames.forEach(name => {
        const info = dayData[name];
        const st = info.status || "";
        
        const toMin = (t) => {
            if (!t || !t.includes(':') || t === "00:00:00") return 0;
            const p = t.split(':');
            return parseInt(p[0]) * 60 + parseInt(p[1]);
        };

        const sIn = toMin(info.inTime), sOut = toMin(info.outTime);
        const lIn = toMin(info.leaveTime), rIn = toMin(info.returnTime);
        const isSpecial = ["공가", "휴가", "경조사", "훈련수당", "기타", "출석인정"].some(k => st.includes(k));

        let actualMin = 0;
        if (isSpecial) {
            actualMin = standardTotalMin; 
        } else if (sIn > 0 && sOut > 0) {
            const aStart = Math.max(sIn, 540); 
            const aEnd = Math.min(sOut, maxSchedEnd); 
            
            if (aEnd > aStart) {
                actualMin = aEnd - aStart;
                const lS = 780, lE = 810; 
                const overlapLunch = Math.max(0, Math.min(aEnd, lE) - Math.max(aStart, lS));
                actualMin -= overlapLunch;
                
                if (lIn > 0 && rIn > 0) {
                    const oL = Math.max(0, Math.min(rIn, lE) - Math.max(lIn, lS));
                    actualMin -= ((rIn - lIn) - oL);
                }
            }
        }
        actualMin = Math.max(0, Math.round(actualMin));

        // [수정 1] 실제 출석(분) 칸만 노란색 강조 (기준 시간과 다를 때)
        const timeHighlight = (actualMin !== standardTotalMin) ? 'background-color: #fff9c4;' : '';

        // [수정 2] 상태별 색상 규정 적용
        let statusClass = "status-done"; // 기본 초록: 출석
        if (st.includes("결석") || st === "미편입") statusClass = "status-none"; // 빨강: 결석 또는 미편입
        else if (st.includes("지각") || st.includes("조퇴")) statusClass = "status-late"; // 노랑: 지각/조퇴
        else if (st.includes("외출") || isSpecial) statusClass = "status-special"; // 파랑: 외출/공가/휴가 등

        // [수정 3] 외출 시간 정보가 있을 때만 표시
        const leaveDisp = (lIn > 0) ? info.leaveTime : "-";
        const returnDisp = (rIn > 0) ? info.returnTime : "-";

        let noteStyle = "text-align:left;";
        const currentNote = info.note || "";
        // 사유에 (신청), (회수), (반려)가 있으면 노란색 배경 강조
        if (currentNote.includes("(신청)") || currentNote.includes("(회수)") || currentNote.includes("(반려)")) {
            noteStyle += " background-color: #fff9c4; font-weight: bold; color: #d35400;";
        }

        tbody.innerHTML += `
            <tr>
                <td>${info.studentNum || '-'}</td> 
                <td><strong>${name}</strong></td>
                <td><span class="status-badge ${statusClass}">${st}</span></td>
                <td style="font-weight:bold; color:#e67e22; ${timeHighlight}">${actualMin}분</td>
                <td>${(info.inTime && info.inTime !== '-') ? info.inTime.substring(0, 5) : '-'}</td>
                <td>${(info.outTime && info.outTime !== '-') ? info.outTime.substring(0, 5) : '-'}</td>
                <td>${(leaveDisp && leaveDisp !== '-') ? leaveDisp.substring(0, 5) : '-'}</td>
                <td>${(returnDisp && returnDisp !== '-') ? returnDisp.substring(0, 5) : '-'}</td>
                <td style="${noteStyle}">${currentNote || '-'}</td> 
            </tr>
        `;
    });
    document.getElementById('detailModal').style.display = "block";
}

// 팝업 닫기 함수
function closeModal() {
    document.getElementById('detailModal').style.display = "none";
}

// 팝업 바깥쪽 클릭 시 닫기
window.onclick = function(event) {
    const modal = document.getElementById('detailModal');
    if (event.target == modal) modal.style.display = "none";
}

// 📍 [신규] ESC 키 입력 시 모달 닫기 회로
window.addEventListener('keydown', function(event) {
    const modal = document.getElementById('detailModal');
    if (event.key === "Escape" && modal.style.display === "block") {
        closeModal();
    }
});

// 📍 [신규] 통합 날짜 추출 엔진 (4가지 규격 완벽 대응)
function extractDateFromFileName(fileName) {
    // 1. 4자리 표준: 2026-03-18 또는 2026.03.18
    const regNormal4 = /(\d{4})[.\-](\d{2})[.\-](\d{2})/;
    
    // 2. 2자리 기호 형식: 25.10.27 또는 25-10-28 (신규 추가)
    const regNormal2 = /(\d{2})[.\-](\d{2})[.\-](\d{2})/;

    // 3. 8자리 붙은 숫자: 20260318
    const regStick8 = /(\d{4})(\d{2})(\d{2})/;

    // 4. 6자리 붙은 숫자: 260318 (앞에 20 추가)
    const regStick6 = /(\d{2})(\d{2})(\d{2})/;

    let match;

    // [검색 1순위] 4자리 연도 표준 (가장 확실함)
    if (match = fileName.match(regNormal4)) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 2순위] 2자리 연도 + 기호(. 또는 -) (선생님 요청 사항)
    // 예: 25.10.27 -> 2025-10-27
    if (match = fileName.match(regNormal2)) {
        return `20${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 3순위] 순수 숫자 8자리
    if (match = fileName.match(regStick8)) {
        return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // [검색 4순위] 순수 숫자 6자리
    const numbers = fileName.match(/\d+/g);
    if (numbers) {
        for (let num of numbers) {
            if (num.length === 6) {
                return `20${num.substring(0, 2)}-${num.substring(2, 4)}-${num.substring(4, 6)}`;
            }
        }
    }

    return null; 
}

// 📍 [신규] 멀티 업로드 트리거
function triggerMultiUpload() {
    selectedTargetDate = "MULTI_MODE"; // 멀티 모드임을 표시
    document.getElementById('hiddenFileInput').click();
}

// 📍 [개조] 통합 파일 처리 엔진
async function handleFileSelect(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    // 1. [회로 판별] 일괄 업로드 모드인지 확인
    const isMultiMode = (selectedTargetDate === "MULTI_MODE");

    if (isMultiMode) {
        if (!confirm(`${files.length}개의 파일을 날짜별로 자동 분류하여 등록하시겠습니까?`)) {
            input.value = ""; return;
        }
    }

    let successCount = 0;
    let failFiles = [];

    // 2. 파일 루프 가동
    for (let file of files) {
        try {
            let targetDate = "";

            if (isMultiMode) {
                // [A회로] 일괄 업로드: 파일명에서 날짜 추출
                targetDate = extractDateFromFileName(file.name);
                if (!targetDate) {
                    failFiles.push(`${file.name}(날짜미검출)`);
                    continue;
                }
            } else {
                // [B회로] 단독 업로드: 리스트에서 클릭한 그 날짜 그대로 사용 (파일명 무관)
                targetDate = selectedTargetDate;
            }

            // 3. 엑셀 데이터 분석 시작
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (rows.length < 3) {
                failFiles.push(`${file.name}(내용부족)`);
                continue;
            }

            const dailyUpdate = {};
            dailyUpdate["_metadata"] = {
                fileName: file.name,
                uploadTime: new Date().toLocaleString('ko-KR', { 
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                })
            };

            // 4. 학생 데이터 수집 (선생님의 순정 정밀 로직 적용)
            for (let i = 2; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length < 2) continue;

                const studentNum = row[0] ? String(row[0]).trim() : "-";
                const name = row[1] ? String(row[1]).trim() : "";
                if (!name || name === "성명") continue;

                // 📍 [신규 배선] C열(row[2]) 주민등록번호 추출 및 생년월일(YYYY.MM.DD) 자동 변환기
                let birthDateRaw = row[2] ? String(row[2]).trim() : "";
                let birthDate = "";
                if (birthDateRaw) {
                    // '-' 기준으로 앞자리만 분리하고 순수 숫자만 추출 (예: "061202")
                    let juminFront = birthDateRaw.split('-')[0].replace(/[^0-9]/g, ''); 
                    if (juminFront.length === 6) {
                        let yy = parseInt(juminFront.substring(0, 2), 10);
                        let mm = juminFront.substring(2, 4);
                        let dd = juminFront.substring(4, 6);
                        
                        let currentYear = new Date().getFullYear(); // 시스템의 현재 연도 (예: 2026)
                        let assumedYear = 1900 + yy; // 일단 1900년대로 가정
                        
                        // 💡 90살 이상은 없다는 규칙(안전장치) 적용
                        if (currentYear - assumedYear >= 90) {
                            assumedYear = 2000 + yy;
                        }
                        
                        // "2006.12.02" 형식으로 최종 조립
                        birthDate = `${assumedYear}.${mm}.${dd}`;
                    }
                }

                // --- [순정 로직 이식 시작] ---
                let statusG = row[6] ? String(row[6]).trim() : "";  
                let statusL = row[11] ? String(row[11]).trim() : ""; 
                let statusM = row[12] ? String(row[12]).trim() : ""; 
                let status = statusG;

                const specialKeywords = ["공가", "휴가", "경조사", "훈련수당", "기타", "출석인정"];
                const isM_Special = specialKeywords.some(k => statusM.includes(k));

                if (isM_Special && (statusL === "신청" || statusL === "승인")) {
                    status = (statusL === "신청") ? `${statusM}(신청)` : statusM;
                } else if (status === "" || status === "-") {
                    status = "미편입";
                }

                let finalNote = row[13] ? String(row[13]).trim() : ""; 
                const highlightStatus = ["신청", "회수", "반려"];
                if (highlightStatus.includes(statusL)) {
                    if (!finalNote.includes(`(${statusL})`)) {
                        finalNote = finalNote ? `${finalNote} (${statusL})` : `(${statusL})`;
                    }
                }

                let inTime = formatExcelTime(row[7]);  
                let outTime = formatExcelTime(row[8]); 
                let leaveTime = formatExcelTime(row[9]);
                let returnTime = formatExcelTime(row[10]);

                const isSpecial = specialKeywords.some(keyword => status.includes(keyword));
                if (isSpecial) {
                    inTime = "09:00:00"; outTime = "17:30:00";
                    leaveTime = ""; returnTime = "";
                } else if (status === "미편입" || status === "-" || status.includes("결석") || inTime === "-" || inTime === "") {
                    inTime = "00:00:00"; outTime = "00:00:00";
                    leaveTime = ""; returnTime = "";
                    if(status === "-") status = "결석";
                }
                // --- [순정 로직 이식 끝] ---

                // [표준 규격 송신]
                dailyUpdate[name] = {
                    studentNum, inTime, outTime, leaveTime, returnTime, 
                    status, note: finalNote,
                    birthDate: birthDate // 📍 변환된 생년월일 데이터 추가 탑재
                };
            }

            // 5. 파이어베이스 전송 (단독 모드일 때만 confirm창 띄움)
            if (!isMultiMode) {
                if(confirm(`[${targetDate}] 데이터를 저장하시겠습니까?`)) {
                    await database.ref(`${currentClass}/dailyAttendance/${targetDate}`).set(dailyUpdate);
                    alert(`✅ [${targetDate}] 저장 완료!`);
                }
            } else {
                await database.ref(`${currentClass}/dailyAttendance/${targetDate}`).set(dailyUpdate);
                successCount++;
            }

        } catch (err) {
            console.error(`처리 오류 [${file.name}]:`, err);
            failFiles.push(file.name);
        }
    }

    // 6. 결과 보고
    if (isMultiMode) {
        let resultMsg = `✅ 일괄 업로드 결과\n- 성공: ${successCount}건`;
        if (failFiles.length > 0) resultMsg += `\n- 실패: ${failFiles.length}건\n(${failFiles.join(', ')})`;
        alert(resultMsg);
    }

    input.value = ""; 
    initialize(); 
}

