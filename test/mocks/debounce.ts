export const mockDebounce = vi.fn((fn) => fn);

vi.mock('debounce', () => ({
    default: mockDebounce,
}));
