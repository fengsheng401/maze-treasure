/* ===== 04-render.js — 单格类型 / 渲染 ===== */

/* ===== [J7] 单格类型 ===== */
function tileAt(view,id) {
  if(!view.isReplay&&hintCells.has(id))return {char:'*',type:'hint'};
  if(!view.seen.has(id))return {char:' ',type:'unseen'};
  let char=view.map.cells[id]?'#':'·',type=view.map.cells[id]?'wall':view.visited.has(id)?'visited':'floor';
  const door=view.map.doors&&view.map.doors.find(d=>d.pos===id),item=view.map.items&&view.map.items.find(i=>i.pos===id&&!(view.takenItems&&view.takenItems.has(id))),chest=view.map.chests&&view.map.chests.find(c=>c.pos===id),trap=view.map.traps&&view.map.traps.find(t=>t.pos===id&&(!t.hardOnly||view.difficulty==='hardcore'));
  if(trap){char='△';type='trap';}
  if(item){char={torch:'T',map:'M',compass:'C'}[item.type];type='item';}
  if(chest){char=view.openedChests&&view.openedChests.has(id)?'□':'▣';type=view.openedChests&&view.openedChests.has(id)?'floor':'chest';}
  if(door){char=LOCK_SIGNS[door.key];type=view.collected.has(view.map.keys[door.key])?'gate-open':'gate';}
  if(view.guards&&view.guards.some((g,i)=>view.map.guards[i].path[g.index]===id)){char='G';type='guard';}
  if(view.isReplay&&view.visited.has(id)){char='*';type='key';}
  if(view.map.keys.includes(id)&&!view.collected.has(id)){char=String(view.map.keys.indexOf(id)+1);type='key';}
  if(id===view.map.exit){char='E';type=view.collected.size===view.map.keys.length?'door open':'door';}
  if(!view.visible.has(id))type=view.map.cells[id]?'remembered-wall':'remembered-floor';
  if(id===view.pos){char='·';type='visited';}
  return {char,type};
}
let avatarMap=null;
/* 按容器宽高把格子算到刚好铺满；正方形格子，大地图到下限就让容器滚动 */
let fitMap=null,fitW=0,fitH=0;
function fitCell(map){
  const stage=$('maze-stage');
  if(!stage||!map)return;
  const w=stage.clientWidth,h=stage.clientHeight;
  if(!w||!h)return;
  if(fitMap===map&&fitW===w&&fitH===h)return;
  fitMap=map;fitW=w;fitH=h;
  const style=getComputedStyle(stage);
  const availW=Math.max(1,w-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)),availH=Math.max(1,h-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
  const scale=save.prefs.large?1.12:1;
  let cell=Math.min(availW/map.width,availH/map.height)*scale;
  cell=Math.max((replay?lastWin.mode:state.mode)==='endless'?16:14,Math.min(36,Math.floor(cell*2)/2));
  document.documentElement.style.setProperty('--cell',cell+'px');
  document.documentElement.style.setProperty('--row',cell+'px');
  drawCache.map=null;
}
function cellMetrics() {const style=getComputedStyle(document.documentElement);return {width:parseFloat(style.getPropertyValue('--cell')),height:parseFloat(style.getPropertyValue('--row'))};}
function positionAvatar(view) {
  const cell=cellMetrics(),avatar=$('avatar'),torch=$('torch');
  const tx=view.pos%view.map.width*cell.width,ty=Math.floor(view.pos/view.map.width)*cell.height;
  if(avatarMap!==view.map){avatar.style.transition='none';avatar.style.translate=tx+'px '+ty+'px';void avatar.offsetWidth;avatar.style.transition='';avatarMap=view.map;}else avatar.style.translate=tx+'px '+ty+'px';
  avatar.dataset.facing=view.facing||'down';
  const lightRadius=view.isReplay?9:difficultyConfig().radius+(state.torchUntil>state.elapsed?3:0);
  torch.style.width=cell.width*(lightRadius*2+1)+'px';torch.style.height=cell.height*(lightRadius*2+1)+'px';
  torch.style.translate=(tx-cell.width*lightRadius)+'px '+(ty-cell.height*lightRadius)+'px';
}

let propCache=new Map(),propMap=null;
function syncProps(view){
  const layer=$('props');
  if(!layer)return;
  if(propMap!==view.map){for(const el of propCache.values())el.remove();propCache.clear();propMap=view.map;}
  const cell=cellMetrics(),W=view.map.width,list=new Map();
  const add=(pos,kind,stun=false)=>list.set(pos+':'+kind,{pos,kind,stun});
  (view.map.items||[]).forEach(item=>{if(view.takenItems&&view.takenItems.has(item.pos))return;if(view.visible.has(item.pos))add(item.pos,'item-'+item.type);});
  (view.map.chests||[]).forEach(chest=>{if(view.visible.has(chest.pos))add(chest.pos,view.openedChests&&view.openedChests.has(chest.pos)?'chest-open':'chest');});
  (view.map.traps||[]).forEach(trap=>{if(trap.hardOnly&&view.difficulty!=='hardcore')return;if(view.visible.has(trap.pos))add(trap.pos,'trap');});
  (view.guards||[]).forEach((guard,i)=>{const pos=view.map.guards[i].path[guard.index];if(view.visible.has(pos))add(pos,'guard',guard.stun>0);});
  (view.map.doors||[]).forEach(door=>{if(!view.seen.has(door.pos))return;add(door.pos,view.collected.has(view.map.keys[door.key])?'gate-open':'gate');});
  for(const [key,el] of propCache){if(!list.has(key)){el.remove();propCache.delete(key);}}
  for(const [key,item] of list){
    let el=propCache.get(key);
    if(!el){
      el=document.createElement('span');
      el.className='prop '+item.kind;
      if(item.kind==='chest'||item.kind==='chest-open'||item.kind==='guard'){const dot=document.createElement('b');el.append(dot);}
      if(item.kind==='gate'||item.kind==='gate-open'){const num=document.createElement('i');const door=view.map.doors.find(d=>d.pos===item.pos);num.textContent=door?String(door.key+1):'';el.append(num);}
      layer.append(el);
      propCache.set(key,el);
    }
    el.classList.toggle('stunned',!!item.stun);
    el.style.translate=(item.pos%W)*cell.width+'px '+Math.floor(item.pos/W)*cell.height+'px';
  }
}
function showEffect(id,type) {
  const cell=cellMetrics(),el=document.createElement('span');el.className='tile-effect '+type;el.textContent=type==='door-pop'?'E':type==='step-trail'?'·':type==='walk-target'?'':'*';el.setAttribute('aria-hidden','true');el.style.left=(id%state.map.width*cell.width)+'px';el.style.top=(Math.floor(id/state.map.width)*cell.height)+'px';$('maze-frame').append(el);setTimeout(()=>el.remove(),400);
}
let lastRenderMs=0,lastRenderCells=0;
let drawCache={map:null,key:'',tiles:new Int32Array()};
const TILE_TYPES={unseen:0,wall:1,floor:2,visited:3,key:4,door:5,'door open':6,remembered:7,'remembered-wall':9,'remembered-floor':10,hint:8,gate:11,'gate-open':12,item:13,trap:14,chest:15,guard:16};
/* ===== [J8] 渲染 ===== */
function render() {
  const started=performance.now(),view=replay&&replay.view||state;
  fitCell(view.map);
  const canvas=$('maze'),cell=cellMetrics(),ratio=Math.min(window.devicePixelRatio||1,2);
  const width=view.map.width*cell.width,height=view.map.height*cell.height;
  if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=width+'px';canvas.style.height=height+'px';drawCache.map=null;}
  const ctx=canvas.getContext('2d'),style=getComputedStyle(document.documentElement),color=name=>style.getPropertyValue(name).trim();
  const palette={unseen:color('--unknown'),background:color('--board'),wall:color('--wall'),floor:color('--floor'),visited:color('--muted'),key:color('--gold'),door:color('--muted'),'door open':color('--green'),remembered:color('--memory'),'remembered-wall':color('--memory-wall'),'remembered-floor':color('--memory-floor'),'wall-block':color('--wall-block'),'wall-edge':color('--wall-edge'),'memory-edge':color('--memory-edge'),hint:color('--green')};
  Object.assign(palette,{gate:color('--gold'),'gate-open':color('--green'),item:'#b5dce7',trap:color('--danger'),chest:color('--gold'),guard:color('--danger')});
  const paletteKey=Object.values(palette).join('|')+ratio;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.font=`${Math.floor(cell.height*.72)}px Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
  if(drawCache.map!==view.map||drawCache.key!==paletteKey){ctx.fillStyle=palette.unseen;ctx.fillRect(0,0,width,height);drawCache={map:view.map,key:paletteKey,tiles:new Int32Array(view.map.cells.length).fill(512)};}
  lastRenderCells=0;
  const px=view.pos%view.map.width,py=Math.floor(view.pos/view.map.width),R=9;
  for(let id=0;id<view.map.cells.length;id++) {
    const value=tileAt(view,id),dim=value.type==='unseen'||value.type.startsWith('remembered');
    const bucket=dim?0:Math.min(3,Math.floor(Math.hypot(id%view.map.width-px,Math.floor(id/view.map.width)-py)/R*4));
    const pulse=['key','door open'].includes(value.type)&&!matchMedia('(prefers-reduced-motion: reduce)').matches?Math.round((Math.sin(performance.now()/650)+1)*3):0;
    const signature=(value.char.charCodeAt(0)<<12)|(TILE_TYPES[value.type]<<6)|(pulse<<2)|bucket;
    if(drawCache.tiles[id]===signature)continue;drawCache.tiles[id]=signature;lastRenderCells++;
    const x=id%view.map.width*cell.width,y=Math.floor(id/view.map.width)*cell.height;
    ctx.fillStyle=value.type==='unseen'?palette.unseen:palette.background;ctx.fillRect(x,y,cell.width,cell.height);
    if(value.type==='unseen'){ctx.fillStyle='rgba(255,255,255,0.13)';ctx.fillRect(x+cell.width/2-1,y+cell.height/2-1,1.5,1.5);continue;}
    const lit=1-bucket*0.10;
    if(value.type==='wall'||value.type==='remembered-wall'){
      const block=value.type==='wall'?palette['wall-block']:palette['remembered-wall'];
      const edge=value.type==='wall'?palette['wall-edge']:palette['memory-edge'];
      ctx.globalAlpha=lit;
      ctx.fillStyle='#0008';ctx.fillRect(x+2,y+4,cell.width-2,cell.height-4);
      ctx.fillStyle=block;ctx.fillRect(x+1,y+2,cell.width-2,cell.height-5);
      const top=ctx.createLinearGradient(x,y,x,y+cell.height*.65);top.addColorStop(0,edge);top.addColorStop(1,block);
      ctx.fillStyle=top;ctx.fillRect(x+1,y+1,cell.width-3,cell.height*.65);
      ctx.fillStyle=value.type==='wall'?'#ffffff1e':'#ffffff09';ctx.fillRect(x+1,y+1,cell.width-3,1);
      ctx.fillStyle='#0005';ctx.fillRect(x+cell.width-3,y+2,2,cell.height-4);ctx.fillRect(x+1,y+cell.height*.65,cell.width-2,cell.height*.22);
      ctx.globalAlpha=1;continue;
    }
    ctx.globalAlpha=lit;ctx.fillStyle=value.type==='remembered-floor'?palette['remembered-floor']:palette.floor;ctx.fillRect(x,y,cell.width,cell.height);
    if(value.type==='remembered-floor'){ctx.globalAlpha=1;continue;}
    ctx.save();ctx.beginPath();ctx.rect(x,y,cell.width,cell.height);ctx.clip();
    if(value.type==='key')ctx.font=`bold ${Math.floor(cell.height*.86)}px Consolas,monospace`;
    if(value.type==='key'||value.type==='door open'){ctx.shadowColor=value.type==='key'?palette.key:'#8fe6ac';ctx.shadowBlur=12+pulse*2;ctx.globalAlpha=.95;}
    if(value.type==='gate'){ctx.fillStyle='#3a2925';ctx.fillRect(x+2,y+1,cell.width-4,cell.height-2);ctx.strokeStyle=palette.gate;ctx.strokeRect(x+3,y+2,cell.width-6,cell.height-4);}
    if(!['item','chest','trap','guard','gate','gate-open'].includes(value.type)){ctx.fillStyle=value.type==='door open'?'#9ce8b3':palette[value.type];ctx.fillText(value.char,x+cell.width/2,y+cell.height/2);}
    if(value.type.startsWith('door')){ctx.strokeStyle=value.type==='door open'?'#9ce8b3':palette[value.type];ctx.strokeRect(x+2,y+2,cell.width-4,cell.height-4);}
    ctx.restore();
    ctx.globalAlpha=1;
  }
  positionAvatar(view);syncProps(view);renderHUD();lastRenderMs=performance.now()-started;
  $('render-cost').textContent=`最近绘制 ${lastRenderMs.toFixed(2)} ms / ${lastRenderCells} 格 · Canvas 差量重绘`;
}
function renderHUD() {
  $('steps').textContent=state.moves;$('timer').textContent=formatTime(state.elapsed);$('collected').textContent=`${state.collected.size} / ${state.map.keys.length}`;
  if($('keys').children.length!==state.map.keys.length)setChildren($('keys'),state.map.keys.map((_,i)=>{const el=document.createElement('span');el.className='key-slot';el.textContent=i+1;return el;}));
  [...$('keys').children].forEach((el,i)=>{const got=state.collected.has(state.map.keys[i]),blocked=!got&&state.keyReach&&!state.keyReach.has(i);el.classList.toggle('found',got);el.classList.toggle('locked',blocked);el.setAttribute('aria-label',`钥匙 ${i+1} ${got?'已收集':blocked?'被锁门挡住，暂时拿不到':'未收集'}`);});
  const view=replay&&replay.view||state;$('board-meta').textContent=`${view.map.width} × ${view.map.height}`;
  $('level-title').textContent=replay?`${lastWin.mode==='endless'?'无尽模式 · ':''}第 ${lastWin.endlessStage||lastWin.level} 关路线回放 · ${replay.index} / ${lastWin.route.length-1}`:state.mode==='endless'?`无尽模式 · 第 ${state.endlessStage} 关`:state.mode==='daily'?`${dailyDate(state.seed)} 每日挑战（本地时间 0 点换日）`:state.mode==='custom'?'自定义关卡':state.mode==='tutorial'?'三步引导':`第 ${Math.ceil(state.level/5)} 章 · ${state.level} / ${LEVELS.length} 关 · ${LEVELS[state.level-1].name}`;
  const endlessButton=$('endless'),endlessLabel=state.mode==='endless'?'退出无尽':'无尽模式';
  if(endlessButton.textContent!==endlessLabel)endlessButton.textContent=endlessLabel;
  endlessButton.setAttribute('aria-pressed',String(state.mode==='endless'));
  $('replay-label').textContent=replay?`回放 ${replay.index} / ${lastWin.route.length-1}`:'路线回放';
  const unlocked=state.collected.size===state.map.keys.length;
  $('objective').textContent=unlocked?'出口发出绿光，前往 E 处通关。':'数字钥匙开启相同编号的锁门；集齐后前往 E。';
  const torchSeconds=Math.ceil(Math.max(0,state.torchUntil-state.elapsed)/1000);
  $('inventory').textContent=`${torchSeconds?'火把 '+torchSeconds+' 秒':'火把：未点燃'} · ${state.compass?'罗盘已启用':'罗盘：未找到'} · 宝箱 ${state.openedChests.size}/${state.map.chests&&state.map.chests.length||0}`;
  $('difficulty').disabled=!!replay||state.mode==='tutorial';$('pause').disabled=!!replay||!['ready','playing'].includes(state.status);
  const remaining=view.map.keys.filter(id=>!view.collected.has(id));$('compass').hidden=!state.compass||!remaining.length||!!replay;
  if(!$('compass').hidden){const target=remaining.reduce((a,b)=>Math.hypot(a%view.map.width-view.pos%view.map.width,Math.floor(a/view.map.width)-Math.floor(view.pos/view.map.width))<Math.hypot(b%view.map.width-view.pos%view.map.width,Math.floor(b/view.map.width)-Math.floor(view.pos/view.map.width))?a:b);const angle=Math.atan2(Math.floor(target/view.map.width)-Math.floor(view.pos/view.map.width),target%view.map.width-view.pos%view.map.width)*180/Math.PI;$('compass').innerHTML=`<b style="transform:rotate(${angle}deg)">→</b>钥匙 ${view.map.keys.indexOf(target)+1}`;}
  $('phase').textContent={ready:'等待出发',playing:unlocked?'出口已开启':'探索中',won:'探索完成',lost:'步数用尽'}[state.status];
  $('limit').textContent=state.limit?`步数预算：${state.steps} / ${state.limit}`:'本关不限步数';
  $('maze').setAttribute('aria-label',`${state.mode==='endless'?'无尽模式 · ':''}第 ${state.endlessStage||state.level} 关字符迷宫。位置 ${Math.floor(state.pos/state.map.width)+1} 行 ${state.pos%state.map.width+1} 列，已收集 ${state.collected.size} / ${state.map.keys.length} 把钥匙。`);
}
function centerPlayer() {
  const stage=$('maze-stage'),style=getComputedStyle(document.documentElement),cw=parseFloat(style.getPropertyValue('--cell')),rh=parseFloat(style.getPropertyValue('--row'));
  const view=replay&&replay.view||state;
  const x=(view.pos%view.map.width)*cw,y=Math.floor(view.pos/view.map.width)*rh;
  if(x<stage.scrollLeft+cw||x>stage.scrollLeft+stage.clientWidth-cw*3)stage.scrollLeft=Math.max(0,x-stage.clientWidth/2);
  if(y<stage.scrollTop+rh||y>stage.scrollTop+stage.clientHeight-rh*3)stage.scrollTop=Math.max(0,y-stage.clientHeight/2);
}
function tick() {const now=performance.now();if(state&&state.status==='playing'&&!replay&&!document.hidden&&!document.querySelector('dialog[open]')){state.elapsed+=now-lastTick;updateVision();}lastTick=now;if(state)$('timer').textContent=formatTime(state.elapsed);}
function bump(message) {tell(message);$('maze-frame').classList.remove('flash');void $('maze-frame').offsetWidth;$('maze-frame').classList.add('flash');}
function finishLevel() {
  tick();state.status='won';sound('win');recordLevel();recordStatistics();
  lastWin={level:state.level,mode:state.mode,endlessStage:state.endlessStage,difficulty:state.difficulty,map:state.map,steps:state.moves,budgetSteps:state.steps,optimal:state.optimal,grade:gradeRun(state.moves,state.optimal),elapsed:state.elapsed,route:state.trace.map(step=>({...step,collected:[...step.collected]})),undoUses:state.undoUses,hints:state.hints};
  $('victory-grade').textContent=lastWin.grade;
  $('victory-title').textContent=`${state.mode==='endless'?'无尽模式 · ':''}第 ${state.endlessStage||state.level} 关寻宝成功`;
  $('win-stats').textContent=`${lastWin.grade} 级 · 实走 ${state.moves} 步 / 理论最短 ${state.optimal} 步（${(state.moves/state.optimal).toFixed(2)}×） · ${formatTime(state.elapsed)} · 提示 ${state.hints} 次 · 撤销 ${state.undoUses} 次`;
  const next=state.mode==='endless'?(BigInt(state.endlessStage)+BigInt(1)).toString():state.mode==='campaign'&&state.level<LEVELS.length?state.level+1:null;
  $('victory-description').textContent=state.outro;
  $('continue').textContent=next?`继续第 ${next} 关`:'再玩一次';
  if(state.mode==='campaign'&&state.level===15&&LEVELS.every((_,i)=>save.bests[i+1]))showEnding();else $('victory').showModal();
}
