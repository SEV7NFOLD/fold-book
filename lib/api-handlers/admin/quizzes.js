"use strict";
const crypto = require("crypto");

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

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
      const rows=await supabaseRequest("foldbook_quizzes?select=id,join_code,title,course_code,target_type,target_level,target_registrations,quiz_type,status,current_question,created_at,started_at,finished_at,questions,foldbook_quiz_participants(display_name,score,joined_at)&order=created_at.desc&limit=40");
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
      const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const joinCode=Array.from({length:6},()=>alphabet[crypto.randomInt(alphabet.length)]).join("");
      const rows=await supabaseRequest("foldbook_quizzes",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
        join_code:joinCode,title,course_code:payload.course_code.trim().toUpperCase(),target_type:target,
        target_level:target==="level"?payload.target_level:null,target_registrations:target==="students"?registrations:[],
        quiz_type:type,status:type==="contest"?"lobby":"live",questions,current_question:type==="contest"?-1:0
      })});
      return sendJson(response,201,{quiz:rows?.[0]||null});
    }
    const id=String(payload.id||"");
    const validId=/^[0-9a-f-]{36}$/i.test(id);
    async function loadQuiz(){
      if(!validId)return null;
      const rows=await supabaseRequest("foldbook_quizzes?select=*&id=eq."+encodeURIComponent(id)+"&limit=1");
      return rows?.[0]||null;
    }
    async function answerCount(){
      const rows=await supabaseRequest("foldbook_quiz_answers?select=id&quiz_id=eq."+encodeURIComponent(id)+"&limit=1");
      return rows?.length||0;
    }
    if(action==="host_state"){
      const quiz=await loadQuiz();
      if(!quiz)return sendJson(response,404,{error:"That quiz no longer exists."});
      const [participants,answers]=await Promise.all([
        supabaseRequest("foldbook_quiz_participants?select=reg_number,display_name,score,joined_at&quiz_id=eq."+encodeURIComponent(id)+"&order=joined_at.asc&limit=2000"),
        supabaseRequest("foldbook_quiz_answers?select=reg_number,question_index,answer_index,is_correct&quiz_id=eq."+encodeURIComponent(id)+"&limit=20000"),
      ]);
      const questions=Array.isArray(quiz.questions)?quiz.questions:[];
      const perQuestion=questions.map(q=>({counts:new Array(q.options.length).fill(0),answered:0,correct:0}));
      const progress={};
      for(const a of answers||[]){
        const bucket=perQuestion[a.question_index];
        if(bucket&&a.answer_index<bucket.counts.length){bucket.counts[a.answer_index]+=1;bucket.answered+=1;if(a.is_correct)bucket.correct+=1;}
        const p=progress[a.reg_number]||(progress[a.reg_number]={answered:0,correct:0,answeredCurrent:false});
        p.answered+=1;if(a.is_correct)p.correct+=1;if(a.question_index===quiz.current_question)p.answeredCurrent=true;
      }
      return sendJson(response,200,{quiz,perQuestion,participants:(participants||[]).map(x=>({...x,...(progress[x.reg_number]||{answered:0,correct:0,answeredCurrent:false})}))});
    }
    if(action==="update"){
      const quiz=await loadQuiz();
      if(!quiz)return sendJson(response,404,{error:"That quiz no longer exists."});
      const editable=quiz.status==="draft"||quiz.status==="lobby"||(quiz.quiz_type==="open"&&quiz.status==="live"&&!(await answerCount()));
      if(!editable)return sendJson(response,409,{error:"This quiz has already started, so its questions can’t be changed."});
      const questions=cleanQuestions(payload.questions),title=typeof payload.title==="string"?payload.title.trim().slice(0,120):quiz.title;
      if(title.length<3||!questions)return sendJson(response,400,{error:"Check the title and questions."});
      const rows=await supabaseRequest("foldbook_quizzes?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({title,questions})});
      return sendJson(response,200,{quiz:rows?.[0]||null});
    }
    if(action==="remove_participant"){
      const reg=String(payload.reg_number||"").trim().toUpperCase();
      if(!validId||!REG.test(reg))return sendJson(response,400,{error:"Choose a valid player to remove."});
      const filter="quiz_id=eq."+encodeURIComponent(id)+"&reg_number=eq."+encodeURIComponent(reg);
      await supabaseRequest("foldbook_quiz_answers?"+filter,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      await supabaseRequest("foldbook_quiz_participants?"+filter,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      return sendJson(response,200,{ok:true});
    }
    if(action==="delete"){
      const quiz=await loadQuiz();
      if(!quiz)return sendJson(response,404,{error:"That quiz no longer exists."});
      if(quiz.status==="live")return sendJson(response,409,{error:"End this quiz before deleting it."});
      await supabaseRequest("foldbook_quizzes?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{Prefer:"return=minimal"}});
      return sendJson(response,200,{ok:true});
    }
    if(action==="control"){
      const status=String(payload.status||"");
      if(!validId||!STATUSES.has(status))return sendJson(response,400,{error:"Choose a valid quiz action."});
      const quiz=await loadQuiz();
      if(!quiz)return sendJson(response,404,{error:"That quiz no longer exists."});
      if(quiz.status==="finished")return sendJson(response,409,{error:"This quiz has already ended."});
      const total=Array.isArray(quiz.questions)?quiz.questions.length:0;
      let patch={status};
      if(status==="live"){
        const next=Math.max(0,Number(payload.current_question)||0);
        if(next>=total)return sendJson(response,400,{error:"There are no more questions."});
        patch.current_question=next;
        if(!quiz.started_at)patch.started_at=new Date().toISOString();
      }
      if(status==="finished")patch.finished_at=new Date().toISOString();
      const rows=await supabaseRequest("foldbook_quizzes?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(patch)});
      return sendJson(response,200,{quiz:rows?.[0]||null});
    }
    return sendJson(response,400,{error:"Choose a valid admin quiz action."});
  }catch(error){console.error("Admin quiz request failed:",error.message);return sendJson(response,502,{error:"The quiz service could not complete this request."});}
};