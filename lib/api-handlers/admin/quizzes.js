"use strict";

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

const CODE = /^[A-Z0-9]{6}$/;
const REG = /^(?:[0-9]{12}[A-Z]{2}|[0-9]{2}\/SS\/EC\/[0-9]{1,4})$/;
const TYPES = new Set(["open", "contest"]);
const STATUSES = new Set(["draft", "lobby", "live", "finished"]);
function cleanQuestions(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 30) return null;
  const out=[];
  for (const item of value) {
    if (!item || typeof item.prompt !== "string" || item.prompt.trim().length < 5 || item.prompt.length > 500
      || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6
      || item.options.some((option)=>typeof option!=="string"||!option.trim()||option.length>180)
      || !Number.isInteger(item.answerIndex) || item.answerIndex<0 || item.answerIndex>=item.options.length) return null;
    out.push({prompt:item.prompt.trim(),options:item.options.map(x=>x.trim()),answerIndex:item.answerIndex,
      explanation:typeof item.explanation==="string"?item.explanation.trim().slice(0,400):""});
  }
  return out;
}
module.exports=async function adminQuizHandler(request,response){
  if(!authorizeAdmin(request,response))return;
  if(request.method!=="POST"){response.setHeader("Allow","POST");return sendJson(response,405,{error:"Method not allowed."});}
  let payload;try{payload=await readBody(request);}catch{return sendJson(response,400,{error:"Enter valid quiz details."});}
  try{
    const action=payload?.action;
    if(action==="list"){
      const rows=await supabaseRequest("foldbook_quizzes?select=id,join_code,title,course_code,target_type,target_level,target_registrations,quiz_type,status,current_question,created_at,started_at,finished_at,questions&order=created_at.desc&limit=40");
      return sendJson(response,200,{quizzes:rows||[]});
    }
    if(action==="create"){
      const questions=cleanQuestions(payload.questions), title=typeof payload.title==="string"?payload.title.trim().slice(0,120):"";
      const type=TYPES.has(payload.quiz_type)?payload.quiz_type:"open";
      const target=["all","level","students"].includes(payload.target_type)?payload.target_type:"all";
      const registrations=Array.isArray(payload.target_registrations)?[...new Set(payload.target_registrations.map(x=>String(x).trim().toUpperCase()))]:[];
      if(title.length<3||!questions||!(/^[A-Z]{2,5}\s?\d{3,4}$/i.test(payload.course_code||""))
        ||(target==="level"&&!/^(100L|200L|300L|400L)$/.test(payload.target_level||""))
        ||registrations.some(x=>!REG.test(x))||(target==="students"&&!registrations.length))
        return sendJson(response,400,{error:"Check title, course, audience and questions."});
      const joinCode=String(payload.join_code||"").toUpperCase();
      if(!CODE.test(joinCode))return sendJson(response,400,{error:"A valid six-character join code is required."});
      const rows=await supabaseRequest("foldbook_quizzes",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
        join_code:joinCode,title,course_code:payload.course_code.trim().toUpperCase(),target_type:target,
        target_level:target==="level"?payload.target_level:null,target_registrations:target==="students"?registrations:[],
        quiz_type:type,status:type==="contest"?"lobby":"draft",questions,current_question:-1
      })});
      return sendJson(response,201,{quiz:rows?.[0]||null});
    }
    if(action==="control"){
      const id=String(payload.id||"");const status=String(payload.status||"");
      if(!/^[0-9a-f-]{36}$/i.test(id)||!STATUSES.has(status))return sendJson(response,400,{error:"Choose a valid quiz action."});
      let patch={status};
      if(status==="live")patch={...patch,started_at:new Date().toISOString(),current_question:Math.max(-1,Number(payload.current_question)||0)};
      if(status==="finished")patch.finished_at=new Date().toISOString();
      const rows=await supabaseRequest("foldbook_quizzes?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
      return sendJson(response,200,{quiz:rows?.[0]||null});
    }
    return sendJson(response,400,{error:"Choose a valid admin quiz action."});
  }catch(error){console.error("Admin quiz request failed:",error.message);return sendJson(response,502,{error:"The quiz service could not complete this request."});}
};