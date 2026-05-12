from __future__ import annotations

import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agent.chrome_mcp import (
    ChromeMcpError,
    ChromeMcpManager,
    acquire_shared_manager,
    shutdown_all_shared_managers,
)


FAKE_BROWSER_HARNESS = """#!/usr/bin/env python3
import os
import sys
from pathlib import Path

def ensure_real_tab():
    return {"url": "https://example.com", "title": "Example"}

def page_info():
    return {
        "url": "https://example.com",
        "title": "Example",
        "w": 1200,
        "h": 800,
        "sx": 0,
        "sy": 0,
        "pw": 1200,
        "ph": 1600,
        "bu_name": os.environ.get("BU_NAME"),
        "bu_cdp_url": os.environ.get("BU_CDP_URL"),
    }

def new_tab(url="about:blank"):
    return "target-1"

def wait_for_load(timeout=15.0):
    return True

def capture_screenshot(path=None, full=False, max_dim=None):
    path = path or str(Path(os.environ["FAKE_BROWSER_HARNESS_TMP"]) / "shot.png")
    Path(path).write_bytes(b"fake-image")
    return path

def click_at_xy(x, y, button="left", clicks=1):
    return None

def type_text(text):
    return None

def press_key(key, modifiers=0):
    return None

def scroll(x, y, dy=-300, dx=0):
    return None

def js(expression):
    return {"expression": expression, "value": 42}

def cdp(method, session_id=None, **params):
    return {"method": method, "session_id": session_id, "params": params}

args = sys.argv[1:]
if "-c" not in args:
    raise SystemExit("expected -c")
code = args[args.index("-c") + 1]
exec(code, globals())
"""


def _write_fake_launcher(tmpdir: str) -> Path:
    launcher = Path(tmpdir) / "browser-harness"
    launcher.write_text(FAKE_BROWSER_HARNESS, encoding="utf-8")
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR)
    return launcher


class ChromeMcpManagerTests(unittest.TestCase):
    def tearDown(self) -> None:
        shutdown_all_shared_managers()

    def test_initialize_list_tools_and_call_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            launcher = _write_fake_launcher(tmpdir)
            with patch.dict(
                os.environ,
                {
                    "OPENPLANTER_BROWSER_HARNESS_COMMAND": str(launcher),
                    "FAKE_BROWSER_HARNESS_TMP": tmpdir,
                },
                clear=False,
            ):
                manager = ChromeMcpManager(
                    enabled=True,
                    auto_connect=True,
                    browser_url=None,
                    channel="stable",
                    connect_timeout_sec=3,
                    rpc_timeout_sec=3,
                )
                tools = manager.list_tools(force_refresh=True)
                self.assertIn("browser_new_tab", [tool.name for tool in tools])
                self.assertIn("browser_capture_screenshot", [tool.name for tool in tools])

                result = manager.call_tool("browser_new_tab", {"url": "https://example.com"})
                self.assertIn('"target_id": "target-1"', result.content)
                self.assertFalse(result.is_error)
                manager.shutdown()

    def test_call_tool_parses_image_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            launcher = _write_fake_launcher(tmpdir)
            with patch.dict(
                os.environ,
                {
                    "OPENPLANTER_BROWSER_HARNESS_COMMAND": str(launcher),
                    "FAKE_BROWSER_HARNESS_TMP": tmpdir,
                },
                clear=False,
            ):
                manager = ChromeMcpManager(
                    enabled=True,
                    auto_connect=True,
                    browser_url=None,
                    channel="stable",
                    connect_timeout_sec=3,
                    rpc_timeout_sec=3,
                )
                result = manager.call_tool("browser_capture_screenshot", {})
                self.assertIn("screenshot attached", result.content)
                self.assertIsNotNone(result.image)
                assert result.image is not None
                self.assertEqual(result.image.media_type, "image/png")
                self.assertEqual(result.image.base64_data, "ZmFrZS1pbWFnZQ==")
                manager.shutdown()

    def test_browser_url_maps_to_bu_cdp_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            launcher = _write_fake_launcher(tmpdir)
            with patch.dict(
                os.environ,
                {
                    "OPENPLANTER_BROWSER_HARNESS_COMMAND": str(launcher),
                    "FAKE_BROWSER_HARNESS_TMP": tmpdir,
                    "OPENPLANTER_BROWSER_HARNESS_NAME": "test-openplanter",
                },
                clear=False,
            ):
                manager = ChromeMcpManager(
                    enabled=True,
                    auto_connect=False,
                    browser_url="http://127.0.0.1:9222",
                    channel="stable",
                    connect_timeout_sec=3,
                    rpc_timeout_sec=3,
                )
                result = manager.call_tool("browser_page_info", {})
                self.assertIn('"bu_cdp_url": "http://127.0.0.1:9222"', result.content)
                self.assertIn('"bu_name": "test-openplanter"', result.content)
                manager.shutdown()

    def test_missing_attach_mode_reports_unavailable(self) -> None:
        manager = ChromeMcpManager(
            enabled=True,
            auto_connect=False,
            browser_url=None,
            channel="stable",
            connect_timeout_sec=1,
            rpc_timeout_sec=1,
        )
        with self.assertRaises(ChromeMcpError):
            manager.list_tools()
        status = manager.status_snapshot()
        self.assertEqual(status.status, "unavailable")
        self.assertIn("chrome_mcp_browser_url", status.detail)

    def test_shared_manager_registry_reuses_instances(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            launcher = _write_fake_launcher(tmpdir)
            with patch.dict(
                os.environ,
                {
                    "OPENPLANTER_BROWSER_HARNESS_COMMAND": str(launcher),
                    "FAKE_BROWSER_HARNESS_TMP": tmpdir,
                },
                clear=False,
            ):
                first = acquire_shared_manager(
                    enabled=True,
                    auto_connect=True,
                    browser_url=None,
                    channel="stable",
                    connect_timeout_sec=3,
                    rpc_timeout_sec=3,
                )
                second = acquire_shared_manager(
                    enabled=True,
                    auto_connect=True,
                    browser_url=None,
                    channel="stable",
                    connect_timeout_sec=3,
                    rpc_timeout_sec=3,
                )
                self.assertIs(first, second)


if __name__ == "__main__":
    unittest.main()
