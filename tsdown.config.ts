import { defineConfig } from "tsdown"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")) as { version: string }

const isProduction = process.env.NODE_ENV === "production"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  format: ["cjs"],
  dts: true,
  sourcemap: isProduction,
  clean: true,
  target: "node16",
  outDir: "dist",
  platform: "node",
  treeshake: true,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  outExtensions: () => ({
    js: ".js",
    dts: ".d.ts",
  }),
})
