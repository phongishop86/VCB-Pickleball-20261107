
'use strict';
const MODE=window.MODE==='view'?'view':'admin',RO=MODE==='view';
const LS='pickleball-planner-v1';
const RANK=['','Nhất','Nhì','Ba','Tư'];
let uid=1;
const newTeam=()=>({id:'t'+(uid++),a:'',b:'',g:null});
const letter=g=>String.fromCharCode(65+g);
const pad=n=>String(n).padStart(2,'0');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(v)?v:a));

/* ---------- STATE ---------- */
function syncTeams(c){
  while(c.teams.length<c.n)c.teams.push(newTeam());
  c.teams.length=c.n;
  if(c.gAuto)c.groups=Math.max(1,Math.ceil(c.n/4));
  const cnt=Array(c.groups).fill(0);
  c.teams.forEach(t=>{if(t.g!=null&&t.g<c.groups)cnt[t.g]++;else t.g=null;});
  c.teams.forEach(t=>{if(t.g==null){let m=0;cnt.forEach((v,i)=>{if(v<cnt[m])m=i;});t.g=m;cnt[m]++;}});
}
function redeal(c){c.teams.forEach((t,i)=>t.g=i%c.groups);c.drawn=false;c.lots={};}
function defCat(id,name,short,n,hasB){const c={id,name,short,n,hasB,gAuto:true,groups:Math.max(1,Math.ceil(n/4)),teams:[],drawn:false,lots:{}};syncTeams(c);redeal(c);return c;}
function defState(){return{
  cfg:{title:'Giải Pickleball',courts:4,start:'08:00',gDur:20,kDur:25,breakFrom:'11:30',breakTo:'13:00',third:true,rest:0,diff:'all'},
  cats:[defCat('ld','Đôi Lãnh đạo Khách mời Hỗn hợp','Lãnh đạo',16,true),defCat('tdo','Đôi Tự do Hỗn hợp','Tự do',16,true),defCat('nb','Đôi Newbie Hỗn hợp','Newbie',8,false)],
  res:{},ui:{tab:'setup',cat:'all',q:'',paste:{},copy:null,reset:false,imp:false}};}
let state;
function load(){
  if(RO){state=defState();state.ui.tab='sched';return;}
  try{const s=JSON.parse(localStorage.getItem(LS)||'null');if(s&&s.cats&&s.cfg){state=s;state.ui=Object.assign({tab:'setup',cat:'all',q:'',paste:{},copy:null,reset:false,imp:false},s.ui||{});state.ui.copy=null;state.ui.reset=false;}}catch(e){}
  if(!state)state=defState();
  state.cats.forEach(c=>c.teams.forEach(t=>{const k=parseInt(String(t.id).slice(1));if(k>=uid)uid=k+1;}));
}
function save(){if(RO)return;try{localStorage.setItem(LS,JSON.stringify(state));}catch(e){}}

/* ---------- SCORES ---------- */
function getScore(m,t1,t2){const r=state.res[m.id];if(!r)return null;
  if(r.ta===t1&&r.tb===t2)return[r.sa,r.sb];if(r.ta===t2&&r.tb===t1)return[r.sb,r.sa];return null;}
const validScore=sc=>!!sc&&Number.isFinite(sc[0])&&Number.isFinite(sc[1])&&sc[0]!==sc[1];

/* ---------- COMPUTE ---------- */
let C=null;
function teamNameOf(t,no){const a=(t.a||'').trim(),b=(t.b||'').trim();return(!a&&!b)?'Đội '+no:(a||'…')+' / '+(b||'…');}

function resolve(ref,catId){
  const cc=C.byCat[catId];
  if(ref.team)return{id:ref.team,label:cc.tmap[ref.team].name};
  if(ref.bye)return{id:null,label:'BYE',bye:true};
  if(ref.slot){const g=cc.groups[ref.slot.g],id=g.st.order[ref.slot.rank-1];
    if(g.complete&&id&&!g.st.unres.has(id))return{id,label:cc.tmap[id].name};
    return{id:null,label:(RANK[ref.slot.rank]||'Hạng '+ref.slot.rank)+' bảng '+g.name};}
  const mid=ref.w||ref.l,m=C.matchMap[mid];
  if(ref.w&&m.bye)return resolve(m.a.bye?m.b:m.a,catId);
  const o=outcome(m);
  if(o){const id=ref.w?o.w:o.l;return{id,label:cc.tmap[id].name};}
  return{id:null,label:(ref.w?'Thắng ':'Thua ')+m.tag};
}
function outcome(m){
  if(m.bye)return null;
  const a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);
  if(!a.id||!b.id)return null;
  const sc=getScore(m,a.id,b.id);if(!validScore(sc))return null;
  return sc[0]>sc[1]?{w:a.id,l:b.id}:{w:b.id,l:a.id};
}

function calcGroup(cat,g){
  const ids=g.teams,ms=g.matches,S={};
  ids.forEach(id=>S[id]={id,w:0,l:0,pf:0,pa:0});
  let done=0;
  ms.forEach(m=>{const sc=getScore(m,m.a.team,m.b.team);if(!validScore(sc))return;done++;
    const A=S[m.a.team],B=S[m.b.team];A.pf+=sc[0];A.pa+=sc[1];B.pf+=sc[1];B.pa+=sc[0];
    if(sc[0]>sc[1]){A.w++;B.l++;}else{B.w++;A.l++;}});
  const complete=ms.length>0&&done===ms.length;
  const unres=new Set(),lots=cat.lots||{};
  const h2h=(a,b)=>{const m=ms.find(m=>(m.a.team===a&&m.b.team===b)||(m.a.team===b&&m.b.team===a));
    if(!m)return null;const sc=getScore(m,m.a.team,m.b.team);if(!validScore(sc))return null;return sc[0]>sc[1]?m.a.team:m.b.team;};
  const byLots=arr=>{if(!complete)return arr;
    if(arr.every(id=>lots[id]!=null))return[...arr].sort((x,y)=>lots[y]-lots[x]);
    arr.forEach(id=>unres.add(id));return arr;};
  const pair=([a,b])=>{const w=h2h(a,b);return w?(w===a?[a,b]:[b,a]):byLots([a,b]);};
  const mini=(id,cl)=>{let d=0;ms.forEach(m=>{if(!cl.includes(m.a.team)||!cl.includes(m.b.team))return;if(m.a.team!==id&&m.b.team!==id)return;
    const sc=getScore(m,m.a.team,m.b.team);if(!validScore(sc))return;d+=(m.a.team===id?sc[0]-sc[1]:sc[1]-sc[0]);});return d;};
  const multi=sub=>{const wins=id=>ms.filter(m=>{if(!sub.includes(m.a.team)||!sub.includes(m.b.team))return false;
      const sc=getScore(m,m.a.team,m.b.team);return validScore(sc)&&((sc[0]>sc[1]?m.a.team:m.b.team)===id);}).length;
    const s=[...sub].sort((x,y)=>wins(y)-wins(x)),out=[];let k=0;
    while(k<s.length){let e=k;while(e+1<s.length&&wins(s[e+1])===wins(s[k]))e++;const q=s.slice(k,e+1);
      out.push(...(q.length===1?q:q.length===2?pair(q):byLots(q)));k=e+1;}return out;};
  const resolveCl=cl=>{
    if(cl.length===1)return cl;if(cl.length===2)return pair(cl);
    const key=id=>state.cfg.diff==='mini'?mini(id,cl):S[id].pf-S[id].pa;
    const s=[...cl].sort((x,y)=>key(y)-key(x)),out=[];let k=0;
    while(k<s.length){let e=k;while(e+1<s.length&&key(s[e+1])===key(s[k]))e++;const q=s.slice(k,e+1);
      out.push(...(q.length===1?q:q.length===2?pair(q):multi(q)));k=e+1;}return out;};
  const base=[...ids].sort((a,b)=>S[b].w-S[a].w||ids.indexOf(a)-ids.indexOf(b));
  const order=[];let i=0;
  while(i<base.length){let j=i;while(j+1<base.length&&S[base[j+1]].w===S[base[i]].w)j++;order.push(...resolveCl(base.slice(i,j+1)));i=j+1;}
  return{S,order,unres,complete,done};
}

const stdOrder=n=>{let a=[1];while(a.length<n){const m=a.length*2;a=a.flatMap(x=>[x,m+1-x]);}return a;};
const pow2=n=>{let s=1;while(s<n)s*=2;return s;};
function seedList(entries){
  const ranks=[...new Set(entries.map(e=>e.rank))].sort((a,b)=>a-b);let out=[];
  ranks.forEach((r,ti)=>{let tier=entries.filter(e=>e.rank===r).sort((a,b)=>a.g-b.g);
    if(ti%2===1){const m=tier.length,old=tier;tier=old.map((_,j0)=>old[((m+1-(j0+1))%m+1)-1]);}
    out=out.concat(tier);});
  return out;}
function pairLeaves(entries){
  const n=entries.length;if(n<4||(n&(n-1)))return null;
  const ranks=[...new Set(entries.map(e=>e.rank))].sort((a,b)=>a-b);
  if(ranks.length!==2||ranks[1]!==ranks[0]+1)return null;
  const gs=[...new Set(entries.map(e=>e.g))].sort((a,b)=>a-b);
  if(gs.length%2)return null;
  for(const g of gs)if(entries.filter(e=>e.g===g).length!==2)return null;
  const E=(g,r)=>({g,rank:r}),top=[],bot=[];
  for(let i=0;i<gs.length;i+=2){const X=gs[i],Y=gs[i+1];top.push(E(X,ranks[0]),E(Y,ranks[1]));bot.push(E(Y,ranks[0]),E(X,ranks[1]));}
  return top.concat(bot);}

function buildSeries(cat,ci,key,label,entries){
  const n=entries.length;if(n<2)return null;
  const S=pow2(n);
  let leaves=pairLeaves(entries);
  if(!leaves){const seeds=seedList(entries);leaves=stdOrder(S).map(s=>s<=n?seeds[s-1]:null);}
  let cur=leaves.map(e=>e?{slot:e}:{bye:true});
  const rounds=[],prefix=cat.id+'.'+key;let r=0;
  const short=sz=>sz===2?'CK':sz===4?'BK':sz===8?'TK':'V'+sz/2;
  const rname=sz=>sz===2?'Chung kết':sz===4?'Bán kết':sz===8?'Tứ kết':'Vòng 1/'+sz/2;
  while(cur.length>1){
    const sz=cur.length,ms=[],nxt=[];
    for(let i=0;i<sz;i+=2){
      const id=prefix+'.'+r+'.'+(i/2),a=cur[i],b=cur[i+1],cnt=sz/2;
      const m={id,cat:cat.id,ci,kind:'ko',series:key,r,idx:i/2,a,b,bye:!!(a.bye||b.bye),
        tag:(key==='M'?'':key+'-')+short(sz)+(cnt>1?(i/2+1):''),
        phase:(key==='M'?'':label+' · ')+rname(sz)+(cnt>1?' '+(i/2+1):'')};
      ms.push(m);nxt.push({w:id});}
    rounds.push({name:rname(sz),size:sz,matches:ms});cur=nxt;r++;
  }
  let third=null;
  if(state.cfg.third&&rounds.length>=2){
    const semis=rounds[rounds.length-2].matches;
    if(semis.length===2&&!semis[0].bye&&!semis[1].bye)
      third={id:prefix+'.3rd',cat:cat.id,ci,kind:'ko',series:key,r:rounds.length-1,idx:-1,a:{l:semis[0].id},b:{l:semis[1].id},bye:false,third:true,
        tag:(key==='M'?'':key+'-')+'H3',phase:(key==='M'?'':label+' · ')+'Tranh hạng Ba'};
  }
  return{key,label,rounds,third,count:n,size:S};
}

function compute(){
  C={cats:[],byCat:{},matchMap:{},all:[]};
  const cfg=state.cfg;
  state.cats.forEach((cat,ci)=>{
    syncTeams(cat);
    const cc={cat,ci,active:cat.n>=2,groups:[],series:[],tmap:{}};
    cat.teams.forEach((t,i)=>{const pr=[(t.a||'').trim(),(t.b||'').trim()].filter(Boolean);cc.tmap[t.id]={id:t.id,no:i+1,name:teamNameOf(t,i+1),parts:pr.length?pr:['Đội '+(i+1)]};});
    C.cats.push(cc);C.byCat[cat.id]=cc;
    if(!cc.active)return;
    for(let g=0;g<cat.groups;g++){
      const ids=cat.teams.filter(t=>t.g===g).map(t=>t.id);
      const grp={idx:g,name:letter(g),teams:ids,matches:[]};
      let arr=ids.slice();if(arr.length%2)arr.push(null);
      const m=arr.length;
      for(let rd=0;rd<m-1;rd++){
        for(let i=0;i<m/2;i++){const x=arr[i],y=arr[m-1-i];if(x==null||y==null)continue;
          grp.matches.push({id:`${cat.id}.G${g}.${rd+1}.${i}`,cat:cat.id,ci,kind:'group',g,round:rd+1,i,a:{team:x},b:{team:y},
            phase:`Bảng ${grp.name} · Lượt ${rd+1}`,tag:`B${grp.name}${rd+1}`});}
        arr=[arr[0],arr[m-1],...arr.slice(1,m-1)];
      }
      cc.groups.push(grp);
    }
    cc.groups.forEach(grp=>{grp.matches.forEach(m=>{C.matchMap[m.id]=m;C.all.push(m);});});
    cc.groups.forEach(grp=>{grp.st=calcGroup(cat,grp);grp.complete=grp.st.complete;});
    const topE=[],restE=[];
    cc.groups.forEach(grp=>grp.teams.forEach((id,k)=>{}));
    cc.groups.forEach(grp=>{for(let rk=1;rk<=grp.teams.length;rk++){(rk<=2?topE:restE).push({g:grp.idx,rank:rk});}});
    const sA=buildSeries(cat,ci,cat.hasB?'A':'M',cat.hasB?'Serie A':'Vòng loại trực tiếp',topE);
    if(sA)cc.series.push(sA);
    if(cat.hasB){const sB=buildSeries(cat,ci,'B','Serie B',restE);if(sB)cc.series.push(sB);}
    cc.series.forEach(s=>{
      s.rounds.forEach(R=>R.matches.forEach(m=>{C.matchMap[m.id]=m;C.all.push(m);}));
      if(s.third){C.matchMap[s.third.id]=s.third;C.all.push(s.third);}
    });
  });
  schedule();
  C.cats.forEach(cc=>cc.series.forEach(s=>{s.honors=honors(cc,s);}));
}

function honors(cc,s){
  const nm=id=>id?cc.tmap[id].name:null,pt=id=>id?cc.tmap[id].parts:null,rows=[];
  const R=(place,id,tie)=>rows.push({place,team:nm(id),parts:pt(id),tie});
  const fin=s.rounds[s.rounds.length-1].matches[0],fo=outcome(fin);
  R('Nhất',fo&&fo.w);R('Nhì',fo&&fo.l);
  if(s.rounds.length>=2){
    if(s.third){const o=outcome(s.third);R('Ba',o&&o.w);R('Tư',o&&o.l);}
    else s.rounds[s.rounds.length-2].matches.forEach(sm=>{if(sm.bye)return;const o=outcome(sm);R('Ba',o&&o.l,true);});
  }
  return rows;}

/* ---------- SCHEDULER ---------- */
const toMin=s=>{const m=/^(\d{1,2}):(\d{2})$/.exec(s||'');return m?(+m[1])*60+(+m[2]):null;};
const fmt=x=>pad(Math.floor(x/60)%24)+':'+pad(x%60);
function schedule(){
  const cfg=state.cfg,Cn=clamp(cfg.courts,1,24),gap=clamp(cfg.rest,0,6);
  const list=C.all.filter(m=>!m.bye);
  const groupsOf={};
  list.forEach(m=>{if(m.kind==='group')(groupsOf[m.cat]=groupsOf[m.cat]||[]).push(m.id);});
  list.forEach(m=>{
    m.dur=m.kind==='group'?clamp(cfg.gDur,5,120):clamp(cfg.kDur,5,120);
    m.teams=m.kind==='group'?[m.a.team,m.b.team]:[];
    m.deps=[];
    if(m.kind==='group'){m.pr=m.round*1e5+m.ci*1e3+m.g*20+m.i;}
    else{
      [m.a,m.b].forEach(ref=>{
        if(ref.slot)m.deps.push(...(groupsOf[m.cat]||[]));
        else{const f=C.matchMap[ref.w||ref.l];if(f.bye)m.deps.push(...(groupsOf[m.cat]||[]));else m.deps.push(f.id);}});
      m.deps=[...new Set(m.deps)];
      m.pr=1e7+m.r*1e5+m.ci*1e3+(m.series==='B'?500:0)+(m.third?-1:Math.max(0,m.idx))*2;
    }
  });
  // chung kết đợi trận tranh hạng Ba
  C.cats.forEach(cc=>cc.series.forEach(s=>{if(s.third){const fin=s.rounds[s.rounds.length-1].matches[0];fin.deps.push(s.third.id);fin.pr+=1;}}));
  list.sort((a,b)=>a.pr-b.pr);
  const slotOf={},slots=[];let pending=list.slice(),t=0,prev=new Set();
  while(pending.length&&t<3000){
    const ready=pending.filter(m=>m.deps.every(d=>{const s=slotOf[d];if(s===undefined)return false;
      const dm=C.matchMap[d];return s+1+(dm.kind==='ko'&&m.kind==='ko'?gap:0)<=t;}));
    const used=new Set(),chosen=[];
    const pick=skip=>{for(const m of ready){if(chosen.length>=Cn)break;if(chosen.includes(m))continue;
      if(m.teams.some(x=>used.has(x)))continue;if(skip&&m.teams.some(x=>prev.has(x)))continue;
      chosen.push(m);m.teams.forEach(x=>used.add(x));}};
    pick(true);pick(false);
    chosen.forEach((m,k)=>{m.slot=t;m.court=k;slotOf[m.id]=t;});
    pending=pending.filter(m=>!chosen.includes(m));
    slots.push({t,ms:chosen});prev=used;t++;
  }
  while(slots.length&&!slots[slots.length-1].ms.length)slots.pop();
  let cur=toMin(cfg.start);if(cur==null)cur=480;
  const bf=toMin(cfg.breakFrom),bt=toMin(cfg.breakTo),hasBrk=bf!=null&&bt!=null&&bt>bf;
  slots.forEach(s=>{
    const dur=s.ms.length?Math.max(...s.ms.map(m=>m.dur)):clamp(cfg.gDur,5,120);
    if(hasBrk&&cur<bt&&cur+dur>bf&&s.ms.length){s.brk={from:bf,to:bt};cur=Math.max(cur,bt);}
    s.start=cur;s.dur=dur;cur+=dur;});
  let no=1;slots.forEach(s=>s.ms.forEach(m=>{m.no=no++;}));
  C.slots=slots;C.end=cur;C.courts=Cn;C.nMatch=list.length;
  C.nDone=list.filter(m=>{const a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);return a.id&&b.id&&validScore(getScore(m,a.id,b.id));}).length;
}
const whenStr=m=>{if(m.slot==null)return'';const s=C.slots[m.slot];return fmt(s.start)+' · Sân '+(m.court+1);};

/* ---------- VIEW HELPERS ---------- */
function mcard(m,o={}){
  const a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);
  if(m.bye){const real=m.a.bye?b:a;
    return`<div class="mc bye ${m.series}"><div class="mh"><span>${esc(m.tag)}</span><span>Miễn đấu</span></div><div class="tl ${real.id?'':'ph'}"><span class="nm">${esc(real.label)}</span></div><div class="bye-t">Đi tiếp (BYE)</div></div>`;}
  const sc=a.id&&b.id?getScore(m,a.id,b.id):null,valid=validScore(sc),w=valid?(sc[0]>sc[1]?0:1):-1;
  const dis=!(a.id&&b.id)||RO,eq=sc&&Number.isFinite(sc[0])&&Number.isFinite(sc[1])&&sc[0]===sc[1];
  const line=(i,t)=>`<div class="tl ${w===i?'win':''} ${t.id?'':'ph'}"><span class="nm">${esc(t.label)}</span>${RO?`<span class="sc ro">${sc&&Number.isFinite(sc[i])?sc[i]:''}</span>`:`<input class="sc" type="number" min="0" max="99" inputmode="numeric" data-live="1" data-act="score" data-m="${m.id}" data-i="${i}" data-k="sc:${m.id}:${i}" aria-label="Điểm ${esc(t.label)}" ${dis?'disabled':''} value="${sc&&Number.isFinite(sc[i])?sc[i]:''}">`}</div>`;
  const head=(o.cat?esc(C.byCat[m.cat].cat.short)+' · ':'')+esc(o.phase===false?m.tag:m.phase);
  return`<div class="mc ${m.series||''}"><div class="mh"><span><b>${m.no?'T'+pad(m.no):''}</b> ${head}</span><span class="tn">${o.when===false?'':esc(whenStr(m))}</span></div>${line(0,a)}${line(1,b)}${eq?'<div class="eq">Điểm bằng nhau, cần có đội thắng.</div>':''}</div>`;
}
const visCats=()=>C.cats.filter(cc=>cc.active&&(state.ui.cat==='all'||state.ui.cat===cc.cat.id));
function catChips(){return`<div class="chips"><button class="chip" data-act="catf" data-v="all" aria-pressed="${state.ui.cat==='all'}">Tất cả</button>${C.cats.filter(c=>c.active).map(c=>`<button class="chip" data-act="catf" data-v="${c.cat.id}" aria-pressed="${state.ui.cat===c.cat.id}">${esc(c.cat.short)}</button>`).join('')}</div>`;}

/* ---------- TABS ---------- */
function vSetup(){
  const cfg=state.cfg;
  // trùng VĐV giữa các nội dung
  const seen={},dups=[];
  state.cats.forEach(c=>c.teams.forEach((t,i)=>{[t.a,t.b].forEach(p=>{const k=(p||'').trim().toLowerCase();if(!k)return;
    (seen[k]=seen[k]||[]).push(`${c.short} #${i+1}`);});}));
  Object.keys(seen).forEach(k=>{if(seen[k].length>1)dups.push(`${k} (${seen[k].join(', ')})`);});
  let h=`<section class="card"><header><h2>Thông tin chung</h2></header>
  <div class="grid">
   <label class="f" style="grid-column:1/-1">Tên giải<input type="text" data-live="1" data-act="cfgtxt" data-f="title" data-k="cfg:title" value="${esc(cfg.title)}"></label>
   <label class="f">Số sân<input type="number" min="1" max="24" data-act="cfgnum" data-f="courts" data-k="cfg:courts" value="${cfg.courts}"></label>
   <label class="f">Giờ bắt đầu<input type="time" data-act="cfgtxt" data-f="start" data-k="cfg:start" value="${esc(cfg.start)}"></label>
   <label class="f">Phút / trận vòng bảng<input type="number" min="5" max="120" data-act="cfgnum" data-f="gDur" data-k="cfg:gDur" value="${cfg.gDur}"></label>
   <label class="f">Phút / trận loại trực tiếp<input type="number" min="5" max="120" data-act="cfgnum" data-f="kDur" data-k="cfg:kDur" value="${cfg.kDur}"></label>
   <label class="f">Nghỉ trưa từ<input type="time" data-act="cfgtxt" data-f="breakFrom" data-k="cfg:bf" value="${esc(cfg.breakFrom)}"></label>
   <label class="f">Đến<input type="time" data-act="cfgtxt" data-f="breakTo" data-k="cfg:bt" value="${esc(cfg.breakTo)}"></label>
   <label class="f">Cách lượt giữa các vòng KO<input type="number" min="0" max="6" data-act="cfgnum" data-f="rest" data-k="cfg:rest" value="${cfg.rest}"></label>
   <label class="f">Hiệu số khi 3 đội bằng điểm<select data-act="cfgtxt" data-f="diff" data-k="cfg:diff"><option value="all" ${cfg.diff==='all'?'selected':''}>Toàn bộ trận trong bảng</option><option value="mini" ${cfg.diff==='mini'?'selected':''}>Chỉ trận giữa các đội bằng điểm</option></select></label>
  </div>
  <div class="row" style="margin-top:12px"><label class="chk"><input type="checkbox" data-act="cfgchk" data-f="third" data-k="cfg:third" ${cfg.third?'checked':''}> Có trận tranh hạng Ba (để có đủ Nhất, Nhì, Ba, Tư)</label></div>
  <p class="small muted" style="margin:10px 0 0">Vòng bảng chạm 11 điểm, đổi sân ở 6. Loại trực tiếp chạm 15 điểm, đổi sân ở 8. Để trống giờ nghỉ trưa nếu không nghỉ.</p></section>`;
  if(dups.length)h+=`<div class="note bad"><b>VĐV đăng ký trùng nội dung:</b> ${dups.map(esc).join('; ')}. Mỗi VĐV chỉ được thi đấu 01 nội dung.</div>`;
  state.cats.forEach((c,ci)=>{
    const cc=C.cats[ci],sizes=Array.from({length:c.groups},(_,g)=>c.teams.filter(t=>t.g===g).length);
    const bad=sizes.some(s=>s>4||(s<3&&c.n>=2));
    h+=`<section class="card"><header><div style="flex:1;min-width:220px"><input type="text" data-live="1" data-act="catname" data-c="${c.id}" data-k="cn:${c.id}" value="${esc(c.name)}" style="font:700 22px var(--f-disp);padding:6px 8px"></div>
      <div class="chips">${c.n>=2?sizes.map((s,g)=>`<span class="pill ${s>4||s<3?'warn':''}">Bảng ${letter(g)}: ${s} đội</span>`).join(''):'<span class="pill">Không tổ chức</span>'}</div></header>
      <div class="row">
       <label class="f" style="width:110px">Số đội<input type="number" min="0" max="64" data-act="catn" data-c="${c.id}" data-k="n:${c.id}" value="${c.n}"></label>
       <label class="f" style="width:110px">Số bảng<input type="number" min="1" max="16" data-act="catg" data-c="${c.id}" data-k="g:${c.id}" value="${c.groups}"></label>
       <label class="chk"><input type="checkbox" data-act="cathasb" data-c="${c.id}" data-k="hb:${c.id}" ${c.hasB?'checked':''}> Có Serie B (đội hạng 3-4 đá tiếp)</label>
       <button class="btn pri" data-act="draw" data-c="${c.id}" ${c.n<2?'disabled':''}>Bốc thăm chia bảng</button>
       ${c.gAuto?'':`<button class="btn" data-act="gauto" data-c="${c.id}">4 đội / bảng</button>`}
       <button class="btn" data-act="pastetoggle" data-c="${c.id}">Dán danh sách</button>
       ${c.drawn?'<span class="pill ok">Đã bốc thăm</span>':'<span class="pill">Chưa bốc thăm</span>'}
      </div>
      ${state.ui.paste[c.id]!=null?`<div style="margin-top:12px;display:grid;gap:8px"><textarea id="paste-${c.id}" data-k="paste:${c.id}" placeholder="Mỗi dòng một đội: Tên VĐV 1 / Tên VĐV 2">${esc(state.ui.paste[c.id])}</textarea><div class="row"><button class="btn pri" data-act="pasteapply" data-c="${c.id}">Áp dụng danh sách</button><button class="btn" data-act="pastetoggle" data-c="${c.id}">Đóng</button><span class="small muted">Ngăn cách hai VĐV bằng dấu /, + hoặc &amp;. Số đội sẽ theo số dòng.</span></div></div>`:''}
      ${bad&&c.n>=2?'<div class="note" style="margin-top:12px">Mỗi bảng nên có 3-4 đội. Đổi số bảng hoặc chỉnh cột Bảng bên dưới.</div>':''}
      ${c.n>=2?`<div class="xscroll" style="margin-top:12px"><table class="teams"><thead><tr><th>#</th><th>VĐV 1</th><th>VĐV 2</th><th>Bảng</th></tr></thead><tbody>${c.teams.map((t,i)=>`<tr><td class="tn">${i+1}</td>
        <td><input type="text" data-live="1" data-act="tname" data-c="${c.id}" data-t="${t.id}" data-f="a" data-k="ta:${t.id}" placeholder="VĐV 1" value="${esc(t.a)}"></td>
        <td><input type="text" data-live="1" data-act="tname" data-c="${c.id}" data-t="${t.id}" data-f="b" data-k="tb:${t.id}" placeholder="VĐV 2" value="${esc(t.b)}"></td>
        <td class="g"><select data-act="tgroup" data-c="${c.id}" data-t="${t.id}" data-k="tg:${t.id}">${Array.from({length:c.groups},(_,g)=>`<option value="${g}" ${t.g===g?'selected':''}>${letter(g)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Nhập số đội từ 2 trở lên để tạo bảng đấu.</p>'}
    </section>`;
  });
  h+=`<section class="card"><header><h2>Dữ liệu</h2></header>
    <p class="small muted" style="margin:0 0 12px">Dữ liệu tự lưu trong trình duyệt này. Xuất file để sao lưu hoặc mở trên thiết bị khác.</p>
    <div class="row"><button class="btn" data-act="exportjson">Xuất sao lưu (.json)</button><button class="btn" data-act="exportcsv">Xuất lịch thi đấu (.csv)</button><button class="btn" data-act="imptoggle">Nạp sao lưu</button>
    ${state.ui.reset?`<span class="small">Xoá toàn bộ dữ liệu?</span><button class="btn danger" data-act="resetyes">Xoá hết</button><button class="btn" data-act="resetno">Giữ lại</button>`:'<button class="btn danger" data-act="resetask">Làm lại từ đầu</button>'}</div>
    ${state.ui.imp?`<div style="margin-top:12px;display:grid;gap:8px"><input type="file" id="impfile" accept=".json,application/json" data-act="impfile"><textarea id="imptext" data-k="imptext" placeholder="Hoặc dán nội dung file sao lưu vào đây"></textarea><div class="row"><button class="btn pri" data-act="impapply">Nạp dữ liệu</button></div></div>`:''}
  </section>`;
  return h;
}

function vGroups(){
  const cs=visCats();if(!cs.length)return'<div class="card muted">Chưa có nội dung nào có từ 2 đội trở lên.</div>';
  let h=`<div class="row" style="justify-content:space-between;align-items:center">${catChips()}</div>`;
  cs.forEach(cc=>{
    h+=`<section class="card"><header><h2>${esc(cc.cat.name)}</h2><span class="pill">${cc.cat.n} đội · ${cc.groups.length} bảng</span></header><div class="gcards">`;
    cc.groups.forEach(g=>{
      const st=g.st,hasB=cc.cat.hasB;
      h+=`<div class="card gcard" style="background:var(--bg)"><header style="margin:0"><h3>Bảng ${g.name}</h3>${g.complete?'<span class="pill ok">Hoàn tất</span>':`<span class="pill">${st.done}/${g.matches.length} trận</span>`}</header>
      <div class="xscroll"><table class="st"><thead><tr><th>#</th><th>Đội</th><th class="c">T</th><th class="c">B</th><th class="c">HS</th><th class="c">Đ</th><th></th></tr></thead><tbody>
      ${st.order.map((id,k)=>{const s=st.S[id],d=s.pf-s.pa,rk=k+1;
        const tag=!g.complete?'':rk<=2?`<span class="pill a">${hasB?'Serie A':'Vào KO'}</span>`:hasB?'<span class="pill b">Serie B</span>':'<span class="pill">Dừng bước</span>';
        return`<tr><td class="tn">${rk}</td><td class="nmc">${esc(cc.tmap[id].name)}${st.unres.has(id)?' <span class="pill warn">cần bốc thăm</span>':''}</td><td class="c tn">${s.w}</td><td class="c tn">${s.l}</td><td class="c tn">${d>0?'+'+d:d}</td><td class="c tn"><b>${s.w}</b></td><td>${tag}</td></tr>`;}).join('')}
      </tbody></table></div>
      ${st.unres.size?`<div class="note">Các đội bằng nhau mọi tiêu chí. ${RO?'BTC đang xác định thứ hạng bằng bốc thăm.':`Bốc thăm để xác định thứ hạng.<div style="margin-top:8px"><button class="btn" data-act="lots" data-c="${cc.cat.id}" data-g="${g.idx}">Bốc thăm</button></div>`}</div>`:''}
      <div class="mlist">${g.matches.map(m=>mcard(m,{})).join('')}</div></div>`;
    });
    h+='</div></section>';
  });
  return h;
}

function vBracket(){
  const cs=visCats();if(!cs.length)return'<div class="card muted">Chưa có nội dung nào có từ 2 đội trở lên.</div>';
  let h=`${catChips()}`;
  cs.forEach(cc=>{
    cc.series.forEach(s=>{
      const nLast=s.rounds.length-1;
      h+=`<section class="card"><header><h2>${esc(cc.cat.name)} <span class="pill ${s.key==='A'?'a':s.key==='B'?'b':''}">${esc(s.label)}</span></h2><span class="small muted">${s.count} đội${s.size>s.count?' · '+(s.size-s.count)+' suất BYE':''}</span></header>
      <div class="xscroll"><div class="cols">${s.rounds.map((R,ri)=>`<div class="col"><div class="rd">${esc(R.name)}</div>${R.matches.map(m=>mcard(m,{phase:false})).join('')}
        ${ri===nLast&&s.third?`<div class="rd" style="margin-top:14px">Tranh hạng Ba</div>${mcard(s.third,{phase:false})}`:''}</div>`).join('')}</div></div></section>`;
    });
  });
  return h;
}

function vSchedule(){
  if(!C.slots.length)return`<div class="card muted">${RO?'Chưa có lịch thi đấu. BTC sẽ cập nhật sớm.':'Chưa có trận nào. Nhập số đội ở tab Thiết lập.'}</div>`;
  const q=(state.ui.q||'').trim().toLowerCase(),f=state.ui.cat;
  const vis=m=>{if(m.bye)return false;if(f!=='all'&&m.cat!==f)return false;
    if(q){const a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);if(!(a.label+' '+b.label).toLowerCase().includes(q))return false;}return true;};
  const cols=Array.from({length:C.courts},(_,i)=>i);
  let rows='';
  C.slots.forEach(s=>{
    const any=s.ms.some(vis);if(!any)return;
    if(s.brk)rows+=`<tr class="brk"><td colspan="${C.courts+1}">Nghỉ giải lao ${fmt(s.brk.from)} – ${fmt(s.brk.to)}</td></tr>`;
    rows+=`<tr><td class="t">${fmt(s.start)}<small>${s.dur} phút</small></td>${cols.map(k=>{const m=s.ms[k];return`<td>${m&&vis(m)?mcard(m,{cat:true,when:false}):'<div class="empty">·</div>'}</td>`;}).join('')}</tr>`;
  });
  return`<div class="row" style="justify-content:space-between;align-items:flex-end">${catChips()}<label class="f" style="width:min(100%,260px)">Tìm đội / VĐV<input type="text" data-live="1" data-act="q" data-k="q" value="${esc(state.ui.q)}" placeholder="Nhập tên"></label></div>
  <section class="card" style="padding:0"><div class="xscroll"><table class="sched"><thead><tr><th class="t">Giờ</th>${cols.map(k=>`<th>Sân ${k+1}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${C.courts+1}" class="empty">Không có trận phù hợp.</td></tr>`}</tbody></table></div></section>
  <p class="small muted" style="margin:0">Dự kiến kết thúc lúc ${fmt(C.end)}. Các trận loại trực tiếp tự xếp sau khi vòng trước đã có lượt. ${RO?'Kết quả tự cập nhật khi BTC nhập tỉ số.':'Nhập tỉ số ngay trên thẻ trận, đội thắng sẽ tự đi tiếp.'}</p>`;
}

function vHonors(){
  const cs=visCats();if(!cs.length)return'<div class="card muted">Chưa có nội dung nào có từ 2 đội trở lên.</div>';
  let h=`<div class="row" style="justify-content:space-between">${catChips()}<button class="btn" data-act="copyhon">Sao chép danh sách trao giải</button></div>`;
  cs.forEach(cc=>cc.series.forEach(s=>{
    const txt=s.honors.map(r=>r.place+': '+(r.team||'chưa xác định')).join('. ');
    h+=`<section class="card"><header><h2>${esc(cc.cat.name)} <span class="pill ${s.key==='A'?'a':s.key==='B'?'b':''}">${esc(s.label)}</span></h2>
      <button class="btn" data-act="savepng" data-c="${cc.cat.id}" data-s="${s.key}">Lưu ảnh PNG</button></header>
      <canvas class="poster" width="2000" height="1116" data-poster="${cc.cat.id}|${s.key}" role="img" aria-label="${esc(cc.cat.name+' '+s.label+'. '+txt)}"></canvas></section>`;
  }));
  return h;
}

/* ---------- POSTER (canvas) ---------- */
const BG=new Image();BG.src='/poster-bg.jpg';BG.onload=()=>drawPosters();
const FONT='Barlow, "Segoe UI", sans-serif';
function setFont(ctx,w,px){ctx.font=`${w} ${px}px ${FONT}`;}
function fitPx(ctx,text,w,maxW,maxPx,minPx){let px=maxPx;for(;px>minPx;px-=2){setFont(ctx,w,px);if(ctx.measureText(text).width<=maxW)return px;}setFont(ctx,w,minPx);return minPx;}
function drawName(ctx,parts,cx,cy,box,o){
  ctx.textAlign='center';ctx.textBaseline='middle';
  const fill=()=>{if(o.grad){const g=ctx.createLinearGradient(0,cy-o.max,0,cy+o.max);o.grad.forEach(([p,c])=>g.addColorStop(p,c));return g;}return o.color;};
  const put=(t,y,px)=>{setFont(ctx,o.weight,px);ctx.save();if(o.shadow){ctx.shadowColor=o.shadow;ctx.shadowBlur=px*.12;ctx.shadowOffsetY=px*.05;}
    ctx.fillStyle=fill();ctx.fillText(t,cx,y);ctx.restore();};
  const two=parts.length>1&&(o.stack||(()=>{const px=fitPx(ctx,parts.join('  &  '),o.weight,box.w,o.max,o.max*.62);return ctx.measureText(parts.join('  &  ')).width>box.w;})());
  if(two){
    const mx=Math.min(o.max,box.h/2*.92);
    const px=Math.min(...parts.map(t=>fitPx(ctx,t,o.weight,box.w,mx,14)));
    parts.forEach((t,i)=>put(t,cy+(i-(parts.length-1)/2)*px*1.12,px));
  }else{
    const t=parts.join('  &  '),px=fitPx(ctx,t,o.weight,box.w,o.max,12);put(t,cy,px);
  }
}
function drawPoster(cv){
  const [cid,sk]=cv.dataset.poster.split('|'),cc=C.byCat[cid],s=cc&&cc.series.find(x=>x.key===sk);if(!s)return;
  const ctx=cv.getContext('2d');ctx.clearRect(0,0,2000,1116);
  if(BG.complete&&BG.naturalWidth)ctx.drawImage(BG,0,0,2000,1116);else{ctx.fillStyle='#bfe6f7';ctx.fillRect(0,0,2000,1116);}
  const lab=(s.key==='M'?cc.cat.short:s.label).toUpperCase();
  ctx.textAlign='center';ctx.textBaseline='middle';
  // tiêu đề + tên nội dung
  const title='KẾT QUẢ THI ĐẤU '+lab,tpx=fitPx(ctx,title,800,1190,78,40);
  ctx.save();ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=tpx*.12;ctx.strokeText(title,1005,222);
  const g=ctx.createLinearGradient(0,194,0,254);g.addColorStop(0,'#2f9a3c');g.addColorStop(1,'#0b4a1c');ctx.fillStyle=g;ctx.fillText(title,1005,222);ctx.restore();
  fitPx(ctx,cc.cat.name,700,900,32,18);ctx.save();ctx.fillStyle='#0f4d1f';ctx.shadowColor='rgba(255,255,255,.95)';ctx.shadowBlur=10;ctx.fillText(cc.cat.name,1005,263);ctx.restore();
  const H=s.honors,none=['Chưa xác định'],ink=r=>r?'#0d4a1e':'#7a9684';
  const rest=H.slice(2),hasT=!!s.third;
  // nhãn ruy băng bên phải
  if(rest.length){ctx.save();ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,40,0,.5)';ctx.shadowBlur=4;
    const lt=hasT?'HẠNG 3 · HẠNG 4':'ĐỒNG HẠNG 3';fitPx(ctx,lt,800,245,36,18);ctx.fillText(lt,1755,496);ctx.restore();}
  // vô địch
  const w1=H[0];
  drawName(ctx,w1.parts||none,967,543,{w:590,h:96},{weight:800,max:60,color:ink(w1.parts)});
  // hạng 2
  const w2=H[1];
  drawName(ctx,w2.parts||none,330,585,{w:350,h:86},{weight:700,max:38,color:ink(w2.parts)});
  // hạng 3 / hạng 4
  const lbl=(t,y)=>{ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#2a7d34';setFont(ctx,700,17);ctx.fillText(t,1690,y);ctx.restore();};
  if(rest.length===1){
    drawName(ctx,rest[0].parts||none,1690,583,{w:350,h:80},{weight:700,max:36,color:ink(rest[0].parts)});
  }else if(rest.length>=2){
    ctx.save();ctx.strokeStyle='rgba(30,110,50,.35)';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(1540,584);ctx.lineTo(1840,584);ctx.stroke();ctx.restore();
    rest.slice(0,2).forEach((r,i)=>{
      const top=i?587:529;
      if(hasT)lbl(i?'HẠNG 4':'HẠNG 3',top+9);
      drawName(ctx,r.parts||none,1690,top+(hasT?36:28),{w:350,h:hasT?36:48},{weight:700,max:hasT?28:32,color:ink(r.parts)});
    });
  }
}
async function drawPosters(){
  const cvs=document.querySelectorAll('canvas[data-poster]');if(!cvs.length)return;
  try{await Promise.all([document.fonts.load('800 100px Barlow'),document.fonts.load('700 40px Barlow')]);}catch(e){}
  document.querySelectorAll('canvas[data-poster]').forEach(drawPoster);
}

/* ---------- RENDER ---------- */
const TABS=RO?[['sched','Lịch thi đấu'],['groups','Vòng bảng'],['bracket','Cây thi đấu'],['honors','Vinh danh']]:[['setup','Thiết lập'],['groups','Vòng bảng'],['bracket','Cây thi đấu'],['sched','Lịch thi đấu'],['honors','Vinh danh']];
function render(){
  if(RO&&!window.__remoteReady){document.getElementById('app').innerHTML='<div class="card"><h3>Đang tải kết quả…</h3><p class="muted" style="margin:8px 0 0">Nếu màn hình này không đổi sau vài giây, hãy kiểm tra kết nối mạng hoặc báo BTC.</p></div>';return;}
  compute();
  const ae=document.activeElement,fk=ae&&ae.dataset&&ae.dataset.k,sel=ae&&ae.selectionStart!=null?[ae.selectionStart,ae.selectionEnd]:null;
  const sc=[...document.querySelectorAll('.xscroll')].map(e=>e.scrollLeft);
  const app=document.getElementById('app');app.style.minHeight=app.offsetHeight+'px';
  document.getElementById('ttl').textContent=state.cfg.title||'Giải Pickleball';
  const nt=state.cats.reduce((a,c)=>a+(c.n>=2?c.n:0),0);
  document.getElementById('stats').innerHTML=`<span><b>${nt}</b> đội</span><span><b>${C.nDone}/${C.nMatch}</b> trận có kết quả</span><span>Kết thúc dự kiến <b>${C.slots.length?fmt(C.end):'--:--'}</b></span>`;
  document.getElementById('tabs').innerHTML=TABS.map(([k,n])=>`<button role="tab" data-act="tab" data-v="${k}" aria-selected="${state.ui.tab===k}">${n}</button>`).join('');
  let h='';
  if(state.ui.copy!=null)h+=`<div class="card"><header><h3>Sao chép nội dung</h3><button class="btn" data-act="closecopy">Đóng</button></header><textarea id="copybox" readonly style="min-height:200px">${esc(state.ui.copy)}</textarea></div>`;
  h+={setup:vSetup,groups:vGroups,bracket:vBracket,sched:vSchedule,honors:vHonors}[state.ui.tab]();
  app.innerHTML=h;
  document.querySelectorAll('.xscroll').forEach((e,i)=>{if(sc[i])e.scrollLeft=sc[i];});
  app.style.minHeight='';
  if(fk){const el=document.querySelector(`[data-k="${CSS.escape(fk)}"]`);if(el){el.focus({preventScroll:true});if(sel){try{el.setSelectionRange(sel[0],sel[1]);}catch(e){}}}}
  if(state.ui.copy!=null){const cb=document.getElementById('copybox');if(cb&&!fk){cb.focus();cb.select();}}
  save();drawPosters();
  if(window.App&&App.onChange)App.onChange();
}

/* ---------- EXPORT ---------- */
function dl(name,data,type){const b=data instanceof Blob?data:new Blob([data],{type:type||'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
async function saveFile(name,text){
  try{const d=await window.claude?.use?.('downloads');if(d){await d.save({filename:name,data:text});return;}}catch(e){if(e&&e.code==='declined')return;}
  dl(name,text,name.endsWith('.json')?'application/json':'text/csv');
}
function csvEsc(s){s=String(s??'');return/[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function scheduleCSV(){
  const rows=[['Trận','Giờ','Sân','Nội dung','Giai đoạn','Đội 1','Đội 2','Tỉ số']];
  C.slots.forEach(s=>s.ms.forEach(m=>{const a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);const sc=a.id&&b.id?getScore(m,a.id,b.id):null;
    rows.push(['T'+pad(m.no),fmt(s.start),m.court+1,C.byCat[m.cat].cat.name,m.phase,a.label,b.label,sc&&Number.isFinite(sc[0])&&Number.isFinite(sc[1])?sc[0]+'-'+sc[1]:'']);}));
  return'﻿'+rows.map(r=>r.map(csvEsc).join(',')).join('\n');
}
function honorsText(){
  let t=state.cfg.title+' - DANH SÁCH TRAO GIẢI\n';
  visCats().forEach(cc=>{t+='\n'+cc.cat.name.toUpperCase()+'\n';cc.series.forEach(s=>{t+='  '+s.label+'\n';s.honors.forEach(r=>{t+='    '+r.place+': '+(r.team||'(chưa xác định)')+'\n';});});});
  return t;}

/* ---------- EVENTS ---------- */
const catOf=id=>state.cats.find(c=>c.id===id);
function handle(el,ev){
  const act=el.dataset.act;if(!act)return false;
  if(RO&&!['tab','catf','q','copyhon','closecopy','savepng'].includes(act))return false;
  const live=el.dataset.live==='1';
  if(ev==='input'&&!live)return false;
  if(ev==='change'&&live&&act!=='cfgtxt')return false;
  const v=el.value,c=el.dataset.c?catOf(el.dataset.c):null;
  switch(act){
    case'tab':state.ui.tab=el.dataset.v;window.scrollTo(0,0);break;
    case'catf':state.ui.cat=el.dataset.v;break;
    case'q':state.ui.q=v;break;
    case'cfgtxt':state.cfg[el.dataset.f]=v;break;
    case'cfgnum':{const lim={courts:[1,24],gDur:[5,120],kDur:[5,120],rest:[0,6]}[el.dataset.f];state.cfg[el.dataset.f]=clamp(parseInt(v),lim[0],lim[1]);break;}
    case'cfgchk':state.cfg[el.dataset.f]=el.checked;break;
    case'catname':c.name=v;break;
    case'catn':c.n=clamp(parseInt(v),0,64);syncTeams(c);break;
    case'catg':c.gAuto=false;c.groups=clamp(parseInt(v),1,16);redeal(c);break;
    case'gauto':c.gAuto=true;syncTeams(c);redeal(c);break;
    case'cathasb':c.hasB=el.checked;break;
    case'tname':c.teams.find(t=>t.id===el.dataset.t)[el.dataset.f]=v;break;
    case'tgroup':c.teams.find(t=>t.id===el.dataset.t).g=parseInt(v);break;
    case'draw':{const idx=c.teams.map((_,i)=>i);for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
      idx.forEach((ti,k)=>{c.teams[ti].g=k%c.groups;});c.drawn=true;c.lots={};break;}
    case'pastetoggle':if(state.ui.paste[c.id]!=null)delete state.ui.paste[c.id];else state.ui.paste[c.id]=c.teams.map(t=>[t.a,t.b].filter(Boolean).join(' / ')).join('\n').replace(/^\s*\/\s*$/gm,'');break;
    case'pasteapply':{const ta=document.getElementById('paste-'+c.id);const lines=ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
      c.n=Math.min(64,lines.length);syncTeams(c);
      lines.slice(0,c.n).forEach((ln,i)=>{const p=ln.split(/\s*(?:\/|\+|&|\t|;)\s*/);c.teams[i].a=(p[0]||'').trim();c.teams[i].b=(p.slice(1).join(' / ')||'').trim();});
      delete state.ui.paste[c.id];break;}
    case'score':{const m=C.matchMap[el.dataset.m],a=resolve(m.a,m.cat),b=resolve(m.b,m.cat);if(!a.id||!b.id)return false;
      const i=+el.dataset.i,cur=(getScore(m,a.id,b.id)||[null,null]).slice();
      cur[i]=v===''?null:Math.min(99,Math.max(0,parseInt(v)));
      if(cur[0]==null&&cur[1]==null)delete state.res[m.id];else state.res[m.id]={ta:a.id,tb:b.id,sa:cur[0],sb:cur[1]};break;}
    case'lots':{const cc=C.byCat[el.dataset.c],g=cc.groups[+el.dataset.g];c.lots=c.lots||{};g.teams.forEach(id=>{c.lots[id]=Math.random();});break;}
    case'exportjson':{const s=JSON.parse(JSON.stringify(state));s.ui={};saveFile('pickleball-sao-luu.json',JSON.stringify(s));return true;}
    case'exportcsv':saveFile('lich-thi-dau.csv',scheduleCSV());return true;
    case'savepng':{const cv=document.querySelector(`canvas[data-poster="${el.dataset.c}|${el.dataset.s}"]`);if(!cv)return false;
      cv.toBlob(b=>dl(`vinh-danh-${el.dataset.c}-${el.dataset.s}.png`,b,'image/png'),'image/png');return true;}
    case'copyhon':state.ui.copy=honorsText();break;
    case'closecopy':state.ui.copy=null;break;
    case'imptoggle':state.ui.imp=!state.ui.imp;break;
    case'impapply':{try{const s=JSON.parse(document.getElementById('imptext').value);if(!s.cats||!s.cfg)throw 0;state=s;state.ui=Object.assign({tab:'setup',cat:'all',q:'',paste:{},copy:null,reset:false,imp:false},{});state.cats.forEach(c=>c.teams.forEach(t=>{const k=parseInt(String(t.id).slice(1));if(k>=uid)uid=k+1;}));}catch(e){state.ui.copy='Nội dung sao lưu không hợp lệ.';}break;}
    case'impfile':{const f=el.files[0];if(!f)return false;const r=new FileReader();r.onload=()=>{const t=document.getElementById('imptext');if(t){t.value=String(r.result);}};r.readAsText(f);return true;}
    case'resetask':state.ui.reset=true;break;
    case'resetno':state.ui.reset=false;break;
    case'resetyes':state=defState();break;
    default:return false;
  }
  render();return true;
}
document.addEventListener('input',e=>{const el=e.target.closest('[data-act]');if(el)handle(el,'input');});
document.addEventListener('change',e=>{const el=e.target.closest('[data-act]');if(el)handle(el,'change');});
document.addEventListener('click',e=>{const el=e.target.closest('button[data-act]');if(el)handle(el,'click');});

load();render();


/* ---------- CẦU NỐI VỚI sync.js ---------- */
const keyEnc=k=>String(k).replace(/\./g,'_'),keyDec=k=>String(k).replace(/_/g,'.');
function arr(x){if(!x)return[];return Array.isArray(x)?x.filter(v=>v!=null):Object.keys(x).sort((a,b)=>a-b).map(k=>x[k]);}
function normCats(x){return arr(x).map(c=>{c.teams=arr(c.teams).map(t=>({id:t.id,a:t.a||'',b:t.b||'',g:+t.g||0}));c.lots=c.lots||{};c.n=c.teams.length;c.groups=+c.groups||1;c.name=c.name||'';c.short=c.short||c.name;return c;});}
function decodeRes(r){const o={};Object.keys(r||{}).forEach(k=>{const v=r[k];if(v)o[keyDec(k)]={ta:v.ta,tb:v.tb,sa:v.sa==null?null:v.sa,sb:v.sb==null?null:v.sb};});return o;}
let _rq=0;
const requestRender=()=>{clearTimeout(_rq);_rq=setTimeout(()=>{if(RO&&!window.__remoteReady)return render();render();},120);};
window.App={mode:MODE,keyEnc,keyDec,
  getData(){return{cfg:state.cfg,cats:state.cats,res:state.res};},
  setCfg(c){state.cfg=Object.assign(defState().cfg,c||{});window.__cfgIn=true;if(window.__catsIn){window.__remoteReady=true;}requestRender();},
  setCats(c){state.cats=normCats(c);window.__catsIn=true;if(window.__cfgIn){window.__remoteReady=true;}requestRender();},
  patchRes(k,v){const id=keyDec(k);if(v)state.res[id]={ta:v.ta,tb:v.tb,sa:v.sa==null?null:v.sa,sb:v.sb==null?null:v.sb};else delete state.res[id];requestRender();},
  replaceAll(d){state.cfg=Object.assign(defState().cfg,d.cfg||{});state.cats=normCats(d.cats);state.res=decodeRes(d.res);state.cats.forEach(c=>c.teams.forEach(t=>{const k=parseInt(String(t.id).slice(1));if(k>=uid)uid=k+1;}));render();},
  onChange:null};
