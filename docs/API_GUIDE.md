# NSE Dashboard API Guide

## Overview

This guide provides detailed information about the NSE Dashboard API endpoints, including request/response formats, authentication, and usage examples.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

## Rate Limiting

- The API implements internal rate limiting when calling external NSE APIs
- Batch processing is used for multiple symbol requests
- Caching reduces the need for frequent API calls

## Common Response Headers

```
Content-Type: application/json
Cache-Control: public, max-age=300
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "error": "Error message description",
  "timestamp": "2024-01-01T00:00:00Z",
  "path": "/api/endpoint"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

---

## Endpoints

### 1. Market Data

#### Get Top Gainers and Losers

```http
GET /api/market-data?refresh={boolean}
```

**Parameters:**
- `refresh` (optional): `true` to bypass cache and fetch fresh data

**Response:**
```json
{
  "gainers": [
    {
      "symbol": "RELIANCE",
      "priceInfo": {
        "pChange": 3.25,
        "lastPrice": 2520.50
      },
      "info": {
        "companyName": "Reliance Industries Limited"
      }
    }
  ],
  "losers": [
    {
      "symbol": "HDFC",
      "priceInfo": {
        "pChange": -2.15,
        "lastPrice": 1485.30
      },
      "info": {
        "companyName": "HDFC Bank Limited"
      }
    }
  ],
  "cached": false,
  "timestamp": 1704067200000
}
```

**Example:**
```bash
curl "http://localhost:3000/api/market-data?refresh=true"
```

---

### 2. Industry Performance

#### Get Industry Data with Timeframe

```http
GET /api/industry-data?timeframe={period}&refresh={boolean}
```

**Parameters:**
- `timeframe` (optional): `1d`, `1w`, `1m`, `3m`, `6m`, `1y` (default: `1d`)
- `refresh` (optional): `true` to bypass cache

**Response:**
```json
{
  "industries": [
    {
      "industry": "Technology",
      "avgPChange": "2.45",
      "stockCount": 15,
      "stocks": [
        {
          "symbol": "TCS",
          "priceInfo": {
            "pChange": 3.2,
            "lastPrice": 3500.75
          },
          "info": {
            "companyName": "Tata Consultancy Services"
          }
        }
      ],
      "topStock": {
        "symbol": "TCS",
        "priceInfo": {
          "pChange": 3.2,
          "lastPrice": 3500.75
        }
      }
    }
  ],
  "timeframe": "1w",
  "cached": false,
  "timestamp": 1704067200000
}
```

**Example:**
```bash
curl "http://localhost:3000/api/industry-data?timeframe=1w&refresh=true"
```

---

### 3. Delivery Statistics

#### Get Delivery Stats for Symbol and Date

```http
GET /api/delivery-stats?symbol={SYMBOL}&date={YYYY-MM-DD}
```

**Parameters:**
- `symbol` (required): NSE stock symbol (e.g., RELIANCE, TCS)
- `date` (required): Date in YYYY-MM-DD format

**Response:**
```json
{
  "symbol": "RELIANCE",
  "date": "2024-01-01",
  "tradedQuantity": 5000000,
  "deliveryQuantity": 3250000,
  "deliveryPercentage": 65.0,
  "closePrice": 2520.50,
  "history": [
    {
      "date": "2023-12-29",
      "tradedQuantity": 4800000,
      "deliveryQuantity": 3120000,
      "deliveryPercentage": 65.0,
      "closePrice": 2515.25
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:3000/api/delivery-stats?symbol=RELIANCE&date=2024-01-01"
```

**Error Response (400):**
```json
{
  "error": "Symbol and date parameters are required"
}
```

---

### 4. AI Trend Analysis

#### Get AI Analysis for Symbol Pair

```http
GET /api/ai-analysis?leader={SYMBOL}&follower={SYMBOL}&timeframe={PERIOD}
```

**Parameters:**
- `leader` (required): Leader symbol for analysis
- `follower` (required): Follower symbol for analysis  
- `timeframe` (optional): `1m`, `3m`, `6m`, `1y` (default: `3m`)

**Response:**
```json
{
  "leaderSymbol": "NIFTY",
  "followerSymbol": "RELIANCE",
  "timeframe": "3m",
  "correlation": 0.756,
  "momentumScore": 0.68,
  "grangerPValue": 0.0234,
  "leadLag": 2,
  "priceData": {
    "dates": ["2023-10-01", "2023-10-02", "..."],
    "leaderSymbol": "NIFTY",
    "followerSymbol": "RELIANCE",
    "leaderPrices": [19500.25, 19520.50, "..."],
    "followerPrices": [2500.75, 2510.25, "..."]
  },
  "crossCorrelation": {
    "lags": [-10, -9, -8, "...", 8, 9, 10],
    "values": [0.12, 0.25, 0.35, "...", 0.45, 0.32, 0.18]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Example:**
```bash
curl "http://localhost:3000/api/ai-analysis?leader=NIFTY&follower=RELIANCE&timeframe=6m"
```

**Error Responses:**

Missing parameters (400):
```json
{
  "error": "Leader and follower symbols are required"
}
```

Same symbols (400):
```json
{
  "error": "Leader and follower symbols must be different"
}
```

---

### 5. Historical Data

#### Get Historical Price and Delivery Data

```http
GET /api/historical/{symbol}?startDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}
```

**Parameters:**
- `symbol` (path): Stock symbol
- `startDate` (required): Start date for data range
- `endDate` (required): End date for data range

**Response:**
```json
{
  "symbol": "RELIANCE",
  "priceData": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "date": "2024-01-01",
      "open_price": 2500.0,
      "high_price": 2550.0,
      "low_price": 2480.0,
      "close_price": 2520.5,
      "volume": 5000000,
      "change_percent": 0.82,
      "last_updated": "2024-01-01T22:00:00.000Z"
    }
  ],
  "deliveryData": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "date": "2024-01-01",
      "traded_quantity": 5000000,
      "delivery_quantity": 3250000,
      "delivery_percentage": 65.0,
      "close_price": 2520.5,
      "last_updated": "2024-01-01T22:30:00.000Z"
    }
  ],
  "dateRange": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }
}
```

**Example:**
```bash
curl "http://localhost:3000/api/historical/RELIANCE?startDate=2024-01-01&endDate=2024-01-31"
```

---

### 6. Job Management

#### Get Job Status

```http
GET /api/jobs/status
```

**Response:**
```json
{
  "jobs": [
    {
      "id": 1,
      "job_name": "PRICE_INGESTION",
      "status": "SUCCESS",
      "message": "Processed 25 symbols",
      "records_processed": 25,
      "started_at": "2024-01-01T22:00:00.000Z",
      "completed_at": "2024-01-01T22:05:30.000Z"
    },
    {
      "id": 2,
      "job_name": "DELIVERY_INGESTION",
      "status": "ERROR",
      "message": "API rate limit exceeded",
      "records_processed": 10,
      "started_at": "2024-01-01T22:30:00.000Z",
      "completed_at": "2024-01-01T22:32:15.000Z"
    }
  ],
  "timestamp": "2024-01-01T23:00:00.000Z"
}
```

#### Trigger Manual Job

```http
POST /api/jobs/trigger/{jobType}
```

**Parameters:**
- `jobType` (path): `prices`, `delivery`, or `cleanup`

**Response:**
```json
{
  "message": "Price ingestion job triggered"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/api/jobs/trigger/prices"
```

---

## Data Models

### Stock Data Model
```typescript
interface StockData {
  symbol: string;
  priceInfo: {
    pChange: number;
    lastPrice: number;
  };
  info: {
    companyName: string;
  };
}
```

### Industry Data Model
```typescript
interface IndustryData {
  industry: string;
  avgPChange: string;
  stockCount: number;
  stocks: StockData[];
  topStock: StockData | null;
}
```

### AI Analysis Model
```typescript
interface AIAnalysis {
  leaderSymbol: string;
  followerSymbol: string;
  timeframe: string;
  correlation: number;
  momentumScore: number;
  grangerPValue: number;
  leadLag: number;
  priceData: {
    dates: string[];
    leaderSymbol: string;
    followerSymbol: string;
    leaderPrices: number[];
    followerPrices: number[];
  };
  crossCorrelation: {
    lags: number[];
    values: number[];
  };
  timestamp: string;
}
```

---

## Usage Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

// Get industry data for 1 week
async function getIndustryData() {
  try {
    const response = await axios.get('http://localhost:3000/api/industry-data?timeframe=1w');
    console.log('Industries:', response.data.industries.length);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}

// Get delivery stats
async function getDeliveryStats(symbol, date) {
  try {
    const response = await axios.get(`http://localhost:3000/api/delivery-stats?symbol=${symbol}&date=${date}`);
    console.log(`${symbol} delivery: ${response.data.deliveryPercentage}%`);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}

// Run AI analysis
async function runAIAnalysis(leader, follower) {
  try {
    const response = await axios.get(`http://localhost:3000/api/ai-analysis?leader=${leader}&follower=${follower}`);
    console.log(`Correlation: ${response.data.correlation}`);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
}
```

### Python

```python
import requests

base_url = "http://localhost:3000"

# Get market data
def get_market_data():
    response = requests.get(f"{base_url}/api/market-data")
    if response.status_code == 200:
        data = response.json()
        print(f"Top gainer: {data['gainers'][0]['symbol']}")
    else:
        print(f"Error: {response.json()['error']}")

# Get delivery stats
def get_delivery_stats(symbol, date):
    params = {"symbol": symbol, "date": date}
    response = requests.get(f"{base_url}/api/delivery-stats", params=params)
    if response.status_code == 200:
        data = response.json()
        print(f"{symbol} delivery: {data['deliveryPercentage']}%")
    else:
        print(f"Error: {response.json()['error']}")

# Trigger job
def trigger_job(job_type):
    response = requests.post(f"{base_url}/api/jobs/trigger/{job_type}")
    if response.status_code == 200:
        print(response.json()['message'])
    else:
        print(f"Error: {response.json()['error']}")
```

### cURL Examples

```bash
# Get all industries with 3-month timeframe
curl "http://localhost:3000/api/industry-data?timeframe=3m"

# Get delivery stats for RELIANCE on specific date
curl "http://localhost:3000/api/delivery-stats?symbol=RELIANCE&date=2024-01-01"

# Run AI analysis between NIFTY and TCS
curl "http://localhost:3000/api/ai-analysis?leader=NIFTY&follower=TCS&timeframe=6m"

# Get historical data for HDFC
curl "http://localhost:3000/api/historical/HDFC?startDate=2024-01-01&endDate=2024-01-31"

# Check job status
curl "http://localhost:3000/api/jobs/status"

# Trigger price ingestion job
curl -X POST "http://localhost:3000/api/jobs/trigger/prices"
```

---

## Best Practices

### 1. Caching
- Use the `refresh=true` parameter sparingly to avoid overwhelming external APIs
- Cache responses on the client side for frequently accessed data
- Monitor cache hit rates for optimization

### 2. Error Handling
- Always check HTTP status codes
- Parse error messages for user-friendly display
- Implement retry logic for transient failures

### 3. Performance
- Use appropriate timeframes for your use case
- Batch multiple requests when possible
- Consider WebSocket connections for real-time data (future feature)

### 4. Data Validation
- Validate symbol formats before making requests
- Check date formats and ranges
- Handle null/undefined values gracefully

---

## Troubleshooting

### Common Issues

1. **404 Not Found**
   - Check endpoint URL spelling
   - Ensure server is running on correct port

2. **400 Bad Request**
   - Verify required parameters are provided
   - Check parameter formats (dates, symbols)

3. **500 Internal Server Error**
   - Check server logs
   - Verify database connectivity
   - Check external API availability

### Debug Mode

Set environment variable for detailed logging:
```bash
DEBUG=true npm start
```

### Support

For technical support:
- Check server logs for detailed error messages
- Review API documentation for correct usage
- Test with cURL commands to isolate issues

---

*This API guide is maintained alongside the NSE Dashboard application. For the latest updates, refer to the project repository.*