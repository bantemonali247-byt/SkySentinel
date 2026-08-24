# SkySentinel — Functional UI + Flask Backend

This version connects the existing SkySentinel UI to a Flask REST API.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

## API

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/drones`
- `POST /api/drones/<id>/command`
- `GET/POST /api/missions`
- `POST /api/missions/<id>/start`
- `POST /api/missions/<id>/stop`
- `GET /api/alerts`
- `POST /api/alerts/<id>/resolve`
- `POST /api/ai/detect`
- `POST /api/rescue/route`
- `GET/POST /api/settings`

The AI and drone layers are intentionally simulation adapters so the UI can be tested without hardware. They can later be replaced with the repository's model and MAVLink/drone adapter.
