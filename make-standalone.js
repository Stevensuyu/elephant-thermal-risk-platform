const fs = require("fs");
const path = require("path");

const root = __dirname;
const htmlPath = path.join(root, "index.html");
const cssPath = path.join(root, "styles.css");
const jsPath = path.join(root, "app.js");
const outPath = path.join(root, "standalone.html");
const distPath = path.join(root, "dist-site");

let html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");

html = html.replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script src="./app.js"></script>', `<script>\n${js}\n</script>`);

fs.writeFileSync(outPath, html, "utf8");

fs.rmSync(distPath, { recursive: true, force: true });
fs.mkdirSync(distPath, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "standalone.html"]) {
  fs.copyFileSync(path.join(root, file), path.join(distPath, file));
}
const publicPath = path.join(root, "public");
if (fs.existsSync(publicPath)) {
  fs.cpSync(publicPath, path.join(distPath, "public"), { recursive: true });
}

console.log(`standalone: ${outPath}`);
console.log(`dist: ${distPath}`);
