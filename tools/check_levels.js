// Replays every solution in docs/solutions against the engine: node tools/check_levels.js
const fs = require("fs"), path = require("path");
const E = require("../docs/js/engine.js"), LEVELS = require("../docs/js/levels.js");
let ok = true;
LEVELS.forEach((def, i) => {
  const file = path.join(__dirname, "../docs/solutions", `level_${String(i + 1).padStart(2, "0")}.txt`);
  const { g, steps } = E.replay(def, fs.readFileSync(file, "utf8"));
  const pass = g.completed;
  ok = ok && pass;
  console.log(`${pass ? "✔" : "✘"} level ${i + 1} ${def.name.padEnd(18)} ${pass ? `cleared in ${(steps / 60).toFixed(1)} s` : g.dying ? "died" : "not finished"}`);
});
process.exit(ok ? 0 : 1);
