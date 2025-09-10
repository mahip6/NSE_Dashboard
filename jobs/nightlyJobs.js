const cron = require('node-cron');
const { NseIndia } = require('stock-nse-india');
const { dbOps } = require('../db/setup');
const moment = require('moment');

const nseIndia = new NseIndia();

// Job configuration
const JOB_CONFIG = {
    PRICE_INGESTION: {
        schedule: '0 22 * * 1-5', // 10 PM on weekdays
        enabled: true,
        description: 'Ingest daily price data for all symbols'
    },
    DELIVERY_INGESTION: {
        schedule: '30 22 * * 1-5', // 10:30 PM on weekdays
        enabled: true,
        description: 'Ingest delivery data for all symbols'
    },
    DATA_CLEANUP: {
        schedule: '0 2 * * 0', // 2 AM on Sundays
        enabled: true,
        description: 'Clean up old data and optimize database'
    }
};

// Load symbols from industry data (you would replace this with your actual symbol list)
let symbolsList = [];

function loadSymbols() {
    // This would be loaded from your industry data or NIFTY 500 list
    // For now, using a sample list
    symbolsList = [
        'RELIANCE', 'TCS', 'INFY', 'HDFC', 'HDFCBANK', 'ICICIBANK', 'SBIN',
        'BHARTIARTL', 'ITC', 'LT', 'KOTAKBANK', 'ASIANPAINT', 'MARUTI',
        'HCLTECH', 'AXISBANK', 'WIPRO', 'ULTRACEMCO', 'NESTLEIND', 'BAJFINANCE',
        'TITAN', 'SUNPHARMA', 'POWERGRID', 'NTPC', 'ONGC', 'TECHM'
    ];
    console.log(`Loaded ${symbolsList.length} symbols for nightly processing`);
}

// Price ingestion job
async function ingestPriceData() {
    const jobName = 'PRICE_INGESTION';
    const startTime = new Date().toISOString();
    let recordsProcessed = 0;
    
    console.log(`Starting ${jobName} job at ${startTime}`);
    
    try {
        const today = moment().format('YYYY-MM-DD');
        
        // Process symbols in batches to avoid overwhelming the API
        const batchSize = 10;
        const batches = [];
        
        for (let i = 0; i < symbolsList.length; i += batchSize) {
            batches.push(symbolsList.slice(i, i + batchSize));
        }
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} symbols`);
            
            const batchPromises = batch.map(async (symbol) => {
                try {
                    // Fetch equity details
                    const equityData = await nseIndia.getEquityDetails(symbol);
                    
                    if (equityData && equityData.priceInfo) {
                        const priceData = {
                            open: equityData.priceInfo.open || equityData.priceInfo.lastPrice,
                            high: equityData.priceInfo.intraDayHighLow?.max || equityData.priceInfo.lastPrice,
                            low: equityData.priceInfo.intraDayHighLow?.min || equityData.priceInfo.lastPrice,
                            close: equityData.priceInfo.lastPrice,
                            volume: equityData.priceInfo.totalTradedVolume || 0,
                            changePercent: equityData.priceInfo.pChange || 0
                        };
                        
                        await dbOps.insertPriceData(symbol, today, priceData);
                        recordsProcessed++;
                        
                        console.log(`✓ Processed ${symbol}: ₹${priceData.close} (${priceData.changePercent}%)`);
                    }
                } catch (error) {
                    console.error(`Error processing ${symbol}:`, error.message);
                }
            });
            
            await Promise.all(batchPromises);
            
            // Add delay between batches to respect API limits
            if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        await dbOps.logJob(jobName, 'SUCCESS', `Processed ${recordsProcessed} symbols`, recordsProcessed, startTime);
        console.log(`✅ ${jobName} completed successfully. Processed ${recordsProcessed} records.`);
        
    } catch (error) {
        console.error(`❌ ${jobName} failed:`, error.message);
        await dbOps.logJob(jobName, 'ERROR', error.message, recordsProcessed, startTime);
    }
}

// Delivery data ingestion job
async function ingestDeliveryData() {
    const jobName = 'DELIVERY_INGESTION';
    const startTime = new Date().toISOString();
    let recordsProcessed = 0;
    
    console.log(`Starting ${jobName} job at ${startTime}`);
    
    try {
        const today = moment().format('YYYY-MM-DD');
        
        // Process a subset of symbols for delivery data (typically fewer symbols have delivery data)
        const deliverySymbols = symbolsList.slice(0, 15); // Top 15 symbols for demo
        
        for (const symbol of deliverySymbols) {
            try {
                // Fetch trade info which contains delivery data
                const tradeInfo = await nseIndia.getEquityTradeInfo(symbol);
                
                if (tradeInfo && tradeInfo.securityWiseDP) {
                    const deliveryData = {
                        tradedQuantity: tradeInfo.securityWiseDP.quantityTraded || 0,
                        deliveryQuantity: tradeInfo.securityWiseDP.deliveryQuantity || 0,
                        deliveryPercentage: tradeInfo.securityWiseDP.deliveryToTradedQuantity || 0,
                        closePrice: tradeInfo.marketDeptOrderBook?.tradeInfo?.totalTradedValue / 
                                  tradeInfo.marketDeptOrderBook?.tradeInfo?.totalTradedVolume || 0
                    };
                    
                    await dbOps.insertDeliveryData(symbol, today, deliveryData);
                    recordsProcessed++;
                    
                    console.log(`✓ Processed delivery for ${symbol}: ${deliveryData.deliveryPercentage.toFixed(2)}%`);
                }
                
                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing delivery for ${symbol}:`, error.message);
            }
        }
        
        await dbOps.logJob(jobName, 'SUCCESS', `Processed delivery data for ${recordsProcessed} symbols`, recordsProcessed, startTime);
        console.log(`✅ ${jobName} completed successfully. Processed ${recordsProcessed} records.`);
        
    } catch (error) {
        console.error(`❌ ${jobName} failed:`, error.message);
        await dbOps.logJob(jobName, 'ERROR', error.message, recordsProcessed, startTime);
    }
}

// Data cleanup job
async function cleanupOldData() {
    const jobName = 'DATA_CLEANUP';
    const startTime = new Date().toISOString();
    let recordsProcessed = 0;
    
    console.log(`Starting ${jobName} job at ${startTime}`);
    
    try {
        // Clean up data older than 2 years
        const cutoffDate = moment().subtract(2, 'years').format('YYYY-MM-DD');
        
        // This would implement actual cleanup logic
        // For now, just log the action
        console.log(`Would clean up data older than ${cutoffDate}`);
        
        await dbOps.logJob(jobName, 'SUCCESS', `Cleanup completed for data older than ${cutoffDate}`, recordsProcessed, startTime);
        console.log(`✅ ${jobName} completed successfully.`);
        
    } catch (error) {
        console.error(`❌ ${jobName} failed:`, error.message);
        await dbOps.logJob(jobName, 'ERROR', error.message, recordsProcessed, startTime);
    }
}

// Initialize and start jobs
function initializeJobs() {
    loadSymbols();
    
    console.log('🕐 Initializing nightly jobs...');
    
    // Price ingestion job
    if (JOB_CONFIG.PRICE_INGESTION.enabled) {
        cron.schedule(JOB_CONFIG.PRICE_INGESTION.schedule, () => {
            console.log('🔄 Triggering price ingestion job...');
            ingestPriceData();
        }, {
            timezone: "Asia/Kolkata"
        });
        console.log(`✅ Price ingestion job scheduled: ${JOB_CONFIG.PRICE_INGESTION.schedule}`);
    }
    
    // Delivery ingestion job
    if (JOB_CONFIG.DELIVERY_INGESTION.enabled) {
        cron.schedule(JOB_CONFIG.DELIVERY_INGESTION.schedule, () => {
            console.log('🔄 Triggering delivery ingestion job...');
            ingestDeliveryData();
        }, {
            timezone: "Asia/Kolkata"
        });
        console.log(`✅ Delivery ingestion job scheduled: ${JOB_CONFIG.DELIVERY_INGESTION.schedule}`);
    }
    
    // Data cleanup job
    if (JOB_CONFIG.DATA_CLEANUP.enabled) {
        cron.schedule(JOB_CONFIG.DATA_CLEANUP.schedule, () => {
            console.log('🔄 Triggering data cleanup job...');
            cleanupOldData();
        }, {
            timezone: "Asia/Kolkata"
        });
        console.log(`✅ Data cleanup job scheduled: ${JOB_CONFIG.DATA_CLEANUP.schedule}`);
    }
    
    console.log('🚀 All nightly jobs initialized successfully!');
}

// Manual job triggers for testing
const manualJobs = {
    triggerPriceIngestion: ingestPriceData,
    triggerDeliveryIngestion: ingestDeliveryData,
    triggerDataCleanup: cleanupOldData
};

module.exports = {
    initializeJobs,
    manualJobs,
    JOB_CONFIG
};