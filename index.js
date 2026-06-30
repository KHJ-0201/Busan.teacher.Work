
    const masterConfig = {
        apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
        authDomain: "busan-teacher-workall.firebaseapp.com",
        databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "busan-teacher-workall"
    };
    if (!firebase.apps.length) firebase.initializeApp(masterConfig);

const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        firebase.auth().signOut();
        localStorage.removeItem('adminPw');
    }
    unsubscribe(); // 1회 작동 후 상시 감시를 중단하여 시동 꺼짐(무한 루프) 방지
});

    // 📍 인증 처리 함수 (버튼 클릭이나 자동 호출 시 실행)
    async function submitPassword() {
        const password = document.getElementById('adminPassword').value;
        const msgDiv = document.getElementById('loginMsg');
        const loginBtn = document.getElementById('loginBtn');
        const passField = document.getElementById('adminPassword');



       if(loginBtn.disabled || !password) return;

    try {
        msgDiv.innerText = "⏳ 보안 인증 확인 중...";
        msgDiv.style.color = "#f39c12";
        loginBtn.disabled = true;

        // 세션 유지 설정 (브라우저 닫으면 로그아웃)
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
        // 파이어베이스 인증 엔진 가동
        await firebase.auth().signInWithEmailAndPassword('ghlwns0201@naver.com', password);
        
        // 브라우저 사물함에 암호 보관 (다른 HTML 페이지 검문용)
        localStorage.setItem('adminPw', password);
        
        msgDiv.innerText = "✅ 인증 성공! 입장합니다.";
        msgDiv.style.color = "#27ae60";
        
        setTimeout(() => {
            location.href = 'start/select_class.html';
        }, 600);

    } catch (error) {
        // ❌ 인증 실패 시 처리 (잘못된 키)
        msgDiv.innerText = "⚠️ 비밀번호가 일치하지 않습니다.";
        msgDiv.style.color = "#e74c3c";
        loginBtn.disabled = false;
        
        // 입력창 초기화 및 재입력 대기
        passField.value = "";
        passField.focus();
    }
}

// 📍 [추가된 기능] 비밀번호 자동 로그인 센서 (스마트키 역할)
const TARGET_PASSWORD_LENGTH = 6; // ⚠️ 선생님의 실제 비밀번호 글자 수와 이 숫자가 똑같은지 다시 한번 확인해 주세요!

document.getElementById('adminPassword').addEventListener('keyup', function(e) {
    // [진단용 OBD 스캐너] 개발자 도구(F12) 콘솔창에 현재 길이와 목표 길이를 실시간 출력
    console.log("현재 입력 길이: " + e.target.value.length + " / 설정된 목표 길이: " + TARGET_PASSWORD_LENGTH);

    // 1. 엔터키 수동 시동
    if (e.key === 'Enter') {
        submitPassword();
        return;
    }
    
    // 2. 글자 수 일치 시 자동 시동
    if (e.target.value.length === TARGET_PASSWORD_LENGTH) {
        submitPassword();
    }
});

// 📍 [보안 추가] 대시보드(HTML)에서 엔진룸(JS)으로 클릭 배선 숨기기
document.getElementById('loginBtn').addEventListener('click', submitPassword);
