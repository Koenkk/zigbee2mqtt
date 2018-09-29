const logger = require('./util/logger');
const data = require('./util/data');
const fs = require('fs');

const saveInterval = 1000 * 60 * 5; // 5 minutes

class State {
    constructor() {
        this.state = {};
        this.file = data.joinPath('state.json');
        this._load();

        // Save the state on every interval
        this.timer = setInterval(() => this.save(), saveInterval);
    }

    _load() {
        if (fs.existsSync(this.file)) {
            try {
                this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                logger.debug(`Loaded state from file ${this.file}`);
            } catch (e) {
                logger.debug(`Failed to load state from file ${this.file} (corrupt file?)`);
            }
        } else {
            logger.debug(`Can't load state from file ${this.file} (doesn't exsist)`);
        }
    }

    save() {
        logger.debug(`Saving state to file ${this.file}`);
        const json = JSON.stringify(this.state, null, 4);
        fs.writeFileSync(this.file, json, 'utf8');
    }

    exists(ID) {
        return this.state.hasOwnProperty(ID);
    }

    get(ID) {
        return this.state[ID];
    }

    set(ID, state) {
        this.state[ID] = state;
    }

    remove(ID) {
        if (this.exists(ID)) {
            delete this.state[ID];
        }
    }
}

module.exports = State;
