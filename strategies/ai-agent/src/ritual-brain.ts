// Ritual on-chain LLM brain — calls precompile 0x0802 (zai-org/GLM-4.7-FP8).
// Falls back to heuristic on any error (caller wires that).
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { MarketSnapshot, AiDecision } from "./types.js";
import { isAiAction } from "./types.js";

const RITUAL_CHAIN_ID = 1979;
const LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802" as const;
const TEE_SERVICE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;
const MODEL_NAME = "zai-org/GLM-4.7-FP8";

const ritualChain = defineChain({
  id: RITUAL_CHAIN_ID,
  name: "Ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualchain.org"] } },
});

const TEE_REGISTRY_ABI = [
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view" as const,
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "checkValidity", type: "bool" },
    ],
    outputs: [
      {
        name: "services",
        type: "tuple[]",
        components: [
          {
            name: "node",
            type: "tuple",
            components: [
              { name: "paymentAddress", type: "address" },
              { name: "teeAddress", type: "address" },
              { name: "teeType", type: "uint8" },
              { name: "publicKey", type: "bytes" },
              { name: "endpoint", type: "string" },
              { name: "certPubKeyHash", type: "bytes32" },
              { name: "capability", type: "uint8" },
            ],
          },
          { name: "isValid", type: "bool" },
          { name: "workloadId", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

const PRECOMPILE_CALLED_TOPIC = keccak256(toHex("PrecompileCalled(address,bytes,bytes)"));

export interface RitualBrainConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
}

export async function ritualDecide(
  cfg: RitualBrainConfig,
  markets: MarketSnapshot[],
): Promise<AiDecision[]> {
  const account = privateKeyToAccount(cfg.privateKey);
  const publicClient = createPublicClient({
    chain: { ...ritualChain, rpcUrls: { default: { http: [cfg.rpcUrl] } } },
    transport: http(cfg.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: { ...ritualChain, rpcUrls: { default: { http: [cfg.rpcUrl] } } },
    transport: http(cfg.rpcUrl),
  });

  // discover a valid LLM executor
  const services = await publicClient.readContract({
    address: TEE_SERVICE_REGISTRY,
    abi: TEE_REGISTRY_ABI,
    functionName: "getServicesByCapability",
    args: [1, true],
  });
  const valid = services.find((s) => s.isValid);
  if (!valid) throw new Error("Ritual: no valid LLM executor");
  const executor = valid.node.teeAddress;

  const table = markets
    .map((m, i) =>
      `${i + 1}. ${m.symbol} | ${m.asset} | mid=${(m.mid ?? 0).toFixed(3)} ` +
      `last=${(m.lastPrice ?? 0).toFixed(3)} vol=${m.volume.toFixed(0)} ` +
      `secLeft=${m.secondsLeft}`,
    )
    .join("\n");

  const messages = JSON.stringify([
    {
      role: "system",
      content:
        "You are a quantitative prediction-market analyst. For each market, " +
        "estimate the fair P(Up). Respond ONLY with a JSON array, one object " +
        "per market: {symbol:string, fairProbability:number(0-1), " +
        "action:'BUY_YES'|'BUY_NO'|'HOLD', confidence:number(0-1), " +
        "reasoning:string}. No prose, no markdown fences.",
    },
    { role: "user", content: `Active DreamDEX Up/Down markets:\n${table}` },
  ]);

  const encoded = encodeAbiParameters(
    parseAbiParameters([
      "address, bytes[], uint256, bytes[], bytes,",
      "string, string, int256, string, bool, int256, string, string,",
      "uint256, bool, int256, string, bytes, int256, string, string, bool,",
      "int256, bytes, bytes, int256, int256, string, bool,",
      "(string,string,string)",
    ].join("")),
    [
      executor, [], 300n, [], "0x",
      messages, MODEL_NAME,
      0n, "", false, 4096n, "", "",
      1n, true, 0n, "medium", "0x", -1n, "auto", "",
      false, 300n, "0x", "0x", -1n, 1000n, "",
      false,
      ["", "", ""],
    ],
  );

  const hash = await walletClient.sendTransaction({
    to: LLM_PRECOMPILE,
    data: encoded,
    gas: 3_000_000n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  let responseHex: Hex | null = null;
  for (const log of receipt.logs) {
    if (log.topics[0] !== PRECOMPILE_CALLED_TOPIC) continue;
    const [addr, , out] = decodeAbiParameters(
      parseAbiParameters("address, bytes, bytes"),
      log.data,
    );
    if ((addr as string).toLowerCase() !== LLM_PRECOMPILE) continue;
    try {
      const [, actual] = decodeAbiParameters(parseAbiParameters("bytes, bytes"), out as Hex);
      responseHex = actual as Hex;
    } catch {
      responseHex = out as Hex;
    }
    break;
  }
  if (!responseHex) throw new Error("Ritual: no PrecompileCalled log");

  const [hasError, completionData, , errorMessage] = decodeAbiParameters(
    parseAbiParameters("bool, bytes, bytes, string, (string,string,string)"),
    responseHex,
  );
  if (hasError) throw new Error(`Ritual LLM error: ${errorMessage}`);

  const [, , , , , , , choicesData] = decodeAbiParameters(
    parseAbiParameters("string, string, uint256, string, string, string, uint256, bytes[], bytes"),
    completionData as Hex,
  );
  if (!choicesData || choicesData.length === 0) throw new Error("Ritual: no choices");
  const [, , messageData] = decodeAbiParameters(
    parseAbiParameters("uint256, string, bytes"),
    choicesData[0] as Hex,
  );
  const [, content] = decodeAbiParameters(
    parseAbiParameters("string, string, string, uint256, bytes[]"),
    messageData as Hex,
  );

  const text = content as string;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Ritual: not JSON: ${text.slice(0, 120)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(`Ritual: JSON parse failed: ${jsonMatch[0].slice(0, 120)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Ritual: expected a JSON array of decisions");

  // Validate + normalize each entry. Drop malformed rows instead of letting a
  // bad action string (e.g. "BUY_YES " or "buy_no") slip through as HOLD-and-fill.
  const out: AiDecision[] = [];
  for (const raw of parsed as Array<Record<string, unknown>>) {
    const symbol = typeof raw.symbol === "string" ? raw.symbol : "";
    const fair = Number(raw.fairProbability);
    const action = raw.action;
    if (!symbol || !isFinite(fair) || !isAiAction(action)) continue;
    const conf = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
    out.push({
      symbol,
      action,
      confidence: conf,
      fairProbability: Math.max(0, Math.min(1, fair)),
      edge: 0, // edge is recomputed in the executor against the live book
      size: Math.max(0, Math.min(5, Math.round(conf * 5))),
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    });
  }
  if (out.length === 0) throw new Error("Ritual: no valid decisions in response");
  return out;
}
