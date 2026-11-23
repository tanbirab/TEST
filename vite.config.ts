import { defineConfig } from 'vite';

// Relative asset URLs keep the static build working under the /TEST/ Pages path.
export default defineConfig({ base: './' });
