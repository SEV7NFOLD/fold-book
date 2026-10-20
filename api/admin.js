"use strict";

const routes = {
  broadsheets: require("../lib/api-handlers/admin/broadsheets.js"),
  "course-catalog": require("../lib/api-handlers/admin/course-catalog.js"),
  "course-materials": require("../lib/api-handlers/admin/course-materials.js"),
  materials: require("../lib/api-handlers/admin/materials.js"),
  results: require("../lib/api-handlers/admin/results.js"),
  session: require("../lib/api-handlers/admin/session.js"),
  "student-materials": require("../lib/api-handlers/admin/student-materials.js"),
  "student-records": require("../lib/api-handlers/admin/student-records.js"),
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
