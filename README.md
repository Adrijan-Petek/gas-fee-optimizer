# Gas Fee Optimizer

Small utility that polls RPC endpoints for Base / Optimism / Arbitrum, writes timestamped JSON reports into `reports/`, and can post to a webhook.

## Features
- Multi-chain support: Base, Optimism, Arbitrum
- Fetches `eth_gasPrice` and uses `eth_feeHistory` when available to estimate priority fee
- Produces JSON reports in `reports/`
- Optional webhook posting
- GitHub Actions workflow for hourly scans

## Quickstart

1. Copy `.env.example` to `.env` and fill RPC endpoints (or set GitHub Secrets).
2. Install:
```bash
npm ci
```
3. Run once:
```bash
node src/gas-optimizer.js
```
4. Schedule via GitHub Actions (workflow provided).

## Report format
Example:
{
  "timestamp": "2025-09-28T12:00:00Z",
  "best_chain": "optimism",
  "recommendation": "Send your transactions on Optimism now for lowest fees.",
  "chains": {
    "base": {"gas_price_gwei": 12, "priority_fee_gwei": 1.2},
    "optimism": {"gas_price_gwei": 6, "priority_fee_gwei": 0.8},
    "arbitrum": {"gas_price_gwei": 9, "priority_fee_gwei": 1.0}
  }
}

## Optional extensions
- Use Blocknative / Alchemy / Chainstack APIs for reliable historical averages
- Build a Vercel dashboard using Chart.js or Recharts and fetch `reports/` artifacts from the repo or a small storage bucket
- Add thresholds & rule-based alerts in `config/gas.config.json`

## License
MIT
