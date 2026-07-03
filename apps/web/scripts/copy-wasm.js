// Copies node_modules/sql.js/dist/sql-wasm.wasm into public/.
//
// Why: sql.js ships a JS "glue" file (from npm, whatever version is installed)
// and a matching .wasm binary. The previous code fetched the JS from npm but
// the .wasm from a hardcoded CDN URL pinned to an old version (1.8.0). When
// the two versions drift apart, sql.js throws:
//   "both async and sync fetching of the wasm failed"
// Serving the wasm from public/ (same origin, same version as the installed
// package, and compatible with this app's COOP/COEP headers) fixes this for
// good and keeps it correct automatically on every `npm install`.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const fallbackSrc = path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "sql-wasm.wasm");

const resolvedSrc = fs.existsSync(src) ? src : fallbackSrc;

if (!fs.existsSync(resolvedSrc)) {
  console.warn("[copy-wasm] Could not find sql.js's sql-wasm.wasm — is sql.js installed?");
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(resolvedSrc, dest);
console.log(`[copy-wasm] Copied sql-wasm.wasm -> ${path.relative(process.cwd(), dest)}`);
