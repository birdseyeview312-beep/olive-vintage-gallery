(() => {
  const mascot = document.getElementById("oliveMascot");
  const sprite = mascot?.querySelector(".olive-mascot-sprite");
  if (!mascot || !sprite || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const FRAME_COUNT = 14;
  const WALK = [0,1,2,3,4,5];
  const ACTIONS = [
    { name:"is-waving", frames:[6,7,6,7,6], speed:260 },
    { name:"is-bowing", frames:[8,9,9,8], speed:380 },
    { name:"is-hopping", frames:[10,11,10], speed:300, hop:true },
    { name:"is-peeking", frames:[12,12,12], speed:520 },
    { name:"is-inspecting", frames:[13,13,13,13], speed:480 }
  ];
  let visible = false;
  let busy = false;
  let timer = 0;
  let x = Math.max(8, window.innerWidth - mascot.offsetWidth - 20);
  let lastAction = -1;
  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  function setFrame(frame){sprite.style.backgroundPosition = `${(frame / (FRAME_COUNT - 1)) * 100}% 0`}
  function setPosition(nextX,y=0){
    x=nextX;
    mascot.style.setProperty("--mascot-x",`${Math.round(nextX)}px`);
    mascot.style.setProperty("--mascot-y",`${Math.round(y)}px`);
  }
  function clearActionClasses(){mascot.classList.remove("is-walking","is-waving","is-bowing","is-hopping","is-peeking","is-inspecting")}
  async function playFrames(frames,speed,hop){
    for(let i=0;i<frames.length&&visible;i++){
      setFrame(frames[i]);
      if(hop)setPosition(x,i===1?-28:0);
      await wait(speed);
    }
    setPosition(x,0);
  }
  async function walkTo(target){
    if(!visible)return;
    clearActionClasses();
    mascot.classList.add("is-walking");
    const start=x;
    const distance=target-start;
    const direction=Math.sign(distance)||-1;
    mascot.style.setProperty("--mascot-facing",direction<0?"1":"-1");
    const duration=Math.max(3200,Math.min(9000,Math.abs(distance)*13));
    const started=performance.now();
    let previousFrame=-1;
    await new Promise(resolve=>{
      function step(now){
        if(!visible)return resolve();
        const progress=Math.min(1,(now-started)/duration);
        const eased=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
        setPosition(start+distance*eased);
        const frame=WALK[Math.floor((now-started)/115)%WALK.length];
        if(frame!==previousFrame){setFrame(frame);previousFrame=frame}
        if(progress<1)requestAnimationFrame(step);else resolve();
      }
      requestAnimationFrame(step);
    });
    mascot.classList.remove("is-walking");
  }
  async function performAction(){
    let next=Math.floor(Math.random()*ACTIONS.length);
    if(next===lastAction)next=(next+1)%ACTIONS.length;
    lastAction=next;
    const action=ACTIONS[next];
    clearActionClasses();
    mascot.classList.add(action.name);
    await playFrames(action.frames,action.speed,action.hop);
    clearActionClasses();
    setFrame(0);
  }
  async function routine(){
    if(!visible||busy)return;
    busy=true;
    const margin=window.innerWidth<720?8:18;
    const maxX=Math.max(margin,window.innerWidth-mascot.offsetWidth-margin);
    await walkTo(x>window.innerWidth/2?margin:maxX);
    if(visible)await wait(500+Math.random()*900);
    if(visible)await performAction();
    busy=false;
    if(visible)timer=window.setTimeout(routine,2600+Math.random()*4200);
  }
  function updateVisibility(){
    const shouldShow=window.scrollY>Math.min(420,window.innerHeight*.5);
    if(shouldShow===visible)return;
    visible=shouldShow;
    mascot.classList.toggle("is-visible",visible);
    if(visible){
      setPosition(Math.max(8,window.innerWidth-mascot.offsetWidth-20));
      setFrame(0);
      window.clearTimeout(timer);
      timer=window.setTimeout(routine,900);
    }else{
      window.clearTimeout(timer);
      clearActionClasses();
    }
  }
  window.addEventListener("scroll",updateVisibility,{passive:true});
  window.addEventListener("resize",()=>{
    const maxX=Math.max(8,window.innerWidth-mascot.offsetWidth-8);
    setPosition(Math.min(x,maxX));
  },{passive:true});
  updateVisibility();
})();
