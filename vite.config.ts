import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Relative asset URLs keep the static build working under the /TEST/ Pages path.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        usagePolicy: fileURLToPath(new URL('./usage-policy.html', import.meta.url)),
      },
    },
  },
});
