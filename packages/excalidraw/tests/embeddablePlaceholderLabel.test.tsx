import { defaultLang, languages, setLanguage } from "../i18n";
import { exportToSvg } from "../scene/export";

import { API } from "./helpers/api";

const exportEmptyEmbed = async () => {
  const embed = API.createElement({
    type: "embeddable",
    x: 0,
    y: 0,
    width: 800,
    height: 300,
  });
  const svg = await exportToSvg(
    [embed],
    { exportBackground: false, viewBackgroundColor: "#ffffff" },
    null,
    { skipInliningFonts: true },
  );
  return svg.textContent ?? "";
};

describe("embed placeholder label (sdamex #4886)", () => {
  afterEach(async () => {
    await setLanguage(defaultLang);
  });

  it("uses the editor language", async () => {
    await setLanguage(languages.find(({ code }) => code === "ru-RU")!);
    const text = await exportEmptyEmbed();

    expect(text).toContain("Пустая");
    expect(text).not.toContain("Empty");
  });

  it("stays English by default", async () => {
    expect(await exportEmptyEmbed()).toContain("Empty");
  });
});
