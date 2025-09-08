from pathlib import Path
import os

from fastapi import APIRouter, Request, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from starlette import status

router = APIRouter()

# Templates are in app/templates/
TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

API_TOKEN = os.getenv("API_TOKEN")

def require_admin(request: Request):
    """Protect /admin with session-based login."""
    if request.session.get("auth") is True:
        return
    raise HTTPException(status_code=401, detail="Not logged in")

@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})

@router.post("/login")
def login_submit(request: Request, token: str = Form(...)):
    # If API_TOKEN is unset, allow all (dev mode)
    if not API_TOKEN or token == API_TOKEN:
        request.session["auth"] = True
        return RedirectResponse(url="/admin", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Feil token"},
        status_code=401
    )

@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request, _=Depends(require_admin)):
    # The HTML talks to /stats, /funfacts, /funfact using same-origin fetch + session cookie
    return templates.TemplateResponse("admin.html", {"request": request})
