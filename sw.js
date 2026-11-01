"use strict";

const CACHE_NAME = "foldbook-shell-v2";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/brand/foldbook-pwa-icon.svg",
  "/assets/css/design-tokens.css",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/js/pwa.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("foldbook-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isAppShell = url.pathname === "/" || url.pathname === "/index.html" || url.pathname.startsWith("/assets/");
  if (!isAppShell) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request) || (request.mode === "navigate" ? await cache.match("/") : null);
      if (cached) return cached;
      throw error;
    }
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "" }; }
  const title = payload.title || "Your FoldBook streak is waiting 🔥";
  const image = typeof payload.image === "string" ? new URL(payload.image, self.location.origin) : null;
  const options = {
    body: payload.body || "Ready for a quick study quest?",
    icon: "/assets/brand/foldbook-pwa-icon.svg",
    badge: "/assets/brand/foldbook-pwa-icon.svg",
    tag: payload.tag || "foldbook-study-reminder",
    data: { url: payload.url || "/" },
    actions: [{ action: "study", title: "Start a 5-minute quest" }],
    vibrate: [120, 60, 120]
  };
  if (image?.origin === self.location.origin && image.pathname.startsWith("/assets/brand/")) options.image = image.href;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ("navigate" in existing && existing.url !== target) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
