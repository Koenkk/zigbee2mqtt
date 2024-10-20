export const mockJSZipFile = jest.fn();
export const mockJSZipGenerateAsync = jest.fn().mockReturnValue('THISISBASE64');

jest.mock('jszip', () =>
    jest.fn().mockImplementation(() => {
        return {
            file: mockJSZipFile,
            generateAsync: mockJSZipGenerateAsync,
        };
    }),
);
