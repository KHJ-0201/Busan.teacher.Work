/**
 * 연락처 vCard 테스트 페이지
 * 엑셀 → 이름·나이·전화 추출 → 행 클릭 시 .vcf 다운로드(모바일 연락처 추가)
 */

let students = [];
let masterDatabase = null;
let masterAuth = null;
let firebaseReady = false;
let currentClassName = '';

const MASTER_APP_NAME = 'masterApp';
const AUTH_EMAIL = 'ghlwns0201@naver.com';

const MASTER_CONFIG = {
    apiKey: 'AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU',
    authDomain: 'busan-teacher-workall.firebaseapp.com',
    databaseURL: 'https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'busan-teacher-workall'
};
const FB_CONTACTS_PATH = 'studentContacts';

/** 엑셀 고정 열: 번호(A) · 이름(B) · 주민번호(C) · 전화(D) — 시작 위치는 시트마다 달라질 수 있음 */
const COL_OFFSET_NUM = 0;
const COL_OFFSET_NAME = 1;
const COL_OFFSET_RRN = 2;
const COL_OFFSET_PHONE = 3;

const VCARD_ORG = '과평 훈련생';
const VCARD_GROUP_PREFIX = '훈련생'; // 연락처 그룹/메모에 쓸 접두어

document.addEventListener('DOMContentLoaded', () => {
    setupClassContext();
    initFirebaseAndLoadClasses();
    initGuideImageLightbox();
    syncGuideStepHeights();
    window.addEventListener('resize', syncGuideStepHeights);
});

/** 1번 설명 높이를 잰 뒤 2·3번만 그 배수(--guide-tall-mult)로 고정 */
function syncGuideStepHeights() {
    const step1 = document.getElementById('guideStep1');
    if (!step1) return;
    const base = Math.max(step1.offsetHeight, 1);
    document.documentElement.style.setProperty('--guide-step-base', base + 'px');
}

function initGuideImageLightbox() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeContactView();
            closeGuideImageModal();
        }
    });
    document.querySelectorAll('.guide-step-expandable').forEach((step) => {
        step.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openGuideStepModal(step);
            }
        });
    });
}

function openGuideStepModal(stepEl) {
    if (!stepEl) return;

    const box = document.getElementById('guideImgLightbox');
    const numEl = document.getElementById('guideLightboxNum');
    const textEl = document.getElementById('guideLightboxText');
    const imgWrap = document.getElementById('guideLightboxImgWrap');
    const big = document.getElementById('guideImgLightboxImg');
    const noImg = document.getElementById('guideLightboxNoImg');
    if (!box || !numEl || !textEl || !imgWrap || !big || !noImg) return;

    const num = stepEl.querySelector('.guide-num');
    const desc = stepEl.querySelector('.guide-body > p');
    const img = stepEl.querySelector('.guide-img-wrap img');
    const hasImg = img && img.style.display !== 'none' && !img.dataset.fallbackDone && img.src;

    numEl.textContent = num ? num.textContent : '';
    textEl.innerHTML = desc ? desc.innerHTML : '';

    if (hasImg) {
        big.src = img.src;
        big.alt = img.alt || '가이드 이미지';
        big.style.display = 'block';
        imgWrap.style.display = 'block';
        noImg.style.display = 'none';
    } else {
        big.src = '';
        big.style.display = 'none';
        imgWrap.style.display = 'none';
        const ph = stepEl.querySelector('.guide-img-placeholder');
        noImg.textContent = ph ? ph.textContent : '가이드 이미지 준비 중';
        noImg.style.display = 'block';
    }

    box.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

function closeGuideImageModal() {
    const box = document.getElementById('guideImgLightbox');
    const big = document.getElementById('guideImgLightboxImg');
    const textEl = document.getElementById('guideLightboxText');
    if (!box) return;
    box.classList.remove('is-open');
    if (big) {
        big.src = '';
        big.style.display = 'none';
    }
    if (textEl) textEl.innerHTML = '';
    const contactView = document.getElementById('viewContactList');
    if (!contactView || !contactView.classList.contains('is-open')) {
        document.body.style.overflow = '';
    }
}

/** 가이드 이미지 없을 때 안내 (start 폴더에 png 파일 추가) */
function showGuideImgPlaceholder(img, fileName) {
    if (!img || img.dataset.fallbackDone) return;
    img.dataset.fallbackDone = '1';
    img.style.display = 'none';
    const media = img.parentElement;
    if (!media || media.querySelector('.guide-img-placeholder')) return;
    const ph = document.createElement('div');
    ph.className = 'guide-img-placeholder';
    ph.textContent = `가이드 이미지 준비 중\n(start/${fileName})`;
    media.appendChild(ph);
}

function setStatus(msg, isError) {
    const el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#c0392b' : '#27ae60';
}

function sanitizeClassKey(name) {
    return String(name ?? '').trim().replace(/[.#$/[\]]/g, '_');
}

/** select_class → index1 과 동일: URL ?class= 또는 localStorage selectedClass */
function getLinkedClassName() {
    if (typeof initClassContext === 'function') initClassContext();
    const raw = window.currentClass || localStorage.getItem('selectedClass') || '';
    return sanitizeClassKey(raw);
}

function setupClassContext() {
    const linked = getLinkedClassName();
    if (linked) {
        currentClassName = linked;
        updateCurrentClassTag();
    }
    setupBackButton();
}

function setupBackButton() {
    const btn = document.getElementById('btnBack');
    if (!btn) return;
    const linked = getLinkedClassName();
    if (typeof classNavHref === 'function' && linked) {
        btn.textContent = '◀ 메인으로';
        btn.onclick = () => { location.href = classNavHref('index1.html'); };
    } else {
        btn.textContent = '◀ 반 선택으로';
        btn.onclick = () => { location.href = 'select_class.html'; };
    }
}

function getVcardGroupPrefix() {
    return currentClassName ? `${currentClassName} ${VCARD_GROUP_PREFIX}` : VCARD_GROUP_PREFIX;
}

function updateCurrentClassTag() {
    const el = document.getElementById('currentClassTag');
    if (!el) return;
    if (!currentClassName) {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }
    el.style.display = 'inline-block';
    el.textContent = `접속중: ${currentClassName}`;
}

function getMasterApp() {
    const existing = firebase.apps.find((app) => app.name === MASTER_APP_NAME);
    return existing || firebase.initializeApp(MASTER_CONFIG, MASTER_APP_NAME);
}

async function ensureFirebaseReady() {
    if (firebaseReady && masterDatabase) return true;

    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) return false;

    try {
        const masterApp = getMasterApp();
        masterDatabase = masterApp.database();
        masterAuth = masterApp.auth();

        if (!masterAuth.currentUser) {
            await masterAuth.signInWithEmailAndPassword(AUTH_EMAIL, savedPw);
        }

        firebaseReady = true;
        return true;
    } catch (err) {
        console.error(err);
        firebaseReady = false;
        return false;
    }
}

async function initFirebaseAndLoadClasses() {
    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) {
        renderGroupButtons([], '메인 화면에서 비밀번호 로그인 후 사용할 수 있습니다.');
        return;
    }

    const ok = await ensureFirebaseReady();
    if (!ok) {
        renderGroupButtons([], '로그인이 만료되었습니다. 메인 화면에서 다시 로그인해 주세요.');
        return;
    }

    loadSavedClassList();
}

function loadSavedClassList() {
    if (!masterDatabase) return;
    masterDatabase.ref(FB_CONTACTS_PATH).once('value', (snap) => {
        const data = snap.val() || {};
        const entries = Object.keys(data)
            .filter((key) => data[key] && Array.isArray(data[key].students) && data[key].students.length)
            .map((key) => ({
                name: key,
                count: data[key].students.length
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        renderGroupButtons(entries);
    }, (err) => {
        console.error(err);
        renderGroupButtons([], '저장된 반 목록을 불러오지 못했습니다.');
    });
}

function renderGroupButtons(entries, emptyMsg) {
    const list = document.getElementById('groupBtnList');
    if (!list) return;

    if (!entries.length) {
        list.innerHTML = `<span class="group-empty">${escapeHtml(emptyMsg || '저장된 그룹이 없습니다. PC에서 엑셀을 올려 저장해 주세요.')}</span>`;
        return;
    }

    list.innerHTML = entries.map(({ name, count }) => {
        const safe = escapeHtml(name);
        const active = name === currentClassName ? ' is-active' : '';
        const countLabel = count ? `${count}명` : '';
        return `<button type="button" class="btn-group-open${active}" data-class-name="${safe}" onclick="openContactViewByBtn(this)">
            <span class="group-btn-name">${safe}</span>
            ${countLabel ? `<span class="group-btn-sub">${countLabel} · 번호순</span>` : ''}
        </button>`;
    }).join('');
}

function sortStudentsByNum(list) {
    return [...list].sort((a, b) => {
        const na = parseInt(String(a.num).replace(/\D/g, ''), 10);
        const nb = parseInt(String(b.num).replace(/\D/g, ''), 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.num).localeCompare(String(b.num), 'ko', { numeric: true });
    });
}

function mapFirebaseStudents(rawList) {
    return sortStudentsByNum(rawList.map((s) => enrichStudentFromRrn({
        num: s.num || '',
        name: s.name || '',
        phone: s.phone || '',
        age: s.age || '',
        gender: s.gender || '',
        rrn: s.rrn || '',
        extra: ''
    })));
}

async function promptSaveToFirebase(fileName) {
    if (!students.length) return;

    const savedPw = localStorage.getItem('adminPw');
    if (!savedPw) {
        await appAlert('서버 저장은 메인 화면(index.html)에서 비밀번호로 로그인한 뒤 사용할 수 있습니다.\n\n엑셀 추출·목록 확인은 그대로 가능합니다.');
        return;
    }

    const ok = await ensureFirebaseReady();
    if (!ok) {
        await appAlert('공용 서버 연결에 실패했습니다.\n메인 화면에서 다시 로그인한 뒤 엑셀을 다시 업로드해 주세요.');
        return;
    }

    const linkedClass = getLinkedClassName();
    let className = linkedClass || currentClassName;

    const confirmMsg = className
        ? `${students.length}명 추출 완료.\n\n「${className}」 그룹에 서버에 저장하시겠습니까?\n(폰에서 같은 반으로 불러올 수 있습니다)`
        : `${students.length}명 추출 완료.\n\n공용 서버에 저장하시겠습니까?`;

    const wantSave = await appConfirm(confirmMsg);
    if (!wantSave) return;

    if (!className) {
        const classInput = await appPrompt('저장할 반 이름을 입력하세요.\n예) 701반', '', { title: '반 이름 입력' });
        if (classInput === null) return;
        className = sanitizeClassKey(classInput);
        if (!className) {
            await appAlert('반 이름을 입력해 주세요.');
            return;
        }
    }

    try {
        const existingSnap = await masterDatabase.ref(`${FB_CONTACTS_PATH}/${className}`).once('value');
        if (existingSnap.exists()) {
            const overwrite = await appConfirm(`「${className}」에 이미 저장된 명단이 있습니다.\n덮어쓰시겠습니까?`);
            if (!overwrite) return;
        }

        await masterDatabase.ref(`${FB_CONTACTS_PATH}/${className}`).set({
            className,
            fileName: fileName || '',
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            students: students.map((s) => ({
                num: s.num || '',
                name: s.name || '',
                phone: s.phone || '',
                age: s.age || '',
                gender: s.gender || '',
                rrn: s.rrn || ''
            }))
        });

        currentClassName = className;
        updateCurrentClassTag();
        loadSavedClassList();
        setStatus(`✅ 「${className}」 ${students.length}명 서버에 저장됨 · 위 그룹 버튼에서 폰으로 열기`);
        await appAlert(`「${className}」 ${students.length}명이 서버에 저장되었습니다.\n폰에서 위 「연락처 그룹」 버튼을 눌러 연락처를 추가하세요.`);
    } catch (err) {
        console.error(err);
        setStatus('서버 저장 실패: ' + (err.message || err), true);
        await appAlert('서버 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

function openContactViewByBtn(btn) {
    const className = btn && btn.getAttribute('data-class-name');
    if (className) openContactView(className);
}

async function openContactView(className) {
    const ok = await ensureFirebaseReady();
    if (!ok) {
        await appAlert('공용 서버에 연결되지 않았습니다.\n메인 화면에서 다시 로그인해 주세요.');
        return;
    }

    const view = document.getElementById('viewContactList');
    const titleEl = document.getElementById('contactViewTitle');
    const countEl = document.getElementById('contactViewCount');
    const list = document.getElementById('studentList');
    if (!view || !list) return;

    view.classList.add('is-open');
    view.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    if (titleEl) titleEl.textContent = className;
    if (countEl) countEl.textContent = '불러오는 중…';
    list.innerHTML = '<li class="empty-msg">불러오는 중…</li>';

    masterDatabase.ref(`${FB_CONTACTS_PATH}/${className}`).once('value', (snap) => {
        const data = snap.val();
        if (!data || !Array.isArray(data.students) || !data.students.length) {
            if (countEl) countEl.textContent = '저장된 학생 없음';
            list.innerHTML = '<li class="empty-msg">저장된 학생이 없습니다.</li>';
            setStatus(`「${className}」 저장된 학생이 없습니다.`, true);
            return;
        }

        students = mapFirebaseStudents(data.students);
        currentClassName = className;
        updateCurrentClassTag();
        loadSavedClassList();
        renderStudentList();
        if (countEl) countEl.textContent = `${students.length}명 · 번호순`;
        setStatus(`✅ 「${className}」 ${students.length}명 (연락처 저장 화면)`);
    }, (err) => {
        console.error(err);
        if (countEl) countEl.textContent = '불러오기 실패';
        list.innerHTML = '<li class="empty-msg">서버에서 불러오지 못했습니다.</li>';
        setStatus('서버에서 불러오기 실패', true);
    });
}

function closeContactView() {
    const view = document.getElementById('viewContactList');
    if (!view || !view.classList.contains('is-open')) return;
    view.classList.remove('is-open');
    view.setAttribute('aria-hidden', 'true');
    const lightbox = document.getElementById('guideImgLightbox');
    if (!lightbox || !lightbox.classList.contains('is-open')) {
        document.body.style.overflow = '';
    }
}

function cellStr(val) {
    return String(val ?? '').trim();
}

/** 번호 열 첫 칸(1번 학생)인지 */
function isStudentNumberOne(val) {
    if (val === 1) return true;
    const s = cellStr(val);
    return s === '1';
}

function normalizeRrn(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 7) return cellStr(raw);
    return `${digits.slice(0, 6)}-${digits.slice(6, 7)}`;
}

/** 주민번호 앞6자리+뒤1자리(071107-3)로 만 나이 계산 */
function calcAgeFromRrn(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 7) return '';
    const yy = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    const dd = parseInt(digits.slice(4, 6), 10);
    const genderDigit = parseInt(digits[6], 10);
    let year;
    if ([1, 2, 5, 6].includes(genderDigit)) year = 1900 + yy;
    else if ([3, 4, 7, 8].includes(genderDigit)) year = 2000 + yy;
    else year = 1800 + yy;

    const today = new Date();
    let age = today.getFullYear() - year;
    const monthDiff = today.getMonth() + 1 - mm;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dd)) age--;
    return age >= 0 && age < 150 ? String(age) : '';
}

/** 주민번호로 출생년도 라벨 (예: 86년생, 03년생, 20년생) */
function calcBirthYearLabelFromRrn(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 7) return '';
    const yy = parseInt(digits.slice(0, 2), 10);
    const genderDigit = parseInt(digits[6], 10);
    let year;
    if ([1, 2, 5, 6].includes(genderDigit)) year = 1900 + yy;
    else if ([3, 4, 7, 8].includes(genderDigit)) year = 2000 + yy;
    else year = 1800 + yy;

    const shortYear = String(year % 100).padStart(2, '0');
    return `${shortYear}년생`;
}

function getStudentBirthYearLabel(student) {
    if (student.birthYearLabel) return student.birthYearLabel;
    if (student.rrn) return calcBirthYearLabelFromRrn(student.rrn);
    return '';
}

/** 주민번호 뒤 1자리로 성별 계산 (홀수=남, 짝수=여) */
function calcGenderFromRrn(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 7) return '';
    const genderDigit = parseInt(digits[6], 10);
    if (Number.isNaN(genderDigit)) return '';
    return genderDigit % 2 === 1 ? '남' : '여';
}

function enrichStudentFromRrn(student) {
    const rrn = student.rrn || '';
    if (!student.age && rrn) student.age = calcAgeFromRrn(rrn);
    if (!student.gender && rrn) student.gender = calcGenderFromRrn(rrn);
    if (!student.birthYearLabel && rrn) student.birthYearLabel = calcBirthYearLabelFromRrn(rrn);
    return student;
}

function formatStudentSubText(student) {
    const parts = [];
    if (student.age) parts.push(`만${student.age}`);
    if (student.gender) parts.push(student.gender);
    parts.push(student.phone || '전화 없음');
    return parts.join(' · ');
}

function looksLikeStudentRow(row, numCol) {
    const name = cellStr(row[numCol + COL_OFFSET_NAME]);
    const rrn = cellStr(row[numCol + COL_OFFSET_RRN]);
    const phone = cellStr(row[numCol + COL_OFFSET_PHONE]);
    if (!name) return false;
    const hasRrn = /^\d{6}[-]?\d$/.test(rrn.replace(/\s/g, ''));
    const hasPhone = String(phone).replace(/\D/g, '').length >= 9;
    return hasRrn || hasPhone;
}

/** 시트 전체를 훑어 번호 열이 「1」인 첫 데이터 행 위치를 찾음 */
function findStudentDataAnchor(rows) {
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.length) continue;
        for (let c = 0; c < row.length; c++) {
            if (!isStudentNumberOne(row[c])) continue;
            if (!looksLikeStudentRow(row, c)) continue;
            return { row: r, numCol: c };
        }
    }
    return null;
}

function normalizePhone(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length < 9) return '';
    if (digits.length === 11 && digits.startsWith('010')) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10 && digits.startsWith('01')) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
}

function escapeVcardValue(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

/** vCard 3.0 한 줄 최대 75바이트(한글 포함) 접기 */
function foldVcardLine(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;

    const chunks = [];
    let current = '';
    for (const ch of line) {
        const next = current + ch;
        if (enc.encode(next).length > 75) {
            chunks.push(current);
            current = ' ' + ch;
        } else {
            current = next;
        }
    }
    if (current) chunks.push(current);
    return chunks.join('\r\n');
}

/** 미리 짜 둔 형식으로 vCard 3.0 생성 */
function formatStudentLabel(student) {
    const num = cellStr(student.num);
    return num ? `${num}. ${student.name}` : student.name;
}

function buildVcard(student) {
    const displayName = `${getVcardGroupPrefix()} ${formatStudentLabel(student)}`.trim();
    const phoneDigits = String(student.phone).replace(/\D/g, '');
    const noteParts = [];
    const birthYearLabel = getStudentBirthYearLabel(student);
    if (birthYearLabel) noteParts.push(birthYearLabel);
    if (student.gender) noteParts.push(`성별 ${student.gender}`);
    noteParts.push(VCARD_ORG);
    if (student.extra) noteParts.push(student.extra);
    const note = noteParts.join(' · ');

    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        foldVcardLine(`FN;CHARSET=UTF-8:${escapeVcardValue(displayName)}`),
        foldVcardLine(`N;CHARSET=UTF-8:${escapeVcardValue(student.name)};;;;`),
        `TEL;TYPE=CELL:${phoneDigits}`,
        `TEL;CELL:${phoneDigits}`,
        foldVcardLine(`NOTE;CHARSET=UTF-8:${escapeVcardValue(note)}`),
        foldVcardLine(`ORG;CHARSET=UTF-8:${escapeVcardValue(VCARD_ORG)}`),
        'END:VCARD'
    ];
    return lines.join('\r\n') + '\r\n';
}

function safeFileName(name) {
    return String(name || '연락처').replace(/[\\/:*?"<>|]/g, '_').trim() || '연락처';
}

const VCARD_MIME_ANDROID = 'text/x-vcard';
const VCARD_MIME_DEFAULT = 'text/vcard;charset=utf-8';

function isAndroidPhone() {
    return /Android/i.test(navigator.userAgent);
}

function isMobileContactDevice() {
    return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function scheduleRevokeObjectUrl(url) {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openVcardLink(url, fileName, useDownload) {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('rel', 'noopener');
    if (useDownload) link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function vcfToAndroidDataUrl(vcf) {
    const bytes = new TextEncoder().encode(vcf);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return `data:${VCARD_MIME_ANDROID};charset=utf-8;base64,${btoa(binary)}`;
}

/** 삼성·안드로이드: 공유 시트 → 연락처 앱 우선 */
async function openVcardOnAndroid(vcf, fileName, studentName) {
    const file = new File([vcf], fileName, { type: VCARD_MIME_ANDROID });

    if (navigator.share && typeof navigator.canShare === 'function') {
        try {
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: studentName });
                setStatus(`「${studentName}」 공유 창에서 「연락처」 또는 「연락처에 저장」을 선택하세요.`);
                return;
            }
        } catch (err) {
            if (err && err.name === 'AbortError') return;
        }
    }

    try {
        openVcardLink(vcfToAndroidDataUrl(vcf), fileName, false);
        setStatus(`「${studentName}」 연락처 앱이 열리면 「저장」을 눌러 주세요.`);
        return;
    } catch (err) {
        console.warn('Android data URL vcard open failed', err);
    }

    const url = URL.createObjectURL(new Blob([vcf], { type: VCARD_MIME_ANDROID }));
    openVcardLink(url, fileName, false);
    scheduleRevokeObjectUrl(url);
    setStatus(`「${studentName}」 「연락처」 앱으로 열기를 선택해 주세요.`);
}

/** 안드로이드(삼성) · 기타 모바일 · PC */
async function openVcardForStudent(student) {
    if (!student.phone) {
        setStatus('전화번호가 없어 연락처를 만들 수 없습니다.', true);
        return;
    }
    const vcf = buildVcard(student);
    const fileName = `${safeFileName(student.name)}.vcf`;
    const label = formatStudentLabel(student);

    if (isAndroidPhone()) {
        await openVcardOnAndroid(vcf, fileName, student.name);
        return;
    }

    if (isMobileContactDevice()) {
        const file = new File([vcf], fileName, { type: VCARD_MIME_DEFAULT });
        if (navigator.share && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: label });
                setStatus(`「${student.name}」 「연락처에 추가」를 선택해 주세요.`);
                return;
            } catch (err) {
                if (err && err.name === 'AbortError') return;
            }
        }

        const url = URL.createObjectURL(new Blob([vcf], { type: VCARD_MIME_DEFAULT }));
        openVcardLink(url, fileName, false);
        scheduleRevokeObjectUrl(url);
        setStatus(`「${student.name}」 「연락처에 추가」를 눌러 주세요.`);
        return;
    }

    const url = URL.createObjectURL(new Blob([vcf], { type: VCARD_MIME_DEFAULT }));
    openVcardLink(url, fileName, true);
    scheduleRevokeObjectUrl(url);
    setStatus(`「${student.name}」 연락처 파일을 다운로드했습니다.`);
}

function renderStudentList() {
    const list = document.getElementById('studentList');
    if (!list) return;

    if (!students.length) {
        list.innerHTML = '<li class="empty-msg">학생 목록이 없습니다.</li>';
        return;
    }

    list.innerHTML = students.map((s, idx) => {
        const sub = formatStudentSubText(s);
        return `<li class="student-item" onclick="openVcardByIndex(${idx})" role="button" tabindex="0">
            <div class="student-meta">
                <div class="student-name">${escapeHtml(formatStudentLabel(s))}</div>
                <div class="student-sub">${escapeHtml(sub)}</div>
            </div>
            <span class="student-action">연락처 추가</span>
        </li>`;
    }).join('');
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseRowsFromSheet(rows) {
    if (!rows || !rows.length) return [];

    const anchor = findStudentDataAnchor(rows);
    if (!anchor) {
        throw new Error('엑셀에서 1번 학생(번호 「1」) 시작 위치를 찾지 못했습니다. A열 번호·B열 이름·D열 전화 형식을 확인해 주세요.');
    }

    const { row: startRow, numCol } = anchor;
    const nameCol = numCol + COL_OFFSET_NAME;
    const rrnCol = numCol + COL_OFFSET_RRN;
    const phoneCol = numCol + COL_OFFSET_PHONE;
    const result = [];

    for (let r = startRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !row.length) break;

        const numRaw = row[numCol];
        const numStr = cellStr(numRaw);
        if (r > startRow && (numStr === '' || numRaw == null)) break;

        const name = cellStr(row[nameCol]);
        if (!name) continue;

        const rrn = normalizeRrn(row[rrnCol]);
        const phone = normalizePhone(row[phoneCol]);
        const age = calcAgeFromRrn(row[rrnCol]);
        const gender = calcGenderFromRrn(row[rrnCol]);

        result.push({
            num: numStr || String(numRaw ?? ''),
            name,
            phone,
            age,
            gender,
            rrn,
            extra: ''
        });
    }
    return result;
}

function handleExcelUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    setStatus('엑셀 읽는 중…');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            students = parseRowsFromSheet(rows);
            if (!students.length) {
                setStatus('추출된 학생이 없습니다. 데이터 행을 확인해 주세요.', true);
            } else {
                students = sortStudentsByNum(students);
                setStatus(`✅ ${students.length}명 추출됨 (${file.name}) · 서버 저장 후 그룹 버튼에서 열기`);
                promptSaveToFirebase(file.name);
            }
        } catch (err) {
            console.error(err);
            setStatus('엑셀 처리 실패: ' + (err.message || err), true);
        }
        input.value = '';
    };
    reader.onerror = () => setStatus('파일을 읽을 수 없습니다.', true);
    reader.readAsArrayBuffer(file);
}

function loadSampleStudents() {
    students = sortStudentsByNum([
        { num: '1', name: '김민수', phone: '010-1111-2222', age: '21', gender: '남', rrn: '030315-3', extra: '샘플' },
        { num: '2', name: '이서연', phone: '010-3333-4444', age: '22', gender: '여', rrn: '020101-4', extra: '샘플' },
        { num: '3', name: '박지훈', phone: '010-5555-6666', age: '20', gender: '남', rrn: '060512-3', extra: '샘플' }
    ]);
    currentClassName = currentClassName || '샘플반';
    updateCurrentClassTag();

    const view = document.getElementById('viewContactList');
    const titleEl = document.getElementById('contactViewTitle');
    const countEl = document.getElementById('contactViewCount');
    if (view) {
        view.classList.add('is-open');
        view.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
    if (titleEl) titleEl.textContent = currentClassName;
    if (countEl) countEl.textContent = `${students.length}명 · 번호순 (샘플)`;
    renderStudentList();
    setStatus('✅ 샘플 학생 3명 (연락처 저장 화면 테스트)');
}

function openVcardByIndex(idx) {
    const s = students[idx];
    if (s) openVcardForStudent(s);
}

window.handleExcelUpload = handleExcelUpload;
window.loadSampleStudents = loadSampleStudents;
window.openVcardByIndex = openVcardByIndex;
window.showGuideImgPlaceholder = showGuideImgPlaceholder;
window.openGuideStepModal = openGuideStepModal;
window.closeGuideImageModal = closeGuideImageModal;
window.openContactViewByBtn = openContactViewByBtn;
window.openContactView = openContactView;
window.closeContactView = closeContactView;
