/* ===== 02-save.js — 存档与设置 / 每日挑战 / 关卡编辑器 ===== */

/* ===== [J1] 存档与设置 ===== */
const SAVE_KEY='ascii-vault-save-v1';
let storageWarning='';
const DEFAULT_BINDINGS={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
function normalizeKey(key) {return key.length===1?key.toLowerCase():key;}
function bindableKey(key) {return typeof key==='string'&&key.length>0&&key.length<=32&&!['Tab','Escape','Control','Alt','Meta','Shift','Dead','Unidentified','Process'].includes(key);}
function normalizeBindings(raw) {
  if(raw===undefined)return {...DEFAULT_BINDINGS};
  const result={};for(const dir of Object.keys(DIRS)){if(!bindableKey(raw?.[dir]))throw new Error('自定义键位无效');result[dir]=normalizeKey(raw[dir]);}
  if(new Set(Object.values(result)).size!==4)throw new Error('方向键位不能重复');return result;
}
function directionFor(key) {
  key=normalizeKey(key);const mode=save.prefs.keyMode;
  if(mode==='custom')return Object.keys(DIRS).find(dir=>save.prefs.bindings[dir]===key);
  if(mode==='arrows')return DEFAULT_KEYS[key.startsWith('Arrow')?key:''];
  if(mode==='wasd')return DEFAULT_KEYS['wasd'.includes(key)&&key.length===1?key:''];
  return DEFAULT_KEYS[key];
}
let pendingBindings={...DEFAULT_BINDINGS};
function showKeySettings() {
  pendingBindings={...save.prefs.bindings};$('key-mode').value=save.prefs.keyMode;
  document.querySelectorAll('[data-bind]').forEach(input=>input.value=pendingBindings[input.dataset.bind]===' '?'Space':pendingBindings[input.dataset.bind]);
  $('custom-bindings').hidden=save.prefs.keyMode!=='custom';$('bindings-status').textContent='';$('save-bindings').disabled=false;
}
function captureBinding(event) {
  if(event.key==='Tab'||event.key==='Escape')return;
  event.preventDefault();event.stopPropagation();
  if(event.isComposing||event.ctrlKey||event.altKey||event.metaKey||!bindableKey(event.key)){$('bindings-status').textContent='请选择单个普通按键，系统组合键、Tab、Esc 和纯修饰键保留。';return;}
  const key=normalizeKey(event.key);pendingBindings[event.currentTarget.dataset.bind]=key;event.currentTarget.value=key===' '?'Space':key;
  try{normalizeBindings(pendingBindings);$('bindings-status').textContent='键位有效，点击保存后生效。';$('save-bindings').disabled=false;}
  catch(error){$('bindings-status').textContent=error.message;$('save-bindings').disabled=true;}
}
function commitBindings() {
  try{save.prefs.bindings=normalizeBindings(pendingBindings);save.prefs.keyMode='custom';writeSave();applyPreferences();$('bindings-status').textContent='自定义键位已保存。';}
  catch(error){$('bindings-status').textContent=error.message;}
}
const ACHIEVEMENTS=[['first','第一次通关'],['rankS','拿到 S 级'],['noUndo','全程不撤销'],['noHint','独立寻宝（不用提示）'],['five','累计通关五次'],['all','征服初章五关'],['chapter2','余烬之城五关全通'],['ending','十五道门 · 全章通关'],['rankA','至少获得 A 级'],['tripleS','累计三次 S 级'],['noHint3','三次不用提示通关'],['speed','三分钟内通关'],['streak3','连续通关三次'],['streak5','连续通关五次'],['collector','收集全部三种道具'],['torch','点燃第一支火把'],['cartographer','找到第一张地图碎片'],['compass','找到第一个罗盘'],['chests5','开启五个宝箱'],['hardcore','全程硬核通关']];
let save=readSave(),saveTimer=null,toastTimer=null;
function emptyStats() {return {totalSteps:0,wins:0,fastest:null,streak:0,bestStreak:0,achievements:[],sRanks:0,cleanRuns:0,chests:0,itemKinds:[],recent:[]};}
function unlockAchievements(ids) {const fresh=ids.filter(id=>!save.stats.achievements.includes(id));if(!fresh.length)return;save.stats.achievements.push(...fresh);scheduleSave();showToast('成就达成：'+fresh.map(id=>ACHIEVEMENTS.find(a=>a[0]===id)[1]).join(' · '));}
function normalizeStats(raw) {
  if(!raw)return emptyStats();
  const result=emptyStats();for(const key of ['totalSteps','wins','streak','bestStreak']){if(!Number.isSafeInteger(raw[key])||raw[key]<0)throw new Error('统计数据无效');result[key]=raw[key];}
  if(raw.fastest!==null&&(!Number.isFinite(raw.fastest)||raw.fastest<0))throw new Error('最快通关时间无效');
  if(result.streak>result.bestStreak||result.bestStreak>result.wins)throw new Error('连续通关统计无效');result.fastest=raw.fastest;
  if(!Array.isArray(raw.achievements)||raw.achievements.some(id=>!ACHIEVEMENTS.some(a=>a[0]===id)))throw new Error('成就数据无效');result.achievements=[...new Set(raw.achievements)];
  for(const key of ['sRanks','cleanRuns','chests']){if(raw[key]!==undefined&&(!Number.isSafeInteger(raw[key])||raw[key]<0))throw new Error('扩展统计无效');result[key]=raw[key]||0;}
  if(raw.itemKinds!==undefined&&(!Array.isArray(raw.itemKinds)||raw.itemKinds.some(k=>!Object.hasOwn(ITEM_NAMES,k))))throw new Error('道具统计无效');result.itemKinds=[...new Set(raw.itemKinds||[])];
  if(raw.recent!==undefined&&(!Array.isArray(raw.recent)||raw.recent.length>24||raw.recent.some(r=>!r||!Number.isInteger(r.level)||r.level<1||r.level>15||!Number.isInteger(r.steps)||r.steps<1)))throw new Error('趋势记录无效');result.recent=(raw.recent||[]).map(r=>({level:r.level,steps:r.steps}));
  return result;
}
function scheduleSave() {clearTimeout(saveTimer);saveTimer=setTimeout(writeSave,400);}
function countMovement() {if(['tutorial','endless'].includes(state.mode))return;save.stats.totalSteps++;scheduleSave();}
function showToast(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function recordStatistics() {
  if(state.mode==='tutorial')return;
  if(state.mode==='endless') {
    if(BigInt(state.endlessStage)>BigInt(save.endless.highestStage))save.endless.highestStage=state.endlessStage;
    save.endless.wins=(BigInt(save.endless.wins)+1n).toString();writeSave();return;
  }
  const stats=save.stats;stats.wins++;stats.streak++;stats.bestStreak=Math.max(stats.bestStreak,stats.streak);stats.fastest=Math.min(stats.fastest??Infinity,state.elapsed);
  const grade=gradeRun(state.moves,state.optimal),earned=['first'];
  if(grade==='S'){stats.sRanks++;earned.push('rankS');}if(['S','A'].includes(grade))earned.push('rankA');
  if(!state.undoUses)earned.push('noUndo');if(!state.hints){stats.cleanRuns++;earned.push('noHint');}
  if(stats.wins>=5)earned.push('five');if([1,2,3,4,5].every(l=>save.bests[l]))earned.push('all');
  if([6,7,8,9,10].every(l=>save.bests[l]))earned.push('chapter2');if(LEVELS.every((_,i)=>save.bests[i+1]))earned.push('ending');
  if(stats.sRanks>=3)earned.push('tripleS');if(stats.cleanRuns>=3)earned.push('noHint3');if(state.elapsed<=180000)earned.push('speed');
  if(stats.streak>=3)earned.push('streak3');if(stats.streak>=5)earned.push('streak5');if(state.hardcoreEntire)earned.push('hardcore');
  stats.recent.push({level:state.level,steps:state.moves});stats.recent=stats.recent.slice(-24);unlockAchievements(earned);writeSave();
}
function showStatistics() {
  $('endless-summary').textContent=`无尽模式 · 最高通关：${save.endless.highestStage==='0'?'尚未通关':'第 '+save.endless.highestStage+' 关'} · 累计通关：${save.endless.wins} 次（独立统计）`;
  const stats=save.stats;$('stats-summary').textContent=`总步数：${stats.totalSteps}　总通关：${stats.wins}　最快：${stats.fastest===null?'暂无':formatTime(stats.fastest)}　最长连续通关：${stats.bestStreak}`;
  $('achievement-list').replaceChildren(...ACHIEVEMENTS.map(([id,title])=>{const li=document.createElement('li');li.textContent=(stats.achievements.includes(id)?'已达成 · ':'未达成 · ')+title;li.style.color=stats.achievements.includes(id)?'var(--gold)':'var(--muted)';return li;}));$('stats-dialog').showModal();const streak=dailyStreak();$('daily-streak').textContent=`每日挑战 · 当前连续 ${streak.current} 天 / 历史最长 ${streak.best} 天（通关记打卡，断一天归零）`;drawStatistics();
}
function drawStatistics() {
  const canvas=$('stats-chart'),width=Math.max(240,canvas.clientWidth),height=180,ratio=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d'),style=getComputedStyle(document.documentElement),values=save.stats.recent;
  canvas.width=width*ratio;canvas.height=height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.font='11px system-ui';ctx.fillStyle=style.getPropertyValue('--muted');
  $('chart-empty').textContent=values.length?'横轴：通关顺序；纵轴：实走步数。':'通关后，这里会记录你的脚步。';if(!values.length)return;
  const max=Math.max(...values.map(v=>v.steps),1),left=40,top=16,bottom=150;
  ctx.strokeStyle=style.getPropertyValue('--line');for(let i=0;i<4;i++){const y=top+(bottom-top)*i/3;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-10,y);ctx.stroke();ctx.fillText(String(Math.round(max*(1-i/3))),2,y+4);}
  const points=values.map((v,i)=>[left+(width-left-14)*i/Math.max(1,values.length-1),bottom-v.steps/max*(bottom-top)]);ctx.strokeStyle=style.getPropertyValue('--gold');ctx.lineWidth=2;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
  ctx.fillStyle=style.getPropertyValue('--gold');points.forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();});ctx.fillText('第 1 次',left,174);ctx.fillText(`第 ${values.length} 次`,width-60,174);canvas.setAttribute('aria-label','最近通关实走步数：'+values.map(v=>`第${v.level}关 ${v.steps}步`).join('，'));
}
function clearStatistics() {confirmActionDialog('只清空总统计与成就，不删除关卡解锁、各关最佳成绩、每日挑战、无尽成绩或设置。确定清空？',()=>{save.stats=emptyStats();writeSave();$('stats-dialog').close();showStatistics();tell('统计与成就已清空，关卡进度已保留。');});}
function normalizeEndless(raw) {
  const result={highestStage:'0',wins:'0'};
  if(raw===undefined)return result;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('无尽成绩格式无效');
  for(const key of ['highestStage','wins']) {
    const value=raw[key]===undefined?'0':raw[key];
    if(typeof value!=='string'||value.length>100||!/^(0|[1-9]\d*)$/.test(value))throw new Error('无尽成绩无效');
    result[key]=value;
  }
  return result;
}
function normalizeSave(raw) {
  if(!raw||raw.version!==1||!Number.isInteger(raw.current)||raw.current<1||raw.current>LEVELS.length||!Number.isInteger(raw.unlocked)||raw.unlocked<raw.current||raw.unlocked>LEVELS.length)throw new Error('存档格式无效');
  const bests={};
  for(let level=1;level<=LEVELS.length;level++) {const b=raw.bests?.[level];if(b){if(!Number.isInteger(b.steps)||b.steps<1||!Number.isFinite(b.time)||b.time<0)throw new Error('成绩无效');if(b.lastHints!==undefined&&(!Number.isInteger(b.lastHints)||b.lastHints<0))throw new Error('提示次数无效');bests[level]={steps:b.steps,time:b.time,lastHints:b.lastHints||0,lastGrade:['S','A','B','C'].includes(b.lastGrade)?b.lastGrade:null};}}
  const daily={};
  for(const [date,record] of Object.entries(raw.daily||{})) {if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(record.steps)||record.steps<1||!Number.isFinite(record.time)||record.time<0)throw new Error('每日成绩无效');if(record.hints!==undefined&&(!Number.isInteger(record.hints)||record.hints<0))throw new Error('每日提示次数无效');daily[date]={steps:record.steps,time:record.time,hints:record.hints||0};}
  if(raw.tutorialDone!==undefined&&typeof raw.tutorialDone!=='boolean')throw new Error('教程状态无效');
  for(const key of ['muted','contrast','large'])if(raw.prefs?.[key]!==undefined&&typeof raw.prefs[key]!=='boolean')throw new Error('偏好设置无效');
  return {version:1,mapGen:raw.mapGen===2?2:1,current:raw.current,unlocked:raw.unlocked,bests,daily,stats:normalizeStats(raw.stats),endless:normalizeEndless(raw.endless),tutorialDone:raw.tutorialDone===true,prefs:{difficulty:Object.hasOwn(DIFFICULTIES,raw.prefs?.difficulty)?raw.prefs.difficulty:'standard',keyMode:['both','arrows','wasd','custom'].includes(raw.prefs?.keyMode)?raw.prefs.keyMode:'both',bindings:normalizeBindings(raw.prefs?.bindings),muted:raw.prefs?.muted===true,music:raw.prefs?.music!==false,sideFs:Number.isInteger(raw.prefs?.sideFs)?Math.max(10,Math.min(17,raw.prefs.sideFs)):12,contrast:raw.prefs?.contrast===true,large:raw.prefs?.large===true,skin:['ruins','forest','space','purple','emerald'].includes(raw.prefs?.skin)?raw.prefs.skin:'ruins',avatarSkin:['original','red','orange','yellow','green','blue','indigo','violet'].includes(raw.prefs?.avatarSkin)?raw.prefs.avatarSkin:'original'}};
}
function readSave() {
  try {const text=localStorage.getItem(SAVE_KEY);if(text)return normalizeSave(JSON.parse(text));}
  catch(error){storageWarning='本地存档不可用或已损坏；本次仍可游玩。';}
  return {version:1,current:1,unlocked:1,bests:{},daily:{},stats:emptyStats(),endless:normalizeEndless(),tutorialDone:false,mapGen:2,prefs:{difficulty:'standard',muted:false,music:true,sideFs:12,skin:'ruins',avatarSkin:'original',contrast:false,large:false,keyMode:'both',bindings:{...DEFAULT_BINDINGS}}};
}
function writeSave() {try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch(error){storageWarning='浏览器未允许本地存档，请允许存储后重试。';tell(storageWarning);}}
let hintCells=new Set(),hintTimer=null;
function clearHint(redraw=false) {clearTimeout(hintTimer);hintCells.clear();if(redraw&&state)render();}
function showHint() {
  if(replay||state.mode==='tutorial'||!['ready','playing'].includes(state.status)||document.querySelector('dialog[open]'))return;
  const paths=pathsFrom(state.map,state.pos,state.collected.size<state.map.keys.length,state.collected);
  const pending=state.map.keys.filter(id=>!state.collected.has(id));
  if(!pending.length){tell('钥匙已经集齐，继续寻找 E 出口。');return;}
  const remaining=pending.filter(id=>paths.distances[id]>=0);
  if(!remaining.length){clearHint();tell('剩下的钥匙都在锁门后面：先去找能打开的锁门所对应的钥匙。');return;}
  const target=remaining.reduce((a,b)=>paths.distances[a]<=paths.distances[b]?a:b);
  clearHint();for(let id=target;id!==state.pos;id=paths.previous[id])hintCells.add(id);hintCells.add(state.pos);state.hints++;
  const blocked=pending.filter(id=>paths.distances[id]<0);
  let note='';
  if(blocked.length){
    const blockedNo=state.map.keys.indexOf(blocked[0])+1;
    const needDoor=(state.map.doors||[]).find(d=>!state.collected.has(state.map.keys[d.key]));
    note=`　${blockedNo} 号被 ${needDoor?needDoor.key+1:'?'} 号锁门挡着，先拿能拿到的那把。`;
  }
  tell(`已标出到 ${state.map.keys.indexOf(target)+1} 号钥匙的最短路线（${paths.distances[target]} 步）。${note}1.5 秒后消失。已用 ${state.hints} 次提示。`);render();hintTimer=setTimeout(()=>clearHint(true),1500);
}
let audioContext=null,soundOptIn=!matchMedia('(any-pointer:coarse)').matches;
function isSoundMuted() {return !soundOptIn||save.prefs.muted;}
function initAudio() {
  if(isSoundMuted())return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  if(!audioContext)audioContext=new Audio();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
}
function sound(kind) {
  if(isSoundMuted()||!audioContext||audioContext.state!=='running')return;
  const notes={step:[[180,0,.022]],key:[[660,0,.08],[990,.09,.13]],locked:[[100,0,.16]],win:[[523,0,.12],[659,.12,.12],[784,.24,.2]]}[kind];
  for(const [frequency,offset,duration] of notes) {const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+offset;oscillator.type=kind==='step'?'square':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(kind==='step'?.025:.10,at+.006);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(at);oscillator.stop(at+duration+.01);}
}
function applySideFs(){
  const fs=Math.max(10,Math.min(17,save.prefs.sideFs||12));
  document.documentElement.style.setProperty('--side-fs',fs+'px');
}
function applyPreferences() {
  applySideFs();
  const muted=isSoundMuted(),musicOn=!muted&&save.prefs.music!==false;
  $('mute').textContent=muted?'声音：关':'声音：开';$('mute').setAttribute('aria-pressed',String(!muted));
  $('music').textContent=musicOn?'音乐：开':'音乐：关';$('music').setAttribute('aria-pressed',String(musicOn));
  $('music').setAttribute('aria-label',musicOn?'关闭背景音乐':'开启背景音乐');
  document.documentElement.dataset.skin=save.prefs.skin;$('skin').value=save.prefs.skin;
  document.documentElement.dataset.avatarSkin=save.prefs.avatarSkin;$('avatar-skin').value=save.prefs.avatarSkin;
  document.documentElement.dataset.contrast=String(save.prefs.contrast);document.documentElement.dataset.large=String(save.prefs.large);$('high-contrast').checked=save.prefs.contrast;$('large-text').checked=save.prefs.large;$('music-toggle').checked=musicOn;
  $('mute').setAttribute('aria-label',muted?'开启音乐和音效':'关闭所有声音');
  $('key-mode').value=save.prefs.keyMode;$('custom-bindings').hidden=save.prefs.keyMode!=='custom';
  const names={both:'方向键 / WASD',arrows:'方向键 ↑ ↓ ← →',wasd:'W A S D',custom:'自定义 '+Object.entries(save.prefs.bindings).map(([dir,key])=>({up:'上',down:'下',left:'左',right:'右'}[dir])+': '+(key===' '?'Space':key)).join(' / ')};
  $('key-help').innerHTML=`${names[save.prefs.keyMode]} 移动，按住连走。<br><strong>点一下看得见的格子，会自动走过去</strong>（按方向键即停）。<br>集齐全部钥匙后走入 <strong>E</strong> 通关。`;
  $('hint').textContent=directionFor('h')?'提示（按钮）':'提示 H';
  if(state){render();centerPlayer();}if($('editor-dialog').open)renderEditor();if($('stats-dialog').open)drawStatistics();
}
function toggleMute() {
  const enabled=isSoundMuted();soundOptIn=true;save.prefs.muted=!enabled;
  if(enabled)save.prefs.music=true;
  writeSave();applyPreferences();
  if(enabled){initAudio();startBgm();}else{stopBgm();audioContext?.suspend().catch(()=>{});}
}
function setMusicEnabled(enabled) {
  save.prefs.music=enabled;
  if(enabled){soundOptIn=true;save.prefs.muted=false;}
  writeSave();applyPreferences();
  if(enabled){initAudio();startBgm();}else stopBgm();
}
/* ===== [J2] 每日挑战 ===== */
/* 返回本地日期（本地时间 0 点换日），不再用 UTC */
function todayUTC() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dailyDate(seed) {return /^L3-daily-(\d{4}-\d{2}-\d{2})$/.exec(seed)?.[1]||null;}
function dailyStreak(records=save.daily,today=todayUTC()) {
  const days=Object.keys(records).map(date=>Date.parse(date+'T00:00:00Z')/86400000).sort((a,b)=>a-b);let run=0,best=0,last=-Infinity;
  for(const day of days){run=day===last+1?run+1:1;best=Math.max(best,run);last=day;}
  const now=Date.parse(today+'T00:00:00Z')/86400000;return {current:last===now||last===now-1?run:0,best};
}
function updateDailyStatus() {const streak=dailyStreak();$('daily').textContent=(save.daily[todayUTC()]?'今日已打卡':'今日挑战')+` · 连续 ${streak.current} 天`;}
function startDaily() {const date=todayUTC();loadLevel(3,null,'daily','L3-daily-'+date);tell(`${date}（本地时间 0 点换日）每日挑战。${save.daily[date]?'今日已记成绩，本次仅练习。':'首次通关记入今日成绩，再次挑战不覆盖。'}`);}
function recordLevel() {
  if(state.mode==='daily') {const date=dailyDate(state.seed);if(date&&!save.daily[date]){save.daily[date]={steps:state.moves,time:state.elapsed,hints:state.hints};writeSave();}updateDailyStatus();return;}
  if(state.mode!=='campaign')return;
  const old=save.bests[state.level];save.bests[state.level]={steps:Math.min(old?.steps??Infinity,state.moves),time:Math.min(old?.time??Infinity,state.elapsed),lastHints:state.hints,lastGrade:gradeRun(state.moves,state.optimal)};
  save.unlocked=Math.max(save.unlocked,Math.min(LEVELS.length,state.level+1));writeSave();
}
function showLevels() {
  $('level-list').replaceChildren(...CHAPTERS.map((chapter,chapterIndex)=>{
    const section=document.createElement('section');section.className='chapter';
    const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=chapter.tag;
    const title=document.createElement('h3');title.textContent=chapter.name;
    const description=document.createElement('p');description.textContent=chapter.text;
    const grid=document.createElement('div');grid.className='chapter-levels';
    for(let n=0;n<5;n++){
      const level=chapterIndex*5+n+1,config=LEVELS[level-1],best=save.bests[level],button=document.createElement('button');button.className='level-card';button.disabled=level>save.unlocked;
      const number=document.createElement('span');number.className='level-number';number.textContent=String(level).padStart(2,'0');
      const name=document.createElement('span');name.textContent=config.name;
      const grade=document.createElement('strong');grade.textContent=button.disabled?'锁定':best?best.lastGrade||'已通关':'出发';
      const detail=document.createElement('small');detail.textContent=button.disabled?'完成前一关解锁':best?`${best.steps} 步 · ${formatTime(best.time)}`:`${config.width}×${config.height} · ${config.keys} 把钥匙`;
      button.append(number,name,grade,detail);button.onclick=()=>{$('levels-dialog').close();$('ending').hidden=true;loadLevel(level);};grid.append(button);
    }
    section.append(eyebrow,title,description,grid);return section;
  }));$('levels-dialog').showModal();
}
function tell(text) {$('message').textContent = text;}
function seededRandom(seed) {
  let value=2166136261;
  for(const char of seed){value^=char.codePointAt(0);value=Math.imul(value,16777619);}
  return ()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
function freshSeed(level) {return `L${level}-`+Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(36)).join('');}
function endlessConfig(stage,difficulty,seed) {
  const depth=Number(BigInt(stage)>60n?60n:BigInt(stage)),growth=(depth-1)/59,base=DIFFICULTIES[difficulty];
  const intros=['风从未知的回廊吹来，新的钥匙藏在岔路深处。','灯火照亮一段陌生石阶，每一道锁都在等待它的钥匙。','墙后的水声忽远忽近，沿着自己的脚步寻找出口。','新的门厅在迷雾中展开，记住走过的路，再向深处出发。','石墙上的刻痕指向远方，真正的方向要由你来寻找。','一阵回声穿过空荡的地宫，下一道门仍未开启。'];
  const outros=['这一层的石门已经打开，新的迷宫正在前方等待。','你留下了一串脚印，带着新的方向继续深入。','锁舌轻响，回廊向更深处延伸。','这一层的谜题已解开，下一次寻宝即将开始。'];
  const random=seededRandom(seed+'-story');
  return {width:Math.min(51,31+2*(depth-1)),height:Math.min(43,19+2*(depth-1)),keys:Math.min(8,3+Math.floor((depth-1)/4)),intro:intros[Math.floor(random()*intros.length)],outro:outros[Math.floor(random()*outros.length)],difficulty:{...base,braid:base.braid*(1-.45*growth),spread:base.spread+(1-base.spread)*.65*growth,trapCount:Math.round((3+9*growth)*base.traps),guardCount:base.guards?1+Math.floor((depth-1)/15):0,chestCount:Math.min(5,2+Math.floor((depth-1)/10))}};
}
function startEndless(stage='1',seed=null) {
  loadLevel(1,null,'endless',seed||`E${stage}-`+freshSeed(1).slice(3));
}
function seedRequest() {
  const value=new URLSearchParams(location.hash.slice(1)).get('seed');
  if(!value||value.length>100||/[\u0000-\u001f]/.test(value))return null;
  const endless=/^E([1-9]\d*)-[a-z0-9]+$/.exec(value);
  if(endless)return {seed:value,endlessStage:endless[1]};
  const match=/^L(1[0-5]|[1-9])-/.exec(value);return {seed:value,level:match?Number(match[1]):1};
}
function updateLink() {
  const seedEl=$('seed-value');if(seedEl)seedEl.textContent=state.seed;
  const hash=new URLSearchParams(state.mode==='custom'?{map:encodeMap(state.map)}:{seed:state.seed}).toString();history.replaceState(null,'','#'+hash);
}
async function copyText(text) {
  try{if(!navigator.clipboard)throw new Error('clipboard');await navigator.clipboard.writeText(text);tell('已复制。');}
  catch(error){$('copy-content').value=text;$('copy-dialog').showModal();$('copy-content').select();tell('浏览器限制自动复制，请在弹窗中手动复制。');}
}
function copyLevelLink() {copyText(location.href);}
function encodeMap(map) {return 'MAZE1.'+btoa(JSON.stringify(validateMap(map)));}
function decodeMap(code) {
  if(typeof code!=='string'||code.length>60000||!code.startsWith('MAZE1.'))throw new Error('关卡代码格式无效');
  let text,data;
  try{text=atob(code.slice(6));}catch(error){throw new Error('关卡代码编码无效，请确认整段复制完整');}
  try{data=JSON.parse(text);}catch(error){throw new Error('关卡数据已损坏，无法解析');}
  return validateMap(data);
}
function exportMap(map=state.map) {try{$('map-code').value=encodeMap(map);if($('editor-dialog').open)$('editor-dialog').close();if(!$('transfer-dialog').open)$('transfer-dialog').showModal();$('transfer-status').textContent='关卡代码已生成，可复制给别人导入。';}catch(error){tell(error.message);}}
function importMap() {try{const map=decodeMap($('map-code').value.trim());$('transfer-dialog').close();loadLevel(1,map,'custom');tell('关卡导入成功，可以直接游玩。');}catch(error){$('transfer-status').textContent='导入失败：'+error.message;}}
function downloadJSON(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.setAttribute('aria-label','下载存档');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let confirmAction=null;
function confirmActionDialog(text,action) {$('confirm-text').textContent=text;confirmAction=action;$('confirm-dialog').showModal();}
async function importSaveFile(file) {
  if(!file)return;
  try{if(file.size>1048576)throw new Error('存档不能超过 1 MB');const incoming=normalizeSave(JSON.parse(await file.text()));confirmActionDialog('将用此文件覆盖本机进度、成绩、统计和设置。确认恢复？',()=>{state=null;save=incoming;writeSave();applyPreferences();updateDailyStatus();$('transfer-dialog').close();loadLevel(save.current);tell('存档已恢复。');});}
  catch(error){$('transfer-status').textContent='恢复失败：'+error.message;}
  finally{$('save-file').value='';}
}
