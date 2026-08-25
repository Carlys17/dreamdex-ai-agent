// The bridge registry — the deployed Hyperlane lane, as data.
//
// SOURCE OF TRUTH: github.com/somnia-chain/hyperlane-bridge-infra —
// `docs/deployments/somnia-testnet-hideki-testnet.md` (the deployment record),
// `registry/chains/<chain>/{metadata,addresses}.yaml` (core contracts) and
// `registry/deployments/warp_routes/<SYMBOL>/*-config.yaml` (the routes). Adding a
// token or a lane there is a DATA change here — the shapes below already carry it.
//
// VERIFIED ON-CHAIN (2026-07-30, both networks; re-verified 2026-08-11 after the
// bridge's 2026-08 latency work — relayer-side only, no router/core address moved,
// same validator set): every router and ERC-20 has code;
// every router's `owner()` is the warp-deployer, `mailbox()` and
// `interchainSecurityModule()` match the core deployment, and `routers(otherDomain)`
// returns the counterpart in BOTH directions for all five routes. Decimals were read
// from the canonical token AND the synthetic (WBTC really is 8 on both).
// `quoteGasPayment(otherDomain)` is exactly 0 on all ten routers, and a
// `transferRemote` simulated with `eth_call` on the native route returned a real
// message id. See test/bridge.e2e.test.ts, which re-checks all of it on demand.
//
// NOT IN HERE, DELIBERATELY: the deployer / validator / relayer / treasury EOAs
// from the deployment record. They are operator identities, not client data — the
// one exception is the validator set, which is what the ISM's trust model IS.

import type { Address } from "viem";
import { ChainId } from "../chainId.js";
import { BridgeToken, type BridgeDetails, type BridgeNetworkDetails, type BridgeRoute, type BridgeTokenDetails } from "./types.js";

/** Registry name → chain id, the way hyperlane-bridge-infra names these networks. */
const HYPERLANE_NAME = {
  [ChainId.somniaShannon]: "somniatestnet",
  [ChainId.hidekiTestnet]: "hidekitestnet",
} as const;

/**
 *  Every (token, network) pair with a live route, keyed `${token}:${chainId}`.
 *  Reached through {@link getBridgeToken} / {@link listBridgeTokens}.
 */
const BRIDGE_TOKENS: readonly BridgeTokenDetails[] = [
  // ---- STT: native on BOTH sides. No wrapped token anywhere; delivery pays out of
  // the destination router's own balance, so each side needs seeded liquidity.
  {
    token: BridgeToken.STT,
    chainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    model: "native",
    router: "0xB04373932bc05347757da6b8a226d7657584aB35",
    address: null,
    decimals: 18,
    name: "Somnia Test Token",
    destinations: [ChainId.hidekiTestnet],
    requiresDestinationLiquidity: true,
  },
  {
    token: BridgeToken.STT,
    chainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    model: "native",
    router: "0xB04373932bc05347757da6b8a226d7657584aB35",
    address: null,
    decimals: 18,
    name: "Somnia Test Token",
    destinations: [ChainId.somniaShannon],
    requiresDestinationLiquidity: true,
  },

  // ---- USDso: collateral on Shannon (its home), synthetic on Hideki.
  {
    token: BridgeToken.USDso,
    chainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    model: "collateral",
    router: "0x7BDe621181e9889D6824b2CF789856b58b79c29D",
    address: "0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171",
    decimals: 18,
    name: "USDso",
    destinations: [ChainId.hidekiTestnet],
    requiresDestinationLiquidity: false,
  },
  {
    token: BridgeToken.USDso,
    chainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    model: "synthetic",
    router: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
    // A HypERC20 synthetic IS its own ERC-20 — the router address is the token.
    address: "0xed7993A74dAe1e6656B704A424DcD8711aAf4F72",
    decimals: 18,
    name: "USDso",
    destinations: [ChainId.somniaShannon],
    requiresDestinationLiquidity: false,
  },

  // ---- WBTC: 8 decimals on BOTH sides — the synthetic inherited them correctly.
  {
    token: BridgeToken.WBTC,
    chainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    model: "collateral",
    router: "0x04CaeE4642Ed7dA2C94AcF83751004e3FdE97a58",
    address: "0x4e85DC48a70DA1298489d5B6FC2492767d98f384",
    decimals: 8,
    name: "Wrapped Bitcoin",
    destinations: [ChainId.hidekiTestnet],
    requiresDestinationLiquidity: false,
  },
  {
    token: BridgeToken.WBTC,
    chainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    model: "synthetic",
    router: "0xE97673c634EF069Ecc0d95425Cc8e62F99D27E0E",
    address: "0xE97673c634EF069Ecc0d95425Cc8e62F99D27E0E",
    decimals: 8,
    name: "Wrapped Bitcoin",
    destinations: [ChainId.somniaShannon],
    requiresDestinationLiquidity: false,
  },

  // ---- WETH
  {
    token: BridgeToken.WETH,
    chainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    model: "collateral",
    router: "0x7b0353C5BAE642194271eE14e5Ee9e7BA10D24F9",
    address: "0x4d8E02BBfCf205828A8352Af4376b165E123D7b0",
    decimals: 18,
    name: "Wrapped ETH",
    destinations: [ChainId.hidekiTestnet],
    requiresDestinationLiquidity: false,
  },
  {
    token: BridgeToken.WETH,
    chainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    model: "synthetic",
    router: "0x56115cB05652Ac6117Caa1152B630986a51d36b5",
    address: "0x56115cB05652Ac6117Caa1152B630986a51d36b5",
    decimals: 18,
    name: "Wrapped ETH",
    destinations: [ChainId.somniaShannon],
    requiresDestinationLiquidity: false,
  },

  // ---- HBTT: the throwaway token the lane was verified with.
  {
    token: BridgeToken.HBTT,
    chainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    model: "collateral",
    router: "0x0528dD3beEf917DB06A5249C9Ea84b9D702B3A84",
    address: "0xE4bd7cC81ea8748a5A9f6FF803670c423C269469",
    decimals: 18,
    name: "Hyperlane Bridge Test Token",
    destinations: [ChainId.hidekiTestnet],
    requiresDestinationLiquidity: false,
  },
  {
    token: BridgeToken.HBTT,
    chainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    model: "synthetic",
    router: "0x0528dD3beEf917DB06A5249C9Ea84b9D702B3A84",
    address: "0x0528dD3beEf917DB06A5249C9Ea84b9D702B3A84",
    decimals: 18,
    name: "Hyperlane Bridge Test Token",
    destinations: [ChainId.somniaShannon],
    requiresDestinationLiquidity: false,
  },
];

/** The Hyperlane core deployment per bridged network. */
const BRIDGE_NETWORKS: readonly BridgeNetworkDetails[] = [
  {
    chainId: ChainId.somniaShannon,
    domainId: ChainId.somniaShannon,
    network: HYPERLANE_NAME[ChainId.somniaShannon],
    displayName: "Somnia Testnet",
    mailbox: "0x46bA2807Dbada25372176381557b55eF1F22e0A9",
    interchainSecurityModule: "0xa831F40fd0ABd1a6E8C4b447Ab9Eb65B6f0B1B6c",
    merkleTreeHook: "0xD7C2E95c62De3c0ad95b2C1cf08E4B85DF6b332D",
    validatorAnnounce: "0xB0834b2da92b646548515ACb87Da2E9BdbcaF44e",
    interchainAccountRouter: "0x1384Ed70b0f9E9Ab6d058d8c4361F073910722eF",
    proxyAdmin: "0x735653D27Cd6328189eD1B62C2b3a7201A1eD775",
    interchainGasPaymaster: null,
    tokens: [BridgeToken.STT, BridgeToken.USDso, BridgeToken.WBTC, BridgeToken.WETH, BridgeToken.HBTT],
  },
  {
    chainId: ChainId.hidekiTestnet,
    domainId: ChainId.hidekiTestnet,
    network: HYPERLANE_NAME[ChainId.hidekiTestnet],
    displayName: "Hideki Testnet",
    mailbox: "0xD7C2E95c62De3c0ad95b2C1cf08E4B85DF6b332D",
    interchainSecurityModule: "0x852616e634169da77d9390e2dcd5E95227B163a3",
    merkleTreeHook: "0xBBCc0912b06AaA84516Cd9Bcc199fe2fD5140e9e",
    validatorAnnounce: "0xc1a30607Be1793A42a0E6dFb8e709e82b351422D",
    interchainAccountRouter: "0x4fB05c3AbB116EfC10579360458D5902fc43DF06",
    proxyAdmin: "0x46bA2807Dbada25372176381557b55eF1F22e0A9",
    interchainGasPaymaster: null,
    tokens: [BridgeToken.STT, BridgeToken.USDso, BridgeToken.WBTC, BridgeToken.WETH, BridgeToken.HBTT],
  },
];

const LANE = `${HYPERLANE_NAME[ChainId.somniaShannon]}-${HYPERLANE_NAME[ChainId.hidekiTestnet]}`;

const ROUTES: readonly BridgeRoute[] = (
  [BridgeToken.STT, BridgeToken.USDso, BridgeToken.WBTC, BridgeToken.WETH, BridgeToken.HBTT] as const
).map((token) => ({
  id: `${token}/${LANE}`,
  token,
  chainIds: [ChainId.somniaShannon, ChainId.hidekiTestnet] as [number, number],
}));

/**
 *  The Somnia token bridge: one Hyperlane lane, **Somnia Testnet ↔ Hideki Testnet**,
 *  carrying five token routes.
 *
 *  > ⚠️ **`status: "dev-test"`.** A single validator, a threshold-1 ISM and EOA
 *  > owners — one key is the entire bridge. Do not put real funds behind it.
 *
 *  Delivery gas is paid by the relayer, unmetered
 *  ({@link BridgeDetails.relayerPaysDestinationGas}): a sender attaches nothing for
 *  it, and a drained relayer means transfers are accepted on the origin but not
 *  delivered until it is refunded — escrowed, not lost.
 *
 * ```ts
 * import { SOMNIA_BRIDGE } from "@somnia-chain/markets-sdk/chains";
 *
 * SOMNIA_BRIDGE.tokens;   // ["STT", "USDso", "WBTC", "WETH", "HBTT"]
 * SOMNIA_BRIDGE.chainIds; // [50312, 50383]
 * ```
 */
export const SOMNIA_BRIDGE: BridgeDetails = {
  id: LANE,
  displayName: "Somnia Testnet ↔ Hideki Testnet",
  chainIds: [ChainId.somniaShannon, ChainId.hidekiTestnet],
  tokens: [BridgeToken.STT, BridgeToken.USDso, BridgeToken.WBTC, BridgeToken.WETH, BridgeToken.HBTT],
  routes: [...ROUTES],
  status: "dev-test",
  security: { validators: ["0x528374d9AD571766a8a380002b0aceFE535DC2b1"], threshold: 1 },
  relayerPaysDestinationGas: true,
  docs: "https://github.com/somnia-chain/hyperlane-bridge-infra/blob/main/docs/deployments/somnia-testnet-hideki-testnet.md",
};

/**
 *  Token details for one token on one network — the router to call, what the sender
 *  holds, its decimals, and where it can go.
 *
 * ```ts
 * import { BridgeToken, ChainId, getBridgeToken } from "@somnia-chain/markets-sdk/chains";
 *
 * const wbtc = getBridgeToken(BridgeToken.WBTC, ChainId.somniaShannon);
 * wbtc?.model;    // "collateral" — approve `wbtc.address` to `wbtc.router` first
 * wbtc?.decimals; // 8, NOT 18
 * ```
 *
 *  @param token Token symbol.
 *  @param chainId Chain id of the network (also the Hyperlane domain id).
 *  @returns The details, or `null` when that token has no route on that network.
 */
export function getBridgeToken(token: BridgeToken, chainId: number): BridgeTokenDetails | null {
  return BRIDGE_TOKENS.find((t) => t.token === token && t.chainId === chainId) ?? null;
}

/**
 *  Every bridgeable token, optionally narrowed to one network.
 *
 *  @param chainId Only tokens with a route on this network. Omit for all of them.
 *  @returns Matching token details; `[]` when the network isn't bridged.
 */
export function listBridgeTokens(chainId?: number): BridgeTokenDetails[] {
  return BRIDGE_TOKENS.filter((t) => chainId === undefined || t.chainId === chainId);
}

/**
 *  The Hyperlane core deployment on one network — mailbox, ISM, hooks — plus the
 *  tokens it carries.
 *
 * ```ts
 * import { ChainId, getBridgeNetwork } from "@somnia-chain/markets-sdk/chains";
 *
 * getBridgeNetwork(ChainId.hidekiTestnet)?.mailbox;
 * getBridgeNetwork(ChainId.somniaMainnet);              // null — not bridged yet
 * ```
 *
 *  @param chainId Chain id to look up.
 *  @returns The network's bridge deployment, or `null` if it isn't bridged.
 */
export function getBridgeNetwork(chainId: number): BridgeNetworkDetails | null {
  return BRIDGE_NETWORKS.find((n) => n.chainId === chainId) ?? null;
}

/** Every network with a bridge deployment. */
export function listBridgeNetworks(): BridgeNetworkDetails[] {
  return [...BRIDGE_NETWORKS];
}

/**
 *  Is this chain id part of the bridge? A `true` here is what makes
 *  {@link getBridgeNetwork} non-null.
 *
 *  @param chainId Chain id to test.
 */
export function isBridgeNetwork(chainId: number): boolean {
  return BRIDGE_NETWORKS.some((n) => n.chainId === chainId);
}

/**
 *  The route carrying one token between two networks, in either order.
 *
 *  Bridging is **not transitive** — a chain must be a member of the token's route.
 *
 *  @param token Token symbol.
 *  @param chainIdA One end of the lane.
 *  @param chainIdB The other end.
 *  @returns The route, or `null` if that token doesn't connect those two networks.
 */
export function getBridgeRoute(token: BridgeToken, chainIdA: number, chainIdB: number): BridgeRoute | null {
  return (
    SOMNIA_BRIDGE.routes.find(
      (r) => r.token === token && r.chainIds.includes(chainIdA) && r.chainIds.includes(chainIdB) && chainIdA !== chainIdB,
    ) ?? null
  );
}

/** The warp router that moves `token` on `chainId`, or `null`. */
export function getBridgeRouter(token: BridgeToken, chainId: number): Address | null {
  return getBridgeToken(token, chainId)?.router ?? null;
}
