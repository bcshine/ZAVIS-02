// ZAVIS 수파베이스 설정
const supabaseConfig = {
  url: 'https://uscvzvmtskestpyrhuhe.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzY3Z6dm10c2tlc3RweXJodWhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxMDkyNjIsImV4cCI6MjA2NzY4NTI2Mn0.fGMLp-DirDyejS_axAta76k0O1lJCPRAKDIAxVd9tUc',
  projectId: 'uscvzvmtskestpyrhuhe'
};

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error('수파베이스 라이브러리가 로드되지 않았습니다.');
    return null;
  }
  
  const client = supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });
  
  console.log('수파베이스 클라이언트 초기화 완료');
  return client;
}

let supabaseClient = null;
let supabaseInitialized = false;

document.addEventListener('DOMContentLoaded', function() {
  if (!supabaseInitialized) {
    supabaseInitialized = true;
    supabaseClient = initSupabase();
  }
}); 