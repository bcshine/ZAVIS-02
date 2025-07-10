// ZAVIS 인증 시스템

/**
 * 회원가입 함수
 * - 이메일, 비밀번호, 이름, 전화번호를 받아 수파베이스 인증 계정과 프로필을 생성
 * - 모바일 환경에서는 Edge Function을 통한 백업 프로필 생성도 시도
 * @param {string} email 사용자 이메일
 * @param {string} password 사용자 비밀번호
 * @param {string} name 사용자 이름
 * @param {string} phone 사용자 전화번호
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signUp(email, password, name, phone) {
  try {
    // 1. 회원가입 시도 로그 출력
    console.log('회원가입 시도:', email, name, phone);
    
    // 2. 수파베이스 클라이언트 초기화 여부 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 3. 수파베이스 Auth 계정 생성 (이메일/비밀번호 기반)
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `https://bcshine.github.io/ZAVIS-login-auth/`, // 인증 후 리디렉션 URL
        data: { name, phone } // 사용자 메타데이터
      }
    });
    
    // 4. 인증 계정 생성 중 오류 발생 시 예외 처리
    if (authError) throw authError;
    
    // 5. 사용자 계정 생성 성공 여부 확인
    if (!authData.user?.id) {
      throw new Error('사용자 계정 생성에 실패했습니다.');
    }
    
    console.log('Auth 사용자 생성 완료:', authData.user.id);
    
    // 6. 프로필 생성 시도 (profiles 테이블)
    let profileCreated = false;
    try {
      // 6-1. 프로필 직접 생성 시도
      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .insert([{ user_id: authData.user.id, name, phone, email, visit_count: 1 }])
        .select()
        .single();
      
      if (profileError) {
        // 6-2. 이미 프로필이 존재하는 경우(중복) 업데이트 시도
        if (profileError.code === '23505') {
          await supabaseClient
            .from('profiles')
            .update({ name, phone })
            .eq('user_id', authData.user.id);
          profileCreated = true;
        } else {
          // 6-3. 기타 오류는 예외로 처리
          throw profileError;
        }
      } else {
        // 6-4. 프로필 생성 성공
        profileCreated = true;
      }
    } catch (error) {
      // 7. 프로필 생성 실패 시 모바일 환경에서 Edge Function 백업 시도
      console.error('프로필 생성 실패:', error);
      if (navigator.userAgent.match(/Mobile|Android|iPhone/)) {
        try {
          // Edge Function 호출로 모바일 백업 프로필 생성
          const response = await fetch(`${supabaseClient.supabaseUrl}/functions/v1/mobile-signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseClient.supabaseKey}`
            },
            body: JSON.stringify({ email, password, name, phone })
          });
          
          const result = await response.json();
          if (result.success) profileCreated = true;
        } catch (edgeError) {
          console.error('Edge Function 실패:', edgeError);
        }
      }
    }
    
    // 8. 임시 사용자 정보(이름, 이메일, 방문횟수) 로컬 스토리지에 저장
    localStorage.setItem('zavis-user-info-temp', JSON.stringify({
      name, email, visit_count: 1
    }));
    
    // 9. 회원가입 성공 메시지(프로필 생성 여부에 따라 안내)
    const message = profileCreated 
      ? `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.`
      : `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.\n\n⚠️ 프로필 정보는 첫 로그인 시 자동으로 생성됩니다.`;
    
    alert(message);
    return { success: true, user: authData.user };
    
  } catch (error) {
    // 10. 회원가입 전체 과정에서 발생한 오류 처리 및 안내
    console.error('회원가입 오류:', error);
    
    let errorMessage = '회원가입 중 오류가 발생했습니다.';
    
    // 10-1. 오류 메시지에 따라 사용자에게 구체적으로 안내
    if (error.message?.includes('already registered')) {
      errorMessage = '이미 등록된 이메일입니다.';
    } else if (error.message?.includes('Password')) {
      errorMessage = '비밀번호가 너무 짧습니다. (최소 6자)';
    } else if (error.message?.includes('Email')) {
      errorMessage = '올바른 이메일 형식이 아닙니다.';
    }
    
    alert(errorMessage);
    return { success: false, error: error.message };
  }
}

/**
 * 로그인 함수
 * - 이메일과 비밀번호로 인증 후, 프로필 정보를 조회 및 방문횟수 증가
 * @param {string} email 사용자 이메일
 * @param {string} password 사용자 비밀번호
 * @returns {Promise<{success: boolean, user?: object, profile?: object, error?: string}>}
 */
async function signIn(email, password) {
  try {
    // 1. 로그인 시도 로그 출력
    console.log('로그인 시도:', email);
    
    // 2. 수파베이스 클라이언트 초기화 여부 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 3. 수파베이스 Auth 로그인 시도
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    // 4. 인증 오류 발생 시 예외 처리
    if (authError) throw authError;
    
    // 5. 로그인 성공 여부 확인
    if (!authData.user?.id) {
      throw new Error('로그인에 실패했습니다.');
    }
    
    console.log('로그인 성공:', authData.user.id);
    
    // 6. 프로필 정보 조회 (profiles 테이블)
    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();
    
    // 7. 프로필 조회 오류(존재하지 않는 경우 등) 로그 출력
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('프로필 조회 오류:', profileError);
    }
    
    // 8. 방문 횟수 증가 (프로필이 있을 때만)
    if (profileData) {
      await supabaseClient
        .from('profiles')
        .update({ visit_count: (profileData.visit_count || 0) + 1 })
        .eq('user_id', authData.user.id);
    }
    
    // 9. 사용자 정보(이름, 이메일, 방문횟수) 로컬 스토리지에 저장
    const userInfo = {
      name: profileData?.name || '사용자',
      email: authData.user.email,
      visit_count: (profileData?.visit_count || 0) + 1
    };
    
    localStorage.setItem('zavis-user-info', JSON.stringify(userInfo));
    localStorage.removeItem('zavis-user-info-temp');
    
    // 10. 환영 메시지 표시
    alert(`환영합니다, ${userInfo.name}님! (${userInfo.visit_count}번째 방문)`);
    return { success: true, user: authData.user, profile: profileData };
    
  } catch (error) {
    // 11. 로그인 전체 과정에서 발생한 오류 처리 및 안내
    console.error('로그인 오류:', error);
    
    let errorMessage = '로그인 중 오류가 발생했습니다.';
    
    // 11-1. 오류 메시지에 따라 사용자에게 구체적으로 안내
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = '이메일 또는 비밀번호가 잘못되었습니다.';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = '이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해주세요.';
    }
    
    alert(errorMessage);
    return { success: false, error: error.message };
  }
}

/**
 * 로그아웃 함수
 * - 현재 로그인된 사용자를 로그아웃 처리하고, 로컬 스토리지 정보 삭제
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signOut() {
  try {
    // 1. 수파베이스 클라이언트 초기화 여부 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 2. 수파베이스 Auth 로그아웃 처리
    await supabaseClient.auth.signOut();
    // 3. 로컬 스토리지 정보 삭제
    localStorage.removeItem('zavis-user-info');
    localStorage.removeItem('zavis-user-info-temp');
    
    // 4. 로그아웃 완료 메시지
    alert('로그아웃되었습니다.');
    return { success: true };
    
  } catch (error) {
    // 5. 로그아웃 과정에서 발생한 오류 처리 및 안내
    console.error('로그아웃 오류:', error);
    alert('로그아웃 중 오류가 발생했습니다.');
    return { success: false, error: error.message };
  }
}

/**
 * 현재 로그인된 사용자 정보 조회 함수
 * - 인증된 사용자가 없으면 null 반환
 * @returns {Promise<object|null>} 사용자 정보 또는 null
 */
async function getCurrentUser() {
  try {
    // 1. 수파베이스 클라이언트 초기화 여부 확인
    if (!supabaseClient) return null;
    
    // 2. 현재 인증된 사용자 정보 조회
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
    
  } catch (error) {
    // 3. 사용자 정보 조회 과정에서 오류 발생 시 null 반환
    console.error('사용자 정보 조회 오류:', error);
    return null;
  }
}

/**
 * 인증 상태 확인 함수
 * - 현재 로그인된 사용자의 인증 및 프로필 정보를 반환
 * @returns {Promise<{isAuthenticated: boolean, user: object|null, profile: object|null}>}
 */
async function checkAuthStatus() {
  try {
    // 1. 현재 사용자 정보 조회
    const user = await getCurrentUser();
    
    if (user) {
      // 2. 프로필 정보 조회
      const { data: profileData } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      return {
        isAuthenticated: true,
        user,
        profile: profileData
      };
    }
    
    // 3. 인증되지 않은 경우
    return { isAuthenticated: false, user: null, profile: null };
    
  } catch (error) {
    // 4. 인증 상태 확인 과정에서 오류 발생 시 비인증 상태 반환
    console.error('인증 상태 확인 오류:', error);
    return { isAuthenticated: false, user: null, profile: null };
  }
} 