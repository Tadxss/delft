#!/usr/bin/env node
// PreToolUse hook (Bash|PowerShell): blocks `git commit` / `git push` while the current
// branch is master. This repo's workflow is: work happens on develop, PRs merge develop
// into master, and master auto-deploys to production (Vercel) on push - so master should
// only ever move via a merged PR, never a direct commit or push.
"use strict";

const { execSync } = require("child_process");

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const command = (payload.tool_input && payload.tool_input.command) || "";

    if (!/\bgit\s+(commit|push)\b/.test(command)) {
      return;
    }

    let branch = "";
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      // Not a git repo, or git unavailable - nothing for this hook to enforce.
      return;
    }

    if (branch === "master") {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason:
              "Blocked: current branch is master. This repo commits on develop " +
              "(PRs merge develop into master; master auto-deploys to production on " +
              "push). Run `git checkout develop` (or a feature/task branch) before " +
              "committing or pushing.",
          },
        }),
      );
    }
  } catch {
    // Malformed hook input or unexpected error - fail open, never block on our own bug.
  }
});
