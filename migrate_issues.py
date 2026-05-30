#!/usr/bin/env python3
"""Migrate issues, comments, labels, and milestones from Gitea to GitHub.

Usage:
    ./migrate_issues.py --github-token <TOKEN> [--dry-run]

Requires:
    - GITEA_TOKEN env var (or set in script below)
    - GITHUB_TOKEN passed as --github-token
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import argparse

# ── Config ─────────────────────────────────────────────
GITEA_URL = "http://localhost:3000"
GITEA_REPO = "madhav/spidercrab"
GITEA_TOKEN = os.environ.get("GITEA_TOKEN", "ef561d4c39461c83ee861d1f48010ceec71ac7b2")

GITHUB_REPO = "madhav/spidercrab"  # Change if different on GitHub

# ── Helpers ─────────────────────────────────────────────

def gitea(path):
    req = urllib.request.Request(f"{GITEA_URL}/api/v1/repos/{GITEA_REPO}/{path}")
    req.add_header("Authorization", f"token {GITEA_TOKEN}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def github_post(path, data, token, method="POST"):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPO}/{path}",
        data=json.dumps(data).encode() if data else None,
        method=method,
    )
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/vnd.github.v3+json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()) if r.status != 204 else None
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ⚠️  GitHub API error {e.code}: {body[:200]}")
        return None


# ── Main ────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-token", required=True)
    parser.add_argument("--dry-run", action="store_true", help="Preview only, don't create")
    args = parser.parse_args()

    # 1. Fetch from Gitea
    print("📥 Fetching from Gitea...")
    labels = gitea("labels")
    milestones = gitea("milestones")
    issues_all = gitea("issues?state=all&limit=100")

    print(f"  Labels: {len(labels)}")
    print(f"  Milestones: {len(milestones)}")
    print(f"  Issues: {len(issues_all)}")

    if args.dry_run:
        print("\n🏁 Dry run — no changes made.")
        return

    # 2. Create labels on GitHub
    print("\n📤 Creating labels on GitHub...")
    for lbl in labels:
        gh_lbl = github_post("labels", {
            "name": lbl["name"],
            "color": lbl["color"],
            "description": lbl.get("description", ""),
        }, args.github_token)
        time.sleep(0.3)
        status = "✅" if gh_lbl else "⚠️"
        print(f"  {status} {lbl['name']}")

    # 3. Create milestones on GitHub
    print("\n📤 Creating milestones on GitHub...")
    for ms in milestones:
        gh_ms = github_post("milestones", {
            "title": ms["title"],
            "state": ms["state"],
            "description": ms.get("description", ""),
            "due_on": ms.get("due_on"),
        }, args.github_token)
        time.sleep(0.3)
        status = "✅" if gh_ms else "⚠️"
        print(f"  {status} {ms['title']}")

    # 4. Create issues with comments on GitHub
    print("\n📤 Creating issues on GitHub...")
    for issue in issues_all:
        # Skip pull requests
        if issue.get("pull_request"):
            continue

        label_names = [l["name"] for l in issue.get("labels", [])]
        gh_issue = github_post("issues", {
            "title": issue["title"],
            "body": issue.get("body", "") or "",
            "labels": label_names,
        }, args.github_token)
        time.sleep(1)

        if not gh_issue:
            print(f"  ⚠️  #{issue['number']} {issue['title'][:50]}... FAILED")
            continue

        print(f"  ✅ #{issue['number']} {issue['title'][:50]}... → #{gh_issue.get('number', '?')}")

        # Close closed issues
        if issue["state"] == "closed":
            github_post(f"issues/{gh_issue['number']}", {"state": "closed"}, args.github_token, method="PATCH")
            time.sleep(0.5)

        # Migrate comments
        comments = gitea(f"issues/{issue['number']}/comments")
        for comment in comments:
            github_post(f"issues/{gh_issue['number']}/comments", {
                "body": comment.get("body", "")
            }, args.github_token)
            time.sleep(0.5)

    print("\n✅ Migration complete!")


if __name__ == "__main__":
    main()
