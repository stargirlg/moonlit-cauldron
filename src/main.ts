import { FairyAudio } from './core/audio';
import { EventBus } from './core/eventBus';
import { AStarPathfinder, type GridPos } from './core/pathfinding';
import { CauldronSystem, type HerbType, type PotionId } from './systems/cauldron';

type CharacterType = 'girl' | 'boy';

interface HerbNode {
  id: number;
  type: HerbType;
  x: number;
  y: number;
  collected: boolean;
  respawnTimer: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BridgeZone {
  rect: Rect;
  built: boolean;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
document.body.style.margin = '0';
document.body.style.background = '#0b0b0b';
document.body.style.overflow = 'hidden';
canvas.tabIndex = 0;
canvas.style.outline = 'none';
document.body.appendChild(canvas);
canvas.focus();

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Core Systems
const audio = new FairyAudio();
const eventBus = new EventBus();
const cauldronSystem = new CauldronSystem();
const pathfinder = new AStarPathfinder();
const keys = new Set<string>();
const herbPouch = new Map<HerbType, number>();
const activeBuffs = new Map<PotionId, number>();

const GARDEN_W = 880;
const GARDEN_H = 440;
const CELL_SIZE = 40;

// Dynamic Level State
let currentLevel = 1;
let levelTitle = 'STAGE 1: THE MOONLIT COURTYARD';
let streams: Rect[] = [];
let bridges: BridgeZone[] = [];
let hedges: Rect[] = [];
let herbs: HerbNode[] = [];
let sanctuaryPortal: { x: number; y: number } | null = null;

const cauldron = { x: 240, y: 260 };
const gearItems = {
  hat: { x: 100, y: 76, collected: false },
  broom: { x: 760, y: 84, collected: false },
};

let startTime = performance.now();
let stageCleared = false;
let campaignWon = false;
let elapsedSeconds = 0;
let showAStarDebug = false;
let pathTimer = 0;
let statusMessage = 'Press [B] so Spider Buddy weaves a Silver-Silk Bridge across the stream.';

const player = {
  x: 100,
  y: 260,
  baseSpeed: 205,
  character: 'girl' as CharacterType,
  hasHat: false,
  hasBroom: false,
  isFlying: false,
};

const cat = {
  x: 68,
  y: 292,
  speed: 195,
  path: [] as GridPos[],
};

const spider = {
  x: 132,
  y: 228,
  speed: 255,
  targetHerb: null as HerbNode | null,
  targetBridge: null as BridgeZone | null,
  path: [] as GridPos[],
};

const fireflies: Firefly[] = Array.from({ length: 24 }, () => ({
  x: Math.random() * GARDEN_W,
  y: Math.random() * GARDEN_H,
  vx: (Math.random() - 0.5) * 20,
  vy: (Math.random() - 0.5) * 20,
  phase: Math.random() * Math.PI * 2,
}));

const stars = Array.from({ length: 36 }, (_, i) => ({
  x: ((i * 197) % (GARDEN_W - 20)) + 10,
  y: -58 + ((i * 53) % 46),
  size: i % 3 === 0 ? 2 : 1.2,
  phase: i * 0.7,
}));

eventBus.on('ITEM_EQUIPPED', ({ item }) => {
  audio.playGearPickup();
  statusMessage =
    item === 'Witch Hat'
      ? 'Equipped Witch Hat! All potion durations are boosted by +50%.'
      : 'Collected Magic Broom! Brew Gale-Broom Draught to fly.';
});

eventBus.on('POTION_BREWED', ({ potionName, description }) => {
  audio.playBrewPotion();
  statusMessage = `Brewed ${potionName} — ${description}`;
});

eventBus.on('ESCAPED_OUTSIDE', ({ elapsedSeconds: sec }) => {
  audio.playVictory();
  elapsedSeconds = sec;
  stageCleared = true;
  if (currentLevel === 2) {
    campaignWon = true;
    statusMessage = 'You entered the Starlit Fairy Sanctuary! Adventure Complete!';
  } else {
    statusMessage = 'You soared over the garden wall into the Starlit Forest!';
  }
});

function loadLevel(level: number, preserveGear = false): void {
  currentLevel = level;
  stageCleared = false;
  campaignWon = false;
  activeBuffs.clear();
  player.isFlying = false;
  cat.path = [];
  spider.targetHerb = null;
  spider.targetBridge = null;
  spider.path = [];

  if (!preserveGear) {
    startTime = performance.now();
    herbPouch.clear();
    player.hasHat = false;
    player.hasBroom = false;
  }

  if (level === 1) {
    levelTitle = 'STAGE 1: THE MOONLIT COURTYARD';
    player.x = 100;
    player.y = 260;
    cat.x = 68;
    cat.y = 292;
    spider.x = 132;
    spider.y = 228;

    cauldron.x = 240;
    cauldron.y = 260;

    gearItems.hat = { x: 100, y: 76, collected: player.hasHat };
    gearItems.broom = { x: 760, y: 84, collected: player.hasBroom };

    streams = [{ x: 400, y: 0, w: 80, h: GARDEN_H }];
    bridges = [{ rect: { x: 400, y: 160, w: 80, h: 80 }, built: false }];
    hedges = [
      { x: 160, y: 120, w: 120, h: 40 },
      { x: 600, y: 240, w: 120, h: 40 },
    ];
    herbs = [
      { id: 1, type: 'Silver Fern', x: 320, y: 76, collected: false, respawnTimer: 0 },
      { id: 2, type: 'Moonpetal', x: 120, y: 376, collected: false, respawnTimer: 0 },
      { id: 3, type: 'Starlight Dew', x: 560, y: 120, collected: false, respawnTimer: 0 },
      { id: 4, type: 'Starlight Dew', x: 760, y: 360, collected: false, respawnTimer: 0 },
    ];
    sanctuaryPortal = null;
    statusMessage = 'Stage 1: Weave the Silk Bridge [B], brew Gale-Broom Draught [E], and fly north!';
  } else {
    levelTitle = 'STAGE 2: THE STARLIT FOREST';
    player.x = 80;
    player.y = 280;
    cat.x = 56;
    cat.y = 312;
    spider.x = 110;
    spider.y = 248;

    cauldron.x = 180;
    cauldron.y = 280;

    // If player skipped Witch Hat in Stage 1, let them find it in the west forest grove
    gearItems.hat = { x: 200, y: 64, collected: player.hasHat };
    gearItems.broom = { x: 760, y: 84, collected: true };
    player.hasBroom = true;

    streams = [
      { x: 280, y: 0, w: 80, h: GARDEN_H },
      { x: 560, y: 0, w: 80, h: GARDEN_H },
    ];
    bridges = [
      { rect: { x: 280, y: 240, w: 80, h: 80 }, built: false },
      { rect: { x: 560, y: 120, w: 80, h: 80 }, built: false },
    ];
    hedges = [
      { x: 120, y: 120, w: 120, h: 40 },
      { x: 400, y: 160, w: 120, h: 40 },
      { x: 680, y: 280, w: 120, h: 40 },
    ];
    herbs = [
      { id: 101, type: 'Moonpetal', x: 100, y: 64, collected: false, respawnTimer: 0 },
      { id: 102, type: 'Silver Fern', x: 460, y: 280, collected: false, respawnTimer: 0 },
      { id: 103, type: 'Starlight Dew', x: 740, y: 100, collected: false, respawnTimer: 0 },
      { id: 104, type: 'Silver Fern', x: 740, y: 380, collected: false, respawnTimer: 0 },
    ];
    sanctuaryPortal = { x: 460, y: 64 };
    statusMessage = 'Stage 2: Cross both streams [B], gather all 3 herbs, and brew Astral Portal Elixir!';
  }
}

loadLevel(1, false);

function pointInRect(px: number, py: number, r: Rect, pad = 0): boolean {
  return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;
}

function isPositionBlocked(px: number, py: number): boolean {
  if (py < 14) return true;
  for (const h of hedges) {
    if (pointInRect(px, py, h, 10)) return true;
  }
  const onAnyBridge = bridges.some(
    (b) =>
      b.built &&
      px >= b.rect.x - 16 &&
      px <= b.rect.x + b.rect.w + 16 &&
      py >= b.rect.y + 8 &&
      py <= b.rect.y + b.rect.h - 8
  );
  if (!onAnyBridge) {
    for (const s of streams) {
      if (pointInRect(px, py, s, 8)) return true;
    }
  }
  return false;
}

function isGridCellBlocked(gx: number, gy: number, isSpider: boolean): boolean {
  const cx = gx * CELL_SIZE + CELL_SIZE / 2;
  const cy = gy * CELL_SIZE + CELL_SIZE / 2;
  for (const h of hedges) {
    if (pointInRect(cx, cy, h, 0)) return true;
  }
  if (!isSpider) {
    const onAnyBridge = bridges.some((b) => b.built && pointInRect(cx, cy, b.rect, 0));
    if (!onAnyBridge) {
      for (const s of streams) {
        if (pointInRect(cx, cy, s, 0)) return true;
      }
    }
  }
  return false;
}

function collectHerb(herb: HerbNode): void {
  herb.collected = true;
  herb.respawnTimer = 8;
  herbPouch.set(herb.type, (herbPouch.get(herb.type) ?? 0) + 1);
  audio.playHerbPickup();
}

function commandSpiderBridge(): void {
  const nextBridge = bridges.find((b) => !b.built);
  if (!nextBridge) {
    statusMessage = 'All Silver-Silk Bridges are woven — walk right across!';
    return;
  }
  spider.targetBridge = nextBridge;
  spider.targetHerb = null;
  pathTimer = 0;
  statusMessage = 'Spider Buddy is weaving a Silver-Silk Bridge across the stream...';
}

function sendSpiderToFetch(): void {
  if (spider.targetHerb || spider.targetBridge) return;
  let nearest: HerbNode | null = null;
  let bestDist = Infinity;
  for (const herb of herbs) {
    if (herb.collected) continue;
    const d = Math.hypot(herb.x - player.x, herb.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      nearest = herb;
    }
  }
  if (nearest) {
    spider.targetHerb = nearest;
    pathTimer = 0;
    statusMessage = `Spider Buddy scurried off to fetch ${nearest.type}!`;
  }
}

function tryBrewAtCauldron(): void {
  if (Math.hypot(player.x - cauldron.x, player.y - cauldron.y) > 64) {
    statusMessage = 'Walk up to the Cauldron and press [E] to brew.';
    return;
  }
  const brewed = cauldronSystem.brewFirstAvailable(herbPouch);
  if (!brewed) {
    statusMessage = 'Collect a matching herb combo (shown in the Grimoire below) first.';
    return;
  }
  const multiplier = player.hasHat ? 1.5 : 1.0;
  activeBuffs.set(brewed.id, Math.round(brewed.baseDuration * multiplier));
  eventBus.emit('POTION_BREWED', {
    potionName: brewed.name,
    description: brewed.description,
  });
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys.add(key);

  if (e.key === 'Tab') {
    e.preventDefault();
    player.character = player.character === 'girl' ? 'boy' : 'girl';
  } else if (key === 'm') {
    audio.muted = !audio.muted;
    statusMessage = audio.muted ? 'Fairy Audio muted [M].' : 'Fairy Audio enabled [M].';
  } else if (key === 'b' && !stageCleared) {
    commandSpiderBridge();
  } else if (key === 'e' && !stageCleared) {
    tryBrewAtCauldron();
  } else if (key === 'f' && !stageCleared) {
    sendSpiderToFetch();
  } else if (key === 'g') {
    showAStarDebug = !showAStarDebug;
  } else if (e.code === 'Space' && !stageCleared) {
    e.preventDefault();
    if (!player.hasBroom) {
      statusMessage = 'Cross the Silk Bridge and pick up your Magic Broom first!';
    } else if ((activeBuffs.get('gale_broom') ?? 0) <= 0) {
      statusMessage = 'Brew Gale-Broom Draught (Silver Fern + Starlight Dew) to fly!';
    } else {
      player.isFlying = !player.isFlying;
      audio.playFlyToggle();
    }
  } else if (key === 'n' && stageCleared && !campaignWon) {
    loadLevel(2, true);
  } else if (key === 'r' && stageCleared) {
    loadLevel(1, false);
  }
});

window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function followWaypoints(
  entity: { x: number; y: number; speed: number; path: GridPos[] },
  dt: number
): void {
  if (entity.path.length === 0) return;
  const target = entity.path[0];
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 6) {
    entity.path.shift();
  } else {
    entity.x += (dx / dist) * entity.speed * dt;
    entity.y += (dy / dist) * entity.speed * dt;
  }
}

function update(dt: number): void {
  if (stageCleared) return;

  for (const f of fireflies) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.x < 12 || f.x > GARDEN_W - 12) f.vx *= -1;
    if (f.y < 12 || f.y > GARDEN_H - 12) f.vy *= -1;
  }

  activeBuffs.forEach((remaining, id) => {
    const next = remaining - dt;
    if (next <= 0) {
      activeBuffs.delete(id);
      if (id === 'gale_broom') player.isFlying = false;
    } else {
      activeBuffs.set(id, next);
    }
  });

  for (const herb of herbs) {
    if (herb.collected) {
      herb.respawnTimer -= dt;
      if (herb.respawnTimer <= 0) herb.collected = false;
    }
  }

  let dx = 0;
  let dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;

  const speedBoost = (activeBuffs.get('star_step') ?? 0) > 0 ? 1.45 : 1.0;
  const flightBoost = player.isFlying ? 1.35 : 1.0;
  const currentSpeed = player.baseSpeed * speedBoost * flightBoost;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    const stepX = (dx / len) * currentSpeed * dt;
    const stepY = (dy / len) * currentSpeed * dt;

    const nextX = Math.max(18, Math.min(GARDEN_W - 18, player.x + stepX));
    if (player.isFlying || !isPositionBlocked(nextX, player.y)) {
      player.x = nextX;
    }

    const nextY = Math.min(GARDEN_H - 18, player.y + stepY);
    if (player.isFlying) {
      player.y = Math.max(currentLevel === 1 ? -24 : 18, nextY);
      if (currentLevel === 1 && player.y < -14) {
        const elapsed = Math.round((performance.now() - startTime) / 1000);
        eventBus.emit('ESCAPED_OUTSIDE', { elapsedSeconds: elapsed });
      }
    } else if (!isPositionBlocked(player.x, nextY)) {
      player.y = nextY;
    }
  }

  // Stage 2 Sanctuary Portal Check
  if (currentLevel === 2 && sanctuaryPortal) {
    const portalUnlocked = (activeBuffs.get('astral_portal') ?? 0) > 0;
    if (portalUnlocked && Math.hypot(player.x - sanctuaryPortal.x, player.y - sanctuaryPortal.y) < 34) {
      const elapsed = Math.round((performance.now() - startTime) / 1000);
      eventBus.emit('ESCAPED_OUTSIDE', { elapsedSeconds: elapsed });
    }
  }

  if (!gearItems.hat.collected && Math.hypot(player.x - gearItems.hat.x, player.y - gearItems.hat.y) < 30) {
    gearItems.hat.collected = true;
    player.hasHat = true;
    eventBus.emit('ITEM_EQUIPPED', { item: 'Witch Hat' });
  }
  if (!gearItems.broom.collected && Math.hypot(player.x - gearItems.broom.x, player.y - gearItems.broom.y) < 30) {
    gearItems.broom.collected = true;
    player.hasBroom = true;
    eventBus.emit('ITEM_EQUIPPED', { item: 'Magic Broom' });
  }

  for (const herb of herbs) {
    if (!herb.collected && Math.hypot(player.x - herb.x, player.y - herb.y) < 28) {
      collectHerb(herb);
    }
  }

  pathTimer -= dt;
  if (pathTimer <= 0) {
    pathTimer = 0.2;
    const cols = GARDEN_W / CELL_SIZE;
    const rows = GARDEN_H / CELL_SIZE;

    if (Math.hypot(player.x - cat.x, player.y - cat.y) > 46) {
      cat.path = pathfinder.findPath(
        { x: cat.x, y: cat.y },
        { x: player.x, y: player.y },
        CELL_SIZE,
        cols,
        rows,
        (gx, gy) => isGridCellBlocked(gx, gy, false)
      );
    } else {
      cat.path = [];
    }

    let spiderGoal: GridPos = { x: player.x, y: player.y };
    if (spider.targetBridge) {
      spiderGoal = {
        x: spider.targetBridge.rect.x + spider.targetBridge.rect.w / 2,
        y: spider.targetBridge.rect.y + spider.targetBridge.rect.h / 2,
      };
    } else if (spider.targetHerb && !spider.targetHerb.collected) {
      spiderGoal = { x: spider.targetHerb.x, y: spider.targetHerb.y };
    }

    if (spider.targetBridge || spider.targetHerb || Math.hypot(player.x - spider.x, player.y - spider.y) > 40) {
      spider.path = pathfinder.findPath(
        { x: spider.x, y: spider.y },
        spiderGoal,
        CELL_SIZE,
        cols,
        rows,
        (gx, gy) => isGridCellBlocked(gx, gy, true)
      );
    } else {
      spider.path = [];
    }
  }

  followWaypoints(cat, dt);
  followWaypoints(spider, dt);

  if (spider.targetBridge) {
    const bx = spider.targetBridge.rect.x + spider.targetBridge.rect.w / 2;
    const by = spider.targetBridge.rect.y + spider.targetBridge.rect.h / 2;
    if (Math.hypot(spider.x - bx, spider.y - by) < 38) {
      spider.targetBridge.built = true;
      spider.targetBridge = null;
      audio.playBridgeWeave();
      statusMessage = 'Silver-Silk Bridge woven! Walk right across the bridge.';
    }
  } else if (spider.targetHerb && !spider.targetHerb.collected) {
    if (Math.hypot(spider.x - spider.targetHerb.x, spider.y - spider.targetHerb.y) < 36) {
      collectHerb(spider.targetHerb);
      spider.targetHerb = null;
    }
  }
}

function drawHerbIcon(herb: HerbNode, now: number): void {
  const pulse = Math.sin(now * 0.004 + herb.id) * 1.5;
  ctx.save();
  ctx.translate(herb.x, herb.y);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(0, 0, 14 + pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#f5f5f5';
  ctx.lineWidth = 1.5;

  if (herb.type === 'Moonpetal') {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (herb.type === 'Silver Fern') {
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, -8);
    ctx.moveTo(0, 3);
    ctx.lineTo(-6, -1);
    ctx.moveTo(0, 3);
    ctx.lineTo(6, -1);
    ctx.moveTo(0, -2);
    ctx.lineTo(-5, -6);
    ctx.moveTo(0, -2);
    ctx.lineTo(5, -6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(3, -3);
    ctx.lineTo(9, 0);
    ctx.lineTo(3, 3);
    ctx.lineTo(0, 9);
    ctx.lineTo(-3, 3);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-3, -3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#d4d4d4';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(herb.type, 0, 21);
  ctx.restore();
}

function drawGardenStage(now: number): void {
  const skyH = 66;
  const totalStageH = GARDEN_H + skyH;
  const stageX = Math.max(16, Math.floor((canvas.width - GARDEN_W) / 2));
  const stageY = Math.max(66, Math.floor((canvas.height - 96 - totalStageH) / 2) + 56);

  ctx.save();
  ctx.translate(stageX, stageY + skyH);

  // 1. Starry Sky Banner
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, -skyH, GARDEN_W, skyH);

  for (const s of stars) {
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(now * 0.002 + s.phase));
    ctx.fillStyle = `rgba(255, 255, 255, ${twinkle})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }

  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.arc(GARDEN_W - 58, -34, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(GARDEN_W - 52, -38, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d4d4d4';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const bannerText =
    currentLevel === 1
      ? '✦ OUTSIDE WORLD — Fly over the silver wall on your Broom ✦'
      : '✦ STARLIT SANCTUARY — Brew Astral Portal Elixir to enter the Portal ✦';
  ctx.fillText(bannerText, GARDEN_W / 2, -26);

  // 2. Ground & Grid
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, GARDEN_W, GARDEN_H);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx < GARDEN_W; gx += CELL_SIZE) {
    for (let gy = 0; gy < GARDEN_H; gy += CELL_SIZE) {
      ctx.strokeRect(gx, gy, CELL_SIZE, CELL_SIZE);
    }
  }

  const lightRadius = (activeBuffs.get('fairy_light') ?? 0) > 0 ? 500 : 320;
  const gradient = ctx.createRadialGradient(player.x, player.y, 24, player.x, player.y, lightRadius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(0.65, 'rgba(200, 200, 200, 0.04)');
  gradient.addColorStop(1, 'rgba(11, 11, 11, 0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GARDEN_W, GARDEN_H);

  // 3. Moonlit Streams
  for (const s of streams) {
    ctx.fillStyle = '#1d1d1d';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, GARDEN_H);
    ctx.moveTo(s.x + s.w, 0);
    ctx.lineTo(s.x + s.w, GARDEN_H);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    for (let wy = 24; wy < GARDEN_H; wy += 44) {
      const wave = Math.sin(now * 0.003 + wy * 0.1 + s.x) * 7;
      ctx.beginPath();
      ctx.moveTo(s.x + 18 + wave, wy);
      ctx.lineTo(s.x + 48 + wave, wy);
      ctx.stroke();
    }
  }

  // 4. Silver-Silk Bridges
  for (const b of bridges) {
    const r = b.rect;
    if (b.built) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x + r.w, r.y + r.h);
      ctx.moveTo(r.x + r.w, r.y);
      ctx.lineTo(r.x, r.y + r.h);
      ctx.moveTo(r.x, r.y + r.h / 2);
      ctx.lineTo(r.x + r.w, r.y + r.h / 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      ctx.setLineDash([]);
      ctx.fillStyle = '#cccccc';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Press [B]', r.x + r.w / 2, r.y + 36);
      ctx.fillText('Silk Bridge', r.x + r.w / 2, r.y + 50);
    }
  }

  // 5. Hedges
  for (const h of hedges) {
    ctx.fillStyle = '#242424';
    ctx.strokeStyle = '#a3a3a3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(h.x, h.y, h.w, h.h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#333333';
    for (let bx = h.x + 18; bx < h.x + h.w - 10; bx += 26) {
      ctx.beginPath();
      ctx.arc(bx, h.y + h.h / 2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 6. Stage 2 Sanctuary Portal
  if (sanctuaryPortal) {
    const unlocked = (activeBuffs.get('astral_portal') ?? 0) > 0;
    const spin = now * 0.0025;
    ctx.save();
    ctx.translate(sanctuaryPortal.x, sanctuaryPortal.y);

    ctx.strokeStyle = unlocked ? '#ffffff' : '#666666';
    ctx.lineWidth = unlocked ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();

    if (unlocked) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.cos(a) * 14 - 1.5, Math.sin(a) * 14 - 1.5, 3, 3);
      }
    }

    ctx.fillStyle = unlocked ? '#ffffff' : '#9e9e9e';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(unlocked ? '✦ Sanctuary Open! ✦' : 'Sealed Portal', 0, 36);
    ctx.restore();
  }

  // 7. Cauldron
  const nearCauldron = Math.hypot(player.x - cauldron.x, player.y - cauldron.y) <= 64;
  ctx.fillStyle = '#181818';
  ctx.strokeStyle = nearCauldron ? '#ffffff' : '#b0b0b0';
  ctx.lineWidth = nearCauldron ? 2.5 : 1.8;
  ctx.fillRect(cauldron.x - 13, cauldron.y + 13, 4, 5);
  ctx.fillRect(cauldron.x + 9, cauldron.y + 13, 4, 5);
  ctx.beginPath();
  ctx.arc(cauldron.x, cauldron.y + 2, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(cauldron.x - 15, cauldron.y - 13, 30, 5);
  ctx.strokeRect(cauldron.x - 15, cauldron.y - 13, 30, 5);

  const bubbleOffset = (now * 0.03) % 16;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(cauldron.x - 5, cauldron.y - 16 - bubbleOffset, 2.5, 0, Math.PI * 2);
  ctx.arc(cauldron.x + 6, cauldron.y - 20 - ((bubbleOffset + 7) % 16), 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = nearCauldron ? '#ffffff' : '#cccccc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(nearCauldron ? 'Cauldron [Press E]' : 'Cauldron', cauldron.x, cauldron.y + 32);

  // 8. Witch Hat Pickup
  if (!gearItems.hat.collected) {
    const hx = gearItems.hat.x;
    const hy = gearItems.hat.y;
    ctx.fillStyle = '#1f1f1f';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(hx, hy + 6, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 11, hy + 5);
    ctx.lineTo(hx + 2, hy - 16);
    ctx.lineTo(hx + 11, hy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e5e5e5';
    ctx.fillText('Witch Hat', hx, hy + 23);
  }

  // 9. Magic Broom Pickup
  if (!gearItems.broom.collected) {
    const bx = gearItems.broom.x;
    const by = gearItems.broom.y;
    ctx.strokeStyle = '#f5f5f5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx - 16, by + 10);
    ctx.lineTo(bx + 12, by - 10);
    ctx.stroke();
    ctx.fillStyle = '#d4d4d4';
    ctx.beginPath();
    ctx.moveTo(bx - 13, by + 8);
    ctx.lineTo(bx - 24, by + 11);
    ctx.lineTo(bx - 18, by + 19);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e5e5e5';
    ctx.fillText('Magic Broom', bx, by + 28);
  }

  // 10. Herbs
  for (const herb of herbs) {
    if (!herb.collected) drawHerbIcon(herb, now);
  }

  // 11. A* Debug Overlay [G]
  if (showAStarDebug) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.setLineDash([4, 4]);
    for (const path of [cat.path, spider.path]) {
      if (path.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (const pt of path) ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 12. Black Cat
  const tailWag = Math.sin(now * 0.006) * 4;
  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cat.x - 7, cat.y + 4);
  ctx.quadraticCurveTo(cat.x - 16, cat.y - 4 + tailWag, cat.x - 13, cat.y - 11 + tailWag);
  ctx.stroke();

  ctx.fillStyle = '#121212';
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cat.x, cat.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cat.x - 8, cat.y - 5);
  ctx.lineTo(cat.x - 6, cat.y - 13);
  ctx.lineTo(cat.x - 2, cat.y - 8);
  ctx.moveTo(cat.x + 8, cat.y - 5);
  ctx.lineTo(cat.x + 6, cat.y - 13);
  ctx.lineTo(cat.x + 2, cat.y - 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cat.x - 4, cat.y - 2, 2.2, 2.2);
  ctx.fillRect(cat.x + 2, cat.y - 2, 2.2, 2.2);

  // 13. Spider Buddy
  const bob = Math.sin(now * 0.006) * 2.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(spider.x, spider.y - 24);
  ctx.lineTo(spider.x, spider.y + bob);
  ctx.stroke();

  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    for (let leg = 0; leg < 3; leg++) {
      const wiggle = Math.sin(now * 0.012 + leg) * 1.5;
      ctx.beginPath();
      ctx.moveTo(spider.x + side * 4, spider.y + bob + (leg - 1) * 2);
      ctx.lineTo(spider.x + side * 11, spider.y + bob + (leg - 1) * 4 + wiggle);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#1e1e1e';
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(spider.x, spider.y + bob, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(spider.x - 3, spider.y + bob - 1.5, 2, 2);
  ctx.fillRect(spider.x + 1.5, spider.y + bob - 1.5, 2, 2);

  // 14. Player Character
  const hover = player.isFlying ? -9 + Math.sin(now * 0.008) * 3 : 0;

  if (player.isFlying) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(player.x - 22, player.y + 11 + hover);
    ctx.lineTo(player.x + 22, player.y + 11 + hover);
    ctx.stroke();
    ctx.fillStyle = '#d4d4d4';
    ctx.beginPath();
    ctx.moveTo(player.x - 20, player.y + 11 + hover);
    ctx.lineTo(player.x - 29, player.y + 7 + hover);
    ctx.lineTo(player.x - 29, player.y + 15 + hover);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#e5e5e5';
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 4 + hover);
  ctx.lineTo(player.x - 11, player.y + 14 + hover);
  ctx.lineTo(player.x + 11, player.y + 14 + hover);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fafafa';
  ctx.beginPath();
  ctx.arc(player.x, player.y - 7 + hover, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#141414';
  ctx.fillRect(player.x - 3.5, player.y - 8 + hover, 2, 2.5);
  ctx.fillRect(player.x + 1.5, player.y - 8 + hover, 2, 2.5);

  ctx.strokeStyle = '#9e9e9e';
  ctx.lineWidth = 2.5;
  if (player.character === 'girl') {
    ctx.beginPath();
    ctx.moveTo(player.x - 8, player.y - 7 + hover);
    ctx.lineTo(player.x - 11, player.y + 5 + hover);
    ctx.moveTo(player.x + 8, player.y - 7 + hover);
    ctx.lineTo(player.x + 11, player.y + 5 + hover);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(player.x - 6, player.y - 13 + hover);
    ctx.lineTo(player.x, player.y - 10 + hover);
    ctx.lineTo(player.x + 6, player.y - 13 + hover);
    ctx.stroke();
  }

  if (player.hasHat) {
    ctx.fillStyle = '#1c1c1c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y - 14 + hover, 15, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(player.x - 9, player.y - 14 + hover);
    ctx.lineTo(player.x + 1, player.y - 31 + hover);
    ctx.lineTo(player.x + 9, player.y - 14 + hover);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 15. Fireflies
  for (const f of fireflies) {
    const alpha = 0.25 + 0.55 * Math.sin(now * 0.004 + f.phase);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 16. North Barrier
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.setLineDash(currentLevel === 1 ? [12, 6] : []);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(GARDEN_W, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, -skyH, GARDEN_W, totalStageH);

  ctx.restore();
}

function drawChromeUI(): void {
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, 0, canvas.width, 52);
  ctx.strokeStyle = '#2b2b2b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 52);
  ctx.lineTo(canvas.width, 52);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`✦ MOONLIT CAULDRON  —  ${levelTitle}`, 20, 22);

  ctx.fillStyle = '#d4d4d4';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(statusMessage, 20, 42);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#f5f5f5';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(
    `Witch: ${player.character.toUpperCase()} [TAB]  •  Audio: ${audio.muted ? 'OFF' : 'ON'} [M]`,
    canvas.width - 20,
    31
  );

  const dockH = 96;
  const dockY = canvas.height - dockH;
  ctx.fillStyle = '#121212';
  ctx.fillRect(0, dockY, canvas.width, dockH);
  ctx.strokeStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.moveTo(0, dockY);
  ctx.lineTo(canvas.width, dockY);
  ctx.stroke();

  const pad = 16;
  const gap = 14;
  const cardW = Math.floor((canvas.width - pad * 2 - gap * 2) / 3);
  const cardH = dockH - 16;
  const cardY = dockY + 8;

  // Card 1: Gear & Herb Pouch
  ctx.fillStyle = '#181818';
  ctx.strokeStyle = '#2e2e2e';
  ctx.strokeRect(pad, cardY, cardW, cardH);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('GEAR & HERB POUCH', pad + 12, cardY + 18);

  const builtCount = bridges.filter((b) => b.built).length;
  ctx.fillStyle = '#d4d4d4';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(
    `Hat: ${player.hasHat ? '✓' : '—'}   •   Broom: ${player.hasBroom ? '✓' : '—'}   •   Bridges: ${builtCount}/${bridges.length}`,
    pad + 12,
    cardY + 38
  );

  const pouchItems = Array.from(herbPouch.entries())
    .map(([k, v]) => `${k} (${v})`)
    .join(', ');
  ctx.fillStyle = '#a3a3a3';
  ctx.fillText(`Herbs: ${pouchItems || 'None collected yet'}`, pad + 12, cardY + 58);

  // Card 2: Grimoire Recipes
  const c2X = pad + cardW + gap;
  ctx.fillStyle = '#181818';
  ctx.strokeStyle = '#2e2e2e';
  ctx.strokeRect(c2X, cardY, cardW, cardH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('GRIMOIRE RECIPES (PRESS [E] AT CAULDRON)', c2X + 12, cardY + 18);

  const craftable = cauldronSystem.findCraftableRecipe(herbPouch);
  let ry = cardY + 33;
  ctx.font = '11px system-ui, sans-serif';
  for (const r of cauldronSystem.getAllRecipes()) {
    const isReady = craftable?.id === r.id;
    ctx.fillStyle = isReady ? '#ffffff' : '#8c8c8c';
    const tag = isReady ? '✦ READY: ' : '• ';
    ctx.fillText(`${tag}${r.name}: ${r.ingredients.join(' + ')}`, c2X + 12, ry);
    ry += 13;
  }

  // Card 3: Controls & Active Magic
  const c3X = pad + (cardW + gap) * 2;
  ctx.fillStyle = '#181818';
  ctx.strokeStyle = '#2e2e2e';
  ctx.strokeRect(c3X, cardY, cardW, cardH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('CONTROLS & ACTIVE MAGIC', c3X + 12, cardY + 18);

  ctx.fillStyle = '#cccccc';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('[WASD] Move   [B] Silk Bridge   [F] Spider Fetch', c3X + 12, cardY + 36);
  ctx.fillText('[E] Brew Potion   [SPACE] Fly Broom   [G] A* Path', c3X + 12, cardY + 52);

  if (activeBuffs.size > 0) {
    const buffStr = Array.from(activeBuffs.entries())
      .map(([id, s]) => `${id} (${Math.ceil(s)}s)`)
      .join(' | ');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Active: ${buffStr}`, c3X + 12, cardY + 68);
  }

  // Stage Clear / Victory Modal
  if (stageCleared) {
    ctx.fillStyle = 'rgba(10, 10, 10, 0.86)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mw = 480;
    const mh = 175;
    const mx = (canvas.width - mw) / 2;
    const my = (canvas.height - mh) / 2;

    ctx.fillStyle = '#161616';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(
      campaignWon ? '✦ SANCTUARY REACHED — ADVENTURE COMPLETE ✦' : '✦ STAGE 1 CLEARED — ESCAPED OUTSIDE ✦',
      canvas.width / 2,
      my + 52
    );

    ctx.fillStyle = '#d4d4d4';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(
      `Time: ${elapsedSeconds}s  •  Hero: ${player.character.toUpperCase()} Witch`,
      canvas.width / 2,
      my + 88
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(
      campaignWon ? 'Press [R] to play again from Stage 1' : 'Press [N] for Stage 2: The Starlit Forest  |  [R] Restart',
      canvas.width / 2,
      my + 132
    );
  }
}

let lastTime = performance.now();
function loop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  update(dt);
  drawGardenStage(now);
  drawChromeUI();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);