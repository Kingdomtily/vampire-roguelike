/* ==========================================================================
   CRIMSON REQUIEM — a vampire-themed action roguelike
   Single-file game engine. Pure canvas 2D, no external assets/libraries.
   ========================================================================== */
"use strict";

/* ============================== CONSTANTS =============================== */
const CW = 1152, CH = 648;               // internal canvas resolution
const STEP = 1000 / 60;                  // fixed update step (ms) -> "frames" are 60fps units
const DODGE_BASE_FRAMES = 30;            // base dodge duration in frames
const DODGE_IFRAME_FRAMES = 12;          // invulnerable frames within the dodge
const ROOM_COUNT = 10;                   // rooms before the boss
const PIX = 3;                           // base pixel-art unit size (px snapping)

const PALETTES = {
  dracul:   { body:"#5a1420", dark:"#2a0810", accent:"#c81c2e", cloth:"#1c1c22", eye:"#ff3b4a" },
  lilith:   { body:"#2a0f45", dark:"#150822", accent:"#a855f7", cloth:"#1a1024", eye:"#d9b8ff" },
  vex:      { body:"#0d2b2b", dark:"#061616", accent:"#2dd4bf", cloth:"#101c1c", eye:"#7cf7e8" },
  moroi:    { body:"#3a3226", dark:"#1c1810", accent:"#8b0020", cloth:"#26221a", eye:"#ff8a3d" },
  shade:    { body:"#241127", dark:"#0f0714", accent:"#6b21a8", cloth:"#150a18", eye:"#c084fc" },
  wraith:   { body:"#1a1030", dark:"#0a0616", accent:"#8b2fd6", cloth:"#120a20", eye:"#e9d5ff" },
  hound:    { body:"#231018", dark:"#0e0609", accent:"#b91c4a", cloth:"#160a0e", eye:"#ff5577" },
  specter:  { body:"#0f1a2e", dark:"#060c18", accent:"#3b82f6", cloth:"#0a1220", eye:"#bfdbfe" },
  boss:     { body:"#2b0714", dark:"#12030a", accent:"#e11d48", cloth:"#1a0510", eye:"#ff1744" },
};

/* =============================== UTILITIES =============================== */
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};
const snap = (v) => Math.round(v / 2) * 2;
function weightedPick(entries) { // entries: [{w, v}]
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) { if ((r -= e.w) <= 0) return e.v; }
  return entries[entries.length - 1].v;
}

/* =============================== CANVAS SETUP ============================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

/* =============================== INPUT ==================================== */
const Input = {
  keys: new Set(),
  mouseX: CW / 2, mouseY: CH / 2,
  mouseDown: { left: false, right: false },
  pressedLight: false, pressedHeavy: false, pressedDodge: false,
  pressedTab: false, pressedEscape: false,
  init() {
    window.addEventListener("keydown", (e) => {
      if (["Tab", " ", "Escape"].includes(e.key)) e.preventDefault();
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) {
        if (k === " ") this.pressedDodge = true;
        if (k === "tab") this.pressedTab = true;
        if (k === "escape") this.pressedEscape = true;
      }
      this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) * (CW / r.width);
      this.mouseY = (e.clientY - r.top) * (CH / r.height);
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { this.mouseDown.left = true; this.pressedLight = true; }
      if (e.button === 2) { this.mouseDown.right = true; this.pressedHeavy = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown.left = false;
      if (e.button === 2) this.mouseDown.right = false;
    });
    window.addEventListener("blur", () => { this.keys.clear(); this.mouseDown.left = false; this.mouseDown.right = false; });
  },
  consume() {
    this.pressedLight = false; this.pressedHeavy = false; this.pressedDodge = false;
    this.pressedTab = false; this.pressedEscape = false;
  },
  down(...names) { return names.some(n => this.keys.has(n)); }
};
Input.init();

/* =============================== CAMERA / PROJECTION ====================== */
// Pseudo-isometric: world is a top-down plane; render compresses Y for a
// zoomed-out, angled "look down at the plaza" feel without touching gameplay math.
const ISO_Y = 0.66;
const Camera = { x: 0, y: 0, zoom: 1 };
function worldToScreen(wx, wy) {
  const sx = (wx - Camera.x) * Camera.zoom + CW / 2;
  const sy = (wy - Camera.y) * ISO_Y * Camera.zoom + CH / 2;
  return [sx, sy];
}
function updateCamera(room, focusX, focusY) {
  const halfW = (CW / 2) / Camera.zoom;
  const halfH = (CH / 2) / (ISO_Y * Camera.zoom);
  Camera.x = clamp(focusX, room.bounds.x0 + halfW, room.bounds.x1 - halfW);
  Camera.y = clamp(focusY, room.bounds.y0 + halfH, room.bounds.y1 - halfH);
  if (room.bounds.x1 - room.bounds.x0 < halfW * 2) Camera.x = (room.bounds.x0 + room.bounds.x1) / 2;
  if (room.bounds.y1 - room.bounds.y0 < halfH * 2) Camera.y = (room.bounds.y0 + room.bounds.y1) / 2;
}

/* =============================== PIXEL-ART PRIMITIVES ====================== */
// Blocky rect/circle helpers snapped to a small grid so hand-drawn vector
// shapes read as pixel art rather than smooth vector art.
function pRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x / PIX) * PIX, Math.round(y / PIX) * PIX, Math.ceil(w / PIX) * PIX, Math.ceil(h / PIX) * PIX);
}
function pCircle(cx, cy, r, color) {
  ctx.fillStyle = color;
  const steps = Math.max(4, Math.round(r / PIX));
  for (let i = -steps; i <= steps; i++) {
    const yy = i * PIX;
    const frac = 1 - (yy * yy) / (r * r);
    if (frac < 0) continue;
    const w = Math.ceil(Math.sqrt(frac) * r / PIX) * PIX;
    ctx.fillRect(Math.round((cx - w) / PIX) * PIX, Math.round((cy + yy) / PIX) * PIX, w * 2, PIX);
  }
}

/* =============================== PARTICLES ================================ */
const Particles = {
  list: [],
  emit(x, y, opts = {}) {
    const n = opts.n || 1;
    for (let i = 0; i < n; i++) {
      const ang = opts.angle !== undefined ? opts.angle + rand(-0.4, 0.4) : rand(0, Math.PI * 2);
      const spd = rand(opts.minSpd ?? 20, opts.maxSpd ?? 80);
      this.list.push({
        x, y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd * ISO_Y,
        life: 0, maxLife: opts.life ?? rand(300, 600),
        size: opts.size ?? rand(3, 7),
        color: opts.color || "#7c3aed",
        glow: opts.glow !== false,
        grav: opts.grav ?? 0,
      });
    }
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
      p.vy += (p.grav || 0) * dt / 1000;
      p.vx *= 0.96; p.vy *= 0.96;
    }
  },
  render() {
    for (const p of this.list) {
      const t = 1 - p.life / p.maxLife;
      const [sx, sy] = worldToScreen(p.x, p.y);
      ctx.globalAlpha = clamp(t, 0, 1);
      if (p.glow) {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.size * 2.2);
        g.addColorStop(0, p.color); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, p.size * 2.2 * t + 1, 0, 7); ctx.fill();
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(sx, sy, p.size * t + 1, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }
  }
};

/* =============================== FLOATING TEXT ============================= */
const Floaters = { list: [] };
function spawnFloater(wx, wy, text, color) {
  Floaters.list.push({ wx, wy, text, color: color || "#fff", life: 0, maxLife: 800 });
}
function updateFloaters(dt) {
  for (let i = Floaters.list.length - 1; i >= 0; i--) {
    const f = Floaters.list[i]; f.life += dt;
    if (f.life > f.maxLife) Floaters.list.splice(i, 1);
  }
}
function renderFloaters() {
  ctx.textAlign = "center"; ctx.font = "bold 15px Georgia";
  for (const f of Floaters.list) {
    const t = f.life / f.maxLife;
    const [sx, sy] = worldToScreen(f.wx, f.wy - t * 34);
    ctx.globalAlpha = clamp(1 - t, 0, 1);
    ctx.fillStyle = "#000"; ctx.fillText(f.text, sx + 1, sy + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy);
  }
  ctx.globalAlpha = 1;
}

/* =============================== CREATURE RENDERER =========================
   Procedural blocky "pixel art" humanoid/creature drawing. Everything is
   drawn fresh each frame from a small parameter set + animation phase, so a
   single function yields dozens of visually distinct, animated actors. */
function drawShadowBlob(sx, sy, r) {
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
}

// spec: {pal, height, width, shape, weapon, hasCape, hasHorns, glow, scale}
function drawCreature(wx, wy, spec, anim) {
  const [sx, syFeet] = worldToScreen(wx, wy);
  const pal = spec.pal;
  const scale = spec.scale ?? 1;
  const H = (spec.height ?? 30) * scale;   // total body height in px
  const W = (spec.width ?? 16) * scale;
  const bob = anim.hurt ? 0 : Math.sin(anim.walkPhase) * (anim.moving ? 2 : 0.4) * scale;
  const facing = anim.facing ?? 1; // 1 = right, -1 = left
  const legSwing = anim.moving ? Math.sin(anim.walkPhase) * 6 * scale : 0;
  const hitFlash = anim.hitFlashT > 0;
  const deathT = anim.deathT || 0; // 0..1

  drawShadowBlob(sx, syFeet + 2, W * 0.6 * (1 - deathT * 0.5));
  if (deathT >= 1) return;

  ctx.save();
  ctx.translate(sx, syFeet - bob - H * (1 - deathT));
  if (deathT > 0) { ctx.globalAlpha = 1 - deathT; ctx.rotate((facing) * deathT * 1.2); }
  ctx.scale(facing, 1);

  const col = (c) => hitFlash ? "#ffffff" : c;

  // legs
  pRect(-W * 0.32, H * 0.42 + Math.abs(legSwing) * 0.1, W * 0.24, H * 0.30, col(pal.dark));
  pRect(W * 0.08, H * 0.42 - Math.abs(legSwing) * 0.1, W * 0.24, H * 0.30, col(pal.dark));

  // cape
  if (spec.hasCape) {
    ctx.save();
    ctx.globalAlpha *= 0.92;
    const sway = Math.sin(anim.walkPhase * 0.7 + 1) * 4 * scale;
    pRect(-W * 0.5 - 2, H * 0.02, W * 0.22, H * 0.55 + sway, col(pal.dark));
    ctx.restore();
  }

  // torso
  pRect(-W * 0.4, H * 0.08, W * 0.8, H * 0.4, col(pal.body));
  pRect(-W * 0.4, H * 0.08, W * 0.8, H * 0.09, col(pal.cloth));

  // arms + weapon (weapon drawn by caller via anim.weaponDraw hook for players)
  const armSwing = anim.attackT !== undefined ? anim.attackSwing || 0 : Math.sin(anim.walkPhase + 3) * 4 * scale;
  pRect(W * 0.32, H * 0.14 + armSwing, W * 0.16, H * 0.28, col(pal.body));
  pRect(-W * 0.48, H * 0.14 - armSwing * 0.6, W * 0.16, H * 0.28, col(pal.body));

  // head
  const headR = W * 0.34;
  pCircle(0, H * 0.02, headR, col(pal.body));
  if (spec.hasHorns) {
    pRect(-headR * 0.7, -headR * 1.5 + H * 0.02, PIX, headR, col(pal.dark));
    pRect(headR * 0.3, -headR * 1.5 + H * 0.02, PIX, headR, col(pal.dark));
  }
  // eyes (glow)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = pal.eye;
  ctx.globalAlpha = 0.95;
  ctx.fillRect(Math.round((headR * 0.15) / PIX) * PIX, Math.round((H * 0.0) / PIX) * PIX, PIX * 1.4, PIX);
  ctx.restore();

  ctx.restore();

  if (spec.weaponDraw) spec.weaponDraw(sx, syFeet - bob - H * (1 - deathT), facing, anim, scale);

  if (spec.aura) {
    const [ax, ay] = [sx, syFeet - H * 0.35];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(ax, ay, 0, ax, ay, W * 1.1);
    g.addColorStop(0, spec.aura); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.35 + Math.sin(anim.walkPhase * 2) * 0.08;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ax, ay, W * 1.1, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* Draw a simple pixel weapon swept along an arc, used for player weapon visuals. */
function drawWeaponSwing(sx, sy, facing, weapon, swingT, style) {
  // swingT: 0..1 progress through the active swing; style: {arcFrom,arcTo,range,color,shape}
  if (swingT === undefined || swingT === null) return;
  const ang = lerp(style.arcFrom, style.arcTo, clamp(swingT, 0, 1)) * facing;
  const len = style.range;
  const ex = sx + Math.cos(ang) * len;
  const ey = sy - len * 0.15 + Math.sin(ang) * len * ISO_Y;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width || 4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(sx, sy - len * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.beginPath(); ctx.arc(ex, ey, (style.width || 4) * 0.9, 0, 7);
  ctx.fillStyle = style.color; ctx.fill();
  ctx.restore();
  return [ex, ey];
}

/* =============================== WEAPONS =================================== */
// Each weapon defines light/heavy timing (ms) and a combo table keyed by the
// input sequence string ("L","LL","LLL","H","LH","LLH","HH"...). Damage
// multipliers apply to the wielder's (strength or magic) power stat.
const WEAPONS = {
  longsword: {
    id: "longsword", name: "Cursed Longsword", icon: "sword",
    range: 62, arc: 1.9, color: "#c81c2e", power: "strength",
    light: { windup: 90, active: 110, recover: 160 },
    heavy: { windup: 220, active: 140, recover: 260 },
    combos: {
      L:   { name: "Slash", mult: 1.0, knockback: 60 },
      LL:  { name: "Cross Slash", mult: 1.15, knockback: 70 },
      LLL: { name: "Whirling End", mult: 1.5, knockback: 140, aoe: true },
      H:   { name: "Overhead Cleave", mult: 1.8, knockback: 160, stagger: true },
      LH:  { name: "Rising Cleave", mult: 1.7, knockback: 180, launch: true },
      HH:  { name: "Executioner's Fall", mult: 2.3, knockback: 220, stagger: true },
    },
    desc: "A balanced blade steeped in old blood. Reliable arcs, honest damage.",
  },
  daggers: {
    id: "daggers", name: "Twin Blood Daggers", icon: "daggers",
    range: 42, arc: 2.4, color: "#a855f7", power: "magic",
    light: { windup: 55, active: 70, recover: 90 },
    heavy: { windup: 160, active: 90, recover: 180 },
    combos: {
      L:   { name: "Bite", mult: 0.65, knockback: 20 },
      LL:  { name: "Double Bite", mult: 0.7, knockback: 20 },
      LLL: { name: "Flurry", mult: 0.85, knockback: 30, hits: 2 },
      LLLL:{ name: "Crimson Flurry", mult: 1.1, knockback: 60, lifesteal: 0.12 },
      H:   { name: "Puncture", mult: 1.3, knockback: 40, armorPierce: true },
      LH:  { name: "Vein Split", mult: 1.2, knockback: 50, bleed: true },
    },
    desc: "Twin fangs of black glass. Fast, vicious, and thirsty for return blood.",
  },
  rapier: {
    id: "rapier", name: "Shadow Rapier", icon: "rapier",
    range: 78, arc: 1.1, color: "#2dd4bf", power: "strength",
    light: { windup: 70, active: 90, recover: 120 },
    heavy: { windup: 190, active: 120, recover: 210 },
    combos: {
      L:   { name: "Thrust", mult: 0.95, knockback: 30 },
      LL:  { name: "Riposte", mult: 1.05, knockback: 30 },
      LLL: { name: "Fleche", mult: 1.3, knockback: 40, dash: true },
      LLLL:{ name: "Nightfall Skewer", mult: 1.6, knockback: 80, dash: true },
      H:   { name: "Impale", mult: 1.7, knockback: 90, armorPierce: true },
      LH:  { name: "Parry Break", mult: 1.5, knockback: 100, stagger: true },
    },
    desc: "A duelist's blade drawn from shadow. Long reach, relentless footwork.",
  },
  warhammer: {
    id: "warhammer", name: "Bone Warhammer", icon: "hammer",
    range: 70, arc: 3.1, color: "#8b0020", power: "strength",
    light: { windup: 180, active: 130, recover: 220 },
    heavy: { windup: 340, active: 160, recover: 340 },
    combos: {
      L:   { name: "Crush", mult: 1.4, knockback: 160, aoe: true },
      LL:  { name: "Backswing", mult: 1.5, knockback: 180, aoe: true },
      H:   { name: "Earthbreaker", mult: 2.6, knockback: 260, aoe: true, stagger: true },
      LH:  { name: "Grave Slam", mult: 2.2, knockback: 300, aoe: true, stagger: true },
    },
    desc: "A mausoleum door's hinge, reforged as a hammer. Slow. Absolute.",
  },
  scythe: {
    id: "scythe", name: "Nightfall Scythe", icon: "scythe",
    range: 74, arc: 3.4, color: "#6b21a8", power: "magic",
    light: { windup: 130, active: 140, recover: 170 },
    heavy: { windup: 260, active: 150, recover: 260 },
    combos: {
      L:   { name: "Reap", mult: 1.1, knockback: 40, aoe: true, pull: true },
      LL:  { name: "Wide Reap", mult: 1.2, knockback: 50, aoe: true, pull: true },
      LLL: { name: "Harvest Circle", mult: 1.6, knockback: 90, aoe: true, pull: true },
      H:   { name: "Soul Draw", mult: 1.9, knockback: 60, aoe: true, lifesteal: 0.15 },
    },
    desc: "It does not cut. It collects. Wide, pulling arcs of purple ruin.",
  },
  claws: {
    id: "claws", name: "Grave Claws", icon: "claws",
    range: 38, arc: 2.6, color: "#e11d48", power: "strength",
    light: { windup: 45, active: 60, recover: 70 },
    heavy: { windup: 150, active: 80, recover: 160 },
    combos: {
      L: { name: "Rake", mult: 0.55, knockback: 15, bleed: true },
      LL: { name: "Rend", mult: 0.6, knockback: 15, bleed: true },
      LLL: { name: "Frenzy", mult: 0.65, knockback: 20, bleed: true },
      LLLL: { name: "Feral Frenzy", mult: 0.7, knockback: 25, bleed: true },
      LLLLL: { name: "Ravenous Maw", mult: 1.4, knockback: 100, lifesteal: 0.2 },
      H: { name: "Talon Strike", mult: 1.2, knockback: 50, bleed: true },
    },
    desc: "Grave-dirt beneath black talons. Shred, shred, shred, then feast.",
  },
};

/* =============================== CHARACTERS ================================ */
const CHARACTERS = [
  {
    id: "dracul", name: "Dracul, the Revenant", pal: PALETTES.dracul, weapon: "longsword",
    stats: { vigor: 6, strength: 7, magic: 3, speed: 4 },
    desc: "A fallen knight-lord clawed his way out of his own tomb. Balanced and relentless.",
    hasCape: true, hasHorns: false,
  },
  {
    id: "lilith", name: "Lilith, the Bloodmage", pal: PALETTES.lilith, weapon: "daggers",
    stats: { vigor: 3, strength: 3, magic: 9, speed: 5 },
    desc: "She traded her heartbeat for power long ago. Devastating magic, a fragile frame.",
    hasCape: true, hasHorns: false,
  },
  {
    id: "vex", name: "Vex, the Nightblade", pal: PALETTES.vex, weapon: "rapier",
    stats: { vigor: 4, strength: 5, magic: 4, speed: 8 },
    desc: "A quicksilver assassin who dances between heartbeats. Lives on evasion.",
    hasCape: false, hasHorns: false,
  },
  {
    id: "moroi", name: "Moroi, the Warlord", pal: PALETTES.moroi, weapon: "warhammer",
    stats: { vigor: 9, strength: 8, magic: 1, speed: 2 },
    desc: "An ancient warlord bound in grave-iron. Slow to move. Impossible to stop.",
    hasCape: false, hasHorns: true,
  },
];

/* =============================== ITEMS / BOONS ============================= */
// Two families: flat stat vials (raise a base stat) and ability boons (flags
// consumed by combat/movement code, mirrored in player.mods).
const STAT_ITEMS = [
  { id: "vial_vigor", name: "Vial of Vigor", icon: "vial_red", stat: "vigor", amount: 2,
    desc: "Thick, dark blood. Raises Vigor." },
  { id: "whetstone", name: "Warrior's Whetstone", icon: "vial_gold", stat: "strength", amount: 2,
    desc: "Grave-iron grit. Raises Strength." },
  { id: "grimoire", name: "Grimoire Page", icon: "vial_purple", stat: "magic", amount: 2,
    desc: "Ink that still moves. Raises Magic." },
  { id: "cloak", name: "Wind-Touched Cloak", icon: "vial_teal", stat: "speed", amount: 2,
    desc: "Stitched from stolen midnight. Raises Speed." },
];

const BOONS = [
  { id: "crimson_thirst", name: "Crimson Thirst", icon: "boon_thirst",
    desc: "Light attacks heal 4% of damage dealt.", mod: { lifestealLight: 0.04 } },
  { id: "black_bloom", name: "Black Bloom", icon: "boon_bloom",
    desc: "Heavy attacks bloom a lingering pool of corruption.", mod: { heavyPool: true } },
  { id: "executioners_mark", name: "Executioner's Mark", icon: "boon_mark",
    desc: "Combo finishers deal +30% damage to wounded foes.", mod: { executeBonus: 0.3 } },
  { id: "twilight_step", name: "Twilight Step", icon: "boon_step",
    desc: "Dodging releases a burst of shadow at your starting point.", mod: { dodgeBurst: true } },
  { id: "feral_momentum", name: "Feral Momentum", icon: "boon_momentum",
    desc: "Landing hits briefly quickens your stride.", mod: { momentumStacks: true } },
  { id: "bat_swarm", name: "Bat Swarm", icon: "boon_bats",
    desc: "Dodging releases 3 homing bats that bite for magic damage.", mod: { dodgeBats: true } },
  { id: "iron_skin", name: "Iron Skin", icon: "boon_skin",
    desc: "Contact damage taken is reduced by 18%.", mod: { damageReduction: 0.18 } },
  { id: "vampiric_surge", name: "Vampiric Surge", icon: "boon_surge",
    desc: "Slaying an enemy restores 5% of your max Vigor.", mod: { killHeal: 0.05 } },
];

const WEAPON_POOL_PICKUPS = ["longsword", "daggers", "rapier", "warhammer", "scythe", "claws"];

/* =============================== ENEMY TYPES ================================ */
const ENEMY_TYPES = {
  shade_grunt: {
    id: "shade_grunt", name: "Shade Grunt", pal: PALETTES.shade, kind: "melee",
    baseHP: 34, baseDmg: 9, baseSpeed: 62, radius: 15, height: 30, width: 16,
    range: 40, windup: 350, active: 160, recover: 420, telegraph: "#c084fc",
    variants: {
      normal: {},
      brute:    { hpMul: 2.4, dmgMul: 1.6, spdMul: 0.72, scaleMul: 1.45, name: "Shade Brute" },
      sprinter: { hpMul: 0.6, dmgMul: 0.8, spdMul: 1.6, scaleMul: 0.85, name: "Shade Sprinter" },
    },
  },
  wraith: {
    id: "wraith", name: "Wraith Archer", pal: PALETTES.wraith, kind: "ranged",
    baseHP: 24, baseDmg: 8, baseSpeed: 50, radius: 14, height: 28, width: 14,
    range: 340, windup: 500, active: 200, recover: 700, keepDistance: 220, telegraph: "#8b2fd6",
    variants: {
      normal: {},
      frost: { hpMul: 1.0, dmgMul: 0.8, spdMul: 1.0, name: "Frost Wraith", slow: true, tint: "#60a5fa" },
      blood: { hpMul: 1.2, dmgMul: 1.0, spdMul: 1.0, name: "Blood Wraith", lifesteal: true, tint: "#f43f5e" },
    },
  },
  hound: {
    id: "hound", name: "Shadow Hound", pal: PALETTES.hound, kind: "melee",
    baseHP: 14, baseDmg: 6, baseSpeed: 130, radius: 11, height: 18, width: 20,
    range: 30, windup: 180, active: 120, recover: 260, telegraph: "#fb7185", pack: true,
    variants: { normal: {}, alpha: { hpMul: 2, dmgMul: 1.4, spdMul: 1.1, scaleMul: 1.3, name: "Alpha Hound" } },
  },
  specter: {
    id: "specter", name: "Specter", pal: PALETTES.specter, kind: "teleport",
    baseHP: 20, baseDmg: 10, baseSpeed: 40, radius: 13, height: 26, width: 14,
    range: 46, windup: 300, active: 160, recover: 900, teleportEvery: 2600, telegraph: "#3b82f6",
    variants: { normal: {}, warped: { hpMul: 1.3, dmgMul: 1.2, name: "Warped Specter", teleportEvery: 1800 } },
  },
  boss: {
    id: "boss", name: "Nosferatu Prime", pal: PALETTES.boss, kind: "boss",
    baseHP: 620, baseDmg: 22, baseSpeed: 66, radius: 30, height: 54, width: 30,
    range: 90, windup: 500, active: 220, recover: 500, telegraph: "#e11d48",
    variants: { normal: {} },
  },
};

/* =============================== ROOM DECOR THEMES ========================= */
const ROOM_THEMES = ["plaza", "alley", "graveyard", "market", "courtyard"];

/* =============================== ICONS ====================================== */
// Tiny generic canvas icons used across HUD / item screen / door choice cards.
function makeIcon(kind, color) {
  const c = document.createElement("canvas"); c.width = 32; c.height = 32;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.fillStyle = "#0e0509"; g.fillRect(0, 0, 32, 32);
  g.strokeStyle = "#3a1030"; g.strokeRect(0.5, 0.5, 31, 31);
  g.fillStyle = color || "#a855f7";
  g.save(); g.translate(16, 16);
  switch (kind) {
    case "vial": g.fillRect(-4, -8, 8, 14); g.fillRect(-2, -12, 4, 5);
      g.fillStyle = "rgba(255,255,255,0.5)"; g.fillRect(-4, 0, 8, 5); break;
    case "boon": g.beginPath(); g.moveTo(0, -11); g.lineTo(9, 0); g.lineTo(0, 11); g.lineTo(-9, 0); g.closePath(); g.fill(); break;
    case "weapon": g.fillRect(-2, -12, 4, 18); g.fillRect(-7, 4, 14, 4); g.fillStyle = "#d4af37"; g.fillRect(-2, 8, 4, 5); break;
    case "heal": g.fillRect(-2, -10, 4, 20); g.fillRect(-10, -2, 20, 4); break;
    case "skull": g.beginPath(); g.arc(0, -2, 9, 0, 7); g.fill(); g.fillRect(-6, 4, 12, 6);
      g.fillStyle = "#000"; g.fillRect(-5, -4, 3, 4); g.fillRect(2, -4, 3, 4); break;
    case "gate": g.fillRect(-9, -11, 18, 22); g.fillStyle = "#000"; g.fillRect(-6, -8, 5, 16); g.fillRect(1, -8, 5, 16); break;
    default: g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
  }
  g.restore();
  return c;
}
function iconFor(entry) {
  if (entry.stat) return makeIcon("vial", { vigor: "#c81c2e", strength: "#d4af37", magic: "#a855f7", speed: "#2dd4bf" }[entry.stat]);
  if (WEAPONS[entry.id]) return makeIcon("weapon", entry.color);
  return makeIcon("boon", "#a855f7");
}

/* =============================== STATUS EFFECTS ============================= */
function applyStatus(target, type, opts) {
  target.status = target.status || {};
  target.status[type] = { ...opts, t: opts.duration };
}
function tickStatuses(target, dt) {
  if (!target.status) return;
  for (const key of Object.keys(target.status)) {
    const s = target.status[key];
    s.t -= dt;
    if (key === "bleed" && s.t > 0) {
      s.tickAcc = (s.tickAcc || 0) + dt;
      if (s.tickAcc >= 500) { s.tickAcc -= 500; damageEnemy(target, s.dps * 0.5, { noFlash: true, source: "bleed" }); }
    }
    if (s.t <= 0) delete target.status[key];
  }
}
function speedMult(target) {
  if (target.status && target.status.slow) return 0.5;
  return 1;
}

/* =============================== WORLD ENTITY CONTAINERS ==================== */
let ENEMIES = [], PROJECTILES = [], POOLS = [], PORTALS = [];
let nextEntityId = 1;

/* =============================== PLAYER ====================================== */
function createPlayer(character) {
  const st = { ...character.stats };
  const p = {
    id: nextEntityId++, isPlayer: true, charId: character.id, pal: character.pal,
    hasCape: character.hasCape, hasHorns: character.hasHorns,
    x: 0, y: 0, radius: 14,
    stats: st,
    maxHp: Math.round(50 + st.vigor * 9), hp: 0,
    weapon: character.weapon,
    aimAngle: 0, facing: 1, moveX: 0, moveY: 0, moving: false, walkPhase: 0,
    attackState: "idle", attackTimer: 0, comboKey: "", comboBuffer: "", pendingInput: null,
    comboResetTimer: 0, hitRegistry: new Set(), attackSwingT: 0,
    dodging: false, dodgeFrame: 0, dodgeTotalFrames: 0, dodgeDirX: 0, dodgeDirY: 0, dodgeCooldown: 0,
    hitFlashT: 0, invulnT: 0, items: [], mods: {}, momentum: 0, momentumTimer: 0,
    dashT: 0, dashDirX: 0, dashDirY: 0, dashSpeed: 0,
    kills: 0, roomsCleared: 0,
  };
  p.hp = p.maxHp;
  recalcMods(p);
  return p;
}
function recalcMods(p) {
  const mods = {};
  for (const it of p.items) if (it.mod) for (const k in it.mod) {
    if (typeof it.mod[k] === "number") mods[k] = (mods[k] || 0) + it.mod[k];
    else mods[k] = it.mod[k];
  }
  p.mods = mods;
}
function playerMoveSpeed(p) { return (150 + p.stats.speed * 10) * speedMult(p) * (1 + (p.momentum || 0) * 0.05); }
function playerPower(p, weapon) { return weapon.power === "magic" ? p.stats.magic : p.stats.strength; }

function screenPosOf(ent) { return worldToScreen(ent.x, ent.y); }

function updateAimAngle(p) {
  const [sx, sy] = screenPosOf(p);
  const dx = (Input.mouseX - sx) / Camera.zoom;
  const dy = (Input.mouseY - (sy - 18)) / (ISO_Y * Camera.zoom);
  p.aimAngle = Math.atan2(dy, dx);
  p.facing = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
}

function weaponDef(p) { return WEAPONS[p.weapon]; }

function tryStartAttack(p, kind) {
  if (p.dodging) return;
  if (p.attackState === "idle") {
    p.comboBuffer = kind; startSwing(p, p.comboBuffer);
  } else if (p.attackState === "recover" || (p.attackState === "active" && p.attackPhaseT / p.attackPhaseDur > 0.55)) {
    p.pendingInput = kind;
  }
}
function startSwing(p, comboKey) {
  const w = weaponDef(p);
  let data = w.combos[comboKey];
  if (!data) { comboKey = comboKey; data = w.combos[comboKey[comboKey.length - 1]] || w.combos["L"]; }
  const timing = comboKey.endsWith("H") ? w.heavy : w.light;
  p.comboKey = comboKey;
  p.comboData = data;
  p.attackState = "windup";
  p.attackPhaseT = 0;
  p.attackPhaseDur = timing.windup;
  p.timing = timing;
  p.hitRegistry.clear();
  p.pendingInput = null;
  p.comboResetTimer = 900;
}
function advanceAttack(p, dtMs) {
  if (p.attackState === "idle") { if (p.comboResetTimer > 0) { p.comboResetTimer -= dtMs; if (p.comboResetTimer <= 0) p.comboBuffer = ""; } return; }
  p.attackPhaseT += dtMs;
  if (p.attackState === "windup") {
    p.attackSwingT = 0;
    if (p.attackPhaseT >= p.attackPhaseDur) {
      p.attackState = "active"; p.attackPhaseT = 0; p.attackPhaseDur = p.timing.active;
      resolvePlayerHit(p);
    }
  } else if (p.attackState === "active") {
    p.attackSwingT = clamp(p.attackPhaseT / p.attackPhaseDur, 0, 1);
    if (p.attackPhaseT >= p.attackPhaseDur) {
      p.attackState = "recover"; p.attackPhaseT = 0; p.attackPhaseDur = p.timing.recover;
    }
  } else if (p.attackState === "recover") {
    if (p.attackPhaseT >= p.attackPhaseDur) {
      if (p.pendingInput) {
        const nextKey = p.comboBuffer + p.pendingInput;
        const w = weaponDef(p);
        if (w.combos[nextKey]) { p.comboBuffer = nextKey; startSwing(p, nextKey); }
        else { p.comboBuffer = p.pendingInput; startSwing(p, p.comboBuffer); }
      } else {
        p.attackState = "idle"; p.comboResetTimer = 900;
      }
    }
  }
}
function attackMoveMult(p) {
  if (p.attackState === "windup") return p.comboKey.endsWith("H") ? 0.15 : 0.55;
  if (p.attackState === "active") return p.comboKey.endsWith("H") ? 0.05 : 0.35;
  return 1;
}

function resolvePlayerHit(p) {
  const w = weaponDef(p);
  const combo = p.comboData;
  const power = playerPower(p, w);
  const base = 7 + power * 2.7;
  let dmg = base * combo.mult;
  const targets = ENEMIES.filter(e => e.state !== "dead");
  const hitAng = p.aimAngle;
  for (const e of targets) {
    const d = dist(p.x, p.y, e.x, e.y);
    const range = w.range + e.radius;
    if (d > range) continue;
    if (!combo.aoe) {
      const a = angleTo(p.x, p.y, e.x, e.y);
      if (angleDiff(a, hitAng) > w.arc / 2) continue;
    }
    if (p.hitRegistry.has(e.id) && !combo.hits) continue;
    p.hitRegistry.add(e.id);
    let finalDmg = dmg;
    if (p.mods.executeBonus && (e.hp / e.maxHp) < 0.3) finalDmg *= (1 + p.mods.executeBonus);
    if (combo.armorPierce) finalDmg *= 1.1;
    damageEnemy(e, finalDmg, { knockback: combo.knockback, fromX: p.x, fromY: p.y, pull: combo.pull, stagger: combo.stagger });
    if (combo.bleed) applyStatus(e, "bleed", { dps: power * 0.5, duration: 3000 });
    let heal = 0;
    if (combo.lifesteal) heal += finalDmg * combo.lifesteal;
    if (p.mods.lifestealLight && p.comboKey[0] === "L") heal += finalDmg * p.mods.lifestealLight;
    if (heal > 0) { p.hp = clamp(p.hp + heal, 0, p.maxHp); spawnFloater(p.x, p.y - 20, `+${heal.toFixed(0)}`, "#3fce6e"); }
    if (e.state === "dead" && p.mods.killHeal) { p.hp = clamp(p.hp + p.maxHp * p.mods.killHeal, 0, p.maxHp); }
    grantMomentum(p);
    const [ex, ey] = [e.x, e.y];
    Particles.emit(ex, ey, { n: 6, color: w.color, life: 350, minSpd: 40, maxSpd: 140, size: 4 });
    Particles.emit(ex, ey, { n: 4, color: "#000000", life: 420, minSpd: 20, maxSpd: 80, size: 5, glow: false });
  }
  if (combo.dash) { p.dashT = 160; p.dashDirX = Math.cos(hitAng); p.dashDirY = Math.sin(hitAng); p.dashSpeed = 420; }
  if (p.mods.heavyPool && p.comboKey.endsWith("H")) {
    const px = p.x + Math.cos(hitAng) * 40, py = p.y + Math.sin(hitAng) * 40;
    POOLS.push({ x: px, y: py, r: 60, t: 3000, maxT: 3000, dps: power * 0.6, tickAcc: 0 });
  }
  // swing visual particles regardless of hit
  const [tipx, tipy] = [p.x + Math.cos(hitAng) * w.range * 0.8, p.y + Math.sin(hitAng) * w.range * 0.8 * ISO_Y];
  Particles.emit(tipx, tipy, { n: 3, color: w.color, life: 260, size: 3 });
}
function grantMomentum(p) {
  if (!p.mods.momentumStacks) return;
  p.momentum = clamp((p.momentum || 0) + 1, 0, 5);
  p.momentumTimer = 2000;
}

function tryStartDodge(p) {
  if (p.dodging || p.dodgeCooldown > 0) return;
  p.dodging = true; p.dodgeFrame = 0;
  p.dodgeTotalFrames = DODGE_BASE_FRAMES + Math.floor(p.stats.speed / 2);
  let dx = p.moveX, dy = p.moveY;
  if (dx === 0 && dy === 0) { dx = Math.cos(p.aimAngle); dy = Math.sin(p.aimAngle); }
  const len = Math.hypot(dx, dy) || 1;
  p.dodgeDirX = dx / len; p.dodgeDirY = dy / len;
  const dodgeDistance = 130 + p.stats.speed * 9;
  p.dodgeSpeed = dodgeDistance / (p.dodgeTotalFrames * (STEP / 1000));
  p.attackState = "idle"; p.comboBuffer = ""; p.pendingInput = null;
  if (p.mods.dodgeBurst) {
    Particles.emit(p.x, p.y, { n: 18, color: "#3b0764", life: 500, minSpd: 60, maxSpd: 220, size: 6 });
    for (const e of ENEMIES) if (e.state !== "dead" && dist(p.x, p.y, e.x, e.y) < 90) damageEnemy(e, 10 + p.stats.magic * 1.5, { knockback: 120, fromX: p.x, fromY: p.y });
  }
  if (p.mods.dodgeBats) {
    const nearby = ENEMIES.filter(e => e.state !== "dead").sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y)).slice(0, 3);
    for (const target of nearby) PROJECTILES.push({ id: nextEntityId++, x: p.x, y: p.y, homing: target.id, speed: 260, dmg: 6 + p.stats.magic * 1.2, radius: 8, color: "#c084fc", friendly: true, life: 2000 });
  }
}
function updateDodge(p, dtMs) {
  if (!p.dodging) { if (p.dodgeCooldown > 0) p.dodgeCooldown -= dtMs; return; }
  const step = p.dodgeSpeed * (dtMs / 1000);
  p.x += p.dodgeDirX * step; p.y += p.dodgeDirY * step;
  p.dodgeFrame += dtMs / STEP;
  p.invulnT = p.dodgeFrame < DODGE_IFRAME_FRAMES ? 999 : 0;
  if (Math.random() < 0.5) Particles.emit(p.x, p.y, { n: 1, color: "#2a0f45", life: 300, minSpd: 5, maxSpd: 30, size: 5 });
  if (p.dodgeFrame >= p.dodgeTotalFrames) {
    p.dodging = false; p.invulnT = 0; p.dodgeCooldown = 120;
  }
}

/* =============================== ENEMIES ===================================== */
function createEnemy(typeId, variantId, x, y, difficulty) {
  const def = ENEMY_TYPES[typeId];
  const v = def.variants[variantId] || {};
  const hpMul = (v.hpMul ?? 1) * (1 + difficulty * 0.22);
  const dmgMul = (v.dmgMul ?? 1) * (1 + difficulty * 0.12);
  const spdMul = v.spdMul ?? 1;
  const scaleMul = v.scaleMul ?? 1;
  const maxHp = Math.round(def.baseHP * hpMul);
  return {
    id: nextEntityId++, isPlayer: false, typeId, variantId, def, v,
    name: v.name || def.name, pal: def.pal, tint: v.tint,
    x, y, radius: def.radius * scaleMul, height: def.height, width: def.width, scale: scaleMul,
    maxHp, hp: maxHp, dmg: def.baseDmg * dmgMul, speed: def.baseSpeed * spdMul,
    state: "idle", timer: rand(0, 300), aimAngle: 0, facing: 1, walkPhase: rand(0, 6),
    hitFlashT: 0, deathT: 0, moving: false,
    teleportTimer: def.teleportEvery || 0,
    keepDistance: def.keepDistance,
    slowOnHit: !!v.slow, lifestealOnHit: !!v.lifesteal,
    bossPhase: typeId === "boss" ? 1 : undefined,
    attackHitApplied: false,
  };
}
function damageEnemy(e, dmg, opts = {}) {
  if (e.state === "dead") return;
  e.hp -= dmg;
  if (!opts.noFlash) { e.hitFlashT = 140; spawnFloater(e.x, e.y - e.height * 0.6, dmg.toFixed(0), "#ffdf6b"); }
  if (opts.knockback && opts.fromX !== undefined) {
    const a = angleTo(opts.fromX, opts.fromY, e.x, e.y);
    const dir = opts.pull ? a + Math.PI : a;
    const kb = opts.pull ? Math.min(opts.knockback, 40) : opts.knockback;
    e.x += Math.cos(dir) * kb * 0.14; e.y += Math.sin(dir) * kb * 0.14 * ISO_Y;
  }
  if (opts.stagger && e.typeId !== "boss") { e.state = "stagger"; e.timer = 380; }
  else if (opts.stagger && e.typeId === "boss") { e.timer = Math.max(0, e.timer - 250); }
  if (e.hp <= 0 && e.state !== "dead") {
    e.hp = 0; e.state = "dead"; e.deathT = 0.0001;
    RUN.player.kills++;
    Particles.emit(e.x, e.y, { n: 14, color: "#6b21a8", life: 500, minSpd: 30, maxSpd: 160, size: 5 });
  }
}
function damagePlayer(p, dmg, opts = {}) {
  if (p.invulnT > 0 || p.hp <= 0) return;
  let d = dmg;
  if (p.mods.damageReduction) d *= (1 - p.mods.damageReduction);
  p.hp = clamp(p.hp - d, 0, p.maxHp);
  p.hitFlashT = 160;
  spawnFloater(p.x, p.y - 24, `-${d.toFixed(0)}`, "#ff5566");
  if (opts.knockback && opts.fromX !== undefined) {
    const a = angleTo(opts.fromX, opts.fromY, p.x, p.y);
    p.x += Math.cos(a) * opts.knockback * 0.1; p.y += Math.sin(a) * opts.knockback * 0.1 * ISO_Y;
  }
  if (opts.slow) applyStatus(p, "slow", { duration: 1600 });
  screenShake(opts.knockback ? Math.min(10, opts.knockback / 20) : 4);
}

function facePoint(e, tx, ty) { e.aimAngle = angleTo(e.x, e.y, tx, ty); e.facing = Math.cos(e.aimAngle) >= 0 ? 1 : -1; }

function updateEnemy(e, dtMs, room) {
  tickStatuses(e, dtMs);
  if (e.hitFlashT > 0) e.hitFlashT -= dtMs;
  if (e.state === "dead") { e.deathT = clamp(e.deathT + dtMs / 500, 0, 1); return; }
  const p = RUN.player;
  const d = dist(e.x, e.y, p.x, p.y);
  const spd = e.speed * speedMult(e);
  e.moving = false;

  if (e.state === "stagger") {
    e.timer -= dtMs; if (e.timer <= 0) e.state = "idle";
    return;
  }

  if (e.def.kind === "teleport") {
    e.teleportTimer -= dtMs;
    if (e.teleportTimer <= 0 && e.state !== "windup" && e.state !== "attack") {
      const a = rand(0, Math.PI * 2), r = rand(70, 140);
      e.x = clamp(p.x + Math.cos(a) * r, room.bounds.x0 + 30, room.bounds.x1 - 30);
      e.y = clamp(p.y + Math.sin(a) * r, room.bounds.y0 + 30, room.bounds.y1 - 30);
      e.teleportTimer = e.def.teleportEvery;
      Particles.emit(e.x, e.y, { n: 10, color: "#3b82f6", life: 400 });
    }
  }

  if (e.def.kind === "ranged") {
    facePoint(e, p.x, p.y);
    if (e.state === "idle" || e.state === "approach") {
      if (d < e.keepDistance * 0.75) { e.x -= Math.cos(e.aimAngle) * spd * dtMs / 1000; e.y -= Math.sin(e.aimAngle) * spd * dtMs / 1000 * ISO_Y; e.moving = true; }
      else if (d > e.keepDistance * 1.3) { e.x += Math.cos(e.aimAngle) * spd * dtMs / 1000; e.y += Math.sin(e.aimAngle) * spd * dtMs / 1000 * ISO_Y; e.moving = true; }
      if (d <= e.def.range) { e.state = "windup"; e.timer = e.def.windup; }
      else e.state = "approach";
    } else if (e.state === "windup") {
      e.timer -= dtMs;
      if (e.timer <= 0) {
        e.state = "attack"; e.timer = e.def.active;
        facePoint(e, p.x, p.y);
        PROJECTILES.push({ id: nextEntityId++, x: e.x, y: e.y, vx: Math.cos(e.aimAngle) * 180, vy: Math.sin(e.aimAngle) * 180 * ISO_Y, dmg: e.dmg, radius: 8, color: e.def.telegraph, life: 2500, slow: e.slowOnHit, lifesteal: e.lifestealOnHit, ownerEnemy: e.id });
      }
    } else if (e.state === "attack") {
      e.timer -= dtMs; if (e.timer <= 0) { e.state = "recover"; e.timer = e.def.recover; }
    } else if (e.state === "recover") {
      e.timer -= dtMs; if (e.timer <= 0) e.state = "idle";
    }
    e.walkPhase += dtMs / 140;
    return;
  }

  // melee / hound / boss share this pattern
  facePoint(e, p.x, p.y);
  if (e.state === "idle" || e.state === "approach") {
    if (d > e.def.range * 0.85) {
      e.x += Math.cos(e.aimAngle) * spd * dtMs / 1000; e.y += Math.sin(e.aimAngle) * spd * dtMs / 1000 * ISO_Y;
      e.moving = true; e.state = "approach";
    } else { e.state = "windup"; e.timer = e.def.windup; }
  } else if (e.state === "windup") {
    e.timer -= dtMs;
    if (e.timer <= 0) { e.state = "attack"; e.timer = e.def.active; e.attackHitApplied = false; facePoint(e, p.x, p.y); }
  } else if (e.state === "attack") {
    e.timer -= dtMs;
    if (!e.attackHitApplied) {
      const dd = dist(e.x, e.y, p.x, p.y);
      if (dd <= e.def.range + p.radius) { damagePlayer(p, e.dmg, { knockback: 90, fromX: e.x, fromY: e.y, slow: e.slowOnHit }); e.attackHitApplied = true;
        if (e.lifestealOnHit) e.hp = Math.min(e.maxHp, e.hp + e.dmg * 0.4); }
    }
    if (e.timer <= 0) { e.state = "recover"; e.timer = e.def.recover; }
  } else if (e.state === "recover") {
    e.timer -= dtMs; if (e.timer <= 0) e.state = "idle";
  }
  e.walkPhase += dtMs / (e.def.kind === "melee" && e.def.pack ? 90 : 130);

  if (e.typeId === "boss") updateBossPhase(e, room);
}

function updateBossPhase(e, room) {
  const ratio = e.hp / e.maxHp;
  if (e.bossPhase === 1 && ratio <= 0.66) {
    e.bossPhase = 2; e.dmg *= 1.15;
    for (let i = 0; i < 2; i++) room.enemies.push(createEnemy("hound", "normal", e.x + rand(-60, 60), e.y + rand(-60, 60), room.difficulty));
    spawnFloater(e.x, e.y - 70, "ENRAGING", "#e11d48");
  }
  if (e.bossPhase === 2 && ratio <= 0.33) {
    e.bossPhase = 3; e.dmg *= 1.2; e.def = { ...e.def, windup: e.def.windup * 0.75, recover: e.def.recover * 0.7 };
    spawnFloater(e.x, e.y - 70, "FURY", "#e11d48");
  }
}

/* =============================== SCREEN SHAKE ================================ */
let ShakeMag = 0;
function screenShake(mag) { ShakeMag = Math.min(18, ShakeMag + mag); }
function updateShake(dt) { ShakeMag = Math.max(0, ShakeMag - dt * 0.02); }

/* =============================== PROJECTILES & POOLS ========================= */
function updateProjectiles(dtMs, room) {
  for (let i = PROJECTILES.length - 1; i >= 0; i--) {
    const pr = PROJECTILES[i];
    pr.life -= dtMs;
    if (pr.homing) {
      const target = ENEMIES.find(e => e.id === pr.homing && e.state !== "dead");
      if (target) { const a = angleTo(pr.x, pr.y, target.x, target.y); pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed * ISO_Y; }
    }
    pr.x += pr.vx * dtMs / 1000; pr.y += pr.vy * dtMs / 1000;
    let dead = pr.life <= 0;
    if (pr.friendly) {
      for (const e of ENEMIES) {
        if (e.state === "dead") continue;
        if (dist(pr.x, pr.y, e.x, e.y) <= pr.radius + e.radius) { damageEnemy(e, pr.dmg, { knockback: 30, fromX: pr.x, fromY: pr.y }); dead = true; break; }
      }
    } else {
      const p = RUN.player;
      if (dist(pr.x, pr.y, p.x, p.y) <= pr.radius + p.radius) { damagePlayer(p, pr.dmg, { knockback: 60, fromX: pr.x, fromY: pr.y, slow: pr.slow });
        const owner = ENEMIES.find(e => e.id === pr.ownerEnemy); if (pr.lifesteal && owner) owner.hp = Math.min(owner.maxHp, owner.hp + pr.dmg * 0.5);
        dead = true; }
    }
    if (room && (pr.x < room.bounds.x0 - 40 || pr.x > room.bounds.x1 + 40 || pr.y < room.bounds.y0 - 40 || pr.y > room.bounds.y1 + 40)) dead = true;
    if (dead) PROJECTILES.splice(i, 1);
  }
  for (let i = POOLS.length - 1; i >= 0; i--) {
    const pool = POOLS[i]; pool.t -= dtMs;
    if (pool.t <= 0) { POOLS.splice(i, 1); continue; }
    pool.tickAcc += dtMs;
    if (pool.tickAcc >= 400) {
      pool.tickAcc -= 400;
      for (const e of ENEMIES) if (e.state !== "dead" && dist(pool.x, pool.y, e.x, e.y) <= pool.r) damageEnemy(e, pool.dps * 0.4, { noFlash: true });
    }
  }
}
function renderProjectiles() {
  for (const pr of PROJECTILES) {
    const [sx, sy] = worldToScreen(pr.x, pr.y);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr.radius * 2.4);
    g.addColorStop(0, pr.color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, pr.radius * 2.4, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = pr.color; ctx.beginPath(); ctx.arc(sx, sy, pr.radius * 0.6, 0, 7); ctx.fill();
  }
}
function renderPools() {
  for (const pool of POOLS) {
    const [sx, sy] = worldToScreen(pool.x, pool.y);
    ctx.save(); ctx.globalAlpha = 0.4 * clamp(pool.t / pool.maxT, 0, 1); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, pool.r);
    g.addColorStop(0, "#6b21a8"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, pool.r, pool.r * ISO_Y, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* =============================== COLLISION HELPERS =========================== */
function separateCircles(ax, ay, ar, bx, by, br, pushA, pushB) {
  const d = dist(ax, ay, bx, by);
  const minD = ar + br;
  if (d > 0 && d < minD) {
    const overlap = (minD - d) / 2;
    const nx = (ax - bx) / d, ny = (ay - by) / d;
    return { ax: ax + nx * overlap * pushA, ay: ay + ny * overlap * pushA, bx: bx - nx * overlap * pushB, by: by - ny * overlap * pushB };
  }
  return null;
}
function clampToRoom(ent, room, margin) {
  ent.x = clamp(ent.x, room.bounds.x0 + margin, room.bounds.x1 - margin);
  ent.y = clamp(ent.y, room.bounds.y0 + margin, room.bounds.y1 - margin);
}

/* =============================== ROOM GENERATION ============================= */
const ENEMY_UNLOCK_TABLE = [
  { minIndex: 0, entries: [{ w: 5, id: "shade_grunt", variant: "normal" }, { w: 2, id: "hound", variant: "normal" }] },
  { minIndex: 2, entries: [{ w: 2, id: "shade_grunt", variant: "sprinter" }, { w: 2, id: "wraith", variant: "normal" }] },
  { minIndex: 4, entries: [{ w: 2, id: "shade_grunt", variant: "brute" }, { w: 2, id: "wraith", variant: "frost" }, { w: 2, id: "hound", variant: "alpha" }] },
  { minIndex: 6, entries: [{ w: 2, id: "specter", variant: "normal" }, { w: 2, id: "wraith", variant: "blood" }] },
  { minIndex: 8, entries: [{ w: 2, id: "specter", variant: "warped" }, { w: 2, id: "shade_grunt", variant: "brute" }] },
];
function enemyPoolFor(index) {
  let pool = [];
  for (const tier of ENEMY_UNLOCK_TABLE) if (index >= tier.minIndex) pool = pool.concat(tier.entries);
  return pool;
}
function pickReward(exclude) {
  const cat = weightedPick([{ w: 3, v: "stat" }, { w: 2, v: "boon" }, { w: 2, v: "weapon" }, { w: 1, v: "heal" }]);
  if (cat === "stat") { const it = choice(STAT_ITEMS); return { category: "stat", item: it }; }
  if (cat === "boon") {
    const avail = BOONS.filter(b => !exclude.some(x => x.id === b.id));
    if (avail.length === 0) return { category: "stat", item: choice(STAT_ITEMS) };
    return { category: "boon", item: choice(avail) };
  }
  if (cat === "weapon") { const wid = choice(WEAPON_POOL_PICKUPS); return { category: "weapon", item: WEAPONS[wid] }; }
  return { category: "heal", item: { id: "heal", name: "Blood Respite", desc: "Restore to full Vigor.", icon: "heal" } };
}
function generateRoom(index) {
  const difficulty = index * 0.18;
  const isEvent = (index === 2 || index === 5 || index === 8);
  const w = randInt(1200, 1500), h = randInt(920, 1150);
  const bounds = { x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2 };
  const theme = choice(ROOM_THEMES);
  let spawns = [];
  if (!isEvent) {
    const count = 2 + Math.floor(index / 2) + (index >= 9 ? 1 : 0);
    const pool = enemyPoolFor(index);
    const packBudget = { hound: 3 };
    let i = 0;
    while (i < count) {
      const pick = weightedPick(pool.map(e => ({ w: e.w, v: e })));
      const isPack = ENEMY_TYPES[pick.id].pack;
      const n = isPack ? Math.min(3, count - i) : 1;
      for (let k = 0; k < n; k++) spawns.push({ id: pick.id, variant: pick.variant });
      i += n;
    }
  }
  const decor = [];
  const decorCount = randInt(5, 9);
  for (let i = 0; i < decorCount; i++) {
    decor.push({
      type: choice(["carriage", "crate", "statue", "rubble", "bloodpool", "deadtree", "barrel"]),
      x: rand(bounds.x0 + 60, bounds.x1 - 60), y: rand(bounds.y0 + 60, bounds.y1 - 90),
      rot: rand(-0.2, 0.2), scale: rand(0.8, 1.3),
    });
  }
  return { index, isEvent, bounds, theme, spawns, decor, difficulty, cleared: isEvent, portalsActive: isEvent };
}
function generateBossRoom() {
  const bounds = { x0: -720, y0: -520, x1: 720, y1: 520 };
  return { index: ROOM_COUNT, isEvent: false, isBoss: true, bounds, theme: "graveyard", spawns: [{ id: "boss", variant: "normal" }], decor: [
    { type: "statue", x: bounds.x0 + 110, y: bounds.y0 + 110, rot: 0, scale: 1.6 },
    { type: "statue", x: bounds.x1 - 110, y: bounds.y0 + 110, rot: 0, scale: 1.6 },
    { type: "statue", x: bounds.x0 + 110, y: bounds.y1 - 110, rot: 0, scale: 1.6 },
    { type: "statue", x: bounds.x1 - 110, y: bounds.y1 - 110, rot: 0, scale: 1.6 },
    { type: "rubble", x: bounds.x0 + 200, y: bounds.y1 - 140, rot: 0.1, scale: 1.3 },
    { type: "rubble", x: bounds.x1 - 200, y: bounds.y1 - 140, rot: -0.1, scale: 1.3 },
    { type: "bloodpool", x: 0, y: bounds.y0 + 220, rot: 0, scale: 1.6 },
  ], difficulty: ROOM_COUNT * 0.2, cleared: false, portalsActive: false };
}

let CURRENT_ROOM = null;
let FLOOR_CACHE = null;
function buildFloorTexture(room) {
  const w = room.bounds.x1 - room.bounds.x0, h = room.bounds.y1 - room.bounds.y0;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w); c.height = Math.ceil(h * ISO_Y) + 4;
  const g = c.getContext("2d");
  const tones = {
    plaza: ["#2a2430", "#332b38", "#241f2a"], alley: ["#201a24", "#2a222f", "#191420"],
    graveyard: ["#1c2420", "#232c27", "#161d19"], market: ["#2e2620", "#382e26", "#221b17"],
    courtyard: ["#242a2e", "#2c3236", "#1c2124"],
  }[room.theme];
  g.fillStyle = tones[0]; g.fillRect(0, 0, c.width, c.height);
  const tile = 26;
  for (let ty = 0; ty < c.height; ty += tile) {
    for (let tx = 0; tx < c.width; tx += tile) {
      g.fillStyle = choice(tones);
      const jitter = 3;
      g.fillRect(tx + rand(-jitter, jitter), ty + rand(-jitter, jitter), tile - 3, tile - 3);
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1;
  for (let ty = 0; ty <= c.height; ty += tile) { g.beginPath(); g.moveTo(0, ty); g.lineTo(c.width, ty); g.stroke(); }
  for (let tx = 0; tx <= c.width; tx += tile) { g.beginPath(); g.moveTo(tx, 0); g.lineTo(tx, c.height); g.stroke(); }
  // purple vignette wash to tie into the vampiric palette
  const vg = g.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.6);
  vg.addColorStop(0, "rgba(60,20,80,0)"); vg.addColorStop(1, "rgba(10,3,10,0.55)");
  g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function drawDecor(d) {
  const [sx, sy] = worldToScreen(d.x, d.y);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.rot); ctx.scale(d.scale, d.scale);
  const shadowW = { carriage: 46, crate: 18, statue: 20, rubble: 26, bloodpool: 0, deadtree: 14, barrel: 14 }[d.type];
  if (shadowW) drawShadowBlob(0, 6, shadowW);
  switch (d.type) {
    case "carriage":
      pRect(-40, -30, 80, 26, "#241a14"); pRect(-40, -30, 80, 6, "#3a2a1e");
      pCircle(-26, 0, 12, "#120c08"); pCircle(22, 0, 12, "#120c08");
      pCircle(-26, 0, 5, "#3a2a1e"); pCircle(22, 0, 5, "#3a2a1e");
      pRect(-46, -40, 10, 20, "#1a120c"); break;
    case "crate": pRect(-14, -20, 28, 22, "#3a2a1c"); pRect(-14, -20, 28, 4, "#2a1e14"); pRect(-2, -20, 3, 22, "#2a1e14"); break;
    case "barrel": pCircle(0, -10, 13, "#33241a"); pRect(-13, -10, 26, 14, "#33241a"); pRect(-13, -2, 26, 2, "#1c130d"); break;
    case "statue": pRect(-16, -46, 32, 12, "#3a3540"); pRect(-10, -34, 20, 34, "#302b36"); pCircle(0, -40, 9, "#3a3540"); break;
    case "rubble": pRect(-20, -10, 40, 12, "#28242c"); pRect(-10, -18, 22, 10, "#332e38"); break;
    case "bloodpool": ctx.globalAlpha = 0.55; pCircle(0, 0, 22, "#3a0410"); ctx.globalAlpha = 1; break;
    case "deadtree": pRect(-4, -50, 8, 50, "#1c1712"); pRect(-24, -50, 16, 4, "#1c1712"); pRect(8, -42, 18, 4, "#1c1712"); break;
  }
  ctx.restore();
}

const RUN = { character: null, player: null, rooms: [], roomIndex: 0 };

function loadRoom(room) {
  CURRENT_ROOM = room;
  FLOOR_CACHE = buildFloorTexture(room);
  ENEMIES = []; PROJECTILES = []; POOLS = []; PORTALS = [];
  for (const s of room.spawns) {
    let x, y;
    if (room.isBoss) { x = 0; y = room.bounds.y0 + 160; }
    else {
      const rh = room.bounds.y1 - room.bounds.y0;
      x = rand(room.bounds.x0 + 100, room.bounds.x1 - 100);
      y = rand(room.bounds.y0 + 80, room.bounds.y0 + rh * 0.55);
    }
    ENEMIES.push(createEnemy(s.id, s.variant, x, y, room.difficulty));
  }
  const p = RUN.player;
  p.x = 0; p.y = room.bounds.y1 - 70;
  p.dodging = false; p.attackState = "idle"; p.comboBuffer = "";
  if (room.portalsActive) spawnRoomPortals(room);
  updateCamera(room, p.x, p.y);
}
function spawnRoomPortals(room) {
  if (room.isBoss) return; // boss room has no exit portals; winning ends the run
  if (room.index === ROOM_COUNT - 1) { PORTALS = [{ x: 0, y: room.bounds.y0 + 60, boss: true }]; return; }
  const rA = pickReward(RUN.player.items);
  const rB = pickReward(RUN.player.items.concat([rA.item]));
  PORTALS = [
    { x: room.bounds.x0 + 90, y: room.bounds.y0 + 70, reward: rA },
    { x: room.bounds.x1 - 90, y: room.bounds.y0 + 70, reward: rB },
  ];
}
function checkRoomClear(room) {
  if (room.cleared) return;
  if (ENEMIES.every(e => e.state === "dead")) { room.cleared = true; room.portalsActive = true; spawnRoomPortals(room); }
}
function applyReward(reward) {
  const p = RUN.player;
  if (reward.category === "stat") { p.stats[reward.item.stat] += reward.item.amount; if (reward.item.stat === "vigor") { p.maxHp = Math.round(50 + p.stats.vigor * 9); p.hp = Math.min(p.maxHp, p.hp + reward.item.amount * 9); } p.items.push(reward.item); }
  else if (reward.category === "boon") { p.items.push(reward.item); recalcMods(p); }
  else if (reward.category === "weapon") { p.weapon = reward.item.id; }
  else if (reward.category === "heal") { p.hp = p.maxHp; }
  spawnFloater(p.x, p.y - 30, reward.item.name, "#d4af37");
}
function advanceToNextRoom(reward) {
  if (reward) applyReward(reward);
  RUN.player.roomsCleared++;
  RUN.roomIndex++;
  if (RUN.roomIndex >= ROOM_COUNT) {
    const bossRoom = generateBossRoom();
    RUN.rooms.push(bossRoom);
    loadRoom(bossRoom);
  } else {
    const room = generateRoom(RUN.roomIndex);
    RUN.rooms.push(room);
    loadRoom(room);
  }
}

/* =============================== PLAYER UPDATE =============================== */
function updatePlayer(p, dtMs, room) {
  updateAimAngle(p);
  if (p.hitFlashT > 0) p.hitFlashT -= dtMs;
  if (p.invulnT > 0 && !p.dodging) p.invulnT -= dtMs;
  if (p.momentumTimer > 0) { p.momentumTimer -= dtMs; if (p.momentumTimer <= 0 && p.momentum > 0) { p.momentum--; p.momentumTimer = p.momentum > 0 ? 700 : 0; } }
  tickStatuses(p, dtMs);

  let mx = 0, my = 0;
  if (Input.down("w", "arrowup")) my -= 1;
  if (Input.down("s", "arrowdown")) my += 1;
  if (Input.down("a", "arrowleft")) mx -= 1;
  if (Input.down("d", "arrowright")) mx += 1;
  const mlen = Math.hypot(mx, my);
  if (mlen > 0) { mx /= mlen; my /= mlen; }
  p.moveX = mx; p.moveY = my; p.moving = mlen > 0;
  if (p.moving) p.walkPhase += dtMs / 110;

  if (Input.pressedDodge) tryStartDodge(p);
  if (!p.dodging) {
    if (Input.pressedLight) tryStartAttack(p, "L");
    if (Input.pressedHeavy) tryStartAttack(p, "H");
    advanceAttack(p, dtMs);
  }

  if (p.dodging) {
    updateDodge(p, dtMs);
  } else {
    const mv = attackMoveMult(p);
    const spd = playerMoveSpeed(p) * mv;
    p.x += mx * spd * dtMs / 1000; p.y += my * spd * dtMs / 1000 * ISO_Y;
  }
  if (p.dashT > 0) {
    p.x += p.dashDirX * p.dashSpeed * dtMs / 1000; p.y += p.dashDirY * p.dashSpeed * dtMs / 1000 * ISO_Y;
    p.dashT -= dtMs;
  }
  clampToRoom(p, room, p.radius + 10);

  // separate from enemies (soft push, no damage) & from each other
  for (const e of ENEMIES) {
    if (e.state === "dead") continue;
    const sep = separateCircles(p.x, p.y, p.radius, e.x, e.y, e.radius, 0.5, 0.5);
    if (sep) { p.x = sep.ax; p.y = sep.ay; e.x = sep.bx; e.y = sep.by; }
  }
}

let FadeAlpha = 0, FadeQueued = null;
function queueRoomTransition(reward) {
  if (FadeQueued) return;
  FadeAlpha = 0.001; // begin fading
  FadeQueued = reward || "boss";
}
function updateFade(dtMs) {
  if (FadeQueued) {
    FadeAlpha = Math.min(1, FadeAlpha + dtMs / 220);
    if (FadeAlpha >= 1) {
      if (FadeQueued === "boss") advanceToNextRoom(null); else advanceToNextRoom(FadeQueued);
      FadeQueued = null; // now fade back in
    }
  } else if (FadeAlpha > 0) {
    FadeAlpha = Math.max(0, FadeAlpha - dtMs / 260);
  }
}
function checkPortals() {
  if (FadeQueued) return;
  const p = RUN.player;
  for (const portal of PORTALS) {
    if (dist(p.x, p.y, portal.x, portal.y) < 34) {
      queueRoomTransition(portal.boss ? null : portal.reward);
      return;
    }
  }
}

/* =============================== RENDER ======================================= */
const IconCache = {};
function cachedIcon(kind, color, key) {
  const k = key || (kind + color);
  if (!IconCache[k]) IconCache[k] = makeIcon(kind, color);
  return IconCache[k];
}
function renderPortal(portal) {
  const [sx, sy] = worldToScreen(portal.x, portal.y);
  const bob = Math.sin(performance.now() / 300) * 4;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(sx, sy - 20, 0, sx, sy - 20, 46);
  g.addColorStop(0, portal.boss ? "rgba(225,29,72,0.55)" : "rgba(124,58,237,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy - 20, 46, 0, 7); ctx.fill();
  ctx.restore();
  pRect(sx - 16, sy - 66, 32, 60, "#1a0d18");
  ctx.strokeStyle = portal.boss ? "#e11d48" : "#7c3aed"; ctx.lineWidth = 2;
  ctx.strokeRect(sx - 16, sy - 66, 32, 60);
  if (!portal.boss) {
    const it = portal.reward.item;
    const icon = portal.reward.category === "weapon" ? cachedIcon("weapon", it.color, "w_" + it.id)
      : it.stat ? cachedIcon("vial", { vigor: "#c81c2e", strength: "#d4af37", magic: "#a855f7", speed: "#2dd4bf" }[it.stat], "s_" + it.stat)
      : portal.reward.category === "heal" ? cachedIcon("heal", "#3fce6e", "heal")
      : cachedIcon("boon", "#a855f7", "b_" + it.id);
    ctx.drawImage(icon, sx - 16, sy - 66 - 34 + bob);
    ctx.textAlign = "center"; ctx.font = "11px Georgia"; ctx.fillStyle = "#d4af37";
    ctx.fillText(it.name, sx, sy - 66 - 40 + bob);
  } else {
    ctx.drawImage(cachedIcon("skull", "#e11d48", "skull"), sx - 16, sy - 66 - 34 + bob);
    ctx.textAlign = "center"; ctx.font = "11px Georgia"; ctx.fillStyle = "#e11d48";
    ctx.fillText("Boss Chamber", sx, sy - 66 - 40 + bob);
  }
}

function animFor(e, extra) {
  return {
    facing: e.facing, walkPhase: e.walkPhase, moving: e.moving,
    hitFlashT: e.hitFlashT, deathT: e.deathT || 0, ...extra,
  };
}
function renderWorld() {
  const room = CURRENT_ROOM;
  const [fx, fy] = worldToScreen(room.bounds.x0, room.bounds.y0);
  ctx.drawImage(FLOOR_CACHE, Math.round(fx), Math.round(fy));

  for (const portal of PORTALS) renderPortal(portal);

  const drawables = [];
  for (const d of room.decor) drawables.push({ y: d.y, draw: () => drawDecor(d) });
  for (const e of ENEMIES) {
    drawables.push({
      y: e.y, draw: () => {
        const spec = { pal: e.pal, height: e.height, width: e.width, scale: e.scale, hasHorns: e.typeId === "boss", aura: e.typeId === "boss" ? "#e11d48" : (e.hitFlashT > 0 ? null : null) };
        drawCreature(e.x, e.y, spec, animFor(e));
        if ((e.state === "windup" || e.state === "attack") && e.state !== "dead") {
          const [sx, sy] = worldToScreen(e.x, e.y);
          ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 60) * 0.3;
          ctx.fillStyle = e.def.telegraph;
          ctx.beginPath(); ctx.arc(sx, sy - e.height * e.scale * 0.5, 5, 0, 7); ctx.fill();
          ctx.restore();
        }
        if (e.typeId === "boss" && e.state !== "dead") renderBossBar(e);
      }
    });
  }
  const p = RUN.player;
  drawables.push({
    y: p.y, draw: () => {
      const w = weaponDef(p);
      const spec = { pal: p.pal, hasCape: p.hasCape, hasHorns: p.hasHorns, aura: "#7c3aed" };
      const anim = animFor(p, { attackT: p.attackState, attackSwing: p.attackState === "active" ? Math.sin(p.attackSwingT * Math.PI) * 10 * p.facing : 0 });
      if (p.invulnT > 0) anim.hitFlashT = Math.max(anim.hitFlashT, 40);
      drawCreature(p.x, p.y, spec, anim);
      if (p.attackState === "active") {
        const arcHalf = w.arc / 2;
        drawWeaponSwing(...worldToScreen(p.x, p.y - 8), p.facing, w, p.attackSwingT, { arcFrom: p.aimAngle - arcHalf, arcTo: p.aimAngle + arcHalf, range: w.range, color: w.color, width: p.comboKey.endsWith("H") ? 7 : 4 });
      }
    }
  });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  renderPools();
  renderProjectiles();
  Particles.render();
  renderFloaters();
}
function renderBossBar(e) {
  hudBossWrap.classList.remove("hidden");
  bossNameEl.textContent = e.name;
  bossFillEl.style.width = clamp((e.hp / e.maxHp) * 100, 0, 100) + "%";
}

/* =============================== HUD SYNC ===================================== */
let hpFillEl, hpLabelEl, hudBossWrap, bossNameEl, bossFillEl, roomNumEl, comboEl, weaponEl, hudEl;
function cacheDom() {
  hpFillEl = document.getElementById("hp-fill"); hpLabelEl = document.getElementById("hp-label");
  hudBossWrap = document.getElementById("hud-boss"); bossNameEl = document.getElementById("boss-name"); bossFillEl = document.getElementById("boss-fill");
  roomNumEl = document.getElementById("room-num"); comboEl = document.getElementById("hud-combo"); weaponEl = document.getElementById("hud-weapon");
  hudEl = document.getElementById("hud");
}
function syncHud() {
  const p = RUN.player;
  hpFillEl.style.width = clamp((p.hp / p.maxHp) * 100, 0, 100) + "%";
  hpLabelEl.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
  roomNumEl.textContent = Math.min(RUN.roomIndex + 1, ROOM_COUNT);
  comboEl.textContent = p.comboData && p.attackState !== "idle" ? p.comboData.name : "";
  const w = weaponDef(p);
  weaponEl.innerHTML = "";
  const icon = cachedIcon("weapon", w.color, "w_" + w.id);
  icon.style.width = "28px"; icon.style.height = "28px";
  const label = document.createElement("span"); label.textContent = w.name; label.style.fontSize = "12px"; label.style.color = "#d4af37";
  weaponEl.appendChild(icon); weaponEl.appendChild(label);
  if (!CURRENT_ROOM || !CURRENT_ROOM.isBoss || ENEMIES.every(e => e.state === "dead")) hudBossWrap.classList.add("hidden");
}

/* =============================== STATE MACHINE =============================== */
const Screens = {};
["menu", "charselect", "items", "doorchoice", "pause", "gameover", "win"].forEach(n => Screens[n] = document.getElementById("screen-" + n));
let Mode = "menu";
let selectedCharIndex = -1;

function setMode(next) {
  Mode = next;
  for (const k in Screens) Screens[k].classList.add("hidden");
  hudEl.classList.add("hidden");
  if (next === "menu") Screens.menu.classList.remove("hidden");
  if (next === "charselect") Screens.charselect.classList.remove("hidden");
  if (next === "playing" || next === "boss") hudEl.classList.remove("hidden");
  if (next === "items") { hudEl.classList.remove("hidden"); Screens.items.classList.remove("hidden"); }
  if (next === "paused") { hudEl.classList.remove("hidden"); Screens.pause.classList.remove("hidden"); }
  if (next === "gameover") Screens.gameover.classList.remove("hidden");
  if (next === "win") Screens.win.classList.remove("hidden");
}

function populateCharSelect() {
  const grid = document.getElementById("char-grid");
  grid.innerHTML = "";
  CHARACTERS.forEach((c, i) => {
    const card = document.createElement("div");
    card.className = "char-card panel";
    const statRow = (label, cls, val) => `<div class="stat-row ${cls}"><div class="label">${label}</div><div class="stat-bar"><div style="width:${val * 10}%"></div></div></div>`;
    card.innerHTML = `<div class="portrait" id="portrait-${i}"></div><h3>${c.name}</h3><div class="desc">${c.desc}</div>` +
      statRow("Vigor", "vigor", c.stats.vigor) + statRow("Strength", "strength", c.stats.strength) +
      statRow("Magic", "magic", c.stats.magic) + statRow("Speed", "speed", c.stats.speed) +
      `<div style="margin-top:6px;font-size:11px;color:var(--text-dim);">Weapon: ${WEAPONS[c.weapon].name}</div>`;
    card.addEventListener("click", () => {
      selectedCharIndex = i;
      [...grid.children].forEach(el => el.classList.remove("selected"));
      card.classList.add("selected");
      document.getElementById("btn-confirm-char").disabled = false;
    });
    grid.appendChild(card);
    const portraitCanvas = document.createElement("canvas");
    portraitCanvas.width = 90; portraitCanvas.height = 90;
    const g = portraitCanvas.getContext("2d"); g.imageSmoothingEnabled = false;
    drawPortrait(g, c);
    document.getElementById("portrait-" + i).appendChild(portraitCanvas);
  });
}
function drawPortrait(g, c) {
  // Draws a static portrait pose directly onto a small offscreen context
  // (kept independent of the main-canvas creature renderer for simplicity).
  const px = (x) => Math.round(x / PIX) * PIX;
  function pr(x, y, w, h, color) { g.fillStyle = color; g.fillRect(px(x), px(y), Math.ceil(w / PIX) * PIX, Math.ceil(h / PIX) * PIX); }
  function pc(cx, cy, r, color) {
    g.fillStyle = color;
    const steps = Math.max(4, Math.round(r / PIX));
    for (let i = -steps; i <= steps; i++) { const yy = i * PIX; const frac = 1 - (yy * yy) / (r * r); if (frac < 0) continue; const w = Math.ceil(Math.sqrt(frac) * r / PIX) * PIX; g.fillRect(px(cx - w), px(cy + yy), w * 2, PIX); }
  }
  g.clearRect(0, 0, 90, 90);
  const pal = c.pal; const H = 56, W = 30;
  g.save(); g.translate(45, 78);
  pr(-W * 0.32, H * 0.42, W * 0.24, H * 0.3, pal.dark); pr(W * 0.08, H * 0.42, W * 0.24, H * 0.3, pal.dark);
  if (c.hasCape) pr(-W * 0.5 - 2, H * 0.02, W * 0.22, H * 0.55, pal.dark);
  pr(-W * 0.4, H * 0.08 - H, W * 0.8, H * 0.4, pal.body);
  pr(-W * 0.4, H * 0.08 - H, W * 0.8, H * 0.09, pal.cloth);
  pr(W * 0.32, H * 0.14 - H, W * 0.16, H * 0.28, pal.body); pr(-W * 0.48, H * 0.14 - H, W * 0.16, H * 0.28, pal.body);
  const headR = W * 0.34; pc(0, H * 0.02 - H, headR, pal.body);
  if (c.hasHorns) { pr(-headR * 0.7, -headR * 1.5 + H * 0.02 - H, PIX, headR, pal.dark); pr(headR * 0.3, -headR * 1.5 + H * 0.02 - H, PIX, headR, pal.dark); }
  g.fillStyle = pal.eye; g.fillRect(px(headR * 0.15), px(-H), PIX * 1.4, PIX);
  g.restore();
}

function populateItemsScreen() {
  const list = document.getElementById("item-list");
  list.innerHTML = "";
  const p = RUN.player;
  if (p.items.length === 0) { list.innerHTML = "<div style='color:var(--text-dim);grid-column:1/-1;'>No relics gathered yet. Explore the city.</div>"; return; }
  for (const it of p.items) {
    const row = document.createElement("div"); row.className = "item-entry";
    const icon = iconFor(it); icon.className = "icon";
    const txt = document.createElement("div");
    txt.innerHTML = `<div class="name">${it.name}</div><div class="desc">${it.desc}</div>`;
    row.appendChild(icon); row.appendChild(txt); list.appendChild(row);
  }
}

function startRun(charIndex) {
  RUN.character = CHARACTERS[charIndex];
  RUN.player = createPlayer(RUN.character);
  RUN.rooms = []; RUN.roomIndex = 0; RUN.wonFlag = false;
  const room = generateRoom(0);
  RUN.rooms.push(room);
  loadRoom(room);
  FadeAlpha = 1; FadeQueued = null;
  setMode("playing");
}

function endRun(won) {
  if (won) {
    document.getElementById("win-stats").textContent = `${RUN.character.name} slew Nosferatu Prime after ${RUN.player.kills} kills.`;
    setMode("win");
  } else {
    document.getElementById("gameover-stats").textContent = `${RUN.character.name} fell in room ${Math.min(RUN.roomIndex + 1, ROOM_COUNT + 1)}, with ${RUN.player.kills} kills.`;
    setMode("gameover");
  }
}

/* =============================== DOM WIRING =================================== */
function wireUI() {
  document.getElementById("btn-start").addEventListener("click", () => { populateCharSelect(); setMode("charselect"); });
  document.getElementById("btn-confirm-char").addEventListener("click", () => { if (selectedCharIndex >= 0) startRun(selectedCharIndex); });
  document.getElementById("btn-resume").addEventListener("click", () => setMode("playing"));
  document.getElementById("btn-quit").addEventListener("click", () => setMode("menu"));
  document.getElementById("btn-retry").addEventListener("click", () => setMode("menu"));
  document.getElementById("btn-win-continue").addEventListener("click", () => setMode("menu"));
}

/* =============================== MAIN LOOP ===================================== */
let lastTime = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - lastTime; lastTime = now;
  dt = Math.min(dt, 250);
  accumulator += dt;

  if (Input.pressedTab) { if (Mode === "playing" || Mode === "boss") setMode("items"); else if (Mode === "items") setMode(CURRENT_ROOM ? "playing" : "menu"); }
  if (Input.pressedEscape) {
    if (Mode === "playing" || Mode === "boss") setMode("paused");
    else if (Mode === "paused") setMode("playing");
  }

  while (accumulator >= STEP) {
    if (Mode === "playing") stepGame(STEP);
    accumulator -= STEP;
  }
  Input.consume();

  ctx.clearRect(0, 0, CW, CH);
  drawBackdrop();
  if (CURRENT_ROOM && (Mode === "playing" || Mode === "paused" || Mode === "items")) {
    ctx.save();
    if (ShakeMag > 0) ctx.translate(rand(-ShakeMag, ShakeMag), rand(-ShakeMag, ShakeMag));
    renderWorld();
    ctx.restore();
    syncHud();
  }
  if (FadeAlpha > 0) { ctx.fillStyle = "#000"; ctx.globalAlpha = FadeAlpha; ctx.fillRect(0, 0, CW, CH); ctx.globalAlpha = 1; }

  requestAnimationFrame_running = true;
}
let requestAnimationFrame_running = false;
let CityBackdrop = null;
function buildCityBackdrop() {
  const c = document.createElement("canvas"); c.width = CW; c.height = CH;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, "#0d0614"); sky.addColorStop(0.55, "#0a0510"); sky.addColorStop(1, "#050208");
  g.fillStyle = sky; g.fillRect(0, 0, CW, CH);
  // moon
  g.save(); g.globalCompositeOperation = "lighter";
  const moon = g.createRadialGradient(CW * 0.82, CH * 0.16, 0, CW * 0.82, CH * 0.16, 160);
  moon.addColorStop(0, "rgba(180,150,220,0.35)"); moon.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = moon; g.fillRect(0, 0, CW, CH);
  g.fillStyle = "#cfc3e0"; g.beginPath(); g.arc(CW * 0.82, CH * 0.16, 34, 0, 7); g.fill();
  g.restore();
  // far + near building silhouette rows (purely decorative frame around the play area)
  function buildingsRow(baseY, minH, maxH, color, w0, w1) {
    let x = -20;
    while (x < CW + 20) {
      const bw = randInt(w0, w1); const bh = randInt(minH, maxH);
      g.fillStyle = color; g.fillRect(x, baseY - bh, bw, bh + 40);
      if (Math.random() < 0.4) { g.fillStyle = "rgba(180,140,60,0.18)"; g.fillRect(x + bw * 0.3, baseY - bh + 10, 4, 6); }
      // broken roofline notch
      if (Math.random() < 0.5) g.clearRect(x + bw * 0.5, baseY - bh, bw * 0.2, 10);
      x += bw + randInt(2, 10);
    }
  }
  buildingsRow(CH * 0.42, 40, 130, "#140a1c", 40, 90);
  buildingsRow(CH * 0.46, 30, 90, "#1c0f28", 30, 70);
  buildingsRow(CH * 0.985, 26, 80, "#0c0710", 40, 100);
  // ground fog
  const fog = g.createLinearGradient(0, CH * 0.5, 0, CH);
  fog.addColorStop(0, "rgba(60,30,80,0)"); fog.addColorStop(1, "rgba(20,8,24,0.6)");
  g.fillStyle = fog; g.fillRect(0, CH * 0.5, CW, CH * 0.5);
  return c;
}
function drawBackdrop() {
  if (!CityBackdrop) CityBackdrop = buildCityBackdrop();
  ctx.drawImage(CityBackdrop, 0, 0);
}

function stepGame(dtMs) {
  const p = RUN.player, room = CURRENT_ROOM;
  updatePlayer(p, dtMs, room);
  for (const e of ENEMIES) updateEnemy(e, dtMs, room);
  updateProjectiles(dtMs, room);
  Particles.update(dtMs);
  updateFloaters(dtMs);
  updateShake(dtMs);
  updateFade(dtMs);
  updateCamera(room, p.x, p.y);
  checkRoomClear(room);
  checkPortals();
  if (p.hp <= 0) { endRun(false); return; }
  if (room.isBoss) {
    const boss = ENEMIES.find(e => e.typeId === "boss");
    if (boss && boss.state === "dead" && boss.deathT >= 1 && !RUN.wonFlag) { RUN.wonFlag = true; setTimeout(() => endRun(true), 400); }
  }
}

/* =============================== BOOT ========================================== */
function boot() {
  cacheDom();
  wireUI();
  document.getElementById("loading").classList.add("hidden");
  setMode("menu");
  lastTime = performance.now();
  requestAnimationFrame(frame);
}
boot();

