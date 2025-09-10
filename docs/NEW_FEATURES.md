# NSE Dashboard - New Features Documentation

## Overview

This document describes the new features added to the NSE Dashboard application, including timeframe analysis, delivery checking, AI trend analysis, and automated data ingestion.

## Table of Contents

1. [Timeframe Analysis](#timeframe-analysis)
2. [Delivery Check](#delivery-check)
3. [AI Trend Analysis](#ai-trend-analysis)
4. [Nightly Jobs System](#nightly-jobs-system)
5. [API Endpoints](#api-endpoints)
6. [Database Schema](#database-schema)
7. [Testing](#testing)

---

## Timeframe Analysis

### Description
Enhanced the Industry Performance page with timeframe selection capabilities, allowing users to analyze industry performance over different time periods.

### Features
- **Timeframe Dropdown**: Select from 1D, 1W, 1M, 3M, 6M, 1Y periods
- **Dynamic Chart Updates**: Charts automatically update based on selected timeframe
- **Cached Results**: Timeframe-specific caching for improved performance
- **Simulated Historical Data**: For demo purposes, generates realistic historical performance data

### Usage
1. Navigate to the Industry Performance page (`/industry.html`)
2. Select desired timeframe from the dropdown
3. View updated charts and metrics for the selected period

### API Integration
- **Endpoint**: `GET /api/industry-data?timeframe={period}`
- **Parameters**: 
  - `timeframe`: `1d`, `1w`, `1m`, `3m`, `6m`, `1y`
  - `refresh`: `true` to bypass cache
- **Response**: Industry performance data for the specified timeframe

---

## Delivery Check

### Description
New page for checking delivery statistics for specific stocks and dates, providing insights into actual delivery vs. trading volumes.

### Features
- **Symbol & Date Search**: Enter any NSE symbol and date
- **Delivery Metrics**: Shows delivery percentage, quantities, and close price
- **Visual Charts**: Pie chart showing delivered vs. non-delivered quantities
- **Historical Data**: Table showing recent delivery history
- **Responsive Design**: Mobile-friendly interface

### Usage
1. Navigate to Delivery Check page (`/delivery-check.html`)
2. Enter stock symbol (e.g., RELIANCE, TCS)
3. Select date
4. Click "Search" to view delivery statistics

### Key Metrics
- **Delivery Percentage**: Percentage of traded quantity that was delivered
- **Delivery Quantity**: Number of shares actually delivered
- **Traded Quantity**: Total number of shares traded
- **Close Price**: Closing price for the date

### API Integration
- **Endpoint**: `GET /api/delivery-stats?symbol={SYMBOL}&date={YYYY-MM-DD}`
- **Response**: Delivery statistics and historical data

---

## AI Trend Analysis

### Description
Advanced analytics page using statistical methods to analyze leader-follower relationships between stocks or indices.

### Features
- **Leader-Follower Analysis**: Compare two symbols to identify relationships
- **Multiple Metrics**:
  - Cross-correlation analysis
  - Momentum scoring
  - Granger causality tests
  - Lead-lag identification
- **Interactive Charts**: 
  - Price comparison with dual Y-axes
  - Cross-correlation visualization
- **AI-Powered Insights**: Automated analysis summary with recommendations

### Statistical Methods

#### Cross-Correlation
- Measures linear relationship between two time series
- Values range from -1 (perfect negative) to +1 (perfect positive)
- Calculated at different time lags to identify lead-lag relationships

#### Momentum Score
- Proprietary scoring algorithm combining multiple momentum indicators
- Scale: 0 (weak) to 1 (strong momentum)
- Considers price trends, volume, and volatility

#### Granger Causality Test
- Statistical test to determine if one time series can predict another
- P-value < 0.05 indicates significant causal relationship
- Helps identify true leaders vs. coincidental correlations

#### Lead-Lag Analysis
- Identifies which symbol leads and by how many days
- Positive values: Leader symbol leads
- Negative values: Follower symbol leads
- Zero: Synchronous movement

### Usage
1. Navigate to AI Trends page (`/ai-trends.html`)
2. Enter leader symbol (e.g., NIFTY)
3. Enter follower symbol (e.g., RELIANCE)
4. Select analysis period (1M, 3M, 6M, 1Y)
5. Click "Analyze" to view results

### API Integration
- **Endpoint**: `GET /api/ai-analysis?leader={SYMBOL}&follower={SYMBOL}&timeframe={PERIOD}`
- **Response**: Complete statistical analysis with charts data

---

## Nightly Jobs System

### Description
Automated system for ingesting price and delivery data, storing in SQLite database for historical analysis.

### Features
- **Scheduled Jobs**: Automatic execution using cron expressions
- **Multiple Job Types**:
  - Price Ingestion: Daily OHLCV data
  - Delivery Ingestion: Daily delivery statistics
  - Data Cleanup: Weekly maintenance
- **Error Handling**: Robust error handling with retry mechanisms
- **Job Logging**: Complete audit trail of job executions
- **Manual Triggers**: API endpoints for manual job execution

### Job Schedule
- **Price Ingestion**: 10:00 PM IST, Monday-Friday
- **Delivery Ingestion**: 10:30 PM IST, Monday-Friday  
- **Data Cleanup**: 2:00 AM IST, Sundays

### Configuration
Jobs can be enabled/disabled in `/jobs/nightlyJobs.js`:

```javascript
const JOB_CONFIG = {
    PRICE_INGESTION: {
        schedule: '0 22 * * 1-5',
        enabled: true,
        description: 'Ingest daily price data'
    }
    // ... other jobs
};
```

### Manual Execution
- **Price Job**: `POST /api/jobs/trigger/prices`
- **Delivery Job**: `POST /api/jobs/trigger/delivery`
- **Cleanup Job**: `POST /api/jobs/trigger/cleanup`
- **Job Status**: `GET /api/jobs/status`

---

## API Endpoints

### New Endpoints

#### Industry Data with Timeframe
```
GET /api/industry-data?timeframe={period}&refresh={boolean}
```
Returns industry performance data for specified timeframe.

#### Delivery Statistics
```
GET /api/delivery-stats?symbol={SYMBOL}&date={YYYY-MM-DD}
```
Returns delivery statistics for a specific symbol and date.

#### AI Analysis
```
GET /api/ai-analysis?leader={SYMBOL}&follower={SYMBOL}&timeframe={PERIOD}
```
Returns comprehensive statistical analysis of two symbols.

#### Historical Data
```
GET /api/historical/{symbol}?startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
```
Returns historical price and delivery data from database.

#### Job Management
```
GET /api/jobs/status
POST /api/jobs/trigger/{jobType}
```
Manage and monitor nightly jobs.

### Response Formats

#### Industry Data Response
```json
{
  "industries": [
    {
      "industry": "Technology",
      "avgPChange": "2.5",
      "stockCount": 10,
      "stocks": [...]
    }
  ],
  "timeframe": "1w",
  "cached": false,
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### AI Analysis Response
```json
{
  "leaderSymbol": "NIFTY",
  "followerSymbol": "RELIANCE",
  "correlation": 0.75,
  "momentumScore": 0.68,
  "grangerPValue": 0.023,
  "leadLag": 2,
  "priceData": {...},
  "crossCorrelation": {...}
}
```

---

## Database Schema

### Tables

#### prices
Stores daily OHLCV data for all symbols.

```sql
CREATE TABLE prices (
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
);
```

#### delivery_stats
Stores daily delivery statistics.

```sql
CREATE TABLE delivery_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    date DATE NOT NULL,
    traded_quantity INTEGER,
    delivery_quantity INTEGER,
    delivery_percentage REAL,
    close_price REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, date)
);
```

#### job_logs
Tracks job execution history.

```sql
CREATE TABLE job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    records_processed INTEGER DEFAULT 0,
    started_at DATETIME,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Database Operations

The `db/setup.js` module provides:
- Database initialization
- CRUD operations for all tables
- Connection management
- Error handling

---

## Testing

### Test Structure
```
tests/
├── setup.js          # Test configuration
├── api.test.js        # API endpoint tests
├── database.test.js   # Database operation tests
├── jobs.test.js       # Nightly jobs tests
└── utils.test.js      # Utility function tests
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Coverage
- **API Endpoints**: Request/response validation, error handling
- **Database Operations**: CRUD operations, constraints, transactions
- **Job System**: Scheduling, execution, error handling
- **Utility Functions**: Data processing, calculations, formatting

### Mock Strategy
- External APIs (NSE India) are mocked for consistent testing
- Database operations use in-memory SQLite for speed
- Time-dependent functions use fixed dates for reproducibility

---

## Installation & Setup

### Dependencies
New dependencies added for enhanced functionality:

```json
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "sqlite3": "^5.1.6"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

### Installation Steps
1. Install new dependencies: `npm install`
2. Database is automatically initialized on first run
3. Jobs are scheduled automatically when server starts
4. Run tests: `npm test`

### Configuration
- Database path: `db/nse_data.db` (created automatically)
- Job schedules: Configurable in `jobs/nightlyJobs.js`
- Cache settings: Configurable in `server.js`

---

## Performance Considerations

### Caching Strategy
- **Timeframe Data**: Cached for 30 minutes per timeframe
- **Delivery Data**: Cached for 1 hour per symbol/date
- **AI Analysis**: Cached for 2 hours per symbol pair
- **Industry Data**: Existing 5-minute cache maintained

### Database Optimization
- Unique constraints prevent duplicate data
- Indexes on symbol and date columns for fast queries
- Regular cleanup jobs to manage data retention

### API Rate Limiting
- Batch processing for multiple symbols
- Delays between API calls to respect limits
- Retry mechanisms for failed requests

---

## Future Enhancements

### Planned Features
1. **Real-time Data**: WebSocket integration for live updates
2. **Advanced Analytics**: More statistical indicators and models
3. **User Preferences**: Customizable dashboards and alerts
4. **Export Functionality**: PDF reports and data exports
5. **Mobile App**: React Native mobile application

### Scalability Improvements
1. **Database Migration**: Move to PostgreSQL for production
2. **Microservices**: Split into separate services
3. **Caching Layer**: Redis for distributed caching
4. **Load Balancing**: Multiple server instances

---

## Support & Maintenance

### Monitoring
- Job execution logs available via API
- Error tracking in database
- Performance metrics in cache statistics

### Troubleshooting
1. **Database Issues**: Check `db/nse_data.db` file permissions
2. **Job Failures**: Review job logs via `/api/jobs/status`
3. **API Errors**: Check NSE API rate limits and connectivity
4. **Cache Issues**: Set `FORCE_CACHE_BYPASS=true` environment variable

### Maintenance Tasks
- Weekly database cleanup (automated)
- Monthly log rotation
- Quarterly performance review
- Semi-annual dependency updates

---

*For technical support or feature requests, please refer to the project repository.*