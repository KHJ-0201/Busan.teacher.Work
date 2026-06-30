/**
 * 훈련기준 필수과목 코드 매칭 (공용 Firebase ncsVersions.requiredUnits)
 */
(function (global) {
    'use strict';

    const PART_KEYS = ['electronics', 'engine', 'chassis', 'ev'];
    const PART_LABELS = {
        electronics: '전기',
        engine: '엔진',
        chassis: '섀시',
        ev: '전기차'
    };

    function normalizeNcsCodeKey(codeStr) {
        return String(codeStr || '').replace(/[^0-9]/g, '');
    }

    function extractUnitCodeKeys(unitName, rdCode) {
        const keys = new Set();
        const add = (s) => {
            const n = normalizeNcsCodeKey(s);
            if (n) keys.add(n);
        };
        const unit = String(unitName || '');
        const bracket = unit.match(/\[(.*?)\]/);
        if (bracket) add(bracket[1]);
        const longMatch = unit.match(/[0-9]{8,}_[0-9]+v[0-9]+/i);
        if (longMatch) add(longMatch[0]);
        if (rdCode) {
            const rd = String(rdCode);
            const rdBracket = rd.match(/\[(.*?)\]/);
            if (rdBracket) add(rdBracket[1]);
            else add(rd);
        }
        return keys;
    }

    function formatCodeBracketLabel(code) {
        const raw = String(code || '').trim();
        if (!raw) return '-';
        const bracket = raw.match(/\[(.*?)\]/);
        if (bracket) return bracket[1];
        const digits = normalizeNcsCodeKey(raw);
        if (digits.length >= 8) return digits.slice(0, 12);
        return raw;
    }

    function buildRequiredCodeSetFromVersions(versionsObj) {
        const set = new Set();
        if (!versionsObj) return set;
        Object.values(versionsObj).forEach((v) => {
            const req = v && v.requiredUnits;
            if (!req) return;
            PART_KEYS.forEach((part) => {
                const bucket = req[part];
                if (Array.isArray(bucket)) {
                    bucket.forEach((code) => addCodeToSet(set, code));
                } else if (bucket && typeof bucket === 'object') {
                    Object.keys(bucket).forEach((code) => addCodeToSet(set, code));
                }
            });
        });
        return set;
    }

    function addCodeToSet(set, code) {
        const n = normalizeNcsCodeKey(code);
        if (n) set.add(n);
    }

    function isUnitRequiredByCodeSet(unitName, rdCode, requiredSet) {
        if (!requiredSet || !requiredSet.size) return false;
        const keys = extractUnitCodeKeys(unitName, rdCode);
        for (const k of keys) {
            if (requiredSet.has(k)) return true;
        }
        return false;
    }

    function resolveAutoUnitType(unitName, rdCode, courseType, requiredSet) {
        if (courseType !== 'NCS교과') return '';
        if (!requiredSet || !requiredSet.size) return '';
        return isUnitRequiredByCodeSet(unitName, rdCode, requiredSet)
            ? '필수능력단위'
            : '선택능력단위';
    }

    function applyAutoUnitTypeToCourseList(courses, requiredSet) {
        if (!requiredSet || !requiredSet.size || !Array.isArray(courses)) return;
        courses.forEach((c) => {
            if (c.type !== 'NCS교과') return;
            const auto = resolveAutoUnitType(c.unit, c.rdCode, c.type, requiredSet);
            if (auto) c.unitType = auto;
        });
    }

    global.NcsRequiredUtils = {
        PART_KEYS,
        PART_LABELS,
        normalizeNcsCodeKey,
        extractUnitCodeKeys,
        formatCodeBracketLabel,
        buildRequiredCodeSetFromVersions,
        isUnitRequiredByCodeSet,
        resolveAutoUnitType,
        applyAutoUnitTypeToCourseList
    };
})(typeof window !== 'undefined' ? window : globalThis);
