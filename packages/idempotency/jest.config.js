/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Integration suites share one Redis instance, so run serially.
  maxWorkers: 1,
  roots: ['<rootDir>/test'],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      lines: 70,
    },
  },
};
