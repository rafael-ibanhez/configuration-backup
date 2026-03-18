module.exports = {
  apps: [{
    name: "config Backend Server",
    script: "node",
    args: "server.js",
    cwd: "c:\\configuration-backup\\backend",
    env: {
      BACKEND_HOST: "0.0.0.0"
    },
    watch: false,
  }, {
    name: "config Frontend server",
    cwd: "c:\\configuration-backup\\frontend",
    script: "node",
    args: "scripts/serve-pm2.mjs",
    windowsHide: true,
    watch: false
  }]
};
