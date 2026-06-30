/**
 * student-resume-student.js — 능력단위학생용 이력서 작성·전송 (Firebase 읽기 없음)
 *
 * 전송 시 Firebase Anonymous Auth 로 로그인한 뒤 studentResumes 경로에만 push().
 * DB 규칙은 firebase-student-resume-rules.json 참고 (Console에 반별 프로젝트마다 적용).
 */
(function () {
    'use strict';

    const SRS = () => window.StudentResumeShared;
    const RESUME_DAILY_SUBMIT_LIMIT = 5;

    function getDailySubmitCountRef(studentName) {
        const dateKey = SRS().getTodayStrKst();
        return classDbRef(`studentResumeSubmitCounts/${studentName}/${dateKey}`);
    }

    function parseSubmitCount(val) {
        return typeof val === 'number' && !isNaN(val) ? val : 0;
    }

    /** 하루 전송 횟수 +1 (transaction). 5회 초과 시 { ok: false } */
    async function reserveDailySubmitSlot(studentName) {
        const ref = getDailySubmitCountRef(studentName);
        const result = await ref.transaction(current => {
            const n = parseSubmitCount(current);
            if (n >= RESUME_DAILY_SUBMIT_LIMIT) return;
            return n + 1;
        });
        if (!result.committed) return { ok: false, count: parseSubmitCount(result.snapshot?.val()) };
        const count = parseSubmitCount(result.snapshot.val());
        if (count > RESUME_DAILY_SUBMIT_LIMIT) return { ok: false, count };
        return { ok: true, count };
    }

    /** 이력서 저장 실패 시 예약한 횟수 되돌리기 */
    async function releaseDailySubmitSlot(studentName) {
        const ref = getDailySubmitCountRef(studentName);
        await ref.transaction(current => {
            const n = parseSubmitCount(current);
            if (n <= 0) return 0;
            return n - 1;
        });
    }

    async function fetchTodaySubmitCount(studentName) {
        if (!studentName) return 0;
        try {
            await ensureStudentResumeAuth();
            const snap = await getDailySubmitCountRef(studentName).once('value');
            return parseSubmitCount(snap.val());
        } catch (e) {
            return 0;
        }
    }

    async function updateDailySubmitStatusUI() {
        const hintEl = document.getElementById('resumeDailyLimitHint');
        const btn = document.getElementById('btnSubmitResume');
        if (!selectedStudentName || !hintEl) return;
        const used = await fetchTodaySubmitCount(selectedStudentName);
        const left = Math.max(0, RESUME_DAILY_SUBMIT_LIMIT - used);
        hintEl.textContent = left > 0
            ? `오늘 전송 가능 ${left}/${RESUME_DAILY_SUBMIT_LIMIT}회 (한국 시간 기준 · 학생별)`
            : `오늘 전송 ${RESUME_DAILY_SUBMIT_LIMIT}회를 모두 사용했습니다. 내일 다시 전송할 수 있습니다.`;
        hintEl.classList.toggle('is-exhausted', left <= 0);
        if (btn) btn.disabled = left <= 0;
    }

    /** 이력서 전송 전용 — 익명 로그인(다른 DB 경로 쓰기 권한과 분리) */
    async function ensureStudentResumeAuth() {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            throw new Error('Firebase Auth not loaded');
        }
        const auth = firebase.auth();
        if (auth.currentUser) return auth.currentUser;
        const cred = await auth.signInAnonymously();
        return cred.user;
    }

    function resumeSubmitErrorHint(err) {
        const code = String(err?.code || err?.message || '');
        if (code.includes('PERMISSION_DENIED') || code.includes('permission_denied')) {
            return '서버에서 이력서 전송 권한이 막혀 있습니다. 담임선생님께 Firebase DB 규칙(firebase-student-resume-rules.json) 적용을 요청해 주세요.';
        }
        if (code.includes('auth/operation-not-allowed')) {
            return 'Firebase Console → Authentication → Sign-in method → 익명(Anonymous) 사용 설정이 필요합니다.';
        }
        return '네트워크를 확인 후 다시 시도해 주세요.';
    }

    function getAttendanceRateForStudent(name) {
        if (!name || !SRS()) return 0;
        return SRS().calculateUnitMonthPersonalRate(
            name,
            validTrainingDays,
            fullAttendanceData,
            validTrainingDays,
            dropoutData
        );
    }

    function loadLocalResume(name) {
        if (!name) return null;
        try {
            const raw = localStorage.getItem(SRS().getResumeLocalStorageKey(name));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function saveLocalResume(name, data) {
        if (!name || !data) return;
        localStorage.setItem(SRS().getResumeLocalStorageKey(name), JSON.stringify(data));
    }

    function collectFormFromDom() {
        const addressSido = document.getElementById('resumeAddressSido')?.value || '';
        const addressSigungu = document.getElementById('resumeAddressSigungu')?.value || '';
        const addressDetail = document.getElementById('resumeBasicAddressDetail')?.value?.trim() || '';
        const addressParts = { addressSido, addressSigungu, addressDetail };
        const basic = {
            name: document.getElementById('resumeBasicName')?.value || '',
            email: document.getElementById('resumeBasicEmail')?.value || '',
            phone: document.getElementById('resumeBasicPhone')?.value || '',
            ...addressParts,
            address: SRS().formatFullAddress(addressParts)
        };
        const educationCareer = collectDynamicRows('resumeEduBody');
        const skillsCerts = collectDynamicRows('resumeSkillBody');
        const rateEl = document.getElementById('resumeAttendanceRate');
        const totalAttendanceRate = rateEl ? parseFloat(rateEl.dataset.value || rateEl.textContent) || 0 : 0;
        return { basic, educationCareer, skillsCerts, totalAttendanceRate };
    }

    function collectDynamicRows(tbodyId) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return [];
        return Array.from(tbody.querySelectorAll('tr')).map(tr => ({
            year: tr.querySelector('.resume-y')?.value?.trim() || '',
            month: tr.querySelector('.resume-m')?.value?.trim() || '',
            day: tr.querySelector('.resume-d')?.value?.trim() || '',
            content: tr.querySelector('.resume-content')?.value?.trim() || ''
        })).filter(r => r.year || r.month || r.day || r.content);
    }

    function fillDynamicRows(tbodyId, rows) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const list = rows?.length ? rows : [SRS().emptyResumeRow()];
        tbody.innerHTML = list.map((row, idx) => buildDynamicRowHtml(tbodyId, row, idx)).join('');
    }

    function buildDynamicRowHtml(tbodyId, row, idx) {
        const prefix = tbodyId === 'resumeEduBody' ? 'edu' : 'skill';
        return `<tr data-row-idx="${idx}">
            <td class="resume-date-cell">
                <input type="text" class="resume-y resume-date-input" maxlength="4" placeholder="년" value="${escAttr(row.year)}" inputmode="numeric">
                <span class="resume-date-sep">/</span>
                <input type="text" class="resume-m resume-date-input" maxlength="2" placeholder="월" value="${escAttr(row.month)}" inputmode="numeric">
                <span class="resume-date-sep">/</span>
                <input type="text" class="resume-d resume-date-input" maxlength="2" placeholder="일" value="${escAttr(row.day)}" inputmode="numeric">
            </td>
            <td><textarea class="resume-content form-resume-text" rows="2" placeholder="내용을 입력하세요">${escHtml(row.content)}</textarea></td>
            <td class="resume-row-action"><button type="button" class="resume-row-del" data-target="${prefix}" aria-label="행 삭제">✕</button></td>
        </tr>`;
    }

    function escAttr(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function applyFormData(data, studentName) {
        const basic = data?.basic || {};

        const nameEl = document.getElementById('resumeBasicName');
        if (nameEl) nameEl.value = studentName || '';

        const normalized = SRS().normalizeBasicAddress(basic);
        const emailEl = document.getElementById('resumeBasicEmail');
        const phoneEl = document.getElementById('resumeBasicPhone');
        if (emailEl) emailEl.value = normalized.email || '';
        if (phoneEl) phoneEl.value = normalized.phone || '';
        initAddressSelects(normalized);

        const rateEl = document.getElementById('resumeAttendanceRate');
        const liveRate = getAttendanceRateForStudent(studentName);
        if (rateEl) {
            rateEl.textContent = `${liveRate}%`;
            rateEl.dataset.value = String(liveRate);
        }

        fillDynamicRows('resumeEduBody', data?.educationCareer);
        fillDynamicRows('resumeSkillBody', data?.skillsCerts);
    }

    function refreshResumeForm() {
        if (!selectedStudentName) {
            const wrap = document.getElementById('resumeFormWrap');
            if (wrap) wrap.innerHTML = '<p class="resume-empty-hint">상단에서 본인 이름을 선택한 뒤 이력서를 작성할 수 있습니다.</p>';
            return;
        }
        const local = loadLocalResume(selectedStudentName);
        if (local) {
            applyFormData(local, selectedStudentName);
        } else {
            applyFormData(
                SRS().buildDefaultResumeForm(
                    selectedStudentName,
                    getAttendanceRateForStudent(selectedStudentName)
                ),
                selectedStudentName
            );
        }
        updateResumeRateDisplay();
    }

    function initAddressSelects(basic) {
        const b = SRS().normalizeBasicAddress(basic || {});
        const sidoEl = document.getElementById('resumeAddressSido');
        const sigunguEl = document.getElementById('resumeAddressSigungu');
        const detailEl = document.getElementById('resumeBasicAddressDetail');
        if (typeof fillSidoSelect === 'function') {
            fillSidoSelect(sidoEl, b.addressSido || '');
            fillSigunguSelect(sigunguEl, b.addressSido || '', b.addressSigungu || '');
        }
        if (detailEl) detailEl.value = b.addressDetail || '';
    }

    function updateResumeRateDisplay() {
        if (!selectedStudentName) return;
        const rate = getAttendanceRateForStudent(selectedStudentName);
        const rateEl = document.getElementById('resumeAttendanceRate');
        if (rateEl) {
            rateEl.textContent = `${rate}%`;
            rateEl.dataset.value = String(rate);
        }
    }

    function renderResumeView() {
        const vArea = document.getElementById('viewArea');
        if (!vArea) return;
        vArea.innerHTML = `
            <div class="resume-panel">
                <div class="resume-panel-head">
                    <h3 class="resume-panel-title">📝 이력서 작성</h3>
                    <p class="resume-panel-desc">작성 후 「이력서 보내기」를 누르면 담임선생님께 전달됩니다. 하루 최대 ${RESUME_DAILY_SUBMIT_LIMIT}회까지 전송할 수 있습니다. 수정은 이 기기에 저장된 마지막 전송 내용만 불러올 수 있습니다.</p>
                </div>
                <div id="resumeFormWrap" class="resume-form-wrap">
                    ${selectedStudentName ? buildResumeFormHtml() : '<p class="resume-empty-hint">상단에서 본인 이름을 선택한 뒤 이력서를 작성할 수 있습니다.</p>'}
                </div>
            </div>`;
        if (selectedStudentName) {
            refreshResumeForm();
            bindResumeFormEvents();
            updateDailySubmitStatusUI();
        }
    }

    function buildResumeFormHtml() {
        return `
            <section class="resume-section">
                <h4 class="resume-section-title">1. 기초자료</h4>
                <div class="resume-basic-grid">
                    <label class="resume-field"><span>이름</span><input type="text" id="resumeBasicName" class="form-resume-input" readonly></label>
                    <label class="resume-field"><span>e-mail</span><input type="email" id="resumeBasicEmail" class="form-resume-input" placeholder="example@email.com"></label>
                    <label class="resume-field"><span>연락처</span><input type="tel" id="resumeBasicPhone" class="form-resume-input" placeholder="010-0000-0000"></label>
                    <div class="resume-address-block resume-field-full">
                        <span class="resume-address-heading">주소</span>
                        <div class="resume-address-grid">
                            <label class="resume-field"><span>시·도</span><select id="resumeAddressSido" class="form-resume-select"></select></label>
                            <label class="resume-field"><span>시·군·구</span><select id="resumeAddressSigungu" class="form-resume-select" disabled></select></label>
                            <label class="resume-field resume-field-full"><span>상세주소</span><input type="text" id="resumeBasicAddressDetail" class="form-resume-input" placeholder="동·호수 등 상세주소"></label>
                        </div>
                    </div>
                </div>
            </section>
            <section class="resume-section">
                <div class="resume-section-head">
                    <h4 class="resume-section-title">2. 학력 및 경력사항</h4>
                    <div class="resume-section-btns">
                        <button type="button" id="btnResumeSortEdu" class="resume-mini-btn">📅 날짜순 정렬</button>
                        <button type="button" id="btnResumeAddEdu" class="resume-mini-btn resume-mini-btn-add">＋ 추가</button>
                    </div>
                </div>
                <div class="resume-table-wrap">
                    <table class="resume-table">
                        <thead><tr><th style="width:38%">년 / 월 / 일</th><th>학력 및 경력사항</th><th style="width:36px"></th></tr></thead>
                        <tbody id="resumeEduBody"></tbody>
                    </table>
                </div>
            </section>
            <section class="resume-section">
                <div class="resume-section-head">
                    <h4 class="resume-section-title">3. 특기사항 · 자격증 · 상장수상</h4>
                    <div class="resume-section-btns">
                        <a href="https://www.q-net.or.kr/" target="_blank" rel="noopener noreferrer" class="resume-mini-btn resume-mini-btn-qnet" title="한국산업인력공단 큐넷(자격증 조회)">🔗 큐넷 새창</a>
                        <button type="button" id="btnResumeSortSkill" class="resume-mini-btn">📅 날짜순 정렬</button>
                        <button type="button" id="btnResumeAddSkill" class="resume-mini-btn resume-mini-btn-add">＋ 추가</button>
                    </div>
                </div>
                <div class="resume-table-wrap">
                    <table class="resume-table">
                        <thead><tr><th style="width:38%">년 / 월 / 일</th><th>특기사항, 자격증취득현황, 상장수상내역</th><th style="width:36px"></th></tr></thead>
                        <tbody id="resumeSkillBody"></tbody>
                    </table>
                </div>
            </section>
            <section class="resume-section">
                <h4 class="resume-section-title">4. 현재까지 총 출석률</h4>
                <p class="resume-rate-note">단위개월출석부와 동일한 <strong>편입(%)</strong> 기준 · 현재까지 출석 완료 시 100%</p>
                <div class="resume-rate-box"><span id="resumeAttendanceRate">-</span></div>
            </section>
            <p id="resumeDailyLimitHint" class="resume-daily-limit-hint">오늘 전송 가능 횟수 확인 중...</p>
            <button type="button" id="btnSubmitResume" class="resume-submit-btn">📤 이력서 보내기</button>
            <p id="resumeSubmitStatus" class="resume-submit-status" aria-live="polite"></p>`;
    }

    function bindResumeFormEvents() {
        document.getElementById('btnResumeAddEdu')?.addEventListener('click', () => addDynamicRow('resumeEduBody'));
        document.getElementById('btnResumeAddSkill')?.addEventListener('click', () => addDynamicRow('resumeSkillBody'));
        document.getElementById('btnResumeSortEdu')?.addEventListener('click', () => sortSectionRows('resumeEduBody'));
        document.getElementById('btnResumeSortSkill')?.addEventListener('click', () => sortSectionRows('resumeSkillBody'));
        document.getElementById('btnSubmitResume')?.addEventListener('click', submitResume);
        document.getElementById('resumeAddressSido')?.addEventListener('change', function () {
            fillSigunguSelect(document.getElementById('resumeAddressSigungu'), this.value, '');
        });

        const wrap = document.getElementById('resumeFormWrap');
        wrap?.addEventListener('click', e => {
            const del = e.target.closest('.resume-row-del');
            if (!del) return;
            const tr = del.closest('tr');
            const tbody = tr?.parentElement;
            if (!tbody || !tr) return;
            if (tbody.querySelectorAll('tr').length <= 1) {
                tr.querySelectorAll('input, textarea').forEach(el => { el.value = ''; });
                return;
            }
            tr.remove();
        });
    }

    function addDynamicRow(tbodyId) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        const idx = tbody.querySelectorAll('tr').length;
        tbody.insertAdjacentHTML('beforeend', buildDynamicRowHtml(tbodyId, SRS().emptyResumeRow(), idx));
    }

    function sortSectionRows(tbodyId) {
        const rows = collectDynamicRows(tbodyId);
        if (!rows.length) return;
        fillDynamicRows(tbodyId, SRS().sortResumeRowsByDate(rows, true));
    }

    async function submitResume() {
        if (!(await requireSelectedStudent())) return;

        const payload = collectFormFromDom();
        payload.basic.name = selectedStudentName;
        payload.totalAttendanceRate = getAttendanceRateForStudent(selectedStudentName);
        payload.submittedAt = new Date().toISOString();

        const statusEl = document.getElementById('resumeSubmitStatus');
        let slotReserved = false;
        try {
            if (statusEl) {
                statusEl.textContent = '전송 중...';
                statusEl.classList.remove('is-success');
            }
            await ensureStudentResumeAuth();

            const slot = await reserveDailySubmitSlot(selectedStudentName);
            if (!slot.ok) {
                const limitMsg = `오늘은 이미 ${RESUME_DAILY_SUBMIT_LIMIT}회 전송하셨습니다.\n내일(한국 시간 기준) 다시 시도해 주세요.`;
                if (statusEl) statusEl.textContent = '❌ ' + limitMsg.replace('\n', ' ');
                await appAlert(limitMsg);
                await updateDailySubmitStatusUI();
                return;
            }
            slotReserved = true;

            const ref = classDbRef(`studentResumes/${selectedStudentName}`).push();
            await ref.set({
                ...payload,
                submissionId: ref.key,
                studentName: selectedStudentName
            });
            slotReserved = false;

            const toStore = {
                basic: payload.basic,
                educationCareer: payload.educationCareer,
                skillsCerts: payload.skillsCerts,
                totalAttendanceRate: payload.totalAttendanceRate,
                lastSubmittedAt: payload.submittedAt
            };
            saveLocalResume(selectedStudentName, toStore);

            if (statusEl) {
                statusEl.textContent = '✅ 담임선생님께 전달되었습니다. 이 기기에 최신 내용이 저장되었습니다.';
                statusEl.classList.add('is-success');
            }
            await appAlert('이력서가 전송되었습니다.');
            await updateDailySubmitStatusUI();
        } catch (e) {
            if (slotReserved) {
                try { await releaseDailySubmitSlot(selectedStudentName); } catch (_) { /* ignore */ }
            }
            console.error('이력서 전송 실패:', e);
            const hint = resumeSubmitErrorHint(e);
            if (statusEl) {
                statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                statusEl.classList.remove('is-success');
            }
            await appAlert('이력서 전송에 실패했습니다.\n' + hint);
            await updateDailySubmitStatusUI();
        }
    }

    window.renderStudentResumeView = renderResumeView;
    window.refreshStudentResumeIfOpen = function () {
        const tab = document.getElementById('tab_resume');
        if (tab?.classList.contains('active')) renderResumeView();
    };
})();
