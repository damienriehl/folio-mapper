from fastapi import APIRouter
from pydantic import BaseModel

import httpx

router = APIRouter(prefix="/api/github", tags=["github"])


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
        detail = "GitHub API error"
        try:
            data = resp.json()
            detail = data.get("message", detail)
        except Exception:
            pass
        from fastapi import HTTPException

        raise HTTPException(status_code=resp.status_code, detail=detail)

    data = resp.json()
    return SubmitIssueResponse(url=data["html_url"], number=data["number"])
