/** Jest configuration: hermetic tests that need no external services. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Drains lingering test sockets and releases Redis/Prisma handles after
  // every suite so Jest workers exit instead of being force-killed.
  setupFilesAfterEnv: ['<rootDir>/tests/teardown.ts'],
  transform: {
    // Type-checking happens in `npm run typecheck`; transpile only here so
    // the suite stays fast.
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.test.json', diagnostics: false },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  // Baseline is measured from the hermetic suite; keep a small buffer so
  // refactors that lose coverage fail CI.
  coverageThreshold: {
    global: {
      statements: 63,
      branches: 50,
      functions: 55,
      lines: 63,
    },
  },
  testTimeout: 20000,
};
