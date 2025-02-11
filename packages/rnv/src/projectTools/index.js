/* eslint-disable import/no-cycle */
// @todo fix cycle dep
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { getAppFolder } from '../common';
import { doResolve } from '../resolve';
import { isPlatformActive } from '../platformTools';
import { logTask, logWarning, logInfo } from '../systemTools/logger';
import {
    IOS,
    ANDROID,
    TVOS,
    TIZEN,
    WEBOS,
    ANDROID_TV,
    ANDROID_WEAR,
    WEB,
    MACOS,
    WINDOWS,
    TIZEN_MOBILE,
    TIZEN_WATCH,
    KAIOS,
    FIREFOX_OS,
    FIREFOX_TV,
    CHROMECAST
} from '../constants';
import { configureXcodeProject } from '../platformTools/apple';
import { configureGradleProject } from '../platformTools/android';
import { configureTizenProject } from '../platformTools/tizen';
import { configureWebOSProject } from '../platformTools/webos';
import { configureElectronProject } from '../platformTools/electron';
import { configureKaiOSProject } from '../platformTools/firefox';
import { configureWebProject } from '../platformTools/web';
import {
    copyFolderContentsRecursiveSync,
    readObjectSync
} from '../systemTools/fileutils';
import CLI from '../cli';
import { copyRuntimeAssets, copySharedPlatforms } from './projectParser';
import { generateRuntimeConfig } from '../configTools/configParser';
import Config from '../config';
import { getMergedPlugin } from '../pluginTools';
import { commandExistsSync, executeAsync } from '../systemTools/exec';
import { configureChromecastProject } from '../platformTools/chromecast';

export const rnvConfigure = async (c) => {
    const p = c.platform || 'all';
    logTask(`rnvConfigure:${c.platform}:${p}`);

    // inject packages if needed
    if (p !== 'all') await Config.injectPlatformDependencies(p);

    await _checkAndCreatePlatforms(c, c.platform);
    await copyRuntimeAssets(c);
    await copySharedPlatforms(c);
    await generateRuntimeConfig(c);
    const ptDirs = c.paths.rnv.pluginTemplates.dirs;
    for (let i = 0; i < ptDirs.length; i++) {
        await overridePlugins(c, ptDirs[i]);
    }
    // await overridePlugins(c, c.paths.rnv.pluginTemplates.dir);
    await overridePlugins(c, c.paths.project.projectConfig.pluginsDir);

    const ptDirs2 = c.paths.appConfig.pluginDirs;
    if (ptDirs2) {
        for (let i = 0; i < ptDirs2.length; i++) {
            await overridePlugins(c, ptDirs2[i]);
        }
    }

    const originalPlatform = c.platform;

    await _configurePlatform(c, p, ANDROID, configureGradleProject);
    await _configurePlatform(c, p, ANDROID_TV, configureGradleProject);
    await _configurePlatform(c, p, ANDROID_WEAR, configureGradleProject);
    await _configurePlatform(c, p, TIZEN, configureTizenProject);
    await _configurePlatform(c, p, TIZEN_WATCH, configureTizenProject);
    await _configurePlatform(c, p, TIZEN_MOBILE, configureTizenProject);
    await _configurePlatform(c, p, WEBOS, configureWebOSProject);
    await _configurePlatform(c, p, WEB, configureWebProject);
    await _configurePlatform(c, p, MACOS, configureElectronProject);
    await _configurePlatform(c, p, WINDOWS, configureElectronProject);
    await _configurePlatform(c, p, KAIOS, configureKaiOSProject);
    await _configurePlatform(c, p, FIREFOX_OS, configureKaiOSProject);
    await _configurePlatform(c, p, FIREFOX_TV, configureKaiOSProject);
    await _configurePlatform(c, p, IOS, configureXcodeProject);
    await _configurePlatform(c, p, TVOS, configureXcodeProject);
    await _configurePlatform(c, p, CHROMECAST, configureChromecastProject);

    c.platform = originalPlatform;
};

const _configurePlatform = async (c, p, platform, method) => {
    if (_isOK(c, p, [platform])) {
        c.platform = platform;
        await method(c, platform);
    }
};

export const rnvSwitch = c => new Promise((resolve, reject) => {
    const p = c.program.platform || 'all';
    logTask(`rnvSwitch:${p}`);

    copyRuntimeAssets(c)
        .then(() => copySharedPlatforms(c))
        .then(() => generateRuntimeConfig(c))
        .then(() => resolve())
        .catch(e => reject(e));
});

export const rnvLink = c => new Promise((resolve) => {
    if (fs.existsSync(c.paths.project.npmLinkPolyfill)) {
        const l = JSON.parse(
            fs.readFileSync(c.paths.project.npmLinkPolyfill).toString()
        );
        Object.keys(l).forEach((key) => {
            const source = path.resolve(l[key]);
            const nm = path.join(source, 'node_modules');
            const dest = doResolve(key);
            if (fs.existsSync(source)) {
                copyFolderContentsRecursiveSync(source, dest, false, [nm]);
            } else {
                logWarning(`Source: ${source} doesn't exists!`);
            }
        });
    } else {
        logWarning(
            `${c.paths.project.npmLinkPolyfill} file not found. nothing to link!`
        );
        resolve();
    }
});

const _isOK = (c, p, list) => {
    let result = false;
    list.forEach((v) => {
        if (isPlatformActive(c, v) && (p === v || p === 'all')) result = true;
    });
    return result;
};

const _checkAndCreatePlatforms = async (c, platform) => {
    logTask(`_checkAndCreatePlatforms:${platform}`);

    if (!fs.existsSync(c.paths.project.builds.dir)) {
        logWarning('Platforms not created yet. creating them for you...');
        await CLI(c, {
            command: 'platform',
            subCommand: 'configure',
            program: { appConfig: c.runtime.appId, platform }
        });
        return;
    }
    if (platform) {
        const appFolder = getAppFolder(c, platform);
        if (!fs.existsSync(appFolder)) {
            logWarning(
                `Platform ${platform} not created yet. creating them for you at ${appFolder}`
            );
            await CLI(c, {
                command: 'platform',
                subCommand: 'configure',
                program: { appConfig: c.runtime.appId, platform }
            });
        }
    } else {
        const { platforms } = c.buildConfig;
        if (!platforms) {
            reject(
                `Your ${chalk.white(
                    c.paths.appConfig.config
                )} is missconfigured. (Maybe you have older version?). Missing ${chalk.white(
                    '{ platforms: {} }'
                )} object at root`
            );
            return;
        }
        const ks = Object.keys(platforms);
        for (let i = 0; i < ks.length; i++) {
            const k = ks[i];
            const appFolder = getAppFolder(c, k);
            if (!fs.existsSync(appFolder)) {
                logWarning(
                    `Platform ${k} not created yet. creating one for you at ${appFolder}`
                );
                await CLI(c, {
                    command: 'platform',
                    subCommand: 'configure',
                    platform: k,
                    program: { appConfig: c.runtime.appId, platform: k }
                });
            }
        }
    }
};

const overridePlugins = async (c, pluginsPath) => {
    logTask(`overridePlugins:${pluginsPath}`, chalk.grey);

    if (!fs.existsSync(pluginsPath)) {
        logInfo(
            `Your project plugin folder ${chalk.white(
                pluginsPath
            )} does not exists. skipping plugin configuration`
        );
        return;
    }

    fs.readdirSync(pluginsPath).forEach((dir) => {
        if (dir.startsWith('@')) {
            const pluginsPathNested = path.join(pluginsPath, dir);
            fs.readdirSync(pluginsPathNested).forEach((subDir) => {
                _overridePlugins(c, pluginsPath, `${dir}/${subDir}`);
            });
        } else {
            _overridePlugins(c, pluginsPath, dir);
        }
    });
};

const _overridePlugins = (c, pluginsPath, dir) => {
    const source = path.resolve(pluginsPath, dir, 'overrides');
    const dest = doResolve(dir, false);
    if (!dest) return;

    const plugin = getMergedPlugin(c, dir, c.buildConfig.plugins);
    let flavourSource;
    if (plugin) {
        flavourSource = path.resolve(
            pluginsPath,
            dir,
            `overrides@${plugin.version}`
        );
    }

    if (flavourSource && fs.existsSync(flavourSource)) {
        copyFolderContentsRecursiveSync(flavourSource, dest, false);
    } else if (fs.existsSync(source)) {
        copyFolderContentsRecursiveSync(source, dest, false);
        // fs.readdirSync(pp).forEach((dir) => {
        //     copyFileSync(path.resolve(pp, file), path.resolve(c.paths.project.dir, 'node_modules', dir));
        // });
    } else {
        logInfo(
            `Your plugin configuration has no override path ${chalk.white(
                source
            )}. skipping folder override action`
        );
    }

    const overridePath = path.resolve(pluginsPath, dir, 'overrides.json');
    const overrideConfig = readObjectSync(
        path.resolve(pluginsPath, dir, 'overrides.json')
    );
    if (overrideConfig?.overrides) {
        Object.keys(overrideConfig.overrides).forEach((k, i) => {
            const override = overrideConfig.overrides[k];
            const ovDir = path.join(dest, k);
            if (fs.existsSync(ovDir)) {
                if (fs.lstatSync(ovDir).isDirectory()) {
                    logWarning(
                        'overrides.json: Directories not supported yet. specify path to actual file'
                    );
                } else {
                    let fileToFix = fs.readFileSync(ovDir).toString();
                    Object.keys(override).forEach((fk) => {
                        const regEx = new RegExp(fk, 'g');
                        const count = (fileToFix.match(regEx) || []).length;
                        if (!count) {
                            logWarning(`No Match found in ${chalk.red(
                                ovDir
                            )} for expression: ${chalk.red(fk)}.
Consider update or removal of ${chalk.white(overridePath)}`);
                        } else {
                            fileToFix = fileToFix.replace(regEx, override[fk]);
                        }
                    });
                    fs.writeFileSync(ovDir, fileToFix);
                }
            }
        });
    }
};
