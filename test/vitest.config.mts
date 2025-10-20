import {defineConfig} from "vitest/config";

export default defineConfig({
    plugins: [],
    test: {
        onConsoleLog(_log: string, _type: "stdout" | "stderr"): boolean | undefined {
            return false;
        },
        coverage: {
            enabled: false,
            provider: "v8",
            include: ["lib/**"],
            extension: [".ts"],
            // exclude: [],
            clean: true,
            cleanOnRerun: true,
            reportsDirectory: "coverage",
            reporter: ["text", "html"],
            reportOnFailure: false,
            thresholds: {
                100: true,
            },
        },
    },
});
