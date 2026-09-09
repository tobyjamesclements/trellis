// Renders the manifest icons from public/icons/icon.svg with the Chromium
// that Playwright provides. Run `pnpm icons` after changing the SVG and
// commit the PNGs; the build does not depend on this script.
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, padding, file) {
  const inner = size - padding * 2;
  await page.setViewportSize({ width: size, height: size });
  const background = padding > 0 ? "#1f6f5f" : "transparent";
  await page.setContent(
    `<body style="margin:0;background:${background}"><div style="width:${inner}px;height:${inner}px;margin:${padding}px">${svg.replace(
      "<svg ",
      '<svg style="width:100%;height:100%;display:block" ',
    )}</div></body>`,
  );
  await page.screenshot({
    path: new URL(`../public/icons/${file}`, import.meta.url).pathname,
    omitBackground: padding === 0,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log(`wrote public/icons/${file}`);
}

await render(192, 0, "icon-192.png");
await render(512, 0, "icon-512.png");
await render(512, 64, "icon-maskable-512.png");
await browser.close();
