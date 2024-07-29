const path = require('path');
const fs = require('fs');
const process = require('process');
const {execSync} = require('child_process');
const zhc = require('zigbee-herdsman-converters');

const z2mTillVersion = process.argv[2];
const zhcTillVersion = process.argv[3];
const zhTillVersion = process.argv[4];
const frontendTillVersion = process.argv[5];

const changelogs = [
    {
        tillVersion: z2mTillVersion,
        project: 'koenkk/zigbee2mqtt',
        contents: fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf-8').split('\n'),
    },
    {
        tillVersion: zhcTillVersion,
        project: 'koenkk/zigbee-herdsman-converters',
        contents: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman-converters', 'CHANGELOG.md'), 'utf-8').split('\n'),
    },
    {
        tillVersion: zhTillVersion,
        project: 'koenkk/zigbee-herdsman',
        contents: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman', 'CHANGELOG.md'), 'utf-8').split('\n'),
    },
    {
        tillVersion: frontendTillVersion,
        project: 'nurikk/zigbee2mqtt-frontend',
        isFrontend: true,
        contents: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee2mqtt-frontend', 'CHANGELOG.md'), 'utf-8').split('\n'),
    },
];

const releaseRe = /## \[(.+)\]/;
const changes = {features: [], fixes: [], detect: [], add: [], error: [], frontend: []};
let context = null;
const changeRe = [
    /^\* (\*\*(.+):\*\*)?(.+)\((\[#\d+\]\(.+\))\) \(\[.+\]\(https:.+\/(.+)\)\)$/,
    /^\* (\*\*(.+):\*\*)?(.+)(https:\/\/github\.com.+) \(\[.+\]\(https:.+\/(.+)\)\)$/,
    /^\* (\*\*(.+):\*\*)?(.+)() \(\[.+\]\(https:.+\/(.+)\)\)$/,
];
const frontendChangeRe = /^\* (\*\*.+:\*\* )()?(.+) \(\[.+\]\(https:.+\/()(.+)\)\)(.+)?$/;

let commitUserLookup = {};
const commitUserFile = path.join(__dirname, 'commit-user-lookup.json');
if (fs.existsSync(commitUserFile)) {
    commitUserLookup = JSON.parse(fs.readFileSync(commitUserFile, 'utf8'));
}

const whiteLabels = zhc.definitions.filter((d) => d.whiteLabel).flatMap((d) => d.whiteLabel);
const capitalizeFirstChar = (str) => str.charAt(0).toUpperCase() + str.slice(1);

for (const changelog of changelogs) {
    for (const line of changelog.contents) {
        const releaseMatch = line.match(releaseRe);
        const changeMatch = changelog.isFrontend ? line.match(frontendChangeRe) : changeRe.map((re) => line.match(re)).find((e) => e);
        if (releaseMatch) {
            if (releaseMatch[1] === changelog.tillVersion) {
                break;
            }
        } else if (line === '### Features') {
            context = 'features';
        } else if (line === '### Bug Fixes') {
            context = 'fixes';
        } else if (line.startsWith('* **ignore:**')) {
            continue;
        } else if (changeMatch) {
            let localContext = changelog.isFrontend ? 'frontend' : changeMatch[2] ? changeMatch[2] : context;
            if (!changes[localContext]) localContext = 'error';

            const commit = changeMatch[5];
            const commitUserKey = `${changelog.project}-${commit} `;
            let user =
                commitUserKey in commitUserLookup
                    ? commitUserLookup[commitUserKey]
                    : execSync(`curl -s https://api.github.com/repos/${changelog.project}/commits/${commit} | jq -r '.author.login'`)
                          .toString()
                          .trim();
            if (user !== 'null') commitUserLookup[commitUserKey] = user;
            const messages = [];
            let message = changeMatch[3].trim();
            if (message.endsWith('.')) message = message.substring(0, message.length - 1);

            if (changelog.isFrontend) {
                changes[localContext].push(
                    `- [${commit.slice(0, 7)}](https://github.com/${changelog.project}/commit/${commit}) ${message} (@${user})`,
                );
                messages.push(capitalizeFirstChar(message));
            } else {
                const otherUser = message.match(/\[@(.+)\]\(https:\/\/github.com\/.+\)/) || message.match(/@(.+)/);
                if (otherUser) {
                    user = otherUser[1];
                    message = message.replace(otherUser[0], '');
                }

                if (localContext === 'add') {
                    for (const model of message.split(',')) {
                        const definition = zhc.definitions.find((d) => d.model === model.trim());
                        const whiteLabel = whiteLabels.find((d) => d.model === model.trim());
                        const match = definition || whiteLabel;
                        if (match) {
                            messages.push(`\`${match.model}\` ${match.vendor} ${match.description}`);
                        } else {
                            changes['error'].push(`${line} (model '${model}' does not exist)`);
                        }
                    }
                } else {
                    messages.push(capitalizeFirstChar(message));
                }

                let issue = changeMatch[4].trim();
                if (issue && !issue.startsWith('[#')) issue = `[#${issue.split('/').pop()}](${issue})`;
                if (!issue) {
                    issue = '_NO_ISSUE_';
                    localContext = 'error';
                }

                messages.forEach((m) => changes[localContext].push(`- ${issue} ${m} (@${user})`));
            }
        } else if (line === '# Changelog' || line === '### ⚠ BREAKING CHANGES' || !line) {
            continue;
        } else {
            changes['error'].push(`- Unmatched line: ${line}`);
        }
    }
}

let result = '';
const names = [
    ['features', 'Improvements'],
    ['fixes', 'Fixes'],
    ['frontend', 'Frontend'],
    ['add', 'New supported devices'],
    ['detect', 'Fixed device detections'],
    ['error', 'Changelog generator error'],
];
for (const name of names) {
    result += `# ${name[1]}\n`;
    if (name[0] === 'add') {
        result += `This release adds support for ${changes['add'].length} devices: \n`;
    }
    changes[name[0]].forEach((e) => (result += `${e}\n`));
    result += '\n';
}

fs.writeFileSync(commitUserFile, JSON.stringify(commitUserLookup), 'utf-8');

console.log(result.trim());
