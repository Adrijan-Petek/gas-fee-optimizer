/**
 * Gas Fee Optimizer
 * - Fetches current gas info from provided RPC endpoints (Base, Optimism, Arbitrum)
 * - Produces a JSON report in reports/
 *
 * Requires:
 *   npm install ethers axios
 *
 * Usage:
 *   node src/gas-optimizer.js
 *
 * Environment variables (.env):
 *   RPC_BASE
 *   RPC_OPTIMISM
 *   RPC_ARBITRUM
 *   WEBHOOK_URL (optional)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const axios = require('axios');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const CHAINS = {
  base: { name: 'Base', rpcEnv: 'RPC_BASE' },
  optimism: { name: 'Optimism', rpcEnv: 'RPC_OPTIMISM' },
  arbitrum: { name: 'Arbitrum', rpcEnv: 'RPC_ARBITRUM' }
};

async function getProvider(rpcUrl) {
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

// Fetch eth_gasPrice (fallback) and try feeHistory for priority fee estimate
async function fetchGasData(provider) {
  try {
    const gasPrice = await provider.getGasPrice(); // BigNumber (wei)
    // try eth_feeHistory to estimate priority fee (tip)
    let priorityFeeGwei = null;
    try {
      // request last 5 blocks, reward percentiles [50]
      const latest = await provider.getBlockNumber();
      const blockCount = 5;
      const res = await provider.send('eth_feeHistory', [
        ethers.utils.hexValue(blockCount),
        ethers.utils.hexValue(latest),
        [50]
      ]);
      // res.reward is array of arrays for blocks, pick median percentile
      if (res && res.reward && res.reward.length) {
        const rewards = res.reward.map(r => r && r[0] ? ethers.BigNumber.from(r[0]) : null).filter(Boolean);
        if (rewards.length) {
          const avgReward = rewards.reduce((a,b)=>a.add(b), ethers.BigNumber.from(0)).div(rewards.length);
          priorityFeeGwei = parseFloat(ethers.utils.formatUnits(avgReward, 'gwei'));
        }
      }
    } catch (e) {
      // feeHistory may not be available on some L2 RPCs — ignore silently
    }

    return {
      gas_price_gwei: parseFloat(ethers.utils.formatUnits(gasPrice, 'gwei')),
      priority_fee_gwei: priorityFeeGwei // may be null
    };
  } catch (err) {
    return { error: String(err) };
  }
}

function chooseBestChain(chains) {
  // Choose chain with lowest (gas_price + priority_fee) when priority available; otherwise by gas_price
  let best = null;
  for (const [key, val] of Object.entries(chains)) {
    if (val.error) continue;
    const pf = (val.priority_fee_gwei===null || val.priority_fee_gwei===undefined) ? 0 : val.priority_fee_gwei;
    const total = val.gas_price_gwei + pf;
    if (!best || total < best.score) {
      best = { chain: key, score: total };
    }
  }
  return best ? best.chain : null;
}

async function main() {
  const timestamp = new Date().toISOString();
  const results = {};
  for (const [key, meta] of Object.entries(CHAINS)) {
    const rpc = process.env[meta.rpcEnv];
    if (!rpc) {
      results[key] = { error: `Missing env ${meta.rpcEnv}` };
      continue;
    }
    const provider = await getProvider(rpc);
    results[key] = await fetchGasData(provider);
  }

  const best_chain = chooseBestChain(results);
  const recommendation = best_chain ? `Send your transactions on ${best_chain} now for lowest fees.` : 'No recommendation (insufficient data).';

  const report = {
    timestamp,
    best_chain,
    recommendation,
    chains: results
  };

  const filename = path.join(REPORTS_DIR, 'report-' + timestamp.replace(/[:.]/g,'-') + '.json');
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log('Wrote', filename);

  // optional webhook
  const webhook = process.env.WEBHOOK_URL;
  if (webhook) {
    try {
      await axios.post(webhook, report, { headers: { 'Content-Type': 'application/json' } });
      console.log('Posted to webhook');
    } catch (e) {
      console.warn('Webhook post failed:', e.message || e);
    }
  }

  // output to stdout as well
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

