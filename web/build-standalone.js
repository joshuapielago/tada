/* Bundles the six prototypes + shared assets into a single self-contained
 * HTML file (web/tada-prototypes.html) that runs by double-clicking — no
 * server needed. Each prototype keeps its own conflicting global styles by
 * living in an isolated <iframe srcdoc>. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const brand = read("shared/brand.css");
const decksCss = read("shared/decks.css");
const decksJs = read("shared/decks.js");

const protos = [
  { id: "01-spotlight", name: "1 · Spotlight Gallery" },
  { id: "02-magic-drop", name: "2 · Magic Drop" },
  { id: "03-editorial", name: "3 · Editorial Curated" },
  { id: "04-mosaic", name: "4 · Living Mosaic" },
  { id: "05-bento", name: "5 · Playful Bento" },
  { id: "06-minimal", name: "6 · Quiet Light" },
];

const htmls = protos.map((p) =>
  read(`${p.id}/index.html`)
    .replace('<link rel="stylesheet" href="/shared/brand.css">', `<style>${brand}</style>`)
    .replace('<link rel="stylesheet" href="/shared/decks.css">', `<style>${decksCss}</style>`)
    .replace('<script src="/shared/decks.js"></script>', `<script>${decksJs}</script>`)
);

// Guard against any "</..." prematurely closing our outer <script>.
const payload = JSON.stringify(htmls).replace(/<\//g, "<\\/");

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TaDa! — Homepage Prototypes</title>
<style>
  :root { --coral:#ff4f68; --coral-deep:#df3651; --night:#170d24; --yellow:#ffd24f; --line:#eadbea; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background:#15101c; }
  .bar { display:flex; align-items:center; gap:8px; padding:10px 14px; background:#1d1426; overflow-x:auto;
    position:sticky; top:0; z-index:10; border-bottom:1px solid #2c1f3a; }
  .brand { display:flex; align-items:center; gap:8px; color:#fff; font-weight:700; margin-right:8px; white-space:nowrap; }
  .brand .logo { display:grid; place-items:center; width:30px; height:30px; border-radius:9px;
    background:linear-gradient(135deg,#2b1b46,#170d24); color:var(--yellow); }
  .tab { padding:9px 15px; border:0; border-radius:999px; background:#2a1d39; color:#c9bcdb;
    font-weight:600; font-size:.86rem; cursor:pointer; white-space:nowrap; transition:.15s; }
  .tab:hover { background:#34254a; color:#fff; }
  .tab.on { background:linear-gradient(135deg,var(--coral),var(--coral-deep)); color:#fff; }
  .hint { margin-left:auto; color:#7d6f90; font-size:.78rem; white-space:nowrap; padding-right:6px; }
  iframe { width:100%; height:calc(100vh - 53px); border:0; display:block; background:#fff; }
  @media (max-width:680px){ .hint{ display:none; } }
</style>
</head>
<body>
  <div class="bar">
    <span class="brand"><span class="logo">✦</span> TaDa!</span>
    ${protos.map((p, i) => `<button class="tab${i === 0 ? " on" : ""}" data-i="${i}">${p.name}</button>`).join("\n    ")}
    <span class="hint">Six homepage directions · praktikal.ai/tada</span>
  </div>
  <iframe id="view" title="Prototype preview"></iframe>
<script>
  var P = ${payload};
  var view = document.getElementById("view");
  function show(i){
    view.srcdoc = P[i];
    var t = document.querySelectorAll(".tab");
    for (var k=0;k<t.length;k++) t[k].classList.toggle("on", +t[k].dataset.i === i);
  }
  document.querySelector(".bar").addEventListener("click", function(e){
    if (e.target.dataset && e.target.dataset.i !== undefined) show(+e.target.dataset.i);
  });
  show(0);
</script>
</body>
</html>`;

writeFileSync(join(ROOT, "tada-prototypes.html"), out);
console.log("wrote web/tada-prototypes.html  (" + (out.length / 1024).toFixed(0) + " KB, " + protos.length + " prototypes inlined)");
