// دفتر - Service Worker (نسخة v22)
const CACHE = "daftar-v22";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];
const LIBS = [
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        SHELL.concat(LIBS).map((url) =>
          fetch(url, { cache: "reload" })
            .then((res) => { if (res && res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000));
  const net = fetch(request).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
  return Promise.race([net, timeout]).catch(() =>
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || net)
  );
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    return fetch(request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isCode = req.mode === "navigate" || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith("/");
    event.respondWith(isCode ? networkFirst(req) : cacheFirst(req));
  } else if (url.hostname === "cdnjs.cloudflare.com" || url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(req));
  }
});
