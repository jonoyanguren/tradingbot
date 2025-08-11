// bot.js
// Run: node bot.js
import ccxt from 'ccxt';
import fs from 'fs';
import XLSX from 'xlsx';

/**
 * DEFAULT CONFIG
 * Can be overridden via environment variables
 */
const DEFAULT_CFG = {
    exchange: 'kucoin',
    symbol: 'BTC/USDT',
    timeframe: '1m',
    verbose: true,
    fastLen: 12,
    slowLen: 30,
    rsiLen: 14,
    rsiLongMin: 55,
    rsiShortMax: 45,
    minBars: 200,
    pollMs: 5000,
    logPrefix: '[KUCOIN-BOT]',
    // Risk Management
    stopLossPercent: 2.0,
    takeProfitPercent: 4.0,
    riskRewardRatio: 2.0,
    // Trading Fees
    tradingFeePercent: 0.16,  // Round-trip fees (0.08% * 2)
    // Heartbeat
    heartbeatMinutes: 5,      // Heartbeat every 5 minutes
    // State persistence
    stateFile: 'state1.json',
    // Virtual Trading
    initialBalance: 100.0,    // Initial balance in EUR
    positionSizePercent: 95,  // Use 95% of available balance per trade
    excelFile: 'trading_log.xlsx'
};

/**
 * Load configuration with environment variable overrides
 */
function loadConfig() {
    const cfg = { ...DEFAULT_CFG };

    // Override with environment variables if present
    if (process.env.EXCHANGE) cfg.exchange = process.env.EXCHANGE;
    if (process.env.SYMBOL) cfg.symbol = process.env.SYMBOL;
    if (process.env.TIMEFRAME) cfg.timeframe = process.env.TIMEFRAME;
    if (process.env.VERBOSE) cfg.verbose = process.env.VERBOSE === 'true';
    if (process.env.FAST_LEN) cfg.fastLen = parseInt(process.env.FAST_LEN);
    if (process.env.SLOW_LEN) cfg.slowLen = parseInt(process.env.SLOW_LEN);
    if (process.env.RSI_LEN) cfg.rsiLen = parseInt(process.env.RSI_LEN);
    if (process.env.RSI_LONG_MIN) cfg.rsiLongMin = parseFloat(process.env.RSI_LONG_MIN);
    if (process.env.RSI_SHORT_MAX) cfg.rsiShortMax = parseFloat(process.env.RSI_SHORT_MAX);
    if (process.env.STOP_LOSS_PERCENT) cfg.stopLossPercent = parseFloat(process.env.STOP_LOSS_PERCENT);
    if (process.env.TAKE_PROFIT_PERCENT) cfg.takeProfitPercent = parseFloat(process.env.TAKE_PROFIT_PERCENT);
    if (process.env.TRADING_FEE_PERCENT) cfg.tradingFeePercent = parseFloat(process.env.TRADING_FEE_PERCENT);
    if (process.env.POLL_MS) cfg.pollMs = parseInt(process.env.POLL_MS);
    if (process.env.HEARTBEAT_MINUTES) cfg.heartbeatMinutes = parseInt(process.env.HEARTBEAT_MINUTES);
    if (process.env.STATE_FILE) cfg.stateFile = process.env.STATE_FILE;
    if (process.env.INITIAL_BALANCE) cfg.initialBalance = parseFloat(process.env.INITIAL_BALANCE);
    if (process.env.POSITION_SIZE_PERCENT) cfg.positionSizePercent = parseFloat(process.env.POSITION_SIZE_PERCENT);
    if (process.env.EXCEL_FILE) cfg.excelFile = process.env.EXCEL_FILE;

    return cfg;
}

const CFG = loadConfig();

// ====== indicator utilities ======
function ema(values, period) {
    const k = 2 / (period + 1);
    let emaArr = new Array(values.length).fill(null);
    // Initial SMA
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    let prev = sum / period;
    emaArr[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
        const v = values[i] * k + prev * (1 - k);
        emaArr[i] = v;
        prev = v;
    }
    return emaArr;
}

function rsi(values, period) {
    let rsiArr = new Array(values.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const ch = values[i] - values[i - 1];
        if (ch >= 0) gains += ch; else losses -= ch;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsiArr[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < values.length; i++) {
        const ch = values[i] - values[i - 1];
        const gain = ch > 0 ? ch : 0;
        const loss = ch < 0 ? -ch : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
        rsiArr[i] = 100 - (100 / (1 + rs));
    }
    return rsiArr;
}

function crossover(aPrev, aNow, bPrev, bNow) { return aPrev <= bPrev && aNow > bNow; }
function crossunder(aPrev, aNow, bPrev, bNow) { return aPrev >= bPrev && aNow < bNow; }

// ====== State Management ======
/**
 * Load bot state from file
 */
function loadState() {
    try {
        if (fs.existsSync(CFG.stateFile)) {
            const data = fs.readFileSync(CFG.stateFile, 'utf8');
            const state = JSON.parse(data);
            console.log(`${CFG.logPrefix} Loaded state from ${CFG.stateFile}`);
            return {
                lastClosedTs: state.lastClosedTs || 0,
                totalTrades: state.totalTrades || 0,
                winningTrades: state.winningTrades || 0,
                totalPnL: state.totalPnL || 0,
                balance: state.balance || CFG.initialBalance,
                currentPosition: state.currentPosition ? new Position(
                    state.currentPosition.type,
                    state.currentPosition.entryPrice,
                    state.currentPosition.timestamp,
                    state.currentPosition.symbol,
                    state.currentPosition.quantity,
                    state.currentPosition
                ) : null,
                trades: state.trades || []
            };
        }
    } catch (error) {
        console.warn(`${CFG.logPrefix} Error loading state: ${error.message}`);
    }

    return {
        lastClosedTs: 0,
        totalTrades: 0,
        winningTrades: 0,
        totalPnL: 0,
        balance: CFG.initialBalance,
        currentPosition: null,
        trades: []
    };
}

/**
 * Save bot state to file
 */
function saveState(state) {
    try {
        const stateData = {
            lastClosedTs: state.lastClosedTs,
            totalTrades: state.totalTrades,
            winningTrades: state.winningTrades,
            totalPnL: state.totalPnL,
            balance: state.balance,
            currentPosition: state.currentPosition ? {
                type: state.currentPosition.type,
                entryPrice: state.currentPosition.entryPrice,
                timestamp: state.currentPosition.timestamp,
                symbol: state.currentPosition.symbol,
                quantity: state.currentPosition.quantity,
                stopLoss: state.currentPosition.stopLoss,
                takeProfit: state.currentPosition.takeProfit,
                isActive: state.currentPosition.isActive
            } : null,
            trades: state.trades,
            lastSaved: new Date().toISOString()
        };

        fs.writeFileSync(CFG.stateFile, JSON.stringify(stateData, null, 2));
    } catch (error) {
        console.error(`${CFG.logPrefix} Error saving state: ${error.message}`);
    }
}

/**
 * Export trades to Excel
 */
function exportTradesToExcel(trades) {
    try {
        if (trades.length === 0) {
            console.log(`${CFG.logPrefix} No trades to export`);
            return;
        }

        // Prepare data for Excel
        const excelData = trades.map(trade => ({
            'ID': trade.id,
            'Fecha Entrada': new Date(trade.entryTime).toLocaleString('es-ES'),
            'Fecha Salida': trade.exitTime ? new Date(trade.exitTime).toLocaleString('es-ES') : 'Activa',
            'Par': trade.symbol,
            'Tipo': trade.type,
            'Precio Entrada €': trade.entryPrice.toFixed(2),
            'Precio Salida €': trade.exitPrice ? trade.exitPrice.toFixed(2) : '-',
            'Cantidad': trade.quantity.toFixed(6),
            'Valor Entrada €': trade.entryValue.toFixed(2),
            'Valor Salida €': trade.exitValue ? trade.exitValue.toFixed(2) : '-',
            'Stop Loss €': trade.stopLoss.toFixed(2),
            'Take Profit €': trade.takeProfit.toFixed(2),
            'PnL %': trade.pnlPercent ? trade.pnlPercent.toFixed(2) : '-',
            'PnL €': trade.pnlEur ? trade.pnlEur.toFixed(2) : '-',
            'Comisiones €': trade.fees.toFixed(2),
            'Balance Final €': trade.finalBalance.toFixed(2),
            'Tipo Salida': trade.exitType || 'Activa',
            'RSI Entrada': trade.entryRSI ? trade.entryRSI.toFixed(2) : '-',
            'EMA Rápida': trade.fastEMA ? trade.fastEMA.toFixed(2) : '-',
            'EMA Lenta': trade.slowEMA ? trade.slowEMA.toFixed(2) : '-'
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns
        const colWidths = [];
        Object.keys(excelData[0]).forEach((key, index) => {
            const maxLength = Math.max(
                key.length,
                ...excelData.map(row => String(row[key]).length)
            );
            colWidths[index] = { wch: Math.min(maxLength + 2, 20) };
        });
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Trading Log');

        // Write file
        XLSX.writeFile(wb, CFG.excelFile);
        console.log(`${CFG.logPrefix} Exported ${trades.length} trades to ${CFG.excelFile}`);
    } catch (error) {
        console.error(`${CFG.logPrefix} Error exporting to Excel: ${error.message}`);
    }
}

// ====== Position Management ======
class Position {
    constructor(type, entryPrice, timestamp, symbol, quantity, savedData = null) {
        this.type = type;           // 'LONG' or 'SHORT'
        this.entryPrice = entryPrice;
        this.timestamp = timestamp;
        this.symbol = symbol;
        this.quantity = quantity;   // Amount of crypto bought/sold

        // Restore from saved data or calculate new
        if (savedData) {
            this.stopLoss = savedData.stopLoss;
            this.takeProfit = savedData.takeProfit;
            this.isActive = savedData.isActive;
            this.quantity = savedData.quantity;
        } else {
            this.stopLoss = this.calculateStopLoss();
            this.takeProfit = this.calculateTakeProfit();
            this.isActive = true;
        }
    }

    calculateStopLoss() {
        const slPercent = CFG.stopLossPercent / 100;
        if (this.type === 'LONG') {
            return this.entryPrice * (1 - slPercent);
        } else {
            return this.entryPrice * (1 + slPercent);
        }
    }

    calculateTakeProfit() {
        const tpPercent = CFG.takeProfitPercent / 100;
        if (this.type === 'LONG') {
            return this.entryPrice * (1 + tpPercent);
        } else {
            return this.entryPrice * (1 - tpPercent);
        }
    }

    checkExit(currentPrice, high = null, low = null) {
        if (!this.isActive) return null;

        if (this.type === 'LONG') {
            // Check intrabar lows for stop loss
            if (low !== null && low <= this.stopLoss) {
                return { type: 'STOP_LOSS', price: this.stopLoss, pnl: this.calculatePnL(this.stopLoss) };
            }
            // Check intrabar highs for take profit
            if (high !== null && high >= this.takeProfit) {
                return { type: 'TAKE_PROFIT', price: this.takeProfit, pnl: this.calculatePnL(this.takeProfit) };
            }
            // Fallback to current price checks
            if (currentPrice <= this.stopLoss) {
                return { type: 'STOP_LOSS', price: currentPrice, pnl: this.calculatePnL(currentPrice) };
            }
            if (currentPrice >= this.takeProfit) {
                return { type: 'TAKE_PROFIT', price: currentPrice, pnl: this.calculatePnL(currentPrice) };
            }
        } else { // SHORT
            // Check intrabar highs for stop loss
            if (high !== null && high >= this.stopLoss) {
                return { type: 'STOP_LOSS', price: this.stopLoss, pnl: this.calculatePnL(this.stopLoss) };
            }
            // Check intrabar lows for take profit
            if (low !== null && low <= this.takeProfit) {
                return { type: 'TAKE_PROFIT', price: this.takeProfit, pnl: this.calculatePnL(this.takeProfit) };
            }
            // Fallback to current price checks
            if (currentPrice >= this.stopLoss) {
                return { type: 'STOP_LOSS', price: currentPrice, pnl: this.calculatePnL(currentPrice) };
            }
            if (currentPrice <= this.takeProfit) {
                return { type: 'TAKE_PROFIT', price: currentPrice, pnl: this.calculatePnL(currentPrice) };
            }
        }
        return null;
    }

    calculatePnL(currentPrice) {
        const priceDiff = this.type === 'LONG'
            ? currentPrice - this.entryPrice
            : this.entryPrice - currentPrice;
        const grossPnL = (priceDiff / this.entryPrice) * 100; // Percentage PnL
        const feesCost = CFG.tradingFeePercent; // Round-trip fees
        return grossPnL - feesCost; // Net PnL after fees
    }

    calculatePnLEur(currentPrice) {
        const entryValue = this.quantity * this.entryPrice;
        const currentValue = this.quantity * currentPrice;
        const grossPnLEur = this.type === 'LONG'
            ? currentValue - entryValue
            : entryValue - currentValue;
        const fees = entryValue * (CFG.tradingFeePercent / 100);
        return grossPnLEur - fees; // Net PnL in EUR after fees
    }

    close(exitPrice, exitType) {
        this.isActive = false;
        this.exitPrice = exitPrice;
        this.exitType = exitType;
        this.pnl = this.calculatePnL(exitPrice);
        return this.pnl;
    }
}

// ====== Helper Functions ======
/**
 * Initialize and validate exchange
 */
async function initializeExchange() {
    const exchangeClass = ccxt[CFG.exchange];
    if (!exchangeClass) {
        throw new Error(`Exchange ${CFG.exchange} not supported by ccxt`);
    }

    const ex = new exchangeClass({ enableRateLimit: true });

    // Load markets
    console.log(`${CFG.logPrefix} Loading markets...`);
    await ex.loadMarkets();

    // Validate symbol
    if (!ex.markets[CFG.symbol]) {
        throw new Error(`Symbol ${CFG.symbol} not found on ${CFG.exchange}`);
    }

    // Validate fetchOHLCV support
    if (!ex.has.fetchOHLCV) {
        throw new Error(`Exchange ${CFG.exchange} does not support fetchOHLCV`);
    }

    // Validate timeframe
    if (!ex.timeframes[CFG.timeframe]) {
        console.warn(`${CFG.logPrefix} Warning: Timeframe ${CFG.timeframe} may not be supported. Available: ${Object.keys(ex.timeframes).join(', ')}`);
    }

    console.log(`${CFG.logPrefix} Exchange initialized successfully`);
    return ex;
}

/**
 * Handle position exit
 */
function handlePositionExit(position, exitSignal, state) {
    const pnl = position.close(exitSignal.price, exitSignal.type);
    const pnlEur = position.calculatePnLEur(exitSignal.price);

    // Update balance
    const entryValue = position.quantity * position.entryPrice;
    const exitValue = position.quantity * exitSignal.price;
    state.balance += pnlEur;

    state.totalTrades++;
    state.totalPnL += pnl;
    if (pnl > 0) state.winningTrades++;

    // Create trade record
    const trade = {
        id: state.totalTrades,
        entryTime: position.timestamp,
        exitTime: Date.now(),
        symbol: position.symbol,
        type: position.type,
        entryPrice: position.entryPrice,
        exitPrice: exitSignal.price,
        quantity: position.quantity,
        entryValue: entryValue,
        exitValue: exitValue,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        pnlPercent: pnl,
        pnlEur: pnlEur,
        fees: entryValue * (CFG.tradingFeePercent / 100),
        finalBalance: state.balance,
        exitType: exitSignal.type,
        entryRSI: position.entryRSI,
        fastEMA: position.fastEMA,
        slowEMA: position.slowEMA
    };

    state.trades.push(trade);

    const winRate = ((state.winningTrades / state.totalTrades) * 100).toFixed(1);
    const ts = new Date().toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Madrid'
    });

    console.log(`${CFG.logPrefix} ${ts} ${exitSignal.type} ${position.type} at €${exitSignal.price.toFixed(2)} | PnL: ${pnl.toFixed(2)}% (€${pnlEur.toFixed(2)}) | Balance: €${state.balance.toFixed(2)} | Win Rate: ${winRate}%`);

    state.currentPosition = null;
    saveState(state);

    // Export to Excel after each trade
    exportTradesToExcel(state.trades);

    return pnl;
}

/**
 * Create new position
 */
function createPosition(type, currentPrice, timestamp, state, rsiNow, fastEMA, slowEMA) {
    // Calculate position size based on available balance
    const availableBalance = state.balance * (CFG.positionSizePercent / 100);
    const quantity = availableBalance / currentPrice;

    if (availableBalance < 5) { // Minimum 5€ trade
        console.log(`${CFG.logPrefix} Insufficient balance for trade: €${state.balance.toFixed(2)} available`);
        return null;
    }

    const position = new Position(type, currentPrice, timestamp, CFG.symbol, quantity);

    // Store additional entry data for Excel
    position.entryRSI = rsiNow;
    position.fastEMA = fastEMA;
    position.slowEMA = slowEMA;

    state.currentPosition = position;

    const entryValue = quantity * currentPrice;
    const ts = new Date(timestamp).toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/Madrid'
    });
    console.log(`${CFG.logPrefix} ${ts} ${type} ENTRY ${CFG.symbol} at €${currentPrice.toFixed(2)} | Quantity: ${quantity.toFixed(6)} | Value: €${entryValue.toFixed(2)} | SL: €${position.stopLoss.toFixed(2)} | TP: €${position.takeProfit.toFixed(2)}`);

    saveState(state);
    return position;
}

// ====== main loop ======
async function run() {
    console.log(`${CFG.logPrefix} Starting on ${CFG.exchange} ${CFG.symbol} TF=${CFG.timeframe}`);
    console.log(`${CFG.logPrefix} Risk Management: SL=${CFG.stopLossPercent}% TP=${CFG.takeProfitPercent}% Fees=${CFG.tradingFeePercent}%`);

    // Initialize exchange
    const ex = await initializeExchange();

    // Load persistent state
    const state = loadState();
    console.log(`${CFG.logPrefix} Virtual Trading - Starting Balance: €${CFG.initialBalance}`);
    console.log(`${CFG.logPrefix} Loaded state: ${state.totalTrades} trades, €${state.balance.toFixed(2)} balance, ${state.totalPnL.toFixed(2)}% total PnL`);

    let lastHeartbeat = Date.now();

    while (true) {
        try {
            // Fetch candles first (OHLCV: [timestamp, open, high, low, close, volume])
            const ohlcv = await ex.fetchOHLCV(CFG.symbol, CFG.timeframe, undefined, Math.max(CFG.minBars + 5, 500));
            if (!ohlcv || ohlcv.length < CFG.minBars) {
                console.log(`${CFG.logPrefix} Not enough candles yet (${ohlcv?.length || 0})`);
                await sleep(CFG.pollMs);
                continue;
            }

            // Always work with CLOSED candles (remove the last one in progress)
            const closed = ohlcv.slice(0, -1);
            const currentCandle = ohlcv[ohlcv.length - 1]; // Current incomplete candle

            // Heartbeat logging (after currentCandle is defined)
            const now = Date.now();
            if (now - lastHeartbeat >= CFG.heartbeatMinutes * 60 * 1000) {
                const ts = new Date().toLocaleString('es-ES', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Europe/Madrid'
                });
                let positionInfo = '| No position';

                if (state.currentPosition && state.currentPosition.isActive) {
                    const currentPrice = currentCandle ? currentCandle[4] : 0;
                    const currentPnL = currentPrice > 0 ? state.currentPosition.calculatePnL(currentPrice) : 0;
                    const currentPnLEur = currentPrice > 0 ? state.currentPosition.calculatePnLEur(currentPrice) : 0;

                    positionInfo = `| Active ${state.currentPosition.type} at €${state.currentPosition.entryPrice.toFixed(2)} | Current: €${currentPrice.toFixed(2)} | PnL: ${currentPnL.toFixed(2)}% (€${currentPnLEur.toFixed(2)}) | SL: €${state.currentPosition.stopLoss.toFixed(2)} | TP: €${state.currentPosition.takeProfit.toFixed(2)}`;
                }

                console.log(`${CFG.logPrefix} ${ts} Heartbeat - Running ${positionInfo} | Balance: €${state.balance.toFixed(2)} | Total trades: ${state.totalTrades} | Win Rate: ${state.totalTrades > 0 ? ((state.winningTrades / state.totalTrades) * 100).toFixed(1) : 0}%`);
                lastHeartbeat = now;
            }
            const closes = closed.map(c => c[4]);
            const highs = closed.map(c => c[2]);
            const lows = closed.map(c => c[3]);
            const times = closed.map(c => c[0]);
            const nowClosedTs = times[times.length - 1];

            // Avoid repeating signals on the same closed candle
            if (nowClosedTs === state.lastClosedTs) {
                // Still check for intrabar exits on current candle if we have a position
                if (state.currentPosition && state.currentPosition.isActive) {
                    const exitSignal = state.currentPosition.checkExit(
                        currentCandle[4], // current close
                        currentCandle[2], // current high
                        currentCandle[3]  // current low
                    );
                    if (exitSignal) {
                        handlePositionExit(state.currentPosition, exitSignal, state);
                    }
                }
                await sleep(CFG.pollMs);
                continue;
            }

            // Indicators
            const emaFastArr = ema(closes, CFG.fastLen);
            const emaSlowArr = ema(closes, CFG.slowLen);
            const rsiArr = rsi(closes, CFG.rsiLen);

            const i = closes.length - 1;       // index of last closed candle
            const iPrev = i - 1;

            const fastNow = emaFastArr[i], fastPrev = emaFastArr[iPrev];
            const slowNow = emaSlowArr[i], slowPrev = emaSlowArr[iPrev];
            const rsiNow = rsiArr[i];

            if ([fastNow, fastPrev, slowNow, slowPrev, rsiNow].some(v => v == null || Number.isNaN(v))) {
                lastClosedTs = nowClosedTs;
                await sleep(CFG.pollMs);
                continue;
            }

            const currentPrice = closes[i];
            const currentHigh = highs[i];
            const currentLow = lows[i];
            const ts = new Date(nowClosedTs).toLocaleString('es-ES', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Europe/Madrid'
            });

            // Check for position exits first (including intrabar exits)
            if (state.currentPosition && state.currentPosition.isActive) {
                const exitSignal = state.currentPosition.checkExit(currentPrice, currentHigh, currentLow);
                if (exitSignal) {
                    handlePositionExit(state.currentPosition, exitSignal, state);
                }
            }

            // Only check for new signals if no active position
            if (!state.currentPosition || !state.currentPosition.isActive) {
                const longSignal = crossover(fastPrev, fastNow, slowPrev, slowNow) && rsiNow > CFG.rsiLongMin;
                const shortSignal = crossunder(fastPrev, fastNow, slowPrev, slowNow) && rsiNow < CFG.rsiShortMax;

                if (longSignal) {
                    createPosition('LONG', currentPrice, nowClosedTs, state, rsiNow, fastNow, slowNow);
                } else if (shortSignal) {
                    createPosition('SHORT', currentPrice, nowClosedTs, state, rsiNow, fastNow, slowNow);
                } else if (CFG.verbose) {
                    if (state.currentPosition && state.currentPosition.isActive) {
                        // Show position info when active
                        const currentPnL = state.currentPosition.calculatePnL(currentPrice);
                        const currentPnLEur = state.currentPosition.calculatePnLEur(currentPrice);
                        const distanceToSL = Math.abs(((currentPrice - state.currentPosition.stopLoss) / state.currentPosition.stopLoss) * 100);
                        const distanceToTP = Math.abs(((state.currentPosition.takeProfit - currentPrice) / currentPrice) * 100);

                        console.log(`${CFG.logPrefix} ${ts} Position Monitoring - ${state.currentPosition.type} | Entry: €${state.currentPosition.entryPrice.toFixed(2)} | Current: €${currentPrice.toFixed(2)} | PnL: ${currentPnL.toFixed(2)}% (€${currentPnLEur.toFixed(2)}) | Distance to SL: ${distanceToSL.toFixed(2)}% | Distance to TP: ${distanceToTP.toFixed(2)}% | RSI: ${rsiNow.toFixed(1)}`);
                    } else {
                        // Show market info when no position
                        console.log(`${CFG.logPrefix} ${ts} Monitoring - Price: €${currentPrice.toFixed(2)} | RSI: ${rsiNow.toFixed(1)} | Fast EMA: €${fastNow.toFixed(2)} | Slow EMA: €${slowNow.toFixed(2)} | Balance: €${state.balance.toFixed(2)}`);
                    }
                }
            }

            state.lastClosedTs = nowClosedTs;
            saveState(state);
            await sleep(CFG.pollMs);

        } catch (err) {
            console.error(`${CFG.logPrefix} Error:`, err.message);
            await sleep(2000);
        }
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(e => console.error(e));
