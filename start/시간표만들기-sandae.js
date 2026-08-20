/**
 * 산대특 전용 HWPX(한글) RD 파서
 * 교과편성연계표 등 표에서 소양/NCS/비NCS 데이터를 추출합니다.
 */
(function (global) {
    'use strict';

    const NCS_CODE_RE = /(\d{10}_\d+v\d+)/;
    const HOUR_RE = /(\d+)\s*H/i;
    const SUBSECTION_RE = /['\u2018\u2019\u300C\u300D\u300E\u300F「『]([^\u2018\u2019\u300C\u300D\u300E\u300F''」』]+)['\u2018\u2019\u300C\u300D\u300E\u300F''」』]/;

    function getCellText(tcXml) {
        return [...tcXml.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)]
            .map(function (m) { return m[1]; })
            .join('')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseTableXml(tblXml) {
        return [...tblXml.matchAll(/<hp:tr[^>]*>([\s\S]*?)<\/hp:tr>/g)].map(function (row) {
            return [...row[1].matchAll(/<hp:tc[^>]*>([\s\S]*?)<\/hp:tc>/g)].map(function (c) {
                return getCellText(c[1]);
            });
        });
    }

    function parseAllTables(sectionXml) {
        return [...sectionXml.matchAll(/<hp:tbl[^>]*>([\s\S]*?)<\/hp:tbl>/g)].map(function (m) {
            return parseTableXml(m[0]);
        });
    }

    function splitNcsCell(cell) {
        const text = String(cell || '').trim();
        const m = text.match(NCS_CODE_RE);
        if (!m) return { code: '', unit: text };
        return { code: m[1], unit: text.replace(m[1], '').trim() };
    }

    function parseHour(cell) {
        const m = String(cell || '').match(HOUR_RE);
        return m ? parseInt(m[1], 10) : 0;
    }

    function isSkipRow(joined) {
        if (!joined) return true;
        if (joined.includes('총 훈련시간')) return true;
        if (joined.includes('장비(NCS') || joined.includes('재료(NCS')) return true;
        if (/^멀티테스터|^절연공구|^안전보호구|^교환부품|^절연 시설|^상비약|^해당없음/.test(joined)) return true;
        return false;
    }

    function isSubsectionRow(joined) {
        return joined.startsWith('↳');
    }

    function extractSubsectionName(joined) {
        const m = joined.match(SUBSECTION_RE);
        return m ? m[1].trim() : '';
    }

    function extractSubsectionTotalHour(joined) {
        const m = String(joined || '').match(/=\s*(\d+)\s*H/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    function distributeHoursEvenly(totalHour, count) {
        if (count <= 0) return [];
        const total = Math.max(0, Math.round(totalHour));
        const base = Math.floor(total / count);
        let remainder = total - base * count;
        const hours = [];
        for (let i = 0; i < count; i++) {
            hours.push(base + (remainder > 0 ? 1 : 0));
            if (remainder > 0) remainder--;
        }
        return hours;
    }

    /** 능력단위 요소 시간을 단위 총시간에 맞게 4시간 단위로 분배 */
    function distributeElementHours(unitTotalHour, elements) {
        const list = elements || [];
        const N = list.length;
        if (!N) return list;

        const targetHour = Math.max(0, Math.round(unitTotalHour || 0));
        const q = Math.floor(targetHour / 4);
        const r = targetHour % 4;
        const baseChunks = Math.floor(q / N);
        const extraChunks = q % N;

        return list.map(function (el, index) {
            const copy = Object.assign({}, el);
            let val = baseChunks * 4;
            if (index < extraChunks) val += 4;
            if (index === N - 1) val += r;
            copy.allocatedHour = val;
            return copy;
        });
    }

    /** 한글 RD 원본에서 세분류별 모듈형(선택) 과목에 실제 표기된 시간 합계 */
    function getSubsectionElectiveBudgetFromFull(fullNcsItems, subsection) {
        return (fullNcsItems || [])
            .filter(function (item) {
                return (item.subsection || '') === subsection && item.reqType === '선택';
            })
            .reduce(function (sum, item) { return sum + (item.hour || 0); }, 0);
    }

    /**
     * 엑셀 필터 후:
     * - 필수 = 한글 RD 시간 유지
     * - 모듈형 선택 = 한글 RD에 표기된 선택 과목 시간 합을 엑셀 선택 수로 균등 분배 (총시간 불증)
     */
    function distributeModuleElectiveHours(ncsItems, fullNcsItems) {
        const groups = {};
        (ncsItems || []).forEach(function (item) {
            const key = item.subsection || '_default';
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        Object.keys(groups).forEach(function (key) {
            const group = groups[key];
            const requiredItems = group.filter(function (item) { return item.reqType === '필수'; });
            const electiveItems = group.filter(function (item) { return item.reqType === '선택'; });
            if (!electiveItems.length) return;

            requiredItems.forEach(function (item) {
                item.rdHour = item.rdHour != null ? item.rdHour : (item.hour || 0);
            });

            const moduleBudget = getSubsectionElectiveBudgetFromFull(fullNcsItems, key);
            if (moduleBudget <= 0) return;

            const distributed = distributeHoursEvenly(moduleBudget, electiveItems.length);

            electiveItems.forEach(function (item, idx) {
                item.hour = distributed[idx] || 0;
                item.hourDistributed = true;
            });
        });

        return ncsItems;
    }

    function padRow(row, len) {
        const cells = row.slice();
        while (cells.length < len) cells.push('');
        return cells;
    }

    function findNcsInRow(cells) {
        for (let i = 0; i < cells.length; i++) {
            if (NCS_CODE_RE.test(cells[i])) {
                return { index: i, parsed: splitNcsCell(cells[i]) };
            }
        }
        return null;
    }

    function pickSubjectFromRow(cells, ncsIndex, fallback) {
        return pickCourseName(cells, ncsIndex) || fallback;
    }

    function pickHourFromRow(cells, ncsIndex) {
        for (let i = ncsIndex + 1; i < cells.length; i++) {
            const h = parseHour(cells[i]);
            if (h > 0) return h;
        }
        for (let i = 0; i < cells.length; i++) {
            const h = parseHour(cells[i]);
            if (h > 0) return h;
        }
        return 0;
    }

    function pickCourseName(cells, ncsIndex) {
        if (ncsIndex > 0) {
            const candidate = cells[ncsIndex - 1];
            if (candidate && !NCS_CODE_RE.test(candidate) && candidate.length > 1
                && candidate !== '필수' && !candidate.includes('모듈형') && candidate !== '선택') {
                return candidate;
            }
        }
        for (let i = 0; i < ncsIndex; i++) {
            const c = cells[i];
            if (c && !NCS_CODE_RE.test(c) && c !== '필수' && !c.includes('모듈형') && c !== '선택' && c.length > 2) {
                return c;
            }
        }
        return '';
    }

    function extractRequiredType(cells, joined, prevType) {
        const c0 = String(cells[0] || '').trim();
        const compact = (c0 + String(cells[1] || '') + joined).replace(/\s/g, '');
        if (c0 === '필수' || c0.startsWith('필수')) return '필수';
        if (c0.includes('모듈형') || c0.includes('선택')) return '선택';
        if (compact.includes('모듈형선택') || compact.includes('모듈형선택')) return '선택';
        if (joined.includes('모듈형') && joined.includes('선택')) return '선택';
        return prevType || '';
    }

    function parseNcsLinkageTable(rows, defaultSubject) {
        const items = [];
        const pending = [];
        let nextSubsection = defaultSubject || 'NCS 전공교과';
        let currentReqType = '';

        let beforeFirstSubsection = true;

        function flushPending(subsectionName, subsectionTotalHour) {
            const sub = subsectionName || nextSubsection;
            pending.forEach(function (item) {
                item.subsection = sub;
                item.subject = sub;
                if (subsectionTotalHour > 0) item.subsectionTotalHour = subsectionTotalHour;
                if (item.reqType === '필수') item.rdHour = item.hour || 0;
                items.push(item);
            });
            pending.length = 0;
            if (subsectionName) nextSubsection = subsectionName;
        }

        for (let i = 1; i < rows.length; i++) {
            const cells = padRow(rows[i], 8);
            const joined = cells.join(' ');
            if (isSkipRow(joined)) break;
            if (isSubsectionRow(joined)) {
                beforeFirstSubsection = false;
                flushPending(
                    extractSubsectionName(joined) || nextSubsection,
                    extractSubsectionTotalHour(joined)
                );
                currentReqType = '';
                continue;
            }

            currentReqType = extractRequiredType(cells, joined, currentReqType);

            const hit = findNcsInRow(cells);
            if (!hit || !hit.parsed.code) continue;

            const hour = pickHourFromRow(cells, hit.index);
            const item = {
                courseName: pickCourseName(cells, hit.index),
                reqType: currentReqType,
                unit: hit.parsed.unit || hit.parsed.code,
                hour: hour,
                rdHour: currentReqType === '필수' ? hour : undefined,
                rdCode: hit.parsed.code,
                elements: []
            };

            if (currentReqType === '필수' && beforeFirstSubsection) {
                const sub = defaultSubject || 'NCS 전공교과';
                item.subsection = sub;
                item.subject = sub;
                items.push(item);
                continue;
            }

            pending.push(item);
        }
        flushPending(nextSubsection);
        return items;
    }

    function parseParenHour(text) {
        const m = String(text || '').match(/\((\d+)\s*H\)/i);
        return m ? parseInt(m[1], 10) : 0;
    }

    function parseTheoryTable(rows) {
        const basicItems = [];
        const nonNcsItems = [];

        for (let i = 1; i < rows.length; i++) {
            const cells = padRow(rows[i], 5);
            const joined = cells.join(' ');
            if (joined.includes('총 훈련시간')) break;

            if (cells[0] === '직업기초능력' || joined.includes('직업기초능력')) {
                const unitCell = cells[1] || cells[0];
                const h = parseParenHour(unitCell) || 4;
                basicItems.push({
                    subject: 'NCS 소양교과',
                    unit: unitCell.replace(/\(\d+\s*H\)/gi, '').trim(),
                    hour: h,
                    elements: []
                });
                continue;
            }

            if (parseParenHour(cells[0]) > 0 && !cells[0].includes('직업')) {
                basicItems.push({
                    subject: 'NCS 소양교과',
                    unit: cells[0].replace(/\(\d+\s*H\)/gi, '').trim(),
                    hour: parseParenHour(cells[0]),
                    elements: []
                });
                continue;
            }

            const blockHour = parseHour(cells[4]) || parseHour(cells[3]);
            if (blockHour > 0 && (joined.includes('개론') || cells[1].includes('개론'))) {
                nonNcsItems.push({
                    subject: '비 NCS 교과 (이론)',
                    unit: (cells[1] || cells[2] || '이론개론').trim(),
                    detail: (cells[3] || cells[2] || '').trim(),
                    hour: blockHour,
                    elements: []
                });
            }
        }
        return { basic: basicItems, nonNcs: nonNcsItems };
    }

    function parseEvNcsTable(rows) {
        const ncs = [];
        const nonNcs = [];
        const basic = [];
        const pending = [];
        let nextSubsection = '전기자동차정비';
        let currentReqType = '';

        let beforeFirstSubsection = true;

        function flushPending(subsectionName, subsectionTotalHour) {
            const sub = subsectionName || nextSubsection;
            pending.forEach(function (item) {
                item.subsection = sub;
                item.subject = sub;
                if (subsectionTotalHour > 0) item.subsectionTotalHour = subsectionTotalHour;
                if (item.reqType === '필수') item.rdHour = item.hour || 0;
                ncs.push(item);
            });
            pending.length = 0;
            if (subsectionName) nextSubsection = subsectionName;
        }

        for (let i = 1; i < rows.length; i++) {
            const cells = padRow(rows[i], 8);
            const joined = cells.join(' ');
            if (joined.includes('총 훈련시간')) break;
            if (isSkipRow(joined)) continue;

            if (isSubsectionRow(joined)) {
                beforeFirstSubsection = false;
                flushPending(
                    extractSubsectionName(joined) || nextSubsection,
                    extractSubsectionTotalHour(joined)
                );
                currentReqType = '';
                continue;
            }

            currentReqType = extractRequiredType(cells, joined, currentReqType);

            if (joined.includes('재량교과') || (cells[0] && cells[0].includes('재량'))) {
                const hour = pickHourFromRow(cells, 0) || parseHour(cells[2]) || parseHour(cells[1]);
                if (hour > 0) {
                    nonNcs.push({
                        subject: '재량교과',
                        unit: (cells[1] || '재량교과').trim(),
                        detail: (cells[2] || '').trim(),
                        hour: hour,
                        elements: []
                    });
                }
                continue;
            }

            const hit = findNcsInRow(cells);
            if (hit && hit.parsed.code) {
                const hour = pickHourFromRow(cells, hit.index);
                const item = {
                    courseName: pickCourseName(cells, hit.index),
                    reqType: currentReqType,
                    unit: hit.parsed.unit || hit.parsed.code,
                    hour: hour,
                    rdHour: currentReqType === '필수' ? hour : undefined,
                    rdCode: hit.parsed.code,
                    elements: []
                };

                if (currentReqType === '필수' && beforeFirstSubsection) {
                    item.subsection = nextSubsection;
                    item.subject = nextSubsection;
                    ncs.push(item);
                    continue;
                }

                pending.push(item);
                continue;
            }

            if (joined.includes('非NCS') || joined.includes('非 NCS')) {
                const subject = '비 NCS 교과 (이론)';
                const unit = (cells[0] && /^Chap\./i.test(cells[0]) ? cells[0] : (cells[1] || cells[0] || '전기자동차 개론')).trim();
                const detail = (cells[1] && cells[1].includes('非NCS') ? cells[1] : cells[2] || '').trim();
                const hour = pickHourFromRow(cells, 0);
                if (hour > 0) {
                    nonNcs.push({ subject: subject, unit: unit, detail: detail, hour: hour, elements: [] });
                }
            }
        }
        flushPending(nextSubsection);
        return { ncs: ncs, nonNcs: nonNcs, basic: basic };
    }

    function classifyTables(tables) {
        let linkageTables = [];
        let theoryTable = null;
        let evTable = null;

        tables.forEach(function (rows) {
            if (!rows.length) return;
            const header = rows[0].join(' ');
            if (header.includes('NCS 능력단위') && header.includes('내부평가방법')) {
                linkageTables.push(rows);
            } else if (header.includes('편성시간') && header.includes('세부내용')) {
                theoryTable = rows;
            }
        });

        if (linkageTables.length >= 2) {
            evTable = linkageTables[linkageTables.length - 1];
            linkageTables = linkageTables.slice(0, -1);
        } else if (linkageTables.length === 1) {
            const sample = linkageTables[0].slice(1, 6).join(' ');
            if (sample.includes('15060307')) evTable = linkageTables[0];
        }

        return { linkageTables: linkageTables, theoryTable: theoryTable, evTable: evTable };
    }

    function attachNcsElements(items, ncsMasterDB) {
        if (!ncsMasterDB) return items;
        return items.map(function (item) {
            if (!item.rdCode) return item;
            let matched = ncsMasterDB[item.rdCode];
            if (!matched) {
                const prefix10 = item.rdCode.substring(0, 10);
                const alt = Object.keys(ncsMasterDB).find(function (key) {
                    return key.startsWith(prefix10);
                });
                if (alt) matched = ncsMasterDB[alt];
            }
            if (matched && matched.elements) {
                item.elements = JSON.parse(JSON.stringify(matched.elements || []));
            }
            return item;
        });
    }

    function parseSandaeHwpxSectionXml(sectionXml, ncsMasterDB) {
        const tables = parseAllTables(sectionXml);
        const classified = classifyTables(tables);

        let ncs = [];
        classified.linkageTables.forEach(function (rows) {
            ncs = ncs.concat(parseNcsLinkageTable(rows, '자동차정비산업기사'));
        });

        let basic = [];
        let nonNcs = [];

        if (classified.theoryTable) {
            const theoryItems = parseTheoryTable(classified.theoryTable);
            basic = basic.concat(theoryItems.basic);
            nonNcs = nonNcs.concat(theoryItems.nonNcs);
        }

        if (classified.evTable) {
            const ev = parseEvNcsTable(classified.evTable);
            ncs = ncs.concat(ev.ncs);
            nonNcs = nonNcs.concat(ev.nonNcs);
            basic = basic.concat(ev.basic);
        }

        ncs = attachNcsElements(ncs, ncsMasterDB);

        const totals = {
            basic: basic.reduce(function (s, x) { return s + x.hour; }, 0),
            ncs: ncs.reduce(function (s, x) { return s + x.hour; }, 0),
            nonNcs: nonNcs.reduce(function (s, x) { return s + x.hour; }, 0),
            sum: 0
        };
        totals.sum = totals.basic + totals.ncs + totals.nonNcs;

        return {
            basic: basic,
            ncs: ncs,
            nonNcs: nonNcs,
            totals: totals
        };
    }

    function calcSandaeTotals(data) {
        const basic = (data.basic || []).reduce(function (s, x) { return s + (x.hour || 0); }, 0);
        const ncs = (data.ncs || []).reduce(function (s, x) { return s + (x.hour || 0); }, 0);
        const nonNcs = (data.nonNcs || []).reduce(function (s, x) { return s + (x.hour || 0); }, 0);
        return { basic: basic, ncs: ncs, nonNcs: nonNcs, sum: basic + ncs + nonNcs };
    }

    function normalizeSandaeMatchKey(name) {
        return String(name || '')
            .replace(/\(필기\)|\(실기\)/gi, '')
            .replace(/\s+/g, '')
            .replace(/[·．.\-_:]/g, '')
            .toLowerCase();
    }

    function sandaeItemMatchesCourse(item, excelCourses) {
        const itemKeys = [item.unit, item.courseName, item.detail]
            .filter(Boolean)
            .map(normalizeSandaeMatchKey)
            .filter(function (k) { return k.length > 1; });
        if (!itemKeys.length) return false;
        return excelCourses.some(function (courseName) {
            const ek = normalizeSandaeMatchKey(courseName);
            if (!ek || ek.length < 2) return false;
            if (ek.includes('재량') && String(item.subject || '').includes('재량')) return true;
            return itemKeys.some(function (ik) {
                return ik === ek || ik.includes(ek) || ek.includes(ik);
            });
        });
    }

    /** 편성 엑셀 교과목명 목록에서의 순서 (없으면 큰 값) */
    function getSandaeExcelCourseIndex(item, excelCourses) {
        const courses = excelCourses || [];
        for (let i = 0; i < courses.length; i++) {
            if (sandaeItemMatchesCourse(item, [courses[i]])) return i;
        }
        return 9999;
    }

    /** 편성 엑셀 과목명 순서 → 없으면 과목명(가나다) 순 */
    function sortSandaeItemsByCourseName(items, excelCourses) {
        const courses = excelCourses || [];
        return (items || []).slice().sort(function (a, b) {
            const ia = getSandaeExcelCourseIndex(a, courses);
            const ib = getSandaeExcelCourseIndex(b, courses);
            if (ia !== ib) return ia - ib;
            const nameA = String(a.courseName || a.unit || a.subject || '');
            const nameB = String(b.courseName || b.unit || b.subject || '');
            return nameA.localeCompare(nameB, 'ko');
        });
    }

    /** 시간표 엑셀 교과목명 칸에 넣을 과목명 (편성 엑셀명 우선) */
    function resolveSandaeExportSubject(item, excelCourses) {
        const courses = excelCourses || [];
        for (let i = 0; i < courses.length; i++) {
            if (sandaeItemMatchesCourse(item, [courses[i]])) return courses[i];
        }
        return item.courseName || item.subject || item.unit || '';
    }

    function parseSandaeRdExcelRows(rows) {
        const courses = [];
        const stopNames = { '훈련교사': 1, '훈련교과목': 1, '연번': 1, '교과목명': 1 };

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] || [];
            const texts = row.map(function (c) { return String(c || '').trim(); });
            if (!texts.some(function (t) { return t === '교과목명'; })) continue;

            for (let j = i + 1; j < rows.length; j++) {
                const next = rows[j] || [];
                const name = String(next[2] || next[1] || next[0] || '').trim();
                if (!name) continue;
                if (stopNames[name] || name.includes('출력일자')) break;
                if (/^\d+$/.test(name)) continue;
                courses.push(name);
            }
        }
        return courses.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
    }

    function parseSandaeRdExcelWorkbook(workbook) {
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
        return parseSandaeRdExcelRows(rows);
    }

    function filterSandaeRdByExcelCourses(fullData, excelCourses) {
        const courses = excelCourses || [];
        if (!courses.length) {
            const data = {
                basic: sortSandaeItemsByCourseName((fullData.basic || []).filter(function (x) { return (x.hour || 0) > 0; }), []),
                ncs: sortSandaeItemsByCourseName((fullData.ncs || []).filter(function (x) { return (x.hour || 0) > 0; }), []),
                nonNcs: sortSandaeItemsByCourseName((fullData.nonNcs || []).filter(function (x) { return (x.hour || 0) > 0; }), [])
            };
            return {
                data: data,
                totals: calcSandaeTotals(data),
                matchedCount: data.basic.length + data.ncs.length + data.nonNcs.length,
                unmatchedExcel: [],
                unmatchedRd: []
            };
        }

        const filterList = function (items) {
            return (items || []).filter(function (item) { return sandaeItemMatchesCourse(item, courses); });
        };
        const data = {
            basic: filterList(fullData.basic),
            ncs: filterList(fullData.ncs),
            nonNcs: filterList(fullData.nonNcs)
        };
        data.ncs = distributeModuleElectiveHours(
            data.ncs.map(function (item) { return Object.assign({}, item); }),
            fullData.ncs || []
        );
        data.basic = sortSandaeItemsByCourseName(data.basic, courses);
        data.ncs = sortSandaeItemsByCourseName(data.ncs, courses);
        data.nonNcs = sortSandaeItemsByCourseName(data.nonNcs, courses);
        const moduleDistributedCount = data.ncs.filter(function (item) { return item.hourDistributed; }).length;
        const matchedItems = [].concat(data.basic, data.ncs, data.nonNcs);
        const unmatchedExcel = courses.filter(function (courseName) {
            return !matchedItems.some(function (item) {
                return sandaeItemMatchesCourse(item, [courseName]);
            });
        });
        const allRd = [].concat(fullData.basic || [], fullData.ncs || [], fullData.nonNcs || []);
        const unmatchedRd = allRd.filter(function (item) {
            return !sandaeItemMatchesCourse(item, courses) && (item.hour || 0) > 0;
        }).map(function (item) { return item.unit || item.courseName; });

        return {
            data: data,
            totals: calcSandaeTotals(data),
            matchedCount: data.basic.length + data.ncs.length + data.nonNcs.length,
            moduleDistributedCount: moduleDistributedCount,
            unmatchedExcel: unmatchedExcel,
            unmatchedRd: unmatchedRd.filter(function (v, i, a) { return a.indexOf(v) === i; })
        };
    }

    async function parseSandaeRdExcelFile(file) {
        if (!file) throw new Error('엑셀 파일이 없습니다.');
        if (typeof XLSX === 'undefined') throw new Error('XLSX 라이브러리가 로드되지 않았습니다.');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const courses = parseSandaeRdExcelWorkbook(workbook);
        if (!courses.length) throw new Error('엑셀에서 훈련교과목(교과목명) 목록을 찾지 못했습니다.');
        return courses;
    }

    async function parseSandaeHwpxFile(file, ncsMasterDB) {
        if (!file) throw new Error('파일이 없습니다.');
        const name = (file.name || '').toLowerCase();
        if (!name.endsWith('.hwpx')) {
            throw new Error('산대특 전용은 .hwpx 파일만 지원합니다. (구형 .hwp는 한글에서 hwpx로 저장해 주세요.)');
        }
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
        }

        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);
        const sectionFile = zip.file('Contents/section0.xml');
        if (!sectionFile) {
            throw new Error('HWPX 본문(section0.xml)을 찾을 수 없습니다.');
        }
        const sectionXml = await sectionFile.async('string');
        return parseSandaeHwpxSectionXml(sectionXml, ncsMasterDB);
    }

    global.SandaeHwpxParser = {
        parseSandaeHwpxFile: parseSandaeHwpxFile,
        parseSandaeHwpxSectionXml: parseSandaeHwpxSectionXml,
        parseSandaeRdExcelFile: parseSandaeRdExcelFile,
        parseSandaeRdExcelRows: parseSandaeRdExcelRows,
        filterSandaeRdByExcelCourses: filterSandaeRdByExcelCourses,
        getSubsectionElectiveBudgetFromFull: getSubsectionElectiveBudgetFromFull,
        distributeModuleElectiveHours: distributeModuleElectiveHours,
        distributeElementHours: distributeElementHours,
        calcSandaeTotals: calcSandaeTotals,
        normalizeSandaeMatchKey: normalizeSandaeMatchKey,
        sandaeItemMatchesCourse: sandaeItemMatchesCourse,
        getSandaeExcelCourseIndex: getSandaeExcelCourseIndex,
        sortSandaeItemsByCourseName: sortSandaeItemsByCourseName,
        resolveSandaeExportSubject: resolveSandaeExportSubject
    };
})(typeof window !== 'undefined' ? window : globalThis);
