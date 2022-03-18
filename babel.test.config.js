module.exports = {
  plugins: [
    ["@babel/plugin-transform-modules-commonjs", {
      importInterop: 'babel'
    }]
  ],
  presets: [
    "@babel/preset-env",
    "@babel/preset-typescript"
  ]
};