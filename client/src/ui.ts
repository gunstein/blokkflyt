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
  const btn = document.getElementById("wakelock-btn")!;
  let lock: WakeLockSentinel | null = null;

  function setActive(active: boolean): void {
    btn.classList.toggle("active", active);
    btn.textContent = active ? "◉" : "◎";
    btn.title = active ? "Screen kept awake — click to release" : "Keep screen awake";
  }

  async function acquire(): Promise<void> {
    try {
      lock = await (navigator as unknown as { wakeLock: { request(t: string): Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      setActive(true);
      lock.addEventListener("release", () => { lock = null; setActive(false); });
    } catch (_) {}
  }

  btn.addEventListener("click", () => { if (lock) lock.release(); else acquire(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !lock && btn.classList.contains("active")) acquire();
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
