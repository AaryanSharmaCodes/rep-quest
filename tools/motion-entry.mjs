// Rebuild js/motion-lib.js: npx esbuild tools/motion-entry.mjs --bundle --minify --format=iife --global-name=MotionLib --target=es2020 --outfile=js/motion-lib.js
// Only Motion's spring generator: it turns real spring physics into a curve the browser's own animation engine can run.
export { spring } from 'motion';
