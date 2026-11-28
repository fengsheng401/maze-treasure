/* ============================================================
   遗迹寻钥 · JavaScript 源码

   这个目录下的 5 个文件按加载顺序排列，共享同一个全局作用域。
   index.html 里这些脚本的加载顺序不能调换，否则会报“未定义”。

   文件              行数   负责什么
   01-core.js        65    常量表、全局状态、引导与回放骨架
   02-save.js       252    存档、设置、每日挑战、关卡编辑器
   03-map.js        339    地图生成、点击自动行走、视野光照
   04-render.js     182    单格类型判定、画面绘制
   05-play.js       166    交互流程，以及结尾全部事件绑定

   改代码时用下面的锚点搜索定位：
     [J1] 存档与设置      [J2] 每日挑战      [J3] 关卡编辑器
     [J4] 地图生成        [J5] 点击自动行走  [J6] 视野与光照
     [J7] 单格类型        [J8] 渲染          [J9] 交互流程
   ============================================================ */
/* ===== 01-core.js — 常量、全局状态、引导与回放基础 ===== */

'use strict';
const $ = id => document.getElementById(id);
/* Chrome 86 才有 replaceChildren；旧内核用这个等价函数，保持全浏览器可玩 */
function setChildren(parent,children){while(parent.firstChild)parent.removeChild(parent.firstChild);for(let i=0;i<children.length;i++)parent.appendChild(children[i]);}
const LEVELS = [
  {width:31,height:19,keys:3,name:'沉眠的门厅',intro:'门在你身后合上，锁孔里还留着旧钥匙的温度。',outro:'第一道门开了，后面还有四道。'},
  {width:35,height:23,keys:4,name:'苔痕回廊',intro:'苔藓漫过石阶，有人在这里点过火。',outro:'回廊尽头没有守卫，只有更深的回廊。'},
  {width:41,height:31,keys:5,name:'无光中庭',intro:'抬头看不见穹顶，只有风从深处来。',outro:'中庭空空荡荡，像被人搬走过什么。'},
  {width:51,height:41,keys:6,name:'塌陷的档案馆',intro:'纸页烂成泥，编号还刻在墙上。',outro:'档案缺了最后一页。'},
  {width:61,height:61,keys:7,name:'锁心深井',intro:'最后一道井壁，钥匙就沉在最底下。',outro:'井底没有宝藏，只有一面镜子。'},
  {width:37,height:29,keys:5,name:'镜后的渡口',intro:'镜子没有映出你，它映出一艘等候百年的船。',outro:'你踏上对岸，身后的水面恢复成石墙。'},
  {width:39,height:31,keys:5,name:'灰烬集市',intro:'空摊位上摆着灰，价签写着人们遗忘的名字。',outro:'你带走一把钥匙，也替陌生人记住了名字。'},
  {width:41,height:33,keys:6,name:'钟摆长廊',intro:'钟摆仍在摆动，走廊却已忘了时间。',outro:'最后一声钟响，把你的脚步送向更深处。'},
  {width:43,height:35,keys:6,name:'倒悬花园',intro:'根须垂向穹顶，守卫在没有花的土壤上巡逻。',outro:'一粒种子落进掌心，它还活着。'},
  {width:45,height:37,keys:7,name:'余烬王座',intro:'王座上没有王，只有一盏不肯熄灭的灯。',outro:'你接过那盏灯，第三道城门终于看见了你。'},
  {width:45,height:37,keys:6,name:'星砂阶梯',intro:'阶梯上积满星砂，每粒都记得天空的颜色。',outro:'第一束光越过石阶，照亮你衣上的尘土。'},
  {width:47,height:39,keys:7,name:'回声水库',intro:'水面下有人重复你的脚步，慢了整整一拍。',outro:'回声停下了，这一次你不是独自前行。'},
  {width:49,height:39,keys:7,name:'无名哨所',intro:'墙上的刻痕数到第十四道，刻痕的主人没有回来。',outro:'你刻下第十五道，把钥匙留给将来的人。'},
  {width:51,height:41,keys:8,name:'长夜之眼',intro:'穹顶缓缓睁开，长夜在看它最后一位访客。',outro:'夜色退到门后，黎明只差最后一把钥匙。'},
  {width:53,height:43,keys:8,name:'黎明之门',intro:'门外没有许诺的黄金，只有一阵带着草香的风。',outro:'你推开门。遗迹记住了你的脚步，而你终于看见黎明。'}
];
const CHAPTERS=[{name:'沉眠遗迹',tag:'I · THE RUINS',text:'从门厅到深井，寻找镜中的另一条路。'},{name:'余烬之城',tag:'II · THE EMBERS',text:'越过镜面，在灰烬里接过未熄的灯。'},{name:'长夜尽头',tag:'III · THE DAWN',text:'走过守望与回声，把最后一把钥匙交给黎明。'}];
const DIRS = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const DIFFICULTIES={
  casual:{name:'休闲',radius:18,budget:3.2,trap:1,braid:0.38,traps:0.5,guards:0,keys:-1,spread:0.55},
  standard:{name:'标准',radius:14,budget:2.4,trap:2,braid:0.24,traps:0.8,guards:1,keys:0,spread:0.72},
  hardcore:{name:'硬核',radius:9,budget:1.6,trap:4,braid:0.14,traps:1,guards:1,keys:0,spread:0.95}
};
const ITEM_NAMES={torch:'火把',map:'地图碎片',compass:'罗盘'};
/* 休闲档专用尺寸曲线（仅休闲档生效，标准/硬核仍用 LEVELS 原表）：
   前五关面积增幅放缓到每级约 +25%，砍掉原 L5 的 61×61 峰值；
   钥匙数不变（休闲档本来就在 LEVELS.keys 基础上再减 1）。 */
const CASUAL_SIZES={1:[27,19],2:[33,21],3:[35,25],4:[39,29],5:[43,33]};
const LOCK_SIGNS=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ'];
const DEFAULT_KEYS = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
let state, lastWin = null, lastTick = performance.now();
let replay=null,replayTimer=null,tutorial=null;
function startTutorial() {
  tutorial={returnTo:{level:state.level,map:state.map,mode:state.mode,seed:state.seed},step:0};
  const map={version:1,width:7,height:5,cells:Array(35).fill(1),start:8,keys:[10],exit:12};for(let id=8;id<=12;id++)map.cells[id]=0;
  loadLevel(1,map,'tutorial','tutorial');$('tutorial-panel').hidden=false;advanceTutorial();
}
function advanceTutorial() {
  if(!tutorial||state.mode!=='tutorial')return;
  tutorial.step=state.collected.size?2:state.steps?1:0;
  $('tutorial-text').textContent=['1 / 3：按右方向键或 D，先向右走一步。','2 / 3：再向右走一步，走到数字 1 上拾取钥匙。','3 / 3：右侧的 E 就是出口。集齐钥匙后走进去，或点「开始冒险」结束教程。'][tutorial.step];
  $('tutorial-done').disabled=tutorial.step<2;
}
function finishTutorial() {if(!tutorial)return;const target=tutorial.returnTo;save.tutorialDone=true;writeSave();loadLevel(target.level,target.map,target.mode,target.seed);tell('引导完成。现在开始真正的寻宝之旅！');}
function startReplay(animated=true) {
  if(!lastWin)return;
  $('victory').close();stopReplay(false);
  const all=new Set(lastWin.map.cells.map((_,i)=>i));
  replay={index:0,paused:!animated,view:{map:lastWin.map,pos:lastWin.map.start,collected:new Set(),visited:new Set([lastWin.map.start]),seen:all,visible:all,isReplay:true,difficulty:lastWin.difficulty}};
  $('replay-bar').hidden=false;$('replay-pause').textContent=animated?'暂停':'播放';
  if(!animated){replay.index=lastWin.route.length-1;replay.view.pos=lastWin.map.exit;replay.view.collected=new Set(lastWin.map.keys);replay.view.visited=new Set(lastWin.route.map(step=>step.pos));}
  applyReplayStep(lastWin.route[replay.index]);render();centerPlayer();replayTimer=setInterval(advanceReplay,100);
}
function advanceReplay() {
  if(!replay||replay.paused||document.hidden)return;
  if(replay.index>=lastWin.route.length-1){replay.paused=true;$('replay-pause').textContent='重新播放';return;}
  const step=lastWin.route[++replay.index];applyReplayStep(step);replay.view.visited.add(step.pos);render();centerPlayer();
}
function applyReplayStep(step) {Object.assign(replay.view,{pos:step.pos,facing:step.facing,collected:new Set(step.collected),guards:step.guards||[],takenItems:new Set(step.takenItems),openedChests:new Set(step.openedChests)});}
function pauseReplay() {
  if(!replay)return;
  if(replay.index>=lastWin.route.length-1){startReplay();return;}
  replay.paused=!replay.paused;$('replay-pause').textContent=replay.paused?'继续播放':'暂停';
}
function stopReplay(redraw=true) {clearInterval(replayTimer);replay=null;$('replay-bar').hidden=true;if(redraw&&state){render();centerPlayer();}}
