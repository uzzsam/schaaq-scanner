/**
 * Minimal ESM resolve hook that adds .js extensions to extensionless local imports.
 * The compiled server code uses imports like './db/schema' which need '.js' appended
 * for Node.js ESM resolution.
 */

export async function resolve(specifier, context, nextResolve) {
  // Only handle relative imports without file extensions
  if (specifier.startsWith('.') && !specifier.match(/\.\w+$/)) {
    // Try with .js extension first
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      // Try as directory with index.js
      try {
        return await nextResolve(specifier + '/index.js', context);
      } catch {
        // Fall through to default resolution
      }
    }
  }
  return nextResolve(specifier, context);
}
