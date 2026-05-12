from __future__ import annotations

import atexit
import json
import os
import shlex
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Any

from .config import (
    CHROME_MCP_DEFAULT_CHANNEL,
    normalize_chrome_mcp_browser_url,
    normalize_chrome_mcp_channel,
)


class ChromeMcpError(RuntimeError):
    pass


@dataclass(frozen=True)
class ChromeMcpToolDef:
    name: str
    description: str
    parameters: dict[str, Any]

    def as_tool_definition(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }


@dataclass(frozen=True)
class ChromeMcpImage:
    base64_data: str
    media_type: str


@dataclass(frozen=True)
class ChromeMcpCallResult:
    content: str
    is_error: bool = False
    image: ChromeMcpImage | None = None


@dataclass(frozen=True)
class ChromeMcpStatus:
    status: str
    detail: str
    tool_count: int = 0
    last_refresh_at: float | None = None


_RESULT_PREFIX = "__OPENPLANTER_BROWSER_HARNESS_RESULT__"
_DEFAULT_HARNESS_NAME = "openplanter"


def _env_text(name: str, default: str) -> str:
    value = (os.getenv(name) or "").strip()
    return value or default


def _status_detail_from_exception(exc: Exception, *, browser_url: str | None) -> str:
    detail = str(exc).strip() or type(exc).__name__
    lower = detail.lower()
    hints: list[str] = []
    if "not installed" in lower or "not on path" in lower or "no such file" in lower:
        hints.append(
            "Install Browser Harness so `browser-harness` is on PATH "
            "(for example: `uv tool install -e <browser-harness checkout>`)."
        )
    if "timed out" in lower or "timeout" in lower or "unreachable" in lower:
        if browser_url:
            hints.append("Confirm the configured endpoint is reachable as BU_CDP_URL.")
        else:
            hints.append(
                "Enable Chrome remote debugging at chrome://inspect/#remote-debugging "
                "and click Allow if Chrome prompts for Browser Harness access."
            )
    if "devtoolsactiveport" in lower or "remote-debugging" in lower or "allow" in lower:
        hints.append(
            "Browser Harness connects through Chrome remote debugging; use Way 1 "
            "in chrome://inspect/#remote-debugging or set BU_CDP_URL for a dedicated browser."
        )
    if hints:
        detail = f"{detail} {' '.join(hints)}"
    return detail.strip()


def _schema(
    properties: dict[str, Any] | None = None,
    required: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties or {},
        "required": required or [],
        "additionalProperties": False,
    }


def _browser_harness_tool_defs() -> list[ChromeMcpToolDef]:
    return [
        ChromeMcpToolDef(
            name="browser_page_info",
            description=(
                "Return the current Browser Harness tab URL, title, viewport, scroll position, "
                "and page dimensions."
            ),
            parameters=_schema(),
        ),
        ChromeMcpToolDef(
            name="browser_new_tab",
            description="Open a URL in a new browser tab through Browser Harness and return page info.",
            parameters=_schema(
                {
                    "url": {"type": "string", "description": "URL to open. Defaults to about:blank."},
                    "wait_for_load": {
                        "type": "boolean",
                        "description": "Wait for document.readyState=complete before returning.",
                        "default": True,
                    },
                },
                ["url"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_capture_screenshot",
            description="Capture a Browser Harness screenshot of the current tab.",
            parameters=_schema(
                {
                    "full": {"type": "boolean", "description": "Capture beyond the viewport.", "default": False},
                    "max_dim": {
                        "type": "integer",
                        "description": "Optional maximum image dimension after resizing.",
                        "minimum": 1,
                    },
                }
            ),
        ),
        ChromeMcpToolDef(
            name="browser_click_at_xy",
            description="Click visible page coordinates using Browser Harness compositor-level input.",
            parameters=_schema(
                {
                    "x": {"type": "number", "description": "Viewport x coordinate."},
                    "y": {"type": "number", "description": "Viewport y coordinate."},
                    "button": {
                        "type": "string",
                        "enum": ["left", "middle", "right"],
                        "default": "left",
                    },
                    "clicks": {"type": "integer", "minimum": 1, "default": 1},
                },
                ["x", "y"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_type_text",
            description="Insert text at the focused browser element through Browser Harness.",
            parameters=_schema(
                {"text": {"type": "string", "description": "Text to type."}},
                ["text"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_press_key",
            description="Press a key in the current browser tab through Browser Harness.",
            parameters=_schema(
                {
                    "key": {
                        "type": "string",
                        "description": "Key name, such as Enter, Tab, Escape, ArrowDown, Backspace, or a single character.",
                    },
                    "modifiers": {
                        "type": "integer",
                        "description": "Browser Harness modifier bitfield: 1=Alt, 2=Ctrl, 4=Meta/Cmd, 8=Shift.",
                        "default": 0,
                    },
                },
                ["key"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_scroll",
            description="Scroll at a viewport coordinate using Browser Harness mouse wheel input.",
            parameters=_schema(
                {
                    "x": {"type": "number", "description": "Viewport x coordinate."},
                    "y": {"type": "number", "description": "Viewport y coordinate."},
                    "dy": {"type": "number", "description": "Vertical wheel delta.", "default": -300},
                    "dx": {"type": "number", "description": "Horizontal wheel delta.", "default": 0},
                },
                ["x", "y"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_wait_for_load",
            description="Wait for the current document to finish loading and return whether it completed.",
            parameters=_schema(
                {
                    "timeout": {
                        "type": "number",
                        "description": "Maximum seconds to wait.",
                        "default": 15,
                    }
                }
            ),
        ),
        ChromeMcpToolDef(
            name="browser_js",
            description="Evaluate JavaScript in the current Browser Harness tab and return the JSON-serializable result.",
            parameters=_schema(
                {"expression": {"type": "string", "description": "JavaScript expression or snippet."}},
                ["expression"],
            ),
        ),
        ChromeMcpToolDef(
            name="browser_cdp",
            description="Send a raw Chrome DevTools Protocol method through Browser Harness.",
            parameters=_schema(
                {
                    "method": {"type": "string", "description": "CDP method, for example Page.navigate."},
                    "params": {"type": "object", "description": "CDP params object.", "default": {}},
                    "session_id": {
                        "type": "string",
                        "description": "Optional CDP session id.",
                    },
                },
                ["method"],
            ),
        ),
    ]


def _build_harness_script(name: str, arguments: dict[str, Any]) -> str:
    name_literal = json.dumps(name, ensure_ascii=True)
    args_json = json.dumps(arguments or {}, ensure_ascii=True)
    args_literal = json.dumps(args_json, ensure_ascii=True)
    prefix_literal = json.dumps(_RESULT_PREFIX, ensure_ascii=True)
    return f"""
import base64, json, tempfile, traceback

_OPENPLANTER_RESULT_PREFIX = {prefix_literal}
_OPENPLANTER_TOOL = {name_literal}
_OPENPLANTER_ARGS = json.loads({args_literal})

def _openplanter_emit(ok, content=None, error=None):
    print(_OPENPLANTER_RESULT_PREFIX + json.dumps({{"ok": ok, "content": content, "error": error}}, ensure_ascii=True))

try:
    if _OPENPLANTER_TOOL == "browser_page_info":
        ensure_real_tab()
        _openplanter_emit(True, page_info())
    elif _OPENPLANTER_TOOL == "browser_new_tab":
        target_id = new_tab(str(_OPENPLANTER_ARGS.get("url") or "about:blank"))
        if _OPENPLANTER_ARGS.get("wait_for_load", True):
            wait_for_load(float(_OPENPLANTER_ARGS.get("timeout") or 15))
        _openplanter_emit(True, {{"target_id": target_id, "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_capture_screenshot":
        ensure_real_tab()
        path = capture_screenshot(
            full=bool(_OPENPLANTER_ARGS.get("full", False)),
            max_dim=_OPENPLANTER_ARGS.get("max_dim"),
        )
        with open(path, "rb") as fh:
            image_base64 = base64.b64encode(fh.read()).decode("ascii")
        _openplanter_emit(True, {{
            "path": path,
            "media_type": "image/png",
            "image_base64": image_base64,
            "page": page_info(),
        }})
    elif _OPENPLANTER_TOOL == "browser_click_at_xy":
        ensure_real_tab()
        click_at_xy(
            float(_OPENPLANTER_ARGS["x"]),
            float(_OPENPLANTER_ARGS["y"]),
            button=str(_OPENPLANTER_ARGS.get("button") or "left"),
            clicks=int(_OPENPLANTER_ARGS.get("clicks") or 1),
        )
        _openplanter_emit(True, {{"action": "clicked", "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_type_text":
        ensure_real_tab()
        type_text(str(_OPENPLANTER_ARGS.get("text") or ""))
        _openplanter_emit(True, {{"action": "typed", "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_press_key":
        ensure_real_tab()
        press_key(str(_OPENPLANTER_ARGS["key"]), modifiers=int(_OPENPLANTER_ARGS.get("modifiers") or 0))
        _openplanter_emit(True, {{"action": "pressed", "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_scroll":
        ensure_real_tab()
        scroll(
            float(_OPENPLANTER_ARGS["x"]),
            float(_OPENPLANTER_ARGS["y"]),
            dy=float(_OPENPLANTER_ARGS.get("dy", -300)),
            dx=float(_OPENPLANTER_ARGS.get("dx", 0)),
        )
        _openplanter_emit(True, {{"action": "scrolled", "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_wait_for_load":
        ensure_real_tab()
        completed = wait_for_load(float(_OPENPLANTER_ARGS.get("timeout") or 15))
        _openplanter_emit(True, {{"completed": bool(completed), "page": page_info()}})
    elif _OPENPLANTER_TOOL == "browser_js":
        ensure_real_tab()
        _openplanter_emit(True, js(str(_OPENPLANTER_ARGS["expression"])))
    elif _OPENPLANTER_TOOL == "browser_cdp":
        params = _OPENPLANTER_ARGS.get("params") or {{}}
        if not isinstance(params, dict):
            raise TypeError("params must be an object")
        _openplanter_emit(True, cdp(str(_OPENPLANTER_ARGS["method"]), session_id=_OPENPLANTER_ARGS.get("session_id"), **params))
    else:
        raise ValueError(f"Unknown Browser Harness tool: {{_OPENPLANTER_TOOL}}")
except BaseException as exc:
    _openplanter_emit(False, error=f"{{type(exc).__name__}}: {{exc}}")
"""


def _extract_marker(stdout: str) -> dict[str, Any]:
    for raw_line in reversed(stdout.splitlines()):
        line = raw_line.strip()
        if not line.startswith(_RESULT_PREFIX):
            continue
        payload = line[len(_RESULT_PREFIX) :]
        parsed = json.loads(payload)
        if isinstance(parsed, dict):
            return parsed
        break
    raise ChromeMcpError("Browser Harness did not return an OpenPlanter result marker.")


def _format_content(content: Any) -> str:
    if isinstance(content, str):
        return content.strip() or "Browser Harness tool completed with no textual output."
    if isinstance(content, dict):
        display = dict(content)
        image_base64 = display.pop("image_base64", None)
        media_type = display.get("media_type") or "image/png"
        path = display.get("path")
        try:
            rendered = json.dumps(display, indent=2, ensure_ascii=True)
        except TypeError:
            rendered = str(display)
        if image_base64:
            suffix = f"\n[{media_type} screenshot attached"
            if path:
                suffix += f" from {path}"
            suffix += "]"
            return f"{rendered}{suffix}".strip()
        return rendered
    if content is None:
        return "Browser Harness tool completed with no textual output."
    try:
        return json.dumps(content, indent=2, ensure_ascii=True)
    except TypeError:
        return str(content)


class ChromeMcpManager:
    def __init__(
        self,
        *,
        enabled: bool,
        auto_connect: bool,
        browser_url: str | None,
        channel: str,
        connect_timeout_sec: int,
        rpc_timeout_sec: int,
    ) -> None:
        self.enabled = bool(enabled)
        self.auto_connect = bool(auto_connect)
        self.browser_url = normalize_chrome_mcp_browser_url(browser_url)
        self.channel = normalize_chrome_mcp_channel(channel or CHROME_MCP_DEFAULT_CHANNEL)
        self.connect_timeout_sec = max(1, int(connect_timeout_sec))
        self.rpc_timeout_sec = max(1, int(rpc_timeout_sec))
        self._tools: list[ChromeMcpToolDef] = []
        self._last_refresh_at: float | None = None
        self._status = ChromeMcpStatus(
            status="disabled" if not self.enabled else "ready",
            detail=(
                "Browser Harness is disabled."
                if not self.enabled
                else "Browser Harness will initialize on the next solve."
            ),
            tool_count=0,
        )

    def status_snapshot(self) -> ChromeMcpStatus:
        return ChromeMcpStatus(
            status=self._status.status,
            detail=self._status.detail,
            tool_count=self._status.tool_count,
            last_refresh_at=self._status.last_refresh_at,
        )

    def ensure_connected(self) -> None:
        if not self.enabled:
            self._status = ChromeMcpStatus(
                status="disabled",
                detail="Browser Harness is disabled.",
                tool_count=len(self._tools),
                last_refresh_at=self._last_refresh_at,
            )
            return
        if not self.browser_url and not self.auto_connect:
            detail = (
                "Browser Harness is enabled but cannot attach: set `chrome_mcp_browser_url` "
                "(used as BU_CDP_URL) or enable `chrome_mcp_auto_connect`."
            )
            self._status = ChromeMcpStatus(
                status="unavailable",
                detail=detail,
                tool_count=len(self._tools),
                last_refresh_at=self._last_refresh_at,
            )
            raise ChromeMcpError(detail)
        try:
            self._run_harness_script(
                _build_harness_script("browser_page_info", {}),
                timeout_sec=max(self.connect_timeout_sec, self.rpc_timeout_sec),
            )
        except Exception as exc:
            detail = _status_detail_from_exception(exc, browser_url=self.browser_url)
            self._status = ChromeMcpStatus(
                status="unavailable",
                detail=detail,
                tool_count=len(self._tools),
                last_refresh_at=self._last_refresh_at,
            )
            raise ChromeMcpError(detail) from exc

    def list_tools(self, *, force_refresh: bool = False) -> list[ChromeMcpToolDef]:
        if not self.enabled:
            return []
        if self._tools and not force_refresh:
            return list(self._tools)
        self.ensure_connected()
        tools = _browser_harness_tool_defs()
        now = time.time()
        self._tools = tools
        self._last_refresh_at = now
        self._status = ChromeMcpStatus(
            status="ready",
            detail=(
                f"Browser Harness ready with {len(tools)} tool(s) via "
                f"{'BU_CDP_URL' if self.browser_url else 'auto-discovery'}."
            ),
            tool_count=len(tools),
            last_refresh_at=now,
        )
        return list(self._tools)

    def call_tool(self, name: str, arguments: dict[str, Any]) -> ChromeMcpCallResult:
        if not self.enabled:
            raise ChromeMcpError("Browser Harness is disabled.")
        known_names = {tool.name for tool in self.list_tools()}
        if name not in known_names:
            raise ChromeMcpError(f"Unknown Browser Harness tool `{name}`.")
        payload = self._run_harness_script(
            _build_harness_script(name, arguments),
            timeout_sec=self.rpc_timeout_sec,
        )
        if not payload.get("ok"):
            raise ChromeMcpError(str(payload.get("error") or "Browser Harness tool failed."))
        content = payload.get("content")
        image: ChromeMcpImage | None = None
        if isinstance(content, dict):
            image_base64 = content.get("image_base64")
            media_type = content.get("media_type") or "image/png"
            if isinstance(image_base64, str) and image_base64.strip():
                image = ChromeMcpImage(
                    base64_data=image_base64.strip(),
                    media_type=str(media_type),
                )
        return ChromeMcpCallResult(content=_format_content(content), is_error=False, image=image)

    def shutdown(self) -> None:
        # Browser Harness owns its long-lived daemon. OpenPlanter only invokes short commands.
        return

    def _run_harness_script(self, script: str, *, timeout_sec: int) -> dict[str, Any]:
        command = _env_text("OPENPLANTER_BROWSER_HARNESS_COMMAND", "browser-harness")
        if shutil.which(command) is None:
            raise ChromeMcpError(f"`{command}` is not installed or not on PATH.")
        args = [command]
        extra_args = (os.getenv("OPENPLANTER_BROWSER_HARNESS_EXTRA_ARGS") or "").strip()
        if extra_args:
            args.extend(shlex.split(extra_args))
        args.extend(["-c", script])
        env = os.environ.copy()
        env.setdefault("BU_NAME", _env_text("OPENPLANTER_BROWSER_HARNESS_NAME", _DEFAULT_HARNESS_NAME))
        if cdp_url := (self.browser_url or (os.getenv("OPENPLANTER_BROWSER_HARNESS_CDP_URL") or "").strip()):
            env["BU_CDP_URL"] = cdp_url
        if cdp_ws := (os.getenv("OPENPLANTER_BROWSER_HARNESS_CDP_WS") or "").strip():
            env["BU_CDP_WS"] = cdp_ws
        try:
            completed = subprocess.run(
                args,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=max(1, int(timeout_sec)),
                env=env,
            )
        except subprocess.TimeoutExpired as exc:
            raise ChromeMcpError(f"Timed out waiting for Browser Harness after {timeout_sec}s.") from exc
        except OSError as exc:
            raise ChromeMcpError(f"Failed to run Browser Harness command `{command}`: {exc}") from exc
        try:
            payload = _extract_marker(completed.stdout or "")
        except Exception as exc:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            detail = stderr or stdout or str(exc)
            if completed.returncode:
                detail = f"Browser Harness exited with code {completed.returncode}. {detail}"
            raise ChromeMcpError(detail) from exc
        if not payload.get("ok"):
            raise ChromeMcpError(str(payload.get("error") or "Browser Harness tool failed."))
        return payload


_SHARED_MANAGERS: dict[tuple[Any, ...], ChromeMcpManager] = {}
_SHARED_LOCK = threading.Lock()


def acquire_shared_manager(
    *,
    enabled: bool,
    auto_connect: bool,
    browser_url: str | None,
    channel: str,
    connect_timeout_sec: int,
    rpc_timeout_sec: int,
) -> ChromeMcpManager | None:
    if not enabled:
        return None
    key = (
        bool(enabled),
        bool(auto_connect),
        normalize_chrome_mcp_browser_url(browser_url),
        normalize_chrome_mcp_channel(channel),
        max(1, int(connect_timeout_sec)),
        max(1, int(rpc_timeout_sec)),
        _env_text("OPENPLANTER_BROWSER_HARNESS_COMMAND", "browser-harness"),
        (os.getenv("OPENPLANTER_BROWSER_HARNESS_EXTRA_ARGS") or "").strip(),
        _env_text("OPENPLANTER_BROWSER_HARNESS_NAME", _DEFAULT_HARNESS_NAME),
        (os.getenv("OPENPLANTER_BROWSER_HARNESS_CDP_URL") or "").strip(),
        (os.getenv("OPENPLANTER_BROWSER_HARNESS_CDP_WS") or "").strip(),
    )
    with _SHARED_LOCK:
        manager = _SHARED_MANAGERS.get(key)
        if manager is None:
            manager = ChromeMcpManager(
                enabled=enabled,
                auto_connect=auto_connect,
                browser_url=browser_url,
                channel=channel,
                connect_timeout_sec=connect_timeout_sec,
                rpc_timeout_sec=rpc_timeout_sec,
            )
            _SHARED_MANAGERS[key] = manager
        return manager


def shutdown_all_shared_managers() -> None:
    with _SHARED_LOCK:
        managers = list(_SHARED_MANAGERS.values())
        _SHARED_MANAGERS.clear()
    for manager in managers:
        manager.shutdown()


atexit.register(shutdown_all_shared_managers)
