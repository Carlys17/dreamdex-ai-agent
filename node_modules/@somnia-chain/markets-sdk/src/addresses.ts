// GENERATED FILE — do not edit by hand. Regenerate with `pnpm gen:addresses`
// (packages/sdk) whenever the deployment manifests under
// smart-contracts/deployments/<chainId>/<env>/ change, and commit the result.
// Mapping comes from @somnia-chain/deployments' buildDeployment via
// scripts/gen-addresses.mjs — never hand-edit an address here.
import type { SomniaMarketsAddresses } from "./config.js";
import * as LendClient from "./lend/client.js";

/**
 *  Somnia testnet (chainId 50312, env `testnet-development`) protocol addresses, baked in
 *  from the deployment manifests at release time — pass as `config.addresses`
 *  for a zero-setup start. The live view of every deployed contract is the
 *  explorer's /system page.
 */
export const SOMNIA_TESTNET_ADDRESSES: SomniaMarketsAddresses = {
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  binaryPoolImpl: "0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD",
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  clobFactory: "0xb2BE8EE02F96379DB75f01802384593EBa9bfF04",
  collateral: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
  collateralRouter: "0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C",
  marketCreator: "0x138CfA6b80475b8c03d7E468b2442278E51e645a",
  marketCreatorFactory: "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B",
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
  testUsdc: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
  lend: LendClient.SOMNIA_TESTNET_LEND,
};

/**
 *  Somnia mainnet (chainId 5031, env `mainnet-production`) protocol addresses, baked in
 *  from the deployment manifests at release time — pass as `config.addresses`
 *  for a zero-setup start. The live view of every deployed contract is the
 *  explorer's /system page.
 */
export const SOMNIA_MAINNET_ADDRESSES: SomniaMarketsAddresses = {
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  binaryPoolImpl: "0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD",
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  clobFactory: "0xb2BE8EE02F96379DB75f01802384593EBa9bfF04",
  collateral: "0x00000022dA000002656c64D9eA6011ea952D008A",
  collateralRouter: "0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C",
  marketCreator: "0xfe81C4e8EfFb7df27Eb21881f80AF2BF8DCF0c39",
  marketCreatorFactory: "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B",
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
  testUsdc: "0x00000022dA000002656c64D9eA6011ea952D008A",
  lend: LendClient.SOMNIA_MAINNET_LEND,
};
