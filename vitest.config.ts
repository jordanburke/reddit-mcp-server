import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "ts-builds/vitest"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/__tests__/**/*.test.ts"],
      coverage: {
        exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.config.*", "**/mockData.ts", "**/bin.ts"],
      },
    },
  }),
)
