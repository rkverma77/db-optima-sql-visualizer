const fs = require("fs");
const path = require("path");

// require.resolve("sql.js") returns the main entry point
// We need to find the package root, then go to dist/
const sqlJsMain = require.resolve("sql.js");
// Go up from dist/sql.js to dist/, then up to sql.js/
const sqlJsRoot = path.dirname(path.dirname(sqlJsMain));
const distPath = path.join(sqlJsRoot, "dist");

const destDir = path.join(__dirname, "..", "public");

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy all WASM files
const files = fs.readdirSync(distPath).filter(f => f.endsWith(".wasm"));

if (files.length === 0) {
  console.error("❌ No WASM files found in", distPath);
  process.exit(1);
}

files.forEach(file => {
  const src = path.join(distPath, file);
  const dest = path.join(destDir, file);
  fs.copyFileSync(src, dest);
  console.log(`✅ Copied ${file} → public/${file}`);
});