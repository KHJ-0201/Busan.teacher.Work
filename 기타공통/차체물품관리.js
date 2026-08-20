// --- [마스터 데이터: 2022년 원본 기준] ---
const equipmentMaster = [
    { id: 1, name: '측정장비', unit: '대', baseQty: 6 },
    { id: 2, name: '차체교정기', unit: '대', baseQty: 1 },
    { id: 3, name: '화이트 바디(보디라이너,카로나이너)', unit: '대', baseQty: 2 },
    { id: 4, name: '연삭기', unit: '대', baseQty: 3 },
    { id: 5, name: '유압 램', unit: 'SE', baseQty: 1 },
    { id: 6, name: 'STUD(인출기)', unit: '대', baseQty: 3 },
    { id: 7, name: '가열 장비(토치)', unit: 'SE', baseQty: 1 },
    { id: 8, name: '인장용 도구', unit: '세트', baseQty: 3 },
    { id: 9, name: '바이스', unit: '대', baseQty: 4 },
    { id: 10, name: 'MIG AL용접기', unit: '대', baseQty: 5 },
    { id: 11, name: '절단기(산소, 플라즈마))', unit: '대', baseQty: 4 },
    { id: 12, name: 'MIG 씨오투 용접기', unit: '대', baseQty: 14 },
    { id: 13, name: '차체 접착 특수공구(스포트)', unit: '대', baseQty: 4 },
    { id: 14, name: '방청건', unit: '대', baseQty: 2 },
    { id: 15, name: '차체 리벳 장비', unit: '대', baseQty: 4 },
    { id: 16, name: '신소재 관련작업 특수공구', unit: '대', baseQty: 1 },
    { id: 17, name: '스라이딩 해머', unit: '대', baseQty: 1 },
    { id: 18, name: '탁상 바이스', unit: 'SE', baseQty: 15 },
    { id: 19, name: '아크용접기(전기용접)', unit: 'SE', baseQty: 7 },
    { id: 20, name: '판금용공구', unit: '대', baseQty: 7 },
    { id: 21, name: '에어 톱', unit: '세트', baseQty: 15 },
    { id: 22, name: '에어 그라인더', unit: '개', baseQty: 20 },
    { id: 23, name: '스폿 드릴', unit: '대', baseQty: 15 },
    { id: 24, name: '용접바이스', unit: '대', baseQty: 34 },
    { id: 25, name: '철판바이스', unit: '대', baseQty: 24 },
    { id: 26, name: '에어 앵글 그라인더', unit: '대', baseQty: 25 },
    { id: 27, name: '벨트센더', unit: '대', baseQty: 2 }
];

const consumableMaster = [
    { id: 1, name: '전기용접봉', unit: 'EA', baseQty: 5, initialStock: 8 },
    { id: 2, name: '용접와이어', unit: 'EA', baseQty: 5, initialStock: 11 },
    { id: 3, name: '용접장갑', unit: '짝', baseQty: 15, initialStock: 15 },
    { id: 4, name: '용접귀마개', unit: 'EA', baseQty: 15, initialStock: 15 },
    { id: 5, name: '가죽앞치마', unit: '벌', baseQty: 20, initialStock: 15 },
    { id: 6, name: '용접면', unit: 'EA', baseQty: 15, initialStock: 15 },
    { id: 7, name: '용접토치 노즐', unit: 'EA', baseQty: 20, initialStock: 10 },
    { id: 8, name: '용접토치 팁홀더', unit: 'EA', baseQty: 20, initialStock: 4 },
    { id: 9, name: '용접토치 팁', unit: 'EA', baseQty: 20, initialStock: 25 },
    { id: 10, name: '용접토치', unit: 'EA', baseQty: 3, initialStock: 2 },
    { id: 11, name: '탄산가스', unit: '통', baseQty: 6, initialStock: 18 },
    { id: 12, name: '아르곤가스', unit: '통', baseQty: 2, initialStock: 2 },
    { id: 13, name: '산소', unit: '통', baseQty: 3, initialStock: 2 },
    { id: 14, name: '프로판', unit: '통', baseQty: 3, initialStock: 2 },
    { id: 15, name: '혼합가스', unit: '통', baseQty: 2, initialStock: 1 },
    { id: 16, name: '1T연강판', unit: 'EA', baseQty: 300, initialStock: 831 },
    { id: 17, name: '센터필러', unit: 'EA', baseQty: 150, initialStock: 998 },
    { id: 18, name: '3T 강판', unit: 'EA', baseQty: 100, initialStock: 1890 },
    { id: 19, name: '에어톱 날', unit: 'EA', baseQty: 100, initialStock: 90 },
    { id: 20, name: '스폿드릴 날', unit: 'EA', baseQty: 20, initialStock: 150 },
    { id: 21, name: '와이어브러시 날', unit: 'EA', baseQty: 15, initialStock: 12 },
    { id: 22, name: '벨트센더 벨트', unit: 'EA', baseQty: 500, initialStock: 440 },
    { id: 23, name: '토치라이터', unit: 'EA', baseQty: 80, initialStock: 1 },
    { id: 24, name: '보호 면', unit: 'EA', baseQty: 15, initialStock: 15 },
    { id: 25, name: '플라이어', unit: 'EA', baseQty: 30, initialStock: 4 },
    { id: 26, name: '전기용접 홀더', unit: 'EA', baseQty: 2, initialStock: 2 },
    { id: 27, name: 'Co2게이지', unit: 'EA', baseQty: 10, initialStock: 2 },
    { id: 28, name: '돌그라인더', unit: 'EA', baseQty: 30, initialStock: 8 },
    { id: 29, name: '해바라기 패빠', unit: 'EA', baseQty: 30, initialStock: 145 },
    { id: 30, name: '36방페이퍼', unit: 'EA', baseQty: 100, initialStock: 0 },
    { id: 31, name: '80방페이퍼', unit: 'EA', baseQty: 100, initialStock: 0 }
];

let transactionLogs = (typeof BASELINE_2022_LOGS !== 'undefined' ? BASELINE_2022_LOGS.slice() : []);

let nextLogId = 10000;
let hasInferredMonths = false;
let consumptionProfileCache = null;
/** 품목별 구입·소모 주기 (소모품, Firebase·localStorage 동기화) */
let itemCycleSettings = {};
/** 그래프에서 수동 조절한 월말 재고 (추정 구간만, 실측은 불변) */
let itemStockOverrides = {};
/** 가상 미리보기용 임시 실측 로그 (실제 transactionLogs에는 반영 안 됨) */
let previewSurveyOverlay = null;
/** 로드 시 2022년 1~8월 엑셀 실측이 복원된 건수 (안내용) */
let baselineRestoreCount = 0;

/** 2022년 1~8월 = 엑셀 실측 고정 구간 (변경·삭제 불가) */
function isBaselineLockedYearMonth(year, month) {
    return year === 2022 && month >= 1 && month <= 8;
}

function getYearMonthFromDateStr(dateStr) {
    const d = new Date(dateStr);
    if (!dateStr || isNaN(d.getTime())) return { year: 0, month: 0 };
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function isSameYearMonth(dateStrA, dateStrB) {
    if (!dateStrA || !dateStrB) return false;
    return dateStrA.substring(0, 7) === dateStrB.substring(0, 7);
}

function removeItemSurveyLogsForMonth(type, name, surveyDate) {
    const ymInfo = getYearMonthFromDateStr(surveyDate);
    if (isBaselineLockedYearMonth(ymInfo.year, ymInfo.month)) return;

    const ym = surveyDate.substring(0, 7);
    transactionLogs = transactionLogs.filter(function (l) {
        if (l.type !== type || l.name !== name || l.status !== '실측') return true;
        return (l.date || '').substring(0, 7) !== ym;
    });
}

function clearLockedBaselineOverrides() {
    let cleared = 0;
    Object.keys(itemStockOverrides).forEach(function (key) {
        const bucket = itemStockOverrides[key];
        if (!bucket) return;
        Object.keys(bucket).forEach(function (mk) {
            const parts = mk.split('-');
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (isBaselineLockedYearMonth(y, m)) {
                delete bucket[mk];
                cleared++;
            }
        });
        if (!Object.keys(bucket).length) delete itemStockOverrides[key];
    });
    return cleared;
}

/** 2022년 1~8월 엑셀 실측을 BASELINE 값으로 항상 고정 */
function enforceBaseline2022Anchors() {
    if (typeof BASELINE_2022_LOGS === 'undefined') return 0;
    let changes = clearLockedBaselineOverrides();

    BASELINE_2022_LOGS.forEach(function (baseLog) {
        if (baseLog.status !== '실측') return;
        const ymInfo = getYearMonthFromDateStr(baseLog.date);
        if (!isBaselineLockedYearMonth(ymInfo.year, ymInfo.month)) return;

        const ymStr = baseLog.date.substring(0, 7);
        const beforeLen = transactionLogs.length;

        transactionLogs = transactionLogs.filter(function (l) {
            if (l.type !== baseLog.type || l.name !== baseLog.name || l.status !== '실측') return true;
            return (l.date || '').substring(0, 7) !== ymStr;
        });
        if (transactionLogs.length !== beforeLen) changes++;

        const hasExact = transactionLogs.some(function (l) {
            return l.type === baseLog.type && l.name === baseLog.name && l.status === '실측' &&
                l.date === baseLog.date && l.qty === baseLog.qty && l.memo === baseLog.memo;
        });
        if (!hasExact) {
            transactionLogs.push(Object.assign({}, baseLog, {
                id: baseLog.id != null ? baseLog.id : nextLogId++
            }));
            changes++;
        }
    });

    return changes;
}

function getWorkingLogs() {
    if (!previewSurveyOverlay || !previewSurveyOverlay.length) return transactionLogs;
    const merged = transactionLogs.filter(function (l) {
        if (l.status !== '실측') return true;
        return !previewSurveyOverlay.some(function (d) {
            return d.type === l.type && d.name === l.name && isSameYearMonth(d.date, l.date);
        });
    });
    return merged.concat(previewSurveyOverlay);
}

function collectSurveyDrafts() {
    const date = document.getElementById('surveyDate').value;
    if (!date) return null;
    const drafts = [];
    document.querySelectorAll('.survey-qty').forEach(function (input) {
        const qty = parseSurveyQtyInput(input);
        if (qty == null) return;
        drafts.push({
            id: 'preview-' + input.dataset.type + '-' + input.dataset.name,
            date: date,
            name: input.dataset.name,
            type: input.dataset.type,
            qty: qty,
            status: '실측',
            memo: '가상 미리보기 (미저장)'
        });
    });
    return drafts.length ? drafts : null;
}

function isSurveyQtyKept(raw) {
    return raw === '' || raw === '기존';
}

function parseSurveyQtyInput(input) {
    const raw = (input.value || '').trim();
    if (isSurveyQtyKept(raw)) return null;
    const qty = roundStock(parseFloat(raw));
    if (isNaN(qty) || qty < 0) return null;
    return qty;
}

function normalizeSurveyInputOnBlur(input) {
    const qty = parseSurveyQtyInput(input);
    if (qty == null) {
        input.value = '기존';
        input.classList.add('is-keep');
        return;
    }
    input.value = String(qty);
    input.classList.remove('is-keep');
}

function getSurveyCarryStock(item, type, surveyDateStr) {
    if (!surveyDateStr) return getStartStock(item, type);
    const d = new Date(surveyDateStr);
    if (isNaN(d.getTime())) return getStartStock(item, type);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const sortedLogs = transactionLogs.slice().sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
    });
    const timeline = computeTimeline(item, type, sortedLogs, Math.max(year, 2022));
    const cell = getTimelineMonth(timeline, year, month);
    if (cell && cell.stock !== null && cell.stock !== undefined) {
        return cell.stock;
    }
    const prev = getPrevYearMonth(year, month);
    const prevCell = getTimelineMonth(timeline, prev.year, prev.month);
    if (prevCell && prevCell.stock !== null && prevCell.stock !== undefined) {
        return prevCell.stock;
    }
    return getStartStock(item, type);
}

function collectSurveyInputDrafts() {
    const drafts = {};
    document.querySelectorAll('.survey-qty').forEach(function (input) {
        const raw = (input.value || '').trim();
        if (isSurveyQtyKept(raw)) return;
        const key = input.dataset.type + '::' + input.dataset.name;
        drafts[key] = raw;
    });
    return drafts;
}

function buildSurveyQtyInput(item, type, surveyDate, drafts) {
    const key = type + '::' + item.name;
    const carry = getSurveyCarryStock(item, type, surveyDate);
    const carryHint = formatStockDisplay(carry);
    let value = '기존';
    let keepClass = ' is-keep';
    if (drafts[key] != null) {
        value = drafts[key];
        keepClass = '';
    }
    return (
        '<input type="text" class="survey-qty' + keepClass + '" inputmode="numeric" ' +
            'data-type="' + type + '" data-name="' + item.name + '" data-carry="' + carry + '" ' +
            'title="기존 유지 시 ' + carryHint + ' (전월 이월·추정 포함)" ' +
            'value="' + value + '">'
    );
}

function initSurveyInputHandlers() {
    if (document.body.dataset.surveyInputBound) return;
    document.body.dataset.surveyInputBound = '1';
    document.addEventListener('focusin', function (e) {
        const input = e.target;
        if (!input.classList || !input.classList.contains('survey-qty')) return;
        if (input.value === '기존') {
            input.value = '';
            input.classList.remove('is-keep');
        }
    });
    document.addEventListener('focusout', function (e) {
        const input = e.target;
        if (!input.classList || !input.classList.contains('survey-qty')) return;
        normalizeSurveyInputOnBlur(input);
    });
}

function setPreviewBanner(active, count) {
    const banner = document.getElementById('previewBanner');
    if (!banner) return;
    if (!active) {
        banner.style.display = 'none';
        return;
    }
    banner.style.display = 'block';
    banner.innerHTML =
        '<strong>🔍 가상 미리보기 중</strong> — ' + count + '개 품목이 임시 반영되었습니다. ' +
        '오른쪽 표만 바뀌며 실제 데이터는 저장되지 않습니다. ' +
        '<button type="button" class="btn-preview-action" id="btnCommitPreview">이대로 실제 등록</button> ' +
        '<button type="button" class="btn-preview-action btn-preview-cancel" id="btnCancelPreview">미리보기 취소</button>';
    document.getElementById('btnCommitPreview').addEventListener('click', applyBulkSurvey);
    document.getElementById('btnCancelPreview').addEventListener('click', cancelPreviewSurvey);
}

function previewBulkSurvey() {
    const date = document.getElementById('surveyDate') && document.getElementById('surveyDate').value;
    if (date) {
        const surveyYm = getYearMonthFromDateStr(date);
        if (isBaselineLockedYearMonth(surveyYm.year, surveyYm.month)) {
            alert('2022년 1~8월은 엑셀 실측 고정 구간입니다.\n이 기간은 미리보기·등록할 수 없습니다.');
            return;
        }
    }
    const drafts = collectSurveyDrafts();
    if (!drafts) {
        alert('실측할 품목을 하나 이상 숫자로 입력해 주세요.\n「기존」으로 두면 미리보기·등록 대상에서 제외됩니다.');
        return;
    }
    previewSurveyOverlay = drafts;
    const inputYear = new Date(drafts[0].date).getFullYear();
    if (inputYear >= 2022 && inputYear <= 2026) {
        document.getElementById('globalYear').value = String(inputYear);
    }
    setPreviewBanner(true, drafts.length);
    calculateAndRender();
}

function cancelPreviewSurvey() {
    previewSurveyOverlay = null;
    setPreviewBanner(false);
    calculateAndRender();
}

function roundStock(n) {
    if (n === null || n === undefined || isNaN(n)) return 0;
    return Math.round(Number(n));
}

/** 오늘 달력 기준 — 해당 연·월이 아직 오지 않았으면 true (자동 기입 금지) */
function isFutureMonth(year, month) {
    const now = new Date();
    const ty = now.getFullYear();
    const tm = now.getMonth() + 1;
    if (year > ty) return true;
    if (year === ty && month > tm) return true;
    return false;
}

function formatStockDisplay(stock) {
    if (stock === null || stock === undefined || stock === '') return '-';
    return String(roundStock(stock));
}

/** 품목·연·월 기준 고정 난수 (새로고침해도 같은 추정값) */
function seededRandom(name, year, month, salt) {
    const s = name + '|' + year + '|' + month + '|' + (salt || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (Math.abs(h) % 10000) / 10000;
}

function defaultCycleFromProfile(profile) {
    if (profile.purchaseFreq > 0) {
        return Math.max(1, Math.min(24, Math.round(1 / profile.purchaseFreq)));
    }
    return 3;
}

function getItemCycleSettings(name) {
    const custom = itemCycleSettings[name] || {};
    const profile = getConsumptionProfile(name, 'consumable');
    const item = consumableMaster.find(function (i) { return i.name === name; });
    const baseQty = item ? item.baseQty : 1;
    return {
        purchaseCycleMonths: custom.purchaseCycleMonths != null && custom.purchaseCycleMonths !== ''
            ? Number(custom.purchaseCycleMonths)
            : defaultCycleFromProfile(profile),
        monthlyUse: custom.monthlyUse != null && custom.monthlyUse !== ''
            ? Number(custom.monthlyUse)
            : Math.max(1, profile.avgUse || baseQty * 0.02),
        purchaseQty: custom.purchaseQty != null && custom.purchaseQty !== ''
            ? Number(custom.purchaseQty)
            : Math.max(1, profile.avgPurchase || baseQty),
        cycleVariance: custom.cycleVariance != null && custom.cycleVariance !== ''
            ? Number(custom.cycleVariance)
            : 0.35
    };
}

function getNextCycleLength(itemName, baseCycle, cycleIndex, year, month, variance) {
    const r = seededRandom(itemName, year, month, 'cl' + cycleIndex);
    const jitter = 1 - variance * 0.5 + r * variance;
    return Math.max(1, Math.round(baseCycle * jitter));
}

/** 소모품 공백월: 구입주기 기반 소모→구입→소모 곡선 (난수는 품목·연·월 고정) */
function generateCycleGapDeltas(item, timeline, fillIndices, totalDelta) {
    const settings = getItemCycleSettings(item.name);
    const profile = getConsumptionProfile(item.name, 'consumable');
    const monthlyUse = Math.max(1, settings.monthlyUse);
    const purchaseQty = Math.max(1, settings.purchaseQty);
    const baseCycle = Math.max(1, Math.min(36, settings.purchaseCycleMonths));
    const variance = Math.max(0, Math.min(1, settings.cycleVariance));

    const deltas = [];
    let monthsSincePurchase = 0;
    let cycleIndex = 0;
    let nextCycleAt = getNextCycleLength(
        item.name, baseCycle, cycleIndex,
        timeline[fillIndices[0]].y, timeline[fillIndices[0]].m, variance
    );

    fillIndices.forEach(function (j) {
        const t = timeline[j];
        const seasonal = profile.seasonal[(t.m - 1) % 12] || 1;
        const rUse = seededRandom(item.name, t.y, t.m, 'use');
        const rPur = seededRandom(item.name, t.y, t.m, 'pur');
        const rTrig = seededRandom(item.name, t.y, t.m, 'trg');

        let delta = -monthlyUse * seasonal * (0.55 + rUse * 0.95);
        monthsSincePurchase++;

        const cycleDue = monthsSincePurchase >= nextCycleAt;
        const emergencyBuy = rTrig > 0.88;

        if (cycleDue || emergencyBuy) {
            delta += purchaseQty * (0.4 + rPur * 1.05);
            monthsSincePurchase = 0;
            cycleIndex++;
            nextCycleAt = getNextCycleLength(item.name, baseCycle, cycleIndex, t.y, t.m, variance);
        }

        deltas.push(roundStock(delta));
    });

    if (!deltas.length) return deltas;

    const sum = deltas.reduce(function (a, b) { return a + b; }, 0);

    if (Math.abs(totalDelta) < 0.001) {
        const fix = sum / deltas.length;
        return deltas.map(function (d) { return roundStock(d - fix); });
    }

    if (Math.abs(sum) < 0.001) {
        return deltas.map(function (_, i) {
            const t = timeline[fillIndices[i]];
            const r = seededRandom(item.name, t.y, t.m, 'flat');
            return roundStock(totalDelta * (0.7 + r * 0.6) / deltas.length);
        });
    }

    const scale = totalDelta / sum;
    return deltas.map(function (d) { return roundStock(d * scale); });
}

/** 실측 앵커 없는 이후 구간: 동일 주기 엔진으로 월말 재고 추정 */
function applyCycleTrailingMonth(item, t, running) {
    const settings = getItemCycleSettings(item.name);
    const profile = getConsumptionProfile(item.name, 'consumable');
    const monthlyUse = Math.max(1, settings.monthlyUse);
    const purchaseQty = Math.max(1, settings.purchaseQty);
    const baseCycle = Math.max(1, settings.purchaseCycleMonths);
    const variance = Math.max(0, Math.min(1, settings.cycleVariance));
    const seasonal = profile.seasonal[(t.m - 1) % 12] || 1;

    const cycleSlot = Math.floor((t.y - 2022) * 12 + (t.m - 1));
    const rUse = seededRandom(item.name, t.y, t.m, 'tuse');
    const rPur = seededRandom(item.name, t.y, t.m, 'tpur');
    const rTrig = seededRandom(item.name, t.y, t.m, 'ttrg');

    let delta = -monthlyUse * seasonal * (0.55 + rUse * 0.95);
    const phase = cycleSlot % getNextCycleLength(item.name, baseCycle, Math.floor(cycleSlot / baseCycle), t.y, t.m, variance);
    if (phase === 0 || rTrig > 0.9) {
        delta += purchaseQty * (0.4 + rPur * 1.05);
    }
    return Math.max(0, roundStock(running + delta));
}

function buildConsumptionProfiles() {
    const profiles = {};
    const baseline = typeof BASELINE_2022_LOGS !== 'undefined' ? BASELINE_2022_LOGS : [];

    function ensure(name) {
        if (!profiles[name]) {
            profiles[name] = {
                avgUse: 1,
                avgPurchase: 0,
                seasonal: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                volatility: 0.3
            };
        }
        return profiles[name];
    }

    consumableMaster.forEach(function (item) {
        const name = item.name;
        const p = ensure(name);
        const stocks = [];
        let prev = item.initialStock;

        for (let m = 1; m <= 8; m++) {
            const hit = baseline.filter(function (l) {
                const d = new Date(l.date);
                return l.type === 'consumable' && l.name === name && l.status === '실측' &&
                    d.getFullYear() === 2022 && d.getMonth() + 1 === m;
            });
            if (hit.length) {
                stocks.push({ m: m, stock: hit[hit.length - 1].qty, prev: prev });
                prev = hit[hit.length - 1].qty;
            }
        }

        const uses = [];
        const seasonalSum = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        const seasonalCnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        stocks.forEach(function (row) {
            const delta = row.stock - row.prev;
            if (delta < 0) {
                const use = -delta;
                uses.push(use);
                seasonalSum[row.m - 1] += use;
                seasonalCnt[row.m - 1]++;
            }
            row.prev = row.stock;
        });

        const purchases = baseline.filter(function (l) {
            const d = new Date(l.date);
            return l.type === 'consumable' && l.name === name && l.status === '구입' && d.getFullYear() === 2022;
        });

        if (uses.length) {
            p.avgUse = uses.reduce(function (a, b) { return a + b; }, 0) / uses.length;
            const mean = p.avgUse;
            let varSum = 0;
            uses.forEach(function (u) { varSum += Math.pow(u - mean, 2); });
            p.volatility = Math.sqrt(varSum / uses.length) || mean * 0.25;
        } else {
            p.avgUse = Math.max(1, item.baseQty * 0.02);
            p.volatility = p.avgUse * 0.35;
        }

        if (p.avgUse < 1) p.avgUse = 1;

        for (let mi = 0; mi < 12; mi++) {
            if (seasonalCnt[mi] > 0) {
                p.seasonal[mi] = (seasonalSum[mi] / seasonalCnt[mi]) / p.avgUse;
            }
        }

        if (purchases.length) {
            p.avgPurchase = purchases.reduce(function (a, l) { return a + l.qty; }, 0) / purchases.length;
            p.purchaseFreq = purchases.length / 8;
        }
    });

    equipmentMaster.forEach(function (item) {
        profiles[item.name] = {
            avgUse: 0,
            avgPurchase: 0,
            seasonal: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            volatility: 0,
            purchaseFreq: 0,
            stable: true
        };
    });

    consumptionProfileCache = profiles;
}

function getConsumptionProfile(name, type) {
    if (!consumptionProfileCache) buildConsumptionProfiles();
    if (type === 'equipment') {
        return consumptionProfileCache[name] || {
            avgUse: 0, avgPurchase: 0,
            seasonal: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            volatility: 0, purchaseFreq: 0, stable: true
        };
    }
    return consumptionProfileCache[name] || {
        avgUse: 1, avgPurchase: 0,
        seasonal: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        volatility: 0.3, purchaseFreq: 0, stable: false
    };
}

/** 장비: 변동 없음 / 소모품: 품목별 구입주기 기반 소모·구입 곡선 */
function generateGapDeltas(item, type, timeline, fillIndices, totalDelta) {
    if (type === 'equipment') {
        return fillIndices.map(function () { return 0; });
    }
    return generateCycleGapDeltas(item, timeline, fillIndices, totalDelta);
}

function applyTrailingVariation(timeline, item, type, startStock) {
    let lastKnown = startStock;
    timeline.forEach(function (t) {
        if (t.stock !== null) {
            lastKnown = t.stock;
            return;
        }
        if (isFutureMonth(t.y, t.m)) return;

        if (type === 'equipment') {
            t.stock = roundStock(lastKnown);
            t.isInferred = true;
            hasInferredMonths = true;
            return;
        }

        lastKnown = applyCycleTrailingMonth(item, t, lastKnown);
        t.stock = lastKnown;
        t.isInferred = true;
        hasInferredMonths = true;
    });
}

function getStartStock(item, type) {
    return type === 'consumable' ? item.initialStock : item.baseQty;
}

function buildTimeline(item, type, sortedLogs, endYear) {
    const timeline = [];
    for (let y = 2022; y <= endYear; y++) {
        for (let m = 1; m <= 12; m++) {
            const logs = sortedLogs.filter(function (log) {
                const d = new Date(log.date);
                return log.type === type && log.name === item.name &&
                    d.getFullYear() === y && d.getMonth() + 1 === m;
            });
            timeline.push({
                y: y,
                m: m,
                stock: null,
                isInferred: false,
                snapshot: logs.find(function (l) { return l.status === '실측'; }) || null,
                events: logs.filter(function (l) { return l.status !== '실측'; })
            });
        }
    }
    return timeline;
}

function applyEventDelta(stock, log) {
    if (log.status === '구입') return roundStock(stock + log.qty);
    if (log.status === '파손' || log.status === '분실' || log.status === '폐기') return roundStock(stock - log.qty);
    return roundStock(stock);
}

function interpolateGap(timeline, fromIdx, toIdx, item, type) {
    const gap = toIdx - fromIdx;
    if (gap <= 1) return;

    const fromStock = timeline[fromIdx].stock;
    const toStock = timeline[toIdx].stock;
    let netEventDelta = 0;

    for (let j = fromIdx + 1; j < toIdx; j++) {
        timeline[j].events.forEach(function (log) {
            if (log.status === '구입') netEventDelta += log.qty;
            else if (log.status === '파손' || log.status === '분실' || log.status === '폐기') netEventDelta -= log.qty;
        });
    }

    const fillIndices = [];
    for (let j = fromIdx + 1; j < toIdx; j++) {
        if (timeline[j].stock !== null) continue;
        if (isFutureMonth(timeline[j].y, timeline[j].m)) continue;
        fillIndices.push(j);
    }
    if (!fillIndices.length) return;

    const endIsFuture = isFutureMonth(timeline[toIdx].y, timeline[toIdx].m);
    const totalDelta = endIsFuture ? 0 : roundStock(toStock - fromStock - netEventDelta);
    const deltas = generateGapDeltas(item, type, timeline, fillIndices, totalDelta);

    let running = fromStock;
    fillIndices.forEach(function (j, di) {
        let eventD = 0;
        timeline[j].events.forEach(function (log) {
            if (log.status === '구입') eventD += log.qty;
            else if (log.status === '파손' || log.status === '분실' || log.status === '폐기') eventD -= log.qty;
        });

        running = roundStock(running + deltas[di] + eventD);
        running = Math.max(0, running);
        timeline[j].stock = running;
        timeline[j].isInferred = true;
        hasInferredMonths = true;
    });
}

function computeTimeline(item, type, sortedLogs, endYear) {
    const timeline = buildTimeline(item, type, sortedLogs, endYear);
    const startStock = getStartStock(item, type);
    let stock = startStock;

    timeline.forEach(function (t, i) {
        if (t.snapshot) {
            stock = roundStock(t.snapshot.qty);
            t.stock = stock;
            return;
        }

        if (i === 0) {
            t.stock = roundStock(stock);
            return;
        }

        if (t.events.length > 0) {
            t.events.forEach(function (log) {
                stock = applyEventDelta(stock, log);
            });
            t.stock = roundStock(stock);
            return;
        }

        t.stock = null;
    });

    const anchorIndices = [];
    timeline.forEach(function (t, idx) {
        if (t.stock !== null) anchorIndices.push(idx);
    });

    for (let a = 0; a < anchorIndices.length - 1; a++) {
        interpolateGap(timeline, anchorIndices[a], anchorIndices[a + 1], item, type);
    }

    applyTrailingVariation(timeline, item, type, startStock);
    applyManualStockOverrides(timeline, item, type);

    timeline.forEach(function (t) {
        if (isFutureMonth(t.y, t.m) && t.isInferred) {
            t.stock = null;
            t.isInferred = false;
        }
    });

    return timeline;
}

function getTimelineMonth(timeline, year, month) {
    return timeline.find(function (t) { return t.y === year && t.m === month; });
}

/** 그래프용: 2022-01 ~ 오늘 달까지 월 축 */
function getCurrentChartEnd() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function buildChartMonthAxis() {
    const end = getCurrentChartEnd();
    const axis = [];
    let y = 2022;
    let m = 1;
    while (y < end.year || (y === end.year && m <= end.month)) {
        axis.push({
            year: y,
            month: m,
            label: y + '.' + m
        });
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
    return axis;
}

/** 품목별 월말 재고 시계열 (추이 그래프용) */
function buildItemTrendSeries(item, type, sortedLogs) {
    const axis = buildChartMonthAxis();
    if (!axis.length) return { axis: [], values: [], inferred: [] };

    const endYear = axis[axis.length - 1].year;
    hasInferredMonths = false;
    const timeline = computeTimeline(item, type, sortedLogs, endYear);

    const values = [];
    const inferred = [];
    const manual = [];
    axis.forEach(function (p) {
        const cell = getTimelineMonth(timeline, p.year, p.month);
        if (!cell || cell.stock === null || cell.stock === undefined) {
            values.push(null);
            inferred.push(false);
            manual.push(false);
            return;
        }
        values.push(roundStock(cell.stock));
        inferred.push(!!cell.isInferred);
        manual.push(!!cell.isManualOverride);
    });

    return { axis: axis, values: values, inferred: inferred, manual: manual };
}

const INVENTORY_STORAGE_KEY = 'codework_inventory_logs_v1';
const INVENTORY_FB_ROOT = 'commonData/차체물품';

let inventoryDatabase = null;

function getInventoryPayload() {
    return {
        logs: transactionLogs,
        nextId: nextLogId,
        cycleSettings: itemCycleSettings,
        stockOverrides: itemStockOverrides
    };
}

function applyInventoryPayload(data) {
    if (!data || !Array.isArray(data.logs)) return false;
    transactionLogs = data.logs;
    nextLogId = data.nextId || 10000;
    itemCycleSettings = (data.cycleSettings && typeof data.cycleSettings === 'object')
        ? data.cycleSettings
        : {};
    itemStockOverrides = (data.stockOverrides && typeof data.stockOverrides === 'object')
        ? data.stockOverrides
        : {};
    baselineRestoreCount = enforceBaseline2022Anchors();
    return true;
}

function stockOverrideKey(type, name) {
    return type + '::' + name;
}

function stockMonthKey(year, month) {
    return year + '-' + String(month).padStart(2, '0');
}

function applyManualStockOverrides(timeline, item, type) {
    const key = stockOverrideKey(type, item.name);
    const overrides = itemStockOverrides[key];
    if (!overrides || typeof overrides !== 'object') return;

    timeline.forEach(function (t) {
        if (t.snapshot) return;
        if (isFutureMonth(t.y, t.m)) return;
        const mk = stockMonthKey(t.y, t.m);
        if (overrides[mk] == null || overrides[mk] === '') return;
        const v = roundStock(Number(overrides[mk]));
        if (isNaN(v) || v < 0) return;
        t.stock = v;
        t.isInferred = true;
        t.isManualOverride = true;
        hasInferredMonths = true;
    });
}

function setItemStockOverride(type, name, year, month, value) {
    if (isBaselineLockedYearMonth(year, month)) return;
    const key = stockOverrideKey(type, name);
    if (!itemStockOverrides[key]) itemStockOverrides[key] = {};
    itemStockOverrides[key][stockMonthKey(year, month)] = roundStock(Math.max(0, value));
}

function clearItemStockOverride(type, name, year, month) {
    const key = stockOverrideKey(type, name);
    if (!itemStockOverrides[key]) return;
    delete itemStockOverrides[key][stockMonthKey(year, month)];
    if (!Object.keys(itemStockOverrides[key]).length) delete itemStockOverrides[key];
}

window.setItemStockOverride = setItemStockOverride;
window.clearItemStockOverride = clearItemStockOverride;
window.saveInventoryData = saveLogsToStorage;

function readLocalInventoryBackup() {
    try {
        const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.logs && Array.isArray(data.logs)) return data;
    } catch (e) { /* ignore */ }
    return null;
}

function writeLocalInventoryBackup() {
    try {
        localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(getInventoryPayload()));
    } catch (e) { /* ignore */ }
}

function initInventoryFirebase() {
    if (typeof firebase === 'undefined') return false;
    const masterConfig = {
        apiKey: 'AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU',
        authDomain: 'busan-teacher-workall.firebaseapp.com',
        databaseURL: 'https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app',
        projectId: 'busan-teacher-workall'
    };
    if (!firebase.apps.length) firebase.initializeApp(masterConfig);
    inventoryDatabase = firebase.database();
    return true;
}

async function ensureInventoryAuth() {
    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) {
        if (typeof appAlert === 'function') {
            await appAlert('보안 인증이 필요합니다. 메인 화면에서 로그인해 주세요.');
        } else {
            alert('보안 인증이 필요합니다.');
        }
        location.href = '../index.html';
        throw new Error('auth_required');
    }
    await firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', savedPw);
}

async function loadLogsFromStorage() {
    const local = readLocalInventoryBackup();

    if (inventoryDatabase) {
        try {
            const snap = await inventoryDatabase.ref(INVENTORY_FB_ROOT + '/inventory').once('value');
            const fb = snap.val();
            if (applyInventoryPayload(fb)) {
                if (baselineRestoreCount > 0) {
                    try {
                        await saveLogsToStorage();
                    } catch (e) {
                        console.warn('2022 baseline restore save failed:', e);
                        writeLocalInventoryBackup();
                    }
                } else {
                    writeLocalInventoryBackup();
                }
                return;
            }
            if (local && applyInventoryPayload(local)) {
                await saveLogsToStorage();
                return;
            }
        } catch (e) {
            console.error('Firebase load failed:', e);
            if (local && applyInventoryPayload(local)) return;
            throw e;
        }
    } else if (local) {
        applyInventoryPayload(local);
    }
}

async function saveLogsToStorage() {
    enforceBaseline2022Anchors();
    writeLocalInventoryBackup();
    if (!inventoryDatabase) {
        throw new Error('firebase_not_ready');
    }
    await inventoryDatabase.ref(INVENTORY_FB_ROOT + '/inventory').set({
        logs: transactionLogs,
        nextId: nextLogId,
        cycleSettings: itemCycleSettings,
        stockOverrides: itemStockOverrides,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

async function bootstrapInventoryData() {
    if (!initInventoryFirebase()) {
        console.warn('Firebase unavailable; using local backup only.');
        applyInventoryPayload(readLocalInventoryBackup());
        return;
    }
    try {
        await ensureInventoryAuth();
        await loadLogsFromStorage();
    } catch (e) {
        if (e && e.message === 'auth_required') throw e;
        console.error(e);
        applyInventoryPayload(readLocalInventoryBackup());
    }
}

window.inventoryDataReady = bootstrapInventoryData();

function getPrevYearMonth(year, month) {
    if (month === 1) return { year: year - 1, month: 12 };
    return { year: year, month: month - 1 };
}

function sumPurchasesInMonth(sortedLogs, itemName, year, month) {
    return sortedLogs.filter(function (log) {
        const d = new Date(log.date);
        return log.type === 'consumable' && log.name === itemName && log.status === '구입' &&
            d.getFullYear() === year && d.getMonth() + 1 === month;
    }).reduce(function (sum, log) { return roundStock(sum + log.qty); }, 0);
}

function formatSheetDiff(val) {
    if (val === null || val === undefined || val === '') return '-';
    const v = roundStock(Number(val));
    if (v === 0) return '-';
    if (v > 0) return '+' + String(v);
    return String(v);
}

function formatSheetNum(val) {
    if (val === null || val === undefined || val === '') return '';
    return String(roundStock(Number(val)));
}

function computeMonthlySurveyRows(targetYear, targetMonth, sortedLogs) {
    const prev = getPrevYearMonth(targetYear, targetMonth);
    const rows = [];

    consumableMaster.forEach(function (item) {
        const timeline = computeTimeline(item, 'consumable', sortedLogs, targetYear);
        const prevCell = getTimelineMonth(timeline, prev.year, prev.month);
        const currCell = getTimelineMonth(timeline, targetYear, targetMonth);

        let prevStock = prevCell ? prevCell.stock : null;
        if (prevStock === null && targetMonth === 1 && targetYear === 2022) {
            prevStock = item.initialStock;
        }
        if (prevStock === null && prev.year >= 2022) {
            prevStock = getStartStock(item, 'consumable');
        }

        const purchase = sumPurchasesInMonth(sortedLogs, item.name, targetYear, targetMonth);
        let currentStock = currCell ? currCell.stock : null;
        let diff = null;

        const hasActualInMonth = sortedLogs.some(function (log) {
            const d = new Date(log.date);
            return log.type === 'consumable' && log.name === item.name &&
                d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth;
        });

        if (isFutureMonth(targetYear, targetMonth) && !hasActualInMonth) {
            rows.push({
                id: item.id,
                name: item.name,
                unit: item.unit,
                prevStock: null,
                currentStock: null,
                diffQty: null,
                purchase: '',
                isInferred: false
            });
            return;
        }

        if (currentStock !== null && prevStock !== null) {
            diff = roundStock(currentStock - prevStock - purchase);
        }

        rows.push({
            id: item.id,
            name: item.name,
            unit: item.unit,
            prevStock: prevStock,
            currentStock: currentStock,
            diffQty: diff,
            purchase: purchase || '',
            isInferred: currCell ? currCell.isInferred : true,
            isManualOverride: currCell ? !!currCell.isManualOverride : false
        });
    });

    return rows;
}

function renderMonthlySurvey(targetYear, sortedLogs) {
    const monthSel = document.getElementById('surveyMonthSelect');
    const targetMonth = monthSel ? parseInt(monthSel.value, 10) : 1;
    const rows = computeMonthlySurveyRows(targetYear, targetMonth, sortedLogs);
    const tbody = document.querySelector('#tableMonthlySurvey tbody');
    const dateLbl = document.getElementById('monthlySurveyDateLabel');
    if (!tbody) return;

    if (dateLbl) {
        let dateText = targetYear + '년 ' + targetMonth + '월';
        if (targetYear === 2022 && typeof BASELINE_2022_MONTHLY_SHEETS !== 'undefined') {
            const sheet = BASELINE_2022_MONTHLY_SHEETS[String(targetMonth)];
            if (sheet && sheet.surveyDate) dateText = sheet.surveyDate;
        }
        dateLbl.textContent = dateText;
    }

    tbody.innerHTML = rows.map(function (row) {
        const bg = row.isManualOverride
            ? ' style="background-color:#e8daef;"'
            : (row.isInferred ? ' style="background-color:#fff3cd;"' : '');
        const note = row.isManualOverride ? '수동조정' : (row.isInferred ? '추정' : '');
        return '<tr' + bg + '>' +
            '<td>' + row.id + '</td>' +
            '<td style="text-align:left;font-weight:bold;">' + row.name + '</td>' +
            '<td>' + row.unit + '</td>' +
            '<td>' + formatSheetNum(row.prevStock) + '</td>' +
            '<td>' + formatSheetNum(row.currentStock) + '</td>' +
            '<td>' + formatSheetDiff(row.diffQty) + '</td>' +
            '<td>' + formatSheetNum(row.purchase) + '</td>' +
            '<td style="text-align:left;">' + note + '</td>' +
            '</tr>';
    }).join('');
}

function buildDefaultCycleSettingsFromProfiles() {
    if (!consumptionProfileCache) buildConsumptionProfiles();
    const defaults = {};
    consumableMaster.forEach(function (item) {
        const profile = consumptionProfileCache[item.name] || {};
        defaults[item.name] = {
            purchaseCycleMonths: defaultCycleFromProfile(profile),
            monthlyUse: roundStock(Math.max(1, profile.avgUse || item.baseQty * 0.02)),
            purchaseQty: roundStock(Math.max(1, profile.avgPurchase || item.baseQty))
        };
    });
    return defaults;
}

function renderCycleSettingsList() {
    const area = document.getElementById('cycleSettingsList');
    if (!area) return;

    area.innerHTML = consumableMaster.map(function (item) {
        const s = getItemCycleSettings(item.name);
        const esc = function (v) {
            return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        };
        return (
            '<div class="cycle-row">' +
                '<span class="cycle-name" title="' + esc(item.name) + '">' + esc(item.name) + '</span>' +
                '<input type="number" class="cycle-input cycle-months" min="1" max="36" step="1" ' +
                    'data-name="' + esc(item.name) + '" value="' + s.purchaseCycleMonths + '" title="구입 주기(월)">' +
                '<input type="number" class="cycle-input cycle-use" min="1" step="1" ' +
                    'data-name="' + esc(item.name) + '" value="' + roundStock(s.monthlyUse) + '" title="월 평균 소모량">' +
                '<input type="number" class="cycle-input cycle-qty" min="1" step="1" ' +
                    'data-name="' + esc(item.name) + '" value="' + roundStock(s.purchaseQty) + '" title="1회 구입량">' +
            '</div>'
        );
    }).join('');
}

function collectCycleSettingsFromForm() {
    const next = {};
    document.querySelectorAll('.cycle-row').forEach(function (row) {
        const nameInput = row.querySelector('.cycle-months');
        if (!nameInput) return;
        const name = nameInput.dataset.name;
        const months = parseInt(row.querySelector('.cycle-months').value, 10);
        const monthlyUse = parseFloat(row.querySelector('.cycle-use').value);
        const purchaseQty = parseFloat(row.querySelector('.cycle-qty').value);
        if (!name) return;
        if (!isNaN(months) && months >= 1) {
            if (!next[name]) next[name] = {};
            next[name].purchaseCycleMonths = months;
        }
        if (!isNaN(monthlyUse) && monthlyUse > 0) {
            if (!next[name]) next[name] = {};
            next[name].monthlyUse = roundStock(monthlyUse);
        }
        if (!isNaN(purchaseQty) && purchaseQty > 0) {
            if (!next[name]) next[name] = {};
            next[name].purchaseQty = roundStock(purchaseQty);
        }
    });
    itemCycleSettings = next;
}

async function saveCycleSettings() {
    collectCycleSettingsFromForm();
    buildConsumptionProfiles();
    calculateAndRender();
    try {
        await saveLogsToStorage();
        alert('소모품 구입·소모 주기가 저장되었습니다. 공백 구간 추정 곡선이 갱신되었습니다.');
    } catch (e) {
        console.error(e);
        alert('주기 설정은 화면에 반영되었으나 Firebase 저장에 실패했습니다.');
    }
}

function previewCycleSettings() {
    collectCycleSettingsFromForm();
    buildConsumptionProfiles();
    calculateAndRender();
}

function resetCycleSettingsToDefaults() {
    itemCycleSettings = buildDefaultCycleSettingsFromProfiles();
    renderCycleSettingsList();
    buildConsumptionProfiles();
    calculateAndRender();
}

function renderSurveyList() {
    const equipArea = document.getElementById('surveyListEquipment');
    const consArea = document.getElementById('surveyListConsumable');
    if (!equipArea || !consArea) return;

    const surveyDate = document.getElementById('surveyDate') ? document.getElementById('surveyDate').value : '';
    const drafts = collectSurveyInputDrafts();

    equipArea.innerHTML = equipmentMaster.map(function (item) {
        return (
            '<div class="survey-row">' +
                '<span class="survey-name" title="' + item.name + '">' + item.name + '</span>' +
                '<span class="survey-unit">' + item.unit + '</span>' +
                '<span class="survey-base">' + item.baseQty + '</span>' +
                buildSurveyQtyInput(item, 'equipment', surveyDate, drafts) +
            '</div>'
        );
    }).join('');

    consArea.innerHTML = consumableMaster.map(function (item) {
        return (
            '<div class="survey-row">' +
                '<span class="survey-name" title="' + item.name + '">' + item.name + '</span>' +
                '<span class="survey-unit">' + item.unit + '</span>' +
                '<span class="survey-base">' + item.initialStock + '</span>' +
                buildSurveyQtyInput(item, 'consumable', surveyDate, drafts) +
            '</div>'
        );
    }).join('');
}

async function applyBulkSurvey() {
    const date = document.getElementById('surveyDate').value;
    if (!date) {
        alert('실측 기준일을 선택해 주세요.');
        return;
    }

    const surveyYm = getYearMonthFromDateStr(date);
    if (isBaselineLockedYearMonth(surveyYm.year, surveyYm.month)) {
        alert('2022년 1~8월은 엑셀 실측 고정 구간입니다.\n이 기간의 재고는 변경할 수 없습니다.');
        return;
    }

    const inputs = document.querySelectorAll('.survey-qty');
    let count = 0;

    inputs.forEach(function (input) {
        const qty = parseSurveyQtyInput(input);
        if (qty == null) return;

        const name = input.dataset.name;
        const type = input.dataset.type;

        removeItemSurveyLogsForMonth(type, name, date);

        transactionLogs.push({
            id: nextLogId++,
            date: date,
            name: name,
            type: type,
            qty: qty,
            status: '실측',
            memo: '재고 실측 (일괄 등록)'
        });
        count++;
    });

    if (count === 0) {
        alert('실측할 품목을 하나 이상 숫자로 입력해 주세요.\n「기존」으로 둔 품목은 이전 재고가 그대로 유지됩니다.');
        return;
    }

    previewSurveyOverlay = null;
    setPreviewBanner(false);

    enforceBaseline2022Anchors();

    const inputYear = new Date(date).getFullYear();
    if (inputYear >= 2022 && inputYear <= 2026) {
        document.getElementById('globalYear').value = String(inputYear);
    }

    calculateAndRender();
    try {
        await saveLogsToStorage();
        showSurveyEntryListTab(date.substring(0, 10));
        alert(count + '개 품목의 실측이 등록되었습니다.\n나머지 품목은 기존(전월 이월·추정) 재고가 유지됩니다.\n「실제 기입 목록」 탭에서 확인할 수 있습니다.');
    } catch (e) {
        console.error(e);
        alert('실측은 화면에 반영되었으나 Firebase 저장에 실패했습니다. 네트워크·인증을 확인한 뒤 다시 저장해 주세요.');
    }
}

function toggleEventForm() {
    const panel = document.getElementById('eventFormPanel');
    const btn = document.getElementById('btnToggleEvent');
    if (!panel) return;
    const open = panel.style.display !== 'block';
    panel.style.display = open ? 'block' : 'none';
    if (btn) btn.textContent = open ? '▲ 개별 이벤트 입력 닫기' : '▼ 개별 이벤트 추가 (구입·파손 등)';
}

function updateItemDropdown() {
    const type = document.getElementById('itemType').value;
    const nameSelect = document.getElementById('itemName');
    nameSelect.innerHTML = '';
    const list = type === 'equipment' ? equipmentMaster : consumableMaster;
    list.forEach(function (item) {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        nameSelect.appendChild(opt);
    });
}

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (el) { el.classList.remove('active'); });
    document.getElementById(tabId).classList.add('active');
    if (btn) btn.classList.add('active');
}

function escHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isBulkSurveyEntryLog(log) {
    return !!(log && log.status === '실측' && log.memo === '재고 실측 (일괄 등록)');
}

function getItemUnit(type, name) {
    if (type === 'equipment') {
        const item = equipmentMaster.find(function (i) { return i.name === name; });
        return item ? item.unit : '-';
    }
    const item = consumableMaster.find(function (i) { return i.name === name; });
    return item ? item.unit : '-';
}

function formatSurveyEntryDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ')';
}

function collectBulkSurveyEntriesByDate() {
    const groups = {};
    transactionLogs.forEach(function (log) {
        if (!isBulkSurveyEntryLog(log)) return;
        const dateKey = (log.date || '').substring(0, 10);
        if (!dateKey) return;
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(log);
    });

    return Object.keys(groups).sort(function (a, b) { return b.localeCompare(a); }).map(function (dateKey) {
        const items = groups[dateKey].slice().sort(function (a, b) {
            const ta = a.type === 'equipment' ? 0 : 1;
            const tb = b.type === 'equipment' ? 0 : 1;
            if (ta !== tb) return ta - tb;
            return a.name.localeCompare(b.name, 'ko');
        });
        return {
            date: dateKey,
            items: items,
            equip: items.filter(function (l) { return l.type === 'equipment'; }).length,
            cons: items.filter(function (l) { return l.type === 'consumable'; }).length
        };
    });
}

function renderSurveyEntryList(openDate) {
    const area = document.getElementById('surveyEntryList');
    if (!area) return;

    const groups = collectBulkSurveyEntriesByDate();
    if (!groups.length) {
        area.innerHTML = '<p class="survey-entry-empty">일괄 실측으로 저장된 기록이 없습니다.</p>';
        return;
    }

    area.innerHTML = groups.map(function (g) {
        const shouldOpen = openDate && g.date === openDate;
        const rows = g.items.map(function (log) {
            const typeLabel = log.type === 'equipment' ? '장비' : '소모품';
            return '<tr>' +
                '<td>' + typeLabel + '</td>' +
                '<td style="text-align:left;">' + escHtml(log.name) + '</td>' +
                '<td>' + escHtml(getItemUnit(log.type, log.name)) + '</td>' +
                '<td><strong>' + formatStockDisplay(log.qty) + '</strong></td>' +
                '</tr>';
        }).join('');

        return '<details class="survey-entry-group"' + (shouldOpen ? ' open' : '') + '>' +
            '<summary>' +
                '<span class="survey-entry-date">' + formatSurveyEntryDate(g.date) + '</span>' +
                '<span class="survey-entry-meta">장비 ' + g.equip + ' · 소모품 ' + g.cons + ' (' + g.items.length + '건)</span>' +
            '</summary>' +
            '<div class="table-responsive survey-entry-table-wrap">' +
                '<table class="survey-entry-table">' +
                    '<thead><tr><th width="72">분류</th><th>품명</th><th width="56">단위</th><th width="72">실측</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
        '</details>';
    }).join('');
}

function showSurveyEntryListTab(openDate) {
    const btn = document.getElementById('tabBtnSurveyEntries');
    switchTab('tabSurveyEntries', btn);
    renderSurveyEntryList(openDate);
}

function calculateAndRender() {
    enforceBaseline2022Anchors();
    const targetYear = parseInt(document.getElementById('globalYear').value, 10);
    hasInferredMonths = false;

    document.querySelectorAll('.titleTabYear').forEach(function (el) { el.innerText = targetYear; });
    document.getElementById('lblDlYear').innerText = targetYear;

    const sortedLogs = getWorkingLogs().slice().sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
    });

    const tbodyLog = document.querySelector('#tableLog tbody');
    tbodyLog.innerHTML = '';
    let displayIdx = 1;
    sortedLogs.forEach(function (log) {
        if (new Date(log.date).getFullYear() !== targetYear) return;
        const statusBadge = '<span class="badge ' + getStatusClass(log.status) + '">' + log.status + '</span>';
        const qtyDisplay = log.status === '실측'
            ? formatStockDisplay(log.qty) + ' (실측)'
            : formatStockDisplay(log.qty);
        tbodyLog.innerHTML +=
            '<tr><td>' + displayIdx++ + '</td><td>' + log.date.substring(5) + '</td>' +
            '<td style="text-align:left;">' + log.name + '</td><td>' + qtyDisplay + '</td>' +
            '<td>' + statusBadge + '</td><td style="text-align:left;">' + (log.memo || '-') + '</td></tr>';
    });

    const tbodyConsumable = document.querySelector('#tableConsumable tbody');
    tbodyConsumable.innerHTML = '';

    consumableMaster.forEach(function (item) {
        const timeline = computeTimeline(item, 'consumable', sortedLogs, targetYear);
        const prevDec = getTimelineMonth(timeline, targetYear - 1, 12);
        const carryOver = prevDec ? prevDec.stock : item.initialStock;
        const monthCells = [];

        for (let m = 1; m <= 12; m++) {
            const cell = getTimelineMonth(timeline, targetYear, m);
            const bg = cell && cell.isManualOverride
                ? ' style="background-color:#e8daef;"'
                : (cell && cell.isInferred ? ' style="background-color:#fff3cd;"' : '');
            const display = cell && cell.stock !== null && cell.stock !== undefined
                ? formatStockDisplay(cell.stock) : '-';
            monthCells.push('<td' + bg + '>' + display + '</td>');
        }

        tbodyConsumable.innerHTML +=
            '<tr><td>' + item.id + '</td><td style="text-align:left;font-weight:bold;">' + item.name + '</td>' +
            '<td>' + item.unit + '</td><td>' + item.baseQty + '</td>' +
            '<td style="background-color:#e9ecef;font-weight:bold;color:var(--primary-color);">' + formatStockDisplay(carryOver) + '</td>' +
            monthCells.join('') + '</tr>';
    });

    renderMonthlySurvey(targetYear, sortedLogs);

    renderSurveyEntryList();

    const tbodyEquipment = document.querySelector('#tableEquipment tbody');
    tbodyEquipment.innerHTML = '';

    equipmentMaster.forEach(function (item) {
        const timeline = computeTimeline(item, 'equipment', sortedLogs, targetYear);
        const qKeys = ['q1', 'q2', 'q3', 'q4'];
        const qData = {
            q1: { p: 0, d: 0, l: 0, s: 0 },
            q2: { p: 0, d: 0, l: 0, s: 0 },
            q3: { p: 0, d: 0, l: 0, s: 0 },
            q4: { p: 0, d: 0, l: 0, s: 0 }
        };

        sortedLogs.forEach(function (log) {
            const d = new Date(log.date);
            if (log.type !== 'equipment' || log.name !== item.name || log.status === '실측') return;
            if (d.getFullYear() !== targetYear) return;
            const month = d.getMonth() + 1;
            const k = month <= 3 ? 'q1' : month <= 6 ? 'q2' : month <= 9 ? 'q3' : 'q4';
            if (log.status === '구입') qData[k].p += log.qty;
            if (log.status === '파손' || log.status === '폐기') qData[k].d += log.qty;
            if (log.status === '분실') qData[k].l += log.qty;
        });

        qKeys.forEach(function (qk, qi) {
            const endMonth = (qi + 1) * 3;
            const cell = getTimelineMonth(timeline, targetYear, endMonth);
            qData[qk].s = cell ? cell.stock : getStartStock(item, 'equipment');
        });

        const fmt = function (val) {
            if (val === 0) return 'ㆍ';
            return formatStockDisplay(val);
        };
        tbodyEquipment.innerHTML +=
            '<tr><td>' + item.id + '.0</td><td style="text-align:left;font-weight:bold;">' + item.name + '</td><td>' + item.unit + '</td>' +
            '<td>' + fmt(qData.q1.p) + '</td><td>' + fmt(qData.q1.d) + '</td><td>' + fmt(qData.q1.l) + '</td><td style="background-color:#f1f3f5;font-weight:bold;">' + formatStockDisplay(qData.q1.s) + '</td>' +
            '<td>' + fmt(qData.q2.p) + '</td><td>' + fmt(qData.q2.d) + '</td><td>' + fmt(qData.q2.l) + '</td><td style="background-color:#f1f3f5;font-weight:bold;">' + formatStockDisplay(qData.q2.s) + '</td>' +
            '<td>' + fmt(qData.q3.p) + '</td><td>' + fmt(qData.q3.d) + '</td><td>' + fmt(qData.q3.l) + '</td><td style="background-color:#f1f3f5;font-weight:bold;">' + formatStockDisplay(qData.q3.s) + '</td>' +
            '<td>' + fmt(qData.q4.p) + '</td><td>' + fmt(qData.q4.d) + '</td><td>' + fmt(qData.q4.l) + '</td><td style="background-color:#f1f3f5;font-weight:bold;">' + formatStockDisplay(qData.q4.s) + '</td></tr>';
    });

    const notice = document.getElementById('gapNotice');
    if (notice) {
        let base = hasInferredMonths
            ? '<strong>💡 추정 규칙:</strong> <strong>소모품</strong> 공백은 구입주기 곡선으로 추정하며, <strong>수량 추이</strong> 화면에서 드래그한 수동 조절값도 반영됩니다. <strong>장비</strong>는 실측·이벤트 기준 <strong>수량 고정</strong>. <span style="background:#fff3cd;padding:0 4px;">노란</span>=추정 · <span style="background:#e8daef;padding:0 4px;">보라</span>=수동조정.'
            : '<strong>💡 연동 엔진:</strong> 왼쪽 실측·이벤트 입력 → 1·2번 대장 자동 갱신. 소모품 공백은 ③ 주기 설정을 반영합니다.';
        if (baselineRestoreCount > 0) {
            base = '<strong>✅ 2022년 1~8월 엑셀 실측 고정값이 ' + baselineRestoreCount + '건 맞춰졌습니다.</strong> 이 구간은 항상 원본 실측으로 유지됩니다. ' + base;
            baselineRestoreCount = 0;
        }
        if (previewSurveyOverlay) {
            base = '<strong>🔍 가상 미리보기:</strong> 아래 표는 입력값 반영 결과입니다. 확정하려면 왼쪽 「이대로 실제 등록」을 누르세요. ' + base;
        }
        notice.innerHTML = base;
    }

    renderSurveyList();
}

function getStatusClass(status) {
    switch (status) {
        case '구입': return 'bg-purchase';
        case '수리': return 'bg-repair';
        case '파손': return 'bg-damage';
        case '분실': return 'bg-loss';
        case '폐기': return 'bg-disposal';
        case '실측': return 'bg-survey';
        default: return '';
    }
}

function getSelectedYear() {
    return document.getElementById('globalYear').value;
}

function exportFile1() {
    const wb = XLSX.utils.table_to_book(document.getElementById('tableEquipment'), { sheet: '장비,기자재관리대장' });
    XLSX.writeFile(wb, '1.분기별 차체용품 관리대장(' + getSelectedYear() + ').xlsx');
}

function exportFile2() {
    const wb = XLSX.utils.table_to_book(document.getElementById('tableConsumable'), { sheet: '월별재고종합' });
    XLSX.writeFile(wb, '2.월별소모성도장용구 (' + getSelectedYear() + ').xlsx');
}

function exportFile2Monthly() {
    const wb = XLSX.utils.table_to_book(document.getElementById('tableMonthlySurvey'), { sheet: '월별조사표' });
    const m = document.getElementById('surveyMonthSelect').value;
    XLSX.writeFile(wb, '2.월별조사표(' + getSelectedYear() + '-' + m + '월).xlsx');
}

function exportFile3() {
    const wb = XLSX.utils.table_to_book(document.getElementById('tableLog'), { sheet: '현황일지' });
    XLSX.writeFile(wb, '3.장비및기자재관리현황(' + getSelectedYear() + ').xlsx');
}

window.onload = async function () {
    try {
        await window.inventoryDataReady;
    } catch (e) {
        return;
    }
    buildConsumptionProfiles();
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const surveyDateEl = document.getElementById('surveyDate');
    const logDateEl = document.getElementById('logDate');
    if (surveyDateEl) surveyDateEl.value = todayStr;
    if (logDateEl) logDateEl.value = todayStr;
    initSurveyInputHandlers();
    renderSurveyList();
    if (surveyDateEl) {
        surveyDateEl.addEventListener('change', function () {
            renderSurveyList();
        });
    }
    renderCycleSettingsList();
    updateItemDropdown();
    calculateAndRender();

    document.getElementById('btnApplySurvey').addEventListener('click', applyBulkSurvey);
    document.getElementById('btnPreviewSurvey').addEventListener('click', previewBulkSurvey);
    document.getElementById('btnSaveCycleSettings')?.addEventListener('click', saveCycleSettings);
    document.getElementById('btnPreviewCycleSettings')?.addEventListener('click', previewCycleSettings);
    document.getElementById('btnResetCycleSettings')?.addEventListener('click', resetCycleSettingsToDefaults);

    document.getElementById('logForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const newLog = {
            id: nextLogId++,
            date: document.getElementById('logDate').value,
            name: document.getElementById('itemName').value,
            type: document.getElementById('itemType').value,
            qty: roundStock(parseFloat(document.getElementById('logQty').value)),
            status: document.getElementById('logStatus').value,
            memo: document.getElementById('logMemo').value
        };

        const logYm = getYearMonthFromDateStr(newLog.date);
        if (newLog.status === '실측' && isBaselineLockedYearMonth(logYm.year, logYm.month)) {
            alert('2022년 1~8월은 엑셀 실측 고정 구간입니다.\n이 기간에 실측 기록을 추가·변경할 수 없습니다.');
            return;
        }

        transactionLogs.push(newLog);
        enforceBaseline2022Anchors();
        const inputYear = new Date(newLog.date).getFullYear();
        if (inputYear >= 2022 && inputYear <= 2026) {
            document.getElementById('globalYear').value = String(inputYear);
        }
        calculateAndRender();
        try {
            await saveLogsToStorage();
            document.getElementById('logQty').value = 1;
            document.getElementById('logMemo').value = '';
            alert('이벤트가 등록되었으며 1·2번 대장이 갱신되었습니다.');
        } catch (err) {
            console.error(err);
            alert('이벤트는 화면에 반영되었으나 Firebase 저장에 실패했습니다.');
        }
    });
};
