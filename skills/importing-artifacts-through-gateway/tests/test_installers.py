from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InstallerTests(unittest.TestCase):
    def test_shell_installer_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            env = {**os.environ, "AGENT_SKILLS_HOME": str(Path(td) / "skills")}
            first = subprocess.run(
                ["bash", str(ROOT / "install.sh")],
                check=True,
                capture_output=True,
                text=True,
                env=env,
            )
            installed = Path(td) / "skills" / "importing-artifacts-through-gateway"
            self.assertTrue((installed / "SKILL.md").is_file())
            second = subprocess.run(
                ["bash", str(installed / "install.sh")],
                check=True,
                capture_output=True,
                text=True,
                env=env,
            )
            self.assertIn("Installed to", first.stdout)
            self.assertIn("Already installed", second.stdout)
            self.assertTrue((installed / "SKILL.md").is_file())


if __name__ == "__main__":
    unittest.main()
