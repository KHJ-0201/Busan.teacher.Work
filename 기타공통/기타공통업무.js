/**
 * 기타 공통업무 메뉴 — 항목 추가 시 아래 배열에 객체만 추가하면 됩니다.
 * HTML 파일을 기타공통 폴더로 옮긴 뒤에는 href를 같은 폴더 기준 파일명으로 바꿔 주세요.
 */
const ETC_MENU_ITEMS = [
    {
        id: 'measure',
        title: '차체 계측',
        description: '차체 정밀 진단·계측 데이터 관리',
        icon: '📐',
        href: '../차체/계측.html'
    },
    {
        id: 'district-class',
        title: '구청수업',
        description: '교육청 차량안전점검 · 알기 쉬운 자동차 관리 수업',
        icon: '📚',
        href: '../구청수업/index.html'
    },
    {
        id: 'parts-inventory-trend',
        title: '재고 수량 추이',
        description: '2022년 1월~현재 · 소모품·기자재 항목별 월별 그래프',
        icon: '📈',
        href: '차체물품관리-추이.html'
    },
    {
        id: 'parts-inventory',
        title: '차체 물품관리',
        description: '소모품 재고·연쇄 재계산 관리',
        icon: '🛠️',
        href: '차체물품관리.html'
    }
];

function renderEtcMenu() {
    const grid = document.getElementById('etcMenuGrid');
    if (!grid) return;

    grid.innerHTML = ETC_MENU_ITEMS.map(function (item) {
        return (
            '<a class="menu-card" href="' + item.href + '">' +
                '<span class="menu-icon" aria-hidden="true">' + item.icon + '</span>' +
                '<span class="menu-title">' + item.title + '</span>' +
                '<span class="menu-desc">' + item.description + '</span>' +
            '</a>'
        );
    }).join('');
}

document.addEventListener('DOMContentLoaded', renderEtcMenu);
