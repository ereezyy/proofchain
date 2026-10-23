import copy
import os
import unittest
from unittest.mock import patch

import signing_policy
from signing_policy import REPOSITORY, check_policy


class SigningPolicyChecks(unittest.TestCase):
    def setUp(self):
        self.merged = {"number": 5, "merged": True, "merge_commit_sha": "a" * 40,
                       "base": {"ref": "master", "repo": {"full_name": REPOSITORY}}}

    def check(self, **overrides):
        values = dict(event="workflow_dispatch", ref="refs/heads/master", repository=REPOSITORY,
                      pull_request=self.merged, is_ancestor=lambda merge: True)
        values.update(overrides)
        check_policy(**values)

    def test_master_with_included_merge_can_sign(self):
        self.check()

    def test_pr_branch_tag_fork_and_push_cannot_sign(self):
        for override in [dict(event="pull_request"), dict(event="push"), dict(ref="refs/pull/5/merge"),
                         dict(ref="refs/heads/wp/wp-00"), dict(ref="refs/tags/v1.0.0"),
                         dict(repository="another/repository")]:
            with self.subTest(override=override), self.assertRaises(ValueError):
                self.check(**override)

    def test_open_or_unverifiable_pr_cannot_sign(self):
        for field, value in [("merged", False), ("merged", None), ("number", 4),
                             ("merge_commit_sha", None), ("merge_commit_sha", "invalid")]:
            data = copy.deepcopy(self.merged)
            data[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.check(pull_request=data)
        with self.assertRaises(ValueError):
            self.check(pull_request={})

    def test_old_commit_and_wrong_target_cannot_sign(self):
        with self.assertRaises(ValueError):
            self.check(is_ancestor=lambda merge: False)
        data = copy.deepcopy(self.merged)
        data["base"]["ref"] = "other"
        with self.assertRaises(ValueError):
            self.check(pull_request=data)

    def test_missing_token_and_api_failure_deny_signing(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "read-only GitHub token"):
                signing_policy.main()
        with patch.dict(os.environ, {"GITHUB_TOKEN": "synthetic-test-value"}), \
                patch.object(signing_policy, "urlopen", side_effect=OSError("unavailable")):
            with self.assertRaisesRegex(ValueError, "signing denied"):
                signing_policy.main()


if __name__ == "__main__":
    unittest.main()
