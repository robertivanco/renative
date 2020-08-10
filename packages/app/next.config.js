const { withExpo } = require('@expo/next-adapter');
const withImages = require('next-images');
const withFonts = require('next-fonts');
const withCSS = require('@zeit/next-css');
const path = require('path');
const withTM = require('next-transpile-modules')(['renative']);
const { Common: { getSourceExts }, Constants: { EXTENSIONS } } = require('rnv');

const config = {
    projectRoot: path.resolve(__dirname),
    pageExtensionsRnv: EXTENSIONS.web,
    distDir: 'platformBuilds/.next',
    webpack: (cfg, { isServer }) => {
        cfg.resolve.extensions = EXTENSIONS.web.map(e => `.${e}`).filter(ext => isServer || !ext.includes('server.'));
        cfg.resolve.modules.unshift(path.resolve(__dirname));
        cfg.module.rules[0].test = /\.(tsx|ts|js|mjs|jsx|web.js)$/;
        return cfg;
    },
};

module.exports = withExpo(withCSS(withFonts(withImages(withTM(config)))));
