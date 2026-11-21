/* ===== 03-map.js — 地图生成 / 点击自动行走 / 视野与光照 ===== */

/* ===== [J3] 关卡编辑器 ===== */
let draft=null,editorCursor=0,painting=false;
function validateMap(input) {
  if(!input||input.version!==1||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<5||input.height<5||input.width>61||input.height>61)throw new Error('宽高必须为 5—61 的整数');
  const size=input.width*input.height;
  if(!Array.isArray(input.cells)||input.cells.length!==size||input.cells.some(c=>c!==0&&c!==1))throw new Error('地图格子数据无效');
  const valid=id=>Number.isInteger(id)&&id>=0&&id<size&&!input.cells[id];
  if(!valid(input.start))throw new Error('请放置一个起点');if(!valid(input.exit))throw new Error('请放置一个出口');
  if(!Array.isArray(input.keys)||input.keys.length<1||input.keys.length>8||input.keys.some(id=>!valid(id)))throw new Error('请放置 1—8 把钥匙');
  const elements=[input.start,input.exit,...input.keys];if(new Set(elements).size!==elements.length)throw new Error('起点、出口和钥匙不能重叠');
  const reachable=pathsFrom(input,input.start);
  if(reachable.queue.length!==input.cells.filter(c=>!c).length)throw new Error('所有道路和元素必须连通');
  const beforeDoor=pathsFrom(input,input.start,true);if(input.keys.some(id=>beforeDoor.distances[id]<0))throw new Error('有钥匙被锁着的出口挡住，无法通关');
  const map={version:1,width:input.width,height:input.height,cells:[...input.cells],start:input.start,exit:input.exit,keys:[...input.keys]};
  const occupied=new Set(elements);
  for(const field of ['doors','items','traps','chests']) {
    if(input[field]===undefined)continue;
    if(!Array.isArray(input[field])||input[field].length>size)throw new Error('地城元素格式无效');
    map[field]=input[field].map(value=>{
      if(!value||!valid(value.pos)||occupied.has(value.pos))throw new Error('地城元素位置无效或重叠');occupied.add(value.pos);
      if(field==='doors'){if(!Number.isInteger(value.key)||value.key<0||value.key>=map.keys.length)throw new Error('门的钥匙编号无效');return {pos:value.pos,key:value.key};}
      if(field==='traps')return {pos:value.pos,hardOnly:value.hardOnly===true};
      const type=field==='items'?value.type:value.loot;if(!Object.prototype.hasOwnProperty.call(ITEM_NAMES,type))throw new Error('道具类型无效');return field==='items'?{pos:value.pos,type}:{pos:value.pos,loot:type};
    });
  }
  if(input.guards!==undefined){if(!Array.isArray(input.guards)||input.guards.length>12)throw new Error('守卫数量无效');map.guards=input.guards.map(g=>{if(!g||!Array.isArray(g.path)||g.path.length<2||g.path.length>100||g.path.some((id,i)=>!valid(id)||occupied.has(id)||!adjacent(map,id).includes(g.path[(i+1)%g.path.length])))throw new Error('守卫巡逻路线无效');return {path:[...g.path]};});}
  if(!canCompleteMap(map))throw new Error('门钥匙形成死锁，无法通关');
  return map;
}
function showEditor() {
  draft={...state.map,cells:[...state.map.cells],keys:[...state.map.keys]};editorCursor=draft.start;
  $('editor-width').value=draft.width;$('editor-height').value=draft.height;$('editor-dialog').showModal();renderEditor();
}
function blankEditor() {
  const width=Number($('editor-width').value),height=Number($('editor-height').value);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<5||height<5||width>61||height>61){$('editor-validation').textContent='宽高必须为 5—61 的整数';return;}
  draft={version:1,width,height,cells:Array.from({length:width*height},(_,id)=>id<width||id>=width*(height-1)||id%width===0||id%width===width-1?1:0),start:null,exit:null,keys:[]};editorCursor=width+1;renderEditor();
}
function renderEditor() {
  const canvas=$('editor-canvas'),cell=save.prefs.large?28:20,ctx=canvas.getContext('2d'),colors=getComputedStyle(document.documentElement);
  canvas.width=draft.width*cell;canvas.height=draft.height*cell;ctx.fillStyle=colors.getPropertyValue('--unknown');ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font=(save.prefs.large?'21px':'15px')+' Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let id=0;id<draft.cells.length;id++) {const key=draft.keys.indexOf(id);let char=draft.cells[id]?'#':'·',color='--wall';if(id===draft.start){char='@';color='--green';}else if(id===draft.exit){char='E';color='--green';}else if(key>=0){char=String(key+1);color='--gold';}ctx.fillStyle=colors.getPropertyValue(color);ctx.fillText(char,(id%draft.width)*cell+cell/2,Math.floor(id/draft.width)*cell+cell/2);}
  const markers=[...(draft.doors||[]).map(d=>[d.pos,LOCK_SIGNS[d.key]]),...(draft.items||[]).map(i=>[i.pos,{torch:'T',map:'M',compass:'C'}[i.type]]),...(draft.chests||[]).map(c=>[c.pos,'▣']),...(draft.traps||[]).map(t=>[t.pos,'△']),...(draft.guards||[]).map(g=>[g.path[0],'G'])];
  for(const [id,char] of markers){ctx.fillStyle=colors.getPropertyValue('--unknown');ctx.fillRect(id%draft.width*cell,Math.floor(id/draft.width)*cell,cell,cell);ctx.fillStyle=colors.getPropertyValue('--gold');ctx.fillText(char,id%draft.width*cell+cell/2,Math.floor(id/draft.width)*cell+cell/2);}
  ctx.strokeStyle=colors.getPropertyValue('--gold');ctx.strokeRect((editorCursor%draft.width)*cell+1,Math.floor(editorCursor/draft.width)*cell+1,cell-2,cell-2);
  try{validateMap(draft);$('editor-validation').textContent='校验通过：起点、钥匙、出口均可达。';$('editor-validation').style.color='var(--green)';canvas.style.outline='1px solid var(--line)';$('editor-play').disabled=false;}
  catch(error){$('editor-validation').textContent=error.message;$('editor-validation').style.color='var(--danger)';canvas.style.outline='2px solid var(--danger)';$('editor-play').disabled=true;}
  canvas.setAttribute('aria-label',`关卡画布，光标在第 ${Math.floor(editorCursor/draft.width)+1} 行 ${editorCursor%draft.width+1} 列。方向键移动光标，空格绘制。`);
}
function paintCell(id) {
  if(!draft||id<0||id>=draft.cells.length)return;
  const tool=$('editor-tool').value;
  if(tool==='key'&&!draft.keys.includes(id)&&draft.keys.length>=8){$('editor-validation').textContent='最多放置 8 把钥匙；请先擦除一把。';return;}
  const removedKey=draft.keys.indexOf(id);
  if(removedKey>=0)draft.doors=draft.doors?draft.doors.filter(d=>d.key!==removedKey).map(d=>({...d,key:d.key>removedKey?d.key-1:d.key})):undefined;
  for(const field of ['doors','items','traps','chests'])if(draft[field])draft[field]=draft[field].filter(v=>v.pos!==id);
  if(draft.guards)draft.guards=draft.guards.filter(g=>!g.path.includes(id));
  draft.keys=draft.keys.filter(key=>key!==id);if(draft.start===id)draft.start=null;if(draft.exit===id)draft.exit=null;
  draft.cells[id]=tool==='wall'?1:0;
  if(tool==='start')draft.start=id;if(tool==='exit')draft.exit=id;if(tool==='key')draft.keys.push(id);
  editorCursor=id;renderEditor();
}
function paintPointer(event) {
  const rect=$('editor-canvas').getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)*draft.width/rect.width),y=Math.floor((event.clientY-rect.top)*draft.height/rect.height);
  if(x>=0&&x<draft.width&&y>=0&&y<draft.height)paintCell(y*draft.width+x);
}
function playDraft() {try{const map=validateMap(draft);$('editor-dialog').close();loadLevel(1,map,'custom');tell('自定义关卡试玩中；重新打开编辑器可继续修改。');}catch(error){$('editor-validation').textContent=error.message;}}

function formatTime(ms) {const s=Math.floor(ms/1000);return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function adjacent(map,id) {
  const x=id%map.width,y=Math.floor(id/map.width), result=[];
  for(const [dx,dy] of Object.values(DIRS)) {const nx=x+dx,ny=y+dy;if(nx>=0&&nx<map.width&&ny>=0&&ny<map.height)result.push(ny*map.width+nx);}
  return result;
}
function pathsFrom(map,start,blockExit=false,collected=null) {
  const distances=new Int32Array(map.cells.length).fill(-1),previous=new Int32Array(map.cells.length).fill(-1),queue=[start];
  distances[start]=0;
  for(let i=0;i<queue.length;i++) for(const next of adjacent(map,queue[i])) {
    if(map.cells[next]||distances[next]!==-1||(blockExit&&next===map.exit)||(collected&&lockedDoor(map,next,collected)))continue;
    distances[next]=distances[queue[i]]+1;previous[next]=queue[i];queue.push(next);
  }
  return {distances,previous,queue};
}
/* ===== [J4] 地图生成 ===== */
function generateMap(width,height,keyCount,random=Math.random,braidRate=0.10,keySpread=1) {
  const map={version:1,width,height,cells:Array(width*height).fill(1),start:width+1,exit:null,keys:[]};
  const stack=[map.start];map.cells[map.start]=0;
  while(stack.length) {
    const id=stack[stack.length-1],x=id%width,y=Math.floor(id/width);
    const options=Object.values(DIRS).filter(([dx,dy])=>x+dx*2>0&&x+dx*2<width-1&&y+dy*2>0&&y+dy*2<height-1&&map.cells[id+dy*width*2+dx*2]);
    if(!options.length){stack.pop();continue;}
    const [dx,dy]=options[Math.floor(random()*options.length)],next=id+dy*width*2+dx*2;
    map.cells[id+dy*width+dx]=0;map.cells[next]=0;stack.push(next);
  }
  for(let by=1;by<height-1;by++) for(let bx=1;bx<width-1;bx++) {
    const bid=by*width+bx;
    if(!map.cells[bid])continue;
    const up=!map.cells[bid-width],down=!map.cells[bid+width],left=!map.cells[bid-1],right=!map.cells[bid+1];
    if(((up&&down&&!left&&!right)||(left&&right&&!up&&!down))&&random()<braidRate)map.cells[bid]=0;
  }
  let recenter=map.start,bestOpen=-1,bestDist=Infinity;
  for(let id=0;id<map.cells.length;id++) {
    if(map.cells[id])continue;
    const cx=id%width,cy=Math.floor(id/width);
    const open=adjacent(map,id).filter(next=>!map.cells[next]).length;
    const dist=Math.abs(cx-(width-1)/2)+Math.abs(cy-(height-1)/2);
    if(open>bestOpen||(open===bestOpen&&dist<bestDist)){bestOpen=open;bestDist=dist;recenter=id;}
  }
  map.start=recenter;
  const startPaths=pathsFrom(map,map.start);map.exit=startPaths.queue.reduce((a,b)=>startPaths.distances[a]>startPaths.distances[b]?a:b);
  const anchors=[startPaths.distances,pathsFrom(map,map.exit).distances];
  for(let i=0;i<keyCount;i++) {
    const cand=[];
    for(const id of startPaths.queue){if(map.keys.includes(id))continue;const score=Math.min(...anchors.map(d=>d[id]));if(score>=0)cand.push([id,score]);}
    cand.sort((a,b)=>a[1]-b[1]);
    const pick=cand.length?cand[Math.min(cand.length-1,Math.floor((cand.length-1)*Math.max(0,Math.min(1,keySpread))))][0]:map.start;
    map.keys.push(pick);anchors.push(pathsFrom(map,pick).distances);
  }
  return map;
}
function lockedDoor(map,id,collected) {return map.doors&&map.doors.find(d=>d.pos===id&&!collected.has(map.keys[d.key]));}
function canCompleteMap(map) {
  const found=new Set();let previous=-1;
  while(previous!==found.size){previous=found.size;const paths=pathsFrom(map,map.start,true,found);for(const key of map.keys)if(paths.distances[key]>=0)found.add(key);}
  return found.size===map.keys.length&&pathsFrom(map,map.start,false,found).distances[map.exit]>=0;
}
function addDungeon(map,random,level,diffCfg) {
  const trapMul=diffCfg?diffCfg.traps:1,guardMul=diffCfg?diffCfg.guards:1;
  map.doors=[];map.items=[];map.traps=[];map.chests=[];map.guards=[];
  const occupied=new Set([map.start,map.exit,...map.keys]);
  for(let key=0;key<map.keys.length;key++) {
    const target=map.keys[key+1]!=null?map.keys[key+1]:map.exit,paths=pathsFrom(map,map.start),route=[];
    for(let id=target;id!==map.start;id=paths.previous[id])route.push(id);
    for(const pos of route) {
      if(occupied.has(pos)||paths.distances[pos]<4)continue;
      map.cells[pos]=1;const cut=pathsFrom(map,map.start);map.cells[pos]=0;
      if(cut.distances[target]>=0||cut.distances[map.keys[key]]<0)continue;
      map.doors.push({pos,key});
      if(canCompleteMap(map)){occupied.add(pos);break;}map.doors.pop();
    }
  }
  if(!map.doors.length) {
    for(const pos of pathsFrom(map,map.start).queue.slice().reverse()){
      if(occupied.has(pos))continue;
      map.doors.push({pos,key:0});if(canCompleteMap(map)){occupied.add(pos);break;}map.doors.pop();
    }
  }
  const free=pathsFrom(map,map.start,true,new Set()).queue.filter(id=>!occupied.has(id));
  const all=pathsFrom(map,map.start).queue.filter(id=>!occupied.has(id));
  const take=pool=>{const choices=pool.filter(id=>!occupied.has(id));if(!choices.length)return null;const id=choices[Math.floor(random()*choices.length)];occupied.add(id);return id;};
  for(const type of ['torch','map','compass','torch']){const pos=take(free);if(pos!==null)map.items.push({pos,type});}
  for(let i=0,chestCount=diffCfg&&diffCfg.chestCount!=null?diffCfg.chestCount:2+Math.floor(level/5);i<chestCount;i++){const pos=take(all);if(pos!==null)map.chests.push({pos,loot:['torch','map','compass'][Math.floor(random()*3)]});}
  for(let i=0,trapCount=diffCfg&&diffCfg.trapCount!=null?diffCfg.trapCount:Math.round((2+Math.ceil(level/3))*trapMul);i<trapCount;i++){const pos=take(all);if(pos!==null)map.traps.push({pos,hardOnly:i%2===1});}
  const startDistances=pathsFrom(map,map.start).distances;
  for(let i=0,guardCount=diffCfg&&diffCfg.guardCount!=null?diffCfg.guardCount:Math.round(Math.min(2,1+Math.floor(level/7))*guardMul);i<guardCount;i++) {
    const candidates=all.filter(id=>!occupied.has(id)&&startDistances[id]>12);
    const start=take(candidates);if(start===null)break;
    const next=adjacent(map,start).find(id=>!map.cells[id]&&!occupied.has(id));if(next===undefined)continue;
    occupied.add(next);map.guards.push({path:[start,next]});
  }
  return map;
}
function difficultyConfig() {return DIFFICULTIES[state.difficulty];}
/* ===== [J5] 点击格子自动行走 ===== */
let walkPath=null,walkTimer=null;
function stopAutoWalk(){if(walkTimer){clearTimeout(walkTimer);walkTimer=null;}walkPath=null;}
function autoWalkStep(){
  walkTimer=null;
  if(!walkPath||!walkPath.length){stopAutoWalk();return;}
  if(!state||!['ready','playing'].includes(state.status)||replay||document.querySelector('dialog[open]')){stopAutoWalk();return;}
  const next=walkPath[0],w=state.map.width,d=next-state.pos;
  const direction=d===-w?'up':d===w?'down':d===-1?'left':d===1?'right':null;
  if(!direction){stopAutoWalk();return;}
  const from=state.pos;
  move(direction);
  if(state.pos===from){stopAutoWalk();return;}
  walkPath.shift();
  if(walkPath.length)walkTimer=setTimeout(autoWalkStep,95);else stopAutoWalk();
}
function walkTo(target){
  stopAutoWalk();stopMovement();
  if(!state||!state.map||replay||!['ready','playing'].includes(state.status)||document.querySelector('dialog[open]'))return;
  const M=state.map;
  if(!Number.isInteger(target)||target<0||target>=M.cells.length||target===state.pos)return;
  if(M.cells[target]){tell('那边是石墙。');return;}
  if(!state.visible.has(target)&&!state.seen.has(target)){tell('那一带还没探索过，走近了才能点。');return;}
  if(target===M.exit&&state.collected.size<M.keys.length){tell(`石门紧闭，还需要 ${M.keys.length-state.collected.size} 把钥匙。`);return;}
  const locked=lockedDoor(M,target,state.collected);
  if(locked){tell(`那是 ${locked.key+1} 号锁门，先找到 ${locked.key+1} 号钥匙。`);return;}
  const allowExit=target===M.exit;
  const paths=pathsFrom(M,state.pos,!allowExit,state.collected);
  if(paths.distances[target]<0){tell('那边现在过不去。');return;}
  const path=[];
  for(let at=target;at!==state.pos&&at>=0;at=paths.previous[at])path.push(at);
  path.reverse();
  if(!path.length)return;
  walkPath=path;
  showEffect(target,'walk-target');
  autoWalkStep();
}
function updateNav(){
  const el=$('nav-hint');
  if(!el||!state||!state.map)return;
  const M=state.map,pending=M.keys.filter(id=>!state.collected.has(id));
  if(!pending.length){
    const p=pathsFrom(M,state.pos,false,state.collected),d=p.distances[M.exit];
    el.textContent=d>=0?'钥匙已集齐，跟着 E 走。':'钥匙已集齐。';
    return;
  }
  const paths=pathsFrom(M,state.pos,true,state.collected);
  const reachable=pending.filter(id=>paths.distances[id]>=0);
  if(!reachable.length){
    el.textContent=pending.map(id=>M.keys.indexOf(id)+1).join('、')+' 号都在锁门后面，先开锁。';
    return;
  }
  const target=reachable.reduce((a,b)=>paths.distances[a]<=paths.distances[b]?a:b);
  const n=M.keys.indexOf(target)+1,d=paths.distances[target];
  const dx=target%M.width-state.pos%M.width,dy=Math.floor(target/M.width)-Math.floor(state.pos/M.width);
  const arrow=Math.abs(dx)<2&&Math.abs(dy)<2?'就在旁边':(dy<0?(dx<0?'↖':dx>0?'↗':'↑'):(dx<0?'↙':dx>0?'↘':'↓'));
  el.textContent=`最近：${n} 号钥匙 · ${d} 步 · ${arrow}`;
}
function refreshKeyReach(){
  if(!state||!state.map)return;
  const paths=pathsFrom(state.map,state.map.start,true,state.collected);
  state.keyReach=new Set();
  state.map.keys.forEach((id,i)=>{if(state.collected.has(id)||paths.distances[id]>=0)state.keyReach.add(i);});
}
function setBudget() {
  const walkable=state.map.cells.filter(c=>!c).length;
  state.limit=['campaign','daily','shared'].includes(state.mode)&&(state.level>=3||state.difficulty==='hardcore')?Math.ceil(walkable*difficultyConfig().budget):null;
  if(state.mode!=='endless'||(BigInt(state.endlessStage)<BigInt(3)&&state.difficulty!=='hardcore'))return;
  const path=solveShortest(state.map).path,trapCost=difficultyConfig().trap;
  const traps=new Set(state.map.traps.filter(t=>!t.hardOnly||state.difficulty==='hardcore').map(t=>t.pos)),guardCells=new Set(state.map.guards.reduce((list,g)=>list.concat(g.path),[]));
  let routeCost=path.length-1;
  for(let i=1;i<path.length;i++) {
    if(traps.has(path[i]))routeCost+=trapCost;
    // 守卫推回后重试多耗一步并额外罚五步，还可能再次踩中原地陷阱。
    if(guardCells.has(path[i-1])||guardCells.has(path[i]))routeCost+=6+(traps.has(path[i-1])?trapCost:0);
  }
  state.limit=Math.ceil(Math.max(walkable*difficultyConfig().budget,routeCost*1.15));
}
function changeDifficulty() {
  if(!state||state.mode==='tutorial'||replay)return;
  state.difficulty=$('difficulty').value;state.hardcoreEntire=state.hardcoreEntire&&state.difficulty==='hardcore';save.prefs.difficulty=state.difficulty;writeSave();setBudget();clearHint();updateVision();render();
  if(state.status==='lost'&&(!state.limit||state.steps<state.limit))state.status='playing';
  tell(`${difficultyConfig().name}模式：视野 ${difficultyConfig().radius} 格。${state.difficulty==='hardcore'?'离开视野即遗忘；地图碎片仅照亮 6 秒。':'探索过的地图会保留。'}难度已即时生效。`);
}
function grantItem(type) {
  state.itemKinds.add(type);
  if(!['tutorial','endless'].includes(state.mode)){save.stats.itemKinds=[...new Set([...save.stats.itemKinds,type])];unlockAchievements([{torch:'torch',map:'cartographer',compass:'compass'}[type],...(save.stats.itemKinds.length===3?['collector']:[])]);scheduleSave();}
  if(type==='torch')state.torchUntil=Math.max(state.elapsed,state.torchUntil)+30000;
  if(type==='compass')state.compass=true;
  if(type==='map') {
    const hidden0=state.map.keys.find(id=>!state.collected.has(id)),hidden=hidden0!=null?hidden0:state.map.exit,x=hidden%state.map.width,y=Math.floor(hidden/state.map.width);
    for(let yy=Math.max(0,y-5);yy<=Math.min(state.map.height-1,y+5);yy++)for(let xx=Math.max(0,x-5);xx<=Math.min(state.map.width-1,x+5);xx++)state.charted.add(yy*state.map.width+xx);
    state.mapRevealUntil=state.elapsed+6000;
  }
  tell(`获得${ITEM_NAMES[type]}。${type==='torch'?'视野扩大 3 格，增加 30 秒。':type==='map'?'远方的一片区域被点亮。':'地图边缘将指向最近的未收集钥匙。'}`);
}
function collectItems() {
  const item=state.map.items&&state.map.items.find(i=>i.pos===state.pos&&!state.takenItems.has(i.pos));
  if(item){state.takenItems.add(item.pos);grantItem(item.type);sound('key');}
  const chest=state.map.chests&&state.map.chests.find(c=>c.pos===state.pos&&!state.openedChests.has(c.pos));
  if(chest){state.openedChests.add(chest.pos);showToast(`宝箱开启 · ${ITEM_NAMES[chest.loot]}（撤销不会重置宝箱）`);grantItem(chest.loot);if(!['tutorial','endless'].includes(state.mode)){save.stats.chests++;if(save.stats.chests>=5)unlockAchievements(['chests5']);scheduleSave();}sound('key');}
}
function turnGuards(from) {
  const hits=[];
  state.guards.forEach((guard,i)=>{const path=state.map.guards[i].path,old=path[guard.index];if(guard.stun>0){guard.stun--;return;}guard.index=(guard.index+1)%path.length;const pos=path[guard.index];if(pos===state.pos||(old===state.pos&&pos===from))hits.push(guard);});
  if(hits.length){state.steps+=5;state.pos=from;hits.forEach(g=>g.stun=2);state.guardHits++;bump('撞上巡逻守卫：扣 5 步并被推回。守卫失衡两回合，此时可穿过。');}
}
function turnSnapshot() {return {pos:state.pos,steps:state.steps,collected:[...state.collected],guards:state.guards.map(g=>({...g})),facing:state.facing,revealed:[]};}
function traceStep() {return {pos:state.pos,collected:[...state.collected],guards:state.guards.map(g=>({...g})),takenItems:[...state.takenItems],openedChests:[...state.openedChests],facing:state.facing};}
const shortestCache=new WeakMap();
function solveShortest(map) {
  if(shortestCache.has(map))return shortestCache.get(map);
  const size=map.cells.length,full=(1<<map.keys.length)-1,total=size*(full+1),bits=new Uint16Array(size),parents=new Int32Array(total).fill(-2),queue=new Int32Array(total);
  map.keys.forEach((id,index)=>bits[id]=1<<index);
  const neighbors=map.cells.map((wall,id)=>wall?[]:adjacent(map,id).filter(next=>!map.cells[next]));
  let head=0,tail=1;queue[0]=map.start;parents[map.start]=-1;
  while(head<tail) {
    const encoded=queue[head++],mask=Math.floor(encoded/size),pos=encoded%size;
    if(pos===map.exit&&mask===full) {
      const path=[];for(let cursor=encoded;cursor!==-1;cursor=parents[cursor])path.push(cursor%size);path.reverse();
      const result={steps:path.length-1,path};shortestCache.set(map,result);return result;
    }
    for(const next of neighbors[pos]) {
      const door=map.doors&&map.doors.find(d=>d.pos===next);if(door&&!(mask&(1<<door.key)))continue;
      const nextMask=mask|bits[next];if(next===map.exit&&nextMask!==full)continue;
      const code=nextMask*size+next;if(parents[code]!==-2)continue;parents[code]=encoded;queue[tail++]=code;
    }
  }
  throw new Error('地图没有可通关路线');
}
function gradeRun(actual,optimal) {const ratio=actual/optimal;return ratio<=1.2?'S':ratio<=1.45?'A':ratio<=1.9?'B':'C';}
/* ===== [J6] 视野与光照 ===== */
function lineOfSight(map,from,to) {
  let x=from%map.width,y=Math.floor(from/map.width);
  const tx=to%map.width,ty=Math.floor(to/map.width),dx=Math.abs(tx-x),dy=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y);
  let error=dx-dy;
  while(x!==tx||y!==ty) {
    const twice=error*2;let nx=x,ny=y;
    if(twice>-dy){error-=dy;nx+=sx;}if(twice<dx){error+=dx;ny+=sy;}
    if(nx!==x&&ny!==y&&(map.cells[y*map.width+nx]||map.cells[ny*map.width+x]))return false;
    x=nx;y=ny;
    if(x===tx&&y===ty)return true;
    if(map.cells[y*map.width+x]||(state&&state.map===map&&lockedDoor(map,y*map.width+x,state.collected)))return false;
  }
  return true;
}
function updateVision() {
  const {map,pos}=state,x=pos%map.width,y=Math.floor(pos/map.width),revealed=[];state.visible=new Set();
  const R=difficultyConfig().radius+(state.torchUntil>state.elapsed?3:0);
  for(let yy=Math.max(0,y-R);yy<=Math.min(map.height-1,y+R);yy++) for(let xx=Math.max(0,x-R);xx<=Math.min(map.width-1,x+R);xx++) {
    const id=yy*map.width+xx;
    if((xx-x)**2+(yy-y)**2<=R*R&&lineOfSight(map,pos,id)){state.visible.add(id);if(!state.seen.has(id))revealed.push(id);state.seen.add(id);}
  }
  if(state.difficulty==='hardcore')state.seen=new Set(state.visible);
  if(state.difficulty!=='hardcore'||state.mapRevealUntil>state.elapsed)for(const id of state.charted){state.seen.add(id);state.visible.add(id);}
  return revealed;
}
function loadLevel(level,map=null,mode='campaign',seed=null) {
  if(state&&!['tutorial','endless'].includes(state.mode)&&mode!=='endless'&&state.moves>0&&['playing','lost'].includes(state.status)){save.stats.streak=0;writeSave();}
  stopMovement();stopAutoWalk();gesture=null;stopReplay(false);clearHint();avatarMap=null;document.querySelectorAll('.tile-effect').forEach(el=>el.remove());
  if(mode!=='tutorial'){tutorial=null;$('tutorial-panel').hidden=true;}
  seed=seed||(map?'custom':freshSeed(level));
  const difficulty=save.prefs.difficulty||'standard',endlessStage=mode==='endless'?seed.slice(1,seed.indexOf('-')):null;
  const config=mode==='endless'?endlessConfig(endlessStage,difficulty,seed):LEVELS[level-1];
  const diffCfg=config.difficulty||DIFFICULTIES[difficulty];
  const keyCount=Math.max(2,config.keys+diffCfg.keys);
  map=map||addDungeon(generateMap(config.width,config.height,keyCount,seededRandom(seed),diffCfg.braid,diffCfg.spread),seededRandom(seed+'-dungeon'),level,diffCfg);
  state={level,mode,seed,endlessStage,outro:config.outro,map,difficulty,hardcoreEntire:difficulty==='hardcore',pos:map.start,facing:'down',collected:new Set(),visited:new Set([map.start]),seen:new Set(),visible:new Set(),charted:new Set(),takenItems:new Set(),openedChests:new Set(),itemKinds:new Set(),compass:false,torchUntil:0,mapRevealUntil:0,guards:(map.guards||[]).map(()=>({index:0,stun:0})),guardHits:0,trapHits:0,steps:0,moves:0,optimal:solveShortest(map).steps,elapsed:0,status:'ready',history:[],undoUses:0,hints:0,trace:[],limit:null};
  state.trace.push(traceStep());refreshKeyReach();updateNav();setBudget();$('difficulty').value=difficulty;
  if(mode==='campaign'){save.current=level;writeSave();}
  document.documentElement.dataset.mode=mode;
  if(mode!=='tutorial')updateLink();lastTick=performance.now();updateVision();render();
  tell(`${mode==='endless'?`无尽模式 · 第 ${state.endlessStage} 关。`:''}${config.intro}　找到 ${map.keys.length} 把钥匙。${state.limit?'本关限 '+state.limit+' 步。':'本关不限步数。'}`);
  centerPlayer();fadeInLevel();
}
function fadeInLevel() {const layer=$('level-fade');layer.classList.remove('enter');void layer.offsetWidth;layer.classList.add('enter');}
