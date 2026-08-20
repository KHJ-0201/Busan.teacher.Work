/* 재고 수량 추이 대시보드 — 차체물품관리.js 타임라인 엔진 연동 */
(function () {
    let miniCharts = [];
    let detailChart = null;
    let selectedKey = null;
    let selectedRow = null;
    let cachedItems = [];
    let chartDragState = null;

    function getSortedLogs() {
        return getWorkingLogs().slice().sort(function (a, b) {
            return new Date(a.date) - new Date(b.date);
        });
    }

    function itemKey(type, name) {
        return type + '::' + name;
    }

    function collectAllItems() {
        const items = [];
        equipmentMaster.forEach(function (item) {
            items.push({ type: 'equipment', typeLabel: '장비', item: item });
        });
        consumableMaster.forEach(function (item) {
            items.push({ type: 'consumable', typeLabel: '소모품', item: item });
        });
        return items;
    }

    function filterItems(items) {
        const typeFilter = document.getElementById('filterType').value;
        const q = (document.getElementById('searchItem').value || '').trim().toLowerCase();
        return items.filter(function (row) {
            if (typeFilter !== 'all' && row.type !== typeFilter) return false;
            if (q && row.item.name.toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }

    let selectedMonthIndices = new Set();
    let lastChartClickIndex = -1;
    let currentDetailSeries = null;
    let pendingDetailEdits = null;
    let chartAdjustMode = 'ratio';

    function hasPendingEdits() {
        return pendingDetailEdits && Object.keys(pendingDetailEdits.values).length > 0;
    }

    function isChartIndexPending(i) {
        return hasPendingEdits() && selectedKey === pendingDetailEdits.key && pendingDetailEdits.values[i] != null;
    }

    function clearPendingEdits() {
        pendingDetailEdits = null;
        updateSaveButtonUi();
    }

    function revertPendingChartEdits() {
        if (!hasPendingEdits() || !detailChart || !selectedRow) return;
        const fresh = buildItemTrendSeries(selectedRow.item, selectedRow.type, getSortedLogs());
        const data = detailChart.data.datasets[0].data;
        Object.keys(pendingDetailEdits.values).forEach(function (k) {
            const i = parseInt(k, 10);
            data[i] = fresh.values[i];
        });
        detailChart.update('none');
        clearPendingEdits();
        paintDetailSelection(detailChart);
        updateDetailMeta();
    }

    function updateSaveButtonUi() {
        const btn = document.getElementById('btnSaveChartEdits');
        if (!btn) return;
        const n = hasPendingEdits() ? Object.keys(pendingDetailEdits.values).length : 0;
        btn.disabled = n === 0;
        btn.textContent = n ? '저장 (' + n + '개월)' : '저장';
        updateResetManualButtonUi();
    }

    function countCurrentItemManualAdjustments() {
        let saved = 0;
        if (currentDetailSeries && currentDetailSeries.manual) {
            saved = currentDetailSeries.manual.filter(Boolean).length;
        }
        let pending = 0;
        if (hasPendingEdits() && pendingDetailEdits.key === selectedKey) {
            pending = Object.keys(pendingDetailEdits.values).length;
        }
        return { saved: saved, pending: pending, total: saved + pending };
    }

    function updateResetManualButtonUi() {
        const btn = document.getElementById('btnResetManualAdjust');
        if (!btn) return;
        const counts = countCurrentItemManualAdjustments();
        btn.disabled = counts.total === 0;
        btn.textContent = counts.total ? '수동 조절 초기화 (' + counts.total + '개월)' : '수동 조절 초기화';
    }

    function scrollToDetailChart() {
        const detailCard = document.getElementById('detailCard');
        if (!detailCard) return;
        detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function getDetailMetaStatus(extra) {
        let text = (extra || '').replace(/^\s*·\s*/, '');
        if (hasPendingEdits()) {
            text += (text ? ' · ' : '') + '미저장 ' + Object.keys(pendingDetailEdits.values).length + '개월 · 저장 또는 Enter';
        }
        return text;
    }

    function setDetailMetaBase(text) {
        const baseEl = document.getElementById('detailMetaBase');
        if (baseEl) baseEl.textContent = text || '';
    }

    function setDetailMetaStatus(text) {
        const statusEl = document.getElementById('detailMetaStatus');
        if (statusEl) statusEl.textContent = text || '';
    }

    function updateAdjustModeUi() {
        const wrap = document.getElementById('adjustModeWrap');
        if (!wrap) return;
        wrap.classList.toggle('is-visible', selectedMonthIndices.size > 0);
        setChartAdjustMode(chartAdjustMode);
    }

    function updateDetailMeta(extra) {
        if (!detailChart || !detailChart.$metaBase) return;
        setDetailMetaBase(detailChart.$metaBase + (detailChart.$metaLatest || ''));
        setDetailMetaStatus(getDetailMetaStatus(extra));
    }

    function getChartAdjustMode() {
        return chartAdjustMode === 'uniform' ? 'uniform' : 'ratio';
    }

    function setChartAdjustMode(mode) {
        chartAdjustMode = mode === 'uniform' ? 'uniform' : 'ratio';
        document.querySelectorAll('.btn-adjust-mode').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.mode === chartAdjustMode);
        });
    }

    function getVerticalDragHint() {
        return getChartAdjustMode() === 'uniform'
            ? '세로 드래그로 동일 수량 조절'
            : '세로 드래그로 비율 조절';
    }

    function mergePendingChartEdits(row, axisMeta, indices, dataArray) {
        const key = itemKey(row.type, row.item.name);
        if (!pendingDetailEdits || pendingDetailEdits.key !== key) {
            pendingDetailEdits = { key: key, row: row, axisMeta: axisMeta, values: {} };
        }
        pendingDetailEdits.row = row;
        pendingDetailEdits.axisMeta = axisMeta;
        indices.forEach(function (i) {
            const val = dataArray[i];
            if (val != null && !isNaN(val)) {
                pendingDetailEdits.values[i] = roundStock(Math.max(0, val));
            }
        });
        updateSaveButtonUi();
    }

    function applyPendingToDetailChart() {
        if (!hasPendingEdits() || !detailChart || pendingDetailEdits.key !== selectedKey) return;
        const data = detailChart.data.datasets[0].data;
        Object.keys(pendingDetailEdits.values).forEach(function (k) {
            data[parseInt(k, 10)] = pendingDetailEdits.values[k];
        });
        paintDetailSelection(detailChart);
        updateDetailMeta();
    }

    async function savePendingChartEdits() {
        if (!hasPendingEdits()) return;
        const row = pendingDetailEdits.row;
        const axisMeta = pendingDetailEdits.axisMeta;
        const values = pendingDetailEdits.values;
        Object.keys(values).forEach(function (k) {
            const i = parseInt(k, 10);
            const p = axisMeta[i];
            if (!p) return;
            setItemStockOverride(row.type, row.item.name, p.year, p.month, values[k]);
        });
        clearPendingEdits();
        try {
            await saveInventoryData();
        } catch (err) {
            console.error(err);
            alert('저장에 실패했습니다.');
            return;
        }
        clearMonthSelection();
        renderGrid();
    }

    async function resetCurrentItemManualAdjustments() {
        if (!selectedRow || !currentDetailSeries) {
            alert('품목을 먼저 선택해 주세요.');
            return;
        }

        const counts = countCurrentItemManualAdjustments();
        if (!counts.total) {
            alert('초기화할 수동 조절 내역이 없습니다.');
            return;
        }

        let msg = selectedRow.item.name + '의 수동 조절 ' + counts.total + '개월을 모두 초기화할까요?\n추정값으로 되돌아갑니다.';
        if (counts.pending) {
            msg += '\n(저장하지 않은 조절 ' + counts.pending + '개월 포함)';
        }
        if (!confirm(msg)) return;

        clearPendingEdits();
        currentDetailSeries.axis.forEach(function (p, i) {
            if (currentDetailSeries.manual[i]) {
                clearItemStockOverride(selectedRow.type, selectedRow.item.name, p.year, p.month);
            }
        });

        try {
            await saveInventoryData();
        } catch (err) {
            console.error(err);
            alert('초기화 저장에 실패했습니다.');
            return;
        }

        clearMonthSelection();
        renderGrid();
    }

    function confirmDiscardPendingEdits(actionLabel) {
        if (!hasPendingEdits()) return true;
        return confirm('저장하지 않은 그래프 조절이 있습니다. ' + actionLabel + '하면 사라집니다. 계속할까요?');
    }

    function clearMonthSelection() {
        if (chartDragState) {
            const chart = chartDragState.chart;
            if (chartDragState.scaleLocked && chart) {
                Object.keys(chartDragState.baselineValues).forEach(function (key) {
                    const i = parseInt(key, 10);
                    chart.data.datasets[0].data[i] = chartDragState.baselineValues[i];
                });
                chart.update('none');
            }
            detachChartDragListeners();
            if (chart && chart.canvas) chart.canvas.style.cursor = 'default';
        }

        selectedMonthIndices.clear();
        lastChartClickIndex = -1;
        if (detailChart) detailChart.$selectedMonths = selectedMonthIndices;
        updateBatchSelectionUi();
        paintDetailSelection(detailChart);
        updateDetailMeta();
    }

    function onChartEscapeKey(e) {
        if (e.key !== 'Escape') return;
        if (!selectedMonthIndices.size && !chartDragState && !hasPendingEdits()) return;
        e.preventDefault();
        if (chartDragState) {
            clearMonthSelection();
            return;
        }
        if (hasPendingEdits()) {
            revertPendingChartEdits();
        }
        if (selectedMonthIndices.size) {
            clearMonthSelection();
        }
    }

    function onChartSaveKey(e) {
        if (e.key !== 'Enter') return;
        if (!hasPendingEdits()) return;
        if (e.target && e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        savePendingChartEdits();
    }

    function updateBatchSelectionUi() {
        const countEl = document.getElementById('batchSelectionCount');
        if (countEl) countEl.textContent = '선택 ' + selectedMonthIndices.size + '개월';
        updateAdjustModeUi();
    }

    function syncRangeDropdownsFromSelection() {
        const fromEl = document.getElementById('batchFromMonth');
        const toEl = document.getElementById('batchToMonth');
        if (!fromEl || !toEl || !selectedMonthIndices.size) return;
        const sorted = Array.from(selectedMonthIndices).sort(function (a, b) { return a - b; });
        fromEl.value = String(sorted[0]);
        toEl.value = String(sorted[sorted.length - 1]);
    }

    function populateBatchMonthSelects(series) {
        const fromEl = document.getElementById('batchFromMonth');
        const toEl = document.getElementById('batchToMonth');
        if (!fromEl || !toEl || !series) return;

        const options = series.axis.map(function (p, i) {
            const editable = series.inferred[i] && series.values[i] != null;
            const tag = editable ? '' : ' (실측)';
            return '<option value="' + i + '"' + (editable ? '' : ' disabled') + '>' + p.label + tag + '</option>';
        }).join('');

        fromEl.innerHTML = options;
        toEl.innerHTML = options;

        const firstEditable = series.axis.findIndex(function (_, i) {
            return series.inferred[i] && series.values[i] != null;
        });
        const lastEditable = (function () {
            for (let i = series.axis.length - 1; i >= 0; i--) {
                if (series.inferred[i] && series.values[i] != null) return i;
            }
            return -1;
        })();

        if (firstEditable >= 0) {
            fromEl.value = String(firstEditable);
            toEl.value = String(lastEditable >= 0 ? lastEditable : firstEditable);
        }
    }

    function getEditableIndicesInRange(series, fromIdx, toIdx) {
        const a = Math.min(fromIdx, toIdx);
        const b = Math.max(fromIdx, toIdx);
        const list = [];
        for (let i = a; i <= b; i++) {
            if (series.inferred[i] && series.values[i] != null) list.push(i);
        }
        return list;
    }

    function paintDetailSelection(chart) {
        if (!chart || !chart.data || !chart.data.datasets[0]) return;
        const inferred = chart.$inferred || [];
        const manual = chart.$manual || [];
        const values = chart.data.datasets[0].data;
        const ds = chart.data.datasets[0];

        ds.pointBackgroundColor = values.map(function (v, i) {
            if (v === null || v === undefined) return 'transparent';
            if (selectedMonthIndices.has(i)) return '#e74c3c';
            if (isChartIndexPending(i)) return '#d35400';
            if (manual[i]) return '#8e44ad';
            return inferred[i] ? '#f39c12' : '#3498db';
        });
        ds.pointBorderColor = values.map(function (v, i) {
            if (v === null || v === undefined) return 'transparent';
            if (selectedMonthIndices.has(i)) return '#c0392b';
            if (isChartIndexPending(i)) return '#a04000';
            if (manual[i]) return '#8e44ad';
            return inferred[i] ? '#f39c12' : '#3498db';
        });
        ds.pointRadius = values.map(function (v, i) {
            if (v === null || v === undefined) return 0;
            if (selectedMonthIndices.has(i)) return 8;
            if (manual[i]) return 6;
            return inferred[i] ? 5 : 4;
        });
        chart.update('none');
    }

    async function applyOverridesToIndices(row, axisMeta, indices, value) {
        const val = roundStock(Math.max(0, value));
        indices.forEach(function (i) {
            const p = axisMeta[i];
            if (!p) return;
            setItemStockOverride(row.type, row.item.name, p.year, p.month, val);
        });
        try {
            await saveInventoryData();
        } catch (err) {
            console.error(err);
            alert('조절값은 반영되었으나 Firebase 저장에 실패했습니다.');
        }
    }

    async function applyBatchByRange() {
        if (!selectedRow || !currentDetailSeries) {
            alert('품목을 먼저 선택해 주세요.');
            return;
        }
        const fromIdx = parseInt(document.getElementById('batchFromMonth').value, 10);
        const toIdx = parseInt(document.getElementById('batchToMonth').value, 10);
        const raw = document.getElementById('batchValue').value;
        const value = parseFloat(raw);

        if (isNaN(fromIdx) || isNaN(toIdx)) {
            alert('시작월·종료월을 선택해 주세요.');
            return;
        }
        if (raw === '' || isNaN(value) || value < 0) {
            alert('적용할 재고 수량을 입력해 주세요.');
            return;
        }

        const indices = getEditableIndicesInRange(currentDetailSeries, fromIdx, toIdx);
        if (!indices.length) {
            alert('선택한 기간에 조절 가능한 추정 월이 없습니다. (실측 월은 변경되지 않습니다)');
            return;
        }

        await applyOverridesToIndices(selectedRow, currentDetailSeries.axis, indices, value);
        if (hasPendingEdits() && pendingDetailEdits.key === itemKey(selectedRow.type, selectedRow.item.name)) {
            clearPendingEdits();
        }
        clearMonthSelection();
        renderGrid();
    }

    function buildChartDatasets(axisLabels, values, inferred, manual, mini, selectedSet) {
        const sel = selectedSet || new Set();
        const pointColors = values.map(function (_, i) {
            if (values[i] === null || values[i] === undefined) return 'transparent';
            if (!mini && sel.has(i)) return '#e74c3c';
            if (manual && manual[i]) return '#8e44ad';
            return inferred[i] ? '#f39c12' : '#3498db';
        });
        const pointRadii = values.map(function (v, i) {
            if (v === null || v === undefined) return 0;
            if (!mini && sel.has(i)) return 8;
            if (manual && manual[i]) return mini ? 3 : 6;
            return mini ? (inferred[i] ? 2 : 0) : (inferred[i] ? 5 : 4);
        });
        const pointBorders = values.map(function (_, i) {
            if (values[i] === null || values[i] === undefined) return 'transparent';
            if (!mini && sel.has(i)) return '#c0392b';
            return pointColors[i];
        });

        return [{
            label: '월말 재고',
            data: values,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.12)',
            borderWidth: mini ? 1.5 : 2.5,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointBorders,
            pointRadius: pointRadii,
            pointHoverRadius: mini ? 4 : 8,
            spanGaps: false,
            fill: mini ? false : true,
            tension: 0.15
        }];
    }

    function getChartOptions(mini, axisLabels) {
        const tickStep = mini ? Math.max(1, Math.floor(axisLabels.length / 4)) : Math.max(1, Math.floor(axisLabels.length / 8));
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                legend: { display: !mini },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            const v = ctx.raw;
                            if (v === null || v === undefined) return '데이터 없음';
                            const man = ctx.chart.$manual && ctx.chart.$manual[ctx.dataIndex];
                            const inf = ctx.chart.$inferred && ctx.chart.$inferred[ctx.dataIndex];
                            let tag = '';
                            if (man) tag = ' (수동조정)';
                            else if (inf) tag = ' (추정·드래그 가능)';
                            else tag = ' (실측·고정)';
                            const sel = ctx.chart.$selectedMonths && ctx.chart.$selectedMonths.has(ctx.dataIndex);
                            if (sel) tag += ' [선택됨]';
                            return '재고: ' + formatStockDisplay(v) + tag;
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    ticks: {
                        maxRotation: mini ? 0 : 45,
                        minRotation: mini ? 0 : 30,
                        font: { size: mini ? 9 : 11 },
                        autoSkip: true,
                        maxTicksLimit: mini ? 5 : 14,
                        callback: function (val, index) {
                            if (index % tickStep !== 0 && index !== axisLabels.length - 1) return '';
                            return axisLabels[index];
                        }
                    },
                    grid: { display: !mini }
                },
                y: {
                    display: true,
                    beginAtZero: true,
                    ticks: {
                        font: { size: mini ? 9 : 11 },
                        callback: function (v) { return formatStockDisplay(v); }
                    },
                    grid: { color: 'rgba(0,0,0,0.06)' }
                }
            }
        };
    }

    function detachChartDragListeners() {
        window.removeEventListener('mousemove', onChartDragMove);
        window.removeEventListener('mouseup', onChartDragEnd);
        chartDragState = null;
        const wrap = document.querySelector('.detail-chart-wrap');
        if (wrap) wrap.classList.remove('is-dragging', 'is-range-drag');
    }

    /** X좌표만으로 월 인덱스 (인접 월 오선택 방지) */
    function getChartIndexFromX(chart, e) {
        const xScale = chart.scales.x;
        if (!xScale || typeof xScale.getValueForPixel !== 'function') return -1;

        let relX;
        if (Chart.helpers && typeof Chart.helpers.getRelativePosition === 'function') {
            relX = Chart.helpers.getRelativePosition(e, chart).x;
        } else if (chart.chartArea) {
            const rect = chart.canvas.getBoundingClientRect();
            const scaleX = chart.canvas.width / rect.width;
            relX = (e.clientX - rect.left) * scaleX - chart.chartArea.left;
        } else {
            return -1;
        }

        const raw = xScale.getValueForPixel(relX);
        const idx = Math.round(Number(raw));
        if (isNaN(idx)) return -1;
        return Math.max(0, Math.min(chart.data.labels.length - 1, idx));
    }

    /** Y좌표를 재고 수량으로 변환 (동일 조절용) */
    function getChartValueFromY(chart, e) {
        const yScale = chart.scales.y;
        if (!yScale || typeof yScale.getValueForPixel !== 'function') return null;

        let relY;
        if (Chart.helpers && typeof Chart.helpers.getRelativePosition === 'function') {
            relY = Chart.helpers.getRelativePosition(e, chart).y;
        } else if (chart.chartArea) {
            const rect = chart.canvas.getBoundingClientRect();
            const scaleY = chart.canvas.height / rect.height;
            relY = (e.clientY - rect.top) * scaleY - chart.chartArea.top;
        } else {
            return null;
        }

        const raw = Number(yScale.getValueForPixel(relY));
        if (isNaN(raw)) return null;
        return Math.max(0, roundStock(raw));
    }

    function getEditableIndicesBetween(chart, fromIdx, toIdx) {
        const a = Math.min(fromIdx, toIdx);
        const b = Math.max(fromIdx, toIdx);
        const list = [];
        const data = chart.data.datasets[0].data;
        for (let i = a; i <= b; i++) {
            if (chart.$inferred[i] && data[i] != null) list.push(i);
        }
        return list;
    }

    function updateDragSelection(chart, anchorIdx, currentIdx) {
        const next = new Set();
        getEditableIndicesBetween(chart, anchorIdx, currentIdx).forEach(function (i) {
            next.add(i);
        });
        if (!next.size && chart.$inferred[anchorIdx] && chart.data.datasets[0].data[anchorIdx] != null) {
            next.add(anchorIdx);
        }

        const prevKey = Array.from(selectedMonthIndices).sort(function (a, b) { return a - b; }).join(',');
        const nextKey = Array.from(next).sort(function (a, b) { return a - b; }).join(',');
        if (prevKey === nextKey) return;

        selectedMonthIndices.clear();
        next.forEach(function (i) {
            selectedMonthIndices.add(i);
        });
        chart.$selectedMonths = selectedMonthIndices;
        syncRangeDropdownsFromSelection();
        updateBatchSelectionUi();
        paintDetailSelection(chart);
    }

    async function applyOverridesFromChartData(row, axisMeta, indices, dataArray) {
        mergePendingChartEdits(row, axisMeta, indices, dataArray);
    }

    function onChartDragMove(e) {
        if (!chartDragState) return;
        const chart = chartDragState.chart;
        const canvas = chart.canvas;
        const dx = e.clientX - chartDragState.startClientX;
        const dy = e.clientY - chartDragState.startClientY;
        const currentIdx = getChartIndexFromX(chart, e);
        const useExisting = chartDragState.useExistingSelection;

        if (!chartDragState.scaleLocked && !useExisting) {
            if (currentIdx < 0) return;
            updateDragSelection(chart, chartDragState.anchorIdx, currentIdx);
        }

        const indices = Array.from(selectedMonthIndices).sort(function (a, b) { return a - b; });
        if (!indices.length) return;

        if (!chartDragState.scaleLocked) {
            if (chartDragState.rangeOnly) {
                canvas.style.cursor = 'ew-resize';
                const wrap = document.querySelector('.detail-chart-wrap');
                if (wrap) wrap.classList.add('is-range-drag');
                return;
            }

            const enterScale = Math.abs(dy) > 4 && Math.abs(dy) > Math.abs(dx);
            if (enterScale) {
                chartDragState.scaleLocked = true;
                chartDragState.scaleStartY = e.clientY;
                chartDragState.adjustMode = getChartAdjustMode();
                chartDragState.baselineValues = {};
                indices.forEach(function (i) {
                    chartDragState.baselineValues[i] = chart.data.datasets[0].data[i];
                });
                canvas.style.cursor = 'ns-resize';
                const wrap = document.querySelector('.detail-chart-wrap');
                if (wrap) wrap.classList.add('is-dragging');
            } else {
                canvas.style.cursor = 'ew-resize';
                const wrap = document.querySelector('.detail-chart-wrap');
                if (wrap) wrap.classList.add('is-range-drag');
                return;
            }
        }

        const dyScale = chartDragState.scaleStartY - e.clientY;
        const adjustMode = chartDragState.adjustMode || getChartAdjustMode();
        const from = chart.$axisMeta[indices[0]].label;
        const to = chart.$axisMeta[indices[indices.length - 1]].label;

        if (adjustMode === 'uniform') {
            const val = getChartValueFromY(chart, e);
            if (val == null) return;
            indices.forEach(function (i) {
                chart.data.datasets[0].data[i] = val;
            });
            chart.update('none');
            if (chart.$axisMeta) {
                updateDetailMeta(indices.length + '개월(' + from + '~' + to + ') · 동일값 ' + formatStockDisplay(val) + ' (미저장)');
            }
            return;
        }

        const factor = Math.exp(dyScale * 0.008);
        indices.forEach(function (i) {
            const base = chartDragState.baselineValues[i];
            if (base == null) return;
            chart.data.datasets[0].data[i] = Math.max(0, roundStock(base * factor));
        });
        chart.update('none');

        if (chart.$axisMeta) {
            const pct = ((factor - 1) * 100).toFixed(1);
            const sign = factor >= 1 ? '+' : '';
            updateDetailMeta(indices.length + '개월(' + from + '~' + to + ') · 비율 ' + sign + pct + '% (미저장)');
        }
    }

    async function onChartDragEnd() {
        if (!chartDragState) return;
        const chart = chartDragState.chart;
        const row = chartDragState.row;
        const axisMeta = chart.$axisMeta;
        const indices = Array.from(selectedMonthIndices).sort(function (a, b) { return a - b; });
        const scaleLocked = chartDragState.scaleLocked;
        const adjustMode = chartDragState.adjustMode || getChartAdjustMode();
        const data = chart.data.datasets[0].data;

        detachChartDragListeners();
        if (chart.canvas) chart.canvas.style.cursor = 'default';

        if (!row || !axisMeta || !indices.length) return;

        if (scaleLocked) {
            await applyOverridesFromChartData(row, axisMeta, indices, data);
            paintDetailSelection(chart);
            const from = axisMeta[indices[0]].label;
            const to = axisMeta[indices[indices.length - 1]].label;
            const modeLabel = adjustMode === 'uniform' ? '동일값' : '비율';
            updateDetailMeta(indices.length + '개월(' + from + '~' + to + ') ' + modeLabel + ' 조절됨');
            return;
        }

        syncRangeDropdownsFromSelection();
        updateBatchSelectionUi();
        paintDetailSelection(chart);
        if (chart.$axisMeta) {
            const from = chart.$axisMeta[indices[0]].label;
            const to = chart.$axisMeta[indices[indices.length - 1]].label;
            updateDetailMeta(indices.length + '개월 선택(' + from + '~' + to + ') · ' + getVerticalDragHint());
        }
    }

    function attachDetailChartEditor(chart, row, series) {
        const canvas = chart.canvas;
        if (!canvas) return;

        chart.$axisMeta = series.axis;
        chart.$inferred = series.inferred;
        chart.$manual = series.manual || [];
        chart.$row = row;
        chart.$metaBase = row.typeLabel + ' · 단위 ' + row.item.unit;

        if (chart._onMouseDown) {
            canvas.removeEventListener('mousedown', chart._onMouseDown);
            canvas.removeEventListener('dblclick', chart._onDblClick);
        }

        chart._onMouseDown = function (e) {
            e.stopPropagation();
            e.preventDefault();
            const idx = getChartIndexFromX(chart, e);
            if (idx < 0) return;
            if (!chart.$inferred[idx]) return;
            if (chart.data.datasets[0].data[idx] == null) return;

            lastChartClickIndex = idx;
            const useExisting = selectedMonthIndices.has(idx);
            chartDragState = {
                chart: chart,
                row: row,
                anchorIdx: idx,
                startClientX: e.clientX,
                startClientY: e.clientY,
                scaleLocked: false,
                scaleStartY: e.clientY,
                baselineValues: {},
                useExistingSelection: useExisting,
                rangeOnly: !useExisting
            };

            if (!useExisting) {
                updateDragSelection(chart, idx, idx);
            } else {
                paintDetailSelection(chart);
            }
            canvas.style.cursor = useExisting ? 'ns-resize' : 'ew-resize';
            const wrap = document.querySelector('.detail-chart-wrap');
            if (wrap) wrap.classList.add('is-range-drag');

            window.addEventListener('mousemove', onChartDragMove);
            window.addEventListener('mouseup', onChartDragEnd);
        };

        chart._onDblClick = async function (e) {
            e.stopPropagation();
            const idx = getChartIndexFromX(chart, e);
            if (idx < 0) return;
            if (!chart.$manual || !chart.$manual[idx]) {
                if (!isChartIndexPending(idx)) return;
            }

            const p = series.axis[idx];
            const wasSavedManual = chart.$manual && chart.$manual[idx];

            if (hasPendingEdits() && pendingDetailEdits.values[idx] != null) {
                delete pendingDetailEdits.values[idx];
                if (!Object.keys(pendingDetailEdits.values).length) clearPendingEdits();
                else updateSaveButtonUi();
            }

            if (wasSavedManual) {
                clearItemStockOverride(row.type, row.item.name, p.year, p.month);
                try {
                    await saveInventoryData();
                } catch (err) {
                    console.error(err);
                }
                renderGrid();
                return;
            }

            const fresh = buildItemTrendSeries(row.item, row.type, getSortedLogs());
            chart.data.datasets[0].data[idx] = fresh.values[idx];
            paintDetailSelection(chart);
            updateDetailMeta();
        };

        canvas.addEventListener('mousedown', chart._onMouseDown);
        canvas.addEventListener('dblclick', chart._onDblClick);
        canvas.style.cursor = 'default';
    }

    function destroyMiniCharts() {
        miniCharts.forEach(function (c) { if (c) c.destroy(); });
        miniCharts = [];
    }

    function destroyDetailChart() {
        detachChartDragListeners();
        if (detailChart) {
            if (detailChart.canvas && detailChart._onMouseDown) {
                detailChart.canvas.removeEventListener('mousedown', detailChart._onMouseDown);
                detailChart.canvas.removeEventListener('dblclick', detailChart._onDblClick);
            }
            detailChart.destroy();
            detailChart = null;
        }
    }

    function latestPoint(axis, values) {
        for (let i = values.length - 1; i >= 0; i--) {
            if (values[i] !== null && values[i] !== undefined) {
                return { label: axis[i].label, value: values[i], inferred: false };
            }
        }
        return null;
    }

    function renderDetail(row, series) {
        const canvas = document.getElementById('detailChart');
        const titleEl = document.getElementById('detailTitle');
        if (!canvas || !row) return;

        selectedRow = row;
        currentDetailSeries = series;
        clearMonthSelection();
        populateBatchMonthSelects(series);

        const axisLabels = series.axis.map(function (p) { return p.label; });
        const last = latestPoint(series.axis, series.values);
        const manual = series.manual || [];

        titleEl.textContent = row.item.name;

        destroyDetailChart();
        detailChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: axisLabels,
                datasets: buildChartDatasets(axisLabels, series.values, series.inferred, manual, false, selectedMonthIndices)
            },
            options: getChartOptions(false, axisLabels)
        });
        detailChart.$metaBase = row.typeLabel + ' · 단위 ' + row.item.unit;
        detailChart.$metaLatest = last
            ? ' · 최신 ' + last.label + ' → ' + formatStockDisplay(last.value)
            : ' · 표시 데이터 없음';
        setDetailMetaBase(detailChart.$metaBase + detailChart.$metaLatest);
        setDetailMetaStatus('');
        detailChart.$inferred = series.inferred;
        detailChart.$manual = manual;
        detailChart.$selectedMonths = selectedMonthIndices;
        detailChart.$series = series;
        attachDetailChartEditor(detailChart, row, series);
        updateBatchSelectionUi();
        updateSaveButtonUi();
        applyPendingToDetailChart();
    }

    function selectItem(row, series, shouldScroll) {
        const newKey = itemKey(row.type, row.item.name);
        if (hasPendingEdits() && pendingDetailEdits.key !== newKey) {
            if (!confirmDiscardPendingEdits('다른 품목으로 이동')) return;
            clearPendingEdits();
        }
        selectedKey = newKey;
        document.querySelectorAll('.chart-card').forEach(function (el) {
            el.classList.toggle('selected', el.dataset.key === selectedKey);
        });
        renderDetail(row, series);
        if (shouldScroll) scrollToDetailChart();
    }

    function renderGrid() {
        const grid = document.getElementById('chartGrid');
        const sortedLogs = getSortedLogs();
        const filtered = filterItems(cachedItems);

        destroyMiniCharts();
        grid.innerHTML = '';

        if (!filtered.length) {
            grid.innerHTML = '<div class="empty-msg">조건에 맞는 품목이 없습니다.</div>';
            return;
        }

        let firstRow = null;
        let firstSeries = null;

        filtered.forEach(function (row, idx) {
            const series = buildItemTrendSeries(row.item, row.type, sortedLogs);
            const key = itemKey(row.type, row.item.name);
            const last = latestPoint(series.axis, series.values);
            const axisLabels = series.axis.map(function (p) { return p.label; });
            const manual = series.manual || [];

            const card = document.createElement('div');
            card.className = 'chart-card' + (selectedKey === key ? ' selected' : '');
            card.dataset.key = key;

            const badgeClass = row.type === 'equipment' ? 'badge-equipment' : 'badge-consumable';
            card.innerHTML =
                '<div class="chart-card-head">' +
                '<span class="badge-type ' + badgeClass + '">' + row.typeLabel + '</span>' +
                '<strong title="' + row.item.name + '">' + row.item.name + '</strong>' +
                '<span class="chart-unit">' + row.item.unit + '</span>' +
                '</div>' +
                '<div class="mini-chart-wrap"><canvas></canvas></div>' +
                '<div class="chart-card-foot">' +
                (last ? last.label + ' · ' + formatStockDisplay(last.value) : '데이터 없음') +
                '</div>';

            grid.appendChild(card);

            const canvas = card.querySelector('canvas');
            const chart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: axisLabels,
                    datasets: buildChartDatasets(axisLabels, series.values, series.inferred, manual, true, null)
                },
                options: getChartOptions(true, axisLabels)
            });
            chart.$inferred = series.inferred;
            chart.$manual = manual;
            miniCharts.push(chart);

            card.addEventListener('click', function () {
                selectItem(row, series, true);
            });

            if (idx === 0) {
                firstRow = row;
                firstSeries = series;
            }
        });

        if (!selectedKey || !filtered.some(function (r) { return itemKey(r.type, r.item.name) === selectedKey; })) {
            if (firstRow && firstSeries) selectItem(firstRow, firstSeries);
        } else {
            const sel = filtered.find(function (r) { return itemKey(r.type, r.item.name) === selectedKey; });
            if (sel) {
                const s = buildItemTrendSeries(sel.item, sel.type, sortedLogs);
                renderDetail(sel, s);
                applyPendingToDetailChart();
            }
        }
    }

    function updatePeriodLabel() {
        const axis = buildChartMonthAxis();
        const el = document.getElementById('periodLabel');
        if (!el || !axis.length) return;
        el.textContent = axis[0].label + ' ~ ' + axis[axis.length - 1].label + ' (' + axis.length + '개월)';
    }

    async function refreshDashboard() {
        if (!confirmDiscardPendingEdits('새로고침')) return;
        clearPendingEdits();
        try {
            await loadLogsFromStorage();
        } catch (e) {
            console.error(e);
            alert('데이터를 불러오지 못했습니다.');
            return;
        }
        buildConsumptionProfiles();
        updatePeriodLabel();
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', async function () {
        try {
            await window.inventoryDataReady;
        } catch (e) {
            return;
        }
        buildConsumptionProfiles();
        cachedItems = collectAllItems();
        updatePeriodLabel();
        renderGrid();

        document.getElementById('filterType').addEventListener('change', renderGrid);
        document.getElementById('searchItem').addEventListener('input', renderGrid);
        document.getElementById('btnRefreshCharts').addEventListener('click', refreshDashboard);
        document.getElementById('btnBatchApply')?.addEventListener('click', applyBatchByRange);
        document.getElementById('btnSaveChartEdits')?.addEventListener('click', savePendingChartEdits);
        document.getElementById('btnClearSelection')?.addEventListener('click', clearMonthSelection);
        document.getElementById('btnResetManualAdjust')?.addEventListener('click', resetCurrentItemManualAdjustments);
        document.getElementById('btnAdjustRatio')?.addEventListener('click', function () {
            setChartAdjustMode('ratio');
            if (selectedMonthIndices.size) updateDetailMeta();
        });
        document.getElementById('btnAdjustUniform')?.addEventListener('click', function () {
            setChartAdjustMode('uniform');
            if (selectedMonthIndices.size) updateDetailMeta();
        });
        document.addEventListener('keydown', onChartEscapeKey);
        document.addEventListener('keydown', onChartSaveKey);
        document.getElementById('batchFromMonth')?.addEventListener('change', function () {
            const fromIdx = parseInt(document.getElementById('batchFromMonth').value, 10);
            const toIdx = parseInt(document.getElementById('batchToMonth').value, 10);
            if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx > toIdx) {
                document.getElementById('batchToMonth').value = String(fromIdx);
            }
        });
    });
})();
