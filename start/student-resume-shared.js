/**
 * student-resume-shared.js — 학생 이력서 공통 (단위개월출석부 편입% 동일 계산)
 */
(function (global) {
    'use strict';

    function resolveTodayStrKst() {
        if (global.getTodayStrKst) return global.getTodayStrKst();
        const nowKst = new Date();
        const offset = nowKst.getTimezoneOffset() * 60000;
        return new Date(nowKst - offset).toISOString().split('T')[0];
    }

    function countMissingAsAbsent(dateStr, todayStr) {
        if (global.shouldCountMissingAttAsAbsent) {
            return global.shouldCountMissingAttAsAbsent(dateStr, todayStr);
        }
        return dateStr <= todayStr;
    }

    /** 단위개월출석부.js renderDetailTable — col-r2 편입(%) 와 동일 */
    function calculateUnitMonthPersonalRate(studentName, targetDays, fullAttendanceData, validTrainingDays, dropoutData) {
        if (!studentName || !targetDays?.length) return 0;

        let enrollDate = '';
        for (let d of validTrainingDays || targetDays) {
            const dayData = fullAttendanceData[d] ? fullAttendanceData[d][studentName] : null;
            if (dayData && dayData.status && dayData.status !== '미편입' && dayData.status !== '' && dayData.status !== '-') {
                enrollDate = d;
                break;
            }
        }

        let pureAbsent = 0;
        let lCount = 0;
        let eCount = 0;
        let oCount = 0;
        let personalTrainingDaysCount = 0;
        const todayStr = resolveTodayStrKst();
        const dropouts = dropoutData || {};

        targetDays.forEach(d => {
            const att = (fullAttendanceData[d] && fullAttendanceData[d][studentName])
                ? fullAttendanceData[d][studentName]
                : null;

            if (dropouts[studentName] && d >= dropouts[studentName]) {
                pureAbsent++;
                personalTrainingDaysCount++;
                return;
            }
            if (enrollDate && d < enrollDate) return;

            personalTrainingDaysCount++;
            if (!att) {
                if (countMissingAsAbsent(d, todayStr)) pureAbsent++;
            } else {
                const st = att.status || '';
                if (st.includes('결석') || st === '미편입') pureAbsent++;
                else {
                    if (st.includes('지각')) lCount++;
                    else if (st.includes('조퇴')) eCount++;
                    else if (st.includes('외출')) oCount++;
                }
            }
        });

        const penaltyAbs = Math.floor((lCount + eCount + oCount) / 3);
        const finalAbsent = pureAbsent + penaltyAbs;
        const pureAttendedDays = personalTrainingDaysCount - finalAbsent;
        return personalTrainingDaysCount > 0
            ? parseFloat((pureAttendedDays / personalTrainingDaysCount * 100).toFixed(1))
            : 0;
    }

    /** 일일출석부 dailyAttendance 에 저장된 birthDate (YYYY.MM.DD) */
    function getStudentBirthDateFromAttendance(studentName, fullAttendanceData) {
        if (!studentName || !fullAttendanceData) return '';
        for (const dayData of Object.values(fullAttendanceData)) {
            if (!dayData || typeof dayData !== 'object') continue;
            const info = dayData[studentName];
            if (info && info.birthDate) return String(info.birthDate).trim();
        }
        return '';
    }

    function rowToDateSortKey(row) {
        const y = parseInt(row.year, 10) || 0;
        const m = parseInt(row.month, 10) || 0;
        const d = parseInt(row.day, 10) || 0;
        return y * 10000 + m * 100 + d;
    }

    function sortResumeRowsByDate(rows, ascending) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        list.sort((a, b) => {
            const diff = rowToDateSortKey(a) - rowToDateSortKey(b);
            return ascending === false ? -diff : diff;
        });
        return list;
    }

    function getResumeLocalStorageKey(studentName) {
        if (typeof classStorageKey === 'function') {
            return classStorageKey('studentResume_lastSubmit_' + studentName);
        }
        return 'studentResume_lastSubmit_' + studentName;
    }

    function emptyResumeRow() {
        return { year: '', month: '', day: '', content: '' };
    }

    function formatFullAddress(basic) {
        const b = basic && typeof basic === 'object' ? basic : {};
        const parts = [b.addressSido, b.addressSigungu, b.addressDetail]
            .map(v => (v != null ? String(v).trim() : ''))
            .filter(Boolean);
        if (parts.length) return parts.join(' ');
        return String(b.address || '').trim();
    }

    /** 신규(시·구 분리) + 구버전(주소 한 줄) 호환 */
    function normalizeBasicAddress(basic) {
        const b = basic && typeof basic === 'object' ? { ...basic } : {};
        b.addressSido = b.addressSido != null ? String(b.addressSido).trim() : '';
        b.addressSigungu = b.addressSigungu != null ? String(b.addressSigungu).trim() : '';
        b.addressDetail = b.addressDetail != null ? String(b.addressDetail).trim() : '';
        if (!b.addressSido && !b.addressSigungu && !b.addressDetail && b.address) {
            b.addressDetail = String(b.address).trim();
        }
        b.address = formatFullAddress(b);
        return b;
    }

    function buildDefaultResumeForm(studentName, attendanceRate) {
        return {
            basic: {
                name: studentName || '',
                email: '',
                phone: '',
                addressSido: '',
                addressSigungu: '',
                addressDetail: '',
                address: ''
            },
            careerHistory: [emptyResumeRow()],
            finalEducation: [emptyResumeRow()],
            skillsCerts: [emptyResumeRow()],
            totalAttendanceRate: attendanceRate != null ? attendanceRate : ''
        };
    }

    const RESUME_DAILY_SUBMIT_LIMIT = 5;

    global.StudentResumeShared = {
        RESUME_DAILY_SUBMIT_LIMIT,
        getTodayStrKst: resolveTodayStrKst,
        calculateUnitMonthPersonalRate,
        getStudentBirthDateFromAttendance,
        sortResumeRowsByDate,
        getResumeLocalStorageKey,
        emptyResumeRow,
        buildDefaultResumeForm,
        formatFullAddress,
        normalizeBasicAddress
    };
})(typeof window !== 'undefined' ? window : globalThis);
