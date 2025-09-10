const express = require('express');
const { NseIndia } = require('stock-nse-india');
const path = require('path');
const NodeCache = require('node-cache');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const { initializeDatabase, dbOps } = require('./db/setup');
const { initializeJobs, manualJobs } = require('./jobs/nightlyJobs');

const app = express();
const nseIndia = new NseIndia();
const cache = new NodeCache({ stdTTL: 300 });
const PORT = process.env.PORT || 3000;

// Debug flags
const SKIP_NIFTY500_VALIDATION = false;
const MAX_SYMBOLS_PER_INDUSTRY = 0;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;
const MAX_RETRIES = 5;
const FORCE_CACHE_BYPASS = process.env.FORCE_CACHE_BYPASS === 'true';

// Serve static files
app.use(express.static('public'));

// Preloaded Excel data
let nifty500Data = [];
let industryData = {};
let allSymbolsSet = new Set();

// Default industry mapping for fallback
const DEFAULT_INDUSTRY_DATA = {
    'Industrial': ['TIMKEN'],
    'Financial Services': ['PAYTM', 'POLICYBZR', 'PNBHOUSING', 'POONAWALLA'],
    'Energy': ['RELIANCE'],
    'Technology': ['TCS'],
    'Infrastructure': ['PFC'],
    'Consumer Services': ['PEL']
};

function isMarketOpen() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const day = istTime.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && (
        (hours > 9 || (hours === 9 && minutes >= 15)) &&
        (hours < 15 || (hours === 15 && minutes <= 30))
    );
    console.log(`Market hours check: ${isOpen ? 'Open' : 'Closed'} (IST: ${istTime.toISOString()})`);
    return isOpen;
}

async function readExcelFile(filePath) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.getWorksheet(1);
        const rows = [];
        
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            
            const rowData = {};
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const header = worksheet.getRow(1).getCell(colNumber).value;
                rowData[header] = cell.value;
            });
            
            rows.push(rowData);
        });
        
        return rows;
    } catch (error) {
        console.error(`Error reading Excel file: ${error.message}`);
        throw error;
    }
}

async function preloadExcelData() {
    const excelPath = path.resolve('D:\\01May2025\\NSE_Dashboard\\NIFTY500.xlsx');
    
    try {
        nifty500Data = await readExcelFile(excelPath);
        console.log(`Loaded ${nifty500Data.length} records from NIFTY500.xlsx`);
        
        industryData = {};
        nifty500Data.forEach(row => {
            const symbol = row['Symbol']?.toString().toUpperCase().replace(/\.NS$/, '') || '';
            const industry = row['Industry']?.toString().trim() || 'Other';
            
            if (symbol) {
                allSymbolsSet.add(symbol);
                
                if (!industryData[industry]) {
                    industryData[industry] = [];
                }
                if (!industryData[industry].includes(symbol)) {
                    industryData[industry].push(symbol);
                }
            }
        });
        
        console.log(`Processed ${Object.keys(industryData).length} industries with ${allSymbolsSet.size} symbols`);
        
        if (Object.keys(industryData).length === 0) {
            console.warn('No valid industry data loaded from Excel. Using default industry data.');
            industryData = DEFAULT_INDUSTRY_DATA;
            Object.values(DEFAULT_INDUSTRY_DATA).flat().forEach(sym => allSymbolsSet.add(sym));
        }
    } catch (error) {
        console.error('Failed to load Excel data:', error.message);
        console.warn('Using default industry data as fallback.');
        industryData = DEFAULT_INDUSTRY_DATA;
        nifty500Data = [];
        Object.values(DEFAULT_INDUSTRY_DATA).flat().forEach(sym => allSymbolsSet.add(sym));
    }
}

async function fetchEquityDetailsInBatches(symbols, batchSize = BATCH_SIZE, forceRefresh = false) {
    const validSymbols = symbols.filter(sym => 
        allSymbolsSet.has(sym) && 
        typeof sym === 'string' && 
        sym.trim() !== ''
    );
    
    console.log(`Processing ${validSymbols.length} valid symbols (originally ${symbols.length})`);
    
    const results = [];
    const batches = [];
    let cacheHits = 0;

    const uncachedSymbols = [];
    if (!forceRefresh && !FORCE_CACHE_BYPASS) {
        for (const symbol of validSymbols) {
            const cached = cache.get(symbol);
            if (cached && cached.timestamp > Date.now() - 300 * 1000) {
                results.push({
                    symbol,
                    priceInfo: { pChange: cached.pChange, lastPrice: cached.lastPrice },
                    info: { companyName: cached.companyName }
                });
                cacheHits++;
            } else {
                uncachedSymbols.push(symbol);
            }
        }
    } else {
        uncachedSymbols.push(...validSymbols);
    }
    console.log(`Found ${cacheHits} cached results, ${uncachedSymbols.length} to fetch`);

    for (let i = 0; i < uncachedSymbols.length; i += batchSize) {
        batches.push(uncachedSymbols.slice(i, i + batchSize));
    }

    for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];
        let attempts = MAX_RETRIES;
        while (attempts > 0) {
            try {
                const promises = batch.map(symbol => 
                    nseIndia.getEquityDetails(symbol)
                        .then(result => ({ symbol, result }))
                        .catch(e => {
                            console.error(`API error for ${symbol}:`, e.message);
                            return { symbol, result: null };
                        })
                );
                const batchResults = await Promise.all(promises);
                const validResults = batchResults
                    .filter(({ result }) => result && result.priceInfo && 
                            typeof result.priceInfo.pChange === 'number' && 
                            typeof result.priceInfo.lastPrice === 'number')
                    .map(({ symbol, result }) => ({
                        symbol,
                        priceInfo: { 
                            pChange: result.priceInfo.pChange, 
                            lastPrice: result.priceInfo.lastPrice 
                        },
                        info: { 
                            companyName: result.info?.companyName || 'Unknown' 
                        }
                    }));
                
                validResults.forEach(({ symbol, priceInfo, info }) => {
                    cache.set(symbol, {
                        pChange: priceInfo.pChange,
                        lastPrice: priceInfo.lastPrice,
                        companyName: info.companyName,
                        timestamp: Date.now()
                    });
                });
                
                results.push(...validResults);
                break;
            } catch (error) {
                console.error(`Error fetching batch ${index + 1}, attempt ${MAX_RETRIES + 1 - attempts}:`, error.message);
                attempts--;
                if (attempts === 0) {
                    console.warn(`Batch ${index + 1} failed after ${MAX_RETRIES} retries, skipping`);
                    continue;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        if (index < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }

    return { results, cached: cacheHits > 0 && !forceRefresh && !FORCE_CACHE_BYPASS };
}

// Market Data Endpoint
app.get('/api/market-data', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const symbols = nifty500Data.map(row => row['Symbol']?.toString().toUpperCase().replace(/\.NS$/, '')).filter(Boolean);
        
        if (!symbols.length && !SKIP_NIFTY500_VALIDATION) {
            return res.status(500).json({ error: 'No symbols loaded from NIFTY500.xlsx' });
        }

        const { results: validResults, cached } = await fetchEquityDetailsInBatches(symbols, BATCH_SIZE, forceRefresh);

        if (!validResults.length) {
            return res.status(500).json({ error: 'No valid market data retrieved' });
        }

        const sortedResults = validResults.sort((a, b) => b.priceInfo.pChange - a.priceInfo.pChange);
        const gainers = sortedResults.slice(0, 10);
        const losers = validResults
            .filter(stock => stock.priceInfo.pChange < 0)
            .sort((a, b) => a.priceInfo.pChange - b.priceInfo.pChange)
            .slice(0, 10);

        res.json({ gainers, losers, cached, timestamp: Date.now() });
    } catch (error) {
        res.status(500).json({ error: `Failed to fetch market data: ${error.message}` });
    }
});

// Helper function to calculate timeframe returns
async function calculateTimeframeReturns(symbols, timeframe = '1d') {
    if (timeframe === '1d') {
        // For 1d, use current price changes (existing logic)
        return await fetchEquityDetailsInBatches(symbols, BATCH_SIZE, false);
    }
    
    // For other timeframes, we need historical data
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
        case '1w':
            startDate.setDate(endDate.getDate() - 7);
            break;
        case '1m':
            startDate.setMonth(endDate.getMonth() - 1);
            break;
        case '3m':
            startDate.setMonth(endDate.getMonth() - 3);
            break;
        case '6m':
            startDate.setMonth(endDate.getMonth() - 6);
            break;
        case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        default:
            // Default to 1d
            return await fetchEquityDetailsInBatches(symbols, BATCH_SIZE, false);
    }
    
    // For historical timeframes, we'll simulate the calculation
    // In a real implementation, you would fetch historical data from NSE API
    const results = [];
    const cacheKey = `timeframe_${timeframe}_${symbols.join('_')}`;
    const cached = cache.get(cacheKey);
    
    if (cached && !FORCE_CACHE_BYPASS) {
        console.log(`Using cached timeframe data for ${timeframe}`);
        return { results: cached, cached: true };
    }
    
    // For now, simulate historical returns based on current data with some variation
    const currentData = await fetchEquityDetailsInBatches(symbols, BATCH_SIZE, false);
    
    currentData.results.forEach(stock => {
        // Simulate historical performance based on timeframe
        let multiplier = 1;
        switch (timeframe) {
            case '1w': multiplier = Math.random() * 2 + 0.5; break;
            case '1m': multiplier = Math.random() * 3 + 0.5; break;
            case '3m': multiplier = Math.random() * 5 + 0.5; break;
            case '6m': multiplier = Math.random() * 8 + 0.5; break;
            case '1y': multiplier = Math.random() * 15 + 0.5; break;
        }
        
        const simulatedChange = stock.priceInfo.pChange * multiplier * (Math.random() > 0.5 ? 1 : -1);
        
        results.push({
            symbol: stock.symbol,
            priceInfo: {
                pChange: simulatedChange,
                lastPrice: stock.priceInfo.lastPrice
            },
            info: stock.info
        });
    });
    
    // Cache the results
    cache.set(cacheKey, results, 1800); // Cache for 30 minutes
    
    return { results, cached: false };
}

// Industry Data Endpoint
app.get('/api/industry-data', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        const timeframe = req.query.timeframe || '1d';
        
        if (Object.keys(industryData).length === 0) {
            return res.status(200).json({
                industries: [],
                cached: false,
                timestamp: Date.now(),
                warning: 'No industry data available'
            });
        }

        const allSymbols = [];
        const symbolToIndustries = {};
        for (const [industry, symbols] of Object.entries(industryData)) {
            const limitedSymbols = MAX_SYMBOLS_PER_INDUSTRY > 0 ? symbols.slice(0, MAX_SYMBOLS_PER_INDUSTRY) : symbols;
            limitedSymbols.forEach(symbol => {
                if (!allSymbols.includes(symbol)) {
                    allSymbols.push(symbol);
                }
                if (!symbolToIndustries[symbol]) {
                    symbolToIndustries[symbol] = [];
                }
                symbolToIndustries[symbol].push(industry);
            });
        }

        let { results: validResults, cached } = await calculateTimeframeReturns(allSymbols, timeframe);

        if (!validResults.length) {
            const cachedResults = [];
            for (const symbol of allSymbols) {
                const cached = cache.get(symbol);
                if (cached && cached.timestamp > Date.now() - 300 * 1000) {
                    cachedResults.push({
                        symbol,
                        priceInfo: { pChange: cached.pChange, lastPrice: cached.lastPrice },
                        info: { companyName: cached.companyName }
                    });
                }
            }
            validResults = cachedResults;
            cached = cachedResults.length > 0;
        }

        if (!validResults.length) {
            return res.status(200).json({
                industries: [],
                cached,
                timestamp: Date.now(),
                warning: 'No valid industry data retrieved'
            });
        }

        // Aggregate by industry
        const industryMetrics = {};
        validResults.forEach(stock => {
            const industries = symbolToIndustries[stock.symbol] || ['N/A'];
            industries.forEach(industry => {
                if (!industryMetrics[industry]) {
                    industryMetrics[industry] = {
                        totalPChange: 0,
                        count: 0,
                        stocks: []
                    };
                }
                industryMetrics[industry].totalPChange += stock.priceInfo.pChange;
                industryMetrics[industry].count += 1;
                industryMetrics[industry].stocks.push({
                    symbol: stock.symbol,
                    info: stock.info,
                    priceInfo: stock.priceInfo
                });
            });
        });

        // Prepare industry data
        const industries = Object.keys(industryMetrics).map(industry => {
            const avgPChange = industryMetrics[industry].count > 0 
                ? (industryMetrics[industry].totalPChange / industryMetrics[industry].count).toFixed(2)
                : 0;
                
            const sortedStocks = [...industryMetrics[industry].stocks]
                .sort((a, b) => b.priceInfo.pChange - a.priceInfo.pChange);
                
            return {
                industry,
                avgPChange,
                stockCount: industryMetrics[industry].count,
                stocks: sortedStocks,
                topStock: sortedStocks.length > 0 ? sortedStocks[0] : null
            };
        }).filter(ind => ind.stockCount > 0);

        industries.sort((a, b) => parseFloat(b.avgPChange) - parseFloat(a.avgPChange));

        res.json({
            industries,
            cached,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({ error: `Failed to fetch industry data: ${error.message}` });
    }
});

// Delivery Stats Endpoint
app.get('/api/delivery-stats', async (req, res) => {
    try {
        const { symbol, date } = req.query;
        
        if (!symbol || !date) {
            return res.status(400).json({ error: 'Symbol and date parameters are required' });
        }

        const cacheKey = `delivery_${symbol}_${date}`;
        const cached = cache.get(cacheKey);
        
        if (cached && !FORCE_CACHE_BYPASS) {
            console.log(`Using cached delivery data for ${symbol} on ${date}`);
            return res.json(cached);
        }

        // Simulate delivery data (in a real implementation, you would fetch from NSE API or database)
        const deliveryData = generateMockDeliveryData(symbol, date);
        
        // Cache the results for 1 hour
        cache.set(cacheKey, deliveryData, 3600);
        
        res.json(deliveryData);
    } catch (error) {
        console.error('Error fetching delivery stats:', error);
        res.status(500).json({ error: `Failed to fetch delivery stats: ${error.message}` });
    }
});

// AI Analysis Endpoint
app.get('/api/ai-analysis', async (req, res) => {
    try {
        const { leader, follower, timeframe = '3m' } = req.query;
        
        if (!leader || !follower) {
            return res.status(400).json({ error: 'Leader and follower symbols are required' });
        }

        if (leader === follower) {
            return res.status(400).json({ error: 'Leader and follower symbols must be different' });
        }

        const cacheKey = `ai_analysis_${leader}_${follower}_${timeframe}`;
        const cached = cache.get(cacheKey);
        
        if (cached && !FORCE_CACHE_BYPASS) {
            console.log(`Using cached AI analysis for ${leader} vs ${follower}`);
            return res.json(cached);
        }

        // Generate AI analysis data
        const analysisData = generateAIAnalysisData(leader, follower, timeframe);
        
        // Cache the results for 2 hours
        cache.set(cacheKey, analysisData, 7200);
        
        res.json(analysisData);
    } catch (error) {
        console.error('Error running AI analysis:', error);
        res.status(500).json({ error: `Failed to run AI analysis: ${error.message}` });
    }
});

// Generate AI analysis data with statistical calculations
function generateAIAnalysisData(leader, follower, timeframe) {
    // Generate mock price data
    const days = timeframe === '1m' ? 30 : timeframe === '3m' ? 90 : timeframe === '6m' ? 180 : 365;
    const dates = [];
    const leaderPrices = [];
    const followerPrices = [];
    
    const baseDate = new Date();
    let leaderPrice = Math.random() * 1000 + 500;
    let followerPrice = Math.random() * 2000 + 1000;
    
    // Generate correlated price series
    const correlation = (Math.random() - 0.5) * 1.8; // -0.9 to 0.9
    const leadLag = Math.floor((Math.random() - 0.5) * 10); // -5 to 5 days
    
    for (let i = days; i >= 0; i--) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() - i);
        
        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;
        
        dates.push(date.toISOString().split('T')[0]);
        
        // Generate price movements with correlation and lead-lag
        const leaderChange = (Math.random() - 0.5) * 0.1; // ±5% daily change
        leaderPrice *= (1 + leaderChange);
        leaderPrices.push(parseFloat(leaderPrice.toFixed(2)));
        
        // Follower price influenced by leader with lag and correlation
        const laggedLeaderChange = leaderPrices.length > Math.abs(leadLag) 
            ? (leaderPrices[leaderPrices.length - 1 - Math.abs(leadLag)] / leaderPrices[Math.max(0, leaderPrices.length - 2 - Math.abs(leadLag))] - 1)
            : leaderChange;
        
        const followerChange = correlation * laggedLeaderChange + (1 - Math.abs(correlation)) * (Math.random() - 0.5) * 0.08;
        followerPrice *= (1 + followerChange);
        followerPrices.push(parseFloat(followerPrice.toFixed(2)));
    }
    
    // Calculate cross-correlation at different lags
    const maxLag = 10;
    const crossCorrelation = {
        lags: [],
        values: []
    };
    
    for (let lag = -maxLag; lag <= maxLag; lag++) {
        crossCorrelation.lags.push(lag);
        // Simulate cross-correlation with peak at the true lead-lag
        const distance = Math.abs(lag - leadLag);
        const correlationAtLag = correlation * Math.exp(-distance * 0.3) + (Math.random() - 0.5) * 0.1;
        crossCorrelation.values.push(Math.max(-1, Math.min(1, correlationAtLag)));
    }
    
    // Calculate momentum score (simplified)
    const momentumScore = Math.abs(correlation) * 0.7 + Math.random() * 0.3;
    
    // Generate Granger causality p-value
    const grangerPValue = Math.abs(correlation) > 0.5 ? Math.random() * 0.05 : Math.random() * 0.3 + 0.05;
    
    return {
        leaderSymbol: leader,
        followerSymbol: follower,
        timeframe,
        correlation: parseFloat(correlation.toFixed(3)),
        momentumScore: parseFloat(momentumScore.toFixed(2)),
        grangerPValue: parseFloat(grangerPValue.toFixed(4)),
        leadLag: leadLag,
        priceData: {
            dates,
            leaderSymbol: leader,
            followerSymbol: follower,
            leaderPrices,
            followerPrices
        },
        crossCorrelation,
        timestamp: new Date().toISOString()
    };
}

// Generate mock delivery data
function generateMockDeliveryData(symbol, date) {
    const tradedQuantity = Math.floor(Math.random() * 10000000) + 100000; // 100k to 10M
    const deliveryPercentage = Math.random() * 80 + 10; // 10% to 90%
    const deliveryQuantity = Math.floor((tradedQuantity * deliveryPercentage) / 100);
    const closePrice = Math.random() * 5000 + 100; // ₹100 to ₹5100

    // Generate historical data (last 7 days)
    const history = [];
    const baseDate = new Date(date);
    
    for (let i = 1; i <= 7; i++) {
        const histDate = new Date(baseDate);
        histDate.setDate(baseDate.getDate() - i);
        
        // Skip weekends
        if (histDate.getDay() === 0 || histDate.getDay() === 6) continue;
        
        const histTradedQty = Math.floor(Math.random() * 8000000) + 50000;
        const histDeliveryPercent = Math.random() * 75 + 15;
        const histDeliveryQty = Math.floor((histTradedQty * histDeliveryPercent) / 100);
        const histClosePrice = closePrice + (Math.random() - 0.5) * 200;
        
        history.push({
            date: histDate.toISOString().split('T')[0],
            tradedQuantity: histTradedQty,
            deliveryQuantity: histDeliveryQty,
            deliveryPercentage: histDeliveryPercent,
            closePrice: Math.max(histClosePrice, 50) // Minimum ₹50
        });
    }

    return {
        symbol,
        date,
        tradedQuantity,
        deliveryQuantity,
        deliveryPercentage,
        closePrice,
        history: history.reverse() // Most recent first
    };
}

// Job management endpoints
app.get('/api/jobs/status', async (req, res) => {
    try {
        const logs = await dbOps.getJobLogs(20);
        res.json({
            jobs: logs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({ error: 'Failed to fetch job status' });
    }
});

app.post('/api/jobs/trigger/:jobType', async (req, res) => {
    try {
        const { jobType } = req.params;
        
        switch (jobType) {
            case 'prices':
                manualJobs.triggerPriceIngestion();
                res.json({ message: 'Price ingestion job triggered' });
                break;
            case 'delivery':
                manualJobs.triggerDeliveryIngestion();
                res.json({ message: 'Delivery ingestion job triggered' });
                break;
            case 'cleanup':
                manualJobs.triggerDataCleanup();
                res.json({ message: 'Data cleanup job triggered' });
                break;
            default:
                res.status(400).json({ error: 'Invalid job type' });
        }
    } catch (error) {
        console.error('Error triggering job:', error);
        res.status(500).json({ error: 'Failed to trigger job' });
    }
});

// Historical data endpoint using database
app.get('/api/historical/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }
        
        const priceData = await dbOps.getPriceData(symbol.toUpperCase(), startDate, endDate);
        const deliveryData = await dbOps.getDeliveryData(symbol.toUpperCase(), startDate, endDate);
        
        res.json({
            symbol: symbol.toUpperCase(),
            priceData,
            deliveryData,
            dateRange: { startDate, endDate }
        });
    } catch (error) {
        console.error('Error fetching historical data:', error);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});

// Initialize database, Excel data, and jobs
async function initializeServer() {
    try {
        console.log('🔧 Initializing database...');
        await initializeDatabase();
        
        console.log('📊 Loading Excel data...');
        await preloadExcelData();
        
        console.log('⏰ Initializing nightly jobs...');
        initializeJobs();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📈 Loaded ${Object.keys(industryData).length} industries with ${allSymbolsSet.size} symbols`);
            console.log('✅ All systems initialized successfully!');
        });
    } catch (error) {
        console.error('❌ Failed to initialize server:', error.message);
        process.exit(1);
    }
}

initializeServer();