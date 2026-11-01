// Service worker: ให้แอพเปิดได้แม้ไม่มีอินเทอร์เน็ต
// ถ้าแก้ไฟล์ในโปรเจกต์ ให้เปลี่ยนเลขเวอร์ชันด้านล่างเพื่อให้เครื่องที่ติดตั้งไว้โหลดไฟล์ใหม่
const CACHE = 'ledger-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // ฟอนต์จาก Google Fonts: ใช้ของที่เก็บไว้ก่อน แล้วอัปเดตเบื้องหลัง
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((cached) => {
          const net = fetch(e.request).then((res) => { c.put(e.request, res.clone()); return res; }).catch(() => cached);
          return cached || net;
        })
      )
    );
    return;
  }

  // ไฟล์ของแอพ: ลองโหลดใหม่ก่อน ถ้าออฟไลน์ใช้ของที่เก็บไว้
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
