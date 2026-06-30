/**
 * korea-map-picker.js — D3.js + TopoJSON 클릭형 한반도 지도 (PC 전용)
 */
(function (global) {
    'use strict';

    const COLORS = {
        default: '#dbeafe',
        hover: '#93c5fd',
        selected: '#2563eb',
        stroke: '#64748b',
        strokeHover: '#1d4ed8',
        hasStudents: '#bbf7d0',
        label: '#1e293b',
        labelSelected: '#ffffff'
    };

    const state = {
        container: null,
        selectedSido: '',
        selectedSigungu: '',
        getSidoCount: () => 0,
        getSigunguCount: () => 0,
        onSelect: null,
        sidoTopo: null,
        sigunguTopo: null,
        sigunguMap: null,
        ready: false
    };

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** 지도·브레드크럼용 시·도 표기 (광역시는 약칭, 일반 도는 ○○도 유지) */
    function mapSidoLabel(sido) {
        if (!sido) return '';
        if (sido.endsWith('광역시')) return sido.replace(/광역시$/, '');
        if (sido.endsWith('특별시')) return sido.replace(/특별시$/, '');
        if (sido.endsWith('특별자치시')) return sido.replace(/특별자치시$/, '') || '세종';
        if (sido.endsWith('특별자치도')) return sido.replace(/특별자치도$/, '');
        return sido;
    }

    const SIDO_LABEL_OFFSETS = {
        '경기도': { dx: 16, dy: 42 }
    };

    function getSidoLabelOffset(kr) {
        return SIDO_LABEL_OFFSETS[kr] || { dx: 0, dy: 0 };
    }

    function ensureD3() {
        return typeof d3 !== 'undefined' && typeof topojson !== 'undefined';
    }

    async function loadMapData() {
        if (state.sidoTopo && state.sigunguTopo && state.sigunguMap) return;
        const [sidoTopo, sigunguTopo, sigunguMap] = await Promise.all([
            fetch('korea-sido-topo.json').then(r => r.json()),
            fetch('korea-sigungu-topo.json').then(r => r.json()),
            fetch('korea-gadm-sigungu-map.json').then(r => r.json())
        ]);
        state.sidoTopo = sidoTopo;
        state.sigunguTopo = sigunguTopo;
        state.sigunguMap = sigunguMap;
    }

    function getSidoFeatures() {
        const key = Object.keys(state.sidoTopo.objects)[0];
        return topojson.feature(state.sidoTopo, state.sidoTopo.objects[key]).features;
    }

    function getSigunguFeaturesForSido(sidoKr) {
        const gadmSido = global.KR_SIDO_TO_GADM && KR_SIDO_TO_GADM[sidoKr];
        if (!gadmSido) return [];
        const key = Object.keys(state.sigunguTopo.objects)[0];
        const all = topojson.feature(state.sigunguTopo, state.sigunguTopo.objects[key]).features;
        return all.filter(f => f.properties.NAME_1 === gadmSido);
    }

    function resolveKrSigungu(sidoKr, gadmName2) {
        const overrides = global.GADM_SIGUNGU_OVERRIDES && GADM_SIGUNGU_OVERRIDES[sidoKr];
        if (overrides && overrides[gadmName2]) return overrides[gadmName2];
        const map = state.sigunguMap && state.sigunguMap[sidoKr];
        if (map && map[gadmName2]) return map[gadmName2];
        return null;
    }

    function renderShell() {
        const isSigunguStep = !!state.selectedSido;
        const breadcrumb = !state.selectedSido
            ? '전국'
            : state.selectedSigungu
                ? `${mapSidoLabel(state.selectedSido)} › ${state.selectedSigungu}`
                : mapSidoLabel(state.selectedSido);

        state.container.innerHTML = `
            <div class="korea-map-explorer-inner">
                <div class="korea-map-head">
                    <div>
                        <div class="korea-map-kicker">🗺️ 지도에서 지역 선택</div>
                        <div class="korea-map-breadcrumb">${escHtml(breadcrumb)}</div>
                    </div>
                    ${isSigunguStep ? '<button type="button" class="korea-map-back" id="koreaMapBackBtn">◀ 전국 지도</button>' : ''}
                </div>
                <p class="korea-map-guide">${isSigunguStep
            ? '시·군·구 경계를 클릭하면 해당 지역 학생 목록이 오른쪽에 표시됩니다. 같은 지역을 다시 클릭하면 선택이 해제됩니다.'
            : '한반도 지도에서 시·도를 클릭하세요. 마우스를 올리면 지역이 강조됩니다.'}</p>
                <div id="koreaD3MapHost" class="korea-d3-map-host"></div>
                ${!state.selectedSido ? '<div class="korea-map-sejong-note"><button type="button" class="korea-map-sejong-btn" id="koreaMapSejongBtn">세종특별자치시</button></div>' : ''}
            </div>`;

        state.container.querySelector('#koreaMapBackBtn')?.addEventListener('click', () => setSelection('', ''));
        state.container.querySelector('#koreaMapSejongBtn')?.addEventListener('click', () => {
            if (state.selectedSido === '세종특별자치시') setSelection('', '');
            else setSelection('세종특별자치시', '');
        });
    }

    function drawSidoMap(host) {
        const width = host.clientWidth || 720;
        const height = Math.max(420, Math.min(560, width * 1.15));
        host.innerHTML = '';

        const svg = d3.select(host).append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('class', 'korea-d3-svg');

        const g = svg.append('g');
        const features = getSidoFeatures();

        const projection = d3.geoMercator().fitExtent([[24, 16], [width - 24, height - 16]], {
            type: 'FeatureCollection',
            features
        });
        const path = d3.geoPath(projection);

        const regions = g.selectAll('path.korea-d3-region')
            .data(features)
            .join('path')
            .attr('class', 'korea-d3-region')
            .attr('d', path)
            .attr('fill', d => {
                const kr = global.GADM_SIDO_TO_KR[d.properties.NAME_1];
                if (kr === state.selectedSido) return COLORS.selected;
                if (state.getSidoCount(kr) > 0) return COLORS.hasStudents;
                return COLORS.default;
            })
            .attr('stroke', COLORS.stroke)
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseenter', function (event, d) {
                if (global.GADM_SIDO_TO_KR[d.properties.NAME_1] !== state.selectedSido) {
                    d3.select(this).attr('fill', COLORS.hover).attr('stroke', COLORS.strokeHover).attr('stroke-width', 1.5);
                }
            })
            .on('mouseleave', function (event, d) {
                const kr = global.GADM_SIDO_TO_KR[d.properties.NAME_1];
                const fill = kr === state.selectedSido
                    ? COLORS.selected
                    : (state.getSidoCount(kr) > 0 ? COLORS.hasStudents : COLORS.default);
                d3.select(this).attr('fill', fill).attr('stroke', COLORS.stroke).attr('stroke-width', 1);
            })
            .on('click', (event, d) => {
                const kr = global.GADM_SIDO_TO_KR[d.properties.NAME_1];
                if (!kr) return;
                if (state.selectedSido === kr) setSelection('', '');
                else setSelection(kr, '');
            });

        g.selectAll('text.korea-d3-label')
            .data(features)
            .join('text')
            .attr('class', 'korea-d3-label')
            .attr('transform', d => {
                const c = path.centroid(d);
                const kr = global.GADM_SIDO_TO_KR[d.properties.NAME_1];
                const off = getSidoLabelOffset(kr);
                return `translate(${c[0] + off.dx},${c[1] + off.dy})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', d => global.GADM_SIDO_TO_KR[d.properties.NAME_1] === state.selectedSido ? COLORS.labelSelected : COLORS.label)
            .attr('pointer-events', 'none')
            .style('font-size', '11px')
            .style('font-weight', '700')
            .text(d => {
                const kr = global.GADM_SIDO_TO_KR[d.properties.NAME_1];
                const cnt = kr ? state.getSidoCount(kr) : 0;
                const label = kr ? mapSidoLabel(kr) : d.properties.NAME_1;
                return cnt ? `${label} (${cnt})` : label;
            });
    }

    function drawSigunguMap(host) {
        const width = host.clientWidth || 720;
        const height = Math.max(420, Math.min(560, width * 1.05));
        host.innerHTML = '';
        const sidoKr = state.selectedSido;

        if (sidoKr === '세종특별자치시') {
            host.innerHTML = `<div class="korea-map-sejong-panel">
                <p><strong>세종특별자치시</strong></p>
                <button type="button" class="korea-map-sejong-select${state.selectedSigungu === '세종시' ? ' is-active' : ''}" data-sigungu="세종시">세종시 ${state.getSigunguCount(sidoKr, '세종시') ? `(${state.getSigunguCount(sidoKr, '세종시')}명)` : ''}</button>
            </div>`;
            host.querySelector('.korea-map-sejong-select')?.addEventListener('click', e => {
                const sig = e.currentTarget.dataset.sigungu;
                if (state.selectedSigungu === sig) setSelection(sidoKr, '');
                else setSelection(sidoKr, sig);
            });
            return;
        }

        const features = getSigunguFeaturesForSido(sidoKr);
        if (!features.length) {
            host.innerHTML = '<div class="main-view-hint">이 시·도의 상세 지도 데이터를 불러올 수 없습니다. 상단 드롭다운을 이용해 주세요.</div>';
            return;
        }

        const svg = d3.select(host).append('svg')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('class', 'korea-d3-svg');

        const g = svg.append('g');
        const collection = { type: 'FeatureCollection', features };

        const projection = d3.geoMercator().fitExtent([[20, 20], [width - 20, height - 20]], collection);
        const path = d3.geoPath(projection);

        const enriched = features.map(f => {
            const krName = resolveKrSigungu(sidoKr, f.properties.NAME_2);
            return { ...f, krName };
        });

        g.selectAll('path.korea-d3-region')
            .data(enriched)
            .join('path')
            .attr('class', d => `korea-d3-region${d.krName ? '' : ' is-unmapped'}`)
            .attr('d', path)
            .attr('fill', d => {
                if (d.krName && d.krName === state.selectedSigungu) return COLORS.selected;
                if (d.krName && state.getSigunguCount(sidoKr, d.krName) > 0) return COLORS.hasStudents;
                return d.krName ? COLORS.default : '#f1f5f9';
            })
            .attr('stroke', COLORS.stroke)
            .attr('stroke-width', 0.8)
            .style('cursor', d => d.krName ? 'pointer' : 'default')
            .on('mouseenter', function (event, d) {
                if (!d.krName) return;
                if (d.krName !== state.selectedSigungu) {
                    d3.select(this).attr('fill', COLORS.hover).attr('stroke', COLORS.strokeHover);
                }
            })
            .on('mouseleave', function (event, d) {
                if (!d.krName) return;
                const fill = d.krName === state.selectedSigungu
                    ? COLORS.selected
                    : (state.getSigunguCount(sidoKr, d.krName) > 0 ? COLORS.hasStudents : COLORS.default);
                d3.select(this).attr('fill', fill).attr('stroke', COLORS.stroke);
            })
            .on('click', (event, d) => {
                if (!d.krName) return;
                if (state.selectedSigungu === d.krName) setSelection(sidoKr, '');
                else setSelection(sidoKr, d.krName);
            });

        g.selectAll('text.korea-d3-label-sm')
            .data(enriched.filter(d => d.krName))
            .join('text')
            .attr('class', 'korea-d3-label-sm')
            .attr('transform', d => {
                const c = path.centroid(d);
                return `translate(${c[0]},${c[1]})`;
            })
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', d => d.krName === state.selectedSigungu ? COLORS.labelSelected : COLORS.label)
            .attr('pointer-events', 'none')
            .style('font-size', '9px')
            .style('font-weight', '700')
            .text(d => {
                const cnt = state.getSigunguCount(sidoKr, d.krName);
                return cnt ? `${d.krName}(${cnt})` : d.krName;
            });
    }

    function drawMap() {
        const host = state.container?.querySelector('#koreaD3MapHost');
        if (!host || !state.ready) return;
        if (state.selectedSido) drawSigunguMap(host);
        else drawSidoMap(host);
    }

    function render() {
        if (!state.container) return;
        renderShell();
        drawMap();
    }

    function setSelection(sido, sigungu, silent) {
        state.selectedSido = sido || '';
        state.selectedSigungu = sigungu || '';
        render();
        if (!silent && typeof state.onSelect === 'function') {
            state.onSelect(state.selectedSido, state.selectedSigungu);
        }
    }

    function syncFromFilter(sido, sigungu) {
        const nextSido = sido || '';
        const nextSigungu = sigungu || '';
        if (state.selectedSido === nextSido && state.selectedSigungu === nextSigungu) return;
        state.selectedSido = nextSido;
        state.selectedSigungu = nextSigungu;
        render();
    }

    async function init(options) {
        state.container = typeof options.container === 'string'
            ? document.getElementById(options.container)
            : options.container;
        if (!state.container) return;

        state.getSidoCount = options.getSidoCount || (() => 0);
        state.getSigunguCount = options.getSigunguCount || (() => 0);
        state.onSelect = options.onSelect || null;

        if (!ensureD3()) {
            state.container.innerHTML = '<div class="main-view-hint">지도 라이브러리(D3.js)를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</div>';
            return;
        }

        state.container.innerHTML = '<div class="main-view-hint">지도를 불러오는 중...</div>';

        try {
            await loadMapData();
            state.ready = true;
            if (options.initialSido != null) {
                state.selectedSido = options.initialSido;
                state.selectedSigungu = options.initialSigungu || '';
            }
            render();
        } catch (e) {
            console.error(e);
            state.container.innerHTML = '<div class="main-view-hint">지도 데이터를 불러오지 못했습니다.</div>';
        }
    }

    function refreshCounts() {
        if (!state.ready) return;
        drawMap();
    }

    global.KoreaMapPicker = {
        init,
        syncFromFilter,
        refreshCounts,
        setSelection
    };
})(typeof window !== 'undefined' ? window : globalThis);
