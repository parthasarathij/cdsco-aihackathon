from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from src.utils.extractor import extract_text_from_zip
from src.utils.llm_analyzer import analyze_drug_info, analyze_dossier_eligibility
from src.utils.specification_service import extract_text as spec_extract_text, analyze_specification
from src.utils.drug_checker import check_drug_eligibility

router = APIRouter()


@router.post("/api/check-specification")
async def check_specification(file: UploadFile = File(...)):
    """
    Analyzes a drug specification document (PDF or DOCX) directly against regulatory checklists.
    """
    filename = file.filename.lower()
    if not (filename.endswith(".docx") or filename.endswith(".pdf") or filename.endswith(".doc") or filename.endswith(".txt")):
        raise HTTPException(status_code=400, detail={
            "status": "error",
            "code": "INVALID_FILE_TYPE",
            "message": "Only .docx, .pdf, .doc, or .txt files are accepted."
        })

    MAX_SIZE = 50 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail={
            "status": "error",
            "code": "FILE_TOO_LARGE",
            "message": "File size exceeds the 50MB limit."
        })

    try:
        doc_text = spec_extract_text(file.filename, contents)[:8000]

        if not doc_text.strip():
            raise HTTPException(status_code=422, detail={
                "status": "error",
                "code": "EMPTY_DOCUMENT",
                "message": "No readable text could be extracted from the document."
            })

        try:
            analysis = await analyze_specification(doc_text)
        except Exception as e:
            raise HTTPException(status_code=500, detail={
                "status": "error",
                "code": "ANALYSIS_FAILED",
                "message": f"An error occurred during analysis: {str(e)}"
            })

        return {
            "status": "success",
            "file_name": file.filename,
            "analysis": analysis
        }

    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "code": "INTERNAL_ERROR",
                "message": f"An unexpected error occurred: {str(e)}"
            }
        )


@router.post("/api/check-specifications")
async def check_specifications(file: UploadFile = File(...)):
    """
    Compatibility alias for clients that call `POST /api/check-specifications`.
    """
    return await check_specification(file)


@router.post("/analyze-dossier")
async def analyze_dossier(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are accepted.")

    try:
        zip_bytes = await file.read()

        if not __import__("zipfile").is_zipfile(__import__("io").BytesIO(zip_bytes)):
            raise HTTPException(status_code=400, detail="Only .zip files are accepted.")

        combined_text, file_count, regex_drug_name = extract_text_from_zip(zip_bytes)

        if not combined_text:
            raise HTTPException(status_code=422, detail=f"No readable content found in the ZIP. Processed {file_count} files.")

        print(f"Regex extracted drug name: {regex_drug_name}")

        drug_info = await analyze_drug_info(combined_text)
        llm_drug_name = drug_info.get("drug_name", "")
        strength = drug_info.get("strength", "")

        if not regex_drug_name and not llm_drug_name:
            raise HTTPException(status_code=422, detail=f"Could not identify a drug name from the dossier. Text length: {len(combined_text)}")

        excel_drug_name = None
        matched_entry = None
        match_found = False

        if regex_drug_name:
            match_found, matched_entry = check_drug_eligibility(regex_drug_name, strength)
            excel_drug_name = matched_entry.get("Drug Name") if matched_entry else None

        document_drug_name = regex_drug_name or llm_drug_name

        eligibility_result = await analyze_dossier_eligibility(
            document_drug_name=document_drug_name,
            excel_drug_name=excel_drug_name or "",
            strength=strength,
            text=combined_text
        )

        submission_type = eligibility_result.get("submission_type", "Unknown")

        if submission_type == "Generic Drug Application":
            eligibility_message = f"This drug is already listed in CDSCO. You should submit this as a Generic Drug Application, not as an NDA."
        else:
            eligibility_message = f"This is a new drug you can submit this application as NDA (new drug application)"

        response_data = {
            "drug name": document_drug_name,
            "Eligibility": eligibility_message
        }

        return JSONResponse(content=response_data)

    except HTTPException as he:
        raise he
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"An unexpected error occurred: {str(e)}"}
        )