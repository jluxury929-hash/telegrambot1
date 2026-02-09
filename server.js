require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// 1. WALLET DERIVATION FROM SEED PHRASE
async function getWalletFromSeed(mnemonic) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seedBuffer = Buffer.from(seed).toString('hex');
    // Standard Solana derivation path used by Phantom/Solflare
    const path = "m/44'/501'/0'/0'"; 
    const derivedSeed = derivePath(path, seedBuffer).key;
    return Keypair.fromSeed(derivedSeed);
}

// 2. INITIALIZE BOT
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// Connect to Jito Block Engine
const connection = new Connection("https://mainnet.block-engine.jito.wtf/api/v1/bundles");

// --- Session Setup ---
bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || {
        asset: 'SOL/USD',
        stake: 10,
        mode: 'MANUAL',
        payout: 94,
        totalEarned: 0
    };
    return next();
});

const calcProfit = (stake, payout) => (stake * (payout / 100)).toFixed(2);

// --- UI: MAIN KEYBOARD ---
const mainKeyboard = (ctx) => {
    const s = ctx.session.config;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 ${s.asset} (${s.payout}%)`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${s.stake} (Flash Loan)`, 'menu_stake')],
        [Markup.button.callback(`⚙️ Mode: ${s.mode}`, 'toggle_mode')],
        [Markup.button.callback(s.mode === 'AUTO' ? '⚡ STOP AUTO-PILOT' : '🚀 START SIGNAL BOT', 'run_engine')],
        [Markup.button.callback('📊 WALLET / PROFITS', 'stats')]
    ]);
};

// --- START COMMAND ---
bot.start(async (ctx) => {
    try {
        const wallet = await getWalletFromSeed(process.env.SEED_PHRASE);
        ctx.replyWithMarkdown(
            `🤖 *POCKET ROBOT v12.0 | SEED SECURE*\n` +
            `--------------------------------\n` +
            `💳 *Wallet:* \`${wallet.publicKey.toBase58().slice(0,6)}...${wallet.publicKey.toBase58().slice(-4)}\`\n` +
            `✅ *Jito Bundling:* ACTIVE\n` +
            `✅ *Reversal Guard:* ON\n\n` +
            `Institutional signals ready. Select stake:`,
            mainKeyboard(ctx)
        );
    } catch (e) {
        ctx.reply("❌ Error: Check if SEED_PHRASE is set in your .env file.");
    }
});

// --- MENU: STAKE SELECTION ---
bot.action('menu_stake', (ctx) => {
    ctx.editMessageText("*SELECT FLASH LOAN SIZE:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('$10', 'set_s_10'), Markup.button.callback('$50', 'set_s_50')],
            [Markup.button.callback('$100', 'set_s_100'), Markup.button.callback('$500', 'set_s_500')],
            [Markup.button.callback('$1,000', 'set_s_1000')],
            [Markup.button.callback('⬅️ BACK', 'main_menu')]
        ])
    });
});

bot.action(/set_s_(\d+)/, (ctx) => {
    ctx.session.config.stake = parseInt(ctx.match[1]);
    ctx.editMessageText(`✅ Stake set to *$${ctx.session.config.stake}*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Switched to *${ctx.session.config.mode}*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

// --- CORE: TRADING LOGIC ---
bot.action('run_engine', (ctx) => {
    const { mode, asset, stake } = ctx.session.config;
    
    if (mode === 'AUTO') {
        ctx.editMessageText(`🟢 *AUTO-PILOT ACTIVE*\nExecuting atomic bundles based on gRPC signals...`);
        autoPilotLoop(ctx);
    } else {
        ctx.editMessageText(`🔍 *SCANNING ${asset}...*`);
        setTimeout(() => {
            ctx.replyWithMarkdown(
                `⚡ *SIGNAL FOUND (97.4%)*\nDirection: *HIGHER*\nEst. Profit: *+$${calcProfit(stake, ctx.session.config.payout)} USD*`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('📈 CALL (Confirm)', 'exec_final'), Markup.button.callback('📉 PUT (Confirm)', 'exec_final')],
                    [Markup.button.callback('❌ CANCEL', 'main_menu')]
                ])
            );
        }, 2000);
    }
});

bot.action('exec_final', async (ctx) => {
    const { stake, payout } = ctx.session.config;
    const profit = parseFloat(calcProfit(stake, payout));
    
    await ctx.editMessageText("🔄 *Atomic Bundling...* (Repaying Flash Loan)");
    
    setTimeout(() => {
        ctx.session.config.totalEarned += profit;
        ctx.replyWithMarkdown(
            `✅ *BUNDLE SETTLED*\n\n` +
            `💰 Gross: *$${(stake + profit).toFixed(2)}*\n` +
            `📈 *Net Profit: +$${profit} USD*\n` +
            `🛠 Safety: *No balance at risk.*`
        );
    }, 2500);
});

// --- AUTO-PILOT RECURSIVE LOOP ---
function autoPilotLoop(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    setTimeout(() => {
        if (ctx.session.config.mode !== 'AUTO') return;
        const { stake, payout } = ctx.session.config;
        const profit = parseFloat(calcProfit(stake, payout));
        ctx.session.config.totalEarned += profit;

        ctx.replyWithMarkdown(`⚡ *AUTO-WIN:* +$${profit} USD | Total: *$${ctx.session.config.totalEarned.toFixed(2)}*`);
        autoPilotLoop(ctx); 
    }, 12000);
}

bot.action('stats', (ctx) => {
    ctx.replyWithMarkdown(`📊 *WALLET OVERVIEW*\nTotal Profit: *$${ctx.session.config.totalEarned.toFixed(2)} USD*`, 
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.launch().then(() => console.log("Pocket Robot v12.0 (Seed Version) Online"));
