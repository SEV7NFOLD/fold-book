"use strict";

const routes = {
  broadsheets: require("../lib/api-handlers/admin/broadsheets.js"),
  "course-catalog": require("../lib/api-handlers/admin/course-catalog.js"),
  "course-materials": require("../lib/api-handlers/admin/course-materials.js"),
  // Quiz hosts (lecturers and class reps). They sign in with an email code, not the admin
  // passcode, and these routes check the host session themselves.
  "host-auth": require("../lib/api-handlers/host/auth.js"),
  "host-quizzes": require("../lib/api-handlers/host/quizzes.js"),
  hosts: require("../lib/api-handlers/admin/hosts.js"),
  materials: require("../lib/api-handlers/admin/materials.js"),
  "material-requests": require("../lib/api-handlers/admin/material-requests.js"),
  quizzes: require("../lib/api-handlers/admin/quizzes.js"),
  "mobile-reminders": require("../lib/api-handlers/admin/mobile-reminders.js"),
  results: require("../lib/api-handlers/admin/results.js"),
  session: require("../lib/api-handlers/admin/session.js"),
  "student-materials": require("../lib/api-handlers/admin/student-materials.js"),
  "student-records": require("../lib/api-handlers/admin/student-records.js"),
  transcribe: require("../lib/api-handlers/admin/transcribe.js"),
  "whatsapp-settings": require("../lib/api-handlers/admin/whatsapp-settings.js"),
};

module.exports = function adminApiRouter(request, response) {
  const route = request.query?.route || new URL(request.url, "http://localhost").searchParams.get("route");
  const handler = typeof route === "string" ? routes[route] : null;
  if (!handler) {
    const payload = JSON.stringify({ error: "Admin route not found." });
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(payload);
    return;
  }
  return handler(request, response);
};
