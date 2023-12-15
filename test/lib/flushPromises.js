const globalSetImmediate = setImmediate;
module.exports = () => new Promise(globalSetImmediate);
