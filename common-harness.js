/**
 * common-harness.js — 상단 하네스 PC 보조 (여백·툴팁·현재 페이지 표시)
 */
(function () {
    'use strict';

    var MOBILE_MAX = 768;
    var EXTRA_GAP = 10;

    var HARNESS_PAGE_TIPS = [
        { match: '일일출석부.html', tip: '매일 출석부 등록. 중도탈락 및 조기수료 처리.' },
        { match: '능력단위시간표.html', tip: '과목당 능력단위 출석부 확인 및 인쇄. 시간표 달력. 주차별 편성시간 확인. 보강수업 등록.' },
        { match: '단위개월출석부.html', tip: '단위개월 출석률 확인. 70%, 80% 도달 확인.' },
        { match: '평가계획서.html', tip: '평가계획서, 사전능력평가 일정 등 엑셀 출력.' },
        { match: '평가지.html', tip: '평가지 등록, 평가서류 작성 및 PDF 출력.' },
        { match: '상담일지.html', tip: '단위개월 별 학생 상담일지 등록. 학생 이력서 확인 및 취업 관리.' }
    ];

    function getHarnessTip(onclick) {
        if (!onclick) return '';
        for (var i = 0; i < HARNESS_PAGE_TIPS.length; i++) {
            if (onclick.indexOf(HARNESS_PAGE_TIPS[i].match) !== -1) {
                return HARNESS_PAGE_TIPS[i].tip;
            }
        }
        return '';
    }

    function unwrapHarnessNavTips() {
        var wraps = document.querySelectorAll('#navButtonBank .harness-nav-wrap');
        wraps.forEach(function (wrap) {
            var btn = wrap.querySelector('.nav-btn-global');
            if (btn && wrap.parentNode) {
                wrap.parentNode.insertBefore(btn, wrap);
            }
            wrap.remove();
        });
    }

    function setupHarnessNavTips() {
        var bank = document.getElementById('navButtonBank');
        if (!bank) return;

        if (window.innerWidth <= MOBILE_MAX) {
            unwrapHarnessNavTips();
            return;
        }

        bank.querySelectorAll('.nav-btn-global').forEach(function (btn) {
            if (btn.parentElement && btn.parentElement.classList.contains('harness-nav-wrap')) {
                return;
            }

            var tipText = getHarnessTip(btn.getAttribute('onclick') || '');
            if (!tipText) return;

            var wrap = document.createElement('span');
            wrap.className = 'harness-nav-wrap';

            var tip = document.createElement('span');
            tip.className = 'harness-nav-tip';
            tip.textContent = tipText;

            btn.parentNode.insertBefore(wrap, btn);
            wrap.appendChild(btn);
            wrap.appendChild(tip);
        });
    }

    function markCurrentNavButton() {
        var currentFileName = decodeURIComponent(window.location.pathname.split('/').pop()) || '';
        var isAbilityEvalGroup = currentFileName === '보강수업.html' || currentFileName === '능력단위시간표.html';
        var isConsultResumeGroup = currentFileName === '상담일지.html' || currentFileName === '학생이력서확인.html';

        document.querySelectorAll('#navButtonBank .nav-btn-global').forEach(function (btn) {
            var action = btn.getAttribute('onclick') || '';
            var isCurrent = action.indexOf(currentFileName) !== -1;
            if (!isCurrent && isAbilityEvalGroup && action.indexOf('능력단위시간표.html') !== -1) {
                isCurrent = true;
            }
            if (!isCurrent && isConsultResumeGroup && action.indexOf('상담일지.html') !== -1) {
                isCurrent = true;
            }

            if (isCurrent) {
                btn.classList.add('is-current-nav');
            } else {
                btn.classList.remove('is-current-nav');
                btn.style.border = '';
                btn.style.boxShadow = '';
                btn.style.transform = '';
                btn.style.fontWeight = '';
                btn.style.filter = '';
                btn.style.opacity = '';
            }
        });
    }

    function syncHarnessBodyOffset() {
        var harness = document.getElementById('globalMainHarness');
        if (!harness) return;

        if (window.innerWidth <= MOBILE_MAX) {
            document.documentElement.style.removeProperty('--harness-offset');
            return;
        }

        var height = Math.ceil(harness.getBoundingClientRect().height);
        if (height <= 0) return;

        var offset = height + EXTRA_GAP;
        document.body.style.setProperty('padding-top', offset + 'px', 'important');
        document.documentElement.style.setProperty('--harness-offset', offset + 'px');
    }

    function onHarnessLayoutChange() {
        setupHarnessNavTips();
        markCurrentNavButton();
        syncHarnessBodyOffset();
    }

    function init() {
        onHarnessLayoutChange();
        window.addEventListener('resize', onHarnessLayoutChange);

        var harness = document.getElementById('globalMainHarness');
        if (harness && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(syncHarnessBodyOffset).observe(harness);
        }

        window.addEventListener('load', onHarnessLayoutChange);
        setTimeout(onHarnessLayoutChange, 50);
        setTimeout(onHarnessLayoutChange, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
