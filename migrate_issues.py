#!/usr/bin/env python3
"""Migrate issues, comments, labels, and milestones from Gitea to GitHub."""
import json, os, sys, time, requests, argparse

GITEA_URL = "http://localhost:3000"
GITEA_REPO = "madhav/spidercrab"
GITEA_TOKEN = os.environ.get("GITEA_TOKEN", "ef561d4c39461c83ee861d1f48010ceec71ac7b2")
GITHUB_REPO = "madhav/spidercrab"

def gitea(path):
    r = requests.get(f"{GITEA_URL}/api/v1/repos/{GITEA_REPO}/{path}",
                     headers={"Authorization": f"token {GITEA_TOKEN}"})
    return r.json()

def github_post(path, data, token, method="POST"):
    import base64
    basic = base64.b64encode(f"quantockhills:{token}".encode()).decode()
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/json",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "spidercrab-migration/1.0",
    }
    url = f"https://api.github.com/repos/{GITHUB_REPO}/{path}"
    try:
        r = requests.request(method, url, json=data, headers=headers)
        if r.status_code == 204:
            return None
        if r.status_code >= 400:
            print(f"  ⚠️  GitHub API error {r.status_code}: {r.text[:200]}")
            return None
        return r.json()
    except Exception as e:
        print(f"  ⚠️  Request failed: {e}")
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-token", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("📥 Fetching from Gitea...")
    labels = gitea("labels")
    milestones = gitea("milestones")
    issues_all = gitea("issues?state=all&limit=100")
    print(f"  Labels: {len(labels)}, Milestones: {len(milestones)}, Issues: {len(issues_all)}")
    if args.dry_run:
        print("\n🏁 Dry run — no changes.")
        return

    print("\n📤 Creating labels...")
    for lbl in labels:
        r = github_post("labels", {"name": lbl["name"], "color": lbl["color"],
                                    "description": lbl.get("description","")}, args.github_token)
        time.sleep(0.3)
        print(f"  {'✅' if r else '⚠️'}  {lbl['name']}")

    print("\n📤 Creating milestones...")
    for ms in milestones:
        r = github_post("milestones", {"title": ms["title"], "state": ms["state"],
                                        "description": ms.get("description","")}, args.github_token)
        time.sleep(0.3)
        print(f"  {'✅' if r else '⚠️'}  {ms['title']}")

    print("\n📤 Creating issues...")
    for issue in issues_all:
        if issue.get("pull_request"):
            continue
        label_names = [l["name"] for l in issue.get("labels", [])]
        gh = github_post("issues", {"title": issue["title"], "body": issue.get("body","") or "",
                                     "labels": label_names}, args.github_token)
        time.sleep(1)
        if not gh:
            print(f"  ⚠️  #{issue['number']} {issue['title'][:50]}... FAILED")
            continue
        print(f"  ✅ #{issue['number']} {issue['title'][:50]}... → #{gh.get('number','?')}")
        if issue["state"] == "closed":
            github_post(f"issues/{gh['number']}", {"state": "closed"}, args.github_token, "PATCH")
        for comment in gitea(f"issues/{issue['number']}/comments"):
            github_post(f"issues/{gh['number']}/comments", {"body": comment.get("body","")},
                        args.github_token)
            time.sleep(0.3)

    print("\n✅ Migration complete!")

if __name__ == "__main__":
    main()
