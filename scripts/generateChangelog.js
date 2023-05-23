/* eslint max-len: 0 */
const path = require('path');
const fs = require('fs');
const process = require('process');
const {execSync} = require('child_process');
const zhc = require('zigbee-herdsman-converters');

const zhcTillVersion = process.argv[2];
const zhTillVersion = process.argv[3];

const changelogs = [
    {tillVersion: 'dummy', project: 'koenkk/zigbee2mqtt',
        contents: fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf-8').split('\n')},
    {tillVersion: zhcTillVersion, project: 'koenkk/zigbee-herdsman-converters',
        contents: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman-converters', 'CHANGELOG.md'), 'utf-8').split('\n')},
    {tillVersion: zhTillVersion, project: 'koenkk/zigbee-herdsman',
        contents: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'zigbee-herdsman', 'CHANGELOG.md'), 'utf-8').split('\n')},
];

const releaseRe = /## \[(.+)\]/;
const changes = {features: [], fixes: [], detect: [], add: []};
let context = null;
const changeRe = [
    /^\* (\*\*(.+):\*\*)?(.+)\((\[#\d+\]\(.+\))\) \(\[(.+)\]\(https:.+\)$/,
    /^\* (\*\*(.+):\*\*)?(.+)(https:\/\/github\.com.+) \(\[(.+)\]\(https:.+\)$/,
];

for (const changelog of changelogs) {
    for (const line of changelog.contents) {
        const releaseMatch = line.match(releaseRe);
        const changeMatch = changeRe.map((re) => line.match(re)).find((e) => e);
        if (releaseMatch) {
            if (releaseMatch[1] === changelog.tillVersion) {
                break;
            }
        } else if (line === '### Features') {
            context = 'features';
        } else if (line === '### Fixes') {
            context = 'fixes';
        } else if (line.startsWith('* **ignore:**')) {
            continue;
        } else if (changeMatch) {
            const localContext = changeMatch[2] ? changeMatch[2] : context;
            if (!changes[localContext]) throw new Error(`Unknown context: ${localContext}`);

            let message = changeMatch[3].trim();
            if (message.endsWith('.')) message = message.substring(0, message.length - 1);
            if (localContext === 'add') {
                const model = zhc.definitions.find((d) => d.model === message);
                if (!model) throw new Error(`${message} does not exist`);
                message = `\`${model.model}\` ${model.vendor} ${model.description}`;
            }

            let issue = changeMatch[4];
            if (!issue.startsWith('[#')) issue = `[#${issue.split('/').pop()}](${issue})`;

            const user = execSync(`curl -s https://api.github.com/repos/${changelog.project}/commits/${changeMatch[5]} | jq -r '.author.login'`);

            changes[localContext].push(`- ${issue} ${message} (@${user})`);
        } else if (line === '# Changelog' || !line) {
            continue;
        } else {
            throw new Error(`Unmatched line: ${line}`);
        }
    }
}

let result = '';
const names = [
    ['features', 'Improvements'],
    ['fixes', 'Fixes'],
    ['add', 'New supported devices'],
    ['detect', 'Fixed device detections'],
];
for (const name of names) {
    result += `# ${name[1]}\n`;
    if (name[0] === 'add') {
        result += `This release adds support for ${changes['add'].length} devices: \n`;
    }
    changes[name[0]].forEach((e) => result += `${e}\n`);
    result += '\n';
}

console.log(result.trim());
