import type {AsyncZipOptions, AsyncZippable, FlateError} from "fflate";

/** `THISISBASE64` is valid base64, so it round-trips through `Buffer.from(...).toString("base64")` */
export const mockFflateZipContent = Uint8Array.from(Buffer.from("THISISBASE64", "base64"));

export const mockFflateZip = vi.fn((_data: AsyncZippable, _opts: AsyncZipOptions, cb: (error: FlateError | null, data: Uint8Array) => void): void => {
    cb(null, mockFflateZipContent);
});

/** Makes the next `zip` call report the given error through its callback */
export const mockFflateZipFailOnce = (error: Error): void => {
    mockFflateZip.mockImplementationOnce((_data, _opts, cb) => {
        cb(error as FlateError, new Uint8Array());
    });
};

vi.mock("fflate", () => ({
    zip: mockFflateZip,
}));
