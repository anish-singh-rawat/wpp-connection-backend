module.exports = {
  apps: [
    {
      name: 'wpp-connection-backend',
      script: 'src/server.js',
      cwd: '/root/wpp-connection-backend',   
      instances: 1,       
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      env_production: {
        NODE_ENV: 'production',
        PORT: 8086,
      },

      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,

      restart_delay: 5000,

      kill_timeout: 10000,
    },
  ],
};
