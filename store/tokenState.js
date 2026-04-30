const tokenStates = new Map();

function getState(address) {
  return tokenStates.get(address) || null;
}

function updateState(address, nextState) {
  tokenStates.set(address, {
    ...getState(address),
    ...nextState,
  });
  return tokenStates.get(address);
}

module.exports = {
  getState,
  updateState,
};
