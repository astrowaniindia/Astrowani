/* ================= SHARED STORE SCRIPT =================
   One script serves all three pages (/, /gemstones/, /pujas/). Every page carries the
   same chrome - header, ticker, cart drawer, modals, footer - but only the sections it
   is about, so a given page is always missing some of the elements this file wires up.
   Rather than guarding thirty separate top-level lookups (and having to re-verify the
   gemstone page against every one of them), a missing id resolves to an inert detached
   node. Appending to it, setting innerHTML on it or binding a listener to it all succeed
   and affect nothing, which is exactly the desired behaviour for a section that is not
   on this page. The same stub is returned every time for a given id, so code that looks
   an element up twice still gets one object.
   On the gemstone page every element exists, so the stub is never constructed and the
   behaviour is byte-identical to the single-page version this was split from. */
(function(){
  var native = document.getElementById.bind(document);
  var stubs = {};
  document.getElementById = function(id){
    var el = native(id);
    if (el) return el;
    if (!stubs[id]) { var d = document.createElement('div'); d.id = id; stubs[id] = d; }
    return stubs[id];
  };
})();
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


  /* ================= LIFESTYLE PHOTOGRAPHY PLACEMENT =================
     The photographs live as data URIs in LIFESTYLE (top of this script), so they're
     attached here rather than in markup. Each is missing-safe: if a key were ever removed
     the element just stays empty instead of rendering a broken-image icon. */
  (function(){
    // The real Astrowani brand star (same asset as the app's Play Store icon).
    ['brandLogo','brandLogoFoot'].forEach(function(id){
      var el = document.getElementById(id);
      if (el && typeof BRAND_LOGO === 'string') el.src = BRAND_LOGO;
    });
    var heroEl = document.querySelector('.hero');
    // A page may declare its own hero photograph inline (the puja page does); the
    // gemstone lifestyle shot is only the fallback when none was set.
    if (heroEl && LIFESTYLE.hero && !heroEl.style.getPropertyValue('--hero-img'))
      heroEl.style.setProperty('--hero-img', 'url("'+LIFESTYLE.hero+'")');
    [['imgBanner','banner'], ['imgDiscover','discover'], ['imgBoxes','boxes'], ['imgTray','tray']]
      .forEach(function(pair){
        var el = document.getElementById(pair[0]);
        if (el && LIFESTYLE[pair[1]]) el.src = LIFESTYLE[pair[1]];
        else if (el) el.remove();
      });
  })();

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
  var CATS = [
    {id:'rudraksha', label:'Rudraksha'},
    {id:'gemstone', label:'Gemstones'},
    {id:'bracelet-mala', label:'Bracelets & Malas'},
    {id:'yantra', label:'Yantras'},
    {id:'pooja', label:'Pooja & Incense'}
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

  /* ================= ADMIN DATA LAYER (local-only catalog editing) =================
     Nothing here touches a server — it's the same trick the cart already uses
     (localStorage), applied to the catalog itself: overrides patch a built-in product,
     custom products are appended, deletions are tracked by id (built-in products live in
     the PRODUCTS array above and can't literally be spliced out), and which categories are
     browsable is its own toggle. recomputeCatalog() folds all of that into the same
     byId / VISIBLE_PRODUCTS / PRESENT_CATS names the rest of the app already reads from. */
  var ADMIN_KEYS = {
    overrides: 'astrowani_store_admin_overrides',
    custom: 'astrowani_store_admin_custom',
    deleted: 'astrowani_store_admin_deleted',
    visibleCats: 'astrowani_store_admin_visible_cats',
    mode: 'astrowani_store_admin_mode',
  };
  function adminLoad(key, fallback){
    try { var v = localStorage.getItem(ADMIN_KEYS[key]); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  }
  function adminSave(key, value){ try { localStorage.setItem(ADMIN_KEYS[key], JSON.stringify(value)); } catch(e){} }

  var adminOverrides = adminLoad('overrides', {});
  var adminCustom = adminLoad('custom', []);
  var adminDeleted = adminLoad('deleted', []);
  var adminVisibleCats = adminLoad('visibleCats', ['gemstone']);
  var adminMode = adminLoad('mode', false);



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
  function canBuy(){ return !!AUTH_TOKEN; }

  function apiFetch(path, opts){
    opts = opts || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (AUTH_TOKEN) headers.Authorization = 'Bearer ' + AUTH_TOKEN;
    return fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }))
      .then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(body){
          if (!r.ok) {
            var err = new Error(body.message || ('Request failed (' + r.status + ')'));
            err.status = r.status; err.body = body;
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

  var LIVE_PRODUCTS = null;   // null until the fetch resolves; [] means "loaded, empty"

  function loadLiveCatalog(){
    return fetch(API_BASE + '/api/remedies')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        var rows = Array.isArray(d) ? d : (d.data || d.items || []);
        LIVE_PRODUCTS = rows.filter(function(r){ return r && r._id; }).map(fromApi);
        recomputeCatalog();
        renderCatNav();
        renderFilterPanel();
        renderGrid();
        renderCart();      // prices may have moved since the cart was saved
      })
      .catch(function(e){
        // Deliberately silent for the shopper: the fallback catalogue is already on screen.
        console.warn('live catalogue unavailable, showing offline catalogue:', e.message);
      });
  }

  var byId = {};
  var VISIBLE_PRODUCTS = [];
  var PRESENT_CATS = [];
  function recomputeCatalog(){
    // Live rows win outright when present. Mixing them with the offline array would put
    // unbuyable products next to buyable ones with no way for the shopper to tell.
    var base = (LIVE_PRODUCTS && LIVE_PRODUCTS.length) ? LIVE_PRODUCTS : PRODUCTS;
    var merged = base.map(function(p){
      var o = adminOverrides[p.id];
      return o ? Object.assign({}, p, o) : p;
    }).filter(function(p){ return adminDeleted.indexOf(p.id) === -1; });
    merged = merged.concat(adminCustom.filter(function(p){ return adminDeleted.indexOf(p.id) === -1; }));

    byId = {};
    merged.forEach(function(p){ byId[p.id] = p; });
    VISIBLE_PRODUCTS = merged.filter(function(p){ return adminVisibleCats.indexOf(p.cat) !== -1; });
    PRESENT_CATS = CATS.filter(function(c){
      return adminVisibleCats.indexOf(c.id) !== -1 && merged.some(function(p){ return p.cat === c.id; });
    });
    reconcileCart();
  }

  // A cart saved against the offline catalogue holds ids (p1..p48) that do not exist once
  // the live uuids arrive. Those keys must be dropped, not merely skipped at render time:
  // cartSubtotal() reads byId[id].price directly and would throw on the first stale entry.
  function reconcileCart(){
    if (typeof cart !== 'object' || !cart) return;
    var dropped = 0;
    Object.keys(cart).forEach(function(id){
      if (!byId[id]) { delete cart[id]; dropped++; }
    });
    if (dropped) { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){} }
  }
  recomputeCatalog();

  /* ================= WISHLIST ================= */
  var WISH_KEY = 'astrowani_store_wishlist';
  var wishlist = [];
  try { wishlist = JSON.parse(localStorage.getItem(WISH_KEY) || '[]'); } catch(e){ wishlist = []; }
  function toggleWishlist(id){
    var i = wishlist.indexOf(id);
    if (i===-1) wishlist.push(id); else wishlist.splice(i,1);
    try { localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); } catch(e){}
    return wishlist.indexOf(id) !== -1;
  }

  /* ================= CATEGORY QUICK-NAV =================
     The avatar strip was removed from the page (one live category made it pointless).
     Kept as a no-op so the admin category toggles, which call it after changing what's
     visible, don't each need a null check. */
  var catNav = document.getElementById('catNav');
  function renderCatNav(){
    if (!catNav) return;
    catNav.innerHTML = '';
    PRESENT_CATS.forEach(function(c){
      var first = VISIBLE_PRODUCTS.find(function(p){ return p.cat===c.id; });
      if (!first) return;
      var el = document.createElement('div');
      el.className = 'catnav-item';
      el.innerHTML = productPhotoImg(first, 'front') + '<span>'+c.label+'</span>';
      el.addEventListener('click', function(){
        filterState.cat = c.id;
        renderFilterPanel();
        renderGrid();
        document.getElementById('shop').scrollIntoView({behavior:'smooth', block:'start'});
      });
      catNav.appendChild(el);
    });
  }
  renderCatNav();

  /* ================= RENDER: purpose tiles ================= */
  var purposeGrid = document.getElementById('purposeGrid');
  PURPOSES.forEach(function(pu){
    // <button>, not <div>: these are controls that filter the grid, so they should be
    // reachable by keyboard and announced as buttons rather than being a silent div.
    var el = document.createElement('button');
    el.className = 'purpose-tile';
    el.type = 'button';
    var photo = PURPOSE_PHOTOS[pu.id];
    el.innerHTML =
      (photo ? '<img src="'+photo+'" alt="" loading="lazy">' : '') +
      '<span class="pt-label">'+pu.label+'</span>';
    el.addEventListener('click', function(){
      filterState.purposes = new Set([pu.id]);
      filterState.cat = 'all';
      renderFilterPanel();
      renderGrid();
      document.getElementById('shop').scrollIntoView({behavior:'smooth', block:'start'});
    });
    purposeGrid.appendChild(el);
  });
  stagger(purposeGrid.children, 70);

  /* ================= RENDER: filter sidebar + toolbar + grid ================= */
  var filterState = { cat:'all', purposes:new Set(), price:'all', sort:'popularity' };
  var PRICE_BANDS = [
    {id:'all', label:'Any price'},
    {id:'under1000', label:'Under ₹1,000'},
    {id:'1000-5000', label:'₹1,000 – ₹5,000'},
    {id:'above5000', label:'Above ₹5,000'}
  ];
  function priceInBand(price, band){
    if (band==='under1000') return price < 1000;
    if (band==='1000-5000') return price >= 1000 && price <= 5000;
    if (band==='above5000') return price > 5000;
    return true;
  }

  // The filter panel UI was removed for a simpler shop page — filtering by purpose still
  // works (the "Shop by Purpose" tiles above the grid set filterState.purposes directly),
  // there just isn't a sidebar/bar of checkboxes for it any more. renderFilterPanel is kept
  // as a safe no-op so every existing call site (purpose tiles, admin category toggles,
  // "clear filters" logic) doesn't need to be touched individually.
  var filterPanel = document.getElementById('filterPanel');
  function renderFilterPanel(){
    if (!filterPanel) return;
    // Only worth showing once there's more than one category to actually choose between —
    // with a single category live, a "Category" filter that can't do anything is just clutter.
    var showCatGroup = PRESENT_CATS.length > 1;
    var catRows = [{id:'all', label:'All pieces'}].concat(PRESENT_CATS).map(function(c){
      return '<label class="filter-opt'+(filterState.cat===c.id?' active-cat':'')+'"><input type="radio" name="fp-cat" value="'+c.id+'" '+(filterState.cat===c.id?'checked':'')+'> '+c.label+'</label>';
    }).join('');
    var purposeRows = PURPOSES.map(function(pu){
      return '<label class="filter-opt"><input type="checkbox" value="'+pu.id+'" '+(filterState.purposes.has(pu.id)?'checked':'')+'> '+pu.label+'</label>';
    }).join('');
    var priceRows = PRICE_BANDS.map(function(b){
      return '<label class="filter-opt"><input type="radio" name="fp-price" value="'+b.id+'" '+(filterState.price===b.id?'checked':'')+'> '+b.label+'</label>';
    }).join('');

    filterPanel.innerHTML =
      (showCatGroup ? '<div class="filter-group"><div class="filter-title">Category</div>'+catRows+'</div>' : '')+
      '<div class="filter-group" id="fgPurpose"><div class="filter-title">Purpose</div>'+purposeRows+'</div>'+
      '<div class="filter-group"><div class="filter-title">Price</div>'+priceRows+'</div>'+
      '<button class="clear-filters" id="clearFiltersBtn">Clear all filters</button>';

    filterPanel.querySelectorAll('input[name="fp-cat"]').forEach(function(r){
      r.addEventListener('change', function(){ filterState.cat = r.value; renderGrid(); });
    });
    filterPanel.querySelectorAll('input[name="fp-price"]').forEach(function(r){
      r.addEventListener('change', function(){ filterState.price = r.value; renderGrid(); });
    });
    filterPanel.querySelectorAll('#fgPurpose input[type="checkbox"]').forEach(function(cb){
      cb.addEventListener('change', function(){
        if (cb.checked) filterState.purposes.add(cb.value); else filterState.purposes.delete(cb.value);
        renderGrid();
      });
    });
    document.getElementById('clearFiltersBtn').addEventListener('click', function(){
      filterState = { cat:'all', purposes:new Set(), price:'all', sort:filterState.sort };
      renderFilterPanel();
      renderGrid();
    });
  }

  document.getElementById('sortSelect').addEventListener('change', function(e){
    filterState.sort = e.target.value;
    renderGrid();
  });

  var productGrid = document.getElementById('productGrid');
  function renderGrid(){
    var list = VISIBLE_PRODUCTS.filter(function(p){
      var okCat = filterState.cat==='all' || p.cat===filterState.cat;
      var okPurpose = filterState.purposes.size===0 || p.tags.some(function(t){ return filterState.purposes.has(t); });
      var okPrice = priceInBand(p.price, filterState.price);
      return okCat && okPurpose && okPrice;
    });

    var sort = filterState.sort;
    list = list.slice();
    if (sort==='price-asc') list.sort(function(a,b){ return a.price-b.price; });
    else if (sort==='price-desc') list.sort(function(a,b){ return b.price-a.price; });
    else if (sort==='newest') list.reverse();
    else list.sort(function(a,b){ return productMeta(b).score - productMeta(a).score; });

    document.getElementById('resultCount').textContent = list.length + (list.length===1?' piece':' pieces');

    productGrid.innerHTML = '';
    if (!list.length){
      productGrid.innerHTML = '<div class="empty-note" style="grid-column:1/-1;">No pieces match that filter yet.</div>';
      return;
    }
    list.forEach(function(p){
      var off = p.mrp ? Math.round((1 - p.price/p.mrp)*100) : 0;
      var meta = productMeta(p);
      var isWished = wishlist.indexOf(p.id) !== -1;
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML =
        '<div class="card-media" data-open="'+p.id+'">'+
          (off ? '<span class="card-tag">'+off+'% OFF</span>' : '') +
          '<button class="wishlist-btn'+(isWished?' on':'')+'" data-wish="'+p.id+'" aria-label="Save to wishlist">'+(isWished?'♥':'♡')+'</button>'+
          productPhotoImg(p, 'front') +
        '</div>'+
        '<div class="card-body">'+
          '<div class="card-name" data-open="'+p.id+'">'+p.name+'</div>'+
          '<div class="card-admin-actions">'+
            '<button class="btn btn-line btn-sm" style="flex:1;" data-edit="'+p.id+'">Edit</button>'+
            '<button class="btn btn-sm" style="flex:1; background:var(--brown); color:var(--cream);" data-delete="'+p.id+'">Delete</button>'+
          '</div>'+
        '</div>';
      productGrid.appendChild(card);
    });

    if (adminMode){
      var addTile = document.createElement('button');
      addTile.className = 'product-card-add';
      addTile.style.gridColumn = 'span 1';
      addTile.innerHTML = '<span class="product-card-add-plus">+</span><span>Add a product</span>';
      addTile.addEventListener('click', function(){ openAdminEditor(null); });
      productGrid.appendChild(addTile);
    }
    // Re-run on every filter/sort change, so a new result set cascades in rather than
    // popping. Cards already on screen simply reveal at once.
    stagger(productGrid.children, 45, 11);
  }

  productGrid.addEventListener('click', function(e){
    var openId = e.target.closest('[data-open]');
    var addId = e.target.closest('[data-add]');
    var wishId = e.target.closest('[data-wish]');
    var editId = e.target.closest('[data-edit]');
    var deleteId = e.target.closest('[data-delete]');
    if (wishId){
      var on = toggleWishlist(wishId.getAttribute('data-wish'));
      wishId.classList.toggle('on', on);
      wishId.textContent = on ? '♥' : '♡';
      showToast(on ? 'Saved to wishlist' : 'Removed from wishlist');
      return;
    }
    if (editId){ openAdminEditor(byId[editId.getAttribute('data-edit')]); return; }
    if (deleteId){ adminDeleteProduct(deleteId.getAttribute('data-delete')); return; }
    if (openId) openQuickView(openId.getAttribute('data-open'));
    else if (addId){ addToCart(addId.getAttribute('data-add'), 1); showToast('Added to cart'); }
  });

  document.querySelectorAll('a[data-cat]').forEach(function(a){
    a.addEventListener('click', function(){
      filterState.cat = a.getAttribute('data-cat');
      filterState.purposes = new Set();
      renderFilterPanel();
      renderGrid();
    });
  });

  renderFilterPanel();
  renderGrid();

  /* ================= PROMO TICKER + COUNTDOWN ================= */
  (function(){
    var root = document.getElementById('marquee');
    if (!root) return;

    var MESSAGES = [
      'Festive sale ends in <span class="clock">--:--:--</span>',
      'Use code <strong>ASTRO10</strong> for 10% off your first order',
      'Free shipping above <strong>₹999</strong>',
      'Every stone ships with its lab certificate'
    ];
    var setHtml = MESSAGES.map(function(m){
      return '<span class="marquee-item">'+m+'<span class="sep">|</span></span>';
    }).join('');

    // Build one track, then repeat the message set until it is wider than the viewport —
    // otherwise a track narrower than the screen leaves a visible blank gap mid-loop on a
    // large monitor. Then clone it so the second track covers the first's exit.
    var track = document.createElement('div');
    track.className = 'marquee-track';
    track.innerHTML = setHtml;
    root.appendChild(track);
    var guard = 0;
    while (track.offsetWidth < window.innerWidth && guard < 12) {
      track.innerHTML += setHtml;
      guard++;
    }
    var clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    root.appendChild(clone);

    // Every repeat carries its own clock span, so update them all.
    function pad(n){ return n<10 ? '0'+n : ''+n; }
    function tick(){
      var now = new Date();
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, 0,0,0);
      var diff = Math.max(0, end - now);
      var text = pad(Math.floor(diff/3600000))+':'+pad(Math.floor((diff%3600000)/60000))+':'+pad(Math.floor((diff%60000)/1000));
      var clocks = root.querySelectorAll('.clock');
      for (var i=0;i<clocks.length;i++) clocks[i].textContent = text;
    }
    tick();
    setInterval(tick, 1000);
  })();

  /* ================= QUICK VIEW MODAL ================= */
  var pvModal = document.getElementById('pvModal');
  var pvContent = document.getElementById('pvContent');
  var pvQty = 1;

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

  function openQuickView(id){
    var p = byId[id];
    pvQty = 1;
    var off = p.mrp ? Math.round((1 - p.price/p.mrp)*100) : 0;
    var meta = productMeta(p);
    var reviews = productReviews(p);
    var hasRealPhoto = !!REAL_PHOTOS[p.id];
    var variants = ['front','angle','zoom'];

    pvContent.innerHTML =
      '<div class="pv-media" id="pvMainMedia">'+productPhotoImg(p,'front')+'</div>'+
      (hasRealPhoto ? '' :
      '<div class="pv-thumbs">'+variants.map(function(v,i){
        return '<div class="pv-thumb'+(i===0?' sel':'')+'" data-variant="'+v+'">'+productPhotoImg(p,v)+'</div>';
      }).join('')+'</div>')+
      '<div class="pv-cat">'+CATS.find(function(c){return c.id===p.cat;}).label+'</div>'+
      '<h3 class="pv-name">'+p.name+'</h3>'+
      '<div class="pv-rating-row"><span class="stars-sm">'+starString(meta.rating)+'</span><span>'+meta.rating.toFixed(1)+' · '+meta.reviews+' ratings</span></div>'+
      '<div class="pv-price-row">'+
        '<span class="pv-price price">₹'+p.price.toLocaleString('en-IN')+'</span>'+
        (p.mrp ? '<span class="pv-mrp price">₹'+p.mrp.toLocaleString('en-IN')+'</span><span class="pv-off">'+off+'% off</span>' : '')+
      '</div>'+
      '<div class="pv-stock'+(meta.lowStock?' low':'')+'">'+(meta.lowStock? 'Only '+meta.stockLeft+' left in stock' : 'In stock · ships within 24 hours')+'</div>'+
      '<div class="pv-actions">'+
        '<div class="qty-stepper"><button data-pv-dec>−</button><span id="pvQtyNum">1</span><button data-pv-inc>+</button></div>'+
        '<button class="btn btn-line" id="pvAdd" style="flex:1;">Add to cart</button>'+
        '<button class="btn btn-gold" id="pvBuy" style="flex:1;">Enquire</button>'+
      '</div>'+
      '<div class="pv-tabs">'+
        '<button class="pv-tab sel" data-tab="desc">Description</button>'+
        '<button class="pv-tab" data-tab="delivery">Delivery</button>'+
        '<button class="pv-tab" data-tab="reviews">Reviews ('+reviews.length+')</button>'+
      '</div>'+
      '<div class="pv-panel sel" data-panel="desc">'+
        '<p class="pv-desc">'+p.desc+'</p>'+
        '<ul class="pv-benefits">'+p.benefits.map(function(b){return '<li>'+b+'</li>';}).join('')+'</ul>'+
      '</div>'+
      '<div class="pv-panel" data-panel="delivery">'+
        '<p class="pv-desc">Check estimated delivery for your pincode.</p>'+
        '<div class="pincode-row"><input id="pvPincode" maxlength="6" placeholder="Enter 6-digit pincode"><button class="btn btn-line btn-sm" id="pvPinCheck">Check</button></div>'+
        '<div class="pincode-result" id="pvPinResult"></div>'+
      '</div>'+
      '<div class="pv-panel" data-panel="reviews">'+
        reviews.map(function(r){
          return '<div class="review-item">'+
            '<span class="stars-sm">'+starString(r.stars)+'</span>'+
            '<div class="rev-name">'+r.name+'<span class="rev-date">'+r.daysAgo+' days ago</span></div>'+
            '<p>'+r.text+'</p>'+
          '</div>';
        }).join('')+
      '</div>';

    pvContent.querySelectorAll('.pv-thumb').forEach(function(t){
      t.addEventListener('click', function(){
        pvContent.querySelectorAll('.pv-thumb').forEach(function(o){ o.classList.remove('sel'); });
        t.classList.add('sel');
        document.getElementById('pvMainMedia').innerHTML = productPhotoImg(p, t.getAttribute('data-variant'));
      });
    });
    pvContent.querySelectorAll('.pv-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        pvContent.querySelectorAll('.pv-tab').forEach(function(o){ o.classList.remove('sel'); });
        pvContent.querySelectorAll('.pv-panel').forEach(function(o){ o.classList.remove('sel'); });
        tab.classList.add('sel');
        pvContent.querySelector('[data-panel="'+tab.getAttribute('data-tab')+'"]').classList.add('sel');
      });
    });
    pvContent.querySelector('#pvPinCheck').addEventListener('click', function(){
      var pin = pvContent.querySelector('#pvPincode').value.trim();
      var resultEl = pvContent.querySelector('#pvPinResult');
      if (!/^\d{6}$/.test(pin)){ resultEl.textContent = 'Enter a valid 6-digit pincode.'; return; }
      var digitSum = pin.split('').reduce(function(s,d){ return s+parseInt(d,10); },0);
      var days = 3 + (digitSum % 5);
      var eta = new Date(); eta.setDate(eta.getDate()+days);
      resultEl.textContent = 'Delivering by '+eta.toLocaleDateString('en-IN',{day:'numeric', month:'short'})+' (usually '+days+' days to this pincode).';
    });

    pvContent.querySelector('[data-pv-dec]').addEventListener('click', function(){ pvQty = Math.max(1, pvQty-1); pvContent.querySelector('#pvQtyNum').textContent = pvQty; });
    pvContent.querySelector('[data-pv-inc]').addEventListener('click', function(){ pvQty = Math.min(20, pvQty+1); pvContent.querySelector('#pvQtyNum').textContent = pvQty; });
    pvContent.querySelector('#pvAdd').addEventListener('click', function(){ addToCart(id, pvQty); showToast('Added to cart'); closeModal('pvModal'); });
    pvContent.querySelector('#pvBuy').addEventListener('click', function(){ addToCart(id, pvQty); closeModal('pvModal'); openCart(); });
    openModal('pvModal');
  }

  /* ================= MODAL HELPERS ================= */
  function openModal(id){ document.getElementById(id).classList.add('show'); document.body.style.overflow='hidden'; }
  function closeModal(id){ document.getElementById(id).classList.remove('show'); document.body.style.overflow=''; }
  document.querySelectorAll('[data-close]').forEach(function(el){
    el.addEventListener('click', function(){ closeModal(el.getAttribute('data-close')); });
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ closeModal('pvModal'); closeModal('coModal'); closeModal('adminModal'); closeCartDrawer(); }
  });

  /* ================= ADMIN EDITOR (local-only) ================= */
  var ICON_TYPES = [
    {key:'gem', label:'Faceted gem'}, {key:'bead', label:'Rudraksha bead'},
    {key:'bracelet', label:'Bracelet (ring of beads)'}, {key:'mala', label:'Mala (loop + pendant)'},
    {key:'yantra', label:'Yantra plate'}, {key:'havan', label:'Havan kit'},
    {key:'dhoop', label:'Dhoop / incense stick'}, {key:'kalash', label:'Kalash'}
  ];

  /* The exit control only exists in the app shell. The store screen there has no chrome of
     its own — this header IS the nav bar — so this is the way back out. It asks the app to
     leave rather than doing anything itself, because only the app knows what "home" is.
     No fallback to history.back(): the store is the first page in that WebView, so there is
     nothing behind it. */
  /* Exposed rather than run once, because the app hands us window.__ASTROWANI__ through
     injectedJavaScriptBeforeContentLoaded, and on Android that is not reliably ahead of
     this script: one run in five the button simply never appeared. The app now calls this
     again after load, so the outcome no longer depends on winning that race. Idempotent -
     re-running it re-reads the handshake and rebinds nothing twice. */
  var exitWired = false;
  window.__astrowaniApplyAppMode = function(){
    if (!APP && typeof window !== 'undefined' && window.__ASTROWANI__) {
      APP = window.__ASTROWANI__;
      if (!AUTH_TOKEN && APP.token) AUTH_TOKEN = APP.token;
      if (!API_BASE && APP.apiBase) API_BASE = APP.apiBase;
    }
    var btn = document.getElementById('exitBtn');
    if (!btn) return;
    var inApp = !!(APP && APP.platform === 'app' && window.ReactNativeWebView);
    if (!inApp) return;
    btn.classList.remove('hidden');
    if (exitWired) return;
    exitWired = true;
    btn.addEventListener('click', function(){
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'exit' })); } catch (e) {}
    });
  };
  window.__astrowaniApplyAppMode();
  document.addEventListener('DOMContentLoaded', window.__astrowaniApplyAppMode);

  var adminBar = document.getElementById('adminBar');
  var adminCatToggles = document.getElementById('adminCatToggles');
  var adminToggleBtn = document.getElementById('adminToggle');

  // On the public site the catalog editor stays out of sight: a shopper who taps it gets a
  // confusing "delete product" UI on what is meant to be a storefront. Reach it with
  //   https://shop.astrowani.com/?admin=1
  // which sticks for the rest of the browser session. Everything it changes is local to
  // that browser anyway, so this is about not showing it, not about security.
  var ADMIN_UNLOCK_KEY = 'astrowani_store_admin_unlocked';
  var adminUnlocked = false;
  try {
    if (/[?&]admin=1\b/.test(location.search)) sessionStorage.setItem(ADMIN_UNLOCK_KEY, '1');
    adminUnlocked = sessionStorage.getItem(ADMIN_UNLOCK_KEY) === '1';
  } catch (e) { adminUnlocked = /[?&]admin=1\b/.test(location.search); }
  if (!adminUnlocked && adminToggleBtn) {
    adminToggleBtn.remove();
    adminToggleBtn = null;
    adminMode = false;           // a mode saved from a previous unlocked visit must not persist
  }

  function renderAdminBar(){
    adminCatToggles.innerHTML = CATS.map(function(c){
      var count = PRODUCTS.concat(adminCustom).filter(function(p){ return p.cat===c.id && adminDeleted.indexOf(p.id)===-1; }).length;
      return '<label class="admin-cat-opt"><input type="checkbox" data-vis-cat="'+c.id+'" '+(adminVisibleCats.indexOf(c.id)!==-1?'checked':'')+'> '
        + c.label + ' (' + count + ')</label>';
    }).join('');
    adminCatToggles.querySelectorAll('[data-vis-cat]').forEach(function(cb){
      cb.addEventListener('change', function(){
        var cat = cb.getAttribute('data-vis-cat');
        if (cb.checked){ if (adminVisibleCats.indexOf(cat)===-1) adminVisibleCats.push(cat); }
        else { adminVisibleCats = adminVisibleCats.filter(function(x){ return x!==cat; }); }
        adminSave('visibleCats', adminVisibleCats);
        recomputeCatalog();
        renderCatNav();
        renderFilterPanel();
        renderGrid();
      });
    });
  }

  function setAdminMode(on){
    adminMode = on;
    adminSave('mode', adminMode);
    document.body.classList.toggle('admin-on', adminMode);
    if (adminToggleBtn) adminToggleBtn.classList.toggle('on', adminMode);
    adminBar.classList.toggle('hidden', !adminMode);
    if (adminMode) renderAdminBar();
    renderGrid();
  }
  if (adminToggleBtn) adminToggleBtn.addEventListener('click', function(){ setAdminMode(!adminMode); });
  // Apply whatever was saved from a previous visit, before the first paint of the grid.
  document.body.classList.toggle('admin-on', adminMode);
  if (adminToggleBtn) adminToggleBtn.classList.toggle('on', adminMode);
  if (adminMode){ adminBar.classList.remove('hidden'); renderAdminBar(); }

  var adminContent = document.getElementById('adminContent');
  var adminPhotoDataUrl = null; // set only if the admin picks a new file this session

  function openAdminEditor(product){
    var isNew = !product;
    var p = product || { id:null, name:'', cat: adminVisibleCats[0] || 'gemstone', tags:[], price:0, mrp:'', icon:'gem', tint:'#c8973c', desc:'', benefits:[], photo:null };
    adminPhotoDataUrl = null;

    adminContent.innerHTML =
      '<h3 style="margin-bottom:16px;">'+(isNew ? 'Add a product' : 'Edit product')+'</h3>'+
      '<div class="field"><label>Name</label><input id="afName" type="text" value="'+escapeAttr(p.name)+'"></div>'+
      '<div class="admin-field-row">'+
        '<div class="field"><label>Category</label><select id="afCat">'+CATS.map(function(c){
          return '<option value="'+c.id+'"'+(p.cat===c.id?' selected':'')+'>'+c.label+'</option>';
        }).join('')+'</select></div>'+
        '<div class="field"><label>Price (₹)</label><input id="afPrice" type="number" value="'+(p.price||0)+'"></div>'+
      '</div>'+
      '<div class="field"><label>MRP (₹), optional. Blank means no discount badge</label><input id="afMrp" type="number" value="'+(p.mrp||'')+'"></div>'+
      '<div class="field"><label>Purpose tags</label>'+
        '<div class="admin-tag-grid">'+PURPOSES.map(function(pu){
          return '<label class="admin-tag-opt"><input type="checkbox" data-tag="'+pu.id+'" '+(p.tags.indexOf(pu.id)!==-1?'checked':'')+'> '+pu.label+'</label>';
        }).join('')+'</div>'+
      '</div>'+
      '<div class="field"><label>Description</label><textarea id="afDesc" rows="3">'+escapeHtml(p.desc||'')+'</textarea></div>'+
      '<div class="field"><label>Benefits, one per line</label><textarea id="afBenefits" rows="3">'+escapeHtml((p.benefits||[]).join('\n'))+'</textarea></div>'+
      '<div class="field"><label>Photo</label>'+
        '<div class="admin-photo-row">'+
          '<div class="admin-photo-preview" id="afPhotoPreview">'+productPhotoImg(p, 'front')+'</div>'+
          '<div>'+
            '<button type="button" class="btn btn-line btn-sm" id="afUploadBtn">Upload a photo</button>'+
            '<input type="file" id="afFileInput" accept="image/*" hidden>'+
            (p.photo ? ' <button type="button" class="btn btn-line btn-sm" id="afRemovePhoto">Use illustration instead</button>' : '')+
          '</div>'+
        '</div>'+
        '<p class="muted" style="font-size:12.5px; margin:0 0 10px;">No photo? Pick a style and colour below and we\'ll render one.</p>'+
        '<div class="admin-field-row">'+
          '<div class="field"><label>Illustration style</label><select id="afIcon">'+ICON_TYPES.map(function(it){
            return '<option value="'+it.key+'"'+(p.icon===it.key?' selected':'')+'>'+it.label+'</option>';
          }).join('')+'</select></div>'+
          '<div class="field"><label>Colour</label><div class="admin-tint-row"><input type="color" id="afTint" value="'+(p.tint||'#c8973c')+'"></div></div>'+
        '</div>'+
      '</div>'+
      '<div class="actions" style="justify-content:space-between;">'+
        (!isNew ? '<button class="btn btn-sm" style="background:var(--brown); color:var(--cream);" id="afDelete">Delete product</button>' : '<span></span>')+
        '<div style="display:flex; gap:10px;">'+
          '<button class="btn btn-line" id="afCancel">Cancel</button>'+
          '<button class="btn btn-gold" id="afSave">Save</button>'+
        '</div>'+
      '</div>';

    var previewEl = adminContent.querySelector('#afPhotoPreview');
    function refreshPreview(){
      var draft = collectDraft();
      previewEl.innerHTML = productPhotoImg(draft, 'front');
    }
    function collectDraft(){
      var tags = Array.prototype.slice.call(adminContent.querySelectorAll('[data-tag]:checked')).map(function(cb){ return cb.getAttribute('data-tag'); });
      var benefits = adminContent.querySelector('#afBenefits').value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      return {
        id: p.id,
        name: adminContent.querySelector('#afName').value.trim() || 'Untitled product',
        cat: adminContent.querySelector('#afCat').value,
        price: Number(adminContent.querySelector('#afPrice').value) || 0,
        mrp: adminContent.querySelector('#afMrp').value ? Number(adminContent.querySelector('#afMrp').value) : null,
        tags: tags,
        desc: adminContent.querySelector('#afDesc').value.trim(),
        benefits: benefits,
        icon: adminContent.querySelector('#afIcon').value,
        tint: adminContent.querySelector('#afTint').value,
        photo: adminPhotoDataUrl !== null ? adminPhotoDataUrl : (p.photo || null),
      };
    }

    adminContent.querySelector('#afIcon').addEventListener('change', refreshPreview);
    adminContent.querySelector('#afTint').addEventListener('input', refreshPreview);
    adminContent.querySelector('#afUploadBtn').addEventListener('click', function(){ adminContent.querySelector('#afFileInput').click(); });
    adminContent.querySelector('#afFileInput').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(){
        adminPhotoDataUrl = String(reader.result);
        refreshPreview();
      };
      reader.readAsDataURL(file);
    });
    var removeBtn = adminContent.querySelector('#afRemovePhoto');
    if (removeBtn){
      removeBtn.addEventListener('click', function(){
        adminPhotoDataUrl = ''; // explicit empty string = "cleared", distinct from null = "unchanged"
        refreshPreview();
      });
    }

    adminContent.querySelector('#afCancel').addEventListener('click', function(){ closeModal('adminModal'); });
    if (!isNew){
      adminContent.querySelector('#afDelete').addEventListener('click', function(){
        closeModal('adminModal');
        adminDeleteProduct(p.id);
      });
    }
    adminContent.querySelector('#afSave').addEventListener('click', function(){
      var draft = collectDraft();
      if (draft.photo === '') draft.photo = null; // cleared → fall back to illustration
      saveAdminProduct(isNew, p.id, draft);
      closeModal('adminModal');
    });

    openModal('adminModal');
  }

  function byIdIsCustom(id){ return id && String(id).indexOf('custom-') === 0; }

  function saveAdminProduct(isNew, existingId, draft){
    if (isNew){
      draft.id = 'custom-' + Date.now();
      adminCustom.push(draft);
      adminSave('custom', adminCustom);
    } else if (byIdIsCustom(existingId)){
      adminCustom = adminCustom.map(function(cp){ return cp.id === existingId ? Object.assign({}, cp, draft, {id: existingId}) : cp; });
      adminSave('custom', adminCustom);
    } else {
      adminOverrides[existingId] = Object.assign({}, adminOverrides[existingId], draft, {id: existingId});
      adminSave('overrides', adminOverrides);
    }
    // A newly-used category should become visible immediately, or the item the admin
    // just saved would silently vanish from the grid they were just looking at.
    if (adminVisibleCats.indexOf(draft.cat) === -1){
      adminVisibleCats.push(draft.cat);
      adminSave('visibleCats', adminVisibleCats);
    }
    recomputeCatalog();
    if (adminMode) renderAdminBar();
    renderCatNav();
    renderFilterPanel();
    renderGrid();
    showToast(isNew ? 'Product added' : 'Product saved');
  }

  function adminDeleteProduct(id){
    var p = byId[id];
    if (!p) return;
    if (!confirm('Delete "'+p.name+'"? This only affects this browser.')) return;
    if (byIdIsCustom(id)){
      adminCustom = adminCustom.filter(function(cp){ return cp.id !== id; });
      adminSave('custom', adminCustom);
    } else {
      if (adminDeleted.indexOf(id) === -1) adminDeleted.push(id);
      adminSave('deleted', adminDeleted);
    }
    recomputeCatalog();
    if (adminMode) renderAdminBar();
    renderCatNav();
    renderFilterPanel();
    renderGrid();
    showToast('Deleted');
  }

  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }

  /* ================= CART ================= */
  var CART_KEY = 'astrowani_store_cart';
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '{}'); } catch(e){ cart = {}; }

  function saveCart(){ try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){} }

  function addToCart(id, qty){
    cart[id] = (cart[id]||0) + qty;
    saveCart();
    renderCart();
  }
  function setQty(id, qty){
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    saveCart();
    renderCart();
  }

  function cartCount(){ return Object.keys(cart).reduce(function(s,id){ return byId[id] ? s+cart[id] : s; }, 0); }
  function cartSubtotal(){
    return Object.keys(cart).reduce(function(s,id){
      var p = byId[id];
      return p ? s + p.price * cart[id] : s;
    }, 0);
  }

  function renderCart(){
    var count = cartCount();
    var badge = document.getElementById('cartCount');
    if (count){ badge.textContent = count; badge.classList.remove('hidden'); } else { badge.classList.add('hidden'); }

    var body = document.getElementById('cartBody');
    var foot = document.getElementById('cartFoot');
    var ids = Object.keys(cart);

    if (!ids.length){
      body.innerHTML = '<div class="empty-cart">'
        + '<svg viewBox="0 0 24 24" width="40" height="40" style="margin:0 auto 16px; display:block; fill:none; stroke:currentColor; stroke-width:1.4; stroke-linecap:round; stroke-linejoin:round;">'
        + '<path d="M5 8h14l-1.2 11.2a1.6 1.6 0 0 1-1.6 1.4H7.8a1.6 1.6 0 0 1-1.6-1.4Z"/>'
        + '<path d="M9 8V6.2a3 3 0 0 1 6 0V8"/></svg>'
        + 'Your cart is empty.<br>Browse the collection to add a stone.</div>';
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = ids.map(function(id){
      var p = byId[id];
      return '<div class="cart-line">'+
        '<div class="cl-media">'+renderIcon(p)+'</div>'+
        '<div class="cl-info">'+
          '<div class="cl-name">'+p.name+'</div>'+
          '<div class="cl-price price">₹'+p.price.toLocaleString('en-IN')+' each</div>'+
          '<div class="qty-stepper"><button data-dec="'+id+'">−</button><span>'+cart[id]+'</span><button data-inc="'+id+'">+</button></div>'+
          '<button class="cl-remove" data-rm="'+id+'">Remove</button>'+
        '</div>'+
      '</div>';
    }).join('');

    var subtotal = cartSubtotal();
    var shipping = subtotal >= 999 || subtotal === 0 ? 0 : 79;
    var total = subtotal + shipping;

    foot.innerHTML =
      '<div class="sum-row"><span>Subtotal</span><span class="price">₹'+subtotal.toLocaleString('en-IN')+'</span></div>'+
      '<div class="sum-row"><span>Shipping</span><span class="price">'+(shipping? '₹'+shipping : 'Free')+'</span></div>'+
      '<div class="sum-row total"><span>Total</span><span class="price">₹'+total.toLocaleString('en-IN')+'</span></div>'+
      '<button class="btn btn-gold btn-full" style="margin-top:14px;" id="checkoutBtn">Enquire about these</button>';

    foot.querySelector('#checkoutBtn').addEventListener('click', function(){ closeCartDrawer(); openCheckout(); });

    body.querySelectorAll('[data-inc]').forEach(function(b){ b.addEventListener('click', function(){ var id=b.getAttribute('data-inc'); setQty(id, cart[id]+1); }); });
    body.querySelectorAll('[data-dec]').forEach(function(b){ b.addEventListener('click', function(){ var id=b.getAttribute('data-dec'); setQty(id, cart[id]-1); }); });
    body.querySelectorAll('[data-rm]').forEach(function(b){ b.addEventListener('click', function(){ setQty(b.getAttribute('data-rm'), 0); }); });
  }
  renderCart();

  var scrim = document.getElementById('scrim');
  var cartDrawer = document.getElementById('cartDrawer');
  function openCart(){ cartDrawer.classList.add('show'); scrim.classList.add('show'); document.body.style.overflow='hidden'; }
  function closeCartDrawer(){ cartDrawer.classList.remove('show'); scrim.classList.remove('show'); document.body.style.overflow=''; }
  document.getElementById('cartBtn').addEventListener('click', openCart);
  document.getElementById('closeCart').addEventListener('click', closeCartDrawer);
  scrim.addEventListener('click', closeCartDrawer);

  /* ================= ENQUIRY =================
     This deliberately does NOT take payment. The page is a static site with no server
     behind it, so a "Place order" button here could only ever show a made-up order number
     while taking no money, recording nothing and shipping nothing — worse than having no
     checkout at all. Instead the cart becomes an enquiry: the customer's details and their
     chosen stones are handed to a channel a human actually reads.

     WhatsApp is used when a number is configured below, e-mail otherwise. Fill in
     ENQUIRY_WHATSAPP (digits only, with country code, e.g. '919812345678') to switch the
     primary button over — nothing else needs changing. */
  var ENQUIRY_WHATSAPP = '';                        // '' = e-mail only
  var ENQUIRY_EMAIL    = 'support@astrowani.com';

  var coContent = document.getElementById('coContent');

  function openCheckout(){
    if (!cartCount()) { showToast('Your cart is empty'); return; }
    if (canBuy()) startRealCheckout(); else renderEnquiryForm();
    openModal('coModal');
  }

  /* ================= REAL CHECKOUT (in-app only) =================
     Runs only when the app injected a customer JWT. Every figure shown comes from
     POST /api/orders/quote: the server reprices from remedy_items and app_settings, and
     /checkout re-derives the same numbers and ignores anything money-shaped in the request
     body. Nothing here computes a price, it only displays what the server said. */
  var checkoutState = { quote: null, addresses: [], addressId: null, busy: false };

  // One token per checkout attempt, held for the life of the modal. Retrying the same
  // attempt reuses it and dedupes server-side; a deliberate second purchase reopens the
  // modal, mints a new one, and is correctly treated as a new order.
  var clientRequestId = null;

  function cartLines(){
    return Object.keys(cart).map(function(id){ return { itemId: id, quantity: cart[id] }; });
  }

  function startRealCheckout(){
    clientRequestId = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    coContent.innerHTML = '<div class="confirm"><p class="lede">Checking prices and stock...</p></div>';
    Promise.all([
      apiFetch('/api/orders/quote', { method: 'POST', body: JSON.stringify({ items: cartLines() }) }),
      apiFetch('/api/addresses').catch(function(){ return { data: [] }; })
    ]).then(function(res){
      checkoutState.quote = res[0];
      checkoutState.addresses = res[1].data || [];
      var def = null;
      checkoutState.addresses.forEach(function(a){ if (!def || a.is_default) def = a; });
      checkoutState.addressId = def ? def.id : null;
      renderRealCheckout();
    }).catch(function(e){
      coContent.innerHTML =
        '<div class="confirm"><h3 style="font-size:20px;">Could not start checkout</h3>' +
        '<p class="lede" style="margin:10px auto 18px; max-width:38ch;">' + escapeHtml(e.message) + '</p>' +
        '<button class="btn btn-gold" id="coClose">Close</button></div>';
      coContent.querySelector('#coClose').addEventListener('click', function(){ closeModal('coModal'); });
    });
  }

  function renderRealCheckout(){
    var q = checkoutState.quote;
    var addrOpts = checkoutState.addresses.map(function(a){
      var label = [a.name, a.line1, a.city, a.pincode].filter(Boolean).join(', ');
      return '<option value="' + a.id + '"' + (a.id === checkoutState.addressId ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }).join('');

    var blocked = (q.blockedTypes || []).length > 0;
    var oos = (q.outOfStock || []).length > 0;

    coContent.innerHTML =
      '<h3 style="font-size:20px; margin-bottom:16px;">Checkout</h3>' +
      (checkoutState.addresses.length
        ? '<div class="field"><label for="coAddrSel">Deliver to</label><select id="coAddrSel">' + addrOpts + '</select></div>'
        : '<div class="field"><label>Delivery address</label>' +
          '<input id="naName" placeholder="Full name"><div style="height:8px"></div>' +
          '<input id="naPhone" inputmode="numeric" placeholder="10-digit phone"><div style="height:8px"></div>' +
          '<input id="naLine1" placeholder="House no., street, locality"><div style="height:8px"></div>' +
          '<div class="field-row"><input id="naCity" placeholder="City"><input id="naPin" inputmode="numeric" placeholder="Pincode"></div>' +
          '<div style="height:8px"></div><input id="naState" placeholder="State"></div>') +
      (q.items || []).map(function(l){
        var line = Number(l.lineTotal != null ? l.lineTotal : (l.unitPrice * l.quantity)) || 0;
        return '<div class="sum-row"><span>' + escapeHtml(l.title) + ' x' + l.quantity + '</span><span class="price">Rs ' + line.toLocaleString('en-IN') + '</span></div>';
      }).join('') +
      '<div class="sum-row"><span>Delivery</span><span class="price">' + (q.deliveryFee ? 'Rs ' + q.deliveryFee : 'Free') + '</span></div>' +
      (q.handlingFee ? '<div class="sum-row"><span>Handling</span><span class="price">Rs ' + q.handlingFee + '</span></div>' : '') +
      '<div class="sum-row total"><span>To pay</span><span class="price">Rs ' + Number(q.grandTotal).toLocaleString('en-IN') + '</span></div>' +
      (blocked ? '<div class="checkout-note">We are not delivering some of these yet. Remove them to continue.</div>' : '') +
      (oos ? '<div class="checkout-note">Something in your cart just went out of stock.</div>' : '') +
      '<button class="btn btn-gold btn-full" style="margin-top:16px;" id="payBtn"' + ((blocked || oos) ? ' disabled' : '') + '>Pay Rs ' + Number(q.grandTotal).toLocaleString('en-IN') + '</button>';

    var sel = coContent.querySelector('#coAddrSel');
    if (sel) sel.addEventListener('change', function(){ checkoutState.addressId = sel.value; });
    coContent.querySelector('#payBtn').addEventListener('click', payNow);
  }

  function collectNewAddress(){
    var g = function(id){ var el = coContent.querySelector('#' + id); return el ? el.value.trim() : ''; };
    return { name: g('naName'), phone: g('naPhone'), line1: g('naLine1'), city: g('naCity'), pincode: g('naPin'), state: g('naState') };
  }

  function payNow(){
    if (checkoutState.busy) return;
    checkoutState.busy = true;
    var btn = coContent.querySelector('#payBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Starting payment...'; }

    var ensureAddress = checkoutState.addressId
      ? Promise.resolve(checkoutState.addressId)
      : apiFetch('/api/addresses', { method: 'POST', body: JSON.stringify(collectNewAddress()) })
          .then(function(r){ return (r.data && r.data.id) || null; });

    ensureAddress.then(function(addressId){
      if (!addressId) throw new Error('Please fill in a delivery address');
      checkoutState.addressId = addressId;
      return loadRazorpay().then(function(){
        return apiFetch('/api/orders/checkout', { method: 'POST', body: JSON.stringify({
          items: cartLines(),
          addressId: addressId,
          paymentMethod: 'razorpay',
          clientRequestId: clientRequestId
        })});
      });
    }).then(function(res){
      if (res.alreadyProcessed) { renderOrderPlaced(res.orderId); return; }
      openRazorpay(res);
    }).catch(function(e){
      checkoutState.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Try again'; }
      showToast(e.message || 'Could not start payment');
    });
  }

  function openRazorpay(res){
    var rzp = new window.Razorpay({
      key: res.keyId,
      order_id: res.razorpayOrderId,
      amount: res.amount,
      currency: 'INR',
      name: 'Astrowani Store',
      description: 'Gemstone order',
      handler: function(resp){
        // This callback does NOT mean the order is confirmed. Only the server's signature
        // check decides that, so the customer is told nothing until verify-payment returns.
        apiFetch('/api/orders/verify-payment', { method: 'POST', body: JSON.stringify({
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature
        })}).then(function(v){
          cart = {}; saveCart(); renderCart();
          renderOrderPlaced(v.orderId || res.orderId);
        }).catch(function(e){
          renderPaymentUnconfirmed(e.message);
        });
      },
      modal: { ondismiss: function(){
        checkoutState.busy = false;
        var b = coContent.querySelector('#payBtn');
        if (b) { b.disabled = false; b.textContent = 'Pay Rs ' + Number(checkoutState.quote.grandTotal).toLocaleString('en-IN'); }
      }}
    });
    rzp.open();
  }

  function renderOrderPlaced(orderId){
    coContent.innerHTML =
      '<div class="confirm"><div class="tick">&#10003;</div>' +
      '<h3 style="font-size:22px;">Order placed</h3>' +
      (orderId ? '<div class="ordno price">' + escapeHtml(String(orderId).slice(0, 8).toUpperCase()) + '</div>' : '') +
      '<p class="lede" style="margin:0 auto 18px; max-width:38ch;">Payment confirmed. You can follow it under My Orders in the app.</p>' +
      '<button class="btn btn-gold" id="continueShopping">Keep browsing</button></div>';
    coContent.querySelector('#continueShopping').addEventListener('click', function(){ closeModal('coModal'); });
  }

  // Money may well have left the customer's account by this point, so this must never say
  // the order failed. It states only what is known, and tells them not to pay twice.
  function renderPaymentUnconfirmed(msg){
    coContent.innerHTML =
      '<div class="confirm"><h3 style="font-size:20px;">We could not confirm your payment</h3>' +
      '<p class="lede" style="margin:10px auto 14px; max-width:40ch;">If money left your account it is safe and the order will be completed. Please do not pay again.</p>' +
      '<p class="lede" style="margin:0 auto 18px; max-width:40ch; font-size:13px;">' + escapeHtml(msg || '') + '</p>' +
      '<button class="btn btn-gold" id="continueShopping">Close</button></div>';
    coContent.querySelector('#continueShopping').addEventListener('click', function(){ closeModal('coModal'); });
  }

  // Plain-text summary of the cart, shared by both the WhatsApp and e-mail handoffs.
  function enquirySummary(details){
    var lines = ['Gemstone enquiry from shop.astrowani.com', ''];
    Object.keys(cart).forEach(function(id){
      var p = byId[id];
      if (!p) return;
      lines.push('- ' + p.name + '  x' + cart[id] + '  (Rs ' + (p.price * cart[id]).toLocaleString('en-IN') + ')');
    });
    lines.push('', 'Approx total: Rs ' + cartSubtotal().toLocaleString('en-IN'));
    lines.push('', 'Name: ' + details.name, 'Phone: ' + details.phone);
    if (details.city) lines.push('City: ' + details.city);
    if (details.note) lines.push('Note: ' + details.note);
    return lines.join('\n');
  }

  function renderEnquiryForm(){
    var subtotal = cartSubtotal();
    coContent.innerHTML =
      '<h3 style="font-size:20px; margin-bottom:6px;">Enquire about these stones</h3>'+
      '<p class="lede" style="font-size:14px; margin:0 0 18px;">Leave your details and we will call you back to confirm the stone, its certificate and the final price before anything is paid.</p>'+
      '<div class="field"><label for="coName">Your name</label><input id="coName" placeholder="Full name"></div>'+
      '<div class="field-row">'+
        '<div class="field"><label for="coPhone">Phone number</label><input id="coPhone" inputmode="numeric" placeholder="10-digit mobile"></div>'+
        '<div class="field"><label for="coCity">City (optional)</label><input id="coCity" placeholder="City"></div>'+
      '</div>'+
      '<div class="field"><label for="coNote">Anything we should know? (optional)</label><textarea id="coNote" rows="2" placeholder="Birth details, a stone you were advised, a question"></textarea></div>'+
      '<div class="checkout-note">No payment is taken here and no card details are asked for. We confirm availability and price with you first.</div>'+
      '<div class="sum-row total"><span>'+cartCount()+' item'+(cartCount()===1?'':'s')+'</span><span class="price">Rs '+subtotal.toLocaleString('en-IN')+'</span></div>'+
      '<button class="btn btn-gold btn-full" style="margin-top:16px;" id="sendEnquiryBtn">'+
        (ENQUIRY_WHATSAPP ? 'Send enquiry on WhatsApp' : 'Send enquiry by e-mail')+
      '</button>';

    coContent.querySelector('#sendEnquiryBtn').addEventListener('click', function(){
      var details = {
        name:  coContent.querySelector('#coName').value.trim(),
        phone: coContent.querySelector('#coPhone').value.trim(),
        city:  coContent.querySelector('#coCity').value.trim(),
        note:  coContent.querySelector('#coNote').value.trim()
      };
      if (!details.name || !details.phone){ showToast('Please add your name and phone number'); return; }
      if (!/^[0-9+\-\s]{8,15}$/.test(details.phone)){ showToast('That phone number does not look right'); return; }

      var body = enquirySummary(details);
      var url = ENQUIRY_WHATSAPP
        ? 'https://wa.me/' + ENQUIRY_WHATSAPP + '?text=' + encodeURIComponent(body)
        : 'mailto:' + ENQUIRY_EMAIL + '?subject=' + encodeURIComponent('Gemstone enquiry') + '&body=' + encodeURIComponent(body);

      // The cart is intentionally NOT cleared: the handoff can fail (no WhatsApp
      // installed, no mail client), and wiping their basket on the way out would lose
      // the selection with nothing to show for it.
      window.open(url, '_blank');
      renderEnquirySent(details);
    });
  }

  function renderEnquirySent(details){
    coContent.innerHTML =
      '<div class="confirm">'+
        '<div class="tick">✓</div>'+
        '<h3 style="font-size:22px;">Enquiry ready to send</h3>'+
        '<p class="lede" style="margin:10px auto 18px; max-width:40ch;">'+
          (ENQUIRY_WHATSAPP ? 'WhatsApp should have opened with your enquiry filled in. Press send there and we will call you back on ' : 'Your e-mail app should have opened with the enquiry filled in. Send it and we will call you back on ')+
          '<strong>'+details.phone+'</strong>.'+
        '</p>'+
        '<p class="lede" style="margin:0 auto 18px; max-width:40ch; font-size:13.5px;">Nothing has been charged, and your basket is still here if you want to change it.</p>'+
        '<button class="btn btn-gold" id="continueShopping">Keep browsing</button>'+
      '</div>';
    coContent.querySelector('#continueShopping').addEventListener('click', function(){ closeModal('coModal'); });
  }

  /* ================= TESTIMONIALS ================= */
  // Names, cities and quotes are written to fit the person actually in each photograph —
  // a Delhi street shot captioned "Chennai" is the kind of mismatch a reader notices even
  // if they can't say why. The Sri Yantra quote also had to go: the catalogue is gemstones
  // only now, so it referenced something not for sale.
  var TESTIMONIALS = [
    {photo:'c1', name:'Ritika Sharma', loc:'New Delhi',
      quote:'Ran the Moolank calculator first, then ordered the emerald. It arrived with the lab report and a note on which day to start wearing it.'},
    {photo:'c2', name:'Mahesh Agarwal', loc:'Jaipur, Rajasthan',
      quote:'I have been buying stones for thirty years. The yellow sapphire they sent matched its certificate exactly, which is rarer than people think.'},
    {photo:'c3', name:'Lata Deshpande', loc:'Pune, Maharashtra',
      quote:'The pearl came properly packed, and the guidance sheet made the whole thing feel considered rather than superstitious.'}
  ];
  var testiGrid = document.getElementById('testiGrid');
  TESTIMONIALS.forEach(function(t){
    var el = document.createElement('div');
    el.className = 'testi-card';
    var photo = CUSTOMER_PHOTOS[t.photo];
    el.innerHTML =
      '<div class="stars">★★★★★</div>'+
      '<p>“'+t.quote+'”</p>'+
      '<div class="testi-who">'+
        (photo ? '<div class="testi-avatar"><img src="'+photo+'" alt="'+t.name+'" loading="lazy"></div>' : '') +
        '<div>'+
          '<div class="testi-name">'+t.name+'</div>'+
          '<div class="testi-loc">'+t.loc+'</div>'+
        '</div>'+
      '</div>';
    testiGrid.appendChild(el);
  });
  stagger(testiGrid.children, 90);

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

  document.getElementById('calcMoolankBtn').addEventListener('click', function(){
    var val = document.getElementById('dobInput').value;
    var resultBox = document.getElementById('moolankResult');
    if (!val){ showToast('Please choose a date of birth'); return; }
    var parts = val.split('-'); // yyyy-mm-dd
    var year = parts[0], month = parts[1], day = parts[2];
    var moolank = reduceDigits(parseInt(day,10));
    var allDigits = (day+month+year);
    var bhagyank = reduceDigits(parseInt(allDigits,10));
    var mt = MOOLANK_TRAITS[moolank];
    var gm = GEM_MAP[moolank];
    resultBox.innerHTML =
      '<div class="num-big">'+moolank+'</div><div class="num-sub">Moolank · ruled by '+mt.planet+'</div>'+
      '<p>'+mt.trait+'</p>'+
      '<p style="margin-top:10px;"><strong>Bhagyank: '+bhagyank+'</strong>, your destiny number, drawn from your complete date of birth.</p>'+
      '<div class="rec" data-open="'+gm.productId+'" style="cursor:pointer;">✦ Traditionally paired with '+gm.name+' →</div>';
    resultBox.classList.add('show');
    resultBox.querySelector('[data-open]').addEventListener('click', function(e){ openQuickView(e.currentTarget.getAttribute('data-open')); });
  });

  document.getElementById('calcGemBtn').addEventListener('click', function(){
    var val = document.getElementById('moolankSelect').value;
    var resultBox = document.getElementById('gemResult');
    if (!val){ showToast('Please select a Moolank number'); return; }
    var n = parseInt(val,10);
    var mt = MOOLANK_TRAITS[n];
    var gm = GEM_MAP[n];
    var p = byId[gm.productId];
    resultBox.innerHTML =
      '<div style="display:flex; gap:14px; align-items:center;">'+
        '<div class="gem-result-thumb">'+renderIcon(p)+'</div>'+
        '<div><div style="font-weight:700;">'+p.name+'</div><div class="price" style="font-size:14px; color:var(--ink);">₹'+p.price.toLocaleString('en-IN')+'</div></div>'+
      '</div>'+
      '<p>Ruled by '+mt.planet+'. '+mt.trait+'</p>'+
      '<button class="btn btn-gold btn-sm" id="gemViewBtn" style="margin-top:10px;">View this piece</button>';
    resultBox.classList.add('show');
    resultBox.querySelector('#gemViewBtn').addEventListener('click', function(){ openQuickView(gm.productId); });
  });

  /* ================= NEWSLETTER ================= */
  document.getElementById('newsletterBtn').addEventListener('click', function(){
    var v = document.getElementById('newsletterInput').value.trim();
    if (!v){ showToast('Enter an email to join'); return; }
    document.getElementById('newsletterInput').value = '';
    showToast('Thanks, you\'re on the list');
  });

  /* ================= TOAST ================= */
  var toastTimer = null;
  function showToast(msg){
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }

  /* ================= MOTION BOOT =================
     Runs last so every section, including the JS-rendered grids above, exists by now. */
  (function(){
    // Static blocks that aren't part of a rendered group: headings, the campaign bands,
    // the calculator cards and the editorial image/text pairs.
    var groups = [
      ['.section-head', 0],
      ['.campaign', 0],
      ['.calc-portrait, .calc-card', 80],
      ['.about-band > *', 110],
      ['.foot-grid > *', 70],
      ['.foot-assure > *', 70]
    ];
    // Mark first, observe second: initReveal() below does a single sweep of everything
    // carrying data-reveal, including the grids marked earlier during render.
    groups.forEach(function(g){
      var nodes = document.querySelectorAll(g[0]);
      Array.prototype.forEach.call(nodes, function(el, i){
        el.setAttribute('data-reveal', '');
        if (g[1]) el.setAttribute('data-reveal-delay', String(Math.min(i, 8) * g[1]));
      });
    });

    initReveal();

    // Kick the live catalogue fetch after first paint: the offline catalogue is already
    // on screen, so this upgrades the page rather than blocking it.
    loadLiveCatalog();

    // Hero copy: fires on the next frame so the starting (hidden) state is painted first,
    // otherwise the browser can skip straight to the end and there is no animation at all.
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        document.body.classList.add('hero-in');
      });
    });

    // Header picks up a shadow once the page has moved. rAF-throttled so the scroll
    // handler never does layout work more than once a frame.
    var header = document.querySelector('header.site');
    if (header){
      var ticking = false;
      window.addEventListener('scroll', function(){
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function(){
          header.classList.toggle('scrolled', window.scrollY > 8);
          ticking = false;
        });
      }, {passive:true});
    }
  })();


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

  var PUJA_BANDS = [
    {id:'all',   label:'All pujas',        test:function(){ return true; }},
    {id:'day',   label:'Within a day',     test:function(p){ return p.m <= 1440; }},
    {id:'short', label:'2 to 3 days',      test:function(p){ return p.m > 1440 && p.m <= 4320; }},
    {id:'long',  label:'5 days and above', test:function(p){ return p.m > 4320; }}
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

  var pujaState = { q:'', band:'all', sort:'featured', cat:'all' };

  function pujaImg(p){ return PUJA_IMG_BASE + encodeURIComponent(p.img); }
  function pujaRupees(n){ return '₹' + n.toLocaleString('en-IN'); }

  var pujaGrid  = document.getElementById('pujaGrid');
  var pujaChips = document.getElementById('pjChips');
  var pujaCount = document.getElementById('pjCount');

  function pujaCatPhoto(cat){
    if (PUJA_CAT_PHOTOS[cat.id]) return PUJA_CAT_PHOTOS[cat.id];
    var rep = PUJAS.find(function(p){ return p.id === cat.rep; });
    return rep ? pujaImg(rep) : '';
  }

  var pujaPurposeGrid = document.getElementById('pujaPurposeGrid');
  function renderPujaPurposeTiles(){
    pujaPurposeGrid.innerHTML = '';
    PUJA_CATS.forEach(function(cat){
      // <button>, not <div>: these filter the list, so they should be reachable by
      // keyboard and announced as buttons. Same reasoning as the gemstone tiles.
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'purpose-tile' + (pujaState.cat === cat.id ? ' on' : '');
      var photo = pujaCatPhoto(cat);
      el.innerHTML = (photo ? '<img src="'+photo+'" alt="" loading="lazy">' : '') +
        '<span class="pt-label">'+cat.label+'</span>';
      el.addEventListener('click', function(){
        // Tapping the tile that is already on clears it, so the tiles can be switched
        // off without hunting for the pill.
        pujaState.cat = (pujaState.cat === cat.id) ? 'all' : cat.id;
        renderPujaPurposeTiles();
        renderPujas();
        document.getElementById('puja').scrollIntoView({behavior:'smooth', block:'start'});
      });
      pujaPurposeGrid.appendChild(el);
    });
    stagger(pujaPurposeGrid.children, 70);
  }

  var pujaActiveCat = document.getElementById('pjActiveCat');
  function renderPujaActiveCat(){
    var cat = PUJA_CATS.find(function(c){ return c.id === pujaState.cat; });
    if (!cat) { pujaActiveCat.innerHTML = ''; return; }
    pujaActiveCat.innerHTML = '<button type="button" class="pj-active-cat">' +
      cat.label + '<span aria-hidden="true">&#10005;</span></button>';
    pujaActiveCat.querySelector('button').addEventListener('click', function(){
      pujaState.cat = 'all';
      renderPujaPurposeTiles();
      renderPujas();
    });
  }

  function renderPujaChips(){
    pujaChips.innerHTML = '';
    PUJA_BANDS.forEach(function(b){
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'pj-chip' + (pujaState.band === b.id ? ' on' : '');
      el.textContent = b.label;
      el.addEventListener('click', function(){ pujaState.band = b.id; renderPujaChips(); renderPujas(); });
      pujaChips.appendChild(el);
    });
  }

  function filteredPujas(){
    var q = pujaState.q.trim().toLowerCase();
    var band = PUJA_BANDS.find(function(b){ return b.id === pujaState.band; }) || PUJA_BANDS[0];
    var list = PUJAS.filter(function(p){
      // Hindi is matched too, so someone typing a Devanagari word finds the puja.
      var okQ = !q || p.n.toLowerCase().indexOf(q) !== -1 || (p.h && p.h.indexOf(pujaState.q.trim()) !== -1);
      var okCat = pujaState.cat === 'all' || (p.c && p.c.indexOf(pujaState.cat) !== -1);
      return okQ && okCat && band.test(p);
    });
    var s = pujaState.sort;
    if (s === 'price-asc')  list.sort(function(a,b){ return a.p - b.p; });
    else if (s === 'price-desc') list.sort(function(a,b){ return b.p - a.p; });
    else if (s === 'dur-asc')    list.sort(function(a,b){ return a.m - b.m; });
    else if (s === 'name')       list.sort(function(a,b){ return a.n.localeCompare(b.n); });
    return list;
  }

  function renderPujas(){
    var list = filteredPujas();
    pujaCount.textContent = list.length + (list.length === 1 ? ' puja' : ' pujas');
    renderPujaActiveCat();
    pujaGrid.innerHTML = '';
    if (!list.length){
      pujaGrid.innerHTML = '<div class="pj-empty">No puja matches that search. Try a shorter word, or clear the filter.</div>';
      return;
    }
    list.forEach(function(p){
      var card = document.createElement('div');
      card.className = 'card pj-card';
      card.innerHTML =
        '<div class="card-media" data-puja="'+p.id+'">'+
          '<img loading="lazy" src="'+pujaImg(p)+'" alt="'+escapeHtml(p.n)+'">'+
        '</div>'+
        '<div class="card-body">'+
          '<div class="card-name" data-puja="'+p.id+'">'+escapeHtml(p.n)+'</div>'+
          '<div class="pj-hi">'+escapeHtml(p.h||'')+'</div>'+
          '<div class="pj-meta">'+
            '<span class="pj-dur">&#9201; '+escapeHtml(p.d)+'</span>'+
            '<span class="price pj-price">'+pujaRupees(p.p)+'</span>'+
          '</div>'+
          '<button class="btn btn-gold btn-sm pj-book" data-puja="'+p.id+'">Book this puja</button>'+
        '</div>';
      pujaGrid.appendChild(card);
    });
    stagger(pujaGrid.children, 40, 12);
  }

  pujaGrid.addEventListener('click', function(e){
    var t = e.target.closest('[data-puja]');
    if (t) openPujaView(t.getAttribute('data-puja'));
  });
  document.getElementById('pjSearch').addEventListener('input', function(e){
    pujaState.q = e.target.value; renderPujas();
  });
  document.getElementById('pjSort').addEventListener('change', function(e){
    pujaState.sort = e.target.value; renderPujas();
  });

  var pjContent = document.getElementById('pjContent');

  function openPujaView(id){
    var p = PUJAS.find(function(x){ return x.id === id; });
    if (!p) return;
    pjContent.innerHTML =
      '<div class="pj-modal-media"><img src="'+pujaImg(p)+'" alt="'+escapeHtml(p.n)+'"></div>'+
      '<div class="pv-cat">Wani Puja</div>'+
      '<h3 class="pv-name">'+escapeHtml(p.n)+'</h3>'+
      (p.h ? '<div class="pj-hi" style="font-size:15px; margin-top:4px;">'+escapeHtml(p.h)+'</div>' : '')+
      '<div class="pj-facts">'+
        '<div class="pj-fact"><div class="pj-fact-k">Puja / anushthan time</div><div class="pj-fact-v">'+escapeHtml(p.d)+'</div></div>'+
        '<div class="pj-fact"><div class="pj-fact-k">Dakshina</div><div class="pj-fact-v price">'+pujaRupees(p.p)+'</div></div>'+
      '</div>'+
      '<ol class="pj-steps">'+
        '<li>Tell us your name, phone number and what the puja is for.</li>'+
        '<li>Our pandit calls you to fix the muhurat and confirm the samagri.</li>'+
        '<li>The puja is performed with the full vidhi, and you receive the sankalp and prasad details.</li>'+
      '</ol>'+
      '<div class="checkout-note">Nothing is charged on this page. The dakshina above is indicative and is confirmed with you on the call before anything is paid.</div>'+
      '<button class="btn btn-gold btn-full" style="margin-top:16px;" id="pjBookBtn">Request this puja</button>';
    pjContent.querySelector('#pjBookBtn').addEventListener('click', function(){ renderPujaBooking(p); });
    openModal('pjModal');
  }

  function renderPujaBooking(p){
    pjContent.innerHTML =
      '<h3 style="font-size:20px; margin-bottom:6px;">Request '+escapeHtml(p.n)+'</h3>'+
      '<p class="lede" style="font-size:14px; margin:0 0 18px;">Leave your details and our pandit will call you back to fix the muhurat and confirm the samagri and the final dakshina.</p>'+
      '<div class="field"><label for="pjName">Your name</label><input id="pjName" placeholder="Full name"></div>'+
      '<div class="field-row">'+
        '<div class="field"><label for="pjPhone">Phone number</label><input id="pjPhone" inputmode="numeric" placeholder="10-digit mobile"></div>'+
        '<div class="field"><label for="pjCity">City (optional)</label><input id="pjCity" placeholder="City"></div>'+
      '</div>'+
      '<div class="field"><label for="pjNote">Anything we should know? (optional)</label><textarea id="pjNote" rows="2" placeholder="Preferred date, birth details, what the puja is for"></textarea></div>'+
      '<div class="sum-row total"><span>'+escapeHtml(p.d)+'</span><span class="price">'+pujaRupees(p.p)+'</span></div>'+
      '<button class="btn btn-gold btn-full" style="margin-top:16px;" id="pjSendBtn">Send request on WhatsApp</button>';

    pjContent.querySelector('#pjSendBtn').addEventListener('click', function(){
      var name  = pjContent.querySelector('#pjName').value.trim();
      var phone = pjContent.querySelector('#pjPhone').value.trim();
      var city  = pjContent.querySelector('#pjCity').value.trim();
      var note  = pjContent.querySelector('#pjNote').value.trim();
      if (!name || !phone){ showToast('Please add your name and phone number'); return; }
      if (!pujaPhoneOk(phone)){ showToast('That phone number does not look right'); return; }

      var lines = [
        'Puja request from shop.astrowani.com', '',
        'Puja: ' + p.n + (p.h ? ' (' + p.h + ')' : ''),
        'Duration: ' + p.d,
        'Indicative dakshina: Rs ' + p.p.toLocaleString('en-IN'), '',
        'Name: ' + name,
        'Phone: ' + phone
      ];
      if (city) lines.push('City: ' + city);
      if (note) lines.push('Note: ' + note);
      var url = 'https://wa.me/' + PUJA_WHATSAPP + '?text=' + encodeURIComponent(lines.join(String.fromCharCode(10)));

      // window.open is blocked in some in-app webviews and returns null; falling through
      // to a same-tab navigation means the handoff still happens instead of the button
      // appearing to do nothing.
      var w = null;
      try { w = window.open(url, '_blank'); } catch (e) {}
      if (!w) window.location.href = url;

      pjContent.innerHTML =
        '<div class="confirm">'+
          '<div class="tick">&#10003;</div>'+
          '<h3 style="font-size:22px;">Request ready to send</h3>'+
          '<p class="lede" style="margin:10px auto 18px; max-width:40ch;">WhatsApp should have opened with your puja request filled in. Press send there and our pandit will call you back on <strong>'+escapeHtml(phone)+'</strong>.</p>'+
          '<p class="lede" style="margin:0 auto 18px; max-width:40ch; font-size:13.5px;">Nothing has been charged.</p>'+
          '<button class="btn btn-gold" id="pjDone">Keep browsing</button>'+
        '</div>';
      pjContent.querySelector('#pjDone').addEventListener('click', function(){ closeModal('pjModal'); });
    });
  }

  renderPujaPurposeTiles();
  renderPujaChips();
  renderPujas();

})();