"""Tests for profile-scoped data directory resolution."""

import os
from pathlib import Path

from app.core import config


def test_sanitize_profile_id():
    assert config.sanitize_profile_id("Demo") == "demo"
    assert config.sanitize_profile_id("My Profile!") == "my_profile"
    assert config.sanitize_profile_id("") == "private"


def test_profile_data_dir_with_env(monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    monkeypatch.setenv("AIC_PROFILE_ID", "demo")
    # Re-resolve as if fresh import
    pid = config.sanitize_profile_id(os.environ.get("AIC_PROFILE_ID"))
    data_dir = config.get_cortexlog_app_root() / "profiles" / pid / "data"
    assert data_dir == tmp_path / "CortexLog" / "profiles" / "demo" / "data"


def test_private_and_demo_dirs_differ(monkeypatch, tmp_path):
    monkeypatch.setenv("APPDATA", str(tmp_path))
    private = config.profile_data_dir("private")
    demo = config.profile_data_dir("demo")
    assert private != demo
    assert private.name == "data"
    assert demo.parent.name == "demo"
