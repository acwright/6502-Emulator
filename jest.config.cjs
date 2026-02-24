module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  testPathIgnorePatterns: ['Machine.test.ts']
}
