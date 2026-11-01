/* Service worker: saves the whole app on the phone so it opens with no internet.
   Change CACHE (v1 -> v2) whenever you change any app file, so phones fetch the new version. */
var CACHE = "brightsun-v1";
var FILES = ["./", "index.html", "app.css", "app.js", "privacy.html", "manifest.webmanifest",
  "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request).catch(function () { return caches.match("index.html"); });
  }));
});
