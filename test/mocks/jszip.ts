export const mockJSZipFile = vi.fn();
export const mockJSZipGenerateAsync = vi.fn().mockReturnValue('THISISBASE64');

vi.mock('jszip', () => ({
    default: vi.fn().mockImplementation(() => {
        return {
            file: mockJSZipFile,
            generateAsync: mockJSZipGenerateAsync,
        };
    }),
}));
