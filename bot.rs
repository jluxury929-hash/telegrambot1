use vader_sentimental::SentimentIntensityAnalyzer;
use ta::indicators::AverageTrueRange;
use ta::Next;
use std::io::{self, Write};

#[derive(Debug, PartialEq)]
enum TradeSignal {
    Higher,
    Lower,
    Neutral,
}

struct BettingBot {
    mode: String, // "AUTO" or "MANUAL"
    analyzer: SentimentIntensityAnalyzer,
    atr: AverageTrueRange,
}

impl BettingBot {
    fn new(mode: &str) -> Self {
        Self {
            mode: mode.to_string(),
            analyzer: SentimentIntensityAnalyzer::new(),
            atr: AverageTrueRange::new(14).unwrap(),
        }
    }

    // 1. NLP NEWS ANALYSIS
    fn get_sentiment(&self, headline: &str) -> f64 {
        let scores = self.analyzer.polarity_scores(headline);
        scores.compound
    }

    // 2. DECISION ENGINE (The World's Best Predictor Logic)
    fn analyze_market(&mut self, current_price: f64, high: f64, low: f64, news_headline: &str) -> TradeSignal {
        let sentiment = self.get_sentiment(news_headline);
        let volatility = self.atr.next((high, low, current_price));

        // Logic: If news is positive and volatility is picking up -> HIGHER
        if sentiment > 0.4 && volatility > 0.01 {
            TradeSignal::Higher
        } 
        // Logic: If news is negative and volatility is picking up -> LOWER
        else if sentiment < -0.4 && volatility > 0.01 {
            TradeSignal::Lower
        } 
        // Logic: If news is quiet and price is stable -> NEUTRAL
        else {
            TradeSignal::Neutral
        }
    }

    // 3. EXECUTION
    async fn execute_bet(&self, signal: TradeSignal) {
        match self.mode.as_str() {
            "AUTO" => {
                println!("🚀 [AUTO] Executing Real Money Bet: {:?}", signal);
                // Insert real Pocket Option API Call here
            },
            "MANUAL" => {
                print!("⚠️ [MANUAL] AI Suggests {:?}. Confirm bet? (y/n): ", signal);
                io::stdout().flush().unwrap();
                let mut input = String::new();
                io::stdin().read_line(&mut input).unwrap();
                if input.trim() == "y" {
                    println!("✅ Placing bet now...");
                }
            },
            _ => println!("Invalid Mode"),
        }
    }
}

#[tokio::main]
async fn main() {
    let mut bot = BettingBot::new("MANUAL"); // Change to "AUTO" for robot mode
    
    // Simulated Live Loop
    let mock_news = "Bitcoin price stabilizes as institutional interest slows.";
    let current_price = 45000.0;
    let high = 45010.0;
    let low = 44990.0;

    println!("--- Starting AI Market Analysis ---");
    let signal = bot.analyze_market(current_price, high, low, mock_news);
    bot.execute_bet(signal).await;
}
