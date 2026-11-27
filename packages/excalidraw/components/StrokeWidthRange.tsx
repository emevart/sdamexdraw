import { useEffect, useRef } from "react";

import "./StrokeWidthRange.scss";

// Squiggle wave path (centered, with padding from edges so thick strokes don't clip)
const SQUIGGLE_PATH =
  "M16 28 C24 28, 28 12, 36 12 C44 12, 48 28, 56 28 C64 28, 68 12, 76 12 C80 12, 84 20, 84 20";

export const StrokeWidthRange = ({
  value,
  strokeColor,
  opacity,
  onChange,
  min = 0.5,
  max = 8,
  step = 0.5,
  presets,
}: {
  value: number;
  strokeColor: string;
  opacity: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  presets?: readonly number[];
}) => {
  const rangeRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  const ratio =
    max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  // Scale highlighter widths (8..40) cleanly inside the 40px-tall SVG viewBox
  // so thick presets remain visually distinct without clipping top/bottom.
  const previewStrokeWidth = max > 8 ? 5 + ratio * 15 : value;

  useEffect(() => {
    if (rangeRef.current && valueRef.current) {
      const rangeElement = rangeRef.current;
      const valueElement = valueRef.current;
      const pct = ratio * 100;
      const inputWidth = rangeElement.offsetWidth;
      const thumbWidth = 15;
      const position = (pct / 100) * (inputWidth - thumbWidth) + thumbWidth / 2;
      valueElement.style.left = `${position}px`;
      rangeElement.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${pct}%, var(--button-bg) ${pct}%, var(--button-bg) 100%)`;
    }
  }, [value, min, max, ratio]);

  return (
    <div className="stroke-width-range">
      <div className="stroke-width-range__preview">
        <svg
          width="100"
          height="40"
          viewBox="0 0 100 40"
          fill="none"
          aria-hidden="true"
        >
          <path
            d={SQUIGGLE_PATH}
            stroke={strokeColor}
            strokeOpacity={opacity / 100}
            strokeWidth={previewStrokeWidth}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div className="stroke-width-range__slider">
        <input
          ref={rangeRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(+e.target.value)}
          className="stroke-width-range__input"
          data-testid="strokeWidth-slider"
        />
        <div className="stroke-width-range__value" ref={valueRef}>
          {value}
        </div>
      </div>
      {presets && presets.length > 0 && (
        <div className="stroke-width-range__presets">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`stroke-width-range__preset${
                value === preset ? " stroke-width-range__preset--active" : ""
              }`}
              onClick={() => onChange(preset)}
              aria-pressed={value === preset}
              data-testid={`strokeWidth-preset-${preset}`}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
