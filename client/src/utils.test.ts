import { describe, it, expect, vi, beforeEach } from "vitest";
import { nodeRadius, vsizeAlpha, stateColor, blockStrokeWidth, timeAgo, HIGH_FEE_THRESHOLD } from "./utils";

describe("nodeRadius", () => {
  it("returns default for null", () => expect(nodeRadius(null)).toBe(3));
  it("small amount gets small radius", () => expect(nodeRadius(0.001)).toBe(2.5));
  it("0.01 BTC threshold", () => expect(nodeRadius(0.01)).toBe(4));
  it("0.1 BTC threshold", () => expect(nodeRadius(0.1)).toBe(6));
  it("1 BTC threshold", () => expect(nodeRadius(1)).toBe(9));
  it("10 BTC threshold", () => expect(nodeRadius(10)).toBe(13));
  it("100 BTC threshold", () => expect(nodeRadius(100)).toBe(18));
  it("large whales get max radius", () => expect(nodeRadius(1000)).toBe(18));
});

describe("vsizeAlpha", () => {
  it("returns default for null", () => expect(vsizeAlpha(null)).toBe(0.7));
  it("tiny tx is fully opaque", () => expect(vsizeAlpha(100)).toBe(1.0));
  it("200 vbyte threshold", () => expect(vsizeAlpha(200)).toBe(0.85));
  it("500 vbyte threshold", () => expect(vsizeAlpha(500)).toBe(0.7));
  it("1000 vbyte threshold", () => expect(vsizeAlpha(1000)).toBe(0.5));
  it("very large tx is near-transparent", () => expect(vsizeAlpha(10000)).toBe(0.3));
});

describe("stateColor", () => {
  it("new = purple", () => expect(stateColor("new")).toBe(0xaa66ff));
  it("mempool = blue", () => expect(stateColor("mempool")).toBe(0x4488ff));
  it("high_fee = orange", () => expect(stateColor("high_fee")).toBe(0xf7931a));
  it("selected = yellow", () => expect(stateColor("selected")).toBe(0xffdd00));
});

describe("blockStrokeWidth", () => {
  it("zero tx gets minimum width",      () => expect(blockStrokeWidth(0)).toBe(2));
  it("negative tx gets minimum width",  () => expect(blockStrokeWidth(-1)).toBe(2));
  it("1000 tx → ~5",                   () => expect(blockStrokeWidth(1000)).toBe(5));
  it("3000 tx → ~10",                  () => expect(blockStrokeWidth(3000)).toBe(10));
  it("5000 tx → ~15",                  () => expect(blockStrokeWidth(5000)).toBe(15));
  it("6000 tx → max 18",               () => expect(blockStrokeWidth(6000)).toBe(18));
  it("oversized tx count capped at 18", () => expect(blockStrokeWidth(9999)).toBe(18));
});

describe("HIGH_FEE_THRESHOLD", () => {
  it("is 10 sat/vB", () => expect(HIGH_FEE_THRESHOLD).toBe(10));
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  it("shows seconds for recent block", () => {
    const ts = Math.floor(Date.now() / 1000) - 45;
    expect(timeAgo(ts)).toBe("45s ago");
  });

  it("shows minutes and seconds for older block", () => {
    const ts = Math.floor(Date.now() / 1000) - 125;
    expect(timeAgo(ts)).toBe("2m 5s ago");
  });
});
