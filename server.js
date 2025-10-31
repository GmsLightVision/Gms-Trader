import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// ✅ Obter __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importa o módulo do bot atualizado
import * as Bot from "./bot_r50_digitover.js";

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir arquivos estáticos
app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Mapa de clientes conectados
const clients = new Map();

// ✅ SISTEMA DE COMPATIBILIDADE AVANÇADO
const compatibilityState = {
    // Estado sincronizado com script.js
    isConnected: false,
    isBotRunning: false,
    autoTradingEnabled: false,
    
    // Configurações sincronizadas com bot_r50_digitover.js atualizado
    tradingConfig: {
        // Configurações básicas
        stake: 0.35,
        profitTarget: 100,
        stopLoss: 10999,
        currency: 'USD',
        tickLimit: 25,
        strategy: 'r50-bot',
        
        // Configurações específicas do Bot R50 DigitOver
        initial_stake: 0.35,
        stake_after_win: 0.35,
        martingale_factor: 2.2,
        prediction: 4,
        virtual_loss_limit: 2,
        meta: 100,
        stop_loss: 10999,
        cooldown_seconds: 2,
        market: "R_50",
        duration: 1,
        duration_unit: "t",
        
        // Novas configurações do bot atualizado
        app_id: "1089",
        max_trades: 0,
        trade_timeout: 60,
        balance_check: true,
        risk_management: true,
        max_reconnect_attempts: 5,
        auto_reconnect: true
    },
    
    // Trading goals
    tradingGoals: {
        profitTarget: 100,
        stopLoss: 10999,
        maxTrades: 0
    },
    
    // Estado do bot sincronizado com bot_r50_digitover.js atualizado
    botState: {
        initial_balance: null,
        last_balance: null,
        daily_pnl: 0,
        virtual_loss_counter: 0,
        current_stake: 0.35,
        trades_today: 0,
        last_trade_time: 0,
        last_result: "N/A",
        last_price: null,
        current_contract: null,
        shouldStop: false,
        
        // Novos estados do bot atualizado
        total_profit: 0,
        consecutive_losses: 0,
        consecutive_wins: 0,
        session_start_time: null,
        last_trade_profit: 0,
        trade_history: [],
        is_connected: false,
        is_running: false,
        reconnect_attempts: 0,
        is_reconnecting: false
    },
    
    // Estatísticas avançadas
    advancedStats: {
        winRate: 0,
        averageProfit: 0,
        bestTrade: 0,
        worstTrade: 0,
        totalTrades: 0,
        sessionDuration: 0,
        efficiency: 0
    }
};

// ✅ FUNÇÃO PARA SINCRONIZAR ESTADOS AVANÇADA
function syncBotState() {
    try {
        // Sincronizar estado principal do bot
        const botStatus = Bot.getBotStatus ? Bot.getBotStatus() : {};
        
        compatibilityState.isBotRunning = botStatus.isRunning || Bot.isRunning || false;
        compatibilityState.autoTradingEnabled = botStatus.isRunning || Bot.isRunning || false;
        compatibilityState.isConnected = botStatus.isConnected || false;
        
        // Sincronizar configurações atualizadas
        if (Bot.cfg) {
            compatibilityState.tradingConfig = { 
                ...compatibilityState.tradingConfig,
                ...Bot.cfg
            };
            
            // Sincronizar trading goals
            compatibilityState.tradingGoals.profitTarget = Bot.cfg.meta || 100;
            compatibilityState.tradingGoals.stopLoss = Bot.cfg.stop_loss || 10999;
            compatibilityState.tradingGoals.maxTrades = Bot.cfg.max_trades || 0;
        }
        
        // Sincronizar estado do bot atualizado
        if (Bot.state) {
            compatibilityState.botState = { 
                ...compatibilityState.botState,
                ...Bot.state,
                isRunning: compatibilityState.isBotRunning,
                shouldStop: !compatibilityState.isBotRunning
            };
            
            // Calcular estatísticas avançadas
            calculateAdvancedStats();
        }
        
        // Log de sincronização (apenas se houver mudanças significativas)
        if (compatibilityState.isBotRunning) {
            console.log('🔄 Estado sincronizado:', {
                isRunning: compatibilityState.isBotRunning,
                balance: compatibilityState.botState.last_balance,
                virtualLoss: compatibilityState.botState.virtual_loss_counter,
                totalProfit: compatibilityState.botState.total_profit,
                consecutiveWins: compatibilityState.botState.consecutive_wins
            });
        }
        
    } catch (error) {
        console.error("❌ Erro na sincronização de estado:", error);
    }
}

// ✅ FUNÇÃO PARA CALCULAR ESTATÍSTICAS AVANÇADAS
function calculateAdvancedStats() {
    try {
        const state = compatibilityState.botState;
        const stats = compatibilityState.advancedStats;
        
        // Calcular win rate
        if (state.trades_today > 0) {
            stats.winRate = Math.round((state.consecutive_wins / state.trades_today) * 100);
        }
        
        // Calcular profit médio
        if (state.trades_today > 0) {
            stats.averageProfit = state.total_profit / state.trades_today;
        }
        
        // Encontrar melhor e pior trade
        if (state.trade_history && state.trade_history.length > 0) {
            const profits = state.trade_history.map(trade => trade.profit || 0);
            stats.bestTrade = Math.max(...profits);
            stats.worstTrade = Math.min(...profits);
        }
        
        // Calcular duração da sessão
        if (state.session_start_time) {
            stats.sessionDuration = Math.round((Date.now() - state.session_start_time) / 60000); // minutos
        }
        
        // Calcular eficiência (baseada em win rate e profit)
        stats.efficiency = Math.min(100, (stats.winRate * 0.7) + (Math.max(0, stats.averageProfit) * 3));
        stats.totalTrades = state.trades_today;
        
    } catch (error) {
        console.error("❌ Erro ao calcular estatísticas:", error);
    }
}

// ✅ MIDDLEWARE DE COMPATIBILIDADE
app.use((req, res, next) => {
    syncBotState();
    next();
});

// --- Rotas básicas ---
app.get("/", (req, res) => {
    res.sendFile("index.html", { root: "public" });
});

// ✅ ROTA: Status completo para compatibilidade
app.get("/api/status", (req, res) => {
    syncBotState();
    res.json({
        status: "online",
        server: {
            clients: clients.size,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: Date.now()
        },
        compatibilityState,
        botState: Bot.state || {},
        botConfig: Bot.cfg || {},
        running: compatibilityState.isBotRunning,
        advancedStats: compatibilityState.advancedStats
    });
});

// ✅ ROTA: Configurações para compatibilidade
app.get("/api/config", (req, res) => {
    syncBotState();
    res.json({
        tradingConfig: compatibilityState.tradingConfig,
        tradingGoals: compatibilityState.tradingGoals,
        botState: compatibilityState.botState,
        isBotRunning: compatibilityState.isBotRunning,
        advancedStats: compatibilityState.advancedStats
    });
});

// ✅ ROTA: Atualizar configurações
app.post("/api/update-config", (req, res) => {
    try {
        const { tradingConfig, tradingGoals } = req.body;
        
        if (tradingConfig) {
            Object.assign(compatibilityState.tradingConfig, tradingConfig);
            
            // Sincronizar com bot_r50_digitover.js atualizado
            if (Bot.cfg) {
                Object.assign(Bot.cfg, tradingConfig);
            }
        }
        
        if (tradingGoals) {
            Object.assign(compatibilityState.tradingGoals, tradingGoals);
        }
        
        console.log("✅ Configurações atualizadas via API:", {
            stake: tradingConfig?.initial_stake,
            meta: tradingConfig?.meta,
            stopLoss: tradingConfig?.stop_loss,
            martingale: tradingConfig?.martingale_factor
        });
        
        // Broadcast para todos os clientes
        io.emit("compatibility_state", compatibilityState);
        io.emit("config_updated", { config: compatibilityState.tradingConfig });
        
        res.json({ success: true, message: "Configurações atualizadas" });
        
    } catch (error) {
        console.error("❌ Erro ao atualizar configurações:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ ROTA: Controle do bot via HTTP
app.post("/api/bot-control", async (req, res) => {
    try {
        const { action } = req.body;
        
        if (action === 'start') {
            await Bot.startBot();
            compatibilityState.isBotRunning = true;
            compatibilityState.autoTradingEnabled = true;
            
            console.log("🚀 Bot iniciado via API HTTP");
            
            // Broadcast para todos os clientes
            io.emit("bot_status", "started");
            io.emit("compatibility_state", compatibilityState);
            io.emit("advanced_stats", compatibilityState.advancedStats);
            
            res.json({ 
                success: true, 
                message: "Bot iniciado",
                state: compatibilityState.botState
            });
        } 
        else if (action === 'stop') {
            await Bot.stopBot();
            compatibilityState.isBotRunning = false;
            compatibilityState.autoTradingEnabled = false;
            
            console.log("🛑 Bot parado via API HTTP");
            
            // Broadcast para todos os clientes
            io.emit("bot_status", "stopped");
            io.emit("compatibility_state", compatibilityState);
            io.emit("advanced_stats", compatibilityState.advancedStats);
            
            res.json({ 
                success: true, 
                message: "Bot parado",
                state: compatibilityState.botState
            });
        }
        else if (action === 'pause') {
            if (Bot.pauseBot) {
                Bot.pauseBot();
                compatibilityState.autoTradingEnabled = false;
                
                console.log("⏸️ Bot pausado via API HTTP");
                
                io.emit("bot_status", "paused");
                io.emit("compatibility_state", compatibilityState);
                
                res.json({ success: true, message: "Bot pausado" });
            } else {
                res.status(400).json({ success: false, error: "Função pause não disponível" });
            }
        }
        else if (action === 'resume') {
            if (Bot.resumeBot) {
                Bot.resumeBot();
                compatibilityState.autoTradingEnabled = true;
                
                console.log("▶️ Bot retomado via API HTTP");
                
                io.emit("bot_status", "resumed");
                io.emit("compatibility_state", compatibilityState);
                
                res.json({ success: true, message: "Bot retomado" });
            } else {
                res.status(400).json({ success: false, error: "Função resume não disponível" });
            }
        }
        else if (action === 'toggle') {
            if (Bot.toggleR50Bot) {
                await Bot.toggleR50Bot();
                syncBotState();
                
                console.log("🔄 Bot alternado via API HTTP");
                
                io.emit("bot_status", compatibilityState.isBotRunning ? "started" : "stopped");
                io.emit("compatibility_state", compatibilityState);
                io.emit("advanced_stats", compatibilityState.advancedStats);
                
                res.json({ 
                    success: true, 
                    message: `Bot ${compatibilityState.isBotRunning ? 'iniciado' : 'parado'}`,
                    isRunning: compatibilityState.isBotRunning
                });
            } else {
                res.status(400).json({ success: false, error: "Função toggle não disponível" });
            }
        }
        else {
            res.status(400).json({ success: false, error: "Ação inválida" });
        }
        
    } catch (error) {
        console.error("❌ Erro no controle do bot:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ ROTA: Resetar estado do bot
app.post("/api/reset-bot", async (req, res) => {
    try {
        if (Bot.resetBot) {
            await Bot.resetBot();
            syncBotState();
            
            console.log("🔄 Bot resetado via API HTTP");
            
            // Broadcast para todos os clientes
            io.emit("bot_state", compatibilityState.botState);
            io.emit("compatibility_state", compatibilityState);
            io.emit("advanced_stats", compatibilityState.advancedStats);
            io.emit("bot_reset", { success: true });
            
            res.json({ success: true, message: "Estado do bot resetado" });
        } else {
            res.status(400).json({ success: false, error: "Função reset não disponível" });
        }
        
    } catch (error) {
        console.error("❌ Erro ao resetar bot:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ ROTA: Estatísticas avançadas
app.get("/api/advanced-stats", (req, res) => {
    syncBotState();
    calculateAdvancedStats();
    
    res.json({
        success: true,
        stats: compatibilityState.advancedStats,
        botState: compatibilityState.botState,
        timestamp: Date.now()
    });
});

// ✅ ROTA: Histórico de trades
app.get("/api/trade-history", (req, res) => {
    syncBotState();
    
    const history = compatibilityState.botState.trade_history || [];
    const limit = parseInt(req.query.limit) || 50;
    
    res.json({
        success: true,
        history: history.slice(0, limit),
        total: history.length,
        timestamp: Date.now()
    });
});

// ✅ ROTA: Logs do sistema
app.get("/api/logs", (req, res) => {
    try {
        const logsDir = path.join(__dirname, 'logs');
        const tradeLogPath = path.join(logsDir, 'trades.log');
        
        if (fs.existsSync(tradeLogPath)) {
            const logs = fs.readFileSync(tradeLogPath, 'utf8');
            const logLines = logs.split('\n').filter(line => line.trim()).slice(-100);
            res.json({ success: true, logs: logLines.reverse() });
        } else {
            res.json({ success: true, logs: [] });
        }
    } catch (error) {
        console.error("❌ Erro ao ler logs:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ ROTA: Backup do sistema
app.get("/api/backup", (req, res) => {
    try {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            return res.json({ success: true, backups: [] });
        }
        
        const files = fs.readdirSync(backupDir)
            .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, 10);
        
        const backups = files.map(file => {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                created: stats.birthtime,
                path: filePath
            };
        });
        
        res.json({ success: true, backups });
    } catch (error) {
        console.error("❌ Erro ao listar backups:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check
app.get("/health", (req, res) => {
    syncBotState();
    res.json({
        status: "online",
        server: {
            clients: clients.size,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        },
        compatibilityState: {
            isBotRunning: compatibilityState.isBotRunning,
            autoTradingEnabled: compatibilityState.autoTradingEnabled,
            tradingGoals: compatibilityState.tradingGoals
        },
        botState: {
            last_balance: compatibilityState.botState.last_balance,
            virtual_loss_counter: compatibilityState.botState.virtual_loss_counter,
            current_stake: compatibilityState.botState.current_stake,
            last_result: compatibilityState.botState.last_result,
            trades_today: compatibilityState.botState.trades_today,
            total_profit: compatibilityState.botState.total_profit
        },
        advancedStats: compatibilityState.advancedStats,
        timestamp: Date.now()
    });
});

// --- Socket.IO ---
io.on("connection", (socket) => {
    console.log("✅ Cliente conectado:", socket.id);
    clients.set(socket.id, { 
        connectedAt: new Date(),
        compatibility: true,
        userAgent: socket.handshake.headers['user-agent']
    });

    // ✅ SINCRONIZAR ESTADO INICIAL COMPLETO
    syncBotState();
    
    // Envia o estado atual completo
    socket.emit("bot_state", compatibilityState.botState);
    socket.emit("bot_status", compatibilityState.isBotRunning ? "started" : "stopped");
    socket.emit("compatibility_state", compatibilityState);
    socket.emit("config_data", compatibilityState.tradingConfig);
    socket.emit("advanced_stats", compatibilityState.advancedStats);

    console.log(`📊 Estado enviado para ${socket.id}:`, {
        botRunning: compatibilityState.isBotRunning,
        clients: clients.size,
        totalProfit: compatibilityState.botState.total_profit
    });

    // ✅ START BOT - COMPATÍVEL
    socket.on("start_bot", async () => {
        try {
            console.log("➡️ Iniciando bot via front-end...");
            await Bot.startBot();
            
            syncBotState();
            
            // ✅ BROADCAST PARA TODOS OS CLIENTES
            io.emit("bot_status", "started");
            io.emit("bot_state", compatibilityState.botState);
            io.emit("compatibility_state", compatibilityState);
            io.emit("advanced_stats", compatibilityState.advancedStats);
            
            console.log("✅ Bot iniciado com sincronização completa");
            
        } catch (err) {
            console.error("Erro ao iniciar bot:", err);
            socket.emit("bot_error", { message: err.message || "Falha ao iniciar bot" });
        }
    });

    // ✅ STOP BOT - COMPATÍVEL
    socket.on("stop_bot", async () => {
        try {
            console.log("⏹ Parando bot via front-end...");
            await Bot.stopBot();
            
            syncBotState();
            
            // ✅ BROADCAST PARA TODOS OS CLIENTES
            io.emit("bot_status", "stopped");
            io.emit("bot_state", compatibilityState.botState);
            io.emit("compatibility_state", compatibilityState);
            io.emit("advanced_stats", compatibilityState.advancedStats);
            
            console.log("✅ Bot parado com sincronização completa");
            
        } catch (err) {
            console.error("Erro ao parar bot:", err);
            socket.emit("bot_error", { message: err.message || "Falha ao parar bot" });
        }
    });

    // ✅ TOGGLE BOT - NOVA FUNÇÃO
    socket.on("toggle_bot", async () => {
        try {
            console.log("🔄 Alternando bot via front-end...");
            
            if (Bot.toggleR50Bot) {
                await Bot.toggleR50Bot();
                syncBotState();
                
                const status = compatibilityState.isBotRunning ? "started" : "stopped";
                
                io.emit("bot_status", status);
                io.emit("bot_state", compatibilityState.botState);
                io.emit("compatibility_state", compatibilityState);
                io.emit("advanced_stats", compatibilityState.advancedStats);
                
                console.log(`✅ Bot ${status} via toggle`);
            } else {
                socket.emit("bot_error", { message: "Função toggle não disponível" });
            }
            
        } catch (err) {
            console.error("Erro ao alternar bot:", err);
            socket.emit("bot_error", { message: err.message || "Falha ao alternar bot" });
        }
    });

    // ✅ ATUALIZAR CONFIG - COMPATÍVEL
    socket.on("update_cfg", (newCfg) => {
        try {
            Object.assign(compatibilityState.tradingConfig, newCfg);
            
            // Sincronizar com bot_r50_digitover.js
            if (Bot.cfg) {
                Object.assign(Bot.cfg, newCfg);
            }
            
            console.log("⚙️ Configuração atualizada:", newCfg);
            
            // ✅ BROADCAST PARA TODOS OS CLIENTES
            io.emit("config_updated", { config: compatibilityState.tradingConfig });
            io.emit("compatibility_state", compatibilityState);
            
        } catch (err) {
            console.error("Erro ao atualizar configuração:", err);
            socket.emit("bot_error", { message: "Falha ao atualizar configuração" });
        }
    });

    // ✅ ATUALIZAR CONFIGURAÇÕES DE TRADING
    socket.on("update_trading_config", (config) => {
        try {
            if (config.tradingConfig) {
                Object.assign(compatibilityState.tradingConfig, config.tradingConfig);
                
                // Sincronizar com bot_r50_digitover.js
                if (Bot.cfg) {
                    Object.assign(Bot.cfg, config.tradingConfig);
                }
            }
            
            if (config.tradingGoals) {
                Object.assign(compatibilityState.tradingGoals, config.tradingGoals);
            }
            
            console.log("✅ Configurações de trading atualizadas via Socket");
            
            // ✅ BROADCAST PARA TODOS OS CLIENTES
            socket.emit("trading_config_updated", { success: true });
            io.emit("compatibility_state", compatibilityState);
            
        } catch (error) {
            console.error("❌ Erro ao atualizar trading config:", error);
            socket.emit("bot_error", { message: "Falha ao atualizar configurações de trading" });
        }
    });

    // ✅ GET STATE - COMPATÍVEL
    socket.on("get_state", () => {
        syncBotState();
        socket.emit("bot_state", compatibilityState.botState);
        socket.emit("compatibility_state", compatibilityState);
        socket.emit("advanced_stats", compatibilityState.advancedStats);
    });

    // ✅ GET CONFIG - COMPATÍVEL
    socket.on("get_config", () => {
        syncBotState();
        socket.emit("config_data", compatibilityState.tradingConfig);
        socket.emit("compatibility_state", compatibilityState);
    });

    // ✅ GET COMPATIBILITY STATE
    socket.on("get_compatibility_state", () => {
        syncBotState();
        socket.emit("compatibility_state", compatibilityState);
    });

    // ✅ GET ADVANCED STATS
    socket.on("get_advanced_stats", () => {
        syncBotState();
        calculateAdvancedStats();
        socket.emit("advanced_stats", compatibilityState.advancedStats);
    });

    // ✅ RESET BOT STATE
    socket.on("reset_bot_state", async () => {
        try {
            if (Bot.resetBot) {
                await Bot.resetBot();
                syncBotState();
                
                console.log("🔄 Estado do bot resetado via Socket");
                
                // ✅ BROADCAST PARA TODOS OS CLIENTES
                io.emit("bot_state", compatibilityState.botState);
                io.emit("compatibility_state", compatibilityState);
                io.emit("advanced_stats", compatibilityState.advancedStats);
                socket.emit("bot_reset", { success: true });
                
            } else {
                socket.emit("bot_error", { message: "Função reset não disponível" });
            }
            
        } catch (error) {
            console.error("❌ Erro ao resetar estado:", error);
            socket.emit("bot_error", { message: "Falha ao resetar estado do bot" });
        }
    });

    // ✅ GET SERVER STATS
    socket.on("get_server_stats", () => {
        syncBotState();
        const stats = {
            clients: clients.size,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            compatibilityState: {
                isBotRunning: compatibilityState.isBotRunning,
                autoTradingEnabled: compatibilityState.autoTradingEnabled
            },
            botState: {
                last_balance: compatibilityState.botState.last_balance,
                virtual_loss_counter: compatibilityState.botState.virtual_loss_counter,
                trades_today: compatibilityState.botState.trades_today,
                total_profit: compatibilityState.botState.total_profit
            },
            advancedStats: compatibilityState.advancedStats,
            timestamp: Date.now()
        };
        socket.emit("server_stats", stats);
    });

    // ✅ GET TRADE HISTORY
    socket.on("get_trade_history", (data) => {
        syncBotState();
        const limit = data?.limit || 50;
        const history = compatibilityState.botState.trade_history || [];
        
        socket.emit("trade_history", {
            history: history.slice(0, limit),
            total: history.length,
            timestamp: Date.now()
        });
    });

    // --- Heartbeat ---
    socket.on("ping", () => socket.emit("pong", { timestamp: Date.now() }));

    // ✅ ATUALIZAÇÃO PERIÓDICA EXPANDIDA
    const stateInterval = setInterval(() => {
        if (socket.connected) {
            syncBotState();
            socket.emit("bot_state", compatibilityState.botState);
            socket.emit("compatibility_state", compatibilityState);
            socket.emit("server_time", { timestamp: Date.now() });
            
            // Enviar estatísticas avançadas a cada 5 segundos
            if (Date.now() % 5000 < 100) {
                calculateAdvancedStats();
                socket.emit("advanced_stats", compatibilityState.advancedStats);
            }
        }
    }, 1000);

    socket.on("disconnect", (reason) => {
        clearInterval(stateInterval);
        clients.delete(socket.id);
        console.log("❌ Cliente desconectado:", socket.id, "Motivo:", reason);
        console.log("📊 Clientes restantes:", clients.size);
    });
});

// ✅ SISTEMA DE SINCRONIZAÇÃO AUTOMÁTICA
setInterval(() => {
    syncBotState();
    
    // Broadcast do estado para todos os clientes
    io.emit("compatibility_state", compatibilityState);
    io.emit("bot_state", compatibilityState.botState);
    
    // Calcular e enviar estatísticas avançadas
    calculateAdvancedStats();
    io.emit("advanced_stats", compatibilityState.advancedStats);
    
    // Log periódico do estado
    if (clients.size > 0 && compatibilityState.isBotRunning) {
        console.log('📡 Sincronização automática:', {
            clients: clients.size,
            botRunning: compatibilityState.isBotRunning,
            balance: compatibilityState.botState.last_balance,
            totalProfit: compatibilityState.botState.total_profit,
            winRate: compatibilityState.advancedStats.winRate
        });
    }
}, 3000);

// ✅ SISTEMA DE BACKUP AUTOMÁTICO
setInterval(() => {
    try {
        syncBotState();
        calculateAdvancedStats();
        
        // Criar backup do estado
        const backup = {
            compatibilityState,
            botState: Bot.state,
            botConfig: Bot.cfg,
            advancedStats: compatibilityState.advancedStats,
            timestamp: new Date().toISOString()
        };
        
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        const backupFile = path.join(backupDir, `backup-${Date.now()}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        
        // Manter apenas os últimos 10 backups
        const files = fs.readdirSync(backupDir)
            .filter(file => file.startsWith('backup-'))
            .sort()
            .reverse();
        
        if (files.length > 10) {
            for (let i = 10; i < files.length; i++) {
                fs.unlinkSync(path.join(backupDir, files[i]));
            }
        }
        
        console.log('💾 Backup automático criado');
        
    } catch (error) {
        console.error('❌ Erro no backup automático:', error);
    }
}, 60000);

// --- Middleware global de erros ---
app.use((err, req, res, next) => {
    console.error("Erro no servidor:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
});

// ✅ MIDDLEWARE DE LOGGING
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// --- Fechamento limpo ---
const gracefulShutdown = (signal) => {
    console.log(`\n⚠️ Recebido ${signal}, encerrando servidor...`);
    
    // ✅ PARAR BOT ANTES DE ENCERRAR
    if (compatibilityState.isBotRunning && Bot.stopBot) {
        console.log("🛑 Parando bot antes do encerramento...");
        Bot.stopBot().catch(console.error);
    }
    
    // ✅ NOTIFICAR CLIENTES
    io.emit("server_shutdown", { 
        message: "Servidor está sendo encerrado", 
        timestamp: Date.now() 
    });
    
    // ✅ AGUARDAR CLIENTES DESCONECTAREM
    setTimeout(() => {
        server.close(() => {
            console.log("✅ Servidor encerrado com segurança.");
            process.exit(0);
        });
    }, 2000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ✅ TRATAMENTO DE EXCEÇÕES NÃO CAPTURADAS
process.on('uncaughtException', (error) => {
    console.error('❌ Exceção não capturada:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Rejeição não tratada em:', promise, 'motivo:', reason);
});

// --- Inicialização ---
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
    console.log(`⚙️ API Config: http://localhost:${PORT}/api/config`);
    console.log(`🔄 API Control: http://localhost:${PORT}/api/bot-control`);
    console.log(`📈 API Stats: http://localhost:${PORT}/api/advanced-stats`);
    console.log(`📋 API Logs: http://localhost:${PORT}/api/logs`);
    console.log(`💾 API Backup: http://localhost:${PORT}/api/backup`);
    
    // ✅ INICIALIZAR ESTADO DE COMPATIBILIDADE
    syncBotState();
    console.log("✅ Sistema de compatibilidade inicializado");
    console.log("🤖 Estado inicial do bot:", {
        isRunning: compatibilityState.isBotRunning,
        balance: compatibilityState.botState.last_balance,
        totalProfit: compatibilityState.botState.total_profit
    });
});

// ✅ FUNÇÃO PARA VERIFICAR DEPENDÊNCIAS
function checkDependencies() {
    try {
        if (!Bot) {
            throw new Error("Módulo do bot não carregado");
        }
        
        // Verificar funções disponíveis
        const availableFunctions = [];
        if (Bot.startBot) availableFunctions.push('startBot');
        if (Bot.stopBot) availableFunctions.push('stopBot');
        if (Bot.toggleR50Bot) availableFunctions.push('toggleR50Bot');
        if (Bot.resetBot) availableFunctions.push('resetBot');
        if (Bot.pauseBot) availableFunctions.push('pauseBot');
        if (Bot.resumeBot) availableFunctions.push('resumeBot');
        if (Bot.getBotStatus) availableFunctions.push('getBotStatus');
        
        console.log("✅ Dependências verificadas:");
        console.log("📋 Funções disponíveis:", availableFunctions.join(', '));
        console.log("⚙️ Configurações carregadas:", Bot.cfg ? 'Sim' : 'Não');
        console.log("🔄 Estado carregado:", Bot.state ? 'Sim' : 'Não');
        
    } catch (error) {
        console.error("❌ Erro na verificação de dependências:", error);
    }
}

// ✅ EXECUTAR VERIFICAÇÃO DE DEPENDÊNCIAS
setTimeout(checkDependencies, 1000);

console.log("🔌 Socket.IO configurado para tempo real");
console.log("📡 Sistema de compatibilidade avançado ativo");
console.log("💾 Sistema de backup automático ativado");
console.log("📈 Estatísticas avançadas habilitadas");