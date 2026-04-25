import { Application } from "pixi.js";
import { initCanvas, drawRing, drawClockHand, positionMempoolLabel, drawMiningArc, updateBlockSegmentColors, redrawBlockSegments } from "./canvas";
import { initNodes, tickNodes, rescaleNodes } from "./nodes";
import { connectWebSocket, fetchStats } from "./network";
import { initMobileHudToggle, initWakeLock, initVersionInfo } from "./ui";

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.getElementById("app")!.appendChild(app.canvas);

initCanvas(app);
initNodes(app.stage);

window.addEventListener("resize", () => {
  drawRing();
  drawClockHand();
  positionMempoolLabel();
  redrawBlockSegments();
  rescaleNodes();
});

app.ticker.add(() => {
  tickNodes();
  drawClockHand();
  drawMiningArc();
  updateBlockSegmentColors();
});

connectWebSocket();
fetchStats();
initMobileHudToggle();
initWakeLock();
initVersionInfo("");
