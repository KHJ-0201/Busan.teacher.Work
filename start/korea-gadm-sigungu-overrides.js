/**
 * GADM 영문 구명 → 한글 시·군·구 보정 (자동 매핑 오류 수정)
 */
(function (global) {
    'use strict';

    global.GADM_SIGUNGU_OVERRIDES = {
        '서울특별시': {
            'Gangseo': '강서구',
            'Geum-cheon': '금천구',
            'Guro': '구로구',
            'Gwanak': '관악구',
            'Gwang-jin': '광진구',
            'Jongro': '종로구',
            'Jung': '중구',
            'Jungnang': '중랑구',
            'Mapo': '마포구',
            'Nowon': '노원구',
            'Seocho': '서초구',
            'Seodaemun': '서대문구',
            'Seongbuk': '성북구',
            'Seongdong': '성동구',
            'Songpa': '송파구',
            'Yangcheon': '양천구',
            'Yeongdeungpo': '영등포구',
            'Yongsan': '용산구',
            'Dobong': '도봉구',
            'Dong-daemun': '동대문구',
            'Dongjak': '동작구',
            'Eun-pyeong': '은평구',
            'Gandong': '강동구',
            'Gangbuk': '강북구',
            'Gangnam': '강남구'
        },
        '부산광역시': {
            'Buk': '북구',
            'Busanjin': '부산진구',
            'Dong': '동구',
            'Dongnae': '동래구',
            'Gangseo': '강서구',
            'Geumjeong': '금정구',
            'Gijang': '기장군',
            'Haeundae': '해운대구',
            'Nam': '남구',
            'Saha': '사하구',
            'Sasang': '사상구',
            'Seo': '서구',
            'Suyeong': '수영구',
            'Yeongdo': '영도구',
            'Yeonje': '연제구'
        },
        '인천광역시': {
            'Bupyeong': '부평구',
            'Dong': '동구',
            'Ganghwa': '강화군',
            'Gyeyang': '계양구',
            'Jung': '중구',
            'Nam': '남동구',
            'Namdong': '남동구',
            'Ongjin': '옹진군',
            'Seo': '서구',
            'Yeonsu': '연수구',
            'Michuhol': '미추홀구'
        },
        '대구광역시': {
            'Buk': '북구',
            'Dalseo': '달서구',
            'Dalseong': '달성군',
            'Dong': '동구',
            'Jung': '중구',
            'Nam': '남구',
            'Seo': '서구',
            'Suseong': '수성구',
            'Gunwi': '군위군'
        },
        '대전광역시': {
            'Daedeok': '대덕구',
            'Dong': '동구',
            'Jung': '중구',
            'Seo': '서구',
            'Yuseong': '유성구'
        },
        '광주광역시': {
            'Buk': '북구',
            'Dong': '동구',
            'Gwangsan': '광산구',
            'Nam': '남구',
            'Seo': '서구'
        },
        '울산광역시': {
            'Buk': '북구',
            'Dong': '동구',
            'Jung': '중구',
            'Nam': '남구',
            'Ulju': '울주군'
        },
        '제주특별자치도': {
            'Jeju': '제주시',
            'Seogwipo': '서귀포시'
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
