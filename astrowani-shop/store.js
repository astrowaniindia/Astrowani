/* ================= ASTROWANI STORE =================
   One script, one shell document, every page rendered from here.

   WHY A ROUTER AND NOT MORE HTML FILES
   The catalogue is live: products come from remedy_items via GET /api/remedies, and an
   admin can add, rename or retire one at any time from the dashboard. A hand-written
   HTML file per product would be stale the moment that happened, and there is no build
   step here to regenerate them. So every product, puja, policy and account page is a
   ROUTE rendered into #view, and the URL is a real path - /gemstones/ruby-manik/ - not a
   modal and not a #hash. That matters for three things the old modal-based store could
   not do: the browser back button, a shareable link, and the Android hardware back button
   inside the app's WebView, which walks WebView history.

   HOW THE PRETTY URLS RESOLVE WITH NO SERVER
   nginx already ends its location / block with `try_files $uri $uri/ /index.html`, so any
   path that is not a real file falls back to this shell and the router takes it from
   there. No nginx change was needed for any of this, which matters because certbot
   rewrote that file in place on the VPS and the deploy workflow deliberately never
   overwrites it (see .github/workflows/deploy-shop.yml).

   MONEY
   Nothing in this file computes a price the customer is asked to pay. Cart totals shown
   while browsing are labelled "subtotal" and are an estimate; the only figure ever shown
   next to a Pay button comes from POST /api/orders/quote, and POST /api/orders/checkout
   re-derives it server-side and ignores anything money-shaped we send. See the MONEY
   RULES header in astrowani-backend/src/orderRoutes.js. */
(function(){
  "use strict";

  /* ==================== MOTION ENGINE ====================
     Marked on <html> first thing: the CSS only hides anything once this class exists, so
     if the script never runs the page still renders fully visible. */
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js-anim');

  var revealObserver = null;
  var revealReady = false;   // flipped by initReveal() once the observer exists
  function showNow(el){ el.classList.add('is-in'); }

  // Called both during first render (before the observer is built) and later for
  // dynamically re-rendered grids. Before the observer exists this deliberately does
  // nothing: initReveal() sweeps every marked element once, so handing them straight to
  // showNow() here would reveal the whole page up front and there'd be no scroll animation.
  function observeNew(nodes){
    if (!revealReady) return;
    Array.prototype.forEach.call(nodes, function(el){
      if (el.classList.contains('is-in')) return;
      if (revealObserver) revealObserver.observe(el);
      else showNow(el);
    });
  }

  /* ---- backstop for the reveal animation ----
     The animation is decorative. Content being visible is not. On an in-app webview these
     elements were reported stranded at opacity 0 even after scrolling to them, with the
     DOM correct and no script error thrown - i.e. the observer simply was not delivering.
     That failure mode is near-impossible to reproduce off-device and catastrophic in use
     (a whole section reads as a blank page), so it is backstopped twice:
       - a throttled scroll/resize pass reveals anything already inside the viewport
       - a final sweep a few seconds after load reveals whatever is still hidden
     Elements are only ever revealed, never re-hidden, so these cannot fight the observer.
     The cost when everything is working is one rAF-throttled getBoundingClientRect pass
     per scroll frame over a shrinking set, and nothing once the set is empty. */
  function sweepVisible(all){
    if (!revealReady) return;
    var pending = document.querySelectorAll('[data-reveal]:not(.is-in)');
    if (!pending.length) return;
    var h = window.innerHeight || document.documentElement.clientHeight;
    Array.prototype.forEach.call(pending, function(el){
      if (all) { showNow(el); return; }
      var r = el.getBoundingClientRect();
      if (r.top < h && r.bottom > 0) showNow(el);
    });
  }
  var sweepQueued = false;
  function queueSweep(){
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(function(){ sweepQueued = false; sweepVisible(false); });
  }

  function initReveal(){
    revealReady = true;
    if (REDUCED || !('IntersectionObserver' in window)) {
      // Motion off, or no observer support: reveal everything and leave it revealed, so
      // content can never end up stranded invisible.
      Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), showNow);
      return;
    }
    revealObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (!e.isIntersecting) return;
        var el = e.target;
        el.style.transitionDelay = (el.getAttribute('data-reveal-delay') || 0) + 'ms';
        showNow(el);
        revealObserver.unobserve(el); // once only; re-animating on scroll-back is nauseating
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    observeNew(document.querySelectorAll('[data-reveal]'));
    window.addEventListener('scroll', queueSweep, {passive:true});
    window.addEventListener('resize', queueSweep);
    queueSweep();
    // Last resort: whatever is still hidden after this is revealed outright. Content
    // the reader has not reached yet loses its entrance, which nobody can perceive;
    // content stranded invisible is a broken page.
    setTimeout(function(){ sweepVisible(true); }, 6000);
  }

  // Marks a freshly-rendered group for reveal, cascading the delay across it. Capped so a
  // 33-card grid doesn't leave the last card waiting two seconds.
  function stagger(nodes, step, cap){
    step = step || 55; cap = cap || 8;
    Array.prototype.forEach.call(nodes, function(el, i){
      el.setAttribute('data-reveal', '');
      el.setAttribute('data-reveal-delay', String(Math.min(i, cap) * step));
    });
    observeNew(nodes);
  }
var BRAND_LOGO = "/assets/83b48ab72f6c.png";

  var CUSTOMER_PHOTOS = {
    c1: "/assets/7f3a28ec41a8.jpg",
    c2: "/assets/d8e0d14e59f9.jpg",
    c3: "/assets/ca1e64b3cc17.jpg"
  };

  var PURPOSE_PHOTOS = {
    wealth: "/assets/029253d4280a.jpg",
    love: "/assets/2023e42ab099.jpg",
    career: "/assets/0c535b4e40fa.jpg",
    health: "/assets/fb8f2cc103ac.jpg",
    protection: "/assets/28e1627add44.jpg",
    marriage: "/assets/f7fc34b9749d.jpg"
  };

  var LIFESTYLE = {
    hero: "/assets/9063ec9a65d8.jpg",
    banner: "/assets/63f7d2c40872.jpg",
    discover: "/assets/7c03d5e6d5aa.jpg",
    boxes: "/assets/6e9de58c21cf.jpg",
    tray: "/assets/c73623861b18.jpg"
  };

  var REAL_PHOTOS = {
    p5: "/assets/e4f6d0e361df.jpg",
    p6: "/assets/bb573aacb2cc.jpg",
    p7: "/assets/d851afd5ba40.jpg",
    p8: "/assets/8a1c5603db23.jpg",
    p9: "/assets/5d9752ee55ab.jpg",
    p10: "/assets/c4c1ab182f52.jpg"
,
    p22: "/assets/7179da6d0128.jpg",
    p23: "/assets/cba05898ad6e.jpg",
    p24: "/assets/e8d3cd8181b5.jpg",
    p25: "/assets/914335d95058.jpg",
    p26: "/assets/fc519aeb45a8.jpg",
    p27: "/assets/73150d29dfe4.jpg",
    p28: "/assets/05139188b54c.jpg",
    p29: "/assets/d185f9ae0470.jpg",
    p30: "/assets/98db2294855a.jpg",
    p31: "/assets/243426f3374a.jpg",
    p32: "/assets/910f2d85d345.jpg",
    p33: "/assets/451881adefae.jpg",
    p34: "/assets/2f23e362e2ae.jpg",
    p35: "/assets/7f9bcb4d6183.jpg",
    p36: "/assets/ff125c847b43.jpg",
    p37: "/assets/cd7645fdc16d.jpg",
    p38: "/assets/d5578efbbc36.jpg",
    p39: "/assets/98f8990b6028.jpg",
    p40: "/assets/dddfa82a1d3f.jpg",
    p41: "/assets/260916115c4f.jpg",
    p42: "/assets/f4c2c3bda81c.jpg",
    p43: "/assets/37b3ccb5b889.jpg",
    p44: "/assets/97168e3822d8.jpg",
    p45: "/assets/3232a89734db.jpg",
    p46: "/assets/efdddc5d25cf.jpg",
    p47: "/assets/d15833465c32.jpg",
    p48: "/assets/d30c14136ed6.jpg"  };

    /* ================= PRODUCT PHOTOGRAPHY (canvas-rendered studio shots) ================= */
  // Real product photos aren't available here, so instead of flat vector icons we render each
  // piece onto a canvas with actual light/shadow — a neutral studio backdrop, a lit sphere/gem
  // shading model, specular highlights, and a soft ground shadow — and cache the result as a
  // PNG, so cards behave exactly like <img>-based product photography everywhere in the store.
  function hexToRgb(hex){
    hex = hex.replace('#','');
    if (hex.length===3) hex = hex.split('').map(function(c){return c+c;}).join('');
    var num = parseInt(hex,16);
    return {r:(num>>16)&255, g:(num>>8)&255, b:num&255};
  }
  function shade(hex, amt){
    var c = hexToRgb(hex);
    function ch(v){ v = amt>=0 ? v+(255-v)*(amt/100) : v+v*(amt/100); return Math.max(0,Math.min(255,Math.round(v))); }
    return 'rgb('+ch(c.r)+','+ch(c.g)+','+ch(c.b)+')';
  }
  function roundRectPath(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function triPath(ctx,x1,y1,x2,y2,x3,y3){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); }

  function drawGem(ctx, tint, unit){
    var s = unit/46;
    ctx.save(); ctx.scale(s,s);
    var pts = [[0,-46],[40,-24],[46,10],[22,46],[-22,46],[-46,10],[-40,-24]];
    var g = ctx.createLinearGradient(-46,-46,46,46);
    g.addColorStop(0, shade(tint,38)); g.addColorStop(0.5, tint); g.addColorStop(1, shade(tint,-28));
    ctx.beginPath(); pts.forEach(function(pt,i){ i===0?ctx.moveTo(pt[0],pt[1]):ctx.lineTo(pt[0],pt[1]); }); ctx.closePath();
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=1.8; ctx.strokeStyle=shade(tint,-45); ctx.stroke();
    triPath(ctx,0,-46,40,-24,14,-8); ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fill();
    triPath(ctx,0,-46,-40,-24,-14,-8); ctx.fillStyle='rgba(255,255,255,.16)'; ctx.fill();
    ctx.filter='blur(4px)';
    ctx.beginPath(); ctx.ellipse(-13,-22,9,4.5,-0.4,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fill();
    ctx.filter='none';
    ctx.restore();
  }

  function drawBead(ctx, tint, r){
    ctx.save();
    var g = ctx.createRadialGradient(-r*0.35,-r*0.42,r*0.06, 0,0,r);
    g.addColorStop(0,'#f4d8bc'); g.addColorStop(0.16, shade(tint,42)); g.addColorStop(0.55, tint); g.addColorStop(1, shade(tint,-48));
    ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=Math.max(0.6,r*0.02); ctx.strokeStyle=shade(tint,-50); ctx.stroke();
    ctx.strokeStyle='rgba(89,42,25,.22)'; ctx.lineWidth=Math.max(0.6,r*0.03);
    for (var i=0;i<9;i++){
      var a=(i/9)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r*0.15, Math.sin(a)*r*0.15);
      ctx.quadraticCurveTo(Math.cos(a+0.35)*r*0.55, Math.sin(a+0.35)*r*0.55, Math.cos(a)*r*0.92, Math.sin(a)*r*0.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBracelet(ctx, tint, R){
    ctx.save();
    var n=16;
    for (var i=0;i<n;i++){
      var a=(i/n)*Math.PI*2 - Math.PI/2;
      var x=Math.cos(a)*R, y=Math.sin(a)*R*0.6;
      ctx.save(); ctx.translate(x,y); drawBead(ctx, tint, R*0.16); ctx.restore();
    }
    ctx.restore();
  }

  function drawMala(ctx, tint, R){
    ctx.save();
    var n=20;
    for (var i=0;i<n;i++){
      var a=(i/n)*Math.PI*2 - Math.PI/2;
      if (Math.abs(a+Math.PI/2) < 0.2) continue;
      var x=Math.cos(a)*R, y=Math.sin(a)*R*0.62;
      ctx.save(); ctx.translate(x,y); drawBead(ctx, tint, R*0.1); ctx.restore();
    }
    ctx.save(); ctx.translate(0, R*0.7); drawBead(ctx, shade(tint,-15), R*0.16); ctx.restore();
    ctx.restore();
  }

  function drawYantraPlate(ctx, tint, s){
    ctx.save();
    var g = ctx.createLinearGradient(-s,-s,s,s);
    g.addColorStop(0, shade(tint,46)); g.addColorStop(0.5, tint); g.addColorStop(1, shade(tint,-38));
    roundRectPath(ctx,-s,-s,s*2,s*2,s*0.1);
    ctx.fillStyle=g; ctx.fill();
    ctx.lineWidth=2.4; ctx.strokeStyle=shade(tint,-48); ctx.stroke();
    ctx.strokeStyle=shade(tint,-58); ctx.lineWidth=Math.max(1,s*0.03);
    triPath(ctx,0,-s*0.7, s*0.62,s*0.58, -s*0.62,s*0.58); ctx.stroke();
    triPath(ctx,0,s*0.7, -s*0.62,-s*0.58, s*0.62,-s*0.58); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,s*0.1,0,Math.PI*2); ctx.fillStyle=shade(tint,-18); ctx.fill();
    ctx.beginPath(); ctx.arc(-s*0.02,-s*0.02,s*0.04,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.75)'; ctx.fill();
    ctx.restore();
  }

  function drawHavan(ctx, tint, u){
    ctx.save();
    var g = ctx.createLinearGradient(0,-u*0.1,0,u*0.7);
    g.addColorStop(0, shade(tint,30)); g.addColorStop(1, shade(tint,-20));
    roundRectPath(ctx,-u*0.75,-u*0.1,u*1.5,u*0.7,u*0.08);
    ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=1.6; ctx.strokeStyle=shade(tint,-40); ctx.stroke();
    ctx.strokeStyle=shade(tint,-30); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(-u*0.75,u*0.22); ctx.lineTo(u*0.75,u*0.22); ctx.stroke();
    [-u*0.32,0,u*0.32].forEach(function(dx,i){
      var g2 = ctx.createRadialGradient(dx-u*0.05,-u*0.4,u*0.02, dx,-u*0.32,u*0.16);
      g2.addColorStop(0, shade(tint,35)); g2.addColorStop(1, shade(tint,i===1?-10:-25));
      ctx.beginPath(); ctx.arc(dx,-u*0.32,u*(i===1?0.16:0.14),0,Math.PI*2); ctx.fillStyle=g2; ctx.fill();
    });
    ctx.restore();
  }

  function drawDhoop(ctx, tint, u){
    ctx.save();
    var g = ctx.createLinearGradient(0,-u*0.2,0,u*0.9);
    g.addColorStop(0, shade(tint,20)); g.addColorStop(1, shade(tint,-25));
    ctx.beginPath(); ctx.moveTo(-u*0.03,-u*0.2); ctx.lineTo(u*0.03,-u*0.2); ctx.lineTo(u*0.03,u*0.9); ctx.lineTo(-u*0.03,u*0.9); ctx.closePath();
    ctx.fillStyle=g; ctx.fill();
    ctx.strokeStyle='rgba(160,160,160,.6)'; ctx.lineWidth=Math.max(1,u*0.02);
    ctx.beginPath(); ctx.moveTo(0,-u*0.2); ctx.quadraticCurveTo(-u*0.22,-u*0.42,0,-u*0.6); ctx.quadraticCurveTo(u*0.22,-u*0.78,0,-u*0.98); ctx.stroke();
    triPath(ctx,-u*0.5,u*0.9, u*0.5,u*0.9, u*0.32,u*1.02);
    ctx.lineTo(-u*0.32,u*1.02); ctx.closePath();
    ctx.fillStyle=shade(tint,-10); ctx.globalAlpha=.5; ctx.fill(); ctx.globalAlpha=1;
    ctx.restore();
  }

  function drawKalash(ctx, tint, u){
    ctx.save();
    var g = ctx.createLinearGradient(-u*0.5,-u*0.1,u*0.5,u*0.7);
    g.addColorStop(0, shade(tint,42)); g.addColorStop(0.5, tint); g.addColorStop(1, shade(tint,-35));
    ctx.beginPath();
    ctx.moveTo(-u*0.32,-u*0.08);
    ctx.quadraticCurveTo(0,-u*0.28,u*0.32,-u*0.08);
    ctx.lineTo(u*0.4,u*0.5);
    ctx.quadraticCurveTo(0,u*0.66,-u*0.4,u*0.5);
    ctx.closePath();
    ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=1.6; ctx.strokeStyle=shade(tint,-45); ctx.stroke();
    roundRectPath(ctx,-u*0.16,-u*0.34,u*0.32,u*0.22,u*0.03); ctx.fillStyle=shade(tint,10); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,-u*0.34,u*0.2,u*0.06,0,0,Math.PI*2); ctx.fillStyle=shade(tint,20); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-u*0.5,u*0.1,0,Math.PI*2); ctx.fillStyle=shade(tint,15); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-u*0.14,u*0.14,u*0.09,u*0.2,0,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fill();
    ctx.restore();
  }

  function drawObjectByType(ctx, p, unit){
    switch(p.icon){
      case 'gem': drawGem(ctx,p.tint,unit); break;
      case 'bead': drawBead(ctx,p.tint,unit*0.78); break;
      case 'bracelet': drawBracelet(ctx,p.tint,unit*0.95); break;
      case 'mala': drawMala(ctx,p.tint,unit*0.98); break;
      case 'yantra': drawYantraPlate(ctx,p.tint,unit*0.82); break;
      case 'havan': drawHavan(ctx,p.tint,unit); break;
      case 'dhoop': drawDhoop(ctx,p.tint,unit); break;
      case 'kalash': drawKalash(ctx,p.tint,unit); break;
      default: drawGem(ctx,p.tint,unit);
    }
  }

  var photoCache = {};
  function buildProductPhoto(p, variant){
    var key = p.id+':'+(variant||'front');
    if (photoCache[key]) return photoCache[key];
    var size = 480;
    var canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d');

    // neutral studio backdrop — same brand cream as the rest of the page, just a touch
    // lighter/darker at the edges so a product still reads as photographed, not flat.
    var bg = ctx.createRadialGradient(size*0.5,size*0.36,size*0.02, size*0.5,size*0.5,size*0.7);
    bg.addColorStop(0,'#faf1e4'); bg.addColorStop(0.6,'#f4d8bc'); bg.addColorStop(1,'#e6c7a4');
    ctx.fillStyle = bg; ctx.fillRect(0,0,size,size);

    // ground shadow, drawn before rotation so it never tilts with the object
    var sg = ctx.createRadialGradient(size*0.5,size*0.82,4, size*0.5,size*0.82,size*0.3);
    sg.addColorStop(0,'rgba(89,42,25,.26)'); sg.addColorStop(1,'rgba(89,42,25,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(size*0.5,size*0.82,size*0.28,size*0.05,0,0,Math.PI*2); ctx.fill();

    ctx.save();
    var angle = variant==='angle' ? -0.22 : 0;
    var zoom = variant==='zoom' ? 1.6 : 1;
    ctx.translate(size*0.5, size*0.46);
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);
    drawObjectByType(ctx, p, size*0.3);
    ctx.restore();

    var url = canvas.toDataURL('image/png');
    photoCache[key] = url;
    return url;
  }

  function productPhotoImg(p, variant, cls){
    var src = p.photo || REAL_PHOTOS[p.id] || buildProductPhoto(p, variant);
    return '<img class="'+(cls||'')+'" src="'+src+'" alt="'+p.name+'" loading="lazy">';
  }

  function renderIcon(p){ return productPhotoImg(p, 'front'); }

  /* ================= PRODUCT META (rating, reviews, stock — deterministic per id) ================= */
  function hashStr(s){ var h=0; for (var i=0;i<s.length;i++){ h = ((h<<5)-h + s.charCodeAt(i))|0; } return Math.abs(h); }
  function productMeta(p){
    var h = hashStr(p.id);
    var rating = (42 + (h%8)) / 10; // 4.2–4.9
    var reviews = 38 + (h*7 % 260);
    var lowStock = (h % 5 === 0);
    var stockLeft = 2 + (h % 6);
    return {rating:rating, reviews:reviews, lowStock:lowStock, stockLeft:stockLeft, score: rating * Math.log(reviews+1)};
  }
  function starString(rating){
    var full = Math.round(rating);
    var s = '';
    for (var i=0;i<5;i++) s += (i<full ? '★' : '☆');
    return s;
  }
  /* ================= DATA ================= */
  /* The first five are the offline catalogue's own groupings. The last three are the
     `type` values remedy_items actually uses, and they are what a LIVE product's cat will
     be - so they must be here or catLabel() would render a raw enum on a product page and
     the per-category ordering gate would have nothing to name. */
  var CATS = [
    {id:'rudraksha', label:'Rudraksha'},
    {id:'gemstone', label:'Gemstones'},
    {id:'bracelet-mala', label:'Bracelets & Malas'},
    {id:'yantra', label:'Yantras'},
    {id:'pooja', label:'Pooja & Incense'},
    {id:'puja', label:'Pujas'},
    {id:'specific_puja', label:'Specific Pujas'},
    {id:'life_report', label:'Life Reports'}
  ];

  var PURPOSES = [
    {id:'wealth', label:'Wealth & Money', icon:'💰', tint:'#c8973c'},
    {id:'love', label:'Love & Relationship', icon:'💗', tint:'#9c3a34'},
    {id:'career', label:'Career & Business', icon:'📈', tint:'#2c6b4e'},
    {id:'health', label:'Health & Healing', icon:'🌿', tint:'#2c6b4e'},
    {id:'protection', label:'Protection', icon:'🛡', tint:'#6b5f4b'},
    {id:'marriage', label:'Marriage & Family', icon:'💍', tint:'#9c3a34'}
  ];

  var PRODUCTS = [
    {id:'p1', name:'Original Nepali Rudraksha, 1 Mukhi', cat:'rudraksha', tags:['protection','career'], price:5999, mrp:6999, icon:'bead', tint:'#8a6a3f', desc:'A rare single-faced bead sourced from the Nepal hills, associated with clarity of purpose and single-minded focus.', benefits:['Lab-verified X-ray for natural clefts','Strung on red thread, ready to wear','Comes with an authenticity card']},
    {id:'p2', name:'5 Mukhi Rudraksha Mala, 108 Beads', cat:'rudraksha', tags:['health','protection'], price:1499, mrp:1899, icon:'bead', tint:'#7a5230', desc:'The most commonly prescribed rudraksha, worn as a full 108-bead mala for daily japa and general wellbeing.', benefits:['108 beads + guru bead, hand-knotted','Sourced from Nepal, ritually purified','Suitable for daily wear or meditation']},
    {id:'p3', name:'7 Mukhi Rudraksha, Wealth Bead', cat:'rudraksha', tags:['wealth'], price:2199, icon:'bead', tint:'#96703e', desc:'Linked to Goddess Lakshmi in Vedic tradition, worn by those seeking steadier income and financial discipline.', benefits:['Single bead on adjustable thread','X-ray certified natural bead','Energised on a Friday before dispatch']},
    {id:'p4', name:'Panchmukhi Rudraksha Bracelet', cat:'rudraksha', tags:['health','protection'], price:999, icon:'bracelet', tint:'#7a5230', desc:'A everyday bracelet strung from five-faced beads, a gentler daily alternative to a full mala.', benefits:['Elastic fit, one size fits most','Five-faced beads, most easily available','Comes in a printed gift pouch']},
    {id:'p5', name:'Ceylon Blue Sapphire (Neelam)', cat:'gemstone', tags:['career','wealth'], price:8500, mrp:11000, icon:'gem', tint:'#3a5fae', desc:'A fast-acting Saturn stone from Sri Lanka, prescribed for sudden shifts in career and authority.', benefits:['Independent gem lab certificate included','Set in silver, ready to wear','7-day trial period before you commit']},
    {id:'p6', name:'Ruby (Manik)', cat:'gemstone', tags:['career','marriage'], price:6200, icon:'gem', tint:'#a23b3b', desc:'The Sun\'s stone, worn for confidence, leadership, and standing in front of a room.', benefits:['Certified natural, untreated stone','Available in gold or panchdhatu setting','Free re-sizing within 30 days']},
    {id:'p7', name:'Colombian Emerald (Panna)', cat:'gemstone', tags:['career','health'], price:7800, icon:'gem', tint:'#2c6b4e', desc:'Mercury\'s stone, associated with sharper communication and steadier decision-making.', benefits:['Colombian origin, lab certified','Panchdhatu ring or pendant, your choice','Includes a wearing-day recommendation']},
    {id:'p8', name:'Basra Pearl (Moti)', cat:'gemstone', tags:['love','marriage'], price:3200, icon:'gem', tint:'#e8e1cf', desc:'A calming Moon stone, traditionally recommended for emotional steadiness and harmony at home.', benefits:['Natural, unbleached pearl','Silver setting included','Best worn on a Monday, per tradition']},
    {id:'p9', name:'Ceylon Yellow Sapphire (Pukhraj)', cat:'gemstone', tags:['wealth','marriage'], price:9400, mrp:12000, icon:'gem', tint:'#d8ac4d', desc:'Jupiter\'s stone, sought after for prosperity, wisdom, and timing around marriage.', benefits:['Certified Ceylon-origin stone','Gold setting, ring or pendant','Guidance sheet on wearing rituals included']},
    {id:'p10', name:'Italian Red Coral (Moonga)', cat:'gemstone', tags:['career','protection'], price:2600, icon:'gem', tint:'#b8503c', desc:'Mars\' stone, worn for courage, drive, and pushing through stalled decisions.', benefits:['Natural coral, untreated','Copper or silver setting','Comes with a wearing-muhurat guide']},
    {id:'p11', name:'Navratna Bracelet, Nine Gem', cat:'bracelet-mala', tags:['wealth','protection'], price:1899, icon:'bracelet', tint:'#c8973c', desc:'All nine planetary gems in one bracelet, worn for balance rather than a single planetary push.', benefits:['Nine genuine stones, one per bead','Adjustable silver-tone chain','A gentle, general-purpose remedy']},
    {id:'p12', name:'Rose Quartz Bracelet for Love', cat:'bracelet-mala', tags:['love'], price:699, icon:'bracelet', tint:'#e0a3a3', desc:'Worn for warmth in relationships and self-compassion, a soft daily companion, not a planetary remedy.', benefits:['Genuine rose quartz beads','Elastic fit, adjustable','Comes gift-boxed']},
    {id:'p13', name:'Citrine Bracelet for Abundance', cat:'bracelet-mala', tags:['wealth'], price:749, icon:'bracelet', tint:'#e0b23c', desc:'A bright, affordable everyday piece associated with confidence around money.', benefits:['Natural citrine chips','Suits both wrists','One-size elastic band']},
    {id:'p14', name:'Sandalwood Japa Mala, 108 Beads', cat:'bracelet-mala', tags:['health'], price:899, icon:'mala', tint:'#a97a4a', desc:'Fragrant sandalwood beads for daily mantra practice, cooling and calming to hold.', benefits:['Genuine sandalwood, naturally fragrant','108 beads plus guru bead','Comes in a cotton pouch']},
    {id:'p15', name:'Tulsi Kanthi Mala', cat:'bracelet-mala', tags:['health','protection'], price:499, icon:'mala', tint:'#5c8a4e', desc:'A traditional holy-basil mala worn close to the throat, associated with protection and devotion.', benefits:['Hand-strung tulsi wood beads','Lightweight, comfortable for daily wear','Sourced from Vrindavan']},
    {id:'p16', name:'Sri Yantra in Energised Copper', cat:'yantra', tags:['wealth','career'], price:1299, icon:'yantra', tint:'#c8973c', desc:'The primary yantra of abundance, hand-etched in copper and energised before dispatch.', benefits:['Solid copper, hand-etched','Energised on Poornima before shipping','Placement guide included']},
    {id:'p17', name:'Kuber Yantra for Wealth', cat:'yantra', tags:['wealth'], price:950, icon:'yantra', tint:'#a1731d', desc:'Dedicated to Kuber, the treasurer of the gods, placed near cash boxes or lockers.', benefits:['Copper plate, compact size','Comes with a small stand','Simple daily invocation sheet included']},
    {id:'p18', name:'Vyapar Vriddhi Yantra for Business Growth', cat:'yantra', tags:['career','wealth'], price:1100, icon:'yantra', tint:'#8a6a3f', desc:'Placed at shop entrances and office desks to support steady business growth.', benefits:['Copper-etched plate','Suited for shop or office placement','Comes with care instructions']},
    {id:'p19', name:'Havan Samagri Kit', cat:'pooja', tags:['health','protection'], price:399, icon:'havan', tint:'#a97a1f', desc:'A complete pre-measured kit for a home havan, everything but the fire.', benefits:['Pre-measured herbs and samidha','Enough for one full havan','Instruction card included']},
    {id:'p20', name:'Camphor & Dhoop Combo', cat:'pooja', tags:['protection','health'], price:299, icon:'dhoop', tint:'#8a7d68', desc:'Daily-use camphor tablets and hand-rolled dhoop sticks for the home altar.', benefits:['Natural camphor, no synthetic additives','30 hand-rolled dhoop sticks','Compact box, easy to store']},
    {id:'p21', name:'Copper Kalash Ritual Vessel', cat:'pooja', tags:['marriage','protection'], price:1100, icon:'kalash', tint:'#b8794a', desc:'A hand-beaten copper kalash for griha pravesh, weddings, and daily puja.', benefits:['Solid hand-beaten copper','Holds approx. 1.5 litres','Comes with a coconut-rest lid']},
    {"id":"p22","name":"Hessonite (Gomed)","cat":"gemstone","tags":["protection","career"],"price":2400,"icon":"gem","tint":"#8a4a1c","desc":"Rahu's stone, worn for sudden reversals in fortune and protection against unseen setbacks.","benefits":["Certified natural hessonite","Silver or panchdhatu setting","Best worn on a Saturday, per tradition"]},
    {"id":"p23","name":"Cat's Eye (Lehsunia)","cat":"gemstone","tags":["protection","health"],"price":5200,"icon":"gem","tint":"#7a7a4a","desc":"Ketu's stone, prescribed for sharpened intuition and protection from hidden risks.","benefits":["Certified chatoyant cat's eye","Silver setting, ring or pendant","Comes with a wearing-muhurat guide"]},
    {"id":"p24","name":"Opal","cat":"gemstone","tags":["love"],"price":3100,"icon":"gem","tint":"#d8c9e0","desc":"A Venus-associated stone worn for warmth in relationships and creative confidence.","benefits":["Natural play-of-colour opal","Silver setting included","Handle with care, a softer stone"]},
    {"id":"p25","name":"Amethyst (Jamunia)","cat":"gemstone","tags":["health","protection"],"price":1200,"icon":"gem","tint":"#7a5ea8","desc":"A calming Saturn-adjacent stone, worn for steadier nerves and protection during meditation.","benefits":["Natural untreated amethyst","Silver setting, ring or pendant","Suits daily wear"]},
    {"id":"p26","name":"Turquoise (Feroza)","cat":"gemstone","tags":["protection","wealth"],"price":1800,"icon":"gem","tint":"#3fa8a0","desc":"A protective Jupiter-linked stone, traditionally worn for safe travel and steady prosperity.","benefits":["Natural turquoise, untreated","Silver setting included","Popular for travel protection"]},
    {"id":"p27","name":"Iolite (Neeli)","cat":"gemstone","tags":["career","protection"],"price":1500,"icon":"gem","tint":"#4a5aa0","desc":"A Saturn-adjacent stone associated with discipline and staying the course under pressure.","benefits":["Certified natural iolite","Silver setting, ring or pendant","7-day trial period before you commit"]},
    {"id":"p28","name":"Pitambari Yellow Sapphire","cat":"gemstone","tags":["wealth","marriage"],"price":3400,"icon":"gem","tint":"#e0b23c","desc":"A lighter-toned Jupiter stone, a gentler-priced alternative to Ceylon Pukhraj for the same purpose.","benefits":["Certified natural stone","Gold or panchdhatu setting","Guidance sheet on wearing rituals included"]},
    {"id":"p29","name":"Peridot Stone","cat":"gemstone","tags":["career"],"price":2200,"icon":"gem","tint":"#8fae3c","desc":"A Mercury-adjacent stone, worn for sharper communication and confidence in negotiation.","benefits":["Natural peridot, untreated","Silver setting included","Suits daily wear"]},
    {"id":"p30","name":"Citrine (Sunela) Loose Gemstone","cat":"gemstone","tags":["wealth"],"price":1400,"icon":"gem","tint":"#e0b23c","desc":"A bright, affordable Jupiter-adjacent stone worn for steady financial confidence.","benefits":["Natural citrine, untreated","Silver setting, ring or pendant","A gentle everyday remedy"]},
    {"id":"p31","name":"Zircon (Jarkan)","cat":"gemstone","tags":["love","marriage"],"price":2600,"icon":"gem","tint":"#dfe8ec","desc":"A brilliant Venus-adjacent stone, worn as a diamond alternative for love and harmony.","benefits":["Certified natural zircon","Silver or gold setting","Free re-sizing within 30 days"]},
    {"id":"p32","name":"Moonstone","cat":"gemstone","tags":["love","health"],"price":1500,"icon":"gem","tint":"#dfe3ec","desc":"The Moon's stone, worn for emotional steadiness and calmer, more restful sleep.","benefits":["Natural blue-sheen moonstone","Silver setting included","Best worn on a Monday, per tradition"]},
    {"id":"p33","name":"Purple Sapphire","cat":"gemstone","tags":["career","protection"],"price":4200,"icon":"gem","tint":"#7a4a9c","desc":"A Saturn-family stone worn for mental clarity and steadier long-term decision-making.","benefits":["Independent gem lab certificate included","Silver setting, ready to wear","7-day trial period before you commit"]},
    {"id":"p34","name":"White Sapphire (Safed Pukhraj)","cat":"gemstone","tags":["love","marriage"],"price":3800,"icon":"gem","tint":"#eef1f5","desc":"A Venus stone, worn as a diamond alternative for romance, marriage timing and refinement.","benefits":["Certified natural white sapphire","Gold or silver setting, your choice","Guidance sheet on wearing rituals included"]},
    {"id":"p35","name":"Brown Sapphire","cat":"gemstone","tags":["career"],"price":2900,"icon":"gem","tint":"#8a6a4a","desc":"A grounded Saturn-family stone worn for patience and steady, unglamorous progress.","benefits":["Certified natural stone","Silver setting included","7-day trial period before you commit"]},
    {"id":"p36","name":"Blue Corundum","cat":"gemstone","tags":["career","protection"],"price":2100,"icon":"gem","tint":"#4a6aa8","desc":"A member of the sapphire family, worn for authority and protection in high-pressure roles.","benefits":["Natural corundum, untreated","Silver setting included","Suits daily wear"]},
    {"id":"p37","name":"Blue Topaz","cat":"gemstone","tags":["wealth","career"],"price":1900,"icon":"gem","tint":"#4ab0d8","desc":"A Jupiter-adjacent stone associated with clear thinking and steadier financial decisions.","benefits":["Natural blue topaz, untreated","Silver setting included","A gentle everyday remedy"]},
    {"id":"p38","name":"Sulemani Black Hakik","cat":"gemstone","tags":["protection"],"price":899,"icon":"gem","tint":"#2a2a2a","desc":"A traditional protection stone, worn or kept at home against evil eye and negative energy.","benefits":["Natural banded agate","Available as bracelet or loose stone","A widely-used everyday protection stone"]},
    {"id":"p39","name":"Sulemani Red Hakik","cat":"gemstone","tags":["protection","career"],"price":999,"icon":"gem","tint":"#8a3a2a","desc":"A courage-linked variant of Sulemani hakik, worn for confidence in confrontation and pushback.","benefits":["Natural banded agate","Available as bracelet or loose stone","A widely-used everyday protection stone"]},
    {"id":"p40","name":"Spinel Stone","cat":"gemstone","tags":["career","marriage"],"price":5600,"icon":"gem","tint":"#a83a4a","desc":"A vivid Sun-and-Mars-adjacent stone, worn as a ruby alternative for confidence and standing.","benefits":["Natural spinel, untreated","Gold or panchdhatu setting","Free re-sizing within 30 days"]},
    {"id":"p41","name":"White Topaz","cat":"gemstone","tags":["love"],"price":1400,"icon":"gem","tint":"#f0eee6","desc":"A clear Venus-adjacent stone worn for clarity in relationships and everyday elegance.","benefits":["Natural white topaz, untreated","Silver setting included","Suits daily wear"]},
    {"id":"p42","name":"Yellow Topaz","cat":"gemstone","tags":["wealth"],"price":3200,"icon":"gem","tint":"#e0c23c","desc":"A Jupiter-adjacent stone worn for wisdom, prosperity and steadier long-term planning.","benefits":["Natural yellow topaz, untreated","Gold setting, ring or pendant","A gentle everyday remedy"]},
    {"id":"p43","name":"Pink Sapphire","cat":"gemstone","tags":["love","marriage"],"price":4800,"icon":"gem","tint":"#d87aa0","desc":"A Venus-family stone worn for warmth, romance and renewed connection in relationships.","benefits":["Independent gem lab certificate included","Gold or silver setting","7-day trial period before you commit"]},
    {"id":"p44","name":"Padparadscha Stone","cat":"gemstone","tags":["love","career"],"price":12500,"mrp":15500,"icon":"gem","tint":"#e08a5a","desc":"A rare Sun-and-Venus blend, prized for both creative confidence and warmth in relationships.","benefits":["Rare natural padparadscha, lab certified","Gold setting, ring or pendant","Includes a wearing-day recommendation"]},
    {"id":"p45","name":"Green Tourmaline","cat":"gemstone","tags":["health"],"price":2700,"icon":"gem","tint":"#3c9c6a","desc":"A heart-centred stone worn for emotional healing and steadier day-to-day energy.","benefits":["Natural green tourmaline, untreated","Silver setting included","Suits daily wear"]},
    {"id":"p46","name":"Alexandrite","cat":"gemstone","tags":["wealth","protection"],"price":18500,"icon":"gem","tint":"#5a8a6a","desc":"An exceptionally rare colour-change stone, associated with sudden turns of luck and transformation.","benefits":["Rare natural alexandrite, lab certified","Gold setting, ring or pendant","7-day trial period before you commit"]},
    {"id":"p47","name":"Diamond","cat":"gemstone","tags":["love","wealth"],"price":22000,"icon":"gem","tint":"#eef3f6","desc":"Venus's stone in Vedic tradition, worn for love, luxury, and long-term prosperity.","benefits":["Certified natural diamond","Gold or platinum setting","Independent gem lab certificate included"]},
    {"id":"p48","name":"Green Onyx","cat":"gemstone","tags":["protection","health"],"price":799,"icon":"gem","tint":"#3c6a4a","desc":"A grounding, affordable stone worn for steadiness and protection through daily stresses.","benefits":["Natural green onyx","Available as bracelet or loose stone","A gentle everyday remedy"]}
  ];
  /* ================= IN-APP AUTH =================
     The app hands us a customer JWT via injectedJavaScriptBeforeContentLoaded, so this is
     already set before any of this script runs. On the open web it is simply absent, and
     the store falls back to the enquiry flow — one page, two honest behaviours, rather
     than a checkout that only half works outside the app. */
  var APP = (typeof window !== 'undefined' && window.__ASTROWANI__) || null;
  var AUTH_TOKEN = APP && APP.token ? APP.token : null;
  // Declared here, not in the LIVE CATALOG block below: `var` hoists but the assignment
  // does not, so a second `var API_BASE = ...` further down would silently overwrite an
  // apiBase supplied by the app.
  // Empty string = same origin, which nginx proxies to the backend (see the /api/ block
  // in vps-deployment/nginx/astrowani-shop.conf). Calling backend.astrowani.com directly
  // was refused by CORS: shop.astrowani.com is not on that host's allowlist. Same-origin
  // sidesteps CORS entirely rather than adding a second source of the header.
  // The app can still override it, which is what lets a dev build point elsewhere.
  var API_BASE = (APP && APP.apiBase) || '';

  /* Every error message this produces is shown to a shopper, so none of them may be a
     status code. The backend writes real sentences for the cases it knows about (an OTP
     throttle, a blocked category, a short balance) and those are passed through verbatim;
     anything else - a proxy hiccup, an HTML error page, a dropped connection - is turned
     into a sentence here. `status` and `body` are still attached, so a caller that wants
     to branch on 401 or read a `shortfall` can.

     This is the same lesson as astroApi.js in the customer app: "Request failed with
     status code 502" is a developer's message being read out loud to a customer. */
  var HTTP_SENTENCE = {
    400: 'Something in that request was not right. Please check and try again.',
    401: 'Please sign in again to continue.',
    403: 'That is not available right now.',
    404: 'We could not reach the store service. Please try again in a moment.',
    409: 'Something changed while you were on this page. Please try again.',
    429: 'Too many attempts just now. Please wait a minute and try again.',
    503: 'The store service is briefly unavailable. Please try again in a moment.'
  };

  function apiFetch(path, opts){
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (AUTH_TOKEN) headers.Authorization = 'Bearer ' + AUTH_TOKEN;
    return fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }))
      .catch(function(){
        // fetch only rejects on a network-level failure, never on a 4xx/5xx.
        var err = new Error('You appear to be offline. Check your connection and try again.');
        err.status = 0;
        err.body = {};
        throw err;
      })
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(body){
          if (!r.ok) {
            var msg = body && body.message
              ? body.message
              : (HTTP_SENTENCE[r.status] || (r.status >= 500
                  ? 'Something went wrong at our end. Please try again.'
                  : 'That did not work. Please try again.'));
            var err = new Error(msg);
            err.status = r.status; err.body = body || {};
            throw err;
          }
          return body;
        });
      });
  }

  // Razorpay's script is only needed when a real payment is about to happen, so it is
  // loaded on demand rather than on every page view.
  var rzpLoading = null;
  function loadRazorpay(){
    if (window.Razorpay) return Promise.resolve(true);
    if (rzpLoading) return rzpLoading;
    rzpLoading = new Promise(function(resolve, reject){
      var el = document.createElement('script');
      el.src = 'https://checkout.razorpay.com/v1/checkout.js';
      el.onload = function(){ resolve(true); };
      el.onerror = function(){ reject(new Error('Could not load the payment window')); };
      document.head.appendChild(el);
    });
    return rzpLoading;
  }
  /* ================= LIVE CATALOG =================
     The hardcoded PRODUCTS array below is a fallback, not the shop. Real checkout can only
     sell rows that exist in remedy_items (POST /api/orders/quote looks each itemId up
     there by uuid), so the catalogue is fetched from the backend and the local array is
     used only when that fetch fails — a shopper on a flaky connection still sees a shop
     rather than an empty page, they just can't buy until it loads.
     API_BASE is declared above, alongside the auth block. */

  // remedy_items has no tags column, so the "Shop by Purpose" tiles infer a purpose from
  // the stone. Keyed on the planet each stone answers to, which is what the purpose tiles
  // actually mean. Anything unrecognised gets no tag and simply doesn't appear under a
  // purpose filter, rather than being mis-filed under a wrong one.
  var PURPOSE_BY_STONE = [
    [/ruby|manik/i,                        ['career','marriage']],
    [/pearl|moti|moonstone/i,              ['love','health']],
    [/yellow sapphire|pukhraj|pitambari/i, ['wealth','marriage']],
    [/hessonite|gomed/i,                   ['protection','career']],
    [/emerald|panna|peridot/i,             ['career','health']],
    [/diamond|heera|zircon|white sapphire|white topaz/i, ['love','wealth']],
    [/cat.?s eye|lehsunia/i,               ['protection','health']],
    [/blue sapphire|neelam|corundum|iolite|neeli/i, ['career','protection']],
    [/coral|moonga|spinel/i,               ['career','protection']],
    [/amethyst|jamunia|turquoise|feroza/i, ['health','protection']],
    [/citrine|sunela|topaz/i,              ['wealth']],
    [/hakik|onyx|tourmaline/i,             ['protection','health']],
    [/opal|pink sapphire|rose quartz/i,    ['love']],
    [/alexandrite|padparadscha/i,          ['wealth','protection']]
  ];
  function purposesFor(title){
    for (var i=0;i<PURPOSE_BY_STONE.length;i++){
      if (PURPOSE_BY_STONE[i][0].test(title)) return PURPOSE_BY_STONE[i][1];
    }
    return [];
  }

  // The public endpoint returns `_id` (the uuid). That is the ONLY id checkout accepts, so
  // it becomes the product's id here — the cart, the quote and the order all key off it.
  function fromApi(row){
    return {
      id: row._id,
      name: row.title,
      cat: row.type,
      tags: purposesFor(row.title || ''),
      price: Number(row.price) || 0,
      mrp: row.mrp ? Number(row.mrp) : null,
      unitLabel: row.unitLabel || null,
      inStock: row.inStock !== false,
      desc: row.description || '',
      benefits: [],
      photo: row.image || null,
      icon: 'gem',
      tint: '#c8973c',
      live: true            // came from the server, therefore genuinely orderable
    };
  }


  /* ================= CATALOGUE =================
     Two sources, and which one is in play changes what the shopper is allowed to do.

       LIVE   - rows from GET /api/remedies. Their id is the remedy_items uuid, which is
                the ONLY id POST /api/orders/quote will price. These are orderable.
       OFFLINE- the PRODUCTS array above. Shown only when the live fetch has not landed
                (or failed), so a shopper on a slow connection sees a shop rather than a
                spinner. Marked live:false, and every buy control is disabled for them,
                because an "Add" that the server would reject with UNKNOWN_ITEM is worse
                than a greyed-out one.

     The two are never mixed. Mixing them would put an unbuyable card next to a buyable
     one with nothing on screen to tell them apart. */

  var LIVE_PRODUCTS = null;   // null = not loaded yet, [] = loaded and genuinely empty
  var catalogState = 'loading';   // 'loading' | 'live' | 'offline'

  var byId = {};
  var BY_SLUG = {};
  var ALL_PRODUCTS = [];

  // Latin, Devanagari and digits survive; everything else collapses to a single dash.
  // Devanagari is kept because several pujas have no English name worth slugging, and a
  // percent-encoded Hindi slug still round-trips through the router correctly.
  function slugify(s){
    return String(s || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9ऀ-ॿ]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'item';
  }

  function recomputeCatalog(){
    var base;
    if (LIVE_PRODUCTS && LIVE_PRODUCTS.length) { base = LIVE_PRODUCTS; catalogState = 'live'; }
    else if (LIVE_PRODUCTS) { base = []; catalogState = 'live'; }   // loaded, genuinely empty
    else { base = PRODUCTS.map(function(p){ return Object.assign({}, p, {live:false}); }); catalogState = 'offline'; }

    ALL_PRODUCTS = base;
    byId = {};
    BY_SLUG = {};
    ALL_PRODUCTS.forEach(function(p){
      byId[p.id] = p;
      // First writer wins on a collision, and the loser keeps a suffixed slug of its own,
      // so two products called the same thing still each have a reachable URL.
      var s = slugify(p.name);
      if (BY_SLUG[s] && BY_SLUG[s].id !== p.id) s = s + '-' + String(p.id).replace(/-/g, '').slice(0, 6);
      p.slug = s;
      BY_SLUG[s] = p;
    });
    reconcileCart();
    // Kept inside recomputeCatalog so the puja list can never be one catalogue behind the
    // product list - both are rebuilt by the same call, whichever triggered it.
    buildPujaList();
  }

  function productBySlug(slug){
    if (!slug) return null;
    return BY_SLUG[slug] || byId[slug] || null;   // a raw id in the URL still resolves
  }

  function productsOfType(type){
    return ALL_PRODUCTS.filter(function(p){ return p.cat === type; });
  }

  /* A cart saved against the offline catalogue holds ids (p1..p48) that do not exist once
     the live uuids arrive. Those keys must be DROPPED, not merely skipped at render time:
     cartSubtotal() reads byId[id].price directly and threw on the first stale entry, which
     is how one leftover cart line once blanked every section of the storefront.
     Deliberately does nothing while the catalogue is still the offline fallback - the live
     ids simply are not known yet, and emptying a real cart because a fetch is in flight
     would be the worse bug. */
  function reconcileCart(){
    if (catalogState !== 'live') return;
    if (typeof cart !== 'object' || !cart) return;
    var dropped = 0;
    Object.keys(cart).forEach(function(id){ if (!byId[id]) { delete cart[id]; dropped++; } });
    if (dropped) saveCart();
  }

  /* Resolves once the live fetch has SETTLED - succeeded or failed, either way the
     catalogue is as good as it is going to get.

     This exists because the cart holds remedy_items uuids, and until those uuids are
     known, byId contains only the offline p1..p48 rows and cartIds() answers "empty" for
     a cart that is not. Anything that makes a decision from the cart - the checkout guard
     most of all - has to wait for this, or a shopper who refreshes on /checkout/ is
     bounced to an apparently-empty cart holding two stones. */
  var catalogReady = null;
  function whenCatalogReady(){ return catalogReady || Promise.resolve(); }

  function loadLiveCatalog(){
    return fetch(API_BASE + '/api/remedies')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        var rows = Array.isArray(d) ? d : (d.data || d.items || []);
        LIVE_PRODUCTS = rows.filter(function(r){ return r && r._id; }).map(fromApi);
        recomputeCatalog();
        rerender();
      })
      .catch(function(e){
        // Deliberately silent for the shopper: the offline catalogue is already on screen
        // and every buy control on it is already disabled, which is the honest state.
        console.warn('live catalogue unavailable, showing offline catalogue:', e.message);
      });
  }

  /* ================= STORE CONFIG =================
     GET /api/store/config is public and unauthenticated: which categories are accepting
     orders, and the delivery/handling fees. Both are admin-controlled in app_settings.

     Read for two reasons. It lets a category that is not yet delivering say so on the
     card instead of failing at checkout, and it lets the cart show a delivery line that
     matches what the server will actually charge. Neither is trusted - the server
     re-derives every figure in /quote and 403s a blocked category in /checkout - this
     only stops the shopper being surprised at the last step.
     FAILS CLOSED on ordering: an unreadable config means "not accepting orders", because
     letting someone through to a checkout that will refuse them is the worse outcome. */
  var storeConfig = {
    loaded: false,
    ordering: {},                 // {gemstone:true, puja:false, ...}
    deliveryFee: 0,
    freeDeliveryAbove: null,
    handlingFee: 0
  };

  function loadStoreConfig(){
    return fetch(API_BASE + '/api/store/config')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        storeConfig.ordering = d.ordering || {};
        storeConfig.deliveryFee = Number(d.deliveryFee) || 0;
        storeConfig.freeDeliveryAbove = d.freeDeliveryAbove == null ? null : Number(d.freeDeliveryAbove);
        storeConfig.handlingFee = Number(d.handlingFee) || 0;
        storeConfig.loaded = true;
        rerender();
      })
      .catch(function(e){ console.warn('store config unavailable:', e.message); });
  }

  // A product is buyable when it came from the server AND its category is accepting
  // orders AND it is in stock. All three, every time - this is the single predicate every
  // Add button, product page and cart line asks.
  function canOrder(p){
    if (!p || !p.live) return false;
    if (p.inStock === false) return false;
    return storeConfig.ordering[p.cat] === true;
  }

  function orderingBlockedReason(p){
    if (!p) return '';
    if (!p.live) return catalogState === 'loading' ? 'Loading the live catalogue…' : 'This piece is not available to order right now.';
    if (p.inStock === false) return 'Out of stock.';
    if (storeConfig.ordering[p.cat] !== true) {
      return 'We are not delivering ' + (catLabel(p.cat) || 'these').toLowerCase() + ' to your area just yet.';
    }
    return '';
  }

  function catLabel(id){
    var c = CATS.find(function(x){ return x.id === id; });
    return c ? c.label : id;
  }


  /* ================= SESSION =================
     Two ways to be signed in, and they are not equivalent.

       IN-APP  window.__ASTROWANI__.token, injected by the WebView before this script
               runs (see astrowani_customer-main/src/screens/Remedies/StoreWebView.js).
               Always wins, is never written to localStorage, and cannot be signed out
               from here - the app owns that session.
       WEB     a JWT this page obtained itself via phone OTP, held in localStorage.

     Both are the same customer JWT the apps use, minted by
     POST /api/users/mobile-otp-verify, so an order placed on the web appears under My
     Orders in the app and in the admin dashboard against the same customer row. That is
     the whole reason the web login reuses OTP rather than inventing a guest identity. */
  var WEB_TOKEN_KEY = 'astrowani_store_token';
  var WEB_PROFILE_KEY = 'astrowani_store_profile';

  var session = {
    token: null,
    fromApp: false,
    profile: null      // {phone, name} - display only, never trusted for anything
  };

  function loadSession(){
    // Re-read APP each time: on Android the WebView injects a second time after load
    // (see injectAuthAfterLoad), and that is the injection that reliably wins the race.
    var app = (typeof window !== 'undefined' && window.__ASTROWANI__) || null;
    if (app && app.token) {
      session.token = app.token;
      session.fromApp = true;
    } else {
      session.fromApp = false;
      try { session.token = localStorage.getItem(WEB_TOKEN_KEY) || null; } catch(e){ session.token = null; }
    }
    try { session.profile = JSON.parse(localStorage.getItem(WEB_PROFILE_KEY) || 'null'); } catch(e){ session.profile = null; }
    AUTH_TOKEN = session.token;
    return session;
  }

  function setWebSession(token, profile){
    try {
      localStorage.setItem(WEB_TOKEN_KEY, token);
      if (profile) localStorage.setItem(WEB_PROFILE_KEY, JSON.stringify(profile));
    } catch(e){}
    session.token = token;
    session.profile = profile || session.profile;
    AUTH_TOKEN = token;
  }

  function signOut(){
    try { localStorage.removeItem(WEB_TOKEN_KEY); localStorage.removeItem(WEB_PROFILE_KEY); } catch(e){}
    session.token = null; session.profile = null;
    AUTH_TOKEN = null;
  }

  function isSignedIn(){ return !!session.token; }

  /* A 401 means the JWT expired or was revoked. Clearing it here, at the one place every
     API response passes through, is what stops the shopper looping through a checkout
     that can never succeed - they are signed out and sent to /login/ with a reason. */
  function handleAuthFailure(){
    if (session.fromApp) return false;   // the app owns that token; do not touch it
    signOut();
    return true;
  }

  /* ================= CART =================
     Client-side, in localStorage, exactly as the app's CartContext is - and safe for the
     same reason: a stale price here is corrected by the server quote before any money
     moves. There is deliberately no carts table.

     Keyed by remedy_items uuid once the live catalogue has loaded. */
  var CART_KEY = 'astrowani_store_cart';
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch(e){ cart = {}; }
  if (!cart || typeof cart !== 'object') cart = {};

  var MAX_QTY_PER_LINE = 10;   // matches orderRoutes.js's own clamp
  var MAX_LINES = 20;

  function saveCart(){ try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){} }

  function cartIds(){ return Object.keys(cart).filter(function(id){ return !!byId[id]; }); }
  function cartCount(){ return cartIds().reduce(function(s,id){ return s + cart[id]; }, 0); }
  function cartQty(id){ return cart[id] || 0; }
  function cartSubtotal(){
    return cartIds().reduce(function(s,id){ return s + (byId[id].price * cart[id]); }, 0);
  }

  // The delivery figure the cart shows while browsing. An ESTIMATE from the same
  // app_settings the server prices from - never presented as "to pay".
  function estimatedDelivery(subtotal){
    if (!storeConfig.loaded || !subtotal) return 0;
    if (storeConfig.freeDeliveryAbove != null && subtotal >= storeConfig.freeDeliveryAbove) return 0;
    return storeConfig.deliveryFee;
  }

  function setQty(id, qty){
    var p = byId[id];
    if (!p) return;
    qty = Math.max(0, Math.min(MAX_QTY_PER_LINE, qty));
    if (!qty) { delete cart[id]; }
    else {
      if (!cart[id] && cartIds().length >= MAX_LINES) { showToast('That is as many different pieces as one order can hold'); return; }
      cart[id] = qty;
    }
    saveCart();
    onCartChanged();
  }

  function addToCart(id, qty){
    var p = byId[id];
    if (!p) return;
    if (!canOrder(p)) { showToast(orderingBlockedReason(p)); return; }
    setQty(id, cartQty(id) + (qty || 1));
  }

  function clearCart(){ cart = {}; saveCart(); onCartChanged(); }

  /* ================= WISHLIST ================= */
  var WISH_KEY = 'astrowani_store_wishlist';
  var wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch(e){ wishlist = []; }
  if (!Array.isArray(wishlist)) wishlist = [];
  function isWished(id){ return wishlist.indexOf(id) !== -1; }
  function toggleWishlist(id){
    var i = wishlist.indexOf(id);
    if (i === -1) wishlist.push(id); else wishlist.splice(i, 1);
    try { localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); } catch(e){}
    return isWished(id);
  }

  /* ================= SMALL HELPERS ================= */
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }
  function rupees(n){ return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function pct(price, mrp){ return mrp && mrp > price ? Math.round((1 - price / mrp) * 100) : 0; }

  var toastTimer = null;
  function showToast(msg){
    if (!msg) return;
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  var REVIEW_NAMES = ['Priya Sharma','Rohit Malhotra','Ananya Iyer','Kabir Mehta','Sneha Reddy','Arjun Nair','Divya Kapoor','Vikram Singh'];
  var REVIEW_TEMPLATES = [
    'Arrived well-packed and exactly as described. The {n} feels genuinely well-made.',
    'Ordered this after my astrologer suggested it, and the quality matches what I expected for the price.',
    'Good product, delivery took a couple of days longer than promised but worth the wait.',
    'This is my second purchase from Astrowani. Consistent quality on the {n}.',
    'Happy with the {n}. Packaging felt premium and the certificate/details were included.'
  ];
  function productReviews(p){
    var h = hashStr(p.id);
    var count = 2 + (h % 2);
    var out = [];
    for (var i=0;i<count;i++){
      var nh = hashStr(p.id+':'+i);
      var name = REVIEW_NAMES[nh % REVIEW_NAMES.length];
      var text = REVIEW_TEMPLATES[nh % REVIEW_TEMPLATES.length].replace('{n}', p.name.split(',')[0]);
      var stars = 4 + (nh % 2);
      var daysAgo = 4 + (nh % 50);
      out.push({name:name, text:text, stars:stars, daysAgo:daysAgo});
    }
    return out;
  }
  var TESTIMONIALS = [
    {photo:'c1', name:'Ritika Sharma', loc:'New Delhi',
      quote:'Ran the Moolank calculator first, then ordered the emerald. It arrived with the lab report and a note on which day to start wearing it.'},
    {photo:'c2', name:'Mahesh Agarwal', loc:'Jaipur, Rajasthan',
      quote:'I have been buying stones for thirty years. The yellow sapphire they sent matched its certificate exactly, which is rarer than people think.'},
    {photo:'c3', name:'Lata Deshpande', loc:'Pune, Maharashtra',
      quote:'The pearl came properly packed, and the guidance sheet made the whole thing feel considered rather than superstitious.'}
  ];
  /* ================= CALCULATORS ================= */
  function reduceDigits(n){
    n = Math.abs(n);
    while (n > 9){
      n = String(n).split('').reduce(function(s,d){ return s+parseInt(d,10); }, 0);
    }
    return n;
  }

  var MOOLANK_TRAITS = {
    1:{planet:'Sun', trait:'Natural leaders with a strong independent streak: decisive, and happiest setting their own direction.'},
    2:{planet:'Moon', trait:'Intuitive and emotionally attuned. You read a room before you speak, and thrive in close partnerships.'},
    3:{planet:'Jupiter', trait:'Expansive and optimistic, drawn to teaching, learning, and wide social circles.'},
    4:{planet:'Rahu', trait:'Unconventional and hard-working. You often build success in ways that surprise people around you.'},
    5:{planet:'Mercury', trait:'Quick, adaptable, and communicative. Change energises rather than unsettles you.'},
    6:{planet:'Venus', trait:'Drawn to beauty, harmony and relationships, a natural diplomat with strong aesthetic instincts.'},
    7:{planet:'Ketu', trait:'Introspective and independent. You need solitude to recharge and think in unusual directions.'},
    8:{planet:'Saturn', trait:'Disciplined and patient. Success tends to arrive later but lasts longer for you than for most.'},
    9:{planet:'Mars', trait:'Driven and courageous. You move first, ask questions later, and rarely back down from a challenge.'}
  };

  // 4, 6 and 7 used to point at a rudraksha bead, a rose quartz bracelet and a rudraksha
  // bracelet — none of which are in the catalogue any more now that it's gemstones only, so
  // "Find my stone" was recommending things nobody could buy. They now use the canonical
  // navratna stone for each planet, which is what the rest of the mapping already followed.
  var GEM_MAP = {
    1:{name:'Ruby (Manik)', productId:'p6'},              // Sun
    2:{name:'Pearl (Moti)', productId:'p8'},              // Moon
    3:{name:'Yellow Sapphire (Pukhraj)', productId:'p9'}, // Jupiter
    4:{name:'Hessonite (Gomed)', productId:'p22'},        // Rahu
    5:{name:'Emerald (Panna)', productId:'p7'},           // Mercury
    6:{name:'Diamond', productId:'p47'},                  // Venus
    7:{name:"Cat's Eye (Lehsunia)", productId:'p23'},     // Ketu
    8:{name:'Blue Sapphire (Neelam)', productId:'p5'},    // Saturn
    9:{name:'Red Coral (Moonga)', productId:'p10'}        // Mars
  };
  /* ================= WANI PUJA =================
     Catalogue of the 64 pujas, paths and sanskars offered on astrowani.com/book-puja.
     Read directly by renderPujas() rather than being folded into PRODUCTS/byId, because
     recomputeCatalog() replaces the entire catalogue with the live /api/remedies rows the
     moment they arrive - anything sitting in PRODUCTS is invisible in production. See the
     longer note in the PUJA SECTION css block for why booking is an enquiry rather than a
     cart add. */
  var PUJA_IMG_BASE = '/assets/Wani%20Puja/';
  // Published on astrowani.com/book-puja. Deliberately a separate constant from
  // ENQUIRY_WHATSAPP (still empty) so turning puja booking on does not silently reroute
  // gemstone enquiries, which go to e-mail today.
  var PUJA_WHATSAPP = '917297900990';

  // Same acceptance as the gemstone enquiry form: 8-15 characters, digits plus the
  // separators people actually type. Written as a scan rather than a regexp so the
  // character class survives every layer this file is generated through.
  function pujaPhoneOk(v){
    if (v.length < 8 || v.length > 15) return false;
    for (var i = 0; i < v.length; i++){
      var c = v.charAt(i);
      if (!(c >= '0' && c <= '9') && c !== '+' && c !== '-' && c !== ' ') return false;
    }
    return true;
  }

  var PUJAS = [
    {"id":"pj1","n":"Gauri Ganesh Puja","h":"गौरी गणेश पूजा","d":"2 hrs","m":120,"p":2100,"img":"Gauri-Ganesh-pooja.jpg","c":["marriage"]},
    {"id":"pj2","n":"Puja for Early Marriage","h":"शादी फेरे","d":"4 hrs","m":240,"p":5100,"img":"pandit-ji-marriage.webp","c":["marriage"]},
    {"id":"pj3","n":"Havan / Yagya","h":"हवन/यज्ञ","d":"2 hrs","m":120,"p":2100,"img":"Hawan-2.jpeg","c":["home"]},
    {"id":"pj4","n":"Navgrah Shanti Puja","h":"नवग्रह शांति पूजा","d":"3 hrs","m":180,"p":2100,"img":"1776066332.webp","c":["dosh"]},
    {"id":"pj5","n":"Lakshmi Narayan Puja","h":"लक्ष्मी नारायण पूजा","d":"3 hrs","m":180,"p":2100,"img":"1776066330.webp","c":["wealth"]},
    {"id":"pj6","n":"Kalash sthapna puja","h":"कलश स्थापना/घट स्थापना पूजा","d":"2 hrs","m":120,"p":2100,"img":"kalash-sthapna-puja.webp","c":["home"]},
    {"id":"pj7","n":"Shree Khatu shyam ji puja","h":"श्री खाटू श्याम पूजा","d":"2 hrs","m":120,"p":2100,"img":"1774709279.webp","c":["protection"]},
    {"id":"pj8","n":"Sunderkand Path","h":"","d":"4 hrs","m":240,"p":2100,"img":"sunderkand-path.webp","c":["path","protection"]},
    {"id":"pj9","n":"Vijay Mantra Jaap","h":"विजय मन्त्र जाप","d":"1 day","m":1440,"p":7100,"img":"1776420712.png","c":["protection","path"]},
    {"id":"pj10","n":"Hanuman Puja","h":"हनुमान पूजा","d":"2 hrs","m":120,"p":2100,"img":"1776066329.webp","c":["protection"]},
    {"id":"pj11","n":"Namkaran Sanskar","h":"नामकरण संस्कार","d":"2 hrs","m":120,"p":2100,"img":"1776066331.webp","c":["sanskar"]},
    {"id":"pj12","n":"Gajender moksh stoter","h":"गजेन्द्रमोक्ष स्तोत्र","d":"3 hrs","m":180,"p":3100,"img":"gajender-moksh-stoter.webp","c":["path","health"]},
    {"id":"pj13","n":"Mangal Dosh Puja","h":"मंगल दोष निवारण पूजा","d":"3 days","m":4320,"p":11000,"img":"1776420709.png","c":["dosh","marriage"]},
    {"id":"pj14","n":"Gopal Sahastranaam Path","h":"गोपाल सहस्त्रनाम","d":"3 hrs","m":180,"p":3100,"img":"1776420704.webp","c":["path"]},
    {"id":"pj15","n":"Durga Saptashati Path","h":"दुर्गा सप्तशती पाठ","d":"9 days","m":12960,"p":11000,"img":"1776066327.webp","c":["path","protection"]},
    {"id":"pj16","n":"Griha Pravesh Puja","h":"गृह प्रवेश पूजा","d":"3 hrs","m":180,"p":3100,"img":"1776066328.webp","c":["home"]},
    {"id":"pj17","n":"Lalita Sahasranama Stotram","h":"ललिता सहस्त्रनाम स्तोत्र","d":"4 hrs","m":240,"p":4100,"img":"lalita-sahasranama-stotram.png","c":["path"]},
    {"id":"pj18","n":"Pitra Dosh nivaran Puja Hawan","h":"पितृ दोष निवारण पूजा हवन","d":"5 days","m":7200,"p":41000,"img":"1776420710.png","c":["dosh","sanskar"]},
    {"id":"pj19","n":"Kaal Sarp Dosh Puja","h":"काल सर्प दोष निवारण पूजा जप","d":"3 days","m":4320,"p":11000,"img":"1776420706.png","c":["dosh"]},
    {"id":"pj20","n":"Vishnu Sahasrananam Path","h":"विष्णु सहस्त्रनाम पाठ","d":"3 hrs","m":180,"p":4100,"img":"1776147243.webp","c":["path"]},
    {"id":"pj21","n":"Kamya Puja","h":"काम्य पूजा मनोकामना पूर्ण","d":"4 hrs","m":240,"p":4100,"img":"1776420706.png","c":["wealth","path"]},
    {"id":"pj22","n":"Mairt Sanjivani Anushthan","h":"मृत संजीवनी अनुष्ठान","d":"7 days","m":10080,"p":125000,"img":"Mrit-Sanjivini.jpeg","c":["health"]},
    {"id":"pj23","n":"Vastu Shanti Puja","h":"वास्तु शांति पूजा","d":"4 hrs","m":240,"p":3100,"img":"1776066335.webp","c":["home","dosh"]},
    {"id":"pj24","n":"Lagan sagai puja","h":"लगन सगाई पूजा","d":"2 hrs","m":120,"p":3100,"img":"Puja-for-Marriage.jpeg","c":["marriage"]},
    {"id":"pj25","n":"Kubera Puja","h":"कुबेर पूजा","d":"2 hrs","m":120,"p":3100,"img":"1776066330.webp","c":["wealth"]},
    {"id":"pj26","n":"Kul Devi Puja","h":"कुल देवी पूजा","d":"2 hrs","m":120,"p":3100,"img":"1776420707.png","c":["marriage"]},
    {"id":"pj27","n":"Shri Sukt Strotam path","h":"श्री सूक्त पाठ","d":"3 hrs","m":180,"p":4100,"img":"1776420711.png","c":["wealth","path"]},
    {"id":"pj28","n":"Kanak Dhara Stotram","h":"कनक धारा स्तोत्र","d":"3 hrs","m":180,"p":4100,"img":"1776420707.png","c":["wealth","path"]},
    {"id":"pj29","n":"Satyanarayan Katha","h":"सत्यनारायण कथा","d":"3 hrs","m":180,"p":3100,"img":"1776066333.webp","c":["path","home"]},
    {"id":"pj30","n":"Mool Shanti Puja","h":"मूल शांति","d":"3 hrs","m":180,"p":3100,"img":"1776420709.png","c":["dosh"]},
    {"id":"pj31","n":"Rahu Ketu Mantra Jaap","h":"राहु केतु पूजा अनुष्ठान","d":"2 days","m":2880,"p":7100,"img":"1776420710.png","c":["dosh"]},
    {"id":"pj32","n":"Shani Vrat Udyapan","h":"शनि व्रत उद्यापन","d":"3 hrs","m":180,"p":3100,"img":"1776147232.webp","c":["vrat"]},
    {"id":"pj33","n":"Mangala Gauri Vrat Udyapan","h":"मंगला गौरी व्रत उद्यापन","d":"3 hrs","m":180,"p":4100,"img":"1776147533.webp","c":["vrat","marriage"]},
    {"id":"pj34","n":"Vaibhav Lakshmi Vrat Udyapan","h":"वैभव लक्ष्मी व्रत उद्यापन","d":"2 hrs","m":120,"p":3100,"img":"1776147234.webp","c":["vrat","wealth"]},
    {"id":"pj35","n":"Gayatri Mantra Jaap","h":"गायत्री मंत्र जाप","d":"5 days","m":7200,"p":51000,"img":"1776147818.webp","c":["path"]},
    {"id":"pj36","n":"Janeu Sanskar Puja","h":"जनेऊ संस्कार पूजा","d":"3 hrs","m":180,"p":3100,"img":"1776420705.webp","c":["sanskar"]},
    {"id":"pj37","n":"Ram Raksha Stotram Path","h":"राम रक्षा स्तोत्र पाठ","d":"3 hrs","m":180,"p":4100,"img":"1776148577.png","c":["protection","path"]},
    {"id":"pj38","n":"Rudrabhishek","h":"रुद्राभिषेक","d":"3 hrs","m":180,"p":4100,"img":"1776066332.webp","c":["path","health"]},
    {"id":"pj39","n":"Shiv mahapuran katha","h":"शिव महापुराण कथा","d":"7 days","m":10080,"p":71000,"img":"shiv-mahapuran-katha.png","c":["path"]},
    {"id":"pj40","n":"Surya Jaap","h":"सूर्य जाप","d":"4 hrs","m":240,"p":5100,"img":"1776420712.png","c":["dosh","path"]},
    {"id":"pj41","n":"Garud puran","h":"गरुड़ पुराण","d":"7 days","m":10080,"p":7100,"img":"Garud.png","c":["sanskar","path"]},
    {"id":"pj42","n":"Harivansh Puran path","h":"हरिवंश पुराण","d":"7 days","m":10080,"p":71000,"img":"1776420705.webp","c":["path"]},
    {"id":"pj43","n":"Mundan Sanskar","h":"मुंडन संस्कार","d":"2 hrs","m":120,"p":2100,"img":"1776066331.webp","c":["sanskar"]},
    {"id":"pj44","n":"Murti Pran Pratishtha","h":"मूर्ति प्राण प्रतिष्ठा","d":"5 days","m":7200,"p":51000,"img":"murti-pran-pratishtha.png","c":["home"]},
    {"id":"pj45","n":"Somvar Vrat Udyapan","h":"सोलह सोमवार उद्यापन","d":"3 hrs","m":180,"p":3100,"img":"1776147233.webp","c":["vrat"]},
    {"id":"pj46","n":"Chandra Jaap","h":"चन्द्र जाप","d":"5 hrs","m":300,"p":5100,"img":"1776420702.png","c":["dosh"]},
    {"id":"pj47","n":"Chatrapal Puja","h":"क्षेत्रपाल पूजा","d":"4 hrs","m":240,"p":11000,"img":"1776420703.png","c":["protection"]},
    {"id":"pj48","n":"Durga Mantra Jaap","h":"दुर्गा मंत्र जाप","d":"3 days","m":4320,"p":21000,"img":"1776148405.webp","c":["protection","path"]},
    {"id":"pj49","n":"Ekadashi Vrat Udyapan","h":"एकादशी व्रत उद्यापन","d":"2 days","m":2880,"p":3100,"img":"1776147676.webp","c":["vrat"]},
    {"id":"pj50","n":"Gita path","h":"गीता पाठ","d":"5 days","m":7200,"p":21000,"img":"1776420704.webp","c":["path"]},
    {"id":"pj51","n":"Katyani jap","h":"कात्यानी जाप","d":"2 days","m":2880,"p":11000,"img":"1776420708.png","c":["marriage"]},
    {"id":"pj52","n":"Mangalwar Vrat Udyapan","h":"मंगलवार व्रत उद्यापन","d":"3 hrs","m":180,"p":3100,"img":"1776420977.png","c":["vrat"]},
    {"id":"pj53","n":"Shani Grah Jaap","h":"शनि ग्रह जाप","d":"3 days","m":4320,"p":7100,"img":"1776420711.png","c":["dosh"]},
    {"id":"pj54","n":"Vishakrma puja","h":"विश्कर्मा पूजा","d":"2 hrs","m":120,"p":2100,"img":"vishakrma-puja.png","c":["home","wealth"]},
    {"id":"pj55","n":"Akhand Ramayan Path","h":"अखंड रामायण पाठ","d":"2 days","m":2880,"p":11000,"img":"1776066325.webp","c":["path"]},
    {"id":"pj56","n":"Baglamukhi Jaap","h":"बगलामुखी जाप","d":"9 days","m":12960,"p":100000,"img":"1776066326.webp","c":["protection"]},
    {"id":"pj57","n":"Batuk Bharab Stotram","h":"बटुक भैरव स्तोत्र","d":"3 hrs","m":180,"p":5100,"img":"1776420700.png","c":["protection"]},
    {"id":"pj58","n":"Maha Mrityunjaya Jaap","h":"महा मृत्युंजय जाप","d":"7 days","m":10080,"p":71000,"img":"1776066330.webp","c":["health"]},
    {"id":"pj59","n":"Purnima Virat Udyapan","h":"पूर्णिमा व्रत उद्यापन","d":"2 hrs","m":120,"p":3100,"img":"1776421300.png","c":["vrat"]},
    {"id":"pj60","n":"Santoshi Mata Vrat Udyapan","h":"संतोषी माता व्रत उद्यापन","d":"3 hrs","m":180,"p":3100,"img":"1776147146.webp","c":["vrat"]},
    {"id":"pj61","n":"Saraswati Puja","h":"सरस्वती पूजा","d":"2 days","m":2880,"p":4100,"img":"1776066333.webp","c":["path"]},
    {"id":"pj62","n":"Shradh aur Tarpan","h":"श्राद्ध एवं तर्पण","d":"3 hrs","m":180,"p":3100,"img":"Tarpan.png","c":["sanskar"]},
    {"id":"pj63","n":"Shrimad Bhagwat Mool Path","h":"श्रीमद् भागवत मूल पाठ","d":"7 days","m":10080,"p":51000,"img":"1776420702.png","c":["path"]},
    {"id":"pj64","n":"Tulsi Vivah","h":"तुलसी विवाह","d":"4 hrs","m":240,"p":5100,"img":"1776066334.webp","c":["marriage","path"]}
  ];

  /* Duration bands. `mins` is null for a puja that came from the admin rather than the
     editorial list below, and an unknown duration must never be filtered OUT - hiding a
     real, orderable puja because nobody typed its length is worse than showing it under a
     band it may not belong to. */
  var PUJA_BANDS = [
    {id:'all',   label:'All pujas',        test:function(){ return true; }},
    {id:'day',   label:'Within a day',     test:function(p){ return p.mins == null || p.mins <= 1440; }},
    {id:'short', label:'2 to 3 days',      test:function(p){ return p.mins == null || (p.mins > 1440 && p.mins <= 4320); }},
    {id:'long',  label:'5 days and above', test:function(p){ return p.mins == null || p.mins > 4320; }}
  ];
  /* A puja is chosen by what it is FOR, which is a different question from how long it
     takes - so the purpose tiles filter alongside the duration chips rather than
     replacing them. `rep` names the puja whose photograph stands in for the category;
     when dedicated artwork arrives, add it to PUJA_CAT_PHOTOS and nothing else changes. */
  var PUJA_CATS = [
    {id:'dosh',       label:'Dosh Nivaran',        rep:'pj4'},
    {id:'wealth',     label:'Wealth & Prosperity', rep:'pj25'},
    {id:'marriage',   label:'Marriage & Family',   rep:'pj2'},
    {id:'health',     label:'Health & Long Life',  rep:'pj22'},
    {id:'home',       label:'Home & Vastu',        rep:'pj16'},
    {id:'protection', label:'Protection',          rep:'pj10'},
    {id:'path',       label:'Path, Katha & Jaap',  rep:'pj20'},
    {id:'vrat',       label:'Vrat Udyapan',        rep:'pj45'},
    {id:'sanskar',    label:'Sanskar & Shradh',    rep:'pj43'}
  ];
  var PUJA_CAT_PHOTOS = {};

  // The artwork filenames carry spaces and mixed case, so they are encoded here rather
  // than in each caller - PUJA_IMG_BASE already ends in a slash.
  function pujaArtwork(file){ return PUJA_IMG_BASE + encodeURIComponent(file); }

  /* ================= THE PUJA LIST =================
     Two sources, and BOTH have to be on screen.

       EDITORIAL  the 64 pujas above - names, Hindi names, durations and artwork, curated
                  before the shop had a backend. Complete, and not orderable by itself.
       LIVE       rows in remedy_items of type 'puja' or 'specific_puja', created in the
                  admin dashboard. Orderable, but there is no guarantee an admin used the
                  same wording as the editorial list.

     buildPujaList() merges them into ONE normalised shape. An editorial puja whose title
     matches a live row is upgraded to payable and keeps its artwork and duration. A live
     row that matches nothing is appended in its own right, because the alternative -
     silently dropping it - means an admin adds a puja, it never appears anywhere, and
     nothing on any screen says why.

     Matching is on a squashed lowercase title, in either language, since an admin may
     well have typed the Hindi name. */
  var PUJA_LIST = [];
  function pujaKey(name){ return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  function buildPujaList(){
    var liveRows = productsOfType('puja').concat(productsOfType('specific_puja'));
    var liveByKey = {};
    liveRows.forEach(function(p){ liveByKey[pujaKey(p.name)] = p; });

    var used = {};
    var list = PUJAS.map(function(pj){
      var live = liveByKey[pujaKey(pj.n)] || (pj.h ? liveByKey[pujaKey(pj.h)] : null) || null;
      if (live) used[live.id] = true;
      return {
        id: live ? live.id : pj.id,
        slug: slugify(pj.n),
        name: pj.n,
        hindi: pj.h || '',
        dur: pj.d || '',
        mins: pj.m == null ? null : pj.m,
        // The live price is what would actually be charged, so it is the one to show.
        price: live ? live.price : pj.p,
        img: pujaArtwork(pj.img),
        cats: pj.c || [],
        live: live
      };
    });

    liveRows.forEach(function(p){
      if (used[p.id]) return;
      list.push({
        id: p.id,
        slug: slugify(p.name),
        name: p.name,
        hindi: '',
        dur: '',
        mins: null,                 // unknown, never filtered out - see PUJA_BANDS
        price: p.price,
        img: p.photo || null,       // the admin's own image; the card falls back if absent
        cats: [],
        live: p
      });
    });

    // Slugs must be unique or two pujas share a URL and one is unreachable.
    var seen = {};
    list.forEach(function(x){
      if (seen[x.slug]) x.slug = x.slug + '-' + String(x.id).replace(/-/g, '').slice(0, 6);
      seen[x.slug] = true;
    });

    PUJA_LIST = list;
  }

  function pujaBySlug(slug){
    if (!slug) return null;
    for (var i = 0; i < PUJA_LIST.length; i++){
      if (PUJA_LIST[i].slug === slug || PUJA_LIST[i].id === slug) return PUJA_LIST[i];
    }
    return null;
  }

  /* ================= ORDERS API ================= */
  function apiQuote(){
    return apiFetch('/api/orders/quote', {
      method: 'POST',
      body: JSON.stringify({ items: cartIds().map(function(id){ return { itemId: id, quantity: cart[id] }; }) })
    });
  }
  function apiAddresses(){ return apiFetch('/api/addresses').then(function(r){ return r.data || []; }); }
  function apiSaveAddress(body){ return apiFetch('/api/addresses', { method: 'POST', body: JSON.stringify(body) }); }
  function apiUpdateAddress(id, body){ return apiFetch('/api/addresses/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) }); }
  function apiDeleteAddress(id){ return apiFetch('/api/addresses/' + encodeURIComponent(id), { method: 'DELETE' }); }
  function apiMyOrders(){ return apiFetch('/api/orders/mine').then(function(r){ return r.data || []; }); }
  function apiCancelOrder(id){ return apiFetch('/api/orders/' + encodeURIComponent(id) + '/cancel', { method: 'POST' }); }

  function apiRequestOtp(phone){
    return apiFetch('/api/users/mobile-otp-request', { method: 'POST', body: JSON.stringify({ phoneNumber: phone }) });
  }
  function apiVerifyOtp(phone, otp){
    return apiFetch('/api/users/mobile-otp-verify', { method: 'POST', body: JSON.stringify({ phoneNumber: phone, otp: otp }) });
  }


  /* ================= COMPONENTS =================
     Every one of these returns an HTML STRING and is bound afterwards by delegation from
     the single #view listener. There is no per-node addEventListener anywhere in a list,
     which is what keeps a 64-card grid cheap to re-render on every filter keystroke. */

  function breadcrumb(trail){
    return '<nav class="crumbs" aria-label="Breadcrumb">' + trail.map(function(c, i){
      var last = i === trail.length - 1;
      return last
        ? '<span aria-current="page">' + escapeHtml(c.label) + '</span>'
        : '<a href="' + escapeAttr(c.href) + '" data-link>' + escapeHtml(c.label) + '</a><span class="crumb-sep" aria-hidden="true">/</span>';
    }).join('') + '</nav>';
  }

  function sectionHead(eyebrow, title, sub){
    return '<div class="section-head"><div>' +
      (eyebrow ? '<p class="eyebrow">' + escapeHtml(eyebrow) + '</p>' : '') +
      '<h2>' + escapeHtml(title) + '</h2>' +
      (sub ? '<p class="lede">' + escapeHtml(sub) + '</p>' : '') +
      '</div></div>';
  }

  /* The Add control, in its three states. This is the Blinkit pattern: a product that is
     not in the cart shows ADD; the moment it is, the same footprint becomes a stepper, so
     the card never reflows and a second tap is always in the same place as the first. */
  function addControl(p){
    if (!canOrder(p)) {
      var why = orderingBlockedReason(p);
      return '<button class="add-btn is-off" type="button" data-why="' + escapeAttr(why) + '">' +
        (p.inStock === false ? 'Sold out' : (p.live ? 'Not delivering' : 'Unavailable')) + '</button>';
    }
    var q = cartQty(p.id);
    if (!q) return '<button class="add-btn" type="button" data-add="' + escapeAttr(p.id) + '">ADD</button>';
    return '<div class="add-step" role="group" aria-label="Quantity">' +
      '<button type="button" data-dec="' + escapeAttr(p.id) + '" aria-label="Reduce quantity">&minus;</button>' +
      '<span data-qty-for="' + escapeAttr(p.id) + '">' + q + '</span>' +
      '<button type="button" data-inc="' + escapeAttr(p.id) + '"' + (q >= MAX_QTY_PER_LINE ? ' disabled' : '') + ' aria-label="Increase quantity">+</button>' +
      '</div>';
  }

  function productCard(p){
    var off = pct(p.price, p.mrp);
    var meta = productMeta(p);
    var href = '/gemstones/' + p.slug + '/';
    return '<article class="card prod-card">' +
      '<a class="card-media" href="' + escapeAttr(href) + '" data-link>' +
        (off ? '<span class="card-tag">' + off + '% OFF</span>' : '') +
        productPhotoImg(p, 'front') +
      '</a>' +
      '<button class="wishlist-btn' + (isWished(p.id) ? ' on' : '') + '" type="button" data-wish="' + escapeAttr(p.id) + '" aria-label="Save to wishlist">' + (isWished(p.id) ? '&#9829;' : '&#9825;') + '</button>' +
      '<div class="card-body">' +
        '<a class="card-name" href="' + escapeAttr(href) + '" data-link>' + escapeHtml(p.name) + '</a>' +
        (p.unitLabel ? '<div class="card-unit">' + escapeHtml(p.unitLabel) + '</div>' : '') +
        '<div class="rating-row"><span class="stars-sm">' + starString(meta.rating) + '</span><span class="rcount">' + meta.rating.toFixed(1) + '</span></div>' +
        '<div class="card-foot">' +
          '<div class="card-price-row">' +
            '<span class="card-price price">' + rupees(p.price) + '</span>' +
            (p.mrp && p.mrp > p.price ? '<span class="card-mrp price">' + rupees(p.mrp) + '</span>' : '') +
          '</div>' +
          addControl(p) +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function pujaCard(pj){
    var live = pj.live;
    var href = '/pujas/' + pj.slug + '/';
    return '<article class="card pj-card">' +
      '<a class="card-media" href="' + escapeAttr(href) + '" data-link>' +
        (pj.img
          ? '<img loading="lazy" src="' + escapeAttr(pj.img) + '" alt="' + escapeAttr(pj.name) + '">'
          : '<span class="pj-noart" aria-hidden="true">&#128367;</span>') +
      '</a>' +
      '<div class="card-body">' +
        '<a class="card-name" href="' + escapeAttr(href) + '" data-link>' + escapeHtml(pj.name) + '</a>' +
        (pj.hindi ? '<div class="pj-hi">' + escapeHtml(pj.hindi) + '</div>' : '') +
        '<div class="pj-meta">' +
          (pj.dur ? '<span class="pj-dur">&#9201; ' + escapeHtml(pj.dur) + '</span>' : '<span class="pj-dur"></span>') +
          '<span class="price pj-price">' + rupees(pj.price) + '</span>' +
        '</div>' +
        '<div class="card-foot">' +
          (live && canOrder(live)
            ? addControl(live)
            : '<a class="btn btn-gold btn-sm pj-book" href="' + escapeAttr(href) + '" data-link>Book this puja</a>') +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /* ================= PAGINATION =================
     Real links to real URLs (/gemstones/page/3/), not a "load more" button, for three
     reasons: a page deep in the catalogue can be linked to and returned to, the browser
     restores scroll on Back, and the in-app WebView hardware Back walks it correctly.
     A window of pages around the current one, with first and last always reachable, so 9
     pages of pujas never becomes a wall of numbers on a phone. */
  function pagination(page, pages, hrefFor){
    if (pages <= 1) return '';
    var nums = [];
    var from = Math.max(1, page - 1), to = Math.min(pages, page + 1);
    if (from > 1) nums.push(1);
    if (from > 2) nums.push('gap');
    for (var i = from; i <= to; i++) nums.push(i);
    if (to < pages - 1) nums.push('gap');
    if (to < pages) nums.push(pages);

    return '<nav class="pager" aria-label="Pagination">' +
      (page > 1
        ? '<a class="pager-arrow" href="' + escapeAttr(hrefFor(page - 1)) + '" data-link rel="prev">&larr; Previous</a>'
        : '<span class="pager-arrow is-off">&larr; Previous</span>') +
      '<span class="pager-nums">' + nums.map(function(n){
        if (n === 'gap') return '<span class="pager-gap">&hellip;</span>';
        return n === page
          ? '<span class="pager-num on" aria-current="page">' + n + '</span>'
          : '<a class="pager-num" href="' + escapeAttr(hrefFor(n)) + '" data-link>' + n + '</a>';
      }).join('') + '</span>' +
      (page < pages
        ? '<a class="pager-arrow" href="' + escapeAttr(hrefFor(page + 1)) + '" data-link rel="next">Next &rarr;</a>'
        : '<span class="pager-arrow is-off">Next &rarr;</span>') +
    '</nav>';
  }

  function pageOf(list, page, perPage){
    var pages = Math.max(1, Math.ceil(list.length / perPage));
    var p = Math.min(Math.max(1, page || 1), pages);
    return { items: list.slice((p - 1) * perPage, p * perPage), page: p, pages: pages, total: list.length };
  }

  function emptyNote(msg){ return '<div class="empty-note">' + escapeHtml(msg) + '</div>'; }

  function skeletonGrid(n){
    var cells = '';
    for (var i = 0; i < (n || 8); i++) cells += '<div class="skel-card"><div class="skel-media"></div><div class="skel-line"></div><div class="skel-line short"></div></div>';
    return '<div class="product-grid">' + cells + '</div>';
  }

  /* ================= STICKY CART BAR =================
     Lives outside #view so it survives every route change without being re-created, and
     is deliberately hidden on the cart and checkout routes themselves - a "view cart" bar
     covering the cart is just an obstruction over the total. */
  function renderCartBar(){
    var bar = document.getElementById('cartBar');
    if (!bar) return;
    var count = cartCount();
    var route = currentRoute && currentRoute.name;
    var hide = !count || route === 'cart' || route === 'checkout';
    bar.classList.toggle('show', !hide);
    if (hide) { document.body.classList.remove('has-cart-bar'); return; }
    document.body.classList.add('has-cart-bar');
    bar.innerHTML =
      '<div class="wrap cartbar-row">' +
        '<div class="cartbar-info">' +
          '<strong>' + count + (count === 1 ? ' item' : ' items') + '</strong>' +
          '<span class="cartbar-sub">' + rupees(cartSubtotal()) + ' subtotal</span>' +
        '</div>' +
        '<a class="btn btn-gold cartbar-go" href="/cart/" data-link>View cart &rarr;</a>' +
      '</div>';
  }

  function renderCartBadge(){
    var badge = document.getElementById('cartCount');
    if (!badge) return;
    var n = cartCount();
    if (n) { badge.textContent = n > 99 ? '99+' : n; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }


  /* ================= PAGES: HOME + CATALOGUE =================
     Each page function returns the HTML for #view. Anything that needs wiring beyond a
     link is handled by the delegated listener in the ROUTER section below, so no page
     function ever holds a reference to a node it rendered. */

  var PER_PAGE = 12;

  // Listing state that is NOT in the URL. Page number is (it is a link people share);
  // a half-typed search box is not.
  var shopState = { purpose: 'all', price: 'all', sort: 'popularity', q: '' };
  var pujaState = { q: '', band: 'all', sort: 'featured', cat: 'all' };

  var PRICE_BANDS = [
    { id: 'all', label: 'Any price', test: function(){ return true; } },
    { id: 'under2000', label: 'Under ' + rupees(2000), test: function(p){ return p.price < 2000; } },
    { id: '2000-6000', label: rupees(2000) + ' - ' + rupees(6000), test: function(p){ return p.price >= 2000 && p.price <= 6000; } },
    { id: 'above6000', label: 'Above ' + rupees(6000), test: function(p){ return p.price > 6000; } }
  ];

  function pageHome(){
    var featured = productsOfType('gemstone').slice(0, 8);
    return '' +
      '<section class="hero home-hero">' +
        '<div class="wrap hero-inner">' +
          '<p class="eyebrow">Wani Shop</p>' +
          '<h1>Remedies chosen against your chart, not a catalogue.</h1>' +
          '<p class="lede">Certified gemstones verified against their lab report, and sixty-four pujas performed with the full vidhi by our pandits.</p>' +
          '<a class="btn btn-gold" href="/gemstones/" data-link>Shop gemstones</a>' +
        '</div>' +
      '</section>' +

      '<section class="section" id="entry">' +
        '<div class="wrap">' +
          sectionHead('Wani Shop', 'What are you here for?') +
          '<div class="gate-grid">' +
            '<a class="gate-tile" href="/gemstones/" data-link>' +
              '<img src="/assets/9063ec9a65d8.jpg" alt="Certified astrological gemstones in a jeweller box." loading="lazy">' +
              '<div class="gate-label"><h3>Gemstones</h3>' +
              '<p>Certified stones, chosen against your chart and verified before they reach you.</p>' +
              '<span class="gate-go">Shop gemstones &rarr;</span></div>' +
            '</a>' +
            '<a class="gate-tile" href="/pujas/" data-link>' +
              '<img src="/assets/pujas-banner.jpg" alt="A puja thali, kalash and lit diya set out on a low table." loading="lazy">' +
              '<div class="gate-label"><h3>Pujas</h3>' +
              '<p>Sixty-four pujas, paths and sanskars, performed with the full vidhi by our pandits.</p>' +
              '<span class="gate-go">Book a puja &rarr;</span></div>' +
            '</a>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="section">' +
        '<div class="wrap">' +
          sectionHead('Shop by purpose', 'What is asking for a remedy right now?') +
          '<div class="purpose-grid">' + PURPOSES.map(function(pu){
            return '<a class="purpose-tile" href="/purpose/' + pu.id + '/" data-link>' +
              (PURPOSE_PHOTOS[pu.id] ? '<img src="' + escapeAttr(PURPOSE_PHOTOS[pu.id]) + '" alt="" loading="lazy">' : '') +
              '<span class="pt-label">' + escapeHtml(pu.label) + '</span></a>';
          }).join('') + '</div>' +
        '</div>' +
      '</section>' +

      '<section class="section">' +
        '<div class="wrap">' +
          sectionHead('Best sellers', 'Stones people come back for') +
          (catalogState === 'loading' ? skeletonGrid(8)
            : featured.length ? '<div class="product-grid">' + featured.map(productCard).join('') + '</div>'
            : emptyNote('The catalogue is being restocked. Please check back shortly.')) +
          '<div class="row-center"><a class="btn btn-line" href="/gemstones/" data-link>See all gemstones</a></div>' +
        '</div>' +
      '</section>' +

      '<section class="section">' +
        '<div class="wrap">' +
          sectionHead('In their words', 'Read by chart, chosen by hand') +
          '<div class="testi-grid">' + TESTIMONIALS.map(function(t){
            var photo = CUSTOMER_PHOTOS[t.photo];
            return '<div class="testi-card"><div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>' +
              '<p>&ldquo;' + escapeHtml(t.quote) + '&rdquo;</p>' +
              '<div class="testi-who">' +
                (photo ? '<div class="testi-avatar"><img src="' + escapeAttr(photo) + '" alt="" loading="lazy"></div>' : '') +
                '<div><div class="testi-name">' + escapeHtml(t.name) + '</div>' +
                '<div class="testi-loc">' + escapeHtml(t.loc) + '</div></div>' +
              '</div></div>';
          }).join('') + '</div>' +
        '</div>' +
      '</section>' +
      trustBand();
  }

  function trustBand(){
    return '<section class="section trust-band"><div class="wrap badge-row">' +
      '<div><strong>Independently lab certified</strong><span>Every stone ships with its own report.</span></div>' +
      '<div><strong>Insured delivery</strong><span>Tracked, insured and signed for.</span></div>' +
      '<div><strong>7 day returns</strong><span>Unworn, in its sealed packet.</span></div>' +
      '<div><strong>Real people</strong><span>An astrologer on call before you buy.</span></div>' +
      '</div></section>';
  }

  /* ---------------- gemstone listing ---------------- */
  function filteredProducts(){
    var q = shopState.q.trim().toLowerCase();
    var band = PRICE_BANDS.find(function(b){ return b.id === shopState.price; }) || PRICE_BANDS[0];
    var list = productsOfType('gemstone').filter(function(p){
      var okQ = !q || p.name.toLowerCase().indexOf(q) !== -1;
      var okPurpose = shopState.purpose === 'all' || (p.tags || []).indexOf(shopState.purpose) !== -1;
      return okQ && okPurpose && band.test(p);
    });
    var s = shopState.sort;
    if (s === 'price-asc') list.sort(function(a, b){ return a.price - b.price; });
    else if (s === 'price-desc') list.sort(function(a, b){ return b.price - a.price; });
    else if (s === 'name') list.sort(function(a, b){ return a.name.localeCompare(b.name); });
    else list.sort(function(a, b){ return productMeta(b).score - productMeta(a).score; });
    return list;
  }

  function pageGemstones(page){
    if (catalogState === 'loading') {
      return '<section class="section"><div class="wrap">' + sectionHead('Gemstones', 'Certified gemstones, by planet') + skeletonGrid(12) + '</div></section>';
    }
    var list = filteredProducts();
    var slice = pageOf(list, page, PER_PAGE);

    return '<section class="section listing">' +
      '<div class="wrap">' +
        breadcrumb([{ label: 'Store', href: '/' }, { label: 'Gemstones' }]) +
        sectionHead('Gemstones', 'Certified gemstones, by planet',
          'Every stone is independently lab certified, and the certificate ships in the box with it.') +

        '<div class="listing-controls">' +
          '<input class="listing-search" id="shopSearch" type="search" placeholder="Search a stone" value="' + escapeAttr(shopState.q) + '" aria-label="Search gemstones">' +
          '<select id="shopSort" aria-label="Sort products">' +
            [['popularity', 'Most popular'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name A-Z']]
              .map(function(o){ return '<option value="' + o[0] + '"' + (shopState.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
          '</select>' +
        '</div>' +

        '<div class="chip-row" role="group" aria-label="Filter by purpose">' +
          '<button type="button" class="chip' + (shopState.purpose === 'all' ? ' on' : '') + '" data-purpose="all">All purposes</button>' +
          PURPOSES.map(function(pu){
            return '<button type="button" class="chip' + (shopState.purpose === pu.id ? ' on' : '') + '" data-purpose="' + pu.id + '">' + escapeHtml(pu.label) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="chip-row" role="group" aria-label="Filter by price">' +
          PRICE_BANDS.map(function(b){
            return '<button type="button" class="chip' + (shopState.price === b.id ? ' on' : '') + '" data-price="' + b.id + '">' + escapeHtml(b.label) + '</button>';
          }).join('') +
        '</div>' +

        '<div class="listing-count">' + slice.total + (slice.total === 1 ? ' piece' : ' pieces') +
          (slice.pages > 1 ? ' &middot; page ' + slice.page + ' of ' + slice.pages : '') + '</div>' +

        (slice.items.length
          ? '<div class="product-grid">' + slice.items.map(productCard).join('') + '</div>'
          : emptyNote('No stone matches that filter yet. Try clearing the price band.')) +

        pagination(slice.page, slice.pages, function(n){ return n === 1 ? '/gemstones/' : '/gemstones/page/' + n + '/'; }) +
      '</div>' +
    '</section>';
  }

  function pagePurpose(id){
    var pu = PURPOSES.find(function(x){ return x.id === id; });
    if (!pu) return page404();
    var list = productsOfType('gemstone').filter(function(p){ return (p.tags || []).indexOf(id) !== -1; });
    return '<section class="section listing"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Gemstones', href: '/gemstones/' }, { label: pu.label }]) +
      sectionHead('Shop by purpose', pu.label, 'Stones traditionally prescribed for this, in the order people most often choose them.') +
      (catalogState === 'loading' ? skeletonGrid(6)
        : list.length ? '<div class="product-grid">' + list.map(productCard).join('') + '</div>'
        : emptyNote('Nothing is listed under this purpose right now.')) +
      '<div class="row-center"><a class="btn btn-line" href="/gemstones/" data-link>Browse everything</a></div>' +
      '</div></section>';
  }

  /* ---------------- product page ---------------- */
  function pageProduct(slug){
    if (catalogState === 'loading') {
      return '<section class="section"><div class="wrap"><div class="pdp"><div class="skel-media tall"></div><div><div class="skel-line"></div><div class="skel-line short"></div></div></div></div></section>';
    }
    var p = productBySlug(slug);
    if (!p) return page404('We could not find that piece. It may have been renamed or retired.');

    var meta = productMeta(p);
    var reviews = productReviews(p);
    var off = pct(p.price, p.mrp);
    var hasRealPhoto = !!(p.photo || REAL_PHOTOS[p.id]);
    var related = productsOfType(p.cat).filter(function(x){ return x.id !== p.id; })
      .sort(function(a, b){ return Math.abs(a.price - p.price) - Math.abs(b.price - p.price); }).slice(0, 4);
    var blocked = orderingBlockedReason(p);

    return '<section class="section pdp-section"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: catLabel(p.cat), href: '/gemstones/' }, { label: p.name }]) +

      '<div class="pdp">' +
        '<div class="pdp-media">' +
          '<div class="pdp-main" id="pdpMain">' + productPhotoImg(p, 'front', 'pdp-img') + '</div>' +
          (hasRealPhoto ? '' :
            '<div class="pdp-thumbs">' + ['front', 'angle', 'zoom'].map(function(v, i){
              return '<button type="button" class="pdp-thumb' + (i === 0 ? ' sel' : '') + '" data-variant="' + v + '" data-for="' + escapeAttr(p.id) + '">' + productPhotoImg(p, v) + '</button>';
            }).join('') + '</div>') +
        '</div>' +

        '<div class="pdp-info">' +
          '<div class="pv-cat">' + escapeHtml(catLabel(p.cat)) + '</div>' +
          '<h1 class="pdp-name">' + escapeHtml(p.name) + '</h1>' +
          (p.unitLabel ? '<div class="pdp-unit">' + escapeHtml(p.unitLabel) + '</div>' : '') +
          '<div class="pv-rating-row"><span class="stars-sm">' + starString(meta.rating) + '</span>' +
            '<span>' + meta.rating.toFixed(1) + ' &middot; ' + meta.reviews + ' ratings</span></div>' +

          '<div class="pv-price-row">' +
            '<span class="pv-price price">' + rupees(p.price) + '</span>' +
            (off ? '<span class="pv-mrp price">' + rupees(p.mrp) + '</span><span class="pv-off">' + off + '% off</span>' : '') +
          '</div>' +
          '<div class="pdp-tax">Inclusive of all taxes</div>' +

          (blocked
            ? '<div class="checkout-note">' + escapeHtml(blocked) + '</div>'
            : '<div class="pv-stock' + (meta.lowStock ? ' low' : '') + '">' +
                (meta.lowStock ? 'Only ' + meta.stockLeft + ' left in stock' : 'In stock &middot; dispatched within 24 hours') + '</div>') +

          '<div class="pdp-actions">' +
            addControl(p) +
            (canOrder(p) ? '<button class="btn btn-gold pdp-buy" type="button" data-buy="' + escapeAttr(p.id) + '">Buy now</button>' : '') +
            '<button class="btn btn-line pdp-wish' + (isWished(p.id) ? ' on' : '') + '" type="button" data-wish="' + escapeAttr(p.id) + '">' +
              (isWished(p.id) ? 'Saved' : 'Save') + '</button>' +
          '</div>' +

          '<div class="pdp-assure">' +
            '<div><strong>Lab certified</strong><span>Report in the box</span></div>' +
            '<div><strong>Insured delivery</strong><span>Tracked and signed for</span></div>' +
            '<div><strong>7 day returns</strong><span>Unworn and sealed</span></div>' +
          '</div>' +

          '<div class="pdp-block">' +
            '<h3>About this stone</h3>' +
            '<p class="pv-desc">' + escapeHtml(p.desc || '') + '</p>' +
            ((p.benefits && p.benefits.length)
              ? '<ul class="pv-benefits">' + p.benefits.map(function(b){ return '<li>' + escapeHtml(b) + '</li>'; }).join('') + '</ul>' : '') +
          '</div>' +

          '<div class="pdp-block">' +
            '<h3>Delivery</h3>' +
            '<div class="pincode-row">' +
              '<input id="pdpPin" maxlength="6" inputmode="numeric" placeholder="Enter 6-digit pincode" aria-label="Pincode">' +
              '<button class="btn btn-line btn-sm" type="button" id="pdpPinCheck">Check</button>' +
            '</div>' +
            '<div class="pincode-result" id="pdpPinResult"></div>' +
          '</div>' +

          '<div class="pdp-block">' +
            '<h3>Ratings &amp; reviews</h3>' +
            reviews.map(function(r){
              return '<div class="review-item"><span class="stars-sm">' + starString(r.stars) + '</span>' +
                '<div class="rev-name">' + escapeHtml(r.name) + '<span class="rev-date">' + r.daysAgo + ' days ago</span></div>' +
                '<p>' + escapeHtml(r.text) + '</p></div>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>' +

      (related.length
        ? '<div class="pdp-related">' + sectionHead('', 'People also considered') +
          '<div class="product-grid">' + related.map(productCard).join('') + '</div></div>'
        : '') +
    '</div></section>';
  }

  /* ---------------- pujas ---------------- */
  function filteredPujas(){
    var raw = pujaState.q.trim();
    var q = raw.toLowerCase();
    var band = PUJA_BANDS.find(function(b){ return b.id === pujaState.band; }) || PUJA_BANDS[0];
    var list = PUJA_LIST.filter(function(p){
      // Hindi is matched against the raw query, not the lowercased one - Devanagari has no
      // case, and lowercasing it is a no-op that only risks surprises.
      var okQ = !q || p.name.toLowerCase().indexOf(q) !== -1 || (p.hindi && p.hindi.indexOf(raw) !== -1);
      var okCat = pujaState.cat === 'all' || p.cats.indexOf(pujaState.cat) !== -1;
      return okQ && okCat && band.test(p);
    });
    var s = pujaState.sort;
    if (s === 'price-asc') list.sort(function(a, b){ return a.price - b.price; });
    else if (s === 'price-desc') list.sort(function(a, b){ return b.price - a.price; });
    else if (s === 'dur-asc') list.sort(function(a, b){ return (a.mins == null ? 1e9 : a.mins) - (b.mins == null ? 1e9 : b.mins); });
    else if (s === 'name') list.sort(function(a, b){ return a.name.localeCompare(b.name); });
    return list;
  }

  function pujaCatPhoto(cat){
    if (PUJA_CAT_PHOTOS[cat.id]) return PUJA_CAT_PHOTOS[cat.id];
    var rep = PUJAS.find(function(p){ return p.id === cat.rep; });
    return rep ? pujaArtwork(rep.img) : '';
  }

  function pagePujas(page){
    var list = filteredPujas();
    var slice = pageOf(list, page, PER_PAGE);

    return '<section class="section listing"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Pujas' }]) +
      sectionHead('Wani Puja', 'Sixty-four pujas, paths and sanskars',
        'Performed with the full vidhi by our pandits. The dakshina shown is confirmed with you before anything is paid.') +

      '<div class="purpose-grid puja-purpose">' + PUJA_CATS.map(function(cat){
        var photo = pujaCatPhoto(cat);
        return '<button type="button" class="purpose-tile' + (pujaState.cat === cat.id ? ' on' : '') + '" data-pjcat="' + cat.id + '">' +
          (photo ? '<img src="' + escapeAttr(photo) + '" alt="" loading="lazy">' : '') +
          '<span class="pt-label">' + escapeHtml(cat.label) + '</span></button>';
      }).join('') + '</div>' +

      '<div class="listing-controls">' +
        '<input class="listing-search" id="pjSearch" type="search" placeholder="Search a puja, in English or Hindi" value="' + escapeAttr(pujaState.q) + '" aria-label="Search pujas">' +
        '<select id="pjSort" aria-label="Sort pujas">' +
          [['featured', 'Featured'], ['price-asc', 'Dakshina: low to high'], ['price-desc', 'Dakshina: high to low'], ['dur-asc', 'Shortest first'], ['name', 'Name A-Z']]
            .map(function(o){ return '<option value="' + o[0] + '"' + (pujaState.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select>' +
      '</div>' +

      '<div class="chip-row" role="group" aria-label="Filter by duration">' +
        PUJA_BANDS.map(function(b){
          return '<button type="button" class="chip' + (pujaState.band === b.id ? ' on' : '') + '" data-pjband="' + b.id + '">' + escapeHtml(b.label) + '</button>';
        }).join('') +
      '</div>' +

      '<div class="listing-count">' + slice.total + (slice.total === 1 ? ' puja' : ' pujas') +
        (slice.pages > 1 ? ' &middot; page ' + slice.page + ' of ' + slice.pages : '') + '</div>' +

      (slice.items.length
        ? '<div class="product-grid">' + slice.items.map(pujaCard).join('') + '</div>'
        : emptyNote('No puja matches that search. Try a shorter word, or clear the filter.')) +

      pagination(slice.page, slice.pages, function(n){ return n === 1 ? '/pujas/' : '/pujas/page/' + n + '/'; }) +
    '</div></section>';
  }

  function pagePuja(slug){
    var pj = pujaBySlug(slug);
    if (!pj) return page404('We could not find that puja.');
    var live = pj.live;
    var payable = live && canOrder(live);
    var cat = PUJA_CATS.find(function(c){ return pj.cats.indexOf(c.id) !== -1; });
    var similar = PUJA_LIST.filter(function(x){
      return x.id !== pj.id && x.cats.some(function(c){ return pj.cats.indexOf(c) !== -1; });
    }).slice(0, 4);

    return '<section class="section pdp-section"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Pujas', href: '/pujas/' }, { label: pj.name }]) +

      '<div class="pdp">' +
        '<div class="pdp-media"><div class="pdp-main">' +
          (pj.img
            ? '<img class="pdp-img" src="' + escapeAttr(pj.img) + '" alt="' + escapeAttr(pj.name) + '">'
            : '<span class="pj-noart big" aria-hidden="true">&#128367;</span>') +
        '</div></div>' +

        '<div class="pdp-info">' +
          '<div class="pv-cat">' + escapeHtml(cat ? cat.label : 'Wani Puja') + '</div>' +
          '<h1 class="pdp-name">' + escapeHtml(pj.name) + '</h1>' +
          (pj.hindi ? '<div class="pj-hi pdp-hi">' + escapeHtml(pj.hindi) + '</div>' : '') +

          '<div class="pj-facts">' +
            (pj.dur ? '<div class="pj-fact"><div class="pj-fact-k">Puja / anushthan time</div><div class="pj-fact-v">' + escapeHtml(pj.dur) + '</div></div>' : '') +
            '<div class="pj-fact"><div class="pj-fact-k">Dakshina</div><div class="pj-fact-v price">' + rupees(pj.price) + '</div></div>' +
          '</div>' +

          '<ol class="pj-steps">' +
            '<li>Tell us your name, phone number and what the puja is for.</li>' +
            '<li>Our pandit calls you to fix the muhurat and confirm the samagri.</li>' +
            '<li>The puja is performed with the full vidhi, and you receive the sankalp and prasad details.</li>' +
          '</ol>' +

          (payable
            ? '<div class="pdp-actions">' + addControl(live) +
                '<button class="btn btn-gold pdp-buy" type="button" data-buy="' + escapeAttr(live.id) + '">Book &amp; pay online</button></div>' +
              '<div class="checkout-note">Paying online books the puja and the pandit calls you to fix the muhurat. The address you give at checkout is where the puja will be performed.</div>'
            : '<div class="pdp-actions"><button class="btn btn-gold btn-full" type="button" data-pjbook="' + escapeAttr(pj.id) + '">Request this puja on WhatsApp</button></div>' +
              '<div class="checkout-note">Nothing is charged on this page. The dakshina above is indicative and is confirmed with you on the call before anything is paid.</div>') +

          '<div class="pdp-block">' +
            '<h3>What is included</h3>' +
            '<ul class="pv-benefits">' +
              '<li>A qualified pandit who performs the full vidhi for this puja</li>' +
              '<li>Sankalp taken in your name and gotra</li>' +
              '<li>Photographs or a video of the puja, and prasad details</li>' +
              '<li>Samagri arranged for you unless you would rather provide it</li>' +
            '</ul>' +
          '</div>' +
        '</div>' +
      '</div>' +

      (similar.length
        ? '<div class="pdp-related">' + sectionHead('', 'Often booked alongside') +
          '<div class="product-grid">' + similar.map(pujaCard).join('') + '</div></div>'
        : '') +
    '</div></section>';
  }


  /* ================= PAGES: CART, LOGIN, CHECKOUT, ORDERS =================
     Pages that need server data follow one shape: a module-level state object with a
     status, an enter hook that fetches into it, and a render that reads it. The router
     calls the enter hook once per navigation, so a re-render (a cart change, a quote
     coming back) never re-fires the fetch. */

  /* ---------------- cart ---------------- */
  function pageCart(){
    var ids = cartIds();
    // Same trap as the checkout guard: a cart holding live uuids reads as empty until the
    // catalogue arrives. Telling someone their cart is empty when it is not is the one
    // wrong answer here, so while there are saved lines we cannot resolve yet, say so.
    if (!ids.length && catalogState === 'loading' && Object.keys(cart).length) {
      return '<section class="section"><div class="wrap">' +
        breadcrumb([{ label: 'Store', href: '/' }, { label: 'Cart' }]) +
        '<div class="empty-state"><h2>Loading your cart</h2>' +
        '<p class="lede">One moment - we are checking current prices and stock.</p></div>' +
        '</div></section>';
    }
    if (!ids.length) {
      return '<section class="section"><div class="wrap">' +
        breadcrumb([{ label: 'Store', href: '/' }, { label: 'Cart' }]) +
        '<div class="empty-state">' +
          '<h2>Your cart is empty</h2>' +
          '<p class="lede">Nothing here yet. The certified stones are the place most people start.</p>' +
          '<a class="btn btn-gold" href="/gemstones/" data-link>Browse gemstones</a>' +
        '</div></div></section>';
    }

    var subtotal = cartSubtotal();
    var delivery = estimatedDelivery(subtotal);
    var blocked = ids.filter(function(id){ return !canOrder(byId[id]); });

    return '<section class="section"><div class="wrap cart-page">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Cart' }]) +
      sectionHead('', 'Your cart') +

      '<div class="cart-layout">' +
        '<div class="cart-lines">' + ids.map(function(id){
          var p = byId[id];
          return '<div class="cart-line">' +
            '<a class="cl-media" href="/gemstones/' + escapeAttr(p.slug) + '/" data-link>' + productPhotoImg(p, 'front') + '</a>' +
            '<div class="cl-info">' +
              '<a class="cl-name" href="/gemstones/' + escapeAttr(p.slug) + '/" data-link>' + escapeHtml(p.name) + '</a>' +
              (p.unitLabel ? '<div class="cl-unit">' + escapeHtml(p.unitLabel) + '</div>' : '') +
              '<div class="cl-price price">' + rupees(p.price) + ' each</div>' +
              (canOrder(p) ? '' : '<div class="cl-warn">' + escapeHtml(orderingBlockedReason(p)) + '</div>') +
              '<div class="cl-controls">' +
                '<div class="add-step">' +
                  '<button type="button" data-dec="' + escapeAttr(id) + '" aria-label="Reduce quantity">&minus;</button>' +
                  '<span>' + cart[id] + '</span>' +
                  '<button type="button" data-inc="' + escapeAttr(id) + '"' + (cart[id] >= MAX_QTY_PER_LINE ? ' disabled' : '') + ' aria-label="Increase quantity">+</button>' +
                '</div>' +
                '<button class="cl-remove" type="button" data-rm="' + escapeAttr(id) + '">Remove</button>' +
              '</div>' +
            '</div>' +
            '<div class="cl-total price">' + rupees(p.price * cart[id]) + '</div>' +
          '</div>';
        }).join('') + '</div>' +

        '<aside class="cart-summary">' +
          '<h3>Bill summary</h3>' +
          '<div class="sum-row"><span>Subtotal</span><span class="price">' + rupees(subtotal) + '</span></div>' +
          '<div class="sum-row"><span>Delivery</span><span class="price">' + (delivery ? rupees(delivery) : 'Free') + '</span></div>' +
          (storeConfig.handlingFee ? '<div class="sum-row"><span>Handling</span><span class="price">' + rupees(storeConfig.handlingFee) + '</span></div>' : '') +
          '<div class="sum-row total"><span>Estimated total</span><span class="price">' + rupees(subtotal + delivery + storeConfig.handlingFee) + '</span></div>' +
          /* Deliberate wording. This figure is computed here from a cached price and is
             NOT what the customer will be asked to pay - the server reprices at checkout
             and that number is the only one shown next to a Pay button. */
          '<p class="sum-note">Estimated. Your final total is confirmed at checkout.</p>' +
          (blocked.length
            ? '<div class="checkout-note">Some pieces in your cart cannot be ordered right now. Remove them to continue.</div>'
            : '') +
          '<button class="btn btn-gold btn-full" type="button" id="goCheckout"' + (blocked.length ? ' disabled' : '') + '>' +
            (isSignedIn() ? 'Proceed to checkout' : 'Log in to check out') + '</button>' +
          '<a class="cart-keep" href="/gemstones/" data-link>Keep browsing</a>' +
        '</aside>' +
      '</div>' +
    '</div></section>';
  }

  /* ---------------- login (phone OTP) ----------------
     Same OTP endpoints the two apps use, so the JWT this mints is the same customer
     identity - a web order lands on the same customers row and appears under My Orders in
     the app. That is the entire reason this is not a guest checkout. */
  var loginState = { step: 'phone', phone: '', busy: false, error: '', next: '/cart/', resendAt: 0 };

  function enterLogin(params){
    loginState = { step: 'phone', phone: '', busy: false, error: '', next: params.next || '/cart/', resendAt: 0 };
  }

  function pageLogin(){
    if (session.fromApp) {
      return '<section class="section"><div class="wrap"><div class="empty-state">' +
        '<h2>You are already signed in</h2>' +
        '<p class="lede">The app signed you in automatically.</p>' +
        '<a class="btn btn-gold" href="/cart/" data-link>Back to cart</a></div></div></section>';
    }
    if (isSignedIn()) {
      return '<section class="section"><div class="wrap"><div class="empty-state">' +
        '<h2>You are signed in</h2>' +
        '<a class="btn btn-gold" href="' + escapeAttr(loginState.next) + '" data-link>Continue</a></div></div></section>';
    }

    var body = loginState.step === 'phone'
      ? '<div class="field"><label for="loginPhone">Mobile number</label>' +
          '<div class="phone-field"><span class="phone-cc">+91</span>' +
          '<input id="loginPhone" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile" value="' + escapeAttr(loginState.phone) + '"></div></div>' +
        '<button class="btn btn-gold btn-full" type="button" id="loginSend"' + (loginState.busy ? ' disabled' : '') + '>' +
          (loginState.busy ? 'Sending...' : 'Send OTP') + '</button>'
      : '<p class="lede login-sent">We sent a 6-digit code to <strong>+91 ' + escapeHtml(loginState.phone) + '</strong>. ' +
          '<button type="button" class="linkish" id="loginChange">Change</button></p>' +
        '<div class="field"><label for="loginOtp">Enter OTP</label>' +
          '<input id="loginOtp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code"></div>' +
        '<button class="btn btn-gold btn-full" type="button" id="loginVerify"' + (loginState.busy ? ' disabled' : '') + '>' +
          (loginState.busy ? 'Checking...' : 'Verify and continue') + '</button>' +
        '<button type="button" class="linkish login-resend" id="loginResend">Resend the code</button>';

    return '<section class="section"><div class="wrap narrow">' +
      '<div class="auth-card">' +
        '<h2>Sign in to check out</h2>' +
        '<p class="lede">Your Astrowani account, the same one the app uses - so this order shows up under My Orders there too.</p>' +
        (loginState.error ? '<div class="form-error">' + escapeHtml(loginState.error) + '</div>' : '') +
        body +
        '<p class="auth-fine">By continuing you agree to our <a href="/terms/" data-link>Terms</a> and <a href="/privacy/" data-link>Privacy Policy</a>.</p>' +
      '</div>' +
    '</div></section>';
  }

  /* ---------------- checkout ----------------
     ORDER OF OPERATIONS MIRRORS THE SERVER (see orderRoutes.js): address, then a server
     quote, then payment. Nothing on this page adds up a number of its own; every figure
     rendered comes out of the quote response. */
  var checkoutState = {
    status: 'idle',          // idle | loading | ready | error
    view: 'form',            // form | placed | unconfirmed
    quote: null,
    addresses: [],
    addressId: null,
    addingAddress: false,
    error: '',
    busy: false,
    orderId: null,
    message: ''
  };

  // One token for the life of this checkout attempt. Retrying the same attempt reuses it
  // and the server dedupes; leaving and re-entering checkout mints a new one, which is
  // correctly treated as a genuinely new order. See orders.client_request_id.
  var clientRequestId = null;

  function enterCheckout(){
    checkoutState = { status: 'loading', view: 'form', quote: null, addresses: [], addressId: null,
      addingAddress: false, error: '', busy: false, orderId: null, message: '' };
    clientRequestId = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

    if (!isSignedIn()) { navigate('/login/?next=/checkout/', true); return; }

    // The cart cannot be judged empty until the live uuids are known - see whenCatalogReady.
    whenCatalogReady().then(function(){
      // The shopper may have navigated away while that was in flight; finishing this
      // checkout would then overwrite whatever page they are now looking at.
      if (!currentRoute || currentRoute.name !== 'checkout') return null;
      if (!cartIds().length) { navigate('/cart/', true); return null; }
      return Promise.all([
        apiQuote(),
        apiAddresses().catch(function(){ return []; })
      ]);
    }).then(function(res){
      if (!res) return;
      checkoutState.quote = res[0];
      checkoutState.addresses = res[1] || [];
      var def = null;
      checkoutState.addresses.forEach(function(a){ if (!def || a.is_default) def = a; });
      checkoutState.addressId = def ? def.id : null;
      checkoutState.addingAddress = !checkoutState.addresses.length;
      checkoutState.status = 'ready';
      rerender();
    }).catch(function(e){
      if (e.status === 401 && handleAuthFailure()) { navigate('/login/?next=/checkout/', true); return; }
      checkoutState.status = 'error';
      checkoutState.error = e.message || 'Could not start checkout';
      rerender();
    });
  }

  /* Field names here are customer_addresses' own, not a shape of this page's invention -
     see pickAddressFields in orderRoutes.js. Getting them wrong does not error, it quietly
     posts nulls and renders a half-blank address, which is how a parcel goes missing. */
  function addressLine(a){
    return [a.house_flat, a.street_area, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ');
  }

  function addressForm(){
    return '<div class="addr-form">' +
      '<div class="field"><label for="naName">Full name</label><input id="naName" autocomplete="name" placeholder="Who is receiving this"></div>' +
      '<div class="field"><label for="naPhone">Phone</label><input id="naPhone" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile"></div>' +
      '<div class="field"><label for="naHouse">House / flat number</label><input id="naHouse" autocomplete="address-line1" placeholder="House or flat no."></div>' +
      '<div class="field"><label for="naStreet">Street / area</label><input id="naStreet" autocomplete="address-line2" placeholder="Street, locality"></div>' +
      '<div class="field"><label for="naLandmark">Landmark (optional)</label><input id="naLandmark" placeholder="Nearby landmark"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="naCity">City</label><input id="naCity" autocomplete="address-level2" placeholder="City"></div>' +
        '<div class="field"><label for="naPin">Pincode</label><input id="naPin" inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder="6 digits"></div>' +
      '</div>' +
      '<div class="field"><label for="naState">State</label><input id="naState" autocomplete="address-level1" placeholder="State"></div>' +
      '<div class="field"><label for="naLabel">Save as</label><select id="naLabel">' +
        '<option value="home">Home</option><option value="work">Work</option><option value="other">Other</option>' +
      '</select></div>' +
      '<button class="btn btn-line btn-full" type="button" id="saveAddr">Save this address</button>' +
    '</div>';
  }

  // Turn a list of item ids from the quote back into titles the shopper recognises.
  function blockedLineTitles(q, ids){
    if (!ids || !ids.length) return '';
    var byItem = {};
    (q.items || []).forEach(function(l){ byItem[l.itemId] = l.title; });
    return ids.map(function(id){ return byItem[id] || 'An item'; }).join(', ');
  }

  function pageCheckout(){
    if (checkoutState.view === 'placed') return pageOrderPlaced();
    if (checkoutState.view === 'unconfirmed') return pagePaymentUnconfirmed();

    if (checkoutState.status === 'loading' || checkoutState.status === 'idle') {
      return '<section class="section"><div class="wrap narrow">' +
        '<div class="auth-card"><h2>Checking prices and stock</h2>' +
        '<p class="lede">One moment - we are repricing your cart against the live catalogue.</p></div>' +
        '</div></section>';
    }
    if (checkoutState.status === 'error') {
      return '<section class="section"><div class="wrap narrow"><div class="auth-card">' +
        '<h2>Could not start checkout</h2>' +
        '<p class="lede">' + escapeHtml(checkoutState.error) + '</p>' +
        '<a class="btn btn-gold" href="/cart/" data-link>Back to cart</a></div></div></section>';
    }

    var q = checkoutState.quote || {};
    var blocked = (q.blockedTypes || []).length > 0;
    var oos = (q.outOfStock || []).length > 0;
    var canPay = q.canCheckout !== false && !blocked && !oos;

    var addrBlock = checkoutState.addresses.length
      ? '<div class="addr-list">' + checkoutState.addresses.map(function(a){
          return '<label class="addr-opt' + (a.id === checkoutState.addressId ? ' sel' : '') + '">' +
            '<input type="radio" name="ck-addr" value="' + escapeAttr(a.id) + '"' + (a.id === checkoutState.addressId ? ' checked' : '') + '>' +
            '<span><strong>' + escapeHtml(a.full_name || 'Address') + '</strong>' +
            (a.label ? '<span class="addr-tag">' + escapeHtml(a.label) + '</span>' : '') +
            '<span class="addr-text">' + escapeHtml(addressLine(a)) + '</span>' +
            (a.phone ? '<span class="addr-text">' + escapeHtml(a.phone) + '</span>' : '') + '</span></label>';
        }).join('') + '</div>' +
        (checkoutState.addingAddress
          ? addressForm()
          : '<button class="btn btn-line btn-sm" type="button" id="addAddrBtn">+ Add a new address</button>')
      : addressForm();

    return '<section class="section"><div class="wrap checkout-page">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Cart', href: '/cart/' }, { label: 'Checkout' }]) +
      sectionHead('', 'Checkout') +

      '<div class="checkout-layout">' +
        '<div class="checkout-main">' +
          '<div class="checkout-block">' +
            '<h3><span class="step-n">1</span> Delivery address</h3>' + addrBlock +
          '</div>' +
          '<div class="checkout-block">' +
            '<h3><span class="step-n">2</span> Payment</h3>' +
            '<div class="pay-opt sel"><strong>Pay online</strong>' +
              '<span>UPI, cards, netbanking and wallets, through Razorpay.</span></div>' +
            '<p class="sum-note">Cash on delivery is not available yet.</p>' +
          '</div>' +
        '</div>' +

        '<aside class="cart-summary">' +
          '<h3>Order summary</h3>' +
          (q.items || []).map(function(l){
            var line = Number(l.lineTotal != null ? l.lineTotal : (l.unitPrice * l.quantity)) || 0;
            return '<div class="sum-row"><span>' + escapeHtml(l.title) + ' &times;' + l.quantity + '</span>' +
              '<span class="price">' + rupees(line) + '</span></div>';
          }).join('') +
          '<div class="sum-row"><span>Delivery</span><span class="price">' + (q.deliveryFee ? rupees(q.deliveryFee) : 'Free') + '</span></div>' +
          (q.handlingFee ? '<div class="sum-row"><span>Handling</span><span class="price">' + rupees(q.handlingFee) + '</span></div>' : '') +
          '<div class="sum-row total"><span>To pay</span><span class="price">' + rupees(q.grandTotal) + '</span></div>' +
          /* Named, not just flagged. "Something in your cart" makes the shopper hunt
             through their own cart to work out what; the quote already tells us exactly
             which lines the server refused, so say so - and give them the way back, since
             the only place a line can be removed is the cart. */
          (blocked
            ? '<div class="checkout-note">We are not delivering ' +
                escapeHtml((q.blockedTypes || []).map(catLabel).join(' or ').toLowerCase() || 'some of these') +
                ' to your area yet. <a href="/cart/" data-link>Remove them in your cart</a> to continue.</div>'
            : '') +
          (oos
            ? '<div class="checkout-note">' +
                escapeHtml(blockedLineTitles(q, q.outOfStock) || 'Something in your cart') +
                ' just went out of stock. <a href="/cart/" data-link>Update your cart</a> to continue.</div>'
            : '') +
          (checkoutState.message ? '<div class="form-error">' + escapeHtml(checkoutState.message) + '</div>' : '') +
          '<button class="btn btn-gold btn-full" type="button" id="payBtn"' + (canPay && !checkoutState.busy ? '' : ' disabled') + '>' +
            (checkoutState.busy ? 'Starting payment...' : 'Pay ' + rupees(q.grandTotal)) + '</button>' +
          '<p class="sum-note">You are charged by Razorpay. Astrowani never sees your card details.</p>' +
        '</aside>' +
      '</div>' +
    '</div></section>';
  }

  function pageOrderPlaced(){
    var id = checkoutState.orderId;
    return '<section class="section"><div class="wrap narrow"><div class="confirm auth-card">' +
      '<div class="tick">&#10003;</div>' +
      '<h2>Order placed</h2>' +
      (id ? '<div class="ordno price">#' + escapeHtml(String(id).slice(0, 8).toUpperCase()) + '</div>' : '') +
      '<p class="lede">Payment confirmed. We will pack it and send you the tracking details.</p>' +
      '<a class="btn btn-gold" href="/orders/" data-link>Track this order</a>' +
      '<a class="btn btn-line" href="/gemstones/" data-link>Keep browsing</a>' +
    '</div></div></section>';
  }

  // Money may well have left the customer's account by this point, so this must never say
  // the order failed. It states only what is known, and tells them not to pay twice.
  function pagePaymentUnconfirmed(){
    return '<section class="section"><div class="wrap narrow"><div class="auth-card">' +
      '<h2>We could not confirm your payment</h2>' +
      '<p class="lede">If money left your account it is safe and the order will be completed. <strong>Please do not pay again.</strong></p>' +
      (checkoutState.message ? '<p class="sum-note">' + escapeHtml(checkoutState.message) + '</p>' : '') +
      '<a class="btn btn-gold" href="/orders/" data-link>Check my orders</a>' +
    '</div></div></section>';
  }

  /* ---------------- orders ---------------- */
  var ordersState = { status: 'idle', data: [], error: '', busyId: null };

  function enterOrders(){
    if (!isSignedIn()) { navigate('/login/?next=/orders/', true); return; }
    ordersState = { status: 'loading', data: [], error: '', busyId: null };
    apiMyOrders().then(function(rows){
      ordersState.status = 'ready';
      ordersState.data = rows;
      rerender();
    }).catch(function(e){
      if (e.status === 401 && handleAuthFailure()) { navigate('/login/?next=/orders/', true); return; }
      ordersState.status = 'error';
      ordersState.error = e.message || 'Could not load your orders';
      rerender();
    });
  }

  var ORDER_STEPS = [
    { key: 'placed', label: 'Placed' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'packed', label: 'Packed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'out_for_delivery', label: 'Out for delivery' },
    { key: 'delivered', label: 'Delivered' }
  ];

  function orderTimeline(order){
    if (order.status === 'cancelled') {
      return '<div class="track cancelled"><span class="track-dot done"></span>' +
        '<span>Cancelled' + (order.payment_status === 'refunded' ? ' &middot; refunded' : '') + '</span></div>';
    }
    var reached = ORDER_STEPS.findIndex(function(s){ return s.key === (order.status === 'completed' ? 'delivered' : order.status); });
    if (reached < 0) reached = 0;
    return '<ol class="track">' + ORDER_STEPS.map(function(s, i){
      return '<li class="track-step' + (i <= reached ? ' done' : '') + '">' +
        '<span class="track-dot' + (i <= reached ? ' done' : '') + '"></span>' +
        '<span class="track-label">' + s.label + '</span></li>';
    }).join('') + '</ol>';
  }

  function orderCard(o){
    var items = o.items || [];
    var when = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    var cancellable = ['placed', 'confirmed'].indexOf(o.status) !== -1;
    return '<article class="order-card">' +
      '<header class="order-head">' +
        '<div><span class="order-no price">#' + escapeHtml(String(o.id).slice(0, 8).toUpperCase()) + '</span>' +
        '<span class="order-when">' + escapeHtml(when) + '</span></div>' +
        '<span class="order-status s-' + escapeAttr(o.status) + '">' + escapeHtml(String(o.status).replace(/_/g, ' ')) + '</span>' +
      '</header>' +
      '<div class="order-items">' + items.map(function(l){
        return '<div class="order-item"><span>' + escapeHtml(l.title || l.item_title || 'Item') + ' &times;' + (l.quantity || 1) + '</span>' +
          '<span class="price">' + rupees(l.line_total != null ? l.line_total : (l.unit_price || 0) * (l.quantity || 1)) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="order-bill">' +
        (o.delivery_fee ? '<div class="sum-row"><span>Delivery</span><span class="price">' + rupees(o.delivery_fee) + '</span></div>' : '') +
        (o.handling_fee ? '<div class="sum-row"><span>Handling</span><span class="price">' + rupees(o.handling_fee) + '</span></div>' : '') +
        '<div class="sum-row total"><span>Total paid</span><span class="price">' + rupees(o.grand_total != null ? o.grand_total : o.total) + '</span></div>' +
      '</div>' +
      orderTimeline(o) +
      (cancellable
        ? '<button class="btn btn-line btn-sm" type="button" data-cancel="' + escapeAttr(o.id) + '"' + (ordersState.busyId === o.id ? ' disabled' : '') + '>' +
          (ordersState.busyId === o.id ? 'Cancelling...' : 'Cancel order') + '</button>'
        : '') +
    '</article>';
  }

  function pageOrders(){
    if (ordersState.status === 'loading' || ordersState.status === 'idle') {
      return '<section class="section"><div class="wrap"><h2>Your orders</h2><p class="lede">Loading...</p></div></section>';
    }
    if (ordersState.status === 'error') {
      return '<section class="section"><div class="wrap"><div class="empty-state">' +
        '<h2>Could not load your orders</h2><p class="lede">' + escapeHtml(ordersState.error) + '</p>' +
        '<button class="btn btn-gold" type="button" id="ordersRetry">Try again</button></div></div></section>';
    }
    if (!ordersState.data.length) {
      return '<section class="section"><div class="wrap"><div class="empty-state">' +
        '<h2>No orders yet</h2><p class="lede">When you order something it will show up here, with tracking.</p>' +
        '<a class="btn btn-gold" href="/gemstones/" data-link>Browse gemstones</a></div></div></section>';
    }
    return '<section class="section"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'My orders' }]) +
      sectionHead('', 'Your orders') +
      '<div class="order-list">' + ordersState.data.map(orderCard).join('') + '</div>' +
    '</div></section>';
  }

  /* ---------------- account ---------------- */
  var accountState = { status: 'idle', addresses: [], error: '' };

  function enterAccount(){
    if (!isSignedIn()) { navigate('/login/?next=/account/', true); return; }
    accountState = { status: 'loading', addresses: [], error: '' };
    apiAddresses().then(function(rows){
      accountState.status = 'ready'; accountState.addresses = rows; rerender();
    }).catch(function(e){
      if (e.status === 401 && handleAuthFailure()) { navigate('/login/?next=/account/', true); return; }
      accountState.status = 'error'; accountState.error = e.message || 'Could not load your account'; rerender();
    });
  }

  function pageAccount(){
    var who = (session.profile && session.profile.phone) ? '+91 ' + session.profile.phone : 'Signed in';
    return '<section class="section"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Account' }]) +
      sectionHead('', 'Your account') +
      '<div class="acct-grid">' +
        '<div class="acct-card">' +
          '<h3>Signed in as</h3><p class="acct-who">' + escapeHtml(who) + '</p>' +
          '<a class="btn btn-line btn-sm" href="/orders/" data-link>My orders</a>' +
          (session.fromApp
            ? '<p class="sum-note">Signed in through the Astrowani app.</p>'
            : '<button class="btn btn-line btn-sm" type="button" id="signOutBtn">Sign out</button>') +
        '</div>' +
        '<div class="acct-card">' +
          '<h3>Saved addresses</h3>' +
          (accountState.status !== 'ready'
            ? '<p class="lede">' + (accountState.status === 'error' ? escapeHtml(accountState.error) : 'Loading...') + '</p>'
            : (accountState.addresses.length
                ? '<div class="addr-list">' + accountState.addresses.map(function(a){
                    return '<div class="addr-opt"><span><strong>' + escapeHtml(a.full_name || 'Address') + '</strong>' +
                      '<span class="addr-text">' + escapeHtml(addressLine(a)) + '</span></span>' +
                      '<button class="cl-remove" type="button" data-addrdel="' + escapeAttr(a.id) + '">Remove</button></div>';
                  }).join('') + '</div>'
                : '<p class="lede">No saved addresses yet. You can add one at checkout.</p>')) +
        '</div>' +
        '<div class="acct-card">' +
          '<h3>Saved items</h3>' +
          (wishlist.length
            ? '<div class="wish-list">' + wishlist.map(function(id){
                var p = byId[id];
                if (!p) return '';
                return '<a class="wish-row" href="/gemstones/' + escapeAttr(p.slug) + '/" data-link>' +
                  productPhotoImg(p, 'front') + '<span>' + escapeHtml(p.name) + '</span>' +
                  '<span class="price">' + rupees(p.price) + '</span></a>';
              }).join('') + '</div>'
            : '<p class="lede">Nothing saved yet. Tap the heart on any stone.</p>') +
        '</div>' +
      '</div>' +
    '</div></section>';
  }


  /* ================= PAGES: CALCULATORS + EDITORIAL =================
     The footer used to link four policies to href="#" with onclick="return false" - a
     link that visibly does nothing. These are those pages, written out properly, because
     a store taking money online is expected to state its shipping, returns and privacy
     terms somewhere a customer can actually reach. */

  function pageCalculators(){
    return '<section class="section calc-section"><div class="wrap">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: 'Calculators' }]) +
      sectionHead('Numerology', 'Know your number before you buy',
        'Two quick calculations from your date of birth, and the stone each number traditionally pairs with.') +
      '<div class="calc-grid">' +
        '<div class="calc-card">' +
          '<h3>Moolank &amp; Bhagyank</h3>' +
          '<p class="lede">Your root number and your destiny number, from your full date of birth.</p>' +
          '<div class="field"><label for="dobInput">Date of birth</label><input type="date" id="dobInput"></div>' +
          '<button class="btn btn-line btn-full" type="button" id="calcMoolankBtn">Calculate</button>' +
          '<div class="calc-result" id="moolankResult"></div>' +
        '</div>' +
        '<div class="calc-card">' +
          '<h3>Gemstone finder</h3>' +
          '<p class="lede">Already know your Moolank? Find the stone it answers to.</p>' +
          '<div class="field"><label for="moolankSelect">Your Moolank</label>' +
            '<select id="moolankSelect"><option value="">Choose a number</option>' +
            [1,2,3,4,5,6,7,8,9].map(function(n){ return '<option value="' + n + '">' + n + '</option>'; }).join('') +
            '</select></div>' +
          '<button class="btn btn-line btn-full" type="button" id="calcGemBtn">Find my stone</button>' +
          '<div class="calc-result" id="gemResult"></div>' +
        '</div>' +
      '</div>' +
    '</div></section>';
  }

  function editorial(title, crumbLabel, blocks){
    return '<section class="section"><div class="wrap narrow-read">' +
      breadcrumb([{ label: 'Store', href: '/' }, { label: crumbLabel || title }]) +
      '<h1 class="doc-title">' + escapeHtml(title) + '</h1>' +
      blocks +
    '</div></section>';
  }

  function pageAbout(){
    return editorial('About Wani Shop', 'About',
      '<p class="lede">Wani Shop is the retail side of Astrowani - the same astrologers, the same reasoning, applied to the objects people are told to wear or perform.</p>' +
      '<div class="about-band">' +
        '<div class="editorial-media"><img src="' + escapeAttr(LIFESTYLE.boxes) + '" alt="A blue sapphire and an emerald resting in open wooden presentation boxes." loading="lazy"></div>' +
        '<div><h2>Every stone is certified before it is listed</h2>' +
        '<p>A gemstone sold as a remedy is worn every day for years, so it has to be what it says it is. Each stone we list is checked against an independent laboratory report, and that report ships in the box with it. If the certificate and the stone ever disagree, the stone does not go out.</p></div>' +
      '</div>' +
      '<div class="about-band reverse">' +
        '<div class="editorial-media"><img src="' + escapeAttr(LIFESTYLE.tray) + '" alt="A tray of loose emeralds, sapphires, citrine and rubies beside a loupe and a certificate booklet." loading="lazy"></div>' +
        '<div><h2>Chosen against a chart, not upsold</h2>' +
        '<p>Our astrologers recommend against a birth chart, and the honest recommendation is often the cheaper stone, or none at all. If you are not sure what you need, talk to an astrologer in the Astrowani app before buying anything here.</p></div>' +
      '</div>' +
      '<h2>Pujas</h2>' +
      '<p>Our pandits perform the full vidhi for each of the sixty-four pujas, paths and sanskars listed here. Sankalp is taken in your name and gotra, and you receive photographs or video of the puja along with prasad details.</p>' +
      '<h2>Where we are</h2>' +
      '<p>Stones are graded, set and dispatched from our Delhi workshop.</p>');
  }

  function pageContact(){
    return editorial('Contact us', 'Contact',
      '<p class="lede">A real person answers all three of these.</p>' +
      '<div class="contact-grid">' +
        '<div class="acct-card"><h3>WhatsApp</h3><p>Fastest for anything about an order or a puja.</p>' +
          '<a class="btn btn-gold btn-sm" href="https://wa.me/' + PUJA_WHATSAPP + '" target="_blank" rel="noopener">Message us</a></div>' +
        '<div class="acct-card"><h3>Email</h3><p>For certificates, returns and invoices.</p>' +
          '<a class="btn btn-line btn-sm" href="mailto:' + ENQUIRY_EMAIL + '">' + ENQUIRY_EMAIL + '</a></div>' +
        '<div class="acct-card"><h3>In the app</h3><p>Talk to an astrologer before you buy.</p>' +
          '<a class="btn btn-line btn-sm" href="' + PLAY_STORE_URL + '" target="_blank" rel="noopener">Get the app</a></div>' +
      '</div>' +
      '<h2>Order support</h2>' +
      '<p>Have your order number ready - it is on the order in <a href="/orders/" data-link>My orders</a>. We reply to order questions the same working day.</p>');
  }

  function pageShipping(){
    return editorial('Shipping & delivery', 'Shipping',
      '<p class="lede">Everything is sent tracked, insured and signed for.</p>' +
      '<h2>Dispatch</h2>' +
      '<p>Orders placed before 4pm on a working day are dispatched the same day. Anything after that, or at a weekend, goes out on the next working day.</p>' +
      '<h2>Delivery time</h2>' +
      '<p>Metro cities: 2 to 4 working days. Everywhere else in India: 4 to 7 working days. Remote pincodes can take a little longer, and we will tell you if yours is one of them.</p>' +
      '<h2>Delivery charges</h2>' +
      '<p>Delivery is charged at checkout and shown before you pay, never added afterwards. ' +
        (storeConfig.freeDeliveryAbove
          ? 'Delivery is free on orders above ' + rupees(storeConfig.freeDeliveryAbove) + '.'
          : 'Free delivery thresholds are shown in your cart.') + '</p>' +
      '<h2>Tracking</h2>' +
      '<p>You can follow an order at any time under <a href="/orders/" data-link>My orders</a>. Tracking details are also sent to you as the order moves.</p>' +
      '<h2>Pujas</h2>' +
      '<p>A puja is a service, not a shipment. The address you give at checkout is where the puja will be performed, and our pandit calls you to fix the muhurat.</p>');
  }

  function pageReturns(){
    return editorial('Returns & refunds', 'Returns',
      '<p class="lede">Seven days, on an unworn stone in its sealed packet.</p>' +
      '<h2>What can be returned</h2>' +
      '<p>Any gemstone, unworn and still in its sealed packet with its certificate, within 7 days of delivery. A stone that has been set, resized, drilled or worn cannot be returned, because it can no longer be sold as new.</p>' +
      '<h2>If the stone does not match its certificate</h2>' +
      '<p>Send it back at our cost and we refund in full, whatever the date. This is the one case where nothing else applies.</p>' +
      '<h2>How to start a return</h2>' +
      '<p>Message us on WhatsApp or email <a href="mailto:' + ENQUIRY_EMAIL + '">' + ENQUIRY_EMAIL + '</a> with your order number.</p>' +
      '<h2>Refunds</h2>' +
      '<p>Refunds go back to the method you paid with. Card and UPI refunds usually take 5 to 7 working days to appear, which is the bank\'s timeline rather than ours.</p>' +
      '<h2>Cancelling</h2>' +
      '<p>An order can be cancelled from <a href="/orders/" data-link>My orders</a> right up until it is packed, and is refunded automatically.</p>' +
      '<h2>Pujas</h2>' +
      '<p>A puja can be cancelled or rescheduled up to 24 hours before the fixed muhurat. Once the pandit has begun, the dakshina is not refundable.</p>');
  }

  function pageCertification(){
    return editorial('Certification & sourcing', 'Certification',
      '<p class="lede">What the certificate in your box actually means.</p>' +
      '<h2>Independent laboratories</h2>' +
      '<p>Stones are graded by an independent gemmological laboratory, not by us. The report names the species, the variety, the weight, the measurements, the cut, and - critically - whether the stone has been treated.</p>' +
      '<h2>Treatment is stated, never hidden</h2>' +
      '<p>Most coloured stones on the market are treated in some way. That is not automatically a problem; hiding it is. Where a stone is treated, the report says so and so does the listing.</p>' +
      '<h2>Weight and ratti</h2>' +
      '<p>Indian astrology usually prescribes weight in ratti; laboratories report in carats. Where a listing gives a ratti figure it is a conversion of the certified carat weight, and the certificate is the authority.</p>' +
      '<h2>Sourcing</h2>' +
      '<p>Ceylon sapphires come through Sri Lankan dealers we have bought from for years; emeralds through Jaipur. We do not buy parcels we cannot trace.</p>');
  }

  function pagePrivacy(){
    return editorial('Privacy policy', 'Privacy',
      '<p class="lede">What we collect when you buy something here, and what we do with it.</p>' +
      '<h2>What we collect</h2>' +
      '<p>Your mobile number, which is how you sign in; your name and delivery address, which is how the order reaches you; and your order history. If you use the calculators, the date of birth you enter is used in your browser to compute the result and is not sent to us.</p>' +
      '<h2>Payments</h2>' +
      '<p>Payments are processed by Razorpay. Your card, UPI or netbanking details are entered on Razorpay and are never seen by, sent to, or stored by Astrowani. We keep only the payment reference Razorpay returns.</p>' +
      '<h2>What we do not do</h2>' +
      '<p>We do not sell your data, and we do not share it with anyone beyond what an order requires - the courier needs your address, and the payment provider needs to confirm a payment.</p>' +
      '<h2>Your account</h2>' +
      '<p>This is the same Astrowani account the app uses. To have it deleted, email <a href="mailto:' + ENQUIRY_EMAIL + '">' + ENQUIRY_EMAIL + '</a> from the number on the account and we will remove it along with its order history, except records we are required to keep for tax.</p>' +
      '<h2>On this device</h2>' +
      '<p>Your cart, your saved items and your sign-in are stored in your own browser. Clearing your browser data clears them.</p>');
  }

  function pageTerms(){
    return editorial('Terms of sale', 'Terms',
      '<p class="lede">The short version: we sell certified stones and pandit-performed pujas, and we say what they are.</p>' +
      '<h2>Prices</h2>' +
      '<p>Prices are in Indian rupees and include applicable taxes. The total you are shown on the checkout page, immediately before you pay, is the total you are charged - it is calculated on our server at that moment, not in your browser.</p>' +
      '<h2>Orders</h2>' +
      '<p>An order exists once payment is confirmed by Razorpay. If a payment succeeds but we cannot confirm it, the order is still honoured - do not pay a second time; contact us.</p>' +
      '<h2>Availability</h2>' +
      '<p>Stones are individual pieces. If something sells out between your adding it and paying, we will tell you at checkout rather than after taking your money.</p>' +
      '<h2>What a remedy is</h2>' +
      '<p>Gemstones and pujas are offered within the Vedic astrological tradition. They are not medicine, and nothing here is a substitute for medical, legal or financial advice.</p>' +
      '<h2>Pujas</h2>' +
      '<p>The dakshina shown is for the puja as described. If your requirements change what is needed, our pandit tells you before anything further is charged.</p>' +
      '<h2>Governing law</h2>' +
      '<p>These terms are governed by the laws of India, and disputes fall to the courts of Delhi.</p>');
  }

  function pageFaq(){
    var QA = [
      ['How do I know the stone is real?', 'Every stone ships with an independent laboratory report that names its species, weight and any treatment. If the stone and the report disagree, send it back at our cost for a full refund.'],
      ['Which stone should I wear?', 'That depends on your chart, and the honest answer is sometimes none. Talk to an astrologer in the Astrowani app before buying - it costs less than the wrong stone.'],
      ['What does ratti mean?', 'A traditional Indian unit of weight. Laboratories certify in carats, so any ratti figure on a listing is a conversion of the certified carat weight.'],
      ['How long does delivery take?', 'Two to four working days to metro cities, four to seven elsewhere in India. Everything is tracked and insured.'],
      ['Can I pay cash on delivery?', 'Not yet. Payment is online through Razorpay - UPI, cards, netbanking or wallets.'],
      ['Can I cancel?', 'Yes, from My orders, right up until the order is packed. The refund is automatic.'],
      ['How does a puja booking work?', 'You book and pay, then our pandit calls you to fix the muhurat and confirm the samagri. The address you give is where the puja will be performed.'],
      ['I paid but I do not see my order.', 'Do not pay again. Check My orders first, and if it is still missing, message us with the time of payment and we will find it.']
    ];
    return editorial('Frequently asked questions', 'FAQ',
      '<div class="faq-list">' + QA.map(function(qa){
        return '<details class="faq-item"><summary>' + escapeHtml(qa[0]) + '</summary><p>' + escapeHtml(qa[1]) + '</p></details>';
      }).join('') + '</div>');
  }

  function page404(msg){
    return '<section class="section"><div class="wrap"><div class="empty-state">' +
      '<h2>Page not found</h2>' +
      '<p class="lede">' + escapeHtml(msg || 'That page does not exist, or it has moved.') + '</p>' +
      '<a class="btn btn-gold" href="/" data-link>Back to the store</a>' +
      '<a class="btn btn-line" href="/gemstones/" data-link>Browse gemstones</a>' +
    '</div></div></section>';
  }


  /* ================= ROUTER =================
     Real paths, real history entries. pushState for a navigation the shopper made,
     replaceState for a redirect they did not (a guard sending them to /login/), so Back
     never bounces them between a guarded page and the guard.

     Every path that is not a real file on disk arrives here because nginx ends its
     location / block with `try_files $uri $uri/ /index.html`. That is also why the shell
     must be able to render EVERY route: the document the browser got for
     /gemstones/ruby-manik/ is byte-identical to the one it gets for /. */

  var view = null;               // #view, resolved at boot
  var currentRoute = null;
  var scrollPositions = {};

  function parseRoute(pathname, search){
    var params = {};
    try {
      new URLSearchParams(search || '').forEach(function(v, k){ params[k] = v; });
    } catch (e) { /* older webview: query params simply stay empty */ }

    var segs = String(pathname || '/').split('/').filter(Boolean).map(function(s){
      try { return decodeURIComponent(s); } catch (e){ return s; }
    });
    var p = params.page ? parseInt(params.page, 10) : 1;

    if (!segs.length) return { name: 'home', params: params };

    if (segs[0] === 'gemstones') {
      if (segs.length === 1) return { name: 'gemstones', page: p || 1, params: params };
      if (segs[1] === 'page') return { name: 'gemstones', page: parseInt(segs[2], 10) || 1, params: params };
      return { name: 'product', slug: segs[1], params: params };
    }
    if (segs[0] === 'pujas') {
      if (segs.length === 1) return { name: 'pujas', page: p || 1, params: params };
      if (segs[1] === 'page') return { name: 'pujas', page: parseInt(segs[2], 10) || 1, params: params };
      return { name: 'puja', slug: segs[1], params: params };
    }
    if (segs[0] === 'purpose' && segs[1]) return { name: 'purpose', id: segs[1], params: params };

    var simple = ['cart', 'checkout', 'orders', 'account', 'login', 'calculators',
                  'about', 'contact', 'shipping', 'returns', 'certification', 'privacy', 'terms', 'faq'];
    if (segs.length === 1 && simple.indexOf(segs[0]) !== -1) return { name: segs[0], params: params };

    return { name: '404', params: params };
  }

  var TITLES = {
    home: 'Wani Shop',
    gemstones: 'Certified gemstones',
    pujas: 'Book a puja',
    cart: 'Your cart',
    checkout: 'Checkout',
    orders: 'My orders',
    account: 'Your account',
    login: 'Sign in',
    calculators: 'Moolank & gemstone calculators',
    about: 'About us',
    contact: 'Contact us',
    shipping: 'Shipping & delivery',
    returns: 'Returns & refunds',
    certification: 'Certification & sourcing',
    privacy: 'Privacy policy',
    terms: 'Terms of sale',
    faq: 'FAQ',
    '404': 'Page not found'
  };

  function routeTitle(r){
    if (r.name === 'product') { var p = productBySlug(r.slug); return (p ? p.name : 'Gemstone') + ' — Wani Shop'; }
    if (r.name === 'puja') { var pj = pujaBySlug(r.slug); return (pj ? pj.name : 'Puja') + ' — Wani Shop'; }
    if (r.name === 'purpose') { var pu = PURPOSES.find(function(x){ return x.id === r.id; }); return (pu ? pu.label : 'Purpose') + ' — Wani Shop'; }
    if (r.name === 'home') return TITLES.home;
    return (TITLES[r.name] || 'Wani Shop') + ' — Wani Shop';
  }

  function renderRoute(r){
    switch (r.name) {
      case 'home': return pageHome();
      case 'gemstones': return pageGemstones(r.page);
      case 'product': return pageProduct(r.slug);
      case 'pujas': return pagePujas(r.page);
      case 'puja': return pagePuja(r.slug);
      case 'purpose': return pagePurpose(r.id);
      case 'cart': return pageCart();
      case 'checkout': return pageCheckout();
      case 'orders': return pageOrders();
      case 'account': return pageAccount();
      case 'login': return pageLogin();
      case 'calculators': return pageCalculators();
      case 'about': return pageAbout();
      case 'contact': return pageContact();
      case 'shipping': return pageShipping();
      case 'returns': return pageReturns();
      case 'certification': return pageCertification();
      case 'privacy': return pagePrivacy();
      case 'terms': return pageTerms();
      case 'faq': return pageFaq();
      default: return page404();
    }
  }

  // Enter hooks fire ONCE per navigation. rerender() deliberately does not call them, so
  // a cart tick or an arriving quote re-paints without re-firing the fetch that produced it.
  function enterRoute(r){
    if (r.name === 'checkout') enterCheckout();
    else if (r.name === 'orders') enterOrders();
    else if (r.name === 'account') enterAccount();
    else if (r.name === 'login') enterLogin(r.params);
  }

  /* Re-paint the current route in place. Used by everything that changes state the page
     is reading: a cart change, the live catalogue landing, a quote resolving. */
  function rerender(){
    if (!currentRoute || !view) return;
    var y = window.scrollY;
    paint();
    // A re-render is not a navigation, so the reader must not be moved. Restoring the
    // exact offset is what makes tapping + on the twelfth card feel like a tick rather
    // than a page reload.
    window.scrollTo(0, y);
  }

  function paint(){
    view.innerHTML = renderRoute(currentRoute);
    document.title = routeTitle(currentRoute);
    markReveals(view);
    renderCartBadge();
    renderCartBar();
    syncNav();
  }

  function syncNav(){
    var name = currentRoute && currentRoute.name;
    Array.prototype.forEach.call(document.querySelectorAll('nav.main a[href]'), function(a){
      var href = a.getAttribute('href');
      var on = (href === '/gemstones/' && (name === 'gemstones' || name === 'product' || name === 'purpose')) ||
               (href === '/pujas/' && (name === 'pujas' || name === 'puja')) ||
               (href === '/' && name === 'home') ||
               (href !== '/' && href === '/' + name + '/');
      a.classList.toggle('on', !!on);
    });
    var acct = document.getElementById('acctBtn');
    if (acct) acct.setAttribute('title', isSignedIn() ? 'Your account' : 'Sign in');
  }

  function markReveals(root){
    var groups = ['.section-head', '.card', '.gate-tile', '.purpose-tile', '.testi-card',
                  '.about-band > *', '.acct-card', '.order-card', '.calc-card', '.pdp-info > *', '.pdp-media'];
    groups.forEach(function(sel){
      var nodes = root.querySelectorAll(sel);
      Array.prototype.forEach.call(nodes, function(el, i){
        if (el.hasAttribute('data-reveal')) return;
        el.setAttribute('data-reveal', '');
        el.setAttribute('data-reveal-delay', String(Math.min(i, 8) * 45));
      });
    });
    observeNew(root.querySelectorAll('[data-reveal]'));
    // Belt and braces: the IntersectionObserver has been seen not delivering inside the
    // in-app webview, and a stranded opacity:0 section reads as a blank page. Content
    // being visible is not negotiable; the entrance animation is.
    queueSweep();
    setTimeout(function(){ sweepVisible(true); }, 2500);
  }

  function navigate(href, replace){
    var url;
    try { url = new URL(href, window.location.origin); } catch (e) { window.location.href = href; return; }
    if (url.origin !== window.location.origin) { window.location.href = href; return; }

    var samePath = url.pathname === window.location.pathname && url.search === window.location.search;
    if (!replace && !samePath) scrollPositions[window.location.pathname + window.location.search] = window.scrollY;

    if (replace) history.replaceState({}, '', url.pathname + url.search);
    else history.pushState({}, '', url.pathname + url.search);

    go(url.pathname, url.search, !samePath);
  }

  function go(pathname, search, resetScroll){
    var r = parseRoute(pathname, search);
    currentRoute = r;
    enterRoute(r);
    // An enter hook is allowed to redirect - /checkout/ sends a signed-out shopper to
    // /login/. When it does it calls navigate(), which re-enters go() and replaces
    // currentRoute; painting here would then render the page we just decided to leave.
    if (currentRoute !== r) return;
    paint();
    if (resetScroll !== false) {
      var saved = scrollPositions[pathname + (search || '')];
      window.scrollTo(0, saved || 0);
    }
  }

  window.addEventListener('popstate', function(){
    go(window.location.pathname, window.location.search, true);
  });

  /* ================= DELEGATION =================
     One click listener on the document, for every page. Nothing rendered above ever binds
     its own handler, which is why re-rendering a 64-card grid on each keystroke costs a
     single innerHTML assignment and no listener churn. */
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;

    var link = t.closest('a[data-link]');
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
      return;
    }

    var add = t.closest('[data-add]');
    if (add) { addToCart(add.getAttribute('data-add'), 1); return; }

    var inc = t.closest('[data-inc]');
    if (inc) { var iid = inc.getAttribute('data-inc'); setQty(iid, cartQty(iid) + 1); return; }

    var dec = t.closest('[data-dec]');
    if (dec) { var did = dec.getAttribute('data-dec'); setQty(did, cartQty(did) - 1); return; }

    var rm = t.closest('[data-rm]');
    if (rm) { setQty(rm.getAttribute('data-rm'), 0); return; }

    var why = t.closest('[data-why]');
    if (why) { showToast(why.getAttribute('data-why')); return; }

    var wish = t.closest('[data-wish]');
    if (wish) {
      var on = toggleWishlist(wish.getAttribute('data-wish'));
      showToast(on ? 'Saved to your list' : 'Removed from your list');
      rerender();
      return;
    }

    var buy = t.closest('[data-buy]');
    if (buy) {
      var bid = buy.getAttribute('data-buy');
      if (!cartQty(bid)) addToCart(bid, 1);
      if (cartQty(bid)) navigate('/cart/');
      return;
    }

    var variant = t.closest('[data-variant]');
    if (variant) {
      var vp = byId[variant.getAttribute('data-for')];
      if (vp) {
        var main = document.getElementById('pdpMain');
        if (main) main.innerHTML = productPhotoImg(vp, variant.getAttribute('data-variant'), 'pdp-img');
        Array.prototype.forEach.call(view.querySelectorAll('.pdp-thumb'), function(x){ x.classList.remove('sel'); });
        variant.classList.add('sel');
      }
      return;
    }

    var purpose = t.closest('[data-purpose]');
    if (purpose) { shopState.purpose = purpose.getAttribute('data-purpose'); navigate('/gemstones/'); return; }

    var price = t.closest('[data-price]');
    if (price) { shopState.price = price.getAttribute('data-price'); navigate('/gemstones/'); return; }

    var pjcat = t.closest('[data-pjcat]');
    if (pjcat) {
      var cid = pjcat.getAttribute('data-pjcat');
      pujaState.cat = (pujaState.cat === cid) ? 'all' : cid;
      navigate('/pujas/');
      return;
    }

    var pjband = t.closest('[data-pjband]');
    if (pjband) { pujaState.band = pjband.getAttribute('data-pjband'); navigate('/pujas/'); return; }

    var pjbook = t.closest('[data-pjbook]');
    if (pjbook) { openPujaWhatsApp(pjbook.getAttribute('data-pjbook')); return; }

    var cancel = t.closest('[data-cancel]');
    if (cancel) { cancelOrder(cancel.getAttribute('data-cancel')); return; }

    var addrDel = t.closest('[data-addrdel]');
    if (addrDel) { removeAddress(addrDel.getAttribute('data-addrdel')); return; }

    if (t.closest('#goCheckout')) {
      if (!isSignedIn()) navigate('/login/?next=/checkout/');
      else navigate('/checkout/');
      return;
    }
    if (t.closest('#addAddrBtn')) { checkoutState.addingAddress = true; rerender(); return; }
    if (t.closest('#saveAddr')) { saveNewAddress(); return; }
    if (t.closest('#payBtn')) { payNow(); return; }
    if (t.closest('#loginSend')) { sendOtp(); return; }
    if (t.closest('#loginVerify')) { verifyOtp(); return; }
    if (t.closest('#loginResend')) { sendOtp(true); return; }
    if (t.closest('#loginChange')) { loginState.step = 'phone'; loginState.error = ''; rerender(); return; }
    if (t.closest('#ordersRetry')) { enterOrders(); return; }
    if (t.closest('#signOutBtn')) { signOut(); showToast('Signed out'); navigate('/'); return; }
    if (t.closest('#pdpPinCheck')) { checkPincode(); return; }
    if (t.closest('#calcMoolankBtn')) { calcMoolank(); return; }
    if (t.closest('#calcGemBtn')) { calcGem(); return; }
    if (t.closest('#newsletterBtn')) { joinNewsletter(); return; }
    if (t.closest('#cartBtn')) { navigate('/cart/'); return; }
    if (t.closest('#acctBtn')) { navigate(isSignedIn() ? '/account/' : '/login/?next=/account/'); return; }
  });

  // Search boxes re-filter as you type. The re-render is a single innerHTML write, so the
  // caret has to be put back by hand - without this the box loses focus on every letter.
  document.addEventListener('input', function(e){
    var el = e.target;
    if (!el || !el.id) return;
    if (el.id === 'shopSearch') { shopState.q = el.value; rerenderKeepingFocus('shopSearch'); }
    else if (el.id === 'pjSearch') { pujaState.q = el.value; rerenderKeepingFocus('pjSearch'); }
  });

  document.addEventListener('change', function(e){
    var el = e.target;
    if (!el || !el.id) return;
    if (el.id === 'shopSort') { shopState.sort = el.value; rerender(); }
    else if (el.id === 'pjSort') { pujaState.sort = el.value; rerender(); }
    else if (el.name === 'ck-addr') { checkoutState.addressId = el.value; rerender(); }
  });

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var el = e.target;
    if (!el || !el.id) return;
    if (el.id === 'loginPhone') { e.preventDefault(); sendOtp(); }
    else if (el.id === 'loginOtp') { e.preventDefault(); verifyOtp(); }
    else if (el.id === 'pdpPin') { e.preventDefault(); checkPincode(); }
  });

  function rerenderKeepingFocus(id){
    var before = document.getElementById(id);
    var pos = before ? before.selectionStart : null;
    rerender();
    var after = document.getElementById(id);
    if (!after) return;
    after.focus();
    try { if (pos != null) after.setSelectionRange(pos, pos); } catch (e) { /* type=search on some engines */ }
  }

  // Called by every cart mutation. Re-paints the page, the header badge and the sticky bar
  // together, so the three can never disagree about what is in the cart.
  function onCartChanged(){
    renderCartBadge();
    renderCartBar();
    rerender();
  }


  /* ================= ACTIONS ================= */

  var ENQUIRY_EMAIL = 'support@astrowani.com';
  var PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.astrowanicustomer';

  /* ---- login ---- */
  function sendOtp(isResend){
    var el = document.getElementById('loginPhone');
    var phone = (el ? el.value : loginState.phone).replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      loginState.error = 'Enter a valid 10-digit Indian mobile number.';
      loginState.phone = phone;
      rerender();
      return;
    }
    loginState.phone = phone;
    loginState.busy = true;
    loginState.error = '';
    rerender();

    apiRequestOtp(phone).then(function(){
      loginState.busy = false;
      loginState.step = 'otp';
      rerender();
      showToast(isResend ? 'New code sent' : 'OTP sent');
    }).catch(function(e){
      loginState.busy = false;
      // The backend throttles OTPs per number and returns a plain message; showing it
      // verbatim is more useful than "something went wrong" when the answer is "wait 60s".
      loginState.error = e.message || 'Could not send the OTP. Please try again.';
      rerender();
    });
  }

  function verifyOtp(){
    var el = document.getElementById('loginOtp');
    var otp = (el ? el.value : '').replace(/\D/g, '');
    if (otp.length < 4) { loginState.error = 'Enter the code we sent you.'; rerender(); return; }
    loginState.busy = true;
    loginState.error = '';
    rerender();

    apiVerifyOtp(loginState.phone, otp).then(function(res){
      if (!res || !res.token) throw new Error('Could not sign you in. Please try again.');
      setWebSession(res.token, { phone: loginState.phone, id: res.user && res.user.id });
      loginState.busy = false;
      showToast('Signed in');
      navigate(loginState.next || '/cart/', true);
    }).catch(function(e){
      loginState.busy = false;
      loginState.error = e.message || 'That code did not work.';
      rerender();
    });
  }

  /* ---- addresses ---- */
  function collectAddress(){
    var g = function(id){ var el = document.getElementById(id); return el ? String(el.value).trim() : ''; };
    return {
      full_name: g('naName'),
      phone: g('naPhone').replace(/\D/g, '').slice(-10),
      house_flat: g('naHouse'),
      street_area: g('naStreet'),
      landmark: g('naLandmark'),
      city: g('naCity'),
      state: g('naState'),
      pincode: g('naPin').replace(/\D/g, ''),
      label: g('naLabel') || 'home'
    };
  }

  /* Checked here as well as on the server, and deliberately to the SAME rules
     (validateAddressBody in orderRoutes.js) - so the shopper is told which field is wrong
     while they are still looking at it, rather than after a round trip. The server remains
     the authority; this only saves them the trip. */
  function validateAddress(a){
    if (!a.full_name) return 'Please add a name for the delivery.';
    if (!/^\d{10}$/.test(a.phone)) return 'Please add a valid 10-digit phone number.';
    if (!a.house_flat) return 'Please add a house or flat number.';
    if (!a.city) return 'Please add a city.';
    if (!/^[1-9]\d{5}$/.test(a.pincode)) return 'Please add a valid 6-digit pincode.';
    return '';
  }

  function saveNewAddress(){
    var a = collectAddress();
    var bad = validateAddress(a);
    if (bad) { showToast(bad); return; }
    apiSaveAddress(a).then(function(r){
      var saved = r.data || r;
      checkoutState.addresses = checkoutState.addresses.concat([saved]);
      checkoutState.addressId = saved.id;
      checkoutState.addingAddress = false;
      rerender();
      showToast('Address saved');
    }).catch(function(e){
      if (e.status === 401 && handleAuthFailure()) { navigate('/login/?next=/checkout/', true); return; }
      showToast(e.message || 'Could not save that address');
    });
  }

  function removeAddress(id){
    apiDeleteAddress(id).then(function(){
      accountState.addresses = accountState.addresses.filter(function(a){ return a.id !== id; });
      rerender();
      showToast('Address removed');
    }).catch(function(e){ showToast(e.message || 'Could not remove that address'); });
  }

  /* ---- payment ----
     Deliberately mirrors astrowani_customer-main's PaymentScreen: create the order, open
     Razorpay, and treat ONLY the server's signature check as proof of payment. The
     Razorpay handler firing does not mean the order is paid. */
  function payNow(){
    if (checkoutState.busy) return;

    var addrPromise;
    if (checkoutState.addressId) {
      addrPromise = Promise.resolve(checkoutState.addressId);
    } else {
      var a = collectAddress();
      var bad = validateAddress(a);
      if (bad) { showToast(bad); return; }
      addrPromise = apiSaveAddress(a).then(function(r){ return (r.data && r.data.id) || (r && r.id); });
    }

    checkoutState.busy = true;
    checkoutState.message = '';
    rerender();

    addrPromise.then(function(addressId){
      if (!addressId) throw new Error('Please add a delivery address');
      checkoutState.addressId = addressId;
      // The web widget is only needed when the app's native sheet is not going to handle
      // this - see openRazorpay. Skipping the script on the bridge path saves a
      // third-party fetch on a mobile connection at the worst possible moment.
      var ready = appBridgeAvailable() ? Promise.resolve() : loadRazorpay();
      return ready.then(function(){
        return apiFetch('/api/orders/checkout', {
          method: 'POST',
          body: JSON.stringify({
            items: cartIds().map(function(id){ return { itemId: id, quantity: cart[id] }; }),
            addressId: addressId,
            paymentMethod: 'razorpay',
            clientRequestId: clientRequestId,
            source: 'web'
          })
        });
      });
    }).then(function(res){
      // The server already handled this exact attempt - the retry is the success, not an
      // error. Same posture as verify-payment's alreadyProcessed.
      if (res.alreadyProcessed) { onOrderConfirmed(res.orderId); return; }
      openRazorpay(res);
    }).catch(function(e){
      checkoutState.busy = false;
      if (e.status === 401 && handleAuthFailure()) { navigate('/login/?next=/checkout/', true); return; }
      if (e.status === 402 && e.body && e.body.shortfall != null) {
        checkoutState.message = 'That payment could not be completed. Short by ' + rupees(e.body.shortfall) + '.';
      } else {
        checkoutState.message = e.message || 'Could not start the payment.';
      }
      rerender();
    });
  }

  /* Whatever confirmed the payment - the web widget or the app's native sheet - lands
     here, and NOTHING is said to the customer until the server has checked the signature.
     Razorpay reporting success is not proof; the server's HMAC check is. */
  function verifyPayment(resp, fallbackOrderId){
    return apiFetch('/api/orders/verify-payment', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature
      })
    }).then(function(v){
      onOrderConfirmed(v.orderId || fallbackOrderId);
    }).catch(function(e){
      checkoutState.busy = false;
      checkoutState.view = 'unconfirmed';
      checkoutState.message = e.message || '';
      rerender();
    });
  }

  function paymentDismissed(){
    checkoutState.busy = false;
    checkoutState.message = 'Payment window closed. Nothing has been charged.';
    rerender();
  }

  function razorpayOptions(res){
    return {
      key: res.keyId,
      order_id: res.razorpayOrderId,
      amount: res.amount,
      currency: res.currency || 'INR',
      name: 'Wani Shop',
      description: 'Order ' + String(res.orderId || '').slice(0, 8).toUpperCase(),
      prefill: session.profile && session.profile.phone ? { contact: session.profile.phone } : {},
      theme: { color: '#592a19' }
    };
  }

  /* ---- the app bridge ----
     Inside the WebView, Razorpay's WEB widget is the wrong tool. Paying by UPI hands off to
     an intent:// URL that opens GPay or PhonePe; the WebView cannot follow it, and
     StoreWebView's onShouldStartLoadWithRequest sends anything off-host to the system
     browser - which would take the customer out of the app mid-payment and strand the
     session. The app already links react-native-razorpay (Wallet.js and PaymentScreen.js
     both use it), so the page asks the app to run its NATIVE sheet and posts the result
     back here.

     Detection is on the handler the app installs, not on a platform string, so a build
     that predates the bridge simply falls through to the web widget rather than posting a
     message nothing is listening for and hanging on a spinner forever. */
  var appPaymentSeq = 0;
  var appPaymentPending = null;

  function appBridgeAvailable(){
    return !!(window.ReactNativeWebView && window.__ASTROWANI__ && window.__ASTROWANI__.nativePay);
  }

  // Called by the app (see StoreWebView.js). Kept on window because injectJavaScript is
  // the only channel back into the page.
  window.__astrowaniPaymentResult = function(payload){
    var pending = appPaymentPending;
    if (!pending || !payload || payload.id !== pending.id) return;   // stale or foreign
    appPaymentPending = null;
    if (payload.status === 'success' && payload.payment) verifyPayment(payload.payment, pending.orderId);
    else if (payload.status === 'cancelled') paymentDismissed();
    else {
      checkoutState.busy = false;
      checkoutState.message = payload.message || 'The payment could not be completed.';
      rerender();
    }
  };

  function openRazorpay(res){
    var opts = razorpayOptions(res);

    if (appBridgeAvailable()) {
      appPaymentSeq += 1;
      appPaymentPending = { id: appPaymentSeq, orderId: res.orderId };
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'razorpay', id: appPaymentSeq, options: opts
        }));
        return;
      } catch (e) {
        // The bridge is there but the post failed. Fall through to the web widget rather
        // than leaving a customer who has an order row waiting on nothing.
        appPaymentPending = null;
      }
    }

    var rzp = new window.Razorpay(Object.assign({}, opts, {
      handler: function(resp){ verifyPayment(resp, res.orderId); },
      modal: { ondismiss: paymentDismissed }
    }));
    rzp.open();
  }

  function onOrderConfirmed(orderId){
    clearCart();
    checkoutState.busy = false;
    checkoutState.orderId = orderId;
    checkoutState.view = 'placed';
    rerender();
  }

  function cancelOrder(id){
    if (ordersState.busyId) return;
    ordersState.busyId = id;
    rerender();
    apiCancelOrder(id).then(function(){
      showToast('Order cancelled. Any payment is being refunded.');
      enterOrders();
    }).catch(function(e){
      ordersState.busyId = null;
      showToast(e.message || 'Could not cancel that order');
      rerender();
    });
  }

  /* ---- puja booking handoff (unpaid pujas) ---- */
  function openPujaWhatsApp(id){
    var p = pujaBySlug(id) || PUJA_LIST.find(function(x){ return x.id === id; });
    if (!p) return;
    var nl = String.fromCharCode(10);
    var lines = [
      'Puja request from shop.astrowani.com', '',
      'Puja: ' + p.name + (p.hindi ? ' (' + p.hindi + ')' : '')
    ];
    if (p.dur) lines.push('Duration: ' + p.dur);
    lines.push('Indicative dakshina: Rs ' + Number(p.price).toLocaleString('en-IN'), '',
      'Please call me to fix the muhurat.');
    var url = 'https://wa.me/' + PUJA_WHATSAPP + '?text=' + encodeURIComponent(lines.join(nl));
    // window.open returns null inside some in-app webviews; falling through to a same-tab
    // navigation means the handoff still happens rather than the button doing nothing.
    var w = null;
    try { w = window.open(url, '_blank'); } catch (e) {}
    if (!w) window.location.href = url;
  }

  /* ---- pincode ETA ----
     Honest about what it is: an estimate derived from the pincode, not a courier lookup.
     There is no serviceability API wired up, so it never claims a stone cannot be
     delivered - only how long it usually takes. */
  function checkPincode(){
    var el = document.getElementById('pdpPin');
    var out = document.getElementById('pdpPinResult');
    if (!el || !out) return;
    var pin = el.value.trim();
    if (!/^\d{6}$/.test(pin)) { out.textContent = 'Enter a valid 6-digit pincode.'; return; }
    var digitSum = pin.split('').reduce(function(s, d){ return s + parseInt(d, 10); }, 0);
    var days = 3 + (digitSum % 5);
    var eta = new Date();
    eta.setDate(eta.getDate() + days);
    out.textContent = 'Usually delivered by ' + eta.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
      ', about ' + days + ' days to this pincode.';
  }

  /* ---- calculators ---- */
  function calcMoolank(){
    var val = (document.getElementById('dobInput') || {}).value;
    var box = document.getElementById('moolankResult');
    if (!box) return;
    if (!val) { showToast('Please choose a date of birth'); return; }
    var parts = val.split('-');
    var year = parts[0], month = parts[1], day = parts[2];
    var moolank = reduceDigits(parseInt(day, 10));
    var bhagyank = reduceDigits(parseInt(day + month + year, 10));
    var mt = MOOLANK_TRAITS[moolank], gm = GEM_MAP[moolank];
    var p = byId[gm.productId];
    box.innerHTML =
      '<div class="num-big">' + moolank + '</div><div class="num-sub">Moolank &middot; ruled by ' + mt.planet + '</div>' +
      '<p>' + escapeHtml(mt.trait) + '</p>' +
      '<p style="margin-top:10px;"><strong>Bhagyank: ' + bhagyank + '</strong>, your destiny number, drawn from your complete date of birth.</p>' +
      (p ? '<a class="rec" href="/gemstones/' + escapeAttr(p.slug) + '/" data-link>&#10022; Traditionally paired with ' + escapeHtml(gm.name) + ' &rarr;</a>'
         : '<div class="rec">&#10022; Traditionally paired with ' + escapeHtml(gm.name) + '</div>');
    box.classList.add('show');
  }

  function calcGem(){
    var val = (document.getElementById('moolankSelect') || {}).value;
    var box = document.getElementById('gemResult');
    if (!box) return;
    if (!val) { showToast('Please select a Moolank number'); return; }
    var n = parseInt(val, 10);
    var mt = MOOLANK_TRAITS[n], gm = GEM_MAP[n];
    var p = byId[gm.productId];
    box.innerHTML =
      (p
        ? '<div class="gem-result-row"><div class="gem-result-thumb">' + productPhotoImg(p, 'front') + '</div>' +
          '<div><div class="gem-result-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="price">' + rupees(p.price) + '</div></div></div>'
        : '<div class="gem-result-name">' + escapeHtml(gm.name) + '</div>') +
      '<p>Ruled by ' + mt.planet + '. ' + escapeHtml(mt.trait) + '</p>' +
      (p ? '<a class="btn btn-gold btn-sm" href="/gemstones/' + escapeAttr(p.slug) + '/" data-link>View this piece</a>' : '');
    box.classList.add('show');
  }

  function joinNewsletter(){
    var el = document.getElementById('newsletterInput');
    if (!el) return;
    var v = el.value.trim();
    if (!v || v.indexOf('@') === -1) { showToast('Enter an email to join'); return; }
    el.value = '';
    showToast('Thanks, you are on the list');
  }

  /* ================= PROMO TICKER ================= */
  function initTicker(){
    var root = document.getElementById('marquee');
    if (!root) return;
    var MESSAGES = [
      'Every stone ships with its lab certificate',
      'Insured, tracked delivery across India',
      '7 day returns on any unworn stone',
      'Sixty-four pujas performed with the full vidhi'
    ];
    var track = document.createElement('div');
    track.className = 'marquee-track';
    var run = MESSAGES.concat(MESSAGES).map(function(m){
      return '<span class="marquee-item">' + m + '<span class="sep">&#10022;</span></span>';
    }).join('');
    track.innerHTML = run;
    root.innerHTML = '';
    root.appendChild(track);
  }

  /* ================= IN-APP CHROME =================
     The exit button only exists inside the app: on the open web there is nothing to exit
     to, and a dead button is worse than no button. Exposed as a global because the
     WebView re-injects after load on Android and calls it then - see injectAuthAfterLoad
     in StoreWebView.js. Idempotent by design. */
  function applyAppMode(){
    loadSession();
    var inApp = !!(window.__ASTROWANI__ && window.__ASTROWANI__.platform === 'app');
    document.body.classList.toggle('in-app', inApp);
    var exitBtn = document.getElementById('exitBtn');
    if (exitBtn) exitBtn.classList.toggle('hidden', !inApp);
    syncNav();
    if (currentRoute) rerender();
  }
  window.__astrowaniApplyAppMode = applyAppMode;

  function initAppChrome(){
    var exitBtn = document.getElementById('exitBtn');
    if (exitBtn) {
      exitBtn.addEventListener('click', function(){
        // Only the app knows where "home" is, so the page asks rather than navigating.
        try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'exit' })); }
        catch (e) { navigate('/'); }
      });
    }
    var logo = document.getElementById('brandLogo');
    if (logo) logo.src = BRAND_LOGO;
    var logoFoot = document.getElementById('brandLogoFoot');
    if (logoFoot) logoFoot.src = BRAND_LOGO;
  }

  /* ================= BOOT ================= */
  function boot(){
    view = document.getElementById('view');
    if (!view) return;

    loadSession();
    recomputeCatalog();     // paints the offline catalogue immediately, buy controls off
    initTicker();
    initAppChrome();
    initReveal();

    /* Both fetches are STARTED before the first route is rendered and awaited by nobody:
       the offline catalogue is already painted, so these upgrade the page rather than
       blocking it. Starting them first is load-bearing, though - an enter hook that calls
       whenCatalogReady() runs during go() below, and if the fetch had not been kicked off
       by then it would see a resolved no-op promise and judge the cart on a catalogue that
       does not yet contain it. That is exactly how a refresh on /checkout/ bounced the
       shopper to an "empty" cart holding two stones. */
    loadStoreConfig();
    catalogReady = loadLiveCatalog();

    go(window.location.pathname, window.location.search, false);
    applyAppMode();

    var header = document.querySelector('header.site');
    if (header) {
      var ticking = false;
      window.addEventListener('scroll', function(){
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function(){
          header.classList.toggle('scrolled', window.scrollY > 8);
          ticking = false;
        });
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
