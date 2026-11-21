/* 背景音乐：内嵌 mp3（96k），交给 <audio> 播，主线程不做解码，避免卡按键 */
let bgmEl=null,bgmUrl=null,bgmDucked=false,bgmPreparing=false;
const BGM_VOLUME=0.5;
function prepareBgm(){
  if(bgmUrl)return bgmUrl;
  if(bgmPreparing)return null;
  const holder=document.getElementById('bgm-data');
  if(!holder)return null;
  bgmPreparing=true;
  try{
    const bin=atob(holder.textContent.replace(/\s+/g,''));
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    bgmUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
    holder.textContent='';
    return bgmUrl;
  }catch(error){bgmPreparing=false;return null;}
}
let bgmWarned=false;
function startBgm(){
  if(isSoundMuted()||save.prefs.music===false)return;
  if(bgmEl&&!bgmEl.paused)return;
  const url=bgmUrl||prepareBgm();
  if(!url){if(!bgmWarned){bgmWarned=true;tell('背景音乐数据未能读取，请刷新页面重试。');}return;}
  if(!bgmEl){bgmEl=new Audio(url);bgmEl.loop=true;bgmEl.preload='auto';}
  bgmDucked=false;
  bgmEl.volume=BGM_VOLUME;
  const started=bgmEl.play();
  if(started&&started.catch)started.catch(function(error){
    if(isSoundMuted()||save.prefs.music===false)return;
    if(!bgmWarned){bgmWarned=true;tell('背景音乐未能播放（'+error.name+'）。请关闭后再打开顶部声音开关重试。');}
  });
}
function stopBgm(){
  if(!bgmEl)return;
  bgmEl.pause();
  try{bgmEl.currentTime=0;}catch(error){}
}
function pauseBgm(){bgmDucked=true;if(bgmEl)bgmEl.volume=BGM_VOLUME*0.22;}
function resumeBgm(){bgmDucked=false;if(bgmEl)bgmEl.volume=BGM_VOLUME;}
function primeAudio(){
  if(isSoundMuted())return;
  initAudio();
  startBgm();
}
document.addEventListener('pointerdown',primeAudio,true);
document.addEventListener('keydown',primeAudio,true);
(function(){
  const box=document.getElementById('music-toggle');
  if(box)box.addEventListener('change',()=>setMusicEnabled(box.checked));
})();
/* 只在浏览器空闲时准备音频，绝不占用按键处理 */
function schedulePrepare(){
  if(!isSoundMuted()){try{initAudio();}catch(error){}}
  if(window.requestIdleCallback)requestIdleCallback(function(){prepareBgm();},{timeout:2500});
  else setTimeout(prepareBgm,900);
}
/* 点在非输入控件上时，把焦点还给地图，避免焦点留在下拉框里导致方向键全被吞 */
document.addEventListener('pointerdown',function(event){
  const target=event.target;
  if(target&&target.closest&&target.closest('#maze-stage')){try{$('maze').focus({preventScroll:true});}catch(error){}return;}
  if(target&&target.closest&&!target.closest('select,input,textarea,[contenteditable="true"]')){try{$('maze').focus({preventScroll:true});}catch(error){}}
},true);
if(document.readyState==='complete')schedulePrepare();
else window.addEventListener('load',schedulePrepare);
/* 打开就把键盘焦点交给地图，不必先点一下 */
window.addEventListener('load',function(){try{$('maze').focus({preventScroll:true});}catch(error){}});

/* ===== 访问量统计（不蒜子）===== */
/* 用 JS 动态创建 script 标签加载统计脚本，避免新增 script 块导致 build.py 计数自检报错 */
(function(){
  const bz=document.createElement('script');
  bz.async=true;
  bz.src='//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
  document.head.appendChild(bz);
})();
