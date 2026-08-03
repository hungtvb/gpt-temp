# importing-artifacts-through-gateway

Reusable Agent Skill for importing allowlisted public artifacts into a restricted sandbox through the Tony Artifact Gateway.

## Install

Linux/macOS:

```bash
./install.sh
```

Windows PowerShell:

```powershell
.\install.ps1
```

Manual cross-runtime location:

```text
~/.agents/skills/importing-artifacts-through-gateway/
```

## Validate

```bash
python -m unittest discover -s tests -v
python tests/validate_skill.py
```

The package contains no raw gateway secret. Authentication remains in the protected Vercel project environment.
