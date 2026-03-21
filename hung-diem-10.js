// ── CANVAS ──────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
const video  = document.getElementById('src-video');
let W = window.innerWidth, H = window.innerHeight;
canvas.width = W; canvas.height = H;
window.addEventListener('resize', () => {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
});

// ── UI REFS ─────────────────────────────────────────────
const btnSel    = document.getElementById('btn-select');
const btnSt     = document.getElementById('btn-start');
const scoreEl   = document.getElementById('score-val');
const levelEl   = document.getElementById('level-val');
const nextLvlEl = document.getElementById('next-level-label');
const toastEl   = document.getElementById('status-toast');
const legendEl  = document.getElementById('legend');
const heartEls  = ['h1','h2','h3'].map(id => document.getElementById(id));
const setStatus = t => toastEl.textContent = t;

// ── STATE ───────────────────────────────────────────────
let state        = 'idle';
let allFaces     = [];       
let selectedFace = null;     
let playerFace   = null;     
let faceTarget   = { cx: 0, cy: 0, w: 100, h: 100 }; 
let anchorY      = 0;        
let score        = 0;
let lives        = 3;
let items        = [];
let effects      = [];
let lastSpawn    = 0;
let noFaceTimer  = 0;
let basket       = null;
let gameStartTime= 0;        
let gamePausedAt = 0;        
let currentLevel = 1;
let levelBanner  = null;
let flashColor   = null, flashAlpha = 0;

// ── LEVEL CONFIG ────────────────────────────────────────
const LEVEL_BASE = [
  null,
  { sMin:0.9, sMax:1.6, spawnMs:2200, badW:5 },
  { sMin:1.3, sMax:2.1, spawnMs:1700, badW:6 },
  { sMin:1.8, sMax:2.7, spawnMs:1300, badW:7 },
  { sMin:2.4, sMax:3.4, spawnMs:1000, badW:8 },
  { sMin:3.0, sMax:4.2, spawnMs: 800, badW:9 },
];
function lvCfg(lv) {
  if (lv >= 1 && lv <= 5) return LEVEL_BASE[lv];
  const e = lv - 5;
  const b = LEVEL_BASE[5];
  return { sMin:b.sMin+e*0.5, sMax:b.sMax+e*0.6,
           spawnMs:Math.max(450,b.spawnMs-e*55), badW:Math.min(15,b.badW+e) };
}

function elapsedSec() {
  if (!gameStartTime) return 0;
  return ((gamePausedAt || Date.now()) - gameStartTime) / 1000;
}
function calcLevel() { return Math.floor(elapsedSec() / 15) + 1; }

// ── MEDIAPIPE ───────────────────────────────────────────
async function initCamera() {
  try {
    const det = new FaceDetection({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${f}`
    });
    det.setOptions({ model:'short', minDetectionConfidence:0.35 });
    
    det.onResults(results => {
      if (!results.detections || !results.detections.length) { allFaces=[]; return; }
      allFaces = results.detections.map(d => {
        const b = d.boundingBox;
        const cx = (1 - b.xCenter) * W;
        const cy = b.yCenter * H;
        const fw = b.width * W, fh = b.height * H;
        return { cx, cy, x:cx-fw/2, y:cy-fh/2, w:fw, h:fh };
      });
      
      if (state === 'playing' && playerFace) {
        let best=null, bestD=Infinity;
        for (const f of allFaces) {
          // FIX: Bắt theo khoảng cách đường chéo (chuẩn 2 trục)
          const d = Math.hypot(f.cx - playerFace.cx, f.cy - playerFace.cy); 
          if (d < bestD) { bestD=d; best=f; }
        }
        
        if (best && (bestD < W*0.7 || allFaces.length === 1)) {
            faceTarget.cx = best.cx;
            // FIX: Độ nhạy trục Y để dễ bề trượt xuống hứng đồ
            const ySensitivity = 1.8;
            faceTarget.cy = anchorY + (best.cy - anchorY) * ySensitivity;
            // Đã khóa w, h không cho đổi theo Target để chống zoom to giỏ
        }
      }
    });
    
    const cam = new Camera(video, {
      onFrame: async () => { await det.send({ image:video }); },
      width: 640, height: 480 
    });
    await cam.start();
    setStatus('✅ Camera sẵn sàng! Nhấn "Chọn người chơi" để bắt đầu.');
    requestAnimationFrame(loop);
  } catch(e) {
    setStatus('❌ Lỗi camera: ' + e.message);
  }
}

// ── CANVAS CLICK → pick face ────────────────────────────
canvas.addEventListener('click', e => {
  if (state !== 'selecting') return;
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (W / r.width);
  const my = (e.clientY - r.top)  * (H / r.height);
  for (const f of allFaces) {
    const pad = 24;
    if (mx > f.x-pad && mx < f.x+f.w+pad && my > f.y-pad && my < f.y+f.h+pad) {
      selectedFace = f;
      btnSt.disabled = false;
      setStatus('✅ Đã chọn! Nhấn "Bắt Đầu" hoặc click lại vào mặt để thay đổi.');
      return;
    }
  }
  selectedFace = null;
  btnSt.disabled = true;
  setStatus('👆 Click vào mặt của bạn để chọn người chơi.');
});

// ── MAIN LOOP ───────────────────────────────────────────
function loop() {
  ctx.clearRect(0, 0, W, H);
  ctx.save(); ctx.translate(W,0); ctx.scale(-1,1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  if      (state==='idle')      renderIdle();
  else if (state==='selecting') renderSelecting();
  else if (state==='playing')   renderPlaying(); 
  else if (state==='gameover')  renderGameOver();

  requestAnimationFrame(loop);
}

// ── IDLE ────────────────────────────────────────────────
function renderIdle() {
  ctx.fillStyle='rgba(0,0,0,0.62)'; ctx.fillRect(0,0,W,H);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font=`bold ${Math.round(W*.088)}px Bangers,cursive`;
  ctx.fillStyle='#FFD93D';
  ctx.shadowColor='rgba(255,217,61,.45)'; ctx.shadowBlur=32;
  ctx.fillText('🎯 HỨNG ĐIỂM 10', W/2, H/2-H*.07);
  ctx.shadowBlur=0;
  ctx.font=`700 ${Math.round(W*.021)}px Nunito,sans-serif`;
  ctx.fillStyle='rgba(255,255,255,.52)';
  ctx.fillText('Nhấn "Chọn người chơi" để bắt đầu', W/2, H/2+H*.025);
  ctx.font=`600 ${Math.round(W*.015)}px Nunito,sans-serif`;
  ctx.fillStyle='rgba(255,255,255,.28)';
  ctx.fillText('Dùng đầu hứng điểm rơi — tránh số 0! Chơi vô hạn!', W/2, H/2+H*.075);
}

// ── SELECTING ───────────────────────────────────────────
function renderSelecting() {
  ctx.fillStyle='rgba(0,0,0,0.42)'; ctx.fillRect(0,0,W,H);

  if (allFaces.length === 0) {
    const sy=((Date.now()/18)%H);
    const sg=ctx.createLinearGradient(0,sy-55,0,sy+55);
    sg.addColorStop(0,'transparent'); sg.addColorStop(.5,'rgba(59,130,246,.2)'); sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg; ctx.fillRect(0,sy-55,W,110);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#FF4E4E';
    ctx.font=`bold ${Math.round(W*.032)}px Nunito,sans-serif`;
    ctx.fillText('👤 Chưa phát hiện khuôn mặt nào...', W/2, H/2-20);
    ctx.fillStyle='rgba(255,255,255,.38)';
    ctx.font=`600 ${Math.round(W*.018)}px Nunito,sans-serif`;
    ctx.fillText('Hãy đứng trước camera với đủ ánh sáng', W/2, H/2+26);
    return;
  }

  ctx.textAlign='center'; ctx.textBaseline='middle';
  const instrW = Math.min(620, W-40);
  ctx.fillStyle='rgba(0,0,0,0.6)';
  rrect(W/2-instrW/2, 14, instrW, 46, 23); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.85)';
  ctx.font=`800 ${Math.round(W*.017)}px Nunito,sans-serif`;
  ctx.fillText(`👆 Phát hiện ${allFaces.length} người — Click vào mặt để chọn người chơi`, W/2, 37);

  allFaces.forEach((f, i) => {
    const isSel = selectedFace &&
      Math.abs(f.cx - selectedFace.cx) < 20 && Math.abs(f.cy - selectedFace.cy) < 20;

    ctx.save();
    ctx.shadowColor = isSel ? '#FFD93D' : '#3b82f6';
    ctx.shadowBlur  = isSel ? 36 : 18;
    ctx.strokeStyle = isSel ? '#FFD93D' : '#60a5fa';
    ctx.lineWidth   = isSel ? 4 : 2.5;
    ctx.setLineDash(isSel ? [] : [10,5]);
    ctx.strokeRect(f.x-6, f.y-6, f.w+12, f.h+12);
    ctx.setLineDash([]);
    ctx.restore();

    const cl=18;
    ctx.strokeStyle = isSel ? '#FFD93D' : '#6BCB77';
    ctx.lineWidth = isSel ? 5 : 3.5; ctx.lineCap='round';
    [[f.x,f.y,1,1],[f.x+f.w,f.y,-1,1],[f.x,f.y+f.h,1,-1],[f.x+f.w,f.y+f.h,-1,-1]].forEach(([bx,by,dx,dy])=>{
      ctx.beginPath(); ctx.moveTo(bx,by+dy*cl); ctx.lineTo(bx,by); ctx.lineTo(bx+dx*cl,by); ctx.stroke();
    });

    const bR=22, nbx=f.x+f.w+bR*0.3, nby=f.y-bR*0.3;
    ctx.save();
    ctx.shadowColor=isSel?'#FFD93D':'#3b82f6'; ctx.shadowBlur=14;
    ctx.fillStyle=isSel?'#FFD93D':'rgba(59,130,246,.95)';
    ctx.beginPath(); ctx.arc(nbx,nby,bR,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle=isSel?'#000':'#fff';
    ctx.font=`900 ${bR}px Nunito,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(i+1, nbx, nby);

    if (isSel) drawBasket(f.cx, f.y, Math.max(110, f.w*.95));

    const txt = isSel ? '✅ ĐÃ CHỌN — Nhấn Bắt Đầu!' : `Người ${i+1} — Click để chọn`;
    const lw  = Math.max(250, txt.length * 12.5), lh = 34;
    ctx.save();
    ctx.fillStyle=isSel?'rgba(255,217,61,.95)':'rgba(30,58,138,.9)';
    ctx.shadowColor=isSel?'#FFD93D':'#3b82f6'; ctx.shadowBlur=12;
    rrect(f.cx-lw/2, f.y-62, lw, lh, 8); ctx.fill(); ctx.restore();
    ctx.fillStyle=isSel?'#000':'#fff';
    ctx.font=`bold ${Math.round(W*.013)}px Nunito,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(txt, f.cx, f.y-62+lh/2);
  });
}

// ── PLAYING ─────────────────────────────────────────────
function renderPlaying() {
  legendEl.style.opacity='0';
  if (allFaces.length > 0) noFaceTimer=0; else noFaceTimer++;

  if (playerFace && faceTarget) {
      // Tính khoảng cách để xác định gia tốc LERP
      const dist = Math.hypot(faceTarget.cx - playerFace.cx, faceTarget.cy - playerFace.cy);
      
      // GIA TỐC THÔNG MINH (Dynamic LERP)
      // Nếu lệch quá xa (vượt 8% chiều rộng màn hình) thì phi tới thật nhanh (0.4)
      // Nếu gần nhau thì trượt êm ái bình thường (0.15)
      let lerpAmt = 0.15;
      if (dist > W * 0.08) lerpAmt = 0.4; 

      playerFace.cx += (faceTarget.cx - playerFace.cx) * lerpAmt;
      playerFace.cy += (faceTarget.cy - playerFace.cy) * lerpAmt;
      
      playerFace.x = playerFace.cx - playerFace.w/2;
      playerFace.y = playerFace.cy - playerFace.h/2;
  }

  const newLv = calcLevel();
  if (newLv !== currentLevel) {
    currentLevel = newLv;
    levelEl.textContent = currentLevel;
    triggerBanner(currentLevel);
  }
  const secInLv = elapsedSec() % 15;
  nextLvlEl.textContent = Math.ceil(15 - secInLv) + 's';

  if (playerFace) {
    drawBasket(playerFace.cx, playerFace.y, Math.max(110, playerFace.w*.95));
    updateItems();
  }
  drawEffects();
  drawBanner();
  drawLevelBar();

  if (noFaceTimer > 30) {
    ctx.fillStyle='rgba(255,78,78,.95)';
    ctx.font=`bold ${Math.round(W*.022)}px Nunito,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('⚠️ Lệch mặt rồi, quay lại giữa khung hình đi!', W/2, 72);
  }
}

// ── LEVEL BANNER ────────────────────────────────────────
function triggerBanner(lv) { levelBanner={lv,alpha:1,scale:1.6,frames:90}; }
function drawBanner() {
  if (!levelBanner || levelBanner.alpha<=0) return;
  const b=levelBanner;
  b.frames--;
  b.alpha = Math.min(1,b.frames/20) * Math.min(1,b.frames/90*3);
  b.scale = 1 + 0.6*(b.frames/90);
  const lbl = b.lv<=3?['🌱 Dễ','🔥 Trung Bình','⚡ Khó'][b.lv-1]:
              b.lv===4?'💀 Rất Khó':b.lv===5?'🌪️ Điên Cuồng':`🚀 CẤP ${b.lv}`;
  ctx.save(); ctx.globalAlpha=b.alpha;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W*.25);
  g.addColorStop(0,'rgba(199,125,255,.22)'); g.addColorStop(1,'transparent');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.scale(b.scale,b.scale);
  ctx.translate(W/2/b.scale-W/2, H/2/b.scale-H/2);
  ctx.font=`bold ${Math.round(W*.072)}px Bangers,cursive`;
  ctx.fillStyle='#c77dff'; ctx.shadowColor='#c77dff'; ctx.shadowBlur=40;
  ctx.fillText(`CẤP ĐỘ ${b.lv}`, W/2, H/2-28); ctx.shadowBlur=0;
  ctx.font=`800 ${Math.round(W*.03)}px Nunito,sans-serif`;
  ctx.fillStyle='#fff'; ctx.fillText(lbl, W/2, H/2+30);
  ctx.restore();
  if (b.frames<=0) levelBanner=null;
}

// ── GAME OVER ───────────────────────────────────────────
function renderGameOver() {
  ctx.fillStyle='rgba(0,0,0,.78)'; ctx.fillRect(0,0,W,H);
  const cw=Math.min(520,W*.86), ch=350, cx2=W/2, cy2=H/2;
  ctx.save();
  ctx.shadowColor='rgba(255,217,61,.32)'; ctx.shadowBlur=52;
  ctx.fillStyle='rgba(8,8,22,.97)';
  rrect(cx2-cw/2,cy2-ch/2,cw,ch,24); ctx.fill(); ctx.restore();
  ctx.strokeStyle='rgba(255,217,61,.28)'; ctx.lineWidth=2;
  rrect(cx2-cw/2,cy2-ch/2,cw,ch,24); ctx.stroke();

  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#FFD93D';
  ctx.font=`bold ${Math.round(W*.062)}px Bangers,cursive`;
  ctx.fillText('🎮 KẾT THÚC', cx2, cy2-120);

  ctx.fillStyle='rgba(255,255,255,.38)';
  ctx.font=`700 ${Math.round(W*.015)}px Nunito,sans-serif`;
  ctx.fillText('ĐIỂM CỦA BẠN', cx2, cy2-68);

  ctx.fillStyle='#fff';
  ctx.font=`bold ${Math.round(W*.072)}px Bangers,cursive`;
  ctx.fillText(score, cx2, cy2+4);

  const el=elapsedSec(), mm=Math.floor(el/60), ss=Math.floor(el%60);
  const timeStr = mm>0?`${mm}p ${ss}s`:`${ss}s`;
  ctx.fillStyle='#c77dff';
  ctx.font=`800 ${Math.round(W*.022)}px Nunito,sans-serif`;
  ctx.fillText(`🔥 Cấp độ ${currentLevel}  •  ⏱ ${timeStr}`, cx2, cy2+64);

  const rank=score>=500?'🏆 Huyền Thoại!':score>=250?'🥇 Xuất Sắc!':score>=120?'🥈 Giỏi Lắm!':score>=50?'👍 Tốt!':'🌱 Cố Lên!';
  ctx.fillStyle='#6BCB77';
  ctx.font=`800 ${Math.round(W*.027)}px Nunito,sans-serif`;
  ctx.fillText(rank, cx2, cy2+108);

  ctx.fillStyle='rgba(255,255,255,.26)';
  ctx.font=`600 ${Math.round(W*.014)}px Nunito,sans-serif`;
  ctx.fillText('Nhấn "Chọn người chơi" để chơi lại', cx2, cy2+150);
}

// ── BASKET ──────────────────────────────────────────────
function drawBasket(cx, faceTopY, bw) {
  const bh=bw*.52, ty=faceTopY-bh-2, by=faceTopY-2;
  const topW=bw, botW=bw*.68;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx-topW/2,ty); ctx.lineTo(cx+topW/2,ty);
  ctx.lineTo(cx+botW/2,by); ctx.lineTo(cx-botW/2,by);
  ctx.closePath(); ctx.fillStyle='rgba(190,130,55,.9)'; ctx.fill(); 
  for(let i=1;i<5;i++){
    const t=i/5, y2=ty+(by-ty)*t;
    ctx.beginPath(); ctx.moveTo(cx-topW/2+(topW/2-botW/2)*t,y2); ctx.lineTo(cx+topW/2-(topW/2-botW/2)*t,y2);
    ctx.strokeStyle=i%2===0?'rgba(100,55,15,.65)':'rgba(230,165,70,.3)'; ctx.lineWidth=1.5; ctx.stroke();
  }
  for(let i=0;i<=8;i++){
    const t=i/8; ctx.beginPath();
    ctx.moveTo(cx-topW/2+topW*t,ty); ctx.lineTo(cx-botW/2+botW*t,by);
    ctx.strokeStyle='rgba(100,55,15,.5)'; ctx.lineWidth=1.2; ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(cx-topW/2-7,ty); ctx.lineTo(cx+topW/2+7,ty);
  ctx.strokeStyle='#5C3317'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-topW/2-7,ty-1); ctx.lineTo(cx+topW/2+7,ty-1);
  ctx.strokeStyle='rgba(255,200,100,.38)'; ctx.lineWidth=3; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-topW/2,ty); ctx.lineTo(cx+topW/2,ty);
  ctx.lineTo(cx+botW/2,by); ctx.lineTo(cx-botW/2,by); ctx.closePath();
  ctx.strokeStyle='#8B4513'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.restore();
  basket={cx,ty,by,topW,botW};
}

// ── ITEMS ───────────────────────────────────────────────
const pick = arr => {
  const tot=arr.reduce((s,t)=>s+t.weight,0); let r=Math.random()*tot;
  for(const t of arr){r-=t.weight;if(r<=0)return t;} return arr[arr.length-1];
};

function spawnItem() {
  const c=lvCfg(currentLevel);
  const defs=[
    {label:'10', value:10, bg:'#14532d',border:'#4ade80',txt:'#fbbf24',weight:6},
    {label:'5',  value:5,  bg:'#1e3a8a',border:'#60a5fa',txt:'#fff',   weight:5},
    {label:'0',  value:0,  bg:'#7f1d1d',border:'#ef4444',txt:'#fff',   weight:c.badW,bad:true},
    {label:'+20',value:20, bg:'#4c1d95',border:'#c77dff',txt:'#fff',   weight:1},
  ];
  const t=pick(defs), r=Math.round(24+W*.011);
  items.push({...t, x:r+Math.random()*(W-r*2), y:-r, r,
    speed:c.sMin+Math.random()*(c.sMax-c.sMin),
    rot:Math.random()*Math.PI*2, rotSpd:(Math.random()-.5)*.045});
}

function updateItems() {
  const now = Date.now(), c = lvCfg(currentLevel);
  if (now - lastSpawn > c.spawnMs) { spawnItem(); lastSpawn = now; }
  if (!basket) return;
  const { cx: bCX, ty: bTY, by: bBY, topW, botW } = basket;
  
  let isDead = false; 

  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it) continue;

    it.y += it.speed; 
    it.rot += it.rotSpd;
    
    // Collision
    if (it.y + it.r > bTY && it.y - it.r < bBY) {
      const t = Math.max(0, Math.min(1, (it.y - bTY) / (bBY - bTY)));
      const hw = (topW / 2) * (1 - t) + (botW / 2) * t;
      if (it.x > bCX - hw && it.x < bCX + hw) {
        if (it.bad) {
          lives = Math.max(0, lives - 1);
          updateHeartsUI(); flashScreen('#FF4E4E');
          showEff(it.x, it.y, '-1 ❤️', '#ef4444');
          if (lives <= 0) isDead = true; 
        } else {
          score += it.value; scoreEl.textContent = score;
          showEff(it.x, it.y, '+' + it.value + ' ⭐', '#FFD93D');
        }
        items.splice(i, 1); continue;
      }
    }
    if (it.y - it.r > H) { items.splice(i, 1); continue; }
    
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    ctx.beginPath(); ctx.arc(0, 0, it.r, 0, Math.PI * 2);
    ctx.fillStyle = it.bg; ctx.fill();
    ctx.strokeStyle = it.border; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = it.txt;
    ctx.font = `900 ${Math.round(it.r * .86)}px Nunito,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(it.label, 0, 1); ctx.restore();
  }

  if (isDead) endGame();
}

// ── LEVEL PROGRESS BAR ──────────────────────────────────
function drawLevelBar() {
  if (!gameStartTime) return;
  const secInLv=elapsedSec()%15, prog=secInLv/15;
  const c=lvCfg(currentLevel);
  const bw=Math.round(W*.22), bh=10, bx=W/2-bw/2, by2=H-48;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='rgba(255,255,255,.36)';
  ctx.font=`600 ${Math.round(W*.012)}px Nunito,sans-serif`;
  ctx.fillText(`⚡ Lv.${currentLevel}  •  tốc độ ${((c.sMin+c.sMax)/2).toFixed(1)}×  •  cấp tiếp: ${Math.ceil(15-secInLv)}s`,W/2,by2-14);
  ctx.fillStyle='rgba(255,255,255,.1)'; rrect(bx,by2,bw,bh,5); ctx.fill();
  const lp=Math.min(1,(currentLevel-1)/6);
  const col=`rgb(${Math.round(120+135*lp)},${Math.round(80-80*lp)},${Math.round(255-200*lp)})`;
  ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=10;
  rrect(bx,by2,bw*prog,bh,5); ctx.fill(); ctx.shadowBlur=0; ctx.restore();
}

// ── EFFECTS ─────────────────────────────────────────────
function flashScreen(c){flashColor=c;flashAlpha=0.38;}
function showEff(x,y,text,color){effects.push({x,y,text,color,alpha:1,vy:-4,frames:65});}
function drawEffects(){
  if(flashAlpha>0){
    ctx.fillStyle=flashColor+Math.round(flashAlpha*255).toString(16).padStart(2,'0');
    ctx.fillRect(0,0,W,H); flashAlpha-=0.032;
  }
  for(let i=effects.length-1;i>=0;i--){
    const e=effects[i]; e.y+=e.vy; e.vy*=.9; e.alpha-=1/e.frames;
    if(e.alpha<=0){effects.splice(i,1);continue;}
    ctx.save(); ctx.globalAlpha=e.alpha; ctx.fillStyle=e.color;
    ctx.font=`bold ${Math.round(W*.026)}px Nunito,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.shadowColor=e.color; ctx.shadowBlur=12;
    ctx.fillText(e.text,e.x,e.y); ctx.restore();
  }
}

// ── HEARTS ──────────────────────────────────────────────
function updateHeartsUI(){
  heartEls.forEach((el,i)=>{
    if(i<lives){el.classList.remove('lost');el.textContent='❤️';}
    else{el.classList.add('lost');el.textContent='🖤';}
  });
}
function resetHeartsUI(){heartEls.forEach(el=>{el.classList.remove('lost');el.textContent='❤️';});}

// ── UTIL ────────────────────────────────────────────────
function rrect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

// ── GAME CONTROL ────────────────────────────────────────
function startGame() {
  if (!selectedFace) return;
  playerFace = { ...selectedFace }; 
  faceTarget = { ...selectedFace };
  
  anchorY = selectedFace.cy; 
  
  score=0; lives=3;
  items=[]; effects=[]; noFaceTimer=0; basket=null; levelBanner=null;
  lastSpawn=Date.now(); gameStartTime=Date.now(); gamePausedAt=0; currentLevel=1;
  scoreEl.textContent='0'; levelEl.textContent='1'; nextLvlEl.textContent='15s';
  resetHeartsUI(); legendEl.style.opacity='0';
  state='playing'; btnSel.disabled=true; btnSt.disabled=true;
  setStatus('🎮 Dùng đầu hứng điểm — tránh số 0! Độ khó tăng mỗi 15 giây!');
}

function endGame() {
  gamePausedAt = Date.now();
  state='gameover'; items=[]; effects=[];
  btnSel.disabled=false; btnSt.disabled=true;
  legendEl.style.opacity='1';
  setStatus('🏁 Kết thúc! Nhấn "Chọn người chơi" để chơi lại.');
}

btnSel.addEventListener('click', () => {
  items=[]; effects=[]; playerFace=null; selectedFace=null; basket=null; levelBanner=null;
  score=0; lives=3; currentLevel=1; gameStartTime=0; gamePausedAt=0;
  scoreEl.textContent='0'; levelEl.textContent='1'; nextLvlEl.textContent='15s';
  resetHeartsUI(); legendEl.style.opacity='1';
  state='selecting'; btnSt.disabled=true;
  setStatus('👆 Click vào mặt của bạn trên màn hình để chọn người chơi.');
});

btnSt.addEventListener('click', () => {
  if (state==='selecting' && selectedFace) startGame();
});

initCamera();