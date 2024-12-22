export const mockDebounce = jest.fn((fn) => fn);

jest.mock('debounce', () => mockDebounce);
