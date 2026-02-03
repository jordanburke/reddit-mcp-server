import { defineConfig } from "tsdown"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8")) as { version: string }

const isProduction = process.env.NODE_ENV === "production"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    bin: "src/bin.ts",
  },
  format: ["esm"],
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
