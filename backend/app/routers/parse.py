from fastapi import APIRouter, HTTPException, UploadFile

from app.models.parse_models import ParseResult, TextRequest
from app.services.file_parser import parse_file
from app.services.text_parser import parse_text

router = APIRouter(prefix="/api/parse", tags=["parse"])


@router.post("/file", response_model=ParseResult)
async def upload_file(file: UploadFile) -> ParseResult:
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    try:
        content = await file.read()
        result = parse_file(content, file.filename)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/text", response_model=ParseResult)
async def parse_text_input(body: TextRequest) -> ParseResult:
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text input is empty")
    return parse_text(body.text)
