const $=s=>document.querySelector(s);
const S={side:'Proposition',files:[],saved:new Set(),plan:null,extra:[]};
const esc=t=>String(t??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split(/\n{2,}/).map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('');
const store=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}};
$('#lang').value=store('k_lang')||'en-US';
$('#lang').addEventListener('change',()=>store('k_lang',$('#lang').value));

// tabs
function tab(n){$('#v1').classList.toggle('hide',n!=1);$('#v2').classList.toggle('hide',n!=2);$('#t1').classList.toggle('on',n==1);$('#t2').classList.toggle('on',n==2)}
$('#t1').onclick=()=>tab(1);$('#t2').onclick=()=>tab(2);

// side
document.querySelectorAll('.side button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.side button').forEach(x=>x.classList.remove('on'));b.classList.add('on');S.side=b.dataset.s});

// files
const drop=$('#drop'),fi=$('#file');
drop.onclick=()=>fi.click();
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};
drop.ondragleave=()=>drop.classList.remove('over');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');addFiles(e.dataTransfer.files)};
fi.onchange=()=>{addFiles(fi.files);fi.value=''};
const MAX=3*1024*1024;
function addFiles(list){
  [...list].forEach(f=>{
    if(S.files.reduce((a,x)=>a+x.size,0)+f.size>MAX){$('#err').textContent='Files are limited to 3 MB in total. "'+f.name+'" was not added.';return}
    $('#err').textContent='';S.files.push(f);
  });showFiles();
}
function showFiles(){$('#files').innerHTML=S.files.map((f,i)=>`<span class="chip">${esc(f.name)} <button data-i="${i}" aria-label="Remove">&times;</button></span>`).join('');
  document.querySelectorAll('#files button').forEach(b=>b.onclick=()=>{S.files.splice(+b.dataset.i,1);showFiles()})}
const b64=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f)});
async function fileParts(){
  const p=[];
  for(const f of S.files){
    if(/\.(txt|md)$/i.test(f.name)||f.type.startsWith('text/')) p.push({text:`File "${f.name}":\n`+await f.text()});
    else p.push({inlineData:{mimeType:f.type||(f.name.endsWith('.pdf')?'application/pdf':'image/jpeg'),data:await b64(f)}});
  }
  return p;
}

// Gemini
async function gem(parts,{json=false,search=false}={}){
  const r=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parts,json,search})});
  let d;try{d=await r.json()}catch(e){throw new Error('The server did not respond. Try again.')}
  if(!r.ok) throw new Error(d.error||'Request failed');
  if(!d.text) throw new Error('The AI returned no answer. Try again.');
  return json?JSON.parse(d.text.replace(/^```json|```$/g,'').trim()):d.text;
}
// save uploaded files to Google Drive (runs in the background)
async function saveToDrive(){
  const day=new Date().toISOString().slice(0,10);
  let ok=0;
  for(const f of S.files){
    if(S.saved.has(f)) {ok++;continue}
    try{
      const r=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:day+'_'+f.name,mime:f.type,data:await b64(f)})});
      if(r.ok){S.saved.add(f);ok++}
    }catch(e){}
  }
  return ok;
}
const langName=()=>$('#lang').value==='si-LK'?'Sinhala':'English';

// Build case
$('#go').onclick=async()=>{
  const topic=$('#topic').value.trim();
  if(!topic){$('#err').textContent='Enter a topic first.';return}
  $('#err').textContent='';$('#go').disabled=true;$('#st').textContent='Scanning your material...';
  try{
    const parts=[{text:`You are a debate coach. Motion: "${topic}". The team is on the ${S.side}.
Team notes: ${$('#notes').value||'(none)'}
Read the notes and every attached file. Return JSON only:
{"summary":"2-3 sentence overview of the team's position","points":[{"claim":"...","evidence":"specific facts, numbers or quotes from the material","source":"file name or notes"}],"weaknesses":["gaps the other team could attack"]}
Write in ${langName()}. Use only facts found in the material.`},...await fileParts()];
    const saving=S.files.length?saveToDrive():Promise.resolve(0);
    S.plan=await gem(parts,{json:true});
    renderCase();
    const n=await saving;
    if(S.files.length) $('#st').textContent=n===S.files.length?'Files saved to Drive':'Some files were not saved to Drive';
  }catch(e){$('#err').textContent=e.message;$('#st').textContent=''}
  $('#go').disabled=false;
};
function renderCase(){
  const p=S.plan;if(!p)return;
  $('#caseBox').classList.remove('hide');
  $('#caseOut').innerHTML=`<p>${esc(p.summary)}</p>`+(p.points||[]).map(x=>`<div class="pt"><b>${esc(x.claim)}</b><div class="ev">${esc(x.evidence)}</div><div class="note">${esc(x.source)}</div></div>`).join('')+
    ((p.weaknesses||[]).length?`<h3 style="margin:18px 0 8px;font-size:17px">Where they may attack you</h3>`+p.weaknesses.map(w=>`<div class="pt"><span class="tag">gap</span>${esc(w)}</div>`).join(''):'');
}

// Search
$('#srch').onclick=async()=>{
  const q=$('#q').value.trim();if(!q)return;
  $('#srch').disabled=true;
  try{
    const t=await gem([{text:`Debate motion: "${$('#topic').value}". Our side: ${S.side}. Research this and give concise, factual findings with numbers, dates and source names: ${q}\nWrite in ${langName()}.`}],{search:true});
    S.extra.push({q,text:t});renderExtra();$('#q').value='';
  }catch(e){$('#extra').innerHTML=`<div class="err">${esc(e.message)}</div>`}
  $('#srch').disabled=false;
};
function renderExtra(){$('#extra').innerHTML=S.extra.map(x=>`<div class="pt"><b>${esc(x.q)}</b><div class="md ev">${md(x.text)}</div></div>`).join('')}

// Live debate
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null,live=false,finalT='';
$('#mic').onclick=()=>{live?stop():start()};
function start(){
  if(!SR){$('#err2').textContent='Speech recognition is not supported here. Use Chrome or Edge, or type the transcript.';return}
  $('#err2').textContent='';finalT=$('#tr').value?$('#tr').value+' ':'';
  rec=new SR();rec.lang=$('#lang').value;rec.continuous=true;rec.interimResults=true;
  rec.onresult=e=>{let it='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalT+=t+' ';else it+=t}$('#tr').value=finalT+it};
  rec.onerror=e=>{if(e.error==='not-allowed'||e.error==='service-not-allowed'){$('#err2').textContent='Mic access is blocked. Allow the microphone for this page.';live=false;ui()}};
  rec.onend=()=>{if(live){try{rec.start()}catch(e){}}};
  live=true;rec.start();ui();
}
function stop(){live=false;if(rec)rec.stop();$('#tr').value=finalT.trim();ui()}
function ui(){$('#mic').classList.toggle('live',live);$('#mst').textContent=live?'Listening to the other team...':'Mic is off'}
$('#clr').onclick=()=>{$('#tr').value='';finalT='';$('#resBox').classList.add('hide')};

$('#brk').onclick=async()=>{
  if(live)stop();
  const tr=$('#tr').value.trim();
  if(!tr){$('#err2').textContent='There is no transcript yet.';return}
  $('#err2').textContent='';$('#brk').disabled=true;$('#brk').textContent='Analysing...';
  try{
    const ours=JSON.stringify(S.plan||{})+'\nExtra research:\n'+S.extra.map(x=>x.q+': '+x.text).join('\n');
    const r=await gem([{text:`You are a debate coach. Motion: "${$('#topic').value}". Our team is the ${S.side}.
OUR CASE AND EVIDENCE:\n${ours}\n\nTHE OTHER TEAM SAID (speech transcript, may have errors):\n${tr}

Break down the other team's speech. Return JSON only:
{"points":[{"claim":"their argument","flaw":"logical flaw, missing evidence or weak link","rebuttal":"what we should say, 1-3 sentences, using our evidence where it fits","use":"which of our points or research supports the rebuttal, or empty"}],"questions":["sharp points of information to ask them"],"closing":"a 2-sentence line to land at the end"}
Write in ${langName()}.`}],{json:true});
    $('#resBox').classList.remove('hide');
    $('#res').innerHTML=(r.points||[]).map(x=>`<div class="pt"><b>${esc(x.claim)}</b><div><span class="tag">flaw</span>${esc(x.flaw)}</div><div class="reb"><span class="tag ok">answer</span>${esc(x.rebuttal)}${x.use?`<div class="note">Backed by: ${esc(x.use)}</div>`:''}</div></div>`).join('')+
      ((r.questions||[]).length?`<h3 style="margin:18px 0 8px;font-size:17px">Questions to ask</h3>`+r.questions.map(q=>`<div class="pt">${esc(q)}</div>`).join(''):'')+
      (r.closing?`<h3 style="margin:18px 0 8px;font-size:17px">Closing line</h3><p>${esc(r.closing)}</p>`:'');
    $('#resBox').scrollIntoView({behavior:'smooth'});
  }catch(e){$('#err2').textContent=e.message}
  $('#brk').disabled=false;$('#brk').textContent='Break their arguments';
};