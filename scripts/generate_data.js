const fs = require('fs');
const path = require('path');

// Data arrays (copied from project)
const N = "Godspower Esther Gift|Adiele Success Ihuoma|Peter Emmanuella Aniekan|John Mbuotidem Udo|Udofiah Angela Uwana|Ikenyirimba Agezichi Temple|Boniface Joy Aniekan|Junior John Akpan|Godwin Rosemary Johnson|Ezenwoke Blossom Munachimso|Edwin Abasiodiong Samuel|Jack Akaninyene Sunday|Udayi Bibiana Eric|Manuel Ibimina Wesley|Frank Itoro Sylvester|Edem Ubongimoh Ekpo|Atume Peace Kadoo|Inyang Akam Samuel|Udoh Uwakmfon Joseph|Aroyameh Emmanuel Friday|Simon Francis Ndifreke|Egbulonu Kamsiriochukwu Patrick|Umoette Eti-Eno Emem|Isangedighi Hope Bassey|Ibeto Chibueze Lawrence-Divine|Ike-Anasiudu Kamsiyochukwu|Imeobong Goodness Marcus|Maduozo Chiamaka Juliet|Dominic Faith Mkpuruoma|Bawo Success Leemabari|Utioh Abasiodiong Samuel|Jonah Hope Edet|Edet Victor Ndarake|Obinna George Uche|Nathaniel Abasiofon Emmanuel|Uzoma Divinefavour Chiamaka|Ezema Chinenyenwa Immaculata|Abbah Johnson Okoh|Johnson Ubongabasi Ntiedo|Iwhobe Emmanuel Akpelishi|Archibong Omega Essoh|Mfon God'Smiracle Anietie|Udoka Enobong Godswill|Effiong Esther Idongesit|Ime Joyce Sunday|Daniel Victor Oja|Udo Abasiekeme Mfon|Emmanuel Martha Ettete|Utuk Mmeyene Patrick|Marcus Gospel Friday|Esara Kufre Morgan|Wisdom Solomon Chinedum|Ogbonnaya Moses Julius|Iheanyi Benita Chisom|Inyang Godwin Effiong|Asuquo Uyohoini Godwin|Okechukwu Akaolisa Augustine|Udo Abigail Charles|Lorlegalo Ada|Bassey Roselyn|Ubi Obasesam Joseph|Udeagha Happiness Ogochukwu|George Florence Uduakobong|Edet Benita Saturday|Saviour Ediye Proper|Mendie David Victor|Akpan Godwin Blessing|Essien Emem Christian|Hope Christiana Daniel|Nssien Daniel Udia|Umanah Ndipmouwem Sunday|Yellow Andiwam Emmanuel|Chigbo Grace Chisom|Udoidiaha Kannka|Ukandu Prosper Chibuikem|Jumbo Emmanuel Ibidougha|Akalezi Tochukwu Emmanuel|Maurice Etieneabasi Effiong|Okoroafor Stephen Chukwu Emeka|Ogwo Chukwuemeka Valentine|Edet Glory Asuquo|Sunday Johnson Uwemedimo|Idara Daniel Anthony|Francis Emediong Okon|Gabriel Destiny Odah|Uzoma Godsent Ifechukwu|Udofia Olive Kufre|Inyang Favour Abraham|Edem Precious Ndem|Umoh Joy Nse|Okon Akanimo Bassey|Aaron Nsikak Okon|Obioma Blessing Precious|Okiyi Rose Ure|Jeremiah Abasifreke Owoedimo|Edet Elijah Friday|Francis Emmanuel God'Spower|Akpan Glory Francis|Udo David Isaiah|Okon Saviour Ita|Ubok Dorcas Ufon|James Akanimo Jacob|John Solomon Ezinwanne|Stephen Testimony Emmanuel|Ekong Idongesit Etufok|Michael Donald Magnus|Ofem Shedrack Otuekong|Anyanwu Goodluck Chisom|Ebere Evangel Amarachi|Mfon Patience Darlington|Uwa Knoll John".split("|");

const D = {
"ECO 121":"36,57,64,55,46,54,53,41,51,50,65,34,76,40,56,45,50,50,57,70,,45,46,40,31,40,60,41,43,31,61,55,40,45,27,58,40,43,22,47,40,41,54,60,34,46,51,36,43,48,45,66,34,45,35,45,43,41,64,,52,45,36,31,60,52,61,43,56,53,60,45,54,,31,34,31,63,51,33,47,27,40,31,63,42,29,55,38,29,68,30,36,38,53,58,67,51,47,43,38,42,25,,70,35,34,56,47,47,58",
"ECO 122":"54,64,78,50,60,57,53,60,63,33,79,65,82,56,43,60,47,63,50,58,,56,40,53,54,51,63,54,46,61,81,42,50,52,26,68,54,41,24,51,58,38,62,61,36,55,63,43,65,43,32,80,36,47,41,54,51,57,74,29,57,54,36,36,66,56,70,61,60,63,61,54,60,53,23,42,31,73,68,21,60,32,42,47,77,30,43,65,35,57,50,37,37,52,47,50,78,70,60,50,63,47,40,26,48,36,25,63,60,45,54",
"ECO 123":"26,40,67,42,37,30,37,45,34,20,68,34,68,33,46,32,24,24,32,45,,33,36,30,40,42,40,53,26,32,58,43,29,18,46,48,40,28,37,34,67,25,52,40,13,43,40,43,41,,14,67,43,33,30,46,15,34,42,41,28,60,19,27,50,24,30,40,47,28,19,24,33,47,24,32,23,56,36,8,32,22,25,40,62,32,40,57,32,28,45,27,37,33,45,40,72,45,30,32,45,41,20,22,53,41,18,40,28,35,26",
"ECO 127":"60,56,70,71,65,68,63,63,61,65,77,74,72,70,73,58,60,63,72,67,,68,62,61,67,71,71,61,53,50,57,69,74,63,49,69,72,61,47,73,61,58,70,65,58,60,72,66,69,71,53,75,41,70,69,64,73,61,72,67,71,70,52,44,78,76,72,67,68,74,69,58,55,68,49,63,63,72,64,52,64,44,66,65,70,67,67,59,59,58,69,64,47,62,71,64,77,71,69,57,67,70,59,,69,56,47,76,67,56,56",
"ECO 128":"50,70,84,71,68,70,73,61,75,65,85,74,86,71,73,62,50,56,63,75,,45,60,52,66,76,65,56,41,57,71,61,70,66,46,84,65,63,31,63,73,50,63,70,41,67,62,50,62,48,61,88,42,70,55,74,70,68,78,61,76,60,52,30,73,57,78,74,73,70,77,63,53,79,45,46,46,80,73,53,51,16,73,40,75,50,56,66,33,58,72,52,56,60,72,47,88,77,73,54,52,61,46,74,65,50,40,79,72,51,70",
"GST 121":"60,66,70,74,64,66,74,86,56,58,88,76,80,68,76,76,64,66,70,74,78,70,64,64,62,68,68,62,40,60,76,66,62,70,62,66,58,74,30,70,56,48,70,68,62,64,66,46,56,58,62,78,46,68,70,58,48,72,72,66,80,66,,60,74,70,66,60,58,70,70,68,56,62,46,50,58,70,50,58,56,22,66,58,72,60,58,68,52,46,80,48,62,52,72,66,72,56,64,62,68,60,48,70,88,52,64,74,62,60,76"
};

const T = {"ECO 121":"Principles of Economics II","ECO 122":"Introductory Statistics II","ECO 123":"Introductory Mathematics II","ECO 127":"ECO 127","ECO 128":"Intro to Transportation Economics","GST 121":"Nigerian People and Culture","GST 123":"Citizenship and Peace Studies"};

const X = {"19/SS/EC/1592":["Okwubunka Godwin",{"ECO 122":20}],"21/SS/EC/1819":["Eguavoen Victoria Itohan",{"ECO 121":41,"ECO 122":31,"ECO 123":32,"GST 123":66}],"24/SS/EC/267":["Thompson Joseph Akpan",{"ECO 121":40}]};

// create output dir
const outDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// students.csv
const students = [];
for (let i = 0; i < N.length; i++) {
  const reg = `25/SS/EC/${String(i+1).padStart(3, '0')}`;
  students.push({ reg, name: N[i] });
}
// add special X students
for (const r in X) {
  if (!students.find(s => s.reg === r)) {
    students.push({ reg: r, name: X[r][0] });
  }
}

function toCSV(rows, headers) {
  const esc = v => (v === null || v === undefined) ? '' : String(v).replace(/"/g, '""');
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => `"${esc(row[h])}"`).join(','));
  }
  return lines.join('\n');
}

fs.writeFileSync(path.join(outDir, 'students.csv'), toCSV(students, ['reg', 'name']));
console.log('wrote students.csv');

// results.csv
const results = [];
for (const course in D) {
  const arr = D[course].split(',');
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i].trim();
    if (val === '') continue;
    const reg = `25/SS/EC/${String(i+1).padStart(3, '0')}`;
    results.push({ reg, name: N[i] || '', course, course_title: (T[course] || ''), score: Number(val) });
  }
}
// add X entries
for (const r in X) {
  const name = X[r][0];
  const data = X[r][1];
  for (const course in data) {
    results.push({ reg: r, name, course, course_title: (T[course] || ''), score: Number(data[course]) });
  }
}
fs.writeFileSync(path.join(outDir, 'results.csv'), toCSV(results, ['reg', 'name', 'course', 'course_title', 'score']));
console.log('wrote results.csv');

// announcements.csv
const ANNOUNCEMENTS = [
  { when: '2026-08-10', text: 'Departmental meeting for 100L students on Monday 9am. Attendance compulsory.' },
  { when: '2026-08-01', text: 'Resit registration opens next week. See the exams office for details.' },
  { when: '2026-07-20', text: 'Results for Economics 100L have been published — check Fold Book results tab.' }
];
fs.writeFileSync(path.join(outDir, 'announcements.csv'), toCSV(ANNOUNCEMENTS, ['when', 'text']));
console.log('wrote announcements.csv');

// timetable.csv
const TIMETABLE = [
  { day: 'Mon', time: '09:00', course: 'ECO 121', room: 'Rm A1' },
  { day: 'Mon', time: '11:00', course: 'GST 121', room: 'Rm B2' },
  { day: 'Tue', time: '09:00', course: 'ECO 122', room: 'Rm A1' },
  { day: 'Wed', time: '10:00', course: 'ECO 127', room: 'Hall 3' },
  { day: 'Thu', time: '13:00', course: 'ECO 128', room: 'Rm C4' },
  { day: 'Fri', time: '09:00', course: 'Tutorial', room: 'Lab 1' }
];
fs.writeFileSync(path.join(outDir, 'timetable.csv'), toCSV(TIMETABLE, ['day', 'time', 'course', 'room']));
console.log('wrote timetable.csv');

console.log('All CSV files generated in data/');
