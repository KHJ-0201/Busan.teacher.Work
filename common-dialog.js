/**
 * common-dialog.js — PC·태블릿: 통합 디자인 안내창 / 모바일(768px 이하): 시스템 alert·confirm·prompt
 */
(function (global) {
    'use strict';

    var MOBILE_MAX = 768;
    var nativeAlert = global.alert.bind(global);
    var nativeConfirm = global.confirm.bind(global);
    var nativePrompt = global.prompt.bind(global);

    function isMobileView() {
        return global.innerWidth <= MOBILE_MAX;
    }

    function detectDialogType(message, fallback) {
        if (fallback) return fallback;
        var msg = String(message || '');
        if (/삭제|초기화|위험|복구 불가|❗|⚠️|소멸|영구/.test(msg)) return 'danger';
        if (/✅|완료|성공|저장되었|복사 완료/.test(msg)) return 'success';
        if (/\?$|하시겠습니까|진행하시|동의/.test(msg)) return 'confirm';
        return 'info';
    }

    function detectTitle(type, customTitle) {
        if (customTitle) return customTitle;
        if (type === 'danger') return '주의';
        if (type === 'success') return '완료';
        if (type === 'confirm') return '확인';
        return '안내';
    }

    function detectIcon(type) {
        if (type === 'danger') return '⚠️';
        if (type === 'success') return '✅';
        if (type === 'confirm') return '❓';
        return 'ℹ️';
    }

    var root = null;
    var overlay = null;
    var box = null;
    var iconEl = null;
    var titleEl = null;
    var messageEl = null;
    var inputEl = null;
    var btnCancel = null;
    var btnConfirm = null;
    var resolver = null;
    var mode = 'alert';

    function ensureDialogDom() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'appDialogRoot';
        root.className = 'app-dialog-root';
        root.innerHTML =
            '<div class="app-dialog-overlay"></div>' +
            '<div class="app-dialog-box" role="dialog" aria-modal="true">' +
                '<div class="app-dialog-head">' +
                    '<div class="app-dialog-icon"></div>' +
                    '<h3 class="app-dialog-title"></h3>' +
                '</div>' +
                '<div class="app-dialog-body">' +
                    '<p class="app-dialog-message"></p>' +
                    '<input type="text" class="app-dialog-input" autocomplete="off">' +
                '</div>' +
                '<div class="app-dialog-actions">' +
                    '<button type="button" class="app-dialog-btn app-dialog-btn-cancel">취소</button>' +
                    '<button type="button" class="app-dialog-btn app-dialog-btn-confirm">확인</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(root);

        overlay = root.querySelector('.app-dialog-overlay');
        box = root.querySelector('.app-dialog-box');
        iconEl = root.querySelector('.app-dialog-icon');
        titleEl = root.querySelector('.app-dialog-title');
        messageEl = root.querySelector('.app-dialog-message');
        inputEl = root.querySelector('.app-dialog-input');
        btnCancel = root.querySelector('.app-dialog-btn-cancel');
        btnConfirm = root.querySelector('.app-dialog-btn-confirm');

        overlay.addEventListener('click', function () {
            if (mode === 'alert') closeDialog(null);
            else if (mode === 'confirm') closeDialog(false);
            else if (mode === 'prompt') closeDialog(null);
        });

        btnCancel.addEventListener('click', function () {
            if (mode === 'confirm') closeDialog(false);
            else if (mode === 'prompt') closeDialog(null);
        });

        btnConfirm.addEventListener('click', function () {
            if (mode === 'alert') closeDialog(true);
            else if (mode === 'confirm') closeDialog(true);
            else if (mode === 'prompt') closeDialog(inputEl.value);
        });

        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') btnConfirm.click();
            if (e.key === 'Escape') btnCancel.click();
        });

        document.addEventListener('keydown', function (e) {
            if (!root.classList.contains('is-open')) return;
            if (e.key === 'Escape') {
                if (mode === 'alert') closeDialog(true);
                else if (mode === 'confirm') closeDialog(false);
                else closeDialog(null);
            }
        });
    }

    function openDialog(options) {
        ensureDialogDom();
        mode = options.mode || 'alert';
        var type = detectDialogType(options.message, options.type);
        var title = detectTitle(type, options.title);

        root.className = 'app-dialog-root is-open type-' + type + ' mode-' + mode;
        iconEl.textContent = options.icon || detectIcon(type);
        titleEl.textContent = title;
        messageEl.textContent = String(options.message || '');

        btnConfirm.textContent = options.confirmText || '확인';
        btnCancel.textContent = options.cancelText || '취소';

        if (mode === 'prompt') {
            inputEl.classList.add('is-visible');
            inputEl.value = options.defaultValue != null ? String(options.defaultValue) : '';
            setTimeout(function () { inputEl.focus(); inputEl.select(); }, 50);
        } else {
            inputEl.classList.remove('is-visible');
            inputEl.value = '';
            setTimeout(function () { btnConfirm.focus(); }, 50);
        }

        document.body.style.overflow = 'hidden';
    }

    function closeDialog(result) {
        if (!root) return;
        root.classList.remove('is-open');
        document.body.style.overflow = '';
        if (resolver) {
            var fn = resolver;
            resolver = null;
            fn(result);
        }
    }

    function showDesktopDialog(options) {
        return new Promise(function (resolve) {
            resolver = resolve;
            openDialog(options);
        });
    }

    function normalizeOptions(message, options) {
        if (typeof options === 'string') return { title: options };
        return options || {};
    }

    function appAlert(message, options) {
        options = normalizeOptions(message, options);
        if (isMobileView()) {
            nativeAlert(String(message));
            return Promise.resolve();
        }
        return showDesktopDialog({
            mode: 'alert',
            message: message,
            type: options.type || detectDialogType(message, 'info'),
            title: options.title,
            confirmText: options.confirmText || '확인',
            icon: options.icon
        }).then(function () {});
    }

    function appConfirm(message, options) {
        options = normalizeOptions(message, options);
        if (isMobileView()) {
            return Promise.resolve(nativeConfirm(String(message)));
        }
        return showDesktopDialog({
            mode: 'confirm',
            message: message,
            type: options.type || detectDialogType(message, 'confirm'),
            title: options.title,
            confirmText: options.confirmText || '확인',
            cancelText: options.cancelText || '취소',
            icon: options.icon
        }).then(function (v) { return !!v; });
    }

    function appPrompt(message, defaultValue, options) {
        if (typeof defaultValue === 'object' && defaultValue !== null) {
            options = defaultValue;
            defaultValue = '';
        }
        options = options || {};
        if (isMobileView()) {
            return Promise.resolve(nativePrompt(String(message), defaultValue));
        }
        return showDesktopDialog({
            mode: 'prompt',
            message: message,
            type: options.type || detectDialogType(message, 'danger'),
            title: options.title || '입력 확인',
            defaultValue: defaultValue,
            confirmText: options.confirmText || '확인',
            cancelText: options.cancelText || '취소',
            icon: options.icon || '✏️'
        }).then(function (v) {
            return v === null ? null : String(v);
        });
    }

    global.appAlert = appAlert;
    global.appConfirm = appConfirm;
    global.appPrompt = appPrompt;
    global.isMobileDialogView = isMobileView;

})(window);
