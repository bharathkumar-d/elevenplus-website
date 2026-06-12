module.exports = {
  apps: [
    {
      name: 'elevenplus',
      script: 'server/src/index.js',
      cwd: 'C:\\Bharath\\Projects\\elevenplus-website',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'C:\\Bharath\\Projects\\elevenplus-website\\logs\\error.log',
      out_file:   'C:\\Bharath\\Projects\\elevenplus-website\\logs\\out.log',
    },
  ],
};
