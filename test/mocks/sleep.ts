import utils from '../../lib/util/utils';

const spy = vi.spyOn(utils, 'sleep');

export function mock(): void {
    spy.mockImplementation(vi.fn());
}

export function restore(): void {
    spy.mockRestore();
}
