// ZAVIS 인증 시스템

/**
 * 모바일 환경 감지 함수
 * @returns {boolean} 모바일 환경 여부
 */
function isMobileEnvironment() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const mobileRegex = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  // 화면 크기도 함께 확인
  const isMobileScreen = window.innerWidth <= 768;
  
  return mobileRegex.test(userAgent.toLowerCase()) || isMobileScreen;
}

/**
 * 네트워크 상태 확인 함수
 * @returns {boolean} 온라인 상태 여부
 */
function isOnline() {
  return navigator.onLine !== false;
}

/**
 * 모바일 네트워크 타입 확인 함수
 * @returns {string} 네트워크 타입
 */
function getNetworkType() {
  if (navigator.connection) {
    return navigator.connection.effectiveType || navigator.connection.type || 'unknown';
  }
  return 'unknown';
}

/**
 * 모바일 환경에서 안전한 타임아웃 처리
 * @param {Promise} promise 실행할 Promise
 * @param {number} timeout 타임아웃 시간 (밀리초)
 * @returns {Promise} 타임아웃이 적용된 Promise
 */
function withMobileTimeout(promise, timeout) {
  if (!isMobileEnvironment()) {
    // 웹 환경에서는 기존 Promise.race 사용
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('요청 시간이 초과되었습니다.')), timeout)
      )
    ]);
  }
  
  // 모바일 환경에서는 더 간단한 타임아웃 처리
  return new Promise((resolve, reject) => {
    let isResolved = false;
    
    // 타임아웃 설정
    const timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error('모바일 네트워크 연결이 불안정합니다. 다시 시도해주세요.'));
      }
    }, timeout);
    
    // 원래 Promise 실행
    promise
      .then((result) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });
  });
}

/**
 * 회원가입 함수 (모바일 최적화 버전)
 * - 모바일 환경에서 최적화된 처리 방식 사용
 * - 단순화된 타임아웃 처리 및 빠른 응답
 * @param {string} email 사용자 이메일
 * @param {string} password 사용자 비밀번호
 * @param {string} name 사용자 이름
 * @param {string} phone 사용자 전화번호
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signUp(email, password, name, phone) {
  const isMobile = isMobileEnvironment();
  console.log('회원가입 시도 - 환경:', isMobile ? '모바일' : '웹', ':', email, name, phone);
  
  try {
    // 1. 수파베이스 클라이언트 초기화 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 2. 모바일 환경에서는 더 짧은 타임아웃 사용 (20초)
    const timeoutDuration = isMobile ? 20000 : 30000;
    
    // 3. 수파베이스 Auth 계정 생성
    const authPromise = supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `https://bcshine.github.io/ZAVIS-login-auth/`,
        data: { 
          name: name,
          phone: phone,
          full_name: name
        }
      }
    });
    
    console.log('Auth 계정 생성 요청 시작...');
    const { data: authData, error: authError } = await withMobileTimeout(authPromise, timeoutDuration);
    
    if (authError) throw authError;
    
    if (!authData.user?.id) {
      throw new Error('사용자 계정 생성에 실패했습니다.');
    }
    
    console.log('Auth 사용자 생성 완료:', authData.user.id);
    
    // 4. 프로필 생성 (모바일에서는 선택적)
    let profileCreated = false;
    
    if (isMobile) {
      // 모바일에서는 프로필 생성을 백그라운드에서 처리하고 즉시 성공 처리
      console.log('모바일 환경: 프로필 생성을 백그라운드에서 처리');
      
      // 백그라운드에서 프로필 생성 시도 (실패해도 무시)
      setTimeout(async () => {
        try {
          await supabaseClient
            .from('profiles')
            .insert([{ user_id: authData.user.id, name, phone, email, visit_count: 1 }]);
          console.log('백그라운드 프로필 생성 완료');
        } catch (error) {
          console.warn('백그라운드 프로필 생성 실패:', error);
        }
      }, 100);
      
      profileCreated = true; // 모바일에서는 성공으로 간주
    } else {
      // 웹에서는 기존 방식대로 프로필 생성
      try {
        const profilePromise = supabaseClient
          .from('profiles')
          .insert([{ user_id: authData.user.id, name, phone, email, visit_count: 1 }])
          .select()
          .single();
        
        const { data: profileData, error: profileError } = await withMobileTimeout(profilePromise, timeoutDuration);
        
        if (profileError) {
          if (profileError.code === '23505') {
            await supabaseClient
              .from('profiles')
              .update({ name, phone })
              .eq('user_id', authData.user.id);
            profileCreated = true;
          } else {
            console.warn('프로필 생성 실패:', profileError);
          }
        } else {
          profileCreated = true;
        }
      } catch (error) {
        console.warn('프로필 생성 중 오류:', error);
      }
    }
    
    // 5. 임시 사용자 정보 저장
    localStorage.setItem('zavis-user-info-temp', JSON.stringify({
      name, email, visit_count: 1
    }));
    
    // 6. 성공 메시지
    const message = isMobile 
      ? `🎉 회원가입 완료!\n📧 ${email}로 인증 메일을 보냈습니다.\n\n모바일에서는 프로필 정보가 자동으로 설정됩니다.`
      : (profileCreated 
        ? `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.`
        : `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.\n\n⚠️ 프로필 정보는 첫 로그인 시 자동으로 생성됩니다.`);
    
    return { success: true, user: authData.user, message };
    
  } catch (error) {
    console.error('회원가입 오류:', error);
    
    let errorMessage = '회원가입 중 오류가 발생했습니다.';
    
    if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
      errorMessage = '이미 등록된 이메일입니다.';
    } else if (error.message?.includes('Password') || error.message?.includes('password')) {
      errorMessage = '비밀번호가 너무 짧습니다. (최소 6자 이상)';
    } else if (error.message?.includes('Email') || error.message?.includes('email')) {
      errorMessage = '올바른 이메일 형식이 아닙니다.';
    } else if (error.message?.includes('시간이 초과') || error.message?.includes('모바일 네트워크')) {
      errorMessage = isMobile 
        ? '모바일 네트워크가 불안정합니다. Wi-Fi에 연결하거나 잠시 후 다시 시도해주세요.'
        : '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message?.includes('network') || error.message?.includes('NetworkError')) {
      errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    }
    
    return { success: false, error: error.message, userMessage: errorMessage };
  }
}

/**
 * 로그인 함수 (모바일 최적화 버전)
 * - 모바일 환경에서 빠른 로그인 처리
 * - 프로필 정보는 백그라운드에서 처리하여 응답 속도 향상
 * @param {string} email 사용자 이메일
 * @param {string} password 사용자 비밀번호
 * @returns {Promise<{success: boolean, user?: object, profile?: object, error?: string}>}
 */
async function signIn(email, password) {
  const isMobile = isMobileEnvironment();
  console.log('로그인 시도 - 환경:', isMobile ? '모바일' : '웹', ':', email);
  
  try {
    // 1. 수파베이스 클라이언트 초기화 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 2. 모바일 환경에서는 더 짧은 타임아웃 사용 (15초)
    const timeoutDuration = isMobile ? 15000 : 30000;
    
    // 3. 수파베이스 Auth 로그인 시도
    const authPromise = supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    console.log('Auth 로그인 요청 시작...');
    const { data: authData, error: authError } = await withMobileTimeout(authPromise, timeoutDuration);
    
    if (authError) throw authError;
    
    if (!authData.user?.id) {
      throw new Error('로그인에 실패했습니다.');
    }
    
    console.log('로그인 성공:', authData.user.id);
    
    // 4. 사용자 정보 처리 (모바일에서는 단순화)
    let profileData = null;
    let userInfo = null;
    
    if (isMobile) {
      // 모바일에서는 기본 사용자 정보만 생성하고 프로필은 백그라운드에서 처리
      const userName = authData.user.user_metadata?.name || authData.user.user_metadata?.full_name || '사용자';
      const userPhone = authData.user.user_metadata?.phone || null;
      
      userInfo = {
        name: userName,
        email: authData.user.email,
        visit_count: 1
      };
      
      // 백그라운드에서 프로필 조회 및 업데이트
      setTimeout(async () => {
        try {
          const { data } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('user_id', authData.user.id)
            .single();
          
          if (data) {
            // 프로필이 있으면 방문횟수 증가
            await supabaseClient
              .from('profiles')
              .update({ visit_count: (data.visit_count || 0) + 1 })
              .eq('user_id', authData.user.id);
              
            // 로컬 스토리지 업데이트
            const updatedUserInfo = {
              name: data.name || userName,
              email: authData.user.email,
              visit_count: (data.visit_count || 0) + 1
            };
            localStorage.setItem('zavis-user-info', JSON.stringify(updatedUserInfo));
            console.log('백그라운드 프로필 업데이트 완료');
          } else {
            // 프로필이 없으면 생성 (전화번호 정보 포함)
            console.log('프로필 생성 시도 - 이름:', userName, '전화번호:', userPhone);
            await supabaseClient
              .from('profiles')
              .insert([{
                user_id: authData.user.id,
                name: userName,
                phone: userPhone,
                email: authData.user.email,
                visit_count: 1
              }]);
            console.log('백그라운드 프로필 생성 완료 (전화번호 포함)');
          }
        } catch (error) {
          console.warn('백그라운드 프로필 처리 실패:', error);
        }
      }, 100);
      
    } else {
      // 웹에서는 기존 방식대로 프로필 조회
      try {
        const profilePromise = supabaseClient
          .from('profiles')
          .select('*')
          .eq('user_id', authData.user.id)
          .single();
        
        const { data, error: profileError } = await withMobileTimeout(profilePromise, timeoutDuration);
        
        if (profileError && profileError.code !== 'PGRST116') {
          console.warn('프로필 조회 오류:', profileError);
        } else if (data) {
          profileData = data;
        }
      } catch (error) {
        console.warn('프로필 조회 중 오류:', error);
      }
      
      // 방문 횟수 증가
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
      
      // 사용자 정보 생성
      userInfo = {
        name: profileData?.name || '사용자',
        email: authData.user.email,
        visit_count: (profileData?.visit_count || 0) + 1
      };
    }
    
    // 5. 로컬 스토리지에 사용자 정보 저장
    localStorage.setItem('zavis-user-info', JSON.stringify(userInfo));
    localStorage.removeItem('zavis-user-info-temp');
    
    // 6. 환영 메시지 생성
    const welcomeMessage = isMobile 
      ? `환영합니다, ${userInfo.name}님! 모바일에서 접속하셨습니다.`
      : `환영합니다, ${userInfo.name}님! (${userInfo.visit_count}번째 방문)`;
    
    alert(welcomeMessage);
    
    return { success: true, user: authData.user, profile: profileData, message: welcomeMessage };
    
  } catch (error) {
    console.error('로그인 오류:', error);
    
    let errorMessage = '로그인 중 오류가 발생했습니다.';
    
    // 구체적인 오류 메시지 분류
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = '이메일 또는 비밀번호가 잘못되었습니다.';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = '이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해주세요.';
    } else if (error.message?.includes('시간이 초과') || error.message?.includes('모바일 네트워크')) {
      errorMessage = isMobile 
        ? '모바일 네트워크가 불안정합니다. Wi-Fi에 연결하거나 잠시 후 다시 시도해주세요.'
        : '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
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

/**
 * 전화번호가 누락된 프로필 복구 함수
 * - 기존 사용자의 누락된 전화번호 정보를 user_metadata에서 복구
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function repairMissingPhoneNumbers() {
  try {
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 현재 로그인된 사용자 정보 조회
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: '로그인이 필요합니다.' };
    }
    
    // 사용자의 프로필 조회
    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (profileError) {
      console.warn('프로필 조회 실패:', profileError);
      return { success: false, error: '프로필 조회에 실패했습니다.' };
    }
    
    // 전화번호가 누락된 경우에만 복구 시도
    if (!profileData.phone && user.user_metadata?.phone) {
      console.log('전화번호 복구 시도:', user.user_metadata.phone);
      
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ 
          phone: user.user_metadata.phone,
          name: user.user_metadata.name || user.user_metadata.full_name || profileData.name
        })
        .eq('user_id', user.id);
      
      if (updateError) {
        console.error('전화번호 복구 실패:', updateError);
        return { success: false, error: '전화번호 복구에 실패했습니다.' };
      }
      
      console.log('전화번호 복구 완료');
      return { success: true, message: '전화번호가 성공적으로 복구되었습니다.' };
    }
    
    return { success: true, message: '전화번호 정보가 이미 올바르게 설정되어 있습니다.' };
    
  } catch (error) {
    console.error('전화번호 복구 오류:', error);
    return { success: false, error: error.message };
  }
} 

/**
 * 비밀번호 재설정 함수
 * - 사용자 이메일로 비밀번호 재설정 링크를 전송
 * @param {string} email 사용자 이메일
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function resetPassword(email) {
  const isMobile = isMobileEnvironment();
  console.log('비밀번호 재설정 요청 - 환경:', isMobile ? '모바일' : '웹', ':', email);
  
  try {
    // 1. 수파베이스 클라이언트 초기화 확인
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 2. 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('올바른 이메일 형식이 아닙니다.');
    }
    
    // 3. 모바일 환경에서는 더 짧은 타임아웃 사용
    const timeoutDuration = isMobile ? 15000 : 30000;
    
    // 4. 비밀번호 재설정 이메일 전송
    const resetPromise = supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `https://bcshine.github.io/ZAVIS-login-auth/reset-password.html`
    });
    
    console.log('비밀번호 재설정 이메일 전송 요청 시작...');
    const { error } = await withMobileTimeout(resetPromise, timeoutDuration);
    
    if (error) throw error;
    
    const successMessage = isMobile 
      ? `📧 비밀번호 재설정 링크를 ${email}로 전송했습니다.\n\n📱 모바일에서는 메일 앱을 확인해주세요.`
      : `📧 비밀번호 재설정 링크를 ${email}로 전송했습니다.\n\n메일함을 확인하고 링크를 클릭해주세요.`;
    
    console.log('비밀번호 재설정 이메일 전송 완료');
    return { success: true, message: successMessage };
    
  } catch (error) {
    console.error('비밀번호 재설정 오류:', error);
    
    let errorMessage = '비밀번호 재설정 요청 중 오류가 발생했습니다.';
    
    // 구체적인 오류 메시지 분류
    if (error.message?.includes('User not found') || error.message?.includes('Invalid email')) {
      errorMessage = '등록되지 않은 이메일입니다. 이메일을 확인해주세요.';
    } else if (error.message?.includes('올바른 이메일 형식')) {
      errorMessage = error.message;
    } else if (error.message?.includes('시간이 초과') || error.message?.includes('모바일 네트워크')) {
      errorMessage = isMobile 
        ? '모바일 네트워크가 불안정합니다. Wi-Fi에 연결하거나 잠시 후 다시 시도해주세요.'
        : '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message?.includes('network') || error.message?.includes('NetworkError')) {
      errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
    } else if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
      errorMessage = '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    return { success: false, error: error.message, userMessage: errorMessage };
  }
}

/**
 * 사용자에게 비밀번호 재설정 확인 요청
 * - 로그인 실패 시 비밀번호 재설정 옵션 제공
 * @param {string} email 로그인 시도한 이메일
 * @returns {Promise<boolean>} 사용자가 재설정 요청했는지 여부
 */
async function askForPasswordReset(email) {
  const resetConfirm = confirm(
    `로그인에 실패했습니다.\n\n비밀번호를 잊으셨나요? '확인'을 누르면 ${email}로 비밀번호 재설정 링크를 전송합니다.`
  );
  
  if (resetConfirm) {
    const result = await resetPassword(email);
    if (result.success) {
      alert(result.message);
      return true;
    } else {
      alert(result.userMessage || result.error);
      return false;
    }
  }
  
  return false;
} 