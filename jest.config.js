export default {
    testEnvironment: 'jsdom',
    transform: {},
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    testMatch: [
        '**/tests/**/*.test.js'
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
