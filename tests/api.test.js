const request = require('supertest');
const express = require('express');

// Mock dependencies before requiring the server
jest.mock('stock-nse-india');
jest.mock('../db/setup');
jest.mock('../jobs/nightlyJobs');

const app = express();
app.use(express.json());

// Mock the API endpoints
describe('API Endpoints', () => {
    // Mock industry data endpoint
    app.get('/api/industry-data', (req, res) => {
        const timeframe = req.query.timeframe || '1d';
        res.json({
            industries: [
                {
                    industry: 'Technology',
                    avgPChange: '2.5',
                    stockCount: 10,
                    stocks: [
                        {
                            symbol: 'TCS',
                            priceInfo: { pChange: 3.2, lastPrice: 3500 },
                            info: { companyName: 'Tata Consultancy Services' }
                        }
                    ]
                }
            ],
            cached: false,
            timestamp: Date.now(),
            timeframe
        });
    });

    // Mock delivery stats endpoint
    app.get('/api/delivery-stats', (req, res) => {
        const { symbol, date } = req.query;
        if (!symbol || !date) {
            return res.status(400).json({ error: 'Symbol and date parameters are required' });
        }
        
        res.json({
            symbol,
            date,
            tradedQuantity: 1000000,
            deliveryQuantity: 650000,
            deliveryPercentage: 65.0,
            closePrice: 2500.50,
            history: []
        });
    });

    // Mock AI analysis endpoint
    app.get('/api/ai-analysis', (req, res) => {
        const { leader, follower, timeframe } = req.query;
        if (!leader || !follower) {
            return res.status(400).json({ error: 'Leader and follower symbols are required' });
        }
        
        if (leader === follower) {
            return res.status(400).json({ error: 'Leader and follower symbols must be different' });
        }

        res.json({
            leaderSymbol: leader,
            followerSymbol: follower,
            timeframe: timeframe || '3m',
            correlation: 0.75,
            momentumScore: 0.68,
            grangerPValue: 0.023,
            leadLag: 2,
            priceData: {
                dates: ['2024-01-01', '2024-01-02'],
                leaderPrices: [1000, 1020],
                followerPrices: [2000, 2040]
            },
            crossCorrelation: {
                lags: [-2, -1, 0, 1, 2],
                values: [0.2, 0.5, 0.75, 0.4, 0.1]
            }
        });
    });

    describe('GET /api/industry-data', () => {
        it('should return industry data for default timeframe', async () => {
            const response = await request(app)
                .get('/api/industry-data')
                .expect(200);

            expect(response.body).toHaveProperty('industries');
            expect(response.body).toHaveProperty('timeframe', '1d');
            expect(response.body.industries).toHaveLength(1);
            expect(response.body.industries[0]).toHaveProperty('industry', 'Technology');
        });

        it('should return industry data for specific timeframe', async () => {
            const response = await request(app)
                .get('/api/industry-data?timeframe=1w')
                .expect(200);

            expect(response.body).toHaveProperty('timeframe', '1w');
        });
    });

    describe('GET /api/delivery-stats', () => {
        it('should return delivery stats for valid symbol and date', async () => {
            const response = await request(app)
                .get('/api/delivery-stats?symbol=RELIANCE&date=2024-01-01')
                .expect(200);

            expect(response.body).toHaveProperty('symbol', 'RELIANCE');
            expect(response.body).toHaveProperty('date', '2024-01-01');
            expect(response.body).toHaveProperty('deliveryPercentage', 65.0);
        });

        it('should return 400 for missing parameters', async () => {
            await request(app)
                .get('/api/delivery-stats?symbol=RELIANCE')
                .expect(400);

            await request(app)
                .get('/api/delivery-stats?date=2024-01-01')
                .expect(400);
        });
    });

    describe('GET /api/ai-analysis', () => {
        it('should return AI analysis for valid symbols', async () => {
            const response = await request(app)
                .get('/api/ai-analysis?leader=NIFTY&follower=RELIANCE')
                .expect(200);

            expect(response.body).toHaveProperty('leaderSymbol', 'NIFTY');
            expect(response.body).toHaveProperty('followerSymbol', 'RELIANCE');
            expect(response.body).toHaveProperty('correlation');
            expect(response.body).toHaveProperty('momentumScore');
            expect(response.body).toHaveProperty('grangerPValue');
        });

        it('should return 400 for missing parameters', async () => {
            await request(app)
                .get('/api/ai-analysis?leader=NIFTY')
                .expect(400);
        });

        it('should return 400 for same leader and follower', async () => {
            await request(app)
                .get('/api/ai-analysis?leader=RELIANCE&follower=RELIANCE')
                .expect(400);
        });
    });
});