/** @type {import('vitest/config').UserConfig} */
module.exports = {
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
};
