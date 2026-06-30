/**
 * 직권신청.js — 일일출석부 dailyAttendance 기반 직권 신청 현황 (일일출석부.js 미수정)
 */
(function (global) {
    'use strict';

    /** 직권 유형 (모두 사유 note 필수 — 사유 없는 지각·조퇴는 일반 출결) */
    const DIRECT_AUTH_TYPES = ['지각', '조퇴', '외출', '공가', '휴가', '경조사', '훈련수당', '기타', '출석인정'];

    /** 알림 패널 사유별 표시 순서 */
    const REASON_CATEGORY_ORDER = ['휴가', '질병/입원', '외출', '지각', '조퇴', '공가', '경조사', '훈련수당', '출석인정', '기타'];

    const ILLNESS_KEYWORDS = ['질병', '입원', '병원', '치료', '몸살', '아픔', '아파', '감기', '발열', '수술', '통원'];

    function fixDate(val) {
        if (!val) return '';
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.substring(0, 10);
        let s = String(val).trim();
        if (!isNaN(s) && s.length < 10 && s !== '') {
            const d = new Date((parseInt(s, 10) - 25569) * 86400 * 1000);
            const offset = d.getTimezoneOffset() * 60000;
            return new Date(d.getTime() - offset).toISOString().split('T')[0];
        }
        s = s.replace(/\./g, '-').split(' ')[0];
        if (s.includes('/')) {
            const p = s.split('/');
            if (p.length === 3) {
                const year = p[2].length === 2 ? '20' + p[2] : p[2];
                return `${year}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
            }
        }
        return s.substring(0, 10);
    }

    function getTodayDateKey() {
        const t = new Date();
        const offset = t.getTimezoneOffset() * 60000;
        return new Date(t.getTime() - offset).toISOString().split('T')[0];
    }

    function cleanCompareText(value) {
        return String(value || '').replace(/\s+/g, '');
    }

    function isRealTrainingRow(row, subjectList, unitList) {
        const date = fixDate(row.날짜);
        const dayNumber = String(row.일수 || '').trim();
        const periodText = String(row.교시 || '').trim();
        const subjectName = String(row.교과목 || '').trim();
        if (!date || !dayNumber || dayNumber === '-' || periodText.includes('점심')) return false;
        const cleanSubject = cleanCompareText(subjectName);
        if (!cleanSubject) return false;
        if (!subjectList.length && !unitList.length) return false;
        return subjectList.some(name => name && (name.includes(cleanSubject) || cleanSubject.includes(name)))
            || unitList.some(name => name && (name.includes(cleanSubject) || cleanSubject.includes(name)));
    }

    function getValidTrainingDays(rawTimetable, subjectList, unitList) {
        const dayCheck = new Set();
        const days = [];
        rawTimetable.forEach(row => {
            if (!isRealTrainingRow(row, subjectList, unitList)) return;
            const d = fixDate(row.날짜);
            if (d && !dayCheck.has(d)) {
                days.push(d);
                dayCheck.add(d);
            }
        });
        return days.sort();
    }

    function buildUnitMonths(validTrainingDays) {
        const unitMonths = [];
        if (!validTrainingDays.length) return unitMonths;
        const start = new Date(validTrainingDays[0]);
        const end = new Date(validTrainingDays[validTrainingDays.length - 1]);
        let tempStart = new Date(start);
        while (tempStart <= end) {
            const uStart = new Date(tempStart);
            const uEnd = new Date(tempStart);
            uEnd.setMonth(uEnd.getMonth() + 1);
            uEnd.setDate(uEnd.getDate() - 1);
            unitMonths.push({
                label: `${unitMonths.length + 1}회차`,
                start: uStart.toISOString().split('T')[0],
                end: uEnd.toISOString().split('T')[0]
            });
            tempStart.setMonth(tempStart.getMonth() + 1);
        }
        return unitMonths;
    }

    function getCurrentUnitIndex(unitMonths, todayKey) {
        if (!unitMonths.length) return -1;
        for (let i = 0; i < unitMonths.length; i++) {
            const u = unitMonths[i];
            if (todayKey >= u.start && todayKey <= u.end) return i;
        }
        if (todayKey < unitMonths[0].start) return 0;
        return unitMonths.length - 1;
    }

    function formatUnitDday(todayKey, targetDate) {
        if (!todayKey || !targetDate) return '';
        const today = new Date(`${todayKey}T00:00:00`);
        const target = new Date(`${targetDate}T00:00:00`);
        const days = Math.round((target - today) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'D-DAY';
        if (days > 0) return `D-${days}`;
        return `D+${Math.abs(days)}`;
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatShortDate(dateKey) {
        if (!dateKey) return '-';
        const parts = String(dateKey).split('-');
        if (parts.length !== 3) return dateKey;
        return `${parts[1]}/${parts[2]}`;
    }

    function formatTimeShort(raw) {
        const t = String(raw || '').trim();
        if (!t || t === '-' || t === '00:00:00' || t === '00:00') return '-';
        return t.length >= 5 ? t.substring(0, 5) : t;
    }

    function isWithdrawnDirectAuth(student) {
        const note = String(student.note || '');
        const status = String(student.status || '');
        return note.includes('(회수)') || status.includes('(회수)');
    }

    function cleanAuthReasonText(note) {
        return String(note || '').trim()
            .replace(/\s*\(신청\)/g, '')
            .replace(/\s*\(승인\)/g, '')
            .replace(/\s*\(반려\)/g, '')
            .trim();
    }

    /** 화면 placeholder — 실제 사유로 인정하지 않음 */
    const INVALID_REASON_TEXTS = new Set(['-', '—', '–', '없음', '무', '.', '..', '...']);

    /** 실제 사유(note) 존재 여부 — 직권 판별 1순위 */
    function hasValidAuthReason(note) {
        const reason = cleanAuthReasonText(note);
        if (!reason) return false;
        return !INVALID_REASON_TEXTS.has(reason);
    }

    function isRejectedDirectAuth(student) {
        const note = String(student.note || '');
        const status = String(student.status || '');
        return note.includes('(반려)') || status.includes('(반려)');
    }

    function isPendingDirectAuth(student) {
        const status = String(student.status || '');
        const note = String(student.note || '');
        return status.includes('(신청)') || note.includes('(신청)');
    }

    function isApprovedDirectAuth(student) {
        return String(student.note || '').includes('(승인)');
    }

    function isExcludedAttendanceStatus(status) {
        const st = String(status || '');
        if (!st || st === '미편입' || st.includes('결석') || st === '중도탈락' || st === '조기수료') return true;
        if (st === '출석' || st.includes('정상')) return true;
        return false;
    }

    /** 신청·승인·완료(직권 유형 확정) 흐름 중 하나인지 */
    function isDirectAuthStatusFlow(student) {
        const st = String(student.status || '');
        const note = String(student.note || '');
        if (st.includes('(신청)') || note.includes('(신청)')) return true;
        if (note.includes('(승인)')) return true;
        return DIRECT_AUTH_TYPES.some(k => st.includes(k));
    }

    /**
     * 직권 판별 — 사유(note) 최우선
     * 1) 실제 사유 없음(빈값, -, (신청)만 등) → 제외
     * 2) (회수)·(반려) → 제외
     * 3) 신청·승인·완료(직권 유형) 흐름 + 사유 있음 → 직권
     */
    function isDirectAuthRecord(student) {
        if (!student || typeof student !== 'object') return false;
        if (!hasValidAuthReason(student.note)) return false;
        if (isWithdrawnDirectAuth(student)) return false;
        if (isRejectedDirectAuth(student)) return false;

        const st = String(student.status || '');
        if (isExcludedAttendanceStatus(st)) return false;

        return isDirectAuthStatusFlow(student);
    }

    function getDirectAuthState(student) {
        if (isPendingDirectAuth(student)) return '신청중';
        if (isApprovedDirectAuth(student)) return '승인';
        return '완료';
    }

    function formatAuthReason(student) {
        return cleanAuthReasonText(student.note) || '-';
    }

    /** status·note 기준 사유 분류 (알림 패널 집계용) */
    function getDirectAuthReasonCategory(student) {
        const status = String(student.status || '');
        const reason = cleanAuthReasonText(student.note);
        const combined = status + reason;

        if (ILLNESS_KEYWORDS.some(k => combined.includes(k))) return '질병/입원';
        if (status.includes('외출') || reason.includes('외출')) return '외출';
        if (status.includes('휴가') || reason.includes('휴가')) return '휴가';
        if (status.includes('지각')) return '지각';
        if (status.includes('조퇴')) return '조퇴';
        if (status.includes('공가') || reason.includes('공가')) return '공가';
        if (status.includes('경조사') || reason.includes('경조사')) return '경조사';
        if (status.includes('훈련수당')) return '훈련수당';
        if (status.includes('출석인정')) return '출석인정';
        return '기타';
    }

    /** 사유별 고유 훈련생 수 (동일 학생·동일 사유는 1명) */
    function buildReasonCategoryCounts(records) {
        const categoryStudents = {};
        (records || []).forEach(row => {
            const cat = row.category || '기타';
            if (!categoryStudents[cat]) categoryStudents[cat] = new Set();
            categoryStudents[cat].add(row.studentName);
        });
        return REASON_CATEGORY_ORDER
            .map(label => ({ label, count: (categoryStudents[label] || new Set()).size }))
            .filter(item => item.count > 0);
    }

    function formatCombinedTime(primary, secondary) {
        const p = formatTimeShort(primary);
        const s = formatTimeShort(secondary);
        if (p === '-' && s === '-') return '-';
        if (s === '-') return p;
        if (p === '-') return `(${s})`;
        return `${p}\n(${s})`;
    }

    function formatTimeCellHtml(raw) {
        const text = String(raw ?? '').trim();
        if (!text || text === '-') return escapeHtml('-');
        return text.split('\n').map(line => escapeHtml(line)).join('<br>');
    }

    function formatAuthTimeColumns(student) {
        const status = String(student.status || '');
        const isOuting = status.includes('외출');
        if (isOuting) {
            return {
                left: formatCombinedTime(student.inTime, student.leaveTime),
                right: formatCombinedTime(student.outTime, student.returnTime)
            };
        }
        return {
            left: formatTimeShort(student.inTime),
            right: formatTimeShort(student.outTime)
        };
    }

    function parseApplyDateFromMeta(metadata, occurDate) {
        if (!metadata || !metadata.uploadTime) {
            return formatShortDate(occurDate);
        }
        const uploadTime = String(metadata.uploadTime);
        const year = String(occurDate || '').split('-')[0] || String(new Date().getFullYear());
        const m = uploadTime.match(/(\d{1,2})\s*월?\s*(\d{1,2})\s*일?/);
        if (m) {
            return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`;
        }
        const slash = uploadTime.match(/(\d{1,2})\/(\d{1,2})/);
        if (slash) {
            return `${slash[1].padStart(2, '0')}/${slash[2].padStart(2, '0')}`;
        }
        const dash = uploadTime.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (dash) return `${dash[2]}/${dash[3]}`;
        return formatShortDate(occurDate);
    }

    function formatUnitPeriodText(unit) {
        if (!unit) return '';
        return `${unit.start.slice(5).replace('-', '/')} ~ ${unit.end.slice(5).replace('-', '/')}`;
    }

    function buildDirectAuthList({
        dailyAttendance,
        rawTimetable,
        subjectList,
        unitList,
        todayKey,
        unitIndex
    }) {
        const validTrainingDays = getValidTrainingDays(rawTimetable, subjectList, unitList);
        const unitMonths = buildUnitMonths(validTrainingDays);
        if (!unitMonths.length) {
            return { unitLabel: '', periodText: '', records: [], count: 0, reasonCounts: [], unitIndex: -1, unitMonths: [] };
        }

        const defaultIndex = getCurrentUnitIndex(unitMonths, todayKey);
        const resolvedIndex = (typeof unitIndex === 'number' && unitIndex >= 0)
            ? Math.min(unitIndex, unitMonths.length - 1)
            : defaultIndex;
        const unit = unitMonths[resolvedIndex];
        const records = [];

        Object.keys(dailyAttendance || {}).forEach(dateKey => {
            if (dateKey < unit.start || dateKey > unit.end) return;
            const dayData = dailyAttendance[dateKey];
            if (!dayData || typeof dayData !== 'object') return;

            const applyDate = parseApplyDateFromMeta(dayData._metadata, dateKey);

            Object.keys(dayData).forEach(name => {
                if (name === '_metadata') return;
                const student = dayData[name];
                if (!isDirectAuthRecord(student)) return;

                const times = formatAuthTimeColumns(student);
                records.push({
                    occurDate: dateKey,
                    applyDate,
                    studentName: name,
                    reason: formatAuthReason(student),
                    category: getDirectAuthReasonCategory(student),
                    inOrLeaveTime: times.left,
                    outOrReturnTime: times.right,
                    state: getDirectAuthState(student)
                });
            });
        });

        records.sort((a, b) => {
            const byDate = a.occurDate.localeCompare(b.occurDate);
            if (byDate !== 0) return byDate;
            return a.studentName.localeCompare(b.studentName, 'ko');
        });

        const reasonCounts = buildReasonCategoryCounts(records);

        return {
            unitLabel: unit.label,
            periodText: formatUnitPeriodText(unit),
            unitStartDate: unit.start,
            unitEndDate: unit.end,
            unitIndex: resolvedIndex,
            currentUnitIndex: defaultIndex,
            unitMonths,
            records,
            reasonCounts,
            count: records.length
        };
    }

    function renderDirectAuthTableHtml(records, options) {
        const opts = options || {};
        const compact = !!opts.compact;
        const maxRows = opts.maxRows || (compact ? 6 : records.length);
        const emptyText = opts.emptyText || '✅ 해당 단위 직권 신청 없음';

        if (!records.length) {
            return `<div class="direct-auth-empty-line">${escapeHtml(emptyText)}</div>`;
        }

        const visible = records.slice(0, maxRows);
        const extra = records.length > maxRows
            ? `<div class="direct-auth-more-line">외 ${records.length - maxRows}건 더 있음</div>`
            : '';

        const head = `
            <thead>
                <tr>
                    <th>순번</th>
                    <th>발생일</th>
                    <th>훈련생성명</th>
                    <th>사유</th>
                    <th>입실(외출)</th>
                    <th>퇴실(복귀)</th>
                </tr>
            </thead>`;

        const body = visible.map((row, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(formatShortDate(row.occurDate))}</td>
                <td>${escapeHtml(row.studentName)}</td>
                <td class="direct-auth-reason" title="${escapeHtml(row.reason)}">${escapeHtml(row.reason)}</td>
                <td class="direct-auth-time">${formatTimeCellHtml(row.inOrLeaveTime)}</td>
                <td class="direct-auth-time">${formatTimeCellHtml(row.outOrReturnTime)}</td>
            </tr>
        `).join('');

        const tableClass = compact ? 'direct-auth-table direct-auth-table-compact' : 'direct-auth-table';
        return `
            <div class="direct-auth-table-wrap">
                <table class="${tableClass}">
                    ${head}
                    <tbody>${body}</tbody>
                </table>
            </div>
            ${extra}`;
    }

    function updateDirectAuthUnitBadge(labelEl, ddayEl, data, todayKey) {
        if (!data.unitLabel) {
            if (labelEl) { labelEl.textContent = ''; labelEl.title = ''; }
            if (ddayEl) { ddayEl.textContent = ''; ddayEl.title = ''; }
            return;
        }
        if (labelEl) {
            labelEl.textContent = data.unitLabel;
            labelEl.title = data.periodText || data.unitLabel;
        }
        if (ddayEl && data.unitEndDate) {
            const ddayText = formatUnitDday(todayKey, data.unitEndDate);
            ddayEl.textContent = ddayText;
            ddayEl.title = `단위개월 종료 ${data.unitEndDate} · ${ddayText}`;
        } else if (ddayEl) {
            ddayEl.textContent = '';
            ddayEl.title = '';
        }
    }

    function renderPageInfoGrid(data, gridEl) {
        if (!gridEl) return;

        const reasonCounts = data.reasonCounts || buildReasonCategoryCounts(data.records);
        const periodText = data.periodText || '단위개월 정보 없음';
        const totalCount = data.count || 0;
        const colCount = Math.max(reasonCounts.length, 1);

        gridEl.style.gridTemplateColumns = `minmax(148px, auto) repeat(${colCount}, minmax(56px, 1fr))`;

        const labelCells = reasonCounts.map(item =>
            `<div class="direct-auth-reason-cell direct-auth-reason-label">${escapeHtml(item.label)}</div>`
        ).join('');
        const countCells = reasonCounts.map(item =>
            `<div class="direct-auth-reason-cell direct-auth-reason-count">${item.count}명</div>`
        ).join('');

        gridEl.innerHTML = `
            <div class="info-bar-meta-cell"><strong>단위기간</strong> ${escapeHtml(periodText)}</div>
            ${labelCells}
            <div class="info-bar-meta-cell"><span class="summary-total-label">총 신청</span> <span class="summary-total-count">${totalCount}</span></div>
            ${countCells}
        `;
    }

    function renderAlertReasonSummaryHtml(reasonCounts, totalCount, options) {
        const opts = options || {};
        const emptyText = opts.emptyText || '✅ 이번 단위 직권 신청 없음';
        const emptyClass = opts.emptyClass || 'direct-auth-empty-line';

        if (!totalCount || !reasonCounts.length) {
            return `<div class="${emptyClass}">${escapeHtml(emptyText)}</div>`;
        }
        const labelsRow = reasonCounts.map(item =>
            `<span class="direct-auth-reason-cell direct-auth-reason-label">${escapeHtml(item.label)}</span>`
        ).join('');
        const countsRow = reasonCounts.map(item =>
            `<span class="direct-auth-reason-cell direct-auth-reason-count">${item.count}명</span>`
        ).join('');
        return `
            <div class="direct-auth-reason-grid">
                <div class="direct-auth-reason-row">${labelsRow}</div>
                <div class="direct-auth-reason-row">${countsRow}</div>
            </div>`;
    }

    function renderAlertPanel(listEl, countEl, labelEl, data, ddayEl, todayKey) {
        if (countEl) {
            const count = data.count || 0;
            if (count > 0) {
                countEl.textContent = String(count);
                countEl.style.display = '';
                countEl.classList.remove('is-zero');
            } else {
                countEl.textContent = '';
                countEl.style.display = 'none';
                countEl.classList.add('is-zero');
            }
        }
        updateDirectAuthUnitBadge(labelEl, ddayEl || null, data, todayKey || getTodayDateKey());
        if (!listEl) return;
        const reasonCounts = data.reasonCounts || buildReasonCategoryCounts(data.records);
        listEl.innerHTML = renderAlertReasonSummaryHtml(reasonCounts, data.count || 0);
    }

    async function loadDirectAuthPageContext(classDbRefFn) {
        const [masterSnap, timetableSnap, attendanceSnap] = await Promise.all([
            classDbRefFn('masterData').once('value'),
            classDbRefFn('fullTimetable').once('value'),
            classDbRefFn('dailyAttendance').once('value')
        ]);

        const masterData = masterSnap.val() || {};
        const timetableVal = timetableSnap.val() || [];
        const rawTimetable = Array.isArray(timetableVal) ? timetableVal : Object.values(timetableVal);
        const dailyAttendance = attendanceSnap.val() || {};
        const courses = masterData.courses || [];
        const subjectList = [...new Set(courses.map(c => cleanCompareText(c.subject)).filter(Boolean))];
        const unitList = [...new Set(courses.map(c => cleanCompareText(c.unit)).filter(Boolean))];
        const todayKey = getTodayDateKey();
        const validTrainingDays = getValidTrainingDays(rawTimetable, subjectList, unitList);
        const unitMonths = buildUnitMonths(validTrainingDays);
        const currentUnitIndex = getCurrentUnitIndex(unitMonths, todayKey);

        return {
            dailyAttendance,
            rawTimetable,
            subjectList,
            unitList,
            todayKey,
            unitMonths,
            currentUnitIndex
        };
    }

    async function loadDirectAuthData(classDbRefFn) {
        const ctx = await loadDirectAuthPageContext(classDbRefFn);
        const result = buildDirectAuthList({
            dailyAttendance: ctx.dailyAttendance,
            rawTimetable: ctx.rawTimetable,
            subjectList: ctx.subjectList,
            unitList: ctx.unitList,
            todayKey: ctx.todayKey
        });

        return result;
    }

    let standalonePageContext = null;
    let standaloneSelectedUnitIndex = -1;

    function renderStandaloneUnitButtons(selectBarEl, unitMonths, selectedIndex, currentIndex) {
        if (!selectBarEl) return;
        if (!unitMonths.length) {
            selectBarEl.innerHTML = '<div class="unit-select-hint">단위개월 정보가 없습니다.</div>';
            return;
        }

        const buttonsHtml = unitMonths.map((unit, idx) => {
            const isActive = idx === selectedIndex;
            const isPast = idx < currentIndex;
            const classes = [
                'unit-select-btn',
                isActive ? 'active' : '',
                isPast ? 'past' : ''
            ].filter(Boolean).join(' ');
            const period = formatUnitPeriodText(unit);
            return `<button type="button" class="${classes}" data-unit-index="${idx}" title="${escapeHtml(period)}">${escapeHtml(unit.label)}</button>`;
        }).join('');

        selectBarEl.innerHTML = `
            ${buttonsHtml}
            <div class="unit-select-hint">지난 단위개월을 선택하면 해당 기간 직권 신청 내역을 확인할 수 있습니다.</div>
        `;

        selectBarEl.querySelectorAll('[data-unit-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-unit-index'), 10);
                if (Number.isNaN(idx)) return;
                renderStandaloneUnitView(idx);
            });
        });
    }

    function renderStandaloneUnitView(unitIndex) {
        const tableArea = document.getElementById('directAuthTableArea');
        const titleEl = document.getElementById('directAuthPageTitle');
        const infoGridEl = document.getElementById('directAuthInfoGrid');
        const selectBarEl = document.getElementById('directAuthUnitSelectBar');
        const ctx = standalonePageContext;

        if (!ctx || !tableArea) return;

        standaloneSelectedUnitIndex = unitIndex;
        const data = buildDirectAuthList({
            dailyAttendance: ctx.dailyAttendance,
            rawTimetable: ctx.rawTimetable,
            subjectList: ctx.subjectList,
            unitList: ctx.unitList,
            todayKey: ctx.todayKey,
            unitIndex
        });

        renderStandaloneUnitButtons(selectBarEl, ctx.unitMonths, unitIndex, ctx.currentUnitIndex);

        const isCurrent = unitIndex === ctx.currentUnitIndex;
        if (titleEl) {
            titleEl.textContent = data.unitLabel
                ? `${isCurrent ? '이번' : '지난'} 단위개월 직권 신청 · ${data.unitLabel}`
                : '단위개월별 직권 신청';
        }
        renderPageInfoGrid(data, infoGridEl);
        tableArea.innerHTML = renderDirectAuthTableHtml(data.records, {
            compact: false,
            emptyText: `✅ ${data.unitLabel || '해당 단위'} 직권 신청 없음`
        });
    }

    async function initStandalonePage() {
        const tableArea = document.getElementById('directAuthTableArea');
        if (!tableArea) return;

        try {
            standalonePageContext = await loadDirectAuthPageContext(classDbRef);
            const startIndex = standalonePageContext.currentUnitIndex >= 0
                ? standalonePageContext.currentUnitIndex
                : 0;
            renderStandaloneUnitView(startIndex);
        } catch (err) {
            console.error('직권신청 로드 오류:', err);
            tableArea.innerHTML = `<div class="direct-auth-empty-line" style="color:#c0392b; background:#fff5f5; border-color:#fed7d7;">데이터를 불러오지 못했습니다.</div>`;
        }
    }

    global.DirectAuthAPI = {
        buildDirectAuthList,
        renderDirectAuthTableHtml,
        renderAlertPanel,
        loadDirectAuthData,
        loadDirectAuthPageContext,
        initStandalonePage,
        getTodayDateKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
