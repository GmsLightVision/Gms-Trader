// ===== SISTEMA PRINCIPAL =====
let wsConnection = null;
let isConnected = false;
let currentToken = '';
let isTrading = false;
let currentStrategy = 'r50-bot';

// ===== SISTEMA DE RECONEXÃO AUTOMÁTICA =====
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectInterval = 0; // 5 segundos
let autoReconnect = true;
let isReconnecting = false;

// Configurações do Bot R50 (Unificadas com bot_r50_digitover.js)
let tradingConfig = {
    stake: 0.35,
    profitTarget: 100,
    stopLoss: 10999,
    currency: 'USD',
    tickLimit: 25,
    strategy: 'r50-bot',
    
    // Configurações específicas do Bot R50 (Sincronizadas)
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
    reconnect_base_ms: 2000,
    reconnect_max_ms: 60000
};

// Sistema de ticks
let digitCounts = Array(10).fill(0);
let totalTicks = 0;
let tickHistory = [];
let priceHistory = [];
let digitSequence = [];
let lastDigitsHistory = [];
let maxTicks = 25;
let maxSequenceLength = 10;
let maxLastDigits = 20;

// ===== SISTEMA DO BOT R50 AUTOMÁTICO =====
let isBotRunning = false;
let botWebSocket = null;
let pendingBotRequests = new Map();
let botClientIdCounter = 1;

// Estado do bot R50 (Unificado com bot_r50_digitover.js)
let botState = {
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
    shouldStop: false
};

// ===== SISTEMA DE GRÁFICO SVG DINÂMICO =====
let chartData = [];
let chartWidth = 396;
let chartHeight = 246;
let margin = { top: 20, right: 20, bottom: 30, left: 50 };
let maxDataPoints = 50;

// Elementos principais
const loginModal = document.getElementById('loginModal');
const configModal = document.getElementById('configModal');
const loginButton = document.getElementById('loginButton');
const closeLoginModal = document.getElementById('closeLoginModal');
const closeConfigModal = document.getElementById('closeConfigModal');
const cancelLogin = document.getElementById('cancelLogin');
const cancelConfig = document.getElementById('cancelConfig');
const saveConfig = document.getElementById('saveConfig');
const apiTokenInput = document.getElementById('apiTokenInput');
const connectionStatus = document.getElementById('connection-status');
const connectionText = document.getElementById('connection-text');
const realDataIndicator = document.getElementById('realDataIndicator');
const startTradingButton = document.getElementById('startTradingButton');
const stopTradingButton = document.getElementById('stopTradingButton');
const configButton = document.getElementById('configButton');
const resetTradesButton = document.getElementById('resetTradesButton');
const tradingTimeline = document.getElementById('tradingTimeline');
const digitSequenceElement = document.getElementById('digitSequence');
const currentPriceElement = document.getElementById('currentPrice');
const lastDigitsContainer = document.getElementById('lastDigitsContainer');

// ===== SISTEMA DE RECONEXÃO AUTOMÁTICA =====

// Verificar se WebSocket está conectado
function isWebSocketConnected() {
    return wsConnection && wsConnection.readyState === WebSocket.OPEN;
}

// Sistema de reconexão automática
function scheduleReconnect() {
    if (!autoReconnect || reconnectAttempts >= maxReconnectAttempts) {
        console.log('🛑 Reconexão automática desativada ou tentativas esgotadas');
        return;
    }

    if (isReconnecting) return;
    
    isReconnecting = true;
    reconnectAttempts++;
    
    const delay = Math.min(reconnectInterval * reconnectAttempts, 30000); // Máximo 30 segundos
    
    console.log(`🔄 Tentativa ${reconnectAttempts}/${maxReconnectAttempts} em ${delay/10}s...`);
    appendTradeLog(`🔄 Reconectando em ${delay/10} segundos... (${reconnectAttempts}/${maxReconnectAttempts})`, 'warning');
    
    setTimeout(() => {
        if (currentToken && !isWebSocketConnected()) {
            console.log('🔄 Iniciando reconexão automática...');
            reconnectToDeriv();
        } else {
            isReconnecting = false;
        }
    }, delay);
}

// Reconectar à Deriv
async function reconnectToDeriv() {
    if (!currentToken) {
        console.log('❌ Token não disponível para reconexão');
        isReconnecting = false;
        return;
    }

    try {
        updateConnectionStatus('connecting', '🔄 Reconectando...');
        
        await connectToDeriv(currentToken, document.getElementById('account-type-display').textContent === 'Conta Real' ? 'real' : 'demo');
        
        // ✅ RECONEXÃO BEM-SUCEDIDA
        reconnectAttempts = 0;
        isReconnecting = false;
        autoReconnect = true;
        
        console.log('✅ Reconexão realizada com sucesso!');
        appendTradeLog('✅ Conexão restaurada! Bot continuará operando.', 'success');
        
        // Reativar bot se estava rodando antes
        if (isBotRunning) {
            setTimeout(() => {
                startR50Bot();
            }, 2000);
        }
        
    } catch (error) {
        console.error('❌ Falha na reconexão:', error);
        isReconnecting = false;
        
        // Agendar nova tentativa
        if (reconnectAttempts < maxReconnectAttempts) {
            scheduleReconnect();
        } else {
            appendTradeLog('🛑 Falha na reconexão. Clique em "Conectar" para tentar novamente.', 'error');
            updateConnectionStatus('disconnected', 'Falha na conexão');
        }
    }
}

// Monitorar conexão periodicamente
function startConnectionMonitor() {
    setInterval(() => {
        if (isConnected && !isWebSocketConnected()) {
            console.log('⚠️ Conexão perdida detectada pelo monitor');
            isConnected = false;
            updateConnectionStatus('disconnected');
            scheduleReconnect();
        }
    }, 10000); // Verificar a cada 10 segundos
}

// ===== FUNÇÕES DO BOT R50 (CORRIGIDAS) =====

// Carregar configurações salvas
function loadPersistentConfig() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const savedConfig = localStorage.getItem('r50_bot_config');
            const savedState = localStorage.getItem('r50_bot_state');
            
            if (savedConfig) {
                const loadedConfig = JSON.parse(savedConfig);
                Object.assign(tradingConfig, loadedConfig);
            }
            if (savedState) {
                const loadedState = JSON.parse(savedState);
                Object.assign(botState, loadedState);
            }
            console.log('✅ Configurações do bot carregadas');
        }
    } catch (e) {
        console.warn('Não foi possível carregar configurações salvas:', e);
    }
}

// Salvar configurações
function savePersistentConfig() {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('r50_bot_config', JSON.stringify(tradingConfig));
            localStorage.setItem('r50_bot_state', JSON.stringify(botState));
        }
    } catch (e) {
        console.warn('Não foi possível salvar configurações:', e);
    }
}

// Sistema de logs melhorado
function appendTradeLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logEntry = `[${timestamp}] ${message}`;
    
    console.log(`📝 ${logEntry}`);
    
    // Adicionar à interface
    addNotification(message, type);
    
    // Salvar em localStorage para persistência
    try {
        const logs = JSON.parse(localStorage.getItem('trade_logs') || '[]');
        logs.unshift({ timestamp: new Date().toISOString(), message, type });
        if (logs.length > 1000) logs.pop();
        localStorage.setItem('trade_logs', JSON.stringify(logs));
    } catch (e) {
        console.warn('Não foi possível salvar log:', e);
    }
}

// Controle via interface - CORRIGIDO
function readControlStatus() {
    return isBotRunning && isConnected && !botState.shouldStop;
}

// Verificar se pode operar - CORRIGIDO
function canBotTrade() {
    // ✅ VERIFICAR CONEXÃO PRIMEIRO
    if (!isConnected || !isWebSocketConnected()) {
        console.log('⚠️ Bot não pode operar: WebSocket desconectado');
        return false;
    }
    
    if (!readControlStatus()) {
        return false;
    }
    
    const now = Date.now();
    if (now - (botState.last_trade_time || 0) < (tradingConfig.cooldown_seconds * 1000)) {
        return false;
    }
    
    // Verificar se há contrato em andamento
    if (botState.current_contract) {
        return false;
    }
    
    // Verificar meta e stop loss (Lógica unificada)
    const currentBalance = parseFloat(document.querySelector('.app_balance v')?.textContent || 0);
    const initialBalance = botState.initial_balance || currentBalance;
    const pnl = currentBalance - initialBalance;
    
    if (tradingConfig.meta && pnl >= tradingConfig.meta) {
        appendTradeLog(`🎯 META atingida (PNL=${pnl.toFixed(2)} ≥ ${tradingConfig.meta}) — pausando.`, 'success');
        stopR50Bot();
        return false;
    }
    
    if (tradingConfig.stop_loss && pnl <= -Math.abs(tradingConfig.stop_loss)) {
        appendTradeLog(`🛑 STOP-LOSS atingido (PNL=${pnl.toFixed(2)} ≤ -${tradingConfig.stop_loss}) — pausando.`, 'error');
        stopR50Bot();
        return false;
    }
    
    return true;
}

// Gerar ID único para requests
function makeBotClientId() {
    return `bot_${Date.now()}_${botClientIdCounter++}`;
}

// Enviar request para API Deriv
function sendBotRequest(wsocket, payload, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const client_id = makeBotClientId();
        payload.passthrough = { client_id };
        
        pendingBotRequests.set(client_id, { resolve, reject });
        
        try {
            wsocket.send(JSON.stringify(payload));
        } catch (e) {
            pendingBotRequests.delete(client_id);
            return reject(e);
        }
        
        const timer = setTimeout(() => {
            if (pendingBotRequests.has(client_id)) {
                pendingBotRequests.delete(client_id);
                reject(new Error("Timeout na resposta API"));
            }
        }, timeout);
        
        pendingBotRequests.set(client_id, { 
            resolve: (msg) => { clearTimeout(timer); resolve(msg); }, 
            reject: (err) => { clearTimeout(timer); reject(err); } 
        });
    });
}

// Roteamento de mensagens recebidas
function routeIncomingMessage(msg) {
    const pt = msg.passthrough;
    if (pt && pt.client_id) {
        const pending = pendingBotRequests.get(pt.client_id);
        if (pending) { 
            pending.resolve(msg); 
            pendingBotRequests.delete(pt.client_id); 
            return true;
        }
    }
    return false;
}

// Aguardar resultado do contrato - CORRIGIDO
async function waitContractResult(contract_id, pollInterval = 1000) {
    let attempts = 0;
    const maxAttempts = 60;
    
    appendTradeLog(`⏳ Monitorando contrato ${contract_id}...`, 'info');
    
    while (attempts < maxAttempts && !botState.shouldStop) {
        try {
            const resp = await sendBotRequest(wsConnection, { 
                proposal_open_contract: 1, 
                contract_id 
            }, 5000);
            
            if (resp && resp.proposal_open_contract) {
                const data = resp.proposal_open_contract;
                
                if (data.is_sold === true || data.is_sold === 1 || (data.is_expired && !data.is_sold)) {
                    const profit = typeof data.profit !== "undefined" ? 
                        Number(data.profit) : 
                        (Number(data.sell_price || 0) - Number(data.buy_price || 0));
                    return { 
                        profit,
                        status: data.status,
                        sell_price: data.sell_price,
                        buy_price: data.buy_price,
                        is_sold: data.is_sold
                    };
                }
                
                if (attempts % 10 === 0) {
                    appendTradeLog(`📊 Contrato ainda aberto... (${attempts + 1}/${maxAttempts})`, 'info');
                }
            }
            
            await new Promise(r => setTimeout(r, pollInterval));
            attempts++;
            
        } catch (error) {
            console.warn('Erro ao verificar contrato:', error);
            await new Promise(r => setTimeout(r, pollInterval));
            attempts++;
        }
    }
    
    if (botState.shouldStop) {
        throw new Error('Bot parado durante a espera do contrato');
    } else {
        throw new Error('Timeout aguardando resultado do contrato');
    }
}

// 🎯 FUNÇÃO PRINCIPAL DO BOT R50 - CORRIGIDA
async function processR50Strategy(digit, price) {
    if (!isBotRunning || botState.shouldStop) return;
    
    botState.last_price = price;
    savePersistentConfig();
    
    // Lógica de perda virtual (Compatível com bot_r50_digitover.js)
    if (digit <= tradingConfig.prediction) {
        botState.virtual_loss_counter++;
        if (botState.virtual_loss_counter > 0) {
            appendTradeLog(`📉 Perda Virtual: ${botState.virtual_loss_counter}/${tradingConfig.virtual_loss_limit}`, 'warning');
        }
    } else {
        botState.virtual_loss_counter = 0;
    }
    
    if (botState.virtual_loss_counter > tradingConfig.virtual_loss_limit) {
        appendTradeLog(`🔄 Reiniciando contador de perda virtual (${botState.virtual_loss_counter})`, 'warning');
        botState.virtual_loss_counter = 0;
        savePersistentConfig();
    }
    
    if (!canBotTrade()) return;
    
    // ✅ CORREÇÃO: Lógica de Martingale compatível
    let stake = botState.current_stake || tradingConfig.initial_stake;
    if (botState.last_result === "LOSS") {
        stake = stake * tradingConfig.martingale_factor;
        appendTradeLog(`📈 Aplicando Martingale: ${stake.toFixed(2)}`, 'info');
    } else {
        stake = tradingConfig.stake_after_win; // ✅ Usa stake_after_win após win
    }
    
    // Verificar se stake não excede 90% do saldo (Compatibilidade)
    if (botState.last_balance && stake > botState.last_balance * 0.9) {
        appendTradeLog(`⚠️ Stake (${stake}) muito alto para o saldo (${botState.last_balance}). Resetando.`, 'warning');
        stake = tradingConfig.initial_stake;
    }
    
    stake = parseFloat(stake.toFixed(2));
    botState.current_stake = stake;
    savePersistentConfig();
    
    appendTradeLog(`🤖 BOT R50 | Dígito=${digit} | Stake=${stake} | Resultado=${botState.last_result} | Virtual=${botState.virtual_loss_counter}`, 'info');
    
    // Executar trade REAL
    await executeR50Trade(stake, digit);
}

// 🎯 EXECUTAR TRADE REAL - CORRIGIDO
async function executeR50Trade(stake, currentDigit) {
    // ✅ VERIFICAÇÃO ROBUSTA DA CONEXÃO
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        appendTradeLog('❌ WebSocket não disponível. Tentando reconectar...', 'warning');
        
        // Tentar reconectar antes de falhar
        try {
            await reconnectToDeriv();
            // Se reconectou, continuar com a operação
            if (isWebSocketConnected()) {
                appendTradeLog('✅ Reconectado! Continuando operação...', 'success');
            } else {
                throw new Error('Falha na reconexão');
            }
        } catch (error) {
            appendTradeLog('❌ Não foi possível reconectar. Operação cancelada.', 'error');
            return;
        }
    }
    
    if (botState.shouldStop) {
        appendTradeLog('🛑 Bot parado durante a execução do trade', 'warning');
        return;
    }
    
    let contractId = null;
    
    try {
        // Atualizar timeline para "Analisando"
        tradingTimeline.className = 'timeline mt-0 mb-0 inicio';
        
        // 1. Enviar proposta
        appendTradeLog('🔄 Enviando proposta de trade...', 'info');
        
        const proposalResp = await sendBotRequest(wsConnection, {
            proposal: 1,
            amount: stake,
            basis: "stake",
            contract_type: "DIGITOVER",
            currency: tradingConfig.currency,
            duration: tradingConfig.duration,
            duration_unit: tradingConfig.duration_unit,
            symbol: tradingConfig.market,
            barrier: tradingConfig.prediction
        });

        if (proposalResp.error) {
            appendTradeLog(`❌ Erro na proposta: ${proposalResp.error.message}`, 'error');
            return;
        }

        // 2. Comprar contrato
        appendTradeLog('💰 Comprando contrato...', 'info');
        
        tradingTimeline.className = 'timeline mt-0 mb-0 meio';
        
        const buyResp = await sendBotRequest(wsConnection, { 
            buy: proposalResp.proposal.id, 
            price: stake 
        });

        if (buyResp.error) {
            appendTradeLog(`❌ Erro na compra: ${buyResp.error.message}`, 'error');
            tradingTimeline.className = 'timeline mt-0 mb-0 inicio';
            return;
        }

        contractId = buyResp.buy.contract_id;
        botState.current_contract = contractId;
        botState.last_trade_time = Date.now();
        
        appendTradeLog(`🟢 Contrato comprado - ID: ${contractId}`, 'success');

        // 3. Aguardar resultado do contrato
        appendTradeLog('⏳ Aguardando resultado do contrato...', 'info');
        
        tradingTimeline.className = 'timeline mt-0 mb-0 fim';
        
        const result = await waitContractResult(contractId);
        const profit = result.profit;
        
        // 4. Processar resultado
        const isWin = profit > 0;
        botState.last_result = isWin ? "WIN" : "LOSS";
        botState.trades_today++;
        botState.current_contract = null;
        
        // ✅ ATUALIZAR SALDO CORRETAMENTE
        if (botState.last_balance) {
            botState.last_balance += profit;
        }
        
        appendTradeLog(`💰 BOT R50 ${isWin ? 'GANHOU' : 'PERDEU'}! Lucro: $${profit.toFixed(2)}`, 
                      isWin ? 'success' : 'error');

        // Atualizar interface
        updateTradeCounters(isWin);
        updateBalanceAndProfit(profit);
        updateBotInterface();
        
        // Adicionar ao histórico de trades
        addTradeToHistory(isWin ? 'DIGITOVER' : 'DIGITUNDER', profit, currentDigit);
        
        // Atualizar saldo em tempo real
        loadAccountInfo();
        
    } catch (error) {
        if (error.message.includes('Bot parado')) {
            appendTradeLog('🛑 Trade cancelado - Bot foi parado', 'warning');
        } else if (error.message.includes('WebSocket') || error.message.includes('conexão')) {
            appendTradeLog('❌ Erro de conexão durante o trade. Tentando reconectar...', 'error');
            // Agendar reconexão
            scheduleReconnect();
        } else {
            appendTradeLog(`❌ Erro no trade R50: ${error.message}`, 'error');
        }
        botState.current_contract = null;
    } finally {
        tradingTimeline.className = 'timeline mt-0 mb-0 inicio';
        savePersistentConfig();
    }
}

// 🆕 BOT R50 COMO ESTRATÉGIA SELECIONÁVEL
function selectR50Strategy() {
    currentStrategy = 'r50-bot';
    isTrading = false;
    isBotRunning = true;
    botState.shouldStop = false; // ✅ Garantir que não está parado
    
    document.getElementById('selected-strategy').textContent = 'Bot R50 Automático';
    
    // Atualizar interface
    updateBotInterface();
    
    // Esconder botões de trading manual
    if (startTradingButton) startTradingButton.classList.add('d-none');
    if (stopTradingButton) stopTradingButton.classList.add('d-none');
    
    appendTradeLog('🤖 Estratégia "Bot R50 Automático" selecionada e ATIVADA!', 'success');
    
    // Inicializar estado do bot se necessário
    if (!botState.initial_balance) {
        const currentBalance = parseFloat(document.querySelector('.app_balance v')?.textContent || 0);
        botState.initial_balance = currentBalance;
        botState.last_balance = currentBalance;
        savePersistentConfig();
    }
}

// Iniciar/parar bot R50 - CORRIGIDO
function toggleR50Bot() {
    if (isBotRunning && !botState.shouldStop) {
        stopR50Bot();
    } else {
        startR50Bot();
    }
}

// ===== FUNÇÃO startR50Bot ATUALIZADA =====
async function startR50Bot() {
    if (!isConnected || !isWebSocketConnected()) {
        // ✅ TENTAR RECONECTAR ANTES DE MOSTRAR ERRO
        if (currentToken) {
            appendTradeLog('🔄 Conexão perdida. Tentando reconectar...', 'warning');
            try {
                await reconnectToDeriv();
                // Se reconexão bem-sucedida, continuar com start do bot
            } catch (error) {
                appendTradeLog('❌ Falha na reconexão. Conecte-se manualmente.', 'error');
                return;
            }
        } else {
            alert('❌ Conecte-se primeiro à Deriv!');
            showLoginModal();
            return;
        }
    }
    
    try {
        appendTradeLog('🚀 Iniciando Bot R50...', 'info');
        
        botWebSocket = wsConnection;
        isBotRunning = true;
        botState.shouldStop = false;
        
        updateBotInterface();
        
        if (!botState.initial_balance) {
            const currentBalance = parseFloat(document.querySelector('.app_balance v')?.textContent || 0);
            botState.initial_balance = currentBalance;
            botState.last_balance = currentBalance;
            savePersistentConfig();
        }
        
        appendTradeLog('✅ Bot R50 iniciado com sucesso!', 'success');
        
    } catch (error) {
        appendTradeLog(`❌ Erro ao iniciar bot: ${error.message}`, 'error');
        isBotRunning = false;
        botState.shouldStop = true;
        updateBotInterface();
    }
}

function stopR50Bot() {
    isBotRunning = false;
    botState.shouldStop = true; // ✅ Setar flag de parada
    botWebSocket = null;
    
    updateBotInterface();
    appendTradeLog('🛑 Bot R50 parado', 'warning');
    savePersistentConfig();
}

// Atualizar interface do bot - CORRIGIDO
function updateBotInterface() {
    const botStatusElement = document.getElementById('botStatus');
    const virtualLossElement = document.getElementById('virtualLossCounter');
    const currentStakeElement = document.getElementById('currentStake');
    const lastResultElement = document.getElementById('lastResult');
    const startBotBtn = document.getElementById('startBotBtn');
    const stopBotBtn = document.getElementById('stopBotBtn');
    
    if (botStatusElement) {
        const isRunning = isBotRunning && !botState.shouldStop;
        botStatusElement.textContent = isRunning ? '🟢 Executando' : '🔴 Parado';
        botStatusElement.className = `bot-status-badge ${isRunning ? 'bot-status-running' : 'bot-status-stopped'}`;
    }
    
    if (virtualLossElement) {
        virtualLossElement.textContent = botState.virtual_loss_counter;
        virtualLossElement.className = `bot-status-value ${botState.virtual_loss_counter > 0 ? 'text-warning' : 'text-white'}`;
    }
    
    if (currentStakeElement) {
        currentStakeElement.textContent = botState.current_stake?.toFixed(2) || '0.35';
    }
    
    if (lastResultElement) {
        lastResultElement.textContent = botState.last_result;
        lastResultElement.className = `bot-status-badge ${botState.last_result === 'WIN' ? 'bg-success' : 
                                    botState.last_result === 'LOSS' ? 'bg-danger' : 'bg-secondary'}`;
    }
    
    if (startBotBtn && stopBotBtn) {
        const isRunning = isBotRunning && !botState.shouldStop;
        if (isRunning) {
            startBotBtn.classList.add('d-none');
            stopBotBtn.classList.remove('d-none');
        } else {
            startBotBtn.classList.remove('d-none');
            stopBotBtn.classList.add('d-none');
        }
    }
}

// Mostrar modal de configuração do bot - CORRIGIDO
function showBotConfigModal() {
    // Preencher campos com configurações atuais
    document.getElementById('botStake').value = tradingConfig.initial_stake || 0.35;
    document.getElementById('botStakeAfterWin').value = tradingConfig.stake_after_win || 0.35;
    document.getElementById('botMartingale').value = tradingConfig.martingale_factor || 2.2;
    document.getElementById('botPrediction').value = tradingConfig.prediction || 4;
    document.getElementById('botVirtualLoss').value = tradingConfig.virtual_loss_limit || 2;
    document.getElementById('botMeta').value = tradingConfig.meta || 100;
    document.getElementById('botStopLoss').value = tradingConfig.stop_loss || 10999;
    document.getElementById('botCooldown').value = tradingConfig.cooldown_seconds || 2;
    
    // Mostrar modal
    const botConfigModal = new bootstrap.Modal(document.getElementById('botConfigModal'));
    botConfigModal.show();
}

// Salvar configurações do bot - CORRIGIDO
function saveBotConfig() {
    tradingConfig.initial_stake = parseFloat(document.getElementById('botStake').value);
    tradingConfig.stake_after_win = parseFloat(document.getElementById('botStakeAfterWin').value);
    tradingConfig.martingale_factor = parseFloat(document.getElementById('botMartingale').value);
    tradingConfig.prediction = parseInt(document.getElementById('botPrediction').value);
    tradingConfig.virtual_loss_limit = parseInt(document.getElementById('botVirtualLoss').value);
    tradingConfig.meta = parseFloat(document.getElementById('botMeta').value);
    tradingConfig.stop_loss = parseFloat(document.getElementById('botStopLoss').value);
    tradingConfig.cooldown_seconds = parseInt(document.getElementById('botCooldown').value);
    
    // Atualizar stake atual do bot
    botState.current_stake = tradingConfig.initial_stake;
    
    savePersistentConfig();
    updateBotInterface();
    
    // Fechar modal
    const botConfigModal = bootstrap.Modal.getInstance(document.getElementById('botConfigModal'));
    botConfigModal.hide();
    
    appendTradeLog('✅ Configurações do Bot R50 salvas!', 'success');
}

// ===== SISTEMA DE TRANSIÇÕES SUAVES PARA BARRAS DE DÍGITOS =====

// Função auxiliar para animar valores numéricos
function animateValue(element, start, end, duration, suffix = '') {
    const startTime = performance.now();
    const formatValue = (value) => value.toFixed(1) + suffix;
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function para suavizar a animação
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = start + (end - start) * easeOut;
        
        element.textContent = formatValue(currentValue);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = formatValue(end);
        }
    }
    
    requestAnimationFrame(update);
}

// ATUALIZAÇÃO MELHORADA DAS BARRAS DE DÍGITOS COM TRANSIÇÕES SUAVES
function updateDigitBars() {
    const digitsGrid = document.getElementById('indicadorbars');

    if (!digitsGrid) return;

    const percentages = digitCounts.map(count =>
        totalTicks > 0 ? (count / totalTicks) * 100 : 0
    );

    const maxFreq = Math.max(...digitCounts);
    const previousBars = Array.from(digitsGrid.children);
    const previousHeights = previousBars.map(bar => 
        parseFloat(bar.style.height) || 0
    );

    digitsGrid.innerHTML = '';

    for (let i = 0; i < 10; i++) {
        const percentage = percentages[i];
        const frequency = digitCounts[i];
        const heightPercentage = maxFreq > 0 ? (frequency / maxFreq) * 100 : 0;
        const previousHeight = previousHeights[i] || 0;

        const bar = document.createElement('div');
        bar.className = 'col position-relative mt-auto border border-1 digit-bar';
        
        // Configurar altura inicial para animação suave
        bar.style.height = `${previousHeight}%`;
        bar.style.minHeight = '5px';
        bar.style.setProperty('--bs-bg-opacity', '0.8');
        
        // Adicionar classe de entrada para nova barra
        if (previousHeight === 0 && heightPercentage > 0) {
            bar.classList.add('entering');
        } else {
            bar.classList.add('updating');
        }

        // Definir cor baseada na frequência com transição suave
        let backgroundColor, borderColor;
        if (percentage >= 15) {
            backgroundColor = 'rgba(40, 167, 69, 0.8)';
            borderColor = '#28a745';
            bar.classList.add('high-frequency');
        } else if (percentage <= 5) {
            backgroundColor = 'rgba(220, 53, 69, 0.8)';
            borderColor = '#dc3545';
        } else {
            backgroundColor = 'rgba(255, 255, 255, 0.8)';
            borderColor = '#dee2e6';
        }

        // Aplicar cores com transição
        bar.style.backgroundColor = backgroundColor;
        bar.style.borderColor = borderColor;
        bar.classList.add('color-change');

        const percentageElement = document.createElement('small');
        percentageElement.className = 'position-absolute bottom-100 start-50 translate-middle-x text-white';
        percentageElement.style.fontSize = '10px';
        percentageElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
        percentageElement.style.transition = 'all 0.3s ease';
        percentageElement.textContent = `${percentage.toFixed(1)}%`;

        const digitElement = document.createElement('div');
        digitElement.className = 'position-absolute top-100 start-50 translate-middle-x mt-1';
        digitElement.style.fontSize = '11px';
        digitElement.style.fontWeight = 'bold';
        digitElement.style.transition = 'all 0.3s ease';
        digitElement.textContent = i;

        bar.appendChild(percentageElement);
        bar.appendChild(digitElement);
        digitsGrid.appendChild(bar);

        // Animar para a altura final após um pequeno delay
        setTimeout(() => {
            bar.style.height = `${heightPercentage}%`;
            
            // Atualizar porcentagem com efeito de contagem
            animateValue(percentageElement, 0, percentage, 600, '%');
        }, 50);
    }

    // Limpar classes de animação após a transição
    setTimeout(() => {
        const bars = digitsGrid.querySelectorAll('.digit-bar');
        bars.forEach(bar => {
            bar.classList.remove('entering', 'updating');
        });
    }, 800);
}

// ATUALIZAÇÃO MELHORADA DA SEQUÊNCIA DE DÍGITOS
function updateDigitSequenceDisplay() {
    if (!digitSequenceElement) return;

    const previousDigits = Array.from(digitSequenceElement.children);
    
    digitSequenceElement.innerHTML = '';

    digitSequence.forEach((item, index) => {
        const digitElement = document.createElement('div');
        digitElement.className = `digit-item ${item.digit % 2 === 0 ? 'even' : 'odd'}`;

        // Destacar o dígito mais recente com animação
        if (index === digitSequence.length - 1) {
            digitElement.classList.add('latest');
            digitElement.style.animationDelay = '0.1s';
        }

        digitElement.textContent = item.digit;
        digitElement.title = `Tick ${index + 1}: ${item.digit} - ${item.timestamp.toLocaleTimeString()}`;

        // Efeito de fade para dígitos mais antigos
        const opacity = 0.6 + (index / digitSequence.length) * 0.4;
        digitElement.style.opacity = opacity.toString();

        // Adicionar transição suave para mudanças de posição
        digitElement.style.transition = 'all 0.4s ease-in-out';

        digitSequenceElement.appendChild(digitElement);
    });
}

// ATUALIZAÇÃO MELHORADA DA LINHA DE ÚLTIMOS DÍGITOS
function updateLastDigitsTimeline(digit) {
    if (!lastDigitsContainer) return;

    // Adicionar novo dígito ao histórico
    lastDigitsHistory.unshift({
        digit: digit,
        timestamp: new Date()
    });

    // Manter apenas os últimos dígitos
    if (lastDigitsHistory.length > maxLastDigits) {
        lastDigitsContainer.removeChild(lastDigitsContainer.lastChild);
    }

    // Criar novo elemento de dígito
    const digitElement = document.createElement('div');
    digitElement.className = `last-digit ${digit % 2 === 0 ? 'even' : 'odd'} latest`;
    digitElement.textContent = digit;
    digitElement.title = `Tick: ${digit} - ${new Date().toLocaleTimeString()}`;

    // Adicionar no início com animação
    lastDigitsContainer.insertBefore(digitElement, lastDigitsContainer.firstChild);

    // Atualizar opacidade dos dígitos antigos
    const allDigits = lastDigitsContainer.querySelectorAll('.last-digit');
    allDigits.forEach((el, index) => {
        if (index > 0) {
            const opacity = 0.6 + (index / allDigits.length) * 0.4;
            el.style.opacity = opacity.toString();
            el.classList.remove('latest');
        }
    });

    // Remover a classe de destaque após a animação
    setTimeout(() => {
        digitElement.classList.remove('latest');
    }, 600);
}

// ===== FUNÇÕES DO GRÁFICO DINÂMICO =====

// Inicializar gráfico SVG
function initializeChart() {
    console.log('📊 Inicializando gráfico SVG dinâmico...');

    const svg = document.querySelector('.chart-svg');
    if (!svg) {
        console.error('❌ SVG não encontrado');
        return;
    }

    // Limpar conteúdo existente
    svg.innerHTML = '';

    // Adicionar elementos do gráfico
    addChartElements(svg);

    // Iniciar com alguns dados
    initializeChartData();

    console.log('✅ Gráfico SVG dinâmico inicializado');
}

// Adicionar elementos do gráfico
function addChartElements(svg) {
    // Fundo
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('width', chartWidth);
    background.setAttribute('height', chartHeight);
    background.setAttribute('fill', 'rgba(0,0,0,0.19)');
    svg.appendChild(background);

    // Grupo para grade
    const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gridGroup.setAttribute('class', 'grid');
    svg.appendChild(gridGroup);

    // Grupo para eixos
    const axesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    axesGroup.setAttribute('class', 'axes');
    svg.appendChild(axesGroup);

    // Grupo para linha do gráfico
    const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lineGroup.setAttribute('class', 'chart-line');
    svg.appendChild(lineGroup);

    // Linha principal do gráfico
    const chartLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    chartLine.setAttribute('class', 'price-line');
    chartLine.setAttribute('fill', 'none');
    chartLine.setAttribute('stroke', 'rgba(255,255,255,0.85)');
    chartLine.setAttribute('stroke-width', '2');
    chartLine.setAttribute('stroke-linecap', 'round');
    lineGroup.appendChild(chartLine);

    // Ponto atual
    const currentPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    currentPoint.setAttribute('class', 'current-point');
    currentPoint.setAttribute('r', '4');
    currentPoint.setAttribute('fill', '#4CAF50');
    currentPoint.setAttribute('stroke', '#FFFFFF');
    currentPoint.setAttribute('stroke-width', '2');
    lineGroup.appendChild(currentPoint);

    // Adicionar grade e eixos
    updateChartGrid();
}

// Inicializar dados do gráfico
function initializeChartData() {
    // Dados iniciais demonstrativos
    const basePrice = 128.9000;
    for (let i = 0; i < 10; i++) {
        const price = basePrice + (Math.random() - 0.5) * 0.1;
        chartData.push({
            timestamp: Date.now() - (10 - i) * 1000,
            price: price
        });
    }
    updateChart();
}

// Atualizar grade do gráfico
function updateChartGrid() {
    const svg = document.querySelector('.chart-svg');
    const gridGroup = svg.querySelector('.grid');
    const axesGroup = svg.querySelector('.axes');

    if (!gridGroup || !axesGroup) return;

    // Limpar elementos existentes
    gridGroup.innerHTML = '';
    axesGroup.innerHTML = '';

    // Adicionar linhas de grade horizontais
    const yLines = 5;
    for (let i = 0; i <= yLines; i++) {
        const y = margin.top + (i * (chartHeight - margin.top - margin.bottom) / yLines);

        // Linha de grade
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', margin.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', chartWidth - margin.right);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#333344');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-dasharray', '2,2');
        gridGroup.appendChild(line);

        // Rótulo do eixo Y
        if (chartData.length > 0) {
            const priceRange = getPriceRange();
            const price = priceRange.max - (i * (priceRange.max - priceRange.min) / yLines);
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', margin.left - 5);
            text.setAttribute('y', y + 3);
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('font-size', '10');
            text.setAttribute('font-family', 'Arial, sans-serif');
            text.setAttribute('fill', '#888899');
            text.textContent = price.toFixed(4);
            axesGroup.appendChild(text);
        }
    }

    // Linha de grade vertical (eixo do tempo)
    const lineX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineX.setAttribute('x1', margin.left);
    lineX.setAttribute('y1', chartHeight - margin.bottom);
    lineX.setAttribute('x2', chartWidth - margin.right);
    lineX.setAttribute('y2', chartHeight - margin.bottom);
    lineX.setAttribute('stroke', '#444455');
    lineX.setAttribute('stroke-width', '1');
    gridGroup.appendChild(lineX);
}

// Obter faixa de preços para escalonamento
function getPriceRange() {
    if (chartData.length === 0) {
        return { min: 128.8000, max: 129.0000 };
    }

    const prices = chartData.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    // Adicionar margem para visualização
    const range = max - min;
    return {
        min: min - range * 0.1,
        max: max + range * 0.1
    };
}

// Atualizar gráfico com novos dados
function updateChart() {
    if (chartData.length === 0) return;

    const svg = document.querySelector('.chart-svg');
    const priceLine = svg.querySelector('.price-line');
    const currentPoint = svg.querySelector('.current-point');

    if (!priceLine || !currentPoint) return;

    // Atualizar escala
    const priceRange = getPriceRange();

    // Gerar path data para a linha
    let pathData = '';
    const xStep = (chartWidth - margin.left - margin.right) / (chartData.length - 1);

    chartData.forEach((point, index) => {
        const x = margin.left + (index * xStep);
        const y = margin.top + ((priceRange.max - point.price) / (priceRange.max - priceRange.min)) *
            (chartHeight - margin.top - margin.bottom);

        if (index === 0) {
            pathData += `M ${x} ${y} `;
        } else {
            pathData += `L ${x} ${y} `;
        }
    });

    priceLine.setAttribute('d', pathData);

    // Atualizar ponto atual
    const lastPoint = chartData[chartData.length - 1];
    const lastX = margin.left + ((chartData.length - 1) * xStep);
    const lastY = margin.top + ((priceRange.max - lastPoint.price) / (priceRange.max - priceRange.min)) *
        (chartHeight - margin.top - margin.bottom);

    currentPoint.setAttribute('cx', lastX);
    currentPoint.setAttribute('cy', lastY);

    // Efeito de pulso no ponto atual
    currentPoint.classList.add('pulse');
    setTimeout(() => {
        currentPoint.classList.remove('pulse');
    }, 600);

    // Atualizar grade
    updateChartGrid();

    // Efeito visual na linha quando há movimento significativo
    if (chartData.length > 1) {
        const currentPrice = chartData[chartData.length - 1].price;
        const previousPrice = chartData[chartData.length - 2].price;

        if (currentPrice > previousPrice) {
            priceLine.setAttribute('stroke', '#4CAF50'); // Verde para alta
        } else if (currentPrice < previousPrice) {
            priceLine.setAttribute('stroke', '#f44336'); // Vermelho para baixa
        }

        // Voltar à cor normal após 500ms
        setTimeout(() => {
            priceLine.setAttribute('stroke', 'rgba(255,255,255,0.85)');
        }, 500);
    }
}

// Adicionar novo ponto ao gráfico
function addChartPoint(price) {
    const newPoint = {
        timestamp: Date.now(),
        price: price
    };

    chartData.push(newPoint);

    // Limitar número de pontos
    if (chartData.length > maxDataPoints) {
        chartData.shift();
    }

    updateChart();
}

// Função para limpar gráfico
function clearChart() {
    chartData = [];
    updateChart();
    addNotification('Gráfico limpo', 'info');
    console.log('🧹 Gráfico limpo');
}

// Função para exportar dados do gráfico
function exportChartData() {
    const dataStr = JSON.stringify(chartData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chart-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    addNotification('Dados do gráfico exportados', 'success');
}

// ===== FUNÇÕES CORRIGIDAS =====

// 1. CORREÇÃO DO SALDO E LUCROS/PREJUÍZOS - ATUALIZADA
function updateBalanceAndProfit(profit) {
    const balanceElement = document.querySelector('.app_balance v');
    const profitElement = document.querySelector('.app_profit_loss');

    if (balanceElement && profitElement) {
        // Atualizar lucro/prejuízo
        const currentProfit = parseFloat(profitElement.textContent) || 0;
        const newProfit = currentProfit + profit;
        profitElement.textContent = newProfit.toFixed(2);
        profitElement.className = `app_profit_loss ${newProfit >= 0 ? 'text-success' : 'text-danger'}`;

        // Atualizar saldo total baseado no estado do bot
        if (botState.last_balance !== null) {
            const newBalance = botState.last_balance;
            balanceElement.textContent = `${newBalance.toFixed(2)} USD`;
        } else {
            // Fallback para o método anterior
            const currentBalance = parseFloat(balanceElement.textContent) || 0;
            const newBalance = currentBalance + profit;
            balanceElement.textContent = `${newBalance.toFixed(2)} USD`;
            botState.last_balance = newBalance;
        }
    }
}

// 2. ATUALIZAÇÃO DA FUNÇÃO updateTradeCounters
function updateTradeCounters(isWin) {
    const winElement = document.querySelector('.win');
    const lossElement = document.querySelector('.loss');

    if (winElement && isWin) {
        winElement.textContent = parseInt(winElement.textContent || 0) + 1;
    }
    if (lossElement && !isWin) {
        lossElement.textContent = parseInt(lossElement.textContent || 0) + 1;
    }
}

// ADICIONAR TICK AO HISTÓRICO
function addNewRealTick(digit) {
    tickHistory.push(digit);

    if (tickHistory.length > maxTicks) {
        const removedDigit = tickHistory.shift();
        if (digitCounts[removedDigit] > 0) {
            digitCounts[removedDigit]--;
            totalTicks--;
        }
    }

    digitCounts[digit]++;
    totalTicks++;
    updateDigitBars();
}

// ADICIONAR TRADE AO HISTÓRICO
function addTradeToHistory(type, profit, digit = null) {
    const tbody = document.getElementById('tradesTableBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.className = profit > 0 ? 'trade-success' : 'trade-failure';

    row.innerHTML = `
                <td>${new Date().toLocaleTimeString('pt-BR')}</td>
                <td class="text-center">${type}</td>
                <td>${digit !== null ? digit : Math.floor(Math.random() * 10)}</td>
                <td>$${botState.current_stake?.toFixed(2) || '0.35'}</td>
                <td class="fw-bold ${profit > 0 ? 'text-success' : 'text-danger'}">${profit > 0 ? '+' : ''}${profit.toFixed(2)}</td>
            `;

    tbody.insertBefore(row, tbody.firstChild);
}

// ADICIONAR NOTIFICAÇÃO
function addNotification(message, type = 'info') {
    const tbody = document.getElementById('notificationsTableBody');
    const counter = document.querySelector('.not');

    if (!tbody) return;

    const row = document.createElement('tr');
    const typeIcon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

    row.innerHTML = `
                <td>${typeIcon}</td>
                <td class="d-none d-md-table-cell w-100">${message}</td>
                <td><small>${new Date().toLocaleTimeString('pt-BR')}</small></td>
            `;

    tbody.insertBefore(row, tbody.firstChild);

    // Atualizar contador
    if (counter) {
        counter.textContent = parseInt(counter.textContent) + 1;
    }
}

// 🆕 ATUALIZAR SELEÇÃO DE ESTRATÉGIAS - APENAS BOT R50
function selectStrategy(strategy) {
    currentStrategy = strategy;
    
    document.getElementById('selected-strategy').textContent = 'Bot R50 Automático';
    tradingConfig.strategy = strategy;

    // Ativar bot automaticamente
    selectR50Strategy();

    addNotification(`Estratégia "Bot R50 Automático" selecionada`, 'success');
}

// ===== FUNÇÕES DE CONEXÃO E INTERFACE =====

// Mostrar modal de login
function showLoginModal() {
    console.log('🔓 Abrindo modal de login...');
    if (loginModal) {
        loginModal.style.display = 'flex';
        if (apiTokenInput) {
            apiTokenInput.value = '';
            apiTokenInput.focus();
        }
    }
}

// Mostrar modal de configurações
function showConfigModal() {
    console.log('⚙️ Abrindo modal de configurações...');

    if (configModal) {
        // Carregar configurações atuais nos campos
        const configStake = document.getElementById('configStake');
        const configProfit = document.getElementById('configProfit');
        const configStopLoss = document.getElementById('configStopLoss');
        const configCurrency = document.getElementById('configCurrency');
        const configStrategy = document.getElementById('configStrategy');
        const chartDataPoints = document.getElementById('chartDataPoints');
        const chartPointsLabel = document.getElementById('chartPointsLabel');

        if (configStake) configStake.value = tradingConfig.stake;
        if (configProfit) configProfit.value = tradingConfig.profitTarget;
        if (configStopLoss) configStopLoss.value = tradingConfig.stopLoss;
        if (configCurrency) configCurrency.value = tradingConfig.currency;
        if (configStrategy) configStrategy.value = tradingConfig.strategy;
        if (chartDataPoints) chartDataPoints.value = maxDataPoints;
        if (chartPointsLabel) chartPointsLabel.textContent = `${maxDataPoints} pontos`;

        configModal.style.display = 'flex';
    }
}

// Fechar modais
function closeLoginModalFunc() {
    if (loginModal) loginModal.style.display = 'none';
}

function closeConfigModalFunc() {
    if (configModal) configModal.style.display = 'none';
}

// Atualizar status da conexão
function updateConnectionStatus(status, message = '') {
    const statusClass = {
        'connected': 'connected',
        'disconnected': 'disconnected',
        'connecting': 'connecting',
        'error': 'disconnected'
    }[status] || 'disconnected';

    const statusText = {
        'connected': 'Conectado',
        'disconnected': 'Desconectado',
        'connecting': 'Conectando...',
        'error': 'Erro de Conexão'
    }[status] || 'Desconectado';

    if (connectionStatus) {
        connectionStatus.className = `connection-status ${statusClass}`;
    }
    if (connectionText) {
        connectionText.textContent = statusText;
    }

    // Atualizar também o status do servidor
    const serverStatus = document.getElementById('server-status-icon');
    if (serverStatus) {
        serverStatus.className = `connection-status ${statusClass}`;
    }

    if (realDataIndicator) {
        realDataIndicator.style.display = status === 'connected' ? 'inline-block' : 'none';
    }

    if (startTradingButton) {
        startTradingButton.disabled = status !== 'connected';
    }
}

// ===== FUNÇÃO connectToDeriv ATUALIZADA =====
function connectToDeriv(token, accountType = 'demo') {
    return new Promise((resolve, reject) => {
        console.log('🎯 Iniciando conexão WebSocket...');
        updateConnectionStatus('connecting', '🔗 Conectando ao servidor...');

        // Fechar conexão anterior se existir
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.close();
        }

        // ✅ PARAR BOT ANTES DE RECONECTAR
        stopR50Bot();

        const wsUrl = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';
        console.log('📡 Conectando a:', wsUrl);

        wsConnection = new WebSocket(wsUrl);
        let timeoutId;

        // Timeout de 15 segundos (aumentado)
        timeoutId = setTimeout(() => {
            console.log('⏰ Timeout na conexão WebSocket');
            if (wsConnection.readyState === WebSocket.CONNECTING) {
                wsConnection.close();
                reject(new Error('Servidor não respondeu. Use VPN.'));
            }
        }, 15000);

        wsConnection.onopen = () => {
            clearTimeout(timeoutId);
            console.log('✅ WebSocket conectado! Enviando autorização...');
            updateConnectionStatus('connecting', '🔐 Autenticando...');

            // Enviar mensagem de autorização
            const authMessage = {
                authorize: token
            };
            wsConnection.send(JSON.stringify(authMessage));
        };

        wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Roteamento de mensagens para pending requests
                if (routeIncomingMessage(data)) {
                    return;
                }

                if (data.authorize) {
                    // ✅ AUTORIZAÇÃO BEM-SUCEDIDA
                    console.log('✅ Login realizado com sucesso!');
                    currentToken = token;
                    isConnected = true;
                    reconnectAttempts = 0; // Resetar tentativas
                    isReconnecting = false;

                    updateConnectionStatus('connected', '✅ Conectado! Iniciando transmissão...');

                    // ✅ ATUALIZAR ESTADO DO BOT COM SALDO
                    const balance = parseFloat(data.authorize.balance || 0);
                    botState.last_balance = balance;
                    if (!botState.initial_balance) {
                        botState.initial_balance = balance;
                    }
                    savePersistentConfig();

                    // Atualizar tipo de conta
                    const accountTypeDisplay = document.getElementById('account-type-display');
                    if (accountTypeDisplay) {
                        accountTypeDisplay.textContent = accountType === 'real' ? 'Conta Real' : 'Conta Demo';
                    }

                    // Carregar saldo
                    loadAccountInfo();

                    // Iniciar subscription de ticks
                    startTicksSubscription();

                    // ✅ INICIAR MONITOR DE CONEXÃO
                    if (!window.connectionMonitorStarted) {
                        startConnectionMonitor();
                        window.connectionMonitorStarted = true;
                    }

                    resolve(wsConnection);

                } else if (data.error) {
                    // ❌ ERRO NA AUTORIZAÇÃO
                    console.error('❌ Erro de autorização:', data.error);
                    wsConnection.close();
                    reject(new Error(data.error.message));

                } else if (data.tick) {
                    // 📊 TICK RECEBIDO
                    processRealTick(data.tick);

                } else if (data.balance) {
                    // 💰 SALDO RECEBIDO
                    const balance = parseFloat(data.balance.balance);
                    if (!isNaN(balance)) {
                        botState.last_balance = balance;
                        savePersistentConfig();
                        updateBalanceDisplay(balance);
                        console.log('💰 Saldo atualizado:', balance);
                    }

                }

            } catch (error) {
                console.error('❌ Erro ao processar mensagem:', error);
            }
        };

        wsConnection.onerror = (error) => {
            clearTimeout(timeoutId);
            console.error('❌ Erro WebSocket:', error);
            reject(new Error('Falha na conexão. Verifique internet/VPN.'));
        };

        wsConnection.onclose = (event) => {
            clearTimeout(timeoutId);
            console.log('🔌 WebSocket fechado:', event.code, event.reason);
            isConnected = false;
            
            // ✅ PARAR BOT AO DESCONECTAR
            stopR50Bot();
            
            updateConnectionStatus('disconnected');
            updateBotInterface();
            
            // ✅ AGENDAR RECONEXÃO AUTOMÁTICA
            if (currentToken && autoReconnect && !isReconnecting) {
                console.log('🔄 Agendando reconexão automática...');
                scheduleReconnect();
            }
            
            if (!isConnected && event.code !== 1000) {
                reject(new Error('Conexão interrompida: ' + (event.reason || 'Erro ' + event.code)));
            }
        };
    });
}

// ATUALIZAR DISPLAY DO SALDO
function updateBalanceDisplay(balance) {
    const balanceElement = document.querySelector('.app_balance v');
    if (balanceElement) {
        balanceElement.textContent = `${balance} USD`;
    }
}

// CARREGAR INFORMAÇÕES DA CONTA
function loadAccountInfo() {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.log('⚠️ WebSocket não disponível para carregar saldo');
        return;
    }

    console.log('💰 Solicitando saldo...');
    const balanceMessage = {
        balance: 1,
        subscribe: 1
    };
    wsConnection.send(JSON.stringify(balanceMessage));
}

// INICIAR RECEBIMENTO DE TICKS
function startTicksSubscription() {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.log('⚠️ WebSocket não disponível para ticks');
        return;
    }

    console.log('📊 Iniciando subscription de ticks...');
    const ticksMessage = {
        ticks: 'R_50', // Mudado para R_50 para o bot
        subscribe: 1
    };
    wsConnection.send(JSON.stringify(ticksMessage));

    console.log('🎯 Aguardando ticks em tempo real...');
}

// INICIAR/ PARAR TRADING - FUNÇÕES MANTIDAS PARA COMPATIBILIDADE
function startTrading() {
    console.log('⚠️ Trading manual desativado - Use o Bot R50');
}

function stopTrading() {
    console.log('⚠️ Trading manual desativado - Use o Bot R50');
}

// LIMPAR HISTÓRICO DE TRADES
function resetTrades() {
    const tbody = document.getElementById('tradesTableBody');
    const winElement = document.querySelector('.win');
    const lossElement = document.querySelector('.loss');
    const profitElement = document.querySelector('.app_profit_loss');

    if (tbody) tbody.innerHTML = '';
    if (winElement) winElement.textContent = '0';
    if (lossElement) lossElement.textContent = '0';
    if (profitElement) {
        profitElement.textContent = '0.00';
        profitElement.className = 'app_profit_loss';
    }

    addNotification('Histórico de trades limpo', 'info');
}

// INICIALIZAÇÃO DAS BARRAS DE DÍGITOS
function initializeDigitBars() {
    const container = document.getElementById('indicadorbars');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const bar = document.createElement('div');
        bar.className = 'col position-relative mt-auto border border-1 bg-light';
        bar.style.height = '0%';
        bar.style.setProperty('--bs-bg-opacity', '0.8');

        const percentage = document.createElement('small');
        percentage.className = 'position-absolute bottom-100 start-50 translate-middle-x';
        percentage.textContent = '0.0%';

        bar.appendChild(percentage);
        container.appendChild(bar);
    }
}

// RELÓGIO DO SERVIDOR
function updateServerTime() {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR');
    const serverTimeElement = document.getElementById('server-time');
    if (serverTimeElement) {
        serverTimeElement.innerHTML = `<b>${time}</b>`;
    }
}

// DADOS INICIAIS DE DEMONSTRAÇÃO
function simulateInitialTicks() {
    console.log('🎮 Iniciando dados demonstrativos com gráfico dinâmico...');
    let basePrice = 128.9000;

    // Limpar dados existentes
    chartData = [];

    // Gerar dados iniciais mais realistas
    for (let i = 0; i < 15; i++) {
        // Simular movimento realista de preços (tendência + ruído)
        const trend = Math.sin(i * 0.3) * 0.02; // Tendência senoidal suave
        const noise = (Math.random() - 0.5) * 0.01; // Ruído aleatório
        basePrice += trend + noise;

        // Manter em faixa realista
        basePrice = Math.max(128.8000, Math.min(129.0000, basePrice));

        const randomDigit = Math.floor(Math.random() * 10);

        // Usar a nova função updateLineChart que atualiza o gráfico SVG
        updateLineChart(basePrice);
        addDigitToSequence(randomDigit);
        updateLastDigitsTimeline(randomDigit);

        // Pequeno delay para animação suave
        if (i === 14) { // Último ponto
            setTimeout(() => {
                addNewRealTick(randomDigit);
            }, 100);
        } else {
            addNewRealTick(randomDigit);
        }
    }
}

// SALVAR CONFIGURAÇÕES
function saveTradingConfig() {
    tradingConfig = {
        stake: parseFloat(document.getElementById('configStake').value),
        profitTarget: parseFloat(document.getElementById('configProfit').value),
        stopLoss: parseFloat(document.getElementById('configStopLoss').value),
        currency: document.getElementById('configCurrency').value,
        strategy: document.getElementById('configStrategy').value
    };

    // Atualizar configurações do gráfico
    maxDataPoints = parseInt(document.getElementById('chartDataPoints').value);

    // Atualizar campos da planilha
    const floatingStake = document.getElementById('floatingStake');
    const floatingMeta = document.getElementById('floatingMeta');
    const floatingLimitePerda = document.getElementById('floatingLimitePerda');
    const floatingCurrency = document.getElementById('floatingCurrency');

    if (floatingStake) floatingStake.value = tradingConfig.stake;
    if (floatingMeta) floatingMeta.value = tradingConfig.profitTarget;
    if (floatingLimitePerda) floatingLimitePerda.value = tradingConfig.stopLoss;
    if (floatingCurrency) floatingCurrency.value = tradingConfig.currency;

    // Atualizar estratégia selecionada
    selectStrategy(tradingConfig.strategy);

    closeConfigModalFunc();
    addNotification('Configurações salvas com sucesso!', 'success');
}

// ===== FUNÇÕES ADICIONAIS PARA TRANSIÇÕES =====

// Otimizar performance das animações
function optimizeAnimations() {
    // Forçar aceleração de hardware para animações
    const style = document.createElement('style');
    style.textContent = `
        .digit-bar, .digit-item, .last-digit {
            transform: translateZ(0);
            backface-visibility: hidden;
            perspective: 1000px;
        }
    `;
    document.head.appendChild(style);
}

// Atualizar Gráfico de Linha
function updateLineChart(price) {
    // Atualizar indicador de preço
    if (currentPriceElement) {
        const previousPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : price;
        currentPriceElement.textContent = price.toFixed(4);

        // Efeito de mudança de cor
        if (price > previousPrice) {
            currentPriceElement.style.color = '#4CAF50';
            currentPriceElement.classList.add('price-up');
            currentPriceElement.classList.remove('price-down');
        } else if (price < previousPrice) {
            currentPriceElement.style.color = '#f44336';
            currentPriceElement.classList.add('price-down');
            currentPriceElement.classList.remove('price-up');
        }

        // Remover classes de animação após 1 segundo
        setTimeout(() => {
            currentPriceElement.classList.remove('price-up', 'price-down');
        }, 1000);
    }

    // Adicionar ponto ao gráfico DINÂMICO
    addChartPoint(price);
}

// Adicionar dígito à sequência
function addDigitToSequence(digit) {
    digitSequence.push({
        digit: digit,
        timestamp: new Date()
    });

    // Manter apenas os últimos dígitos
    if (digitSequence.length > maxSequenceLength) {
        digitSequence.shift();
    }

    updateDigitSequenceDisplay();
}

// PROCESSAR TICK RECEBIDO - ATUALIZADA COM BOT R50 CORRIGIDO
function processRealTick(tickData) {
    try {
        const quote = tickData.quote;
        const price = parseFloat(quote);
        const digit = parseInt(quote.toString().slice(-1));

        console.log(`🎯 Tick: ${digit} (Quote: ${quote})`);

        // Atualizar display do último dígito
        const lastDigitElement = document.querySelector('.udig');
        if (lastDigitElement) {
            const oldDigit = parseInt(lastDigitElement.textContent) || 0;
            lastDigitElement.textContent = digit;

            // Efeito visual de mudança
            lastDigitElement.classList.remove('price-up', 'price-down');
            if (digit > oldDigit) {
                lastDigitElement.classList.add('price-up');
            } else if (digit < oldDigit) {
                lastDigitElement.classList.add('price-down');
            }
        }

        // Atualizar gráfico de linha com preço real
        updateLineChart(price);

        // Adicionar dígito à sequência
        addDigitToSequence(digit);

        // Atualizar linha de últimos dígitos
        updateLastDigitsTimeline(digit);

        // Adicionar ao histórico
        addNewRealTick(digit);

        // 🆕 Processar bot R50 se estiver ativo (CORRIGIDO)
        if (isBotRunning && !botState.shouldStop) {
            processR50Strategy(digit, price);
        }

    } catch (error) {
        console.error('❌ Erro ao processar tick:', error);
    }
}

// ===== INICIALIZAÇÃO PRINCIPAL =====
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 Plataforma inicializada - Bot R50 com RECONEXÃO AUTOMÁTICA e TRANSIÇÕES SUAVES!');

    // Carregar configurações persistentes
    loadPersistentConfig();

    // Inicializar componentes
    initializeChart();
    initializeDigitBars();
    updateDigitSequenceDisplay();
    updateBotInterface();
    optimizeAnimations();

    // ✅ CORREÇÃO: Configurar event listeners do Bot R50
    const startBotBtn = document.getElementById('startBotBtn');
    const stopBotBtn = document.getElementById('stopBotBtn');
    const saveBotConfigBtn = document.getElementById('saveBotConfig');
    const botConfigButton = document.getElementById('botConfigButton');
    const botConfigButtonFromModal = document.getElementById('botConfigButtonFromModal');

    if (startBotBtn) startBotBtn.addEventListener('click', startR50Bot);
    if (stopBotBtn) stopBotBtn.addEventListener('click', stopR50Bot);
    if (saveBotConfigBtn) saveBotConfigBtn.addEventListener('click', saveBotConfig);
    if (botConfigButton) botConfigButton.addEventListener('click', showBotConfigModal);
    if (botConfigButtonFromModal) botConfigButtonFromModal.addEventListener('click', showBotConfigModal);

    // ✅ ADDED: Campo para stake_after_win no modal
    const botConfigModal = document.getElementById('botConfigModal');
    if (botConfigModal) {
        const form = botConfigModal.querySelector('form');
        if (form && !form.querySelector('#botStakeAfterWin')) {
            // Adicionar campo missing se não existir
            const stakeAfterWinHtml = `
                <div class="mb-3">
                    <label for="botStakeAfterWin" class="form-label">Stake Após Win</label>
                    <input type="number" step="0.01" class="form-control" id="botStakeAfterWin" value="0.35">
                    <div class="form-text">Valor do stake após um trade vencedor</div>
                </div>
            `;
            const stakeField = form.querySelector('#botStake');
            if (stakeField) {
                stakeField.insertAdjacentHTML('afterend', stakeAfterWinHtml);
            }
        }
    }

    // Configurar evento para período de ticks
    const periodot = document.getElementById('periodot');
    if (periodot) {
        periodot.addEventListener('change', function () {
            maxTicks = parseInt(this.value);
            tickHistory = [];
            digitCounts = Array(10).fill(0);
            totalTicks = 0;
            updateDigitBars();
            addNotification(`Período alterado para ${this.value} ticks`, 'info');
        });
    }

    // Configurar controles do gráfico
    const chartDataPoints = document.getElementById('chartDataPoints');
    const clearChartBtn = document.getElementById('clearChartBtn');
    const exportChartBtn = document.getElementById('exportChartBtn');

    if (chartDataPoints) {
        chartDataPoints.addEventListener('input', function () {
            maxDataPoints = parseInt(this.value);
            const chartPointsLabel = document.getElementById('chartPointsLabel');
            if (chartPointsLabel) {
                chartPointsLabel.textContent = `${this.value} pontos`;
            }

            // Ajustar dados existentes
            if (chartData.length > maxDataPoints) {
                chartData = chartData.slice(-maxDataPoints);
                updateChart();
            }
        });
    }

    if (clearChartBtn) clearChartBtn.addEventListener('click', clearChart);
    if (exportChartBtn) exportChartBtn.addEventListener('click', exportChartData);

    // Mostrar modal após 1 segundo
    setTimeout(() => {
        showLoginModal();
    }, 1000);

    // EVENT LISTENERS PRINCIPAIS
    if (loginButton) {
        loginButton.addEventListener('click', async function () {
            const token = apiTokenInput ? apiTokenInput.value.trim() : '';
            const loginAccountType = document.getElementById('loginAccountType');
            const accountType = loginAccountType ? loginAccountType.value : 'demo';

            if (!token) {
                alert('❌ Por favor, cole seu token da Deriv');
                if (apiTokenInput) apiTokenInput.focus();
                return;
            }

            try {
                loginButton.disabled = true;
                loginButton.textContent = '🔄 Conectando...';

                console.log('🎯 Token sendo usado:', token.substring(0, 20) + '...');

                await connectToDeriv(token, accountType);

                // ✅ CONEXÃO BEM-SUCEDIDA
                closeLoginModalFunc();

                console.log('🎉 TUDO FUNCIONANDO!');

                // Mostrar notificação de sucesso
                addNotification('Conectado com sucesso! Recebendo dados...', 'success');

            } catch (error) {
                console.error('❌ Erro na conexão:', error);

                let errorMsg = error.message;

                if (errorMsg.includes('token') || errorMsg.includes('authorize')) {
                    errorMsg = '❌ Token inválido ou expirado.\n\n' +
                        '🔗 Gere um novo em: https://app.deriv.com/account/api-token\n\n' +
                        '✅ Certifique-se de:\n' +
                        '- Fazer login primeiro\n' +
                        '- Marcar TODAS as permissões\n' +
                        '- Copiar o token completo';
                } else if (errorMsg.includes('WebSocket') || errorMsg.includes('conexão')) {
                    errorMsg = '❌ Problema de rede.\n\n' +
                        '🛠 SOLUÇÕES IMEDIATAS:\n' +
                        '• 🌐 Use Google Chrome\n' +
                        '• 📱 Use VPN (Windscribe grátis)\n' +
                        '• 📶 Internet móvel\n' +
                        '• 🔄 F5 para recarregar';
                }

                alert(errorMsg);
                updateConnectionStatus('error', 'Falha na conexão');

            } finally {
                loginButton.disabled = false;
                loginButton.textContent = '🎯 Conectar & Começar';
            }
        });
    }

    // Configurar seleção de estratégias
    document.querySelectorAll('.strategy-option').forEach(option => {
        option.addEventListener('click', function (e) {
            e.preventDefault();
            const strategy = this.getAttribute('data-strategy');
            selectStrategy(strategy);
        });
    });

    // Configurar botões de trading (mantidos para compatibilidade)
    if (startTradingButton) startTradingButton.addEventListener('click', startTrading);
    if (stopTradingButton) stopTradingButton.addEventListener('click', stopTrading);
    if (configButton) configButton.addEventListener('click', showConfigModal);
    if (resetTradesButton) resetTradesButton.addEventListener('click', resetTrades);

    // Configurar modal de configurações
    if (saveConfig) saveConfig.addEventListener('click', saveTradingConfig);

    // Outros event listeners
    if (closeLoginModal) closeLoginModal.addEventListener('click', closeLoginModalFunc);
    if (closeConfigModal) closeConfigModal.addEventListener('click', closeConfigModalFunc);
    if (cancelLogin) cancelLogin.addEventListener('click', closeLoginModalFunc);
    if (cancelConfig) cancelConfig.addEventListener('click', closeConfigModalFunc);

    if (loginModal) {
        loginModal.addEventListener('click', function (e) {
            if (e.target === loginModal) {
                closeLoginModalFunc();
            }
        });
    }

    if (configModal) {
        configModal.addEventListener('click', function (e) {
            if (e.target === configModal) {
                closeConfigModalFunc();
            }
        });
    }

    // Iniciar relógio do servidor
    setInterval(updateServerTime, 1000);
    updateServerTime();

    // Salvar estado periodicamente
    setInterval(savePersistentConfig, 30000);

    // ✅ INICIAR MONITOR DE CONEXÃO
    setTimeout(() => {
        startConnectionMonitor();
    }, 10000); // Iniciar após 10 segundos

    // Dados demonstrativos
    setTimeout(simulateInitialTicks, 2000);

    // Ativar Bot R50 automaticamente após inicialização
    setTimeout(() => {
        if (!isBotRunning) {
            selectR50Strategy();
        }
    }, 3000);
});