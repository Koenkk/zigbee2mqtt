import {execSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zhc from "zigbee-herdsman-converters";
import definitionIndex from "zigbee-herdsman-converters/devices/index";

const z2mTillVersion = process.argv[2];
const zhcTillVersion = process.argv[3];
const zhTillVersion = process.argv[4];
const frontendTillVersion = process.argv[5];
const windfrontTillVersion = process.argv[6];

const changelogs = [
    {
        tillVersion: z2mTillVersion,
        project: "koenkk/zigbee2mqtt",
        contents: fs.readFileSync(path.join(import.meta.dirname, "..", "CHANGELOG.md"), "utf-8").split("\n"),
    },
    {
        tillVersion: zhcTillVersion,
        project: "koenkk/zigbee-herdsman-converters",
        contents: fs
            .readFileSync(path.join(import.meta.dirname, "..", "node_modules", "zigbee-herdsman-converters", "CHANGELOG.md"), "utf-8")
            .split("\n"),
    },
    {
        tillVersion: zhTillVersion,
        project: "koenkk/zigbee-herdsman",
        contents: fs.readFileSync(path.join(import.meta.dirname, "..", "node_modules", "zigbee-herdsman", "CHANGELOG.md"), "utf-8").split("\n"),
    },
    {
        tillVersion: frontendTillVersion,
        project: "nurikk/zigbee2mqtt-frontend",
        isFrontend: true,
        contents: fs.readFileSync(path.join(import.meta.dirname, "..", "node_modules", "zigbee2mqtt-frontend", "CHANGELOG.md"), "utf-8").split("\n"),
    },
    {
        tillVersion: windfrontTillVersion,
        project: "Nerivec/zigbee2mqtt-windfront",
    },
];

const releaseRe = /## \[(.+)\]/;
const windfrontChangeRe = /^\* (feat|fix): (.+?)(?: by @([^\s]+) in (https:\/\/github\.com\/Nerivec\/zigbee2mqtt-windfront\/pull\/(\d+)))?$/gm;
const changes = {features: [], fixes: [], detect: [], add: [], error: [], frontend: [], windfront: []};
let context = null;
const changeRe = [
    /^\* (\*\*(.+):\*\*)?(.+)\((\[#\d+\]\(.+\))\) \(\[.+\]\(https:.+\/(.+)\)\)$/,
    /^\* (\*\*(.+):\*\*)?(.+)(https:\/\/github\.com.+) \(\[.+\]\(https:.+\/(.+)\)\)$/,
    /^\* (\*\*(.+):\*\*)?(.+)() \(\[.+\]\(https:.+\/(.+)\)\)$/,
];
const frontendChangeRe = /^\* (\*\*.+:\*\* )()?(.+) \(\[.+\]\(https:.+\/()(.+)\)\)(.+)?$/;

let commitUserLookup = {};
const commitUserFile = path.join(import.meta.dirname, "commit-user-lookup.json");
if (fs.existsSync(commitUserFile)) {
    commitUserLookup = JSON.parse(fs.readFileSync(commitUserFile, "utf8"));
}

const definitions = definitionIndex.default.map((d) => zhc.prepareDefinition(d));
const whiteLabels = definitions
    .filter((d) => d.whiteLabel)
    .flatMap((d) =>
        d.whiteLabel.map((wl) => {
            return {model: wl.model, vendor: wl.vendor ?? d.vendor, description: wl.description ?? d.description};
        }),
    );
const capitalizeFirstChar = (str) => str.charAt(0).toUpperCase() + str.slice(1);

for (const changelog of changelogs) {
    if (changelog.project === "Nerivec/zigbee2mqtt-windfront") {
        const releaseRsp = await fetch("https://api.github.com/repos/Nerivec/zigbee2mqtt-windfront/releases");
        const releases = await releaseRsp.json();
        for (const release of releases) {
            if (release.name === `v${windfrontTillVersion}`) {
                break;
            }

            let match = windfrontChangeRe.exec(release.body);
            while (match !== null) {
                const [, type, message, user, prLink, prId] = match;
                const entry = `- ${prId && prLink ? `[#${prId}](${prLink}) ` : ""}${type}: ${message} ${user ? `(@${user.split("[")[0]})` : ""}`;
                changes.windfront.push(entry);
                match = windfrontChangeRe.exec(release.body);
            }
        }
    } else {
        for (const line of changelog.contents) {
            const releaseMatch = line.match(releaseRe);
            const changeMatch = changelog.isFrontend ? line.match(frontendChangeRe) : changeRe.map((re) => line.match(re)).find((e) => e);
            if (releaseMatch) {
                if (releaseMatch[1] === changelog.tillVersion) {
                    break;
                }
            } else if (line === "### Features") {
                context = "features";
            } else if (line === "### Bug Fixes") {
                context = "fixes";
            } else if (line.startsWith("* **ignore:**")) {
                // continue;
            } else if (changeMatch) {
                let localContext = changelog.isFrontend ? "frontend" : changeMatch[2] ? changeMatch[2] : context;
                if (!changes[localContext]) localContext = "error";

                const commit = changeMatch[5];
                const commitUserKey = `${changelog.project}-${commit} `;
                let user =
                    commitUserKey in commitUserLookup
                        ? commitUserLookup[commitUserKey]
                        : execSync(`curl -s https://api.github.com/repos/${changelog.project}/commits/${commit} | jq -r '.author.login'`)
                              .toString()
                              .trim();
                if (user !== "null") commitUserLookup[commitUserKey] = user;
                const messages = [];
                let message = changeMatch[3].trim();
                if (message.endsWith(".")) message = message.substring(0, message.length - 1);

                if (changelog.isFrontend) {
                    changes[localContext].push(
                        `- [${commit.slice(0, 7)}](https://github.com/${changelog.project}/commit/${commit}) ${message} (@${user})`,
                    );
                    messages.push(capitalizeFirstChar(message));
                } else {
                    const otherUser = message.match(/\[@(.+)\]\(https:\/\/github.com\/.+\)/) || message.match(/@(.+)/);
                    if (otherUser) {
                        user = otherUser[1];
                        message = message.replace(otherUser[0], "");
                    }

                    if (localContext === "add") {
                        for (const model of message.split(",")) {
                            const definition = definitions.find((d) => d.model === model.trim());
                            const whiteLabel = whiteLabels.find((d) => d.model === model.trim());
                            const match = definition || whiteLabel;
                            if (match) {
                                messages.push(`\`${match.model}\` ${match.vendor} ${match.description}`);
                            } else {
                                changes.error.push(`${line} (model '${model}' does not exist)`);
                            }
                        }
                    } else {
                        messages.push(capitalizeFirstChar(message));
                    }

                    let issue = changeMatch[4].trim();
                    if (issue && !issue.startsWith("[#")) issue = `[#${issue.split("/").pop()}](${issue})`;
                    if (!issue) {
                        issue = "_NO_ISSUE_";
                        localContext = "error";
                    }

                    for (const message of messages) {
                        changes[localContext].push(`- ${issue} ${message} (@${user})`);
                    }
                }
            } else if (line === "# Changelog" || line === "### ⚠ BREAKING CHANGES" || !line) {
                // continue;
            } else {
                changes.error.push(`- Unmatched line: ${line}`);
            }
        }
    }
}

let result = "";
const names = [
    ["features", "Improvements"],
    ["fixes", "Fixes"],
    ["windfront", "Windfront"],
    ["frontend", "Frontend"],
    ["add", "New supported devices"],
    ["detect", "Fixed device detections"],
    ["error", "Changelog generator error"],
];
for (const name of names) {
    result += `# ${name[1]}\n`;
    if (name[0] === "add") {
        result += `This release adds support for ${changes.add.length} devices: \n`;
    }

    for (const change of changes[name[0]]) {
        result += `${change}\n`;
    }

    result += "\n";
}

fs.writeFileSync(commitUserFile, JSON.stringify(commitUserLookup), "utf-8");

console.log(result.trim());
