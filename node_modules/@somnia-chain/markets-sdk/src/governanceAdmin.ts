// The protocol-admin-only governance surface on BinaryMarketsModule. A
// factory-minted oracle adapter is INERT — it can be funded and armed by its
// operator, but it cannot back a market until the MODULE OWNER approves it here.
// This is the one seam an operator can't self-serve: a UI shows
// `setAdapterApproved` only to the protocol admin (gate it with
// `isModuleOwner`). Same signer doctrine as operatorAdmin.ts.

import type { Address, PublicClient } from "viem";
import { NotConfiguredError } from "./errors.js";
import type { ClientConfig } from "./config.js";
import * as MachineryAbi from "./machineryAbi.js";
import type { MachineryAdminConfig } from "./machineryWriter.js";
import * as MachineryWriter from "./machineryWriter.js";
import type { TxResult } from "./trade.js";

export type { MachineryAdminConfig as GovernanceAdminConfig };

/** Params for {@link GovernanceAdmin.setAdapterApproved}. */
export interface SetAdapterApprovedParams {
  /** The oracle adapter to approve or revoke on BinaryMarketsModule. */
  adapter: Address;
  /** `true` approves (adapter can back new markets); `false` revokes. */
  approved: boolean;
  /** Gas ceiling for this tx; overrides the config default. */
  gas?: bigint;
}

/**
 *  The protocol-admin governance surface on BinaryMarketsModule — the one seam
 *  an operator can't self-serve (see the module notes above). Built via
 *  `client.createGovernanceAdmin(config)` with a signer
 *  ({@link GovernanceAdminConfig}); the write is module-owner only, the reads
 *  are open chain point reads.
 */
export interface GovernanceAdmin {
  /**
   *  Approve (or revoke) an oracle adapter on the module — the inert→live gate
   *  for a factory-minted adapter. MODULE-OWNER ONLY: reverts for any other
   *  caller, so a UI shows this only to the protocol admin (see
   *  {@link GovernanceAdmin.isModuleOwner}).
   */
  setAdapterApproved(p: SetAdapterApprovedParams): Promise<TxResult>;
  /** The module owner (the protocol admin). Needs `config.addresses.binaryModule`. */
  getModuleOwner(): Promise<Address>;
  /**
   *  Whether `addr` is the module owner — gate the `setAdapterApproved` UI on
   *  this. Needs `config.addresses.binaryModule`.
   */
  isModuleOwner(addr: Address): Promise<boolean>;
}

/** @internal Reached via `client.createGovernanceAdmin(config)`. */
export interface GovernanceAdminDeps {
  getConfig: () => ClientConfig;
  getClient: () => PublicClient;
}

export function createGovernanceAdminWithDeps(
  config: MachineryAdminConfig,
  deps: GovernanceAdminDeps,
): GovernanceAdmin {
  const binaryModule = deps.getConfig().addresses?.binaryModule;
  const writer = MachineryWriter.makeMachineryWriter(config, deps, "createGovernanceAdmin");
  const pc = () => deps.getClient();

  function requireModule(): Address {
    if (!binaryModule) {
      throw new NotConfiguredError("config.addresses.binaryModule", "createGovernanceAdmin");
    }
    return binaryModule;
  }

  async function getModuleOwner(): Promise<Address> {
    return (await pc().readContract({
      address: requireModule(),
      abi: MachineryAbi.moduleGovernanceAbi,
      functionName: "owner",
    }));
  }

  return {
    async setAdapterApproved(p: SetAdapterApprovedParams): Promise<TxResult> {
      return writer.execute({
        to: requireModule(),
        abi: MachineryAbi.moduleGovernanceAbi,
        functionName: "setAdapterApproved",
        args: [p.adapter, p.approved],
        gas: p.gas,
      });
    },

    getModuleOwner,

    async isModuleOwner(addr: Address): Promise<boolean> {
      const owner = await getModuleOwner();
      return owner.toLowerCase() === addr.toLowerCase();
    },
  };
}
