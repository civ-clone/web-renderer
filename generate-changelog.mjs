import { exec } from 'child_process';
import { promisify } from 'util';

const [, , targetCommit] = process.argv,
    execPromise = promisify(exec),
    getShortHash = async () => {
        const { stdout } = await execPromise(`git log --format=%h -n 1 ${targetCommit ?? ''}`);

        return stdout.trim();
    },
    getLocalChanges = async () => {
        const { stdout } = await execPromise(`git log --format=%B -n 1 ${targetCommit ?? ''}`);

        return stdout.trim().split(/\n/).map((line) => line.trim()).filter((line) => line !== null);
    },
    getCommitDate = async () => {
        const { stdout } = await execPromise(`git log --format=%aI -n 1 ${targetCommit ?? ''}`);

        return new Date(stdout.trim());
    },
    getExternalChanges = async () => {
        const { stdout } = await execPromise(`git show ${targetCommit ?? ''} yarn.lock`);

        return stdout.trim().split(/\n/)
            .reduce((modules, line) => {
                if (!/^[-+]/.test(line) || !/resolved|resolution/.test(line) || !/civ-clone/.test(line)) {
                    return modules;
                }

                const [, status] = line.match(/^([-+])/),
                    [, module] = line.match(/civ-clone\/([a-z\d-]+)/i),
                    [, hash] = line.match(/\b([0-9a-f]{40})\b/i) || [],
                    [, version] = line.match(/\b(\d+\.\d+\.\d+)\b/) || [];

                if (!module) {
                    console.warn('no module??: ' + line);

                    return modules;
                }

                if (!(module in modules)) {
                    modules[module] = {};
                }

                if (status === '-') {
                    if (version) {
                        modules[module].fromVersion = version;
                    }
                    else {
                        modules[module].fromHash = hash;
                    }

                    return modules;
                }

                if (version) {
                    modules[module].toVersion = version;
                }
                else {
                    modules[module].toHash = hash;
                }

                return modules;
            }, {})
    },
    githubAuthenticatedRequest = (path) => {
        const githubToken = process.env.GITHUB_TOKEN;

        if (!githubToken) {
            console.error('GITHUB_TOKEN not defined in environment');
            process.exit(1);
        }

        return fetch(
            `https://api.github.com${path}`,
            {
                headers: {
                    'Authorization': `Bearer ${githubToken}`
                }
            }
        );
    },
    getExternalLog = async (repo, to, from) => {
        console.warn(`Getting logs for civ-clone/${repo}${from ? ` from '${from}'` : ''} to '${to}'...`);

        const response = await githubAuthenticatedRequest(
            `/repos/civ-clone/${repo}/commits?per_page=100`
        );

        if (!response.ok) {
            console.warn(response.url);
            console.warn(response);

            return [];
        }

        const data = await response.json(),
            logs = [];

        let shouldCapture = false;

        while (data.length) {
            const current = data.pop();

            if (from === null) {
                shouldCapture = true;
            }

            if (shouldCapture) {
                logs.push(...current.commit.message.trim().split(/\n/));
            }

            if (current.sha === from) {
                shouldCapture = true;
            }

            if (current.sha === to) {
                shouldCapture = false;
            }
        }

        return logs.filter((entry) => entry.trim() !== '');
    },
    getTagHash = async (repo, tag) => {
        console.warn(`Getting tag ${tag} for civ-clone/${repo}...`);
        const baseTagResponse = await githubAuthenticatedRequest(
            `/repos/civ-clone/${repo}/git/refs/tags/${tag}`
        );

        if (!baseTagResponse.ok) {
            throw new Error(`Unable to get tag '${tag}' for civ-clone/${repo}: ${baseTagResponse.url} (${await baseTagResponse.text()})`);
        }

        const { object: { sha: tagHash, type }} = await baseTagResponse.json();

        if (type === 'commit') {
            return tagHash;
        }

        const tagResponse = await githubAuthenticatedRequest(
            `/repos/civ-clone/${repo}/git/tags/${tagHash}`
        );

        if (!tagResponse.ok) {
            throw new Error(`Unable to get tag '${tag}' for civ-clone/${repo}: ${tagResponse.url} (${await tagResponse.text()})`);
        }

        const { object: { sha: commitHash }} = await tagResponse.json();

        return commitHash;
    },
    changeLogEntry = {
        // TODO: determine the version number from package.json, once this changes
        version: '0.1.0@' + await getShortHash(),
        date: (await getCommitDate()).toISOString(),
        localChanges: await getLocalChanges(),
        externalChanges: await Object.entries(await getExternalChanges())
            .reduce((modules, [module, { fromHash = null, toHash, fromVersion = null, toVersion }]) =>
                console.warn([fromVersion, toVersion]) ||
                    modules.then(async (modules) => {
                        if (fromVersion && toVersion && fromVersion === toVersion) {
                            return modules;
                        }

                        if (fromVersion) {
                            fromHash = await getTagHash(module, fromVersion);
                        }

                        if (toVersion) {
                            toHash = await getTagHash(module, toVersion);
                        }

                        if (fromHash === toHash) {
                            return modules;
                        }

                        if (!toHash) {
                            modules[module] = {
                                status: 'removed',
                            };

                            return modules;
                        }

                        modules[module] = {
                            status: (fromHash === null ? 'added' : 'updated'),
                            log: await getExternalLog(module, toHash, fromHash ?? null)
                        };

                        return modules;
                    })
                , Promise.resolve({}))
    };

console.log(JSON.stringify(changeLogEntry));

// console.log(
// `
// # civ-clone/web-renderer ${changeLogEntry.release}
//
// ${changeLogEntry.localChanges.map((line) => `- ${line}`).join('\n')}
//
// ## External project changes
//
// ${Object.entries(changeLogEntry.externalChanges)
//     .map(([module, logs]) =>
// `<details><summary> ${module}</summary>
//
// ${logs.map((line) => `- ${line}`).join('\n')}
// </details>
// `
//     ).join('\n\n')}
//
// <p><small>Generated ${new Date().toISOString()}</small></p>
// `
// );