import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import httpx

router = APIRouter(prefix="/api/github", tags=["github"])

# Allowed target repositories for issue submission
_ALLOWED_REPOS = {
    ("alea-institute", "FOLIO"),
}


class SubmitIssueRequest(BaseModel):
    pat: str
    owner: str
    repo: str
    title: str
    body: str


class SubmitIssueResponse(BaseModel):
    url: str
    number: int


@router.post("/submit-issue", response_model=SubmitIssueResponse)
async def submit_issue(req: SubmitIssueRequest) -> SubmitIssueResponse:
    """Create a GitHub issue using the user's Personal Access Token."""
    # Validate owner/repo against allowlist to prevent targeting arbitrary repos
    if (req.owner, req.repo) not in _ALLOWED_REPOS:
        raise HTTPException(
            status_code=400,
            detail=f"Issue submission is only allowed for: "
            + ", ".join(f"{o}/{r}" for o, r in _ALLOWED_REPOS),
        )

    # Reject path separators or special chars in owner/repo
    if not re.match(r"^[a-zA-Z0-9._-]+$", req.owner) or not re.match(r"^[a-zA-Z0-9._-]+$", req.repo):
        raise HTTPException(status_code=400, detail="Invalid owner or repo name")

    url = f"https://api.github.com/repos/{req.owner}/{req.repo}/issues"
    headers = {
        "Authorization": f"Bearer {req.pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {"title": req.title, "body": req.body}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=headers)

    if resp.status_code not in (201, 200):
        raise HTTPException(
            status_code=resp.status_code,
            detail="Failed to create GitHub issue. Check your PAT permissions.",
        )

    data = resp.json()
    return SubmitIssueResponse(url=data["html_url"], number=data["number"])
