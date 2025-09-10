// Utility functions tests

describe('Utility Functions', () => {
    describe('Data Processing', () => {
        it('should calculate timeframe returns correctly', () => {
            // Mock timeframe calculation function
            const calculateTimeframeReturns = (prices, timeframe) => {
                if (timeframe === '1d') {
                    return prices[prices.length - 1] / prices[prices.length - 2] - 1;
                }
                
                const days = timeframe === '1w' ? 5 : timeframe === '1m' ? 20 : 60;
                const startIndex = Math.max(0, prices.length - days - 1);
                const startPrice = prices[startIndex];
                const endPrice = prices[prices.length - 1];
                
                return endPrice / startPrice - 1;
            };

            const mockPrices = [100, 105, 102, 108, 110];
            
            // Test 1-day return
            const oneDayReturn = calculateTimeframeReturns(mockPrices, '1d');
            expect(oneDayReturn).toBeCloseTo(0.0185, 4); // (110/108) - 1
            
            // Test 1-week return (5 days)
            const oneWeekReturn = calculateTimeframeReturns(mockPrices, '1w');
            expect(oneWeekReturn).toBeCloseTo(0.10, 2); // (110/100) - 1
        });

        it('should validate symbol format', () => {
            const validateSymbol = (symbol) => {
                if (!symbol || typeof symbol !== 'string') return false;
                return /^[A-Z0-9]+$/.test(symbol.trim());
            };

            expect(validateSymbol('RELIANCE')).toBe(true);
            expect(validateSymbol('TCS')).toBe(true);
            expect(validateSymbol('HDFCBANK')).toBe(true);
            expect(validateSymbol('reliance')).toBe(false); // lowercase
            expect(validateSymbol('REL-IANCE')).toBe(false); // special chars
            expect(validateSymbol('')).toBe(false); // empty
            expect(validateSymbol(null)).toBe(false); // null
        });

        it('should format currency correctly', () => {
            const formatCurrency = (amount) => {
                return new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    minimumFractionDigits: 2
                }).format(amount);
            };

            expect(formatCurrency(2500.50)).toBe('₹2,500.50');
            expect(formatCurrency(1000000)).toBe('₹10,00,000.00');
            expect(formatCurrency(0)).toBe('₹0.00');
        });

        it('should calculate correlation coefficient', () => {
            const calculateCorrelation = (x, y) => {
                if (x.length !== y.length || x.length === 0) return 0;
                
                const n = x.length;
                const sumX = x.reduce((a, b) => a + b, 0);
                const sumY = y.reduce((a, b) => a + b, 0);
                const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
                const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
                const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
                
                const numerator = n * sumXY - sumX * sumY;
                const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
                
                return denominator === 0 ? 0 : numerator / denominator;
            };

            // Perfect positive correlation
            const x1 = [1, 2, 3, 4, 5];
            const y1 = [2, 4, 6, 8, 10];
            expect(calculateCorrelation(x1, y1)).toBeCloseTo(1, 5);
            
            // Perfect negative correlation
            const x2 = [1, 2, 3, 4, 5];
            const y2 = [10, 8, 6, 4, 2];
            expect(calculateCorrelation(x2, y2)).toBeCloseTo(-1, 5);
            
            // No correlation
            const x3 = [1, 2, 3, 4, 5];
            const y3 = [3, 1, 4, 2, 5];
            const correlation = calculateCorrelation(x3, y3);
            expect(Math.abs(correlation)).toBeLessThan(1);
        });
    });

    describe('Date Utilities', () => {
        it('should format dates correctly', () => {
            const formatDate = (dateStr) => {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });
            };

            expect(formatDate('2024-01-01')).toBe('01 Jan 2024');
            expect(formatDate('2024-12-31')).toBe('31 Dec 2024');
        });

        it('should check if market is open', () => {
            const isMarketOpen = (date = new Date()) => {
                const istOffset = 5.5 * 60 * 60 * 1000;
                const istTime = new Date(date.getTime() + istOffset);
                const hours = istTime.getHours();
                const minutes = istTime.getMinutes();
                const day = istTime.getDay();
                
                const isWeekday = day >= 1 && day <= 5;
                const isMarketHours = (hours > 9 || (hours === 9 && minutes >= 15)) &&
                                    (hours < 15 || (hours === 15 && minutes <= 30));
                
                return isWeekday && isMarketHours;
            };

            // Test market hours (10:00 AM IST on a Tuesday)
            const marketOpen = new Date('2024-01-02T04:30:00Z'); // 10:00 AM IST
            expect(isMarketOpen(marketOpen)).toBe(true);
            
            // Test after market hours (5:00 PM IST on a Tuesday)
            const marketClosed = new Date('2024-01-02T11:30:00Z'); // 5:00 PM IST
            expect(isMarketOpen(marketClosed)).toBe(false);
            
            // Test weekend (Saturday)
            const weekend = new Date('2024-01-06T04:30:00Z'); // Saturday 10:00 AM IST
            expect(isMarketOpen(weekend)).toBe(false);
        });
    });

    describe('Statistical Functions', () => {
        it('should calculate momentum score', () => {
            const calculateMomentum = (prices, period = 14) => {
                if (prices.length < period + 1) return 0;
                
                let gains = 0;
                let losses = 0;
                
                for (let i = 1; i <= period; i++) {
                    const change = prices[prices.length - i] - prices[prices.length - i - 1];
                    if (change > 0) gains += change;
                    else losses -= change;
                }
                
                if (losses === 0) return 1;
                const rs = gains / losses;
                return rs / (1 + rs);
            };

            // Rising prices should have high momentum
            const risingPrices = Array.from({length: 20}, (_, i) => 100 + i * 2);
            const momentum = calculateMomentum(risingPrices);
            expect(momentum).toBeGreaterThan(0.8);
            
            // Falling prices should have low momentum
            const fallingPrices = Array.from({length: 20}, (_, i) => 200 - i * 2);
            const lowMomentum = calculateMomentum(fallingPrices);
            expect(lowMomentum).toBeLessThan(0.2);
        });
    });

    describe('Error Handling', () => {
        it('should handle division by zero', () => {
            const safeDiv = (a, b) => {
                return b === 0 ? 0 : a / b;
            };

            expect(safeDiv(10, 2)).toBe(5);
            expect(safeDiv(10, 0)).toBe(0);
            expect(safeDiv(0, 5)).toBe(0);
        });

        it('should handle null/undefined values', () => {
            const safeAccess = (obj, path, defaultValue = null) => {
                try {
                    return path.split('.').reduce((o, p) => o && o[p], obj) || defaultValue;
                } catch {
                    return defaultValue;
                }
            };

            const testObj = {
                priceInfo: {
                    lastPrice: 2500,
                    pChange: 1.5
                }
            };

            expect(safeAccess(testObj, 'priceInfo.lastPrice')).toBe(2500);
            expect(safeAccess(testObj, 'priceInfo.volume', 0)).toBe(0);
            expect(safeAccess(null, 'priceInfo.lastPrice', 'N/A')).toBe('N/A');
        });
    });
});