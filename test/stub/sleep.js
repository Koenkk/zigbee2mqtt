const utils = require('../../lib/util/utils');
const spy = jest.spyOn(utils.default, 'sleep');

export function mock() {
    spy.mockImplementation(() => {});
}

export function restore() {
    spy.mockRestore();
}
