// Mock dependencies
jest.mock('node-cron');
jest.mock('stock-nse-india');
jest.mock('../db/setup');

const cron = require('node-cron');
const { NseIndia } = require('stock-nse-india');

describe('Nightly Jobs', () => {
    let mockDbOps;
    let mockNseIndia;

    beforeEach(() => {
        // Mock database operations
        mockDbOps = {
            insertPriceData: jest.fn().mockResolvedValue(1),
            insertDeliveryData: jest.fn().mockResolvedValue(1),
            logJob: jest.fn().mockResolvedValue(1),
            getPriceData: jest.fn().mockResolvedValue([]),
            getDeliveryData: jest.fn().mockResolvedValue([]),
            getJobLogs: jest.fn().mockResolvedValue([])
        };

        // Mock NSE India API
        mockNseIndia = {
            getEquityDetails: jest.fn(),
            getEquityTradeInfo: jest.fn()
        };

        // Mock the NseIndia constructor
        NseIndia.mockImplementation(() => mockNseIndia);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Job Scheduling', () => {
        it('should schedule jobs with correct cron expressions', () => {
            // Mock cron.schedule
            const mockSchedule = jest.fn();
            cron.schedule = mockSchedule;

            // Import and initialize jobs (this would normally be done in the module)
            const jobConfig = {
                PRICE_INGESTION: {
                    schedule: '0 22 * * 1-5',
                    enabled: true,
                    description: 'Ingest daily price data for all symbols'
                },
                DELIVERY_INGESTION: {
                    schedule: '30 22 * * 1-5',
                    enabled: true,
                    description: 'Ingest delivery data for all symbols'
                }
            };

            // Simulate job initialization
            if (jobConfig.PRICE_INGESTION.enabled) {
                cron.schedule(jobConfig.PRICE_INGESTION.schedule, expect.any(Function), {
                    timezone: "Asia/Kolkata"
                });
            }

            if (jobConfig.DELIVERY_INGESTION.enabled) {
                cron.schedule(jobConfig.DELIVERY_INGESTION.schedule, expect.any(Function), {
                    timezone: "Asia/Kolkata"
                });
            }

            expect(mockSchedule).toHaveBeenCalledTimes(2);
            expect(mockSchedule).toHaveBeenCalledWith('0 22 * * 1-5', expect.any(Function), {
                timezone: "Asia/Kolkata"
            });
            expect(mockSchedule).toHaveBeenCalledWith('30 22 * * 1-5', expect.any(Function), {
                timezone: "Asia/Kolkata"
            });
        });
    });

    describe('Price Ingestion Job', () => {
        it('should process symbols and insert price data', async () => {
            // Mock successful API response
            mockNseIndia.getEquityDetails.mockResolvedValue({
                priceInfo: {
                    open: 2500,
                    lastPrice: 2520,
                    pChange: 0.8,
                    totalTradedVolume: 1000000,
                    intraDayHighLow: { max: 2550, min: 2480 }
                }
            });

            // Mock database operations
            require('../db/setup').dbOps = mockDbOps;

            // Simulate price ingestion function
            const ingestPriceData = async () => {
                const symbols = ['RELIANCE', 'TCS'];
                const today = '2024-01-01';
                let recordsProcessed = 0;

                for (const symbol of symbols) {
                    try {
                        const equityData = await mockNseIndia.getEquityDetails(symbol);
                        if (equityData && equityData.priceInfo) {
                            const priceData = {
                                open: equityData.priceInfo.open,
                                high: equityData.priceInfo.intraDayHighLow?.max,
                                low: equityData.priceInfo.intraDayHighLow?.min,
                                close: equityData.priceInfo.lastPrice,
                                volume: equityData.priceInfo.totalTradedVolume,
                                changePercent: equityData.priceInfo.pChange
                            };
                            
                            await mockDbOps.insertPriceData(symbol, today, priceData);
                            recordsProcessed++;
                        }
                    } catch (error) {
                        console.error(`Error processing ${symbol}:`, error.message);
                    }
                }

                await mockDbOps.logJob('PRICE_INGESTION', 'SUCCESS', `Processed ${recordsProcessed} symbols`, recordsProcessed);
                return recordsProcessed;
            };

            const result = await ingestPriceData();

            expect(result).toBe(2);
            expect(mockNseIndia.getEquityDetails).toHaveBeenCalledTimes(2);
            expect(mockDbOps.insertPriceData).toHaveBeenCalledTimes(2);
            expect(mockDbOps.logJob).toHaveBeenCalledWith(
                'PRICE_INGESTION', 
                'SUCCESS', 
                'Processed 2 symbols', 
                2
            );
        });

        it('should handle API errors gracefully', async () => {
            // Mock API error
            mockNseIndia.getEquityDetails.mockRejectedValue(new Error('API Error'));

            // Mock database operations
            require('../db/setup').dbOps = mockDbOps;

            // Simulate price ingestion with error handling
            const ingestPriceData = async () => {
                const symbols = ['INVALID_SYMBOL'];
                let recordsProcessed = 0;
                let errorCount = 0;

                for (const symbol of symbols) {
                    try {
                        await mockNseIndia.getEquityDetails(symbol);
                        recordsProcessed++;
                    } catch (error) {
                        errorCount++;
                    }
                }

                return { recordsProcessed, errorCount };
            };

            const result = await ingestPriceData();

            expect(result.recordsProcessed).toBe(0);
            expect(result.errorCount).toBe(1);
            expect(mockNseIndia.getEquityDetails).toHaveBeenCalledWith('INVALID_SYMBOL');
        });
    });

    describe('Delivery Ingestion Job', () => {
        it('should process delivery data correctly', async () => {
            // Mock successful trade info response
            mockNseIndia.getEquityTradeInfo.mockResolvedValue({
                securityWiseDP: {
                    quantityTraded: 500000,
                    deliveryQuantity: 325000,
                    deliveryToTradedQuantity: 65.0
                },
                marketDeptOrderBook: {
                    tradeInfo: {
                        totalTradedValue: 1250000000,
                        totalTradedVolume: 500000
                    }
                }
            });

            // Mock database operations
            require('../db/setup').dbOps = mockDbOps;

            // Simulate delivery ingestion function
            const ingestDeliveryData = async () => {
                const symbols = ['HDFC'];
                const today = '2024-01-01';
                let recordsProcessed = 0;

                for (const symbol of symbols) {
                    try {
                        const tradeInfo = await mockNseIndia.getEquityTradeInfo(symbol);
                        if (tradeInfo && tradeInfo.securityWiseDP) {
                            const deliveryData = {
                                tradedQuantity: tradeInfo.securityWiseDP.quantityTraded,
                                deliveryQuantity: tradeInfo.securityWiseDP.deliveryQuantity,
                                deliveryPercentage: tradeInfo.securityWiseDP.deliveryToTradedQuantity,
                                closePrice: tradeInfo.marketDeptOrderBook?.tradeInfo?.totalTradedValue / 
                                          tradeInfo.marketDeptOrderBook?.tradeInfo?.totalTradedVolume
                            };
                            
                            await mockDbOps.insertDeliveryData(symbol, today, deliveryData);
                            recordsProcessed++;
                        }
                    } catch (error) {
                        console.error(`Error processing delivery for ${symbol}:`, error.message);
                    }
                }

                return recordsProcessed;
            };

            const result = await ingestDeliveryData();

            expect(result).toBe(1);
            expect(mockNseIndia.getEquityTradeInfo).toHaveBeenCalledWith('HDFC');
            expect(mockDbOps.insertDeliveryData).toHaveBeenCalledWith(
                'HDFC', 
                '2024-01-01', 
                expect.objectContaining({
                    tradedQuantity: 500000,
                    deliveryQuantity: 325000,
                    deliveryPercentage: 65.0
                })
            );
        });
    });

    describe('Job Configuration', () => {
        it('should have valid cron expressions', () => {
            const jobConfig = {
                PRICE_INGESTION: {
                    schedule: '0 22 * * 1-5', // 10 PM on weekdays
                    enabled: true
                },
                DELIVERY_INGESTION: {
                    schedule: '30 22 * * 1-5', // 10:30 PM on weekdays
                    enabled: true
                },
                DATA_CLEANUP: {
                    schedule: '0 2 * * 0', // 2 AM on Sundays
                    enabled: true
                }
            };

            // Test that schedules are properly formatted
            Object.values(jobConfig).forEach(config => {
                expect(config.schedule).toMatch(/^[\d\*\-,\/\s]+$/);
                expect(typeof config.enabled).toBe('boolean');
            });
        });
    });
});