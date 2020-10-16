function uint2bytes(x) {
  if (x < 0) {
    throw new Error('Input number is less than 0!');
  }

  const bytes = [];
  do {
    bytes.push(x & 255);
    x = x >> 8;
  } while (x);
  return bytes.reverse();
}

async function getDeployGasUsed(instance) {
  const receipt = await web3.eth.getTransactionReceipt(
    instance.transactionHash
  );
  return receipt.gasUsed;
}

function getCallGasUsed(tx) {
  return tx.receipt.gasUsed;
}

async function mineBlockUntil(deadline, sendAccount) {
  let block = await web3.eth.getBlock('latest');
  while (block.number <= deadline) {
    await web3.eth.sendTransaction({ from: sendAccount }); // dummy block consumer
    block = await web3.eth.getBlock('latest');
  }
}

module.exports = {
  uint2bytes,
  getDeployGasUsed,
  getCallGasUsed,
  mineBlockUntil
};
