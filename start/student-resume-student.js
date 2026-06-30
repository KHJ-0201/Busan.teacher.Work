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
    const QUICK_SKILL_CERTS = [
        { full: '자동차정비기능사', short: '정비기능사' },
        { full: '자동차정비산업기사', short: '정비산업기사' },
        { full: '자동차차체수리기능사', short: '차체수리' },
        { full: '자동차보수도장기능사', short: '보수도장' }
    ];

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

    function resumeSubmitErrorHint(err, step) {
        const code = String(err?.code || err?.message || '');
        if (code.includes('PERMISSION_DENIED') || code.includes('permission_denied')) {
            if (step === 'count') {
                return '전송 횟수(studentResumeSubmitCounts) DB 권한 오류입니다. Firebase 규칙을 다시 게시했는지 확인해 주세요.';
            }
            if (step === 'resume') {
                return '이력서(studentResumes) DB 권한 오류입니다. 익명 로그인 ON + Firebase 규칙 게시를 확인해 주세요.';
            }
            return '서버 DB 권한 오류입니다. 익명 로그인 ON · Firebase 규칙 게시 · 테스트 중인 반 DB가 맞는지 확인해 주세요.';
        }
        if (code.includes('auth/operation-not-allowed')) {
            return 'Firebase Console → Authentication → Sign-in method → 익명(Anonymous) 사용 설정이 필요합니다.';
        }
        if (code.includes('auth/')) {
            return 'Firebase 로그인 오류: ' + code;
        }
        return (code || '네트워크를 확인 후 다시 시도해 주세요.');
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
        const careerHistory = collectDynamicRows('resumeCareerBody');
        const finalEducation = collectDynamicRows('resumeFinalEduBody');
        const skillsCerts = collectDynamicRows('resumeSkillBody');
        const rateEl = document.getElementById('resumeAttendanceRate');
        const totalAttendanceRate = rateEl ? parseFloat(rateEl.dataset.value || rateEl.textContent) || 0 : 0;
        return { basic, careerHistory, finalEducation, skillsCerts, totalAttendanceRate };
    }

    const REQUIRED_ADDRESS_FIELDS = [
        { key: 'addressSido', label: '시·도', id: 'resumeAddressSido' },
        { key: 'addressSigungu', label: '시·군·구', id: 'resumeAddressSigungu' },
        { key: 'addressDetail', label: '상세주소', id: 'resumeBasicAddressDetail' }
    ];

    function getMissingRequiredAddressFields(basic) {
        return REQUIRED_ADDRESS_FIELDS.filter(f => !String(basic?.[f.key] || '').trim()).map(f => f.label);
    }

    function setAddressRequiredErrors(missingLabels) {
        REQUIRED_ADDRESS_FIELDS.forEach(f => {
            const el = document.getElementById(f.id);
            const wrap = el?.closest('.resume-field');
            if (wrap) wrap.classList.toggle('is-required-missing', missingLabels.includes(f.label));
        });
    }

    function clearAddressRequiredErrors() {
        setAddressRequiredErrors([]);
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

    function getResumeContentPlaceholder(tbodyId) {
        if (tbodyId === 'resumeCareerBody') return 'ex) 00회사 근무. 00년 00월 퇴사';
        if (tbodyId === 'resumeFinalEduBody') return 'ex) 00학교. 00년 00월 졸업';
        return '내용을 입력하세요';
    }

    function buildDynamicRowHtml(tbodyId, row, idx) {
        const prefix = tbodyId === 'resumeCareerBody' ? 'career'
            : tbodyId === 'resumeFinalEduBody' ? 'finaledu'
            : 'skill';
        const contentPh = escAttr(getResumeContentPlaceholder(tbodyId));
        return `<tr data-row-idx="${idx}">
            <td class="resume-date-cell">
                <input type="text" class="resume-y resume-date-input" maxlength="4" placeholder="년" value="${escAttr(row.year)}" inputmode="numeric">
                <span class="resume-date-sep">/</span>
                <input type="text" class="resume-m resume-date-input" maxlength="2" placeholder="월" value="${escAttr(row.month)}" inputmode="numeric">
                <span class="resume-date-sep">/</span>
                <input type="text" class="resume-d resume-date-input" maxlength="2" placeholder="일" value="${escAttr(row.day)}" inputmode="numeric">
            </td>
            <td><textarea class="resume-content form-resume-text" rows="2" placeholder="${contentPh}">${escHtml(row.content)}</textarea></td>
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

        fillDynamicRows('resumeCareerBody', data?.careerHistory ?? data?.educationCareer);
        fillDynamicRows('resumeFinalEduBody', data?.finalEducation);
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
                    <label class="resume-field"><span>연락처</span><input type="tel" id="resumeBasicPhone" class="form-resume-input" placeholder="010-0000-0000"></label>
                    <label class="resume-field resume-field-full"><span>e-mail</span><input type="email" id="resumeBasicEmail" class="form-resume-input" placeholder="example@email.com"></label>
                    <label class="resume-field"><span>시·도 <em class="resume-required-mark" aria-hidden="true">*</em></span><select id="resumeAddressSido" class="form-resume-select" required></select></label>
                    <label class="resume-field"><span>시·군·구 <em class="resume-required-mark" aria-hidden="true">*</em></span><select id="resumeAddressSigungu" class="form-resume-select" disabled required></select></label>
                    <label class="resume-field resume-field-full"><span>상세주소 <em class="resume-required-mark" aria-hidden="true">*</em></span><input type="text" id="resumeBasicAddressDetail" class="form-resume-input" placeholder="동·호수 등 상세주소" required></label>
                </div>
            </section>
            <section class="resume-section">
                <div class="resume-section-head">
                    <h4 class="resume-section-title">2. 경력사항</h4>
                    <div class="resume-section-btns">
                        <button type="button" id="btnResumeSortCareer" class="resume-mini-btn">📅 날짜순 정렬</button>
                        <button type="button" id="btnResumeAddCareer" class="resume-mini-btn resume-mini-btn-add">＋ 추가</button>
                    </div>
                </div>
                <div class="resume-table-wrap">
                    <table class="resume-table">
                        <thead><tr><th style="width:38%">년 / 월 / 일 (입사일)</th><th>회사명 (퇴사일)</th><th style="width:36px"></th></tr></thead>
                        <tbody id="resumeCareerBody"></tbody>
                    </table>
                </div>
            </section>
            <section class="resume-section">
                <div class="resume-section-head">
                    <h4 class="resume-section-title">3. 최종학력</h4>
                    <div class="resume-section-btns">
                        <button type="button" id="btnResumeAddFinalEdu" class="resume-mini-btn resume-mini-btn-add">＋ 추가</button>
                    </div>
                </div>
                <div class="resume-table-wrap">
                    <table class="resume-table">
                        <thead><tr><th style="width:38%">년 / 월 / 일 (입학일)</th><th>학교명 (졸업일)</th><th style="width:36px"></th></tr></thead>
                        <tbody id="resumeFinalEduBody"></tbody>
                    </table>
                </div>
            </section>
            <section class="resume-section">
                <div class="resume-section-head">
                    <h4 class="resume-section-title">4. 특기사항.자격증.상장수상</h4>
                    <div class="resume-section-btns">
                        <a href="https://www.q-net.or.kr/" target="_blank" rel="noopener noreferrer" class="resume-mini-btn resume-mini-btn-qnet" title="한국산업인력공단 큐넷(자격증 조회)">🔗 큐넷 새창</a>
                        <button type="button" id="btnResumeSortSkill" class="resume-mini-btn">📅 날짜순 정렬</button>
                    </div>
                </div>
                <div class="resume-quick-certs">
                    <p class="resume-quick-certs-label">자주 취득하는 자격증 — 클릭하면 아래 목록에 추가됩니다</p>
                    <div class="resume-quick-certs-btns">
                        ${QUICK_SKILL_CERTS.map(cert => `<button type="button" class="resume-quick-cert-btn" data-cert="${escAttr(cert.full)}"><span class="resume-quick-cert-label-full">${escHtml(cert.full)}</span><span class="resume-quick-cert-label-short">${escHtml(cert.short)}</span></button>`).join('')}
                        <button type="button" id="btnResumeAddSkill" class="resume-quick-cert-btn resume-quick-cert-btn-other">기타 추가</button>
                    </div>
                </div>
                <div class="resume-table-wrap">
                    <table class="resume-table">
                        <thead><tr><th style="width:38%">년 / 월 / 일 (취득일)</th><th>특기사항 · 자격증 · 상장수상</th><th style="width:36px"></th></tr></thead>
                        <tbody id="resumeSkillBody"></tbody>
                    </table>
                </div>
            </section>
            <section class="resume-section">
                <h4 class="resume-section-title">5. 현재까지 총 출석률</h4>
                <p class="resume-rate-note">단위개월출석부와 동일한 <strong>편입(%)</strong> 기준 · 현재까지 출석 완료 시 100%</p>
                <div class="resume-rate-box"><span id="resumeAttendanceRate">-</span></div>
            </section>
            <p id="resumeDailyLimitHint" class="resume-daily-limit-hint">오늘 전송 가능 횟수 확인 중...</p>
            <button type="button" id="btnSubmitResume" class="resume-submit-btn">📤 이력서 보내기</button>
            <p id="resumeSubmitStatus" class="resume-submit-status" aria-live="polite"></p>`;
    }

    function bindResumeFormEvents() {
        document.getElementById('btnResumeAddCareer')?.addEventListener('click', () => addDynamicRow('resumeCareerBody'));
        document.getElementById('btnResumeAddFinalEdu')?.addEventListener('click', () => addDynamicRow('resumeFinalEduBody'));
        document.getElementById('btnResumeAddSkill')?.addEventListener('click', () => addDynamicRow('resumeSkillBody'));
        document.getElementById('btnResumeSortCareer')?.addEventListener('click', () => sortSectionRows('resumeCareerBody'));
        document.getElementById('btnResumeSortSkill')?.addEventListener('click', () => sortSectionRows('resumeSkillBody'));
        document.getElementById('btnSubmitResume')?.addEventListener('click', submitResume);
        document.querySelectorAll('.resume-quick-cert-btn').forEach(btn => {
            btn.addEventListener('click', () => addQuickSkillCert(btn.dataset.cert || ''));
        });
        document.getElementById('resumeAddressSido')?.addEventListener('change', function () {
            fillSigunguSelect(document.getElementById('resumeAddressSigungu'), this.value, '');
            clearAddressRequiredErrors();
        });
        document.getElementById('resumeAddressSigungu')?.addEventListener('change', clearAddressRequiredErrors);
        document.getElementById('resumeBasicAddressDetail')?.addEventListener('input', clearAddressRequiredErrors);

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

    function isResumeRowEmpty(tr) {
        if (!tr) return true;
        const y = tr.querySelector('.resume-y')?.value?.trim();
        const m = tr.querySelector('.resume-m')?.value?.trim();
        const d = tr.querySelector('.resume-d')?.value?.trim();
        const c = tr.querySelector('.resume-content')?.value?.trim();
        return !y && !m && !d && !c;
    }

    function addQuickSkillCert(certName) {
        const tbody = document.getElementById('resumeSkillBody');
        if (!tbody || !certName) return;
        const rows = tbody.querySelectorAll('tr');
        const lastTr = rows[rows.length - 1];
        if (lastTr && isResumeRowEmpty(lastTr)) {
            const contentEl = lastTr.querySelector('.resume-content');
            if (contentEl) contentEl.value = certName;
            contentEl?.focus();
            return;
        }
        const idx = rows.length;
        tbody.insertAdjacentHTML('beforeend', buildDynamicRowHtml('resumeSkillBody', {
            year: '', month: '', day: '', content: certName
        }, idx));
        tbody.querySelector('tr:last-child .resume-content')?.focus();
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
        const missingAddress = getMissingRequiredAddressFields(payload.basic);
        if (missingAddress.length) {
            setAddressRequiredErrors(missingAddress);
            const msg = '다음 필수 항목을 입력해 주세요.\n\n· ' + missingAddress.join('\n· ');
            if (statusEl) {
                statusEl.textContent = '❌ 시·도, 시·군·구, 상세주소는 필수입니다.';
                statusEl.classList.remove('is-success');
            }
            await appAlert(msg);
            document.getElementById(missingAddress[0] === '시·도' ? 'resumeAddressSido'
                : missingAddress[0] === '시·군·구' ? 'resumeAddressSigungu'
                : 'resumeBasicAddressDetail')?.focus();
            return;
        }
        clearAddressRequiredErrors();

        let slotReserved = false;
        try {
            if (statusEl) {
                statusEl.textContent = '전송 중...';
                statusEl.classList.remove('is-success');
            }

            try {
                await ensureStudentResumeAuth();
            } catch (authErr) {
                console.error('이력서 익명 로그인 실패:', authErr);
                const hint = resumeSubmitErrorHint(authErr, 'auth');
                if (statusEl) statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                await appAlert('Firebase 로그인에 실패했습니다.\n' + hint);
                return;
            }

            let slot;
            try {
                slot = await reserveDailySubmitSlot(selectedStudentName);
            } catch (countErr) {
                console.error('전송 횟수 확인 실패:', countErr);
                const hint = resumeSubmitErrorHint(countErr, 'count');
                if (statusEl) statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                await appAlert('전송 횟수 확인에 실패했습니다.\n' + hint);
                return;
            }

            if (!slot.ok) {
                const limitMsg = `오늘은 이미 ${RESUME_DAILY_SUBMIT_LIMIT}회 전송하셨습니다.\n내일(한국 시간 기준) 다시 시도해 주세요.`;
                if (statusEl) statusEl.textContent = '❌ ' + limitMsg.replace('\n', ' ');
                await appAlert(limitMsg);
                await updateDailySubmitStatusUI();
                return;
            }
            slotReserved = true;

            const ref = classDbRef(`studentResumes/${selectedStudentName}`).push();
            try {
                await ref.set({
                    ...payload,
                    submissionId: ref.key,
                    studentName: selectedStudentName
                });
            } catch (resumeErr) {
                console.error('이력서 DB 저장 실패:', resumeErr);
                throw Object.assign(resumeErr, { _resumeStep: 'resume' });
            }
            slotReserved = false;

            const toStore = {
                basic: payload.basic,
                careerHistory: payload.careerHistory,
                finalEducation: payload.finalEducation,
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
            const step = e?._resumeStep || 'unknown';
            const hint = resumeSubmitErrorHint(e, step);
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
