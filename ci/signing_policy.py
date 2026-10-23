"""Allow signed build output only from master after finding #10 is merged."""

import json
import os
import re
import subprocess
from urllib.request import Request, urlopen

REPOSITORY = "ereezyy/proofchain"
PREREQUISITE = 5


def check_policy(event, ref, repository, pull_request, is_ancestor):
    if (event, ref, repository) != ("workflow_dispatch", "refs/heads/master", REPOSITORY):
        raise ValueError("Signing is restricted to manual runs on the repository's master branch")
    merge = pull_request.get("merge_commit_sha")
    base = pull_request.get("base", {})
    if (pull_request.get("number") != PREREQUISITE or pull_request.get("merged") is not True
            or base.get("ref") != "master" or base.get("repo", {}).get("full_name") != REPOSITORY
            or not isinstance(merge, str) or not re.fullmatch(r"[0-9a-f]{40}", merge)):
        raise ValueError("Finding #10 PR #5 must be merged before signing")
    if not is_ancestor(merge):
        raise ValueError("The build commit does not contain the finding #10 merge")


def main():
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise ValueError("A read-only GitHub token is required to verify the prerequisite")
    request = Request(f"https://api.github.com/repos/{REPOSITORY}/pulls/{PREREQUISITE}", headers={
        "Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "proofchain-signing-policy",
    })
    try:
        with urlopen(request, timeout=30) as response:
            pull_request = json.load(response)
    except Exception:
        raise ValueError("Cannot verify finding #10 merge status; signing denied") from None
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if head != os.environ.get("GITHUB_SHA"):
        raise ValueError("Checkout revision differs from the triggering commit")
    check_policy(os.environ.get("GITHUB_EVENT_NAME"), os.environ.get("GITHUB_REF"),
                 os.environ.get("GITHUB_REPOSITORY"), pull_request,
                 lambda merge: subprocess.run(["git", "merge-base", "--is-ancestor", merge, head],
                                              capture_output=True, check=False).returncode == 0)
    print("Finding #10 merge is included; this master build is eligible for signing")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error))
