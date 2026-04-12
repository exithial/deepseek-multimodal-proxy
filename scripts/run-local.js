const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const process = require("node:process");

const projectRoot = join(__dirname, "..");
const isWindows = process.platform === "win32";
const command = isWindows ? "powershell" : "bash";
const args = isWindows
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(__dirname, "run-local.ps1")]
  : [join(__dirname, "run-local.sh")];

const result = spawnSync(command, args, {
  cwd: projectRoot,
  stdio: "inherit",
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
