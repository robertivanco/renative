import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import Svg2Js from 'svg2js';
import shelljs from 'shelljs';
import merge from 'deepmerge';
import chalk from 'chalk';
import ncp from 'ncp';
import { isSystemWin } from '../utils';

import { logDebug, logError, logWarning, logInfo } from './logger';

export const copyFileSync = (source, target, skipOverride) => {
    logDebug('copyFileSync', source);
    let targetFile = target;
    // if target is a directory a new file with the same name will be created
    if (source.indexOf('.DS_Store') !== -1) return;

    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }
    if (fs.existsSync(targetFile)) {
        if (skipOverride) return;
        const src = fs.readFileSync(source);
        const dst = fs.readFileSync(targetFile);

        if (Buffer.compare(src, dst) === 0) return;
    }
    logDebug('copyFileSync', source, targetFile, 'executed');
    try {
        fs.copyFileSync(source, targetFile);
    } catch (e) {
        console.log('copyFileSync', e);
    }
};

const SKIP_INJECT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.svg'];
export const writeCleanFile = (source, destination, overrides) => {
    // logTask(`writeCleanFile`)
    if (!fs.existsSync(source)) {
        logError(`Cannot write file. source path doesn't exists: ${source}`);
        return;
    }
    if (!fs.existsSync(destination)) {
        logWarning(
            `destination path doesn't exists: ${destination}. will create new one`
        );
        // return;
    }
    const ext = path.extname(source);
    if (SKIP_INJECT_EXTENSIONS.includes(ext)) {
        fs.copyFileSync(source, destination);
    } else {
        const pFile = fs.readFileSync(source, 'utf8');
        let pFileClean = pFile;
        if (overrides) {
            overrides.forEach((v) => {
                const regEx = new RegExp(v.pattern, 'g');
                pFileClean = pFileClean.replace(regEx, v.override);
            });
        }
        fs.writeFileSync(destination, pFileClean, 'utf8');
    }
};

export const readCleanFile = (source, overrides) => {
    // logTask(`writeCleanFile`)
    if (!fs.existsSync(source)) {
        logError(`Cannot write file. source path doesn't exists: ${source}`);
        return;
    }

    const pFile = fs.readFileSync(source, 'utf8');
    let pFileClean = pFile;
    if (overrides) {
        overrides.forEach((v) => {
            const regEx = new RegExp(v.pattern, 'g');
            pFileClean = pFileClean.replace(regEx, v.override);
        });
    }

    return Buffer.from(pFileClean, 'utf8');
};

export const copyFileWithInjectSync = (source, target, skipOverride, injectObject) => {
    logDebug('copyFileWithInjectSync', source);

    let targetFile = target;
    // if target is a directory a new file with the same name will be created
    if (source.indexOf('.DS_Store') !== -1) return;

    if (fs.existsSync(target)) {
        if (fs.lstatSync(target).isDirectory()) {
            targetFile = path.join(target, path.basename(source));
        }
    }
    if (fs.existsSync(targetFile)) {
        if (skipOverride) return;
        const src = readCleanFile(source, injectObject);
        const dst = fs.readFileSync(targetFile);

        if (Buffer.compare(src, dst) === 0) return;
    }
    logDebug('copyFileSync', source, targetFile, 'executed');
    try {
        writeCleanFile(
            source,
            targetFile,
            injectObject
        );
    } catch (e) {
        console.log('copyFileSync', e);
    }
};

export const invalidatePodsChecksum = (c) => {
    const appFolder = path.join(
        c.paths.project.builds.dir,
        `${c.runtime.appId}_${c.platform}`
    );
    const podChecksumPath = path.join(appFolder, 'Podfile.checksum');
    if (fs.existsSync(podChecksumPath)) {
        fs.unlinkSync(podChecksumPath);
    }
};

export const copyFolderRecursiveSync = (
    source,
    target,
    convertSvg = true,
    skipOverride,
    injectObject = null
) => {
    logDebug('copyFolderRecursiveSync', source, target);
    if (!fs.existsSync(source)) return;

    let files = [];
    // check if folder needs to be created or integrated
    const targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        mkdirSync(targetFolder);
    }
    // copy
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach((file) => {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder, convertSvg, skipOverride, injectObject);
            } else if (
                path.extname(curSource) === '.svg'
                && convertSvg === true
            ) {
                const jsDest = path.join(
                    targetFolder,
                    `${path.basename(curSource)}.js`
                );
                logDebug(
                    `file ${curSource} is svg and convertSvg is set to true. converitng to ${jsDest}`
                );
                saveAsJs(curSource, jsDest);
            } else if (injectObject !== null) {
                copyFileWithInjectSync(curSource, targetFolder, skipOverride, injectObject);
            } else {
                copyFileSync(curSource, targetFolder);
            }
        });
    }
};

export const copyFolderContentsRecursiveSync = (source, target, convertSvg = true, skipPaths, skipOverride, injectObject = null) => {
    logDebug('copyFolderContentsRecursiveSync', source, target, skipPaths);


    if (!fs.existsSync(source)) return;
    let files = [];
    const targetFolder = path.join(target);
    if (!fs.existsSync(targetFolder)) {
        mkdirSync(targetFolder);
    }
    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach((file) => {
            const curSource = path.join(source, file);
            if (!skipPaths || (skipPaths && !skipPaths.includes(curSource))) {
                if (fs.lstatSync(curSource).isDirectory()) {
                    copyFolderRecursiveSync(curSource, targetFolder, convertSvg, skipOverride, injectObject);
                } else if (injectObject !== null) {
                    copyFileWithInjectSync(curSource, targetFolder, skipOverride, injectObject);
                } else {
                    copyFileSync(curSource, targetFolder, skipOverride);
                }
            }
        });
    }
};

export const copyFolderContentsRecursive = (
    source,
    target,
    convertSvg = true,
    skipPaths
) => new Promise((resolve, reject) => {
    logDebug('copyFolderContentsRecursive', source, target, skipPaths);
    if (!fs.existsSync(source)) return;
    const targetFolder = path.resolve(target);
    if (!fs.existsSync(targetFolder)) {
        mkdirSync(targetFolder);
    }
    ncp(source, targetFolder, (err) => {
        if (err) {
            return reject(err);
        }
        return resolve();
    });
});

export const saveAsJs = (source, dest) => {
    Svg2Js.createSync({
        source,
        destination: dest
    });
};

export const removeDir = (path, callback) => {
    rimraf(path, callback);
};

export const mkdirSync = (dir) => {
    if (!dir) return;
    if (fs.existsSync(dir)) return;
    try {
        shelljs.mkdir('-p', dir);
    } catch (e) {
        logWarning(`shelljs.mkdir failed for dir: ${dir} with error: ${e}`);
    }
};

export const cleanFolder = d => new Promise((resolve, reject) => {
    logDebug('cleanFolder', d);
    removeDir(d, () => {
        mkdirSync(d);
        resolve();
    });
});

export const removeFilesSync = (filePaths) => {
    logDebug('removeFilesSync', filePaths);
    filePaths.forEach((filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            } else {
                logDebug(`Path ${filePath} does not exist`);
            }
        } catch (e) {
            logError(e);
        }
    });
};

export const removeDirsSync = (dirPaths) => {
    logDebug('removeDirsSync', dirPaths);

    for (let i = 0; i < dirPaths.length; i++) {
        try {
            removeDirSync(dirPaths[i]);
        } catch (e) {
            logError(e);
        }
    }
};

export const removeDirs = dirPaths => new Promise((resolve, reject) => {
    logDebug('removeDirs', dirPaths);
    const allFolders = dirPaths.length;
    let deletedFolders = 0;
    for (let i = 0; i < allFolders; i++) {
        rimraf(dirPaths[i], (e) => {
            if (e) {
                logError(e);
            }
            deletedFolders++;
            if (deletedFolders >= allFolders) resolve();
        });
    }
    if (allFolders === 0) resolve();
});

export const removeDirSync = (dir, rmSelf) => {
    let files;
    rmSelf = rmSelf === undefined ? true : rmSelf;
    dir += '/';
    try {
        files = fs.readdirSync(dir);
    } catch (e) {
        logDebug('!Oops, directory not exist.');
        return;
    }
    if (files.length > 0) {
        files.forEach((x, i) => {
            try {
                if (fs.statSync(dir + x).isDirectory()) {
                    removeDirSync(dir + x);
                } else {
                    fs.unlinkSync(dir + x);
                }
            } catch (e) {
                console.log(`removeDirSync error:${e}. will try to unlink`);
                try {
                    fs.unlinkSync(dir + x);
                } catch (e2) {
                    console.log(`removeDirSync error:${e}`);
                }
            }
        });
    }
    if (rmSelf) {
        // check if user want to delete the directory ir just the files in this directory
        fs.rmdirSync(dir);
    }
};

export const writeFileSync = (filePath, obj, spaces, addNewLine = true) => {
    logDebug('writeFileSync', filePath);
    if (filePath.includes('?') || filePath.includes('undefined')) return;
    let output;
    if (typeof obj === 'string') {
        output = obj;
    } else {
        output = `${JSON.stringify(obj, null, spaces || 4)}${
            addNewLine ? '\n' : ''
        }`;
    }
    if (fs.existsSync(filePath)) {
        if (fs.readFileSync(filePath).toString() === output) return;
    }
    logDebug('writeFileSync', filePath, 'executed');
    fs.writeFileSync(filePath, output);
};

export const writeObjectSync = (filePath, obj, spaces, addNewLine = true) => {
    logDebug('writeObjectSync', filePath);
    logWarning('writeObjectSync is DEPRECATED. use writeFileSync instead');
    return writeFileSync(filePath, obj, spaces, addNewLine);
};

export const readObjectSync = (filePath, sanitize = false, c) => {
    logDebug(`readObjectSync:${sanitize}:${filePath}`);
    if (!filePath) {
        logDebug('readObjectSync: filePath is undefined');
        return null;
    }
    if (!fs.existsSync(filePath)) {
        logDebug(`readObjectSync: File at ${filePath} does not exist`);
        return null;
    }
    let obj;
    try {
        obj = JSON.parse(fs.readFileSync(filePath));
        if (sanitize) {
            logDebug(`readObjectSync: will sanitize file at: ${filePath}`);
            if (c) {
                obj = sanitizeDynamicRefs(c, obj);
            }
            if (obj._refs) {
                obj = sanitizeDynamicProps(obj, obj._refs);
            }
        }
    } catch (e) {
        logError(
            `readObjectSync: Parsing of ${chalk.white(
                filePath
            )} failed with ${e}`
        );
        return null;
    }
    return obj;
};

export const updateObjectSync = (filePath, updateObj) => {
    let output;
    const obj = readObjectSync(filePath);
    if (obj) {
        output = merge(obj, updateObj);
    } else {
        output = updateObj;
    }
    writeFileSync(filePath, output);
    return output;
};

export const getRealPath = (c, p, key = 'undefined', original) => {
    if (!p) {
        if (original) {
            logInfo(
                `Path ${chalk.white(
                    key
                )} is not defined. using default: ${chalk.white(original)}`
            );
        }
        return original;
    }
    if (p.startsWith('./')) {
        return path.join(c.paths.project.dir, p);
    }
    const output = p
        .replace(/\$RNV_HOME/g, c.paths.rnv.dir)
        .replace(/~/g, c.paths.home.dir)
        .replace(/\$USER_HOME/g, c.paths.home.dir)
        .replace(/\$PROJECT_HOME/g, c.paths.project.dir)
        .replace(/\$WORKSPACE_HOME/g, c.paths.workspace.dir)
        .replace(/RNV_HOME/g, c.paths.rnv.dir)
        .replace(/USER_HOME/g, c.paths.home.dir)
        .replace(/PROJECT_HOME/g, c.paths.project.dir);
    return output;
};

const _refToValue = (c, ref, key) => {
    const val = ref.replace('$REF$:', '').split('$...');

    const realPath = getRealPath(c, val[0], key);

    if (realPath && realPath.includes('.json') && val.length === 2) {
        if (fs.existsSync(realPath)) {
            const obj = readObjectSync(realPath);

            try {
                const output = val[1].split('.').reduce((o, i) => o[i], obj);
                return output;
            } catch (e) {
                logWarning(`_refToValue: ${e}`);
            }
        } else {
            logWarning(`_refToValue: ${chalk.white(realPath)} does not exist!`);
        }
    }
    return ref;
};

export const arrayMerge = (destinationArray, sourceArray, mergeOptions) => {
    const jointArray = destinationArray.concat(sourceArray);
    const uniqueArray = jointArray.filter(
        (item, index) => jointArray.indexOf(item) === index
    );
    return uniqueArray;
};

const _arrayMergeOverride = (destinationArray, sourceArray, mergeOptions) => sourceArray;

export const sanitizeDynamicRefs = (c, obj) => {
    if (!obj) return obj;
    if (Array.isArray(obj)) {
        obj.forEach((v) => {
            sanitizeDynamicRefs(c, v);
        });
    }
    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (val) {
            if (typeof val === 'string') {
                if (val.startsWith('$REF$:')) {
                    obj[key] = _refToValue(c, val, key);
                }
            } else {
                sanitizeDynamicRefs(c, val);
            }
        }
    });
    return obj;
};

export const sanitizeDynamicProps = (obj, props, configProps = {}) => {
    if (!obj || !props) return obj;
    if (Array.isArray(obj)) {
        obj.forEach((v, i) => {
            let val = v;
            if (typeof val === 'string') {
                Object.keys(props).forEach((pk) => {
                    val = val
                        .replace(`@${pk}@`, props[pk])
                        .replace(`{{props.${pk}}}`, props[pk]);
                    obj[i] = val;
                });
                Object.keys(configProps).forEach((pk2) => {
                    val = val.replace(`{{configProps.${pk2}}}`, props[pk2]);
                    obj[i] = val;
                });
            } else {
                sanitizeDynamicProps(v, props, configProps);
            }
        });
    } else if (typeof obj === 'object') {
        Object.keys(obj).forEach((key) => {
            let val = obj[key];
            if (val) {
                if (typeof val === 'string') {
                    Object.keys(props).forEach((pk) => {
                        val = val
                            .replace(`@${pk}@`, props[pk])
                            .replace(`{{props.${pk}}}`, props[pk]);
                        obj[key] = val;
                    });
                    Object.keys(configProps).forEach((pk2) => {
                        val = val.replace(`{{configProps.${pk2}}}`, configProps[pk2]);
                        obj[key] = val;
                    });
                } else {
                    sanitizeDynamicProps(val, props, configProps);
                }
            }
        });
    }

    return obj;
};

export const mergeObjects = (
    c,
    obj1,
    obj2,
    dynamicRefs = true,
    replaceArrays = false
) => {
    if (!obj2) return obj1;
    if (!obj1) return obj2;
    const obj = merge(obj1, obj2, {
        arrayMerge: replaceArrays ? _arrayMergeOverride : arrayMerge
    });
    return dynamicRefs ? sanitizeDynamicRefs(c, obj) : obj;
};

export const updateConfigFile = async (update, globalConfigPath) => {
    const configContents = JSON.parse(fs.readFileSync(globalConfigPath));

    if (update.androidSdk) {
        configContents.sdks.ANDROID_SDK = update.androidSdk;
    }

    if (update.tizenSdk) {
        configContents.sdks.TIZEN_SDK = update.tizenSdk;
    }

    if (update.webosSdk) {
        configContents.sdks.WEBOS_SDK = update.webosSdk;
    }

    logDebug(
        `Updating ${globalConfigPath}. New file ${JSON.stringify(
            configContents,
            null,
            3
        )}`
    );

    fs.writeFileSync(globalConfigPath, JSON.stringify(configContents, null, 3));
};

export const replaceHomeFolder = (p) => {
    if (isSystemWin) return p.replace('~', process.env.USERPROFILE);
    return p.replace('~', process.env.HOME);
};

export const getFileListSync = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = `${dir}/${file}`;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            /* Recurse into a subdirectory */
            results = results.concat(getFileListSync(file));
        } else {
            /* Is a file */
            results.push(file);
        }
    });
    return results;
};

export default {
    sanitizeDynamicRefs,
    getFileListSync,
    removeDirs,
    copyFileSync,
    copyFolderRecursiveSync,
    removeDir,
    removeDirsSync,
    removeFilesSync,
    saveAsJs,
    mkdirSync,
    copyFolderContentsRecursive,
    copyFolderContentsRecursiveSync,
    cleanFolder,
    writeFileSync,
    readObjectSync,
    updateObjectSync,
    arrayMerge,
    mergeObjects,
    updateConfigFile,
    replaceHomeFolder
};
