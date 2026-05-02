(function(){
  if (window.__BC_METEORS_INIT) return;
  window.__BC_METEORS_INIT = true;
  if (window.__BC_METEOR_INTERVAL) { clearInterval(window.__BC_METEOR_INTERVAL); window.__BC_METEOR_INTERVAL = null; }
  if (window.__BC_METEOR_TIMEOUT) { clearTimeout(window.__BC_METEOR_TIMEOUT); window.__BC_METEOR_TIMEOUT = null; }

  function injectStyle(){
    const style = document.createElement('style');
    style.textContent = `
      .bc-meteor-layer{
        position:fixed; inset:0; pointer-events:none; z-index:2147483000;
        overflow:hidden; contain:layout style paint;
      }
      .bc-meteor{
        position:absolute;
        width:220px; height:4px; opacity:0;
        background:linear-gradient(90deg,
          rgba(34,56,92,0) 0%,
          rgba(58,87,132,.18) 24%,
          rgba(96,132,188,.42) 58%,
          rgba(188,214,246,.92) 86%,
          rgba(245,250,255,1) 100%);
        border-radius:999px;
        filter: drop-shadow(0 0 10px rgba(93,144,212,.60)) drop-shadow(0 0 18px rgba(40,79,136,.48));
        transform:translate3d(0,0,0) rotate(var(--ang,0deg));
        animation:bcMeteorOrbit var(--dur,3.8s) linear forwards;
        will-change:transform,opacity;
      }
      .bc-meteor::before{
        content:''; position:absolute; left:0; top:-6px; width:86%; height:calc(100% + 12px);
        background:linear-gradient(90deg,
          rgba(32,52,86,0),
          rgba(56,84,126,.18),
          rgba(84,116,168,.26),
          rgba(255,255,255,0));
        filter:blur(5px); border-radius:999px;
      }
      .bc-meteor::after{
        content:''; position:absolute; right:-4px; top:50%; width:10px; height:10px;
        transform:translateY(-50%); border-radius:50%;
        background:radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(215,230,249,.98) 45%, rgba(103,148,210,.95) 72%, rgba(103,148,210,0) 100%);
        box-shadow:0 0 10px rgba(190,220,255,.75), 0 0 18px rgba(90,145,216,.55);
      }
      @keyframes bcMeteorOrbit{
        0%{ opacity:0; transform:translate3d(0,0,0) rotate(var(--ang,0deg)); }
        10%{ opacity:1; }
        92%{ opacity:1; }
        100%{ opacity:0; transform:translate3d(var(--dx,0), var(--dy,0), 0) rotate(var(--ang,0deg)); }
      }
      @media (max-width: 700px){
        .bc-meteor{ width:170px; height:3px; }
        .bc-meteor::after{ width:8px; height:8px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createLayer(){
    const layer = document.createElement('div');
    layer.className = 'bc-meteor-layer';
    document.body.appendChild(layer);
    return layer;
  }

  function logoRect(){
    const logo = document.querySelector('.brand, .logo-row, .sidebar .brand');
    if (!logo) return {left: 16, top: 16, width: 280, height: 110, right: 296, bottom: 126};
    const r = logo.getBoundingClientRect();
    return {left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom};
  }

  function pathForPhase(phase, vw, vh){
    const lr = logoRect();
    const leftOfLogoX = Math.max(-160, lr.left - 170);
    const rightOfLogoX = Math.min(vw + 160, lr.right + 14);
    const logoMidY = lr.top + lr.height * 0.52;
    const startLowerRightX = Math.max(vw * 0.58, lr.right + 140);
    const startLowerRightY = vh * 0.80;
    const endUpperRightX = vw * 0.86;
    const endUpperRightY = vh * 0.34;

    if (phase % 2 === 0){
      return {
        x: startLowerRightX,
        y: startLowerRightY,
        dx: leftOfLogoX - startLowerRightX,
        dy: logoMidY - startLowerRightY
      };
    }
    return {
      x: rightOfLogoX,
      y: logoMidY + 6,
      dx: endUpperRightX - rightOfLogoX,
      dy: endUpperRightY - (logoMidY + 6)
    };
  }

  function spawnMeteor(layer, phase){
    if (layer.querySelector('.bc-meteor')) return;
    const m = document.createElement('div');
    m.className = 'bc-meteor';
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const path = pathForPhase(phase, vw, vh);
    const ang = Math.atan2(path.dy, path.dx) * 180 / Math.PI;
    m.style.left = path.x + 'px';
    m.style.top = path.y + 'px';
    m.style.setProperty('--dx', path.dx + 'px');
    m.style.setProperty('--dy', path.dy + 'px');
    m.style.setProperty('--ang', ang + 'deg');
    m.style.setProperty('--dur', '3.8s');
    layer.appendChild(m);
    m.addEventListener('animationend', ()=>m.remove(), {once:true});
  }

  function start(){
    injectStyle();
    const layer = createLayer();
    let phase = 0;
    const fire = ()=>{ spawnMeteor(layer, phase++); };
    window.__BC_METEOR_TIMEOUT = setTimeout(fire, 5000);
    window.__BC_METEOR_INTERVAL = setInterval(fire, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
