/**
 * Where to look at a testnet contract in a block explorer. The id is checked first: the link is built
 * from a string that ends up in an href, so anything that is not a contract address is refused.
 */
export function explorerUrl(contractId) {
  if (typeof contractId !== 'string' || !/^C[A-Z2-7]{55}$/.test(contractId)) {
    throw new Error('not a contract address');
  }
  return `https://stellar.expert/explorer/testnet/contract/${contractId}`;
}
