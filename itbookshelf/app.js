/* ================= helpers ================= */
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
function emptyCtaHTML(){ return `<button class="emptyCta">📮 Can't find it? Suggest it →</button>`; }
function wireEmptyCta(container){
  const btn = container.querySelector('.emptyCta');
  if(btn) btn.addEventListener('click', ()=>{ document.getElementById('suggestSection').scrollIntoView({behavior:'smooth'}); });
}

function levenshtein(a,b){
  const m=a.length, n=b.length;
  if(!m) return n; if(!n) return m;
  const dp = Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
  }
  return dp[m][n];
}
function matchScore(query, target){
  const q = norm(query), t = norm(target);
  if(!q) return 0;
  if(t.startsWith(q)) return 100 - Math.min(t.length-q.length,20)*0.2;
  if(t.includes(q)) return 75 - Math.min(t.length-q.length,20)*0.2;
  const qWords = q.split(' ').filter(Boolean);
  if(qWords.length>1 && qWords.every(w=>t.includes(w))) return 55;
  if(q.length>=4){
    const chunk = t.slice(0, q.length+4);
    const d = levenshtein(q, chunk);
    const tol = Math.max(1, Math.floor(q.length/3));
    if(d<=tol) return 45 - d*6;
  }
  // whole-string fuzzy fallback for short titles
  if(q.length>=3 && t.length<=q.length+6){
    const d = levenshtein(q,t);
    if(d<=Math.max(2,Math.floor(q.length/2))) return 35-d*5;
  }
  return -1;
}

/* ================= state ================= */
let currentDept = 'ALL';
let bookmarks = new Set(JSON.parse(localStorage.getItem('shelfie_bookmarks')||'[]'));

function bmKey(b){ return b.title.toLowerCase()+'|'+b.author.toLowerCase(); }
function saveBookmarks(){ localStorage.setItem('shelfie_bookmarks', JSON.stringify([...bookmarks])); updateShelfCount(); }
function updateShelfCount(){ document.getElementById('shelfCount').textContent = bookmarks.size; }

function deptFiltered(){ return currentDept==='ALL' ? BOOKS : BOOKS.filter(b=>b.dept===currentDept); }

/* ================= subjects derived ================= */
function buildSubjects(list){
  const map = new Map();
  list.forEach(b=>{
    const k = b.subject.toLowerCase();
    if(!map.has(k)) map.set(k, {name:b.subject, code:b.subjectCode, semester:b.semester, depts:new Set(), books:[]});
    const s = map.get(k);
    s.depts.add(b.dept);
    s.books.push(b);
    if(!s.code && b.subjectCode){ s.code=b.subjectCode; s.semester=b.semester; }
  });
  return [...map.values()];
}

/* ================= book card ================= */
function bookCardHTML(b, idx){
  const key = bmKey(b);
  const saved = bookmarks.has(key);
  return `<div class="bookcard ${b.dept}" style="animation-delay:${(idx%12)*0.04}s">
    <button class="heartbtn ${saved?'saved':''}" data-key="${key}" title="bookmark this">❤️</button>
    <h4>${b.title}</h4>
    <div class="author">${b.author}</div>
    <div class="metarow">
      <span class="badge badge-dept-${b.dept}">${b.dept==='IT'?'💻 IT':'🤖 AI-DS'}</span>
      ${b.semester ? `<span class="badge badge-sem">Sem ${b.semester}</span>` : `<span class="badge badge-sem">Elective</span>`}
      <span class="badge badge-subj" data-subj="${b.subject}">${b.subject}</span>
    </div>
    <div class="pub">📗 ${b.publisher}${b.qty?` · Qty requested: ${b.qty}`:''}</div>
  </div>`;
}
function wireCards(container){
  container.querySelectorAll('.heartbtn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const key = btn.dataset.key;
      if(bookmarks.has(key)){ bookmarks.delete(key); btn.classList.remove('saved'); }
      else{ bookmarks.add(key); btn.classList.add('saved'); btn.style.animation='none'; requestAnimationFrame(()=>{btn.style.animation='pulseHeart .4s ease';}); }
      saveBookmarks(); renderShelfTab();
    });
  });
  container.querySelectorAll('.badge-subj').forEach(b=>{
    b.addEventListener('click', ()=>{
      switchTab('subject');
      document.getElementById('subjectInput').value = b.dataset.subj;
      runSubjectSearch(b.dataset.subj);
      document.getElementById('hub').scrollIntoView({behavior:'smooth'});
    });
  });
}

/* ================= tabs ================= */
function switchTab(name){
  document.querySelectorAll('.tabbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tabpanel').forEach(p=>p.classList.toggle('active', p.id==='tab-'+name));
}
document.querySelectorAll('.tabbtn').forEach(b=>b.addEventListener('click', ()=>switchTab(b.dataset.tab)));

/* ================= dept toggle ================= */
document.querySelectorAll('.dchip').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.dchip').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    currentDept = b.dataset.d;
    renderStats();
    renderSemChips();
    document.getElementById('semesterResults').innerHTML='';
    // refresh whichever search is active
    const si = document.getElementById('subjectInput');
    if(si.value.trim()) runSubjectSearch(si.value);
    const bi = document.getElementById('bookInput');
    if(bi.value.trim()) runBookSearch(bi.value);
  });
});

/* ================= stats bar ================= */
function renderStats(){
  const list = deptFiltered();
  const subjects = buildSubjects(list);
  const authors = new Set(list.map(b=>b.author.toLowerCase()));
  const stats = [
    [list.length, '📚 books'],
    [subjects.length, '🎓 subjects'],
    [authors.size, '✍️ authors'],
  ];
  const bar = document.getElementById('statbar');
  bar.innerHTML = stats.map(s=>`<div class="statpill"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
}

/* ================= subject tab ================= */
function runSubjectSearch(query){
  const list = deptFiltered();
  const subjects = buildSubjects(list);
  const box = document.getElementById('subjectResults');
  if(!query || !query.trim()){ box.innerHTML=''; return; }
  const scored = subjects.map(s=>({s, sc:matchScore(query,s.name)})).filter(x=>x.sc>=0).sort((a,b)=>b.sc-a.sc);
  if(!scored.length){
    box.innerHTML = `<div class="empty"><div class="big">🕵️‍♀️</div>No subject matches "${query}". Maybe try a shorter word?${emptyCtaHTML()}</div>`;
    wireEmptyCta(box);
    return;
  }
  const top = scored[0].s;
  box.innerHTML = `<div class="resultsHead">📖 ${top.books.length} book${top.books.length!==1?'s':''} recommended for <b>${top.name}</b>${top.semester?` · Semester ${top.semester}`:''}</div>
    <div class="grid">${top.books.map((b,i)=>bookCardHTML(b,i)).join('')}</div>`;
  wireCards(box);
}
document.getElementById('subjectInput').addEventListener('input', (e)=>{
  const q = e.target.value;
  const list = deptFiltered();
  const subjects = buildSubjects(list);
  const ac = document.getElementById('subjectAC');
  if(!q.trim()){ ac.classList.remove('show'); document.getElementById('subjectResults').innerHTML=''; return; }
  const scored = subjects.map(s=>({s, sc:matchScore(q,s.name)})).filter(x=>x.sc>=0).sort((a,b)=>b.sc-a.sc).slice(0,7);
  if(!scored.length){ ac.classList.remove('show'); }
  else{
    ac.innerHTML = scored.map(x=>`<div class="acitem" data-name="${x.s.name}">${x.s.name} <small>${x.s.books.length} book${x.s.books.length!==1?'s':''}${x.s.semester?' · Sem '+x.s.semester:''}</small></div>`).join('');
    ac.classList.add('show');
    ac.querySelectorAll('.acitem').forEach(it=>it.addEventListener('click', ()=>{
      document.getElementById('subjectInput').value = it.dataset.name;
      ac.classList.remove('show');
      runSubjectSearch(it.dataset.name);
    }));
  }
  runSubjectSearch(q);
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.searchbox')) document.querySelectorAll('.acdrop').forEach(a=>a.classList.remove('show'));
});

/* ================= semester tab ================= */
function renderSemChips(){
  const list = deptFiltered();
  const subjects = buildSubjects(list);
  const sems = [...new Set(subjects.map(s=>s.semester).filter(Boolean))].sort((a,b)=>a-b);
  const hasElective = subjects.some(s=>!s.semester);
  const row = document.getElementById('semRow');
  row.innerHTML = sems.map(s=>`<button class="semchip" data-sem="${s}"><b>${s}</b><span>SEM</span></button>`).join('')
    + (hasElective ? `<button class="semchip elective" data-sem="elective"><b>✦</b><span>ELECTIVE</span></button>` : '');
  row.querySelectorAll('.semchip').forEach(chip=>chip.addEventListener('click', ()=>{
    row.querySelectorAll('.semchip').forEach(c=>c.classList.remove('active'));
    chip.classList.add('active');
    renderSemesterResults(chip.dataset.sem);
  }));
}
function renderSemesterResults(sem){
  const list = deptFiltered();
  const subjects = buildSubjects(list).filter(s=> sem==='elective' ? !s.semester : s.semester===+sem);
  const box = document.getElementById('semesterResults');
  if(!subjects.length){ box.innerHTML = `<div class="empty"><div class="big">📭</div>Nothing filed here yet.</div>`; return; }
  box.innerHTML = `<div class="resultsHead">${subjects.length} subject${subjects.length!==1?'s':''} · ${subjects.reduce((s,x)=>s+x.books.length,0)} books</div>` +
    subjects.map((s,i)=>`
    <div class="acc" data-i="${i}">
      <div class="acc-head">
        <span>${s.name} ${s.code?`<span class="mono" style="font-size:.72rem; color:var(--muted);">(${s.code})</span>`:''}</span>
        <span style="display:flex; align-items:center; gap:10px;"><span class="badge badge-subj" style="cursor:default;">${s.books.length} book${s.books.length!==1?'s':''}</span><span class="chev">⌄</span></span>
      </div>
      <div class="acc-body"><div class="acc-body-inner"><div class="grid">${s.books.map((b,j)=>bookCardHTML(b,j)).join('')}</div></div></div>
    </div>`).join('');
  box.querySelectorAll('.acc-head').forEach(h=>h.addEventListener('click', ()=>h.parentElement.classList.toggle('open')));
  wireCards(box);
}

/* ================= book tab ================= */
function runBookSearch(query){
  const list = deptFiltered();
  const box = document.getElementById('bookResults');
  if(!query || !query.trim()){ box.innerHTML=''; return; }
  const scored = list.map(b=>({b, sc:matchScore(query,b.title)})).filter(x=>x.sc>=0).sort((a,b)=>b.sc-a.sc);
  if(!scored.length){ box.innerHTML = `<div class="empty"><div class="big">📭</div>No book titled anything like "${query}". Try fewer words!${emptyCtaHTML()}</div>`; wireEmptyCta(box); return; }
  showBookDetail(scored[0].b);
}
function showBookDetail(b){
  const box = document.getElementById('bookResults');
  const list = deptFiltered();
  const shelfmates = list.filter(x=> x.subject.toLowerCase()===b.subject.toLowerCase() && x.title!==b.title);
  box.innerHTML = `
    <div class="detailcard">
      <h3>${b.title}</h3>
      <div class="author">by ${b.author}</div>
      <div class="detailgrid">
        <div class="detailitem"><span>Publisher</span><b>${b.publisher}</b></div>
        <div class="detailitem"><span>Department</span><b>${b.dept==='IT'?'💻 IT':'🤖 AI-DS'}</b></div>
        <div class="detailitem"><span>Subject</span><b>${b.subject}</b></div>
        <div class="detailitem"><span>Semester</span><b>${b.semester?('Semester '+b.semester):'Elective / N.A.'}</b></div>
        <div class="detailitem"><span>Qty requested</span><b>${b.qty||'—'}</b></div>
      </div>
    </div>
    ${shelfmates.length? `<div class="resultsHead">👀 ${shelfmates.length} more pick${shelfmates.length!==1?'s':''} for ${b.subject}</div><div class="grid">${shelfmates.map((s,i)=>bookCardHTML(s,i)).join('')}</div>` : ''}
  `;
  wireCards(box);
}
document.getElementById('bookInput').addEventListener('input', (e)=>{
  const q = e.target.value;
  const list = deptFiltered();
  const ac = document.getElementById('bookAC');
  if(!q.trim()){ ac.classList.remove('show'); document.getElementById('bookResults').innerHTML=''; return; }
  const scored = list.map(b=>({b, sc:matchScore(q,b.title)})).filter(x=>x.sc>=0).sort((a,b)=>b.sc-a.sc).slice(0,7);
  if(!scored.length){ ac.classList.remove('show'); }
  else{
    ac.innerHTML = scored.map(x=>`<div class="acitem" data-title="${x.b.title.replace(/"/g,'&quot;')}">${x.b.title} <small>${x.b.subject}</small></div>`).join('');
    ac.classList.add('show');
    ac.querySelectorAll('.acitem').forEach(it=>it.addEventListener('click', ()=>{
      document.getElementById('bookInput').value = it.dataset.title;
      ac.classList.remove('show');
      const match = list.find(b=>b.title===it.dataset.title);
      if(match) showBookDetail(match);
    }));
  }
  runBookSearch(q);
});

/* ================= surprise me ================= */
document.getElementById('surpriseBtn').addEventListener('click', ()=>{
  const list = deptFiltered();
  const b = list[Math.floor(Math.random()*list.length)];
  const box = document.getElementById('surpriseCard');
  box.innerHTML = `<div class="grid" style="grid-template-columns:1fr;">${bookCardHTML(b,0)}</div>`;
  box.querySelector('.bookcard').style.animation = 'cardIn .5s cubic-bezier(.34,1.56,.64,1)';
  wireCards(box);
});

/* ================= shelf trivia ================= */
function renderFunFacts(){
  const list = deptFiltered();
  const pubCounts = new Map(); list.forEach(b=>pubCounts.set(b.publisher,(pubCounts.get(b.publisher)||0)+1));
  const topPub = [...pubCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const subjCounts = buildSubjects(list).sort((a,b)=>b.books.length-a.books.length)[0];
  const authors = new Set(list.map(b=>b.author.toLowerCase()));
  const facts = [
    ['🏢','Top publisher', `${topPub[0]} (${topPub[1]} books)`],
    ['📚','Best-stocked subject', `${subjCounts.name} (${subjCounts.books.length} books)`],
    ['✍️','Author pool', `${authors.size} different authors on the shelf`],
  ];
  document.getElementById('funfacts').innerHTML = facts.map(f=>`<div class="funcard"><div class="fico">${f[0]}</div><h4>${f[1]}</h4><p>${f[2]}</p></div>`).join('');
}

/* ================= shelf tab (bookmarked/liked books) ================= */
function renderShelfTab(){
  const box = document.getElementById('shelfResults');
  if(!box) return;
  if(!bookmarks.size){
    box.innerHTML = `<div class="empty"><div class="big">🦗</div>Your shelf's emptier than a library on exam day. Tap the ❤️ on any book to save it here.</div>`;
    return;
  }
  const items = [...bookmarks].map(key=>{
    const [t,a] = key.split('|');
    return BOOKS.find(b=>b.title.toLowerCase()===t && b.author.toLowerCase()===a);
  }).filter(Boolean);
  box.innerHTML = `<div class="resultsHead">❤️ ${items.length} book${items.length!==1?'s':''} on your shelf</div>
    <div class="grid">${items.map((b,i)=>bookCardHTML(b,i)).join('')}</div>`;
  wireCards(box);
}
document.getElementById('shelfBtn').addEventListener('click', ()=>{
  switchTab('shelf');
  renderShelfTab();
  document.getElementById('hub').scrollIntoView({behavior:'smooth'});
});

/* ================= suggest-a-book (mail-in) ================= */
document.getElementById('suggestBtn').addEventListener('click', ()=>{
  const title = document.getElementById('sugTitle').value.trim();
  const author = document.getElementById('sugAuthor').value.trim();
  const publisher = document.getElementById('sugPublisher').value.trim();
  const subject = document.getElementById('sugSubject').value.trim();
  const lines = [
    "Hi,", "",
    "I'd like to suggest / ask about a book for the IT & AI-DS library shelf:", "",
    `Book title: ${title || '(not specified)'}`,
    `Author: ${author || '(not specified)'}`,
    `Publisher: ${publisher || '(not specified)'}`,
    `Subject: ${subject || '(not specified)'}`, "",
    "Thanks!"
  ];
  const body = encodeURIComponent(lines.join('\n'));
  const subjLine = encodeURIComponent('Shelfie book suggestion' + (title ? ' — ' + title : ''));
  window.location.href = `mailto:bhumika.patel@scet.ac.in,bhumika.shah@scet.ac.in?subject=${subjLine}&body=${body}`;
});

/* ================= reveal on scroll ================= */
const io = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('show'); io.unobserve(en.target);} }); },{threshold:0.1});
document.querySelectorAll('.reveal').forEach(e=>io.observe(e));

/* pulse keyframes injected via JS (kept out of static CSS to keep it lean) */
const styleTag = document.createElement('style');
styleTag.textContent = `@keyframes pulseHeart{0%{transform:scale(1);}50%{transform:scale(1.4);}100%{transform:scale(1.15);}}`;
document.head.appendChild(styleTag);

/* ================= init ================= */
updateShelfCount();
renderStats();
renderSemChips();
renderFunFacts();
renderShelfTab();
