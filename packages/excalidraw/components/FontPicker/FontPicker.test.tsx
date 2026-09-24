import { FONT_FAMILY, FONT_METADATA, KEYS } from "@excalidraw/common";

import { Excalidraw } from "../..";
import { Keyboard } from "../../tests/helpers/ui";
import { act, render } from "../../tests/test-utils";

import { DEFAULT_FONTS } from "./FontPicker";

describe("FontPicker", () => {
  it("should be able to open font picker", async () => {
    (global as any).ResizeObserver =
      (global as any).ResizeObserver ||
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };

    const { queryByTestId } = await render(
      <Excalidraw handleKeyboardGlobally={true} />,
    );

    Keyboard.keyPress(KEYS.T);

    const fontPickerTrigger = queryByTestId("font-family-show-fonts");

    expect(fontPickerTrigger).not.toBeNull();

    act(() => {
      fontPickerTrigger!.click();
    });
  });

  it("the code font covers Cyrillic (sdamex #5069)", () => {
    const code = DEFAULT_FONTS.find(
      ({ testId }) => testId === "font-family-code",
    );

    expect(code?.value).toBe(FONT_FAMILY.Cascadia);
    expect(FONT_METADATA[FONT_FAMILY.Cascadia].deprecated).toBeUndefined();
    expect(FONT_METADATA[FONT_FAMILY["Comic Shanns"]].deprecated).toBe(true);
  });
});
