import {execSync} from "node:child_process";

async function checkDuplicateIssue(github, context, name) {
    // Search for existing issues with the same `name`
    const searchQuery = `repo:${context.repo.owner}/${context.repo.repo} is:issue -is:pr "${name}" label:"new device support","external converter"`;

    try {
        const searchResults = await github.rest.search.issuesAndPullRequests({q: searchQuery, per_page: 100});

        // Filter out the current issue and return the first duplicate found
        const existingIssues = searchResults.data.items.filter((item) => item.number !== context.payload.issue.number).map((i) => `#${i.number}`);
        if (existingIssues.length > 0) {
            await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                body: `👋 Hi there! This issue appears to be a duplicate of ${existingIssues.join(", ")}

This issue will be closed. Please follow the existing issue for updates.`,
            });

            await github.rest.issues.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.payload.issue.number,
                state: "closed",
            });

            return true;
        }
    } catch (error) {
        console.error(`Error searching for duplicate issues with ${name}:`, error);
    }

    return false;
}

export async function newDeviceSupport(github, _core, context, zhcDir) {
    const issue = context.payload.issue;
    // Hide previous bot comments
    const comments = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
    });

    for (const comment of comments.data) {
        if (comment.user.type === "Bot" && comment.user.login === "github-actions[bot]") {
            await github.graphql(`mutation {
    minimizeComment(input: {subjectId: "${comment.node_id}", classifier: OUTDATED}) {
        clientMutationId
    }
}`);
        }
    }

    const titleAndBody = `${issue.title}\n\n${issue.body ?? ""}`;

    // Check if Tuya manufacturer name is already supported.
    const tuyaManufacturerNameRe = /['"](_T\w+_(\w+))['"]/g;
    const tuyaManufacturerNames = Array.from(titleAndBody.matchAll(tuyaManufacturerNameRe), (m) => [m[1], m[2]]);
    console.log("Found tuyaManufacturerNames", tuyaManufacturerNames);
    if (tuyaManufacturerNames.length > 0) {
        for (const [fullName, partialName] of tuyaManufacturerNames) {
            if (await checkDuplicateIssue(github, context, fullName)) return;
            const fullMatch = (() => {
                try {
                    return execSync(`grep -r --include="*.ts" "${fullName}" "${zhcDir}"`, {encoding: "utf8"});
                } catch {
                    return undefined;
                }
            })();

            console.log(`Checking full match for '${fullName}', result: '${fullMatch}'`);
            if (fullMatch) {
                await github.rest.issues.createComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: issue.number,
                    body: `👋 Hi there! The Tuya device with manufacturer name \`${fullName}\` is already supported in the latest dev branch.
See this [guide](https://www.zigbee2mqtt.io/advanced/more/switch-to-dev-branch.html) on how to update, after updating you can remove your external converter.

In case you created the external converter with the goal to extend or fix an issue with the out-of-the-box support, please submit a pull request.
For instructions on how to create a pull request see the [docs](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html#_4-create-a-pull-request).
If you need help with the process, feel free to ask here and we'll be happy to assist.`,
                });
                await github.rest.issues.update({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: issue.number,
                    state: "closed",
                });

                return;
            }

            const partialMatch = (() => {
                try {
                    return execSync(`grep -r --include="*.ts" "${partialName}" "${zhcDir}"`, {encoding: "utf8"});
                } catch {
                    return undefined;
                }
            })();

            console.log(`Checking partial match for '${partialName}', result: '${partialMatch}'`);
            if (partialMatch) {
                const candidates = Array.from(partialMatch.matchAll(tuyaManufacturerNameRe), (m) => m[1]);

                await github.rest.issues.createComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: issue.number,
                    body: `👋 Hi there! A similar Tuya device of which the manufacturer name also ends with \`_${partialName}\` is already supported.
This means the device can probably be easily be supported by re-using the existing converter.

I found the following matches: ${candidates.map((c) => `\`${c}\``).join(", ")}
Try to stop Z2M, change all occurrences of \`${fullName}\` in the \`data/database.db\` to one of the matches above and start Z2M.

Let us know if it works so we can support this device out-of-the-box!`,
                });

                return;
            }
        }
    } else {
        // Check if zigbee model is already supported.
        const zigbeeModelRe = /zigbeeModel: \[['"](.+)['"]\]/g;
        const zigbeeModels = Array.from(titleAndBody.matchAll(zigbeeModelRe), (m) => m[1]);

        if (zigbeeModels.length > 0) {
            for (const zigbeeModel of zigbeeModels) {
                if (await checkDuplicateIssue(github, context, fullName)) return;
                const fullMatch = (() => {
                    try {
                        return execSync(`grep -r --include="*.ts" '"${zigbeeModel}"' "${zhcDir}"`, {encoding: "utf8"});
                    } catch {
                        return undefined;
                    }
                })();

                if (fullMatch) {
                    await github.rest.issues.createComment({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        issue_number: issue.number,
                        body: `👋 Hi there! The device with zigbee model \`${zigbeeModel}\` is already supported in the latest dev branch.
See this [guide](https://www.zigbee2mqtt.io/advanced/more/switch-to-dev-branch.html) on how to update, after updating you can remove your external converter.

In case you created the external converter with the goal to extend or fix an issue with the out-of-the-box support, please submit a pull request.
For instructions on how to create a pull request see the [docs](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html#_4-create-a-pull-request).

If you need help with the process, feel free to ask here and we'll be happy to assist.`,
                    });
                    await github.rest.issues.update({
                        owner: context.repo.owner,
                        repo: context.repo.repo,
                        issue_number: issue.number,
                        state: "closed",
                    });

                    return;
                }
            }
        }
    }

    // Create a request to pull request comment
    await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issue.number,
        body: `🙏 Thank you for creating this issue and sharing your external converter!

In case all features work, please submit a pull request on this repository so the device can be supported out-of-the-box with the next release.
For instructions on how to create a pull request see the [docs](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html#_4-create-a-pull-request).

If **NOT** all features work, please follow the [How To Support new devices](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html).
${
    tuyaManufacturerNames.length > 0
        ? "Since this is a Tuya also consider [How To Support new Tuya devices](https://www.zigbee2mqtt.io/advanced/support-new-devices/02_support_new_tuya_devices.html)."
        : ""
}

If you need help with the process, feel free to ask here and we'll be happy to assist.`,
    });
}
