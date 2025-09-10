// Test setup file
const path = require('path');

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FORCE_CACHE_BYPASS = 'true';

// Mock file system paths for tests
process.env.TEST_DB_PATH = path.join(__dirname, 'test.db');