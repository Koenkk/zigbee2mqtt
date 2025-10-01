import {formatTimestamp} from "lib/util/utils";
import {bench, describe} from "vitest";
import {BENCH_OPTIONS} from "./benchOptions";

describe("Controller with dummy zigbee/mqtt", () => {
    bench(
        "formatTimestamp",
        () => {
            formatTimestamp(new Date(2023, 9, 5, 14, 30, 45), "YYYY-MM-DD HH:mm:ss");
        },
        BENCH_OPTIONS,
    );
});
