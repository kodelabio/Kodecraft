# Merging Upstream Changes from mindcraft-ce into Kodecraft

## Overview

Kodecraft is a fork of [mindcraft-ce](https://github.com/mindcraft-ce/mindcraft-ce) with custom modifications. This guide documents how to pull in future improvements from the upstream project while preserving our customizations.

## Repository Setup

The repo should have two remotes configured:

- **origin** — our fork: `git@github.com:kodelabio/Kodecraft.git`
- **upstream** — the original project: `git@github.com:mindcraft-ce/mindcraft-ce.git`

### Verify Remotes

```bash
git remote -v
```

Expected output:

```
origin    git@github.com:kodelabio/Kodecraft.git (fetch)
origin    git@github.com:kodelabio/Kodecraft.git (push)
upstream  git@github.com:mindcraft-ce/mindcraft-ce.git (fetch)
upstream  git@github.com:mindcraft-ce/mindcraft-ce.git (push)
```

If `upstream` is missing, add it:

```bash
git remote add upstream git@github.com:mindcraft-ce/mindcraft-ce.git
```

## Merge Procedure

### 1. Make Sure Your Working Tree Is Clean

Before starting, commit or stash any in-progress work:

```bash
git status
# If there are uncommitted changes:
git stash
```

### 2. Create a Test Branch

Never merge directly into your development branch. Always use a throwaway branch first:

```bash
git checkout dev
git checkout -b dev-merge-test
```

### 3. Fetch Upstream Changes

This downloads new commits from the original project without modifying your code:

```bash
git fetch upstream
```

### 4. Merge Upstream into Your Test Branch

```bash
git merge upstream/main
```

Git will report any conflicts. If there are none, you're done — skip to step 6.

### 5. Resolve Conflicts

Conflicts fall into two categories:

**Content conflicts** — both sides modified the same lines in a file. Open the conflicted files in VSCode and use the merge editor to resolve them. In a `git merge` (not rebase):

- **Current/Ours** = your Kodecraft customizations
- **Incoming/Theirs** = upstream mindcraft-ce changes

**Delete/modify conflicts** — upstream deleted a file you modified (or vice versa). Decide whether to keep or remove the file:

```bash
# Keep the file
git add <filename>

# Delete the file
git rm <filename>
```

After resolving all conflicts:

```bash
git add .
git commit
```

### 6. Test

Run the project and verify everything works as expected before replacing your dev branch.

### 7. Replace Your Dev Branch

If the merge looks good:

```bash
git checkout dev
git merge dev-merge-test
```

If the merge went badly, just discard the test branch:

```bash
git checkout dev
git branch -D dev-merge-test
```

### 8. Clean Up

Delete the test branch and restore any stashed work:

```bash
git branch -D dev-merge-test
git stash pop  # only if you stashed changes in step 1
```

### 9. Push

```bash
git push origin dev
```

## Files Most Likely to Conflict

Based on past merges, these files tend to have conflicts:

| File | Reason |
|------|--------|
| `src/agent/agent.js` | Heavily customized agent logic |
| `src/models/prompter.js` | Custom prompt modifications |
| `src/agent/coder.js` | Custom coding agent changes |
| `src/agent/mindserver_proxy.js` | Custom server proxy logic |
| `src/utils/mcdata.js` | Custom Minecraft data utilities |
| `settings.js` | Local configuration differences |
| `andy.json` | Custom agent profile |
| `profiles/defaults/_default.json` | Custom default profile |

## Tips

- **Merge often.** The longer you wait between merges, the more conflicts you'll accumulate.
- **Keep customizations isolated.** When possible, put custom logic in separate files rather than heavily modifying upstream files.
- **Use `git merge` over `git rebase`** when you have many commits. Merge resolves all conflicts at once; rebase makes you resolve per-commit.
- **Tag after successful merges** so you can track which upstream version you're synced to:
  ```bash
  git tag synced-upstream-YYYY-MM-DD
  ```
- **Enable `rerere`** to let Git remember how you resolved conflicts and auto-apply the same resolutions next time:
  ```bash
  git config rerere.enabled true
  ```

## Merge vs. Rebase

| | `git merge` | `git rebase` |
|---|---|---|
| Conflict resolution | All at once | One commit at a time |
| History | Creates merge commit | Linear history |
| Best for | Many commits, shared branches | Few commits, solo work |

We use **`git merge`** for upstream syncs because Kodecraft has many custom commits and merge resolves everything in one pass.
