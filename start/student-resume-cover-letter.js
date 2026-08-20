/**
 * student-resume-cover-letter.js — 학생 자기소개서 작성·전송
 * 이력서와 동일한 Firebase 경로(studentResumes / studentResumeSubmitCounts) 사용 — 기존 DB 규칙 그대로 동작
 */
(function () {
    'use strict';

    const SRS = () => window.StudentResumeShared;
    const COVER_LETTER_DAILY_SUBMIT_LIMIT = SRS().COVER_LETTER_DAILY_SUBMIT_LIMIT || 5;

    function getDailySubmitCountRef(studentName) {
        const dateKey = SRS().getCoverLetterSubmitCountDateKey(SRS().getTodayStrKst());
        return classDbRef(`studentResumeSubmitCounts/${studentName}/${dateKey}`);
    }

    function parseSubmitCount(val) {
        return typeof val === 'number' && !isNaN(val) ? val : 0;
    }

    async function reserveDailySubmitSlot(studentName) {
        const ref = getDailySubmitCountRef(studentName);
        const result = await ref.transaction(current => {
            const n = parseSubmitCount(current);
            if (n >= COVER_LETTER_DAILY_SUBMIT_LIMIT) return;
            return n + 1;
        });
        if (!result.committed) return { ok: false, count: parseSubmitCount(result.snapshot?.val()) };
        const count = parseSubmitCount(result.snapshot.val());
        if (count > COVER_LETTER_DAILY_SUBMIT_LIMIT) return { ok: false, count };
        return { ok: true, count };
    }

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

    async function ensureStudentResumeAuth() {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            throw new Error('Firebase Auth not loaded');
        }
        const auth = firebase.auth();
        if (auth.currentUser) return auth.currentUser;
        const cred = await auth.signInAnonymously();
        return cred.user;
    }

    function submitErrorHint(err, step) {
        const code = String(err?.code || err?.message || '');
        if (code.includes('PERMISSION_DENIED') || code.includes('permission_denied')) {
            if (step === 'count') {
                return '전송 횟수(studentResumeSubmitCounts) DB 권한 오류입니다. Firebase 규칙을 확인해 주세요.';
            }
            if (step === 'cover') {
                return '자기소개서(studentResumes) DB 권한 오류입니다. 익명 로그인 ON · Firebase 규칙 게시를 확인해 주세요.';
            }
            return '서버 DB 권한 오류입니다. 익명 로그인 ON · Firebase 규칙 게시를 확인해 주세요.';
        }
        if (code.includes('auth/operation-not-allowed')) {
            return 'Firebase Console → Authentication → Sign-in method → 익명(Anonymous) 사용 설정이 필요합니다.';
        }
        if (code.includes('auth/')) return 'Firebase 로그인 오류: ' + code;
        return code || '네트워크를 확인 후 다시 시도해 주세요.';
    }

    function loadLocalCoverLetter(name) {
        if (!name) return '';
        try {
            return localStorage.getItem(SRS().getCoverLetterLocalStorageKey(name)) || '';
        } catch (e) {
            return '';
        }
    }

    function saveLocalCoverLetter(name, text) {
        if (!name) return;
        localStorage.setItem(SRS().getCoverLetterLocalStorageKey(name), String(text || ''));
    }

    async function updateDailySubmitStatusUI() {
        const hintEl = document.getElementById('coverLetterDailyLimitHint');
        const btn = document.getElementById('btnSubmitCoverLetter');
        if (!selectedStudentName || !hintEl) return;
        const used = await fetchTodaySubmitCount(selectedStudentName);
        const left = Math.max(0, COVER_LETTER_DAILY_SUBMIT_LIMIT - used);
        hintEl.textContent = left > 0
            ? `오늘 자기소개서 전송 가능 ${left}/${COVER_LETTER_DAILY_SUBMIT_LIMIT}회 (한국 시간 기준 · 학생별)`
            : `오늘 자기소개서 전송 ${COVER_LETTER_DAILY_SUBMIT_LIMIT}회를 모두 사용했습니다. 내일 다시 전송할 수 있습니다.`;
        hintEl.classList.toggle('is-exhausted', left <= 0);
        if (btn) btn.disabled = left <= 0;
    }

    function renderCoverLetterView() {
        const vArea = document.getElementById('viewArea');
        if (!vArea) return;

        if (!selectedStudentName) {
            vArea.innerHTML = '<p class="resume-empty-hint">상단에서 본인 이름을 선택한 뒤 자기소개서를 작성할 수 있습니다.</p>';
            return;
        }

        const saved = loadLocalCoverLetter(selectedStudentName);
        vArea.innerHTML = `
            <div class="resume-panel cover-letter-panel">
                <div class="resume-panel-head">
                    <button type="button" id="btnBackToResume" class="resume-back-btn">← 이력서 작성으로</button>
                    <h3 class="resume-panel-title">✍️ 자기소개서 작성</h3>
                    <p class="resume-panel-desc">${escHtml(selectedStudentName)} · 자유롭게 작성한 뒤 「자기소개서 보내기」를 누르면 담임선생님께 전달됩니다. 하루 최대 ${COVER_LETTER_DAILY_SUBMIT_LIMIT}회까지 전송할 수 있습니다.</p>
                </div>
                <textarea id="coverLetterContent" class="cover-letter-textarea" rows="18" placeholder="자기소개서를 자유롭게 작성하세요.">${escHtml(saved)}</textarea>
                <p id="coverLetterDailyLimitHint" class="resume-daily-limit-hint">오늘 전송 가능 횟수 확인 중...</p>
                <button type="button" id="btnSubmitCoverLetter" class="resume-submit-btn">📤 자기소개서 보내기</button>
                <p id="coverLetterSubmitStatus" class="resume-submit-status" aria-live="polite"></p>
            </div>`;

        document.getElementById('btnBackToResume')?.addEventListener('click', () => {
            if (selectedStudentName) {
                saveLocalCoverLetter(selectedStudentName, document.getElementById('coverLetterContent')?.value || '');
            }
            if (typeof window.renderStudentResumeView === 'function') window.renderStudentResumeView();
        });

        const textarea = document.getElementById('coverLetterContent');
        textarea?.addEventListener('input', () => {
            if (selectedStudentName) saveLocalCoverLetter(selectedStudentName, textarea.value);
        });

        document.getElementById('btnSubmitCoverLetter')?.addEventListener('click', submitCoverLetter);
        updateDailySubmitStatusUI();
        textarea?.focus();
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    async function submitCoverLetter() {
        if (!(await requireSelectedStudent())) return;

        const content = (document.getElementById('coverLetterContent')?.value || '').trim();
        const statusEl = document.getElementById('coverLetterSubmitStatus');

        if (!content) {
            if (statusEl) {
                statusEl.textContent = '❌ 자기소개서 내용을 입력해 주세요.';
                statusEl.classList.remove('is-success');
            }
            await appAlert('자기소개서 내용을 입력해 주세요.');
            document.getElementById('coverLetterContent')?.focus();
            return;
        }

        let slotReserved = false;
        try {
            if (statusEl) {
                statusEl.textContent = '전송 중...';
                statusEl.classList.remove('is-success');
            }

            try {
                await ensureStudentResumeAuth();
            } catch (authErr) {
                const hint = submitErrorHint(authErr, 'auth');
                if (statusEl) statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                await appAlert('Firebase 로그인에 실패했습니다.\n' + hint);
                return;
            }

            let slot;
            try {
                slot = await reserveDailySubmitSlot(selectedStudentName);
            } catch (countErr) {
                const hint = submitErrorHint(countErr, 'count');
                if (statusEl) statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                await appAlert('전송 횟수 확인에 실패했습니다.\n' + hint);
                return;
            }

            if (!slot.ok) {
                const limitMsg = `오늘은 이미 자기소개서를 ${COVER_LETTER_DAILY_SUBMIT_LIMIT}회 전송하셨습니다.\n내일(한국 시간 기준) 다시 시도해 주세요.`;
                if (statusEl) statusEl.textContent = '❌ ' + limitMsg.replace('\n', ' ');
                await appAlert(limitMsg);
                await updateDailySubmitStatusUI();
                return;
            }
            slotReserved = true;

            const submittedAt = new Date().toISOString();
            const ref = classDbRef(`studentResumes/${selectedStudentName}`).push();
            try {
                await ref.set({
                    basic: { name: selectedStudentName },
                    content,
                    studentName: selectedStudentName,
                    submittedAt,
                    submissionId: ref.key,
                    documentType: 'coverLetter'
                });
            } catch (coverErr) {
                throw Object.assign(coverErr, { _coverStep: 'cover' });
            }
            slotReserved = false;

            saveLocalCoverLetter(selectedStudentName, content);
            localStorage.setItem(SRS().getCoverLetterLastSubmitKey(selectedStudentName), JSON.stringify({
                content,
                lastSubmittedAt: submittedAt
            }));

            if (statusEl) {
                statusEl.textContent = '✅ 담임선생님께 자기소개서가 전달되었습니다.';
                statusEl.classList.add('is-success');
            }
            await appAlert('자기소개서가 전송되었습니다.');
            await updateDailySubmitStatusUI();
        } catch (e) {
            if (slotReserved) {
                try { await releaseDailySubmitSlot(selectedStudentName); } catch (_) { /* ignore */ }
            }
            const step = e?._coverStep || 'unknown';
            const hint = submitErrorHint(e, step);
            if (statusEl) {
                statusEl.textContent = '❌ 전송에 실패했습니다. ' + hint;
                statusEl.classList.remove('is-success');
            }
            await appAlert('자기소개서 전송에 실패했습니다.\n' + hint);
            await updateDailySubmitStatusUI();
        }
    }

    window.renderStudentCoverLetterView = renderCoverLetterView;
})();
