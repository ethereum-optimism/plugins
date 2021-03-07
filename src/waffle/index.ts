/* External Imports */
import { providers, Wallet } from 'ethers'
import { defaultAccounts } from 'ethereum-waffle'
import Ganache from 'ganache-core'

/* Internal Imports */
import { ganache } from '../ganache'

interface MockProviderOptions {
  ganacheOptions: Ganache.IProviderOptions
}

/**
 * WaffleV3 MockProvider wrapper.
 */
export class MockProvider extends providers.Web3Provider {
  constructor(private options?: MockProviderOptions) {
    super(
      ganache.provider({
        gasPrice: 0,
        accounts: defaultAccounts,
        ...options?.ganacheOptions,
      }) as any
    )
  }

  /**
   * Retrieves the wallet objects passed to this provider.
   * @returns List of wallet objects.
   */
  public getWallets(): Wallet[] {
    const items = this.options?.ganacheOptions.accounts ?? defaultAccounts
    return items.map((x: any) => new Wallet(x.secretKey, this))
  }
}

export const waffle = {
  MockProvider,
}

// We're iceboxing this plugin for a bit.
console.log(`
@eth-optimism/plugins/waffle: WARNING -- this plugin has been moved to
our develoment backlog and is not currently being actively maintained. Most
contracts should "just work" on the OVM. If you want to explicitly test on the
OVM you should run an L2 geth node. See the below link for more information:
https://community.optimism.io/docs/developers/integration.html
`)
