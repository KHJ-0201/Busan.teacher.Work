/**
 * 학생이력서확인.js — 담임 전용 이력서 열람·삭제 (상담일지에서 진입)
 */
const storedConfig = localStorage.getItem('firebaseConfig');
const firebaseConfig = storedConfig ? JSON.parse(storedConfig) : {
    apiKey: 'AIzaSyCO37zrsZEjKTokMCNWbIc1C_o5BZMqh8E',
    databaseURL: 'https://busan-teacher-work-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'busan-teacher-work'
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();
initClassContext();

let studentNames = [];
let resumeDataByStudent = {};
let fullAttendanceData = {};
let validTrainingDays = [];
let dropoutData = {};
let masterSubjectList = [];
let ncsList = [];
let selectedStudent = '';
let openSubmissionId = '';
let filterSido = '부산광역시';
let filterSigungu = '';
let regionFilterReady = false;
let koreaMapReady = false;
let employmentStatusByStudent = {};
let submitCountsByStudent = {};

auth.onAuthStateChanged(async user => {
    const savedPw = localStorage.getItem('adminPw');
    if (user) {
        await bootstrap();
    } else if (savedPw) {
        auth.signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw)
            .catch(async () => {
                await appAlert('인증 정보가 만료되었습니다.');
                location.href = '../index.html';
            });
    } else {
        await appAlert('보안 인증이 필요한 페이지입니다.');
        location.href = '../index.html';
    }
});

document.getElementById('btnBackCounsel')?.addEventListener('click', e => {
    e.preventDefault();
    location.href = classNavHref('상담일지.html');
});

async function bootstrap() {
    try {
        const [attSnap, resumeSnap, employmentSnap, timeSnap, dropSnap, masterSnap, countSnap] = await Promise.all([
            classDbRef('dailyAttendance').once('value'),
            classDbRef('studentResumes').once('value'),
            classDbRef('studentEmploymentStatus').once('value'),
            classDbRef('fullTimetable').once('value'),
            classDbRef('dropouts').once('value'),
            classDbRef('masterData').once('value'),
            classDbRef('studentResumeSubmitCounts').once('value')
        ]);
        fullAttendanceData = attSnap.val() || {};
        dropoutData = dropSnap.val() || {};
        const master = masterSnap.val() || {};
        if (master.courses) {
            masterSubjectList = [...new Set(master.courses.map(c => c.subject))];
            ncsList = [...new Set(master.courses.filter(c => c.unit).map(c => c.unit))];
        }
        buildValidTrainingDays(timeSnap.val() || []);
        const allStudents = new Set();
        Object.values(fullAttendanceData).forEach(day => {
            Object.keys(day || {}).forEach(name => {
                if (name !== '_metadata' && name !== '성명') allStudents.add(name);
            });
        });
        studentNames = Array.from(allStudents).sort();

        employmentStatusByStudent = employmentSnap.val() || {};
        submitCountsByStudent = countSnap.val() || {};

        resumeDataByStudent = {};
        const raw = resumeSnap.val() || {};
        Object.keys(raw).forEach(studentName => {
            const entries = raw[studentName];
            if (!entries || typeof entries !== 'object') return;
            resumeDataByStudent[studentName] = Object.entries(entries).map(([id, data]) => ({
                id,
                ...data
            })).sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
        });

        initRegionFilter();
        await initKoreaMapPicker();
        renderStudentList();
        showMainView();
    } catch (e) {
        console.error(e);
        await appAlert('데이터를 불러오지 못했습니다.');
    }
}

function getFixDate(rawDate) {
    if (!rawDate) return '';
    let s = String(rawDate).trim().replace(/\./g, '-');
    if (s.includes('/')) {
        const p = s.split('/');
        if (p.length === 3) {
            const year = p[2].length === 2 ? '20' + p[2] : p[2];
            s = `${year}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
        }
    }
    return s.substring(0, 10);
}

function isActualSubject(subName) {
    if (!subName) return false;
    const clean = String(subName).replace(/\s+/g, '');
    return masterSubjectList.some(m => m.replace(/\s+/g, '').includes(clean))
        || ncsList.some(n => n.replace(/\s+/g, '').includes(clean));
}

function buildValidTrainingDays(rawTimetable) {
    validTrainingDays = [];
    const dayCheck = new Set();
    rawTimetable.forEach(row => {
        const d = getFixDate(row.날짜);
        if (d && isActualSubject(row.교과목) && !dayCheck.has(d)) {
            validTrainingDays.push(d);
            dayCheck.add(d);
        }
    });
    validTrainingDays.sort();
    if (!validTrainingDays.length) {
        validTrainingDays = Object.keys(fullAttendanceData)
            .filter(k => k !== '_metadata')
            .sort();
    }
}

function isStudentEmployed(name) {
    return employmentStatusByStudent[name] === true;
}

function getStudentEmploymentLabel(name) {
    return isStudentEmployed(name) ? '취업' : '미취업';
}

function buildStudentListTableHtml(names, extraClass) {
    const tableCls = extraClass ? `student-list-table ${extraClass}` : 'student-list-table';
    const rows = names.map(name => {
        const active = name === selectedStudent ? ' class="active"' : '';
        const employ = getStudentEmploymentLabel(name);
        const employCls = employ === '취업' ? 'employ-yes' : 'employ-no';
        return `<tr data-name="${escAttr(name)}"${active}>
            <td class="col-no">${getStudentRosterNumber(name)}</td>
            <td class="col-name" title="${escAttr(name)}">${escHtml(name)}</td>
            <td class="col-age">${escHtml(getStudentAgeLabel(name))}</td>
            <td class="col-addr">${escHtml(getStudentAddressLabel(name))}</td>
            <td class="col-att">${escHtml(getStudentAttendanceRateLabel(name))}</td>
            <td class="col-employ col-employ-toggle ${employCls}" title="클릭하여 취업/미취업 변경">${escHtml(employ)}</td>
        </tr>`;
    }).join('');
    return `<table class="${tableCls}">
        <colgroup>
            <col class="col-no">
            <col class="col-name">
            <col class="col-age">
            <col class="col-addr">
            <col class="col-att">
            <col class="col-employ">
        </colgroup>
        <thead><tr>
            <th class="col-no">번호</th>
            <th class="col-name">이름</th>
            <th class="col-age">나이</th>
            <th class="col-addr">주소</th>
            <th class="col-att">출석률</th>
            <th class="col-employ">취업</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

async function toggleStudentEmployment(name) {
    if (!name) return;
    const next = !isStudentEmployed(name);
    const prev = employmentStatusByStudent[name];
    employmentStatusByStudent[name] = next;
    try {
        await classDbRef(`studentEmploymentStatus/${name}`).set(next);
        renderStudentList();
        const main = document.getElementById('resumeMainView');
        if (main && !main.hidden) renderRegionStudentGrid();
    } catch (e) {
        console.error(e);
        if (prev === undefined) delete employmentStatusByStudent[name];
        else employmentStatusByStudent[name] = prev;
        await appAlert('취업 상태 저장에 실패했습니다.');
    }
}
function getStudentLatestBasic(name) {
    const list = resumeDataByStudent[name];
    if (!list?.length) return null;
    return StudentResumeShared.normalizeBasicAddress(list[0].basic || {});
}

function shortSidoLabel(sido) {
    if (!sido) return '';
    return sido
        .replace(/특별자치도|특별자치시|광역시|특별시|도$/g, '')
        .trim() || sido;
}

function getStudentRegionLabel(name) {
    const b = getStudentLatestBasic(name);
    if (!b || (!b.addressSido && !b.addressSigungu)) return '';
    if (b.addressSido && b.addressSigungu) {
        return `${shortSidoLabel(b.addressSido)} · ${b.addressSigungu}`;
    }
    return b.addressSido || b.addressSigungu;
}

function getStudentRosterNumber(name) {
    const idx = studentNames.indexOf(name);
    return idx >= 0 ? idx + 1 : '';
}

function getStudentAgeLabel(name) {
    const birthDate = StudentResumeShared.getStudentBirthDateFromAttendance(name, fullAttendanceData);
    if (!birthDate) return '-';
    const birthYear = parseInt(String(birthDate).split('.')[0], 10);
    if (!birthYear) return '-';
    return `${new Date().getFullYear() - birthYear}세`;
}

function getStudentAddressLabel(name) {
    return getStudentRegionLabel(name) || '-';
}

function getStudentAttendanceRateLabel(name) {
    if (!validTrainingDays.length) return '-';
    const rate = StudentResumeShared.calculateUnitMonthPersonalRate(
        name,
        validTrainingDays,
        fullAttendanceData,
        validTrainingDays,
        dropoutData
    );
    return `${rate}%`;
}

function bindStudentListTableRows(container) {
    container?.querySelectorAll('.student-list-table tbody tr').forEach(row => {
        row.addEventListener('click', () => {
            const name = row.dataset.name;
            if (name && name === selectedStudent) selectStudent('');
            else selectStudent(name);
        });
    });
    container?.querySelectorAll('.col-employ-toggle').forEach(cell => {
        cell.addEventListener('click', e => {
            e.stopPropagation();
            const name = cell.closest('tr')?.dataset.name;
            if (name) toggleStudentEmployment(name);
        });
    });
}

function getFilteredStudentNames() {
    if (!filterSido) return studentNames.slice();
    return studentNames.filter(name => {
        const b = getStudentLatestBasic(name);
        if (!b || !b.addressSido) return false;
        if (b.addressSido !== filterSido) return false;
        if (filterSigungu && b.addressSigungu !== filterSigungu) return false;
        return true;
    });
}

function getStudentCountBySido(sido) {
    if (!sido) return 0;
    return studentNames.filter(name => {
        const b = getStudentLatestBasic(name);
        return b && b.addressSido === sido;
    }).length;
}

function getStudentCountBySigungu(sido, sigungu) {
    if (!sido || !sigungu) return 0;
    return studentNames.filter(name => {
        const b = getStudentLatestBasic(name);
        return b && b.addressSido === sido && b.addressSigungu === sigungu;
    }).length;
}

function applyRegionFilter(sido, sigungu, options) {
    const fromMap = options && options.fromMap;
    filterSido = sido || '';
    filterSigungu = sigungu || '';

    const sidoEl = document.getElementById('filterSido');
    const sigunguEl = document.getElementById('filterSigungu');
    if (sidoEl) sidoEl.value = filterSido;
    if (sigunguEl && typeof fillSigunguSelect === 'function') {
        fillSigunguSelect(sigunguEl, filterSido, filterSigungu, '전체');
    }

    if (!fromMap && typeof KoreaMapPicker !== 'undefined' && KoreaMapPicker) {
        KoreaMapPicker.syncFromFilter(filterSido, filterSigungu);
    }

    onRegionFilterChange();
}

async function initKoreaMapPicker() {
    if (koreaMapReady || typeof KoreaMapPicker === 'undefined') return;
    const el = document.getElementById('koreaMapExplorer');
    if (!el) return;
    await KoreaMapPicker.init({
        container: el,
        getSidoCount: getStudentCountBySido,
        getSigunguCount: getStudentCountBySigungu,
        initialSido: filterSido,
        initialSigungu: filterSigungu,
        onSelect(sido, sigungu) {
            applyRegionFilter(sido, sigungu, { fromMap: true });
        }
    });
    koreaMapReady = true;
}

function initRegionFilter() {
    if (regionFilterReady) return;
    const sidoEl = document.getElementById('filterSido');
    const sigunguEl = document.getElementById('filterSigungu');
    if (!sidoEl || typeof fillSidoSelect !== 'function') return;

    fillSidoSelect(sidoEl, filterSido, '전체');
    fillSigunguSelect(sigunguEl, filterSido, filterSigungu, '전체');

    sidoEl.addEventListener('change', () => {
        applyRegionFilter(sidoEl.value, '');
    });
    sigunguEl.addEventListener('change', () => {
        applyRegionFilter(filterSido, sigunguEl.value);
    });
    document.getElementById('btnFilterReset')?.addEventListener('click', () => {
        applyRegionFilter('', '');
    });
    regionFilterReady = true;
}

function updateFilterSummary() {
    const el = document.getElementById('filterSummary');
    if (!el) return;
    if (!filterSido) {
        el.textContent = `전체 ${studentNames.length}명`;
        return;
    }
    const filtered = getFilteredStudentNames();
    const regionLabel = filterSigungu ? `${filterSido} ${filterSigungu}` : filterSido;
    el.textContent = `${regionLabel} · ${filtered.length}명`;
}

function onRegionFilterChange() {
    updateFilterSummary();
    renderStudentList();
    if (!selectedStudent) renderMainView();
}

function showMainView() {
    const main = document.getElementById('resumeMainView');
    const detail = document.getElementById('resumeDetailArea');
    if (main) main.hidden = false;
    if (detail) detail.hidden = true;
    renderMainView();
}

function showDetailView() {
    const main = document.getElementById('resumeMainView');
    const detail = document.getElementById('resumeDetailArea');
    if (main) main.hidden = true;
    if (detail) detail.hidden = false;
}

function renderMainView() {
    updateFilterSummary();
    if (koreaMapReady && typeof KoreaMapPicker !== 'undefined') {
        KoreaMapPicker.refreshCounts();
    }
    renderRegionStudentGrid();
}

function renderRegionStudentGrid() {
    const grid = document.getElementById('regionStudentGrid');
    if (!grid) return;
    const names = getFilteredStudentNames();
    if (!studentNames.length) {
        grid.innerHTML = '<div class="main-view-hint">학생 데이터가 없습니다.</div>';
        return;
    }
    if (!names.length) {
        grid.innerHTML = '<div class="main-view-hint">선택한 지역에 해당하는 학생이 없습니다.</div>';
        return;
    }
    if (!filterSido) {
        grid.innerHTML = '<div class="main-view-hint korea-map-table-hint">지도에서 시·도를 선택하면 학생 목록이 오른쪽에 표시됩니다.</div>';
        return;
    }
    grid.innerHTML = buildStudentListTableHtml(names, 'student-list-table-main');
    bindStudentListTableRows(grid);
}

function renderStudentList() {
    const el = document.getElementById('studentList');
    if (!el) return;
    if (!studentNames.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;">학생 데이터가 없습니다.</div>';
        return;
    }
    el.innerHTML = buildStudentListTableHtml(studentNames);
    bindStudentListTableRows(el);
}

function selectStudent(name) {
    selectedStudent = name || '';
    openSubmissionId = '';
    renderStudentList();
    if (selectedStudent) {
        showDetailView();
        renderSubmissions();
    } else {
        showMainView();
    }
}

function getResumeDailySubmitLimit() {
    return window.StudentResumeShared?.RESUME_DAILY_SUBMIT_LIMIT ?? 5;
}

function getTodaySubmitCountForStudent(name) {
    const dateKey = StudentResumeShared.getTodayStrKst();
    const raw = submitCountsByStudent?.[name]?.[dateKey];
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function buildSubmitLimitPanelHtml(studentName) {
    const limit = getResumeDailySubmitLimit();
    const used = getTodaySubmitCountForStudent(studentName);
    const left = Math.max(0, limit - used);
    const dateKey = StudentResumeShared.getTodayStrKst();
    const resetDisabled = used === 0 ? ' disabled' : '';
    return `
        <div class="resume-submit-limit-panel">
            <div class="resume-submit-limit-info">
                <span class="resume-submit-limit-label">📨 오늘 이력서 전송 (한국시간 ${escHtml(dateKey)})</span>
                <span class="resume-submit-limit-count${used >= limit ? ' is-exhausted' : ''}">사용 ${used}/${limit}회 · <strong>남은 ${left}회</strong></span>
            </div>
            <button type="button" id="btnResetSubmitCount" class="btn-reset-submit-count"${resetDisabled} title="학생이 오늘 다시 전송할 수 있도록 횟수를 0으로 되돌립니다">오늘 횟수 초기화</button>
        </div>`;
}

async function resetTodaySubmitCount(studentName) {
    const used = getTodaySubmitCountForStudent(studentName);
    if (used === 0) {
        await appAlert('오늘 사용한 전송 횟수가 없습니다.');
        return;
    }
    const limit = getResumeDailySubmitLimit();
    const dateKey = StudentResumeShared.getTodayStrKst();
    if (!(await appConfirm(`${studentName} 학생의 오늘(${dateKey}) 이력서 전송 횟수(${used}/${limit}회)를 초기화하시겠습니까?\n\n학생은 다시 오늘 ${limit}회까지 전송할 수 있습니다.`))) return;
    try {
        await classDbRef(`studentResumeSubmitCounts/${studentName}/${dateKey}`).remove();
        if (submitCountsByStudent[studentName]) {
            delete submitCountsByStudent[studentName][dateKey];
            if (!Object.keys(submitCountsByStudent[studentName]).length) {
                delete submitCountsByStudent[studentName];
            }
        }
        renderSubmissions();
        await appAlert('오늘 전송 횟수가 초기화되었습니다.');
    } catch (err) {
        console.error(err);
        await appAlert('초기화에 실패했습니다. Firebase 규칙에 담임 초기화 권한이 있는지 확인하세요.');
    }
}

function bindSubmitLimitPanel(area) {
    area.querySelector('#btnResetSubmitCount')?.addEventListener('click', async () => {
        if (!selectedStudent) return;
        await resetTodaySubmitCount(selectedStudent);
    });
}

function renderSubmissions() {
    const area = document.getElementById('resumeDetailArea');
    if (!area || !selectedStudent) return;

    const list = resumeDataByStudent[selectedStudent] || [];
    const limitPanel = buildSubmitLimitPanelHtml(selectedStudent);
    if (!list.length) {
        area.innerHTML = `
            <button type="button" id="btnBackToMain" class="region-filter-reset" style="margin-bottom:14px;">← 지역별 보기</button>
            ${limitPanel}
            <div class="empty-state"><strong>${escHtml(selectedStudent)}</strong> 학생의 제출된 이력서가 없습니다.</div>`;
        document.getElementById('btnBackToMain')?.addEventListener('click', () => selectStudent(''));
        bindSubmitLimitPanel(area);
        return;
    }

    area.innerHTML = `
        <button type="button" id="btnBackToMain" class="region-filter-reset" style="margin-bottom:14px;">← 지역별 보기</button>
        ${limitPanel}
        <h3 style="margin:0 0 14px;color:#1e293b;">${escHtml(selectedStudent)} — 제출 이력 (${list.length}건)</h3>
        <p style="font-size:12px;color:#64748b;margin:0 0 14px;">텍스트를 클릭하면 클립보드에 복사됩니다. · 최신순</p>
        <div class="submission-list">${list.map(item => buildSubmissionCard(item)).join('')}</div>`;

    document.getElementById('btnBackToMain')?.addEventListener('click', () => selectStudent(''));
    bindSubmitLimitPanel(area);

    area.querySelectorAll('.submission-card-head').forEach(head => {
        head.addEventListener('click', e => {
            if (e.target.closest('.btn-del')) return;
            const card = head.closest('.submission-card');
            const id = card?.dataset.id;
            if (!card || !id) return;
            const wasOpen = card.classList.contains('is-open');
            area.querySelectorAll('.submission-card').forEach(c => c.classList.remove('is-open'));
            if (!wasOpen) {
                card.classList.add('is-open');
                openSubmissionId = id;
            }
        });
    });

    area.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (!id || !selectedStudent) return;
            if (!(await appConfirm(`[${formatSubmitDate(btn.dataset.at)}] 이력서를 삭제하시겠습니까?`))) return;
            try {
                await classDbRef(`studentResumes/${selectedStudent}/${id}`).remove();
                resumeDataByStudent[selectedStudent] = (resumeDataByStudent[selectedStudent] || []).filter(x => x.id !== id);
                renderStudentList();
                renderSubmissions();
            } catch (err) {
                console.error(err);
                await appAlert('삭제에 실패했습니다.');
            }
        });
    });

    area.querySelectorAll('.resume-copy-val').forEach(el => {
        el.addEventListener('click', () => copyResumeText(el));
    });

    if (openSubmissionId) {
        const card = area.querySelector(`.submission-card[data-id="${openSubmissionId}"]`);
        if (card) card.classList.add('is-open');
    }
}

function buildSubmissionCard(item) {
    const at = item.submittedAt || '';
    const label = formatSubmitDate(at);
    const openCls = item.id === openSubmissionId ? ' is-open' : '';
    return `<div class="submission-card${openCls}" data-id="${escAttr(item.id)}">
        <div class="submission-card-head">
            <span class="submission-date">📅 ${escHtml(label)}</span>
            <div class="submission-actions">
                <button type="button" class="btn-del" data-id="${escAttr(item.id)}" data-at="${escAttr(at)}">삭제</button>
            </div>
        </div>
        <div class="submission-body">${buildResumeDetailHtml(item)}</div>
    </div>`;
}

function buildResumeDetailHtml(item) {
    const b = item.basic || {};
    const studentName = b.name || item.studentName || selectedStudent;
    const birthDate = StudentResumeShared.getStudentBirthDateFromAttendance(studentName, fullAttendanceData)
        || b.birthDate || '';
    const career = StudentResumeShared.sortResumeRowsByDate(item.careerHistory || item.educationCareer || [], true);
    const finalEdu = StudentResumeShared.sortResumeRowsByDate(item.finalEducation || [], true);
    const skills = StudentResumeShared.sortResumeRowsByDate(item.skillsCerts || [], true);
    const rate = item.totalAttendanceRate != null ? `${item.totalAttendanceRate}%` : '-';

    return `
        <div class="resume-view-section">
            <h4>1. 기초자료</h4>
            ${buildBasicInfoHtml(b, birthDate)}
        </div>
        <div class="resume-view-section">
            <h4>2. 경력사항</h4>
            ${buildRowsTable(career, '회사명 (퇴사일)')}
        </div>
        <div class="resume-view-section">
            <h4>3. 최종학력</h4>
            ${buildRowsTable(finalEdu, '학교명 (졸업일)')}
        </div>
        <div class="resume-view-section">
            <h4>4. 특기사항.자격증.상장수상</h4>
            ${buildRowsTable(skills, '특기사항 · 자격증 · 상장수상')}
        </div>
        <div class="resume-view-section">
            <h4>5. 현재까지 총 출석률</h4>
            <div class="resume-copy-val rate-highlight" data-copy="${escAttr(rate)}">${escHtml(rate)}</div>
        </div>`;
}

function copyFieldBlock(label, value) {
    const raw = value != null && String(value).trim() !== '' ? String(value).trim() : '';
    const display = raw || '-';
    return `<div class="resume-basic-field">
        <span class="resume-copy-label">${escHtml(label)}</span>
        <span class="resume-copy-val" data-copy="${escAttr(raw)}">${escHtml(display)}</span>
    </div>`;
}

function buildBasicInfoHtml(b, birthDate) {
    const n = StudentResumeShared.normalizeBasicAddress(b);
    return `<div class="resume-basic-layout">
            <div class="resume-basic-row resume-basic-row-triple">
                ${copyFieldBlock('이름', n.name)}
                ${copyFieldBlock('생년월일', birthDate)}
                ${copyFieldBlock('연락처', n.phone)}
            </div>
            <div class="resume-basic-row resume-basic-row-full">
                ${copyFieldBlock('e-mail', n.email)}
            </div>
            <div class="resume-basic-row resume-basic-row-double">
                ${copyFieldBlock('시·도', n.addressSido)}
                ${copyFieldBlock('시·군·구', n.addressSigungu)}
            </div>
            <div class="resume-basic-row resume-basic-row-full">
                ${copyFieldBlock('상세주소', n.addressDetail || n.address)}
            </div>
        </div>`;
}

function copyDatePart(val) {
    const raw = val != null && String(val).trim() !== '' ? String(val).trim() : '';
    const display = raw || '-';
    return `<span class="resume-copy-val resume-date-part" data-copy="${escAttr(raw)}" title="클릭하여 복사">${escHtml(display)}</span>`;
}

function buildRowsTable(rows, contentLabel) {
    if (!rows.length) return '<p style="color:#94a3b8;font-size:12px;">내용 없음</p>';
    const body = rows.map(r => `<tr>
            <td class="resume-date-td">${copyDatePart(r.year)}</td>
            <td class="resume-date-td">${copyDatePart(r.month)}</td>
            <td class="resume-date-td">${copyDatePart(r.day)}</td>
            <td><span class="resume-copy-val" data-copy="${escAttr(r.content || '')}">${escHtml(r.content || '-')}</span></td>
        </tr>`).join('');
    return `<table class="resume-view-table"><thead><tr>
            <th class="resume-date-th">년</th>
            <th class="resume-date-th">월</th>
            <th class="resume-date-th">일</th>
            <th>${escHtml(contentLabel)}</th>
        </tr></thead><tbody>${body}</tbody></table>`;
}

async function copyResumeText(el) {
    const text = el.dataset.copy || el.textContent || '';
    try {
        await navigator.clipboard.writeText(text);
        el.classList.add('is-copied');
        const prev = el.textContent;
        el.textContent = '✅ 복사됨';
        setTimeout(() => {
            el.classList.remove('is-copied');
            el.textContent = prev;
        }, 900);
    } catch (e) {
        await appAlert('복사에 실패했습니다.');
    }
}

function formatSubmitDate(iso) {
    if (!iso) return '날짜 미상';
    try {
        const d = new Date(iso);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${y}.${m}.${day} ${h}:${min}`;
    } catch (e) {
        return String(iso);
    }
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
