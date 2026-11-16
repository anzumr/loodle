# Private repository setup

Local source is ready for inspection. GitHub authentication/connectivity outcomes are recorded in TEST_REPORT.md. No remote repository has been created or pushed by this kickoff.

1. Authenticate if needed with `gh auth login --hostname github.com` in your terminal; never paste tokens into chat.
2. Review `git status --short`, `.gitignore`, source and documentation. Inspect staged changes before committing. Keep `.tools`, test build output and signing files out of the index.
3. Make a local initial commit after tests pass. Choose the private repository name/owner deliberately.
4. Example command, once the destination is chosen: `gh repo create LOODL --private --source . --remote origin --push`.
5. Verify remote visibility is PRIVATE and inspect the core-tests Actions run. A checked-in workflow is not evidence that CI executed.

Feature work should use small branches and reviewed commits; protect the default branch after the initial push. No credentials belong in source or CI logs.
