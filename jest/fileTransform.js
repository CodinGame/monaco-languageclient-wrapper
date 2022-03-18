module.exports = {
  process(src, filename) {
    const assetFilename = JSON.stringify(filename);

    return `module.exports = ${assetFilename};`;
  },
};
