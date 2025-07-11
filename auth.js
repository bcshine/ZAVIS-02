// ZAVIS 인증 시스템

/**
 * 회원가입 함수 (개선된 버전)
 * - 이메일, 비밀번호, 이름, 전화번호를 받아 수파베이스 인증 계정과 프로필을 생성
 * - 모바일 환경에서 성능 최적화 및 명확한 피드백 제공
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
    
    // 3. 타임아웃 설정 (30초)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.')), 30000);
    });
    
    // 4. 수파베이스 Auth 계정 생성 (타임아웃 적용)
    const authPromise = supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `https://bcshine.github.io/ZAVIS-login-auth/`, // 인증 후 리디렉션 URL
        data: { name, phone } // 사용자 메타데이터
      }
    });
    
    const { data: authData, error: authError } = await Promise.race([authPromise, timeoutPromise]);
    
    // 5. 인증 계정 생성 중 오류 발생 시 예외 처리
    if (authError) throw authError;
    
    // 6. 사용자 계정 생성 성공 여부 확인
    if (!authData.user?.id) {
      throw new Error('사용자 계정 생성에 실패했습니다.');
    }
    
    console.log('Auth 사용자 생성 완료:', authData.user.id);
    
    // 7. 프로필 생성 시도 (단순화된 버전)
    let profileCreated = false;
    try {
      const profilePromise = supabaseClient
        .from('profiles')
        .insert([{ user_id: authData.user.id, name, phone, email, visit_count: 1 }])
        .select()
        .single();
      
      const { data: profileData, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);
      
      if (profileError) {
        // 이미 프로필이 존재하는 경우(중복) 업데이트 시도
        if (profileError.code === '23505') {
          await supabaseClient
            .from('profiles')
            .update({ name, phone })
            .eq('user_id', authData.user.id);
          profileCreated = true;
        } else {
          console.warn('프로필 생성 실패:', profileError);
          // 프로필 생성 실패해도 회원가입은 성공으로 처리
        }
      } else {
        profileCreated = true;
      }
    } catch (error) {
      console.warn('프로필 생성 중 오류:', error);
      // 프로필 생성 실패해도 회원가입은 성공으로 처리
    }
    
    // 8. 임시 사용자 정보 로컬 스토리지에 저장
    localStorage.setItem('zavis-user-info-temp', JSON.stringify({
      name, email, visit_count: 1
    }));
    
    // 9. 회원가입 성공 메시지
    const message = profileCreated 
      ? `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.`
      : `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.\n\n⚠️ 프로필 정보는 첫 로그인 시 자동으로 생성됩니다.`;
    
    return { success: true, user: authData.user, message };
    
  } catch (error) {
    // 10. 회원가입 전체 과정에서 발생한 오류 처리
    console.error('회원가입 오류:', error);
    
    let errorMessage = '회원가입 중 오류가 발생했습니다.';
    
    // 구체적인 오류 메시지 분류
    if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
      errorMessage = '이미 등록된 이메일입니다.';
    } else if (error.message?.includes('Password') || error.message?.includes('password')) {
      errorMessage = '비밀번호가 너무 짧습니다. (최소 6자 이상)';
    } else if (error.message?.includes('Email') || error.message?.includes('email')) {
      errorMessage = '올바른 이메일 형식이 아닙니다.';
    } else if (error.message?.includes('시간이 초과')) {
      errorMessage = '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message?.includes('network') || error.message?.includes('NetworkError')) {
      errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    }
    
    return { success: false, error: error.message, userMessage: errorMessage };
  }
}

/**
 * 로그인 함수 (개선된 버전)
 * - 이메일과 비밀번호로 인증 후, 프로필 정보를 조회 및 방문횟수 증가
 * - 타임아웃 설정 및 모바일 환경에서 성능 최적화
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
    
    // 3. 타임아웃 설정 (30초)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.')), 30000);
    });
    
    // 4. 수파베이스 Auth 로그인 시도 (타임아웃 적용)
    const authPromise = supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    const { data: authData, error: authError } = await Promise.race([authPromise, timeoutPromise]);
    
    // 5. 인증 오류 발생 시 예외 처리
    if (authError) throw authError;
    
    // 6. 로그인 성공 여부 확인
    if (!authData.user?.id) {
      throw new Error('로그인에 실패했습니다.');
    }
    
    console.log('로그인 성공:', authData.user.id);
    
    // 7. 프로필 정보 조회 (profiles 테이블, 타임아웃 적용)
    const profilePromise = supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();
    
    let profileData = null;
    try {
      const { data, error: profileError } = await Promise.race([profilePromise, timeoutPromise]);
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.warn('프로필 조회 오류:', profileError);
      } else if (data) {
        profileData = data;
      }
    } catch (error) {
      console.warn('프로필 조회 중 오류:', error);
    }
    
    // 8. 방문 횟수 증가 (프로필이 있을 때만)
    if (profileData) {
      try {
        await supabaseClient
          .from('profiles')
          .update({ visit_count: (profileData.visit_count || 0) + 1 })
          .eq('user_id', authData.user.id);
      } catch (error) {
        console.warn('방문 횟수 업데이트 오류:', error);
      }
    }
    
    // 9. 사용자 정보(이름, 이메일, 방문횟수) 로컬 스토리지에 저장
    const userInfo = {
      name: profileData?.name || '사용자',
      email: authData.user.email,
      visit_count: (profileData?.visit_count || 0) + 1
    };
    
    localStorage.setItem('zavis-user-info', JSON.stringify(userInfo));
    localStorage.removeItem('zavis-user-info-temp');
    
    // 10. 환영 메시지 생성
    const welcomeMessage = `환영합니다, ${userInfo.name}님! (${userInfo.visit_count}번째 방문)`;
    alert(welcomeMessage);
    
    return { success: true, user: authData.user, profile: profileData, message: welcomeMessage };
    
  } catch (error) {
    // 11. 로그인 전체 과정에서 발생한 오류 처리
    console.error('로그인 오류:', error);
    
    let errorMessage = '로그인 중 오류가 발생했습니다.';
    
    // 구체적인 오류 메시지 분류
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = '이메일 또는 비밀번호가 잘못되었습니다.';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = '이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해주세요.';
    } else if (error.message?.includes('시간이 초과')) {
      errorMessage = '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message?.includes('network') || error.message?.includes('NetworkError')) {
      errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    }
    
    return { success: false, error: error.message, userMessage: errorMessage };
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