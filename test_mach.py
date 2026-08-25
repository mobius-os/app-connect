import contextlib
import importlib.machinery
import importlib.util
import io
import os
import unittest
import urllib.error
from unittest import mock
from pathlib import Path


def load_mach():
    path = Path(__file__).with_name("mach")
    loader = importlib.machinery.SourceFileLoader("connect_mach_test", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class MachCancellationTest(unittest.TestCase):
    def test_ctrl_c_requests_cancel_for_the_exact_command(self):
        mach = load_mach()
        host = {"id": "h_test", "name": "Host", "online": True}
        mach._hosts = lambda: [host]
        calls = []

        def call(path, payload=None, method="GET", retry_until=None):
            calls.append((path, payload, method))
            if path.endswith("/exec"):
                raise KeyboardInterrupt
            return {"ok": True}

        mach._call = call
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = mach.main(["-m", "Host", "sleep 30"])

        self.assertEqual(result, 130)
        self.assertEqual(calls[0][2], "POST")
        request_id = calls[0][1]["request_id"]
        self.assertRegex(request_id, r"^[a-f0-9]{16}$")
        self.assertEqual(
            calls[1],
            (
                f"/api/connect/hosts/h_test/commands/{request_id}/cancel",
                {},
                "POST",
            ),
        )
        self.assertIn("asked Host to stop", stderr.getvalue())


class MachTargetingTest(unittest.TestCase):
    def test_exact_host_id_wins_over_another_hosts_name_substring(self):
        mach = load_mach()
        hosts = [
            {"id": "h_exact", "name": "Desk", "online": True},
            {"id": "h_other", "name": "h_exact backup", "online": True},
        ]
        self.assertEqual(mach._matches(hosts, "h_exact"), [hosts[0]])

    def test_name_substring_stays_explicit_about_ambiguity(self):
        mach = load_mach()
        hosts = [
            {"id": "h_one", "name": "Build desk", "online": True},
            {"id": "h_two", "name": "Desk laptop", "online": True},
        ]
        self.assertEqual(mach._matches(hosts, "desk"), hosts)

    def test_invalid_timeout_is_a_bounded_user_error(self):
        mach = load_mach()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            mach.main(["-m", "Host", "-t", "later", "echo ok"])
        self.assertEqual(raised.exception.code, 1)
        self.assertIn("whole number from 1 to 3600", stderr.getvalue())

    def test_remote_exit_and_truncation_are_reported(self):
        mach = load_mach()
        mach._hosts = lambda: [{"id": "h_test", "name": "Host", "online": True}]
        mach._call = lambda *_args, **_kwargs: {
            "stdout": "out", "stderr": "err", "exit_code": 7, "truncated": True,
        }
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = mach.main(["-m", "Host", "echo ok"])
        self.assertEqual(result, 7)
        self.assertEqual(stdout.getvalue(), "out")
        self.assertIn("err", stderr.getvalue())
        self.assertIn("output was truncated", stderr.getvalue())


class MachHttpErrorTest(unittest.TestCase):
    def test_transient_exec_failure_retries_the_same_request(self):
        mach = load_mach()
        error = urllib.error.HTTPError(
            "http://mobius.test/api/connect/hosts/h/exec",
            502,
            "upstream error",
            {},
            io.BytesIO(b"upstream error"),
        )
        responses = [error, io.BytesIO(b'{"stdout":"ready"}')]
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(
            mach.urllib.request, "urlopen", side_effect=responses,
        ), mock.patch.object(mach.time, "sleep") as sleep:
            result = mach._call(
                "/api/connect/hosts/h/exec",
                {"request_id": "a" * 16},
                "POST",
                mach.time.monotonic() + 10,
            )

        self.assertEqual(result, {"stdout": "ready"})
        self.assertEqual(sleep.call_count, 1)

    def test_non_object_json_error_body_stays_a_bounded_user_error(self):
        mach = load_mach()
        error = urllib.error.HTTPError(
            "http://mobius.test/api/connect/hosts", 500, "error", {},
            io.BytesIO(b'["unexpected"]'),
        )
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(mach.urllib.request, "urlopen", side_effect=error):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
                mach._call("/api/connect/hosts")
        self.assertEqual(raised.exception.code, 2)
        self.assertIn('["unexpected"]', stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
