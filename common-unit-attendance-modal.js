/**
 * common-unit-attendance-modal.js — 능력단위 출석부 모달 (index1·달력보기 공용)
 */
(function () {
    'use strict';

    let ctx = {};
    let currentMode = 'ncs';
    let lastOpenSub = '';
    let lastOpenDate = '';
    let lastDetailMode = 'real';

    function getFixDate(rawDate) {
        if (!rawDate) return '날짜미상';
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

    function getStudentLeaveDate(name) {
        if (ctx.dropoutData && ctx.dropoutData[name]) return ctx.dropoutData[name];
        if (ctx.earlyCompletionData && ctx.earlyCompletionData[name]) return ctx.earlyCompletionData[name];
        return null;
    }

    function isStudentLeaveOnOrBefore(name, cutoffDate) {
        const leaveDate = getStudentLeaveDate(name);
        return !!(leaveDate && leaveDate <= cutoffDate);
    }

    function isDateOnOrAfterStudentLeave(name, date) {
        const leaveDate = getStudentLeaveDate(name);
        return !!(leaveDate && date >= leaveDate);
    }

    function getParticipationSchedulesForDate(date, targetSub, modeOverride) {
        const activeMode = modeOverride || currentMode;
        return (ctx.rawTimetable || []).filter(r => {
            const rowVal = activeMode === 'subject' ? String(r.교과목 || '') : String(r.능력단위 || '');
            return getFixDate(r.날짜) === date && rowVal.replace(/\s+/g, '') === String(targetSub).replace(/\s+/g, '');
        });
    }

    function calculateParticipation(date, inTime, outTime, targetSub, leaveTime, returnTime, modeOverride) {
        if (!inTime || !outTime || inTime.startsWith('00')) return { am: 0, pm: 0 };

        const scheds = getParticipationSchedulesForDate(date, targetSub, modeOverride);
        let am = 0;
        let pm = 0;
        const toMin = (t) => {
            if (!t || !String(t).includes(':')) return 0;
            const p = t.split(':');
            return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
        };
        const sIn = toMin(inTime);
        const sOut = toMin(outTime);
        const lIn = toMin(leaveTime);
        const rIn = toMin(returnTime);
        const lunchS = 13 * 60;
        const lunchE = 13 * 60 + 30;

        scheds.forEach(s => {
            const timeStr = String(s.시간 || s.교육시간 || '').replace(/\s/g, '');
            const parts = timeStr.split(/[~-]/);
            if (parts.length >= 2) {
                let start = toMin(parts[0]);
                let end = toMin(parts[1]) + 10;
                let actualStart = Math.max(sIn, start);
                let actualEnd = Math.min(sOut, end);
                let dur = Math.max(0, actualEnd - actualStart);
                dur -= Math.max(0, Math.min(actualEnd, lunchE) - Math.max(actualStart, lunchS));
                if (lIn > 0 && rIn > 0) {
                    const overlapOut = Math.max(0, Math.min(rIn, actualEnd) - Math.max(lIn, actualStart));
                    const outLunch = Math.max(0, Math.min(rIn, lunchE, actualEnd) - Math.max(lIn, lunchS, actualStart));
                    dur -= (overlapOut - outLunch);
                }
                const p = String(s.교시).trim();
                if (['1', '2', '3', '4'].includes(p)) am += dur;
                else if (['5', '6', '7', '8'].includes(p)) pm += dur;
            }
        });
        return { am: Math.round(am), pm: Math.round(pm) };
    }

    function calculateRowPercent(name, masterTotal, inputEl) {
        if (!masterTotal || masterTotal <= 0 || !inputEl) return;
        const row = inputEl.closest('tr');
        if (!row) return;

        const makeupInput = row.querySelector('.makeup-input');
        const makeupValue = makeupInput ? (parseInt(makeupInput.value, 10) || 0) : 0;
        const cells = row.querySelectorAll('td');
        let rowSum = 0;

        for (let i = 2; i < cells.length - 4; i++) {
            const cell = cells[i];
            const simInput = cell.querySelector('.sim-input');
            rowSum += simInput ? (parseInt(simInput.value, 10) || 0) : (parseInt(cell.innerText, 10) || 0);
        }

        const finalSum = rowSum + makeupValue;
        const percent = ((finalSum / masterTotal) * 100).toFixed(1);
        const totalMinEl = row.querySelector('[id^="totalMin_"]');
        const totalHourEl = row.querySelector('[id^="totalHour_"]');
        const percentEl = row.querySelector('[id^="percent_"]');

        if (totalMinEl) totalMinEl.innerText = finalSum;
        if (totalHourEl) totalHourEl.innerText = (finalSum / 60).toFixed(1) + 'h';
        if (percentEl) {
            percentEl.innerText = percent + '%';
            percentEl.style.color = percent < 75 ? 'red' : 'green';
        }
    }

    function renderFinalTable(dates, results, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode) {
        const thead = document.getElementById(headId);
        const tbody = document.getElementById(bodyId);
        if (!thead || !tbody) return;

        if (headId === 'modalHead') {
            const actionArea = document.getElementById('modalActionArea');
            if (actionArea) {
                const btnHtml = mode === 'real'
                    ? `<button class="ctrl-btn sim-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'sim')" style="background:#8e44ad; font-size:11px; padding:7px 12px; margin-right:10px; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">🔮 남은일수 출결률 보기</button>`
                    : `<button class="ctrl-btn sim-btn" onclick="loadDetailInto('${selectedSub}', '${headId}', '${bodyId}', 'real')" style="background:#34495e; font-size:11px; padding:7px 12px; margin-right:10px; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">⏪ 실제 출결만 보기</button>`;
                const existingBtn = actionArea.querySelector('.sim-btn');
                if (existingBtn) existingBtn.remove();
                const saveBtn = actionArea.querySelector('.btn-excel');
                if (saveBtn) saveBtn.insertAdjacentHTML('beforebegin', btnHtml);
            }
        }

        let h1 = `<tr>
        <th rowspan="2" class="sticky-no" style="width: 30px;">No</th>
        <th rowspan="2" class="sticky-col" style="width: 46px !important; min-width: 46px !important; max-width: 46px !important; font-size: 11px; padding: 2px !important;">훈련생명</th>`;
        let h2 = '<tr>';

        dates.forEach(d => {
            const isTarget = d === window.lastSelectedDate;
            const headStyle = isTarget ? 'background:#fff3e0; border:2px solid #e67e22 !important; color:#e67e22;' : 'background:#f8f9fa;';
            const subStyle = isTarget ? 'background:#fffef0; font-weight:bold;' : '';
            h1 += `<th colspan="2" style="${headStyle}">${dateWithDay[d]}</th>`;
            h2 += `<th style="${subStyle}">오전</th><th style="${subStyle}">오후</th>`;
        });

        h1 += `<th rowspan="2" style="background:#e3f2fd; width: 35px !important; min-width: 35px !important; max-width: 35px !important; font-size: 10.5px; line-height: 1.2; padding: 2px !important;">보강<br>(분)</th>`;
        h1 += `<th colspan="2" style="font-size: 11px;">누계</th>
           <th rowspan="2" style="width: 40px !important; min-width: 40px !important; max-width: 40px !important; font-size: 11px; letter-spacing: -0.5px; padding: 2px !important;">출석률</th></tr>`;
        h2 += `<th style="width: 35px; font-size: 11px;">분</th><th style="width: 45px; font-size: 11px;">시간</th></tr>`;
        thead.innerHTML = h1 + h2;

        let masterTotal = 0;
        dates.forEach(d => { masterTotal += (masterSchedule[d].am + masterSchedule[d].pm); });

        let masterRowHtml = `<tr style="background:#f1f8e9; font-weight:bold; color:#2e7d32;">
        <td class="sticky-no">-</td>
        <td class="sticky-col" style="padding: 0 !important; width: 46px !important; min-width: 46px !important; max-width: 46px !important; overflow: hidden;">
            <div style="width: 100%; max-width: 46px; overflow: hidden; margin: 0 auto;">
                <span style="font-size: 9px; letter-spacing: -1.5px; white-space: nowrap;">[편성시간]</span>
            </div>
        </td>`;
        dates.forEach(d => {
            masterRowHtml += `<td>${masterSchedule[d].am}</td><td>${masterSchedule[d].pm}</td>`;
        });
        masterRowHtml += `<td style="background:#e8f5e9;">-</td>
        <td style="white-space: nowrap;">${masterTotal}</td>
        <td style="white-space: nowrap;">${(masterTotal / 60).toFixed(1)}h</td>
        <td style="color:#2e7d32; font-size: 11px;">100%</td>
    </tr>`;

        const studentNames = ctx.studentNames || [];
        const fullAttendanceData = ctx.fullAttendanceData || {};

        const studentHtml = studentNames.map((name, idx) => {
            let rowTotalMin = 0;
            let dateCells = '';

            dates.forEach(d => {
                const res = results[name].dates[d];
                const attInfo = (fullAttendanceData[d] && fullAttendanceData[d][name]) ? fullAttendanceData[d][name] : {};
                let amV = res.am;
                let pmV = res.pm;
                let cellClass = '';
                const isDropout = isDateOnOrAfterStudentLeave(name, d);

                if (isDropout) {
                    amV = 0;
                    pmV = 0;
                    cellClass = 'status-dropout';
                } else if (mode === 'sim' && res.isFuture) {
                    amV = masterSchedule[d].am;
                    pmV = masterSchedule[d].pm;
                    cellClass = 'status-special';
                } else {
                    const st = attInfo.status || '';
                    const inT = attInfo.inTime || '00:00:00';
                    if (st.includes('지각') || st.includes('조퇴') || (parseInt(inT.replace(/:/g, ''), 10) > 90000 && parseInt(inT.replace(/:/g, ''), 10) < 130000)) {
                        cellClass = 'status-late';
                    } else if (st.includes('외출')) {
                        cellClass = 'status-out';
                    } else if (st.includes('결석') || st === '미편입') {
                        cellClass = 'status-absent';
                    } else if (st.includes('휴가') || st.includes('공가') || st.includes('기타')) {
                        cellClass = 'status-special';
                    }
                }

                rowTotalMin += (amV + pmV);
                let dispAm = isDropout ? '-' : amV;
                let dispPm = isDropout ? '-' : pmV;

                if (!isDropout && res.isFuture) {
                    const simStyle = "width:100%; height:100%; box-sizing:border-box; border:none; background:transparent; color:#8e44ad; font-weight:bold; text-align:center; font-size:11px; padding:0; margin:0; outline:none;";
                    dispAm = `<input type="number" class="sim-input" value="${amV}" oninput="calculateRowPercent('${name}', ${masterTotal}, this)" style="${simStyle}" title="시뮬레이션 입력 (저장되지 않음)">`;
                    dispPm = `<input type="number" class="sim-input" value="${pmV}" oninput="calculateRowPercent('${name}', ${masterTotal}, this)" style="${simStyle}" title="시뮬레이션 입력 (저장되지 않음)">`;
                }

                dateCells += `<td class="attendance-time-cell ${cellClass}">${dispAm}</td><td class="attendance-time-cell ${cellClass}">${dispPm}</td>`;
            });

            const makeupMin = results[name].makeupMin;
            const finalTotalMin = rowTotalMin + makeupMin;
            const percent = masterTotal > 0 ? ((finalTotalMin / masterTotal) * 100).toFixed(1) : '0.0';
            const subjectLastDate = dates[dates.length - 1];
            const isSubjectDropout = isStudentLeaveOnOrBefore(name, subjectLastDate);
            const dropClass = isSubjectDropout ? 'status-dropout' : '';
            const statusStyle = isSubjectDropout ? '' : (percent < 75 ? 'color:red;' : 'color:green;');
            const makeupBg = isSubjectDropout ? '' : 'background:#fff3e0;';
            const totalHourStyle = isSubjectDropout ? '' : 'color:#27ae60;';
            const inputStyle = `width:100%; box-sizing:border-box; padding:2px; text-align:center; font-size:11px; ${isSubjectDropout ? 'background:transparent; color:inherit; border:none; pointer-events:none;' : 'border:1px solid #ccc; border-radius:3px;'}`;

            const makeupDisplay = `<input type="number"
        class="edit-input makeup-input makeup-${name}"
        data-name="${name}"
        data-sub="${selectedSub}"
        data-type="makeup"
        value="${makeupMin}"
        oninput="this.classList.add('manual-modified'); calculateRowPercent('${name}', ${masterTotal}, this)"
        style="${inputStyle}" ${isSubjectDropout ? 'readonly tabindex="-1"' : ''}>`;

            return `<tr>
            <td class="sticky-no">${idx + 1}</td>
            <td class="sticky-col ${dropClass}" style="width: 46px !important; min-width: 46px !important; max-width: 46px !important; padding: 2px !important; overflow: hidden;">
                <div style="width: 100%; max-width: 46px; overflow: hidden; margin: 0 auto; white-space: nowrap; font-size: 11px; text-overflow: ellipsis;">${name}</div>
            </td>
            ${dateCells}
            <td class="${dropClass}" style="${makeupBg} padding:2px !important; width: 35px !important; min-width: 35px !important; max-width: 35px !important;">${makeupDisplay}</td>
            <td id="totalMin_${name}" class="${dropClass}" style="font-weight:bold; white-space:nowrap;">${finalTotalMin}</td>
            <td id="totalHour_${name}" class="${dropClass}" style="${totalHourStyle} font-weight:bold; white-space:nowrap;">${(finalTotalMin / 60).toFixed(1)}h</td>
            <td id="percent_${name}" class="${dropClass}" style="font-weight:bold; font-size:11px; ${statusStyle} padding: 2px !important; width: 40px !important; min-width: 40px !important; max-width: 40px !important;">${percent}%</td>
        </tr>`;
        }).join('');

        tbody.innerHTML = masterRowHtml + studentHtml;
        lastDetailMode = mode;
    }

    async function loadDetailInto(selectedSub, headId, bodyId, mode = 'real') {
        const cleanSelected = String(selectedSub).replace(/\s+/g, '');
        const dates = [...new Set((ctx.rawTimetable || []).filter(r => {
            const rowVal = currentMode === 'subject' ? (r.교과목 || '') : (r.능력단위 || '');
            return String(rowVal).replace(/\s+/g, '') === cleanSelected;
        }).map(r => getFixDate(r.날짜)))].sort();

        const manualSnap = await classDbRef('manualAttendance').once('value');
        const manualData = manualSnap.val() || {};
        const studentResults = {};
        const masterSchedule = {};
        const dateWithDay = {};
        const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
        const studentNames = ctx.studentNames || [];
        const fullAttendanceData = ctx.fullAttendanceData || {};

        studentNames.forEach(name => { studentResults[name] = { dates: {}, totalMin: 0, makeupMin: 0 }; });

        dates.forEach(date => {
            const shortDateStr = date.substring(2).replace(/-/g, '.');
            dateWithDay[date] = `<span style="display:inline-block; white-space:nowrap; font-size:10.5px; letter-spacing:-0.5px; line-height:1.2;">${shortDateStr}</span><br><span style="display:inline-block; white-space:nowrap; font-size:10px; line-height:1.2;">(${weekDays[new Date(date).getDay()]})</span>`;
            masterSchedule[date] = calculateParticipation(date, '09:00', '17:30', selectedSub, '', '');

            studentNames.forEach(name => {
                const att = (fullAttendanceData[date] && fullAttendanceData[date][name]) ? fullAttendanceData[date][name] : null;
                let calc = { am: 0, pm: 0, isFuture: !fullAttendanceData[date] };

                if (att && att.inTime && att.outTime) {
                    calc = calculateParticipation(date, att.inTime, att.outTime, selectedSub, att.leaveTime || '', att.returnTime || '');
                    calc.isFuture = false;
                }
                if (manualData[name] && manualData[name][date]) {
                    if (manualData[name][date].am !== undefined) { calc.am = manualData[name][date].am; calc.am_manual = true; }
                    if (manualData[name][date].pm !== undefined) { calc.pm = manualData[name][date].pm; calc.pm_manual = true; }
                    calc.isFuture = false;
                }
                const escapedSubForLoad = selectedSub.replace(/[\.\#\$\/\[\]]/g, '_');
                if (manualData[name] && manualData[name][`makeup_${escapedSubForLoad}`]) {
                    studentResults[name].makeupMin = parseInt(manualData[name][`makeup_${escapedSubForLoad}`], 10) || 0;
                }
                studentResults[name].dates[date] = calc;
            });
        });

        renderFinalTable(dates, studentResults, masterSchedule, dateWithDay, headId, bodyId, selectedSub, mode);
    }

    async function saveManualAttendance() {
        const allInputs = document.querySelectorAll('.edit-input'), manualUpdate = {};
        let hasChange = false;
        const escapeFirebaseKey = (key) => String(key || 'unknown').replace(/[\.\#\$\/\[\]]/g, '_');

        allInputs.forEach(input => {
            if (!input.classList.contains('manual-modified')) return;
            const name = input.getAttribute('data-name');
            const sub = input.getAttribute('data-sub');
            const escapedSub = escapeFirebaseKey(sub);
            if (!manualUpdate[name]) manualUpdate[name] = {};

            if (input.classList.contains('makeup-input')) {
                manualUpdate[name][`makeup_${escapedSub}`] = parseInt(input.value, 10) || 0;
                hasChange = true;
            } else {
                const date = input.getAttribute('data-date');
                const type = input.getAttribute('data-type');
                if (date && type) {
                    if (!manualUpdate[name][date]) manualUpdate[name][date] = {};
                    manualUpdate[name][date][type] = parseInt(input.value, 10);
                    manualUpdate[name][date][type + '_manual'] = true;
                    hasChange = true;
                }
            }
        });

        if (!hasChange) return appAlert('수정된 데이터가 없습니다.');
        if (!(await appConfirm('변경사항을 서버에 저장하시겠습니까?'))) return;

        try {
            for (const stdName in manualUpdate) {
                await classDbRef(`manualAttendance/${stdName}`).update(manualUpdate[stdName]);
            }
            await appAlert('✅ 모든 데이터가 안전하게 저장되었습니다.');
            if (typeof ctx.onAfterSave === 'function') await ctx.onAfterSave();
            if (lastOpenSub) await loadDetailInto(lastOpenSub, 'modalHead', 'modalBody', lastDetailMode);
        } catch (e) {
            await appAlert('❌ 저장 실패: ' + e.message);
        }
    }

    function closeModal() {
        const modal = document.getElementById('calendarModal');
        if (modal) modal.style.display = 'none';
    }

    async function open(context, subName, mode, selectedDate) {
        ctx = context || {};
        currentMode = mode || 'ncs';
        lastOpenSub = subName;
        lastOpenDate = selectedDate;
        window.lastSelectedDate = selectedDate;

        const modal = document.getElementById('calendarModal');
        const modalTitle = document.getElementById('modalTitle');
        const actionArea = document.getElementById('modalActionArea');
        if (!modal || !modalTitle || !actionArea) {
            await appAlert('출석부 창을 찾을 수 없습니다.');
            return;
        }

        modal.style.display = 'flex';
        modalTitle.innerText = `📋 [전체 이력] ${subName}`;
        document.getElementById('modalHead').innerHTML = "<tr><td colspan='5'>과목 전체 데이터를 집계 중입니다...</td></tr>";
        document.getElementById('modalBody').innerHTML = '';

        actionArea.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-right:auto;">
            <div style="display: flex; gap: 15px; font-size: 11px; font-weight: bold; align-items: center; flex-wrap: wrap;">
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#fff176; border:1px solid #f1c40f; display:inline-block; margin-right:4px;"></i>지각/조퇴</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e8f5e9; border:1px solid #27ae60; display:inline-block; margin-right:4px;"></i>외출</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#ffebee; border:1px solid #e74c3c; display:inline-block; margin-right:4px;"></i>결석/미편입</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e3f2fd; border:1px solid #3498db; display:inline-block; margin-right:4px;"></i>공가/휴가/기타</span>
                <span style="display: flex; align-items: center;"><i style="width:12px; height:12px; background:#e0e0e0; border:1px solid #bdc3c7; display:inline-block; margin-right:4px; margin-left:4px;"></i>중도탈락</span>
            </div>
            <div style="font-size: 11px; font-weight: bold; color:#e67e22;">
                ● 강조된 열: 클릭한 날짜(${selectedDate})
            </div>
        </div>
        <button class="btn-excel" onclick="saveManualAttendance()" style="background-color: #e67e22 !important;">💾 수정사항 저장</button>
    `;

        await loadDetailInto(subName, 'modalHead', 'modalBody', 'real');
    }

    function bindModalEvents() {
        const calendarModal = document.getElementById('calendarModal');
        const calendarModalContent = document.getElementById('calendarModalContent');
        if (!calendarModal || calendarModal.dataset.unitAttBound === '1') return;
        calendarModal.dataset.unitAttBound = '1';

        calendarModal.addEventListener('click', (e) => {
            if (e.target.id === 'calendarModal') closeModal();
        });
        const closeBtn = document.getElementById('btn_modal_close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (calendarModalContent) calendarModalContent.addEventListener('click', (e) => e.stopPropagation());

        window.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (calendarModal.style.display === 'flex' || calendarModal.style.display === 'block') {
                closeModal();
            }
        });
    }

    window.UnitAttendanceModal = { open, close: closeModal, loadDetailInto, saveManualAttendance, calculateRowPercent };
    window.loadDetailInto = loadDetailInto;
    window.saveManualAttendance = saveManualAttendance;
    window.calculateRowPercent = calculateRowPercent;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindModalEvents);
    } else {
        bindModalEvents();
    }
})();
