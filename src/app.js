(() => {
  // --------- Helpers ---------
  const rndInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const choice=arr=>arr[Math.floor(Math.random()*arr.length)];
  const rand=(a=1,b=0)=>Math.random()*(a-b)+b;

  // --------- Graph ---------
  const G={nodes:new Map(),edges:new Set(),nextId:0};
  const YOU=0;
  const friends=new Set();

  function addNode({friendly=Math.random(),type='normal',score=0}={}){
    const id=G.nextId++; G.nodes.set(id,{id,x:0,y:0,friendly,type,score}); return id;
  }
  const edgeKey=(u,v)=>u<v?`${u}-${v}`:`${v}-${u}`;
  function addEdge(u,v){ if(u===v) return false; const k=edgeKey(u,v);
    if(G.edges.has(k)||!G.nodes.has(u)||!G.nodes.has(v)) return false;
    G.edges.add(k); return true;
  }
  function removeNode(id){
    if(!G.nodes.has(id)) return;
    const del=[]; for(const k of G.edges){ const [a,b]=k.split('-').map(Number); if(a===id||b===id) del.push(k); }
    for(const k of del) G.edges.delete(k); friends.delete(id); G.nodes.delete(id);
  }
  function neighbors(id){ const out=[]; for(const k of G.edges){ const [a,b]=k.split('-').map(Number); if(a===id) out.push(b); else if(b===id) out.push(a);} return out; }

  // --------- Layout ---------
  function layout(){
    const n=G.nodes.size, R=Math.max(180,Math.min(innerWidth,innerHeight)*0.35);
    let i=0; const you=G.nodes.get(YOU); if(you){ you.x=0; you.y=0; }
    for(const node of G.nodes.values()){
      if(node.id===YOU) continue;
      const t=(i/Math.max(1,n-1))*Math.PI*2;
      node.x=R*Math.cos(t)+rand(-20,20); node.y=R*Math.sin(t)+rand(-20,20); i++;
    }
  }

  // --------- Parameters / State (defaults aligned with UI) ---------
  let t=0;
  let zMax=5, ePer=2, k=7, shockPeriod=3, purgePeriod=10, B=10;
  let budget=B;

  // shock params (aligned with UI)
  let pPos=2.0, nNeg=-1.0, pNeg=0.80, Dscore=1.0;

  let auto=null, gameOver=false;
  let picking=false, wasAutoBeforePick=false;

  let lastSplash=null; // {src, affected:Set, kind:'pos'|'neg', ttl}
  let lastPurgeSet=null; // Set<number> for preview
  let interlude='none'; // 'none' | 'shock' | 'purge'
  let resumeAfterInterlude=false;

  let hoveredId=null;
  let showLabels=true, allowYouAsSource=false;

  const EXTRA_HIT_PAD = 8;

  // --------- Analytics ---------
  const analytics=[]; const aMap=new Map();
  function ensureLogForT(T){ if(aMap.has(T)) return aMap.get(T);
    const rec={t:T,nodes:0,edges:0,avgDegree:0,density:0,clustering:0,degreeGini:0,affected:0,purged:0,shockKind:'',shockSource:null};
    aMap.set(T,rec); analytics.push(rec); return rec;
  }
  function measureAndLog(T){
    const rec=ensureLogForT(T);
    const n=G.nodes.size, m=G.edges.size;
    rec.nodes=n; rec.edges=m;
    rec.avgDegree = n>0 ? (2*m)/n : 0;
    rec.density   = n>1 ? (2*m)/(n*(n-1)) : 0;

    // adjacency
    const adj=new Map(); for(const id of G.nodes.keys()) adj.set(id,new Set());
    for(const k of G.edges){ const [a,b]=k.split('-').map(Number); adj.get(a).add(b); adj.get(b).add(a); }

    // Global clustering (transitivity)
    let trianglesTimes3=0, triplets=0;
    for(const [_, nbset] of adj){
      const d = nbset.size;
      if(d>=2) triplets += d*(d-1)/2;
      const nb=[...nbset];
      for(let i=0;i<nb.length;i++){
        const u=nb[i], su=adj.get(u);
        for(let j=i+1;j<nb.length;j++){
          if(su.has(nb[j])) trianglesTimes3++;
        }
      }
    }
    rec.clustering = triplets>0 ? trianglesTimes3/triplets : 0;

    // Degree Gini
    const degs=[...adj.values()].map(s=>s.size);
    const mean=n>0?degs.reduce((a,b)=>a+b,0)/Math.max(1,n):0;
    rec.degreeGini = (n>0 && mean>0)?(()=>{
      const xs=degs.slice().sort((a,b)=>a-b); const sum=xs.reduce((a,b)=>a+b,0);
      let num=0; for(let i=0;i<n;i++) num+=(i+1)*xs[i]; return (2*num)/(n*sum)-(n+1)/n;
    })():0;

    drawCharts();
  }

  // --------- DOM ---------
  const elZ=document.getElementById('zMax');
  const elE=document.getElementById('edgesPerNode');
  const elK=document.getElementById('kPeriod');
  const elN=document.getElementById('nPeriod');
  const elP=document.getElementById('pPeriod');
  const elB=document.getElementById('friendBudget');
  const elStep=document.getElementById('statStep');
  const elNodes=document.getElementById('statNodes');
  const elFr=document.getElementById('statFriends');
  const elScore=document.getElementById('statScore');
  const elStatus=document.getElementById('statStatus');
  const elStatusBar=document.getElementById('statusBar');
  const banner=document.getElementById('pickBanner');
  const btnSkip=document.getElementById('btnSkip');
  const chkLabels=document.getElementById('showLabels');
  const chkYouSrc=document.getElementById('allowYouSource');
  const elPPos=document.getElementById('pPosVal');
  const elNNeg=document.getElementById('nNegVal');
  const elPNeg=document.getElementById('negProb');
  const elDThr=document.getElementById('dThreshold');

  const btnStart=document.getElementById('btnStart');
  const btnStep=document.getElementById('btnStep');
  const btnAuto=document.getElementById('btnAuto');
  const btnReset=document.getElementById('btnReset');

  // charts
  const chartAvgDeg=document.getElementById('chartAvgDeg');
  const chartDensity=document.getElementById('chartDensity');
  const chartCluster=document.getElementById('chartCluster');
  const chartGini=document.getElementById('chartGini');
  const chartAffected=document.getElementById('chartAffected');
  const chartPurged=document.getElementById('chartPurged');
  const btnDownloadCSV=document.getElementById('btnDownloadCSV');
  const btnDownloadCharts=document.getElementById('btnDownloadCharts');

  // picker
  const selPick=document.getElementById('selPick');
  const btnPickFromList=document.getElementById('btnPickFromList');

  // on-change hooks now fall back to current values (not magic numbers)
  elZ.onchange=()=>zMax=clamp(parseInt(elZ.value||zMax,10),0,10);
  elE.onchange=()=>ePer=clamp(parseInt(elE.value||ePer,10),1,5);
  elK.onchange=()=>k=clamp(parseInt(elK.value||k,10),1,20);
  elN.onchange=()=>shockPeriod=clamp(parseInt(elN.value||shockPeriod,10),2,30);
  elP.onchange=()=>purgePeriod=clamp(parseInt(elP.value||purgePeriod,10),2,30);
  elB.onchange=()=>{B=clamp(parseInt(elB.value||B,10),0,50); budget=B; updateStats();};

  elPPos.onchange=()=>{ pPos=parseFloat(elPPos.value||pPos); };
  elNNeg.onchange=()=>{ nNeg=parseFloat(elNNeg.value||nNeg); };
  elPNeg.onchange=()=>{ pNeg=clamp(parseFloat(elPNeg.value||pNeg),0,1); };
  elDThr.onchange=()=>{ Dscore=parseFloat(elDThr.value||Dscore); };

  chkLabels.onchange=()=>{ showLabels=chkLabels.checked; draw(); };
  chkYouSrc.onchange=()=>{ allowYouAsSource=chkYouSrc.checked; };

  btnStart.onclick=startGame;
  btnStep.onclick=()=>tick();
  btnAuto.onclick=toggleAuto;
  btnReset.onclick=resetGame;
  btnSkip.onclick=()=>{ if(!picking) return; endPickPhase(true); };

  btnPickFromList.onclick=()=>{ if(!picking) return; const val=selPick.value; if(!val){ setStatus('Pick: please select a node.'); return; } tryBefriend(Number(val)); };

  // --------- NEW: sync UI -> model ---------
  function syncParamsFromUI(){
    const toInt = (el, lo, hi, fallback) => clamp(Number.parseInt(el.value,10) || fallback, lo, hi);
    const toNum = (el, fallback) => {
      const v = Number(el.value);
      return Number.isFinite(v) ? v : fallback;
    };

    zMax        = toInt(elZ, 0, 10, zMax);
    ePer        = toInt(elE, 1,  5, ePer);
    k           = toInt(elK, 1, 20, k);
    shockPeriod = toInt(elN, 2, 30, shockPeriod);
    purgePeriod = toInt(elP, 2, 30, purgePeriod);
    B           = toInt(elB, 0, 50, B);

    pPos   = toNum(elPPos, pPos);
    nNeg   = toNum(elNNeg, nNeg);
    pNeg   = clamp(toNum(elPNeg, pNeg), 0, 1);
    Dscore = toNum(elDThr, Dscore);

    showLabels       = chkLabels.checked;
    allowYouAsSource = chkYouSrc.checked;
  }

  // --------- Canvas ---------
  const canvas=document.getElementById('canvas');
  const ctx=canvas.getContext('2d');
  function resize(){ const r=window.devicePixelRatio||1; canvas.width=canvas.clientWidth*r; canvas.height=canvas.clientHeight*r; ctx.setTransform(r,0,0,r, canvas.width*0.5, canvas.height*0.5); draw(); }
  window.addEventListener('resize', resize);

  canvas.addEventListener('mousemove', e=>{ hoveredId = picking ? hitTest(e) : null; draw(); });
  canvas.addEventListener('click', e=>{
    if(!picking||gameOver) return;
    const id=hitTest(e);
    if(id==null) return;
    tryBefriend(id);
  });

  function getNodeRadius(n){ return n.id===YOU ? 12 : 8; }

  // hitTest uses CSS pixels (no DPR scaling)
  function hitTest(e){
    const {left,top,width,height}=canvas.getBoundingClientRect();
    const mx = (e.clientX - left - width  * 0.5);
    const my = (e.clientY - top  - height * 0.5);

    let best=null, bestD=Infinity;
    for(const n of G.nodes.values()){
      if(n.id===YOU) continue;
      const dx=mx-n.x, dy=my-n.y;
      const R = getNodeRadius(n) + EXTRA_HIT_PAD;
      const d = Math.hypot(dx,dy);
      if(d<R && d<bestD){ best=n.id; bestD=d; }
    }
    return best;
  }

  function tryBefriend(id){
    if(id===YOU || friends.has(id)) return;
    if(budget>0){
      addEdge(YOU,id); friends.add(id); budget--;
      updateStats(); setStatus(`Befriended node ${id}.`);
      endPickPhase(false);
    } else {
      setStatus('No budget left.');
    }
  }

  // --------- Interlude helpers ---------
  function pauseForInterlude(){ if(auto){ stopAuto(); resumeAfterInterlude=true; } }
  function maybeResumeAfterInterlude(){ if(resumeAfterInterlude && !gameOver && !picking && interlude==='none'){ startAuto(); resumeAfterInterlude=false; } }

  // --------- Game loop ---------
  function tick(){
    if(gameOver || picking) return;

    // Return from SHOCK interlude
    if(interlude==='shock'){
      interlude='none';
      t++; updateStats(); draw();
      maybeResumeAfterInterlude();
      return;
    }

    // Return from PURGE interlude
    if(interlude==='purge'){
      const ids=[...lastPurgeSet||[]];
      const youWillDie = ids.includes(YOU);
      const rec=ensureLogForT(t); rec.purged = ids.length;
      for(const id of ids) removeNode(id);
      lastPurgeSet=null; interlude='none';

      if(youWillDie){ gameOver=true; setStatus(`You were purged at t=${t}.`); draw(); return; }

      growth(); layout(); updateStats(); draw();

      if(t % k === 0){ beginPickPhase(); return; }
      if(t>0 && t % shockPeriod === 0){ doShock(); return; }

      t++; updateStats(); maybeResumeAfterInterlude();
      return;
    }

    // PURGE step (preview BEFORE growth)
    if(t>0 && t % purgePeriod === 0){
      measureAndLog(t);
      const toPurge=[...G.nodes.values()].filter(n=> n.score < Dscore).map(n=>n.id);
      if(toPurge.length>0){
        lastPurgeSet=new Set(toPurge);
        interlude='purge';
        pauseForInterlude();
        setStatus(`Purge preview at t=${t}: ${toPurge.length} node(s) will be removed. Step to confirm.`);
        draw();
        return;
      } else {
        setStatus(`Purge check at t=${t}: none below threshold.`);
      }
    }

    // Normal growth step
    growth(); layout(); updateStats(); draw();

    // metrics before any shock on this step
    measureAndLog(t);

    // PICK
    if(t % k === 0){ beginPickPhase(); return; }

    // SHOCK interlude
    if(t>0 && t % shockPeriod === 0){ doShock(); return; }

    // advance
    t++; updateStats();
  }

  // --------- Growth & connectivity ---------
  function growth(){ const s=rndInt(0,zMax); for(let i=0;i<s;i++){ const id=addNode({friendly:Math.random(),score:0}); connectByFriendliness(id,ePer); } }
  function connectByFriendliness(newId,e){
    const cands=[...G.nodes.values()].filter(n=>n.id!==newId && n.id!==YOU);
    if(!cands.length) return;
    let remaining=new Set(cands.map(n=>n.id));
    for(let added=0; added<e && remaining.size>0; added++){
      const pick=weightedPick([...remaining].map(id=>G.nodes.get(id)), n=>Math.max(n.friendly,1e-6));
      addEdge(newId,pick.id); remaining.delete(pick.id);
    }
  }
  function weightedPick(items,wfn){ const weights=items.map(wfn); const sum=weights.reduce((a,b)=>a+b,0); let r=Math.random()*sum; for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; } return items[items.length-1]; }

  // --------- Pick phase ---------
  function beginPickPhase(){
    if(auto){ stopAuto(); wasAutoBeforePick=true; }
    picking=true; banner.style.display='block';
    enablePlayControls(false);
    populatePickList();
    setStatus(`Pick phase at t=${t}: click a node or use the list, or Skip.`);
    draw();
  }
  function endPickPhase(){
    picking=false; banner.style.display='none';
    clearPickList();
    enablePlayControls(true);
    if(t>0 && t % shockPeriod === 0){ doShock(); return; }
    t++; updateStats(); draw();
    if(wasAutoBeforePick && !gameOver){ startAuto(); wasAutoBeforePick=false; }
  }

  function populatePickList(){
    selPick.disabled=false; btnPickFromList.disabled=false;
    selPick.innerHTML='';
    const cands=[...G.nodes.values()].filter(n=> n.id!==YOU && !friends.has(n.id));
    const deg=(id)=>neighbors(id).length;
    cands.sort((a,b)=> b.friendly-a.friendly || b.score-a.score || deg(b.id)-deg(a.id));
    for(const n of cands){
      const o=document.createElement('option');
      o.value=String(n.id);
      o.textContent=`#${n.id} • f=${n.friendly.toFixed(2)} • s=${n.score.toFixed(1)} • deg=${deg(n.id)}`;
      selPick.appendChild(o);
    }
  }
  function clearPickList(){
    selPick.disabled=true; btnPickFromList.disabled=true;
    selPick.innerHTML='';
  }

  // --------- Shock (interlude) ---------
  function doShock(){
    let ids=[...G.nodes.keys()]; if(!allowYouAsSource) ids=ids.filter(id=>id!==YOU); if(!ids.length) return;
    const src=choice(ids);
    const isNeg=Math.random()<pNeg; const hops=isNeg?2:1; const delta=isNeg?nNeg:pPos; const kind=isNeg?'neg':'pos';
    const affected=bfsWithin(src,hops);
    for(const id of affected){ const n=G.nodes.get(id); if(n) n.score+=delta; }
    const rec=ensureLogForT(t);
    rec.affected=affected.size; rec.shockKind=kind; rec.shockSource=src;
    lastSplash={src,affected,kind,ttl:60};
    interlude='shock';
    pauseForInterlude();
    const signStr=kind==='neg'?`${delta}`:`+${delta}`;
    setStatus(`${kind==='neg'?'Negative':'Positive'} shock ${signStr} at t=${t} (src ${src}). Step to continue.`);
    draw();
  }

  function bfsWithin(start,maxHops){
    const seen=new Set([start]); const q=[{id:start,d:0}];
    while(q.length){
      const {id,d}=q.shift(); if(d===maxHops) continue;
      for(const nb of neighbors(id)){ if(!seen.has(nb)){ seen.add(nb); q.push({id:nb,d:d+1}); } }
    }
    return seen;
  }

  // --------- UI helpers ---------
  function setStatus(msg){
    const text=`Status: ${msg}`;
    elStatus.textContent=text;
    elStatusBar.textContent=text;
  }
  function updateStats(){
    const you=G.nodes.get(YOU);
    elStep.textContent=`t = ${t}`;
    elNodes.textContent=`Nodes: ${G.nodes.size}`;
    elFr.textContent=`Friends: ${friends.size} / ${B} (left ${budget})`;
    elScore.textContent=`YOU score: ${you?you.score.toFixed(1):'-'}`;
  }
  function enablePlayControls(enabled){
    btnStep.disabled=!enabled;
    btnAuto.disabled=!enabled;
    btnSkip.disabled=!picking;
  }

  function startGame(){
    syncParamsFromUI();   // <-- ensure model == UI
    resetGame();          // reset uses latest values too
    addNode({friendly:0.5,type:'you',score:0});
    addNode({friendly:rand(),score:0});
    addNode({friendly:rand(),score:0});
    addNode({friendly:rand(),score:0});
    layout(); updateStats(); draw();
    measureAndLog(0);
    beginPickPhase();
  }

  function resetGame(){
    syncParamsFromUI();   // <-- also sync on reset
    stopAuto(); G.nodes.clear(); G.edges.clear(); G.nextId=0; friends.clear();
    t=0; gameOver=false; picking=false; lastSplash=null; lastPurgeSet=null; interlude='none'; resumeAfterInterlude=false;
    budget=B; wasAutoBeforePick=false;
    analytics.length=0; aMap.clear(); drawCharts();
    updateStats(); setStatus('Ready'); layout(); draw();
    clearPickList();
  }

  function toggleAuto(){ if(auto) stopAuto(); else startAuto(); }
  function startAuto(){ if(gameOver) return; btnAuto.textContent='Auto ⏸'; auto=setInterval(()=>tick(),650); }
  function stopAuto(){ btnAuto.textContent='Auto ▶'; if(auto) clearInterval(auto); auto=null; }

  // --------- Rendering (graph) ---------
  function draw(){
    const r=window.devicePixelRatio||1;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(r,0,0,r, canvas.width*0.5, canvas.height*0.5);

    // edges
    ctx.lineWidth=1;
    for(const k of G.edges){
      const [a,b]=k.split('-').map(Number); const A=G.nodes.get(a), B=G.nodes.get(b);
      ctx.strokeStyle=edgeColor(a,b); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    }

    // nodes
    for(const n of G.nodes.values()) drawNode(n);

    if(lastSplash){ lastSplash.ttl-=1; if(lastSplash.ttl<=0) lastSplash=null; }
  }
  function edgeColor(a,b){
    const base=getCss('--edge');
    if(lastSplash && lastSplash.affected.has(a) && lastSplash.affected.has(b)){
      return lastSplash.kind==='neg' ? '#fecaca' : '#d1fae5';
    }
    return base;
  }
  function drawNode(n){
    const R = getNodeRadius(n);
    let fill='#64748b';
    if(n.id===YOU) fill=pulse('#10b981','#16a34a');
    else if(friends.has(n.id)) fill=getCss('--accent');

    if(lastPurgeSet && lastPurgeSet.has(n.id)) fill=getCss('--purge');
    if(lastSplash){
      if(n.id===lastSplash.src) fill=getCss('--source');
      else if(lastSplash.affected.has(n.id)) fill= lastSplash.kind==='neg'? getCss('--danger') : getCss('--pos');
    }

    // node circle
    ctx.beginPath(); ctx.arc(n.x,n.y,R,0,Math.PI*2);
    ctx.fillStyle=fill; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='rgba(15,23,42,0.1)'; ctx.stroke();

    // friendliness ring
    if(n.id!==YOU){
      ctx.lineWidth=2; ctx.strokeStyle=`rgba(15,23,42,${0.08+0.35*n.friendly})`;
      ctx.beginPath(); ctx.arc(n.x,n.y,R-3,-Math.PI*0.15,Math.PI*0.5); ctx.stroke();
    }

    // node ID badge (bold)
    drawBadge(n.x, n.y - R - 12, String(n.id));

    // labels (friendly | score)
    if(showLabels && n.id!==YOU){
      ctx.font='10px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillStyle='#334155';
      ctx.fillText(`${n.friendly.toFixed(2)} | s:${n.score.toFixed(1)}`, n.x, n.y + R + 2);
    }

    // hover halo during pick
    if(picking && n.id===hoveredId){
      ctx.lineWidth=2; ctx.strokeStyle='rgba(37,99,235,0.85)';
      ctx.beginPath(); ctx.arc(n.x,n.y,R+EXTRA_HIT_PAD*0.6,0,Math.PI*2); ctx.stroke();
    }

    // purge mark
    if(lastPurgeSet && lastPurgeSet.has(n.id)){
      ctx.lineWidth=1.5; ctx.strokeStyle='rgba(15,23,42,0.35)';
      ctx.beginPath(); ctx.moveTo(n.x-R+2,n.y-R+2); ctx.lineTo(n.x+R-2,n.y+R-2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(n.x+R-2,n.y-R+2); ctx.lineTo(n.x-R+2,n.y+R-2); ctx.stroke();
    }
  }
  function drawBadge(cx, cy, text){
    ctx.font='bold 11px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial';
    const padX=5; const m=ctx.measureText(text);
    const w=Math.ceil(m.width)+padX*2, h=14;
    const x=cx - w/2, y=cy - h/2;
    const r=6;
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r);
    ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fill();
    ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#0f172a'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text, cx, cy);
  }
  function pulse(a,b){ const t2=(Date.now()*0.003)%2; const mix=t2<1?t2:2-t2; const c1=hex(a), c2=hex(b); const c={r:Math.round(c1.r*(1-mix)+c2.r*mix), g:Math.round(c1.g*(1-mix)+c2.g*mix), b:Math.round(c1.b*(1-mix)+c2.b*mix)}; return `rgb(${c.r},${c.g},${c.b})`; }
  function hex(h){ const v=h.replace('#',''); const i=parseInt(v,16); return {r:(i>>16)&255,g:(i>>8)&255,b:i&255}; }
  function getCss(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // --------- Charts ---------
  function drawCharts(){
    drawLineChart(chartAvgDeg, analytics.map(r=>r.avgDegree), '#2563eb');
    drawLineChart(chartDensity, analytics.map(r=>r.density), '#0ea5e9');
    drawLineChart(chartCluster, analytics.map(r=>r.clustering), '#10b981');
    drawLineChart(chartGini, analytics.map(r=>r.degreeGini), '#9333ea');
    drawBar(chartAffected, analytics.map(r=>r.affected||0), '#86efac');
    drawBar(chartPurged, analytics.map(r=>r.purged||0), '#a78bfa');
  }
  function prepCanvas(c){
    const r=window.devicePixelRatio||1;
    c.width=c.clientWidth*r; c.height=c.clientHeight*r;
    const g=c.getContext('2d'); g.setTransform(r,0,0,r,0,0);
    g.clearRect(0,0,c.width,c.height); return g;
  }
  function drawLineChart(c, values, color){
    const g=prepCanvas(c); const W=c.clientWidth, H=c.clientHeight;
    g.strokeStyle='#e2e8f0'; g.lineWidth=1; g.strokeRect(0.5,0.5,W-1,H-1);
    if(values.length===0){ return; }
    const min=Math.min(...values), max=Math.max(...values);
    const pad=4, lo=min, hi=(max===min)?(min+1):(max);
    g.beginPath();
    for(let i=0;i<values.length;i++){
      const x = pad + (W-2*pad)*(i/Math.max(1,values.length-1));
      const y = H-pad - (H-2*pad)*((values[i]-lo)/(hi-lo));
      if(i===0) g.moveTo(x,y); else g.lineTo(x,y);
    }
    g.strokeStyle=color; g.lineWidth=2; g.stroke();
  }
  function drawBar(c, vals, color){
    const g=prepCanvas(c); const W=c.clientWidth, H=c.clientHeight;
    g.strokeStyle='#e2e8f0'; g.lineWidth=1; g.strokeRect(0.5,0.5,W-1,H-1);
    const n=vals.length; if(n===0) return;
    const maxV=Math.max(1, ...vals);
    const pad=4; const bw=(W-2*pad)/Math.max(1,n);
    for(let i=0;i<n;i++){
      const v=vals[i]||0;
      const x = pad + i*bw;
      const h = (H-2*pad)*(v/maxV);
      g.fillStyle=color; g.fillRect(x+1, H-pad-h, bw-2, h);
    }
  }

  // --------- Exports ---------
  function downloadCSV(){
    const header=['t','nodes','edges','avg_degree','density','clustering_global','degree_gini','affected','purged','shock_kind','shock_source'];
    const lines=[header.join(',')];
    for(const r of analytics){
      lines.push([
        r.t, r.nodes, r.edges,
        r.avgDegree.toFixed(6),
        r.density.toFixed(6),
        r.clustering.toFixed(6),
        r.degreeGini.toFixed(6),
        r.affected||0,
        r.purged||0,
        r.shockKind||'',
        r.shockSource==null?'':r.shockSource
      ].join(','));
    }
    const blob=new Blob([lines.join('\n')],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='network_analytics.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  function downloadChartsPNG(){
    drawCharts();
    const canvases=[chartAvgDeg, chartDensity, chartCluster, chartGini, chartAffected, chartPurged];
    const labels=['Average Degree','Density','Global Clustering','Degree Gini','Affected (shock)','Purged'];
    const w=canvases[0].clientWidth, h=canvases[0].clientHeight;
    const pad=24, titleH=18, cols=2, rows=3;
    const sheetW=cols*w+(cols+1)*pad, sheetH=rows*(h+titleH)+(rows+1)*pad;
    const off=document.createElement('canvas'); const r=window.devicePixelRatio||1;
    off.width=sheetW*r; off.height=sheetH*r;
    const g=off.getContext('2d'); g.setTransform(r,0,0,r,0,0); g.fillStyle='#ffffff'; g.fillRect(0,0,sheetW,sheetH);
    g.font='bold 14px ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial'; g.fillStyle='#0f172a';
    for(let i=0;i<canvases.length;i++){ const row=Math.floor(i/cols), col=i%cols; const x=pad+col*(w+pad), y=pad+row*(h+titleH+pad);
      g.fillText(labels[i],x,y+12); g.drawImage(canvases[i],x,y+titleH,w,h); }
    off.toBlob(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='charts.png'; a.click(); URL.revokeObjectURL(url); });
  }
  document.getElementById('btnDownloadCSV').onclick=downloadCSV;
  document.getElementById('btnDownloadCharts').onclick=downloadChartsPNG;

  // init
  function initialResize(){ const r=window.devicePixelRatio||1; canvas.width=canvas.clientWidth*r; canvas.height=canvas.clientHeight*r; ctx.setTransform(r,0,0,r, canvas.width*0.5, canvas.height*0.5); draw(); drawCharts(); }

  // NEW: run a sync once on load so model = UI even before Start/Reset
  syncParamsFromUI();
  initialResize();
})();
