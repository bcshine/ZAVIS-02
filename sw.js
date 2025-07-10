// 서비스 워커 등록 - 동적 버전 관리
const CACHE_NAME = `zavis-v${Date.now()}`; // 동적 버전
const urlsToCache = [
  './',
  './index.html',
  './mp1.png',
  './manifest.json',
  './sw.js'
];

// 설치 이벤트
self.addEventListener('install', event => {
  console.log('Service Worker: Installing new version with cache:', CACHE_NAME);
  event.waitUntil(
    // 먼저 모든 기존 캐시 삭제
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          console.log('Service Worker: Deleting old cache during install:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // 새 캐시 생성
      return caches.open(CACHE_NAME);
    }).then(cache => {
      console.log('Service Worker: Caching files in:', CACHE_NAME);
      return cache.addAll(urlsToCache);
    }).then(() => {
      // 즉시 활성화하여 기존 SW를 대체
      console.log('Service Worker: Skipping waiting');
      return self.skipWaiting();
    })
  );
});

// 활성화 이벤트 - 이전 캐시 삭제
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating new version');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 모든 클라이언트에게 즉시 적용
      return self.clients.claim();
    })
  );
});

// fetch 이벤트 - 네트워크 우선 전략으로 변경 (개선된 오류 처리)
self.addEventListener('fetch', event => {
  // 캐시할 수 없는 요청들을 필터링
  const request = event.request;
  
  // POST, PUT, DELETE 등의 요청이나 외부 API 호출은 캐시하지 않음
  if (request.method !== 'GET' || 
      request.url.includes('supabase.co') ||
      request.url.includes('api.') ||
      request.url.startsWith('chrome-extension://') ||
      request.url.startsWith('data:')) {
    // 네트워크 요청만 처리하고 캐시하지 않음
    event.respondWith(
      fetch(request).catch(() => {
        // 네트워크 실패시 기본 응답 반환
        return new Response('Network Error', { status: 408 });
      })
    );
    return;
  }
  
  // GET 요청만 캐시 처리
  event.respondWith(
    fetch(request)
      .then(response => {
        // 네트워크 요청 성공시 캐시 업데이트 (GET 요청이고 성공적인 응답만)
        if (response.status === 200 && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              // 캐시 저장 중 오류가 발생해도 무시
              cache.put(request, responseClone).catch(err => {
                console.log('Cache put error (ignored):', err);
              });
            })
            .catch(err => {
              console.log('Cache open error (ignored):', err);
            });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패시에만 캐시에서 반환
        return caches.match(request);
      })
  );
}); 