"use strict";
const { readSession, isSameOriginRequest, sendJson } = require("./auth.js");
const MAX_BODY=18000;
async function readBody(request){if(request.body!==undefined){const t=typeof request.body==="string"?request.body:JSON.stringify(request.body);if(Buffer.byteLength(t)>MAX_BODY)throw new RangeError();return typeof request.body==="string"?JSON.parse(request.body):request.body;}const chunks=[];let n=0;for await(const c of request){n+=c.length;if(n>MAX_BODY)throw new RangeError();chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
function db(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Database unavailable");return{url:url.replace(/\/$/,""),key};}
async function request(path,options={}){const c=db();const r=await fetch(c.url+"/rest/v1/"+path,{...options,headers:{apikey:c.key,Authorization:"Bearer "+c.key,...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});const t=await r.text();let j;try{j=t?JSON.parse(t):null;}catch{}if(!r.ok)throw new Error("Database request failed");return j;}
function code(v){return typeof v==="string"&&/^[A-Z0-9]{6}$/.test(v.toUpperCase())?v.toUpperCase():"";}
function publicQuiz(q,includeQuestion=false,index=-1){const out={id:q.id,join_code:q.join_code,title:q.title,course_code:q.course_code,quiz_type:q.quiz_type,status:q.status,current_question:q.current_question,started_at:q.started_at,finished_at:q.finished_at};if(includeQuestion&&q.questions?.[index]){const x=q.questions[index];out.question={prompt:x.prompt,options:x.options,explanation:x.explanation};}return out;}
module.exports=async function studentQuiz(request,response){
 if(!isSameOriginRequest(request))return sendJson(response,403,{error:"A same-origin request is required."});
 const session=readSession(request);if(!session)return sendJson(response,401,{error:"Please sign in again."});
 if(request.method!=="POST")return sendJson(response,405,{error:"Method not allowed."});
 let p;try{p=await readBody(request);}catch{return sendJson(response,400,{error:"Enter valid quiz details."});}
 const registration=String(session.registration||"").toUpperCase(),join=code(p?.joinCode),action=p?.action;
 try{
  if(action==="list"){
   const level=String(p.level||"");const course=String(p.courseCode||"").toUpperCase();
   const rows=await request("foldbook_quizzes?select=id,join_code,title,course_code,quiz_type,status,current_question,started_at,finished_at,target_type,target_level,target_registrations&status=in.(lobby,live)&order=created_at.desc&limit=50");
   const quizzes=(rows||[]).filter(q=>q.target_type==="all"||(q.target_type==="level"&&q.target_level===level)||(q.target_type==="students"&&q.target_registrations?.includes(registration)))
    .filter(q=>!q.course_code||!course||q.course_code===course).map(q=>publicQuiz(q));
   return sendJson(response,200,{quizzes});
  }
  if(!join)return sendJson(response,400,{error:"Enter the six-character quiz code."});
  let rows=await request("foldbook_quizzes?select=*&join_code=eq."+encodeURIComponent(join)+"&limit=1");
  const quiz=rows?.[0];if(!quiz)return sendJson(response,404,{error:"We couldn’t find that quiz code."});
  if(quiz.target_type==="level"&&quiz.target_level!==session.level)return sendJson(response,403,{error:"This quiz is for a different level."});
  if(quiz.target_type==="students"&&!quiz.target_registrations?.includes(registration))return sendJson(response,403,{error:"Your account isn’t on this quiz’s invite list."});
  if(action==="join"){
   await request("foldbook_quiz_participants?on_conflict=quiz_id,reg_number",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({quiz_id:quiz.id,reg_number:registration,display_name:String(session.name||"Student").slice(0,100)})});
   return sendJson(response,200,{quiz:publicQuiz(quiz)});
  }
  const participants=await request("foldbook_quiz_participants?select=score&quiz_id=eq."+encodeURIComponent(quiz.id)+"&reg_number=eq."+encodeURIComponent(registration)+"&limit=1");
  if(!participants?.length)return sendJson(response,403,{error:"Join this quiz first."});
  if(action==="state"){
   const idx=Number.isInteger(quiz.current_question)?quiz.current_question:-1;
   const answerRows=idx>=0?await request("foldbook_quiz_answers?select=question_index&quiz_id=eq."+encodeURIComponent(quiz.id)+"&reg_number=eq."+encodeURIComponent(registration)+"&question_index=eq."+idx+"&limit=1"):[];
   const current=quiz.status==="live"&&idx>=0&&quiz.questions?.[idx]&&!answerRows?.length;
   return sendJson(response,200,{quiz:publicQuiz(quiz,current,idx),questionIndex:idx,score:participants[0].score});
  }
  if(action==="answer"){
   if(quiz.status!=="live"||Number(p.questionIndex)!==quiz.current_question)return sendJson(response,409,{error:"That question is no longer open."});
   const qi=quiz.current_question,ai=Number(p.answerIndex),q=quiz.questions?.[qi];
   if(!q||!Number.isInteger(ai)||ai<0||ai>=q.options.length)return sendJson(response,400,{error:"Choose one of the available answers."});
   const correct=ai===q.answerIndex;
   const answer=await request("foldbook_quiz_answers?on_conflict=quiz_id,reg_number,question_index",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify({quiz_id:quiz.id,reg_number:registration,question_index:qi,answer_index:ai,is_correct:correct})});
   if(answer?.length&&correct)await request("foldbook_quiz_participants?quiz_id=eq."+encodeURIComponent(quiz.id)+"&reg_number=eq."+encodeURIComponent(registration),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({score:participants[0].score+100})});
   return sendJson(response,200,{ok:true});
  }
  return sendJson(response,400,{error:"Choose a valid quiz action."});
 }catch(error){console.error("Student quiz request failed:",error.message);return sendJson(response,503,{error:"The quiz is temporarily unavailable."});}
};