/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server'],
  // ts-jest looks for tsconfig.json by default; this project keeps the server options in
  // tsconfig.server.json, and without them esModuleInterop is off and every default
  // import of express/supertest fails to compile.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.server.json' }],
  },
};
