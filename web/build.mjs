import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

const outdir = "../api/public";
mkdirSync(outdir, { recursive: true });

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: "iife",
  target: "es2020",
  outfile: `${outdir}/widget.js`,
});

console.log("Built widget.js -> api/public/widget.js");
