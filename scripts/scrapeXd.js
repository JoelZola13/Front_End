import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

async function main() {
  const [,, rawUrl, outDir = 'xd-output'] = process.argv;
  if (!rawUrl) {
    console.error('Usage: node scripts/scrapeXd.js <xd-share-url> [output-directory]');
    process.exit(1);
  }

  const url = normalizeUrl(rawUrl);
  const absoluteOutDir = path.resolve(process.cwd(), outDir);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US'
  });
  const page = await context.newPage();

  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(
    () => typeof window !== 'undefined' && window.prototypeData?.manifest?.artboards?.length,
    undefined,
    { timeout: 30000 }
  );

  const prototypeData = await page.evaluate(() => ({
    manifest: window.prototypeData?.manifest ?? null,
    linkTemplate: window.prototypeData?.linkTemplate ?? null,
    ownerId: window.prototypeData?.ownerId ?? null,
    modifiedDate: window.prototypeData?.modifiedDate ?? null
  }));

  await mkdir(absoluteOutDir, { recursive: true });

  const metadataPath = path.join(absoluteOutDir, 'prototypeData.json');
  await writeFile(metadataPath, JSON.stringify(prototypeData, null, 2), 'utf8');
  console.log(`Saved prototype metadata to ${metadataPath}`);

  await downloadManifestAssetsFromPage(page, absoluteOutDir);

  const screenshotPath = path.join(absoluteOutDir, 'artboard.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Captured screenshot at ${screenshotPath}`);

  await browser.close();
  console.log('Done.');
}

async function downloadManifestAssetsFromPage(page, outDir) {
  const assets = await page.evaluate(async () => {
    const proto = window.prototypeData;
    if (!proto?.manifest || !proto?.linkTemplate?.href) {
      return [];
    }

    const queue = [];
    const seen = new Set();

    const enqueue = (componentId, componentPath) => {
      if (!componentId || !componentPath) {
        return;
      }
      const key = `${componentId}|${componentPath}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      queue.push({ componentId, componentPath });
    };

    const { manifest } = proto;
    if (manifest.globalResources) {
      enqueue(manifest.globalResources.id, manifest.globalResources.path);
    }
    if (manifest.interactions) {
      enqueue(manifest.interactions.id, manifest.interactions.path);
    }
    manifest.artboards?.forEach((artboard) => {
      artboard.components?.forEach((component) => {
        enqueue(component.id, component.path);
      });
    });
    if (manifest.resources) {
      Object.values(manifest.resources).forEach((resource) => {
        enqueue(resource.id, resource.path);
      });
    }

    if (!queue.length) {
      return [];
    }

    const baseHref = proto.linkTemplate.href.split('{')[0];
    const defaultParams = proto.linkTemplate.data ?? {};

    const results = [];
    for (const { componentId, componentPath } of queue) {
      const url = new URL(baseHref);
      Object.entries(defaultParams).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      url.searchParams.set('component_id', componentId);
      url.searchParams.set('component_path', componentPath);

      try {
        const response = await fetch(url.href, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        results.push({
          componentPath,
          contentType: response.headers.get('content-type') || 'application/octet-stream',
          bytes: Array.from(new Uint8Array(arrayBuffer))
        });
      } catch (error) {
        results.push({ componentPath, error: error.message });
      }
    }
    return results;
  });

  if (!assets?.length) {
    console.log('No downloadable assets found via page context.');
    return;
  }

  for (const asset of assets) {
    if (asset.error) {
      console.warn(`Failed to download ${asset.componentPath}: ${asset.error}`);
      continue;
    }
    try {
      const destination = path.join(outDir, asset.componentPath);
      await mkdir(path.dirname(destination), { recursive: true });
      const buffer = Buffer.from(Uint8Array.from(asset.bytes));
      await writeFile(destination, buffer);
      console.log(`Downloaded asset -> ${asset.componentPath}`);
    } catch (error) {
      console.warn(`Failed to save ${asset.componentPath}: ${error.message}`);
    }
  }
}

function normalizeUrl(url) {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

main().catch((error) => {
  console.error('Failed to scrape Adobe XD link');
  console.error(error);
  process.exit(1);
});
