"use strict";

const CACHE_NAME = "foldbook-shell-v1";
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
