import envPaths from 'env-paths';
console.log(envPaths('node-gyp', { suffix: '' }).cache)