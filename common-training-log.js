/**
 * common-training-log.js — 훈련일지 팝업 (index1·능력단위시간표 공용)
 */
(function () {
    'use strict';

    function trainingLogGetFixDate(rawDate) {
        if (!rawDate) return '날짜미상';
        let s = String(rawDate).trim();
        s = s.replace(/\./g, '-');
        if (s.includes('/')) {
            const p = s.split('/');
            if (p.length === 3) {
                const year = p[2].length === 2 ? '20' + p[2] : p[2];
                const month = p[0].padStart(2, '0');
                const day = p[1].padStart(2, '0');
                s = `${year}-${month}-${day}`;
            }
        }
        return s.substring(0, 10);
    }

    function isStudyTimetableRow(row) {
        if (!row || String(row.교시 || '').trim() === '점심') return false;
        const subjectName = String(row.교과목 || '').trim();
        const unitName = String(row.능력단위 || '').trim();
        return subjectName !== '' && unitName !== '';
    }

    function getTimetableDisplayName(row, mode) {
        if (!isStudyTimetableRow(row)) return '';
        const val = mode === 'subject' ? row.교과목 : row.능력단위;
        return String(val || '').trim();
    }

    function buildCalendarMaps(rawTimetable, calendarSubMode) {
        const globalFirstDateMap = {};
        const allBusinessDays = new Set();
        const tempSubDates = {};

        (rawTimetable || []).forEach(r => {
            if (!isStudyTimetableRow(r)) return;
            const sub = getTimetableDisplayName(r, calendarSubMode);
            if (!sub) return;
            const d = trainingLogGetFixDate(r.날짜);
            allBusinessDays.add(d);
            if (!tempSubDates[sub]) tempSubDates[sub] = new Set();
            tempSubDates[sub].add(d);
        });

        const globalSortedBusinessDays = Array.from(allBusinessDays).sort();
        const targetStartDay = globalSortedBusinessDays.length >= 11 ? globalSortedBusinessDays[10] : '0000-00-00';

        for (const sub in tempSubDates) {
            const sortedDates = Array.from(tempSubDates[sub]).sort();
            const effectiveDates = sortedDates.filter(d => d >= targetStartDay);
            globalFirstDateMap[sub] = effectiveDates.length > 0 ? effectiveDates[0] : sortedDates[0];
        }

        return { globalFirstDateMap, globalSortedBusinessDays };
    }

    function buildSmartMemoText(ctx, date) {
        const dayIdx = new Date(date).getDay();
        const todaySubjects = new Set();

        (ctx.rawTimetable || []).forEach(r => {
            if (trainingLogGetFixDate(r.날짜) !== date) return;
            if (!isStudyTimetableRow(r)) return;
            const sub = getTimetableDisplayName(r, ctx.calendarSubMode);
            if (sub) todaySubjects.add(sub);
        });

        let baseMsg = '';
        if (dayIdx === 1) baseMsg = '출결진행에 변동 발생시 학교로 꼭 연락바라며, 수업시간에는 집중하여 열공합시다.';
        else if (dayIdx === 2) baseMsg = '작업 전 작업순서를 반드시 숙지한 후 안전에 유의해서 작업에 임합시다.';
        else if (dayIdx === 3) baseMsg = '개인건강 및 작업안전 관리에 만전을 기합시다.';
        else if (dayIdx === 4) baseMsg = '수업시간에는 수업에 집중합시다.';
        else if (dayIdx === 5) baseMsg = '개인건강관리와 작업안전관리에 만전을 기해 주시고, 건강한 모습으로 만납시다.';
        else baseMsg = todaySubjects.size > 0 ? '주말에도 수업하는라 수고하셨습니다.' : '주말/휴일입니다.';

        const cleanText = (str) => String(str).split(',').map(s => s
            .replace(/\[.*?\]|\(.*?\)/g, '')
            .replace(/^[a-zA-Z0-9_\-]{5,}\s*/, '')
            .replace(/^[\s\-_]+/, '')
            .trim()).join(', ');

        let specialMsg = '';
        const evalDatesObj = (ctx.evaluationDates && ctx.evaluationDates[ctx.calendarSubMode]) || {};
        const globalFirstDateMap = ctx.globalFirstDateMap || {};
        const globalSortedBusinessDays = ctx.globalSortedBusinessDays || [];

        todaySubjects.forEach(sub => {
            const displaySub = cleanText(sub);
            if (globalFirstDateMap[sub] === date) {
                specialMsg += `\n오늘부터 배우게 된 '${displaySub}' 과목에 대한 내부평가 제반사항을 안내하오니 숙지해 주시기 바랍니다.`;
            }
        });

        if (evalDatesObj[date]) {
            const displaySubs = cleanText(evalDatesObj[date].subjects || '지정되지 않은');
            specialMsg += `\n오늘 '${displaySubs}' 과목의 내부평가 수행하느라 수고하셨습니다.`;
        }

        const currentIdx = globalSortedBusinessDays.indexOf(date);
        if (currentIdx !== -1 && currentIdx + 1 < globalSortedBusinessDays.length) {
            const nextBDate = globalSortedBusinessDays[currentIdx + 1];
            if (evalDatesObj[nextBDate]) {
                const nextSubs = cleanText(evalDatesObj[nextBDate].subjects || '지정되지 않은');
                specialMsg += `\n다음 훈련일(${nextBDate})에 '${nextSubs}' 과목의 내부평가가 있으니 꼭 출석해 주세요.`;
            }
        }

        if (specialMsg.trim() !== '') return specialMsg.replace(/^\n/, '');
        return baseMsg;
    }

    async function copyLogText(text, element) {
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = text;
        tempTextArea.style.position = 'fixed';
        tempTextArea.style.top = '-9999px';
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        tempTextArea.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');
            element.style.backgroundColor = '#c8e6c9';
            element.style.fontWeight = 'bold';
            element.style.color = '#27ae60';
            setTimeout(() => {
                element.style.backgroundColor = 'transparent';
                element.style.fontWeight = 'normal';
                element.style.color = '';
            }, 400);
        } catch (err) {
            const alertFn = window.appAlert || alert;
            await alertFn('복사 실패: 브라우저 환경을 확인해주세요.');
        } finally {
            document.body.removeChild(tempTextArea);
        }
    }

    async function openTrainingLog(ctx, date, event) {
        if (event) event.stopPropagation();
        const alertFn = ctx.appAlert || window.appAlert || alert;

        const existing = document.getElementById('trainingLogOverlay');
        if (existing) existing.remove();

        const dayData = (ctx.rawTimetable || []).filter(r => {
            if (trainingLogGetFixDate(r.날짜) !== date) return false;
            const periodStr = String(r.교시).trim();
            const periodNum = parseInt(periodStr.replace(/[^0-9]/g, ''), 10) || 0;
            return periodStr !== '점심' && periodNum > 0;
        });

        if (dayData.length === 0) return await alertFn('해당 일자에 진행된 수업 데이터가 없습니다.');

        dayData.sort((a, b) => {
            const pA = parseInt(String(a.교시).replace(/[^0-9]/g, ''), 10) || 0;
            const pB = parseInt(String(b.교시).replace(/[^0-9]/g, ''), 10) || 0;
            return pA - pB;
        });

        const toMin = (t) => {
            if (!t || !String(t).includes(':')) return 0;
            const p = t.split(':');
            return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
        };
        const fmtTime = (t) => {
            if (!t || t === '-' || t.length < 5) return '';
            return t.substring(0, 5).replace(':', '');
        };

        const dayAtt = (ctx.fullAttendanceData && ctx.fullAttendanceData[date]) || {};
        const isLeave = ctx.isDateOnOrAfterStudentLeave || (() => false);
        let prevSubject = '';
        let prevTeacher = '';
        let prevNcs = '';
        let tbodyHtml = '';

        dayData.forEach((r) => {
            const periodStr = String(r.교시).replace(/[^0-9]/g, '');
            const subject = String(r.교과목 || '-').trim();
            const teacher = String(r.강사명 || r.교사 || r.담당교사 || '김회준').trim();
            let ncs = String(r.능력단위 || subject).trim();
            if (r.isEval) ncs += '(평가시험)';

            const timeStr = String(r.시간 || r.교육시간 || '').replace(/\s/g, '');
            let classStart = 0, classEnd = 0, expectedDur = 0;

            if (timeStr.includes('~') || timeStr.includes('-')) {
                const parts = timeStr.split(/[~-]/);
                classStart = toMin(parts[0]);
                classEnd = toMin(parts[1]);
                expectedDur = Math.max(0, classEnd - classStart);
            } else {
                const fallback = {
                    1: { s: '09:00', e: '09:50' }, 2: { s: '10:00', e: '10:50' }, 3: { s: '11:00', e: '11:50' }, 4: { s: '12:00', e: '12:50' },
                    5: { s: '14:00', e: '14:50' }, 6: { s: '15:00', e: '15:50' }, 7: { s: '16:00', e: '16:50' }, 8: { s: '17:00', e: '17:50' }
                };
                const pNum = parseInt(periodStr, 10);
                if (fallback[pNum]) {
                    classStart = toMin(fallback[pNum].s);
                    classEnd = toMin(fallback[pNum].e);
                    expectedDur = classEnd - classStart;
                }
            }

            const missingStudents = [];
            (ctx.studentNames || []).forEach(name => {
                const att = dayAtt[name];
                if (!att || att.status === '미편입') return;
                if (isLeave(name, date)) return;

                const st = att.status ? String(att.status).trim() : '';
                let sIn = toMin(att.inTime), sOut = toMin(att.outTime);
                let lIn = toMin(att.leaveTime), rIn = toMin(att.returnTime);
                let effectiveIn = sIn;
                if (effectiveIn > 0 && effectiveIn <= classStart + 10) effectiveIn = classStart;
                let effectiveOut = sOut;
                if (effectiveOut > 0 && effectiveOut >= classEnd - 10) effectiveOut = classEnd;

                if (expectedDur > 0) {
                    let pStart = Math.max(effectiveIn, classStart);
                    let pEnd = Math.min(effectiveOut, classEnd);
                    let dur = Math.max(0, pEnd - pStart);
                    if (lIn > 0 && rIn > 0) {
                        const oStart = Math.max(lIn, classStart);
                        const oEnd = Math.min(rIn, classEnd);
                        dur -= Math.max(0, oEnd - oStart);
                    }
                    if (dur < expectedDur || st.includes('휴가') || st.includes('공가')) missingStudents.push(name);
                }
            });

            const dispRemark = missingStudents.join(', ');
            const dispSubject = (subject === prevSubject) ? '//' : subject;
            const dispTeacher = (teacher === prevTeacher) ? '//' : teacher;
            let dispNcs = ncs;
            if (ncs === prevNcs && !r.isEval) dispNcs = '//';

            const safeSubject = encodeURIComponent(subject).replace(/'/g, '%27');
            const safeTeacher = encodeURIComponent(teacher).replace(/'/g, '%27');
            const safeNcs = encodeURIComponent(ncs).replace(/'/g, '%27');
            const safeRemark = encodeURIComponent(dispRemark).replace(/'/g, '%27');
            const cellHover = 'transition: background 0.2s; cursor: pointer;';
            const onHover = "onmouseover=\"this.style.background='#e8f5e9'\" onmouseout=\"this.style.background='transparent'\"";

            tbodyHtml += `
            <tr style="border-bottom: 1px solid #ddd; background:#fff;">
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; font-weight:bold; color:#2c3e50;">${periodStr}</td>
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeSubject}'), this)" title="클릭 시 복사">${dispSubject}</td>
                <td style="padding:10px; border-right:1px solid #ddd; text-align:center; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeTeacher}'), this)" title="클릭 시 복사">${dispTeacher}</td>
                <td style="padding:10px; text-align:center; border-right:1px solid #ddd; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeNcs}'), this)" title="클릭 시 복사">${dispNcs}</td>
                <td style="padding:10px; text-align:center; font-size:11.5px; color:#c0392b; font-weight:bold; line-height:1.4; word-break:keep-all; ${cellHover}" ${onHover} onclick="copyLogText(decodeURIComponent('${safeRemark}'), this)" title="클릭 시 복사">${dispRemark}</td>
            </tr>`;

            prevSubject = subject;
            prevTeacher = teacher;
            prevNcs = ncs;
        });

        const lateList = [], absentList = [], earlyLeaveList = [], vacationList = [];
        const otherMap = {};
        let dropoutCount = 0;

        (ctx.studentNames || []).forEach(name => {
            if (isLeave(name, date)) {
                dropoutCount++;
                return;
            }
            const att = dayAtt[name];
            if (!att || !att.status) return;
            const st = att.status.trim();
            const inT = fmtTime(att.inTime);
            const outT = fmtTime(att.outTime);
            const lIn = fmtTime(att.leaveTime);
            const rIn = fmtTime(att.returnTime);

            if (st !== '출석' && st !== '미편입' && st !== '') {
                if (st.includes('결석')) absentList.push(name);
                else if (st.includes('휴가')) vacationList.push(name);
                else {
                    if (st.includes('지각')) lateList.push(`${name}(${inT})`);
                    if (st.includes('조퇴')) earlyLeaveList.push(`${name}(${outT})`);
                    if (st.includes('외출')) {
                        if (!otherMap['외출']) otherMap['외출'] = [];
                        otherMap['외출'].push(`${name}(${lIn}~${rIn})`);
                    }
                    if (st.includes('공가') || (!st.includes('지각') && !st.includes('결석') && !st.includes('조퇴') && !st.includes('휴가') && !st.includes('외출'))) {
                        let reason = att.note ? String(att.note).trim() : st;
                        if (!reason.includes('(회수)')) {
                            reason = reason.replace(/\s*\(신청\)/g, '').replace(/\s*\(승인\)/g, '').trim();
                        }
                        if (!otherMap[reason]) otherMap[reason] = [];
                        otherMap[reason].push(name);
                    }
                }
            }
        });

        const totalStudents = (ctx.studentNames || []).length;
        const currentEnrolled = totalStudents - dropoutCount;
        const absentCount = absentList.length;
        const presentCount = currentEnrolled - absentCount;
        const outingCount = otherMap['외출'] ? otherMap['외출'].length : 0;

        const statHtml = `
        <div style="margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse; border: 2px solid #95a5a6; font-size: 13px; text-align: center; background: #fff;">
                <tr style="border-bottom: 1px solid #ccc;">
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">재적</td>
                    <td style="color: #2980b9; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${currentEnrolled}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">출석</td>
                    <td style="color: #27ae60; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${presentCount}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">결석</td>
                    <td style="color: #c0392b; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${absentCount}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">휴가</td>
                    <td style="color: #f39c12; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${vacationList.length}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">지각</td>
                    <td style="color: #8e44ad; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${lateList.length}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">조퇴</td>
                    <td style="color: #d35400; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${earlyLeaveList.length}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">외출</td>
                    <td style="color: #34495e; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">${outingCount}명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">조수</td>
                    <td style="color: #7f8c8d; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">0명</td>
                    <td style="background: #ecf0f1; color: #2c3e50; font-weight: bold; padding: 10px 5px; border-right: 1px solid #ccc; width: 6%;">탈락</td>
                    <td style="color: #7f8c8d; font-weight: bold; padding: 10px 5px; width: 6%;">${dropoutCount}명</td>
                </tr>
            </table>
        </div>`;

        const formatArr = (arr) => arr.length > 0 ? arr.join(', ') : '';
        const rawLate = formatArr(lateList);
        const rawAbsent = formatArr(absentList);
        const rawEarly = formatArr(earlyLeaveList);
        const rawVacation = formatArr(vacationList);
        const otherResultArr = [];
        for (const key in otherMap) otherResultArr.push(`${key}:${otherMap[key].join(', ')}`);
        const rawOtherHtml = otherResultArr.length > 0 ? otherResultArr.join('<br>') : '';
        const rawOtherText = otherResultArr.length > 0 ? otherResultArr.join('\n') : '';

        const safeLate = encodeURIComponent(rawLate).replace(/'/g, '%27');
        const safeAbsent = encodeURIComponent(rawAbsent).replace(/'/g, '%27');
        const safeEarly = encodeURIComponent(rawEarly).replace(/'/g, '%27');
        const safeVacation = encodeURIComponent(rawVacation).replace(/'/g, '%27');
        const safeOther = encodeURIComponent(rawOtherText).replace(/'/g, '%27');
        const memoText = buildSmartMemoText(ctx, date);
        const safeMemoText = encodeURIComponent(memoText).replace(/'/g, '%27');

        const createRow = (title, safeData, rawData, isLast) => `
        <div style="display: flex; ${isLast ? '' : 'border-bottom: 1px solid #ddd;'}">
            <div style="width: 80px; background: #fdf2e9; color: #d35400; font-weight: bold; display: flex; align-items: center; justify-content: center; border-right: 1px solid #ddd; padding: 8px; flex-shrink: 0;">${title}</div>
            <div onclick="copyLogText(decodeURIComponent('${safeData}'), this)" title="클릭 시 우측 명단만 복사"
                 style="flex-grow: 1; font-size: 13px; color: #333; cursor: pointer; padding: 8px 12px; transition: background 0.2s; display: flex; align-items: center; min-height: 20px;"
                 onmouseover="this.style.background='#e8f5e9'" onmouseout="this.style.background='transparent'">${rawData}</div>
        </div>`;

        const overlay = document.createElement('div');
        overlay.id = 'trainingLogOverlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:6000; display:flex; justify-content:center; align-items:center;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff; padding:20px; border-radius:10px; border:2px solid #2980b9; width:1100px; max-width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 10px 30px rgba(0,0,0,0.3);';

        let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #2980b9; padding-bottom:10px; margin-bottom:15px;">
            <h3 style="margin:0; color:#2980b9;">📝 ${date} 훈련일지</h3>
            <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:none; border:none; font-size:20px; font-weight:bold; cursor:pointer; color:#7f8c8d;">✖</button>
        </div>
        ${statHtml}
        <div style="font-size:12px; color:#e67e22; font-weight:bold; margin-bottom:10px; text-align:right;">💡 화면에 '//'로 표시되어도, 클릭하면 실제 원본 내용이 복사됩니다.</div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; border: 2px solid #2c3e50;">
            <thead style="background:#f8f9fa;">
                <tr>
                    <th style="padding:10px; border:1px solid #ddd; width:7%;">교시</th>
                    <th style="padding:10px; border:1px solid #ddd; width:20%;">훈련과목</th>
                    <th style="padding:10px; border:1px solid #ddd; width:11%;">담당교사</th>
                    <th style="padding:10px; border:1px solid #ddd; width:37%;">훈련내용</th>
                    <th style="padding:10px; border:1px solid #ddd; width:25%;">비고</th>
                </tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
        </table>`;

        html += `
        <div style="margin-top:20px; border:2px solid #ddd; border-radius:6px; padding:15px; background:#f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid #f1c40f; padding-bottom:5px; margin-bottom:10px;">
                <span style="color:#d35400; font-weight:bold; font-size:14px;">📢 지시 전달사항</span>
                <span style="font-size:11px; color:#3498db; font-weight:bold;">(클릭 시 복사)</span>
            </div>
            <div onclick="copyLogText(decodeURIComponent('${safeMemoText}'), this)" title="클릭 시 복사"
                 style="font-size:13px; color:#555; line-height:1.6; white-space: pre-wrap; word-break: break-all; text-align:left; cursor:pointer; padding:8px; border-radius:4px; transition:background 0.2s;"
                 onmouseover="this.style.background='#e3f2fd'" onmouseout="this.style.background='transparent'">${memoText.trim()}</div>
        </div>`;

        html += `
        <div style="margin-top:15px; border:2px solid #ddd; border-radius:6px; padding:15px; background:#f9f9f9;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1.5px solid #27ae60; padding-bottom:5px; margin-bottom:10px;">
                <span style="color:#2c3e50; font-weight:bold; font-size:14px;">📊 일일 특이사항</span>
                <span style="font-size:11px; color:#3498db; font-weight:bold;">(우측 명단을 클릭 시 해당 텍스트만 복사됩니다)</span>
            </div>
            <div style="display: flex; flex-direction: column; border: 1px solid #ddd; border-radius: 4px; background: #fff; overflow: hidden;">
                ${createRow('지각자', safeLate, rawLate, false)}
                ${createRow('결석자', safeAbsent, rawAbsent, false)}
                ${createRow('조퇴자', safeEarly, rawEarly, false)}
                ${createRow('휴가자', safeVacation, rawVacation, false)}
                ${createRow('기타사항', safeOther, rawOtherHtml, true)}
            </div>
        </div>`;

        box.innerHTML = html;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    window.copyLogText = copyLogText;
    window.TrainingLogAPI = {
        buildCalendarMaps,
        buildSmartMemoText,
        open: openTrainingLog
    };
})();
