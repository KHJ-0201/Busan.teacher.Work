/**
 * common-class-db.js — 반·기수(cohort) Firebase 경로 (기존 데이터 레거시 보존)
 *
 * - cohort 없음 / legacy → 기존과 동일: {className}/masterData … (절대 변경하지 않음)
 * - cohort=c_xxx       → 신규만: {className}/c_xxx/masterData …
 */
(function () {
    'use strict';

    var LEGACY = 'legacy';

    function readParams() {
        var p = new URLSearchParams(window.location.search);
        var urlClass = (p.get('class') || '').trim();
        var urlCohort = (p.get('cohort') || '').trim();
        var className;
        var cohort = '';

        // URL에 class가 있으면 cohort는 URL만 따름. cohort 없음 = 현재 운영 반.
        // (localStorage 잔여 selectedCohort를 붙이면 새로고침 시 수료 반으로 되돌아감)
        if (urlClass) {
            className = urlClass;
            cohort = urlCohort;
        } else {
            try {
                className = localStorage.getItem('selectedClass') || window.currentClass || '테스트';
                cohort = urlCohort || localStorage.getItem('selectedCohort') || '';
            } catch (e) {
                className = window.currentClass || '테스트';
                cohort = urlCohort || '';
            }
        }
        return { className: className, cohort: (cohort || '').trim(), urlHasClass: !!urlClass };
    }

    function normalizeCohort(cohort) {
        if (!cohort || cohort === LEGACY) return '';
        return cohort;
    }

    function isLegacyCohortId(cohort) {
        return !normalizeCohort(cohort);
    }

    function getClassDataRoot(className, cohort) {
        var c = normalizeCohort(cohort);
        if (!c) return className;
        return className + '/' + c;
    }

    function syncCohortPreferenceStore(className, cohort) {
        if (!className) return;
        try {
            var prefKey = 'classCohortPref_' + className;
            if (cohort) {
                localStorage.setItem(prefKey, cohort);
            } else {
                localStorage.removeItem(prefKey);
            }
        } catch (e) { /* ignore */ }
    }

    function initClassContext() {
        var q = readParams();
        window.currentClass = q.className;
        window.currentCohort = normalizeCohort(q.cohort);
        window.isLegacyCohortMode = isLegacyCohortId(window.currentCohort);
        window.classDataRoot = getClassDataRoot(window.currentClass, window.currentCohort);

        try {
            localStorage.setItem('selectedClass', window.currentClass);
            if (window.currentCohort) {
                localStorage.setItem('selectedCohort', window.currentCohort);
            } else {
                localStorage.removeItem('selectedCohort');
            }
            if (q.urlHasClass && !window.currentCohort) {
                syncCohortPreferenceStore(window.currentClass, '');
            }
        } catch (e) { /* ignore */ }
        return window.classDataRoot;
    }

    function classDbPath(subPath) {
        if (!window.classDataRoot) initClassContext();
        var root = window.classDataRoot;
        if (!subPath) return root;
        return root + '/' + String(subPath).replace(/^\/+/, '');
    }

    function classDbRef(subPath) {
        var db = typeof firebase !== 'undefined' && firebase.apps.length
            ? firebase.database()
            : null;
        if (!db) throw new Error('Firebase not initialized');
        return db.ref(classDbPath(subPath));
    }

    /** archiveMeta만 (기존 masterData와 분리) */
    function classArchiveMetaRef(subPath) {
        var db = firebase.database();
        var base = window.currentClass + '/archiveMeta';
        var full = subPath ? base + '/' + String(subPath).replace(/^\/+/, '') : base;
        return db.ref(full);
    }

    /** localStorage 키 (기존: defaultViewMode_701반 형식 유지·기수별 분리) */
    function classStorageKey(prefix) {
        if (!window.classDataRoot) initClassContext();
        var id = window.isLegacyCohortMode
            ? window.currentClass
            : (window.currentClass + '__' + window.currentCohort);
        return prefix + '_' + id;
    }

    function classQueryString(extra) {
        if (!window.currentClass) initClassContext();
        var parts = ['class=' + encodeURIComponent(window.currentClass)];
        if (window.currentCohort) {
            parts.push('cohort=' + encodeURIComponent(window.currentCohort));
        }
        if (extra) {
            var s = String(extra).replace(/^\?/, '');
            if (s) parts.push(s);
        }
        return parts.join('&');
    }

    function classNavHref(page, extraQuery) {
        var q = classQueryString(extraQuery);
        return page + (q ? '?' + q : '');
    }

    function classCohortLabel() {
        if (!window.currentCohort) return '현재 운영 반';
        return window.currentCohortLabel || window.currentCohort;
    }

    function formatClassHudText() {
        var base = window.currentClass || '';
        if (window.isLegacyCohortMode) return base;
        return base + ' · ' + classCohortLabel();
    }

    function resolveCohortLabelFromStore() {
        if (!window.currentCohort || window.currentCohortLabel) return;
        try {
            var store = JSON.parse(localStorage.getItem('classCohortLabels_' + window.currentClass) || '{}');
            if (store[window.currentCohort]) window.currentCohortLabel = store[window.currentCohort];
        } catch (e) { /* ignore */ }
    }

    function applyHarnessClassMarquee() {
        var wrap = document.querySelector('.harness-class-marquee-wrap');
        var textEl = document.getElementById('currentClassDisplay');
        if (!wrap || !textEl) return;

        wrap.classList.remove('is-scroll');
        textEl.style.removeProperty('--marquee-shift');
        textEl.style.animation = 'none';
        void textEl.offsetWidth;
        textEl.style.animation = '';

        if (window.innerWidth > 850) return;

        requestAnimationFrame(function () {
            var overflow = textEl.scrollWidth - wrap.clientWidth;
            if (overflow > 4) {
                wrap.classList.add('is-scroll');
                textEl.style.setProperty('--marquee-shift', overflow + 'px');
            }
        });
    }

    function refreshClassHud() {
        var hudText = formatClassHudText();
        var hud = document.getElementById('currentClassDisplay');
        if (hud) hud.innerText = hudText;
        var disp = document.getElementById('dispClass');
        if (disp) disp.innerText = hudText;
        var mobileDisp = document.getElementById('mobileClassDisplay');
        if (mobileDisp) mobileDisp.innerText = hudText;
        applyHarnessClassMarquee();
    }

    function loadCohortLabelFromDb() {
        resolveCohortLabelFromStore();
        refreshClassHud();
        if (!window.currentCohort) return Promise.resolve();
        var db = typeof firebase !== 'undefined' && firebase.apps.length ? firebase.database() : null;
        if (!db) return Promise.resolve();
        return classDbRef('masterData').once('value').then(function (snap) {
            var d = snap.val() || {};
            if (d.label) {
                window.currentCohortLabel = d.label;
                return;
            }
            return classArchiveMetaRef(window.currentCohort + '/label').once('value').then(function (metaSnap) {
                if (metaSnap.val()) window.currentCohortLabel = metaSnap.val();
            });
        }).then(refreshClassHud).catch(function () { refreshClassHud(); });
    }

    /** masterData.courses가 비어 있어도 fullTimetable에서 교과목·능력단위 목록 보강 */
    function hydrateSubjectListsFromTimetable(rawTimetable, masterSubjectList, ncsList) {
        var subjects = new Set(Array.isArray(masterSubjectList) ? masterSubjectList : []);
        var units = new Set(Array.isArray(ncsList) ? ncsList : []);
        (rawTimetable || []).forEach(function (r) {
            var sub = String(r['교과목'] || '').trim();
            var unit = String(r['능력단위'] || '').trim();
            if (sub) subjects.add(sub);
            if (unit) units.add(unit);
        });
        return {
            masterSubjectList: Array.from(subjects),
            ncsList: Array.from(units)
        };
    }

    function normalizeCoursesList(courses) {
        if (!courses) return [];
        return Array.isArray(courses) ? courses : Object.values(courses);
    }

    function normalizeTimetableRows(val) {
        if (!val) return [];
        return Array.isArray(val) ? val : Object.values(val);
    }

    /** KST 기준 오늘 날짜 (YYYY-MM-DD) */
    function getTodayStrKst() {
        var nowKst = new Date();
        var offset = nowKst.getTimezoneOffset() * 60000;
        return new Date(nowKst - offset).toISOString().split('T')[0];
    }

    /** 오늘 17:30(KST) 이후인지 — 이후부터 당일 미등록 출석을 결석으로 집계 */
    function isAfterTodayAttendanceCutoffKst() {
        var now = new Date();
        var offset = now.getTimezoneOffset() * 60000;
        var kst = new Date(now - offset);
        var h = kst.getUTCHours();
        var m = kst.getUTCMinutes();
        return h > 17 || (h === 17 && m >= 30);
    }

    /**
     * 출석부 미등록(!att) 시 결석으로 셀지 여부.
     * 당일 17:30(KST) 이전에는 오늘 날짜는 결석 처리하지 않음.
     */
    function shouldCountMissingAttAsAbsent(dateStr, todayStr) {
        var today = todayStr || getTodayStrKst();
        if (!dateStr || dateStr > today) return false;
        if (dateStr < today) return true;
        return isAfterTodayAttendanceCutoffKst();
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!window.classDataRoot) initClassContext();
        loadCohortLabelFromDb();
        window.addEventListener('resize', function () {
            clearTimeout(window._harnessMarqueeResizeTimer);
            window._harnessMarqueeResizeTimer = setTimeout(applyHarnessClassMarquee, 120);
        });
    });

    window.LEGACY_COHORT = LEGACY;
    window.initClassContext = initClassContext;
    window.isLegacyCohortId = isLegacyCohortId;
    window.getClassDataRoot = getClassDataRoot;
    window.classDbPath = classDbPath;
    window.classDbRef = classDbRef;
    window.classArchiveMetaRef = classArchiveMetaRef;
    window.classStorageKey = classStorageKey;
    window.classQueryString = classQueryString;
    window.classNavHref = classNavHref;
    window.classCohortLabel = classCohortLabel;
    window.formatClassHudText = formatClassHudText;
    window.resolveCohortLabelFromStore = resolveCohortLabelFromStore;
    window.applyHarnessClassMarquee = applyHarnessClassMarquee;
    window.refreshClassHud = refreshClassHud;
    window.loadCohortLabelFromDb = loadCohortLabelFromDb;
    window.hydrateSubjectListsFromTimetable = hydrateSubjectListsFromTimetable;
    window.normalizeTimetableRows = normalizeTimetableRows;
    window.normalizeCoursesList = normalizeCoursesList;
    window.getTodayStrKst = getTodayStrKst;
    window.isAfterTodayAttendanceCutoffKst = isAfterTodayAttendanceCutoffKst;
    window.shouldCountMissingAttAsAbsent = shouldCountMissingAttAsAbsent;
})();

