const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');

// Mock database operations for testing
describe('Database Operations', () => {
    let testDb;
    const testDbPath = path.join(__dirname, 'test.db');

    beforeAll(() => {
        // Create a test database
        testDb = new sqlite3.Database(':memory:');
    });

    afterAll(() => {
        if (testDb) {
            testDb.close();
        }
        // Clean up test database file if it exists
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    beforeEach(() => {
        // Set up test tables
        return new Promise((resolve) => {
            testDb.serialize(() => {
                testDb.run(`
                    CREATE TABLE IF NOT EXISTS prices (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        date DATE NOT NULL,
                        open_price REAL,
                        high_price REAL,
                        low_price REAL,
                        close_price REAL,
                        volume INTEGER,
                        change_percent REAL,
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(symbol, date)
                    )
                `);

                testDb.run(`
                    CREATE TABLE IF NOT EXISTS delivery_stats (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        date DATE NOT NULL,
                        traded_quantity INTEGER,
                        delivery_quantity INTEGER,
                        delivery_percentage REAL,
                        close_price REAL,
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(symbol, date)
                    )
                `);

                testDb.run(`
                    CREATE TABLE IF NOT EXISTS job_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        job_name TEXT NOT NULL,
                        status TEXT NOT NULL,
                        message TEXT,
                        records_processed INTEGER DEFAULT 0,
                        started_at DATETIME,
                        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, resolve);
            });
        });
    });

    afterEach(() => {
        // Clean up test data
        return new Promise((resolve) => {
            testDb.serialize(() => {
                testDb.run('DELETE FROM prices');
                testDb.run('DELETE FROM delivery_stats');
                testDb.run('DELETE FROM job_logs', resolve);
            });
        });
    });

    describe('Price Data Operations', () => {
        it('should insert price data successfully', (done) => {
            const stmt = testDb.prepare(`
                INSERT INTO prices (symbol, date, open_price, high_price, low_price, close_price, volume, change_percent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(['RELIANCE', '2024-01-01', 2500, 2550, 2480, 2520, 1000000, 0.8], function(err) {
                expect(err).toBeNull();
                expect(this.changes).toBe(1);
                
                // Verify the data was inserted
                testDb.get('SELECT * FROM prices WHERE symbol = ? AND date = ?', ['RELIANCE', '2024-01-01'], (err, row) => {
                    expect(err).toBeNull();
                    expect(row).toBeDefined();
                    expect(row.symbol).toBe('RELIANCE');
                    expect(row.close_price).toBe(2520);
                    done();
                });
            });
            stmt.finalize();
        });

        it('should handle duplicate entries with UNIQUE constraint', (done) => {
            const stmt = testDb.prepare(`
                INSERT OR REPLACE INTO prices (symbol, date, open_price, close_price)
                VALUES (?, ?, ?, ?)
            `);
            
            // Insert first record
            stmt.run(['TCS', '2024-01-01', 3500, 3520], function(err) {
                expect(err).toBeNull();
                
                // Insert duplicate (should replace)
                stmt.run(['TCS', '2024-01-01', 3500, 3550], function(err) {
                    expect(err).toBeNull();
                    
                    // Verify only one record exists with updated price
                    testDb.get('SELECT COUNT(*) as count, close_price FROM prices WHERE symbol = ? AND date = ?', 
                        ['TCS', '2024-01-01'], (err, row) => {
                        expect(err).toBeNull();
                        expect(row.count).toBe(1);
                        expect(row.close_price).toBe(3550);
                        done();
                    });
                });
            });
            stmt.finalize();
        });
    });

    describe('Delivery Data Operations', () => {
        it('should insert delivery data successfully', (done) => {
            const stmt = testDb.prepare(`
                INSERT INTO delivery_stats (symbol, date, traded_quantity, delivery_quantity, delivery_percentage, close_price)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run(['HDFC', '2024-01-01', 500000, 325000, 65.0, 1500], function(err) {
                expect(err).toBeNull();
                expect(this.changes).toBe(1);
                
                // Verify the data was inserted
                testDb.get('SELECT * FROM delivery_stats WHERE symbol = ? AND date = ?', ['HDFC', '2024-01-01'], (err, row) => {
                    expect(err).toBeNull();
                    expect(row).toBeDefined();
                    expect(row.symbol).toBe('HDFC');
                    expect(row.delivery_percentage).toBe(65.0);
                    done();
                });
            });
            stmt.finalize();
        });
    });

    describe('Job Logs Operations', () => {
        it('should insert job log successfully', (done) => {
            const stmt = testDb.prepare(`
                INSERT INTO job_logs (job_name, status, message, records_processed, started_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            const startTime = new Date().toISOString();
            stmt.run(['PRICE_INGESTION', 'SUCCESS', 'Test job completed', 25, startTime], function(err) {
                expect(err).toBeNull();
                expect(this.changes).toBe(1);
                
                // Verify the log was inserted
                testDb.get('SELECT * FROM job_logs WHERE job_name = ?', ['PRICE_INGESTION'], (err, row) => {
                    expect(err).toBeNull();
                    expect(row).toBeDefined();
                    expect(row.status).toBe('SUCCESS');
                    expect(row.records_processed).toBe(25);
                    done();
                });
            });
            stmt.finalize();
        });

        it('should retrieve recent job logs', (done) => {
            const stmt = testDb.prepare(`
                INSERT INTO job_logs (job_name, status, message, records_processed)
                VALUES (?, ?, ?, ?)
            `);
            
            // Insert multiple job logs
            stmt.run(['JOB1', 'SUCCESS', 'First job', 10]);
            stmt.run(['JOB2', 'ERROR', 'Second job failed', 0]);
            stmt.run(['JOB3', 'SUCCESS', 'Third job', 15], function() {
                // Retrieve logs
                testDb.all('SELECT * FROM job_logs ORDER BY completed_at DESC LIMIT 5', (err, rows) => {
                    expect(err).toBeNull();
                    expect(rows).toHaveLength(3);
                    expect(rows[0].job_name).toBe('JOB3'); // Most recent first
                    done();
                });
            });
            stmt.finalize();
        });
    });
});