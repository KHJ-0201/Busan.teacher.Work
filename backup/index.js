
    const masterConfig = {
        apiKey: "AIzaSyDnADuHu0mq4GIlqBm_VHfv7y6RarabGhU",
        authDomain: "busan-teacher-workall.firebaseapp.com",
        databaseURL: "https://busan-teacher-workall-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "busan-teacher-workall"
    };
    if (!firebase.apps.length) firebase.initializeApp(masterConfig);

firebase.auth().onAuthStateChanged((user) => {
    // 페이지 로드 시 기존 세션이 남아있다면 로그아웃시켜서 
    // 반드시 비밀번호를 다시 입력하게 만듭니다. (보안 강화)
    if (user) {
        firebase.auth().signOut();
        localStorage.removeItem('adminPw');
    }
});

    // 📍 실시간 입력 감지 함수 (추가)
    function autoSubmit() {
        const passField = document.getElementById('adminPassword');
        // 비밀번호가 6글자 이상일 때만 자동 시도 (파이어베이스 최소 기준)
        // 만약 선생님 비밀번호가 더 길다면 숫자를 조절하세요.
        if (passField.value.length >= 6) {
            submitPassword();
        }
    }

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

