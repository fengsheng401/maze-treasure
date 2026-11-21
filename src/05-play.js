/* ===== 05-play.js — 交互流程 / 全部事件绑定与启动 ===== */

/* ===== [J9] 交互流程 ===== */
function move(direction) {
  if(replay||!['ready','playing'].includes(state.status)||document.querySelector('dialog[open]'))return;
  state.facing=direction;$('avatar').dataset.facing=direction;
  const [dx,dy]=DIRS[direction],x=state.pos%state.map.width+dx,y=Math.floor(state.pos/state.map.width)+dy,next=y*state.map.width+x;
  if(x<0||x>=state.map.width||y<0||y>=state.map.height||state.map.cells[next]){bump('前方是石墙，换个方向试试。');return;}
  if(next===state.map.exit&&state.collected.size<state.map.keys.length){sound('locked');bump(`石门紧闭，还需要 ${state.map.keys.length-state.collected.size} 把钥匙。`);return;}
  const locked=lockedDoor(state.map,next,state.collected);if(locked){sound('locked');bump(`这是 ${locked.key+1} 号锁门，先找到 ${locked.key+1} 号钥匙。`);return;}
  if(state.status==='ready'){state.status='playing';lastTick=performance.now();}
  tick();const snapshot=turnSnapshot(),from=state.pos;
  sound('step');showEffect(from,'step-trail');
  state.pos=next;state.steps++;state.moves++;countMovement();turnGuards(from);
  const picked=state.map.keys.includes(state.pos)&&!state.collected.has(state.pos)?state.pos:null;
  state.visited.add(state.pos);
  if(picked!==null){state.collected.add(picked);const unlockedIndex=state.map.keys.indexOf(picked);const openedDoors=(state.map.doors||[]).filter(d=>d.key===unlockedIndex);openedDoors.forEach(d=>{if(state.visible.has(d.pos))showEffect(d.pos,'collect-flash');});refreshKeyReach();sound('key');tell(`拿到 ${unlockedIndex+1} 号钥匙${openedDoors.length?`，${unlockedIndex+1} 号锁门已解锁！`:'。'}${state.collected.size===state.map.keys.length?'出口已开启。':''}`);}else if(state.pos!==from)tell('留意数字钥匙与同编号锁门，守卫每步巡逻一次。');
  collectItems();
  const trap=state.map.traps&&state.map.traps.find(t=>t.pos===state.pos&&(!t.hardOnly||state.difficulty==='hardcore'));
  if(trap){state.steps+=difficultyConfig().trap;state.trapHits++;bump(`踩中陷阱：额外扣 ${difficultyConfig().trap} 步预算。`);}
  snapshot.revealed=updateVision();state.history.push(snapshot);state.trace.push(traceStep());
  if(picked!==null)showEffect(picked,'collect-flash');
  if(state.collected.size===state.map.keys.length&&state.visible.has(state.map.exit)&&!state.doorAnimated){showEffect(state.map.exit,'door-pop');state.doorAnimated=true;}
  advanceTutorial();
  if(state.pos===state.map.exit&&state.mode==='tutorial'){finishTutorial();return;}
  if(state.pos===state.map.exit)finishLevel();
  else if(state.limit&&state.steps>=state.limit){state.status='lost';if(state.mode!=='endless'){save.stats.streak=0;writeSave();}tell('步数预算已用尽，可以撤销一步或重新开始。');}
  render();centerPlayer();updateNav();
  $('avatar').classList.remove('step');void $('avatar').offsetWidth;$('avatar').classList.add('step');
}
function undo() {
  stopAutoWalk();
  if(replay||!state.history.length||state.status==='won'||document.querySelector('dialog[open]'))return;
  tick();const previous=state.history.pop();state.collected=new Set(previous.collected);state.guards=previous.guards.map(g=>({...g}));state.facing=previous.facing;state.doorAnimated=false;
  document.querySelectorAll('.tile-effect').forEach(el=>el.remove());
  previous.revealed.forEach(id=>state.seen.delete(id));state.pos=previous.pos;
  state.visited=new Set([...state.history.map(step=>step.pos),state.pos]);state.steps=previous.steps;state.moves++;countMovement();state.undoUses++;state.status=state.steps?'playing':'ready';
  state.trace.push(traceStep());refreshKeyReach();advanceTutorial();
  lastTick=performance.now();clearHint();updateVision();render();centerPlayer();tell('已撤销：位置、钥匙、守卫与预算回退；宝箱和道具不会复原，用时不倒退。');
}
function restart() {loadLevel(state.level,state.map,state.mode,state.seed);$('maze').focus({preventScroll:true});}
function newMaze() {if(state.mode==='endless')startEndless(state.endlessStage);else if(state.mode==='daily')loadLevel(3,null,'daily',state.seed);else loadLevel(state.level,null,state.mode==='shared'?'shared':'campaign');$('maze').focus({preventScroll:true});}
let moveHold=null,holdTimer=null,gesture=null;
function stopMovement() {clearTimeout(holdTimer);moveHold=null;}
function beginMovement(direction,source) {
  stopMovement();if(!state||!['ready','playing'].includes(state.status)||replay||document.querySelector('dialog[open]'))return;
  moveHold={direction,source};move(direction);
  const repeat=()=>{if(!moveHold)return;if(!['ready','playing'].includes(state.status)||replay||document.hidden||document.querySelector('dialog[open]')){stopMovement();return;}move(moveHold.direction);if(moveHold)holdTimer=setTimeout(repeat,130);};
  if(moveHold)holdTimer=setTimeout(repeat,260);
}
function togglePause() {
  stopAutoWalk();
  if($('pause-dialog').open){$('pause-dialog').close();return;}
  if(!state||replay||!['ready','playing'].includes(state.status))return;
  tick();stopMovement();gesture=null;document.body.classList.add('paused');$('pause-dialog').showModal();$('phase').textContent='已暂停';pauseBgm();
}
function onKey(event) {
  if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing||event.target.closest&&event.target.closest('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if([' ','Enter'].includes(event.key)&&event.target.closest&&event.target.closest('button,a'))return;
  const direction=directionFor(event.key);if(direction){event.preventDefault();stopAutoWalk();if(!event.repeat)beginMovement(direction,'key:'+normalizeKey(event.key));return;}
  if(event.key.toLowerCase()==='p'){event.preventDefault();togglePause();return;}
  if(event.key.toLowerCase()==='h'){event.preventDefault();showHint();return;}
  if(event.key==='Backspace'){event.preventDefault();undo();}
}
document.addEventListener('keydown',onKey);
document.addEventListener('keyup',event=>{if(moveHold&&moveHold.source==='key:'+normalizeKey(event.key))stopMovement();});
window.addEventListener('blur',stopMovement);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#maze-stage,.dpad'))stopMovement();});
document.querySelectorAll('[data-direction]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);beginMovement(button.dataset.direction,'button:'+event.pointerId);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>stopMovement());
  button.addEventListener('click',event=>{if(event.detail===0)move(button.dataset.direction);});
  button.addEventListener('contextmenu',event=>event.preventDefault());
});
$('maze-stage').addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0){stopMovement();gesture=null;return;}
  event.preventDefault();gesture={id:event.pointerId,x:event.clientX,y:event.clientY,direction:null};event.currentTarget.setPointerCapture(event.pointerId);
});
$('maze-stage').addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;event.preventDefault();
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<20){stopMovement();gesture.direction=null;return;}
  const direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  if(direction!==gesture.direction){gesture.direction=direction;beginMovement(direction,'gesture:'+event.pointerId);}
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('maze-stage').addEventListener(type,event=>{if(gesture&&gesture.id===event.pointerId){gesture=null;stopMovement();}});
$('maze-stage').addEventListener('contextmenu',event=>event.preventDefault());
$('pause').onclick=togglePause;$('resume').onclick=togglePause;
$('pause-dialog').addEventListener('close',()=>{lastTick=performance.now();document.body.classList.remove('paused');renderHUD();resumeBgm();$('maze').focus({preventScroll:true});});
const landscapeScreen=matchMedia('(max-width:1100px) and (max-height:600px) and (orientation:landscape)');
const narrowScreen=matchMedia('(max-width:600px), (max-width:1100px) and (max-height:600px) and (orientation:landscape)');
function updateMenu() {$('game-menu').open=!narrowScreen.matches;}
function updateGameLayout() {
  if(landscapeScreen.matches){
    document.querySelector('.sidebar').prepend($('game-actions'),$('message'),$('below-map'),$('controls'));
  }else{
    $('map-viewport').prepend($('message'));
    document.querySelector('main > section').append($('below-map'));
    document.querySelector('.sidebar').append($('controls'));
    $('controls').append($('game-actions'));
  }
}
updateMenu();narrowScreen.addEventListener('change',updateMenu);
updateGameLayout();landscapeScreen.addEventListener('change',updateGameLayout);
$('topbar').addEventListener('click',event=>{if(narrowScreen.matches&&event.target.closest('button'))$('game-menu').open=false;});
const touchScreen=matchMedia('(any-pointer:coarse)'),portraitScreen=matchMedia('(orientation:portrait)'),fullscreenDisplay=matchMedia('(display-mode:fullscreen)');
let fullscreenBusy=false;
function updateFullscreenButton() {
  const active=!!document.fullscreenElement,available=document.fullscreenEnabled&&!!document.documentElement.requestFullscreen;
  const button=$('fullscreen');
  button.hidden=!active&&(!landscapeScreen.matches||!touchScreen.matches||fullscreenDisplay.matches);
  button.textContent=active?'退出全屏':available?'全屏游玩':'全屏说明';
  button.setAttribute('aria-label',button.textContent);
  button.setAttribute('aria-pressed',String(active));
  button.title=active?'恢复浏览器栏':available?'隐藏浏览器栏，让游戏占满屏幕':'查看当前浏览器的全屏限制';
}
async function exitGameFullscreen() {
  if(!document.fullscreenElement)return;
  try{await document.exitFullscreen();}catch(error){tell('暂时无法退出全屏，请使用浏览器的返回或退出全屏操作。');}
}
async function enterGameFullscreen(manual=false) {
  if(fullscreenBusy||document.fullscreenElement||fullscreenDisplay.matches)return;
  if(!document.fullscreenEnabled||!document.documentElement.requestFullscreen){
    if(manual)tell('当前浏览器不支持或不允许网页全屏。可尝试用 Chrome 打开，或在浏览器菜单中添加到主屏幕后游玩。');
    return;
  }
  fullscreenBusy=true;
  try{
    await document.documentElement.requestFullscreen({navigationUI:'hide'});
    if(portraitScreen.matches)await exitGameFullscreen();
  }catch(error){
    if(manual)tell('浏览器未允许进入全屏，请再次点击「全屏游玩」，或在浏览器菜单中添加到主屏幕后游玩。');
  }finally{fullscreenBusy=false;updateFullscreenButton();}
}
/* 不再自动进入全屏：进入全屏时浏览器（Chrome/各手机浏览器）都会弹出"如何退出全屏"的系统提示条，
   网页无法控制它出现的时长；改为只在玩家点「全屏游玩」按钮时进入全屏，提示条就只在点按钮那一次短暂出现，游戏中不再反复弹出。 */
$('fullscreen').onclick=()=>document.fullscreenElement?exitGameFullscreen():enterGameFullscreen(true);
document.addEventListener('fullscreenchange',updateFullscreenButton);
landscapeScreen.addEventListener('change',updateFullscreenButton);
portraitScreen.addEventListener('change',()=>{if(portraitScreen.matches)exitGameFullscreen();updateFullscreenButton();});
fullscreenDisplay.addEventListener('change',updateFullscreenButton);
updateFullscreenButton();
$('difficulty').onchange=changeDifficulty;
$('restart').onclick=restart;$('new-maze').onclick=newMaze;$('undo').onclick=undo;$('hint').onclick=showHint;
$('continue').onclick=()=>{$('victory').close();if(state.mode==='endless')startEndless((BigInt(state.endlessStage)+BigInt(1)).toString());else if(state.mode==='campaign'&&state.level<LEVELS.length)loadLevel(state.level+1,null,'campaign',`L${state.level+1}-`+state.seed.replace(/^L\d+-/,''));else newMaze();};
function showEnding() {stopReplay(false);$('victory').close();$('ending-stats').textContent=`15 / 15 关完成 · 累计 ${save.stats.totalSteps} 步 · ${save.stats.achievements.length} / 20 项成就`;$('ending').hidden=false;document.querySelector('.shell').inert=true;$('ending').focus();}
function closeEnding() {$('ending').hidden=true;document.querySelector('.shell').inert=false;}
$('ending-chapters').onclick=()=>{closeEnding();showLevels();};$('ending-route').onclick=()=>{closeEnding();startReplay();};
$('view-map').onclick=()=>startReplay(false);$('watch-route').onclick=()=>startReplay();$('replay-pause').onclick=pauseReplay;$('replay-stop').onclick=()=>stopReplay();
document.addEventListener('visibilitychange',()=>{stopMovement();gesture=null;lastTick=performance.now();if(document.hidden)writeSave();else updateDailyStatus();});window.addEventListener('pagehide',writeSave);
$('stats-open').onclick=showStatistics;$('clear-stats').onclick=clearStatistics;
$('level-select').onclick=showLevels;
document.addEventListener('click',event=>{const close=event.target.closest('[data-close]');if(close)$(close.dataset.close).close();});
if($('copy-link'))$('copy-link').onclick=copyLevelLink;
$('editor-open').onclick=showEditor;$('editor-blank').onclick=blankEditor;$('editor-play').onclick=playDraft;
$('editor-canvas').addEventListener('pointerdown',event=>{painting=true;event.currentTarget.setPointerCapture(event.pointerId);paintPointer(event);});
$('editor-canvas').addEventListener('pointermove',event=>{if(painting)paintPointer(event);});
$('editor-canvas').addEventListener('pointerup',()=>painting=false);$('editor-canvas').addEventListener('pointercancel',()=>painting=false);
$('editor-canvas').addEventListener('keydown',event=>{const dir=DEFAULT_KEYS[event.key];if(dir){event.preventDefault();const [dx,dy]=DIRS[dir],x=Math.max(0,Math.min(draft.width-1,editorCursor%draft.width+dx)),y=Math.max(0,Math.min(draft.height-1,Math.floor(editorCursor/draft.width)+dy));editorCursor=y*draft.width+x;renderEditor();}else if(event.key===' '||event.key==='Enter'){event.preventDefault();paintCell(editorCursor);}});
function loadRequestedLevel() {
  const code=new URLSearchParams(location.hash.slice(1)).get('map');
  if(code){try{loadLevel(1,decodeMap(code),'custom');}catch(error){loadLevel(save.current);tell('链接关卡无效：'+error.message);}return;}
  const request=seedRequest();
  if(request&&request.endlessStage){startEndless(request.endlessStage,request.seed);return;}
  if(request)loadLevel(request.level,null,dailyDate(request.seed)?'daily':request.level>save.unlocked?'shared':'campaign',request.seed);else loadLevel(save.current);
}
$('transfer-open').onclick=()=>{$('transfer-status').textContent='';$('transfer-dialog').showModal();};
$('export-map').onclick=()=>exportMap();$('editor-export').onclick=()=>exportMap(draft);$('import-map').onclick=importMap;$('copy-map').onclick=()=>copyText($('map-code').value);
$('export-save').onclick=()=>downloadJSON(save,'迷宫寻宝-存档-'+todayUTC()+'.json');$('import-save').onclick=()=>$('save-file').click();$('save-file').onchange=event=>importSaveFile(event.target.files[0]);
$('confirm-yes').onclick=()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();if(action)action();};$('confirm-dialog').addEventListener('close',()=>confirmAction=null);
$('daily').onclick=startDaily;updateDailyStatus();
$('endless').onclick=()=>{
  if(state&&state.mode==='endless'){
    const target=Math.max(1,Math.min(save.current||1,LEVELS.length));
    loadLevel(target,null,'campaign');
    tell(`已退出无尽模式，回到第 ${target} 关。`);
  }else startEndless();
};
window.addEventListener('hashchange',loadRequestedLevel);window.addEventListener('resize',()=>{if($('stats-dialog').open)drawStatistics();});
let mapResizeFrame;
function onStageResize(){cancelAnimationFrame(mapResizeFrame);mapResizeFrame=requestAnimationFrame(()=>{if(state){render();centerPlayer();}});}
/* 旧内核没有 ResizeObserver，退回 window resize */
if('ResizeObserver' in window)new ResizeObserver(onStageResize).observe($('maze-stage'));
else window.addEventListener('resize',onStageResize);
$('tutorial-done').onclick=finishTutorial;$('tutorial-skip').onclick=finishTutorial;
/* 点击走：按坐标判定，不依赖命中哪个元素（画布被容器留白/滚动影响时，事件目标常常是容器本身） */
document.addEventListener('click',event=>{
  if(!state||!state.map||replay)return;
  const view=$('maze');
  if(!view)return;
  const target=event.target;
  if(target&&target.closest&&target.closest('button,a,input,select,textarea,dialog,[data-close]'))return;
  const rect=view.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=event.clientX,y=event.clientY;
  if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return;
  const cw=rect.width/state.map.width,ch=rect.height/state.map.height;
  const cx=Math.floor((x-rect.left)/cw),cy=Math.floor((y-rect.top)/ch);
  if(cx<0||cy<0||cx>=state.map.width||cy>=state.map.height)return;
  walkTo(cy*state.map.width+cx);
},true);
$('side-minus').onclick=()=>{save.prefs.sideFs=Math.max(10,(save.prefs.sideFs||12)-1);writeSave();applySideFs();};
$('side-plus').onclick=()=>{save.prefs.sideFs=Math.min(17,(save.prefs.sideFs||12)+1);writeSave();applySideFs();};
$('music').onclick=()=>setMusicEnabled(isSoundMuted()||save.prefs.music===false);
$('install').textContent='离线游玩';$('install').onclick=()=>tell('手机可在浏览器菜单中添加到主屏幕，支持的浏览器会以全屏启动；也可保存这一个 HTML 文件离线双击游玩。');
/* PWA 接线：file:// 下浏览器不允许注册 SW，所以只在 http(s) 环境接；双击打开时完全跳过，不产生控制台报错。 */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
  const manifestLink=document.createElement('link');manifestLink.rel='manifest';manifestLink.href='manifest.webmanifest';document.head.append(manifestLink);
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
function labelControls(root=document) {
  root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]').forEach(el=>{if(!el.hasAttribute('aria-label')){const label=(el.closest('label')&&el.closest('label').textContent)||el.textContent||el.getAttribute('placeholder')||el.id;el.setAttribute('aria-label',label.trim());}});
}
$('settings-open').onclick=()=>{showKeySettings();$('settings-dialog').showModal();};
$('key-mode').onchange=()=>{save.prefs.keyMode=$('key-mode').value;writeSave();applyPreferences();showKeySettings();};document.querySelectorAll('[data-bind]').forEach(input=>input.addEventListener('keydown',captureBinding));$('save-bindings').onclick=commitBindings;
$('high-contrast').onchange=()=>{save.prefs.contrast=$('high-contrast').checked;writeSave();applyPreferences();};$('large-text').onchange=()=>{save.prefs.large=$('large-text').checked;writeSave();applyPreferences();};
labelControls();new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('button,input,select,textarea,a[href],[tabindex]')&&!node.hasAttribute('aria-label'))node.setAttribute('aria-label',(node.textContent||node.id).trim());labelControls(node);}}).observe(document.body,{childList:true,subtree:true});
$('skin').onchange=()=>{save.prefs.skin=$('skin').value;writeSave();applyPreferences();};
$('avatar-skin').onchange=()=>{save.prefs.avatarSkin=$('avatar-skin').value;writeSave();applyPreferences();};
$('mute').onclick=toggleMute;document.addEventListener('click',initAudio,{capture:true});applyPreferences();
loadRequestedLevel();if(!save.tutorialDone)startTutorial();if(storageWarning)tell(storageWarning);setInterval(tick,250);
setInterval(()=>{if(state&&!document.hidden&&!document.querySelector('dialog[open]'))render();},160);
