// Node's ESM resolver requires explicit file extensions on relative imports;
// Vite's dev/build pipeline doesn't, so the app's own source (useAuthStore.js
// importing "../api/client", cookSession.js importing "./useAuthStore") uses
// extensionless specifiers throughout. This is a minimal `node --import`
// resolution hook (Node 20.6+ hooks API) that retries a failed relative
// resolution with a ".js" suffix - just enough to run this frontend's plain
// ES modules under a bare Node script for testing, without adding a bundler
// or test-runner dependency this repo doesn't otherwise have.
import { register } from "node:module";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}
