const express = require('express');
const { NseIndia } = require('stock-nse-india');
const path = require('path');
const NodeCache = require('node-cache');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;

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

// Industry Data Endpoint
app.get('/api/industry-data', async (req, res) => {
    try {
        const forceRefresh = req.query.refresh === 'true';
        
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

        let { results: validResults, cached } = await fetchEquityDetailsInBatches(allSymbols, BATCH_SIZE, forceRefresh);

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

// Initialize Excel data
preloadExcelData().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Loaded ${Object.keys(industryData).length} industries with ${allSymbolsSet.size} symbols`);
    });
}).catch(error => {
    console.error('Failed to initialize server:', error.message);
    process.exit(1);
});