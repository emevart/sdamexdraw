import en from "../locales/en.json";
import ru from "../locales/ru-RU.json";

// sdamex #5070, #4297: which links embed is decided by the host
// (`validateEmbeddable`). The vendor text sent people to GitHub to request a
// whitelist entry, which means nothing on SdamEx.
describe("unableToEmbed toast copy (sdamex #5070)", () => {
  it.each([
    ["en", en.toast.unableToEmbed],
    ["ru-RU", ru.toast.unableToEmbed],
  ])("%s does not send people to GitHub", (_, text) => {
    expect(text).not.toMatch(/github|issue|whitelist|белый список/i);
  });
});
