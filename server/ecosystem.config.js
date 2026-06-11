module.exports = {
  apps: [
    {
      name: 'elevenplus',
      script: 'src/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
