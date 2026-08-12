import { createRequire } from "node:module";
import type { Slide } from "./agents/presentation.js";

const require = createRequire(import.meta.url);
const pptxgen = require("pptxgenjs") as new () => import("pptxgenjs").default;

export async function renderPptx(slides: Slide[], outPath: string) {
  const pres = new pptxgen();
  pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pres.layout = "WIDE";

  slides.forEach((s, i) => {
    const slide = pres.addSlide();
    slide.background = { color: i === 0 ? "1a1a2e" : "FFFFFF" };
    slide.addText(s.title, {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 1,
      fontSize: i === 0 ? 40 : 30,
      bold: true,
      color: i === 0 ? "FFFFFF" : "1a1a2e",
    });
    if (s.bullets.length)
      slide.addText(
        s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.8, w: 11.5, h: 5, fontSize: 20, color: i === 0 ? "FFFFFF" : "333333" }
      );
    slide.addNotes(s.speakerNotes);
  });
  await pres.writeFile({ fileName: outPath });
}
