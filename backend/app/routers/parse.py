from fastapi import APIRouter, HTTPException, Request, UploadFile

from app.models.parse_models import ParseResult, TextRequest
from app.rate_limit import limiter
from app.services.file_parser import MAX_FILE_SIZE, parse_file
from app.services.text_parser import parse_text

router = APIRouter(prefix="/api/parse", tags=["parse"])

_CHUNK_SIZE = 8 * 1024  # 8 KB


@router.post("/file", response_model=ParseResult)
@limiter.limit("10/minute")
async def upload_file(request: Request, file: UploadFile) -> ParseResult:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        # Stream file in chunks to enforce size limit without full buffering
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = await file.read(_CHUNK_SIZE)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB.",
                )
            chunks.append(chunk)

        content = b"".join(chunks)
        result = parse_file(content, file.filename)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/text", response_model=ParseResult)
@limiter.limit("10/minute")
async def parse_text_input(request: Request, body: TextRequest) -> ParseResult:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text input is empty")
    return parse_text(body.text)
