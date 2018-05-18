const Controller = require('./lib/controller');

const controller = new Controller();
controller.start();

process.on('SIGINT', handleQuit);

function handleQuit() {
    controller.stop(() => process.exit());
}
