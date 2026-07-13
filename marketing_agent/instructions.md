# Connecting to a code already existing locally
```
git init  # only if not already a git repo
git remote add origin <NEW_REPO_URL>
```

* If the repo already has a remote:
```
git remote set-url origin <NEW_REPO_URL>
```

* Sync with the template 
```
git fetch origin
git branch -M main
git pull origin main --allow-unrelated-histories
```


* Commit and push
```
git add .
git commit -m "Initial project import"
git push -u origin main
```
