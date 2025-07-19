import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
    server: 'src/server.ts'
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  shims: true,
});