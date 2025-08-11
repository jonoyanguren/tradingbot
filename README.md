# 🤖 Bot de Trading Automatizado

Bot de trading automatizado para KuCoin que utiliza análisis técnico (EMA + RSI) para detectar oportunidades de compra/venta en el par BTC/USDT con balance virtual de €100.

## 📋 Características

- ✅ **Trading Virtual**: Simula operaciones con €100 iniciales
- ✅ **Análisis Técnico**: EMA (12/30) + RSI (14) para señales
- ✅ **Gestión de Riesgo**: Stop Loss y Take Profit automáticos
- ✅ **Exportación Excel**: Log completo de todas las operaciones
- ✅ **Persistencia**: Mantiene estado entre reinicios
- ✅ **Configuración Flexible**: Variables de entorno
- ✅ **Monitoreo en Tiempo Real**: Logs detallados

## 🚀 Instalación

```bash
# Clonar repositorio
git clone <tu-repo>
cd TradingBot

# Instalar dependencias
npm install

# Ejecutar bot
node bot.js
```

## 🎯 Estrategia de Trading

### Señales de Entrada
- **LONG (Compra)**: EMA rápida cruza por encima de EMA lenta + RSI > 55
- **SHORT (Venta)**: EMA rápida cruza por debajo de EMA lenta + RSI < 45

### Gestión de Riesgo
- **Stop Loss**: 2% de pérdida desde precio de entrada
- **Take Profit**: 4% de ganancia desde precio de entrada
- **Comisiones**: 0.16% por operación completa

## 📊 Interpretación de Logs

### 🔧 Logs de Inicialización
```
[KUCOIN-BOT] Starting on kucoin BTC/USDT TF=1m
[KUCOIN-BOT] Risk Management: SL=2% TP=4% Fees=0.16%
[KUCOIN-BOT] Loading markets...
[KUCOIN-BOT] Exchange initialized successfully
[KUCOIN-BOT] Virtual Trading - Starting Balance: €100
[KUCOIN-BOT] Loaded state: 0 trades, €100.00 balance, 0.00% total PnL
```

**Significado:**
- **TF=1m**: Timeframe de 1 minuto (velas de 1 minuto)
- **SL=2%**: Stop Loss al 2%
- **TP=4%**: Take Profit al 4%
- **Fees=0.16%**: Comisiones por operación completa
- **Balance**: Balance virtual actual

### 📈 Logs de Monitoreo
```
[KUCOIN-BOT] 10/08/2025, 16:06:00 Monitoring - Price: €118544.60 | RSI: 53.8 | Fast EMA: €118471.96 | Slow EMA: €118502.40 | Balance: €100.00
```

**Significado:**
- **Timestamp**: Hora exacta del análisis
- **Price**: Precio actual de BTC/USDT
- **RSI**: Índice de Fuerza Relativa (0-100)
  - RSI < 30: Sobreventa (posible compra)
  - RSI > 70: Sobrecompra (posible venta)
  - RSI 45-55: Neutral
- **Fast EMA**: Media móvil exponencial rápida (12 períodos)
- **Slow EMA**: Media móvil exponencial lenta (30 períodos)
- **Balance**: Balance virtual disponible

### 🎯 Logs de Entrada en Posición
```
[KUCOIN-BOT] 10/08/2025, 13:23:00 LONG ENTRY BTC/USDT at €118132.50 | Quantity: 0.000804 | Value: €95.00 | SL: €115769.85 | TP: €122857.80
```

**Significado:**
- **LONG ENTRY**: Apertura de posición de compra
- **at €118132.50**: Precio de entrada
- **Quantity: 0.000804**: Cantidad de BTC comprada
- **Value: €95.00**: Valor en euros invertido (95% del balance)
- **SL: €115769.85**: Precio de Stop Loss (-2%)
- **TP: €122857.80**: Precio de Take Profit (+4%)

### 💰 Logs de Cierre de Posición
```
[KUCOIN-BOT] 10/08/2025, 14:05:00 TAKE_PROFIT LONG at €122857.80 | PnL: 3.84% (€3.65) | Balance: €103.65 | Win Rate: 100.0%
```

**Significado:**
- **TAKE_PROFIT**: Cerrada por alcanzar objetivo de ganancia
- **STOP_LOSS**: Cerrada por alcanzar límite de pérdida
- **at €122857.80**: Precio de salida
- **PnL: 3.84% (€3.65)**: Ganancia/pérdida en % y euros (después de comisiones)
- **Balance: €103.65**: Nuevo balance después de la operación
- **Win Rate: 100.0%**: Porcentaje de operaciones ganadoras

### ❤️ Logs de Heartbeat

#### Sin Posición Activa:
```
[KUCOIN-BOT] 10/08/2025, 15:36:46 Heartbeat - Running | No position | Balance: €100.00 | Total trades: 0 | Win Rate: 0%
```

#### Con Posición Activa:
```
[KUCOIN-BOT] 10/08/2025, 15:36:46 Heartbeat - Running | Active LONG at €118132.50 | Current: €118500.00 | PnL: 0.15% (€0.14) | SL: €117171.05 | TP: €122857.80 | Balance: €100.00 | Total trades: 0 | Win Rate: 0%
```

**Significado:**
- **Heartbeat**: Señal de vida cada 5 minutos
- **Active LONG**: Posición activa de compra en €118,132.50
- **Current**: Precio actual del mercado
- **PnL**: Ganancia/pérdida actual en % y euros
- **SL**: Precio de Stop Loss (cierre por pérdida)
- **TP**: Precio de Take Profit (cierre por ganancia)
- **No position**: Sin posiciones abiertas
- **Total trades**: Número total de operaciones completadas
- **Win Rate**: Porcentaje de éxito

### 📊 Logs de Monitoreo de Posición
```
[KUCOIN-BOT] 10/08/2025, 16:06:00 Position Monitoring - LONG | Entry: €118132.50 | Current: €118500.00 | PnL: 0.15% (€0.14) | Distance to SL: 1.85% | Distance to TP: 3.85% | RSI: 53.8
```

**Significado:**
- **Position Monitoring**: Seguimiento de posición activa
- **Entry**: Precio de entrada de la posición
- **Current**: Precio actual del mercado
- **PnL**: Ganancia/pérdida actual después de comisiones
- **Distance to SL**: Cuánto falta para el Stop Loss
- **Distance to TP**: Cuánto falta para el Take Profit
- **RSI**: Valor actual del RSI

## 🔧 Configuración Avanzada

### Variables de Entorno
```bash
# Configuración básica
SYMBOL=BTC/USDT                    # Par de trading
TIMEFRAME=1m                       # Timeframe (1m, 5m, 15m, 1h)
VERBOSE=true                       # Mostrar logs detallados

# Indicadores técnicos
FAST_LEN=12                        # Períodos EMA rápida
SLOW_LEN=30                        # Períodos EMA lenta
RSI_LEN=14                         # Períodos RSI
RSI_LONG_MIN=55                    # RSI mínimo para compras
RSI_SHORT_MAX=45                   # RSI máximo para ventas

# Gestión de riesgo
STOP_LOSS_PERCENT=2.0              # Stop Loss en %
TAKE_PROFIT_PERCENT=4.0            # Take Profit en %
TRADING_FEE_PERCENT=0.16           # Comisiones en %

# Trading virtual
INITIAL_BALANCE=100                # Balance inicial en euros
POSITION_SIZE_PERCENT=95           # % del balance por operación

# Sistema
POLL_MS=5000                       # Frecuencia de análisis (ms)
HEARTBEAT_MINUTES=5                # Frecuencia de heartbeat
EXCEL_FILE=trading_log.xlsx        # Archivo de exportación
```

### Ejemplos de Configuración

#### Trading Agresivo (más operaciones)
```bash
STOP_LOSS_PERCENT=0.5 TAKE_PROFIT_PERCENT=1.0 RSI_LONG_MIN=45 RSI_SHORT_MAX=55 node bot.js
```

#### Trading Conservador (menos riesgo)
```bash
STOP_LOSS_PERCENT=1.0 TAKE_PROFIT_PERCENT=3.0 RSI_LONG_MIN=60 RSI_SHORT_MAX=40 node bot.js
```

#### Timeframe Largo (menos ruido)
```bash
TIMEFRAME=5m STOP_LOSS_PERCENT=1.5 TAKE_PROFIT_PERCENT=3.0 node bot.js
```

## 📊 Archivo Excel

El bot exporta automáticamente todas las operaciones a `trading_log.xlsx` con:

| Columna | Descripción |
|---------|-------------|
| **ID** | Número de operación |
| **Fecha Entrada/Salida** | Timestamps de apertura/cierre |
| **Par** | Par de trading (BTC/USDT) |
| **Tipo** | LONG o SHORT |
| **Precio Entrada/Salida €** | Precios de entrada y salida |
| **Cantidad** | Cantidad de BTC operada |
| **Valor Entrada/Salida €** | Valor en euros |
| **Stop Loss/Take Profit €** | Niveles de riesgo |
| **PnL %/€** | Ganancia/pérdida |
| **Comisiones €** | Comisiones pagadas |
| **Balance Final €** | Balance después de la operación |
| **Tipo Salida** | STOP_LOSS, TAKE_PROFIT |
| **RSI/EMA Entrada** | Indicadores al momento de entrada |

## 🎮 Estados del Bot

### 🟢 Monitoreo Activo
- **Sin posición**: Buscando oportunidades de entrada
- **Logs cada minuto**: Precio, RSI, EMAs actuales
- **Esperando señal**: Cruce de EMAs + RSI adecuado

### 🟡 Posición Abierta
- **Monitoreando salida**: Verificando SL/TP cada 5 segundos
- **Sin nuevas entradas**: Solo una posición a la vez
- **Heartbeat cada 5min**: Confirmando estado

### 🔴 Cierre de Posición
- **Actualización de balance**: Suma/resta PnL
- **Exportación Excel**: Guarda operación completa
- **Vuelta a monitoreo**: Busca nueva oportunidad

## 🚨 Solución de Problemas

### Bot no muestra logs de monitoreo
```bash
# Verificar que verbose esté activado
VERBOSE=true node bot.js

# O cambiar configuración para más señales
RSI_LONG_MIN=45 RSI_SHORT_MAX=55 node bot.js
```

### Posiciones no se cierran
```bash
# Usar niveles más cercanos
STOP_LOSS_PERCENT=0.5 TAKE_PROFIT_PERCENT=1.0 node bot.js
```

### No hay señales de entrada
```bash
# RSI menos restrictivo + timeframe mayor
TIMEFRAME=5m RSI_LONG_MIN=50 RSI_SHORT_MAX=50 node bot.js
```

## 📁 Archivos Generados

- **`state.json`**: Estado persistente del bot (balance, posiciones, trades)
- **`trading_log.xlsx`**: Historial completo de operaciones
- **`package-lock.json`**: Dependencias bloqueadas

## ⚠️ Advertencias

- **Solo trading virtual**: No usa dinero real
- **Datos de KuCoin**: Requiere conexión a internet
- **Una posición**: Solo permite una operación simultánea
- **Backtesting**: Ideal para probar estrategias

## 🎯 Próximas Mejoras

- [ ] Múltiples pares de trading
- [ ] Estrategias adicionales (MACD, Bollinger Bands)
- [ ] Integración con exchanges reales
- [ ] Dashboard web en tiempo real
- [ ] Alertas por Telegram/Discord