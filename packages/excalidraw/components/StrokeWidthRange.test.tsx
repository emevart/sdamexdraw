import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { StrokeWidthRange } from "./StrokeWidthRange";

describe("StrokeWidthRange", () => {
  it("renders slider with min, max, step, and current value", () => {
    const onChange = vi.fn();
    render(
      <StrokeWidthRange
        value={2}
        strokeColor="#1e1e1e"
        opacity={100}
        onChange={onChange}
      />,
    );

    const slider = screen.getByTestId("strokeWidth-slider") as HTMLInputElement;
    expect(slider.min).toBe("0.5");
    expect(slider.max).toBe("8");
    expect(slider.step).toBe("0.5");
    expect(slider.value).toBe("2");

    fireEvent.change(slider, { target: { value: "4.5" } });
    expect(onChange).toHaveBeenCalledWith(4.5);
  });

  it("renders quick preset pills, highlights active preset, and scales highlighter preview", () => {
    const onChange = vi.fn();
    const { container } = render(
      <StrokeWidthRange
        value={24}
        strokeColor="#ffec99"
        opacity={40}
        min={8}
        max={40}
        step={2}
        presets={[8, 16, 24, 36]}
        onChange={onChange}
      />,
    );

    const activePreset = screen.getByTestId("strokeWidth-preset-24");
    expect(activePreset.getAttribute("aria-pressed")).toBe("true");
    expect(activePreset.className).toContain(
      "stroke-width-range__preset--active",
    );

    const inactivePreset = screen.getByTestId("strokeWidth-preset-16");
    expect(inactivePreset.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(inactivePreset);
    expect(onChange).toHaveBeenCalledWith(16);

    const path = container.querySelector("svg path");
    expect(path).not.toBeNull();
    // Highlighter (max=40, value=24 => ratio 0.5) scales to 5 + 0.5 * 15 = 12.5
    expect(path!.getAttribute("stroke-width")).toBe("12.5");
  });
});
