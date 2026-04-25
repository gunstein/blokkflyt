import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { blockStrokeWidth } from "./utils";
import { showBlockTooltip, moveTooltip, hideTooltip } from "./hud";

const HOUR_SECS            = 3600;
const MAX_BLOCKS           = 20;
const MOBILE_BREAKPOINT    = 640;
const MOBILE_CENTER_RATIO  = 0.50;
const DESKTOP_CENTER_SHIFT = 40;

export interface BlockSegment {
  gfx: Graphics;
  createdAt: number;
  height: number;
  ntx: number;
  sizeKb: number;
  totalBtc: number;
  medianFee: number | null;
}

let _app: Application;
let _ringGfx: Graphics;
let _miningArcGfx: Graphics;
let _clockHandGfx: Graphics;
let _mempoolLabel: Text;
let _currentMiningStartTime = 0;

export const blockSegments: BlockSegment[] = [];

export function initCanvas(app: Application): void {
  _app          = app;
  _ringGfx      = new Graphics();
  _miningArcGfx = new Graphics();
  _clockHandGfx = new Graphics();
  _mempoolLabel = new Text({
    text: "MEMPOOL",
    style: new TextStyle({ fill: 0x334455, fontSize: 14, fontFamily: "monospace", letterSpacing: 6 }),
  });
  _mempoolLabel.anchor.set(0.5, 0.5);
  app.stage.addChild(_ringGfx, _miningArcGfx, _clockHandGfx, _mempoolLabel);
  drawRing();
  drawClockHand();
  positionMempoolLabel();
}

export function centerX(): number { return window.innerWidth / 2; }
export function centerY(): number {
  return window.innerWidth <= MOBILE_BREAKPOINT
    ? window.innerHeight * MOBILE_CENTER_RATIO
    : window.innerHeight / 2 - DESKTOP_CENTER_SHIFT;
}
export function ringRadius(): number          { return Math.min(centerX(), centerY()) * 0.72; }
export function blockRingRadius(): number     { return ringRadius() + 36; }
export function confirmedRingRadius(): number { return ringRadius() + 68; }

export function secInHourToAngle(sec: number): number {
  return (sec / HOUR_SECS) * Math.PI * 2 - Math.PI / 2;
}

export function getCurrentMiningStartTime(): number   { return _currentMiningStartTime; }
export function setCurrentMiningStartTime(t: number): void { _currentMiningStartTime = t; }

export function drawRing(): void {
  const cx = centerX(), cy = centerY(), r = ringRadius();
  const br = blockRingRadius();
  const cr = confirmedRingRadius();
  _ringGfx.clear();
  _ringGfx.circle(cx, cy, r).stroke({ color: 0x334455, width: 1.5, alpha: 0.6 });
  _ringGfx.circle(cx, cy, 12).stroke({ color: 0x445566, width: 1, alpha: 0.4 });
  _ringGfx.circle(cx, cy, br).stroke({ color: 0x1a2a3a, width: 1, alpha: 0.5 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
    _ringGfx
      .moveTo(cx + Math.cos(angle) * (br - 6), cy + Math.sin(angle) * (br - 6))
      .lineTo(cx + Math.cos(angle) * (br + 6), cy + Math.sin(angle) * (br + 6))
      .stroke({ color: 0x334455, width: 1, alpha: 0.6 });
  }
  _ringGfx.circle(cx, cy, cr).stroke({ color: 0x1a2a3a, width: 1, alpha: 0.5 });
}

export function drawClockHand(): void {
  const cx = centerX(), cy = centerY();
  const br = blockRingRadius();
  const ir = ringRadius();

  const now       = new Date();
  const totalSec  = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  const secInHour = totalSec % HOUR_SECS;
  const nowAngle  = secInHourToAngle(secInHour);
  const secAngle  = (totalSec % 60 / 60)      * Math.PI * 2 - Math.PI / 2;
  const minAngle  = (totalSec % 3600 / 3600)  * Math.PI * 2 - Math.PI / 2;
  const hourAngle = (totalSec % 43200 / 43200) * Math.PI * 2 - Math.PI / 2;

  _clockHandGfx.clear();
  _clockHandGfx
    .moveTo(cx + Math.cos(nowAngle) * (br - 8), cy + Math.sin(nowAngle) * (br - 8))
    .lineTo(cx + Math.cos(nowAngle) * (br + 8), cy + Math.sin(nowAngle) * (br + 8))
    .stroke({ color: 0x667788, width: 2, alpha: 0.8 });
  _clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(hourAngle) * ir * 0.52, cy + Math.sin(hourAngle) * ir * 0.52)
    .stroke({ color: 0x6699cc, width: 4, alpha: 0.7 });
  _clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(minAngle) * ir * 0.75, cy + Math.sin(minAngle) * ir * 0.75)
    .stroke({ color: 0x55bbdd, width: 2.5, alpha: 0.6 });
  _clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(secAngle) * ir * 0.85, cy + Math.sin(secAngle) * ir * 0.85)
    .stroke({ color: 0x33ddee, width: 1.5, alpha: 0.5 });
  _clockHandGfx.circle(cx, cy, 4).fill({ color: 0x6699cc, alpha: 0.8 });
}

export function positionMempoolLabel(): void {
  _mempoolLabel.x = centerX();
  _mempoolLabel.y = centerY();
}

export function drawMiningArc(): void {
  if (_currentMiningStartTime === 0) return;
  const cx = centerX(), cy = centerY(), r = blockRingRadius();
  const now        = Date.now();
  const elapsedSec = now / 1000 - _currentMiningStartTime;
  const startSec   = _currentMiningStartTime % HOUR_SECS;
  const cappedDur  = Math.min(elapsedSec, HOUR_SECS - 1);
  const startAngle = secInHourToAngle(startSec);
  const endAngle   = secInHourToAngle(startSec + cappedDur);

  _miningArcGfx.clear();
  if (elapsedSec < HOUR_SECS) {
    const color = elapsedSec < 2700 ? 0xaabbcc
                : elapsedSec < 3300 ? 0xf7931a
                : 0xff4444;
    _miningArcGfx.arc(cx, cy, r, startAngle, endAngle)
      .stroke({ color, width: 2, alpha: 0.45 });
  }
}

export function redrawBlockSegments(): void {
  const cx        = centerX(), cy = centerY(), r = confirmedRingRadius();
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const arcWidth  = angleStep * 0.65;
  for (const [i, seg] of blockSegments.entries()) {
    const angle = i * angleStep - Math.PI / 2;
    seg.gfx.clear();
    seg.gfx.arc(cx, cy, r, angle - arcWidth / 2, angle + arcWidth / 2)
      .stroke({ color: 0xffffff, width: blockStrokeWidth(seg.ntx), alpha: 1 });
  }
}

export function updateBlockSegmentColors(): void {
  for (const [i, seg] of blockSegments.entries()) {
    const posRatio       = blockSegments.length > 1 ? i / (blockSegments.length - 1) : 1;
    const rv             = Math.round(0xcc + posRatio * (0xff - 0xcc));
    const gv             = Math.round(0x44 + posRatio * (0xee - 0x44));
    const bv             = Math.round(0x00 + posRatio * (0x44 - 0x00));
    seg.gfx.tint         = (rv << 16) | (gv << 8) | bv;
    const stepsFromNewest = blockSegments.length - 1 - i;
    seg.gfx.alpha        = Math.max(0.25, Math.pow(0.85, stepsFromNewest));
  }
}

export function addBlockSegment(
  ntx: number, sizeKb: number, totalBtc: number, height: number, medianFee: number | null,
): { x: number; y: number } {
  const cx        = centerX(), cy = centerY(), r = confirmedRingRadius();
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const angle     = blockSegments.length * angleStep - Math.PI / 2;
  const arcWidth  = angleStep * 0.65;

  const gfx = new Graphics();
  gfx.arc(cx, cy, r, angle - arcWidth / 2, angle + arcWidth / 2)
    .stroke({ color: 0xffffff, width: blockStrokeWidth(ntx), alpha: 1 });
  gfx.eventMode = "static";
  gfx.cursor    = "crosshair";
  _app.stage.addChild(gfx);

  gfx.on("pointerover", (e) => showBlockTooltip(height, ntx, sizeKb, totalBtc, medianFee, e.client.x, e.client.y));
  gfx.on("pointermove", (e) => moveTooltip(e.client.x, e.client.y));
  gfx.on("pointerout",  ()  => hideTooltip());

  blockSegments.push({ gfx, createdAt: Date.now(), height, ntx, sizeKb, totalBtc, medianFee });

  if (blockSegments.length > MAX_BLOCKS) {
    const old = blockSegments.shift()!;
    old.gfx.destroy();
  }

  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}
