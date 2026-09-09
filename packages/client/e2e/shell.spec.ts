import { expect, type Page, test } from "@playwright/test";

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test.describe("the shell", () => {
  test("is installable and opens again with the network off", async ({ page, context }) => {
    await page.goto("/");

    // Installability: a manifest with icons the browser can fetch.
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const manifest = await page.request.get(manifestHref as string);
    expect(manifest.ok()).toBe(true);
    const {
      icons,
      display,
      start_url: startUrl,
    } = (await manifest.json()) as {
      icons: { src: string; sizes: string }[];
      display: string;
      start_url: string;
    };
    expect(display).toBe("standalone");
    expect(startUrl).toBe("/");
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of icons) {
      expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true);
    }

    // First run: choose a language, then let the worker take control.
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Join a class" })).toBeVisible();
    await waitForServiceWorkerControl(page);

    // Network off: the shell, its strings, and the WASM module come from the cache.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Join a class" })).toBeVisible();
    await expect(page.getByText("Offline")).toBeVisible();
    // The navigation itself was answered by the worker, not by an HTTP cache.
    const workerStart = await page.evaluate(
      () =>
        (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).workerStart,
    );
    expect(workerStart).toBeGreaterThan(0);
    await context.setOffline(false);
  });

  test("switches language on the device without a reload and remembers it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Español" }).click();
    await expect(page.getByRole("heading", { name: "Unirse a una clase" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("es");

    await page.evaluate(() => Reflect.set(window, "__stillHere", true));
    await page.getByLabel("Idioma").selectOption("en");
    await expect(page.getByRole("heading", { name: "Join a class" })).toBeVisible();
    await expect(page.getByLabel("Language")).toHaveValue("en");
    expect(await page.evaluate(() => Reflect.get(window, "__stillHere"))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Join a class" })).toBeVisible();
  });

  test("requests persistent storage, reports it, and opens the site's document store", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByText(/^Storage:/)).toBeVisible();
    const persisted = await page.evaluate(() => navigator.storage.persisted());
    await expect(
      page.getByText(persisted ? "Storage: protected" : /Storage: not protected/),
    ).toBeVisible();

    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map((database) => database.name),
    );
    expect(databases).toContain("trellis-127.0.0.1");
  });

  test("checks the shape of a class code before looking for the box", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "English" }).click();
    await page.getByLabel("Class code").fill("k7");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByRole("alert")).toHaveText(/4 to 16 letters and numbers/);
    await page.getByLabel("Class code").fill("k7p2qx");
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Can't reach the box/);
  });
});
