import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts'
  },
  format: ['cjs'],
  dts: process.env.SKIP_DTS !== 'true',
  clean: true,
  shims: true,
  skipNodeModulesBundle: true,
  target: 'node16',
});