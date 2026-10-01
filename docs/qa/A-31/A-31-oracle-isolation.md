# A-31 evidence: QA oracle agent file access

- Oracle agent: Cursor cloud agent `bc-48bae80c-e6ae-52ef-ba69-e657d1b7881b` (https://cursor.com/agents/bc-48bae80c-e6ae-52ef-ba69-e657d1b7881b), run #1, which produced commit `3024a16`.
- Source: the agent's full JSONL transcript, extracted mechanically by QA on 2026-10-01 (MYT). Every file-read, search, edit and shell call is listed below in transcript order.
- Note: the `grep` tool calls did not log their arguments, so for those the files that appeared in the results are listed.

| Transcript line | Action | Target |
|---|---|---|
| 3 | run_terminal_cmd | `git status && git branch -vv && git log -5 --oneline && node --version && ls -la docs/ tests/qa/ 2>/dev/null; ls package.json 2>/dev/null` |
| 9 | grep result files | `docs/ARCHITECTURE.md` |
| 11 | grep result files | `docs/PRD.md` |
| 13 | read_file | `/workspace/docs/PRD.md` |
| 15 | read_file | `/workspace/docs/ARCHITECTURE.md` |
| 18 | grep result files | `docs/PRD.md` |
| 20 | read_file | `/workspace/docs/ARCHITECTURE.md` |
| 23 | grep result files | `docs/PRD.md` |
| 25 | grep result files | `docs/ARCHITECTURE.md` |
| 27 | read_file | `/workspace/docs/PRD.md` |
| 29 | run_terminal_cmd | `ls -la /workspace | head -80; (command -v nvm; ls /usr/local/n/versions/node 2>/dev/null; ls ~/.nvm/versions/node 2>/dev/null; type node; node --version); test ` |
| 33 | grep result files | `docs/PRD.md` |
| 34 | read_file | `/workspace/README.md` |
| 37 | run_terminal_cmd | `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; command -v nvm; nvm ls 2>/dev/null || true; ls "$HOME/.nvm/versions/node" 2>/dev/n` |
| 40 | run_terminal_cmd | `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm install 20` |
| 43 | run_terminal_cmd | `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20 >/dev/null; node --version; node << 'EOF'` |
| 46 | run_terminal_cmd | `mkdir -p /workspace/tests/qa && /home/ubuntu/.nvm/versions/node/v20.20.2/bin/node --version` |
| 50 | search_replace | `(edit; file per diff in result)` |
| 51 | edited file | `tests/qa/oracle.test.js` |
| 54 | grep result files | `tests/qa/oracle.test.js` |
| 56 | run_terminal_cmd | `/home/ubuntu/.nvm/versions/node/v20.20.2/bin/node --check /workspace/tests/qa/oracle.test.js && /home/ubuntu/.nvm/versions/node/v20.20.2/bin/node --test /worksp` |
| 60 | search_replace | `(edit; file per diff in result)` |
| 61 | edited file | `tests/qa/oracle.test.js` |
| 62 | search_replace | `(edit; file per diff in result)` |
| 63 | edited file | `tests/qa/oracle.test.js` |
| 64 | search_replace | `(edit; file per diff in result)` |
| 65 | edited file | `tests/qa/oracle.test.js` |
| 66 | search_replace | `(edit; file per diff in result)` |
| 67 | edited file | `tests/qa/oracle.test.js` |
| 68 | search_replace | `(edit; file per diff in result)` |
| 69 | edited file | `tests/qa/oracle.test.js` |
| 70 | search_replace | `(edit; file per diff in result)` |
| 71 | edited file | `tests/qa/oracle.test.js` |
| 73 | search_replace | `(edit; file per diff in result)` |
| 74 | edited file | `oracle.test.js, tests/qa/README.md` |
| 76 | run_terminal_cmd | `/home/ubuntu/.nvm/versions/node/v20.20.2/bin/node --test /workspace/tests/qa/oracle.test.js 2>&1 | awk 'NR<=6 || /# (tests|suites|pass|fail|cancelled|skipped|to` |
| 79 | run_terminal_cmd | `git status && git diff --stat && git log -3 --format='%an %ae%n%s' && git rev-parse --abbrev-ref HEAD && git status -sb` |
| 82 | run_terminal_cmd | `git remote -v && git add tests/qa/oracle.test.js tests/qa/README.md && git commit -m "$(cat <<'EOF'` |
| 85 | run_terminal_cmd | `git push -u origin dev` |
| 88 | run_terminal_cmd | `git fetch origin dev && git log --oneline HEAD..origin/dev && echo '--- local not on remote ---' && git log --oneline origin/dev..HEAD && echo '--- files change` |
| 92 | run_terminal_cmd | `git rebase origin/dev && git log --oneline -6 && git status -sb` |
| 95 | run_terminal_cmd | `/home/ubuntu/.nvm/versions/node/v20.20.2/bin/node --test /workspace/tests/qa/oracle.test.js` |
| 98 | read_file | `/workspace/package.json` |
| 100 | run_terminal_cmd | `git show --stat --format='%H%n%s' HEAD && git push -u origin dev && git status -sb && git rev-parse HEAD` |

## Findings
- No `read_file` targets anything under `js/`, and no search result came from `js/`.
- Line 30 is the agent's own check, run while it was writing the oracle. Its output was `NO_PKG`, `NO_JS_DIR` and `NO_CALC`, so `js/` didn't exist on its checkout then.
- No shell command reads `js/` files. Line 3 (`ls`) ran before `js/` existed on its branch. Lines 88 to 92 (`git fetch`/`git rebase origin/dev`) brought IE's `js/` files in after the oracle had been written and committed locally. They show up only as a diffstat, never as content that was read.
- After that, `js/calc.js` was only `require()`d at runtime by `tests/qa/oracle.test.js` for the comparison tests.
- The raw transcript is committed alongside this file as `A-31-oracle-agent-transcript-run1-2.jsonl`, so anyone can re-check it.

## Run #2 (commit `c7a9d70`: todos closed, RangeError tests added)
| Transcript line | Action | Target |
|---|---|---|
| 107 | run_terminal_cmd | `git status -sb && git pull origin dev && git log -3 --oneline && git status -sb` |
| 111 | grep result files | `tests/qa/README.md, tests/qa/oracle.test.js` |
| 113, 115, 119, 134 | read_file | `tests/qa/oracle.test.js` |
| 117 | read_file | `tests/qa/README.md` |
| 137 | grep result files | `tests/qa/README.md` |
| 139, 145 | run_terminal_cmd | `node --test tests/qa/oracle.test.js` |
| 142 | run_terminal_cmd | `git add tests/qa/oracle.test.js tests/qa/README.md && git commit` |

In run #2 there were no reads or search results under `js/`. Its only reads were of `tests/qa/` files.
