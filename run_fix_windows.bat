@echo off
setlocal
set SCRIPT_DIR=%~dp0
if exist "%SCRIPT_DIR%..\.git" (
    cd /d "%SCRIPT_DIR%.."
)

echo ==> Checking out claude/design-perf-security branch...
git checkout claude/design-perf-security

echo ==> Applying fixes...
python "%SCRIPT_DIR%apply_claude_branch_fixes.py" "%CD%"

echo.
echo ==> Modified files:
git status -s
echo.
echo To commit and push, run:
echo   git commit -am "Fix Drive root count query, navigator.onLine sync deadlock, and preload StoryMode images"
echo   git push origin claude/design-perf-security
pause
