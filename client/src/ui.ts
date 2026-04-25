import { type WakeLockSentinel, type WakeLockNavigator } from "./types";

declare const __APP_VERSION__: string;

export function initMobileHudToggle(): void {
  const btn      = document.getElementById("hud-toggle")!;
  const backdrop = document.getElementById("hud-backdrop")!;
  const toggle   = () => document.body.classList.toggle("hud-open");
  btn.addEventListener("click", toggle);
  backdrop.addEventListener("click", toggle);
}

export function initWakeLock(): void {
  if (!("wakeLock" in navigator)) return;
  const nav = navigator as unknown as WakeLockNavigator;
  const btn = document.getElementById("wakelock-btn")!;
  let lock: WakeLockSentinel | null = null;

  function setActive(active: boolean): void {
    btn.classList.toggle("active", active);
    btn.textContent = active ? "◉" : "◎";
    btn.title = active ? "Fullscreen + screen awake — click to release" : "Fullscreen + keep screen awake";
  }

  async function acquire(): Promise<void> {
    try { await document.documentElement.requestFullscreen(); } catch (_) {}
    try {
      lock = await nav.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch (_) {}
    setActive(true);
  }

  async function release(): Promise<void> {
    if (lock) { await lock.release(); lock = null; }
    if (document.fullscreenElement) await document.exitFullscreen();
    setActive(false);
  }

  btn.addEventListener("click", () => { if (btn.classList.contains("active")) release(); else acquire(); });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && btn.classList.contains("active")) release();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !lock && btn.classList.contains("active"))
      nav.wakeLock.request("screen").then(l => { lock = l; }).catch(() => {});
  });
}

export function initVersionInfo(apiBase: string): void {
  const clientEl = document.getElementById("info-client-ver")!;
  const serverEl = document.getElementById("info-server-ver")!;
  const popup    = document.getElementById("info-popup")!;
  const btn      = document.getElementById("info-btn")!;

  clientEl.textContent = "v" + __APP_VERSION__;

  btn.addEventListener("click", (e) => { e.stopPropagation(); popup.classList.toggle("visible"); });
  document.addEventListener("click", () => popup.classList.remove("visible"));

  fetch(`${apiBase}/health`)
    .then(r => r.json())
    .then(d => { serverEl.textContent = "v" + (d.version ?? "?"); })
    .catch(() => {});
}
