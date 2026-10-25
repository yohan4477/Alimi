// Tests that expect English copy must not depend on the machine's locale.
// Node derives navigator.language from the OS, so a Korean Windows PC would otherwise get Korean.
// Import this before any module that reads the language at load time.
Object.defineProperty(globalThis.navigator, 'language', {value: 'en-US', configurable: true});
