import { defineChain } from "viem";

/**
 *  **Hideki** testnet (chain id `50383`) — the low-latency Tokyo network.
 *  Validators sit in one region to keep validator-to-validator latency low, so
 *  blocks land every **10 ms** (~100 blocks/s) instead of Shannon's 100 ms.
 *  Native token is **STT**.
 *
 *  One live-verified oddity, so nobody "fixes" it: Hideki's **network id is not
 *  its chain id**. `eth_chainId` answers `0xc4cf` (50383) — the value here, the
 *  one wallets and signatures use — while `net_version` answers `50000258`
 *  (`0x2faf182`). Shannon's and mainnet's two ids are equal; Hideki's are not.
 *
 *  The 10 ms cadence is what makes this the interesting target for latency work:
 *  a `blockTime` of 10 is what viem uses to size its own polling/waiting
 *  heuristics, and the SDK's live tail sees ~10x the block rate of Shannon.
 *
 *  Multicall3 lives at a NON-canonical address (deployed 2026-08-10 by the
 *  bridge infra, byte-identical to the canonical runtime). The canonical
 *  `0xcA11bde0…` route is permanently unreachable here: Somnia chains charge
 *  ~4,928 gas per deployed byte, so the presigned "Nick's method" transaction
 *  (fixed 500k gas limit) cannot deploy Multicall3's 3,808-byte runtime, and
 *  the presigned deployers' nonce-0 transactions have already been burned on
 *  these networks. The same address holds the same bytes on Shannon — one
 *  deployer key at the same nonce on both chains — but Shannon's definition
 *  keeps its earlier deployment for parity with viem's `somniaTestnet`.
 *
 *  No public block explorer is known for Hideki, so that field stays unset.
 */
export const hidekiTestnet = /*#__PURE__*/ defineChain({
  id: 50383,
  name: "Hideki Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  blockTime: 10,
  rpcUrls: {
    default: {
      http: ["https://api.hideki.infra.testnet.somnia.network"],
      webSocket: ["wss://api.hideki.infra.testnet.somnia.network/ws"],
    },
  },
  contracts: {
    multicall3: {
      address: "0x540B091b608f54E603c5dC19F6b2d955e1d2D131",
      blockCreated: 265712387,
    },
  },
  testnet: true,
});
