"use strict";

module.exports = async function studentQuizRouter(request, response) {
  return require("../../lib/api-handlers/student/quiz.js")(request,response);
};