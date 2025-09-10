const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'nse_data.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Create tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        // Create prices table
        db.run(`
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
        `, (err) => {
            if (err) {
                console.error('Error creating prices table:', err.message);
                reject(err);
                return;
            }
        });

        // Create delivery stats table
        db.run(`
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
        `, (err) => {
            if (err) {
                console.error('Error creating delivery_stats table:', err.message);
                reject(err);
                return;
            }
        });

        // Create job logs table
        db.run(`
            CREATE TABLE IF NOT EXISTS job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_name TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                records_processed INTEGER DEFAULT 0,
                started_at DATETIME,
                completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating job_logs table:', err.message);
                reject(err);
                return;
            } else {
                console.log('Database tables initialized successfully.');
                resolve();
            }
        });
    });
}

// Database operations
const dbOps = {
    // Insert or update price data
    insertPriceData: (symbol, date, priceData) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO prices 
                (symbol, date, open_price, high_price, low_price, close_price, volume, change_percent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                symbol, date, 
                priceData.open, priceData.high, priceData.low, priceData.close,
                priceData.volume, priceData.changePercent
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            stmt.finalize();
        });
    },

    // Insert or update delivery data
    insertDeliveryData: (symbol, date, deliveryData) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO delivery_stats 
                (symbol, date, traded_quantity, delivery_quantity, delivery_percentage, close_price)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                symbol, date,
                deliveryData.tradedQuantity, deliveryData.deliveryQuantity,
                deliveryData.deliveryPercentage, deliveryData.closePrice
            ], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            stmt.finalize();
        });
    },

    // Get price data for symbol and date range
    getPriceData: (symbol, startDate, endDate) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM prices 
                WHERE symbol = ? AND date BETWEEN ? AND ? 
                ORDER BY date DESC
            `, [symbol, startDate, endDate], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    },

    // Get delivery data for symbol and date range
    getDeliveryData: (symbol, startDate, endDate) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM delivery_stats 
                WHERE symbol = ? AND date BETWEEN ? AND ? 
                ORDER BY date DESC
            `, [symbol, startDate, endDate], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    },

    // Log job execution
    logJob: (jobName, status, message, recordsProcessed = 0, startTime = null) => {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(`
                INSERT INTO job_logs (job_name, status, message, records_processed, started_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            stmt.run([jobName, status, message, recordsProcessed, startTime], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    },

    // Get recent job logs
    getJobLogs: (limit = 50) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM job_logs 
                ORDER BY completed_at DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
};

module.exports = {
    db,
    initializeDatabase,
    dbOps
};