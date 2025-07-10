// ZAVIS 인증 시스템
async function signUp(email, password, name, phone) {
  try {
    console.log('회원가입 시도:', email, name, phone);
    
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 수파베이스 Auth 계정 생성
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `https://bcshine.github.io/ZAVIS-login-auth/`,
        data: { name, phone }
      }
    });
    
    if (authError) throw authError;
    
    if (!authData.user?.id) {
      throw new Error('사용자 계정 생성에 실패했습니다.');
    }
    
    console.log('Auth 사용자 생성 완료:', authData.user.id);
    
    // 프로필 생성 시도
    let profileCreated = false;
    
    try {
      const { data: profileData, error: profileError } = await supabaseClient
        .from('profiles')
        .insert([{ user_id: authData.user.id, name, phone, email, visit_count: 1 }])
        .select()
        .single();
      
      if (profileError) {
        if (profileError.code === '23505') {
          // 기존 프로필 업데이트
          await supabaseClient
            .from('profiles')
            .update({ name, phone })
            .eq('user_id', authData.user.id);
          profileCreated = true;
        } else {
          throw profileError;
        }
      } else {
        profileCreated = true;
      }
    } catch (error) {
      console.error('프로필 생성 실패:', error);
      // 모바일 환경에서 Edge Function 시도
      if (navigator.userAgent.match(/Mobile|Android|iPhone/)) {
        try {
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
    
    // 임시 사용자 정보 저장
    localStorage.setItem('zavis-user-info-temp', JSON.stringify({
      name, email, visit_count: 1
    }));
    
    const message = profileCreated 
      ? `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.`
      : `🎉 회원가입이 완료되었습니다!\n\n📧 ${email}로 보낸 인증 메일을 확인해주세요.\n\n⚠️ 프로필 정보는 첫 로그인 시 자동으로 생성됩니다.`;
    
    alert(message);
    return { success: true, user: authData.user };
    
  } catch (error) {
    console.error('회원가입 오류:', error);
    
    let errorMessage = '회원가입 중 오류가 발생했습니다.';
    
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

async function signIn(email, password) {
  try {
    console.log('로그인 시도:', email);
    
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    // 수파베이스 로그인
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (authError) throw authError;
    
    if (!authData.user?.id) {
      throw new Error('로그인에 실패했습니다.');
    }
    
    console.log('로그인 성공:', authData.user.id);
    
    // 프로필 조회
    const { data: profileData, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', authData.user.id)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('프로필 조회 오류:', profileError);
    }
    
    // 방문 횟수 업데이트
    if (profileData) {
      await supabaseClient
        .from('profiles')
        .update({ visit_count: (profileData.visit_count || 0) + 1 })
        .eq('user_id', authData.user.id);
    }
    
    // 사용자 정보 저장
    const userInfo = {
      name: profileData?.name || '사용자',
      email: authData.user.email,
      visit_count: (profileData?.visit_count || 0) + 1
    };
    
    localStorage.setItem('zavis-user-info', JSON.stringify(userInfo));
    localStorage.removeItem('zavis-user-info-temp');
    
    alert(`환영합니다, ${userInfo.name}님! (${userInfo.visit_count}번째 방문)`);
    return { success: true, user: authData.user, profile: profileData };
    
  } catch (error) {
    console.error('로그인 오류:', error);
    
    let errorMessage = '로그인 중 오류가 발생했습니다.';
    
    if (error.message?.includes('Invalid login credentials')) {
      errorMessage = '이메일 또는 비밀번호가 잘못되었습니다.';
    } else if (error.message?.includes('Email not confirmed')) {
      errorMessage = '이메일 인증이 완료되지 않았습니다. 인증 메일을 확인해주세요.';
    }
    
    alert(errorMessage);
    return { success: false, error: error.message };
  }
}

async function signOut() {
  try {
    if (!supabaseClient) {
      throw new Error('수파베이스 클라이언트가 초기화되지 않았습니다.');
    }
    
    await supabaseClient.auth.signOut();
    localStorage.removeItem('zavis-user-info');
    localStorage.removeItem('zavis-user-info-temp');
    
    alert('로그아웃되었습니다.');
    return { success: true };
    
  } catch (error) {
    console.error('로그아웃 오류:', error);
    alert('로그아웃 중 오류가 발생했습니다.');
    return { success: false, error: error.message };
  }
}

async function getCurrentUser() {
  try {
    if (!supabaseClient) return null;
    
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
    
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    return null;
  }
}

async function checkAuthStatus() {
  try {
    const user = await getCurrentUser();
    
    if (user) {
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
    
    return { isAuthenticated: false, user: null, profile: null };
    
  } catch (error) {
    console.error('인증 상태 확인 오류:', error);
    return { isAuthenticated: false, user: null, profile: null };
  }
} 