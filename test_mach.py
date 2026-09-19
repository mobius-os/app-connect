import contextlib
import importlib.machinery
import importlib.util
import io
import os
import threading
import unittest
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock


def load_mach():
    path = Path(__file__).with_name("mach")
    loader = importlib.machinery.SourceFileLoader("connect_mach_test", str(path))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


@contextlib.contextmanager
def serve(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


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

    def test_timeout_outside_range_is_not_silently_clamped(self):
        mach = load_mach()
        mach._hosts = mock.Mock()

        for raw_timeout in ("0", "3601"):
            with self.subTest(raw_timeout=raw_timeout), \
                    contextlib.redirect_stderr(io.StringIO()), \
                    self.assertRaises(SystemExit) as raised:
                mach.main(["-m", "Host", "-t", raw_timeout, "echo ok"])
            self.assertEqual(raised.exception.code, 1)

        mach._hosts.assert_not_called()

    def test_missing_machine_value_fails_without_a_network_call(self):
        mach = load_mach()
        mach._hosts = mock.Mock()
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            mach.main(["-m"])

        mach._hosts.assert_not_called()
        self.assertIn("needs a machine name", stderr.getvalue())

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

    def test_double_dash_allows_a_command_that_looks_like_a_mach_option(self):
        mach = load_mach()
        mach._hosts = lambda: [{"id": "h_test", "name": "Host", "online": True}]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append(payload) or {"stdout": "", "exit_code": 0}
        )

        result = mach.main(["-m", "Host", "--", "--list"])

        self.assertEqual(result, 0)
        self.assertEqual(calls[0]["cmd"], "--list")

    def test_cwd_uses_the_structured_remote_field(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Host", "online": True,
            "platform": "Linux 6.8",
        }]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append((path, payload, method))
            or {"stdout": "/srv/app\n", "exit_code": 0}
        )

        with contextlib.redirect_stdout(io.StringIO()):
            result = mach.main(["-m", "Host", "-C", "/srv/app", "pwd"])

        self.assertEqual(result, 0)
        self.assertEqual(calls[0][1]["cwd"], "/srv/app")
        self.assertEqual(calls[0][1]["cmd"], "pwd")

    def test_cwd_rejects_a_path_relative_to_the_runner_service(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Host", "online": True,
            "platform": "Linux 6.8",
        }]
        mach._call = mock.Mock()
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            mach.main(["-m", "Host", "-C", "projects/app", "pwd"])

        mach._call.assert_not_called()
        self.assertIn("must be an absolute path", stderr.getvalue())

    def test_windows_drive_path_is_accepted_as_remote_cwd(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Desk", "online": True,
            "platform": "Windows 11",
        }]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append(payload) or {"stdout": "", "exit_code": 0}
        )

        result = mach.main(["-m", "Desk", "-C", "C:\\work\\app", "cd"])

        self.assertEqual(result, 0)
        self.assertEqual(calls[0]["cwd"], "C:\\work\\app")

    def test_windows_cwd_rejects_a_path_relative_to_the_current_drive(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Desk", "online": True,
            "platform": "Windows 11",
        }]
        mach._call = mock.Mock()
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            mach.main(["-m", "Desk", "-C", "\\work\\app", "cd"])

        mach._call.assert_not_called()
        self.assertIn("must be an absolute path", stderr.getvalue())

    def test_posix_script_preserves_shell_and_template_syntax(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Host", "online": True,
            "platform": "Linux 6.8",
        }]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append((path, payload, method))
            or {"stdout": "ok\n", "exit_code": 0}
        )
        script = "set -eu\nname=kept\nprintf '%s\\n' '{{$name, $_ := .Networks}}'\n"

        with mock.patch.object(mach.sys, "stdin", io.StringIO(script)), \
                contextlib.redirect_stdout(io.StringIO()):
            result = mach.main([
                "-m", "Host", "--script", "--shell", "bash",
            ])

        self.assertEqual(result, 0)
        self.assertEqual(calls[0][1]["script"], script)
        self.assertEqual(calls[0][1]["shell"], "bash")
        self.assertNotIn("cmd", calls[0][1])

    def test_literal_script_keeps_cwd_as_structured_data(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Host", "online": True,
            "platform": "Linux 6.8",
        }]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append((path, payload, method))
            or {"stdout": "ok\n", "exit_code": 0}
        )
        script = "set -eu\nname='$literal'\nprintf '%s\\n' \"$name\"\n"

        with mock.patch.object(mach.sys, "stdin", io.StringIO(script)), \
                contextlib.redirect_stdout(io.StringIO()):
            result = mach.main([
                "-m", "Host", "-C", "/srv/app", "--script", "--shell", "bash",
            ])

        self.assertEqual(result, 0)
        payload = calls[0][1]
        self.assertNotIn("cmd", payload)
        self.assertEqual(payload["script"], script)
        self.assertEqual(payload["shell"], "bash")
        self.assertEqual(payload["cwd"], "/srv/app")

    def test_script_input_is_bounded_before_payload_construction(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Host", "online": True,
            "platform": "Linux 6.8",
        }]
        mach._call = mock.Mock()
        stdin = mock.Mock()
        stdin.read.return_value = "x" * (mach._MAX_COMMAND_CHARS + 1)

        with mock.patch.object(mach.sys, "stdin", stdin), \
                contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(SystemExit):
            mach.main(["-m", "Host", "--script"])

        stdin.read.assert_called_once_with(mach._MAX_COMMAND_CHARS + 1)
        mach._call.assert_not_called()

    def test_windows_literal_script_has_no_cmd_length_ceiling(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Desk", "online": True,
            "platform": "Windows 11",
        }]
        calls = []
        mach._call = lambda path, payload=None, method="GET", retry_until=None: (
            calls.append(payload) or {"stdout": "", "exit_code": 0}
        )
        script = "Write-Output 'ready'\n" + ("#" * 12_000)

        with mock.patch.object(mach.sys, "stdin", io.StringIO(script)):
            result = mach.main(["-m", "Desk", "--script"])

        self.assertEqual(result, 0)
        self.assertEqual(calls[0]["script"], script)
        self.assertNotIn("cmd", calls[0])

    def test_windows_runner_rejects_an_unsupported_shell_locally(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Desk", "online": True,
            "platform": "Windows 11",
        }]
        mach._call = mock.Mock()
        stderr = io.StringIO()

        with mock.patch.object(mach.sys, "stdin", io.StringIO("echo ready\n")), \
                contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
            mach.main(["-m", "Desk", "--script", "--shell", "cmd.exe"])

        mach._call.assert_not_called()
        self.assertIn("supports powershell or pwsh", stderr.getvalue())



    def test_windows_command_limit_counts_utf16_units(self):
        mach = load_mach()
        mach._hosts = lambda: [{
            "id": "h_test", "name": "Desk", "online": True,
            "platform": "Windows 11",
        }]
        mach._call = mock.Mock()
        command = "echo " + ("🚀" * 4_000)

        with contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(SystemExit):
            mach.main(["-m", "Desk", command])

        self.assertLess(len(command), mach._MAX_WINDOWS_COMMAND_CHARS)
        self.assertGreater(
            mach._windows_command_units(command),
            mach._MAX_WINDOWS_COMMAND_CHARS,
        )
        mach._call.assert_not_called()

    def test_silent_remote_failure_has_a_diagnostic(self):
        mach = load_mach()
        mach._hosts = lambda: [{"id": "h_test", "name": "Host", "online": True}]
        mach._call = lambda *_args, **_kwargs: {
            "stdout": "", "stderr": "", "exit_code": 2,
        }
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr):
            result = mach.main(["-m", "Host", "false"])

        self.assertEqual(result, 2)
        self.assertIn("exited 2 without producing output", stderr.getvalue())

    def test_invalid_command_result_is_a_bounded_user_error(self):
        mach = load_mach()
        mach._hosts = lambda: [{"id": "h_test", "name": "Host", "online": True}]
        mach._call = lambda *_args, **_kwargs: {
            "stdout": ["not", "text"], "stderr": "", "exit_code": 0,
        }
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            mach.main(["-m", "Host", "true"])

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("invalid command result", stderr.getvalue())


class MachHttpErrorTest(unittest.TestCase):
    def test_short_calls_use_a_bounded_network_timeout(self):
        mach = load_mach()
        response = io.BytesIO(b'{"hosts":[]}')
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(
            mach._API_OPENER, "open", return_value=response,
        ) as open_request:
            result = mach._call("/api/connect/hosts")

        self.assertEqual(result, {"hosts": []})
        self.assertEqual(open_request.call_args.kwargs["timeout"], 30)

    def test_exec_call_uses_the_remaining_retry_window(self):
        mach = load_mach()
        response = io.BytesIO(b'{"stdout":"ready"}')
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(
            mach._API_OPENER, "open", return_value=response,
        ) as open_request, mock.patch.object(
            mach.time, "monotonic", return_value=100,
        ):
            result = mach._call(
                "/api/connect/hosts/h/exec",
                {"request_id": "a" * 16},
                "POST",
                retry_until=145,
            )

        self.assertEqual(result, {"stdout": "ready"})
        self.assertEqual(open_request.call_args.kwargs["timeout"], 45)

    def test_success_response_must_be_a_json_object(self):
        mach = load_mach()
        response = io.BytesIO(b'[]')
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(
            mach._API_OPENER, "open", return_value=response,
        ), contextlib.redirect_stderr(io.StringIO()), \
                self.assertRaises(SystemExit) as raised:
            mach._call("/api/connect/hosts")

        self.assertEqual(raised.exception.code, 2)

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
            mach._API_OPENER, "open", side_effect=responses,
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
        }), mock.patch.object(mach._API_OPENER, "open", side_effect=error):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
                mach._call("/api/connect/hosts")
        self.assertEqual(raised.exception.code, 2)
        self.assertIn('["unexpected"]', stderr.getvalue())

    def test_empty_http_error_has_a_diagnostic_and_closes_its_response(self):
        mach = load_mach()
        body = io.BytesIO(b"")
        error = urllib.error.HTTPError(
            "http://mobius.test/api/connect/hosts", 418, "teapot", {}, body,
        )
        with mock.patch.dict(os.environ, {
            "API_BASE_URL": "http://mobius.test",
            "AGENT_TOKEN": "test-token",
        }), mock.patch.object(mach._API_OPENER, "open", side_effect=error):
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit):
                mach._call("/api/connect/hosts")

        self.assertIn("HTTP 418 (teapot)", stderr.getvalue())
        self.assertTrue(body.closed)

    def test_authenticated_requests_ignore_proxy_environment(self):
        direct_requests = []
        proxy_requests = []

        class DirectHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                direct_requests.append(self.path)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"hosts":[]}')

            def log_message(self, _format, *_args):
                pass

        class ProxyHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                proxy_requests.append(self.path)
                self.send_response(502)
                self.end_headers()

            def log_message(self, _format, *_args):
                pass

        with serve(DirectHandler) as direct, serve(ProxyHandler) as proxy, \
                mock.patch.dict(os.environ, {
                    "API_BASE_URL": f"http://127.0.0.1:{direct.server_port}",
                    "AGENT_TOKEN": "test-owner-token",
                    "HTTP_PROXY": f"http://127.0.0.1:{proxy.server_port}",
                    "http_proxy": f"http://127.0.0.1:{proxy.server_port}",
                    "NO_PROXY": "",
                    "no_proxy": "",
                }):
            mach = load_mach()
            result = mach._call("/api/connect/hosts")

        self.assertEqual(result, {"hosts": []})
        self.assertEqual(direct_requests, ["/api/connect/hosts"])
        self.assertEqual(proxy_requests, [])

    def test_redirect_is_refused_before_authorization_can_move_origins(self):
        mach = load_mach()
        received_authorization = []

        class DestinationHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                received_authorization.append(self.headers.get("Authorization"))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"hosts":[]}')

            def log_message(self, _format, *_args):
                pass

        with serve(DestinationHandler) as destination:
            target = f"http://127.0.0.1:{destination.server_port}/captured"

            class RedirectHandler(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(302)
                    self.send_header("Location", target)
                    self.end_headers()

                def log_message(self, _format, *_args):
                    pass

            with serve(RedirectHandler) as redirector, mock.patch.dict(os.environ, {
                "API_BASE_URL": f"http://127.0.0.1:{redirector.server_port}",
                "AGENT_TOKEN": "test-owner-token",
            }):
                stderr = io.StringIO()
                with contextlib.redirect_stderr(stderr), \
                        self.assertRaises(SystemExit) as raised:
                    mach._call("/api/connect/hosts")

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("redirected an authenticated request", stderr.getvalue())
        self.assertEqual(received_authorization, [])


class MachResponseValidationTest(unittest.TestCase):
    def test_machine_list_requires_named_host_objects(self):
        mach = load_mach()
        mach._call = lambda *_args, **_kwargs: {"hosts": [{"online": True}]}
        stderr = io.StringIO()

        with contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as raised:
            mach._hosts()

        self.assertEqual(raised.exception.code, 2)
        self.assertIn("invalid machine list", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
