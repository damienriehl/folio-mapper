import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import httpx

from app.rate_limit import limiter
from app.services.auth import extract_github_pat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["github"])

# Allowlist of repos that can be targeted (configurable via env)
_DEFAULT_ALLOWED_REPOS = "alea-institute/FOLIO"
_ALLOWED_REPOS: set[str] = set(
    r.strip()
    for r in os.environ.get("GITHUB_ALLOWED_REPOS", _DEFAULT_ALLOWED_REPOS).split(",")
    if r.strip()
)


class SubmitIssueRequest(BaseModel):
    owner: str = "alea-institute"
    repo: str = "FOLIO"
    title: str
    body: str


class SubmitIssueResponse(BaseModel):
    url: str
    number: int


@router.post("/submit-issue", response_model=SubmitIssueResponse)
@limiter.limit("5/minute")
async def submit_issue(
    req: SubmitIssueRequest,
    request: Request,
    pat: str | None = Depends(extract_github_pat),
) -> SubmitIssueResponse:
    """Create a GitHub issue using the user's Personal Access Token."""
    if not pat:
        raise HTTPException(status_code=401, detail="GitHub PAT required (X-GitHub-Pat header)")

    # Validate target repo against allowlist
    target = f"{req.owner}/{req.repo}"
    if target not in _ALLOWED_REPOS:
        raise HTTPException(
            status_code=403,
            detail=f"Repository '{target}' is not in the allowed list",
        )

    url = f"https://api.github.com/repos/{req.owner}/{req.repo}/issues"
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {"title": req.title, "body": req.body}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code not in (201, 200):
        detail = "GitHub API error"
        try:
            data = resp.json()
            detail = data.get("message", detail)
        except Exception:
            pass
        logger.warning("GitHub API error (status=%d): %s", resp.status_code, detail)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    return SubmitIssueResponse(url=data["html_url"], number=data["number"])
