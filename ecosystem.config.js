// PM2 process manager config
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'wpp-connection-backend',
      script: 'src/server.js',
      cwd: '/root/wpp-connection-backend',   // absolute path — works from anywhere
      instances: 1,           // MUST be 1 — WPPConnect session is not cluster-safe
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      env_production: {
        NODE_ENV: 'production',
        PORT: 8086,
      },

      // Log files
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      // Restart delay on crash (ms)
      restart_delay: 5000,

      // Kill timeout for graceful shutdown (ms)
      kill_timeout: 10000,
    },
  ],
};
