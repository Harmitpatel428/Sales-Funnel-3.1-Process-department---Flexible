---
description: Push all changes to both Git repositories
---

# Push Changes to All Repositories

This workflow ensures all changes are committed and pushed to both repositories.

## Steps

1. Stage all changes:
```powershell
git add .
```

2. Commit with a descriptive message:
```powershell
git commit -m "Your commit message here"
```

// turbo
3. Push to bugs-fixing repository (primary):
```powershell
git push bugs-repo main
```

// turbo
4. Push to origin repository (backup):
```powershell
git push origin main
```

## Repository URLs
- **bugs-repo**: https://github.com/Harmitpatel428/Sales-Funnel-2.1--Bugs-Fixing-and-Process-department.git
- **origin**: https://github.com/Harmitpatel428/Sales-Funnel-2.1.git
