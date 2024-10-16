import utils from '../../lib/util/utils';

const spy = jest.spyOn(utils, 'sleep');

export function mock(): void {
    spy.mockImplementation();
}

export function restore(): void {
    spy.mockRestore();
}
