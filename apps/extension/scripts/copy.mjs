// Copies the static files (manifest, HTML, CSS) next to the compiled scripts in dist/.
// STORE=1 builds the Chrome Web Store package: no localhost permission.
import { cp, readFile, writeFile } from "node:fs/promises";
const dist = new URL("../dist/", import.meta.url);
await cp(new URL("../public/", import.meta.url), dist, { recursive: true });
if (process.env.STORE === "1") {
  const m = JSON.parse(await readFile(new URL("manifest.json", dist), "utf8"));
  m.host_permissions = m.host_permissions.filter((h) => !h.startsWith("http://localhost"));
  await writeFile(new URL("manifest.json", dist), JSON.stringify(m, null, 2));
}
console.log("✓ extension built in apps/extension/dist (load it unpacked in chrome://extensions)");
