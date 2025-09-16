/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleDirectories: ["node_modules", "src"],
  setupFilesAfterEnv: [],
};
