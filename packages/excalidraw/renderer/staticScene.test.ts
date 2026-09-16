import { isGridLineBold } from "./staticScene";

describe("grid line precision", () => {
  it("keeps bold-line phase stable for distant scroll offsets", () => {
    const gridSize = 20;
    const gridStep = 5;
    const scroll = 1_000_000_000_010;

    expect(isGridLineBold(10, scroll, gridSize, gridStep)).toBe(true);
    expect(isGridLineBold(30, scroll, gridSize, gridStep)).toBe(false);
    expect(isGridLineBold(110, scroll, gridSize, gridStep)).toBe(true);
  });

  it("handles negative scroll offsets", () => {
    expect(isGridLineBold(-10, -10, 20, 5)).toBe(true);
  });
});
